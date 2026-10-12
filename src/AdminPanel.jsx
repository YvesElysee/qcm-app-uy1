import { useState, useEffect } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';
import { db } from './firebase';
import {
  collection, addDoc, getDocs, setDoc, doc,
  query, where, deleteDoc, orderBy, updateDoc
} from 'firebase/firestore';
import { parseQuestionsCsv, downloadCsvTemplate } from './utils/csvParser';
import { getSmtpSettings, saveSmtpSettings, testSmtpConnection } from './services/emailService';

const TABS = [
  'Créer / Gérer Quiz',
  'Gérer UEs',
  'Étudiants Inscrits',
  'Configuration SMTP',
  'Historique & Résultats',
  'Emploi du temps',
  'Messages & Suggestions'
];

const FILIERES_DEFAULT = ['Informatique', 'Mathématiques', 'Physique', 'Chimie', 'Biologie'];
const NIVEAUX_DEFAULT = ['L1', 'L2', 'L3', 'M1', 'M2'];

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState(0);

  // ── Tab 1 : Créer / Programmer un quiz ──────────────────────
  const [filiere, setFiliere] = useState('Informatique');
  const [niveau, setNiveau] = useState('L1');
  const [semestre, setSemestre] = useState('1');
  const [ue, setUe] = useState('');
  const [launchTime, setLaunchTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timePerQuestion, setTimePerQuestion] = useState('60');

  // CSV State & Preview Modal (Point 6)
  const [csvFile, setCsvFile] = useState(null);
  const [parsedCsvData, setParsedCsvData] = useState(null); // { questions, warnings, errors, detectedColumns }
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  // Questions d'un quiz sélectionné pour inspection
  const [inspectQuizId, setInspectQuizId] = useState('');
  const [inspectQuestions, setInspectQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

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

  // ── Tab 3 : Étudiants inscrits (Point 1 & 6) ────────
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilterFiliere, setStudentFilterFiliere] = useState('');

  // ── Tab 4 : Configuration SMTP Google (Point 1 & 6) ───
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTestRecipient, setSmtpTestRecipient] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [smtpSavedMsg, setSmtpSavedMsg] = useState('');

  // ── Tab 5 : Historique & Résultats ────────────────────────
  const [history, setHistory] = useState([]);

  // ── Tab 6 : Emploi du temps ───────────────────
  const [upcoming, setUpcoming] = useState([]);

  // ── Tab 7 : Messages & Feedbacks (Point 5) ────────────────
  const [feedbacks, setFeedbacks] = useState([]);
  const [fbCategory, setFbCategory] = useState('');
  const [fbFiliere, setFbFiliere] = useState('');
  const [loadingFb, setLoadingFb] = useState(false);

  // ─── Data fetchers ────────────────────────────
  const fetchHistory = async () => {
    try {
      const snap = await getDocs(query(collection(db, "quizzes"), orderBy("launchTime", "desc")));
      setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch {
      const fallbackSnap = await getDocs(collection(db, "quizzes"));
      setHistory(fallbackSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  };

  const fetchUpcoming = async () => {
    try {
      const snap = await getDocs(query(collection(db, "quizzes"), orderBy("launchTime", "asc")));
      const now = Date.now();
      setUpcoming(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.launchTime > now));
    } catch {
      const snap = await getDocs(collection(db, "quizzes"));
      const now = Date.now();
      setUpcoming(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(q => q.launchTime && q.launchTime > now));
    }
  };

  const fetchUes = async () => {
    const snap = await getDocs(collection(db, "ues"));
    setAllUes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const fetchStudents = async () => {
    setLoadingStudents(true);
    try {
      const snap = await getDocs(collection(db, "users"));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      setStudents(list);
    } catch (err) {
      console.warn("Erreur chargement étudiants :", err);
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchSmtpConfig = async () => {
    const conf = await getSmtpSettings();
    if (conf) {
      if (conf.email) setSmtpEmail(conf.email);
      if (conf.appPassword) setSmtpPassword(conf.appPassword);
    }
  };

  const fetchFeedbacks = async () => {
    setLoadingFb(true);
    try {
      const snap = await getDocs(collection(db, "feedback"));
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (fbCategory) list = list.filter(f => f.category === fbCategory);
      if (fbFiliere) list = list.filter(f => f.filiere === fbFiliere);
      list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setFeedbacks(list);
    } catch (err) {
      console.warn("Erreur chargement messages :", err);
    } finally {
      setLoadingFb(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    fetchUes();
    fetchUpcoming();
    fetchStudents();
    fetchSmtpConfig();
    fetchFeedbacks();
  }, []);

  // ─── Tab 1 : Gestion CSV Robuste & Import ───────────────────────────
  const handleFileSelected = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvFile(file);

    try {
      const result = await parseQuestionsCsv(file);
      setParsedCsvData(result);
      setShowCsvPreview(true);
    } catch (err) {
      alert("Erreur lors de la lecture du fichier CSV : " + err.message);
    }
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    const targetUe = ue.trim().toUpperCase();
    if (!targetUe) {
      alert("Veuillez d'abord saisir le code UE (ex: INF232).");
      return;
    }
    if (!parsedCsvData?.questions?.length) {
      alert("Aucune question valide à importer.");
      return;
    }

    setImporting(true);
    try {
      const questionsRef = collection(db, `quizzes/${targetUe}/questions`);

      // 1. Supprimer les anciennes questions
      const existing = await getDocs(questionsRef);
      for (const d of existing.docs) {
        await deleteDoc(d.ref);
      }

      // 2. Insérer les nouvelles questions nettoyées
      let count = 0;
      for (const q of parsedCsvData.questions) {
        await addDoc(questionsRef, {
          Question: q.Question,
          OptA: q.OptA || '',
          OptB: q.OptB || '',
          OptC: q.OptC || '',
          OptD: q.OptD || '',
          ReponseCorrecte: q.ReponseCorrecte || q.OptA || ''
        });
        count++;
      }

      // Enregistrer / fusionner aussi la métadonnée du quiz si non encore créée
      const quizRef = doc(db, "quizzes", targetUe);
      await setDoc(quizRef, {
        ue: targetUe,
        filiere,
        niveau,
        semestre,
        questionCount: count,
        timePerQuestion: parseInt(timePerQuestion) || 60,
        updatedAt: new Date().toISOString()
      }, { merge: true });

      alert(`Succès ! ${count} questions importées pour l'UE ${targetUe}.`);
      setShowCsvPreview(false);
      setParsedCsvData(null);
      setCsvFile(null);
      fetchHistory();
      if (inspectQuizId === targetUe) loadInspectQuestions(targetUe);
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setImporting(false);
    }
  };

  const handleSaveQuiz = async () => {
    const targetUe = ue.trim().toUpperCase();
    if (!targetUe) { alert("Saisissez le code UE."); return; }
    const data = {
      filiere,
      niveau,
      semestre,
      ue: targetUe,
      timePerQuestion: parseInt(timePerQuestion) || 60
    };
    if (launchTime) data.launchTime = new Date(launchTime).getTime();
    if (endTime) data.endTime = new Date(endTime).getTime();

    await setDoc(doc(db, "quizzes", targetUe), data, { merge: true });
    alert(`Quiz ${targetUe} programmé avec succès !`);
    fetchHistory();
    fetchUpcoming();
  };

  // Inspecter les questions d'une UE
  const loadInspectQuestions = async (quizId) => {
    setInspectQuizId(quizId);
    setLoadingQuestions(true);
    try {
      const snap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
      setInspectQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.warn("Erreur chargement questions :", err);
    } finally {
      setLoadingQuestions(false);
    }
  };

  const deleteSingleQuestion = async (qId) => {
    if (!confirm("Supprimer cette question ?")) return;
    await deleteDoc(doc(db, `quizzes/${inspectQuizId}/questions`, qId));
    loadInspectQuestions(inspectQuizId);
  };

  // ─── Tab 2 : UEs & Filières ─────────────────────────────────────────
  const addFiliere = () => {
    const f = newFiliere.trim();
    if (!f || filieres.includes(f)) return;
    setFilieres([...filieres, f]);
    setNewFiliere('');
  };

  const addNiveau = () => {
    const n = newNiveau.trim().toUpperCase();
    if (!n || niveaux.includes(n)) return;
    setNiveaux([...niveaux, n]);
    setNewNiveau('');
  };

  const addUe = async () => {
    const code = newUeCode.trim().toUpperCase();
    if (!code) { alert("Entrez un code UE."); return; }
    await setDoc(doc(db, "ues", code), {
      code,
      label: newUeLabel.trim() || code,
      filiere: newUeFiliere,
      niveau: newUeNiveau
    });
    alert(`UE "${code}" ajoutée avec succès !`);
    setNewUeCode('');
    setNewUeLabel('');
    fetchUes();
  };

  const deleteUe = async (id) => {
    if (!confirm(`Supprimer l'UE "${id}" ?`)) return;
    await deleteDoc(doc(db, "ues", id));
    fetchUes();
  };

  // ─── Tab 3 : Gestion Étudiants ──────────────────────────────────────
  const deleteStudent = async (studentId, studentName) => {
    if (!confirm(`Supprimer définitivement l'étudiant ${studentName} ?`)) return;
    await deleteDoc(doc(db, "users", studentId));
    fetchStudents();
  };

  // ─── Tab 4 : Configuration SMTP Google ──────────────────────────────
  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    setSmtpSaving(true);
    setSmtpSavedMsg('');
    try {
      await saveSmtpSettings(smtpEmail, smtpPassword);
      setSmtpSavedMsg("Configuration SMTP enregistrée dans Firestore !");
    } catch (err) {
      alert("Erreur de sauvegarde : " + err.message);
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleTestSmtpConnection = async () => {
    setSmtpTesting(true);
    setSmtpTestResult(null);
    try {
      const res = await testSmtpConnection(smtpEmail, smtpPassword, smtpTestRecipient || smtpEmail);
      setSmtpTestResult(res);
    } catch (err) {
      setSmtpTestResult({ success: false, error: err.message });
    } finally {
      setSmtpTesting(false);
    }
  };

  // ─── Tab 7 : Gestion Messages ───────────────────────────────────────
  const updateMessageStatus = async (id, newStatus) => {
    await updateDoc(doc(db, "feedback", id), { status: newStatus });
    fetchFeedbacks();
  };

  const deleteFeedback = async (id) => {
    if (!confirm("Supprimer ce message ?")) return;
    await deleteDoc(doc(db, "feedback", id));
    fetchFeedbacks();
  };

  // ─── Exports Résultats ───────────────────────────────────────────────
  const exportCSV = async (quizId) => {
    const snap = await getDocs(query(collection(db, "results"), where("ue", "==", quizId)));
    const data = snap.docs.map(d => {
      const r = d.data();
      return {
        Nom: r.name,
        Email: r.email || '—',
        Filiere: r.filiere || '—',
        Niveau: r.niveau || '—',
        Score: r.score,
        Total: r.total,
        Note_Sur_20: r.total ? ((r.score / r.total) * 20).toFixed(2) : 0,
        Rattrapage: r.isMakeup ? 'OUI' : 'NON',
        Date: new Date(r.date).toLocaleString('fr-FR')
      };
    });
    if (!data.length) { alert("Aucun résultat trouvé pour ce quiz."); return; }
    const csv = Papa.unparse(data);
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resultats_${quizId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const exportPDF = async (quizId) => {
    const snap = await getDocs(query(collection(db, "results"), where("ue", "==", quizId)));
    const data = snap.docs.map(d => {
      const r = d.data();
      return [
        r.name,
        r.email || '—',
        `${r.score}/${r.total}`,
        r.total ? `${((r.score / r.total) * 20).toFixed(2)}/20` : '—',
        r.isMakeup ? 'Rattrapage' : 'Régulier',
        new Date(r.date).toLocaleString('fr-FR')
      ];
    });
    if (!data.length) { alert("Aucun résultat."); return; }
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);
    docPdf.text(`Procès-Verbal Officiel des Résultats — ${quizId}`, 14, 14);
    docPdf.setFontSize(9);
    docPdf.text(`Généré le ${new Date().toLocaleString('fr-FR')} • Université de Yaoundé 1`, 14, 21);
    docPdf.autoTable({
      startY: 28,
      head: [['Étudiant', 'Email', 'Score', 'Note /20', 'Type', 'Date']],
      body: data,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] }
    });
    docPdf.save(`PV_${quizId}.pdf`);
  };

  const formatDate = (ts) => ts ? new Date(ts).toLocaleString('fr-FR') : '—';
  const label = "block text-xs font-bold text-gray-700 mb-1 uppercase tracking-wider";
  const input = "w-full p-2.5 border-2 border-gray-100 rounded-xl focus:border-blue-500 outline-none transition text-xs";

  return (
    <div className="min-h-screen bg-slate-100 text-gray-800">
      {/* Header Admin */}
      <header className="bg-slate-900 text-white shadow-md border-b border-slate-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-lg">
            UY1
          </div>
          <div>
            <h1 className="text-xl font-black text-white">Administration QCM — UY1</h1>
            <p className="text-xs text-slate-400">Panneau de gestion pédagogique & technique</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a href="/" target="_blank" rel="noreferrer" className="text-xs font-bold text-blue-300 hover:text-white transition">
            Ouvrir Portail Étudiant ↗
          </a>
          <button
            onClick={() => { sessionStorage.removeItem('adminAuth'); location.href = '/'; }}
            className="text-xs font-bold text-red-300 hover:text-red-100 bg-red-950/60 border border-red-800/80 px-3 py-1.5 rounded-xl transition"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex gap-1 bg-white p-1.5 rounded-2xl shadow-sm mb-6 border border-gray-200 overflow-x-auto">
          {TABS.map((t, i) => (
            <button
              key={i}
              onClick={() => setActiveTab(i)}
              className={`py-2.5 px-4 rounded-xl text-xs font-extrabold whitespace-nowrap transition ${
                activeTab === i
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-500 hover:text-blue-600 hover:bg-gray-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* ─── ONGLET 0 : CRÉER / GÉRER QUIZ (Avec Parser CSV Universel) ─── */}
        {activeTab === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Formulaire Création & Import */}
            <div className="lg:col-span-2 bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-5">
              <div className="border-b pb-3 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-black text-gray-800">Programmer une Évaluation</h2>
                  <p className="text-xs text-gray-500">Configurez la matière, la minuterie et importez les questions</p>
                </div>
                {/* Boutons Modèles CSV (Point 6) */}
                <div className="flex gap-2">
                  <button
                    onClick={() => downloadCsvTemplate(';')}
                    className="text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 px-3 py-1.5 rounded-xl transition"
                    title="Télécharger modèle Excel français avec séparateur point-virgule"
                  >
                    📥 Modèle Excel ( ; )
                  </button>
                  <button
                    onClick={() => downloadCsvTemplate(',')}
                    className="text-[11px] font-bold bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-xl transition"
                    title="Télécharger modèle CSV standard avec séparateur virgule"
                  >
                    📥 Modèle Standard ( , )
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Code UE</label>
                  <input
                    type="text"
                    placeholder="Ex: INF232"
                    className={input}
                    value={ue}
                    onChange={e => setUe(e.target.value.toUpperCase())}
                  />
                </div>
                <div>
                  <label className={label}>Temps par question (secondes)</label>
                  <input
                    type="number"
                    min="0"
                    placeholder="Ex: 60 (0 = sans limite)"
                    className={input}
                    value={timePerQuestion}
                    onChange={e => setTimePerQuestion(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={label}>Date & Heure de début (Lancement)</label>
                  <input
                    type="datetime-local"
                    className={input}
                    value={launchTime}
                    onChange={e => setLaunchTime(e.target.value)}
                  />
                </div>
                <div>
                  <label className={label}>Date & Heure de fin (Clôture)</label>
                  <input
                    type="datetime-local"
                    className={input}
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Import CSV Amélioré (Point 6) */}
              <div className="bg-slate-50 border-2 border-dashed border-gray-200 rounded-2xl p-5 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-gray-700 uppercase tracking-wider">
                    Importer un fichier de questions (.csv)
                  </label>
                  <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-bold">
                    Multi-délimiteurs • Excel UTF-8
                  </span>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Supporte automatiquement virgule (,), point-virgule (;), tabulation, BOM Excel, colonnes A/B/C/D ou Option A-D, et réponses en lettres ou texte complet.
                </p>
                <input
                  type="file"
                  accept=".csv,text/csv,application/vnd.ms-excel"
                  onChange={handleFileSelected}
                  className="w-full text-xs text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-blue-600 file:text-white hover:file:bg-blue-700 transition cursor-pointer"
                />
              </div>

              <button
                onClick={handleSaveQuiz}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl text-sm transition shadow-lg shadow-blue-500/20"
              >
                💾 Enregistrer & Programmer l'évaluation
              </button>
            </div>

            {/* Inspecteur de Questions */}
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-4">
              <h3 className="text-base font-black text-gray-800 border-b pb-2">
                Questions d'un Quiz
              </h3>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Code UE (ex: INF232)"
                  className="flex-1 p-2 border-2 border-gray-100 rounded-xl text-xs outline-none focus:border-blue-500"
                  value={inspectQuizId}
                  onChange={e => setInspectQuizId(e.target.value.toUpperCase())}
                />
                <button
                  onClick={() => loadInspectQuestions(inspectQuizId)}
                  className="bg-slate-800 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-slate-900 transition"
                >
                  Charger
                </button>
              </div>

              {loadingQuestions ? (
                <p className="text-xs text-gray-400 text-center py-6 animate-pulse">Chargement...</p>
              ) : inspectQuestions.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-6">
                  {inspectQuizId ? "Aucune question trouvée pour cette UE." : "Saisissez un code UE pour voir ses questions."}
                </p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                  <p className="text-[11px] font-bold text-blue-700">
                    Total : {inspectQuestions.length} questions
                  </p>
                  {inspectQuestions.map((q, idx) => (
                    <div key={q.id} className="p-3 bg-gray-50 border rounded-xl text-xs relative group">
                      <div className="flex justify-between items-start gap-2">
                        <span className="font-bold text-gray-800">Q{idx + 1}. {q.Question}</span>
                        <button
                          onClick={() => deleteSingleQuestion(q.id)}
                          className="text-red-500 hover:text-red-700 text-[10px] font-bold"
                          title="Supprimer la question"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                        <p className={q.ReponseCorrecte === q.OptA ? 'text-emerald-600 font-bold' : ''}>A: {q.OptA}</p>
                        <p className={q.ReponseCorrecte === q.OptB ? 'text-emerald-600 font-bold' : ''}>B: {q.OptB}</p>
                        {q.OptC && <p className={q.ReponseCorrecte === q.OptC ? 'text-emerald-600 font-bold' : ''}>C: {q.OptC}</p>}
                        {q.OptD && <p className={q.ReponseCorrecte === q.OptD ? 'text-emerald-600 font-bold' : ''}>D: {q.OptD}</p>}
                      </div>
                      <p className="mt-1 text-[10px] text-emerald-700 font-bold">
                        Bonne réponse : {q.ReponseCorrecte}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ─── MODAL PRÉVISUALISATION CSV AVANT IMPORT (Point 6) ─── */}
        {showCsvPreview && parsedCsvData && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-gray-200 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b pb-3 mb-4">
                <div>
                  <h3 className="text-lg font-black text-gray-800">
                    Aperçu & Validation du fichier CSV
                  </h3>
                  <p className="text-xs text-gray-500">
                    Fichier : {csvFile?.name} • <strong>{parsedCsvData.questions.length}</strong> questions détectées
                  </p>
                </div>
                <button
                  onClick={() => setShowCsvPreview(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center font-bold text-gray-600"
                >
                  ✕
                </button>
              </div>

              {/* Avertissements / Alertes */}
              {parsedCsvData.warnings?.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-xs text-amber-800 max-h-24 overflow-y-auto">
                  <p className="font-bold mb-1">Avertissements ({parsedCsvData.warnings.length}) :</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    {parsedCsvData.warnings.slice(0, 5).map((w, i) => <li key={i}>{w}</li>)}
                    {parsedCsvData.warnings.length > 5 && <li>... et {parsedCsvData.warnings.length - 5} autres.</li>}
                  </ul>
                </div>
              )}

              {/* Prévisualisation des 5 premières questions */}
              <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
                <p className="text-xs font-bold text-gray-700">
                  Échantillon des questions analysées (5 premières) :
                </p>
                {parsedCsvData.questions.slice(0, 5).map((q, idx) => (
                  <div key={idx} className="bg-slate-50 border border-gray-200 rounded-2xl p-4 text-xs space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-black text-gray-800 text-sm">
                        Q{idx + 1}. {q.Question}
                      </p>
                      <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0">
                        Valide
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className={`p-2 rounded-xl border ${q.ReponseCorrecte === q.OptA ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold' : 'bg-white border-gray-100'}`}>
                        <strong>A:</strong> {q.OptA}
                      </div>
                      <div className={`p-2 rounded-xl border ${q.ReponseCorrecte === q.OptB ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold' : 'bg-white border-gray-100'}`}>
                        <strong>B:</strong> {q.OptB}
                      </div>
                      {q.OptC && (
                        <div className={`p-2 rounded-xl border ${q.ReponseCorrecte === q.OptC ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold' : 'bg-white border-gray-100'}`}>
                          <strong>C:</strong> {q.OptC}
                        </div>
                      )}
                      {q.OptD && (
                        <div className={`p-2 rounded-xl border ${q.ReponseCorrecte === q.OptD ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold' : 'bg-white border-gray-100'}`}>
                          <strong>D:</strong> {q.OptD}
                        </div>
                      )}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-bold flex items-center gap-1">
                      <span>✓ Bonne réponse détectée :</span>
                      <span className="bg-emerald-100 px-2 py-0.5 rounded-md">{q.ReponseCorrecte}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t pt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">
                  Assignation à l'UE : <strong className="text-blue-600">{ue || '(Veuillez saisir le code UE)'}</strong>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCsvPreview(false)}
                    className="px-4 py-2.5 border-2 border-gray-200 text-gray-600 font-bold rounded-xl text-xs hover:bg-gray-50 transition"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleConfirmImport}
                    disabled={importing || !ue.trim()}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs transition shadow-md disabled:opacity-50"
                  >
                    {importing ? "Importation en cours..." : `Confirmer & Importer (${parsedCsvData.questions.length} questions)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── ONGLET 1 : GÉRER UEs ─── */}
        {activeTab === 1 && (
          <div className="space-y-6">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-4">
              <h2 className="text-base font-black text-gray-800 border-b pb-2">Unités d'Enseignement</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
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
              <button onClick={addUe} className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition shadow">
                + Ajouter l'UE
              </button>

              <div className="overflow-x-auto pt-2">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-500 uppercase">
                      <th className="py-2.5 px-3 text-left">Code</th>
                      <th className="py-2.5 px-3 text-left">Intitulé</th>
                      <th className="py-2.5 px-3 text-left">Filière</th>
                      <th className="py-2.5 px-3 text-left">Niveau</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {allUes.map(u => (
                      <tr key={u.id} className="border-b hover:bg-gray-50">
                        <td className="py-2.5 px-3 font-bold text-gray-800">{u.id}</td>
                        <td className="py-2.5 px-3 text-gray-600">{u.label}</td>
                        <td className="py-2.5 px-3 text-gray-600">{u.filiere}</td>
                        <td className="py-2.5 px-3 text-gray-600">{u.niveau}</td>
                        <td className="py-2.5 px-3 text-right">
                          <button onClick={() => deleteUe(u.id)} className="text-red-500 hover:text-red-700 font-bold text-xs">Supprimer</button>
                        </td>
                      </tr>
                    ))}
                    {allUes.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-gray-400 italic">Aucune UE configurée</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Filières et Niveaux */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-3xl p-5 border border-gray-200">
                <h3 className="text-sm font-bold text-gray-800 mb-3">Filières</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {filieres.map(f => <span key={f} className="bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full">{f}</span>)}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Nouvelle filière" className={input} value={newFiliere} onChange={e => setNewFiliere(e.target.value)} />
                  <button onClick={addFiliere} className="bg-blue-600 text-white text-xs font-bold px-3 py-2 rounded-xl">Ajouter</button>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-gray-200">
                <h3 className="text-sm font-bold text-gray-800 mb-3">Niveaux</h3>
                <div className="flex flex-wrap gap-2 mb-3">
                  {niveaux.map(n => <span key={n} className="bg-purple-50 text-purple-700 text-xs font-bold px-3 py-1 rounded-full">{n}</span>)}
                </div>
                <div className="flex gap-2">
                  <input type="text" placeholder="Nouveau niveau" className={input} value={newNiveau} onChange={e => setNewNiveau(e.target.value)} />
                  <button onClick={addNiveau} className="bg-purple-600 text-white text-xs font-bold px-3 py-2 rounded-xl">Ajouter</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── ONGLET 2 : ÉTUDIANTS INSCRITS (Point 1 & 6) ─── */}
        {activeTab === 2 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-3">
              <div>
                <h2 className="text-lg font-black text-gray-800">Comptes Étudiants Inscrits</h2>
                <p className="text-xs text-gray-500">
                  Système d'authentification direct Firestore • {students.length} étudiant(s) enregistré(s)
                </p>
              </div>
              <button onClick={fetchStudents} className="text-xs font-bold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition">
                ↻ Actualiser la liste
              </button>
            </div>

            {/* Filtres & Recherche */}
            <div className="flex gap-3 flex-wrap">
              <input
                type="text"
                placeholder="Rechercher par nom ou email..."
                className="flex-1 min-w-48 p-2.5 border-2 border-gray-100 rounded-xl text-xs outline-none focus:border-blue-500"
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
              />
              <select
                className="p-2.5 border-2 border-gray-100 rounded-xl text-xs outline-none focus:border-blue-500"
                value={studentFilterFiliere}
                onChange={e => setStudentFilterFiliere(e.target.value)}
              >
                <option value="">Toutes filières</option>
                {filieres.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>

            {loadingStudents ? (
              <p className="text-xs text-gray-400 text-center py-10 animate-pulse">Chargement des étudiants...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-500 uppercase">
                      <th className="py-2.5 px-3 text-left">Nom / Pseudo</th>
                      <th className="py-2.5 px-3 text-left">Email</th>
                      <th className="py-2.5 px-3 text-left">Filière</th>
                      <th className="py-2.5 px-3 text-left">Niveau</th>
                      <th className="py-2.5 px-3 text-left">Année</th>
                      <th className="py-2.5 px-3 text-left">Inscrit le</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {students
                      .filter(s => {
                        const term = studentSearch.toLowerCase();
                        const matchText = (s.name || '').toLowerCase().includes(term) || (s.email || '').toLowerCase().includes(term);
                        const matchFiliere = !studentFilterFiliere || s.filiere === studentFilterFiliere;
                        return matchText && matchFiliere;
                      })
                      .map(s => (
                        <tr key={s.id} className="border-b hover:bg-gray-50">
                          <td className="py-2.5 px-3 font-bold text-gray-800">{s.name}</td>
                          <td className="py-2.5 px-3 text-gray-600 font-mono">{s.email}</td>
                          <td className="py-2.5 px-3">
                            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">
                              {s.filiere}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-gray-700 font-bold">{s.niveau}</td>
                          <td className="py-2.5 px-3 text-gray-500">{s.anneeAcademique || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-400">{formatDate(s.createdAt)}</td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={() => deleteStudent(s.id, s.name)}
                              className="text-red-500 hover:text-red-700 font-bold text-xs"
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    {students.length === 0 && (
                      <tr><td colSpan={7} className="py-6 text-center text-gray-400 italic">Aucun étudiant inscrit</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── ONGLET 3 : CONFIGURATION SMTP GOOGLE (Point 1 & 6) ─── */}
        {activeTab === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-4">
              <div>
                <h2 className="text-lg font-black text-gray-800">Service SMTP Google (Gmail)</h2>
                <p className="text-xs text-gray-500">
                  Envoi gratuit des codes de réinitialisation de mot de passe via l'adresse Gmail et le code à 16 caractères
                </p>
              </div>

              {smtpSavedMsg && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs p-3 rounded-xl">
                  ✓ {smtpSavedMsg}
                </div>
              )}

              <form onSubmit={handleSaveSmtp} className="space-y-4">
                <div>
                  <label className={label}>Adresse Gmail Expéditrice</label>
                  <input
                    type="email"
                    required
                    placeholder="mon.adresse@gmail.com"
                    className={input}
                    value={smtpEmail}
                    onChange={e => setSmtpEmail(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Le compte Gmail servant à expédier les emails</p>
                </div>

                <div>
                  <label className={label}>Mot de passe d'application Google (16 caractères)</label>
                  <input
                    type="text"
                    required
                    placeholder="abcd efgh ijkl mnop"
                    className={input}
                    value={smtpPassword}
                    onChange={e => setSmtpPassword(e.target.value)}
                  />
                  <p className="text-[10px] text-gray-400 mt-0.5">Code à 16 lettres/chiffres généré dans Sécurité Google</p>
                </div>

                <button
                  type="submit"
                  disabled={smtpSaving}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-black py-3 rounded-xl text-xs transition shadow"
                >
                  {smtpSaving ? "Enregistrement..." : "💾 Enregistrer la configuration"}
                </button>
              </form>

              {/* Test d'envoi SMTP */}
              <div className="border-t pt-4 space-y-3">
                <h3 className="text-xs font-black text-gray-700 uppercase tracking-wider">Tester l'envoi d'un email</h3>
                <div className="flex gap-2">
                  <input
                    type="email"
                    placeholder="Destinataire du test (ex: votre email)"
                    className={input}
                    value={smtpTestRecipient}
                    onChange={e => setSmtpTestRecipient(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={handleTestSmtpConnection}
                    disabled={smtpTesting || !smtpEmail || !smtpPassword}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition whitespace-nowrap disabled:opacity-50"
                  >
                    {smtpTesting ? "Test en cours..." : "✉ Envoyer Test"}
                  </button>
                </div>

                {smtpTestResult && (
                  <div className={`p-3 rounded-xl text-xs ${
                    smtpTestResult.success
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border border-red-200 text-red-800'
                  }`}>
                    {smtpTestResult.success ? (
                      <p>✓ {smtpTestResult.message || "Connexion SMTP établie avec succès !"}</p>
                    ) : (
                      <p>⚠️ Échec du test : {smtpTestResult.error}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Guide explicatif Google 16 caractères */}
            <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔑</span>
                <h3 className="text-base font-black">Comment obtenir le code à 16 chiffres ?</h3>
              </div>
              <p className="text-xs text-blue-200 leading-relaxed">
                Google n'utilise plus les mots de passe simples pour SMTP, mais un code sécurisé à 16 caractères totalement gratuit :
              </p>
              <ol className="text-xs text-blue-100/90 space-y-2.5 list-decimal pl-4 leading-relaxed">
                <li>
                  Connectez-vous à votre compte Google et activez la <strong>Validation en 2 étapes (2FA)</strong> dans <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-blue-300 underline">Sécurité</a>.
                </li>
                <li>
                  Rendez-vous sur la page des <strong>Mots de passe d'application</strong> : <br />
                  <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer" className="text-blue-300 underline font-mono text-[11px]">
                    https://myaccount.google.com/apppasswords
                  </a>
                </li>
                <li>
                  Donnez un nom à l'application (ex: <em>"Portail QCM UY1"</em>) et cliquez sur <strong>Créer</strong>.
                </li>
                <li>
                  Google affiche alors un code à <strong>16 lettres</strong> (ex: <code>abcd efgh ijkl mnop</code>).
                </li>
                <li>
                  Copiez ce code et collez-le dans le champ ci-contre.
                </li>
              </ol>
              <div className="bg-white/10 p-3 rounded-xl text-[11px] text-blue-200">
                💡 Aucune carte bancaire requise, c'est un service officiel et gratuit de Google Mail.
              </div>
            </div>
          </div>
        )}

        {/* ─── ONGLET 4 : HISTORIQUE DES EVALUATIONS & RÉSULTATS ─── */}
        {activeTab === 4 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-black text-gray-800 border-b pb-2 mb-4">Historique des Évaluations</h2>
            {history.length === 0 ? (
              <p className="text-gray-400 italic text-center py-8">Aucun quiz créé</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b text-gray-500 uppercase">
                      <th className="py-3 px-3 text-left">UE</th>
                      <th className="py-3 px-3 text-left">Filière / Niveau</th>
                      <th className="py-3 px-3 text-left">Minuterie</th>
                      <th className="py-3 px-3 text-left">Lancement</th>
                      <th className="py-3 px-3 text-left">Fin</th>
                      <th className="py-3 px-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(q => (
                      <tr key={q.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-3 font-black text-gray-800 text-sm">{q.id}</td>
                        <td className="py-3 px-3 text-gray-600">{q.filiere} — {q.niveau}</td>
                        <td className="py-3 px-3 text-gray-600">{q.timePerQuestion ? `${q.timePerQuestion}s / Q` : 'Illimité'}</td>
                        <td className="py-3 px-3 text-gray-600">{formatDate(q.launchTime)}</td>
                        <td className="py-3 px-3 text-gray-600">{formatDate(q.endTime)}</td>
                        <td className="py-3 px-3 flex gap-2">
                          <button onClick={() => exportCSV(q.id)} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-emerald-700 transition">
                            CSV
                          </button>
                          <button onClick={() => exportPDF(q.id)} className="bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-red-700 transition">
                            PDF (PV)
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ─── ONGLET 5 : EMPLOI DU TEMPS ─── */}
        {activeTab === 5 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-black text-gray-800 border-b pb-2 mb-4">Prochaines Évaluations Programmées</h2>
            {upcoming.length === 0 ? (
              <p className="text-gray-400 italic text-center py-8">Aucun QCM programmé à venir</p>
            ) : (
              <div className="space-y-3">
                {upcoming.map(q => (
                  <div key={q.id} className="flex items-center justify-between p-4 bg-blue-50/60 rounded-2xl border border-blue-100">
                    <div>
                      <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">
                        {q.filiere} — {q.niveau}
                      </span>
                      <h4 className="font-black text-gray-800 text-base mt-1">{q.ue || q.id}</h4>
                      <p className="text-xs text-gray-500">Semestre {q.semestre || 1}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-black text-blue-700">{formatDate(q.launchTime)}</p>
                      {q.endTime && <p className="text-[11px] text-gray-400">Fin : {formatDate(q.endTime)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── ONGLET 6 : MESSAGES & SUGGESTIONS DES ÉTUDIANTS (Point 5) ─── */}
        {activeTab === 6 && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 flex-wrap gap-3">
              <div>
                <h2 className="text-base font-black text-gray-800">Messages & Suggestions des Étudiants</h2>
                <p className="text-xs text-gray-500">Signalements d'erreurs, requêtes de rattrapage et suggestions</p>
              </div>
              <button onClick={fetchFeedbacks} className="text-xs font-bold bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-xl transition">
                ↻ Actualiser
              </button>
            </div>

            {/* Filtres */}
            <div className="flex gap-3 flex-wrap">
              <select className={input} value={fbCategory} onChange={e => setFbCategory(e.target.value)}>
                <option value="">Toutes catégories</option>
                <option>Suggestion d'amélioration</option>
                <option>Signalement d'une erreur dans un QCM</option>
                <option>Demande de rattrapage d'épreuve</option>
                <option>Problème technique / Affichage</option>
                <option>Autre demande</option>
              </select>
              <select className={input} value={fbFiliere} onChange={e => setFbFiliere(e.target.value)}>
                <option value="">Toutes filières</option>
                {filieres.map(f => <option key={f}>{f}</option>)}
              </select>
            </div>

            {loadingFb ? (
              <p className="text-xs text-gray-400 text-center py-10 animate-pulse">Chargement des messages...</p>
            ) : feedbacks.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-10">Aucun message pour ces critères</p>
            ) : (
              <div className="space-y-3">
                {feedbacks.map(fb => (
                  <div key={fb.id} className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-800 text-xs">{fb.name}</span>
                        {fb.email && <span className="text-[11px] text-gray-500 font-mono">({fb.email})</span>}
                        <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{fb.ue || 'Général'}</span>
                        <span className="bg-gray-200 text-gray-700 text-[10px] px-2 py-0.5 rounded-full">{fb.category || 'Feedback'}</span>
                        {fb.filiere && <span className="text-[10px] text-gray-400">{fb.filiere} — {fb.niveau}</span>}
                      </div>
                      <span className="text-[10px] text-gray-400">{formatDate(fb.date)}</span>
                    </div>

                    <p className="font-bold text-xs text-gray-900">{fb.subject}</p>
                    <p className="text-xs text-gray-700 leading-relaxed bg-white p-3 rounded-xl border border-gray-100">
                      {fb.message}
                    </p>

                    <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-500">Statut :</span>
                        <select
                          value={fb.status || 'en_attente'}
                          onChange={e => updateMessageStatus(fb.id, e.target.value)}
                          className="text-[11px] font-bold p-1 border rounded-lg bg-white"
                        >
                          <option value="en_attente">En attente</option>
                          <option value="en_cours">En cours</option>
                          <option value="traite">Traité</option>
                        </select>
                      </div>

                      <div className="flex gap-2">
                        {fb.email && (
                          <a
                            href={`mailto:${fb.email}?subject=Réponse QCM UY1 : ${encodeURIComponent(fb.subject || '')}`}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-3 py-1 rounded-lg transition"
                          >
                            ✉ Répondre
                          </a>
                        )}
                        <button
                          onClick={() => deleteFeedback(fb.id)}
                          className="text-red-500 hover:text-red-700 text-[11px] font-bold px-2 py-1"
                        >
                          Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
