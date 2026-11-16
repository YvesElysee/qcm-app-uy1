/**
 * Générateur d'exercices assisté par IA · /api/exercises
 *
 * Fonctionnalité réservée aux étudiants de la filière Mathématiques, niveaux
 * L1, L2, L3 et M1. L'étudiant dépose ses propres documents de cours, choisit
 * un type d'exercice (QCM, QRO, calcul, vrai/faux, mixte) et l'IA produit des
 * exercices strictement fondés sur ces documents.
 *
 * Sécurité :
 * - chaque document et chaque génération est rattaché à l'étudiant courant ;
 * - les fichiers restent hors du dossier public ;
 * - les clés et modèles IA restent côté serveur ;
 * - le budget mensuel de tokens est partagé avec le générateur de QCM admin.
 */
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from '../db.js';
import { requireStudent } from '../auth.js';
import { getConfig, generateReply, logAiRequest } from './ai.js';
import { extractText } from '../textExtract.js';

const router = Router();

const EXERCISE_DIR = path.join(DATA_DIR, 'student-documents');
fs.mkdirSync(EXERCISE_DIR, { recursive: true });

const MAX_DOC_BYTES = 25 * 1024 * 1024;
const MAX_EXERCISES = 12;
const MAX_CONTEXT_CHARS = 60000;

const ALLOWED_LEVELS = new Set(['L1', 'L2', 'L3', 'M1']);
const EXERCISE_TYPES = new Set(['qcm', 'qro', 'calcul', 'vrai_faux', 'mixte', 'autre']);
const TYPE_LABELS = {
  qcm: 'QCM (question à choix multiple)',
  qro: 'QRO (question à réponse ouverte rédigée)',
  calcul: 'exercice de calcul avec étapes',
  vrai_faux: 'vrai ou faux justifié',
  mixte: 'série mixte (QCM, QRO et calcul)',
  autre: 'exercice libre (démonstration, modélisation, problème)'
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES, files: 1 }
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Document trop volumineux (25 Mo maximum).' });
    }
    return res.status(400).json({ error: 'Téléversement invalide.' });
  });
}

function monthStartIso() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

function monthlyTokens() {
  const row = db.prepare(
    'SELECT COALESCE(SUM(totalTokens), 0) AS tokens FROM ai_requests WHERE createdAt >= ?'
  ).get(monthStartIso());
  return Number(row?.tokens) || 0;
}

function normalizeLevel(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
}

