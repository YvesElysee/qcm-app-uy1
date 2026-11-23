/**
 * Couche d'accès à l'API REST (Node.js/Express) · remplace Firebase Firestore.
 * Toutes les données transitent désormais par /api/* avec jetons Bearer :
 *  - 'student' : jeton de session étudiant (localStorage userSession)
 *  - 'admin'   : jeton administrateur (sessionStorage adminToken)
 */

import { ADMIN_LOGIN_PATH } from '../config';

function getSession() {
  try {
    return JSON.parse(localStorage.getItem('userSession')) || null;
  } catch {
    return null;
  }
}

function getStudentToken() {
  return getSession()?.token || null;
}

function getAdminToken() {
  return sessionStorage.getItem('adminToken') || null;
}

// ── Cache local pour le mode hors ligne ─────────────────────────────────
// Seules les lectures utiles hors connexion sont conservées : cours, UE,
// QCM et derniers résultats de l'étudiant. Jamais d'écriture ni d'auth.
const OFFLINE_PREFIX = 'qcm_offline_cache:';
const OFFLINE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const CACHEABLE_GET = new Set(['/ues', '/quizzes', '/resources', '/results/mine', '/stats']);

function offlineKey(path) {
  const identity = getSession()?.id || 'anon';
  return `${OFFLINE_PREFIX}${identity}:${path}`;
}

function saveOffline(path, data) {
  try {
    localStorage.setItem(offlineKey(path), JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Quota dépassé ou stockage indisponible : on continue sans cache.
  }
}

function readOffline(path) {
  try {
    const raw = localStorage.getItem(offlineKey(path));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at) return null;
    if (Date.now() - parsed.at > OFFLINE_MAX_AGE) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

/**
 * Appelle l'API et lève une Error avec le message serveur en cas d'échec.
 * @param {string} path    Chemin relatif (ex: '/quizzes/INF232')
 * @param {object} options { method, body, auth: 'student' | 'admin' | null, signal }
 */
export async function api(path, { method = 'GET', body, auth, signal } = {}) {
  const basePath = path.split('?')[0];
  const canCache = method === 'GET' && CACHEABLE_GET.has(basePath);
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (auth === 'student') {
    const token = getStudentToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  } else if (auth === 'admin') {
    const token = getAdminToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    // Pas de réseau : on sert la dernière copie enregistrée si elle existe.
    if (canCache) {
      const cached = readOffline(path);
      if (cached) {
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('qcm:offline-cache'));
        // On renvoie la copie telle quelle : certains endpoints renvoient un
        // tableau et ne doivent pas être transformés en objet.
        return cached;
      }
    }
    throw new Error('Le serveur est injoignable. Vérifiez que l\'API est démarrée.', { cause: err });
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Session étudiante expirée : on nettoie pour forcer une reconnexion
    if (res.status === 401 && auth === 'student') {
      localStorage.removeItem('userSession');
    }
    // Session administrateur expirée / révoquée : nettoyage + retour à la connexion
    if (res.status === 401 && auth === 'admin') {
      sessionStorage.removeItem('adminAuth');
      sessionStorage.removeItem('adminToken');
      if (!location.pathname.startsWith(ADMIN_LOGIN_PATH)) {
        location.href = `${ADMIN_LOGIN_PATH}?expired=1`;
      }
    }
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  if (canCache) saveOffline(path, data);
  return data;
}

/**
 * Stocke la session étudiante (même forme que l'ancien localStorage, + jeton)
 */
export function saveSession(sessionWithToken) {
  localStorage.setItem('userSession', JSON.stringify(sessionWithToken));
  localStorage.setItem('qcm_last_name', sessionWithToken.name);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('qcm:auth-changed'));
}

/**
 * Met à jour la session locale après un changement de profil
 */
export function updateLocalSession(updates) {
  const cur = getSession();
  if (cur) {
    localStorage.setItem('userSession', JSON.stringify({ ...cur, ...updates }));
    if (updates.name) localStorage.setItem('qcm_last_name', updates.name);
  }
}

export { getSession };
