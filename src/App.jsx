import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate, Link, Navigate } from 'react-router-dom';
import { db } from './firebase';
import { collection, getDocs, query, where, orderBy } from 'firebase/firestore';
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
  const [name, setName] = useState('');
  const [filiere, setFiliere] = useState('Informatique');
  const [niveau, setNiveau] = useState('L2');
  const [ue, setUe] = useState('');
  const [availableUes, setAvailableUes] = useState([]);
  const [loadingUes, setLoadingUes] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUes = async () => {
      setLoadingUes(true);
      setUe('');
      try {
        // Essaie d'abord dans la collection "ues" gérée par l'admin
        const snap = await getDocs(query(
          collection(db, "ues"),
          where("filiere", "==", filiere),
          where("niveau", "==", niveau)
        ));
        if (snap.size > 0) {
          setAvailableUes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } else {
          // Fallback : cherche dans les quiz déjà programmés
          const qSnap = await getDocs(query(
            collection(db, "quizzes"),
            where("filiere", "==", filiere),
            where("niveau", "==", niveau)
          ));
          setAvailableUes(qSnap.docs.map(d => ({ id: d.id, label: d.data().ue || d.id, ...d.data() })));
        }
      } catch {
        setAvailableUes([]);
      }
      setLoadingUes(false);
    };
    fetchUes();
  }, [filiere, niveau]);

  const handleStart = (e) => {
    e.preventDefault();
    if (!name.trim()) { alert("Saisissez votre nom."); return; }
    if (!ue) { alert("Sélectionnez une UE."); return; }
    localStorage.setItem('userSession', JSON.stringify({ name: name.trim(), filiere, niveau, ue }));
    navigate(`/quiz/${ue}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-indigo-950 p-4 relative">
      {/* Lien discret emploi du temps */}
      <Link to="/schedule" className="absolute top-4 right-4 text-blue-300 hover:text-white text-xs font-semibold transition">
        📅 Emploi du temps
      </Link>

      <form onSubmit={handleStart} className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-black text-blue-600 tracking-tight">Portail QCM</h1>
          <p className="text-gray-500 text-sm mt-1">Université de Yaoundé I — UY1</p>
        </div>

        <label className="block text-sm font-bold text-gray-700 mb-1">Nom Complet</label>
        <input type="text" placeholder="Ex: Yves Elysée" required
          className="w-full p-3 mb-4 border-2 border-gray-100 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition"
          onChange={e => setName(e.target.value)} />

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">Filière</label>
            <select className="w-full p-3 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none transition text-sm" value={filiere} onChange={e => setFiliere(e.target.value)}>
              <option>Informatique</option>
              <option>Mathématiques</option>
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

        <label className="block text-sm font-bold text-gray-700 mb-1">Unité d'Enseignement</label>
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
          <p className="text-xs text-orange-500 mb-3">Aucune UE disponible pour cette filière et ce niveau.</p>
        )}

        <button type="submit" className="w-full mt-4 bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
          Rejoindre l'épreuve →
        </button>
      </form>
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
