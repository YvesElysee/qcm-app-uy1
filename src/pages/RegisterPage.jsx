import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { registerStudent } from '../services/authService';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    filiere: 'Informatique',
    niveau: 'L1',
    anneeAcademique: '2025-2026',
    dateNaissance: '',
    password: '',
    confirm: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setLoading(true);
    try {
      const { confirm, ...data } = form;
      await registerStudent(data);
      navigate('/dashboard');
    } catch (err) {
      setError(err.message || "Erreur lors de l'inscription.");
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
          {/* Subtle decorative ambient flare */}
          <div className="absolute -top-16 w-96 h-96 bg-primary-container/20 rounded-full blur-3xl pointer-events-none" />
          {/* Header above the card */}
          <header className="flex flex-col items-center text-center mb-space-lg relative z-10">
            <div className="w-16 h-16 rounded-2xl bg-primary-container shadow-xl shadow-primary-container/30 flex items-center justify-center mb-space-sm transform hover:scale-105 transition-transform duration-300">
              <span className="material-symbols-outlined text-on-primary text-[38px]" style={{"fontVariationSettings": "'FILL' 1"}}>
                school
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-inverse-on-surface tracking-tight text-white mb-1">
              QuizzApp — UY1
            </h1>
            <p className="font-body-md text-body-md text-surface-variant/90 tracking-wide">
              Université de Yaoundé 1 • Téléévaluation 2026
            </p>
          </header>
          {/* Central Authentication Card */}
          <div className="w-full max-w-[560px] bg-surface-container-lowest rounded-3xl p-8 md:p-10 shadow-2xl shadow-black/40 relative z-10 ring-1 ring-slate-100">
            {/* Top Segmented Navigation Tabs */}
            <nav aria-label="Authentification" className="rounded-xl p-1.5 bg-slate-100/90 flex gap-1 mb-8">
              <a className="py-2.5 px-6 flex-1 text-center font-label-md text-label-md text-on-surface-variant hover:text-on-surface rounded-lg transition-colors duration-150" href="/login">
                Connexion
              </a>
              <a aria-current="page" className="py-2.5 px-6 flex-1 text-center font-label-md text-label-md bg-surface-container-lowest text-primary-container shadow-sm rounded-lg transition-all" href="/register">
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
              {error && (
                <div className="rounded-xl border border-error/30 bg-error-container px-4 py-3 text-body-sm text-on-error-container">{error}</div>
              )}
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
                  <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-fullname" value={form.name} onChange={update("name")} placeholder="Ex: Yves Elysee" required type="text" />
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
                  <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-email" value={form.email} onChange={update("email")} placeholder="votre.email@gmail.com" required type="email" />
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
                    <select className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-9 text-on-surface font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none appearance-none cursor-pointer" id="reg-filiere" value={form.filiere} onChange={update("filiere")}>
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
                    <select className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-9 text-on-surface font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none appearance-none cursor-pointer" id="reg-niveau" value={form.niveau} onChange={update("niveau")}>
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
                    <select className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-9 text-on-surface font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none appearance-none cursor-pointer" id="reg-annee" value={form.anneeAcademique} onChange={update("anneeAcademique")}>
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
                    <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-4 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-birthdate" value={form.dateNaissance} onChange={update("dateNaissance")} placeholder="jj/mm/aaaa" type="text" />
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
                    <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-10 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-password" placeholder="Min 6 car." required type={showPassword ? "text" : "password"} value={form.password} onChange={update("password")} />
                    <button aria-label="Afficher/masquer le mot de passe" className="absolute right-3 text-outline hover:text-on-surface focus:outline-none flex items-center justify-center p-1" onClick={() => setShowPassword((v) => !v)} type="button">
                      <span className="material-symbols-outlined text-[18px]">
                        {showPassword ? "visibility_off" : "visibility"}
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
                    <input className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl py-3 pl-11 pr-10 text-on-surface placeholder:text-outline/70 font-body-md text-body-md focus:bg-white focus:border-primary-container focus:ring-4 focus:ring-primary-container/15 transition-all outline-none" id="reg-confirm-password" placeholder="Répétez" required type={showConfirm ? "text" : "password"} value={form.confirm} onChange={update("confirm")} />
                    <button aria-label="Afficher/masquer le mot de passe" className="absolute right-3 text-outline hover:text-on-surface focus:outline-none flex items-center justify-center p-1" onClick={() => setShowConfirm((v) => !v)} type="button">
                      <span className="material-symbols-outlined text-[18px]">
                        {showConfirm ? "visibility_off" : "visibility"}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
              {/* Action Button */}
              <div className="pt-2">
                <button className="w-full h-12 bg-primary-container hover:bg-blue-700 active:scale-[0.99] font-label-md text-label-md text-white rounded-xl shadow-md shadow-primary-container/25 flex items-center justify-center gap-2 transition-all duration-150 cursor-pointer" type="submit" disabled={loading}>
                  <span>
                    {loading ? "Création du compte..." : "S'inscrire et Accéder"}
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
                <a className="font-label-md text-label-md text-primary-container hover:underline ml-1 inline-flex items-center gap-0.5" href="/login">
                  Se connecter
                </a>
              </p>
            </div>
          </div>
          {/* Links Below Card */}
          <nav aria-label="Liens complémentaires" className="mt-space-lg flex items-center justify-center gap-2 text-surface-variant/80 font-body-sm text-body-sm relative z-10">
            <a className="hover:text-surface-bright transition-colors cursor-pointer" href="/schedule">
              Emploi du temps public
            </a>
            <span className="select-none text-surface-variant/40">
              •
            </span>
            <a className="hover:text-surface-bright transition-colors cursor-pointer" href="/admin-login">
              Accès Enseignant / Admin
            </a>
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
    </div>
  );
}
