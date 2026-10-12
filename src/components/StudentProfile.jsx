import { useState } from 'react';
import { getCurrentUser, updateStudentProfile, hashPassword } from '../services/authService';
import { db } from '../firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { sanitizeEmailDocId } from '../services/authService';

export default function StudentProfile({ onClose, onProfileUpdated }) {
  const user = getCurrentUser() || {};
  const [name, setName] = useState(user.name || '');
  const [dateNaissance, setDateNaissance] = useState(user.dateNaissance || '');
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Changement de mot de passe
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdMsg, setPwdMsg] = useState('');
  const [pwdError, setPwdError] = useState('');

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await updateStudentProfile(user.email, {
        name: name.trim(),
        dateNaissance
      });
      setSuccessMsg("Profil mis à jour avec succès !");
      if (onProfileUpdated) onProfileUpdated();
    } catch (err) {
      setErrorMsg(err.message || "Erreur de mise à jour.");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwdSaving(true);
    setPwdMsg('');
    setPwdError('');

    if (newPassword.length < 6) {
      setPwdError("Le nouveau mot de passe doit comporter au moins 6 caractères.");
      setPwdSaving(false);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPwdError("Les deux nouveaux mots de passe ne correspondent pas.");
      setPwdSaving(false);
      return;
    }

    try {
      const docId = sanitizeEmailDocId(user.email);
      const userRef = doc(db, "users", docId);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        throw new Error("Utilisateur introuvable.");
      }

      const userData = snap.data();
      const oldHash = await hashPassword(oldPassword);

      if (oldHash !== userData.passwordHash) {
        throw new Error("L'ancien mot de passe est incorrect.");
      }

      const newHash = await hashPassword(newPassword);
      await updateDoc(userRef, { passwordHash: newHash });

      setPwdMsg("Mot de passe modifié avec succès !");
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);
    } catch (err) {
      setPwdError(err.message || "Erreur lors du changement de mot de passe.");
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden max-w-lg w-full mx-auto">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black">Mon Profil Étudiant</h2>
          <p className="text-blue-200 text-xs mt-0.5">{user.email}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition">
            ✕
          </button>
        )}
      </div>

      <div className="p-6 space-y-5">
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center gap-2">
            <span>✓</span> <span>{successMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl p-3 flex items-center gap-2">
            <span>⚠️</span> <span>{errorMsg}</span>
          </div>
        )}

        {/* Détails académiques (Fixes) */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-gray-400 block font-medium">Filière d'inscription</span>
            <span className="font-extrabold text-blue-700 text-sm">{user.filiere}</span>
          </div>
          <div>
            <span className="text-gray-400 block font-medium">Niveau d'inscription</span>
            <span className="font-extrabold text-gray-800 text-sm">{user.niveau}</span>
          </div>
          <div>
            <span className="text-gray-400 block font-medium">Année Académique</span>
            <span className="font-extrabold text-gray-800">{user.anneeAcademique || '2025-2026'}</span>
          </div>
          <div>
            <span className="text-gray-400 block font-medium">Statut du compte</span>
            <span className="font-bold text-emerald-600">Actif • UY1</span>
          </div>
        </div>

        {/* Formulaire de modification */}
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Nom Complet ou Pseudo</label>
            <input
              type="text"
              required
              className="w-full p-2.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none text-xs text-gray-800"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Date de naissance</label>
            <input
              type="date"
              className="w-full p-2.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none text-xs text-gray-800"
              value={dateNaissance}
              onChange={e => setDateNaissance(e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => setShowPasswordChange(!showPasswordChange)}
              className="text-xs font-bold text-blue-600 hover:underline"
            >
              {showPasswordChange ? "Annuler le changement de mot de passe" : "Modifier mon mot de passe"}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold px-5 py-2.5 rounded-xl text-xs transition shadow-md disabled:opacity-50"
            >
              {saving ? "Enregistrement..." : "Enregistrer"}
            </button>
          </div>
        </form>

        {/* Section Changement de mot de passe */}
        {showPasswordChange && (
          <form onSubmit={handleChangePassword} className="border-t border-gray-100 pt-4 space-y-3">
            <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider">Sécurité du compte</h3>
            {pwdError && <p className="text-xs text-red-500">{pwdError}</p>}
            {pwdMsg && <p className="text-xs text-emerald-600">{pwdMsg}</p>}

            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1">Ancien mot de passe</label>
              <input
                type="password"
                required
                className="w-full p-2.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none text-xs"
                value={oldPassword}
                onChange={e => setOldPassword(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Nouveau mot de passe</label>
                <input
                  type="password"
                  required
                  className="w-full p-2.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none text-xs"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Confirmer</label>
                <input
                  type="password"
                  required
                  className="w-full p-2.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none text-xs"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={pwdSaving}
              className="w-full bg-slate-800 hover:bg-slate-900 text-white font-bold py-2.5 rounded-xl text-xs transition disabled:opacity-50"
            >
              {pwdSaving ? "Mise à jour..." : "Mettre à jour le mot de passe"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
