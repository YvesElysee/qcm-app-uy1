/**
 * Demandes de QCM · /api/quiz-requests
 *
 * Un étudiant peut réclamer une épreuve absente pour son parcours exact
 * (faculté + filière + niveau + UE). Les demandes forment une pétition :
 * tant qu'elles sont moins de `QUIZ_REQUEST_THRESHOLD` (10 par défaut), le
 * demandeur est invité à partager son lien de parrainage. Au seuil atteint,
 * le groupe passe en « validée » et l'administration peut programmer l'épreuve.
 *
 * L'administration dispose d'un routeur séparé (`adminRouter`), monté sous
 * `/api/admin/quiz-requests`.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin, requireStudent } from '../auth.js';
import { normalizeFaculte, facultyOfFiliere, studentFaculte } from '../access.js';
import { createNotification } from '../notifications.js';
import { ensureReferralCode, privilegesOf } from '../referrals.js';

const router = Router();
const adminRouter = Router();

const DEFAULT_THRESHOLD = 10;

export function requestThreshold() {
  const raw = Number.parseInt(process.env.QUIZ_REQUEST_THRESHOLD, 10);
  if (!Number.isFinite(raw) || raw < 1) return DEFAULT_THRESHOLD;
  return raw;
}

function cleanText(value) {
  return String(value || '').trim();
}

function requestScope(user) {
  return {
    faculte: studentFaculte(user),
    filiere: cleanText(user.filiere),
    niveau: cleanText(user.niveau)
  };
}

function toRequest(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    name: row.name || '',
    email: row.email || '',
    faculte: row.faculte,
    filiere: row.filiere,
    niveau: row.niveau,
    ue: row.ue,
    ueLabel: row.ueLabel || '',
    message: row.message || '',
    status: row.status,
    note: row.note || '',
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

/**
 * Nombre de demandes actives (en attente ou validées) pour un groupe.
 */
function groupCount({ faculte, filiere, niveau, ue }) {
  return db.prepare(`
    SELECT COUNT(*) AS c FROM quiz_requests
    WHERE status IN ('pending', 'validated')
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
      AND LOWER(TRIM(ue)) = LOWER(TRIM(?))
  `).get(
    normalizeFaculte(faculte),
    cleanText(filiere),
    cleanText(niveau),
    cleanText(ue)
  ).c;
}

function progressOf(scope) {
  const threshold = requestThreshold();
  const count = groupCount(scope);
  const validated = count >= threshold;
  return {
    threshold,
    count,
    remaining: Math.max(0, threshold - count),
    percent: Math.min(100, Math.round((count / threshold) * 100)),
    validated
  };
}

/**
 * Le QCM existe-t-il déjà (avec questions et date d'ouverture) pour ce parcours ?
 */
function quizAvailable({ faculte, filiere, niveau, ue }) {
  return !!db.prepare(`
    SELECT id FROM quizzes
    WHERE LOWER(TRIM(ue)) = LOWER(TRIM(?))
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
      AND questionCount > 0
      AND launchTime IS NOT NULL
    LIMIT 1
  `).get(
    cleanText(ue),
    cleanText(filiere),
    cleanText(niveau),
    normalizeFaculte(faculte)
  );
}

function referralPayload(user) {
  const code = ensureReferralCode(user);
  return {
    code,
    path: code ? `/register?ref=${encodeURIComponent(code)}` : '',
    privileges: privilegesOf(user.id)
  };
}

function notifyValidated(scope, ueLabel) {
  const recipients = db.prepare(`
    SELECT DISTINCT userId FROM quiz_requests
    WHERE status = 'validated'
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
      AND LOWER(TRIM(ue)) = LOWER(TRIM(?))
  `).all(
    normalizeFaculte(scope.faculte),
    cleanText(scope.filiere),
    cleanText(scope.niveau),
    cleanText(scope.ue)
  );

  const entityKey = `quiz_request_validated:${normalizeFaculte(scope.faculte)}:${cleanText(scope.filiere)}:${cleanText(scope.niveau)}:${cleanText(scope.ue)}`;
  recipients.forEach(({ userId }) => {
    createNotification({
      userId,
      type: 'quiz_request_validated',
      title: `Demande validée : ${scope.ue}`,
      message: `Votre demande de QCM ${ueLabel || scope.ue} (${scope.filiere} · ${scope.niveau}) a atteint le seuil. L'administration peut désormais programmer l'épreuve.`,
      link: '/dashboard',
      entityKey: `${entityKey}:${userId}`
    });
  });
}

/**
 * Promeut les demandes d'un groupe en « validée » dès que le seuil est atteint.
 */
