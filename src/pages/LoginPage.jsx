import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loginStudent } from '../services/authService';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await loginStudent(email, password);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || 'Erreur de connexion.');
    } finally {
      setLoading(false);
    }
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
        <div className="flex flex-col w-full items-center justify-center relative">
          {/* Micro Dot / Grid & Atmosphere Depth Accent */}
          <div className="pointer-events-none absolute -top-24 w-[620px] h-[620px] rounded-full bg-primary-container/15 blur-[90px] -z-10" />
          {/* Centered Identity Unit Above Card */}
          <header className="flex flex-col items-center text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary-container shadow-xl shadow-primary-container/30 flex items-center justify-center mb-4 transform hover:scale-105 transition-transform duration-300">
              <span className="material-symbols-outlined text-on-primary text-[38px]" style={{"fontVariationSettings": "'FILL' 1"}}>
                school
              </span>
            </div>
            <h1 className="font-headline-md text-headline-md font-bold text-inverse-on-surface tracking-tight">
              QuizzApp — UY1
            </h1>
            <p className="font-body-md text-body-md text-surface-variant font-medium mt-1">
              Université de Yaoundé 1 • Téléévaluation 2026
            </p>
          </header>
          {/* Central Authentication Card */}
          <div className="w-full max-w-[560px] bg-surface-container-lowest rounded-[24px] shadow-2xl shadow-black/40 p-8 md:p-10 relative overflow-hidden transition-all duration-300">
            {/* Top Decorative Gradient Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-primary via-primary-container to-secondary-container" />
            {/* Segmented Control / Tabs */}
            <div className="p-1.5 rounded-xl bg-surface-container-low flex gap-1 mb-8">
              <button className="bg-surface-container-lowest text-primary-container font-headline-sm text-label-md shadow-sm rounded-lg py-2.5 px-6 flex-1 text-center transition-all duration-200 focus:outline-none flex items-center justify-center gap-1.5" id="tab-connexion" type="button">
                <span className="material-symbols-outlined text-[18px]">
                  login
                </span>
                Connexion
              </button>
              <a href="/register">
                <button className="text-on-surface-variant hover:text-on-surface font-headline-sm text-label-md py-2.5 px-6 flex-1 text-center transition-all duration-200 focus:outline-none flex items-center justify-center gap-1.5" id="tab-inscription" type="button">
                  <span className="material-symbols-outlined text-[18px]">
                    person_add
                  </span>
                  Inscription
                </button>
              </a>
            </div>
            {/* Card Title & Context Header */}
            <div className="mb-6">
              <div className="flex items-center justify-between">
                <h2 className="font-headline-md text-headline-md font-bold text-on-surface tracking-tight">
                  Espace Étudiant
                </h2>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant mt-1">
                Connectez-vous pour accéder à vos QCM, consulter vos résultats et préparer vos rattrapages.
              </p>
            </div>
            {/* Interactive Authentication Form */}
            <form className="space-y-5" id="auth-form" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-xl border border-error/30 bg-error-container px-4 py-3 text-body-sm text-on-error-container">{error}</div>
              )}
              {/* Email Field */}
              <div>
                <label className="font-label-uppercase text-label-uppercase uppercase text-on-surface-variant mb-2 block tracking-wider font-semibold" htmlFor="student-email">
                  Adresse Email Universitaire
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none transition-colors duration-200">
                    mail
                  </span>
                  <input className="w-full h-12 pl-11 pr-4 bg-surface-container-low border border-outline-variant/70 rounded-xl text-on-surface placeholder:text-outline font-body-md text-body-md outline-none transition-all duration-200 focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15" id="student-email" value={email} onChange={(e) => setEmail(e.target.value)} name="email" placeholder="ex: prenom.nom@uy1.cm" required type="email" />
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">
                  Utilisez exclusivement votre adresse institutionnelle UY1 (@uy1.cm).
                </p>
              </div>
              {/* Password Field */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className="font-label-uppercase text-label-uppercase uppercase text-on-surface-variant tracking-wider font-semibold" htmlFor="student-password">
                    Mot de Passe
                  </label>
                  <a className="font-label-md text-label-md text-primary-container hover:text-primary transition-colors hover:underline" href="/forgot-password">
                    Mot de passe oublié ?
                  </a>
                </div>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none transition-colors duration-200">
                    lock
                  </span>
                  <input className="w-full h-12 pl-11 pr-11 bg-surface-container-low border border-outline-variant/70 rounded-xl text-on-surface placeholder:text-outline font-body-md text-body-md outline-none transition-all duration-200 focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15" id="student-password" name="password" placeholder="Saisissez votre mot de passe" required type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button aria-label="Afficher le mot de passe" className="absolute right-3.5 text-outline hover:text-on-surface transition-colors focus:outline-none flex items-center justify-center p-1" id="toggle-password" type="button" onClick={() => setShowPassword((v) => !v)}>
                    <span className="material-symbols-outlined text-[20px]" id="eye-icon">
                      {showPassword ? "visibility_off" : "visibility"}
                    </span>
                  </button>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1.5">
                  Minimum 8 caractères — utilisez le mot de passe attribué par l'administration.
                </p>
              </div>
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input defaultChecked className="w-4 h-4 rounded text-primary-container accent-primary-container cursor-pointer" type="checkbox" />
                  <span className="font-body-sm text-body-sm text-on-surface-variant">
                    Rester connecté sur cet appareil
                  </span>
                </label>
                <span className="flex items-center gap-1 font-body-sm text-body-sm text-tertiary">
                  <span className="material-symbols-outlined text-[16px] text-primary-container">
                    verified_user
                  </span>
                  Connexion sécurisée
                </span>
              </div>
              {/* Primary Action CTA */}
              <button className="w-full h-12 bg-primary-container hover:bg-primary active:scale-[0.99] text-on-primary font-headline-sm text-label-md rounded-xl shadow-lg shadow-primary-container/25 transition-all duration-200 flex items-center justify-center gap-2 mt-6 cursor-pointer" id="submit-btn" type="submit" disabled={loading}>
                <span>
                  {loading ? "Connexion en cours..." : "Accéder à mon espace étudiant"}
                </span>
                <span className="material-symbols-outlined text-[18px]">
                  arrow_forward
                </span>
              </button>
              {/* Footer Callout Link */}
              <div className="text-center pt-2">
                <p className="font-body-md text-body-md text-on-surface-variant">
                  Vous n'avez pas encore de compte étudiant ?
                  <a className="text-primary-container font-headline-sm font-semibold hover:underline hover:text-primary transition-colors ml-1" href="/register">
                    Créer mon compte
                  </a>
                </p>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-2 flex items-center justify-center gap-1.5">
                  <span className="material-symbols-outlined text-[14px]">
                    lock
                  </span>
                  Vos identifiants sont chiffrés et transmis de façon sécurisée.
                </p>
              </div>
            </form>
          </div>
          {/* Auxiliary Institutional Links Below Card */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-center">
            <a className="font-body-sm text-body-sm text-surface-variant/80 hover:text-surface-bright transition-colors flex items-center gap-1" href="#">
              <span className="material-symbols-outlined text-[14px]">
                calendar_month
              </span>
              Emploi du temps public
            </a>
            <span className="text-surface-dim">
              •
            </span>
            <a className="font-body-sm text-body-sm text-surface-variant/80 hover:text-surface-bright transition-colors flex items-center gap-1" href="/admin-login">
              <span className="material-symbols-outlined text-[14px]">
                admin_panel_settings
              </span>
              Accès Enseignant / Admin
            </a>
            <span className="text-surface-dim">
              •
            </span>
            <a className="font-body-sm text-body-sm text-surface-variant/80 hover:text-surface-bright transition-colors flex items-center gap-1" href="#">
              <span className="material-symbols-outlined text-[14px]">
                help_center
              </span>
              Assistance Serveur d'Examen
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
              © 2026 Universite de Yaounde 1.
            </p>
          </div>
          <div className="font-label-uppercase text-label-uppercase uppercase text-surface-dim hover:text-surface-bright transition-colors cursor-pointer">
            <span>
              Yves Elysée
            </span>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
