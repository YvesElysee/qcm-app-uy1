/**
 * Routes des QCM — /api/quizzes
 * - Lecture publique : liste, métadonnées, questions (même logique d'accès que Firestore avant)
 * - Écriture réservée à l'admin : programmation, import CSV de questions, suppression
 * - Présence temps réel des participants (heartbeat + compteur, remplace onSnapshot)
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

const PRESENCE_WINDOW_MS = 20 * 1000; // un participant est "en cours" s'il a battu dans les 20 dernières secondes

/**
 * Liste des QCM (public). Filtres optionnels filière / niveau, tri launchTime asc|desc.
 */
router.get('/', (req, res) => {
  const { filiere, niveau, sort } = req.query;
  const dir = sort === 'desc' ? 'DESC' : 'ASC';

  let sql = 'SELECT * FROM quizzes';
  const where = [];
  const params = [];
  if (filiere) { where.push('filiere = ?'); params.push(filiere); }
  if (niveau) { where.push('niveau = ?'); params.push(niveau); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  // Les QCM sans date de programmation sont renvoyés en dernier
  sql += ` ORDER BY (launchTime IS NULL), launchTime ${dir}, id ${dir}`;

  const quizzes = db.prepare(sql).all(...params);
  res.json({ quizzes });
});

/**
 * Métadonnées d'un QCM (public) — 404 si introuvable
 */
router.get('/:id', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz introuvable.' });
  }
  res.json({ quiz });
});

/**
 * Questions d'un QCM (public) — dans l'ordre d'insertion (identique à Firestore)
 */
router.get('/:id/questions', (req, res) => {
  const questions = db.prepare(`
    SELECT id, Question, OptA, OptB, OptC, OptD, ReponseCorrecte
    FROM questions WHERE quizId = ? ORDER BY position ASC, id ASC
  `).all(req.params.id);
  res.json({ questions });
});

// ══════════════ Routes administrateur ══════════════

/**
 * Programmer / mettre à jour un QCM (fusion des champs, comme setDoc merge:true)
 */
