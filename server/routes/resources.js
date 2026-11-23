/**
 * Ressources de cours partagées · /api/resources
 *
 * - Les étudiants ne voient que les ressources de leur faculté, filière et
 *   niveau d'inscription.
 * - L'administration voit tout et peut modérer (supprimer).
 * - Les fichiers sont stockés hors du dossier public et servis uniquement via
 *   une route contrôlée qui vérifie les droits avant le téléchargement.
 */
import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from '../db.js';
import { bearerToken, isAdminToken, getStudentFromToken } from '../auth.js';
import {
  canStudentAccessResource,
  normalizeFaculte,
  facultyOfFiliere,
  studentFaculte,
  sameText
} from '../access.js';

const router = Router();

const RESOURCE_DIR = path.join(DATA_DIR, 'resources');
fs.mkdirSync(RESOURCE_DIR, { recursive: true });

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 Mo
const ALLOWED_EXTENSIONS = new Set([
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx',
  'txt', 'md', 'csv', 'json', 'png', 'jpg', 'jpeg', 'webp', 'zip'
]);

// Types de documents proposés à l'étudiant et à l'administration. La valeur
// stockée est un slug court ; le libellé français est géré côté interface.
const RESOURCE_TYPES = new Set(['cours', 'td', 'tp', 'examen', 'corrige', 'fiche', 'autre']);
const DEFAULT_RESOURCE_TYPE = 'autre';

function normalizeResourceType(value) {
  const type = String(value || '').trim().toLowerCase().slice(0, 30);
  return RESOURCE_TYPES.has(type) ? type : DEFAULT_RESOURCE_TYPE;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Fichier trop volumineux (25 Mo maximum).' });
    }
    return res.status(400).json({ error: 'Téléversement invalide.' });
  });
}

function viewerOf(req) {
  const token = bearerToken(req);
  const admin = isAdminToken(token);
  const user = getStudentFromToken(token);
  return { admin, user };
}

function publicResource(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description || '',
    ue: row.ue || '',
    type: normalizeResourceType(row.type),
    faculte: row.faculte || '',
    filiere: row.filiere || '',
    niveau: row.niveau || '',
    originalName: row.originalName,
    mimeType: row.mimeType || '',
    size: row.size || 0,
    uploaderId: row.uploaderId || '',
    uploaderName: row.uploaderName || '',
    uploaderRole: row.uploaderRole || 'student',
    downloads: row.downloads || 0,
    createdAt: row.createdAt
  };
}

function filePathOf(row) {
  const safe = path.basename(String(row.storedName || ''));
  if (!safe) return null;
  return path.join(RESOURCE_DIR, safe);
}

// ── Liste des ressources accessibles ─────────────────────────────────
router.get('/', (req, res) => {
  const { admin, user } = viewerOf(req);
  if (!admin && !user) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }

  const where = [];
  const params = [];

  // Filtre optionnel par type de document (cours, td, tp, examen…).
  const type = String(req.query.type || '').trim().toLowerCase();
  if (type && RESOURCE_TYPES.has(type)) {
    where.push('LOWER(TRIM(type)) = LOWER(TRIM(?))');
    params.push(type);
  }

  // Filtre optionnel par UE : utilisé par la vue détaillée d'une UE.
  const ue = String(req.query.ue || '').trim().toUpperCase();
  if (ue) {
    where.push('UPPER(TRIM(COALESCE(ue, \'\'))) = ?');
    params.push(ue);
  }

  if (admin) {
    const faculte = String(req.query.faculte || '').trim();
    const filiere = String(req.query.filiere || '').trim();
    const niveau = String(req.query.niveau || '').trim();
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
  } else {
    where.push('LOWER(TRIM(filiere)) = LOWER(TRIM(?))');
    params.push(user.filiere || '');
    where.push('LOWER(TRIM(niveau)) = LOWER(TRIM(?))');
    params.push(user.niveau || '');
    where.push("UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?");
    params.push(studentFaculte(user));
  }

  const sql = `
    SELECT * FROM resources
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY createdAt DESC, id DESC
    LIMIT 300
  `;

  res.json({ resources: db.prepare(sql).all(...params).map(publicResource) });
});

