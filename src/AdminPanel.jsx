import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { db } from './firebase';
import { collection, addDoc, getDocs, query, where, doc, setDoc } from 'firebase/firestore';

export default function AdminPanel() {
  const [filiere, setFiliere] = useState('Informatique');
  const [niveau, setNiveau] = useState('L1');
  const [ue, setUe] = useState('');
  const [launchTime, setLaunchTime] = useState('');
  const [history, setHistory] = useState([]);

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async () => {
    const q = query(collection(db, "quizzes"));
    const snapshot = await getDocs(q);
    setHistory(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ue) {
      alert("Veuillez d'abord saisir le code de l'UE.");
      return;
    }
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const questionsRef = collection(db, `quizzes/${ue}/questions`);
        for (let q of results.data) {
          if (q.Question) await addDoc(questionsRef, q);
        }
        alert("✅ Questions importées avec succès !");
      }
    });
  };

  const handleSetLaunchTime = async () => {
    if (!ue) return alert("Veuillez saisir le Code UE.");
    if (!launchTime) return alert("Veuillez définir une heure.");
    
    await setDoc(doc(db, "quizzes", ue), { 
      filiere,
      niveau,
      ue,
      launchTime: new Date(launchTime).getTime() 
    }, { merge: true });
    
    alert("✅ Quiz programmé avec succès !");
    fetchHistory();
  };

  const exportCSV = async (quizId) => {
    const q = query(collection(db, "results"), where("ue", "==", quizId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(d => ({ 
      Nom: d.data().name, 
      Score: d.data().score, 
      Total: d.data().total,
      Date: new Date(d.data().date).toLocaleString()
    }));

    if (data.length === 0) {
      alert("Aucun résultat trouvé pour ce quiz.");
      return;
    }

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Resultats_${quizId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8 text-blue-800 border-b pb-4">Administration QCM</h1>
      
      <div className="bg-white p-6 rounded-lg shadow-md mb-8 border-l-4 border-blue-500">
        <h2 className="text-xl font-bold mb-4 text-gray-700">1. Création / Configuration du Quiz</h2>
        
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

        <div className="mb-4">
          <label className="block text-sm font-bold text-gray-700 mb-2">Code UE :</label>
          <input 
            type="text" 
            value={ue} 
            onChange={e => setUe(e.target.value)} 
            className="border-2 border-gray-200 p-3 rounded w-full focus:border-blue-500 outline-none transition" 
            placeholder="Ex: INF232" 
          />
        </div>
        
        <div className="mb-6">
          <label className="block mb-2 font-semibold text-gray-600">Importer les questions (.csv) :</label>
          <input type="file" accept=".csv" onChange={handleFileUpload} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
        </div>
        
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block mb-2 font-semibold text-gray-600">Heure de lancement :</label>
            <input 
              type="datetime-local" 
              onChange={e => setLaunchTime(e.target.value)} 
              className="border-2 border-gray-200 p-3 rounded w-full outline-none focus:border-blue-500 transition" 
            />
          </div>
          <button onClick={handleSetLaunchTime} className="bg-blue-600 text-white px-6 py-3 rounded font-bold hover:bg-blue-700 transition shadow">
            Programmer
          </button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-lg shadow-md border-l-4 border-indigo-500">
        <h2 className="text-xl font-bold mb-4 text-gray-700">2. Historique des QCM</h2>
        {history.length === 0 ? (
          <p className="text-gray-500 italic">Aucun quiz trouvé.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full bg-white">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-gray-600">UE</th>
                  <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-gray-600">Filière / Niveau</th>
                  <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-gray-600">Date Prévue</th>
                  <th className="text-left py-3 px-4 uppercase font-semibold text-sm text-gray-600">Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map((quiz) => (
                  <tr key={quiz.id} className="border-b hover:bg-gray-50 transition">
                    <td className="py-3 px-4 font-bold text-gray-800">{quiz.id}</td>
                    <td className="py-3 px-4 text-gray-600">{quiz.filiere} - {quiz.niveau}</td>
                    <td className="py-3 px-4 text-gray-600">
                      {quiz.launchTime ? new Date(quiz.launchTime).toLocaleString() : 'Non définie'}
                    </td>
                    <td className="py-3 px-4">
                      <button onClick={() => exportCSV(quiz.id)} className="bg-green-600 text-white px-4 py-2 rounded text-sm font-bold hover:bg-green-700 transition shadow">
                        Télécharger Résultats (CSV)
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
