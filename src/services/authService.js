import { db } from '../firebase';
import {
  collection, doc, getDoc, setDoc, getDocs,
  query, where, updateDoc
} from 'firebase/firestore';
import { sendResetCodeEmail } from './emailService';

/**
 * Hache un mot de passe en SHA-256
 */
export async function hashPassword(password) {
  const msgBuffer = new TextEncoder().encode(password + "_uy1_qcm_salt_2026");
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Normalise un ID basé sur l'email
 */
export function sanitizeEmailDocId(email) {
  return email.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/**
 * Enregistre un nouvel étudiant dans Firestore
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
  const cleanEmail = email.trim().toLowerCase();
  const cleanName = name.trim();

  if (!cleanEmail || !password || !cleanName) {
    throw new Error("Veuillez renseigner les champs obligatoires (Nom, Email, Mot de passe).");
  }

  if (password.length < 6) {
    throw new Error("Le mot de passe doit comporter au moins 6 caractères.");
  }

  // Vérifier si l'email existe déjà
  const docId = sanitizeEmailDocId(cleanEmail);
  const userRef = doc(db, "users", docId);
  const existing = await getDoc(userRef);

  if (existing.exists()) {
    throw new Error("Un compte existe déjà avec cette adresse email.");
  }

  // Hachage du mot de passe
  const passwordHash = await hashPassword(password);

  const userData = {
    id: docId,
    name: cleanName,
    email: cleanEmail,
    passwordHash,
    filiere: filiere || 'Informatique',
    niveau: niveau || 'L1',
    anneeAcademique: anneeAcademique || '2025-2026',
    dateNaissance: dateNaissance || '',
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString()
  };

  await setDoc(userRef, userData);

  // Sauvegarde de la session locale
  const session = {
    uid: docId,
    name: userData.name,
    email: userData.email,
    filiere: userData.filiere,
    niveau: userData.niveau,
    anneeAcademique: userData.anneeAcademique,
    dateNaissance: userData.dateNaissance
  };
  localStorage.setItem('userSession', JSON.stringify(session));
  localStorage.setItem('qcm_last_name', userData.name);

  return session;
}

/**
 * Connecte un étudiant avec son email et mot de passe
 */
export async function loginStudent(email, password) {
  const cleanEmail = email.trim().toLowerCase();
  const docId = sanitizeEmailDocId(cleanEmail);
  const userRef = doc(db, "users", docId);
  let userSnap = await getDoc(userRef);

  // Si non trouvé par doc ID, tentative par requête where
  if (!userSnap.exists()) {
    const qSnap = await getDocs(query(collection(db, "users"), where("email", "==", cleanEmail)));
    if (qSnap.empty) {
      throw new Error("Adresse email ou mot de passe incorrect.");
    }
    userSnap = qSnap.docs[0];
  }

  const userData = userSnap.data();
  const inputHash = await hashPassword(password);

  if (inputHash !== userData.passwordHash) {
    throw new Error("Adresse email ou mot de passe incorrect.");
  }

  // Mettre à jour lastLogin
  await updateDoc(userSnap.ref, { lastLogin: new Date().toISOString() }).catch(() => {});

  const session = {
    uid: userSnap.id,
    name: userData.name,
    email: userData.email,
    filiere: userData.filiere,
    niveau: userData.niveau,
    anneeAcademique: userData.anneeAcademique,
    dateNaissance: userData.dateNaissance || ''
  };

  localStorage.setItem('userSession', JSON.stringify(session));
  localStorage.setItem('qcm_last_name', userData.name);

  return session;
}

/**
 * Déconnecte l'étudiant
 */
export function logoutStudent() {
  localStorage.removeItem('userSession');
}

/**
 * Récupère l'utilisateur actuellement connecté
 */
export function getCurrentUser() {
  try {
    const s = localStorage.getItem('userSession');
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

/**
 * Met à jour le profil de l'étudiant
 */
export async function updateStudentProfile(email, updates) {
  const docId = sanitizeEmailDocId(email);
  const userRef = doc(db, "users", docId);
  await updateDoc(userRef, {
    ...updates,
    updatedAt: new Date().toISOString()
  });

  const cur = getCurrentUser();
  if (cur && cur.email.toLowerCase() === email.toLowerCase()) {
    const updated = { ...cur, ...updates };
    localStorage.setItem('userSession', JSON.stringify(updated));
    if (updates.name) localStorage.setItem('qcm_last_name', updates.name);
  }
}

/**
 * Étape 1 : Demande un code de réinitialisation de mot de passe
 */
export async function requestPasswordReset(email) {
  const cleanEmail = email.trim().toLowerCase();
  const docId = sanitizeEmailDocId(cleanEmail);
  const userSnap = await getDoc(doc(db, "users", docId));

  if (!userSnap.exists()) {
    throw new Error("Aucun compte associé à cette adresse email.");
  }

  const userData = userSnap.data();

  // Génération d'un code aléatoire à 6 chiffres
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const resetId = `${docId}_${Date.now()}`;

  // Sauvegarde dans Firestore (valable 15 minutes)
  await setDoc(doc(db, "password_resets", resetId), {
    email: cleanEmail,
    code,
    expiresAt: Date.now() + 15 * 60 * 1000,
    used: false,
    createdAt: new Date().toISOString()
  });

  // Envoi de l'email via le service SMTP Google (Gmail avec mot de passe d'application à 16 caractères)
  const sendResult = await sendResetCodeEmail(cleanEmail, code, userData.name);

  return {
    success: true,
    resetId,
    email: cleanEmail,
    emailSent: sendResult.success,
    simulationCode: sendResult.simulationCode,
    message: sendResult.success
      ? "Un code de confirmation a été envoyé à votre adresse email."
      : "Code de récupération généré avec succès."
  };
}

/**
 * Étape 2 : Vérifie le code à 6 chiffres
 */
export async function verifyResetCode(email, code) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.trim();

  const q = query(
    collection(db, "password_resets"),
    where("email", "==", cleanEmail),
    where("code", "==", cleanCode),
    where("used", "==", false)
  );

  const snap = await getDocs(q);
  if (snap.empty) {
    throw new Error("Code de vérification invalide ou déjà utilisé.");
  }

  const validDoc = snap.docs.find(d => d.data().expiresAt > Date.now());
  if (!validDoc) {
    throw new Error("Le code de vérification a expiré (validité de 15 minutes). Veuillez refaire une demande.");
  }

  return { valid: true, resetDocId: validDoc.id };
}

/**
 * Étape 3 : Réinitialise le mot de passe avec le code vérifié
 */
export async function completePasswordReset(email, code, newPassword) {
  if (newPassword.length < 6) {
    throw new Error("Le nouveau mot de passe doit comporter au moins 6 caractères.");
  }

  const cleanEmail = email.trim().toLowerCase();
  const verification = await verifyResetCode(cleanEmail, code);

  // Mettre à jour le mot de passe de l'utilisateur
  const docId = sanitizeEmailDocId(cleanEmail);
  const passwordHash = await hashPassword(newPassword);

  await updateDoc(doc(db, "users", docId), {
    passwordHash,
    updatedAt: new Date().toISOString()
  });

  // Marquer le code comme utilisé
  await updateDoc(doc(db, "password_resets", verification.resetDocId), {
    used: true,
    usedAt: new Date().toISOString()
  });

  return { success: true };
}
