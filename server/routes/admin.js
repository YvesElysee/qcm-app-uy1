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
import { buildRankingGroups } from '../ranking.js';
import {
  normalizeFaculte,
  filiereId,
  facultyOfFiliere,
  slugify
} from '../access.js';
import { sendFiliereAvailableEmail } from '../smtp.js';
import { notifyFiliereAvailable, createNotification } from '../notifications.js';

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
router.get('/students', requireAdmin, (req, res) => {
  const faculte = String(req.query.faculte || '').trim();
  const filiere = String(req.query.filiere || '').trim();
  const niveau = String(req.query.niveau || '').trim();
  const search = String(req.query.search || '').trim();

  let sql = 'SELECT * FROM users WHERE 1 = 1';
  const params = [];
  if (faculte) {
    sql += " AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?";
    params.push(normalizeFaculte(faculte));
  }
  if (filiere) {
    sql += ' AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))';
    params.push(filiere);
  }
  if (niveau) {
    sql += ' AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))';
    params.push(niveau);
  }
  if (search) {
    sql += ' AND (LOWER(name) LIKE ? OR LOWER(email) LIKE ?)';
    const term = `%${search.toLowerCase()}%`;
    params.push(term, term);
  }
  sql += ' ORDER BY createdAt DESC';

  const students = db.prepare(sql).all(...params);
  // passwordHash volontairement omis
  res.json({
    students: students.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      faculte: u.faculte || facultyOfFiliere(u.filiere) || 'FACSCIENCES',
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
  const ue = String(req.query.ue || '').trim();
  const faculte = String(req.query.faculte || '').trim();
  const filiere = String(req.query.filiere || '').trim();
  const niveau = String(req.query.niveau || '').trim();

  let sql = 'SELECT * FROM results WHERE 1 = 1';
  const params = [];
  if (ue) {
    sql += ' AND ue = ?';
    params.push(ue);
  }
  if (faculte) {
    sql += " AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?";
    params.push(normalizeFaculte(faculte));
  }
  if (filiere) {
    sql += ' AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))';
    params.push(filiere);
  }
  if (niveau) {
    sql += ' AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))';
    params.push(niveau);
  }
  sql += ' ORDER BY date DESC';

  const rows = db.prepare(sql).all(...params);
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
router.get('/analytics', requireAdmin, (req, res) => {
  const faculte = String(req.query.faculte || '').trim();
  const filiere = String(req.query.filiere || '').trim();
  const niveau = String(req.query.niveau || '').trim();

  let sql = 'SELECT * FROM results WHERE 1 = 1';
  const params = [];
  if (faculte) {
    sql += " AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?";
    params.push(normalizeFaculte(faculte));
  }
  if (filiere) {
    sql += ' AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))';
    params.push(filiere);
  }
  if (niveau) {
    sql += ' AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))';
    params.push(niveau);
  }
  sql += ' ORDER BY date ASC';

  const rows = db.prepare(sql).all(...params);
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

// ── Classements par salle (filière + niveau) ──────────────────────────

/**
 * Classements regroupés par épreuve, session et salle. Les filtres sont
 * facultatifs : sans filtre, l'administration obtient toutes les salles.
 */
router.get('/rankings', requireAdmin, (req, res) => {
  const ue = String(req.query.ue || '').trim();
  const faculte = String(req.query.faculte || '').trim();
  const filiere = String(req.query.filiere || '').trim();
  const niveau = String(req.query.niveau || '').trim();
  const sessionTimestamp = req.query.sessionTimestamp !== undefined
    ? Number(req.query.sessionTimestamp)
    : null;

  let sql = 'SELECT * FROM results WHERE 1 = 1';
  const params = [];
  if (ue) {
    sql += ' AND ue = ?';
    params.push(ue);
  }
  if (faculte) {
    sql += " AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?";
    params.push(normalizeFaculte(faculte));
  }
  if (filiere) {
    sql += ' AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))';
    params.push(filiere);
  }
  if (niveau) {
    sql += ' AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))';
    params.push(niveau);
  }
  if (sessionTimestamp !== null && Number.isFinite(sessionTimestamp)) {
    sql += ' AND sessionTimestamp = ?';
    params.push(sessionTimestamp);
  }

  const rows = db.prepare(sql).all(...params);
  const { groups } = buildRankingGroups(rows);
  res.json({ groups });
});

// ── Catalogue des facultés et filières ────────────────────────────────

function ensureFaculte(id, label) {
  const cleanId = normalizeFaculte(id || slugify(label).toUpperCase());
  const cleanLabel = String(label || '').trim() || cleanId;
  db.prepare(`
    INSERT INTO facultes (id, label, createdAt)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET label = excluded.label
  `).run(cleanId, cleanLabel, new Date().toISOString());
  return { id: cleanId, label: cleanLabel };
}

function addFiliere(faculte, label) {
  const cleanFaculte = normalizeFaculte(faculte);
  const cleanLabel = String(label || '').trim();
  if (!cleanLabel) return null;
  const id = filiereId(cleanFaculte, cleanLabel);
  db.prepare(`
    INSERT INTO filieres (id, label, faculte, createdAt)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING
  `).run(id, cleanLabel, cleanFaculte, new Date().toISOString());
  return { id, label: cleanLabel, faculte: cleanFaculte };
}

/**
 * Marque les demandes en attente comme approuvées, puis prévient les
 * étudiants concernés dans l'application et par email.
 */
async function resolveFiliereRequests({ faculte, filiere, status = 'approved', note = '' }) {
  const cleanFaculte = normalizeFaculte(faculte);
  const cleanFiliere = String(filiere || '').trim();
  const now = new Date().toISOString();

  const pending = db.prepare(`
    SELECT * FROM filiere_requests
    WHERE status = 'pending'
      AND UPPER(TRIM(faculte)) = UPPER(TRIM(?))
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
  `).all(cleanFaculte, cleanFiliere);

  db.prepare(`
    UPDATE filiere_requests
    SET status = ?, note = ?, handledAt = ?
    WHERE status = 'pending'
      AND UPPER(TRIM(faculte)) = UPPER(TRIM(?))
      AND LOWER(TRIM(filiere)) = LOWER(TRIM(?))
  `).run(status, note, now, cleanFaculte, cleanFiliere);

  const users = db.prepare(`
    SELECT id, name, email FROM users
    WHERE LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
  `).all(cleanFiliere, cleanFaculte);

  if (status === 'approved') {
    users.forEach((user) => {
      notifyFiliereAvailable({ userId: user.id, filiere: cleanFiliere, faculte: cleanFaculte });
    });

    // Un email par adresse demandeuse (dédoublonné)
    const emails = [...new Set(
      pending.map((r) => String(r.email || '').trim().toLowerCase()).filter(Boolean)
    )];
    await Promise.allSettled(emails.map((email) => {
      const owner = pending.find((r) => String(r.email || '').toLowerCase() === email);
      return sendFiliereAvailableEmail({
        email,
        name: owner?.name || 'Étudiant',
        filiere: cleanFiliere,
        faculte: cleanFaculte
      });
    }));
  } else {
    pending.forEach((request) => {
      if (!request.userId) return;
      createNotification({
        userId: request.userId,
        type: 'filiere_rejected',
        title: `Demande de filière « ${cleanFiliere} » examinée`,
        message: note || `Votre demande pour la filière ${cleanFiliere} n'a pas pu être acceptée. Contactez l'administration pour plus d'informations.`,
        link: '/dashboard',
        entityKey: `filiere-rejected:${request.id}`
      });
    });
  }

  return { notifiedUsers: users.length, requests: pending.length };
}

router.get('/facultes', requireAdmin, (_req, res) => {
  const facultes = db.prepare(`
    SELECT f.id, f.label, f.createdAt,
      (SELECT COUNT(*) FROM filieres fi WHERE fi.faculte = f.id) AS filiereCount,
      (SELECT COUNT(*) FROM users u
        WHERE UPPER(COALESCE(NULLIF(TRIM(u.faculte), ''), 'FACSCIENCES')) = f.id) AS studentCount
    FROM facultes f
    ORDER BY f.label ASC
  `).all();
  res.json({ facultes });
});

router.post('/facultes', requireAdmin, (req, res) => {
  const label = String(req.body?.label || '').trim();
  if (!label) {
    return res.status(400).json({ error: 'Le nom de la faculté est requis.' });
  }
  const faculte = ensureFaculte(req.body?.id, label);
  res.status(201).json({ success: true, faculte });
});

router.delete('/facultes/:id', requireAdmin, (req, res) => {
  const id = normalizeFaculte(req.params.id);
  const linked = db.prepare('SELECT COUNT(*) AS c FROM filieres WHERE faculte = ?').get(id).c;
  if (linked > 0) {
    return res.status(409).json({
      error: 'Supprimez d\'abord les filières rattachées à cette faculté.'
    });
  }
  const users = db.prepare(
    "SELECT COUNT(*) AS c FROM users WHERE UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?"
  ).get(id).c;
  if (users > 0) {
    return res.status(409).json({ error: 'Des étudiants sont encore rattachés à cette faculté.' });
  }
  db.prepare('DELETE FROM facultes WHERE id = ?').run(id);
  res.json({ success: true });
});

router.get('/filieres', requireAdmin, (req, res) => {
  const faculte = String(req.query.faculte || '').trim();
  let sql = `
    SELECT f.id, f.label, f.faculte, f.createdAt,
      (SELECT COUNT(*) FROM users u
        WHERE LOWER(TRIM(u.filiere)) = LOWER(TRIM(f.label))
          AND UPPER(COALESCE(NULLIF(TRIM(u.faculte), ''), 'FACSCIENCES')) = f.faculte) AS studentCount,
      (SELECT COUNT(*) FROM quizzes q
        WHERE LOWER(TRIM(q.filiere)) = LOWER(TRIM(f.label))
          AND UPPER(COALESCE(NULLIF(TRIM(q.faculte), ''), 'FACSCIENCES')) = f.faculte) AS quizCount
    FROM filieres f
  `;
  const params = [];
  if (faculte) {
    sql += ' WHERE f.faculte = ?';
    params.push(normalizeFaculte(faculte));
  }
  sql += ' ORDER BY f.faculte ASC, f.label ASC';

  res.json({ filieres: db.prepare(sql).all(...params) });
});

router.post('/filieres', requireAdmin, async (req, res) => {
  const label = String(req.body?.label || '').trim();
  const faculte = normalizeFaculte(req.body?.faculte);
  if (!label) {
    return res.status(400).json({ error: 'Le nom de la filière est requis.' });
  }
  ensureFaculte(faculte, faculte);
  const filiere = addFiliere(faculte, label);
  const resolved = await resolveFiliereRequests({ faculte, filiere: label });
  res.status(201).json({ success: true, filiere, ...resolved });
});

router.delete('/filieres/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM filieres WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Filière introuvable.' });
  }
  const users = db.prepare(
    'SELECT COUNT(*) AS c FROM users WHERE LOWER(TRIM(filiere)) = LOWER(TRIM(?))'
  ).get(row.label).c;
  if (users > 0) {
    return res.status(409).json({ error: 'Des étudiants sont encore inscrits dans cette filière.' });
  }
  db.prepare('DELETE FROM filieres WHERE id = ?').run(row.id);
  res.json({ success: true });
});

router.get('/filiere-requests', requireAdmin, (req, res) => {
  const status = String(req.query.status || '').trim();
  let sql = 'SELECT * FROM filiere_requests';
  const params = [];
  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }
  sql += " ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, createdAt DESC, id DESC";
  res.json({ requests: db.prepare(sql).all(...params) });
});

router.post('/filiere-requests/:id/approve', requireAdmin, async (req, res) => {
  const request = db.prepare('SELECT * FROM filiere_requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Demande introuvable.' });
  }

  const faculte = normalizeFaculte(req.body?.faculte || request.faculte);
  const filiereLabel = String(req.body?.filiere || request.filiere || '').trim();
  if (!filiereLabel) {
    return res.status(400).json({ error: 'Filière manquante.' });
  }

  ensureFaculte(faculte, faculte);
  const filiere = addFiliere(faculte, filiereLabel);

  // Aligne les comptes concernés sur la faculté validée
  db.prepare(`
    UPDATE users SET faculte = ?
    WHERE LOWER(TRIM(filiere)) = LOWER(TRIM(?))
  `).run(faculte, filiereLabel);

  const result = await resolveFiliereRequests({
    faculte,
    filiere: filiereLabel,
    status: 'approved',
    note: String(req.body?.note || '').trim()
  });

  res.json({ success: true, filiere, ...result });
});

