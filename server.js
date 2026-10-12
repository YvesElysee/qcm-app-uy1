/**
 * Serveur API pour l'envoi d'emails via le protocole SMTP Google (Gmail)
 * Utilise l'adresse Gmail et le mot de passe d'application à 16 caractères fourni par Google.
 */
import nodemailer from 'nodemailer';

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
 * Handler d'envoi du code de réinitialisation
 */
export async function handleSendResetCode({ email, code, name, smtpEmail, smtpPassword }) {
  const user = smtpEmail || process.env.SMTP_EMAIL || process.env.VITE_SMTP_EMAIL;
  const pass = smtpPassword || process.env.SMTP_APP_PASSWORD || process.env.VITE_SMTP_APP_PASSWORD;

  if (!user || !pass) {
    return {
      success: false,
      error: "Identifiants SMTP non configurés. Veuillez renseigner votre adresse Gmail et votre mot de passe d'application Google à 16 caractères dans l'espace Admin."
    };
  }

  const transporter = createGmailTransporter(user, pass);

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; rounded-2xl; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #2563eb; margin: 0; font-size: 24px;">Portail QCM — Université de Yaoundé 1</h2>
        <p style="color: #64748b; font-size: 14px; margin-top: 4px;">Récupération de mot de passe</p>
      </div>
      <div style="background-color: #f8fafc; border-radius: 12px; padding: 20px; margin-bottom: 20px;">
        <p style="color: #334155; font-size: 15px; margin-top: 0;">Bonjour <strong>${name || 'Étudiant'}</strong>,</p>
        <p style="color: #334155; font-size: 14px; line-height: 1.5;">
          Une demande de réinitialisation de mot de passe a été initiée pour votre compte sur la plateforme de QCM UY1.
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
        Université de Yaoundé 1 — Plateforme Téléévaluation 2026
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: `"Portail QCM UY1" <${user}>`,
      to: email,
      subject: `Code de récupération : ${code} — Portail QCM UY1`,
      text: `Bonjour, votre code de réinitialisation de mot de passe est : ${code}. Valable 15 minutes.`,
      html: htmlContent
    });
    return { success: true };
  } catch (err) {
    console.error("Erreur lors de l'envoi d'email SMTP :", err);
    return { success: false, error: err.message };
  }
}

/**
 * Handler de test de connexion SMTP
 */
export async function handleTestSmtp({ smtpEmail, smtpPassword, testRecipient }) {
  if (!smtpEmail || !smtpPassword) {
    return { success: false, error: "Adresse email et mot de passe d'application requis." };
  }

  const transporter = createGmailTransporter(smtpEmail, smtpPassword);

  try {
    // Vérification de la connexion
    await transporter.verify();

    // Envoi d'un email de test
    await transporter.sendMail({
      from: `"Portail QCM UY1" <${smtpEmail}>`,
      to: testRecipient || smtpEmail,
      subject: "Test de configuration SMTP Google — Portail QCM UY1",
      text: "Félicitations ! Votre configuration SMTP Google avec mot de passe d'application à 16 caractères fonctionne correctement.",
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #22c55e; border-radius: 8px;">
          <h2 style="color: #16a34a;">Test SMTP Google Réussi !</h2>
          <p>Le service de récupération de mot de passe est opérationnel pour le Portail QCM UY1.</p>
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
