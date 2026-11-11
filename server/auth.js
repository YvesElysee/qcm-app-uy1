/**
 * Utilitaires d'authentification côté serveur :
 * - Hachage de mot de passe (scrypt + sel aléatoire, via node:crypto)
 * - Jetons de session étudiants et administrateur
 * - Middlewares Express de protection des routes
 */
import crypto from 'node:crypto';
import { db } from './db.js';

// ── Mots de passe ─────────────────────────────────────────────────────

/**
 * Hache un mot de passe avec scrypt et un sel aléatoire.
 * Format stocké : scrypt$<sel hex>$<hash hex>
 */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/**
 * Vérifie un mot de passe face au hash stocké (comparaison temps constant)
 */
export function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const candidate = crypto.scryptSync(String(password), parts[1], 64);
  const expected = Buffer.from(parts[2], 'hex');
  if (candidate.length !== expected.length) return false;
  return crypto.timingSafeEqual(candidate, expected);
}

// ── Jetons étudiants ──────────────────────────────────────────────────

/**
 * Crée un jeton de session lié à un étudiant
 */
export function createStudentToken(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO tokens (token, userId, createdAt) VALUES (?, ?, ?)')
    .run(token, userId, new Date().toISOString());
  return token;
}

/**
 * Retrouve l'étudiant associé à un jeton (ou null)
 */
export function getStudentFromToken(token) {
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM tokens t
    JOIN users u ON u.id = t.userId
    WHERE t.token = ?
  `).get(token);
  return row || null;
}

/**
 * Supprime un jeton (déconnexion)
 */
export function deleteStudentToken(token) {
  if (!token) return;
  db.prepare('DELETE FROM tokens WHERE token = ?').run(token);
}

// ── Jetons administrateur ────────────────────────────────────────────

// Durée de vie d'une session administrateur (8 h)
const ADMIN_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;

/**
 * Vérifie le mot de passe administrateur (ADMIN_PASSWORD dans .env)
 */
export function checkAdminPassword(password) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;
  const a = Buffer.from(String(password || ''));
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    // Comparaison factice pour égaliser le temps de réponse
    crypto.timingSafeEqual(Buffer.alloc(16), Buffer.alloc(16));
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

/**
 * Crée un jeton de session administrateur (expiration : 8 h)
 */
export function createAdminToken() {
  // Nettoyage préventif des jetons expirés
  db.prepare('DELETE FROM admin_tokens WHERE createdAt < ?')
    .run(new Date(Date.now() - ADMIN_TOKEN_TTL_MS).toISOString());
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO admin_tokens (token, createdAt) VALUES (?, ?)')
    .run(token, new Date().toISOString());
  return token;
}

/**
 * Vérifie un jeton administrateur (existence + non expiré)
 */
export function isAdminToken(token) {
  if (!token) return false;
  const row = db.prepare('SELECT token, createdAt FROM admin_tokens WHERE token = ?').get(token);
  if (!row) return false;
  if (Date.parse(row.createdAt) + ADMIN_TOKEN_TTL_MS < Date.now()) {
    // Jeton expiré : on le révoque immédiatement
    db.prepare('DELETE FROM admin_tokens WHERE token = ?').run(token);
    return false;
  }
  return true;
}

/**
 * Révoque un jeton administrateur (déconnexion)
 */
export function deleteAdminToken(token) {
  if (!token) return;
  db.prepare('DELETE FROM admin_tokens WHERE token = ?').run(token);
}

// ── Middlewares Express ────────────────────────────────────────────────

/**
 * Extrait le jeton Bearer de l'en-tête Authorization
 */
export function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/**
 * Route réservée à un étudiant connecté (req.user disponible ensuite)
 */
export function requireStudent(req, res, next) {
  const user = getStudentFromToken(bearerToken(req));
  if (!user) {
    return res.status(401).json({ error: 'Session expirée. Veuillez vous reconnecter.' });
  }
  req.user = user;
  next();
}

/**
 * Route ouverte aux étudiants connectés, mais tolérante si non connecté
 * (ex: messages envoyés depuis un QCM). req.user peut être null.
 */
export function optionalStudent(req, _res, next) {
  req.user = getStudentFromToken(bearerToken(req));
  next();
}

/**
 * Route réservée à l'administrateur
 */
export function requireAdmin(req, res, next) {
  if (!isAdminToken(bearerToken(req))) {
    return res.status(401).json({ error: 'Accès administrateur requis.' });
  }
  next();
}
