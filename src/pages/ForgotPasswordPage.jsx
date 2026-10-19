import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  requestPasswordReset,
  verifyResetCode,
  completePasswordReset,
} from '../services/authService';

const inputClass =
  "w-full h-12 pl-12 pr-4 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 font-body-lg text-body-lg rounded-xl shadow-sm border border-outline-variant/70 focus:outline-none focus:ring-2 focus:ring-primary-container/40 focus:border-primary-container transition-all";
const labelClass =
  "font-label-uppercase text-label-uppercase uppercase text-on-surface font-semibold tracking-wider flex items-center gap-0.5";
const buttonClass =
  "w-full h-12 bg-primary-container hover:bg-primary disabled:opacity-60 text-on-primary font-label-md text-label-md rounded-xl shadow-lg shadow-primary-container/25 flex items-center justify-center gap-2 transition-all";

function Field({ id, label, icon, ...props }) {
  return (
    <div className="space-y-space-xs">
      <label className={labelClass} htmlFor={id}>
        {label}
        <span className="text-error font-bold">*</span>
      </label>
      <div className="relative flex items-center">
        <div className="absolute left-4 pointer-events-none text-on-surface-variant flex items-center justify-center">
          <span className="material-symbols-outlined text-[20px]">{icon}</span>
        </div>
        <input id={id} className={inputClass} required {...props} />
      </div>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: email, 2: code, 3: nouveau mot de passe
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [simulationCode, setSimulationCode] = useState('');
  const [error, setError] = useState('');

  const run = async (fn) => {
    setLoading(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = (e) => {
    e.preventDefault();
    run(async () => {
      const res = await requestPasswordReset(email);
      setMessage(res?.message || '');
      setSimulationCode(res?.simulationCode || '');
      setStep(2);
    });
  };

  const handleVerifyCode = (e) => {
    e.preventDefault();
    run(async () => {
      await verifyResetCode(email, code);
      setStep(3);
    });
  };

  const handleReset = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    run(async () => {
      await completePasswordReset(email, code, newPassword);
      alert('Votre mot de passe a été modifié avec succès ! Vous pouvez maintenant vous connecter.');
      navigate('/login');
    });
  };

  return (
    <div className="auth-theme min-h-screen">
      <div className="min-h-screen bg-[linear-gradient(145deg,#0B1226_0%,#1E2A78_100%)] text-on-surface font-body-md text-body-md antialiased relative selection:bg-primary-container selection:text-on-primary-container flex flex-col justify-between overflow-x-hidden">
        <div className="absolute inset-0 pointer-events-none z-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[680px] h-[680px] rounded-full pointer-events-none z-0 bg-[radial-gradient(circle,rgba(37,99,235,0.22)_0%,rgba(11,18,38,0)_70%)] blur-[48px]" />
        <header className="relative z-10 w-full pt-margin-sm px-gutter flex items-center justify-between">
          <div className="flex items-center gap-space-sm">
            <div className="w-8 h-8 rounded-lg bg-surface-container-lowest/10 backdrop-blur-md flex items-center justify-center">
              <span className="material-symbols-outlined text-primary-fixed text-[20px]">
                account_balance
              </span>
            </div>
            <span className="font-headline-sm text-headline-sm text-inverse-on-surface tracking-tight font-bold">
              Campus ID
            </span>
          </div>

        </header>
        <main className="relative z-10 w-full flex-1 flex flex-col items-center justify-center py-margin px-margin-sm sm:px-gutter">
          <div className="flex flex-col w-full items-center justify-center">
            {/* Brand & Institutional Identity Unit */}
            <div className="flex flex-col items-center text-center mb-space-lg select-none">
              <div className="w-16 h-16 rounded-2xl bg-primary-container shadow-xl shadow-primary-container/30 flex items-center justify-center mb-space-sm transform hover:scale-105 transition-transform duration-300">
                <span className="material-symbols-outlined text-on-primary text-[38px]" style={{ "fontVariationSettings": "'FILL' 1" }}>
                  school
                </span>
              </div>
              <h1 className="font-headline-lg text-headline-lg text-inverse-on-surface tracking-tight font-bold drop-shadow-sm">
                QuizzApp — UY1
              </h1>
              <p className="font-body-md text-body-md text-surface-variant tracking-normal mt-space-xs font-medium">
                Université de Yaoundé 1 • Téléévaluation 2026
              </p>
            </div>
            {/* Primary Authentication & Recovery Core */}
            <div className="w-full max-w-[560px] bg-surface-container-lowest rounded-[24px] shadow-2xl p-6 sm:p-10 relative overflow-hidden transition-all duration-200">
              {/* Top Segmented Navigation Tabs */}
              <div className="w-full bg-surface-container-low rounded-xl p-1.5 flex items-center justify-between gap-1 mb-space-lg">
                <button className="flex-1 py-2 rounded-lg font-label-md text-label-md text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5" type="button" onClick={() => navigate("/login")}>
                  <span className="material-symbols-outlined text-[18px]">
                    login
                  </span>
                  <span>
                    Connexion
                  </span>
                </button>
                <button className="flex-1 py-2 rounded-lg font-label-md text-label-md text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5" type="button" onClick={() => navigate("/register")}>
                  <span className="material-symbols-outlined text-[18px]">
                    person_add
                  </span>
                  <span>
                    Inscription
                  </span>
                </button>
                <button className="flex-1 py-2 rounded-lg font-label-md text-label-md bg-surface-container-lowest text-amber-600 shadow-sm flex items-center justify-center gap-1.5 font-semibold" type="button">
                  <span className="material-symbols-outlined text-[18px]" style={{ "fontVariationSettings": "'FILL' 1" }}>
                    lock_reset
                  </span>
                  <span>
                    Récupération
                  </span>
                </button>
              </div>
              {/* View Header Row */}
              <div className="flex items-start justify-between gap-4 mb-space-sm">
                <div>
                  <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                    Mot de passe oublié
                  </h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary-container" />
                    <p className="font-body-sm text-body-sm text-on-surface-variant font-medium">
                      Récupération par code email (SMTP Google)
                    </p>
                  </div>
                </div>
                <a className="inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors py-1 px-2 rounded-lg hover:bg-surface-container-low" href="/login">
                  <span className="material-symbols-outlined text-[16px]">
                    arrow_back
                  </span>
                  <span>
                    Retour
                  </span>
                </a>
              </div>
              {/* Description Paragraph */}
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                Entrez votre adresse email enregistrée. Un code de réinitialisation à 6 chiffres vous sera envoyé via le service sécurisé SMTP Google.
              </p>
              {/* Expiration & Security Notice Box */}
              <div className="mb-space-lg bg-surface-container-low rounded-xl p-3.5 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-primary-container/10 flex items-center justify-center shrink-0 mt-0.5">
                  <span className="material-symbols-outlined text-primary-container text-[20px]">
                    timer
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-label-uppercase text-label-uppercase text-primary font-bold tracking-wider uppercase">
                      Sécurité Examen
                    </span>
                    <span className="font-code-sm text-code-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded">
                      15 MIN
                    </span>
                  </div>
                  <p className="font-body-sm text-body-sm text-on-surface-variant mt-0.5">
                    Le jeton à usage unique expire après 15 minutes. Assurez-vous d'avoir accès immédiat à votre messagerie institutionnelle ou personnelle.
                  </p>
                </div>
              </div>
              {error && (
                <div className="mb-space-md rounded-xl border border-error/30 bg-error-container px-4 py-3 font-body-sm text-body-sm text-on-error-container">
                  {error}
                </div>
              )}
              {step === 1 && (
                <form className="space-y-space-md" id="recovery-form" onSubmit={handleSendCode}>
                  <Field id="email-input" label="Votre adresse e-mail" icon="mail" type="email" placeholder="votre.email@gmail.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <button className={buttonClass} id="submit-btn" type="submit" disabled={loading}>
                    <span className={`material-symbols-outlined text-[20px] ${loading ? 'animate-spin' : ''}`}>{loading ? 'progress_activity' : 'send'}</span>
                    <span>{loading ? 'Transmission SMTP...' : 'Envoyer le code par email'}</span>
                  </button>
                </form>
              )}
              {step >= 2 && (
                <div className="mb-space-md p-4 rounded-xl bg-surface-container flex items-center gap-3" id="status-box">
                  <span className="material-symbols-outlined text-primary text-[24px]">mark_email_read</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-md text-label-md text-on-surface font-semibold">Email de validation expédié</p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {message || 'Vérifiez votre boîte de réception ainsi que votre dossier spams.'}
                    </p>
                    {simulationCode && (
                      <p className="font-code-sm text-code-sm text-primary mt-1">Code (mode simulation) : {simulationCode}</p>
                    )}
                  </div>
                </div>
              )}
              {step === 2 && (
                <form className="space-y-space-md" onSubmit={handleVerifyCode}>
                  <Field id="code-input" label="Code à 6 chiffres" icon="pin" type="text" inputMode="numeric" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.trim())} />
                  <button className={buttonClass} type="submit" disabled={loading}>
                    <span className="material-symbols-outlined text-[20px]">verified</span>
                    <span>{loading ? 'Vérification...' : 'Vérifier le code'}</span>
                  </button>
                  <button type="button" className="w-full font-label-md text-label-md text-primary-container hover:underline" onClick={() => { setStep(1); setCode(''); setError(''); }}>
                    Changer d'adresse e-mail
                  </button>
                </form>
              )}
              {step === 3 && (
                <form className="space-y-space-md" onSubmit={handleReset}>
                  <Field id="new-password" label="Nouveau mot de passe" icon="lock" type="password" placeholder="Min 6 car." value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <Field id="confirm-password" label="Confirmer le mot de passe" icon="lock" type="password" placeholder="Répétez" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  <button className={buttonClass} type="submit" disabled={loading}>
                    <span className="material-symbols-outlined text-[20px]">lock_reset</span>
                    <span>{loading ? 'Enregistrement...' : 'Changer mon mot de passe'}</span>
                  </button>
                </form>
              )}
              {/* Subtle Divider */}
              <div className="my-space-lg flex items-center justify-center gap-4">
                <div className="h-px bg-surface-variant flex-1" />
                <span className="font-label-uppercase text-label-uppercase uppercase text-on-surface-variant/70 tracking-widest font-medium">
                  Assistance
                </span>
                <div className="h-px bg-surface-variant flex-1" />
              </div>
              {/* Return to Login Link */}
              <div className="text-center">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Vous vous souvenez de votre mot de passe ?
                  <a className="font-label-md text-label-md text-primary-container hover:text-primary font-semibold underline decoration-2 underline-offset-4 ml-1 transition-colors" href="/login">
                    Se connecter
                  </a>
                </p>
              </div>
            </div>
            {/* Auxiliary Institutional Actions / Quick Links */}
            <div className="mt-space-lg flex flex-wrap items-center justify-center gap-y-2 gap-x-4 text-center">
              <a className="font-label-md text-label-md text-surface-variant hover:text-surface-bright transition-colors flex items-center gap-1.5" href="/schedule">
                <span className="material-symbols-outlined text-[16px]">
                  calendar_month
                </span>
                <span>
                  Emploi du temps public
                </span>
              </a>
              <span className="text-surface-dim font-body-sm hidden sm:inline">
                •
              </span>
              <a className="font-label-md text-label-md text-surface-variant hover:text-surface-bright transition-colors flex items-center gap-1.5" href="/admin-login">
                <span className="material-symbols-outlined text-[16px]">
                  admin_panel_settings
                </span>
                <span>
                  Accès Enseignant / Admin
                </span>
              </a>
              <span className="text-surface-dim font-body-sm hidden sm:inline">
                •
              </span>
              <a className="font-label-md text-label-md text-surface-variant hover:text-surface-bright transition-colors flex items-center gap-1.5" href="#">
                <span className="material-symbols-outlined text-[16px]">
                  dns
                </span>
                <span>
                  Assistance Serveur d'Examen
                </span>
              </a>
            </div>
          </div>
        </main>
        <footer className="relative z-10 w-full pb-margin-sm px-gutter">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-space-sm text-center md:text-left">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary-fixed-dim text-[16px]">
                verified_user
              </span>
              <p className="font-body-sm text-body-sm text-surface-variant">
                © 2026 Universite Yaounde 1
              </p>
            </div>
            <div className="flex items-center gap-space-lg">

              <span className="font-label-uppercase text-label-uppercase uppercase text-surface-dim hover:text-surface-bright transition-colors cursor-pointer">
                Yves Elysée
              </span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
