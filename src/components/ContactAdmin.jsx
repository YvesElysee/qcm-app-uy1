import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { getCurrentUser } from '../services/authService';
import Icon from './ui/icons.jsx';

const CATEGORIES = [
  "Suggestion d'amélioration",
  "Signalement d'une erreur dans un QCM",
  "Demande de rattrapage d'épreuve",
  "Problème technique / Affichage",
  "Autre demande"
];

export default function ContactAdmin({ onClose, preselectedUe = '' }) {
  const user = getCurrentUser() || {};
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [ue, setUe] = useState(preselectedUe);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [myMessages, setMyMessages] = useState([]);
  const [activeTab, setActiveTab] = useState('new'); // 'new' | 'history'
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let ignore = false;
    async function load() {
      if (!user.email) return;
      try {
        const data = await api('/feedback/mine', { auth: 'student' });
        const list = data.feedback;
        list.sort((a, b) => new Date(b.date) - new Date(a.date));
        if (!ignore) {
          setMyMessages(list);
        }
      } catch (err) {
        console.warn("Erreur chargement messages :", err);
      }
    }
    load();
    return () => { ignore = true; };
  }, [user.email, refreshTrigger]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || !subject.trim()) {
      alert("Veuillez renseigner le sujet et votre message.");
      return;
    }

    setSubmitting(true);
    try {
      // L'identité (nom, email, filière...) est complétée par le serveur via le jeton
      await api('/feedback', {
        method: 'POST',
        auth: 'student',
        body: {
          category,
          ue: ue.trim().toUpperCase() || 'Général',
          subject: subject.trim(),
          message: message.trim()
        }
      });

      setSentSuccess(true);
      setSubject('');
      setMessage('');
      setRefreshTrigger(t => t + 1);
    } catch (err) {
      alert("Erreur lors de l'envoi : " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass = 'w-full p-2.5 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-blue-600 outline-none text-xs transition';

  return (
    <div className="bg-slate-900 rounded-3xl shadow-2xl shadow-black/50 border border-slate-800 overflow-hidden max-w-2xl w-full mx-auto">
      {/* Header Modal */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
            <Icon name="chat" size={20} />
          </div>
          <div>
            <h2 className="text-xl font-black">Contacter l'Administration</h2>
            <p className="text-blue-200 text-xs mt-0.5">Suggestions, signalements et demandes d'assistance</p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-6 pt-3">
        <button
          onClick={() => { setActiveTab('new'); setSentSuccess(false); }}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition ${
            activeTab === 'new'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          Nouveau Message
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`pb-3 px-4 text-xs font-bold border-b-2 transition flex items-center gap-1.5 ${
            activeTab === 'history'
              ? 'border-blue-500 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Mes Messages Envoyés</span>
          {myMessages.length > 0 && (
            <span className="bg-blue-600/20 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-full font-black">
              {myMessages.length}
            </span>
          )}
        </button>
      </div>

      {/* Contenu */}
      <div className="p-6">
        {activeTab === 'new' ? (
          sentSuccess ? (
            <div className="text-center py-10 space-y-3">
              <div className="w-14 h-14 bg-emerald-600/15 border border-emerald-600/40 text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                <Icon name="check" size={26} strokeWidth={3} />
              </div>
              <h3 className="text-lg font-black text-white">Message transmis avec succès !</h3>
              <p className="text-sm text-slate-400 max-w-sm mx-auto">
                Votre remarque a été transmise à l'administration de la filière {user.filiere}.
              </p>
              <div className="pt-4 flex justify-center gap-3">
                <button
                  onClick={() => setSentSuccess(false)}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-5 py-2.5 rounded-xl text-xs transition"
                >
                  Envoyer un autre message
                </button>
                {onClose && (
                  <button
                    onClick={onClose}
                    className="border border-slate-700 text-slate-300 font-bold px-5 py-2.5 rounded-xl text-xs hover:bg-slate-800 transition"
                  >
                    Fermer
                  </button>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">Catégorie</label>
                  <select
                    className="w-full p-2.5 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 focus:border-blue-600 outline-none text-xs font-medium transition"
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                  >
                    {CATEGORIES.map(cat => (
                      <option key={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">UE concernée (optionnel)</label>
                  <input
                    type="text"
                    placeholder="Ex: INF232 ou Général"
                    className={inputClass}
                    value={ue}
                    onChange={e => setUe(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Sujet du message</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Coquille sur la question 4 de l'épreuve INF232"
                  className={inputClass}
                  value={subject}
                  onChange={e => setSubject(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">Message détaillé</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Expliquez clairement votre suggestion, le problème rencontré ou la demande de modification..."
                  className={`${inputClass} leading-relaxed`}
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                />
              </div>

              <div className="bg-blue-950/50 border border-blue-900 rounded-xl p-3 flex items-center justify-between text-xs text-blue-300">
                <span>
                  Envoyé par : <strong>{user.name || 'Étudiant'}</strong> ({user.email}) • {user.filiere} · {user.niveau}
                </span>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                {onClose && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2.5 border border-slate-700 text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-800 transition"
                  >
                    Annuler
                  </button>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs transition shadow-lg shadow-blue-600/20 disabled:opacity-50"
                >
                  {submitting ? "Transmission..." : "Envoyer à l'administration"}
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {myMessages.length === 0 ? (
              <p className="text-slate-500 text-xs italic text-center py-10">
                Vous n'avez envoyé aucun message pour le moment.
              </p>
            ) : (
              myMessages.map(msg => (
                <div key={msg.id} className="border border-slate-800 rounded-2xl p-4 bg-slate-950">
                  <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-100">{msg.subject}</span>
                      <span className="bg-blue-600/20 text-blue-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {msg.ue}
                      </span>
                    </div>
                    <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                      msg.status === 'traite'
                        ? 'bg-emerald-600/15 text-emerald-300'
                        : msg.status === 'en_cours'
                        ? 'bg-indigo-600/15 text-indigo-300'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {msg.status === 'traite' ? 'Traité' : msg.status === 'en_cours' ? 'En cours' : 'En attente'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-2">{msg.message}</p>
                  <p className="text-[10px] text-slate-500">
                    {msg.category} • Envoyé le {new Date(msg.date).toLocaleString('fr-FR')}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
