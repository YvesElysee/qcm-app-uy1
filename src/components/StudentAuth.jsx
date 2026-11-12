import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  loginStudent,
  registerStudent,
  requestPasswordReset,
  verifyResetCode,
  completePasswordReset
} from '../services/authService';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';

export default function StudentAuth({ defaultTab = 'login' }) {
  const [tab, setTab] = useState(defaultTab); // 'login' | 'register' | 'forgot'
  const navigate = useNavigate();

  usePageTitle(
    tab === 'login' ? 'Connexion' : tab === 'register' ? 'Inscription' : 'Mot de passe oublié'
  );

  // ── États Login ──
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // ── États Inscription ──
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPasswordConfirm, setRegPasswordConfirm] = useState('');
  const [regFiliere, setRegFiliere] = useState('Informatique');
  const [regNiveau, setRegNiveau] = useState('L1');
  const [regAnnee, setRegAnnee] = useState('2025-2026');
  const [regBirthDate, setRegBirthDate] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [regError, setRegError] = useState('');

  // ── États Mot de passe oublié (Code Google 16 caractères / SMTP) ──
  const [forgotStep, setForgotStep] = useState(1); // 1: Email, 2: Code 6 chiffres, 3: Nouveau MDP
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotCode, setForgotCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotMsg, setForgotMsg] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [simulationCodeInfo, setSimulationCodeInfo] = useState('');

  // ── Handlers ──
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginError('');
    try {
      await loginStudent(loginEmail, loginPassword);
      navigate('/dashboard');
    } catch (err) {
      setLoginError(err.message || "Erreur de connexion.");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setRegLoading(true);
    setRegError('');

    if (regPassword !== regPasswordConfirm) {
      setRegError("Les deux mots de passe ne correspondent pas.");
      setRegLoading(false);
      return;
    }

    try {
      await registerStudent({
        name: regName,
        email: regEmail,
        password: regPassword,
        filiere: regFiliere,
        niveau: regNiveau,
        anneeAcademique: regAnnee,
        dateNaissance: regBirthDate
      });
      navigate('/dashboard');
    } catch (err) {
      setRegError(err.message || "Erreur lors de l'inscription.");
    } finally {
      setRegLoading(false);
    }
  };

  const handleSendResetCode = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    setForgotMsg('');
    setSimulationCodeInfo('');
    try {
      const res = await requestPasswordReset(forgotEmail);
      setForgotMsg(res.message);
      if (res.simulationCode) {
        setSimulationCodeInfo(res.simulationCode);
      }
      setForgotStep(2);
    } catch (err) {
      setForgotError(err.message || "Erreur lors de l'envoi du code.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');
    try {
      await verifyResetCode(forgotEmail, forgotCode);
      setForgotStep(3);
    } catch (err) {
      setForgotError(err.message || "Code invalide.");
    } finally {
      setForgotLoading(false);
    }
  };

  const handleCompleteReset = async (e) => {
    e.preventDefault();
    setForgotLoading(true);
    setForgotError('');

    if (newPassword !== newPasswordConfirm) {
      setForgotError("Les deux mots de passe ne correspondent pas.");
      setForgotLoading(false);
      return;
    }

    try {
      await completePasswordReset(forgotEmail, forgotCode, newPassword);
      alert("Votre mot de passe a été modifié avec succès ! Vous pouvez maintenant vous connecter.");
      setTab('login');
      setForgotStep(1);
      setLoginEmail(forgotEmail);
      setLoginPassword('');
    } catch (err) {
      setForgotError(err.message || "Erreur lors de la réinitialisation.");
    } finally {
      setForgotLoading(false);
    }
  };

  // Classes communes des champs de saisie (thème sombre unifié)
  const inputClass = 'w-full p-3 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-blue-600 outline-none transition text-sm';
  const selectClass = 'w-full p-3 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 focus:border-blue-600 outline-none transition text-sm font-medium';
  const labelClass = 'block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 py-10 px-4 flex flex-col justify-center items-center">
      {/* Header marque */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 mb-3 shadow-lg shadow-blue-500/10">
          <Icon name="graduation" size={32} />
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">QCM App</h1>
        <p className="text-slate-400 text-sm mt-1">Plateforme d'évaluation en ligne • 2026</p>
      </div>

      {/* Conteneur Carte */}
      <div className="w-full max-w-md bg-slate-900 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden border border-slate-800">
        {/* Navigation des Onglets */}
        <div className="flex border-b border-slate-800 bg-slate-950/60 p-1.5">
          <button
            type="button"
            onClick={() => { setTab('login'); setLoginError(''); }}
            className={`flex-1 py-3 text-sm font-extrabold rounded-2xl transition-all duration-200 ${
              tab === 'login'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setRegError(''); }}
            className={`flex-1 py-3 text-sm font-extrabold rounded-2xl transition-all duration-200 ${
              tab === 'register'
                ? 'bg-slate-800 text-white'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Inscription
          </button>
          {tab === 'forgot' && (
            <button
              type="button"
              className="flex-1 py-3 text-sm font-extrabold rounded-2xl bg-slate-800 text-amber-400"
            >
              Récupération
            </button>
          )}
        </div>

        {/* ─── ONGLET 1 : CONNEXION ─── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="p-7 space-y-4">
            <div>
              <h2 className="text-xl font-black text-white">Espace Étudiant</h2>
              <p className="text-slate-400 text-xs mt-0.5">Accédez à vos QCM, résultats et rattrapages</p>
            </div>

            {loginError && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl p-3 flex items-start gap-2">
                <Icon name="alert" size={15} className="mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className={labelClass}>Adresse Email</label>
              <input
                type="email"
                required
                placeholder="etudiant@exemple.com"
                className={inputClass}
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className={labelClass}>Mot de passe</label>
                <button
                  type="button"
                  onClick={() => { setTab('forgot'); setForgotStep(1); setForgotEmail(loginEmail); setForgotError(''); }}
                  className="text-xs font-semibold text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                className={inputClass}
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-blue-600/25 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loginLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Connexion en cours...</span>
                </>
              ) : (
                <span>Se connecter</span>
              )}
            </button>

            <div className="pt-2 text-center border-t border-slate-800">
              <p className="text-xs text-slate-400">
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => { setTab('register'); setRegError(''); }}
                  className="font-bold text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Créer mon compte
                </button>
              </p>
            </div>
          </form>
        )}

        {/* ─── ONGLET 2 : INSCRIPTION COMPLÈTE ─── */}
        {tab === 'register' && (
          <form onSubmit={handleRegister} className="p-7 space-y-3.5 max-h-[80vh] overflow-y-auto">
            <div>
              <h2 className="text-xl font-black text-white">Inscription Étudiant</h2>
              <p className="text-slate-400 text-xs mt-0.5">Complétez vos informations pour créer votre profil</p>
            </div>

            {regError && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl p-3 flex items-start gap-2">
                <Icon name="alert" size={15} className="mt-0.5" />
                <span>{regError}</span>
              </div>
            )}

            <div>
              <label className={labelClass}>
                Nom complet ou Pseudo <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Yves Elysee"
                className={inputClass}
                value={regName}
                onChange={e => setRegName(e.target.value)}
              />
            </div>

            <div>
              <label className={labelClass}>
                Adresse Email <span className="text-red-400">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="votre.email@gmail.com"
                className={inputClass}
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>
                  Filière <span className="text-red-400">*</span>
                </label>
                <select
                  className={selectClass}
                  value={regFiliere}
                  onChange={e => setRegFiliere(e.target.value)}
                >
                  <option>Informatique</option>
                  <option>Mathématiques</option>
                  <option>Physique</option>
                  <option>Chimie</option>
                  <option>Biologie</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-0.5">Liée définitivement à votre compte</p>
              </div>
              <div>
                <label className={labelClass}>
                  Niveau d'inscription <span className="text-red-400">*</span>
                </label>
                <select
                  className={selectClass}
                  value={regNiveau}
                  onChange={e => setRegNiveau(e.target.value)}
                >
                  <option>L1</option>
                  <option>L2</option>
                  <option>L3</option>
                  <option>M1</option>
                  <option>M2</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>
                  Année Académique <span className="text-red-400">*</span>
                </label>
                <select
                  className={selectClass}
                  value={regAnnee}
                  onChange={e => setRegAnnee(e.target.value)}
                >
                  <option>2025-2026</option>
                  <option>2026-2027</option>
                  <option>2024-2025</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>
                  Date de naissance <span className="text-slate-500 font-normal">(Optionnel)</span>
                </label>
                <input
                  type="date"
                  className={inputClass}
                  value={regBirthDate}
                  onChange={e => setRegBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>
                  Mot de passe <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 car."
                  className={inputClass}
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>
                  Confirmer <span className="text-red-400">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Répétez"
                  className={inputClass}
                  value={regPasswordConfirm}
                  onChange={e => setRegPasswordConfirm(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={regLoading}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-blue-600/25 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
            >
              {regLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Création du profil...</span>
                </>
              ) : (
                <span>S'inscrire et Accéder</span>
              )}
            </button>

            <div className="text-center pt-2 border-t border-slate-800">
              <p className="text-xs text-slate-400">
                Vous avez déjà un compte ?{' '}
                <button
                  type="button"
                  onClick={() => { setTab('login'); setLoginError(''); }}
                  className="font-bold text-blue-400 hover:text-blue-300 hover:underline"
                >
                  Se connecter
                </button>
              </p>
            </div>
          </form>
        )}

        {/* ─── ONGLET 3 : RÉCUPÉRATION DE MOT DE PASSE (GOOGLE SMTP 16 CHIFFRES) ─── */}
        {tab === 'forgot' && (
          <div className="p-7 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-white">Mot de passe oublié</h2>
                <p className="text-slate-400 text-xs mt-0.5">Récupération par code email (SMTP Google)</p>
              </div>
              <button
                type="button"
                onClick={() => setTab('login')}
                className="text-xs font-bold text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                <Icon name="arrow-left" size={13} />
                Retour
              </button>
            </div>

            {forgotError && (
              <div className="bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl p-3 flex items-start gap-2">
                <Icon name="alert" size={15} className="mt-0.5" />
                <span>{forgotError}</span>
              </div>
            )}

            {forgotMsg && (
              <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl p-3 flex items-start gap-2">
                <Icon name="check-circle" size={15} className="mt-0.5" />
                <span>{forgotMsg}</span>
              </div>
            )}

            {simulationCodeInfo && (
              <div className="bg-amber-950/60 border border-amber-800 text-amber-300 text-xs rounded-xl p-3">
                <p className="font-bold">Mode vérification / test :</p>
                <p className="mt-0.5">Votre code à 6 chiffres est : <strong className="text-sm font-mono tracking-wider">{simulationCodeInfo}</strong></p>
              </div>
            )}

            {/* Étape 1 : Saisie Email */}
            {forgotStep === 1 && (
              <form onSubmit={handleSendResetCode} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Entrez votre adresse email enregistrée. Un code de réinitialisation à 6 chiffres vous sera envoyé via le service SMTP Google.
                </p>
                <div>
                  <label className={labelClass}>Votre Adresse Email</label>
                  <input
                    type="email"
                    required
                    placeholder="votre.email@gmail.com"
                    className={inputClass}
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {forgotLoading ? "Envoi du code..." : "Envoyer le code par email"}
                </button>
              </form>
            )}

            {/* Étape 2 : Saisie du Code à 6 chiffres */}
            {forgotStep === 2 && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Consultez votre boîte de réception à l'adresse <strong className="text-slate-200">{forgotEmail}</strong> et saisissez le code reçu (valable 15 minutes).
                </p>
                <div>
                  <label className={labelClass}>Code à 6 chiffres</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    className="w-full p-3.5 border border-slate-800 rounded-xl bg-slate-950 focus:border-blue-600 outline-none transition text-center text-2xl font-mono tracking-widest text-blue-300 font-bold"
                    value={forgotCode}
                    onChange={e => setForgotCode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="w-1/3 border border-slate-800 hover:border-slate-700 bg-slate-950 text-slate-300 font-bold py-3.5 rounded-xl text-xs transition"
                  >
                    Changer d'email
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || forgotCode.length !== 6}
                    className="w-2/3 bg-blue-600 hover:bg-blue-500 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg disabled:opacity-50 text-sm"
                  >
                    {forgotLoading ? "Vérification..." : "Valider le code"}
                  </button>
                </div>
              </form>
            )}

            {/* Étape 3 : Saisie du nouveau mot de passe */}
            {forgotStep === 3 && (
              <form onSubmit={handleCompleteReset} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Code vérifié avec succès ! Choisissez un nouveau mot de passe pour votre compte.
                </p>
                <div>
                  <label className={labelClass}>Nouveau Mot de passe</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 caractères"
                    className={inputClass}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className={labelClass}>Confirmer le mot de passe</label>
                  <input
                    type="password"
                    required
                    placeholder="Répétez le mot de passe"
                    className={inputClass}
                    value={newPasswordConfirm}
                    onChange={e => setNewPasswordConfirm(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-emerald-600/20 disabled:opacity-60 text-sm"
                >
                  {forgotLoading ? "Enregistrement..." : "Enregistrer le nouveau mot de passe"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Liens bas de page */}
      <div className="mt-8 flex items-center justify-center gap-6 text-xs text-slate-500 flex-wrap">
        <Link to="/" className="hover:text-slate-300 transition">Accueil</Link>
        <span>•</span>
        <Link to="/schedule" className="hover:text-slate-300 transition">Emploi du temps public</Link>
        <span>•</span>
        <Link to="/admin-login" className="hover:text-slate-300 transition">Accès Enseignant / Admin</Link>
      </div>
    </div>
  );
}
