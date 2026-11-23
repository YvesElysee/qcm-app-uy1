/**
 * Routes des Unités d'Enseignement · /api/ues
 * - Lecture publique (comme les anciennes règles Firestore)
 * - Écriture réservée à l'admin
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../auth.js';
import { normalizeFaculte, facultyOfFiliere } from '../access.js';

const router = Router();

/**
 * Liste des UEs, filtrable par filière et niveau (tableau de bord étudiant)
 */
router.get('/', (req, res) => {
  const { filiere, niveau, faculte, semestre } = req.query;

  let sql = 'SELECT * FROM ues';
  const where = [];
  const params = [];
  if (filiere) {
    where.push('LOWER(TRIM(filiere)) = LOWER(TRIM(?))');
    params.push(filiere);
  }
  if (niveau) {
    where.push('LOWER(TRIM(niveau)) = LOWER(TRIM(?))');
    params.push(niveau);
  }
  if (faculte) {
    where.push("UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?");
    params.push(normalizeFaculte(faculte));
  }
  if (semestre) {
    // Une UE sans semestre renseigné reste visible dans tous les semestres.
    where.push("(semestre IS NULL OR TRIM(semestre) = '' OR semestre = ?)");
    params.push(String(semestre));
  }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += " ORDER BY COALESCE(NULLIF(TRIM(semestre), ''), '9') ASC, code ASC";

  res.json({ ues: db.prepare(sql).all(...params) });
});

/**
 * Ajout / mise à jour d'une UE (upsert par code, comme setDoc)
 */
router.post('/', requireAdmin, (req, res) => {
  const { code, label, filiere, niveau, faculte, semestre } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();
  const cleanFiliere = String(filiere || '').trim() || 'Informatique';
  const cleanNiveau = String(niveau || '').trim() || 'L1';
  const cleanFaculte = normalizeFaculte(faculte || facultyOfFiliere(cleanFiliere));
  const cleanSemestre = ['1', '2'].includes(String(semestre || '').trim())
    ? String(semestre).trim()
    : '';

  if (!cleanCode) {
    return res.status(400).json({ error: 'Entrez un code UE.' });
  }

  db.prepare(`
    INSERT INTO ues (id, code, label, filiere, niveau, faculte, semestre)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code, label = excluded.label,
      filiere = excluded.filiere, niveau = excluded.niveau,
      faculte = excluded.faculte, semestre = excluded.semestre
  `).run(
    cleanCode,
    cleanCode,
    String(label || '').trim() || cleanCode,
    cleanFiliere,
    cleanNiveau,
    cleanFaculte,
    cleanSemestre
  );

  res.json({ success: true });
});

/**
 * Suppression d'une UE
 */
router.delete('/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM ues WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

/**
 * Regroupe le travail créé avant la mise à jour dans le catalogue des UE.
 *
 * Les anciennes bases contiennent des QCM, des documents, des copies et des
 * demandes dont le code UE existe déjà, sans ligne correspondante dans `ues`.
 * Cette route est idempotente : elle crée les UE manquantes et complète
 * uniquement les champs vides, sans écraser les intitulés choisis par
 * l'administration.
 */
function collectLegacyUes() {
  const candidates = new Map();
  const remember = ({ code, label = '', filiere = '', niveau = '', faculte = '', semestre = '' }) => {
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) return;
    if (!candidates.has(cleanCode)) {
      candidates.set(cleanCode, { code: cleanCode, label: '', filiere: '', niveau: '', faculte: '', semestre: '' });
    }
    const entry = candidates.get(cleanCode);
    if (!entry.label && String(label || '').trim() && String(label).trim().toUpperCase() !== cleanCode) {
      entry.label = String(label).trim();
    }
    if (!entry.filiere && String(filiere || '').trim()) entry.filiere = String(filiere).trim();
    if (!entry.niveau && String(niveau || '').trim()) entry.niveau = String(niveau).trim();
    if (!entry.faculte && String(faculte || '').trim()) entry.faculte = normalizeFaculte(faculte);
    if (!entry.semestre && ['1', '2'].includes(String(semestre || '').trim())) {
      entry.semestre = String(semestre).trim();
    }
  };

  db.prepare('SELECT * FROM ues').all().forEach((row) => remember({
    code: row.code || row.id,
    label: row.label,
    filiere: row.filiere,
    niveau: row.niveau,
    faculte: row.faculte,
    semestre: row.semestre
  }));

  // Priorité aux QCM programmés : ce sont eux qui fixent le semestre et la
  // filière réels de l'UE.
  db.prepare(`
    SELECT ue, title, filiere, niveau, faculte, semestre
    FROM quizzes ORDER BY COALESCE(launchTime, 0) DESC, id DESC
  `).all().forEach((row) => remember({
    code: row.ue || row.id,
    label: row.title,
    filiere: row.filiere,
    niveau: row.niveau,
    faculte: row.faculte,
    semestre: row.semestre
  }));

  db.prepare('SELECT ue, filiere, niveau, faculte FROM resources').all().forEach((row) => remember(row));
  db.prepare('SELECT ue, filiere, niveau, faculte FROM results').all().forEach((row) => remember(row));
  db.prepare(`
    SELECT ue, ueLabel AS label, filiere, niveau, faculte FROM quiz_requests
  `).all().forEach((row) => remember(row));

  return [...candidates.values()].sort((a, b) => a.code.localeCompare(b.code, 'fr', { numeric: true }));
}

