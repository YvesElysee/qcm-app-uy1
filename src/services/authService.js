import { api, saveSession, updateLocalSession, getSession } from './api';

/**
 * Authentification étudiant — délègue désormais tout au backend Node.js.
 * Les signatures restent identiques à l'époque Firestore pour ne pas
 * modifier la logique des composants.
 *
 * Sécurité : les mots de passe ne sont plus hachés côté navigateur,
 * ils sont vérifiés par le serveur (scrypt) qui délivre un jeton de session.
 */

/**
 * Enregistre un nouvel étudiant via l'API
 */
export async function registerStudent({
  name,
  email,
  password,
  filiere,
  niveau,
  anneeAcademique,
  dateNaissance
}) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const cleanName = String(name || '').trim();

  if (!cleanEmail || !password || !cleanName) {
    throw new Error("Veuillez renseigner les champs obligatoires (Nom, Email, Mot de passe).");
  }

  if (password.length < 6) {
    throw new Error("Le mot de passe doit comporter au moins 6 caractères.");
  }

  const data = await api('/auth/register', {
    method: 'POST',
    auth: null,
    body: {
      name: cleanName,
      email: cleanEmail,
      password,
      filiere,
      niveau,
      anneeAcademique,
      dateNaissance
    }
  });

  // Sauvegarde de la session locale (avec le jeton)
  const session = { ...data.user, token: data.token };
  saveSession(session);
  return session;
}

/**
 * Connecte un étudiant avec son email et mot de passe
 */
export async function loginStudent(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();

  const data = await api('/auth/login', {
    method: 'POST',
    auth: null,
    body: { email: cleanEmail, password }
  });

  const session = { ...data.user, token: data.token };
  saveSession(session);
  return session;
}

/**
 * Déconnecte l'étudiant (révoque le jeton côté serveur)
 */
export function logoutStudent() {
  // Révocation best-effort (fire & forget), puis nettoyage local immédiat
  api('/auth/logout', { method: 'POST', auth: 'student' }).catch(() => {});
  localStorage.removeItem('userSession');
}

/**
 * Récupère l'utilisateur actuellement connecté
 */
export function getCurrentUser() {
  return getSession();
}

/**
 * Met à jour le profil de l'étudiant connecté (nom, date de naissance)
 */
export async function updateStudentProfile(email, updates) {
  void email; // l'identité est désormais déduite du jeton côté serveur
  const data = await api('/auth/profile', { method: 'PUT', auth: 'student', body: updates });
  updateLocalSession(data.user);
  return data.user;
}

/**
 * Change le mot de passe de l'étudiant connecté (depuis le profil)
 */
export async function changeStudentPassword(email, oldPassword, newPassword) {
  void email;
  await api('/auth/change-password', {
    method: 'POST',
    auth: 'student',
    body: { oldPassword, newPassword }
  });
  return { success: true };
}

/**
 * Étape 1 : Demande un code de réinitialisation de mot de passe.
 * Le code est généré ET envoyé par le serveur (SMTP Google).
 */
export async function requestPasswordReset(email) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  return api('/auth/forgot-password', { method: 'POST', body: { email: cleanEmail } });
}

/**
 * Étape 2 : Vérifie le code à 6 chiffres
 */
export async function verifyResetCode(email, code) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const data = await api('/auth/verify-reset-code', {
    method: 'POST',
    body: { email: cleanEmail, code: String(code || '').trim() }
  });
  return { valid: true, resetDocId: data.resetId };
}

/**
 * Étape 3 : Réinitialise le mot de passe avec le code vérifié
 */
export async function completePasswordReset(email, code, newPassword) {
  if (newPassword.length < 6) {
    throw new Error("Le nouveau mot de passe doit comporter au moins 6 caractères.");
  }
  const cleanEmail = String(email || '').trim().toLowerCase();
  return api('/auth/reset-password', {
    method: 'POST',
    body: { email: cleanEmail, code: String(code || '').trim(), newPassword }
  });
}
