/**
 * Révisions intelligentes · /api/review
 * Cartes créées automatiquement à partir des erreurs du QCM et révisées
 * selon un rythme de répétition espacée.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireStudent } from '../auth.js';
import { scheduleReview } from '../spacedRepetition.js';

const router = Router();

function parseCard(row) {
  let options;
  try {
    options = row.options ? JSON.parse(row.options) : {};
  } catch {
    options = {};
  }
  return {
    id: row.id,
    ue: row.ue,
    questionId: row.questionId,
    question: row.question,
    options,
    correct: row.correct,
    lastSelected: row.lastSelected || '',
    ease: row.ease,
    intervalDays: row.intervalDays,
    repetitions: row.repetitions,
    lapses: row.lapses,
    dueAt: row.dueAt,
    lastReviewedAt: row.lastReviewedAt,
    createdAt: row.createdAt
  };
}

/**
 * Statistiques de révision de l'étudiant connecté.
 */
router.get('/stats', requireStudent, (req, res) => {
  const now = new Date().toISOString();
  const all = db.prepare('SELECT * FROM review_cards WHERE userId = ?').all(req.user.id);
  const due = all.filter(c => c.dueAt <= now);
  const next = all.filter(c => c.dueAt > now).sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];

  const byUe = {};
  for (const card of all) {
    if (!byUe[card.ue]) byUe[card.ue] = { ue: card.ue, total: 0, due: 0 };
    byUe[card.ue].total += 1;
    if (card.dueAt <= now) byUe[card.ue].due += 1;
  }

  res.json({
    total: all.length,
    due: due.length,
    nextDueAt: next?.dueAt || null,
    byUe: Object.values(byUe).sort((a, b) => b.due - a.due || a.ue.localeCompare(b.ue))
  });
});

/**
 * Liste des cartes.
 * - par défaut : uniquement celles dues aujourd'hui
 * - `?all=1` : toutes les cartes (historique)
 * - `?ue=INF232` : restreint à une UE
 */
router.get('/', requireStudent, (req, res) => {
  const now = new Date().toISOString();
  const { ue, all } = req.query;

  let rows = db.prepare(
    'SELECT * FROM review_cards WHERE userId = ? ORDER BY dueAt ASC, id ASC'
  ).all(req.user.id);

  if (ue) rows = rows.filter(c => c.ue === ue);
  if (all !== '1') rows = rows.filter(c => c.dueAt <= now);

  res.json({ cards: rows.map(parseCard), now });
});

/**
 * Enregistre le résultat d'une révision.
 * Le client envoie uniquement `remembered` (auto-évaluation) ; la prochaine
 * échéance est calculée côté serveur.
 */
router.post('/:id/answer', requireStudent, (req, res) => {
  const card = db.prepare('SELECT * FROM review_cards WHERE id = ? AND userId = ?')
    .get(req.params.id, req.user.id);

  if (!card) {
    return res.status(404).json({ error: 'Carte de révision introuvable.' });
  }

  const remembered = req.body?.remembered === true;
  const updated = scheduleReview(card, remembered);

  res.json({
    success: true,
    card: parseCard(updated),
    nextDueAt: updated.dueAt
  });
});

/**
 * Supprime une carte (utile si l'étudiant maîtrise définitivement la notion).
 */
router.delete('/:id', requireStudent, (req, res) => {
  const result = db.prepare('DELETE FROM review_cards WHERE id = ? AND userId = ?')
    .run(req.params.id, req.user.id);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Carte de révision introuvable.' });
  }
  res.json({ success: true });
});

export default router;
