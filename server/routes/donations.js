/**
 * Dons volontaires via SasPay (softpay mobile money).
 *
 * Le flux : le serveur initie un paiement softpay, le donateur reçoit un push
 * USSD sur son téléphone et valide. Le frontend sonde le statut jusqu'à succès.
 * La clé secrète reste côté serveur.
 */
import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const router = Router();

const SASPAY_BASE_URL = (process.env.SASPAY_BASE_URL || 'https://api.saspay.me/api/v1').replace(/\/$/, '');
const SASPAY_CURRENCY = (process.env.SASPAY_CURRENCY || 'XAF').trim().toUpperCase();
const SASPAY_COUNTRY = (process.env.SASPAY_COUNTRY || 'CM').trim().toUpperCase();
const MIN_AMOUNT = 100;
const MAX_AMOUNT = 500000;

const ALLOWED_NETWORKS = new Set(['mtn_cm', 'orange_cm']);

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

function splitName(value) {
  const clean = String(value || '').trim().replace(/\s+/g, ' ').slice(0, 80);
  if (!clean) return { first: 'Donateur', last: 'QCM' };
  const parts = clean.split(' ');
  return { first: parts[0].slice(0, 40), last: (parts.slice(1).join(' ') || 'QCM').slice(0, 40) };
}

function normalizePhone(value) {
  const raw = String(value || '').trim().replace(/[\s().-]/g, '');
  if (!raw) return '';
  const withPlus = raw.startsWith('+') ? raw : raw.startsWith('00') ? `+${raw.slice(2)}` : raw;
  // Accept local CM (6xxxxxxxx/2xxxxxxxx, 9 digits) or +237xxxxxxxxx
  if (/^\+237[26]\d{8}$/.test(withPlus)) return withPlus;
  if (/^[26]\d{8}$/.test(withPlus)) return `+237${withPlus}`;
  if (/^237[26]\d{8}$/.test(withPlus)) return `+${withPlus}`;
  return '';
}

function sasHeaders(secretKey, idempotencyKey) {
  const h = {
    'Authorization': `Bearer ${secretKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  };
  if (idempotencyKey) h['Idempotency-Key'] = idempotencyKey;
  return h;
}

async function sasFetch(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const data = await res.json().catch(() => null);
    return { res, data };
  } finally {
    clearTimeout(timer);
  }
}

function pickData(data) {
  if (!data || typeof data !== 'object') return {};
  return (data.data && typeof data.data === 'object') ? data.data : data;
}

/**
 * POST /api/donations/initiate
 * Body: { amount, name?, email?, phone, network }
 */
router.post('/initiate', async (req, res) => {
  const secretKey = getSecretKey();
  if (!secretKey) {
    return res.status(503).json({
      error: 'Le service de don n’est pas encore configuré. Merci de réessayer plus tard.'
    });
  }

  const amount = normalizeAmount(req.body?.amount);
  if (!amount) {
    return res.status(400).json({ error: `Montant invalide. Choisissez entre ${MIN_AMOUNT} et ${MAX_AMOUNT} FCFA.` });
  }

  const network = String(req.body?.network || '').trim().toLowerCase();
  if (!ALLOWED_NETWORKS.has(network)) {
    return res.status(400).json({ error: 'Réseau mobile money invalide. Choisissez MTN ou Orange.' });
  }

  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    return res.status(400).json({ error: 'Numéro de téléphone invalide. Exemple : 6XXXXXXXX ou +2376XXXXXXXX.' });
  }

  const { first, last } = splitName(req.body?.name);
  const email = safeEmail(req.body?.email);

  const payload = {
    amount: amount.toFixed(2),
    currency: SASPAY_CURRENCY,
    country: SASPAY_COUNTRY,
    network,
    description: `Don volontaire QCM App - ${amount} FCFA`,
    customer: {
      email,
      first_name: first,
      last_name: last,
      phone
    },
    metadata: { source: 'qcm-app', type: 'donation' }
  };

  try {
    const { res: sr, data } = await sasFetch(`${SASPAY_BASE_URL}/payments/softpay/`, {
      method: 'POST',
      headers: sasHeaders(secretKey, randomUUID()),
      body: JSON.stringify(payload)
    });

    const body = pickData(data);
    if (!sr.ok) {
      const msg = body?.message || body?.detail || data?.message || data?.error?.message || data?.error?.detail || (typeof data?.error === 'string' ? data.error : '') || 'initiation échouée';
      const code = body?.code || data?.code || data?.error?.code || '';
      const safeMsg = typeof msg === 'string' ? msg.slice(0, 220) : '';
      console.error('[donations] SasPay initiate error:', sr.status, code, safeMsg, 'payload=', JSON.stringify({ amount: payload.amount, currency: payload.currency, country: payload.country, network: payload.network, phone: payload.customer?.phone }));
      console.error('[donations] SasPay initiate response:', JSON.stringify(data));
      if (sr.status === 401 || sr.status === 403) {
        return res.status(502).json({ error: 'Le service de don est mal configuré côté serveur. Contactez l’administrateur.' });
      }
      if (sr.status === 429) {
        return res.status(503).json({ error: 'Trop de demandes. Merci de patienter quelques instants puis réessayez.' });
      }
      if (sr.status === 400 || sr.status === 422) {
        return res.status(422).json({ error: safeMsg || 'Paiement impossible avec ces informations. Vérifiez le numéro et le réseau.' });
      }
      return res.status(502).json({
        error: safeMsg || 'Impossible d’initier le paiement. Vérifiez le numéro et réessayez.'
      });
    }

    const paymentId = body?.id || body?.payment_id;
    if (!paymentId) {
      console.error('[donations] SasPay sans id:', data);
      return res.status(502).json({ error: 'Réponse de paiement invalide. Merci de réessayer.' });
    }

    return res.json({
      paymentId,
      status: body?.status || 'PENDING',
      checkoutUrl: body?.checkout_url || '',
      instructions: body?.instructions || ''
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error('[donations] Erreur initiate:', aborted ? 'timeout' : err?.message || err);
    return res.status(502).json({
      error: aborted ? 'Le service de paiement met trop de temps à répondre.' : 'Impossible d’initier le paiement pour le moment.'
    });
  }
});

/**
 * GET /api/donations/status/:id
 * Vérifie le statut réel du paiement auprès de SasPay.
 */
router.get('/status/:id', async (req, res) => {
  const secretKey = getSecretKey();
  if (!secretKey) return res.status(503).json({ error: 'Service de don non configuré.' });

  const id = String(req.params.id || '').trim();
  if (!/^[a-zA-Z0-9-]{10,80}$/.test(id)) {
    return res.status(400).json({ error: 'Identifiant de paiement invalide.' });
  }

  try {
    const { res: sr, data } = await sasFetch(`${SASPAY_BASE_URL}/payments/${encodeURIComponent(id)}/verify/`, {
      method: 'GET',
      headers: sasHeaders(secretKey)
    });
    const body = pickData(data);
    if (!sr.ok) {
      const msg = body?.message || data?.message || 'vérification échouée';
      console.error('[donations] SasPay verify error:', sr.status, msg);
      return res.status(502).json({ error: 'Impossible de vérifier le paiement pour le moment.' });
    }
    return res.json({
      paymentId: body?.id || id,
      status: body?.status || 'PENDING',
      failureReason: body?.failure_reason || body?.message || ''
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error('[donations] Erreur verify:', aborted ? 'timeout' : err?.message || err);
    return res.status(502).json({ error: 'Impossible de vérifier le paiement pour le moment.' });
  }
});

export default router;
