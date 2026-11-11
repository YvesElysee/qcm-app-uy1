/**
 * Routes administrateur — /api/admin
 * - Login par mot de passe (ADMIN_PASSWORD du .env, vérifié côté serveur)
 * - Gestion des étudiants inscrits (liste, suppression)
 * - Résultats pour exports CSV / PDF
 */
import { Router } from 'express';
import { db } from '../db.js';
import {
  checkAdminPassword,
  createAdminToken,
  requireAdmin,
  bearerToken,
  deleteAdminToken
} from '../auth.js';

const router = Router();

// ── Protection anti-force brute sur la connexion admin ───────────────
// 5 tentatives par fenêtre de 10 minutes et par adresse IP.
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map(); // ip → { count, windowStart }

function loginRateState(ip) {
  const now = Date.now();
  let state = loginAttempts.get(ip);
  if (!state || now - state.windowStart > LOGIN_WINDOW_MS) {
    state = { count: 0, windowStart: now };
    loginAttempts.set(ip, state);
  }
  return state;
}

// Nettoyage périodique des adresses IP oubliées
setInterval(() => {
  const now = Date.now();
  for (const [ip, state] of loginAttempts) {
    if (now - state.windowStart > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 15 * 60 * 1000).unref();

/**
 * Connexion administrateur.
 * Le mot de passe n'est plus vérifié côté navigateur (l'ancien VITE_ADMIN_PASSWORD
 * exposait le hash dans le bundle) mais directement sur le serveur.
 * Tentatives limitées pour empêcher le force brute.
 */
router.post('/login', (req, res) => {
  const { password } = req.body || {};
  const ip = req.ip || req.socket.remoteAddress || 'inconnu';
  const state = loginRateState(ip);

  if (state.count >= LOGIN_MAX_ATTEMPTS) {
    const retryInSec = Math.ceil((LOGIN_WINDOW_MS - (Date.now() - state.windowStart)) / 1000);
    return res.status(429).json({
      error: `Trop de tentatives. Réessayez dans ${Math.max(retryInSec, 0)} s.`
    });
  }

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: 'Mot de passe administrateur non configuré. Définissez ADMIN_PASSWORD dans le fichier .env.' });
  }

  if (!password || !checkAdminPassword(password)) {
    state.count += 1;
    const remaining = LOGIN_MAX_ATTEMPTS - state.count;
    return res.status(401).json({
      error: remaining > 0
        ? `Mot de passe incorrect. ${remaining} tentative(s) restante(s).`
        : 'Mot de passe incorrect. Compte temporairement verrouillé.'
    });
  }

  // Succès : on repart de zéro pour cette adresse
  loginAttempts.delete(ip);
  const token = createAdminToken();
  res.json({ success: true, token });
});

/**
 * Déconnexion administrateur : révoque le jeton côté serveur.
 */
router.post('/logout', requireAdmin, (req, res) => {
  deleteAdminToken(bearerToken(req));
  res.json({ success: true });
});

// ── Étudiants inscrits ────────────────────────────────────────────────

/**
 * Liste des comptes étudiants (triés par date d'inscription décroissante)
 */
router.get('/students', requireAdmin, (_req, res) => {
  const students = db.prepare('SELECT * FROM users ORDER BY createdAt DESC').all();
  // passwordHash volontairement omis
  res.json({
    students: students.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      filiere: u.filiere,
      niveau: u.niveau,
      anneeAcademique: u.anneeAcademique,
      dateNaissance: u.dateNaissance,
      createdAt: u.createdAt,
      lastLogin: u.lastLogin
    }))
  });
});

/**
 * Suppression d'un compte étudiant (avec ses jetons de session)
 */
router.delete('/students/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM tokens WHERE userId = ?').run(req.params.id);
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Étudiant introuvable.' });
  }
  res.json({ success: true });
});

// ── Résultats (exports CSV / PDF du panneau admin) ────────────────────

/**
 * Tous les résultats d'un quiz donné (identique à l'ancienne requête where ue == quizId)
 */
router.get('/results', requireAdmin, (req, res) => {
  const ue = req.query.ue;
  if (!ue) {
    return res.status(400).json({ error: 'Paramètre "ue" requis.' });
  }
  const rows = db.prepare('SELECT * FROM results WHERE ue = ? ORDER BY date DESC').all(ue);
  const parse = (json) => {
    try { return json ? JSON.parse(json) : []; } catch { return []; }
  };
  res.json({
    results: rows.map(r => ({ ...r, answers: parse(r.answers), isMakeup: !!r.isMakeup }))
  });
});

export default router;
