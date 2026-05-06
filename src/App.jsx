import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { db } from './firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import AdminPanel from './AdminPanel';
import QuizSession from './QuizSession';

function Home() {
  const [name, setName] = useState('');
  const [filiere, setFiliere] = useState('Informatique');
  const [niveau, setNiveau] = useState('L2');
  const [ue, setUe] = useState('');
  const [availableUes, setAvailableUes] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchUes = async () => {
      const q = query(collection(db, "quizzes"), where("filiere", "==", filiere), where("niveau", "==", niveau));
      const snapshot = await getDocs(q);
      setAvailableUes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setUe(''); // Réinitialise l'UE quand la filière ou le niveau change
    };
    fetchUes();
  }, [filiere, niveau]);

  const handleStart = (e) => {
    e.preventDefault();
    if (!name || !ue) return alert("Remplis tous les champs");
    localStorage.setItem('userSession', JSON.stringify({ name, filiere, niveau, ue }));
    navigate(`/quiz/${ue}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-900 to-indigo-950 p-4">
      <form onSubmit={handleStart} className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
        <h1 className="text-3xl font-black mb-2 text-center text-blue-600 tracking-tight">Portail QCM UY1</h1>
        <p className="text-gray-500 text-sm text-center mb-6">Plateforme Temporaire d'Évaluation</p>

        <label className="block text-sm font-bold text-gray-700 mb-2">Nom Complet :</label>
        <input type="text" placeholder="Ex: Yves Elysée" required
          className="w-full p-3 mb-4 border-2 border-gray-100 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition"
          onChange={e => setName(e.target.value)} />

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Filière :</label>
            <select className="w-full p-3 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none" value={filiere} onChange={e => setFiliere(e.target.value)}>
              <option value="Informatique">Informatique</option>
              <option value="Mathématiques">Mathématiques</option>
              <option value="Physique">Physique</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Niveau :</label>
            <select className="w-full p-3 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none" value={niveau} onChange={e => setNiveau(e.target.value)}>
              <option value="L1">L1</option>
              <option value="L2">L2</option>
              <option value="L3">L3</option>
            </select>
          </div>
        </div>

        <label className="block text-sm font-bold text-gray-700 mb-2">Unité d'Enseignement (UE) :</label>
        <select required value={ue} className="w-full p-3 mb-6 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none" onChange={e => setUe(e.target.value)}>
          <option value="">-- Choisir l'UE disponible --</option>
          {availableUes.map(quiz => (
            <option key={quiz.id} value={quiz.id}>{quiz.ue || quiz.id}</option>
          ))}
        </select>

        <button type="submit" className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
          Rejoindre l'épreuve
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/quiz/:quizId" element={<QuizSession />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </Router>
  );
}
