/**
 * Générateur de QCM assisté par IA · /api/ai-generation
 *
 * Réservé à l'administration :
 * - dépôt de documents de référence (PDF, TXT, MD, CSV, JSON) ;
 * - génération de questions cohérentes à partir d'un prompt et des documents ;
 * - enregistrement direct des questions dans une épreuve.
 *
 * Les clés et modèles IA restent côté serveur. Chaque génération consomme le
 * budget mensuel de tokens déjà suivi par le tableau de bord administrateur.
 */
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import { db, DATA_DIR } from '../db.js';
import { requireAdmin } from '../auth.js';
import { getConfig, generateReply, logAiRequest } from './ai.js';
import {
  normalizeFaculte,
  facultyOfFiliere
} from '../access.js';
import { notifyQuizAvailable } from '../notifications.js';
import { approveRequestsForQuiz } from './quizRequests.js';

const router = Router();

const DOC_DIR = path.join(DATA_DIR, 'ai-documents');
fs.mkdirSync(DOC_DIR, { recursive: true });

const MAX_DOC_BYTES = 20 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'csv', 'json']);
const ALLOWED_EXTENSIONS = new Set([...TEXT_EXTENSIONS, 'pdf']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_DOC_BYTES, files: 1 }
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Document trop volumineux (20 Mo maximum).' });
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

function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const question = String(raw.Question || raw.question || raw.enonce || '').trim();
  const opts = {
    OptA: String(raw.OptA || raw.optionA || raw.A || '').trim(),
    OptB: String(raw.OptB || raw.optionB || raw.B || '').trim(),
    OptC: String(raw.OptC || raw.optionC || raw.C || '').trim(),
    OptD: String(raw.OptD || raw.optionD || raw.D || '').trim()
  };
  if (!question || !opts.OptA || !opts.OptB || !opts.OptC || !opts.OptD) return null;

  const rawCorrect = String(
    raw.ReponseCorrecte || raw.correct || raw.reponseCorrecte || raw.answer || ''
  ).trim();
  const upper = rawCorrect.toUpperCase();
  let correct = ['A', 'B', 'C', 'D'].includes(upper[0]) && /^[A-D]/.test(upper)
    ? upper[0]
    : '';

  if (!correct) {
    const match = Object.entries(opts).find(([, value]) =>
      value.toLowerCase() === rawCorrect.toLowerCase()
    );
    if (match) correct = match[0].replace('Opt', '');
  }
  if (!correct) return null;

  const difficulte = String(raw.difficulte || raw.Difficulte || 'moyenne')
    .trim()
    .toLowerCase();
  return {
    Question: question,
    ...opts,
    ReponseCorrecte: correct,
    tags: String(raw.tags || raw.Tags || '').trim().slice(0, 200),
    difficulte: ['facile', 'moyenne', 'difficile'].includes(difficulte) ? difficulte : 'moyenne'
  };
}

// ── Documents de référence ───────────────────────────────────────────
router.get('/documents', requireAdmin, (_req, res) => {
  const documents = db.prepare(`
    SELECT id, originalName, mimeType, size, charCount, uploadedBy, createdAt
    FROM ai_documents
    ORDER BY createdAt DESC, id DESC
    LIMIT 200
  `).all();
  res.json({ documents });
});

router.post('/documents', requireAdmin, uploadSingle, async (req, res) => {
  if (!req.file || !req.file.buffer?.length) {
    return res.status(400).json({ error: 'Veuillez sélectionner un document.' });
  }

  const originalName = path.basename(String(req.file.originalname || 'document'));
  const ext = path.extname(originalName).replace('.', '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({
      error: 'Format non pris en charge. Utilisez un PDF, TXT, MD, CSV ou JSON.'
    });
  }

  let textContent;
  try {
    if (ext === 'pdf') {
      const parsed = await pdfParse(req.file.buffer);
      textContent = String(parsed?.text || '');
    } else {
      textContent = req.file.buffer.toString('utf8');
    }
  } catch (err) {
    console.warn('[ai-generation] Extraction impossible :', err.message);
    return res.status(400).json({ error: "Impossible d'extraire le texte de ce document." });
  }

  textContent = textContent.split(String.fromCharCode(0)).join('').trim();
  if (textContent.length < 20) {
    return res.status(400).json({
      error: "Le document ne contient pas assez de texte exploitable (PDF scanné ?)."
    });
  }

  const storedName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(DOC_DIR, storedName);
  fs.writeFileSync(fullPath, req.file.buffer);

  try {
    const info = db.prepare(`
      INSERT INTO ai_documents
        (originalName, storedName, mimeType, size, charCount, textContent, uploadedBy, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 'admin', ?)
    `).run(
      originalName.slice(0, 255),
      storedName,
      String(req.file.mimetype || '').slice(0, 120),
      Number(req.file.size) || req.file.buffer.length,
      textContent.length,
      textContent.slice(0, 400000),
      new Date().toISOString()
    );

    res.status(201).json({
      success: true,
      document: {
        id: Number(info.lastInsertRowid),
        originalName,
        charCount: textContent.length
      }
    });
  } catch (err) {
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
    console.error('[ai-generation] Document non enregistré :', err);
    res.status(500).json({ error: "Impossible d'enregistrer le document." });
  }
});

