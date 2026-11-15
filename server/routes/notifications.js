/**
 * Notifications étudiantes · /api/notifications
 * Chaque utilisateur ne voit strictement que ses propres notifications.
 */
import { Router } from 'express';
import { db } from '../db.js';
import { requireStudent } from '../auth.js';

const router = Router();

function toNotification(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    message: row.message || '',
    link: row.link || '',
    isRead: !!row.isRead,
    createdAt: row.createdAt
  };
}

router.get('/', requireStudent, (req, res) => {
  const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
  const rows = db.prepare(`
    SELECT * FROM notifications
    WHERE userId = ?
    ORDER BY createdAt DESC, id DESC
    LIMIT ?
  `).all(req.user.id, limit);

  const unread = db.prepare(
    'SELECT COUNT(*) AS c FROM notifications WHERE userId = ? AND isRead = 0'
  ).get(req.user.id).c;

  res.json({ notifications: rows.map(toNotification), unread });
});

router.post('/read-all', requireStudent, (req, res) => {
  db.prepare('UPDATE notifications SET isRead = 1 WHERE userId = ? AND isRead = 0')
    .run(req.user.id);
  res.json({ success: true });
});

router.post('/:id/read', requireStudent, (req, res) => {
  const info = db.prepare(
    'UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?'
  ).run(req.params.id, req.user.id);
  if (info.changes === 0) {
    return res.status(404).json({ error: 'Notification introuvable.' });
  }
  res.json({ success: true });
});

router.delete('/:id', requireStudent, (req, res) => {
  db.prepare('DELETE FROM notifications WHERE id = ? AND userId = ?')
    .run(req.params.id, req.user.id);
  res.json({ success: true });
});

export default router;