router.post('/filiere-requests/:id/reject', requireAdmin, async (req, res) => {
  const request = db.prepare('SELECT * FROM filiere_requests WHERE id = ?').get(req.params.id);
  if (!request) {
    return res.status(404).json({ error: 'Demande introuvable.' });
  }
  const note = String(req.body?.note || '').trim().slice(0, 500);
  const now = new Date().toISOString();
  db.prepare('UPDATE filiere_requests SET status = ?, note = ?, handledAt = ? WHERE id = ?')
    .run('rejected', note, now, request.id);

  if (request.userId) {
    createNotification({
      userId: request.userId,
      type: 'filiere_rejected',
      title: `Demande de filière « ${request.filiere} » examinée`,
      message: note || `Votre demande pour la filière ${request.filiere} n'a pas pu être acceptée.`,
      link: '/dashboard',
      entityKey: `filiere-rejected:${request.id}`
    });
  }

  res.json({ success: true });
});

// ── Tableau de bord du tuteur IA (requêtes et tokens) ─────────────────

function aiMonthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function aiDaysAgoIso(days) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - Math.max(0, days));
  return d.toISOString();
}

function aiDayStartIso() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function aiTokenBudget() {
  const value = Number.parseInt(process.env.AI_TOKEN_BUDGET || '', 10);
  if (!Number.isFinite(value)) return 1000000;
  return Math.max(0, value);
}

