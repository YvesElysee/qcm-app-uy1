/**
 * Routes des Unités d'Enseignement — /api/ues
 * - Lecture publique (comme les anciennes règles Firestore)
 * - Écriture réservée à l'admin
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../auth.js';

const router = Router();

/**
 * Liste des UEs, filtrable par filière et niveau (tableau de bord étudiant)
 */
router.get('/', (req, res) => {
  const { filiere, niveau } = req.query;

  let sql = 'SELECT * FROM ues';
  const where = [];
  const params = [];
  if (filiere) { where.push('filiere = ?'); params.push(filiere); }
  if (niveau) { where.push('niveau = ?'); params.push(niveau); }
  if (where.length) sql += ' WHERE ' + where.join(' AND ');
  sql += ' ORDER BY code ASC';

  res.json({ ues: db.prepare(sql).all(...params) });
});

/**
 * Ajout / mise à jour d'une UE (upsert par code, comme setDoc)
 */
router.post('/', requireAdmin, (req, res) => {
  const { code, label, filiere, niveau } = req.body || {};
  const cleanCode = String(code || '').trim().toUpperCase();

  if (!cleanCode) {
    return res.status(400).json({ error: 'Entrez un code UE.' });
  }

  db.prepare(`
    INSERT INTO ues (id, code, label, filiere, niveau)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      code = excluded.code, label = excluded.label,
      filiere = excluded.filiere, niveau = excluded.niveau
  `).run(cleanCode, cleanCode, String(label || '').trim() || cleanCode, filiere || 'Informatique', niveau || 'L1');

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
