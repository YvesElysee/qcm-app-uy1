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
  studentFaculte,
  quizFaculte
} from '../access.js';
import { notifyQuizAvailable } from '../notifications.js';
import { approveRequestsForQuiz } from './quizRequests.js';
import { normalizeImportedQuestion } from '../answerUtils.js';

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
function ensureUeFromQuiz({ code, label, filiere, niveau, faculte, semestre }) {
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return;
  const existing = db.prepare('SELECT * FROM ues WHERE id = ?').get(cleanCode);
  const cleanLabel = String(label || '').trim() || existing?.label || cleanCode;
  const cleanFiliere = filiere || existing?.filiere || null;
  const cleanNiveau = niveau || existing?.niveau || null;
  const cleanFaculte = normalizeFaculte(faculte || existing?.faculte || facultyOfFiliere(cleanFiliere));
  const cleanSemestre = ['1', '2'].includes(String(semestre || '').trim())
    ? String(semestre).trim()
    : (existing?.semestre || '');
  // Filière et niveau sont indispensables au filtrage côté étudiant
  if (!cleanFiliere || !cleanNiveau) return;

  db.prepare(`
    INSERT INTO ues (id, code, label, filiere, niveau, faculte, semestre)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code, label = excluded.label,
      filiere = excluded.filiere, niveau = excluded.niveau,
      faculte = excluded.faculte, semestre = excluded.semestre
  `).run(cleanCode, cleanCode, cleanLabel, cleanFiliere, cleanNiveau, cleanFaculte, cleanSemestre);
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
 * Transforme un intitulé en fragment d'identifiant stable.
 * « Test 1 » → « TEST-1 ».
 */
function slugifyQuizPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Identifiant d'un test. Sans intitulé (ou si l'intitulé reprend le code UE),
 * on conserve l'ancien comportement : l'id est le code de l'UE. Avec un
 * intitulé, on obtient un id distinct, ce qui permet de programmer plusieurs
 * tests sur la même UE (ex. INF232-TEST-1, INF232-TEST-2).
 */
function quizIdFor(ue, title) {
  const code = String(ue || '').trim().toUpperCase();
  if (!code) return '';
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || cleanTitle.toUpperCase() === code) return code;
  const slug = slugifyQuizPart(cleanTitle);
  return slug ? `${code}-${slug}` : code;
}

/**
 * Enregistre (crée ou met à jour) un test et ses métadonnées.
 */