// ── Dépôt d'une ressource ────────────────────────────────────────────
router.post('/', uploadSingle, (req, res) => {
  const { admin, user } = viewerOf(req);
  if (!admin && !user) {
    return res.status(401).json({ error: 'Connexion requise pour déposer une ressource.' });
  }
  if (!req.file || !req.file.buffer?.length) {
    return res.status(400).json({ error: 'Veuillez sélectionner un fichier.' });
  }

  const originalName = path.basename(String(req.file.originalname || 'fichier'));
  const ext = path.extname(originalName).replace('.', '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return res.status(400).json({
      error: `Format non autorisé. Formats acceptés : ${[...ALLOWED_EXTENSIONS].join(', ')}.`
    });
  }

  const title = String(req.body?.title || '').trim() || originalName;
  const description = String(req.body?.description || '').trim().slice(0, 1000);
  const ue = String(req.body?.ue || '').trim().toUpperCase().slice(0, 40);
  const type = normalizeResourceType(req.body?.type);

  let faculte;
  let filiere;
  let niveau;
  if (admin) {
    filiere = String(req.body?.filiere || '').trim();
    niveau = String(req.body?.niveau || '').trim();
    faculte = normalizeFaculte(req.body?.faculte || facultyOfFiliere(filiere));
    if (!filiere || !niveau) {
      return res.status(400).json({ error: 'Filière et niveau sont requis pour une ressource administrative.' });
    }
  } else {
    faculte = studentFaculte(user);
    filiere = String(user.filiere || '').trim();
    niveau = String(user.niveau || '').trim();
    if (!filiere || !niveau) {
      return res.status(400).json({ error: 'Votre filière et votre niveau doivent être renseignés.' });
    }
  }

  const storedName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const fullPath = path.join(RESOURCE_DIR, storedName);
  fs.writeFileSync(fullPath, req.file.buffer);

  try {
    const info = db.prepare(`
      INSERT INTO resources
        (title, description, ue, type, faculte, filiere, niveau,
         originalName, storedName, mimeType, size,
         uploaderId, uploaderName, uploaderRole, downloads, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      title.slice(0, 200),
      description,
      ue,
      type,
      faculte,
      filiere,
      niveau,
      originalName.slice(0, 255),
      storedName,
      String(req.file.mimetype || '').slice(0, 120),
      Number(req.file.size) || req.file.buffer.length,
      admin ? 'admin' : user.id,
      admin ? 'Administration' : (user.name || 'Étudiant'),
      admin ? 'admin' : 'student',
      new Date().toISOString()
    );

    const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(info.lastInsertRowid);
    res.status(201).json({ success: true, resource: publicResource(row) });
  } catch (err) {
    try { fs.unlinkSync(fullPath); } catch { /* ignore */ }
    console.error('[resources] Enregistrement impossible :', err);
    res.status(500).json({ error: "Impossible d'enregistrer la ressource." });
  }
});

// ── Téléchargement contrôlé ──────────────────────────────────────────
router.get('/:id/download', (req, res) => {
  const { admin, user } = viewerOf(req);
  if (!admin && !user) {
    return res.status(401).json({ error: 'Connexion requise pour télécharger.' });
  }

  const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Ressource introuvable.' });
  }
  if (!admin && !canStudentAccessResource(user, row)) {
    return res.status(403).json({ error: "Cette ressource n'est pas accessible depuis votre filière et votre niveau." });
  }

  const fullPath = filePathOf(row);
  if (!fullPath || !fs.existsSync(fullPath)) {
    return res.status(404).json({ error: 'Fichier introuvable sur le serveur.' });
  }

  db.prepare('UPDATE resources SET downloads = downloads + 1 WHERE id = ?').run(row.id);
  res.download(fullPath, row.originalName || 'ressource');
});

// ── Suppression (auteur ou administration) ───────────────────────────
router.delete('/:id', (req, res) => {
  const { admin, user } = viewerOf(req);
  if (!admin && !user) {
    return res.status(401).json({ error: 'Connexion requise.' });
  }

  const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Ressource introuvable.' });
  }
  const isOwner = user && sameText(String(row.uploaderId || ''), String(user.id || ''));
  if (!admin && !isOwner) {
    return res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres ressources.' });
  }

  const fullPath = filePathOf(row);
  if (fullPath) {
    try { fs.unlinkSync(fullPath); } catch { /* déjà absent */ }
  }
  db.prepare('DELETE FROM resources WHERE id = ?').run(row.id);
  res.json({ success: true });
});

export default router;
