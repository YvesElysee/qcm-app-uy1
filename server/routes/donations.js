/**
 * Dons volontaires via SasPay (checkout hébergé).
 *
 * Le serveur crée une session de checkout SasPay et renvoie l'URL de paiement.
 * La clé secrète reste côté serveur.
 */
import { Router } from 'express';

const router = Router();

const SASPAY_BASE_URL = (process.env.SASPAY_BASE_URL || 'https://api.saspay.me/api/v1').replace(/\/$/, '');
const SASPAY_CURRENCY = (process.env.SASPAY_CURRENCY || 'XAF').trim().toUpperCase();
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;

function getSecretKey() {
  return (process.env.SASPAY_SECRET_KEY || '').trim();
}

function normalizeAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const amount = Math.round(n);
  if (amount < MIN_AMOUNT || amount > MAX_AMOUNT) return null;
  return amount;
}

function safeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) return email;
  return 'donateur@qcm-app.local';
}

function safeName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  return name || 'Donateur QCM App';
}

function safeReturnUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

/**
 * POST /api/donations/checkout
 * Body: { amount, name?, email?, returnUrl? }
 */
router.post('/checkout', async (req, res) => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    return res.status(503).json({
      error: 'Le service de don n’est pas encore configuré. Merci de réessayer plus tard.'
    });
  }

  const amount = normalizeAmount(req.body?.amount);
  if (!amount) {
    return res.status(400).json({
      error: `Montant invalide. Choisissez un montant entre ${MIN_AMOUNT} et ${MAX_AMOUNT} FCFA.`
    });
  }

  const customerName = safeName(req.body?.name);
  const customerEmail = safeEmail(req.body?.email);
  const returnUrl = safeReturnUrl(req.body?.returnUrl);

  const payload = {
    amount: amount.toFixed(2),
    currency: SASPAY_CURRENCY,
    description: `Don volontaire QCM App - ${amount} FCFA`,
    customer_email: customerEmail,
    customer_name: customerName,
    ...(returnUrl ? { return_url: returnUrl } : {}),
    metadata: {
      source: 'qcm-app',
      type: 'donation'
    }
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(`${SASPAY_BASE_URL}/checkout-sessions/`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    }).finally(() => clearTimeout(timer));

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const msg = data?.message || data?.error || data?.data?.message || 'Impossible de créer la session de paiement.';
      console.error('[donations] SasPay error:', response.status, msg);
      return res.status(502).json({ error: 'Impossible d’initier le paiement pour le moment. Merci de réessayer.' });
    }

    const checkoutUrl = data?.data?.checkout_url || data?.checkout_url;
    if (!checkoutUrl) {
      console.error('[donations] Réponse SasPay sans checkout_url:', data);
      return res.status(502).json({ error: 'Réponse de paiement invalide. Merci de réessayer.' });
    }

    return res.json({ checkoutUrl });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error('[donations] Erreur checkout:', aborted ? 'timeout' : err?.message || err);
    return res.status(502).json({
      error: aborted
        ? 'Le service de paiement met trop de temps à répondre. Merci de réessayer.'
        : 'Impossible d’initier le paiement pour le moment. Merci de réessayer.'
    });
  }
});

export default router;
