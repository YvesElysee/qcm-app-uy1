/**
 * Service d'envoi d'emails via le protocole SMTP Google (Gmail).
 * Utilise l'adresse Gmail et le mot de passe d'application à 16 caractères
 * fourni par Google (https://myaccount.google.com/apppasswords).
 *
 * La configuration est lue depuis la table `settings` (saisie par l'admin
 * dans le panneau), avec repli sur les variables d'environnement SMTP_EMAIL /
 * SMTP_APP_PASSWORD du fichier .env.
 */
import nodemailer from 'nodemailer';
import { getSetting } from './db.js';

/**
 * Récupère la configuration SMTP active (base puis .env)
 */
export function getSmtpConfig() {
  const stored = getSetting('smtp') || {};
  return {
    email: stored.email || process.env.SMTP_EMAIL || '',
    appPassword: (stored.appPassword || process.env.SMTP_APP_PASSWORD || '').replace(/\s+/g, '')
  };
}

/**
 * Crée un transporteur Nodemailer configuré pour Gmail SMTP
 */
export function createGmailTransporter(user, pass) {
  const cleanPass = (pass || '').replace(/\s+/g, '');
  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true, // Utilisation de SSL/TLS
    auth: {
      user: user?.trim(),
      pass: cleanPass
    }
  });
}

/**
 * Envoie le code de réinitialisation par email.
 * Retourne { success, error? } · identique à l'ancien handler.
 */
export async function sendResetCodeEmail({ email, code, name }) {
  const { email: user, appPassword: pass } = getSmtpConfig();

  if (!user || !pass) {
    return {
      success: false,
      error: "Identifiants SMTP non configurés. Veuillez renseigner votre adresse Gmail et votre mot de passe d'application Google à 16 caractères dans l'espace Admin."
    };
  }

  const transporter = createGmailTransporter(user, pass);

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; margin: 0; font-size: 24px;">QCM App</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Récupération de mot de passe</p>
      </div>
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin-top: 0;">Bonjour <strong>${name || 'Étudiant'}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">
          Une demande de réinitialisation de mot de passe a été initiée pour votre compte sur la plateforme QCM App.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <span style="display: inline-block; font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #1e40af; background: #dbeafe; padding: 12px 28px; border-radius: 10px; border: 2px dashed #93c5fd;">
            ${code}
          </span>
        </div>
        <p style="color: #64748b; font-size: 12px; text-align: center; margin: 0;">
          Ce code est valable pendant <strong>15 minutes</strong>. Ne le partagez avec personne.
        </p>
      </div>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.4; text-align: center;">
        Si vous n'êtes pas à l'origine de cette demande, vous pouvez ignorer ce message en toute sécurité.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 0;">
        QCM App · Plateforme d'évaluation 2026
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"QCM App" <${user}>`,
      to: email,
      subject: `Code de récupération : ${code} · QCM App`,
      text: `Bonjour, votre code de réinitialisation de mot de passe est : ${code}. Valable 15 minutes.`,
      html: htmlContent
    });
    return { success: true };
  } catch (err) {
    console.error('Erreur lors de l\'envoi d\'email SMTP :', err);
    return { success: false, error: err.message };
  }
}

/**
 * Prévient un étudiant que sa filière demandée vient d'être ajoutée.
 * Utilise la même configuration SMTP que les autres emails transactionnels.
 */
export async function sendFiliereAvailableEmail({ email, name, filiere, faculte }) {
  const { email: user, appPassword: pass } = getSmtpConfig();
  if (!user || !pass) return { success: false, skipped: true, error: 'SMTP non configuré' };

  const transporter = createGmailTransporter(user, pass);
  const safeName = String(name || 'Étudiant').trim();
  const safeFiliere = String(filiere || '').trim();
  const safeFaculte = String(faculte || '').trim();

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; margin: 0; font-size: 24px;">QCM App</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Votre filière est maintenant disponible</p>
      </div>
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px;">
        <p style="color: #334155; font-size: 15px; margin-top: 0;">Bonjour <strong>${safeName}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          L'administration vient d'ajouter la filière <strong>${safeFiliere}</strong>
          ${safeFaculte ? `de la faculté <strong>${safeFaculte}</strong>` : ''}.
        </p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          Votre compte a été mis à jour automatiquement. Vous pouvez dès maintenant
          accéder à vos QCM, classements et ressources de cours depuis votre espace étudiant.
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.APP_URL || 'https://qcm-app.local'}/dashboard"
             style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 10px;">
            Ouvrir mon espace
          </a>
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 12px; line-height: 1.4; text-align: center;">
        Vous recevez cet email car vous avez signalé cette filière lors de votre inscription.
      </p>
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
      <p style="color: #cbd5e1; font-size: 11px; text-align: center; margin: 0;">
        QCM App · Plateforme d'évaluation 2026
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"QCM App" <${user}>`,
      to: email,
      subject: `Votre filière ${safeFiliere} est disponible · QCM App`,
      text: `Bonjour ${safeName}, la filière ${safeFiliere} a été ajoutée à QCM App. Votre compte est à jour.`,
      html: htmlContent
    });
    return { success: true };
  } catch (err) {
    console.error('Erreur lors de l\'envoi de l\'email filière :', err);
    return { success: false, error: err.message };
  }
}

