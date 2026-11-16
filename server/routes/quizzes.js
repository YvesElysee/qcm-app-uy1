/**
 * Routes des QCM · /api/quizzes
 * - Lecture publique : liste, métadonnées, questions (même logique d'accès que Firestore avant)
 * - Écriture réservée à l'admin : programmation, import CSV de questions, suppression
 * - Présence temps réel des participants (heartbeat + compteur, remplace onSnapshot)
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin, bearerToken, isAdminToken, getStudentFromToken } from '../auth.js';
import { drawForStudent } from '../questionDraw.js';
import {
  canStudentAccessQuiz,
  normalizeFaculte,
  facultyOfFiliere,
  studentFaculte
} from '../access.js';
import { notifyQuizAvailable } from '../notifications.js';
import { approveRequestsForQuiz } from './quizRequests.js';

const router = Router();

const PRESENCE_WINDOW_MS = 20 * 1000; // un participant est "en cours" s'il a battu dans les 20 dernières secondes

/**
 * Convertit une question en objet public (sans la réponse correcte).
 */
function publicQuestion(q) {
  return {
    id: q.id,
    Question: q.Question,
    OptA: q.OptA,
    OptB: q.OptB,
    OptC: q.OptC,
    OptD: q.OptD,
    tags: q.tags || '',
    difficulte: q.difficulte || 'moyenne'
  };
}

/**
 * Garantit que l'UE de l'épreuve figure dans le catalogue (`ues`).
 * Sans cette ligne, l'étudiant ne voit pas la matière sur son tableau de bord
 * et l'épreuve reste introuvable même lorsqu'elle est programmée.
 */
function ensureUeFromQuiz({ code, label, filiere, niveau, faculte }) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return;
  const existing = db.prepare('SELECT * FROM ues WHERE id = ?').get(cleanCode);
  const cleanLabel = String(label || '').trim() || existing?.label || cleanCode;
  const cleanFiliere = filiere || existing?.filiere || null;
  const cleanNiveau = niveau || existing?.niveau || null;
  const cleanFaculte = normalizeFaculte(faculte || existing?.faculte || facultyOfFiliere(cleanFiliere));
  // Filière et niveau sont indispensables au filtrage côté étudiant
  if (!cleanFiliere || !cleanNiveau) return;

  db.prepare(`
    INSERT INTO ues (id, code, label, filiere, niveau, faculte)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code, label = excluded.label,
      filiere = excluded.filiere, niveau = excluded.niveau,
      faculte = excluded.faculte
  `).run(cleanCode, cleanCode, cleanLabel, cleanFiliere, cleanNiveau, cleanFaculte);
}

/**
 * Liste des QCM (public). Filtres optionnels filière / niveau, tri launchTime asc|desc.
 */
router.get('/', (req, res) => {
  let { filiere, niveau, faculte, sort } = req.query;
  const dir = sort === 'desc' ? 'DESC' : 'ASC';

  // Un étudiant connecté est automatiquement limité à son parcours : le
  // serveur ignore les filtres fournis par le client. La liste reste publique
  // (sans jeton) pour l'accueil et l'emploi du temps public.
  const token = bearerToken(req);
  const admin = isAdminToken(token);
  const user = admin ? null : getStudentFromToken(token);
  if (user) {
    filiere = user.filiere || '__aucune__';
    niveau = user.niveau || '__aucune__';
    faculte = studentFaculte(user);
  }

  // On joint le catalogue des UE pour exposer l'intitulé de chaque matière
  let sql = `
    SELECT q.*, u.label AS ueLabel
    FROM quizzes q
    LEFT JOIN ues u ON u.code = q.ue
  `;
  const where = [];
  const params = [];
  if (filiere) {
    where.push('LOWER(TRIM(q.filiere)) = LOWER(TRIM(?))');
    params.push(filiere);
  }
  if (niveau) {
    where.push('LOWER(TRIM(q.niveau)) = LOWER(TRIM(?))');
    params.push(niveau);
  }
  if (faculte) {
    where.push("UPPER(COALESCE(NULLIF(TRIM(q.faculte), ''), 'FACSCIENCES')) = ?");
    params.push(normalizeFaculte(faculte));
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  // Les QCM sans date de programmation sont renvoyés en dernier
  sql += ` ORDER BY (q.launchTime IS NULL), q.launchTime ${dir}, q.id ${dir}`;

  const quizzes = db.prepare(sql).all(...params);
  res.json({ quizzes });
});

/**
 * Métadonnées d'un QCM (public) · 404 si introuvable
 */
router.get('/:id', (req, res) => {
  const quiz = db.prepare(`
    SELECT q.*, u.label AS ueLabel
    FROM quizzes q
    LEFT JOIN ues u ON u.code = q.ue
    WHERE q.id = ?
  `).get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz introuvable.' });
  }

  const token = bearerToken(req);
  const admin = isAdminToken(token);
  const user = getStudentFromToken(token);
  if (!admin && user && !canStudentAccessQuiz(user, quiz)) {
    return res.status(403).json({
      error: "Cette épreuve n'appartient pas à votre filière et à votre niveau d'inscription."
    });
  }

  res.json({ quiz });
});