function isMathematics(filiere) {
  const normalized = String(filiere || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /math/.test(normalized);
}

/**
 * Motif d'indisponibilité (ou null si la fonctionnalité est ouverte).
 */
function accessError(user) {
  if (!user) return 'Connexion requise.';
  if (!isMathematics(user.filiere)) {
    return "Le générateur d'exercices est réservé à la filière Mathématiques.";
  }
  if (!ALLOWED_LEVELS.has(normalizeLevel(user.niveau))) {
    return "Le générateur d'exercices est ouvert aux niveaux L1, L2, L3 et M1 de Mathématiques.";
  }
  return null;
}

function extractJson(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try {
        return JSON.parse(candidate.slice(first, last + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function cleanText(value, max) {
  const text = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
  return typeof text === 'string' ? text.trim().slice(0, max) : '';
}

function normalizeOptions(raw) {
  let source = raw?.options ?? raw?.Options ?? raw?.choix ?? raw?.propositions;

  // Certains modèles numérotent directement A/B/C/D à la racine.
  if (!source && raw && typeof raw === 'object' && (raw.A || raw.OptA)) {
    source = ['A', 'B', 'C', 'D'].map((label) => ({
      label,
      text: raw[label] || raw[`Opt${label}`] || ''
    }));
  }
  if (!Array.isArray(source)) return [];

  return source
    .slice(0, 6)
    .map((item, index) => {
      if (typeof item === 'string') {
        return { label: String.fromCharCode(65 + index), text: item.trim() };
      }
      const label = String(item?.label || item?.lettre || item?.key || String.fromCharCode(65 + index))
        .trim()
        .toUpperCase()
        .slice(0, 2);
      const text = cleanText(item?.text ?? item?.texte ?? item?.value ?? item?.contenu, 1200);
      return { label, text };
    })
    .filter((option) => option.text);
}

function normalizeSteps(raw) {
  const source = raw?.etapes ?? raw?.steps ?? raw?.Etapes ?? raw?.demarche;
  if (!Array.isArray(source)) return [];
  return source.map((step) => cleanText(step, 1200)).filter(Boolean).slice(0, 12);
}

function normalizeType(raw, fallback) {
  const normalized = String(raw?.type || raw?.Type || fallback || 'mixte')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (normalized === 'qcm' || normalized === 'qro' || normalized === 'calcul') return normalized;
  if (normalized === 'vrai_faux' || normalized === 'vraifaux') return 'vrai_faux';
  if (normalized === 'mixte' || normalized === 'mix') return 'mixte';
  return 'autre';
}

function normalizeExercise(raw, fallbackType) {
  if (!raw || typeof raw !== 'object') return null;
  const enonce = cleanText(
    raw.enonce || raw.Enonce || raw.question || raw.Question || raw.intitule || raw.statement,
    4000
  );
  if (!enonce) return null;

  const type = normalizeType(raw, fallbackType);
  const options = normalizeOptions(raw);
  if ((type === 'qcm' || type === 'vrai_faux') && options.length < 2) return null;

  const reponse = cleanText(
    raw.reponse ?? raw.Reponse ?? raw.answer ?? raw.solution ?? raw.ReponseCorrecte ?? '',
    4000
  );
  const explication = cleanText(
    raw.explication || raw.Explication || raw.explanation || raw.justification ||
    raw.correction || raw.commentaire || '',
    4000
  );

  return {
    type,
    enonce,
    options,
    reponse: reponse || (type === 'qcm' ? '' : 'Voir la correction détaillée.'),
    explication,
    etapes: normalizeSteps(raw),
    difficulte: ['facile', 'moyenne', 'difficile'].includes(
      String(raw.difficulte || raw.Difficulte || 'moyenne').toLowerCase()
    )
      ? String(raw.difficulte || raw.Difficulte).toLowerCase()
      : 'moyenne'
  };
}

// ── Accès à la fonctionnalité ────────────────────────────────────────
router.get('/access', requireStudent, (req, res) => {
  const reason = accessError(req.user);
  res.json({
    allowed: !reason,
    reason,
    filiere: req.user.filiere || '',
    niveau: normalizeLevel(req.user.niveau),
    levels: [...ALLOWED_LEVELS],
    types: Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }))
  });
});

// ── Documents personnels ─────────────────────────────────────────────
router.get('/documents', requireStudent, (req, res) => {
  const reason = accessError(req.user);
  if (reason) return res.status(403).json({ error: reason });

  const documents = db.prepare(`
    SELECT id, originalName, mimeType, size, charCount, createdAt
    FROM student_documents
    WHERE userId = ?
    ORDER BY createdAt DESC, id DESC
    LIMIT 200
  `).all(req.user.id);
  res.json({ documents });
});

router.post('/documents', requireStudent, uploadSingle, async (req, res) => {
  const reason = accessError(req.user);
  if (reason) return res.status(403).json({ error: reason });
  if (!req.file || !req.file.buffer?.length) {
    return res.status(400).json({ error: 'Veuillez sélectionner un document.' });
  }

  const rawName = path.basename(String(req.file.originalname || 'document'));
  const decodedName = Buffer.from(rawName, 'latin1').toString('utf8');
  const originalName = (decodedName.includes('\uFFFD') ? rawName : decodedName).slice(0, 255);
  const ext = path.extname(originalName).replace('.', '').toLowerCase() || 'bin';

  let extracted;
  try {
    extracted = await extractText({
      buffer: req.file.buffer,
      filename: originalName,
      mimetype: req.file.mimetype
    });
  } catch (err) {
    console.warn('[exercises] Extraction impossible :', err.message);
    return res.status(400).json({ error: err.message || "Impossible d'extraire le texte de ce document." });
  }

  const storedName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(EXERCISE_DIR, storedName);
  fs.writeFileSync(fullPath, req.file.buffer);

  try {
    const info = db.prepare(`
      INSERT INTO student_documents
        (userId, originalName, storedName, mimeType, size, charCount, textContent, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      originalName,
      storedName,
      String(req.file.mimetype || '').slice(0, 120),
      Number(req.file.size) || req.file.buffer.length,
      extracted.text.length,
      extracted.text.slice(0, 400000),
      new Date().toISOString()
    );

    res.status(201).json({
      success: true,
      document: {
        id: Number(info.lastInsertRowid),
        originalName,
        charCount: extracted.text.length,
        method: extracted.method,
        warning: extracted.warning
      }
    });
  } catch (err) {
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
    console.error('[exercises] Document non enregistré :', err);
    res.status(500).json({ error: "Impossible d'enregistrer le document." });
  }
});

router.delete('/documents/:id', requireStudent, (req, res) => {
  const reason = accessError(req.user);
  if (reason) return res.status(403).json({ error: reason });

  const row = db.prepare(
    'SELECT * FROM student_documents WHERE id = ? AND userId = ?'
  ).get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Document introuvable.' });

  const fullPath = path.join(EXERCISE_DIR, path.basename(row.storedName || ''));
  try { fs.unlinkSync(fullPath); } catch { /* déjà absent */ }
  db.prepare('DELETE FROM student_documents WHERE id = ?').run(row.id);
  res.json({ success: true });
});

// ── Génération d'exercices ───────────────────────────────────────────
router.post('/generate', requireStudent, async (req, res) => {
  const reason = accessError(req.user);
  if (reason) return res.status(403).json({ error: reason });

  const cfg = getConfig();
  if (cfg.groqKeys.length + cfg.geminiKeys.length === 0) {
    return res.status(503).json({
      error: "L'IA n'est pas encore configurée sur le serveur. Réessayez plus tard."
    });
  }

  const usedTokens = monthlyTokens();
  if (cfg.tokenBudget > 0 && usedTokens >= cfg.tokenBudget) {
    return res.status(429).json({
      error: 'Le budget mensuel de génération IA est épuisé. Réessayez le mois prochain.'
    });
  }

  const requestedType = String(req.body?.type || 'mixte').trim().toLowerCase();
  const type = EXERCISE_TYPES.has(requestedType) ? requestedType : 'mixte';
  const count = Math.min(MAX_EXERCISES, Math.max(1, Number.parseInt(req.body?.count, 10) || 5));
  const prompt = cleanText(req.body?.prompt, 4000);
  const difficulte = ['facile', 'moyenne', 'difficile'].includes(req.body?.difficulte)
    ? req.body.difficulte
    : 'moyenne';

  const ids = Array.isArray(req.body?.documentIds)
    ? req.body.documentIds.map((id) => Number(id)).filter(Number.isFinite)
    : [];

  let documents;
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    documents = db.prepare(`
      SELECT id, originalName, textContent
      FROM student_documents
      WHERE userId = ? AND id IN (${placeholders})
      ORDER BY id ASC
    `).all(req.user.id, ...ids);
  } else {
    documents = db.prepare(`
      SELECT id, originalName, textContent
      FROM student_documents
      WHERE userId = ?
      ORDER BY createdAt DESC, id DESC
      LIMIT 5
    `).all(req.user.id);
  }

  if (documents.length === 0) {
    return res.status(400).json({
      error: 'Déposez au moins un document de cours pour générer des exercices.'
    });
  }

  let remaining = MAX_CONTEXT_CHARS;
  const context = documents.map((doc) => {
    const available = Math.max(0, remaining);
    const excerpt = String(doc.textContent || '').slice(0, available);
    remaining -= excerpt.length;
    return excerpt
      ? `\n\n=== Document : ${doc.originalName} ===\n${excerpt}`
      : '';
  }).join('');

  const typeInstruction = type === 'mixte'
    ? 'Alterne les formats : au moins un QCM, un QRO et un exercice de calcul.'
    : `Tous les exercices doivent être du type : ${TYPE_LABELS[type]}.`;

  const system = [
    'Tu es un professeur de mathématiques expérimenté qui prépare des exercices pour ses étudiants.',
    'Tu rédiges en français, avec une rigueur mathématique irréprochable et sans aucune ambiguïté.',
    'Tu t’appuies STRICTEMENT sur les documents de référence fournis : n’invente aucune notion, aucune donnée et aucun résultat absent du cours.',
    '',
    'Règles de fond :',
    `1. ${typeInstruction}`,
    '2. Énoncés clairs, autonomes et progressifs ; les notations mathématiques sont en texte simple (pas de LaTeX brut illisible).',
    '3. Chaque exercice DOIT comporter une réponse ou correction exacte, puis une explication pédagogique.',
    '4. Pour un QCM : exactement 4 options A, B, C, D, une seule bonne réponse, distracteurs crédibles.',
    '5. Pour un calcul : indique les étapes clés du raisonnement et le résultat final.',
    '6. Pour un QRO ou un exercice libre : fournis un corrigé modèle détaillé.',
    '7. Aucun doublon, aucun exercice hors sujet, aucune question piège sans intérêt pédagogique.',
    `8. Difficulté demandée : ${difficulte}.`,
    '9. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown.',
    '',
    'Schéma attendu :',
    '{"exercises":[{"type":"qcm|qro|calcul|vrai_faux|autre","enonce":"...","options":[{"label":"A","text":"..."}],"reponse":"...","explication":"...","etapes":["..."],"difficulte":"facile|moyenne|difficile"}]}',
    'Le champ "options" n’est rempli que pour les QCM et vrai/faux. Pour les autres types, laisse-le vide.',
    'Pour un QCM, "reponse" contient la lettre de la bonne réponse (A, B, C ou D).'
  ].join('\n');

  const userMessage = [
    `Génère ${count} exercice(s) de mathématiques.`,
    `Filière : ${req.user.filiere || 'Mathématiques'} · Niveau : ${normalizeLevel(req.user.niveau)}.`,
    prompt ? `Consignes de l'étudiant : ${prompt}` : '',
    `Documents de référence :${context}`
  ].filter(Boolean).join('\n\n');

  try {
    const result = await generateReply({
      system,
      messages: [{ role: 'user', content: userMessage }],
      cfg,
      maxTokens: Math.min(9000, 1400 + count * 420),
      temperature: 0.3,
      json: true
    });

    logAiRequest({
      userId: req.user.id,
      contextKey: 'student-exercises',
      status: 'ok',
      provider: result.provider,
      model: result.model,
      usage: result.usage
    });

    const parsed = extractJson(result.text);
    const rawExercises = Array.isArray(parsed?.exercises)
      ? parsed.exercises
      : (Array.isArray(parsed) ? parsed : []);

    const seen = new Set();
    const exercises = [];
    rawExercises.forEach((raw) => {
      const exercise = normalizeExercise(raw, type);
      if (!exercise) return;
      const key = exercise.enonce
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
      if (!key || seen.has(key)) return;
      seen.add(key);
      exercises.push(exercise);
    });

    if (exercises.length === 0) {
      return res.status(502).json({
        error: "L'IA n'a pas renvoyé d'exercices exploitables. Reformulez la demande ou vérifiez vos documents."
      });
    }

    const finalExercises = exercises.slice(0, count);
    const now = new Date().toISOString();
    const info = db.prepare(`
      INSERT INTO student_exercises
        (userId, filiere, niveau, type, prompt, documentIds, content, provider, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      req.user.filiere || '',
      normalizeLevel(req.user.niveau),
      type,
      prompt,
      documents.map((doc) => doc.id).join(','),
      JSON.stringify(finalExercises),
      result.provider || '',
      now
    );

    res.json({
      success: true,
      id: Number(info.lastInsertRowid),
      exercises: finalExercises,
      type,
      providerUsed: result.provider || '',
      tokens: {
        usedThisMonth: monthlyTokens(),
        budget: cfg.tokenBudget || null
      }
    });
  } catch (err) {
    logAiRequest({ userId: req.user.id, contextKey: 'student-exercises', status: 'error' });
    console.warn('[exercises] Génération impossible :', String(err?.message || err).slice(0, 200));
    res.status(502).json({
      error: err?.message || "La génération a échoué. Réessayez dans un instant."
    });
  }
});

// ── Historique ───────────────────────────────────────────────────────
router.get('/history', requireStudent, (req, res) => {
  const reason = accessError(req.user);
  if (reason) return res.status(403).json({ error: reason });

  const rows = db.prepare(`
    SELECT id, type, prompt, documentIds, content, createdAt
    FROM student_exercises
    WHERE userId = ?
    ORDER BY createdAt DESC, id DESC
    LIMIT 30
  `).all(req.user.id);

  const history = rows.map((row) => {
    let exercises = [];
    try {
      const parsed = JSON.parse(row.content || '[]');
      if (Array.isArray(parsed)) exercises = parsed;
    } catch { /* contenu illisible : on renvoie une liste vide */ }
    return {
      id: row.id,
      type: row.type,
      prompt: row.prompt || '',
      documentIds: String(row.documentIds || '').split(',').filter(Boolean).map(Number),
      exercises,
      createdAt: row.createdAt
    };
  });

  res.json({ history });
});

router.delete('/history/:id', requireStudent, (req, res) => {
  const reason = accessError(req.user);
  if (reason) return res.status(403).json({ error: reason });

  const row = db.prepare(
    'SELECT id FROM student_exercises WHERE id = ? AND userId = ?'
  ).get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'Génération introuvable.' });
  db.prepare('DELETE FROM student_exercises WHERE id = ?').run(row.id);
  res.json({ success: true });
});

export default router;
