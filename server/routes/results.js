/**
 * Routes des résultats · /api/results
 * - POST : correction intégrale côté serveur (le client n'envoie que ses choix)
 * - GET  : classement public d'une session (sans correction ni données sensibles)
 * - GET /mine : historique strictement personnel avec correction
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireStudent } from '../auth.js';
import { normalizeCorrect, upsertWrongCard } from '../spacedRepetition.js';
import { drawForStudent } from '../questionDraw.js';

const router = Router();

function parseAnswers(json) {
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
}

function toResult(row, { includeAnswers = false } = {}) {
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
    answers: includeAnswers ? parseAnswers(row.answers) : [],
    sessionTimestamp: row.sessionTimestamp ?? 0,
    isMakeup: !!row.isMakeup,
    date: row.date
  };
}

function optionsOf(question) {
  return {
    OptA: question.OptA || '',
    OptB: question.OptB || '',
    OptC: question.OptC || '',
    OptD: question.OptD || ''
  };
}

/**
 * Enregistre une copie. Le score, la correction et les cartes de révision sont
 * calculés ici : un client modifié ne peut pas s'attribuer une note.
 */
router.post('/', requireStudent, (req, res) => {
  const { ue, answers, isMakeup } = req.body || {};

  if (!ue || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Données de résultat incomplètes.' });
  }

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(String(ue));
  if (!quiz) {
    return res.status(404).json({ error: 'Épreuve introuvable.' });
  }

  const quizQuestions = db.prepare(
    'SELECT * FROM questions WHERE quizId = ? ORDER BY position ASC, id ASC'
  ).all(quiz.id);

  if (quizQuestions.length === 0) {
    return res.status(400).json({ error: 'Aucune question pour cette épreuve.' });
  }

  const byId = new Map(quizQuestions.map(q => [Number(q.id), q]));

  // Le serveur recalcule lui-même le tirage : un client modifié ne peut pas
  // réduire artificiellement le nombre de questions pour gonfler sa note.
  const presented = drawForStudent(quizQuestions, quiz, req.user);

  const answerByQuestion = new Map();
  answers.forEach((a) => {
    const id = Number(a?.questionId);
    if (Number.isFinite(id)) answerByQuestion.set(id, a);
  });

  const corrected = presented.map((q, index) => {
    const submitted = answerByQuestion.get(Number(q.id));
    const fallback = answers[index];
    const rawSelected = typeof submitted === 'string'
      ? submitted
      : (submitted?.selected ?? (typeof fallback === 'string' ? fallback : fallback?.selected) ?? '');
    const selected = String(rawSelected || '').trim();
    const correct = normalizeCorrect(q);
    const isOk = selected !== '' && selected === correct;

    return {
      questionId: q.id,
      question: q.Question,
      options: optionsOf(q),
      selected: selected || null,
      correct,
      isOk,
      tags: q.tags || '',
      difficulte: q.difficulte || 'moyenne'
    };
  });

  const score = corrected.reduce((acc, a) => acc + (a.isOk ? 1 : 0), 0);
  const total = corrected.length;

  const info = db.prepare(`
    INSERT INTO results (name, email, ue, filiere, niveau, score, total, answers, sessionTimestamp, isMakeup, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.name,
    req.user.email,
    quiz.id,
    quiz.filiere || req.user.filiere || '',
    quiz.niveau || req.user.niveau || '',
    score,
    total,
    JSON.stringify(corrected),
    Number(quiz.launchTime) || 0,
    isMakeup ? 1 : 0,
    new Date().toISOString()
  );

  // Chaque erreur alimente la banque de révision espacée de l'étudiant.
  corrected.forEach((a) => {
    if (a.isOk) return;
    const question = byId.get(Number(a.questionId));
    if (question) upsertWrongCard(req.user, quiz.id, question, a.selected || '');
  });

  res.status(201).json({
    success: true,
    id: Number(info.lastInsertRowid),
    score,
    total,
    note: total ? Number(((score / total) * 20).toFixed(2)) : 0,
    answers: corrected
  });
});

/**
 * Classement d'une session de QCM (public).
 * Les réponses détaillées ne sont jamais exposées ici.
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

  res.json({ results: rows.map(r => toResult(r)) });
});

/**
 * Historique personnel : uniquement les résultats de l'étudiant connecté,
 * avec la correction complète renvoyée par le serveur.
 */
router.get('/mine', requireStudent, (req, res) => {
  const email = (req.user.email || '').toLowerCase();
  const name = (req.user.name || '').trim();
  const ue = req.query.ue;

  let rows = db.prepare(`
    SELECT * FROM results
    WHERE (LOWER(email) = ? OR name = ?)
    ORDER BY date DESC
  `).all(email, name);

  if (ue) {
    rows = rows.filter(r => r.ue === ue);
  }

  res.json({ results: rows.map(r => toResult(r, { includeAnswers: true })) });
});

export default router;
