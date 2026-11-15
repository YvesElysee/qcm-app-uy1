/**
 * Routes d'authentification étudiant · /api/auth
 * Reproduit exactement la logique de l'ancien services/authService.js
 * (inscription, connexion, profil, changement et réinitialisation de mot de passe en 3 étapes).
 */
import { Router } from 'express';
import { db } from '../db.js';
import {
  hashPassword, verifyPassword,
  createStudentToken, deleteStudentToken, requireStudent
} from '../auth.js';
import { sendResetCodeEmail } from '../smtp.js';
import {
  normalizeFaculte,
  facultyOfFiliere,
  filiereExists
} from '../access.js';
import { ensureReferralCode, attachReferral, privilegesOf } from '../referrals.js';

const router = Router();

/**
 * Normalise un ID basé sur l'email (identique au sanitizeEmailDocId historique)
 */
function sanitizeEmailDocId(email) {
  return String(email).trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * Construit l'objet session retourné au client (même forme que l'ancien localStorage)
 */
function sessionOf(user) {
  const code = ensureReferralCode(user);
  const privileges = privilegesOf(user.id);
  return {
    uid: user.id,
    name: user.name,
    email: user.email,
    faculte: normalizeFaculte(user.faculte || facultyOfFiliere(user.filiere)),
    filiere: user.filiere,
    niveau: user.niveau,
    anneeAcademique: user.anneeAcademique,
    dateNaissance: user.dateNaissance || '',
    referralCode: code,
    referredBy: user.referredBy || '',
    referralCount: privileges.referralCount,
    privileges
  };
}

// ── Inscription ────────────────────────────────────────────────────────
router.post('/register', (req, res) => {
  const { name, email, password, faculte, filiere, niveau, anneeAcademique, dateNaissance, referredBy } = req.body || {};

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();
  const cleanFiliere = String(filiere || '').trim() || 'Informatique';
  const cleanNiveau = String(niveau || '').trim() || 'L1';

  if (!cleanEmail || !password || !cleanName) {
    return res.status(400).json({ error: 'Veuillez renseigner les champs obligatoires (Nom, Email, Mot de passe).' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Le mot de passe doit comporter au moins 6 caractères.' });
  }

  const docId = sanitizeEmailDocId(cleanEmail);
  if (db.prepare('SELECT id FROM users WHERE id = ? OR email = ?').get(docId, cleanEmail)) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cette adresse email.' });
  }

  // Faculté effective : celle choisie, sinon celle du catalogue pour la filière.
  let cleanFaculte = normalizeFaculte(faculte || facultyOfFiliere(cleanFiliere));
  let known = filiereExists(cleanFaculte, cleanFiliere);
  if (!known) {
    const actual = facultyOfFiliere(cleanFiliere);
    if (actual) {
      cleanFaculte = normalizeFaculte(actual);
      known = filiereExists(cleanFaculte, cleanFiliere);
    }
  }

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO users
      (id, name, email, passwordHash, faculte, filiere, niveau, anneeAcademique, dateNaissance, createdAt, lastLogin)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    docId, cleanName, cleanEmail, hashPassword(password),
    cleanFaculte, cleanFiliere, cleanNiveau, anneeAcademique || '2025-2026',
    dateNaissance || '', now, now
  );

  // Filière absente du catalogue : on enregistre une demande à traiter par
  // l'administration. L'étudiant reçoit une notification (et un email) dès
  // que la filière est ajoutée.
  let filiereRequested = false;
  if (!known) {
    const existingRequest = db.prepare(`
      SELECT id FROM filiere_requests
      WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
        AND UPPER(TRIM(faculte)) = UPPER(TRIM(?))
        AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
        AND status = 'pending'
      LIMIT 1
    `).get(cleanEmail, cleanFaculte, cleanFiliere);

    if (!existingRequest) {
      db.prepare(`
        INSERT INTO filiere_requests
          (userId, name, email, faculte, filiere, niveau, status, note, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, 'pending', '', ?)
      `).run(docId, cleanName, cleanEmail, cleanFaculte, cleanFiliere, cleanNiveau, now);
    }
    filiereRequested = true;
  }

  // Parrainage facultatif : le code est fourni via le lien d'inscription.
  const referral = attachReferral(docId, referredBy);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(docId);
  const token = createStudentToken(docId);
  res.status(201).json({
    user: sessionOf(user),
    token,
    filiereRequested,
    referred: !!referral,
    referrerName: referral?.referrerName || ''
  });
});

// ── Suivi de la demande de filière de l'étudiant connecté ─────────────
router.get('/filiere-request', requireStudent, (req, res) => {
  const request = db.prepare(`
    SELECT id, faculte, filiere, niveau, status, note, createdAt, handledAt
    FROM filiere_requests
    WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
    ORDER BY createdAt DESC, id DESC
    LIMIT 1
  `).get(req.user.email);

  res.json({ request: request || null });
});

// ── Parrainage de l'étudiant connecté ─────────────────────────────────
router.get('/referral', requireStudent, (req, res) => {
  const code = ensureReferralCode(req.user);
  const privileges = privilegesOf(req.user.id);
  const referred = db.prepare(`
    SELECT u.name, r.createdAt
    FROM referrals r
    JOIN users u ON u.id = r.referredUserId
    WHERE r.referrerId = ?
    ORDER BY r.createdAt DESC
    LIMIT 50
  `).all(req.user.id);

  res.json({
    code,
    path: code ? `/register?ref=${encodeURIComponent(code)}` : '',
    referredBy: req.user.referredBy || '',
    privileges,
    referrals: referred
  });
});