function promoteIfThreshold(scope, ueLabel = '') {
  const threshold = requestThreshold();
  const count = groupCount(scope);
  if (count < threshold) return false;

  const info = db.prepare(`
    UPDATE quiz_requests
    SET status = 'validated', updatedAt = ?
    WHERE status = 'pending'
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
      AND LOWER(TRIM(ue)) = LOWER(TRIM(?))
  `).run(
    new Date().toISOString(),
    normalizeFaculte(scope.faculte),
    cleanText(scope.filiere),
    cleanText(scope.niveau),
    cleanText(scope.ue)
  );

  if (info.changes > 0) notifyValidated(scope, ueLabel);
  return info.changes > 0;
}

// ── Espace étudiant ──────────────────────────────────────────────────

/**
 * Créer une demande pour une UE de son parcours.
 */
router.post('/', requireStudent, (req, res) => {
  const ue = cleanText(req.body?.ue);
  const ueLabel = cleanText(req.body?.ueLabel);
  const message = cleanText(req.body?.message).slice(0, 600);
  const scope = requestScope(req.user);

  if (!ue) {
    return res.status(400).json({ error: "Précisez l'UE concernée par votre demande." });
  }
  if (!scope.filiere || !scope.niveau) {
    return res.status(400).json({ error: 'Votre parcours est incomplet. Contactez l\'administration.' });
  }

  if (quizAvailable({ ...scope, ue })) {
    return res.status(409).json({
      error: 'Cette épreuve est déjà programmée pour votre parcours.',
      code: 'quiz_available'
    });
  }

  const existing = db.prepare(`
    SELECT * FROM quiz_requests
    WHERE userId = ?
      AND status IN ('pending', 'validated')
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
      AND LOWER(TRIM(ue)) = LOWER(TRIM(?))
    LIMIT 1
  `).get(
    req.user.id,
    scope.faculte,
    scope.filiere,
    scope.niveau,
    ue
  );

  if (existing) {
    return res.json({
      request: toRequest(existing),
      alreadyExists: true,
      progress: progressOf({ ...scope, ue }),
      referral: referralPayload(req.user)
    });
  }

  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO quiz_requests
      (userId, name, email, faculte, filiere, niveau, ue, ueLabel, message, status, note, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', '', ?, ?)
  `).run(
    req.user.id,
    req.user.name || '',
    req.user.email || '',
    scope.faculte,
    scope.filiere,
    scope.niveau,
    ue,
    ueLabel,
    message,
    now,
    now
  );

  promoteIfThreshold({ ...scope, ue }, ueLabel);

  const request = db.prepare('SELECT * FROM quiz_requests WHERE id = ?').get(info.lastInsertRowid);
  const progress = progressOf({ ...scope, ue });

  res.status(201).json({
    request: toRequest(request),
    progress,
    needsInvites: !progress.validated,
    referral: referralPayload(req.user),
    message: progress.validated
      ? 'Votre demande a atteint le seuil : elle est transmise à l\'administration.'
      : `Encore ${progress.remaining} demande(s) pour que cette épreuve soit validée. Invitez vos camarades avec votre lien de parrainage.`
  });
});

/**
 * Mes demandes + progression + lien de parrainage.
 */
router.get('/mine', requireStudent, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM quiz_requests
    WHERE userId = ?
    ORDER BY createdAt DESC, id DESC
    LIMIT 100
  `).all(req.user.id);

  const requests = rows.map((row) => ({
    ...toRequest(row),
    progress: progressOf(row)
  }));

  res.json({
    requests,
    threshold: requestThreshold(),
    referral: referralPayload(req.user)
  });
});

/**
 * Progression d'un groupe précis (utilisée par le tableau de bord).
 */
router.get('/progress', requireStudent, (req, res) => {
  const ue = cleanText(req.query.ue);
  if (!ue) return res.status(400).json({ error: 'UE manquante.' });
  const scope = { ...requestScope(req.user), ue };
  res.json({ progress: progressOf(scope) });
});

// ── Administration ───────────────────────────────────────────────────

