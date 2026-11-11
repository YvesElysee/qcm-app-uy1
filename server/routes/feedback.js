/**
 * Routes des messages & suggestions — /api/feedback
 * - POST : envoi d'un message (étudiant connecté → identité enrichie depuis le jeton)
 * - GET /mine : suivi des messages envoyés par l'étudiant connecté
 * - Routes admin : liste complète, changement de statut, suppression
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireStudent, optionalStudent, requireAdmin } from '../auth.js';

const router = Router();

/**
 * Enregistre un message/suggestion.
 * Reproduit les deux usages historiques :
 *  - ContactAdmin : catégorie, UE, sujet, message (identité complète)
 *  - QuizSession : nom, UE, filière, niveau, message seulement
 */
router.post('/', optionalStudent, (req, res) => {
  const { category, ue, subject, message, name } = req.body || {};

  if (!message || !String(message).trim()) {
    return res.status(400).json({ error: 'Veuillez renseigner votre message.' });
  }

  const user = req.user; // null si non connecté
  db.prepare(`
    INSERT INTO feedback (userId, name, email, filiere, niveau, anneeAcademique, category, ue, subject, message, status, date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?)
  `).run(
    user?.id || '',
    user?.name || String(name || 'Étudiant').trim(),
    user?.email?.toLowerCase() || '',
    user?.filiere || '',
    user?.niveau || '',
    user?.anneeAcademique || '',
    String(category || '').trim(),
    String(ue || '').trim().toUpperCase() || 'GÉNÉRAL',
    String(subject || '').trim(),
    String(message).trim(),
    new Date().toISOString()
  );

  res.status(201).json({ success: true });
});

/**
 * Messages de l'étudiant connecté (suivi avec statuts)
 */
router.get('/mine', requireStudent, (req, res) => {
  const rows = db.prepare(`
    SELECT * FROM feedback WHERE email = ? ORDER BY date DESC
  `).all((req.user.email || '').toLowerCase());
  res.json({ feedback: rows });
});

// ══════════════ Routes administrateur ══════════════

/**
 * Liste de tous les messages (le filtrage catégorie/filière reste côté client)
 */
router.get('/', requireAdmin, (_req, res) => {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY date DESC').all();
  res.json({ feedback: rows });
});

/**
 * Mise à jour du statut d'un message ('en_attente' | 'en_cours' | 'traite')
 */
router.patch('/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  const allowed = ['en_attente', 'en_cours', 'traite'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Statut invalide.' });
  }
  const result = db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Message introuvable.' });
  }
  res.json({ success: true });
});

/**
 * Suppression d'un message
 */
router.delete('/:id', requireAdmin, (req, res) => {
  const result = db.prepare('DELETE FROM feedback WHERE id = ?').run(req.params.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Message introuvable.' });
  }
  res.json({ success: true });
});

export default router;
