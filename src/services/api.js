/**
 * Couche d'accès à l'API REST (Node.js/Express) — remplace Firebase Firestore.
 * Toutes les données transitent désormais par /api/* avec jetons Bearer :
 *  - 'student' : jeton de session étudiant (localStorage userSession)
 *  - 'admin'   : jeton administrateur (sessionStorage adminToken)
 */

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

/**
 * Appelle l'API et lève une Error avec le message serveur en cas d'échec.
 * @param {string} path    Chemin relatif (ex: '/quizzes/INF232')
 * @param {object} options { method, body, auth: 'student' | 'admin' | null }
 */
export async function api(path, { method = 'GET', body, auth } = {}) {
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
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new Error('Le serveur est injoignable. Vérifiez que l\'API est démarrée.');
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
      if (!location.pathname.startsWith('/admin-login')) {
        location.href = '/admin-login?expired=1';
      }
    }
    throw new Error(data.error || `Erreur ${res.status}`);
  }

  return data;
}

/**
 * Stocke la session étudiante (même forme que l'ancien localStorage, + jeton)
 */
export function saveSession(sessionWithToken) {
  localStorage.setItem('userSession', JSON.stringify(sessionWithToken));
  localStorage.setItem('qcm_last_name', sessionWithToken.name);
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