adminRouter.get('/', requireAdmin, (req, res) => {
  const faculte = cleanText(req.query.faculte);
  const filiere = cleanText(req.query.filiere);
  const niveau = cleanText(req.query.niveau);
  const status = cleanText(req.query.status);

  const where = [];
  const params = [];
  if (faculte) {
    where.push("UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?");
    params.push(normalizeFaculte(faculte));
  }
  if (filiere) {
    where.push('LOWER(TRIM(filiere)) = LOWER(TRIM(?))');
    params.push(filiere);
  }
  if (niveau) {
    where.push('LOWER(TRIM(niveau)) = LOWER(TRIM(?))');
    params.push(niveau);
  }
  if (status) {
    where.push('LOWER(TRIM(status)) = LOWER(TRIM(?))');
    params.push(status);
  }

  const rows = db.prepare(`
    SELECT * FROM quiz_requests
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY createdAt DESC, id DESC
    LIMIT 400
  `).all(...params);

  // Les groupes affichés sont ceux encore actionnables (en attente / validés).
  const groupWhere = ["status IN ('pending', 'validated')"];
  const groupParams = [];
  if (faculte) {
    groupWhere.push("UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?");
    groupParams.push(normalizeFaculte(faculte));
  }
  if (filiere) {
    groupWhere.push('LOWER(TRIM(filiere)) = LOWER(TRIM(?))');
    groupParams.push(filiere);
  }
  if (niveau) {
    groupWhere.push('LOWER(TRIM(niveau)) = LOWER(TRIM(?))');
    groupParams.push(niveau);
  }
  const groups = db.prepare(`
    SELECT
      MIN(id) AS id,
      faculte, filiere, niveau, ue,
      MAX(ueLabel) AS ueLabel,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'validated' THEN 1 ELSE 0 END) AS validated,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      MIN(createdAt) AS createdAt,
      MAX(updatedAt) AS updatedAt
    FROM quiz_requests
    WHERE ${groupWhere.join(' AND ')}
    GROUP BY faculte, filiere, niveau, ue
    ORDER BY createdAt ASC
    LIMIT 300
  `).all(...groupParams);

  const threshold = requestThreshold();
  res.json({
    requests: rows.map(toRequest),
    groups: groups.map((g) => ({
      ...g,
      threshold,
      remaining: Math.max(0, threshold - Number(g.total || 0)),
      percent: Math.min(100, Math.round((Number(g.total || 0) / threshold) * 100)),
      reachable: Number(g.total || 0) >= threshold
    })),
    threshold
  });
});

function groupOfRequest(row) {
  return {
    faculte: row.faculte,
    filiere: row.filiere,
    niveau: row.niveau,
    ue: row.ue
  };
}

function updateGroupStatus(row, status, note = '') {
  const scope = groupOfRequest(row);
  const info = db.prepare(`
    UPDATE quiz_requests
    SET status = ?, note = ?, updatedAt = ?
    WHERE status IN ('pending', 'validated')
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
      AND LOWER(TRIM(ue)) = LOWER(TRIM(?))
  `).run(
    status,
    note,
    new Date().toISOString(),
    normalizeFaculte(scope.faculte),
    cleanText(scope.filiere),
    cleanText(scope.niveau),
    cleanText(scope.ue)
  );

  if (info.changes > 0) {
    const recipients = db.prepare(`
      SELECT DISTINCT userId FROM quiz_requests
      WHERE status = ?
        AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
        AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
        AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
        AND LOWER(TRIM(ue)) = LOWER(TRIM(?))
    `).all(
      status,
      normalizeFaculte(scope.faculte),
      cleanText(scope.filiere),
      cleanText(scope.niveau),
      cleanText(scope.ue)
    );

    const approved = status === 'approved';
    recipients.forEach(({ userId }) => {
      createNotification({
        userId,
        type: approved ? 'quiz_request_approved' : 'quiz_request_rejected',
        title: approved
          ? `Demande acceptée : ${scope.ue}`
          : `Demande non retenue : ${scope.ue}`,
        message: approved
          ? `L'administration a accepté la demande de QCM ${scope.ue} (${scope.filiere} · ${scope.niveau}). L'épreuve sera programmée prochainement.`
          : (note || `La demande de QCM ${scope.ue} (${scope.filiere} · ${scope.niveau}) n'a pas été retenue.`),
        link: '/dashboard',
        entityKey: `quiz_request_${status}:${normalizeFaculte(scope.faculte)}:${cleanText(scope.filiere)}:${cleanText(scope.niveau)}:${cleanText(scope.ue)}:${userId}`
      });
    });
  }

  return info.changes;
}

adminRouter.post('/:id/approve', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM quiz_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Demande introuvable.' });

  const note = cleanText(req.body?.note).slice(0, 600);
  const changes = updateGroupStatus(row, 'approved', note);
  res.json({ success: true, updated: changes });
});

adminRouter.post('/:id/reject', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM quiz_requests WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Demande introuvable.' });

  const note = cleanText(req.body?.note).slice(0, 600);
  const changes = updateGroupStatus(row, 'rejected', note);
  res.json({ success: true, updated: changes });
});

/**
 * Appelé lorsqu'une épreuve est programmée/importée : les demandes du groupe
 * passent automatiquement en « approuvée » (l'épreuve existe désormais).
 */
export function approveRequestsForQuiz(quiz) {
  if (!quiz) return 0;
  if (!Number(quiz.questionCount) || !quiz.launchTime) return 0;

  const faculte = normalizeFaculte(
    quiz.faculte || facultyOfFiliere(quiz.filiere) || 'FACSCIENCES'
  );
  const ue = cleanText(quiz.ue || quiz.id);
  if (!ue) return 0;

  const row = {
    faculte,
    filiere: cleanText(quiz.filiere),
    niveau: cleanText(quiz.niveau),
    ue
  };
  if (!row.filiere || !row.niveau) return 0;
  return updateGroupStatus(row, 'approved', 'Épreuve programmée par l’administration.');
}

export { adminRouter };
export default router;