router.get('/backfill/preview', requireAdmin, (req, res) => {
  const candidates = collectLegacyUes();
  const known = new Set(db.prepare('SELECT id FROM ues').all().map((row) => row.id));
  res.json({
    total: candidates.length,
    existing: candidates.filter((c) => known.has(c.code)).length,
    missing: candidates.filter((c) => !known.has(c.code)).length,
    ues: candidates
  });
});

router.post('/backfill', requireAdmin, (req, res) => {
  const dryRun = req.body?.dryRun === true;
  const candidates = collectLegacyUes();
  const insert = db.prepare(`
    INSERT INTO ues (id, code, label, filiere, niveau, faculte, semestre)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const update = db.prepare(`
    UPDATE ues SET
      label = CASE WHEN label IS NULL OR TRIM(label) = '' OR label = code THEN ? ELSE label END,
      filiere = CASE WHEN filiere IS NULL OR TRIM(filiere) = '' THEN ? ELSE filiere END,
      niveau = CASE WHEN niveau IS NULL OR TRIM(niveau) = '' THEN ? ELSE niveau END,
      faculte = CASE WHEN faculte IS NULL OR TRIM(faculte) = '' THEN ? ELSE faculte END,
      semestre = CASE WHEN semestre IS NULL OR TRIM(semestre) = '' THEN ? ELSE semestre END
    WHERE id = ?
  `);

  let created = 0;
  let updated = 0;
  if (!dryRun) {
    const run = db.transaction((rows) => {
      rows.forEach((candidate) => {
        const filiere = candidate.filiere || 'Informatique';
        const niveau = candidate.niveau || 'L1';
        const faculte = candidate.faculte || normalizeFaculte(facultyOfFiliere(filiere));
        const label = candidate.label || candidate.code;
        const existing = db.prepare('SELECT id FROM ues WHERE id = ?').get(candidate.code);
        if (!existing) {
          insert.run(candidate.code, candidate.code, label, filiere, niveau, faculte, candidate.semestre || '');
          created += 1;
        } else {
          update.run(label, filiere, niveau, faculte, candidate.semestre || '', candidate.code);
          updated += 1;
        }
      });
    });
    run(candidates);
  }

  res.json({
    success: true,
    dryRun,
    created,
    updated,
    total: candidates.length,
    ues: candidates
  });
});

/** Modification d'une UE existante (libellé, filière, niveau, semestre). */
router.put('/:id', requireAdmin, (req, res) => {
  const id = String(req.params.id || '').trim().toUpperCase();
  const existing = db.prepare('SELECT * FROM ues WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'UE introuvable.' });

  const body = req.body || {};
  const filiere = String(body.filiere ?? existing.filiere ?? '').trim() || existing.filiere || 'Informatique';
  const niveau = String(body.niveau ?? existing.niveau ?? '').trim() || existing.niveau || 'L1';
  const faculte = normalizeFaculte(body.faculte || existing.faculte || facultyOfFiliere(filiere));
  const semestre = ['1', '2'].includes(String(body.semestre ?? existing.semestre ?? '').trim())
    ? String(body.semestre).trim()
    : '';
  const label = String(body.label ?? existing.label ?? '').trim() || id;

  db.prepare(`
    UPDATE ues SET code = ?, label = ?, filiere = ?, niveau = ?, faculte = ?, semestre = ?
    WHERE id = ?
  `).run(id, label, filiere, niveau, faculte, semestre, id);

  // Les QCM et documents de cette UE héritent du nouveau semestre : le
  // regroupement reste cohérent pour l'étudiant sans ressaisie.
  db.prepare('UPDATE quizzes SET semestre = ? WHERE UPPER(TRIM(ue)) = ?').run(semestre, id);
  db.prepare('UPDATE resources SET filiere = ?, niveau = ?, faculte = ? WHERE UPPER(TRIM(ue)) = ?')
    .run(filiere, niveau, faculte, id);

  res.json({ success: true, ue: db.prepare('SELECT * FROM ues WHERE id = ?').get(id) });
});

export default router;
