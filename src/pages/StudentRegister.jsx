// Converti depuis register.html
// Structure d'origine conservée ; la logique d'inscription est branchée sur authService.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { registerStudent } from '../services/authService';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    fullname: '',
    email: '',
    filiere: 'Informatique',
    niveau: 'L1',
    annee: '2025-2026',
    birthdate: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setField = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (form.password !== form.confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      await registerStudent({
        name: form.fullname,
        email: form.email,
        password: form.password,
        filiere: form.filiere,
        niveau: form.niveau,
        anneeAcademique: form.annee,
        dateNaissance: form.birthdate
      });
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || "Une erreur est survenue lors de l'inscription.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* <head> : RegisterPage */}
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" rel="stylesheet" />
      <link href="https://fonts.googleapis.com" rel="preconnect" />
      <link crossOrigin="" href="https://fonts.gstatic.com" rel="preconnect" />
      <link href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:ital,wght@0,300..900;1,300..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&display=swap" rel="stylesheet" />
      <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
      <style dangerouslySetInnerHTML={{ __html: "\n    @layer base {\n\n      html,\n      body {\n        margin: 0;\n        padding: 0;\n      }\n\n      body {\n        overscroll-behavior: none;\n      }\n\n      main>:first-child {\n        margin-top: 0 !important;\n      }\n\n      main>:last-child {\n        margin-bottom: 0 !important;\n      }\n    }\n\n    ::-webkit-scrollbar {\n      display: none;\n    }\n  " }} />
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
          {/* Subtle decorative ambient flare */}
          <div className="absolute -top-16 w-96 h-96 bg-primary-container/20 rounded-full blur-3xl pointer-events-none" />
          {/* Header above the card */}
          <header className="flex flex-col items-center text-center mb-space-lg relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-surface-container-lowest/15 backdrop-blur-md shadow-xl flex items-center justify-center p-2.5 mb-space-sm ring-1 ring-white/20">
              <img alt="Portail QCM UY1 Logo" className="w-full h-full object-contain rounded-lg shadow-sm" src="https://lh3.googleusercontent.com/aida/AEtjO1XomPOzTGw8miEY95Yv__MD-Af0hRuRu_E5cLrnuutTYrACl_-znyYUng3SO8ACZRPE-ebRbxndM1eO-fSOYJeiMyP7pllOl0hPfhccX4VMahlKNfDjSdUtkpNlZdAFFbB92AvCOD6n-1PFlFOrNEL9eIWKKeaPaY9Pgh0slKKAboKV1d-XaGAKRCFSsbc-xrWtOZ32f14EjR2vjfC2kIXnxVxA8GuvbDxaO0QVh8JFDphyth1pACjmgw" />
            </div>
            <h1 className="font-headline-lg text-headline-lg text-inverse-on-surface tracking-tight text-white mb-1">
              Quizz App — UY1
            </h1>
            <p className="font-body-md text-body-md text-surface-variant/90 tracking-wide">
              Université de Yaoundé 1 • Téléévaluation 2026
            </p>
          </header>
          {/* Central Authentication Card */}
          <div className="w-full max-w-[560px] bg-surface-container-lowest rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/40 relative z-10 ring-1 ring-slate-100">
            {/* Top Segmented Navigation Tabs */}
            <nav aria-label="Authentification" className="rounded-xl p-1.5 bg-slate-100/90 flex gap-1 mb-8">
              <Link className="py-2.5 px-6 flex-1 text-center font-label-md text-label-md text-on-surface-variant hover:text-on-surface rounded-lg transition-colors duration-150" to="/login">
                Connexion
              </Link>
              <a aria-current="page" className="py-2.5 px-6 flex-1 text-center font-label-md text-label-md bg-surface-container-lowest text-primary-container shadow-sm rounded-lg transition-all">
                Inscription
              </a>
            </nav>
            {/* Card Title and Intro */}
            <div className="mb-6">
              <h2 className="font-headline-md text-headline-md text-on-surface tracking-tight mb-1">
                Inscription Étudiant
              </h2>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Complétez vos informations pour créer votre profil
              </p>
            </div>
            {/* Registration Form */}
            <form className="space-y-4" onSubmit={handleSubmit}>
              {/* Field 1: Full Name / Pseudo */}
              <div>
                <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-fullname">
                  NOM COMPLET OU PSEUDO
                  <span className="text-error">
                    *
                  </span>
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                    person
                  </span>
                  <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-fullname" placeholder="Ex: Yves Elysee" required type="text" value={form.fullname} onChange={setField('fullname')} />
                </div>
              </div>
              {/* Field 2: Email */}
              <div>
                <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-email">
                  ADRESSE EMAIL
                  <span className="text-error">
                    *
                  </span>
                </label>
                <div className="relative flex items-center">
                  <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                    mail
                  </span>
                  <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-email" placeholder="votre.email@gmail.com" required type="email" value={form.email} onChange={setField('email')} />
                </div>
              </div>
              {/* Field 3: Two Columns (Filière & Niveau) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-filiere">
                    FILIÈRE
                    <span className="text-error">
                      *
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                      school
                    </span>
                    <select className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-9 text-on-surface font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none appearance-none cursor-pointer" id="reg-filiere" value={form.filiere} onChange={setField('filiere')}>
                      <option value="Informatique">
                        Informatique
                      </option>
                      <option value="Mathématiques">
                        Mathématiques
                      </option>
                      <option value="Physique">
                        Physique
                      </option>
                      <option value="Chimie">
                        Chimie
                      </option>
                      <option value="Biologie">
                        Biologie
                      </option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 text-outline text-[20px] pointer-events-none">
                      expand_more
                    </span>
                  </div>
                  <span className="block text-[11px] leading-tight text-outline mt-1 font-body-sm">
                    Liée définitivement à votre compte
                  </span>
                </div>
                <div>
                  <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-niveau">
                    NIVEAU D'INSCRIPTION
                    <span className="text-error">
                      *
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                      layers
                    </span>
                    <select className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-9 text-on-surface font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none appearance-none cursor-pointer" id="reg-niveau" value={form.niveau} onChange={setField('niveau')}>
                      <option value="L1">
                        L1 (Licence 1)
                      </option>
                      <option value="L2">
                        L2 (Licence 2)
                      </option>
                      <option value="L3">
                        L3 (Licence 3)
                      </option>
                      <option value="M1">
                        M1 (Master 1)
                      </option>
                      <option value="M2">
                        M2 (Master 2)
                      </option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 text-outline text-[20px] pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>
              </div>
              {/* Field 4: Two Columns (Année & Date de Naissance) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-annee">
                    ANNÉE ACADÉMIQUE
                    <span className="text-error">
                      *
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                      date_range
                    </span>
                    <select className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-9 text-on-surface font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none appearance-none cursor-pointer" id="reg-annee" value={form.annee} onChange={setField('annee')}>
                      <option value="2025-2026">
                        2025-2026
                      </option>
                      <option value="2026-2027">
                        2026-2027
                      </option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 text-outline text-[20px] pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-birthdate">
                    DATE DE NAISSANCE
                    <span className="text-outline font-normal">
                      (OPTIONNEL)
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                      calendar_today
                    </span>
                    <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-birthdate" placeholder="jj/mm/aaaa" type="text" value={form.birthdate} onChange={setField('birthdate')} />
                  </div>
                </div>
              </div>
              {/* Field 5: Two Columns (Mot de Passe & Confirmer) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-password">
                    MOT DE PASSE
                    <span className="text-error">
                      *
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                      lock
                    </span>
                    <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-10 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-password" placeholder="Min 6 car." required type={showPassword ? 'text' : 'password'} value={form.password} onChange={setField('password')} />
                    <button aria-label="Afficher/masquer le mot de passe" className="absolute right-3 text-outline hover:text-on-surface focus:outline-none flex items-center justify-center p-1" type="button" onClick={() => setShowPassword((v) => !v)}>
                      <span className="material-symbols-outlined text-[18px]">
                        {showPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block font-label-uppercase text-label-uppercase text-on-surface-variant mb-2" htmlFor="reg-confirm-password">
                    CONFIRMER
                    <span className="text-error">
                      *
                    </span>
                  </label>
                  <div className="relative flex items-center">
                    <span className="material-symbols-outlined absolute left-3.5 text-outline text-[20px] pointer-events-none select-none">
                      lock
                    </span>
                    <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-10 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-confirm-password" placeholder="Répétez" required type={showConfirmPassword ? 'text' : 'password'} value={form.confirmPassword} onChange={setField('confirmPassword')} />
                    <button aria-label="Afficher/masquer le mot de passe" className="absolute right-3 text-outline hover:text-on-surface focus:outline-none flex items-center justify-center p-1" type="button" onClick={() => setShowConfirmPassword((v) => !v)}>
                      <span className="material-symbols-outlined text-[18px]">
                        {showConfirmPassword ? 'visibility_off' : 'visibility'}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
              {/* Action Button */}
              {error && (
                <div className="flex items-center gap-2 rounded-xl bg-error-container/40 border border-error-container px-4 py-3">
                  <span className="material-symbols-outlined text-[18px] text-error">error</span>
                  <p className="font-body-sm text-body-sm text-error">{error}</p>
                </div>
              )}
              <div className="pt-2">
                <button className="w-full h-12 bg-primary-container hover:bg-blue-700 active:scale-[0.99] font-label-md text-label-md text-white rounded-xl shadow-md shadow-primary-container/25 flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-wait" type="submit" disabled={loading}>
                  <span>
                    {loading ? 'Création du compte…' : "S'inscrire et Accéder"}
                  </span>
                  <span className="material-symbols-outlined text-[18px]">
                    arrow_forward
                  </span>
                </button>
              </div>
            </form>
            {/* Subtle Line Divider */}
            <div className="relative flex py-5 items-center">
              <div className="flex-grow border-t border-slate-200" />
            </div>
            {/* Footer Link Inside Card */}
            <div className="text-center">
              <p className="font-body-md text-body-md text-on-surface-variant">
                Vous avez déjà un compte ?
                <Link className="font-label-md text-label-md text-primary-container hover:underline ml-1 inline-flex items-center gap-0.5" to="/login">
                  Se connecter
                </Link>
              </p>
            </div>
          </div>
          {/* Links Below Card */}
          <nav aria-label="Liens complémentaires" className="mt-space-lg flex items-center justify-center gap-2 text-surface-variant/80 font-body-sm text-body-sm relative z-10">
            <Link className="hover:text-surface-bright transition-colors cursor-pointer" to="/schedule">
              Emploi du temps public
            </Link>
            <span className="select-none text-surface-variant/40">
              •
            </span>
            <Link className="hover:text-surface-bright transition-colors cursor-pointer" to="/admin-login">
              Accès Enseignant / Admin
            </Link>
          </nav>
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
    </>
  );
}