/**
 * Questions d'un QCM.
 * - Étudiant / public : jamais de `ReponseCorrecte`, tirage déterministe
 *   selon l'étudiant si l'épreuve définit un nombre de questions par tentative.
 * - Administrateur (jeton admin) : toutes les questions avec la correction
 *   pour l'inspecteur du panneau d'administration.
 */
router.get('/:id/questions', (req, res) => {
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(req.params.id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz introuvable.' });
  }

  const token = bearerToken(req);
  const user = getStudentFromToken(token);
  const admin = isAdminToken(token);

  if (!admin) {
    if (!user) {
      return res.status(401).json({ error: 'Connexion requise pour accéder aux questions.' });
    }
    if (!canStudentAccessQuiz(user, quiz)) {
      return res.status(403).json({
        error: "Cette épreuve n'appartient pas à votre filière et à votre niveau d'inscription."
      });
    }
  }

  const allQuestions = db.prepare(`
    SELECT id, Question, OptA, OptB, OptC, OptD, ReponseCorrecte, explication, tags, difficulte
    FROM questions WHERE quizId = ? ORDER BY position ASC, id ASC
  `).all(req.params.id);

  if (admin) {
    return res.json({ questions: allQuestions, drawn: false });
  }

  const selected = drawForStudent(allQuestions, quiz, user);
  res.json({
    questions: selected.map(publicQuestion),
    drawn: selected.length !== allQuestions.length
  });
});

// ══════════════ Routes administrateur ══════════════

/**
 * Programmer / mettre à jour un QCM (fusion des champs, comme setDoc merge:true)
 */
