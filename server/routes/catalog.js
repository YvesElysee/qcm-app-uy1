/**
 * Catalogue public des facultés et filières · /api/catalog
 * Utilisé par le formulaire d'inscription et les filtres de l'espace étudiant.
 */
import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

export const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2'];

router.get('/', (req, res) => {
  const faculte = String(req.query.faculte || '').trim();

  const facultes = db.prepare('SELECT id, label FROM facultes ORDER BY label ASC').all();
  const params = [];
  let sql = 'SELECT id, label, faculte FROM filieres';
  if (faculte) {
    sql += ' WHERE UPPER(TRIM(faculte)) = UPPER(TRIM(?))';
    params.push(faculte);
  }
  sql += ' ORDER BY faculte ASC, label ASC';

  res.json({
    facultes,
    filieres: db.prepare(sql).all(...params),
    niveaux: NIVEAUX
  });
});

export default router;
