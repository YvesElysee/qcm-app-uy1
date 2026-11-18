/**
 * Routes des messages & suggestions · /api/feedback
 * - POST : envoi d'un message (étudiant connecté → identité enrichie depuis le jeton)
 * - GET /mine : suivi des messages envoyés par l'étudiant connecté
 * - Routes admin : liste complète, réponse, changement de statut, suppression
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireStudent, optionalStudent, requireAdmin } from '../auth.js';
import { createNotification } from '../notifications.js';
import { sendFeedbackReplyEmail } from '../smtp.js';

const router = Router();

const ALLOWED_STATUSES = ['en_attente', 'en_cours', 'traite'];

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
    String(subject || '').trim().slice(0, 300),
    String(message).trim().slice(0, 5000),
    new Date().toISOString()
  );

  res.status(201).json({ success: true });
});

/**
 * Messages de l'étudiant connecté (suivi avec statuts)
 */
router.get('/mine', requireStudent, (req, res) => {
  // L'identifiant de session est la source la plus fiable ; l'email sert de
  // repli pour les comptes créés avant son enregistrement dans les messages.
  const userId = String(req.user.id || '');
  const email = String(req.user.email || '').toLowerCase();
  const rows = db.prepare(`
    SELECT * FROM feedback
    WHERE (? <> '' AND userId = ?) OR (? <> '' AND LOWER(email) = ?)
    ORDER BY date DESC
  `).all(userId, userId, email, email);
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
 * Mise à jour d'un message : statut et/ou réponse de l'administration.
 * Une réponse passée sans statut explicite marque automatiquement le message
 * comme traité, et notifie l'étudiant (cloche + email si SMTP configuré).
 */
router.patch('/:id', requireAdmin, async (req, res) => {
  const body = req.body || {};
  const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
  const hasReply = Object.prototype.hasOwnProperty.call(body, 'reply');
  if (!hasStatus && !hasReply) {
    return res.status(400).json({ error: 'Aucune mise à jour demandée.' });
  }

  const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id);
  if (!row) {
    return res.status(404).json({ error: 'Message introuvable.' });
  }

  let status = row.status || 'en_attente';
  if (hasStatus) {
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return res.status(400).json({ error: 'Statut invalide.' });
    }
    status = body.status;
  }

  let reply = String(row.reply || '');
  let repliedAt = row.repliedAt || null;
  if (hasReply) {
    reply = String(body.reply ?? '').trim().slice(0, 2000);
    repliedAt = reply ? new Date().toISOString() : null;
    if (!hasStatus && reply) status = 'traite';
  }

  db.prepare(`
    UPDATE feedback SET status = ?, reply = ?, repliedAt = ?, repliedBy = ? WHERE id = ?
  `).run(status, reply, repliedAt, reply ? 'admin' : '', row.id);

  const updated = db.prepare('SELECT * FROM feedback WHERE id = ?').get(row.id);

  if (hasReply && reply) {
    // Les messages anonymes du QCM peuvent n'avoir que l'email : on retrouve
    // alors le compte étudiant pour lui afficher la notification.
    let targetUserId = String(row.userId || '');
    if (!targetUserId && row.email) {
      const owner = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(row.email);
      targetUserId = String(owner?.id || '');
    }
    createNotification({
      userId: targetUserId,
      type: 'feedback_reply',
      title: `Réponse de l'administration · ${row.subject || row.ue || 'Votre message'}`,
      message: reply,
      link: '/contact?tab=history',
      entityKey: `feedback-reply:${row.id}`
    });
    if (row.email) {
      void sendFeedbackReplyEmail({
        email: row.email,
        name: row.name,
        subject: row.subject,
        originalMessage: row.message,
        reply
      }).then((result) => {
        if (!result.success && !result.skipped) {
          console.warn('[feedback] Email de réponse non envoyé :', result.error);
        }
      }).catch((err) => {
        console.warn('[feedback] Email de réponse impossible :', err.message);
      });
    }
  }

  res.json({ success: true, feedback: updated });
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
