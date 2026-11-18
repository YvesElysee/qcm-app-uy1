/**
 * Mode test de l'administration · /api/admin/preview
 *
 * Permet à l'administrateur de parcourir n'importe quelle épreuve (toutes
 * filières et tous niveaux) et de la jouer comme un étudiant, SANS écrire dans
 * `results`, `review_cards` ou `quiz_sessions`. Les questions sont servies
 * sans correction ; la correction est calculée côté serveur après la copie.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../auth.js';
import { drawForStudent } from '../questionDraw.js';
import { normalizeCorrect, answersEqual } from '../answerUtils.js';

const router = Router();

const PREVIEW_USER = { id: 'admin-preview', email: 'admin-preview@localhost' };

function optionsOf(q) {
  return {
    OptA: q.OptA || '',
    OptB: q.OptB || '',
    OptC: q.OptC || '',
    OptD: q.OptD || ''
  };
}

function publicQuestion(q) {
  return {
    id: q.id,
    Question: q.Question,
    ...optionsOf(q),
    tags: q.tags || '',
    difficulte: q.difficulte || 'moyenne'
  };
}

function quizMeta(quiz) {
  return {
    id: quiz.id,
    ue: quiz.ue,
    title: quiz.title || quiz.ue || quiz.id,
    filiere: quiz.filiere || '',
    niveau: quiz.niveau || '',
    faculte: quiz.faculte || '',
    semestre: quiz.semestre || '',
    questionCount: quiz.questionCount || 0,
    timePerQuestion: quiz.timePerQuestion || 60,
    drawCount: quiz.drawCount || 0,
    launchTime: quiz.launchTime ?? null,
    endTime: quiz.endTime ?? null
  };
}

function loadQuiz(quizId) {
  return db.prepare('SELECT * FROM quizzes WHERE id = ?').get(String(quizId || '').trim().toUpperCase());
}

function loadQuestions(quizId) {
  return db.prepare(
    `SELECT id, Question, OptA, OptB, OptC, OptD, ReponseCorrecte, explication, tags, difficulte
     FROM questions WHERE quizId = ? ORDER BY position ASC, id ASC`
  ).all(quizId);
}

/** Questions présentées à l'admin : tirage représentatif, jamais de correction. */
router.get('/:quizId/questions', requireAdmin, (req, res) => {
  const quiz = loadQuiz(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Épreuve introuvable.' });

  const all = loadQuestions(quiz.id);
  if (all.length === 0) {
    return res.status(400).json({ error: 'Cette épreuve ne contient aucune question.' });
  }
  const selected = drawForStudent(all, quiz, PREVIEW_USER);

  res.json({
    preview: true,
    quiz: quizMeta(quiz),
    questions: selected.map(publicQuestion),
    questionIds: selected.map((q) => q.id),
    drawn: selected.length !== all.length,
    totalQuestions: all.length,
    timePerQuestion: quiz.timePerQuestion || 60
  });
});

/**
 * Correction d'une copie de test : aucune insertion en base, aucun impact sur
 * les classements, cartes de révision ou sessions de présence.
 */
router.post('/:quizId/answers', requireAdmin, (req, res) => {
  const quiz = loadQuiz(req.params.quizId);
  if (!quiz) return res.status(404).json({ error: 'Épreuve introuvable.' });

  const { answers, questionIds } = req.body || {};
  if (!Array.isArray(answers)) {
    return res.status(400).json({ error: 'Copie de test incomplète.' });
  }

  const all = loadQuestions(quiz.id);
  let selected = all;

  if (Array.isArray(questionIds) && questionIds.length > 0) {
    const wanted = new Set(questionIds.map(Number).filter(Number.isFinite));
    const picked = all.filter((q) => wanted.has(Number(q.id)));
    if (picked.length === wanted.size) selected = picked;
  }
  if (!selected.length) selected = drawForStudent(all, quiz, PREVIEW_USER);

  const answerByQuestion = new Map();
  answers.forEach((a) => {
    const id = Number(a?.questionId);
    if (Number.isFinite(id)) answerByQuestion.set(id, a);
  });

  const corrected = selected.map((q, index) => {
    const submitted = answerByQuestion.get(Number(q.id));
    const fallback = answers[index];
    const rawSelected = typeof submitted === 'string'
      ? submitted
      : (submitted?.selected ?? (typeof fallback === 'string' ? fallback : fallback?.selected) ?? '');
    const selectedAnswer = String(rawSelected || '').trim();
    const correct = normalizeCorrect(q);

    return {
      questionId: q.id,
      question: q.Question,
      options: optionsOf(q),
      selected: selectedAnswer || null,
      correct,
      isOk: answersEqual(selectedAnswer, q, correct),
      explication: q.explication || '',
      tags: q.tags || '',
      difficulte: q.difficulte || 'moyenne'
    };
  });

  const score = corrected.reduce((acc, a) => acc + (a.isOk ? 1 : 0), 0);
  const total = corrected.length;

  res.json({
    success: true,
    preview: true,
    score,
    total,
    note: total ? Number(((score / total) * 20).toFixed(2)) : 0,
    answers: corrected
  });
});

export default router;
