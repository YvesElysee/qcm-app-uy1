import { api } from './api';

/**
 * Service de configuration SMTP Google & test d'envoi.
 * Toute la configuration (autrefois dans Firestore settings/smtp) est
 * désormais stockée côté serveur et réservée à l'administrateur.
 */

/**
 * Récupère la configuration SMTP enregistrée par l'administrateur
 */
export async function getSmtpSettings() {
  try {
    return await api('/settings/smtp', { auth: 'admin' });
  } catch (err) {
    console.warn("Impossible de récupérer la config SMTP :", err.message);
    return { email: '', appPassword: '' };
  }
}

/**
 * Enregistre la configuration SMTP côté serveur (admin)
 */
export async function saveSmtpSettings(email, appPassword) {
  return api('/settings/smtp', {
    method: 'PUT',
    auth: 'admin',
    body: { email: String(email).trim(), appPassword: String(appPassword) }
  });
}

/**
 * Teste la configuration SMTP depuis le panneau d'administration
 */
export async function testSmtpConnection(email, appPassword, testRecipient) {
  try {
    return await api('/settings/test-smtp', {
      method: 'POST',
      auth: 'admin',
      body: {
        smtpEmail: String(email).trim(),
        smtpPassword: String(appPassword).replace(/\s+/g, ''),
        testRecipient: (testRecipient || email).trim()
      }
    });
  } catch (err) {
    return { success: false, error: err.message };
  }
}
