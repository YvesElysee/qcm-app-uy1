// Converti depuis code.html
// Structure d'origine conservée ; la logique de récupération est branchée sur authService.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  requestPasswordReset,
  verifyResetCode,
  completePasswordReset
} from '../services/authService';

export default function CodePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: email | 2: code | 3: nouveau mot de passe
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      if (step === 1) {
        const result = await requestPasswordReset(email);
        setNotice(result.message || 'Code de récupération envoyé.');
        setStep(2);
      } else if (step === 2) {
        await verifyResetCode(email, code);
        setStep(3);
      } else {
        if (password !== confirmPassword) {
          throw new Error('Les deux mots de passe ne correspondent pas.');
        }
        await completePasswordReset(email, code, password);
        navigate('/login');
      }
    } catch (err) {
      setError(err.message || 'Une erreur est survenue.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* <head> : CodePage */}
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <link href="https://fonts.googleapis.com" rel="preconnect" />
      <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
      <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,300..900;1,300..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: "@layer base{html,body{margin:0;padding:0;}body{overscroll-behavior:none;}main>:first-child{margin-top:0!important;}main>:last-child{margin-bottom:0!important;}}::-webkit-scrollbar{display:none;}" }} />
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
          <div className="flex items-center gap-space-xs px-3 py-1 rounded-full bg-surface-container-lowest/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-secondary-container animate-pulse" />
            <span className="font-label-uppercase text-label-uppercase uppercase text-primary-fixed">
              SSO Gateway Active
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
                Portail QCM — UY1
              </h1>
              <p className="font-body-md text-body-md text-surface-variant tracking-normal mt-space-xs font-medium">
                Université de Yaoundé 1 • Téléévaluation 2026
              </p>
            </div>
            {/* Primary Authentication & Recovery Core */}
            <div className="w-full max-w-[560px] bg-surface-container-lowest rounded-[24px] shadow-2xl p-6 sm:p-10 relative overflow-hidden transition-all duration-200">
              {/* Top Segmented Navigation Tabs */}
              <div className="w-full bg-surface-container-low rounded-xl p-1.5 flex items-center justify-between gap-1 mb-space-lg">
                <Link className="flex-1 py-2 rounded-lg font-label-md text-label-md text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5" to="/login">
                  <span className="material-symbols-outlined text-[18px]">
                    login
                  </span>
                  <span>
                    Connexion
                  </span>
                </Link>
                <Link className="flex-1 py-2 rounded-lg font-label-md text-label-md text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container transition-colors flex items-center justify-center gap-1.5" to="/register">
                  <span className="material-symbols-outlined text-[18px]">
                    person_add
                  </span>
                  <span>
                    Inscription
                  </span>
                </Link>
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
                      Récupération par code email (SMTP Google) — Étape {step}/3
                    </p>
                  </div>
                </div>
                <Link className="inline-flex items-center gap-1 font-label-md text-label-md text-on-surface-variant hover:text-primary transition-colors py-1 px-2 rounded-lg hover:bg-surface-container-low" to="/login">
                  <span className="material-symbols-outlined text-[16px]">
                    arrow_back
                  </span>
                  <span>
                    Retour
                  </span>
                </Link>
              </div>
              {/* Description Paragraph */}
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed mb-space-md">
                {step === 1 && "Entrez votre adresse email enregistrée. Un code de réinitialisation à 6 chiffres vous sera envoyé via le service sécurisé SMTP Google."}
                {step === 2 && `Saisissez le code à 6 chiffres envoyé à ${email}.`}
                {step === 3 && "Choisissez un nouveau mot de passe (minimum 6 caractères)."}
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
              {/* Recovery Form */}
              <form className="space-y-space-md" id="recovery-form" onSubmit={handleSubmit}>
                {step === 1 && (
                  <div className="space-y-space-xs">
                    <div className="flex justify-between items-center">
                      <label className="font-label-uppercase text-label-uppercase uppercase text-on-surface font-semibold tracking-wider flex items-center gap-0.5" htmlFor="email-input">
                        Votre adresse e-mail
                        <span className="text-error font-bold">
                          *
                        </span>
                      </label>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Identifiant UY1 ou Gmail
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <div className="absolute left-4 pointer-events-none text-on-surface-variant flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px]">
                          mail
                        </span>
                      </div>
                      <input className="w-full h-12 pl-12 pr-4 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 font-body-lg text-body-lg rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-container transition-all" id="email-input" placeholder="votre.email@gmail.com" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <div className="space-y-space-xs">
                    <div className="flex justify-between items-center">
                      <label className="font-label-uppercase text-label-uppercase uppercase text-on-surface font-semibold tracking-wider flex items-center gap-0.5" htmlFor="code-input">
                        Code de vérification
                        <span className="text-error font-bold">
                          *
                        </span>
                      </label>
                      <span className="font-body-sm text-body-sm text-on-surface-variant">
                        Valable 15 minutes
                      </span>
                    </div>
                    <div className="relative flex items-center">
                      <div className="absolute left-4 pointer-events-none text-on-surface-variant flex items-center justify-center">
                        <span className="material-symbols-outlined text-[20px]">
                          key
                        </span>
                      </div>
                      <input className="w-full h-12 pl-12 pr-4 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 font-body-lg text-body-lg tracking-[0.3em] rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-container transition-all" id="code-input" placeholder="000000" inputMode="numeric" maxLength={6} required type="text" value={code} onChange={(e) => setCode(e.target.value)} />
                    </div>
                  </div>
                )}
                {step === 3 && (
                  <div className="space-y-space-md">
                    <div className="space-y-space-xs">
                      <label className="font-label-uppercase text-label-uppercase uppercase text-on-surface font-semibold tracking-wider flex items-center gap-0.5" htmlFor="new-password-input">
                        Nouveau mot de passe
                        <span className="text-error font-bold">
                          *
                        </span>
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute left-4 pointer-events-none text-on-surface-variant flex items-center justify-center">
                          <span className="material-symbols-outlined text-[20px]">
                            lock
                          </span>
                        </div>
                        <input className="w-full h-12 pl-12 pr-12 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 font-body-lg text-body-lg rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-container transition-all" id="new-password-input" placeholder="Min 6 caractères" required type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} />
                        <button aria-label="Afficher le mot de passe" className="absolute right-4 text-on-surface-variant hover:text-on-surface transition-colors focus:outline-none flex items-center justify-center p-1" type="button" onClick={() => setShowPassword((v) => !v)}>
                          <span className="material-symbols-outlined text-[20px]">
                            {showPassword ? 'visibility_off' : 'visibility'}
                          </span>
                        </button>
                      </div>
                    </div>
                    <div className="space-y-space-xs">
                      <label className="font-label-uppercase text-label-uppercase uppercase text-on-surface font-semibold tracking-wider flex items-center gap-0.5" htmlFor="confirm-password-input">
                        Confirmer le mot de passe
                        <span className="text-error font-bold">
                          *
                        </span>
                      </label>
                      <div className="relative flex items-center">
                        <div className="absolute left-4 pointer-events-none text-on-surface-variant flex items-center justify-center">
                          <span className="material-symbols-outlined text-[20px]">
                            lock_reset
                          </span>
                        </div>
                        <input className="w-full h-12 pl-12 pr-4 bg-surface-container-lowest text-on-surface placeholder:text-on-surface-variant/50 font-body-lg text-body-lg rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-container transition-all" id="confirm-password-input" placeholder="Répétez le mot de passe" required type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                      </div>
                    </div>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-2 rounded-xl bg-error-container/40 border border-error-container px-4 py-3">
                    <span className="material-symbols-outlined text-[18px] text-error">error</span>
                    <p className="font-body-sm text-body-sm text-error">{error}</p>
                  </div>
                )}
                {/* Submit CTA Button */}
                <button className="w-full h-12 bg-primary-container hover:bg-primary text-on-primary font-label-md text-label-md rounded-xl shadow-lg shadow-primary-container/25 flex items-center justify-center gap-2 transition-all duration-200 transform active:scale-[0.99] cursor-pointer disabled:opacity-60 disabled:cursor-wait" id="submit-btn" type="submit" disabled={loading}>
                  <span className="material-symbols-outlined text-[20px]">
                    {loading ? 'progress_activity' : step === 1 ? 'send' : step === 2 ? 'verified' : 'lock_reset'}
                  </span>
                  <span>
                    {loading ? 'Traitement…' : step === 1 ? 'Envoyer le code par email' : step === 2 ? 'Vérifier le code' : 'Réinitialiser le mot de passe'}
                  </span>
                </button>
              </form>
              {/* Success Message Container (Initially Hidden) */}
              {notice && (
                <div className="mt-space-md p-4 rounded-xl bg-surface-container flex items-center gap-3" id="status-box">
                  <span className="material-symbols-outlined text-primary text-[24px]">
                    mark_email_read
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-label-md text-label-md text-on-surface font-semibold">
                      Email de validation expédié
                    </p>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {notice}
                    </p>
                  </div>
                </div>
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
                  <Link className="font-label-md text-label-md text-primary-container hover:text-primary font-semibold underline decoration-2 underline-offset-4 ml-1 transition-colors" to="/login">
                    Se connecter
                  </Link>
                </p>
              </div>
            </div>
            {/* Auxiliary Institutional Actions / Quick Links */}
            <div className="mt-space-lg flex flex-wrap items-center justify-center gap-y-2 gap-x-4 text-center">
              <Link className="font-label-md text-label-md text-surface-variant hover:text-surface-bright transition-colors flex items-center gap-1.5" to="/schedule">
                <span className="material-symbols-outlined text-[16px]">
                  calendar_month
                </span>
                <span>
                  Emploi du temps public
                </span>
              </Link>
              <span className="text-surface-dim font-body-sm hidden sm:inline">
                •
              </span>
              <Link className="font-label-md text-label-md text-surface-variant hover:text-surface-bright transition-colors flex items-center gap-1.5" to="/admin-login">
                <span className="material-symbols-outlined text-[16px]">
                  admin_panel_settings
                </span>
                <span>
                  Accès Enseignant / Admin
                </span>
              </Link>
              <span className="text-surface-dim font-body-sm hidden sm:inline">
                •
              </span>
              <a className="font-label-md text-label-md text-surface-variant hover:text-surface-bright transition-colors flex items-center gap-1.5" href="mailto:contact@uniquiz.app">
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
    </>
  );
}
