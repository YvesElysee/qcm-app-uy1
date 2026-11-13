/**
 * Routes administrateur · /api/admin
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
import { createBackup, listBackups, backupPath, deleteBackup } from '../backup.js';

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
 * Tous les résultats, éventuellement filtrés par UE.
 * Sans paramètre `ue`, l'export complet est renvoyé.
 */
router.get('/results', requireAdmin, (req, res) => {
  const ue = req.query.ue;
  const rows = ue
    ? db.prepare('SELECT * FROM results WHERE ue = ? ORDER BY date DESC').all(ue)
    : db.prepare('SELECT * FROM results ORDER BY date DESC').all();
  const parse = (json) => {
    try { return json ? JSON.parse(json) : []; } catch { return []; }
  };
  res.json({
    results: rows.map(r => ({ ...r, answers: parse(r.answers), isMakeup: !!r.isMakeup }))
  });
});

// ── Tableau de bord analytique ─────────────────────────────────────────

function parseAnswers(json) {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

/**
 * Agrégats pédagogiques calculés à partir des copies corrigées :
 * - questions les plus ratées
 * - réussite moyenne par UE
 * - évolution des notes dans le temps
 */
router.get('/analytics', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM results ORDER BY date ASC').all();
  const students = new Set(rows.map(r => (r.email || r.name || '').toLowerCase()).filter(Boolean));

  const questionStats = new Map();
  const byUe = new Map();
  const byDay = new Map();
  let answered = 0;
  let correct = 0;

  rows.forEach((row) => {
    const note = row.total ? (row.score / row.total) * 20 : 0;
    const key = row.ue || '-';
    if (!byUe.has(key)) {
      byUe.set(key, { ue: key, attempts: 0, notes: [], students: new Set(), score: 0, total: 0 });
    }
    const ueStat = byUe.get(key);
    ueStat.attempts += 1;
    ueStat.notes.push(note);
    ueStat.score += Number(row.score) || 0;
    ueStat.total += Number(row.total) || 0;
    ueStat.students.add((row.email || row.name || '').toLowerCase());

    const day = String(row.date || '').slice(0, 10) || 'inconnue';
    if (!byDay.has(day)) byDay.set(day, { date: day, notes: [], attempts: 0 });
    const dayStat = byDay.get(day);
    dayStat.notes.push(note);
    dayStat.attempts += 1;

    const answers = parseAnswers(row.answers);
    answers.forEach((a) => {
      if (!a || typeof a !== 'object' || !a.question) return;
      answered += 1;
      if (a.isOk) correct += 1;
      const qKey = String(a.questionId ?? a.question);
      if (!questionStats.has(qKey)) {
        questionStats.set(qKey, {
          questionId: a.questionId ?? null,
          question: a.question,
          ue: row.ue || '-',
          tags: a.tags || '',
          difficulte: a.difficulte || 'moyenne',
          attempts: 0,
          wrong: 0
        });
      }
      const qStat = questionStats.get(qKey);
      qStat.attempts += 1;
      if (!a.isOk) qStat.wrong += 1;
    });
  });

  const mostMissed = [...questionStats.values()]
    .filter(q => q.wrong > 0)
    .map(q => ({ ...q, wrongRate: q.attempts ? Math.round((q.wrong / q.attempts) * 100) : 0 }))
    .sort((a, b) => b.wrongRate - a.wrongRate || b.wrong - a.wrong)
    .slice(0, 12);

  const ueStats = [...byUe.values()]
    .map(u => ({
      ue: u.ue,
      attempts: u.attempts,
      students: u.students.size,
      averageNote: u.notes.length
        ? Number((u.notes.reduce((a, b) => a + b, 0) / u.notes.length).toFixed(2))
        : 0,
      successRate: u.total ? Math.round((u.score / u.total) * 100) : 0
    }))
    .sort((a, b) => b.averageNote - a.averageNote);

  const evolution = [...byDay.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30)
    .map(d => ({
      date: d.date,
      attempts: d.attempts,
      averageNote: Number((d.notes.reduce((a, b) => a + b, 0) / d.notes.length).toFixed(2))
    }));

  const averageNote = rows.length
    ? Number((rows.reduce((acc, r) => acc + (r.total ? (r.score / r.total) * 20 : 0), 0) / rows.length).toFixed(2))
    : 0;
  const passed = rows.filter(r => r.total && (r.score / r.total) >= 0.5).length;

  res.json({
    totals: {
      results: rows.length,
      students: students.size,
      quizzes: new Set(rows.map(r => r.ue)).size,
      averageNote,
      successRate: rows.length ? Math.round((passed / rows.length) * 100) : 0,
      answered,
      correct,
      errorRate: answered ? Math.round(((answered - correct) / answered) * 100) : 0
    },
    mostMissed,
    byUe: ueStats,
    evolution
  });
});

// ── Sauvegardes SQLite ─────────────────────────────────────────────────

router.get('/backups', requireAdmin, (_req, res) => {
  res.json({ backups: listBackups() });
});

router.post('/backups', requireAdmin, async (_req, res) => {
  try {
    const backup = await createBackup('manuel');
    res.status(201).json({ success: true, backup });
  } catch (err) {
    console.error('[backup] Échec de création :', err);
    res.status(500).json({ error: 'Impossible de créer la sauvegarde.' });
  }
});

router.get('/backups/:name', requireAdmin, (req, res) => {
  const full = backupPath(req.params.name);
  if (!full) {
    return res.status(404).json({ error: 'Sauvegarde introuvable.' });
  }
  res.download(full);
});

router.delete('/backups/:name', requireAdmin, (req, res) => {
  try {
    if (!deleteBackup(req.params.name)) {
      return res.status(404).json({ error: 'Sauvegarde introuvable.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[backup] Échec de suppression :', err);
    res.status(500).json({ error: 'Impossible de supprimer la sauvegarde.' });
  }
});

export default router;
