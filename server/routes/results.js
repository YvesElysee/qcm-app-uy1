/**
 * Routes des résultats · /api/results
 * - POST : enregistrement d'une copie (étudiant connecté, identité prise du jeton)
 * - GET  : classement public d'une session (remplace onSnapshot via polling)
 * - GET /mine : historique strictement personnel (remplace le filtrage client-side)
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireStudent } from '../auth.js';

const router = Router();

/**
 * Sérialise une ligne résultat vers l'objet attendu par le frontend
 * (answers était stockée en JSON dans la colonne TEXT)
 */
function parseAnswers(json) {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

function toResult(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    ue: row.ue,
    filiere: row.filiere,
    niveau: row.niveau,
    score: row.score,
    total: row.total,
    answers: parseAnswers(row.answers),
    sessionTimestamp: row.sessionTimestamp ?? 0,
    isMakeup: !!row.isMakeup,
    date: row.date
  };
}

/**
 * Enregistre le résultat d'une copie (fin de QCM ou rattrapage)
 */
router.post('/', requireStudent, (req, res) => {
  const { ue, filiere, niveau, score, total, answers, sessionTimestamp, isMakeup } = req.body || {};

  if (!ue || total == null) {
    return res.status(400).json({ error: 'Données de résultat incomplètes.' });
  }

  db.prepare(`
    INSERT INTO results (name, email, ue, filiere, niveau, score, total, answers, sessionTimestamp, isMakeup, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.name,
    req.user.email,
    String(ue),
    filiere || '',
    niveau || '',
    Number(score) || 0,
    Number(total) || 0,
    JSON.stringify(Array.isArray(answers) ? answers : []),
    Number(sessionTimestamp) || 0,
    isMakeup ? 1 : 0,
    new Date().toISOString()
  );

  res.status(201).json({ success: true });
});

/**
 * Classement d'une session de QCM (public, comme l'ancienne lecture ouverte Firestore).
 * Le tri par score décroissant reste effectué côté client (même logique d'affichage).
 */
router.get('/', (req, res) => {
  const { ue, sessionTimestamp } = req.query;
  if (!ue) {
    return res.status(400).json({ error: 'Paramètre "ue" requis.' });
  }

  let rows;
  if (sessionTimestamp !== undefined) {
    rows = db.prepare('SELECT * FROM results WHERE ue = ? AND sessionTimestamp = ?').all(ue, Number(sessionTimestamp));
  } else {
    rows = db.prepare('SELECT * FROM results WHERE ue = ?').all(ue);
  }

  res.json({ results: rows.map(toResult) });
});

/**
 * Historique personnel : STRICTEMENT les résultats de l'étudiant connecté,
 * par email ou par nom (identique à l'ancien filtrage).
 */
router.get('/mine', requireStudent, (req, res) => {
  const email = (req.user.email || '').toLowerCase();
  const name = (req.user.name || '').trim();
  const ue = req.query.ue;

  let rows = db.prepare(`
    SELECT * FROM results
    WHERE (email = ? OR name = ?)
    ORDER BY date DESC
  `).all(email, name);

  if (ue) {
    rows = rows.filter(r => r.ue === ue);
  }

  res.json({ results: rows.map(toResult) });
});

export default router;
