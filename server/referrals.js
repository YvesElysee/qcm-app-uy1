/**
 * Parrainage étudiant.
 *
 * Chaque étudiant possède un code unique (dérivé de son nom). Un nouvel
 * inscrit peut présenter un code (`?ref=CODE`) : il est rattaché à son parrain
 * et le parrain gagne des privilèges symboliques (badge Ambassadeur, puis
 * priorité à partir de 3 filleuls).
 */
import crypto from 'node:crypto';
import { db } from './db.js';
import { slugify } from './access.js';
import { createNotification } from './notifications.js';

function randomSuffix() {
  return crypto.randomBytes(3).toString('hex');
}

/**
 * Retourne (et crée au besoin) le code de parrainage d'un utilisateur.
 */
export function ensureReferralCode(userOrId) {
  const userId = typeof userOrId === 'string' ? userOrId : userOrId?.id;
  if (!userId) return '';

  const row = db.prepare('SELECT id, name, referralCode FROM users WHERE id = ?').get(userId);
  if (!row) return '';
  if (row.referralCode) return row.referralCode;

  const base = slugify(row.name).slice(0, 24) || 'etudiant';
  let code = `${base}-${randomSuffix()}`;
  // Collision (très improbable) : on régénère.
  for (let i = 0; i < 5; i += 1) {
    const exists = db.prepare('SELECT id FROM users WHERE referralCode = ?').get(code);
    if (!exists) break;
    code = `${base}-${randomSuffix()}`;
  }

  db.prepare('UPDATE users SET referralCode = ?, updatedAt = ? WHERE id = ?')
    .run(code, new Date().toISOString(), userId);
  return code;
}

export function findReferrerByCode(code) {
  const clean = String(code || '').trim();
  if (!clean) return null;
  return db.prepare(`
    SELECT id, name, email, faculte, filiere, niveau, referralCode
    FROM users
    WHERE LOWER(TRIM(referralCode)) = LOWER(TRIM(?))
    LIMIT 1
  `).get(clean) || null;
}

export function referralCountOf(userId) {
  if (!userId) return 0;
  return db.prepare('SELECT COUNT(*) AS c FROM referrals WHERE referrerId = ?').get(userId).c;
}

/**
 * Privilèges visibles d'un parrain.
 * - 1 filleul  → badge « Ambassadeur »
 * - 3 filleuls → priorité (traitement prioritaire, badge doré)
 */
export function privilegesOf(userId) {
  const count = referralCountOf(userId);
  const ambassador = count >= 1;
  const priority = count >= 3;
  return {
    referralCount: count,
    ambassador,
    priority,
    badge: priority ? 'Ambassadeur prioritaire' : ambassador ? 'Ambassadeur' : ''
  };
}

/**
 * Rattache un nouvel inscrit à un parrain via son code.
 * Retourne `null` si le code est inconnu, déjà utilisé ou appartient au filleul.
 */
export function attachReferral(userId, code) {
  const clean = String(code || '').trim();
  if (!userId || !clean) return null;

  const user = db.prepare('SELECT id, name, referredBy FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  if (user.referredBy) return null;

  const referrer = findReferrerByCode(clean);
  if (!referrer || referrer.id === userId) return null;

  const now = new Date().toISOString();
  db.prepare('UPDATE users SET referredBy = ?, updatedAt = ? WHERE id = ?')
    .run(referrer.id, now, userId);

  const info = db.prepare(`
    INSERT OR IGNORE INTO referrals (referrerId, referredUserId, code, createdAt)
    VALUES (?, ?, ?, ?)
  `).run(referrer.id, userId, referrer.referralCode || clean, now);

  if (info.changes > 0) {
    const count = referralCountOf(referrer.id);
    createNotification({
      userId: referrer.id,
      type: 'referral_joined',
      title: 'Un filleul a rejoint QCM App',
      message: `${user.name || 'Un étudiant'} s'est inscrit avec votre code de parrainage. Vous avez désormais ${count} filleul(s).`,
      link: '/dashboard',
      entityKey: `referral:${userId}`
    });
  }

  return {
    referrerId: referrer.id,
    referrerName: referrer.name,
    referralCode: referrer.referralCode || clean,
    count: referralCountOf(referrer.id)
  };
}
