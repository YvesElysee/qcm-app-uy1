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
import { buildRankingGroups } from '../ranking.js';
import {
  canStudentAccessQuiz,
  normalizeFaculte,
  studentFaculte,
  quizFaculte
} from '../access.js';

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
    quizId: row.quizId || '',
    quizTitle: row.quizTitle || '',
    filiere: row.filiere,
    niveau: row.niveau,
    faculte: row.faculte || '',
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
 * Détermine si la réponse soumise correspond à la bonne réponse.
 *
 * Le site envoie le texte exact de l'option cochée, mais les anciens clients
 * (et certaines intégrations) envoient la lettre A/B/C/D. On accepte les deux
 * afin de ne jamais marquer à tort une copie comme fausse.
 */
function answerMatches(selected, question, correct) {
  if (!selected) return false;
  if (selected === correct) return true;

  const direct = String(question?.ReponseCorrecte || '').trim().toUpperCase();
  const letter = ['A', 'B', 'C', 'D'].includes(direct)
    ? direct
    : ['A', 'B', 'C', 'D'].find(
        (label) => String(question?.[`Opt${label}`] || '').trim() === correct
      ) || '';

  return !!letter && selected.length <= 2 && selected.toUpperCase() === letter;
}

/**
 * Enregistre une copie. Le score, la correction et les cartes de révision sont
 * calculés ici : un client modifié ne peut pas s'attribuer une note.
 */
