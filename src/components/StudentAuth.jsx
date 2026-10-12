import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  loginStudent,
  registerStudent,
  requestPasswordReset,
  verifyResetCode,
  completePasswordReset
} from '../services/authService';

export default function StudentAuth({ defaultTab = 'login' }) {
  const [tab, setTab] = useState(defaultTab); // 'login' | 'register' | 'forgot'
  const navigate = useNavigate();

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
      navigate('/');
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
      navigate('/');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-900 py-10 px-4 flex flex-col justify-center items-center">
      {/* Header marque */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/20 border border-blue-400/30 text-blue-400 mb-3 shadow-lg shadow-blue-500/10">
          <svg className="w-9 h-9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l9-5-9-5-9 5 9 5z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
          </svg>
        </div>
        <h1 className="text-3xl font-black text-white tracking-tight">Portail QCM — UY1</h1>
        <p className="text-blue-200/80 text-sm mt-1">Université de Yaoundé 1 • Téléévaluation 2026</p>
      </div>

      {/* Conteneur Carte */}
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100">
        {/* Navigation des Onglets */}
        <div className="flex border-b border-gray-100 bg-gray-50/70 p-1.5">
          <button
            type="button"
            onClick={() => { setTab('login'); setLoginError(''); }}
            className={`flex-1 py-3 text-sm font-extrabold rounded-2xl transition-all duration-200 ${
              tab === 'login'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Connexion
          </button>
          <button
            type="button"
            onClick={() => { setTab('register'); setRegError(''); }}
            className={`flex-1 py-3 text-sm font-extrabold rounded-2xl transition-all duration-200 ${
              tab === 'register'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            Inscription
          </button>
          {tab === 'forgot' && (
            <button
              type="button"
              className="flex-1 py-3 text-sm font-extrabold rounded-2xl bg-white text-amber-600 shadow-sm"
            >
              Récupération
            </button>
          )}
        </div>

        {/* ─── ONGLET 1 : CONNEXION ─── */}
        {tab === 'login' && (
          <form onSubmit={handleLogin} className="p-7 space-y-4">
            <div>
              <h2 className="text-xl font-black text-gray-800">Espace Étudiant</h2>
              <p className="text-gray-500 text-xs mt-0.5">Accédez à vos QCM, résultats et rattrapages</p>
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                <span className="font-bold">⚠️</span>
                <span>{loginError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Adresse Email</label>
              <input
                type="email"
                required
                placeholder="etudiant@uy1.cm"
                className="w-full p-3.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition text-sm text-gray-800"
                value={loginEmail}
                onChange={e => setLoginEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">Mot de passe</label>
                <button
                  type="button"
                  onClick={() => { setTab('forgot'); setForgotStep(1); setForgotEmail(loginEmail); setForgotError(''); }}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <input
                type="password"
                required
                placeholder="••••••••"
                className="w-full p-3.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition text-sm text-gray-800"
                value={loginPassword}
                onChange={e => setLoginPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-blue-500/25 disabled:opacity-60 flex items-center justify-center gap-2"
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

            <div className="pt-2 text-center border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Pas encore de compte ?{' '}
                <button
                  type="button"
                  onClick={() => { setTab('register'); setRegError(''); }}
                  className="font-bold text-blue-600 hover:underline"
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
              <h2 className="text-xl font-black text-gray-800">Inscription Étudiant</h2>
              <p className="text-gray-500 text-xs mt-0.5">Complétez vos informations pour créer votre profil</p>
            </div>

            {regError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                <span className="font-bold">⚠️</span>
                <span>{regError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                Nom complet ou Pseudo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="Ex: Yves Elysee"
                className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                value={regName}
                onChange={e => setRegName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                Adresse Email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                required
                placeholder="votre.email@gmail.com"
                className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                value={regEmail}
                onChange={e => setRegEmail(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Filière <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm bg-white font-medium"
                  value={regFiliere}
                  onChange={e => setRegFiliere(e.target.value)}
                >
                  <option>Informatique</option>
                  <option>Mathématiques</option>
                  <option>Physique</option>
                  <option>Chimie</option>
                  <option>Biologie</option>
                </select>
                <p className="text-[10px] text-gray-400 mt-0.5">Liée définitivement à votre compte</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Niveau d'inscription <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm bg-white font-medium"
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
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Année Académique <span className="text-red-500">*</span>
                </label>
                <select
                  className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm bg-white font-medium"
                  value={regAnnee}
                  onChange={e => setRegAnnee(e.target.value)}
                >
                  <option>2025-2026</option>
                  <option>2026-2027</option>
                  <option>2024-2025</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Date de naissance <span className="text-gray-400 font-normal">(Optionnel)</span>
                </label>
                <input
                  type="date"
                  className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                  value={regBirthDate}
                  onChange={e => setRegBirthDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Mot de passe <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 car."
                  className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                  value={regPassword}
                  onChange={e => setRegPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">
                  Confirmer <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Répétez"
                  className="w-full p-3 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                  value={regPasswordConfirm}
                  onChange={e => setRegPasswordConfirm(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={regLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-blue-500/25 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
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

            <div className="text-center pt-2 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Vous avez déjà un compte ?{' '}
                <button
                  type="button"
                  onClick={() => { setTab('login'); setLoginError(''); }}
                  className="font-bold text-blue-600 hover:underline"
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
                <h2 className="text-xl font-black text-gray-800">Mot de passe oublié</h2>
                <p className="text-gray-500 text-xs mt-0.5">Récupération par code email (SMTP Google)</p>
              </div>
              <button
                type="button"
                onClick={() => setTab('login')}
                className="text-xs font-bold text-gray-400 hover:text-gray-700"
              >
                ← Retour
              </button>
            </div>

            {forgotError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-start gap-2">
                <span className="font-bold">⚠️</span>
                <span>{forgotError}</span>
              </div>
            )}

            {forgotMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-start gap-2">
                <span className="font-bold">✓</span>
                <span>{forgotMsg}</span>
              </div>
            )}

            {simulationCodeInfo && (
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl p-3">
                <p className="font-bold">Mode vérification / test :</p>
                <p className="mt-0.5">Votre code à 6 chiffres est : <strong className="text-sm font-mono tracking-wider">{simulationCodeInfo}</strong></p>
              </div>
            )}

            {/* Étape 1 : Saisie Email */}
            {forgotStep === 1 && (
              <form onSubmit={handleSendResetCode} className="space-y-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Entrez votre adresse email enregistrée. Un code de réinitialisation à 6 chiffres vous sera envoyé via le service SMTP Google.
                </p>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Votre Adresse Email</label>
                  <input
                    type="email"
                    required
                    placeholder="votre.email@gmail.com"
                    className="w-full p-3.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                    value={forgotEmail}
                    onChange={e => setForgotEmail(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {forgotLoading ? "Envoi du code..." : "Envoyer le code par email"}
                </button>
              </form>
            )}

            {/* Étape 2 : Saisie du Code à 6 chiffres */}
            {forgotStep === 2 && (
              <form onSubmit={handleVerifyCode} className="space-y-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Consultez votre boîte de réception à l'adresse <strong>{forgotEmail}</strong> et saisissez le code reçu (valable 15 minutes).
                </p>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Code à 6 chiffres</label>
                  <input
                    type="text"
                    required
                    maxLength={6}
                    placeholder="123456"
                    className="w-full p-3.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-center text-2xl font-mono tracking-widest text-blue-700 font-bold"
                    value={forgotCode}
                    onChange={e => setForgotCode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setForgotStep(1)}
                    className="w-1/3 border-2 border-gray-100 hover:border-gray-200 text-gray-600 font-bold py-3.5 rounded-xl text-xs transition"
                  >
                    Changer d'email
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading || forgotCode.length !== 6}
                    className="w-2/3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg disabled:opacity-50 text-sm"
                  >
                    {forgotLoading ? "Vérification..." : "Valider le code"}
                  </button>
                </div>
              </form>
            )}

            {/* Étape 3 : Saisie du nouveau mot de passe */}
            {forgotStep === 3 && (
              <form onSubmit={handleCompleteReset} className="space-y-4">
                <p className="text-xs text-gray-600 leading-relaxed">
                  Code vérifié avec succès ! Choisissez un nouveau mot de passe pour votre compte.
                </p>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Nouveau Mot de passe</label>
                  <input
                    type="password"
                    required
                    placeholder="Min 6 caractères"
                    className="w-full p-3.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider">Confirmer le mot de passe</label>
                  <input
                    type="password"
                    required
                    placeholder="Répétez le mot de passe"
                    className="w-full p-3.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-sm"
                    value={newPasswordConfirm}
                    onChange={e => setNewPasswordConfirm(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 rounded-xl transition duration-200 shadow-lg shadow-emerald-500/20 disabled:opacity-60 text-sm"
                >
                  {forgotLoading ? "Enregistrement..." : "Enregistrer le nouveau mot de passe"}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Liens bas de page */}
      <div className="mt-8 flex items-center justify-center gap-6 text-xs text-blue-200/70">
        <Link to="/schedule" className="hover:text-white transition">Emploi du temps public</Link>
        <span>•</span>
        <Link to="/admin-login" className="hover:text-white transition">Accès Enseignant / Admin</Link>
      </div>
    </div>
  );
}
