/**
 * Notifications push Android via Firebase Cloud Messaging.
 *
 * La configuration reste optionnelle : sans `FIREBASE_SERVICE_ACCOUNT_JSON`
 * (ou `GOOGLE_APPLICATION_CREDENTIALS`), le serveur démarre normalement et
 * les notifications push sont simplement désactivées.
 */
import { db } from './db.js';
import { normalizeFaculte, quizFaculte } from './access.js';

let messaging = null;
let ready = false;

export async function initPush() {
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const hasDefault = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!raw && !hasDefault) {
      console.log('[push] Firebase non configuré · notifications push désactivées');
      return;
    }
    const { default: admin } = await import('firebase-admin');
    const serviceAccount = raw ? JSON.parse(raw) : undefined;
    const app = admin.apps.length
      ? admin.app()
      : admin.initializeApp({
          credential: serviceAccount
            ? admin.credential.cert(serviceAccount)
            : admin.credential.applicationDefault()
        });
    messaging = app.messaging();
    ready = true;
    console.log('[push] Firebase Cloud Messaging actif');
  } catch (err) {
    console.warn('[push] Activation impossible :', err.message);
  }
}

export function isPushReady() {
  return ready;
}

export function savePushToken(userId, token, platform = 'android') {
  if (!userId || !token || typeof token !== 'string') return false;
  try {
    db.prepare(`
      INSERT INTO push_tokens (token, userId, platform, createdAt)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET userId = excluded.userId, platform = excluded.platform
    `).run(token.slice(0, 512), userId, String(platform).slice(0, 30), new Date().toISOString());
    return true;
  } catch (err) {
    console.warn('[push] Enregistrement du jeton impossible :', err.message);
    return false;
  }
}

export function removePushToken(userId, token) {
  if (!userId || !token) return false;
  try {
    return db.prepare('DELETE FROM push_tokens WHERE userId = ? AND token = ?').run(userId, token).changes > 0;
  } catch {
    return false;
  }
}

/**
 * Envoie une notification à tous les appareils des utilisateurs fournis.
 * Les jetons invalides sont supprimés pour éviter les envois inutiles.
 */
export async function sendPushToUsers(userIds, { title, body, link = '' }) {
  if (!ready || !messaging || !Array.isArray(userIds) || userIds.length === 0) return 0;
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return 0;

  const placeholders = unique.map(() => '?').join(',');
  const tokens = db.prepare(
    `SELECT token FROM push_tokens WHERE userId IN (${placeholders})`
  ).all(...unique).map(r => r.token);
  if (!tokens.length) return 0;

  let sent = 0;
  for (const token of tokens) {
    try {
      await messaging.send({
        token,
        notification: { title: String(title).slice(0, 200), body: String(body || '').slice(0, 400) },
        android: { notification: { channelId: 'qcm-app' } },
        data: { link: String(link), url: String(link) }
      });
      sent += 1;
    } catch (err) {
      const code = err?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-registration-token')) {
        db.prepare('DELETE FROM push_tokens WHERE token = ?').run(token);
      }
      console.warn('[push] Envoi impossible :', code || err.message);
    }
  }
  return sent;
}

function quizLabel(quiz) {
  const ue = quiz.ue || quiz.id;
  return quiz.title && quiz.title !== ue ? `${quiz.title} (${ue})` : ue;
}

function formatLaunch(ts) {
  try {
    return new Date(Number(ts)).toLocaleString('fr-FR', {
      weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'
    });
  } catch {
    return '';
  }
}

function studentsForQuiz(quiz) {
  const faculte = normalizeFaculte(quizFaculte(quiz));
  return db.prepare(`
    SELECT DISTINCT u.id
    FROM users u
    JOIN push_tokens p ON p.userId = u.id
    WHERE LOWER(TRIM(u.filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(u.niveau)) = LOWER(TRIM(?))
      AND UPPER(COALESCE(NULLIF(TRIM(u.faculte), ''), 'FACSCIENCES')) = ?
  `).all(String(quiz.filiere || ''), String(quiz.niveau || ''), faculte).map(r => r.id);
}

const WINDOWS = [
  {
    key: '24h',
    before: 24 * 60 * 60 * 1000,
    title: 'QCM demain',
    body: (label, when) => `Le QCM ${label} est programmé pour le ${when}.`
  },
  {
    key: '1h',
    before: 60 * 60 * 1000,
    title: 'QCM dans 1 heure',
    body: (label, when) => `Le QCM ${label} commence à ${when}. Connectez-vous dès maintenant.`
  }
];

/**
 * Deux rappels par épreuve : 24 h et 1 h avant l'ouverture.
 * Le tolérance de 10 minutes absorbe un redémarrage du serveur.
 */
export async function sendDueReminders() {
  if (!ready) return 0;
  const now = Date.now();
  const quizzes = db.prepare(
    'SELECT * FROM quizzes WHERE launchTime IS NOT NULL AND questionCount > 0'
  ).all();

  let sent = 0;
  for (const quiz of quizzes) {
    const launch = Number(quiz.launchTime);
    const label = quizLabel(quiz);
    const when = formatLaunch(launch);
    const link = `/dashboard?quiz=${encodeURIComponent(quiz.id)}`;

    for (const window of WINDOWS) {
      const target = launch - window.before;
      if (now < target || now > target + 10 * 60 * 1000) continue;
      const already = db.prepare(
        'SELECT 1 FROM quiz_reminders WHERE quizId = ? AND offsetKey = ?'
      ).get(quiz.id, window.key);
      if (already) continue;

      const users = studentsForQuiz(quiz);
      const count = await sendPushToUsers(users, {
        title: `${window.title} · ${label}`,
        body: window.body(label, when),
        link
      });
      db.prepare(
        'INSERT OR IGNORE INTO quiz_reminders (quizId, offsetKey, sentAt) VALUES (?, ?, ?)'
      ).run(quiz.id, window.key, new Date().toISOString());
      sent += count;
    }
  }
  return sent;
}

export function startReminderScheduler() {
  const run = () => {
    sendDueReminders().catch(err => console.warn('[push] Rappels impossibles :', err.message));
  };
  run();
  const timer = setInterval(run, 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}
