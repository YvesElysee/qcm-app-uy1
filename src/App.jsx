import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Link, Navigate } from 'react-router-dom';
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import AdminPanel from './AdminPanel';
import QuizSession from './QuizSession';
import Login from './components/Login';
import Schedule from './components/Schedule';
import ReviewSession from './components/ReviewSession';

// ── Guard Admin ───────────────────────────────────────────────────────
function RequireAdmin({ children }) {
  const ok = sessionStorage.getItem('adminAuth') === '1';
  return ok ? children : <Navigate to="/admin-login" replace />;
}

// ── Page d'Accueil Étudiant ───────────────────────────────────────────
function Home() {
  const [name, setName] = useState(localStorage.getItem('qcm_last_name') || '');
  const [filiere, setFiliere] = useState('Informatique');
  const [niveau, setNiveau] = useState('L2');
  const [ue, setUe] = useState('');
  const [availableUes, setAvailableUes] = useState([]);
  const [loadingUes, setLoadingUes] = useState(false);
  const [showWarning, setShowWarning] = useState(false);
  const [myHistory, setMyHistory] = useState([]);
  const navigate = useNavigate();

  // Charger l'historique personnel depuis localStorage
  useEffect(() => {
    const n = name.trim();
    if (!n) { setMyHistory([]); return; }
    const histKey = `qcm_history_${n}`;
    const hist = JSON.parse(localStorage.getItem(histKey) || '[]');
    setMyHistory(hist);
  }, [name]);

  useEffect(() => {
    const fetchUes = async () => {
      setLoadingUes(true);
      setUe('');
      try {
        const snap = await getDocs(query(
          collection(db, "ues"),
          where("filiere", "==", filiere),
          where("niveau", "==", niveau)
        ));
        if (snap.size > 0) {
          setAvailableUes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          const qSnap = await getDocs(query(
            collection(db, "quizzes"),
            where("filiere", "==", filiere),
            where("niveau", "==", niveau)
          ));
          setAvailableUes(qSnap.docs.map(d => ({ id: d.id, label: d.data().ue || d.id, ...d.data() })));
        }
      } catch { setAvailableUes([]); }
      setLoadingUes(false);
    };
    fetchUes();
  }, [filiere, niveau]);

  const handleStart = (e) => {
    e.preventDefault();
    if (!name.trim()) { alert("Saisissez votre nom."); return; }
    if (!ue) { alert("Selectionnez une UE."); return; }
    setShowWarning(true);
  };

  const confirmStart = () => {
    localStorage.setItem('qcm_last_name', name.trim());
    localStorage.setItem('userSession', JSON.stringify({ name: name.trim(), filiere, niveau, ue }));
    navigate(`/quiz/${ue}`);
  };

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-900 to-indigo-950 p-4">
      <div className="max-w-2xl mx-auto pt-8">
        {/* Lien emploi du temps */}
        <div className="flex justify-end mb-4">
          <Link to="/schedule" className="text-blue-300 hover:text-white text-xs font-semibold transition border border-blue-700 px-3 py-1.5 rounded-lg">
            Emploi du temps
          </Link>
        </div>

        {/* Formulaire principal */}
        <form onSubmit={handleStart} className="bg-white p-8 rounded-2xl shadow-2xl border border-gray-100 mb-6">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-black text-blue-600 tracking-tight">Portail QCM UY1</h1>
            <p className="text-gray-500 text-sm mt-1">Plateforme dedié à la préparation de Examen Téléévaluation 2026</p>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-700 font-medium">
            Attention : utilisez toujours le meme nom pour retrouver vos anciens resultats et relire vos anciens Quizz .
          </div>

          <label className="block text-sm font-bold text-gray-700 mb-1">Nom Complet</label>
          <input type="text" placeholder="Ex: Yves Elysee" required
            className="w-full p-3 mb-4 border-2 border-gray-100 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition"
            value={name}
            onChange={e => setName(e.target.value)} />

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Filiere</label>
              <select className="w-full p-3 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none transition text-sm" value={filiere} onChange={e => setFiliere(e.target.value)}>
                <option>Informatique</option>
                <option>Mathematiques</option>
                <option>Physique</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-1">Niveau</label>
              <select className="w-full p-3 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none transition text-sm" value={niveau} onChange={e => setNiveau(e.target.value)}>
                <option>L1</option><option>L2</option><option>L3</option>
                <option>M1</option><option>M2</option>
              </select>
            </div>
          </div>

          <label className="block text-sm font-bold text-gray-700 mb-1">Unite d'Enseignement</label>
          <select required value={ue}
            className="w-full p-3 mb-1 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none transition text-sm"
            onChange={e => setUe(e.target.value)}>
            <option value="">
              {loadingUes ? 'Chargement...' : availableUes.length === 0 ? '— Aucune UE disponible —' : '— Choisir votre UE —'}
            </option>
            {availableUes.map(u => (
              <option key={u.id} value={u.id}>{u.label || u.id}</option>
            ))}
          </select>
          {!loadingUes && availableUes.length === 0 && (
            <p className="text-xs text-orange-500 mb-3">Aucune UE disponible pour cette filiere et ce niveau.</p>
          )}

          <button type="submit" className="w-full mt-4 bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
            Rejoindre l'epreuve
          </button>
        </form>

        {/* Historique personnel */}
        {myHistory.length > 0 && (
          <div className="bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20">
            <h2 className="text-white font-bold text-base mb-4">Mes QCM passés — {name.trim()}</h2>
            <div className="space-y-2">
              {myHistory.map((h, i) => {
                const note = h.total ? ((h.score / h.total) * 20).toFixed(1) : '—';
                return (
                  <div key={i} className="bg-white/10 rounded-xl p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-white text-sm">{h.quizId}</p>
                      <p className="text-blue-200 text-xs">{h.filiere} — {h.niveau} — {fmtDate(h.date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="font-black text-white text-sm">{note}/20</p>
                        <p className="text-blue-200 text-xs">{h.score}/{h.total}</p>
                      </div>
                      <Link to={`/review/${h.quizId}`}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold px-3 py-2 rounded-lg transition shrink-0">
                        Relire
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal d'avertissement */}
      {showWarning && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-black text-gray-800 mb-2">Information importante</h3>
            <p className="text-gray-600 text-sm mb-2">
              Vous allez demarrer le QCM en tant que :
            </p>
            <p className="font-black text-blue-600 text-lg mb-3">{name.trim()}</p>
            <p className="text-gray-500 text-xs mb-6 bg-amber-50 border border-amber-200 rounded-lg p-3">
              Pour revoir vos notes et relire votre copie a l'avenir, vous devrez vous reconnectez avec exactement ce nom. Ne le changez pas.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowWarning(false)} className="flex-1 border-2 border-gray-100 text-gray-700 py-3 rounded-xl font-bold hover:border-gray-300 transition text-sm">
                Annuler
              </button>
              <button onClick={confirmStart} className="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition text-sm">
                Je comprends, commencer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quiz/:quizId" element={<QuizSession />} />
        <Route path="/schedule" element={<Schedule />} />
        <Route path="/review/:quizId" element={<ReviewSession />} />
        <Route path="/admin-login" element={<Login />} />
        <Route path="/admin" element={<RequireAdmin><AdminPanel /></RequireAdmin>} />
      </Routes>
    </Router>
  );
}
