import { db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';

/**
 * Récupère la configuration SMTP enregistrée par l'administrateur dans Firestore
 */
export async function getSmtpSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "smtp"));
    if (snap.exists()) {
      return snap.data();
    }
  } catch (err) {
    console.warn("Impossible de récupérer la config SMTP Firestore :", err);
  }
  return {
    email: import.meta.env.VITE_SMTP_EMAIL || '',
    appPassword: import.meta.env.VITE_SMTP_APP_PASSWORD || ''
  };
}

/**
 * Enregistre la configuration SMTP dans Firestore (pour l'admin)
 */
export async function saveSmtpSettings(email, appPassword) {
  await setDoc(doc(db, "settings", "smtp"), {
    email: email.trim(),
    appPassword: appPassword.replace(/\s+/g, ''),
    updatedAt: new Date().toISOString()
  });
}

/**
 * Envoie le code de réinitialisation de mot de passe par mail via le serveur SMTP Google
 */
export async function sendResetCodeEmail(recipientEmail, code, recipientName = 'Étudiant') {
  const smtpConfig = await getSmtpSettings();

  try {
    const response = await fetch('/api/send-reset-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: recipientEmail,
        code,
        name: recipientName,
        smtpEmail: smtpConfig?.email,
        smtpPassword: smtpConfig?.appPassword
      })
    });

    const data = await response.json();
    if (response.ok && data.success) {
      return { success: true, message: 'Un code de confirmation a été envoyé à votre adresse email.' };
    } else {
      return {
        success: false,
        error: data.error || 'Erreur lors de l\'envoi du courriel.',
        simulationCode: code // Permet de continuer si le serveur SMTP externe n'est pas encore configuré
      };
    }
  } catch (err) {
    console.warn("Échec d'appel de l'API d'envoi SMTP (serveur ou réseau indisponible) :", err);
    return {
      success: false,
      error: "Le service d'envoi d'email n'a pas pu être joint.",
      simulationCode: code // Permet le test en local
    };
  }
}

/**
 * Teste la configuration SMTP depuis le panneau d'administration
 */
export async function testSmtpConnection(email, appPassword, testRecipient) {
  try {
    const response = await fetch('/api/test-smtp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        smtpEmail: email.trim(),
        smtpPassword: appPassword.replace(/\s+/g, ''),
        testRecipient: (testRecipient || email).trim()
      })
    });
    const data = await response.json();
    return data;
  } catch (err) {
    return { success: false, error: err.message };
  }
}