/**
 * Échappe le texte injecté dans un email HTML (réponses admin, sujet, etc.).
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Transmet à l'étudiant la réponse donnée par l'administration à un message.
 * L'email est complémentaire de la notification interne : si SMTP n'est pas
 * configuré, la réponse reste consultable dans l'application.
 */
export async function sendFeedbackReplyEmail({ email, name, subject, originalMessage, reply }) {
  const { email: user, appPassword: pass } = getSmtpConfig();
  if (!user || !pass || !email) return { success: false, skipped: true, error: 'SMTP non configuré' };

  const transporter = createGmailTransporter(user, pass);
  const safeName = escapeHtml(name || 'Étudiant');
  const safeSubject = escapeHtml(subject || 'Votre message');
  const safeOriginal = escapeHtml(originalMessage || '').slice(0, 500);
  const safeReply = escapeHtml(reply || '').replace(/\n/g, '<br />');

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; margin: 0; font-size: 24px;">QCM App</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Réponse de l'administration</p>
      </div>
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px;">
        <p style="color: #334155; font-size: 15px; margin-top: 0;">Bonjour <strong>${safeName}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.6;">
          L'administration a répondu à votre message concernant <strong>${safeSubject}</strong>.
        </p>
        ${safeOriginal ? `<div style="border-left: 3px solid #cbd5e1; padding-left: 12px; color: #64748b; font-size: 13px; margin: 16px 0;">${safeOriginal}</div>` : ''}
        <div style="background-color: #ffffff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px; color: #1e293b; font-size: 14px; line-height: 1.7;">
          ${safeReply}
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${process.env.APP_URL || 'https://qcm-app.local'}/contact"
             style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; font-weight: bold; padding: 12px 24px; border-radius: 10px;">
            Voir mes messages
          </a>
        </div>
      </div>
      <p style="color: #94a3b8; font-size: 12px; text-align: center;">
        Vous recevez cet email car vous avez envoyé un message depuis QCM App.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"QCM App" <${user}>`,
      to: email,
      subject: `Re : ${String(subject || 'Votre message').slice(0, 150)} · QCM App`,
      text: `Bonjour ${name || 'Étudiant'},\n\n${reply}\n\nQCM App`,
      html: htmlContent
    });
    return { success: true };
  } catch (err) {
    console.error('Erreur lors de l\'envoi de l\'email de réponse :', err);
    return { success: false, error: err.message };
  }
}

/**
 * Teste la connexion SMTP et envoie un email de test (panneau admin).
 * Retourne { success, message?, error? } · identique à l'ancien handler.
 */
export async function testSmtpConnection({ smtpEmail, smtpPassword, testRecipient }) {
  if (!smtpEmail || !smtpPassword) {
    return { success: false, error: 'Adresse email et mot de passe d\'application requis.' };
  }

  const transporter = createGmailTransporter(smtpEmail, smtpPassword);

  try {
    // Vérification de la connexion
    await transporter.verify();

    // Envoi d'un email de test
    await transporter.sendMail({
      from: `"QCM App" <${smtpEmail}>`,
      to: testRecipient || smtpEmail,
      subject: 'Test de configuration SMTP Google · QCM App',
      text: 'Félicitations ! Votre configuration SMTP Google avec mot de passe d\'application à 16 caractères fonctionne correctement.',
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #22c55e; border-radius: 8px;">
          <h2 style="color: #16a34a;">Test SMTP Google Réussi !</h2>
          <p>Le service de récupération de mot de passe est opérationnel pour QCM App.</p>
          <p><strong>Adresse expéditeur :</strong> ${smtpEmail}</p>
          <p><strong>Destinataire :</strong> ${testRecipient || smtpEmail}</p>
        </div>
      `
    });

    return { success: true, message: `Email de test envoyé avec succès à ${testRecipient || smtpEmail} !` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
