/**
 * Routes des paramètres système · /api/settings
 * - Configuration SMTP Google (lecture/écriture réservées à l'admin)
 * - Test de connexion SMTP en temps réel (ancien /api/test-smtp du plugin Vite)
 */
import { Router } from 'express';
import { getSetting, setSetting } from '../db.js';
import { requireAdmin } from '../auth.js';
import { testSmtpConnection } from '../smtp.js';

const router = Router();

/**
 * Lecture de la configuration SMTP (repli sur le .env si jamais saisie en admin)
 */
router.get('/smtp', requireAdmin, (_req, res) => {
  const stored = getSetting('smtp') || {};
  res.json({
    email: stored.email || process.env.SMTP_EMAIL || '',
    appPassword: stored.appPassword || process.env.SMTP_APP_PASSWORD || ''
  });
});

/**
 * Enregistrement de la configuration SMTP saisie par l'administrateur
 */
router.put('/smtp', requireAdmin, (req, res) => {
  const { email, appPassword } = req.body || {};
  if (!email || !appPassword) {
    return res.status(400).json({ error: 'Adresse Gmail et mot de passe d\'application requis.' });
  }
  setSetting('smtp', {
    email: String(email).trim(),
    appPassword: String(appPassword).replace(/\s+/g, ''),
    updatedAt: new Date().toISOString()
  });
  res.json({ success: true });
});

/**
 * Test d'envoi d'email (outil temps réel du panneau admin)
 */
router.post('/test-smtp', requireAdmin, async (req, res) => {
  const result = await testSmtpConnection(req.body || {});
  res.status(result.success ? 200 : 400).json(result);
});

export default router;