router.delete('/documents/:id', requireAdmin, (req, res) => {
  const row = db.prepare('SELECT * FROM ai_documents WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Document introuvable.' });
  }
  const fullPath = path.join(DOC_DIR, path.basename(row.storedName || ''));
  try { fs.unlinkSync(fullPath); } catch { /* déjà absent */ }
  db.prepare('DELETE FROM ai_documents WHERE id = ?').run(row.id);
  res.json({ success: true });
});

// ── Génération de questions ──────────────────────────────────────────
router.post('/generate', requireAdmin, async (req, res) => {
  const cfg = getConfig();
  if (cfg.groqKeys.length + cfg.geminiKeys.length === 0) {
    return res.status(503).json({
      error: "Aucune clé IA n'est configurée sur le serveur. Ajoutez GROQ_API_KEYS ou GEMINI_API_KEYS."
    });
  }

  const usedTokens = monthlyTokens();
  if (cfg.tokenBudget > 0 && usedTokens >= cfg.tokenBudget) {
    return res.status(429).json({
      error: 'Le budget mensuel de tokens IA est épuisé. Réessayez le mois prochain.'
    });
  }

  const prompt = String(req.body?.prompt || '').trim().slice(0, 4000);
  const count = Math.min(40, Math.max(1, Number.parseInt(req.body?.count, 10) || 10));
  const difficulte = ['facile', 'moyenne', 'difficile'].includes(req.body?.difficulte)
    ? req.body.difficulte
    : 'moyenne';
  const filiere = String(req.body?.filiere || '').trim();
  const niveau = String(req.body?.niveau || '').trim();
  const ue = String(req.body?.ue || '').trim().toUpperCase().slice(0, 40);
  const faculte = normalizeFaculte(req.body?.faculte || facultyOfFiliere(filiere));

  const ids = Array.isArray(req.body?.documentIds)
    ? req.body.documentIds.map((id) => Number(id)).filter(Number.isFinite)
    : [];

  let documents;
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    documents = db.prepare(
      `SELECT id, originalName, textContent FROM ai_documents WHERE id IN (${placeholders})`
    ).all(...ids);
  } else {
    documents = db.prepare(
      'SELECT id, originalName, textContent FROM ai_documents ORDER BY createdAt DESC LIMIT 3'
    ).all();
  }

  if (!prompt && documents.length === 0) {
    return res.status(400).json({
      error: 'Ajoutez un prompt ou au moins un document de référence.'
    });
  }

  let context = '';
  const maxContext = 18000;
  documents.forEach((doc) => {
    if (context.length >= maxContext) return;
    const remaining = maxContext - context.length;
    const text = String(doc.textContent || '').slice(0, Math.min(6000, remaining));
    context += `\n\n--- Document : ${doc.originalName} ---\n${text}`;
  });

  const system = [
    "Tu es un concepteur pédagogique expert de la plateforme QCM App.",
    'Tu génères des questions à choix multiples (QCM) en français, rigoureuses, sans ambiguïté et strictement fondées sur les documents de référence fournis.',
    '',
    'Règles :',
    '1. Chaque question doit avoir exactement 4 options (A, B, C, D) et une seule bonne réponse.',
    '2. Les distracteurs doivent être crédibles mais clairement faux.',
    '3. N\'invente aucun fait absent des documents. Si une information manque, reste sur ce qui est démontrable.',
    '4. Varie les formulations et évite les questions trop faciles ou hors sujet.',
    `5. Difficulté demandée : ${difficulte}.`,
    '6. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour ni balises Markdown.',
    '',
    'Schéma attendu :',
    '{"questions":[{"Question":"...","OptA":"...","OptB":"...","OptC":"...","OptD":"...","ReponseCorrecte":"A","tags":"...","difficulte":"facile|moyenne|difficile"}]}'
  ].join('\n');

  const userMessage = [
    `Génère ${count} questions QCM.`,
    filiere ? `Filière : ${filiere}.` : '',
    niveau ? `Niveau : ${niveau}.` : '',
    ue ? `Unité d'enseignement : ${ue}.` : '',
    prompt ? `Consignes de l'administrateur : ${prompt}` : '',
    context ? `Documents de référence :${context}` : ''
  ].filter(Boolean).join('\n\n');

  try {
    const result = await generateReply({
      system,
      messages: [{ role: 'user', content: userMessage }],
      cfg,
      maxTokens: Math.min(8000, 1200 + count * 220),
      temperature: 0.35,
      json: true
    });

    logAiRequest({
      userId: 'admin',
      contextKey: 'qcm-generation',
      status: 'ok',
      provider: result.provider,
      model: result.model,
      usage: result.usage
    });

    const parsed = extractJson(result.text);
    const rawQuestions = Array.isArray(parsed?.questions)
      ? parsed.questions
      : (Array.isArray(parsed) ? parsed : []);
    const questions = rawQuestions.map(normalizeQuestion).filter(Boolean).slice(0, count);

    if (questions.length === 0) {
      return res.status(502).json({
        error: "L'IA n'a pas renvoyé de questions exploitables. Reformulez le prompt ou vérifiez les documents."
      });
    }

    // Enregistrement optionnel directement dans une épreuve
    const quizId = String(req.body?.quizId || '').trim().toUpperCase();
    const shouldSave = !!req.body?.save && !!quizId;
    let quiz = null;

    if (shouldSave) {
      const existing = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId) || {};
      const merged = {
        ue: existing.ue || quizId,
        filiere: filiere || existing.filiere || null,
        niveau: niveau || existing.niveau || null,
        faculte: normalizeFaculte(faculte || existing.faculte),
        semestre: String(req.body?.semestre || existing.semestre || '').trim() || null,
        questionCount: questions.length,
        timePerQuestion: Math.max(10, Number(req.body?.timePerQuestion) || existing.timePerQuestion || 60),
        drawCount: Math.max(0, Number(req.body?.drawCount) || existing.drawCount || 0),
        launchTime: existing.launchTime ?? null,
        endTime: existing.endTime ?? null,
        updatedAt: new Date().toISOString()
      };

      const save = db.transaction(() => {
        db.prepare(`
          INSERT INTO quizzes (id, ue, filiere, niveau, faculte, semestre, questionCount, timePerQuestion, drawCount, launchTime, endTime, updatedAt)
          VALUES (@id, @ue, @filiere, @niveau, @faculte, @semestre, @questionCount, @timePerQuestion, @drawCount, @launchTime, @endTime, @updatedAt)
          ON CONFLICT(id) DO UPDATE SET
            ue = excluded.ue, filiere = excluded.filiere, niveau = excluded.niveau,
            faculte = excluded.faculte, semestre = excluded.semestre,
            questionCount = excluded.questionCount, timePerQuestion = excluded.timePerQuestion,
            drawCount = excluded.drawCount, updatedAt = excluded.updatedAt
        `).run({ id: quizId, ...merged });

        db.prepare('DELETE FROM questions WHERE quizId = ?').run(quizId);
        const insert = db.prepare(`
          INSERT INTO questions (quizId, Question, OptA, OptB, OptC, OptD, ReponseCorrecte, tags, difficulte, position)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        questions.forEach((q, i) => {
          insert.run(
            quizId,
            q.Question,
            q.OptA,
            q.OptB,
            q.OptC,
            q.OptD,
            q.ReponseCorrecte,
            q.tags,
            q.difficulte,
            i
          );
        });

        if (merged.filiere && merged.niveau) {
          db.prepare(`
            INSERT INTO ues (id, code, label, filiere, niveau, faculte)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              label = excluded.label, filiere = excluded.filiere,
              niveau = excluded.niveau, faculte = excluded.faculte
          `).run(
            quizId,
            quizId,
            String(req.body?.ueLabel || ue || quizId).trim() || quizId,
            merged.filiere,
            merged.niveau,
            merged.faculte
          );
        }
      });
      save();
      quiz = db.prepare('SELECT * FROM quizzes WHERE id = ?').get(quizId);
      if (quiz) notifyQuizAvailable(quiz);
      if (quiz) approveRequestsForQuiz(quiz);
    }

    res.json({
      success: true,
      questions,
      saved: shouldSave,
      quiz,
      providerUsed: result.provider,
      tokens: {
        usedThisMonth: monthlyTokens(),
        budget: cfg.tokenBudget || null
      }
    });
  } catch (err) {
    logAiRequest({ userId: 'admin', contextKey: 'qcm-generation', status: 'error' });
    console.error('[ai-generation] Échec de génération :', String(err?.message || err).slice(0, 200));
    res.status(502).json({
      error: "La génération IA a échoué. Vérifiez votre configuration ou réessayez dans un instant."
    });
  }
});

export default router;
