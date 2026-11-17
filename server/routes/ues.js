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

export default router;