router.post('/', requireStudent, (req, res) => {
  const { ue, quizId, answers, isMakeup } = req.body || {};

  if ((!ue && !quizId) || !Array.isArray(answers)) {
    return res.status(400).json({ error: 'Données de résultat incomplètes.' });
  }

  // `quizId` identifie le test précis ; `ue` reste accepté pour les anciens
  // clients et les copies enregistrées avant les tests multiples.
  const reference = String(quizId || ue);
  let quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(reference);
  if (!quiz && ue) {
    quiz = db.prepare(`
      SELECT * FROM quizzes WHERE ue = ?
      ORDER BY COALESCE(endTime, launchTime, 0) DESC, id DESC LIMIT 1
    `).get(String(ue).trim().toUpperCase());
  }
  if (!quiz) {
    return res.status(404).json({ error: 'Épreuve introuvable.' });
  }

  if (!canStudentAccessQuiz(req.user, quiz)) {
    return res.status(403).json({
      error: "Vous ne pouvez pas déposer une copie pour une épreuve d'une autre filière ou d'un autre niveau."
    });
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
    const isOk = answerMatches(selected, q, correct);

    return {
      questionId: q.id,
      question: q.Question,
      options: optionsOf(q),
      selected: selected || null,
      correct,
      isOk,
      explication: q.explication || '',
      tags: q.tags || '',
      difficulte: q.difficulte || 'moyenne'
    };
  });

  const score = corrected.reduce((acc, a) => acc + (a.isOk ? 1 : 0), 0);
  const total = corrected.length;

  const info = db.prepare(`
    INSERT INTO results (name, email, ue, quizId, quizTitle, filiere, niveau, faculte, score, total, answers, sessionTimestamp, isMakeup, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.user.name,
    req.user.email,
    quiz.ue || quiz.id,
    quiz.id,
    quiz.title || quiz.ue || quiz.id,
    quiz.filiere || req.user.filiere || '',
    quiz.niveau || req.user.niveau || '',
    normalizeFaculte(quizFaculte(quiz) || studentFaculte(req.user)),
    score,
    total,
    JSON.stringify(corrected),
    Number(quiz.launchTime) || 0,
    isMakeup ? 1 : 0,
    new Date().toISOString()
  );

  // Chaque erreur alimente la banque de révision espacée de l'étudiant.
  // Les cartes restent rattachées à l'UE (et non au test) pour réviser la
  // matière dans son ensemble, même si plusieurs tests la composent.
  corrected.forEach((a) => {
    if (a.isOk) return;
    const question = byId.get(Number(a.questionId));
    if (question) upsertWrongCard(req.user, quiz.ue || quiz.id, question, a.selected || '');
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
 * Classement d'une session de QCM, limité à la salle de l'étudiant connecté
 * (faculté + filière + niveau). Les réponses détaillées ne sont jamais
 * exposées ici.
 */
router.get('/', requireStudent, (req, res) => {
  const { ue, quizId, sessionTimestamp } = req.query;
  if (!ue && !quizId) {
    return res.status(400).json({ error: 'Paramètre "quizId" ou "ue" requis.' });
  }

  let sql = 'SELECT * FROM results WHERE 1 = 1';
  const params = [];
  if (quizId) {
    sql += ' AND quizId = ?';
    params.push(String(quizId));
  } else {
    sql += ' AND ue = ?';
    params.push(String(ue));
  }
  sql += ' AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))';
  params.push(req.user.filiere || '');
  sql += ' AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))';
  params.push(req.user.niveau || '');
  sql += ` AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?`;
  params.push(studentFaculte(req.user));
  if (sessionTimestamp !== undefined) {
    sql += ' AND sessionTimestamp = ?';
    params.push(Number(sessionTimestamp));
  }

  const rows = db.prepare(sql).all(...params);
  res.json({ results: rows.map(r => toResult(r)) });
});

/**
 * Classement de la salle (filière + niveau) de l'étudiant connecté.
 * L'étudiant ne peut consulter que les classements de sa propre filière ;
 * le niveau peut être celui qu'il consulte dans son espace.
 */
router.get('/ranking', requireStudent, (req, res) => {
  const filiere = String(req.user.filiere || '').trim();
  // Le niveau est verrouillé sur celui de l'inscription : un étudiant de L1
  // ne peut jamais consulter le classement des niveaux supérieurs.
  const niveau = String(req.user.niveau || '').trim();
  const faculte = studentFaculte(req.user);
  const ue = String(req.query.ue || '').trim();
  const quizId = String(req.query.quizId || '').trim();
  const sessionTimestamp = req.query.sessionTimestamp !== undefined
    ? Number(req.query.sessionTimestamp)
    : null;

  let sql = 'SELECT * FROM results WHERE 1 = 1';
  const params = [];
  if (quizId) {
    sql += ' AND quizId = ?';
    params.push(quizId);
  }
  if (filiere) {
    sql += ' AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))';
    params.push(filiere);
  }
  if (niveau) {
    sql += ' AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))';
    params.push(niveau);
  }
  sql += ` AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?`;
  params.push(faculte);
  if (ue) {
    sql += ' AND ue = ?';
    params.push(ue);
  }
  if (sessionTimestamp !== null && Number.isFinite(sessionTimestamp)) {
    sql += ' AND sessionTimestamp = ?';
    params.push(sessionTimestamp);
  }

  const rows = db.prepare(sql).all(...params);
  const { groups } = buildRankingGroups(rows, req.user);
  res.json({ groups, class: { filiere, niveau } });
});

/**
 * Historique personnel : uniquement les résultats de l'étudiant connecté,
 * avec la correction complète renvoyée par le serveur.
 */
router.get('/mine', requireStudent, (req, res) => {
  const email = (req.user.email || '').toLowerCase();
  const name = (req.user.name || '').trim();
  const ue = req.query.ue;
  const quizId = req.query.quizId;

  let rows = db.prepare(`
    SELECT * FROM results
    WHERE (LOWER(email) = ? OR name = ?)
    ORDER BY date DESC
  `).all(email, name);

  if (quizId) {
    rows = rows.filter(r => (r.quizId || r.ue) === quizId);
  } else if (ue) {
    rows = rows.filter(r => r.ue === ue);
  }

  res.json({ results: rows.map(r => toResult(r, { includeAnswers: true })) });
});

export default router;