router.post('/:id', requireAdmin, (req, res) => {
  const {
    filiere, niveau, faculte, semestre, ue, ueLabel, label,
    timePerQuestion, drawCount, launchTime, endTime
  } = req.body || {};
  const id = req.params.id;

  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) || {};

  const merged = {
    ue: ue ?? existing.ue ?? id,
    filiere: filiere ?? existing.filiere ?? null,
    niveau: niveau ?? existing.niveau ?? null,
    faculte: normalizeFaculte(faculte || existing.faculte || facultyOfFiliere(filiere ?? existing.filiere)),
    semestre: semestre ?? existing.semestre ?? null,
    timePerQuestion: timePerQuestion != null ? (Number(timePerQuestion) || 60) : (existing.timePerQuestion ?? 60),
    drawCount: drawCount != null ? Math.max(0, Number(drawCount) || 0) : (existing.drawCount ?? 0),
    launchTime: launchTime != null ? Number(launchTime) : (existing.launchTime ?? null),
    endTime: endTime != null ? Number(endTime) : (existing.endTime ?? null),
    questionCount: existing.questionCount ?? 0,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO quizzes (id, ue, filiere, niveau, faculte, semestre, questionCount, timePerQuestion, drawCount, launchTime, endTime, updatedAt)
    VALUES (@id, @ue, @filiere, @niveau, @faculte, @semestre, @questionCount, @timePerQuestion, @drawCount, @launchTime, @endTime, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      ue = excluded.ue, filiere = excluded.filiere, niveau = excluded.niveau,
      faculte = excluded.faculte, semestre = excluded.semestre, questionCount = excluded.questionCount,
      timePerQuestion = excluded.timePerQuestion, drawCount = excluded.drawCount,
      launchTime = excluded.launchTime, endTime = excluded.endTime, updatedAt = excluded.updatedAt
  `).run({ id, ...merged });

  // L'épreuve doit toujours être rattachée à une UE visible par la filière/niveau
  ensureUeFromQuiz({
    code: merged.ue,
    label: ueLabel ?? label,
    filiere: merged.filiere,
    niveau: merged.niveau,
    faculte: merged.faculte
  });

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
  if (quiz) notifyQuizAvailable(quiz);
  if (quiz) approveRequestsForQuiz(quiz);

  res.json({ success: true, quiz });
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
  const {
    questions, filiere, niveau, faculte, semestre,
    timePerQuestion, drawCount, ueLabel, label
  } = req.body || {};

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Aucune question valide à importer.' });
  }

  // S'assurer que le quiz existe avant d'insérer les questions (clé étrangère)
  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) || {};

  const merged = {
    ue: existing.ue ?? id,
    filiere: filiere ?? existing.filiere ?? null,
    niveau: niveau ?? existing.niveau ?? null,
    faculte: normalizeFaculte(faculte || existing.faculte || facultyOfFiliere(filiere ?? existing.filiere)),
    semestre: semestre ?? existing.semestre ?? null,
    questionCount: questions.length,
    timePerQuestion: timePerQuestion != null ? Number(timePerQuestion) || 60 : existing.timePerQuestion ?? 60,
    drawCount: drawCount != null ? Math.max(0, Number(drawCount) || 0) : (existing.drawCount ?? 0),
    launchTime: existing.launchTime ?? null,
    endTime: existing.endTime ?? null,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO quizzes (id, ue, filiere, niveau, faculte, semestre, questionCount, timePerQuestion, drawCount, launchTime, endTime, updatedAt)
    VALUES (@id, @ue, @filiere, @niveau, @faculte, @semestre, @questionCount, @timePerQuestion, @drawCount, @launchTime, @endTime, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      ue = excluded.ue, filiere = excluded.filiere, niveau = excluded.niveau,
      faculte = excluded.faculte, semestre = excluded.semestre, questionCount = excluded.questionCount,
      timePerQuestion = excluded.timePerQuestion, drawCount = excluded.drawCount,
      updatedAt = excluded.updatedAt
  `).run({
    id,
    ue: existing.ue ?? id,
    ...merged
  });

  // 1. Supprimer les anciennes questions  2. Insérer les nouvelles (transaction atomique)
  const replaceAll = db.transaction((rows) => {
    db.prepare('DELETE FROM questions WHERE quizId = ?').run(id);
    const insert = db.prepare(`
      INSERT INTO questions (quizId, Question, OptA, OptB, OptC, OptD, ReponseCorrecte, explication, tags, difficulte, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        String(
          q.Explication || q.explication || q.explanation ||
          q.justification || q.commentaire || ''
        ).trim().slice(0, 2000),
        String(q.Tags || q.tags || '').trim(),
        String(q.Difficulte || q.difficulte || 'moyenne').trim().toLowerCase(),
        i
      );
    });
  });
  replaceAll(questions);

  // Le catalogue UE est aligné sur l'épreuve importée (même filière/niveau)
  ensureUeFromQuiz({
    code: id,
    label: ueLabel ?? label,
    filiere: merged.filiere,
    niveau: merged.niveau,
    faculte: merged.faculte
  });

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
  if (quiz) notifyQuizAvailable(quiz);
  if (quiz) approveRequestsForQuiz(quiz);

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

  const token = bearerToken(req);
  const admin = isAdminToken(token);
  const user = getStudentFromToken(token);
  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz introuvable.' });
  }
  if (!admin && user && !canStudentAccessQuiz(user, quiz)) {
    return res.status(403).json({
      error: "Cette épreuve n'appartient pas à votre filière et à votre niveau d'inscription."
    });
  }

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
