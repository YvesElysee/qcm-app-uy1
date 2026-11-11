import { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';
import { api } from './services/api';
import { parseQuestionsCsv, downloadCsvTemplate } from './utils/csvParser';
import { getSmtpSettings, saveSmtpSettings, testSmtpConnection } from './services/emailService';
import usePageTitle from './hooks/usePageTitle';
import Icon from './components/ui/icons.jsx';

const SECTIONS = [
  { id: 'overview', label: "Vue d'ensemble", icon: 'chart', desc: 'Statistiques clés et prochaines évaluations' },
  { id: 'quizzes', label: 'Évaluations', icon: 'list', desc: 'Programmer, importer et gérer les QCM' },
  { id: 'ues', label: "Unités d'enseignement", icon: 'book', desc: 'Filières, niveaux et catalogue des UE' },
  { id: 'students', label: 'Étudiants', icon: 'users', desc: 'Comptes inscrits et exports' },
  { id: 'results', label: 'Résultats', icon: 'trophy', desc: 'Notes par évaluation et procès-verbaux' },
  { id: 'messages', label: 'Messages', icon: 'chat', desc: 'Suggestions et signalements des étudiants' },
  { id: 'smtp', label: 'Paramètres SMTP', icon: 'settings', desc: 'Service email de récupération de mot de passe' }
];

const FILIERES_DEFAULT = ['Informatique', 'Mathématiques', 'Physique', 'Chimie', 'Biologie'];
const NIVEAUX_DEFAULT = ['L1', 'L2', 'L3', 'M1', 'M2'];

const FEEDBACK_CATEGORIES = [
  "Suggestion d'amélioration",
  "Signalement d'une erreur dans un QCM",
  "Demande de rattrapage d'épreuve",
  "Problème technique / Affichage",
  'Autre demande'
];

// Classes partagées (thème sombre unifié)
const card = 'bg-slate-900 border border-slate-800 rounded-2xl';
const label = 'block text-[11px] font-bold text-slate-400 mb-1 uppercase tracking-wider';
const input =
  'w-full p-2.5 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 placeholder:text-slate-600 focus:border-blue-600 outline-none transition text-xs';
const selectCls =
  'w-full p-2.5 border border-slate-800 rounded-xl bg-slate-950 text-slate-100 focus:border-blue-600 outline-none transition text-xs font-medium';
const btnSecondary =
  'inline-flex items-center gap-1.5 border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white bg-slate-950 hover:bg-slate-800 font-bold text-xs px-3 py-2 rounded-xl transition';
const btnPrimary =
  'inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs px-3 py-2 rounded-xl transition disabled:opacity-50';

const formatDate = (ts) => (ts ? new Date(ts).toLocaleString('fr-FR') : '—');

export default function AdminPanel() {
  usePageTitle('Administration');
  const [activeSection, setActiveSection] = useState('overview');

  // ── Évaluations : programmation & import CSV ──────────────────────────
  const [filiere, setFiliere] = useState('Informatique');
  const [niveau, setNiveau] = useState('L1');
  const [semestre, setSemestre] = useState('1');
  const [ue, setUe] = useState('');
  const [launchTime, setLaunchTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timePerQuestion, setTimePerQuestion] = useState('60');

  const [csvFile, setCsvFile] = useState(null);
  const [parsedCsvData, setParsedCsvData] = useState(null); // { questions, warnings, errors, detectedColumns }
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  // Inspection des questions d'une évaluation
  const [inspectQuizId, setInspectQuizId] = useState('');
  const [inspectQuestions, setInspectQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // ── Unités d'enseignement ──────────────────────────────────────────────
  const [filieres, setFilieres] = useState(FILIERES_DEFAULT);
  const [niveaux, setNiveaux] = useState(NIVEAUX_DEFAULT);
  const [newFiliere, setNewFiliere] = useState('');
  const [newNiveau, setNewNiveau] = useState('');
  const [newUeCode, setNewUeCode] = useState('');
  const [newUeLabel, setNewUeLabel] = useState('');
  const [newUeFiliere, setNewUeFiliere] = useState('Informatique');
  const [newUeNiveau, setNewUeNiveau] = useState('L1');
  const [allUes, setAllUes] = useState([]);

  // ── Étudiants ──────────────────────────────────────────────────────────
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilterFiliere, setStudentFilterFiliere] = useState('');

  // ── SMTP ───────────────────────────────────────────────────────────────
  const [smtpEmail, setSmtpEmail] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTestRecipient, setSmtpTestRecipient] = useState('');
  const [smtpTesting, setSmtpTesting] = useState(false);
  const [smtpTestResult, setSmtpTestResult] = useState(null);
  const [smtpSavedMsg, setSmtpSavedMsg] = useState('');

  // ── Historique / planning / résultats ──────────────────────────────────
  const [history, setHistory] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [resultsQuizId, setResultsQuizId] = useState('');
  const [resultsList, setResultsList] = useState([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // ── Messages & suggestions ─────────────────────────────────────────────
  const [feedbacks, setFeedbacks] = useState([]);
  const [fbCategory, setFbCategory] = useState('');
  const [fbFiliere, setFbFiliere] = useState('');
  const [loadingFb, setLoadingFb] = useState(true);

  // ─── Data fetchers ────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    const data = await api('/quizzes?sort=desc', { auth: 'admin' });
    setHistory(data.quizzes);
  }, []);

  const fetchUpcoming = useCallback(async () => {
    const data = await api('/quizzes?sort=asc', { auth: 'admin' });
    const now = Date.now();
    setUpcoming(data.quizzes.filter(q => q.launchTime > now));
  }, []);

  const fetchUes = useCallback(async () => {
    const data = await api('/ues', { auth: 'admin' });
    setAllUes(data.ues);
  }, []);

  // Remarque : les fetchers ne déclenchent aucun setState avant leur premier
  // `await`, afin de rester conformes à la règle react-hooks/set-state-in-effect
  // (l'indicateur de chargement démarre à true et est coupé dans le finally).
  const fetchStudents = useCallback(async () => {
    try {
      const data = await api('/admin/students', { auth: 'admin' });
      setStudents(data.students);
    } catch (err) {
      console.warn('Erreur chargement étudiants :', err);
    } finally {
      setLoadingStudents(false);
    }
  }, []);

  const fetchSmtpConfig = useCallback(async () => {
    const conf = await getSmtpSettings();
    if (conf) {
      if (conf.email) setSmtpEmail(conf.email);
      if (conf.appPassword) setSmtpPassword(conf.appPassword);
    }
  }, []);

  const fetchFeedbacks = useCallback(async () => {
    try {
      const data = await api('/feedback', { auth: 'admin' });
      let list = data.feedback;
      if (fbCategory) list = list.filter(f => f.category === fbCategory);
      if (fbFiliere) list = list.filter(f => f.filiere === fbFiliere);
      list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setFeedbacks(list);
    } catch (err) {
      console.warn('Erreur chargement messages :', err);
    } finally {
      setLoadingFb(false);
    }
  }, [fbCategory, fbFiliere]);

  useEffect(() => {
    // Chargement initial : la fonction locale asynchrone évite tout setState
    // synchrone dans le corps de l'effet (règle react-hooks/set-state-in-effect)
    const load = async () => {
      await Promise.all([
        fetchHistory(),
        fetchUpcoming(),
        fetchUes(),
        fetchStudents(),
        fetchSmtpConfig()
      ]);
    };
    load();
  }, [fetchHistory, fetchUpcoming, fetchUes, fetchStudents, fetchSmtpConfig]);

  // Les filtres messages relancent le chargement
  useEffect(() => {
    const load = async () => {
      await fetchFeedbacks();
    };
    load();
  }, [fetchFeedbacks]);

  // ─── Évaluations : import CSV robuste ─────────────────────────────────
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

  // Inspecter les questions d'une UE
  const loadInspectQuestions = useCallback(async (quizId) => {
    setInspectQuizId(quizId);
    setLoadingQuestions(true);
    try {
      const data = await api(`/quizzes/${encodeURIComponent(quizId)}/questions`);
      setInspectQuestions(data.questions);
    } catch (err) {
      console.warn('Erreur chargement questions :', err);
    } finally {
      setLoadingQuestions(false);
    }
  }, []);

  const handleConfirmImport = useCallback(async () => {
    const targetUe = ue.trim().toUpperCase();
    if (!targetUe) {
      alert("Veuillez d'abord saisir le code UE (ex: INF232).");
      return;
    }
    if (!parsedCsvData?.questions?.length) {
      alert('Aucune question valide à importer.');
      return;
    }

    setImporting(true);
    try {
      // Import atomique côté serveur : remplace les anciennes questions
      // et fusionne les métadonnées du quiz
      const res = await api(`/quizzes/${encodeURIComponent(targetUe)}/questions`, {
        method: 'POST',
        auth: 'admin',
        body: {
          questions: parsedCsvData.questions,
          filiere,
          niveau,
          semestre,
          timePerQuestion: parseInt(timePerQuestion) || 60
        }
      });
      const count = res.count;

      alert(`Succès ! ${count} questions importées pour l'UE ${targetUe}.`);
      setShowCsvPreview(false);
      setParsedCsvData(null);
      setCsvFile(null);
      fetchHistory();
      fetchUpcoming();
      if (inspectQuizId === targetUe) loadInspectQuestions(targetUe);
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setImporting(false);
    }
  }, [
    ue,
    parsedCsvData,
    filiere,
    niveau,
    semestre,
    timePerQuestion,
    fetchHistory,
    fetchUpcoming,
    inspectQuizId,
    loadInspectQuestions
  ]);

  const handleSaveQuiz = useCallback(async () => {
    const targetUe = ue.trim().toUpperCase();
    if (!targetUe) {
      alert('Saisissez le code UE.');
      return;
    }
    const data = {
      filiere,
      niveau,
      semestre,
      ue: targetUe,
      timePerQuestion: parseInt(timePerQuestion) || 60
    };
    if (launchTime) data.launchTime = new Date(launchTime).getTime();
    if (endTime) data.endTime = new Date(endTime).getTime();

    await api(`/quizzes/${encodeURIComponent(targetUe)}`, { method: 'POST', auth: 'admin', body: data });
    alert(`Quiz ${targetUe} programmé avec succès !`);
    fetchHistory();
    fetchUpcoming();
  }, [ue, filiere, niveau, semestre, timePerQuestion, launchTime, endTime, fetchHistory, fetchUpcoming]);

  const deleteSingleQuestion = useCallback(
    async (qId) => {
      if (!confirm('Supprimer cette question ?')) return;
      await api(`/quizzes/${encodeURIComponent(inspectQuizId)}/questions/${qId}`, {
        method: 'DELETE',
        auth: 'admin'
      });
      loadInspectQuestions(inspectQuizId);
    },
    [inspectQuizId, loadInspectQuestions]
  );

  /**
   * Suppression d'une évaluation complète.
   * Les questions et sessions actives sont supprimées, les résultats
   * déjà enregistrés sont conservés (historique des notes).
   */
  const deleteQuiz = useCallback(
    async (quizId) => {
      if (!quizId) return;
      if (
        !confirm(
          `Supprimer définitivement l'évaluation "${quizId}" ?\n\n` +
            'Les questions et les sessions actives seront supprimées.\n' +
            'Les résultats déjà enregistrés (notes des étudiants) seront conservés.'
        )
      ) {
        return;
      }
      await api(`/quizzes/${encodeURIComponent(quizId)}`, { method: 'DELETE', auth: 'admin' });
      if (inspectQuizId === quizId) {
        setInspectQuizId('');
        setInspectQuestions([]);
      }
      if (resultsQuizId === quizId) {
        setResultsQuizId('');
        setResultsList([]);
      }
      fetchHistory();
      fetchUpcoming();
    },
    [inspectQuizId, resultsQuizId, fetchHistory, fetchUpcoming]
  );

  // ─── Résultats par évaluation ─────────────────────────────────────────
  const loadResults = useCallback(async (quizId) => {
    if (!quizId) {
      setResultsList([]);
      return;
    }
    setLoadingResults(true);
    try {
      const data = await api(`/admin/results?ue=${encodeURIComponent(quizId)}`, { auth: 'admin' });
      setResultsList(data.results);
    } catch (err) {
      console.warn('Erreur chargement résultats :', err);
      setResultsList([]);
    } finally {
      setLoadingResults(false);
    }
  }, []);

  const openResults = (quizId) => {
    setActiveSection('results');
    setResultsQuizId(quizId);
    loadResults(quizId);
  };

  // ─── UE & filières ────────────────────────────────────────────────────
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

  const addUe = useCallback(async () => {
    const code = newUeCode.trim().toUpperCase();
    if (!code) {
      alert('Entrez un code UE.');
      return;
    }
    await api('/ues', {
      method: 'POST',
      auth: 'admin',
      body: {
        code,
        label: newUeLabel.trim() || code,
        filiere: newUeFiliere,
        niveau: newUeNiveau
      }
    });
    alert(`UE "${code}" ajoutée avec succès !`);
    setNewUeCode('');
    setNewUeLabel('');
    fetchUes();
  }, [newUeCode, newUeLabel, newUeFiliere, newUeNiveau, fetchUes]);

  const deleteUe = useCallback(
    async (id) => {
      if (!confirm(`Supprimer l'UE "${id}" ?`)) return;
      await api(`/ues/${encodeURIComponent(id)}`, { method: 'DELETE', auth: 'admin' });
      fetchUes();
    },
    [fetchUes]
  );

  // ─── Étudiants ────────────────────────────────────────────────────────
  const deleteStudent = useCallback(
    async (studentId, studentName) => {
      if (!confirm(`Supprimer définitivement l'étudiant ${studentName} ?`)) return;
      await api(`/admin/students/${encodeURIComponent(studentId)}`, { method: 'DELETE', auth: 'admin' });
      fetchStudents();
    },
    [fetchStudents]
  );

  const exportStudentsCsv = () => {
    if (!students.length) {
      alert('Aucun étudiant à exporter.');
      return;
    }
    const rows = students.map(s => ({
      Nom: s.name,
      Email: s.email,
      Filiere: s.filiere,
      Niveau: s.niveau,
      'Annee Academique': s.anneeAcademique || '—',
      Inscrit_le: formatDate(s.createdAt)
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Etudiants_UY1.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ─── SMTP ────────────────────────────────────────────────────────────
  const handleSaveSmtp = async (e) => {
    e.preventDefault();
    setSmtpSaving(true);
    setSmtpSavedMsg('');
    try {
      await saveSmtpSettings(smtpEmail, smtpPassword);
      setSmtpSavedMsg('Configuration SMTP enregistrée sur le serveur !');
    } catch (err) {
      alert('Erreur de sauvegarde : ' + err.message);
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

  // ─── Messages ────────────────────────────────────────────────────────
  const updateMessageStatus = useCallback(
    async (id, newStatus) => {
      await api(`/feedback/${id}`, { method: 'PATCH', auth: 'admin', body: { status: newStatus } });
      fetchFeedbacks();
    },
    [fetchFeedbacks]
  );

  const deleteFeedback = useCallback(
    async (id) => {
      if (!confirm('Supprimer ce message ?')) return;
      await api(`/feedback/${id}`, { method: 'DELETE', auth: 'admin' });
      fetchFeedbacks();
    },
    [fetchFeedbacks]
  );

  // ─── Exports résultats ────────────────────────────────────────────────
  const exportCSV = async (quizId) => {
    const data = await api(`/admin/results?ue=${encodeURIComponent(quizId)}`, { auth: 'admin' });
    const rows = data.results.map(r => ({
      Nom: r.name,
      Email: r.email || '—',
      Filiere: r.filiere || '—',
      Niveau: r.niveau || '—',
      Score: r.score,
      Total: r.total,
      Note_Sur_20: r.total ? ((r.score / r.total) * 20).toFixed(2) : 0,
      Rattrapage: r.isMakeup ? 'OUI' : 'NON',
      Date: new Date(r.date).toLocaleString('fr-FR')
    }));
    if (!rows.length) {
      alert('Aucun résultat trouvé pour ce quiz.');
      return;
    }
    const csv = Papa.unparse(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Resultats_${quizId}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPDF = async (quizId) => {
    const data = await api(`/admin/results?ue=${encodeURIComponent(quizId)}`, { auth: 'admin' });
    const rows = data.results.map(r => [
      r.name,
      r.email || '—',
      `${r.score}/${r.total}`,
      r.total ? `${((r.score / r.total) * 20).toFixed(2)}/20` : '—',
      r.isMakeup ? 'Rattrapage' : 'Régulier',
      new Date(r.date).toLocaleString('fr-FR')
    ]);
    if (!rows.length) {
      alert('Aucun résultat.');
      return;
    }
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);
    docPdf.text(`Procès-Verbal Officiel des Résultats — ${quizId}`, 14, 14);
    docPdf.setFontSize(9);
    docPdf.text(`Généré le ${new Date().toLocaleString('fr-FR')} • UY1`, 14, 21);
    docPdf.autoTable({
      startY: 28,
      head: [['Étudiant', 'Email', 'Score', 'Note /20', 'Type', 'Date']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] }
    });
    docPdf.save(`PV_${quizId}.pdf`);
  };

  // ─── Déconnexion (révoque le jeton côté serveur) ───────────────────────
  const handleLogout = async () => {
    try {
      await api('/admin/logout', { method: 'POST', auth: 'admin' });
    } catch {
      // Jeton peut-être déjà expiré : on nettoie quand même la session locale
    }
    sessionStorage.removeItem('adminAuth');
    sessionStorage.removeItem('adminToken');
    location.href = '/admin-login';
  };

  // ─── Données dérivées ─────────────────────────────────────────────────
  const upcomingIds = useMemo(() => new Set(upcoming.map(q => q.id)), [upcoming]);

  const stats = useMemo(
    () => ({
      quizzes: history.length,
      upcoming: upcoming.length,
      students: students.length,
      ues: allUes.length,
      pendingMessages: feedbacks.filter(f => f.status !== 'traite').length
    }),
    [history, upcoming, students, allUes, feedbacks]
  );

  const resultsStats = useMemo(() => {
    if (!resultsList.length) return { count: 0, average: '—', best: '—' };
    const notes = resultsList.map(r => (r.total ? (r.score / r.total) * 20 : 0));
    const sum = notes.reduce((a, b) => a + b, 0);
    return {
      count: resultsList.length,
      average: (sum / notes.length).toFixed(2),
      best: Math.max(...notes).toFixed(2)
    };
  }, [resultsList]);

  const currentSection = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  const filteredStudents = students.filter(s => {
    const term = studentSearch.toLowerCase();
    const matchText =
      (s.name || '').toLowerCase().includes(term) || (s.email || '').toLowerCase().includes(term);
    const matchFiliere = !studentFilterFiliere || s.filiere === studentFilterFiliere;
    return matchText && matchFiliere;
  });

  const filteredHistory = [...history].sort((a, b) => (b.launchTime || 0) - (a.launchTime || 0));

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      {/* ── Barre latérale (desktop) ── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-slate-900 border-r border-slate-800 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-sm">
            UY1
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white leading-tight">Administration QCM</h1>
            <p className="text-[11px] text-slate-500">UY1 • Téléévaluation</p>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition ${
                activeSection === sec.id
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <Icon name={sec.icon} size={16} />
              {sec.label}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-slate-800 space-y-1">
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <Icon name="external" size={16} />
            Portail étudiant
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold text-red-400 hover:bg-red-950/50 hover:text-red-300 transition"
          >
            <Icon name="logout" size={16} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* ── Zone principale ── */}
      <div className="flex-1 min-w-0">
        {/* En-tête mobile */}
        <header className="lg:hidden bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-xs">
              UY1
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-tight">Administration QCM</h1>
              <p className="text-[10px] text-slate-500">UY1 • Téléévaluation</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              aria-label="Ouvrir le portail étudiant"
              className="w-9 h-9 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition"
            >
              <Icon name="external" size={16} />
            </a>
            <button
              onClick={handleLogout}
              aria-label="Se déconnecter"
              className="w-9 h-9 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition"
            >
              <Icon name="logout" size={16} />
            </button>
          </div>
        </header>

        {/* Onglets mobiles */}
        <nav className="lg:hidden sticky top-0 z-30 bg-slate-900 border-b border-slate-800 overflow-x-auto flex gap-1 px-3 py-2">
          {SECTIONS.map(sec => (
            <button
              key={sec.id}
              onClick={() => setActiveSection(sec.id)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition ${
                activeSection === sec.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800'
              }`}
            >
              <Icon name={sec.icon} size={14} />
              {sec.label}
            </button>
          ))}
        </nav>

        {/* En-tête desktop */}
        <header className="hidden lg:flex items-center justify-between px-8 py-6 border-b border-slate-800">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2.5">
              <Icon name={currentSection.icon} size={20} className="text-blue-400" />
              {currentSection.label}
            </h2>
            <p className="text-xs text-slate-500 mt-1">{currentSection.desc}</p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-400 hover:text-blue-300 transition"
            >
              <Icon name="external" size={14} />
              Ouvrir le portail étudiant
            </a>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 bg-red-950/40 border border-red-900/60 px-3 py-1.5 rounded-xl transition"
            >
              <Icon name="logout" size={14} />
              Déconnexion
            </button>
          </div>
        </header>

        <main className="p-4 lg:p-8 max-w-6xl">
          {/* ════════════ VUE D'ENSEMBLE ════════════ */}
          {activeSection === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    icon: 'list',
                    value: stats.quizzes,
                    label: 'Évaluations créées',
                    style: 'bg-blue-600/15 text-blue-400 border-blue-600/30'
                  },
                  {
                    icon: 'calendar',
                    value: stats.upcoming,
                    label: 'Évaluations à venir',
                    style: 'bg-emerald-600/15 text-emerald-400 border-emerald-600/30'
                  },
                  {
                    icon: 'users',
                    value: stats.students,
                    label: 'Étudiants inscrits',
                    style: 'bg-purple-600/15 text-purple-400 border-purple-600/30'
                  },
                  {
                    icon: 'chat',
                    value: stats.pendingMessages,
                    label: 'Messages en attente',
                    style: 'bg-amber-600/15 text-amber-400 border-amber-600/30'
                  }
                ].map(s => (
                  <div key={s.label} className={`${card} p-5`}>
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center mb-3 ${s.style}`}>
                      <Icon name={s.icon} size={18} />
                    </div>
                    <div className="text-3xl font-black text-white leading-none">{s.value}</div>
                    <div className="text-[11px] text-slate-500 mt-1.5 font-bold uppercase tracking-wider">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                {/* Prochaines évaluations */}
                <div className={`${card} p-6`}>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                    <Icon name="calendar" size={15} className="text-emerald-400" />
                    Prochaines évaluations ({upcoming.length})
                  </h3>
                  {upcoming.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      Aucune évaluation programmée à venir.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {upcoming.slice(0, 5).map(q => (
                        <div
                          key={q.id}
                          className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl"
                        >
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full">
                              {q.filiere} — {q.niveau}
                            </span>
                            <h4 className="font-black text-white text-sm mt-1 truncate">{q.ue || q.id}</h4>
                            <p className="text-[11px] text-slate-500">
                              Semestre {q.semestre || 1} • {q.questionCount || 0} questions
                            </p>
                          </div>
                          <div className="text-right shrink-0 ml-3">
                            <p className="text-[11px] font-bold text-emerald-400">{formatDate(q.launchTime)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dernières évaluations passées */}
                <div className={`${card} p-6`}>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                    <Icon name="clock" size={15} className="text-slate-400" />
                    Dernières évaluations
                  </h3>
                  {filteredHistory.filter(q => !upcomingIds.has(q.id)).length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      Aucune évaluation passée enregistrée.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {filteredHistory
                        .filter(q => !upcomingIds.has(q.id))
                        .slice(0, 5)
                        .map(q => (
                          <div
                            key={q.id}
                            className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl"
                          >
                            <div className="min-w-0">
                              <h4 className="font-black text-white text-sm truncate">{q.ue || q.id}</h4>
                              <p className="text-[11px] text-slate-500">
                                {q.filiere} • {q.niveau} — {formatDate(q.launchTime)}
                              </p>
                            </div>
                            <button
                              onClick={() => openResults(q.id)}
                              className={btnSecondary + ' ml-3 shrink-0'}
                            >
                              <Icon name="trophy" size={13} />
                              Résultats
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ════════════ ÉVALUATIONS ════════════ */}
          {activeSection === 'quizzes' && (
            <div className="space-y-6">
              {/* Inspection des questions */}
              {inspectQuizId && (
                <div className={`${card} p-6`}>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Icon name="eye" size={15} className="text-blue-400" />
                      Questions — {inspectQuizId} ({inspectQuestions.length})
                    </h3>
                    <button
                      onClick={() => {
                        setInspectQuizId('');
                        setInspectQuestions([]);
                      }}
                      className="text-xs font-bold text-slate-400 hover:text-white transition flex items-center gap-1.5"
                    >
                      <Icon name="close" size={14} />
                      Fermer
                    </button>
                  </div>
                  {loadingQuestions ? (
                    <p className="text-xs text-slate-500 text-center py-8 animate-pulse">
                      Chargement des questions...
                    </p>
                  ) : (
                    <div className="space-y-3 max-h-[32rem] overflow-y-auto pr-1">
                      {inspectQuestions.map(q => (
                        <div key={q.id} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-xs font-bold text-slate-200 flex-1 leading-relaxed">
                              {q.Question}
                            </p>
                            <button
                              onClick={() => deleteSingleQuestion(q.id)}
                              aria-label="Supprimer cette question"
                              className="w-7 h-7 shrink-0 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition"
                            >
                              <Icon name="trash" size={14} />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] mt-3">
                            {['A', 'B', 'C', 'D'].map(l => {
                              const val = q['Opt' + l];
                              if (!val) return null;
                              const isCorrect = val === q.ReponseCorrecte;
                              return (
                                <div
                                  key={l}
                                  className={`p-2 rounded-lg border ${
                                    isCorrect
                                      ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300 font-bold'
                                      : 'bg-slate-900 border-slate-800 text-slate-400'
                                  }`}
                                >
                                  <strong>{l}.</strong> {val}
                                  {isCorrect && (
                                    <span className="ml-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase">
                                      <Icon name="check" size={10} strokeWidth={3} />
                                      Correcte
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {inspectQuestions.length === 0 && (
                        <p className="text-xs text-slate-500 text-center py-6">
                          Aucune question importée pour cette évaluation.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="grid lg:grid-cols-3 gap-4 items-start">
                {/* Programmer une évaluation */}
                <div className={`${card} lg:col-span-2 p-6 space-y-5`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="calendar" size={15} className="text-blue-400" />
                      Programmer une évaluation
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Configurez la matière, la minuterie et les dates d'ouverture
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Filière</label>
                      <select className={selectCls} value={filiere} onChange={e => setFiliere(e.target.value)}>
                        {filieres.map(f => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Niveau</label>
                      <select className={selectCls} value={niveau} onChange={e => setNiveau(e.target.value)}>
                        {niveaux.map(n => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={label}>Code UE</label>
                      <input
                        type="text"
                        placeholder="INF232"
                        className={input}
                        value={ue}
                        onChange={e => setUe(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={label}>Semestre</label>
                      <select className={selectCls} value={semestre} onChange={e => setSemestre(e.target.value)}>
                        <option value="1">Semestre 1</option>
                        <option value="2">Semestre 2</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>Temps / question (s)</label>
                      <input
                        type="number"
                        min="10"
                        className={input}
                        value={timePerQuestion}
                        onChange={e => setTimePerQuestion(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Ouverture de l'épreuve</label>
                      <input
                        type="datetime-local"
                        className={input}
                        value={launchTime}
                        onChange={e => setLaunchTime(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={label}>Clôture (optionnel)</label>
                      <input
                        type="datetime-local"
                        className={input}
                        value={endTime}
                        onChange={e => setEndTime(e.target.value)}
                      />
                    </div>
                  </div>

                  <button onClick={handleSaveQuiz} className={btnPrimary}>
                    <Icon name="check" size={14} strokeWidth={3} />
                    Enregistrer la programmation
                  </button>
                </div>

                {/* Import CSV */}
                <div className={`${card} p-6 space-y-5`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="upload" size={15} className="text-blue-400" />
                      Importer des questions
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      CSV avec auto-détection des colonnes (Excel ou standard)
                    </p>
                  </div>

                  <label className="block">
                    <div className="border-2 border-dashed border-slate-700 hover:border-blue-600 rounded-xl p-6 text-center cursor-pointer transition">
                      <div className="w-10 h-10 rounded-xl bg-blue-600/15 border border-blue-600/30 text-blue-400 flex items-center justify-center mx-auto mb-3">
                        <Icon name="document" size={18} />
                      </div>
                      <p className="text-xs font-bold text-slate-300">
                        {csvFile ? csvFile.name : 'Choisir un fichier CSV…'}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1">
                        Colonnes tolérantes : Question, OptA-D, ReponseCorrecte…
                      </p>
                    </div>
                    <input type="file" accept=".csv" className="hidden" onChange={handleFileSelected} />
                  </label>

                  <div>
                    <label className={label}>Télécharger un modèle</label>
                    <div className="flex gap-2">
                      <button onClick={() => downloadCsvTemplate(';')} className={btnSecondary + ' flex-1 justify-center'}>
                        <Icon name="download" size={13} />
                        Excel (;)
                      </button>
                      <button onClick={() => downloadCsvTemplate(',')} className={btnSecondary + ' flex-1 justify-center'}>
                        <Icon name="download" size={13} />
                        Standard (,)
                      </button>
                    </div>
                  </div>

                  <div className="bg-blue-950/40 border border-blue-900/50 rounded-xl p-3 text-[11px] text-blue-200 leading-relaxed">
                    L'import remplace les questions existantes de l'UE et fusionne les métadonnées
                    (filière, niveau, minuterie) définies ci-contre.
                  </div>
                </div>
              </div>

              {/* Liste des évaluations */}
              <div className={`${card} overflow-hidden`}>
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Icon name="list" size={15} className="text-blue-400" />
                      Toutes les évaluations ({history.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Inspectez les questions, consultez les résultats ou supprimez une évaluation
                    </p>
                  </div>
                  <button onClick={fetchHistory} className={btnSecondary}>
                    <Icon name="refresh" size={13} />
                    Actualiser
                  </button>
                </div>

                {history.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    Aucune évaluation enregistrée. Programmez la première ci-dessus.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {filteredHistory.map(q => {
                      const isUpcoming = upcomingIds.has(q.id);
                      return (
                        <div key={q.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full">
                                {q.filiere || '—'} — {q.niveau || '—'}
                              </span>
                              {q.semestre && (
                                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-600/15 px-2 py-0.5 rounded-full">
                                  S{q.semestre}
                                </span>
                              )}
                              <span
                                className={`inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
                                  isUpcoming
                                    ? 'bg-emerald-500/15 text-emerald-300'
                                    : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                <Icon name={isUpcoming ? 'clock' : 'check-circle'} size={10} />
                                {isUpcoming ? 'À venir' : 'Terminée'}
                              </span>
                            </div>
                            <h4 className="font-black text-white text-base mt-1">{q.ue || q.id}</h4>
                            <p className="text-[11px] text-slate-500">
                              {q.questionCount || 0} questions • {q.timePerQuestion || 60}s/question •
                              Ouverture : {formatDate(q.launchTime)}
                              {q.endTime ? ` • Clôture : ${formatDate(q.endTime)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                            <button
                              onClick={() => loadInspectQuestions(q.id)}
                              title="Inspecter les questions"
                              className={btnSecondary}
                            >
                              <Icon name="eye" size={13} />
                              Questions
                            </button>
                            <button
                              onClick={() => openResults(q.id)}
                              title="Voir les résultats"
                              className={btnSecondary}
                            >
                              <Icon name="trophy" size={13} />
                              Résultats
                            </button>
                            <button
                              onClick={() => exportCSV(q.id)}
                              title="Exporter les résultats en CSV"
                              className={btnSecondary}
                            >
                              <Icon name="download" size={13} />
                              CSV
                            </button>
                            <button
                              onClick={() => exportPDF(q.id)}
                              title="Exporter le procès-verbal PDF"
                              className={btnSecondary}
                            >
                              <Icon name="document" size={13} />
                              PDF
                            </button>
                            <button
                              onClick={() => deleteQuiz(q.id)}
                              title="Supprimer l'évaluation (résultats conservés)"
                              className="inline-flex items-center gap-1.5 border border-red-900/60 hover:border-red-700 text-red-400 hover:text-red-300 hover:bg-red-950/40 font-bold text-xs px-3 py-2 rounded-xl transition"
                            >
                              <Icon name="trash" size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ UNITÉS D'ENSEIGNEMENT ════════════ */}
          {activeSection === 'ues' && (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-4 items-start">
                {/* Ajouter une UE */}
                <div className={`${card} p-6 space-y-4`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="plus" size={15} className="text-blue-400" />
                      Ajouter une unité d'enseignement
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Le catalogue sert de référence lors de la programmation
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Code UE</label>
                      <input
                        type="text"
                        placeholder="INF232"
                        className={input}
                        value={newUeCode}
                        onChange={e => setNewUeCode(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={label}>Intitulé</label>
                      <input
                        type="text"
                        placeholder="Bases de données"
                        className={input}
                        value={newUeLabel}
                        onChange={e => setNewUeLabel(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={label}>Filière</label>
                      <select
                        className={selectCls}
                        value={newUeFiliere}
                        onChange={e => setNewUeFiliere(e.target.value)}
                      >
                        {filieres.map(f => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Niveau</label>
                      <select
                        className={selectCls}
                        value={newUeNiveau}
                        onChange={e => setNewUeNiveau(e.target.value)}
                      >
                        {niveaux.map(n => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <button onClick={addUe} className={btnPrimary}>
                    <Icon name="plus" size={14} strokeWidth={3} />
                    Ajouter l'UE
                  </button>
                </div>

                {/* Filières & niveaux */}
                <div className={`${card} p-6 space-y-5`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="graduation" size={15} className="text-blue-400" />
                      Filières & niveaux
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Personnalisez les listes proposées aux étudiants
                    </p>
                  </div>
                  <div>
                    <label className={label}>Filières ({filieres.length})</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {filieres.map(f => (
                        <span
                          key={f}
                          className="text-[11px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 px-2.5 py-1 rounded-full"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nouvelle filière"
                        className={input}
                        value={newFiliere}
                        onChange={e => setNewFiliere(e.target.value)}
                      />
                      <button onClick={addFiliere} className={btnSecondary}>
                        <Icon name="plus" size={13} strokeWidth={3} />
                        Ajouter
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className={label}>Niveaux ({niveaux.length})</label>
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {niveaux.map(n => (
                        <span
                          key={n}
                          className="text-[11px] font-bold text-emerald-300 bg-emerald-600/15 border border-emerald-600/30 px-2.5 py-1 rounded-full"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Ex: D1"
                        className={input}
                        value={newNiveau}
                        onChange={e => setNewNiveau(e.target.value)}
                      />
                      <button onClick={addNiveau} className={btnSecondary}>
                        <Icon name="plus" size={13} strokeWidth={3} />
                        Ajouter
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Catalogue des UE */}
              <div className={`${card} overflow-hidden`}>
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Icon name="book" size={15} className="text-blue-400" />
                    Catalogue des UE ({allUes.length})
                  </h3>
                  <button onClick={fetchUes} className={btnSecondary}>
                    <Icon name="refresh" size={13} />
                    Actualiser
                  </button>
                </div>
                {allUes.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    Aucune UE enregistrée dans le catalogue.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {allUes.map(u => (
                      <div key={u.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-white text-sm">{u.code}</span>
                            <span className="text-[10px] font-bold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full">
                              {u.filiere}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                              {u.niveau}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5 truncate">{u.label || u.code}</p>
                        </div>
                        <button
                          onClick={() => deleteUe(u.id)}
                          aria-label={`Supprimer l'UE ${u.code}`}
                          className="w-8 h-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition shrink-0"
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ ÉTUDIANTS ════════════ */}
          {activeSection === 'students' && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Icon name="users" size={15} className="text-blue-400" />
                    Comptes étudiants ({students.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Authentification sécurisée par le serveur (mots de passe chiffrés)
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setLoadingStudents(true);
                      fetchStudents();
                    }}
                    className={btnSecondary}
                  >
                    <Icon name="refresh" size={13} />
                    Actualiser
                  </button>
                  <button onClick={exportStudentsCsv} className={btnPrimary}>
                    <Icon name="download" size={13} />
                    Exporter CSV
                  </button>
                </div>
              </div>

              {/* Filtres & recherche */}
              <div className="px-6 py-4 border-b border-slate-800 flex gap-3 flex-wrap">
                <div className="relative flex-1 min-w-48">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <Icon name="search" size={14} />
                  </span>
                  <input
                    type="text"
                    placeholder="Rechercher par nom ou email…"
                    className={input + ' pl-9'}
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                  />
                </div>
                <select
                  className={selectCls + ' w-auto min-w-40'}
                  value={studentFilterFiliere}
                  onChange={e => setStudentFilterFiliere(e.target.value)}
                >
                  <option value="">Toutes filières</option>
                  {filieres.map(f => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>

              {loadingStudents ? (
                <p className="text-xs text-slate-500 text-center py-10 animate-pulse">Chargement des étudiants…</p>
              ) : filteredStudents.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">
                  Aucun étudiant ne correspond à ces critères.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                        <th className="py-2.5 px-4 text-left">Nom / Pseudo</th>
                        <th className="py-2.5 px-4 text-left">Email</th>
                        <th className="py-2.5 px-4 text-left">Filière</th>
                        <th className="py-2.5 px-4 text-left">Niveau</th>
                        <th className="py-2.5 px-4 text-left">Année</th>
                        <th className="py-2.5 px-4 text-left">Inscrit le</th>
                        <th className="py-2.5 px-4"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {filteredStudents.map(s => (
                        <tr key={s.id} className="hover:bg-slate-950/60 transition">
                          <td className="py-3 px-4 font-bold text-white">{s.name}</td>
                          <td className="py-3 px-4 text-slate-400 font-mono">{s.email}</td>
                          <td className="py-3 px-4">
                            <span className="text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full font-bold">
                              {s.filiere}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-bold">{s.niveau}</td>
                          <td className="py-3 px-4 text-slate-400">{s.anneeAcademique || '—'}</td>
                          <td className="py-3 px-4 text-slate-500">{formatDate(s.createdAt)}</td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => deleteStudent(s.id, s.name)}
                              aria-label={`Supprimer ${s.name}`}
                              className="w-8 h-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition inline-flex"
                            >
                              <Icon name="trash" size={14} />
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

          {/* ════════════ RÉSULTATS ════════════ */}
          {activeSection === 'results' && (
            <div className="space-y-6">
              <div className={`${card} p-6`}>
                <div className="flex flex-col md:flex-row md:items-end gap-4">
                  <div className="flex-1">
                    <label className={label}>Choisir une évaluation</label>
                    <select
                      className={selectCls}
                      value={resultsQuizId}
                      onChange={e => {
                        setResultsQuizId(e.target.value);
                        loadResults(e.target.value);
                      }}
                    >
                      <option value="">— Sélectionner une évaluation —</option>
                      {filteredHistory.map(q => (
                        <option key={q.id} value={q.id}>
                          {q.ue || q.id} — {q.filiere || '?'} {q.niveau || ''} ({formatDate(q.launchTime)})
                        </option>
                      ))}
                    </select>
                  </div>
                  {resultsQuizId && (
                    <div className="flex gap-2">
                      <button onClick={() => exportCSV(resultsQuizId)} className={btnSecondary}>
                        <Icon name="download" size={13} />
                        Exporter CSV
                      </button>
                      <button onClick={() => exportPDF(resultsQuizId)} className={btnPrimary}>
                        <Icon name="document" size={13} />
                        Procès-verbal PDF
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {resultsQuizId && (
                <>
                  <div className="grid grid-cols-3 gap-4">
                    <div className={`${card} p-5`}>
                      <div className="text-3xl font-black text-white leading-none">{resultsStats.count}</div>
                      <div className="text-[11px] text-slate-500 mt-1.5 font-bold uppercase tracking-wider">
                        Participants
                      </div>
                    </div>
                    <div className={`${card} p-5`}>
                      <div className="text-3xl font-black text-blue-400 leading-none">
                        {resultsStats.average}
                        <span className="text-sm text-slate-500 font-bold"> /20</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1.5 font-bold uppercase tracking-wider">
                        Moyenne
                      </div>
                    </div>
                    <div className={`${card} p-5`}>
                      <div className="text-3xl font-black text-emerald-400 leading-none">
                        {resultsStats.best}
                        <span className="text-sm text-slate-500 font-bold"> /20</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1.5 font-bold uppercase tracking-wider">
                        Meilleure note
                      </div>
                    </div>
                  </div>

                  <div className={`${card} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-slate-800">
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <Icon name="trophy" size={15} className="text-amber-400" />
                        Résultats — {resultsQuizId}
                      </h3>
                    </div>
                    {loadingResults ? (
                      <p className="text-xs text-slate-500 text-center py-10 animate-pulse">
                        Chargement des résultats…
                      </p>
                    ) : resultsList.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-10">
                        Aucun résultat enregistré pour cette évaluation.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                              <th className="py-2.5 px-4 text-left">Étudiant</th>
                              <th className="py-2.5 px-4 text-left">Email</th>
                              <th className="py-2.5 px-4 text-left">Filière</th>
                              <th className="py-2.5 px-4 text-right">Score</th>
                              <th className="py-2.5 px-4 text-right">Note /20</th>
                              <th className="py-2.5 px-4 text-left">Type</th>
                              <th className="py-2.5 px-4 text-left">Date</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {resultsList.map(r => (
                              <tr key={r.id} className="hover:bg-slate-950/60 transition">
                                <td className="py-3 px-4 font-bold text-white">{r.name}</td>
                                <td className="py-3 px-4 text-slate-400 font-mono">{r.email || '—'}</td>
                                <td className="py-3 px-4">
                                  <span className="text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full font-bold">
                                    {r.filiere || '—'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right text-slate-300 font-bold">
                                  {r.score}/{r.total}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-blue-400">
                                  {r.total ? ((r.score / r.total) * 20).toFixed(2) : '—'}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                      r.isMakeup
                                        ? 'bg-red-500/15 text-red-300'
                                        : 'bg-emerald-500/15 text-emerald-300'
                                    }`}
                                  >
                                    {r.isMakeup ? 'Rattrapage' : 'Régulier'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-slate-500">{formatDate(r.date)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}

              {!resultsQuizId && (
                <p className="text-xs text-slate-500 text-center py-6">
                  Sélectionnez une évaluation pour afficher les notes et générer les exports.
                </p>
              )}
            </div>
          )}

          {/* ════════════ MESSAGES ════════════ */}
          {activeSection === 'messages' && (
            <div className={`${card} overflow-hidden`}>
              <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Icon name="chat" size={15} className="text-blue-400" />
                    Messages & suggestions ({feedbacks.length})
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Suivi des demandes envoyées par les étudiants
                  </p>
                </div>
                <button
                  onClick={() => {
                    setLoadingFb(true);
                    fetchFeedbacks();
                  }}
                  className={btnSecondary}
                >
                  <Icon name="refresh" size={13} />
                  Actualiser
                </button>
              </div>

              {/* Filtres */}
              <div className="px-6 py-4 border-b border-slate-800 flex gap-3 flex-wrap">
                <select
                  className={selectCls + ' flex-1 min-w-48'}
                  value={fbCategory}
                  onChange={e => setFbCategory(e.target.value)}
                >
                  <option value="">Toutes catégories</option>
                  {FEEDBACK_CATEGORIES.map(c => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
                <select
                  className={selectCls + ' flex-1 min-w-40'}
                  value={fbFiliere}
                  onChange={e => setFbFiliere(e.target.value)}
                >
                  <option value="">Toutes filières</option>
                  {filieres.map(f => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </div>

              {loadingFb ? (
                <p className="text-xs text-slate-500 text-center py-10 animate-pulse">Chargement des messages…</p>
              ) : feedbacks.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-10">
                  Aucun message ne correspond à ces critères.
                </p>
              ) : (
                <div className="divide-y divide-slate-800">
                  {feedbacks.map(f => (
                    <div key={f.id} className="px-6 py-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-white">{f.subject}</span>
                            <span className="text-[10px] font-bold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full">
                              {f.ue || 'Général'}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                f.status === 'traite'
                                  ? 'bg-emerald-500/15 text-emerald-300'
                                  : f.status === 'en_cours'
                                    ? 'bg-amber-500/15 text-amber-300'
                                    : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {f.status === 'traite' ? 'Traité' : f.status === 'en_cours' ? 'En cours' : 'En attente'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {f.name || 'Étudiant'} • {f.email || '—'} • {f.filiere || '—'} •{' '}
                            {f.category} • {formatDate(f.date)}
                          </p>
                          <p className="text-xs text-slate-300 leading-relaxed mt-2">{f.message}</p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <a
                            href={`mailto:${encodeURIComponent(f.email || '')}?subject=${encodeURIComponent('Re: ' + (f.subject || ''))}`}
                            title="Répondre par email"
                            className="w-8 h-8 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-950/50 flex items-center justify-center transition"
                          >
                            <Icon name="mail" size={14} />
                          </a>
                          <select
                            className="p-2 border border-slate-800 rounded-lg bg-slate-950 text-slate-300 text-[11px] font-bold outline-none focus:border-blue-600 transition"
                            value={f.status || 'nouveau'}
                            onChange={e => updateMessageStatus(f.id, e.target.value)}
                          >
                            <option value="nouveau">En attente</option>
                            <option value="en_cours">En cours</option>
                            <option value="traite">Traité</option>
                          </select>
                          <button
                            onClick={() => deleteFeedback(f.id)}
                            aria-label="Supprimer ce message"
                            className="w-8 h-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ════════════ PARAMÈTRES SMTP ════════════ */}
          {activeSection === 'smtp' && (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-4 items-start">
                {/* Configuration */}
                <form onSubmit={handleSaveSmtp} className={`${card} p-6 space-y-4`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="mail" size={15} className="text-blue-400" />
                      Compte Gmail expéditeur
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Utilisé pour les codes de récupération de mot de passe
                    </p>
                  </div>
                  <div>
                    <label className={label}>Adresse Gmail</label>
                    <input
                      type="email"
                      required
                      placeholder="administration.uy1@gmail.com"
                      className={input}
                      value={smtpEmail}
                      onChange={e => setSmtpEmail(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={label}>Mot de passe d'application (16 caractères)</label>
                    <input
                      type="password"
                      required
                      placeholder="abcd efgh ijkl mnop"
                      className={input + ' font-mono tracking-wider'}
                      value={smtpPassword}
                      onChange={e => setSmtpPassword(e.target.value)}
                    />
                  </div>
                  {smtpSavedMsg && (
                    <div className="bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs rounded-xl p-3 flex items-center gap-2">
                      <Icon name="check-circle" size={15} />
                      <span>{smtpSavedMsg}</span>
                    </div>
                  )}
                  <button type="submit" disabled={smtpSaving} className={btnPrimary}>
                    <Icon name="check" size={14} strokeWidth={3} />
                    {smtpSaving ? 'Enregistrement…' : "Enregistrer la configuration"}
                  </button>
                </form>

                {/* Test d'envoi */}
                <div className={`${card} p-6 space-y-4`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="send" size={15} className="text-blue-400" />
                      Tester l'envoi
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Vérifiez la configuration avant de la mettre en production
                    </p>
                  </div>
                  <div>
                    <label className={label}>Destinataire du test</label>
                    <input
                      type="email"
                      placeholder="votre.email@gmail.com"
                      className={input}
                      value={smtpTestRecipient}
                      onChange={e => setSmtpTestRecipient(e.target.value)}
                    />
                  </div>
                  <button onClick={handleTestSmtpConnection} disabled={smtpTesting} className={btnSecondary}>
                    <Icon name="send" size={13} />
                    {smtpTesting ? 'Envoi en cours…' : 'Envoyer un email de test'}
                  </button>

                  {smtpTestResult && (
                    <div
                      className={`text-xs rounded-xl p-3 flex items-start gap-2 ${
                        smtpTestResult.success
                          ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300'
                          : 'bg-red-950/60 border border-red-800 text-red-300'
                      }`}
                    >
                      <Icon name={smtpTestResult.success ? 'check-circle' : 'alert'} size={15} className="mt-0.5" />
                      <div>
                        {smtpTestResult.success ? (
                          <p>Email envoyé avec succès à {smtpTestRecipient || smtpEmail}.</p>
                        ) : (
                          <p>{smtpTestResult.error || "Échec de l'envoi."}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-3 text-xs text-slate-400 leading-relaxed">
                <Icon name="info" size={16} className="text-blue-400 mt-0.5 shrink-0" />
                <p>
                  Le mot de passe d'application se génère depuis votre compte Google
                  (myaccount.google.com → Sécurité → Validation en deux étapes → Mots de passe
                  d'application). Il comporte 16 caractères et remplace votre mot de passe Gmail
                  habituel. La configuration est stockée côté serveur et n'est jamais exposée aux
                  étudiants.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ════════════ MODALE : APERÇU CSV ════════════ */}
      {showCsvPreview && parsedCsvData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl shadow-black/50">
            {/* En-tête */}
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Icon name="document" size={15} className="text-blue-400" />
                  Aperçu de l'import — {csvFile?.name || 'fichier.csv'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {parsedCsvData.questions.length} question(s) détectée(s) • Cible : UE{' '}
                  <strong className="text-blue-300">{ue.trim().toUpperCase() || '— non saisie —'}</strong>
                </p>
              </div>
              <button
                onClick={() => setShowCsvPreview(false)}
                aria-label="Fermer l'aperçu"
                className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition shrink-0"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* Colonnes détectées */}
            {parsedCsvData.detectedColumns && (
              <div className="px-6 py-3 border-b border-slate-800 flex flex-wrap gap-1.5">
                {Object.entries(parsedCsvData.detectedColumns).map(([field, col]) => (
                  <span
                    key={field}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                      col
                        ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                        : 'bg-red-950/60 border-red-900 text-red-300'
                    }`}
                  >
                    {field} → {col || 'non détectée'}
                  </span>
                ))}
              </div>
            )}

            {/* Avertissements & erreurs */}
            {(parsedCsvData.warnings?.length > 0 || parsedCsvData.errors?.length > 0) && (
              <div className="px-6 py-3 border-b border-slate-800 space-y-1.5 max-h-32 overflow-y-auto">
                {parsedCsvData.errors?.map((er, i) => (
                  <p key={`e${i}`} className="text-[11px] text-red-300 flex items-start gap-1.5">
                    <Icon name="x-circle" size={12} className="mt-0.5 shrink-0" />
                    {er}
                  </p>
                ))}
                {parsedCsvData.warnings?.map((w, i) => (
                  <p key={`w${i}`} className="text-[11px] text-amber-300 flex items-start gap-1.5">
                    <Icon name="alert" size={12} className="mt-0.5 shrink-0" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            {/* Aperçu des questions */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2.5">
              {parsedCsvData.questions.map((q, i) => (
                <div key={i} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                  <p className="text-xs font-bold text-slate-200">
                    <span className="text-slate-500 mr-1.5">Q{i + 1}.</span>
                    {q.Question}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] mt-2">
                    {['A', 'B', 'C', 'D'].map(l => {
                      const val = q['Opt' + l];
                      if (!val) return null;
                      const isCorrect = val === q.ReponseCorrecte;
                      return (
                        <div
                          key={l}
                          className={`p-1.5 rounded-lg border ${
                            isCorrect
                              ? 'bg-emerald-950/50 border-emerald-700 text-emerald-300 font-bold'
                              : 'bg-slate-900 border-slate-800 text-slate-400'
                          }`}
                        >
                          <strong>{l}.</strong> {val}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11px] text-slate-500">
                L'import remplacera toutes les questions existantes de cette UE.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setShowCsvPreview(false)} className={btnSecondary}>
                  Annuler
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing || !parsedCsvData.questions.length}
                  className={btnPrimary}
                >
                  <Icon name="upload" size={13} />
                  {importing ? 'Import en cours…' : 'Confirmer l\u2019import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
