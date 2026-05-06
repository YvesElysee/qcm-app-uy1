import { useState, useEffect } from 'react';
import Papa from 'papaparse';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { db } from './firebase';
import {
  collection, addDoc, getDocs, setDoc, doc,
  query, where, deleteDoc, orderBy
} from 'firebase/firestore';

const TABS = ['Créer Quiz', 'Gérer UEs', 'Historique', 'Emploi du temps'];

const FILIERES_DEFAULT = ['Informatique', 'Mathématiques', 'Physique'];
const NIVEAUX_DEFAULT = ['L1', 'L2', 'L3', 'M1', 'M2'];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState(0);

  // ── Tab 1 : Créer un quiz ──────────────────────
  const [filiere, setFiliere] = useState('Informatique');
  const [niveau, setNiveau] = useState('L1');
  const [semestre, setSemestre] = useState('1');
  const [ue, setUe] = useState('');
  const [launchTime, setLaunchTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timePerQuestion, setTimePerQuestion] = useState('');
  const [importing, setImporting] = useState(false);

  // ── Tab 2 : Gérer filières/niveaux/UEs ────────
  const [filieres, setFilieres] = useState(FILIERES_DEFAULT);
  const [niveaux, setNiveaux] = useState(NIVEAUX_DEFAULT);
  const [newFiliere, setNewFiliere] = useState('');
  const [newNiveau, setNewNiveau] = useState('');
  const [newUeCode, setNewUeCode] = useState('');
  const [newUeLabel, setNewUeLabel] = useState('');
  const [newUeFiliere, setNewUeFiliere] = useState('Informatique');
  const [newUeNiveau, setNewUeNiveau] = useState('L1');
  const [allUes, setAllUes] = useState([]);

  // ── Tab 3 : Historique ────────────────────────
  const [history, setHistory] = useState([]);

  // ── Tab 4 : Emploi du temps ───────────────────
  const [upcoming, setUpcoming] = useState([]);

  useEffect(() => {
    fetchHistory();
    fetchUes();
    fetchUpcoming();
  }, []);

  // ─── Data fetchers ────────────────────────────
  const fetchHistory = async () => {
    const snap = await getDocs(query(collection(db, "quizzes"), orderBy("launchTime", "desc")));
    setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const fetchUes = async () => {
    const snap = await getDocs(collection(db, "ues"));
    setAllUes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const fetchUpcoming = async () => {
    const snap = await getDocs(query(collection(db, "quizzes"), orderBy("launchTime", "asc")));
    const now = Date.now();
    setUpcoming(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.launchTime > now));
  };

  // ─── Tab 1 handlers ───────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!ue) { alert("Saisissez d'abord le code UE."); return; }
    setImporting(true);
    Papa.parse(file, {
      header: true,
      complete: async (results) => {
        const questionsRef = collection(db, `quizzes/${ue}/questions`);
        for (let q of results.data) {
          if (q.Question) await addDoc(questionsRef, q);
        }
        setImporting(false);
        alert("✅ Questions importées !");
      }
    });
  };

  const handleSaveQuiz = async () => {
    if (!ue) { alert("Saisissez le code UE."); return; }
    const data = { filiere, niveau, semestre, ue };
    if (launchTime) data.launchTime = new Date(launchTime).getTime();
    if (endTime) data.endTime = new Date(endTime).getTime();
    if (timePerQuestion) data.timePerQuestion = parseInt(timePerQuestion);
    await setDoc(doc(db, "quizzes", ue), data, { merge: true });
    alert("✅ Quiz programmé avec succès !");
    fetchHistory();
    fetchUpcoming();
  };

  // ─── Tab 2 handlers ───────────────────────────
  const addFiliere = () => {
    if (!newFiliere.trim() || filieres.includes(newFiliere.trim())) return;
    setFilieres([...filieres, newFiliere.trim()]);
    setNewFiliere('');
  };

  const addNiveau = () => {
    if (!newNiveau.trim() || niveaux.includes(newNiveau.trim())) return;
    setNiveaux([...niveaux, newNiveau.trim()]);
    setNewNiveau('');
  };

  const addUe = async () => {
    if (!newUeCode.trim()) { alert("Entrez un code UE."); return; }
    await setDoc(doc(db, "ues", newUeCode.trim()), {
      code: newUeCode.trim(),
      label: newUeLabel.trim() || newUeCode.trim(),
      filiere: newUeFiliere,
      niveau: newUeNiveau
    });
    alert(`UE "${newUeCode}" ajoutée !`);
    setNewUeCode(''); setNewUeLabel('');
    fetchUes();
  };

  const deleteUe = async (id) => {
    if (!confirm(`Supprimer l'UE "${id}" ?`)) return;
    await deleteDoc(doc(db, "ues", id));
    fetchUes();
  };

  // ─── Tab 3 : exports ──────────────────────────
  const exportCSV = async (quizId) => {
    const snap = await getDocs(query(collection(db, "results"), where("ue", "==", quizId)));
    const data = snap.docs.map(d => ({
      Nom: d.data().name, Score: d.data().score,
      Total: d.data().total, Note: d.data().total ? ((d.data().score / d.data().total) * 20).toFixed(2) : 0,
      Date: new Date(d.data().date).toLocaleString('fr-FR')
    }));
    if (!data.length) { alert("Aucun résultat."); return; }
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `Resultats_${quizId}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  const exportPDF = async (quizId) => {
    const snap = await getDocs(query(collection(db, "results"), where("ue", "==", quizId)));
    const data = snap.docs.map(d => [
      d.data().name, d.data().score, d.data().total,
      d.data().total ? `${((d.data().score / d.data().total) * 20).toFixed(2)}/20` : '—',
      new Date(d.data().date).toLocaleString('fr-FR')
    ]);
    if (!data.length) { alert("Aucun résultat."); return; }
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);
    docPdf.text(`Résultats Officiels — ${quizId}`, 14, 14);
    docPdf.setFontSize(10);
    docPdf.text(`Généré le ${new Date().toLocaleString('fr-FR')}`, 14, 21);
    docPdf.autoTable({
      startY: 28,
      head: [['Nom', 'Score', 'Total', 'Note /20', 'Date']],
      body: data,
      styles: { fontSize: 10 },
      headStyles: { fillColor: [37, 99, 235] }
    });
    docPdf.save(`PV_${quizId}.pdf`);
  };

  const formatDate = (ts) => ts ? new Date(ts).toLocaleString('fr-FR') : '—';

  // ─── Shared styles ────────────────────────────
  const label = "block text-sm font-bold text-gray-700 mb-1";
  const input = "w-full p-2.5 border-2 border-gray-100 rounded-lg focus:border-blue-500 outline-none transition text-sm";
  const btn = (color = 'blue') => `bg-${color}-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-${color}-700 transition shadow`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-blue-800">Administration QCM — UY1</h1>
          <p className="text-gray-500 text-sm">Panneau de contrôle</p>
        </div>
        <button onClick={() => { sessionStorage.removeItem('adminAuth'); location.href = '/'; }} className="text-sm text-gray-500 hover:text-red-600 transition border border-gray-200 px-3 py-1.5 rounded-lg">
          Déconnexion
        </button>
      </div>

      {/* Onglets */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-6">
        <div className="flex gap-1 bg-white p-1 rounded-xl shadow-sm mb-6 border border-gray-100 overflow-x-auto">
          {TABS.map((t, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              className={`flex-1 min-w-max py-2 px-3 rounded-lg text-sm font-bold transition ${activeTab === i ? 'bg-blue-600 text-white shadow' : 'text-gray-500 hover:text-blue-600'}`}>
              {t}
            </button>
          ))}
        </div>

        {/* ── Onglet 1 : Créer un Quiz ── */}
        {activeTab === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
            <h2 className="text-lg font-bold text-gray-700 border-b pb-2">Créer / Programmer un Quiz</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className={label}>Filière</label>
                <select className={input} value={filiere} onChange={e => setFiliere(e.target.value)}>
                  {filieres.map(f => <option key={f}>{f}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Niveau</label>
                <select className={input} value={niveau} onChange={e => setNiveau(e.target.value)}>
                  {niveaux.map(n => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label className={label}>Semestre</label>
                <select className={input} value={semestre} onChange={e => setSemestre(e.target.value)}>
                  <option value="1">Semestre 1</option>
                  <option value="2">Semestre 2</option>
                </select>
              </div>
            </div>

            <div>
              <label className={label}>Code UE</label>
              <input type="text" placeholder="Ex: INF232" className={input} value={ue} onChange={e => setUe(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={label}>Heure de lancement</label>
                <input type="datetime-local" className={input} onChange={e => setLaunchTime(e.target.value)} />
              </div>
              <div>
                <label className={label}>Heure de fin (soumission auto)</label>
                <input type="datetime-local" className={input} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>

            <div>
              <label className={label}>Temps par question (secondes, 0 = illimité)</label>
              <input type="number" min="0" placeholder="Ex: 60" className={input} value={timePerQuestion} onChange={e => setTimePerQuestion(e.target.value)} />
            </div>

            <div>
              <label className={label}>Importer les questions (.csv)</label>
              <p className="text-xs text-gray-400 mb-2">Colonnes requises : Question, OptA, OptB, OptC, OptD, ReponseCorrecte</p>
              <input type="file" accept=".csv" onChange={handleFileUpload}
                className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 transition" />
              {importing && <p className="text-blue-500 text-sm mt-1 animate-pulse">Importation en cours...</p>}
            </div>

            <button onClick={handleSaveQuiz} className="w-full bg-blue-600 text-white py-3 rounded-xl font-black text-base hover:bg-blue-700 transition shadow-lg">
              💾 Enregistrer et Programmer le Quiz
            </button>
          </div>
        )}

        {/* ── Onglet 2 : Gérer UEs ── */}
        {activeTab === 1 && (
          <div className="space-y-6">
            {/* Filières */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-700 border-b pb-2 mb-4">Filières</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {filieres.map(f => <span key={f} className="bg-blue-100 text-blue-700 text-sm font-bold px-3 py-1 rounded-full">{f}</span>)}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Nouvelle filière" className={`flex-1 ${input}`} value={newFiliere} onChange={e => setNewFiliere(e.target.value)} />
                <button onClick={addFiliere} className={btn('blue')}>Ajouter</button>
              </div>
            </div>

            {/* Niveaux */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-700 border-b pb-2 mb-4">Niveaux</h2>
              <div className="flex flex-wrap gap-2 mb-4">
                {niveaux.map(n => <span key={n} className="bg-purple-100 text-purple-700 text-sm font-bold px-3 py-1 rounded-full">{n}</span>)}
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="Nouveau niveau" className={`flex-1 ${input}`} value={newNiveau} onChange={e => setNewNiveau(e.target.value)} />
                <button onClick={addNiveau} className={btn('purple')}>Ajouter</button>
              </div>
            </div>

            {/* UEs */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
              <h2 className="text-lg font-bold text-gray-700 border-b pb-2 mb-4">Unités d'Enseignement</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
                <div>
                  <label className={label}>Code UE</label>
                  <input type="text" placeholder="INF232" className={input} value={newUeCode} onChange={e => setNewUeCode(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Intitulé</label>
                  <input type="text" placeholder="Système d'Exploitation" className={input} value={newUeLabel} onChange={e => setNewUeLabel(e.target.value)} />
                </div>
                <div>
                  <label className={label}>Filière</label>
                  <select className={input} value={newUeFiliere} onChange={e => setNewUeFiliere(e.target.value)}>
                    {filieres.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div>
                  <label className={label}>Niveau</label>
                  <select className={input} value={newUeNiveau} onChange={e => setNewUeNiveau(e.target.value)}>
                    {niveaux.map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={addUe} className={`${btn('green')} mb-4`}>+ Ajouter l'UE</button>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead><tr className="bg-gray-50 border-b"><th className="text-left py-2 px-3 font-semibold text-gray-600">Code</th><th className="text-left py-2 px-3 font-semibold text-gray-600">Intitulé</th><th className="text-left py-2 px-3 font-semibold text-gray-600">Filière</th><th className="text-left py-2 px-3 font-semibold text-gray-600">Niveau</th><th></th></tr></thead>
                  <tbody>
                    {allUes.map(u => (
                      <tr key={u.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3 font-bold text-gray-800">{u.id}</td>
                        <td className="py-2 px-3 text-gray-600">{u.label}</td>
                        <td className="py-2 px-3 text-gray-600">{u.filiere}</td>
                        <td className="py-2 px-3 text-gray-600">{u.niveau}</td>
                        <td className="py-2 px-3"><button onClick={() => deleteUe(u.id)} className="text-red-500 hover:text-red-700 font-bold text-xs">Supprimer</button></td>
                      </tr>
                    ))}
                    {allUes.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400 italic">Aucune UE définie</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Onglet 3 : Historique ── */}
        {activeTab === 2 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 border-b pb-2 mb-4">Historique des QCM</h2>
            {history.length === 0
              ? <p className="text-gray-400 italic text-center py-8">Aucun quiz créé</p>
              : <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="text-left py-3 px-3 font-semibold text-gray-600">UE</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-600">Filière / Niveau</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-600">Lancement</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-600">Fin</th>
                      <th className="text-left py-3 px-3 font-semibold text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(q => (
                      <tr key={q.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-3 font-bold text-gray-800">{q.id}</td>
                        <td className="py-3 px-3 text-gray-600">{q.filiere} — {q.niveau}</td>
                        <td className="py-3 px-3 text-gray-600">{formatDate(q.launchTime)}</td>
                        <td className="py-3 px-3 text-gray-600">{formatDate(q.endTime)}</td>
                        <td className="py-3 px-3 flex gap-2">
                          <button onClick={() => exportCSV(q.id)} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-700 transition">CSV</button>
                          <button onClick={() => exportPDF(q.id)} className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition">PDF</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            }
          </div>
        )}

        {/* ── Onglet 4 : Emploi du temps ── */}
        {activeTab === 3 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-700 border-b pb-2 mb-4">Emploi du temps — Prochains QCM</h2>
            {upcoming.length === 0
              ? <p className="text-gray-400 italic text-center py-8">Aucun QCM à venir</p>
              : <div className="space-y-3">
                {upcoming.map(q => (
                  <div key={q.id} className="flex items-center justify-between p-4 bg-blue-50 rounded-xl border border-blue-100">
                    <div>
                      <p className="font-black text-gray-800">{q.ue || q.id}</p>
                      <p className="text-sm text-gray-500">{q.filiere} — {q.niveau} — S{q.semestre}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-700">📅 {formatDate(q.launchTime)}</p>
                      {q.endTime && <p className="text-xs text-gray-400">⏳ Fin : {formatDate(q.endTime)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}