// ── Connexion ─────────────────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail || !password) {
    return res.status(400).json({ error: 'Adresse email ou mot de passe incorrect.' });
  }

  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(sanitizeEmailDocId(cleanEmail));
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  }

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Adresse email ou mot de passe incorrect.' });
  }

  // Mettre à jour lastLogin
  db.prepare('UPDATE users SET lastLogin = ? WHERE id = ?')
    .run(new Date().toISOString(), user.id);

  const token = createStudentToken(user.id);
  res.json({ user: sessionOf(user), token });
});

// ── Déconnexion (invalide le jeton côté serveur) ──────────────────────
router.post('/logout', requireStudent, (req, res) => {
  const header = req.headers.authorization || '';
  const token = header.match(/^Bearer\s+(.+)$/i)?.[1];
  deleteStudentToken(token);
  res.json({ success: true });
});

// ── Profil courant ────────────────────────────────────────────────────
router.get('/me', requireStudent, (req, res) => {
  res.json({ user: sessionOf(req.user) });
});

// ── Mise à jour du profil (nom, date de naissance) ────────────────────
router.put('/profile', requireStudent, (req, res) => {
  const { name, dateNaissance } = req.body || {};
  const updates = {};
  if (typeof name === 'string' && name.trim()) updates.name = name.trim();
  if (typeof dateNaissance === 'string') updates.dateNaissance = dateNaissance;

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucune modification à appliquer.' });
  }

  const fields = Object.keys(updates);
  const setSql = fields.map(f => `${f} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${setSql}, updatedAt = ? WHERE id = ?`)
    .run(...fields.map(f => updates[f]), new Date().toISOString(), req.user.id);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sessionOf(user) });
});

// ── Changement de mot de passe (depuis le profil) ─────────────────────
router.post('/change-password', requireStudent, (req, res) => {
  const { oldPassword, newPassword } = req.body || {};

  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 6 caractères.' });
  }
  if (!verifyPassword(oldPassword, req.user.passwordHash)) {
    return res.status(401).json({ error: 'L\'ancien mot de passe est incorrect.' });
  }

  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?')
    .run(hashPassword(newPassword), new Date().toISOString(), req.user.id);

  res.json({ success: true });
});

// ── Étape 1 : demande d'un code de réinitialisation ───────────────────
router.post('/forgot-password', async (req, res) => {
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail)
    || db.prepare('SELECT * FROM users WHERE id = ?').get(sanitizeEmailDocId(cleanEmail));

  if (!user) {
    return res.status(404).json({ error: 'Aucun compte associé à cette adresse email.' });
  }

  // Génération d'un code aléatoire à 6 chiffres (valable 15 minutes)
  const resetCode = String(Math.floor(100000 + Math.random() * 900000));
  const resetId = `${user.id}_${Date.now()}`;

  db.prepare(`
    INSERT INTO password_resets (id, email, code, expiresAt, used, createdAt)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(resetId, user.email, resetCode, Date.now() + 15 * 60 * 1000, new Date().toISOString());

  // Envoi de l'email via le service SMTP Google
  const sendResult = await sendResetCodeEmail({ email: user.email, code: resetCode, name: user.name });

  res.json({
    success: true,
    resetId,
    email: user.email,
    emailSent: sendResult.success,
    // Permet de continuer en local si le serveur SMTP n'est pas encore configuré
    simulationCode: sendResult.success ? undefined : resetCode,
    message: sendResult.success
      ? 'Un code de confirmation a été envoyé à votre adresse email.'
      : 'Code de récupération généré avec succès.'
  });
});

// ── Étape 2 : vérification du code à 6 chiffres ───────────────────────
router.post('/verify-reset-code', (req, res) => {
  const cleanEmail = String(req.body?.email || '').trim().toLowerCase();
  const cleanCode = String(req.body?.code || '').trim();

  const rows = db.prepare(`
    SELECT * FROM password_resets
    WHERE email = ? AND code = ? AND used = 0
  `).all(cleanEmail, cleanCode);

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Code de vérification invalide ou déjà utilisé.' });
  }

  const valid = rows.find(r => r.expiresAt > Date.now());
  if (!valid) {
    return res.status(400).json({ error: 'Le code de vérification a expiré (validité de 15 minutes). Veuillez refaire une demande.' });
  }

  res.json({ valid: true, resetId: valid.id });
});

// ── Étape 3 : réinitialisation du mot de passe ────────────────────────
router.post('/reset-password', (req, res) => {
  const { email, code, newPassword } = req.body || {};

  if (!newPassword || String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 6 caractères.' });
  }

  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanCode = String(code || '').trim();

  const rows = db.prepare(`
    SELECT * FROM password_resets
    WHERE email = ? AND code = ? AND used = 0
  `).all(cleanEmail, cleanCode);

  if (rows.length === 0) {
    return res.status(400).json({ error: 'Code de vérification invalide ou déjà utilisé.' });
  }

  const valid = rows.find(r => r.expiresAt > Date.now());
  if (!valid) {
    return res.status(400).json({ error: 'Le code de vérification a expiré (validité de 15 minutes). Veuillez refaire une demande.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail)
    || db.prepare('SELECT * FROM users WHERE id = ?').get(sanitizeEmailDocId(cleanEmail));
  if (!user) {
    return res.status(404).json({ error: 'Aucun compte associé à cette adresse email.' });
  }

  db.prepare('UPDATE users SET passwordHash = ?, updatedAt = ? WHERE id = ?')
    .run(hashPassword(newPassword), new Date().toISOString(), user.id);

  // Marquer le code comme utilisé
  db.prepare('UPDATE password_resets SET used = 1, usedAt = ? WHERE id = ?')
    .run(new Date().toISOString(), valid.id);

  res.json({ success: true });
});

export default router;
