/**
 * Jetons de notifications push · /api/push
 * Le jeton est lié au compte étudiant : aucun token n'est partagé.
 */
import { Router } from 'express';
import { requireStudent } from '../auth.js';
import { savePushToken, removePushToken, isPushReady } from '../push.js';

const router = Router();

router.post('/token', requireStudent, (req, res) => {
  const token = String(req.body?.token || '').trim();
  const platform = String(req.body?.platform || 'android');
  if (!token) return res.status(400).json({ error: 'Jeton manquant.' });
  const ok = savePushToken(req.user.id, token, platform);
  if (!ok) return res.status(500).json({ error: "Enregistrement du jeton impossible." });
  return res.json({ ok: true, enabled: isPushReady() });
});

router.delete('/token', requireStudent, (req, res) => {
  const token = String(req.body?.token || req.query?.token || '').trim();
  removePushToken(req.user.id, token);
  return res.json({ ok: true });
});

export default router;