router.post('/:id', requireAdmin, (req, res) => {
  const { filiere, niveau, semestre, ue, timePerQuestion, launchTime, endTime } = req.body || {};
  const id = req.params.id;

  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) || {};

  const merged = {
    ue: ue ?? existing.ue ?? id,
    filiere: filiere ?? existing.filiere ?? null,
    niveau: niveau ?? existing.niveau ?? null,
    semestre: semestre ?? existing.semestre ?? null,
    timePerQuestion: timePerQuestion != null ? (Number(timePerQuestion) || 60) : (existing.timePerQuestion ?? 60),
    launchTime: launchTime != null ? Number(launchTime) : (existing.launchTime ?? null),
    endTime: endTime != null ? Number(endTime) : (existing.endTime ?? null),
    questionCount: existing.questionCount ?? 0,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO quizzes (id, ue, filiere, niveau, semestre, questionCount, timePerQuestion, launchTime, endTime, updatedAt)
    VALUES (@id, @ue, @filiere, @niveau, @semestre, @questionCount, @timePerQuestion, @launchTime, @endTime, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      ue = excluded.ue, filiere = excluded.filiere, niveau = excluded.niveau,
      semestre = excluded.semestre, questionCount = excluded.questionCount,
      timePerQuestion = excluded.timePerQuestion, launchTime = excluded.launchTime,
      endTime = excluded.endTime, updatedAt = excluded.updatedAt
  `).run({ id, ...merged });

  res.json({ success: true, quiz: db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) });
});

/**
 * Suppression d'un QCM.
 * Les questions sont supprimées en cascade (FK) et les sessions actives nettoyées.
 * Les résultats déjà enregistrés sont conservés (historique des notes).
 */
router.delete('/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz introuvable.' });
  }
  db.prepare('DELETE FROM questions WHERE quizId = ?').run(id);   // cascade si FK active
  db.prepare('DELETE FROM quiz_sessions WHERE quizId = ?').run(id);
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(id);
  res.json({ success: true });
});

/**
 * Import de questions (remplace toutes les questions existantes de l'UE).
 * Reproduit handleConfirmImport : suppression puis insertion, puis fusion des métadonnées.
 */
router.post('/:id/questions', requireAdmin, (req, res) => {
  const id = req.params.id;
  const { questions, filiere, niveau, semestre, timePerQuestion } = req.body || {};

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Aucune question valide à importer.' });
  }

  // S'assurer que le quiz existe avant d'insérer les questions (clé étrangère)
  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) || {};

  const merged = {
    ue: existing.ue ?? id,
    filiere: filiere ?? existing.filiere ?? null,
    niveau: niveau ?? existing.niveau ?? null,
    semestre: semestre ?? existing.semestre ?? null,
    questionCount: questions.length,
    timePerQuestion: timePerQuestion != null ? Number(timePerQuestion) || 60 : existing.timePerQuestion ?? 60,
    launchTime: existing.launchTime ?? null,
    endTime: existing.endTime ?? null,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO quizzes (id, ue, filiere, niveau, semestre, questionCount, timePerQuestion, launchTime, endTime, updatedAt)
    VALUES (@id, @ue, @filiere, @niveau, @semestre, @questionCount, @timePerQuestion, @launchTime, @endTime, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      ue = excluded.ue, filiere = excluded.filiere, niveau = excluded.niveau,
      semestre = excluded.semestre, questionCount = excluded.questionCount,
      timePerQuestion = excluded.timePerQuestion, updatedAt = excluded.updatedAt
  `).run({
    id,
    ue: existing.ue ?? id,
    ...merged
  });

  // 1. Supprimer les anciennes questions  2. Insérer les nouvelles (transaction atomique)
  const replaceAll = db.transaction((rows) => {
    db.prepare('DELETE FROM questions WHERE quizId = ?').run(id);
    const insert = db.prepare(`
      INSERT INTO questions (quizId, Question, OptA, OptB, OptC, OptD, ReponseCorrecte, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    rows.forEach((q, i) => {
      insert.run(
        id,
        String(q.Question || '').trim(),
        String(q.OptA || '').trim(),
        String(q.OptB || '').trim(),
        String(q.OptC || '').trim(),
        String(q.OptD || '').trim(),
        String(q.ReponseCorrecte || q.OptA || '').trim(),
        i
      );
    });
  });
  replaceAll(questions);

  res.json({ success: true, count: questions.length });
});

/**
 * Supprimer une question individuelle (inspecteur de questions)
 */
router.delete('/:id/questions/:qid', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM questions WHERE quizId = ? AND id = ?').run(req.params.id, req.params.qid);
  res.json({ success: true });
});

// ══════════════ Présence temps réel (polling) ══════════════

/**
 * Nombre de participants "en cours" sur un QCM
 */
function participantsOf(quizId) {
  return db.prepare('SELECT COUNT(*) AS c FROM quiz_sessions WHERE quizId = ? AND lastSeen > ?')
    .get(quizId, Date.now() - PRESENCE_WINDOW_MS).c;
}

/**
 * Heartbeat : le client annonce sa présence toutes les ~8s et reçoit le compteur.
 * Remplace setDoc + onSnapshot(collection sessions).
 */
router.post('/:id/sessions', (req, res) => {
  const quizId = req.params.id;
  const { sid, name } = req.body || {};
  const now = Date.now();
  const sessionId = sid || `${String(name || 'anonyme')}_${now}`;

  db.prepare(`
    INSERT INTO quiz_sessions (id, quizId, name, lastSeen, ts)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET lastSeen = excluded.lastSeen
  `).run(sessionId, quizId, String(name || 'Anonyme'), now, new Date().toISOString());

  res.json({ sid: sessionId, participants: participantsOf(quizId) });
});

/**
 * Sortie propre (fermeture de l'onglet / fin de session)
 */
router.delete('/:id/sessions/:sid', (req, res) => {
  db.prepare('DELETE FROM quiz_sessions WHERE quizId = ? AND id = ?').run(req.params.id, req.params.sid);
  res.json({ success: true, participants: participantsOf(req.params.id) });
});

/**
 * Compteur seul (optionnel, pour affichage sans heartbeat)
 */
router.get('/:id/sessions', (req, res) => {
  res.json({ participants: participantsOf(req.params.id) });
});

export default router;