function upsertQuiz(id, body = {}) {
  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) || {};
  const ue = String(body.ue ?? existing.ue ?? id).trim().toUpperCase();
  const title = String(body.title ?? existing.title ?? ue).trim() || ue;

  const merged = {
    ue,
    title,
    filiere: body.filiere ?? existing.filiere ?? null,
    niveau: body.niveau ?? existing.niveau ?? null,
    faculte: normalizeFaculte(
      body.faculte || existing.faculte || facultyOfFiliere(body.filiere ?? existing.filiere)
    ),
    semestre: body.semestre ?? existing.semestre ?? null,
    timePerQuestion: body.timePerQuestion != null
      ? (Number(body.timePerQuestion) || 60)
      : (existing.timePerQuestion ?? 60),
    drawCount: body.drawCount != null
      ? Math.max(0, Number(body.drawCount) || 0)
      : (existing.drawCount ?? 0),
    launchTime: body.launchTime != null ? Number(body.launchTime) : (existing.launchTime ?? null),
    endTime: body.endTime != null ? Number(body.endTime) : (existing.endTime ?? null),
    questionCount: existing.questionCount ?? 0,
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO quizzes (id, ue, title, filiere, niveau, faculte, semestre, questionCount, timePerQuestion, drawCount, launchTime, endTime, updatedAt)
    VALUES (@id, @ue, @title, @filiere, @niveau, @faculte, @semestre, @questionCount, @timePerQuestion, @drawCount, @launchTime, @endTime, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      ue = excluded.ue, title = excluded.title, filiere = excluded.filiere,
      niveau = excluded.niveau, faculte = excluded.faculte, semestre = excluded.semestre,
      questionCount = excluded.questionCount, timePerQuestion = excluded.timePerQuestion,
      drawCount = excluded.drawCount, launchTime = excluded.launchTime,
      endTime = excluded.endTime, updatedAt = excluded.updatedAt
  `).run({ id, ...merged });

  ensureUeFromQuiz({
    code: merged.ue,
    label: body.ueLabel ?? body.label,
    filiere: merged.filiere,
    niveau: merged.niveau,
    faculte: merged.faculte,
    semestre: merged.semestre
  });

  const quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id);
  if (quiz) notifyQuizAvailable(quiz);
  if (quiz) approveRequestsForQuiz(quiz);
  return quiz;
}

/**
 * Créer un nouveau test (ou mettre à jour un test existant portant le même
 * couple UE + intitulé). C'est le point d'entrée utilisé par le panneau
 * d'administration pour programmer plusieurs tests sur une même UE.
 */
router.post('/', requireAdmin, (req, res) => {
  const body = req.body || {};
  const ue = String(body.ue || '').trim().toUpperCase();
  if (!ue) {
    return res.status(400).json({ error: "L'unité d'enseignement est obligatoire." });
  }
  const title = String(body.title || '').trim() || ue;
  const id = quizIdFor(ue, title);
  const quiz = upsertQuiz(id, { ...body, ue, title });
  res.json({ success: true, quiz });
});

/**
 * Programmer / mettre à jour un QCM par son identifiant.
 * Conservé pour les clients existants (l'id peut être un code UE).
 */
router.post('/:id', requireAdmin, (req, res) => {
  const body = req.body || {};
  const id = req.params.id;
  // Sans intitulé explicite, on garde celui déjà enregistré ou le code UE.
  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) || {};
  const quiz = upsertQuiz(id, {
    ...body,
    ue: body.ue ?? existing.ue ?? id,
    title: body.title ?? existing.title
  });
  res.json({ success: true, quiz });
});

/**
 * Duplique un test complet (métadonnées + questions).
 *
 * Le nouveau test reçoit un intitulé distinct (« … (copie) ») et donc un
 * identifiant propre, ce qui permet de préparer un second sujet sans
 * toucher au test d'origine ni aux copies déjà déposées.
 */
router.post('/:id/duplicate', requireAdmin, (req, res) => {
  const sourceId = req.params.id;
  const source = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(sourceId);
  if (!source) {
    return res.status(404).json({ error: 'Quiz introuvable.' });
  }

  const ue = String(source.ue || source.id).trim().toUpperCase();
  const requestedTitle = String(req.body?.title || '').trim();
  // Si le test source n'a pas de nom propre (titre = code UE), la copie
  // s'appelle simplement « Copie » : l'identifiant reste lisible
  // (INF232-COPIE) au lieu de répéter le code (INF232-INF232-COPIE).
  const sourceTitle = String(source.title || '').trim();
  const baseTitle = requestedTitle
    || (sourceTitle && sourceTitle.toUpperCase() !== ue
      ? `${sourceTitle} (copie)`
      : 'Copie');

  // On cherche un identifiant libre : « … (copie) », puis « … (copie 2) »…
  const quizIdExists = db.prepare('SELECT 1 FROM quizzes WHERE id = ?');
  let title = baseTitle;
  let newId = quizIdFor(ue, title);
  let suffix = 2;
  while (quizIdExists.get(newId)) {
    title = `${baseTitle} ${suffix}`;
    newId = quizIdFor(ue, title);
    suffix += 1;
    if (suffix > 100) {
      return res.status(409).json({ error: 'Impossible de générer un identifiant unique pour la copie.' });
    }
  }

  const now = Date.now();
  const launchTime = req.body?.launchTime != null
    ? Number(req.body.launchTime)
    : (source.launchTime ? source.launchTime + 7 * 24 * 60 * 60 * 1000 : null);
  const endTime = req.body?.endTime != null
    ? Number(req.body.endTime)
    : (source.endTime ? source.endTime + 7 * 24 * 60 * 60 * 1000 : null);

  const copy = db.transaction(() => {
    db.prepare(`
      INSERT INTO quizzes
        (id, ue, title, filiere, niveau, faculte, semestre, questionCount,
         timePerQuestion, drawCount, launchTime, endTime, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      ue,
      title,
      source.filiere || null,
      source.niveau || null,
      normalizeFaculte(quizFaculte(source)),
      source.semestre || null,
      source.questionCount || 0,
      source.timePerQuestion || 60,
      source.drawCount || 0,
      launchTime,
      endTime,
      new Date(now).toISOString()
    );

    const questions = db.prepare(
      'SELECT * FROM questions WHERE quizId = ? ORDER BY position ASC, id ASC'
    ).all(sourceId);
    const insert = db.prepare(`
      INSERT INTO questions
        (quizId, Question, OptA, OptB, OptC, OptD, ReponseCorrecte,
         explication, tags, difficulte, position)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    questions.forEach((q, i) => {
      insert.run(
        newId,
        q.Question,
        q.OptA || '',
        q.OptB || '',
        q.OptC || '',
        q.OptD || '',
        q.ReponseCorrecte,
        q.explication || '',
        q.tags || '',
        q.difficulte || 'moyenne',
        i
      );
    });

    return db.prepare('SELECT * FROM quizzes WHERE id = ?').get(newId);
  })();

  ensureUeFromQuiz({
    code: ue,
    label: source.title,
    filiere: copy.filiere,
    niveau: copy.niveau,
    faculte: copy.faculte,
    semestre: copy.semestre
  });

  res.status(201).json({ success: true, quiz: copy, copiedQuestions: copy.questionCount || 0 });
});

/**
 * Suppression d'un QCM.
 *
 * Les questions et sessions actives sont supprimées ; les copies déjà
 * enregistrées sont conservées (historique des notes). Pour éviter une
 * suppression accidentelle, la route refuse d'abord la suppression si des
 * copies existent : le client doit confirmer avec `?force=1`.
 */
router.delete('/:id', requireAdmin, (req, res) => {
  const id = req.params.id;
  const quiz = db.prepare('SELECT id FROM quizzes WHERE id = ?').get(id);
  if (!quiz) {
    return res.status(404).json({ error: 'Quiz introuvable.' });
  }

  const resultsCount = db.prepare(
    'SELECT COUNT(*) AS c FROM results WHERE quizId = ?'
  ).get(id).c;

  if (resultsCount > 0 && req.query.force !== '1') {
    return res.status(409).json({
      error: `Ce test possède ${resultsCount} copie(s) enregistrée(s). Confirmez la suppression.`,
      resultsCount,
      requiresConfirmation: true
    });
  }

  db.prepare('DELETE FROM questions WHERE quizId = ?').run(id);   // cascade si FK active
  db.prepare('DELETE FROM quiz_sessions WHERE quizId = ?').run(id);
  db.prepare('DELETE FROM quizzes WHERE id = ?').run(id);
  res.json({ success: true, resultsCount });
});

/**
 * Import de questions (remplace toutes les questions existantes de l'UE).
 * Reproduit handleConfirmImport : suppression puis insertion, puis fusion des métadonnées.
 */
router.post('/:id/questions', requireAdmin, (req, res) => {
  const id = req.params.id;
  const {
    questions, filiere, niveau, faculte, semestre,
    timePerQuestion, drawCount, ueLabel, label,
    ue, title, launchTime, endTime
  } = req.body || {};

  if (!Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Aucune question valide à importer.' });
  }

  // S'assurer que le quiz existe avant d'insérer les questions (clé étrangère)
  const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(id) || {};

  const cleanUe = String(ue ?? existing.ue ?? id).trim().toUpperCase();
  const merged = {
    ue: cleanUe,
    title: String(title ?? existing.title ?? '').trim() || cleanUe,
    filiere: filiere ?? existing.filiere ?? null,
    niveau: niveau ?? existing.niveau ?? null,
    faculte: normalizeFaculte(faculte || existing.faculte || facultyOfFiliere(filiere ?? existing.filiere)),
    semestre: semestre ?? existing.semestre ?? null,
    questionCount: questions.length,
    timePerQuestion: timePerQuestion != null ? Number(timePerQuestion) || 60 : existing.timePerQuestion ?? 60,
    drawCount: drawCount != null ? Math.max(0, Number(drawCount) || 0) : (existing.drawCount ?? 0),
    launchTime: launchTime != null ? Number(launchTime) : (existing.launchTime ?? null),
    endTime: endTime != null ? Number(endTime) : (existing.endTime ?? null),
    updatedAt: new Date().toISOString()
  };

  db.prepare(`
    INSERT INTO quizzes (id, ue, title, filiere, niveau, faculte, semestre, questionCount, timePerQuestion, drawCount, launchTime, endTime, updatedAt)
    VALUES (@id, @ue, @title, @filiere, @niveau, @faculte, @semestre, @questionCount, @timePerQuestion, @drawCount, @launchTime, @endTime, @updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      ue = excluded.ue, title = excluded.title, filiere = excluded.filiere, niveau = excluded.niveau,
      faculte = excluded.faculte, semestre = excluded.semestre, questionCount = excluded.questionCount,
      timePerQuestion = excluded.timePerQuestion, drawCount = excluded.drawCount,
      launchTime = excluded.launchTime, endTime = excluded.endTime,
      updatedAt = excluded.updatedAt
  `).run({
    id,
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
      // Normalisation serveur : même si un ancien client envoie une lettre,
      // un chiffre ou une réponse préfixée, on stocke le texte de l'option.
      const clean = normalizeImportedQuestion(q);
      insert.run(
        id,
        clean.Question,
        clean.OptA,
        clean.OptB,
        clean.OptC,
        clean.OptD,
        clean.ReponseCorrecte,
        clean.explication,
        clean.tags,
        clean.difficulte,
        i
      );
    });
  });
  replaceAll(questions);

  // Le catalogue UE est aligné sur l'épreuve importée (même filière/niveau)
  ensureUeFromQuiz({
    code: merged.ue,
    label: ueLabel ?? label,
    filiere: merged.filiere,
    niveau: merged.niveau,
    faculte: merged.faculte,
    semestre: merged.semestre
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