function aiStatsSince(sinceIso) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS requests,
      COALESCE(SUM(totalTokens), 0) AS tokens,
      COALESCE(SUM(promptTokens), 0) AS promptTokens,
      COALESCE(SUM(completionTokens), 0) AS completionTokens,
      COALESCE(SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END), 0) AS ok,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS errors,
      COALESCE(SUM(CASE WHEN status = 'quota' THEN 1 ELSE 0 END), 0) AS quotaBlocked
    FROM ai_requests
    WHERE createdAt >= ?
  `).get(sinceIso);

  return {
    requests: Number(row?.requests) || 0,
    tokens: Number(row?.tokens) || 0,
    promptTokens: Number(row?.promptTokens) || 0,
    completionTokens: Number(row?.completionTokens) || 0,
    ok: Number(row?.ok) || 0,
    errors: Number(row?.errors) || 0,
    quotaBlocked: Number(row?.quotaBlocked) || 0
  };
}

/**
 * Tableau de bord IA : nombre de requêtes, consommation réelle de tokens
 * annoncée par les fournisseurs, et budget mensuel restant.
 */
router.get('/ai-usage', requireAdmin, (_req, res) => {
  const monthStart = aiMonthStartIso();
  const month = aiStatsSince(monthStart);
  const budget = aiTokenBudget();
  const remainingTokens = budget > 0 ? Math.max(0, budget - month.tokens) : null;
  const usedPercent = budget > 0
    ? Math.min(100, Math.round((month.tokens / budget) * 100))
    : null;

  const byDay = db.prepare(`
    SELECT
      substr(createdAt, 1, 10) AS date,
      COUNT(*) AS requests,
      COALESCE(SUM(totalTokens), 0) AS tokens
    FROM ai_requests
    WHERE createdAt >= ?
    GROUP BY date
    ORDER BY date ASC
  `).all(aiDaysAgoIso(29)).map((d) => ({
    date: d.date,
    requests: Number(d.requests) || 0,
    tokens: Number(d.tokens) || 0
  }));

  const recent = db.prepare(`
    SELECT
      r.id,
      r.contextKey,
      r.status,
      r.totalTokens,
      r.createdAt,
      COALESCE(u.name, r.userId) AS name,
      u.email
    FROM ai_requests r
    LEFT JOIN users u ON u.id = r.userId
    ORDER BY r.createdAt DESC
    LIMIT 60
  `).all().map((r) => ({
    id: r.id,
    contextKey: r.contextKey,
    status: r.status,
    tokens: Number(r.totalTokens) || 0,
    createdAt: r.createdAt,
    name: r.name || 'Étudiant',
    email: r.email || ''
  }));

  const topUsers = db.prepare(`
    SELECT
      COALESCE(u.name, r.userId) AS name,
      u.email,
      COUNT(*) AS requests,
      COALESCE(SUM(r.totalTokens), 0) AS tokens
    FROM ai_requests r
    LEFT JOIN users u ON u.id = r.userId
    WHERE r.createdAt >= ?
    GROUP BY r.userId
    ORDER BY tokens DESC, requests DESC
    LIMIT 10
  `).all(monthStart).map((u) => ({
    name: u.name || 'Étudiant',
    email: u.email || '',
    requests: Number(u.requests) || 0,
    tokens: Number(u.tokens) || 0
  }));

  const topContexts = db.prepare(`
    SELECT
      contextKey,
      COUNT(*) AS requests,
      COALESCE(SUM(totalTokens), 0) AS tokens
    FROM ai_requests
    WHERE createdAt >= ? AND contextKey IS NOT NULL
    GROUP BY contextKey
    ORDER BY tokens DESC, requests DESC
    LIMIT 8
  `).all(monthStart).map((c) => ({
    contextKey: c.contextKey,
    requests: Number(c.requests) || 0,
    tokens: Number(c.tokens) || 0
  }));

  res.json({
    generatedAt: new Date().toISOString(),
    budget: {
      monthlyTokens: budget,
      monthStart,
      usedTokens: month.tokens,
      remainingTokens,
      usedPercent
    },
    totals: aiStatsSince('1970-01-01T00:00:00.000Z'),
    today: aiStatsSince(aiDayStartIso()),
    week: aiStatsSince(aiDaysAgoIso(6)),
    month,
    byDay,
    recent,
    topUsers,
    topContexts
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
