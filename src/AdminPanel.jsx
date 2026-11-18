import { useCallback, useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Papa from 'papaparse';
import { api } from './services/api';
import { parseQuestionsCsv, downloadCsvTemplate } from './utils/csvParser';
import { getSmtpSettings, saveSmtpSettings, testSmtpConnection } from './services/emailService';
import usePageTitle from './hooks/usePageTitle';
import Icon from './components/ui/icons.jsx';
import { RESOURCE_TYPES, resourceTypeLabel } from './constants/resourceTypes.js';
import { ADMIN_LOGIN_PATH } from './config';

const SECTIONS = [
  { id: 'overview', label: "Vue d'ensemble", icon: 'chart', desc: 'Statistiques clés et prochaines évaluations' },
  { id: 'quizzes', label: 'Évaluations', icon: 'list', desc: 'Programmer, importer et gérer les QCM' },
  { id: 'analytics', label: 'Analytique', icon: 'chart', desc: 'Questions ratées, réussite par UE et évolution des notes' },
  { id: 'ai', label: 'Tuteur IA', icon: 'sparkles', desc: 'Requêtes, tokens consommés et budget mensuel' },
  { id: 'ai-generator', label: 'Génération QCM IA', icon: 'lightbulb', desc: 'Générer des questions à partir de documents de référence' },
  { id: 'ues', label: "Unités d'enseignement", icon: 'book', desc: 'Catalogue des UE par faculté et niveau' },
  { id: 'catalogue', label: 'Facultés & filières', icon: 'graduation', desc: 'Gérer le catalogue des facultés et des filières' },
  { id: 'requests', label: 'Demandes de filière', icon: 'mail', desc: 'Filières signalées par les étudiants à ajouter' },
  { id: 'quiz-requests', label: 'Demandes de QCM', icon: 'lightbulb', desc: 'Pétitions étudiantes : épreuves manquantes par filière, niveau et UE' },
  { id: 'students', label: 'Étudiants', icon: 'users', desc: 'Comptes inscrits et exports par faculté / filière' },
  { id: 'results', label: 'Résultats', icon: 'trophy', desc: 'Notes par évaluation et procès-verbaux' },
  { id: 'rankings', label: 'Classements', icon: 'trophy', desc: 'Classements par salle (filière + niveau) et exports' },
  { id: 'resources', label: 'Ressources', icon: 'book', desc: 'Modération des documents partagés par les étudiants' },
  { id: 'messages', label: 'Messages', icon: 'chat', desc: 'Suggestions et signalements des étudiants' },
  { id: 'backups', label: 'Sauvegardes', icon: 'download', desc: 'Copies de sécurité de la base SQLite' },
  { id: 'smtp', label: 'Paramètres SMTP', icon: 'settings', desc: 'Service email de récupération de mot de passe' }
];

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

const formatDate = (ts) => (ts ? new Date(ts).toLocaleString('fr-FR') : '-');

/** Convertit un timestamp en valeur d'un champ <input type="datetime-local">. */
const toDatetimeLocal = (ts) => {
  const date = new Date(Number(ts));
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatNumber = (value) => new Intl.NumberFormat('fr-FR').format(Number(value) || 0);

const formatTokens = (value) => {
  const n = Number(value) || 0;
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)} Md`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)} M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)} k`;
  return formatNumber(n);
};

const AI_STATUS_LABELS = {
  ok: { label: 'Réussie', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  error: { label: 'Erreur fournisseur', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  quota: { label: 'Quota refusé', cls: 'bg-slate-700/60 text-slate-300 border-slate-600' }
};

const formatContextKey = (key) => {
  if (!key) return '—';
  if (key === 'general') return 'Questions générales (mutualisées)';
  const [kind, quizId, detail] = String(key).split(':');
  if (kind === 'general') return `Conseils généraux · ${quizId || 'QCM'}`;
  if (kind === 'question') {
    return detail
      ? `${quizId || 'QCM'} · question ${detail.length > 12 ? `${detail.slice(0, 12)}…` : detail}`
      : `${quizId || 'QCM'} · question`;
  }
  return key;
};

const sessionLabel = (timestamp) => {
  const ts = Number(timestamp);
  if (!ts) return 'Session non datée';
  return `Session du ${new Date(ts).toLocaleString('fr-FR')}`;
};

const formatSize = (bytes) => {
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} Mo`;
  return `${Math.max(1, Math.round(value / 1024))} Ko`;
};

/**
 * Miroir client de l'identifiant de test calculé par le serveur.
 * « INF232 » + « Test 1 » → « INF232-TEST-1 ».
 */
const quizIdFor = (ue, title) => {
  const code = String(ue || '').trim().toUpperCase();
  if (!code) return '';
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle || cleanTitle.toUpperCase() === code) return code;
  const slug = cleanTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug ? `${code}-${slug}` : code;
};

export default function AdminPanel() {
  usePageTitle('Administration');
  const [activeSection, setActiveSection] = useState('overview');

  // ── Catalogue facultés / filières (chargé depuis le serveur) ───────────
  const [facultes, setFacultes] = useState([]);
  const [catalogFilieres, setCatalogFilieres] = useState([]);

  // ── Évaluations : programmation & import CSV ──────────────────────────
  const [faculte, setFaculte] = useState('');
  const [filiere, setFiliere] = useState('');
  const [niveau, setNiveau] = useState('L1');
  const [semestre, setSemestre] = useState('1');
  const [ue, setUe] = useState('');
  const [quizTitle, setQuizTitle] = useState('');
  const [editingQuizId, setEditingQuizId] = useState('');
  const [duplicatingId, setDuplicatingId] = useState('');
  const [manualUe, setManualUe] = useState(false);
  // Filtres de la liste des évaluations (recherche, UE, semestre, faculté/filière)
  const [quizFilters, setQuizFilters] = useState({
    search: '',
    semestre: '',
    faculte: '',
    filiere: ''
  });
  const [launchTime, setLaunchTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [timePerQuestion, setTimePerQuestion] = useState('60');
  const [drawCount, setDrawCount] = useState('');

  const [csvFile, setCsvFile] = useState(null);
  const [parsedCsvData, setParsedCsvData] = useState(null); // { questions, warnings, errors, detectedColumns }
  const [showCsvPreview, setShowCsvPreview] = useState(false);
  const [importing, setImporting] = useState(false);

  // Inspection des questions d'une évaluation
  const [inspectQuizId, setInspectQuizId] = useState('');
  const [inspectQuestions, setInspectQuestions] = useState([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  // ── Unités d'enseignement ──────────────────────────────────────────────
  const [niveaux, setNiveaux] = useState(NIVEAUX_DEFAULT);
  const [newNiveau, setNewNiveau] = useState('');
  const [newUeCode, setNewUeCode] = useState('');
  const [newUeLabel, setNewUeLabel] = useState('');
  const [newUeFaculte, setNewUeFaculte] = useState('');
  const [newUeFiliere, setNewUeFiliere] = useState('');
  const [newUeNiveau, setNewUeNiveau] = useState('L1');
  const [newUeSemestre, setNewUeSemestre] = useState('1');
  const [allUes, setAllUes] = useState([]);

  // ── Gestion du catalogue (facultés & filières) ─────────────────────────
  const [newFaculteLabel, setNewFaculteLabel] = useState('');
  const [newCatalogueFiliere, setNewCatalogueFiliere] = useState({ faculte: '', label: '' });
  const [catalogueBusy, setCatalogueBusy] = useState(false);

  // ── Demandes de filière ────────────────────────────────────────────────
  const [filiereRequests, setFiliereRequests] = useState([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [requestStatusFilter, setRequestStatusFilter] = useState('pending');
  const [requestNotes, setRequestNotes] = useState({});

  // ── Demandes de QCM (pétitions étudiantes) ─────────────────────────────
  const [quizRequestGroups, setQuizRequestGroups] = useState([]);
  const [quizRequestRows, setQuizRequestRows] = useState([]);
  const [loadingQuizRequests, setLoadingQuizRequests] = useState(true);
  const [quizRequestFilters, setQuizRequestFilters] = useState({
    faculte: '',
    filiere: '',
    niveau: '',
    status: ''
  });
  const [quizRequestNotes, setQuizRequestNotes] = useState({});

  // ── Ressources de cours (modération) ───────────────────────────────────
  const [adminResources, setAdminResources] = useState([]);
  const [loadingResources, setLoadingResources] = useState(true);
  const [resourceFilters, setResourceFilters] = useState({ faculte: '', filiere: '', niveau: '', type: '' });
  const [resourceForm, setResourceForm] = useState({
    title: '',
    description: '',
    ue: '',
    type: 'cours',
    faculte: '',
    filiere: '',
    niveau: 'L1'
  });
  const [resourceFile, setResourceFile] = useState(null);
  const [resourceUploading, setResourceUploading] = useState(false);
  const [resourceError, setResourceError] = useState('');

  // ── Génération de QCM par IA ───────────────────────────────────────────
  const [aiDocs, setAiDocs] = useState([]);
  const [loadingAiDocs, setLoadingAiDocs] = useState(true);
  const [aiDocFile, setAiDocFile] = useState(null);
  const [aiDocUploading, setAiDocUploading] = useState(false);
  const [aiDocError, setAiDocError] = useState('');
  const [aiDocNotice, setAiDocNotice] = useState('');
  const [genPrompt, setGenPrompt] = useState('');
  const [genCount, setGenCount] = useState('10');
  const [genDifficulte, setGenDifficulte] = useState('moyenne');
  const [genFaculte, setGenFaculte] = useState('');
  const [genFiliere, setGenFiliere] = useState('');
  const [genNiveau, setGenNiveau] = useState('L1');
  const [genUe, setGenUe] = useState('');
  const [genSemestre, setGenSemestre] = useState('1');
  const [genQuizId, setGenQuizId] = useState('');
  const [genSave, setGenSave] = useState(false);
  const [genTimePerQuestion, setGenTimePerQuestion] = useState('60');
  const [genDocIds, setGenDocIds] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genNotice, setGenNotice] = useState('');
  const [genQuestions, setGenQuestions] = useState([]);

  // ── Étudiants ──────────────────────────────────────────────────────────
  const [students, setStudents] = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [studentSearch, setStudentSearch] = useState('');
  const [studentFilterFiliere, setStudentFilterFiliere] = useState('');
  const [studentFilterFaculte, setStudentFilterFaculte] = useState('');
  const [studentFilterNiveau, setStudentFilterNiveau] = useState('');

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

  // ── Analytique & sauvegardes ───────────────────────────────────────────
  const [analytics, setAnalytics] = useState(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);
  const [backups, setBackups] = useState([]);
  const [loadingBackups, setLoadingBackups] = useState(true);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // ── Messages & suggestions ─────────────────────────────────────────────
  const [feedbacks, setFeedbacks] = useState([]);
  const [fbCategory, setFbCategory] = useState('');
  const [fbFiliere, setFbFiliere] = useState('');
  const [fbStatus, setFbStatus] = useState('');
  const [replyDrafts, setReplyDrafts] = useState({});
  const [replyOpen, setReplyOpen] = useState({});
  const [sendingReply, setSendingReply] = useState(null);
  const [feedbackNotice, setFeedbackNotice] = useState('');
  const [loadingFb, setLoadingFb] = useState(true);

  // ── Tuteur IA : requêtes et consommation de tokens ─────────────────────
  const [aiUsage, setAiUsage] = useState(null);
  const [loadingAi, setLoadingAi] = useState(true);

  // ── Analytique : filtres par faculté / filière / niveau ────────────────
  const [analyticsFilters, setAnalyticsFilters] = useState({ faculte: '', filiere: '', niveau: '' });

  // ── Classements par salle (filière + niveau) ────────────────────────────
  const [rankings, setRankings] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(true);
  const [rankingFilters, setRankingFilters] = useState({ ue: '', faculte: '', filiere: '', niveau: '' });

  // Filières du catalogue filtrées par la faculté active de l'évaluation
  const filieres = useMemo(
    () => catalogFilieres.filter(f => !faculte || f.faculte === faculte).map(f => f.label),
    [catalogFilieres, faculte]
  );
  const allFiliereLabels = useMemo(
    () => [...new Set(catalogFilieres.map(f => f.label))],
    [catalogFilieres]
  );
  const filieresForFaculte = (fac) =>
    catalogFilieres.filter(f => !fac || f.faculte === fac).map(f => f.label);

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

  const fetchCatalogue = useCallback(async () => {
    try {
      const [facRes, filRes] = await Promise.all([
        api('/admin/facultes', { auth: 'admin' }),
        api('/admin/filieres', { auth: 'admin' })
      ]);
      const facs = Array.isArray(facRes.facultes) ? facRes.facultes : [];
      const fils = Array.isArray(filRes.filieres) ? filRes.filieres : [];
      setFacultes(facs);
      setCatalogFilieres(fils);

      const defaultFac = facs[0]?.id || '';
      const defaultFil = fils.find(f => f.faculte === defaultFac)?.label || fils[0]?.label || '';
      setFaculte(prev => prev || defaultFac);
      setFiliere(prev => prev || defaultFil);
      setNewUeFaculte(prev => prev || defaultFac);
      setNewUeFiliere(prev => prev || defaultFil);
      setNewCatalogueFiliere(prev => ({ ...prev, faculte: prev.faculte || defaultFac }));
      setGenFaculte(prev => prev || defaultFac);
      setGenFiliere(prev => prev || defaultFil);
      setResourceForm(prev => ({
        ...prev,
        faculte: prev.faculte || defaultFac,
        filiere: prev.filiere || defaultFil
      }));
    } catch (err) {
      console.warn('Erreur chargement catalogue :', err);
    }
  }, []);

  const fetchAnalytics = useCallback(async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.faculte) params.set('faculte', filters.faculte);
      if (filters.filiere) params.set('filiere', filters.filiere);
      if (filters.niveau) params.set('niveau', filters.niveau);
      const query = params.toString();
      const data = await api(`/admin/analytics${query ? `?${query}` : ''}`, { auth: 'admin' });
      setAnalytics(data);
    } catch (err) {
      console.warn('Erreur chargement analytique :', err);
    } finally {
      setLoadingAnalytics(false);
    }
  }, []);

  const fetchFiliereRequests = useCallback(async (status = '') => {
    try {
      const data = await api(
        `/admin/filiere-requests${status ? `?status=${encodeURIComponent(status)}` : ''}`,
        { auth: 'admin' }
      );
      setFiliereRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      console.warn('Erreur chargement demandes de filière :', err);
      setFiliereRequests([]);
    } finally {
      setLoadingRequests(false);
    }
  }, []);

  const fetchQuizRequests = useCallback(async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.faculte) params.set('faculte', filters.faculte);
      if (filters.filiere) params.set('filiere', filters.filiere);
      if (filters.niveau) params.set('niveau', filters.niveau);
      if (filters.status) params.set('status', filters.status);
      const query = params.toString();
      const data = await api(`/admin/quiz-requests${query ? `?${query}` : ''}`, { auth: 'admin' });
      setQuizRequestGroups(Array.isArray(data.groups) ? data.groups : []);
      setQuizRequestRows(Array.isArray(data.requests) ? data.requests : []);
    } catch (err) {
      console.warn('Erreur chargement demandes de QCM :', err);
      setQuizRequestGroups([]);
      setQuizRequestRows([]);
    } finally {
      setLoadingQuizRequests(false);
    }
  }, []);

  const fetchResources = useCallback(async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.faculte) params.set('faculte', filters.faculte);
      if (filters.filiere) params.set('filiere', filters.filiere);
      if (filters.niveau) params.set('niveau', filters.niveau);
      if (filters.type) params.set('type', filters.type);
      const query = params.toString();
      const data = await api(`/resources${query ? `?${query}` : ''}`, { auth: 'admin' });
      setAdminResources(Array.isArray(data.resources) ? data.resources : []);
    } catch (err) {
      console.warn('Erreur chargement ressources :', err);
      setAdminResources([]);
    } finally {
      setLoadingResources(false);
    }
  }, []);

  const fetchAiDocs = useCallback(async () => {
    try {
      const data = await api('/ai-generation/documents', { auth: 'admin' });
      setAiDocs(Array.isArray(data.documents) ? data.documents : []);
    } catch (err) {
      console.warn('Erreur chargement documents IA :', err);
      setAiDocs([]);
    } finally {
      setLoadingAiDocs(false);
    }
  }, []);

  const fetchBackups = useCallback(async () => {
    try {
      const data = await api('/admin/backups', { auth: 'admin' });
      setBackups(data.backups);
    } catch (err) {
      console.warn('Erreur chargement sauvegardes :', err);
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  const fetchAiUsage = useCallback(async () => {
    try {
      const data = await api('/admin/ai-usage', { auth: 'admin' });
      setAiUsage(data);
    } catch (err) {
      console.warn('Erreur chargement consommation IA :', err);
      setAiUsage(null);
    } finally {
      setLoadingAi(false);
    }
  }, []);

  const fetchRankings = useCallback(async (filters = {}) => {
    try {
      const params = new URLSearchParams();
      if (filters.ue) params.set('ue', filters.ue);
      if (filters.faculte) params.set('faculte', filters.faculte);
      if (filters.filiere) params.set('filiere', filters.filiere);
      if (filters.niveau) params.set('niveau', filters.niveau);
      const query = params.toString();
      const data = await api(`/admin/rankings${query ? `?${query}` : ''}`, { auth: 'admin' });
      setRankings(Array.isArray(data.groups) ? data.groups : []);
    } catch (err) {
      console.warn('Erreur chargement classements :', err);
      setRankings([]);
    } finally {
      setLoadingRankings(false);
    }
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
      if (fbStatus) list = list.filter(f => (f.status || 'en_attente') === fbStatus);
      list.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
      setFeedbacks(list);
    } catch (err) {
      console.warn('Erreur chargement messages :', err);
    } finally {
      setLoadingFb(false);
    }
  }, [fbCategory, fbFiliere, fbStatus]);

  useEffect(() => {
    // Chargement initial : la fonction locale asynchrone évite tout setState
    // synchrone dans le corps de l'effet (règle react-hooks/set-state-in-effect)
    const load = async () => {
      await Promise.all([
        fetchHistory(),
        fetchUpcoming(),
        fetchUes(),
        fetchStudents(),
        fetchSmtpConfig(),
        fetchCatalogue()
      ]);
    };
    load();
  }, [fetchHistory, fetchUpcoming, fetchUes, fetchStudents, fetchSmtpConfig, fetchCatalogue]);

  // Les filtres messages relancent le chargement
  useEffect(() => {
    const load = async () => {
      await fetchFeedbacks();
    };
    load();
  }, [fetchFeedbacks]);

  // Chargement à la demande des sections analytique, sauvegardes, IA,
  // classements, catalogue, demandes de filière et ressources
  useEffect(() => {
    const load = async () => {
      if (activeSection === 'analytics') await fetchAnalytics(analyticsFilters);
      if (activeSection === 'backups') await fetchBackups();
      if (activeSection === 'ai') await fetchAiUsage();
      if (activeSection === 'rankings') await fetchRankings(rankingFilters);
      if (activeSection === 'catalogue') await fetchCatalogue();
      if (activeSection === 'requests') await fetchFiliereRequests(requestStatusFilter);
      if (activeSection === 'quiz-requests') await fetchQuizRequests(quizRequestFilters);
      if (activeSection === 'resources') await fetchResources(resourceFilters);
      if (activeSection === 'ai-generator') await fetchAiDocs();
    };
    load();
  }, [
    activeSection,
    fetchAnalytics,
    fetchBackups,
    fetchAiUsage,
    fetchRankings,
    fetchCatalogue,
    fetchFiliereRequests,
    fetchQuizRequests,
    fetchResources,
    fetchAiDocs,
    analyticsFilters,
    rankingFilters,
    requestStatusFilter,
    quizRequestFilters,
    resourceFilters
  ]);

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
      const data = await api(`/quizzes/${encodeURIComponent(quizId)}/questions`, { auth: 'admin' });
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
      alert("Veuillez d'abord sélectionner l'UE à importer.");
      return;
    }
    if (!parsedCsvData?.questions?.length) {
      alert('Aucune question valide à importer.');
      return;
    }

    const testTitle = quizTitle.trim() || targetUe;
    const ueInfo = allUes.find(u => (u.code || u.id || '').toUpperCase() === targetUe);
    const metadata = {
      ue: targetUe,
      title: testTitle,
      faculte,
      filiere,
      niveau,
      semestre,
      ueLabel: ueInfo?.label || targetUe,
      timePerQuestion: parseInt(timePerQuestion) || 60,
      drawCount: drawCount === '' ? 0 : Math.max(0, parseInt(drawCount) || 0),
      launchTime: launchTime ? new Date(launchTime).getTime() : undefined,
      endTime: endTime ? new Date(endTime).getTime() : undefined
    };

    setImporting(true);
    try {
      // 1. Créer (ou retrouver) le test nommé, même UE mais intitulé distinct.
      const created = await api('/quizzes', { method: 'POST', auth: 'admin', body: metadata });
      const targetQuizId = created?.quiz?.id || targetUe;

      // 2. Importer les questions sur ce test précis.
      const res = await api(`/quizzes/${encodeURIComponent(targetQuizId)}/questions`, {
        method: 'POST',
        auth: 'admin',
        body: { ...metadata, questions: parsedCsvData.questions }
      });
      const count = res.count;

      alert(`Succès ! ${count} questions importées pour « ${testTitle} » (${targetUe}).`);
      setShowCsvPreview(false);
      setParsedCsvData(null);
      setCsvFile(null);
      fetchHistory();
      fetchUpcoming();
      fetchUes();
      if (inspectQuizId === targetQuizId) loadInspectQuestions(targetQuizId);
    } catch (err) {
      alert("Erreur lors de l'enregistrement : " + err.message);
    } finally {
      setImporting(false);
    }
  }, [
    ue,
    quizTitle,
    parsedCsvData,
    faculte,
    filiere,
    niveau,
    semestre,
    timePerQuestion,
    drawCount,
    launchTime,
    endTime,
    allUes,
    fetchHistory,
    fetchUpcoming,
    fetchUes,
    inspectQuizId,
    loadInspectQuestions
  ]);

  const handleSaveQuiz = useCallback(async () => {
    const targetUe = ue.trim().toUpperCase();
    if (!targetUe) {
      alert("Sélectionnez l'unité d'enseignement (UE) à évaluer.");
      return;
    }
    if (!launchTime) {
      alert("Renseignez la date et l'heure d'ouverture : sans cela, les étudiants ne verront pas l'épreuve.");
      return;
    }
    const testTitle = quizTitle.trim() || targetUe;
    const ueInfo = allUes.find(u => (u.code || u.id || '').toUpperCase() === targetUe);
    const data = {
      faculte,
      filiere,
      niveau,
      semestre,
      ue: targetUe,
      title: testTitle,
      ueLabel: ueInfo?.label || targetUe,
      timePerQuestion: parseInt(timePerQuestion) || 60,
      drawCount: drawCount === '' ? 0 : Math.max(0, parseInt(drawCount) || 0),
      launchTime: new Date(launchTime).getTime()
    };
    if (endTime) data.endTime = new Date(endTime).getTime();

    if (editingQuizId) {
      await api(`/quizzes/${encodeURIComponent(editingQuizId)}`, {
        method: 'POST',
        auth: 'admin',
        body: data
      });
      alert(`Test « ${testTitle} » (${targetUe}) mis à jour.`);
    } else {
      await api('/quizzes', { method: 'POST', auth: 'admin', body: data });
      alert(`Épreuve « ${testTitle} » (${targetUe}) programmée avec succès !`);
    }
    setEditingQuizId('');
    fetchHistory();
    fetchUpcoming();
    fetchUes();
  }, [ue, quizTitle, faculte, filiere, niveau, semestre, timePerQuestion, drawCount, launchTime, endTime, allUes, editingQuizId, fetchHistory, fetchUpcoming, fetchUes]);

  /** Pré-remplit le formulaire avec un test existant pour le modifier. */
  const loadQuizForEdit = useCallback((quiz) => {
    if (!quiz) return;
    setEditingQuizId(quiz.id);
    setUe(quiz.ue || quiz.id);
    setQuizTitle(quiz.title || quiz.ue || quiz.id);
    setManualUe(false);
    if (quiz.faculte) setFaculte(quiz.faculte);
    if (quiz.filiere) setFiliere(quiz.filiere);
    if (quiz.niveau) setNiveau(quiz.niveau);
    if (quiz.semestre) setSemestre(String(quiz.semestre));
    setTimePerQuestion(String(quiz.timePerQuestion || 60));
    setDrawCount(quiz.drawCount ? String(quiz.drawCount) : '');
    setLaunchTime(quiz.launchTime ? toDatetimeLocal(quiz.launchTime) : '');
    setEndTime(quiz.endTime ? toDatetimeLocal(quiz.endTime) : '');
  }, []);

  const resetQuizForm = useCallback(() => {
    setEditingQuizId('');
    setUe('');
    setQuizTitle('');
    setManualUe(false);
    setLaunchTime('');
    setEndTime('');
    setTimePerQuestion('60');
    setDrawCount('');
  }, []);

  /**
   * Duplique un test (métadonnées + questions). Les dates sont décalées d'une
   * semaine côté serveur, laissant le temps d'ajuster la programmation.
   */
  const duplicateQuiz = useCallback(async (quiz) => {
    if (!quiz?.id || duplicatingId) return;
    setDuplicatingId(quiz.id);
    try {
      const res = await api(`/quizzes/${encodeURIComponent(quiz.id)}/duplicate`, {
        method: 'POST',
        auth: 'admin',
        body: {}
      });
      const created = res?.quiz;
      if (created) {
        await fetchHistory();
        await fetchUpcoming();
        setActiveSection('quizzes');
        loadQuizForEdit(created);
        alert(
          `Copie créée : « ${created.title} » (${created.id}) · ` +
          `${res.copiedQuestions || created.questionCount || 0} question(s). ` +
          'Vérifiez la date proposée puis enregistrez.'
        );
      }
    } catch (err) {
      alert(`Duplication impossible : ${err.message}`);
    } finally {
      setDuplicatingId('');
    }
  }, [duplicatingId, fetchHistory, fetchUpcoming, loadQuizForEdit]);

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
      const quiz = history.find(q => q.id === quizId);
      const label = quiz?.title ? `${quiz.title} (${quiz.ue || quizId})` : quizId;

      // Le serveur refuse la première suppression si des copies existent :
      // on récupère leur nombre pour demander une confirmation explicite.
      let resultsCount = 0;
      try {
        const probe = await api(`/admin/results?quizId=${encodeURIComponent(quizId)}`, { auth: 'admin' });
        resultsCount = Array.isArray(probe?.results) ? probe.results.length : 0;
      } catch {
        // En cas d'échec, on conserve 0 : le serveur redemandera confirmation.
      }

      const warning = resultsCount > 0
        ? `\n\n⚠ ${resultsCount} copie(s) d'étudiant(s) seront définitivement perdues.\n` +
          'Cette action est irréversible.'
        : '\n\nAucune copie enregistrée pour ce test.';

      if (
        !confirm(
          `Supprimer définitivement le test « ${label} » ?\n\n` +
            'Les questions et les sessions actives seront supprimées.' +
            warning
        )
      ) {
        return;
      }

      try {
        await api(`/quizzes/${encodeURIComponent(quizId)}?force=1`, { method: 'DELETE', auth: 'admin' });
      } catch (err) {
        const count = err?.data?.resultsCount;
        if (err?.status === 409 && count) {
          if (!confirm(`Confirmer la suppression de ${count} copie(s) pour « ${label} » ?`)) return;
          await api(`/quizzes/${encodeURIComponent(quizId)}?force=1`, { method: 'DELETE', auth: 'admin' });
        } else {
          alert(`Suppression impossible : ${err.message}`);
          return;
        }
      }

      if (inspectQuizId === quizId) {
        setInspectQuizId('');
        setInspectQuestions([]);
      }
      if (resultsQuizId === quizId) {
        setResultsQuizId('');
        setResultsList([]);
      }
      if (editingQuizId === quizId) resetQuizForm();
      fetchHistory();
      fetchUpcoming();
    },
    [history, inspectQuizId, resultsQuizId, editingQuizId, resetQuizForm, fetchHistory, fetchUpcoming]
  );

  // ─── Résultats par évaluation ─────────────────────────────────────────
  const loadResults = useCallback(async (quizId) => {
    if (!quizId) {
      setResultsList([]);
      return;
    }
    setLoadingResults(true);
    try {
      const data = await api(`/admin/results?quizId=${encodeURIComponent(quizId)}`, { auth: 'admin' });
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

  // ─── UE & catalogue ───────────────────────────────────────────────────
  const addNiveau = () => {
    const n = newNiveau.trim().toUpperCase();
    if (!n || niveaux.includes(n)) return;
    setNiveaux([...niveaux, n]);
    setNewNiveau('');
  };

  const createFaculte = useCallback(async () => {
    const label = newFaculteLabel.trim();
    if (!label) {
      alert('Entrez le nom de la faculté.');
      return;
    }
    setCatalogueBusy(true);
    try {
      await api('/admin/facultes', { method: 'POST', auth: 'admin', body: { label } });
      setNewFaculteLabel('');
      await fetchCatalogue();
    } catch (err) {
      alert(`Ajout impossible : ${err.message}`);
    } finally {
      setCatalogueBusy(false);
    }
  }, [newFaculteLabel, fetchCatalogue]);

  const deleteFaculte = useCallback(async (id) => {
    if (!confirm(`Supprimer la faculté « ${id} » ?`)) return;
    try {
      await api(`/admin/facultes/${encodeURIComponent(id)}`, { method: 'DELETE', auth: 'admin' });
      await fetchCatalogue();
    } catch (err) {
      alert(`Suppression impossible : ${err.message}`);
    }
  }, [fetchCatalogue]);

  const createCatalogueFiliere = useCallback(async () => {
    const label = newCatalogueFiliere.label.trim();
    const fac = newCatalogueFiliere.faculte;
    if (!fac || !label) {
      alert('Choisissez une faculté et saisissez le nom de la filière.');
      return;
    }
    setCatalogueBusy(true);
    try {
      const res = await api('/admin/filieres', {
        method: 'POST',
        auth: 'admin',
        body: { label, faculte: fac }
      });
      setNewCatalogueFiliere(prev => ({ ...prev, label: '' }));
      await fetchCatalogue();
      if (res.notifiedUsers > 0) {
        alert(`Filière ajoutée. ${res.notifiedUsers} étudiant(s) notifié(s).`);
      }
    } catch (err) {
      alert(`Ajout impossible : ${err.message}`);
    } finally {
      setCatalogueBusy(false);
    }
  }, [newCatalogueFiliere, fetchCatalogue]);

  const deleteCatalogueFiliere = useCallback(async (id) => {
    if (!confirm('Supprimer cette filière du catalogue ?')) return;
    try {
      await api(`/admin/filieres/${encodeURIComponent(id)}`, { method: 'DELETE', auth: 'admin' });
      await fetchCatalogue();
    } catch (err) {
      alert(`Suppression impossible : ${err.message}`);
    }
  }, [fetchCatalogue]);

  const addUe = useCallback(async () => {
    const code = newUeCode.trim().toUpperCase();
    if (!code) {
      alert('Entrez un code UE.');
      return;
    }
    if (!newUeFaculte || !newUeFiliere) {
      alert('Choisissez la faculté et la filière de cette UE.');
      return;
    }
    await api('/ues', {
      method: 'POST',
      auth: 'admin',
      body: {
        code,
        label: newUeLabel.trim() || code,
        faculte: newUeFaculte,
        filiere: newUeFiliere,
        niveau: newUeNiveau,
        semestre: newUeSemestre
      }
    });
    alert(`UE "${code}" ajoutée avec succès !`);
    setNewUeCode('');
    setNewUeLabel('');
    fetchUes();
  }, [newUeCode, newUeLabel, newUeFaculte, newUeFiliere, newUeNiveau, newUeSemestre, fetchUes]);

  // ─── Demandes de filière ──────────────────────────────────────────────
  const approveFiliereRequest = useCallback(async (request) => {
    const note = requestNotes[request.id] || '';
    try {
      const res = await api(`/admin/filiere-requests/${encodeURIComponent(request.id)}/approve`, {
        method: 'POST',
        auth: 'admin',
        body: { faculte: request.faculte, filiere: request.filiere, note }
      });
      alert(
        `Filière « ${request.filiere} » validée. ` +
        `${res.notifiedUsers || 0} étudiant(s) notifié(s) dans l'application et par email.`
      );
      await Promise.all([
        fetchFiliereRequests(requestStatusFilter),
        fetchCatalogue()
      ]);
    } catch (err) {
      alert(`Validation impossible : ${err.message}`);
    }
  }, [requestNotes, requestStatusFilter, fetchFiliereRequests, fetchCatalogue]);

  const rejectFiliereRequest = useCallback(async (request) => {
    const note = requestNotes[request.id] || '';
    if (!confirm(`Rejeter la demande de filière « ${request.filiere} » ?`)) return;
    try {
      await api(`/admin/filiere-requests/${encodeURIComponent(request.id)}/reject`, {
        method: 'POST',
        auth: 'admin',
        body: { note }
      });
      await fetchFiliereRequests(requestStatusFilter);
    } catch (err) {
      alert(`Rejet impossible : ${err.message}`);
    }
  }, [requestNotes, requestStatusFilter, fetchFiliereRequests]);

  // ─── Demandes de QCM (modération) ─────────────────────────────────────
  const approveQuizRequest = useCallback(async (group) => {
    if (!group?.id) return;
    if (!confirm(`Accepter la demande de QCM ${group.ue} (${group.filiere} · ${group.niveau}) ?`)) return;
    try {
      await api(`/admin/quiz-requests/${encodeURIComponent(group.id)}/approve`, {
        method: 'POST',
        auth: 'admin',
        body: { note: quizRequestNotes[group.id] || '' }
      });
      await fetchQuizRequests(quizRequestFilters);
    } catch (err) {
      alert(`Validation impossible : ${err.message}`);
    }
  }, [quizRequestNotes, quizRequestFilters, fetchQuizRequests]);

  const rejectQuizRequest = useCallback(async (group) => {
    if (!group?.id) return;
    if (!confirm(`Rejeter la demande de QCM ${group.ue} (${group.filiere} · ${group.niveau}) ?`)) return;
    try {
      await api(`/admin/quiz-requests/${encodeURIComponent(group.id)}/reject`, {
        method: 'POST',
        auth: 'admin',
        body: { note: quizRequestNotes[group.id] || '' }
      });
      await fetchQuizRequests(quizRequestFilters);
    } catch (err) {
      alert(`Rejet impossible : ${err.message}`);
    }
  }, [quizRequestNotes, quizRequestFilters, fetchQuizRequests]);

  const prepareQuizFromRequest = useCallback((group) => {
    if (!group) return;
    setFaculte(group.faculte || '');
    setFiliere(group.filiere || '');
    setNiveau(group.niveau || 'L1');
    setUe(group.ue || '');
    setManualUe(true);
    setActiveSection('quizzes');
  }, []);

  // ─── Ressources de cours (administration) ─────────────────────────────
  const uploadAdminResource = useCallback(async (e) => {
    e.preventDefault();
    setResourceError('');
    if (!resourceFile) {
      setResourceError('Sélectionnez un fichier à publier.');
      return;
    }
    if (!resourceForm.faculte || !resourceForm.filiere || !resourceForm.niveau) {
      setResourceError('Faculté, filière et niveau sont requis.');
      return;
    }
    setResourceUploading(true);
    try {
      const token = sessionStorage.getItem('adminToken') || '';
      const body = new FormData();
      body.append('title', resourceForm.title.trim() || resourceFile.name);
      body.append('description', resourceForm.description.trim());
      body.append('ue', resourceForm.ue.trim());
      body.append('type', resourceForm.type);
      body.append('faculte', resourceForm.faculte);
      body.append('filiere', resourceForm.filiere);
      body.append('niveau', resourceForm.niveau);
      body.append('file', resourceFile);

      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Publication impossible.');

      setResourceForm(prev => ({ ...prev, title: '', description: '', ue: '' }));
      setResourceFile(null);
      await fetchResources(resourceFilters);
    } catch (err) {
      setResourceError(err.message || 'Publication impossible.');
    } finally {
      setResourceUploading(false);
    }
  }, [resourceFile, resourceForm, resourceFilters, fetchResources]);

  const downloadAdminResource = useCallback(async (item) => {
    try {
      const res = await fetch(`/api/resources/${item.id}/download`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('adminToken') || ''}` }
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.originalName || 'ressource';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      alert(`Téléchargement impossible : ${err.message}`);
    }
  }, []);

  const deleteAdminResource = useCallback(async (item) => {
    if (!confirm(`Supprimer « ${item.title} » ?`)) return;
    try {
      await api(`/resources/${item.id}`, { method: 'DELETE', auth: 'admin' });
      setAdminResources(prev => prev.filter(r => r.id !== item.id));
    } catch (err) {
      alert(`Suppression impossible : ${err.message}`);
    }
  }, []);

  // ─── Génération de QCM par IA ─────────────────────────────────────────
  const uploadAiDoc = useCallback(async (e) => {
    e.preventDefault();
    setAiDocError('');
    setAiDocNotice('');
    if (!aiDocFile) {
      setAiDocError("Sélectionnez un document (PDF, Word, PowerPoint, Excel, texte, archive…)");
      return;
    }
    setAiDocUploading(true);
    try {
      const token = sessionStorage.getItem('adminToken') || '';
      const body = new FormData();
      body.append('file', aiDocFile);
      const res = await fetch('/api/ai-generation/documents', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Dépôt impossible.');

      setAiDocFile(null);
      const doc = data.document || {};
      setAiDocNotice(
        [
          `« ${doc.originalName || 'Document'} » lu avec succès`,
          doc.method ? `(${doc.method})` : '',
          doc.charCount ? `· ${formatNumber(doc.charCount)} caractères extraits.` : '',
          doc.warning ? ` ${doc.warning}` : ''
        ].filter(Boolean).join(' ')
      );
      await fetchAiDocs();
    } catch (err) {
      setAiDocError(err.message || 'Dépôt impossible.');
    } finally {
      setAiDocUploading(false);
    }
  }, [aiDocFile, fetchAiDocs]);

  const deleteAiDoc = useCallback(async (doc) => {
    if (!confirm(`Supprimer le document « ${doc.originalName} » ?`)) return;
    try {
      await api(`/ai-generation/documents/${doc.id}`, { method: 'DELETE', auth: 'admin' });
      setGenDocIds(prev => prev.filter(id => id !== doc.id));
      await fetchAiDocs();
    } catch (err) {
      alert(`Suppression impossible : ${err.message}`);
    }
  }, [fetchAiDocs]);

  const toggleGenDoc = (id) => {
    setGenDocIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));
  };

  const handleGenerateQuestions = useCallback(async () => {
    setGenError('');
    setGenNotice('');
    if (!genPrompt.trim() && genDocIds.length === 0 && aiDocs.length === 0) {
      setGenError('Ajoutez un prompt ou déposez au moins un document de référence.');
      return;
    }
    if (genSave && !genQuizId.trim()) {
      setGenError("Indiquez le code de l'épreuve dans laquelle enregistrer les questions.");
      return;
    }
    setGenerating(true);
    try {
      const data = await api('/ai-generation/generate', {
        method: 'POST',
        auth: 'admin',
        body: {
          prompt: genPrompt.trim(),
          count: parseInt(genCount) || 10,
          difficulte: genDifficulte,
          faculte: genFaculte,
          filiere: genFiliere,
          niveau: genNiveau,
          ue: genUe.trim(),
          semestre: genSemestre,
          documentIds: genDocIds,
          save: genSave,
          quizId: genSave ? genQuizId.trim().toUpperCase() : '',
          timePerQuestion: parseInt(genTimePerQuestion) || 60
        }
      });
      setGenQuestions(Array.isArray(data.questions) ? data.questions : []);
      if (data.saved) {
        setGenNotice(
          `Questions générées et enregistrées dans l'épreuve ${genQuizId.trim().toUpperCase()} ` +
          `(${data.questions.length} question(s)).`
        );
        fetchHistory();
        fetchUpcoming();
        fetchUes();
      } else {
        setGenNotice(`${data.questions.length} question(s) générée(s). Vérifiez-les avant de les enregistrer.`);
      }
    } catch (err) {
      setGenError(err.message || 'La génération a échoué.');
    } finally {
      setGenerating(false);
    }
  }, [
    genPrompt,
    genCount,
    genDifficulte,
    genFaculte,
    genFiliere,
    genNiveau,
    genUe,
    genSemestre,
    genDocIds,
    genSave,
    genQuizId,
    genTimePerQuestion,
    aiDocs,
    fetchHistory,
    fetchUpcoming,
    fetchUes
  ]);

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
      Faculte: s.faculte || '-',
      Filiere: s.filiere,
      Niveau: s.niveau,
      'Annee Academique': s.anneeAcademique || '-',
      Inscrit_le: formatDate(s.createdAt)
    }));
    const csv = Papa.unparse(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Etudiants_QCM_App.csv';
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

  const sendFeedbackReply = useCallback(
    async (id) => {
      const reply = String(replyDrafts[id] || '').trim();
      if (!reply) {
        setFeedbackNotice('Écrivez votre réponse avant de l’envoyer.');
        return;
      }
      setSendingReply(id);
      setFeedbackNotice('');
      try {
        await api(`/feedback/${id}`, {
          method: 'PATCH',
          auth: 'admin',
          body: { reply, status: 'traite' }
        });
        setReplyDrafts((prev) => ({ ...prev, [id]: '' }));
        setReplyOpen((prev) => ({ ...prev, [id]: false }));
        setFeedbackNotice('Réponse envoyée : elle apparaît dans les messages de l’étudiant et une notification lui est adressée.');
        await fetchFeedbacks();
      } catch (err) {
        setFeedbackNotice(`Envoi impossible : ${err.message}`);
      } finally {
        setSendingReply(null);
      }
    },
    [replyDrafts, fetchFeedbacks]
  );

  // ─── Exports résultats ────────────────────────────────────────────────
  const exportCSV = async (quizId) => {
    const data = await api(`/admin/results?quizId=${encodeURIComponent(quizId)}`, { auth: 'admin' });
    const linked = history.find(q => q.id === quizId);
    const testLabel = linked?.title ? `${linked.title} (${linked.ue || quizId})` : quizId;
    const rows = data.results.map(r => ({
      Nom: r.name,
      Email: r.email || '-',
      Filiere: r.filiere || '-',
      Niveau: r.niveau || '-',
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
    a.download = `Resultats_${(testLabel || quizId).replace(/[^a-zA-Z0-9_-]+/g, '_')}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportPDF = async (quizId) => {
    const data = await api(`/admin/results?quizId=${encodeURIComponent(quizId)}`, { auth: 'admin' });
    const linked = history.find(q => q.id === quizId);
    const testLabel = linked?.title ? `${linked.title} (${linked.ue || quizId})` : quizId;
    const rows = data.results.map(r => [
      r.name,
      r.email || '-',
      `${r.score}/${r.total}`,
      r.total ? `${((r.score / r.total) * 20).toFixed(2)}/20` : '-',
      r.isMakeup ? 'Rattrapage' : 'Régulier',
      new Date(r.date).toLocaleString('fr-FR')
    ]);
    if (!rows.length) {
      alert('Aucun résultat.');
      return;
    }
    const docPdf = new jsPDF();
    docPdf.setFontSize(14);
    docPdf.text(`Procès-Verbal Officiel des Résultats · ${testLabel}`, 14, 14);
    docPdf.setFontSize(9);
    docPdf.text(`Généré le ${new Date().toLocaleString('fr-FR')} • QCM App`, 14, 21);
    docPdf.autoTable({
      startY: 28,
      head: [['Étudiant', 'Email', 'Score', 'Note /20', 'Type', 'Date']],
      body: rows,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] }
    });
    docPdf.save(`PV_${(testLabel || quizId).replace(/[^a-zA-Z0-9_-]+/g, '_')}.pdf`);
  };

  /**
   * Export complet : toutes les copies, avec le détail de chaque réponse.
   * Une ligne par réponse permet d'analyser finement les erreurs.
   */
  const exportAllResultsCSV = async () => {
    try {
      const data = await api('/admin/results', { auth: 'admin' });
      if (!data.results.length) {
        alert('Aucun résultat à exporter.');
        return;
      }

      const rows = [];
      data.results.forEach((r) => {
        const note = r.total ? ((r.score / r.total) * 20).toFixed(2) : '';
        const base = {
          Etudiant: r.name,
          Email: r.email || '-',
          UE: r.ue,
          Filiere: r.filiere || '-',
          Niveau: r.niveau || '-',
          Score: r.score,
          Total: r.total,
          Note_Sur_20: note,
          Rattrapage: r.isMakeup ? 'OUI' : 'NON',
          Date_Copie: new Date(r.date).toLocaleString('fr-FR')
        };

        if (Array.isArray(r.answers) && r.answers.length > 0) {
          r.answers.forEach((a, index) => {
            const isObject = a && typeof a === 'object';
            rows.push({
              ...base,
              Numero_Question: index + 1,
              Question: isObject ? (a.question || a.Question || '') : '',
              Reponse_Donnee: isObject ? (a.selected || '-') : (a || '-'),
              Reponse_Correcte: isObject ? (a.correct || '') : '',
              Resultat: isObject && typeof a.isOk === 'boolean'
                ? (a.isOk ? 'CORRECT' : 'INCORRECT')
                : '',
              Tags: isObject ? (a.tags || '') : '',
              Difficulte: isObject ? (a.difficulte || '') : ''
            });
          });
        } else {
          rows.push({
            ...base,
            Numero_Question: '',
            Question: '',
            Reponse_Donnee: '',
            Reponse_Correcte: '',
            Resultat: '',
            Tags: '',
            Difficulte: ''
          });
        }
      });

      const csv = Papa.unparse(rows);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Export_Complet_Resultats_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Export impossible : ${err.message}`);
    }
  };

  // ─── Classements par salle : filtres et exports ───────────────────────
  const updateRankingFilter = (key, value) => {
    setLoadingRankings(true);
    setRankingFilters((prev) => ({ ...prev, [key]: value }));
  };

  const rankingsFlatRows = () => {
    const rows = [];
    rankings.forEach((group) => {
      group.participants.forEach((p) => {
        rows.push({
          Salle: group.salle,
          UE: group.ue,
          Session: sessionLabel(group.sessionTimestamp),
          Rang: p.rank,
          Etudiant: p.name,
          Score: `${p.score}/${p.total}`,
          Note_Sur_20: Number(p.note).toFixed(2),
          Type: p.isMakeup ? 'Rattrapage' : 'Régulier',
          Tentatives: p.attempts
        });
      });
    });
    return rows;
  };

  const exportRankingsCSV = () => {
    const rows = rankingsFlatRows();
    if (!rows.length) {
      alert('Aucun classement à exporter.');
      return;
    }
    const csv = Papa.unparse(rows, { delimiter: ';' });
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Classements_par_salle_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportRankingsPDF = () => {
    if (!rankings.length) {
      alert('Aucun classement à exporter.');
      return;
    }

    const docPdf = new jsPDF();
    docPdf.setFontSize(14);
    docPdf.text('Classements par salle', 14, 14);
    docPdf.setFontSize(9);
    docPdf.text(`Généré le ${new Date().toLocaleString('fr-FR')} • QCM App`, 14, 21);

    const body = [];
    rankings.forEach((group) => {
      body.push([
        {
          content: `${group.salle} · ${group.ue} — ${sessionLabel(group.sessionTimestamp)} (${group.count} étudiant(s))`,
          colSpan: 6,
          styles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold' }
        }
      ]);
      group.participants.forEach((p) => {
        body.push([
          p.rank,
          p.name,
          `${p.score}/${p.total}`,
          Number(p.note).toFixed(2),
          p.isMakeup ? 'Rattrapage' : 'Régulier',
          p.attempts
        ]);
      });
    });

    docPdf.autoTable({
      startY: 28,
      head: [['Rang', 'Étudiant', 'Score', 'Note /20', 'Type', 'Tentatives']],
      body,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [30, 58, 138] }
    });
    docPdf.save(`Classements_par_salle_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  // ─── Sauvegardes SQLite ──────────────────────────────────────────────
  const createBackupNow = async () => {
    setCreatingBackup(true);
    try {
      await api('/admin/backups', { method: 'POST', auth: 'admin' });
      await fetchBackups();
    } catch (err) {
      alert(`Sauvegarde impossible : ${err.message}`);
    } finally {
      setCreatingBackup(false);
    }
  };

  const downloadBackup = async (name) => {
    try {
      const res = await fetch(`/api/admin/backups/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${sessionStorage.getItem('adminToken') || ''}` }
      });
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(`Téléchargement impossible : ${err.message}`);
    }
  };

  const removeBackup = async (name) => {
    if (!confirm(`Supprimer la sauvegarde ${name} ?`)) return;
    try {
      await api(`/admin/backups/${encodeURIComponent(name)}`, { method: 'DELETE', auth: 'admin' });
      await fetchBackups();
    } catch (err) {
      alert(`Suppression impossible : ${err.message}`);
    }
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
    location.href = ADMIN_LOGIN_PATH;
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
    if (!resultsList.length) return { count: 0, average: '-', best: '-' };
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
    const matchFaculte = !studentFilterFaculte || s.faculte === studentFilterFaculte;
    const matchFiliere = !studentFilterFiliere || s.filiere === studentFilterFiliere;
    const matchNiveau = !studentFilterNiveau || s.niveau === studentFilterNiveau;
    return matchText && matchFaculte && matchFiliere && matchNiveau;
  });

  const filteredHistory = useMemo(() => {
    const term = quizFilters.search.trim().toLowerCase();
    return [...history]
      .filter(q => {
        const matchesTerm = !term ||
          String(q.title || '').toLowerCase().includes(term) ||
          String(q.ue || '').toLowerCase().includes(term) ||
          String(q.id || '').toLowerCase().includes(term) ||
          String(q.filiere || '').toLowerCase().includes(term);
        const matchesSemestre = !quizFilters.semestre ||
          String(q.semestre || '') === quizFilters.semestre;
        const matchesFaculte = !quizFilters.faculte ||
          String(q.faculte || '').toUpperCase() === quizFilters.faculte.toUpperCase();
        const matchesFiliere = !quizFilters.filiere ||
          String(q.filiere || '').toLowerCase() === quizFilters.filiere.toLowerCase();
        return matchesTerm && matchesSemestre && matchesFaculte && matchesFiliere;
      })
      .sort((a, b) => (b.launchTime || 0) - (a.launchTime || 0));
  }, [history, quizFilters]);

  // Cible de l'import CSV (même calcul que le serveur) et questions remplacées.
  const importTargetTitle = quizTitle.trim() || ue.trim().toUpperCase();
  const importTargetId = quizIdFor(ue.trim().toUpperCase(), importTargetTitle);
  const importExisting = history.find(q => q.id === importTargetId) || null;
  const importReplacedCount = importExisting?.questionCount || 0;

  const quizFilterFacultes = useMemo(
    () => [...new Set(history.map(q => q.faculte).filter(Boolean))],
    [history]
  );

  // ══════════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex">
      {/* ── Barre latérale (desktop) ── */}
      <aside className="hidden lg:flex flex-col w-64 shrink-0 bg-slate-900 border-r border-slate-800 sticky top-0 h-screen">
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-800">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center font-black text-white text-sm">
            QA
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-black text-white leading-tight">Administration QCM</h1>
            <p className="text-[11px] text-slate-500">QCM App • Évaluation</p>
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
              QA
            </div>
            <div>
              <h1 className="text-sm font-black text-white leading-tight">Administration QCM</h1>
              <p className="text-[10px] text-slate-500">QCM App • Évaluation</p>
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
                              {q.filiere} · {q.niveau}
                            </span>
                            <h4 className="font-black text-white text-sm mt-1 truncate">{q.title || q.ue || q.id}</h4>
                            <p className="text-[11px] text-slate-500">
                              UE {q.ue || q.id} · Semestre {q.semestre || 1} • {q.questionCount || 0} questions
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
                              <h4 className="font-black text-white text-sm truncate">{q.title || q.ue || q.id}</h4>
                              <p className="text-[11px] text-slate-500">
                                {q.ue || q.id} · {q.filiere} • {q.niveau} · {formatDate(q.launchTime)}
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
                      Questions · {inspectQuizId} ({inspectQuestions.length})
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
                          {q.tags && (
                            <div className="flex items-center gap-1.5 flex-wrap mt-2">
                              {String(q.tags).split(/[;,]/).filter(Boolean).map(tag => (
                                <span key={tag} className="text-[10px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 px-2 py-0.5 rounded-full">
                                  {tag.trim()}
                                </span>
                              ))}
                            </div>
                          )}
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
                          {(q.explication || q.Explication) && (
                            <div className="mt-2.5 bg-indigo-950/40 border border-indigo-800/60 rounded-lg px-3 py-2">
                              <p className="text-[9px] font-black uppercase tracking-wider text-indigo-300 mb-0.5 flex items-center gap-1.5">
                                <Icon name="lightbulb" size={11} />
                                Explication
                              </p>
                              <p className="text-[11px] text-slate-300 leading-relaxed">{q.explication || q.Explication}</p>
                            </div>
                          )}
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
                      {editingQuizId ? 'Modifier une évaluation' : 'Programmer une évaluation'}
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Configurez la matière, la minuterie et les dates d'ouverture
                    </p>
                  </div>

                  {/* Sélecteur de test existant : modification ou nouvelle programmation */}
                  <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-3">
                    <label className={label}>Modifier un test existant</label>
                    <div className="flex gap-2 flex-wrap">
                      <select
                        className={selectCls + ' flex-1 min-w-48'}
                        value={editingQuizId}
                        onChange={e => {
                          const value = e.target.value;
                          if (!value) {
                            resetQuizForm();
                            return;
                          }
                          const quiz = history.find(q => q.id === value);
                          if (quiz) loadQuizForEdit(quiz);
                        }}
                      >
                        <option value="">➕ Nouveau test…</option>
                        {history.map(q => (
                          <option key={q.id} value={q.id}>
                            {q.title || q.ue || q.id} · {q.ue || q.id} · {q.filiere || '?'} {q.niveau || ''}
                          </option>
                        ))}
                      </select>
                      {editingQuizId && (
                        <button onClick={resetQuizForm} className={btnSecondary} type="button">
                          <Icon name="close" size={13} />
                          Nouveau
                        </button>
                      )}
                    </div>
                    {editingQuizId && (
                      <p className="text-[11px] text-amber-300 mt-2">
                        Modification du test <strong>{editingQuizId}</strong> : l'enregistrement met à jour ce test sans créer de doublon.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className={label}>Faculté</label>
                      <select
                        className={selectCls}
                        value={faculte}
                        onChange={e => {
                          const value = e.target.value;
                          setFaculte(value);
                          const next = filieresForFaculte(value)[0] || '';
                          setFiliere(next);
                        }}
                      >
                        {facultes.length === 0 && <option value="">Chargement…</option>}
                        {facultes.map(f => (
                          <option key={f.id} value={f.id}>{f.label || f.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Filière</label>
                      <select className={selectCls} value={filiere} onChange={e => setFiliere(e.target.value)}>
                        {filieres.length === 0 && <option value="">Aucune filière</option>}
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

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className={label}>Nom du test</label>
                      <input
                        type="text"
                        className={input}
                        placeholder="Ex. Test 1, Contrôle continu, Rattrapage…"
                        value={quizTitle}
                        onChange={e => setQuizTitle(e.target.value)}
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Deux tests différents peuvent porter sur la même UE. Donnez-leur un nom
                        distinct (Test 1, Test 2…) pour les retrouver facilement.
                      </p>
                      {(() => {
                        const code = ue.trim().toUpperCase();
                        if (!code) return null;
                        const existingTests = history.filter(
                          q => String(q.ue || q.id).toUpperCase() === code
                        );
                        if (!existingTests.length) return null;
                        return (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            <span className="text-[10px] font-bold text-slate-500 self-center">
                              Tests existants :
                            </span>
                            {existingTests.map(q => (
                              <span
                                key={q.id}
                                className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
                                title={`${q.id} · ${q.filiere || '?'} ${q.niveau || ''}`}
                              >
                                {q.title || q.id} · {formatDate(q.launchTime)}
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div>
                      <label className={label}>Unité d'enseignement</label>
                      <select
                        className={selectCls}
                        value={manualUe ? '__manual__' : ue}
                        onChange={e => {
                          const value = e.target.value;
                          if (value === '__manual__') {
                            setManualUe(true);
                            setUe('');
                            return;
                          }
                          setManualUe(false);
                          setUe(value);
                          // La faculté, la filière et le niveau sont hérités du catalogue UE
                          const info = allUes.find(u => (u.code || u.id) === value);
                          if (info) {
                            if (info.faculte) setFaculte(info.faculte);
                            if (info.filiere) setFiliere(info.filiere);
                            if (info.niveau) setNiveau(info.niveau);
                          }
                          // Propose automatiquement le prochain nom de test
                          // (Test 1, Test 2…) pour éviter d'écraser un test existant.
                          const code = String(value).toUpperCase();
                          const existingTests = history.filter(q => {
                            const qUe = String(q.ue || q.id).toUpperCase();
                            return qUe === code && String(q.title || '').toUpperCase() !== code;
                          });
                          const numbers = existingTests
                            .map(q => {
                              const match = String(q.title || '').match(/Test\s*(\d+)/i);
                              return match ? Number(match[1]) : 0;
                            })
                            .filter(n => n > 0);
                          const nextNumber = numbers.length
                            ? Math.max(...numbers) + 1
                            : existingTests.length + 1;
                          setQuizTitle(prev => (prev.trim()
                            ? prev
                            : (existingTests.length ? `Test ${nextNumber}` : '')));
                        }}
                      >
                        <option value="">Sélectionner une UE…</option>
                        {allUes
                          .filter(u => !faculte || u.faculte === faculte)
                          .map(u => (
                            <option key={u.id} value={u.code || u.id}>
                              {(u.code || u.id)} · {u.label} ({u.filiere} {u.niveau})
                            </option>
                          ))}
                        {ue && !allUes.some(u => (u.code || u.id) === ue) && (
                          <option value={ue}>{ue} (hors catalogue)</option>
                        )}
                        <option value="__manual__">Saisie manuelle…</option>
                      </select>
                      {manualUe && (
                        <input
                          type="text"
                          placeholder="INF232"
                          className={`${input} mt-2`}
                          value={ue}
                          onChange={e => setUe(e.target.value)}
                        />
                      )}
                      {allUes.length === 0 && !manualUe && (
                        <p className="text-[11px] text-amber-400 mt-1">
                          Catalogue vide : ajoutez d'abord une UE dans la section « Unités d'enseignement ».
                        </p>
                      )}
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
                    <div>
                      <label className={label}>Questions par tentative</label>
                      <input
                        type="number"
                        min="0"
                        placeholder="0 = toutes"
                        className={input}
                        value={drawCount}
                        onChange={e => setDrawCount(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Ouverture de l'épreuve (obligatoire)</label>
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
                    {editingQuizId ? 'Mettre à jour ce test' : 'Enregistrer la programmation'}
                  </button>
                  {editingQuizId && (
                    <button onClick={resetQuizForm} className={btnSecondary + ' w-full justify-center'}>
                      <Icon name="close" size={13} />
                      Annuler la modification
                    </button>
                  )}
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

                  <div className="bg-blue-950/40 border border-blue-900/50 rounded-xl p-3 text-[11px] text-blue-200 leading-relaxed space-y-1.5">
                    <p className="font-black uppercase tracking-wider text-[10px] text-blue-300">
                      Destination de l'import
                    </p>
                    {importTargetId ? (
                      <>
                        <p>
                          Test ciblé : <strong className="text-white">{importTargetTitle || importTargetId}</strong>
                          {' '}(<span className="font-mono">{importTargetId}</span>)
                        </p>
                        <p>
                          {importReplacedCount > 0
                            ? `⚠ ${importReplacedCount} question(s) existante(s) seront remplacées.`
                            : 'Aucune question existante : le test sera créé avec ces questions.'}
                        </p>
                        {importExisting && (
                          <p className="text-blue-300/80">
                            Test existant · {importExisting.filiere || '?'} {importExisting.niveau || ''}
                            {importExisting.semestre ? ` · S${importExisting.semestre}` : ''}
                          </p>
                        )}
                      </>
                    ) : (
                      <p>Sélectionnez une UE (et éventuellement un nom de test) ci-contre.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Liste des évaluations */}
              <div className={`${card} overflow-hidden`}>
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Icon name="list" size={15} className="text-blue-400" />
                      Tous les tests ({filteredHistory.length}/{history.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Inspectez, modifiez, dupliquez ou supprimez un test · plusieurs tests par UE sont possibles
                    </p>
                  </div>
                  <button onClick={fetchHistory} className={btnSecondary}>
                    <Icon name="refresh" size={13} />
                    Actualiser
                  </button>
                </div>

                {/* Filtres de la liste */}
                <div className="px-6 py-3 border-b border-slate-800 bg-slate-950/40 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">
                      <Icon name="search" size={13} />
                    </span>
                    <input
                      type="text"
                      placeholder="Rechercher un test, une UE…"
                      className={input + ' pl-9'}
                      value={quizFilters.search}
                      onChange={e => setQuizFilters(f => ({ ...f, search: e.target.value }))}
                    />
                  </div>
                  <select
                    className={selectCls}
                    value={quizFilters.semestre}
                    onChange={e => setQuizFilters(f => ({ ...f, semestre: e.target.value }))}
                  >
                    <option value="">Tous les semestres</option>
                    <option value="1">Semestre 1</option>
                    <option value="2">Semestre 2</option>
                  </select>
                  <select
                    className={selectCls}
                    value={quizFilters.faculte}
                    onChange={e => setQuizFilters(f => ({ ...f, faculte: e.target.value, filiere: '' }))}
                  >
                    <option value="">Toutes les facultés</option>
                    {quizFilterFacultes.map(fac => (
                      <option key={fac} value={fac}>{fac}</option>
                    ))}
                  </select>
                  <select
                    className={selectCls}
                    value={quizFilters.filiere}
                    onChange={e => setQuizFilters(f => ({ ...f, filiere: e.target.value }))}
                  >
                    <option value="">Toutes les filières</option>
                    {[...new Set(
                      history
                        .filter(q => !quizFilters.faculte || String(q.faculte || '').toUpperCase() === quizFilters.faculte.toUpperCase())
                        .map(q => q.filiere)
                        .filter(Boolean)
                    )].map(fil => (
                      <option key={fil} value={fil}>{fil}</option>
                    ))}
                  </select>
                </div>

                {history.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    Aucune évaluation enregistrée. Programmez la première ci-dessus.
                  </p>
                ) : filteredHistory.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    Aucun test ne correspond à ces filtres.
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
                                {q.filiere || '-'} · {q.niveau || '-'}
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
                            <h4 className="font-black text-white text-base mt-1">
                              {q.title || q.ue || q.id}
                              {editingQuizId === q.id && (
                                <span className="ml-2 text-[10px] font-black text-amber-300 bg-amber-500/15 border border-amber-600/30 px-2 py-0.5 rounded-full align-middle">
                                  en cours d'édition
                                </span>
                              )}
                            </h4>
                            <p className="text-[11px] text-slate-500">
                              UE {q.ue || q.id} · {q.questionCount || 0} questions{q.drawCount ? ` • ${q.drawCount} tirées/étudiant` : ''} • {q.timePerQuestion || 60}s/question •
                              Ouverture : {formatDate(q.launchTime)}
                              {q.endTime ? ` • Clôture : ${formatDate(q.endTime)}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                            <button
                              onClick={() => loadQuizForEdit(q)}
                              title="Modifier la programmation de ce test"
                              className={btnSecondary}
                            >
                              <Icon name="edit" size={13} />
                              Modifier
                            </button>
                            <button
                              onClick={() => duplicateQuiz(q)}
                              disabled={duplicatingId === q.id}
                              title="Créer une copie de ce test (questions incluses)"
                              className={btnSecondary}
                            >
                              <Icon name="copy" size={13} />
                              {duplicatingId === q.id ? 'Copie…' : 'Dupliquer'}
                            </button>
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

          {/* ════════════ ANALYTIQUE ════════════ */}
          {activeSection === 'analytics' && (
            <div className="space-y-6">
              <div className={`${card} p-4`}>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-end">
                  <div>
                    <label className={label}>Faculté</label>
                    <select
                      className={selectCls}
                      value={analyticsFilters.faculte}
                      onChange={e => {
                        setLoadingAnalytics(true);
                        setAnalyticsFilters(prev => ({ ...prev, faculte: e.target.value, filiere: '' }));
                      }}
                    >
                      <option value="">Toutes les facultés</option>
                      {facultes.map(f => (
                        <option key={f.id} value={f.id}>{f.label || f.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Filière</label>
                    <select
                      className={selectCls}
                      value={analyticsFilters.filiere}
                      onChange={e => {
                        setLoadingAnalytics(true);
                        setAnalyticsFilters(prev => ({ ...prev, filiere: e.target.value }));
                      }}
                    >
                      <option value="">Toutes les filières</option>
                      {filieresForFaculte(analyticsFilters.faculte).map(f => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Niveau</label>
                    <select
                      className={selectCls}
                      value={analyticsFilters.niveau}
                      onChange={e => {
                        setLoadingAnalytics(true);
                        setAnalyticsFilters(prev => ({ ...prev, niveau: e.target.value }));
                      }}
                    >
                      <option value="">Tous les niveaux</option>
                      {niveaux.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() => {
                      setLoadingAnalytics(true);
                      setAnalyticsFilters({ faculte: '', filiere: '', niveau: '' });
                    }}
                    className={btnSecondary + ' justify-center'}
                  >
                    <Icon name="refresh" size={13} />
                    Réinitialiser
                  </button>
                </div>
              </div>

              {loadingAnalytics ? (
                <div className={`${card} p-10 text-center text-slate-500 text-xs animate-pulse`}>
                  Chargement de l'analytique…
                </div>
              ) : !analytics ? (
                <div className={`${card} p-10 text-center text-slate-500 text-xs`}>
                  Aucune donnée analytique disponible pour le moment.
                </div>
              ) : (
                <>
                  {/* Indicateurs clés */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      {
                        label: 'Copies corrigées',
                        value: analytics.totals.results,
                        suffix: '',
                        color: 'text-white'
                      },
                      {
                        label: 'Étudiants actifs',
                        value: analytics.totals.students,
                        suffix: '',
                        color: 'text-blue-400'
                      },
                      {
                        label: 'Moyenne générale',
                        value: analytics.totals.averageNote,
                        suffix: '/20',
                        color: 'text-emerald-400'
                      },
                      {
                        label: 'Taux de réussite',
                        value: analytics.totals.successRate,
                        suffix: '%',
                        color: 'text-amber-400'
                      }
                    ].map((item) => (
                      <div key={item.label} className={`${card} p-5`}>
                        <div className={`text-3xl font-black leading-none ${item.color}`}>
                          {item.value}
                          <span className="text-sm text-slate-500 font-bold">{item.suffix}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1.5 font-bold uppercase tracking-wider">
                          {item.label}
                        </div>
                      </div>
                    ))}
                  </div>

                  {analytics.totals.answered > 0 && (
                    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-3">
                        <span className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 flex items-center justify-center shrink-0">
                          <Icon name="alert" size={18} />
                        </span>
                        <div>
                          <p className="text-sm font-black text-white">
                            {analytics.totals.errorRate}% de réponses erronées
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {analytics.totals.correct} bonnes réponses sur {analytics.totals.answered} réponses analysées
                          </p>
                        </div>
                      </div>
                      <button onClick={() => fetchAnalytics(analyticsFilters)} className={btnSecondary}>
                        <Icon name="refresh" size={13} />
                        Actualiser
                      </button>
                    </div>
                  )}

                  {/* Questions les plus ratées */}
                  <div className={`${card} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <Icon name="alert" size={15} className="text-red-400" />
                          Questions les plus ratées
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Classement par taux d'échec sur l'ensemble des copies corrigées
                        </p>
                      </div>
                      <button onClick={() => fetchAnalytics(analyticsFilters)} className={btnSecondary}>
                        <Icon name="refresh" size={13} />
                        Actualiser
                      </button>
                    </div>

                    {analytics.mostMissed.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-10">
                        Aucune réponse enregistrée pour l'instant. Les statistiques apparaîtront après les premières évaluations.
                      </p>
                    ) : (
                      <div className="divide-y divide-slate-800">
                        {analytics.mostMissed.map((q, i) => (
                          <div key={`${q.questionId}-${i}`} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-3">
                            <span className="shrink-0 w-7 h-7 rounded-lg bg-red-500/15 text-red-300 border border-red-500/30 text-xs font-black flex items-center justify-center">
                              {i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-slate-200 leading-relaxed">{q.question}</p>
                              <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                                <span className="text-[10px] font-bold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full">
                                  {q.ue}
                                </span>
                                {q.tags && String(q.tags).split(/[;,]/).filter(Boolean).map(tag => (
                                  <span key={tag} className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full">
                                    {tag.trim()}
                                  </span>
                                ))}
                                <span className="text-[10px] text-slate-500">
                                  {q.wrong}/{q.attempts} échec(s)
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 w-full md:w-40">
                              <div className="flex items-center justify-between text-[10px] font-bold mb-1">
                                <span className="text-slate-500">Taux d'échec</span>
                                <span className="text-red-300">{q.wrongRate}%</span>
                              </div>
                              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${q.wrongRate >= 60 ? 'bg-red-500' : q.wrongRate >= 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                  style={{ width: `${Math.min(100, q.wrongRate)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid lg:grid-cols-2 gap-4 items-start">
                    {/* Réussite par UE */}
                    <div className={`${card} p-6`}>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Icon name="book" size={15} className="text-blue-400" />
                        Réussite par UE
                      </h3>
                      {analytics.byUe.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-6">Aucune donnée par UE.</p>
                      ) : (
                        <div className="space-y-3">
                          {analytics.byUe.map((u) => (
                            <div key={u.ue} className="bg-slate-950 border border-slate-800 rounded-xl p-3.5">
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <span className="text-xs font-black text-white">{u.ue}</span>
                                <span className="text-[11px] font-bold text-slate-400">
                                  {u.averageNote}/20 · {u.successRate}% de réussite
                                </span>
                              </div>
                              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${u.successRate >= 70 ? 'bg-emerald-500' : u.successRate >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                                  style={{ width: `${Math.min(100, u.successRate)}%` }}
                                />
                              </div>
                              <p className="text-[10px] text-slate-500 mt-1.5">
                                {u.attempts} copie(s) · {u.students} étudiant(s)
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Évolution des notes */}
                    <div className={`${card} p-6`}>
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2 mb-4">
                        <Icon name="chart" size={15} className="text-emerald-400" />
                        Évolution des notes
                      </h3>
                      {analytics.evolution.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-6">Aucune évaluation enregistrée.</p>
                      ) : (
                        <>
                          <div className="flex items-end gap-1.5 h-40 bg-slate-950 border border-slate-800 rounded-xl p-3">
                            {analytics.evolution.map((d) => {
                              const pct = Math.max(4, Math.round((d.averageNote / 20) * 100));
                              return (
                                <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1 group">
                                  <span className="text-[9px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition">
                                    {d.averageNote}
                                  </span>
                                  <div
                                    className={`w-full rounded-t ${pct >= 50 ? 'bg-emerald-500/70' : 'bg-amber-500/70'}`}
                                    style={{ height: `${pct}%` }}
                                    title={`${d.date} · ${d.averageNote}/20 (${d.attempts} copie(s))`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2">
                            <span>{analytics.evolution[0]?.date}</span>
                            <span>{analytics.evolution[analytics.evolution.length - 1]?.date}</span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-3 text-xs text-slate-400 leading-relaxed">
                    <Icon name="info" size={16} className="text-blue-400 mt-0.5 shrink-0" />
                    <p>
                      Les statistiques sont calculées côté serveur à partir des copies réellement corrigées.
                      Le taux d'échec d'une question permet d'identifier les notions à retravailler en cours
                      et alimente les révisions intelligentes des étudiants.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ════════════ TUTEUR IA · REQUÊTES & TOKENS ════════════ */}
          {activeSection === 'ai' && (
            <div className="space-y-6">
              {loadingAi ? (
                <div className={`${card} p-10 text-center text-slate-500 text-xs animate-pulse`}>
                  Chargement de la consommation du tuteur IA…
                </div>
              ) : !aiUsage ? (
                <div className={`${card} p-10 text-center text-slate-500 text-xs`}>
                  Données de consommation indisponibles pour le moment.
                </div>
              ) : (
                <>
                  {/* Budget mensuel */}
                  <div className={`${card} p-6`}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-start gap-3">
                        <div className="w-11 h-11 rounded-2xl bg-purple-500/15 border border-purple-500/30 text-purple-400 flex items-center justify-center shrink-0">
                          <Icon name="sparkles" size={20} />
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">Budget de tokens du tuteur IA</h3>
                          <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                            Budget mensuel configurable via <span className="font-mono text-slate-300">AI_TOKEN_BUDGET</span>,
                            comparé aux tokens réellement annoncés par les fournisseurs.
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setLoadingAi(true);
                          fetchAiUsage();
                        }}
                        className={btnSecondary}
                      >
                        <Icon name="refresh" size={13} />
                        Actualiser
                      </button>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
                      {[
                        {
                          label: 'Budget mensuel',
                          value: aiUsage.budget.monthlyTokens > 0
                            ? formatTokens(aiUsage.budget.monthlyTokens)
                            : 'Illimité',
                          sub: aiUsage.budget.monthlyTokens > 0 ? 'tokens' : 'aucun plafond',
                          color: 'text-white'
                        },
                        {
                          label: 'Consommés ce mois',
                          value: formatTokens(aiUsage.budget.usedTokens),
                          sub: aiUsage.budget.usedPercent === null
                            ? 'budget illimité'
                            : `${aiUsage.budget.usedPercent}% du budget`,
                          color: 'text-blue-400'
                        },
                        {
                          label: 'Tokens restants',
                          value: aiUsage.budget.remainingTokens === null
                            ? 'Illimité'
                            : formatTokens(aiUsage.budget.remainingTokens),
                          sub: aiUsage.budget.remainingTokens === null ? 'aucun plafond' : 'ce mois-ci',
                          color: aiUsage.budget.remainingTokens !== null && aiUsage.budget.usedPercent >= 90
                            ? 'text-red-400'
                            : 'text-emerald-400'
                        },
                        {
                          label: 'Requêtes ce mois',
                          value: formatNumber(aiUsage.month.requests),
                          sub: `${formatNumber(aiUsage.today.requests)} aujourd'hui · ${formatNumber(aiUsage.month.quotaBlocked)} refus`,
                          color: 'text-amber-400'
                        }
                      ].map((item) => (
                        <div key={item.label} className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                          <div className={`text-2xl font-black leading-none ${item.color}`}>{item.value}</div>
                          <div className="text-[10px] text-slate-500 mt-1.5 font-bold uppercase tracking-wider">
                            {item.label}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">{item.sub}</div>
                        </div>
                      ))}
                    </div>

                    {aiUsage.budget.monthlyTokens > 0 ? (
                      <div className="mt-5">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                          <span>Consommation du budget mensuel</span>
                          <span>
                            {formatNumber(aiUsage.budget.usedTokens)} / {formatNumber(aiUsage.budget.monthlyTokens)} tokens
                          </span>
                        </div>
                        <div className="h-2.5 bg-slate-950 border border-slate-800 rounded-full overflow-hidden mt-1.5">
                          <div
                            className={`h-full transition-all ${
                              aiUsage.budget.usedPercent >= 90
                                ? 'bg-red-500'
                                : aiUsage.budget.usedPercent >= 70
                                  ? 'bg-amber-500'
                                  : 'bg-blue-500'
                            }`}
                            style={{ width: `${Math.min(100, aiUsage.budget.usedPercent || 0)}%` }}
                          />
                        </div>
                        {aiUsage.budget.remainingTokens === 0 && (
                          <p className="text-[11px] text-red-400 font-bold mt-2 flex items-center gap-1.5">
                            <Icon name="alert" size={13} />
                            Budget mensuel épuisé : augmentez AI_TOKEN_BUDGET ou attendez le mois suivant.
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 mt-5 flex items-center gap-1.5">
                        <Icon name="info" size={13} className="text-blue-400" />
                        Budget illimité (AI_TOKEN_BUDGET = 0). La consommation reste suivie ci-dessous.
                      </p>
                    )}
                  </div>

                  {/* Consommation quotidienne */}
                  <div className={`${card} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <Icon name="chart" size={15} className="text-blue-400" />
                          Consommation des 30 derniers jours
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Tokens consommés par jour · cette semaine : {formatTokens(aiUsage.week.tokens)} tokens
                        </p>
                      </div>
                    </div>

                    {aiUsage.byDay.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-10">
                        Aucune requête enregistrée sur les 30 derniers jours.
                      </p>
                    ) : (() => {
                      const maxTokens = Math.max(1, ...aiUsage.byDay.map((d) => d.tokens));
                      return (
                        <div className="p-6">
                          <div className="flex items-end gap-1.5 h-40">
                            {aiUsage.byDay.map((d) => (
                              <div
                                key={d.date}
                                className="flex-1 min-w-[8px] flex flex-col items-center justify-end h-full"
                                title={`${new Date(d.date).toLocaleDateString('fr-FR')} · ${formatNumber(d.requests)} requête(s) · ${formatNumber(d.tokens)} tokens`}
                              >
                                <div
                                  className="w-full rounded-t bg-blue-500/70 hover:bg-blue-400 transition-colors"
                                  style={{ height: `${Math.max(3, (d.tokens / maxTokens) * 100)}%` }}
                                />
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500 mt-2">
                            <span>{new Date(aiUsage.byDay[0].date).toLocaleDateString('fr-FR')}</span>
                            <span>{new Date(aiUsage.byDay[aiUsage.byDay.length - 1].date).toLocaleDateString('fr-FR')}</span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  <div className="grid lg:grid-cols-2 gap-4">
                    {/* Étudiants les plus consommateurs */}
                    <div className={`${card} overflow-hidden`}>
                      <div className="px-6 py-4 border-b border-slate-800">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <Icon name="users" size={15} className="text-purple-400" />
                          Étudiants les plus consommateurs
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">Sur le mois en cours</p>
                      </div>
                      {aiUsage.topUsers.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-10">
                          Aucune requête étudiante ce mois-ci.
                        </p>
                      ) : (
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                              <th className="py-2.5 px-4 text-left">Étudiant</th>
                              <th className="py-2.5 px-4 text-right">Requêtes</th>
                              <th className="py-2.5 px-4 text-right">Tokens</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {aiUsage.topUsers.map((u) => (
                              <tr key={u.email || u.name} className="hover:bg-slate-950/60 transition">
                                <td className="py-2.5 px-4">
                                  <div className="font-bold text-slate-200">{u.name}</div>
                                  {u.email && <div className="text-[10px] text-slate-500">{u.email}</div>}
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-300 font-bold">{formatNumber(u.requests)}</td>
                                <td className="py-2.5 px-4 text-right text-blue-300 font-bold">{formatTokens(u.tokens)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>

                    {/* Questions les plus travaillées */}
                    <div className={`${card} overflow-hidden`}>
                      <div className="px-6 py-4 border-b border-slate-800">
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <Icon name="chat" size={15} className="text-amber-400" />
                          Questions les plus travaillées
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">Contextes ayant consommé le plus de tokens</p>
                      </div>
                      {aiUsage.topContexts.length === 0 ? (
                        <p className="text-xs text-slate-500 text-center py-10">
                          Aucun contexte enregistré ce mois-ci.
                        </p>
                      ) : (
                        <div className="divide-y divide-slate-800">
                          {aiUsage.topContexts.map((c) => (
                            <div key={c.contextKey} className="px-6 py-3 flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-200 truncate">
                                  {formatContextKey(c.contextKey)}
                                </p>
                                <p className="text-[10px] text-slate-500 mt-0.5">
                                  {formatNumber(c.requests)} requête(s)
                                </p>
                              </div>
                              <span className="shrink-0 text-[11px] font-black text-amber-300">
                                {formatTokens(c.tokens)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Dernières requêtes */}
                  <div className={`${card} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-slate-800">
                      <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                        <Icon name="clock" size={15} className="text-slate-400" />
                        Dernières requêtes
                      </h3>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Succès, erreurs fournisseur et refus de quota, avec les tokens consommés
                      </p>
                    </div>

                    {aiUsage.recent.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-10">
                        Aucune requête enregistrée pour le moment.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                              <th className="py-2.5 px-4 text-left">Date</th>
                              <th className="py-2.5 px-4 text-left">Étudiant</th>
                              <th className="py-2.5 px-4 text-left">Contexte</th>
                              <th className="py-2.5 px-4 text-left">Statut</th>
                              <th className="py-2.5 px-4 text-right">Tokens</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {aiUsage.recent.map((r) => {
                              const status = AI_STATUS_LABELS[r.status] || AI_STATUS_LABELS.ok;
                              return (
                                <tr key={r.id} className="hover:bg-slate-950/60 transition">
                                  <td className="py-2.5 px-4 text-slate-500 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                                  <td className="py-2.5 px-4">
                                    <div className="font-bold text-slate-200">{r.name}</div>
                                    {r.email && <div className="text-[10px] text-slate-500">{r.email}</div>}
                                  </td>
                                  <td className="py-2.5 px-4 text-slate-400">{formatContextKey(r.contextKey)}</td>
                                  <td className="py-2.5 px-4">
                                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${status.cls}`}>
                                      {status.label}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-bold text-slate-300">
                                    {formatNumber(r.tokens)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              )}
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
                      <label className={label}>Faculté</label>
                      <select
                        className={selectCls}
                        value={newUeFaculte}
                        onChange={e => {
                          const value = e.target.value;
                          setNewUeFaculte(value);
                          setNewUeFiliere(filieresForFaculte(value)[0] || '');
                        }}
                      >
                        {facultes.length === 0 && <option value="">Chargement…</option>}
                        {facultes.map(f => (
                          <option key={f.id} value={f.id}>{f.label || f.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Filière</label>
                      <select
                        className={selectCls}
                        value={newUeFiliere}
                        onChange={e => setNewUeFiliere(e.target.value)}
                      >
                        {filieresForFaculte(newUeFaculte).length === 0 && (
                          <option value="">Aucune filière</option>
                        )}
                        {filieresForFaculte(newUeFaculte).map(f => (
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
                    <div>
                      <label className={label}>Semestre</label>
                      <select
                        className={selectCls}
                        value={newUeSemestre}
                        onChange={e => setNewUeSemestre(e.target.value)}
                      >
                        <option value="1">Semestre 1</option>
                        <option value="2">Semestre 2</option>
                      </select>
                    </div>
                  </div>
                  <button onClick={addUe} className={btnPrimary}>
                    <Icon name="plus" size={14} strokeWidth={3} />
                    Ajouter l'UE
                  </button>
                </div>

                {/* Parcours du catalogue */}
                <div className={`${card} p-6 space-y-5`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="graduation" size={15} className="text-blue-400" />
                      Parcours du catalogue
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Facultés et filières proposées aux étudiants
                    </p>
                  </div>

                  <div className="space-y-2">
                    {facultes.length === 0 ? (
                      <p className="text-xs text-slate-500">Aucune faculté au catalogue.</p>
                    ) : (
                      facultes.map((fac) => {
                        const list = catalogFilieres.filter(f => f.faculte === fac.id);
                        return (
                          <div key={fac.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                              <span className="text-xs font-black text-white">{fac.label || fac.id}</span>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                {list.length} filière(s)
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {list.map(f => (
                                <span
                                  key={f.id}
                                  className="text-[10px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 px-2 py-0.5 rounded-full"
                                >
                                  {f.label}
                                </span>
                              ))}
                              {list.length === 0 && (
                                <span className="text-[10px] text-slate-500">Aucune filière</span>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
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

                  <button
                    onClick={() => setActiveSection('catalogue')}
                    className={btnPrimary}
                  >
                    <Icon name="graduation" size={14} />
                    Gérer les facultés & filières
                  </button>
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
                    {allUes.map(u => {
                      const linkedQuiz = history.find(
                        q => (q.ue || q.id) === (u.code || u.id) || q.id === u.id
                      );
                      return (
                        <div key={u.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-black text-white text-sm">{u.code}</span>
                              {u.faculte && (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                  {u.faculte}
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full">
                                {u.filiere}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                                {u.niveau}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                u.semestre
                                  ? 'text-emerald-300 bg-emerald-600/15'
                                  : 'text-slate-500 bg-slate-800'
                              }`}>
                                {u.semestre ? `S${u.semestre}` : 'Tous semestres'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-0.5 truncate">{u.label || u.code}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {linkedQuiz?.launchTime ? (
                              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-600/15 border border-emerald-600/30 px-2 py-1 rounded-full">
                                Épreuve : {formatDate(linkedQuiz.launchTime)}
                              </span>
                            ) : linkedQuiz ? (
                              <span className="text-[10px] font-bold text-amber-300 bg-amber-600/15 border border-amber-600/30 px-2 py-1 rounded-full">
                                Épreuve non programmée
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-1 rounded-full">
                                Sans épreuve
                              </span>
                            )}
                            <button
                              onClick={() => deleteUe(u.id)}
                              aria-label={`Supprimer l'UE ${u.code}`}
                              className="w-8 h-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition shrink-0"
                            >
                              <Icon name="trash" size={14} />
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
                  value={studentFilterFaculte}
                  onChange={e => {
                    setStudentFilterFaculte(e.target.value);
                    setStudentFilterFiliere('');
                  }}
                >
                  <option value="">Toutes facultés</option>
                  {facultes.map(f => (
                    <option key={f.id} value={f.id}>{f.label || f.id}</option>
                  ))}
                </select>
                <select
                  className={selectCls + ' w-auto min-w-40'}
                  value={studentFilterFiliere}
                  onChange={e => setStudentFilterFiliere(e.target.value)}
                >
                  <option value="">Toutes filières</option>
                  {filieresForFaculte(studentFilterFaculte).map(f => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                <select
                  className={selectCls + ' w-auto min-w-32'}
                  value={studentFilterNiveau}
                  onChange={e => setStudentFilterNiveau(e.target.value)}
                >
                  <option value="">Tous niveaux</option>
                  {niveaux.map(n => (
                    <option key={n}>{n}</option>
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
                        <th className="py-2.5 px-4 text-left">Faculté</th>
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
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              {s.faculte || '-'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full font-bold">
                              {s.filiere}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-300 font-bold">{s.niveau}</td>
                          <td className="py-3 px-4 text-slate-400">{s.anneeAcademique || '-'}</td>
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
                      <option value="">· Sélectionner une évaluation ·</option>
                      {filteredHistory.map(q => (
                        <option key={q.id} value={q.id}>
                          {q.title || q.ue || q.id} · UE {q.ue || q.id} · {q.filiere || '?'} {q.niveau || ''} ({formatDate(q.launchTime)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={exportAllResultsCSV}
                      title="Exporter toutes les copies, toutes évaluations confondues"
                      className={btnSecondary}
                    >
                      <Icon name="download" size={13} />
                      Exporter tout
                    </button>
                    {resultsQuizId && (
                      <>
                        <button onClick={() => exportCSV(resultsQuizId)} className={btnSecondary}>
                          <Icon name="download" size={13} />
                          Exporter CSV
                        </button>
                        <button onClick={() => exportPDF(resultsQuizId)} className={btnPrimary}>
                          <Icon name="document" size={13} />
                          Procès-verbal PDF
                        </button>
                      </>
                    )}
                  </div>
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
                        Résultats · {history.find(q => q.id === resultsQuizId)?.title || resultsQuizId}
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
                                <td className="py-3 px-4 text-slate-400 font-mono">{r.email || '-'}</td>
                                <td className="py-3 px-4">
                                  <span className="text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full font-bold">
                                    {r.filiere || '-'}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right text-slate-300 font-bold">
                                  {r.score}/{r.total}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-blue-400">
                                  {r.total ? ((r.score / r.total) * 20).toFixed(2) : '-'}
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

          {/* ════════════ CLASSEMENTS PAR SALLE ════════════ */}
          {activeSection === 'rankings' && (
            <div className="space-y-6">
              <div className={`${card} p-6`}>
                <div className="grid md:grid-cols-4 gap-4">
                  <div>
                    <label className={label}>UE</label>
                    <select
                      className={selectCls}
                      value={rankingFilters.ue}
                      onChange={(e) => updateRankingFilter('ue', e.target.value)}
                    >
                      <option value="">Toutes les UE</option>
                      {allUes.map((u) => (
                        <option key={u.id} value={u.code || u.id}>
                          {(u.code || u.id)} · {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Faculté</label>
                    <select
                      className={selectCls}
                      value={rankingFilters.faculte}
                      onChange={(e) => {
                        updateRankingFilter('faculte', e.target.value);
                        updateRankingFilter('filiere', '');
                      }}
                    >
                      <option value="">Toutes les facultés</option>
                      {facultes.map((f) => (
                        <option key={f.id} value={f.id}>{f.label || f.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Filière</label>
                    <select
                      className={selectCls}
                      value={rankingFilters.filiere}
                      onChange={(e) => updateRankingFilter('filiere', e.target.value)}
                    >
                      <option value="">Toutes les filières</option>
                      {filieresForFaculte(rankingFilters.faculte).map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Niveau</label>
                    <select
                      className={selectCls}
                      value={rankingFilters.niveau}
                      onChange={(e) => updateRankingFilter('niveau', e.target.value)}
                    >
                      <option value="">Tous les niveaux</option>
                      {niveaux.map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 flex-wrap mt-5">
                  <p className="text-[11px] text-slate-500 max-w-xl leading-relaxed">
                    Une salle correspond à la classe de l'étudiant (filière + niveau). Chaque étudiant est
                    classé sur sa meilleure tentative, par épreuve et par session. Les exports reprennent
                    exactement les filtres appliqués.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={exportRankingsCSV}
                      disabled={!rankings.length}
                      className={btnSecondary + ' disabled:opacity-50'}
                    >
                      <Icon name="download" size={13} />
                      Exporter CSV
                    </button>
                    <button
                      onClick={exportRankingsPDF}
                      disabled={!rankings.length}
                      className={btnPrimary}
                    >
                      <Icon name="document" size={13} />
                      Exporter PDF
                    </button>
                  </div>
                </div>
              </div>

              {loadingRankings ? (
                <div className={`${card} p-10 text-center text-slate-500 text-xs animate-pulse`}>
                  Chargement des classements…
                </div>
              ) : rankings.length === 0 ? (
                <div className={`${card} p-10 text-center text-slate-500 text-xs`}>
                  Aucun classement trouvé pour ces filtres. Les classements apparaissent après les premières copies corrigées.
                </div>
              ) : (
                rankings.map((group) => (
                  <div key={group.key} className={`${card} overflow-hidden`}>
                    <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                          <Icon name="trophy" size={15} className="text-amber-400" />
                          {group.salle} · {group.ue}
                        </h3>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {sessionLabel(group.sessionTimestamp)} · {group.count} étudiant(s) classé(s)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold flex-wrap">
                        <span className="px-2 py-1 rounded-full bg-blue-600/15 text-blue-300 border border-blue-600/30">
                          Moyenne : {Number(group.averageNote).toFixed(2)}/20
                        </span>
                        <span className="px-2 py-1 rounded-full bg-emerald-600/15 text-emerald-300 border border-emerald-600/30">
                          Meilleure note : {Number(group.bestNote).toFixed(2)}/20
                        </span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                            <th className="py-2.5 px-4 text-left">Rang</th>
                            <th className="py-2.5 px-4 text-left">Étudiant</th>
                            <th className="py-2.5 px-4 text-right">Score</th>
                            <th className="py-2.5 px-4 text-right">Note /20</th>
                            <th className="py-2.5 px-4 text-left">Type</th>
                            <th className="py-2.5 px-4 text-right">Tentatives</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                          {group.participants.map((p) => {
                            const rankCls = p.rank === 1
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : p.rank === 2
                                ? 'bg-slate-400/20 text-slate-200 border-slate-400/40'
                                : p.rank === 3
                                  ? 'bg-orange-600/20 text-orange-300 border-orange-600/40'
                                  : 'bg-slate-800 text-slate-400 border-slate-700';
                            return (
                              <tr
                                key={`${group.key}-${p.name}-${p.rank}`}
                                className={p.isMe ? 'bg-blue-600/10' : 'hover:bg-slate-950/60 transition'}
                              >
                                <td className="py-2.5 px-4">
                                  <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg border text-[11px] font-black ${rankCls}`}>
                                    {p.rank}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4">
                                  <span className="font-bold text-slate-200">{p.name}</span>
                                  {p.isMe && (
                                    <span className="ml-2 text-[9px] font-black text-blue-300 bg-blue-600/20 border border-blue-600/40 px-1.5 py-0.5 rounded-full">
                                      Moi
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-4 text-right font-bold text-slate-300">{p.score}/{p.total}</td>
                                <td className="py-2.5 px-4 text-right font-black text-white">{Number(p.note).toFixed(2)}</td>
                                <td className="py-2.5 px-4">
                                  <span className={p.isMakeup ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                                    {p.isMakeup ? 'Rattrapage' : 'Régulier'}
                                  </span>
                                </td>
                                <td className="py-2.5 px-4 text-right text-slate-400">{p.attempts}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ════════════ FACULTÉS & FILIÈRES ════════════ */}
          {activeSection === 'catalogue' && (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-4 items-start">
                {/* Ajouter une faculté */}
                <div className={`${card} p-6 space-y-4`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="plus" size={15} className="text-blue-400" />
                      Ajouter une faculté
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Une faculté regroupe plusieurs filières et détermine la portée des données
                    </p>
                  </div>
                  <div>
                    <label className={label}>Nom de la faculté</label>
                    <input
                      type="text"
                      placeholder="Ex: Faculté des Sciences"
                      className={input}
                      value={newFaculteLabel}
                      onChange={e => setNewFaculteLabel(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={createFaculte}
                    disabled={catalogueBusy}
                    className={btnPrimary}
                  >
                    <Icon name="plus" size={14} strokeWidth={3} />
                    Ajouter la faculté
                  </button>
                </div>

                {/* Ajouter une filière */}
                <div className={`${card} p-6 space-y-4`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="graduation" size={15} className="text-blue-400" />
                      Ajouter une filière
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Les demandes en attente pour cette filière seront validées et notifiées
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Faculté</label>
                      <select
                        className={selectCls}
                        value={newCatalogueFiliere.faculte}
                        onChange={e => setNewCatalogueFiliere(prev => ({ ...prev, faculte: e.target.value }))}
                      >
                        {facultes.length === 0 && <option value="">Chargement…</option>}
                        {facultes.map(f => (
                          <option key={f.id} value={f.id}>{f.label || f.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Nom de la filière</label>
                      <input
                        type="text"
                        placeholder="Ex: Journalisme"
                        className={input}
                        value={newCatalogueFiliere.label}
                        onChange={e => setNewCatalogueFiliere(prev => ({ ...prev, label: e.target.value }))}
                      />
                    </div>
                  </div>
                  <button
                    onClick={createCatalogueFiliere}
                    disabled={catalogueBusy}
                    className={btnPrimary}
                  >
                    <Icon name="plus" size={14} strokeWidth={3} />
                    Ajouter la filière
                  </button>
                </div>
              </div>

              {/* Liste des facultés et filières */}
              <div className={`${card} overflow-hidden`}>
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Icon name="graduation" size={15} className="text-blue-400" />
                      Catalogue ({facultes.length} faculté(s))
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Chaque filière est rattachée à une seule faculté
                    </p>
                  </div>
                  <button onClick={fetchCatalogue} className={btnSecondary}>
                    <Icon name="refresh" size={13} />
                    Actualiser
                  </button>
                </div>

                {facultes.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    Aucune faculté enregistrée pour le moment.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {facultes.map(fac => {
                      const list = catalogFilieres.filter(f => f.faculte === fac.id);
                      return (
                        <div key={fac.id} className="px-6 py-4">
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-black text-white text-sm">{fac.label || fac.id}</span>
                                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                  {fac.id}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5">
                                {list.length} filière(s) · {fac.studentCount || 0} étudiant(s)
                              </p>
                            </div>
                            <button
                              onClick={() => deleteFaculte(fac.id)}
                              className="inline-flex items-center gap-1.5 border border-red-900/60 hover:border-red-700 text-red-400 hover:text-red-300 hover:bg-red-950/40 font-bold text-xs px-3 py-2 rounded-xl transition"
                            >
                              <Icon name="trash" size={13} />
                              Supprimer
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2 mt-3">
                            {list.map(f => (
                              <span
                                key={f.id}
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 pl-2.5 pr-1 py-1 rounded-full"
                              >
                                {f.label}
                                <span className="text-[10px] text-slate-400 font-normal">
                                  ({f.studentCount || 0})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => deleteCatalogueFiliere(f.id)}
                                  aria-label={`Supprimer la filière ${f.label}`}
                                  className="w-5 h-5 rounded-full text-blue-200/70 hover:text-red-300 hover:bg-red-950/60 flex items-center justify-center transition"
                                >
                                  <Icon name="close" size={11} />
                                </button>
                              </span>
                            ))}
                            {list.length === 0 && (
                              <span className="text-[11px] text-slate-500">
                                Aucune filière rattachée à cette faculté.
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ DEMANDES DE FILIÈRE ════════════ */}
          {activeSection === 'requests' && (
            <div className="space-y-4">
              <div className={`${card} p-4 flex items-center justify-between gap-3 flex-wrap`}>
                <div className="flex items-center gap-2">
                  <label className={`${label} mb-0`}>Statut</label>
                  <select
                    className={selectCls + ' w-auto min-w-40'}
                    value={requestStatusFilter}
                    onChange={e => {
                      setLoadingRequests(true);
                      setRequestStatusFilter(e.target.value);
                    }}
                  >
                    <option value="pending">En attente</option>
                    <option value="approved">Validées</option>
                    <option value="rejected">Rejetées</option>
                    <option value="">Toutes</option>
                  </select>
                </div>
                <button
                  onClick={() => {
                    setLoadingRequests(true);
                    fetchFiliereRequests(requestStatusFilter);
                  }}
                  className={btnSecondary}
                >
                  <Icon name="refresh" size={13} />
                  Actualiser
                </button>
              </div>

              {loadingRequests ? (
                <p className="text-xs text-slate-500 text-center py-10 animate-pulse">
                  Chargement des demandes…
                </p>
              ) : filiereRequests.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                  <Icon name="check-circle" size={24} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">
                    Aucune demande pour ce statut.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filiereRequests.map(request => {
                    const isPending = request.status === 'pending';
                    const statusCls = request.status === 'approved'
                      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      : request.status === 'rejected'
                        ? 'bg-red-500/15 text-red-300 border-red-500/30'
                        : 'bg-amber-500/15 text-amber-300 border-amber-500/30';
                    return (
                      <div key={request.id} className={`${card} p-5`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-black text-white">{request.filiere}</h3>
                              <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                                {request.faculte}
                              </span>
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusCls}`}>
                                {request.status === 'approved'
                                  ? 'Validée'
                                  : request.status === 'rejected'
                                    ? 'Rejetée'
                                    : 'En attente'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {request.name || 'Étudiant'} • {request.email || '-'} •{' '}
                              demande du {formatDate(request.createdAt)}
                            </p>
                            {request.note && (
                              <p className="text-[11px] text-slate-400 mt-1">Note : {request.note}</p>
                            )}
                          </div>
                        </div>

                        {isPending && (
                          <div className="mt-4 grid md:grid-cols-[1fr_auto] gap-2 items-center">
                            <input
                              type="text"
                              placeholder="Note interne ou motif (optionnel)"
                              className={input}
                              value={requestNotes[request.id] || ''}
                              onChange={e => setRequestNotes(prev => ({ ...prev, [request.id]: e.target.value }))}
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => approveFiliereRequest(request)}
                                className={btnPrimary}
                              >
                                <Icon name="check" size={14} strokeWidth={3} />
                                Valider
                              </button>
                              <button
                                onClick={() => rejectFiliereRequest(request)}
                                className="inline-flex items-center gap-1.5 border border-red-900/60 hover:border-red-700 text-red-400 hover:text-red-300 hover:bg-red-950/40 font-bold text-xs px-3 py-2 rounded-xl transition"
                              >
                                <Icon name="close" size={13} />
                                Rejeter
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ════════════ DEMANDES DE QCM ════════════ */}
          {activeSection === 'quiz-requests' && (
            <div className="space-y-4">
              <div className={`${card} p-4 grid grid-cols-1 md:grid-cols-5 gap-2`}>
                <select
                  className={selectCls}
                  value={quizRequestFilters.faculte}
                  onChange={e => {
                    setLoadingQuizRequests(true);
                    setQuizRequestFilters(prev => ({ ...prev, faculte: e.target.value, filiere: '' }));
                  }}
                >
                  <option value="">Toutes les facultés</option>
                  {facultes.map(f => <option key={f.id} value={f.id}>{f.label || f.id}</option>)}
                </select>
                <select
                  className={selectCls}
                  value={quizRequestFilters.filiere}
                  onChange={e => {
                    setLoadingQuizRequests(true);
                    setQuizRequestFilters(prev => ({ ...prev, filiere: e.target.value }));
                  }}
                >
                  <option value="">Toutes les filières</option>
                  {filieresForFaculte(quizRequestFilters.faculte).map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <select
                  className={selectCls}
                  value={quizRequestFilters.niveau}
                  onChange={e => {
                    setLoadingQuizRequests(true);
                    setQuizRequestFilters(prev => ({ ...prev, niveau: e.target.value }));
                  }}
                >
                  <option value="">Tous les niveaux</option>
                  {niveaux.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <select
                  className={selectCls}
                  value={quizRequestFilters.status}
                  onChange={e => {
                    setLoadingQuizRequests(true);
                    setQuizRequestFilters(prev => ({ ...prev, status: e.target.value }));
                  }}
                >
                  <option value="">Tous les statuts</option>
                  <option value="pending">En attente</option>
                  <option value="validated">Validées (seuil atteint)</option>
                  <option value="approved">Acceptées</option>
                  <option value="rejected">Rejetées</option>
                </select>
                <button
                  onClick={() => {
                    setLoadingQuizRequests(true);
                    fetchQuizRequests(quizRequestFilters);
                  }}
                  className={btnSecondary}
                >
                  <Icon name="refresh" size={13} />
                  Actualiser
                </button>
              </div>

              {loadingQuizRequests ? (
                <p className="text-xs text-slate-500 text-center py-10 animate-pulse">
                  Chargement des demandes de QCM…
                </p>
              ) : quizRequestGroups.length === 0 ? (
                <div className={`${card} p-10 text-center`}>
                  <Icon name="check-circle" size={24} className="text-emerald-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">
                    Aucune demande active pour ces filtres.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {quizRequestGroups.map(group => {
                    const count = Number(group.total) || 0;
                    const threshold = Number(group.threshold) || 10;
                    const percent = Math.min(100, Math.round((count / threshold) * 100));
                    return (
                      <div key={`${group.faculte}:${group.filiere}:${group.niveau}:${group.ue}`} className={`${card} p-5`}>
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-sm font-black text-white">{group.ue}</h3>
                              {group.ueLabel && group.ueLabel !== group.ue && (
                                <span className="text-[11px] text-slate-400">{group.ueLabel}</span>
                              )}
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                group.reachable
                                  ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                                  : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              }`}>
                                {group.reachable ? 'Seuil atteint' : 'En attente'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 mt-1">
                              {group.faculte} • {group.filiere} • {group.niveau} •{' '}
                              {group.pending || 0} en attente · {group.validated || 0} validée(s) ·{' '}
                              ouverte le {formatDate(group.createdAt)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-black text-white leading-none">
                              {count}<span className="text-slate-500 text-sm">/{threshold}</span>
                            </p>
                            <p className="text-[10px] text-slate-500">demande(s)</p>
                          </div>
                        </div>

                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-3">
                          <div
                            className={`h-full ${group.reachable ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.max(percent, 4)}%` }}
                          />
                        </div>

                        <div className="mt-4 grid md:grid-cols-[1fr_auto] gap-2 items-center">
                          <input
                            type="text"
                            placeholder="Note interne ou motif (optionnel)"
                            className={input}
                            value={quizRequestNotes[group.id] || ''}
                            onChange={e => setQuizRequestNotes(prev => ({ ...prev, [group.id]: e.target.value }))}
                          />
                          <div className="flex gap-2 flex-wrap">
                            <button onClick={() => prepareQuizFromRequest(group)} className={btnSecondary}>
                              <Icon name="plus" size={14} />
                              Programmer l'épreuve
                            </button>
                            <button onClick={() => approveQuizRequest(group)} className={btnPrimary}>
                              <Icon name="check" size={14} strokeWidth={3} />
                              Accepter
                            </button>
                            <button
                              onClick={() => rejectQuizRequest(group)}
                              className="inline-flex items-center gap-1.5 border border-red-900/60 hover:border-red-700 text-red-400 hover:text-red-300 hover:bg-red-950/40 font-bold text-xs px-3 py-2 rounded-xl transition"
                            >
                              <Icon name="close" size={13} />
                              Rejeter
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {quizRequestRows.length > 0 && (
                <div className={`${card} p-5`}>
                  <h3 className="text-sm font-black text-white mb-3 flex items-center gap-2">
                    <Icon name="list" size={15} className="text-blue-400" />
                    Dernières demandes individuelles
                  </h3>
                  <div className="max-h-72 overflow-y-auto divide-y divide-slate-800">
                    {quizRequestRows.slice(0, 80).map(row => (
                      <div key={row.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-slate-200 truncate">
                            {row.ue} · {row.filiere} ({row.niveau})
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {row.name || 'Étudiant'} • {row.email || '-'} • {formatDate(row.createdAt)}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          row.status === 'approved'
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                            : row.status === 'rejected'
                              ? 'bg-red-500/15 text-red-300 border-red-500/30'
                              : row.status === 'validated'
                                ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                        }`}>
                          {row.status === 'approved'
                            ? 'Acceptée'
                            : row.status === 'rejected'
                              ? 'Rejetée'
                              : row.status === 'validated'
                                ? 'Validée'
                                : 'En attente'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ════════════ RESSOURCES DE COURS ════════════ */}
          {activeSection === 'resources' && (
            <div className="space-y-6">
              <form onSubmit={uploadAdminResource} className={`${card} p-6 space-y-4`}>
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Icon name="upload" size={15} className="text-blue-400" />
                    Publier une ressource officielle
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Le document sera visible uniquement par la filière et le niveau choisis
                  </p>
                </div>

                {resourceError && (
                  <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3">
                    {resourceError}
                  </div>
                )}

                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className={label}>Faculté</label>
                    <select
                      className={selectCls}
                      value={resourceForm.faculte}
                      onChange={e => setResourceForm(prev => ({
                        ...prev,
                        faculte: e.target.value,
                        filiere: filieresForFaculte(e.target.value)[0] || ''
                      }))}
                    >
                      {facultes.length === 0 && <option value="">Chargement…</option>}
                      {facultes.map(f => (
                        <option key={f.id} value={f.id}>{f.label || f.id}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Filière</label>
                    <select
                      className={selectCls}
                      value={resourceForm.filiere}
                      onChange={e => setResourceForm(prev => ({ ...prev, filiere: e.target.value }))}
                    >
                      {filieresForFaculte(resourceForm.faculte).map(f => (
                        <option key={f}>{f}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Niveau</label>
                    <select
                      className={selectCls}
                      value={resourceForm.niveau}
                      onChange={e => setResourceForm(prev => ({ ...prev, niveau: e.target.value }))}
                    >
                      {niveaux.map(n => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Type de document</label>
                    <select
                      className={selectCls}
                      value={resourceForm.type}
                      onChange={e => setResourceForm(prev => ({ ...prev, type: e.target.value }))}
                    >
                      {RESOURCE_TYPES.map(entry => (
                        <option key={entry.value} value={entry.value}>{entry.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Titre</label>
                    <input
                      type="text"
                      className={input}
                      placeholder="Ex: Cours complet"
                      value={resourceForm.title}
                      onChange={e => setResourceForm(prev => ({ ...prev, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className={label}>UE (optionnel)</label>
                    <input
                      type="text"
                      className={input}
                      placeholder="Ex: INF232"
                      value={resourceForm.ue}
                      onChange={e => setResourceForm(prev => ({ ...prev, ue: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div>
                    <label className={label}>Fichier</label>
                    <input
                      type="file"
                      onChange={e => setResourceFile(e.target.files?.[0] || null)}
                      className="w-full text-xs text-slate-400 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs file:font-bold hover:file:bg-slate-700 file:cursor-pointer"
                    />
                  </div>
                </div>

                <div>
                  <label className={label}>Description (optionnel)</label>
                  <textarea
                    rows={2}
                    className={input + ' resize-none'}
                    placeholder="Contenu, chapitre, auteur…"
                    value={resourceForm.description}
                    onChange={e => setResourceForm(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <button type="submit" disabled={resourceUploading} className={btnPrimary}>
                  <Icon name="upload" size={13} />
                  {resourceUploading ? 'Publication…' : 'Publier'}
                </button>
              </form>

              <div className={`${card} overflow-hidden`}>
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Icon name="book" size={15} className="text-blue-400" />
                      Ressources publiées ({adminResources.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Modérez les dépôts des étudiants et de l'administration
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setLoadingResources(true);
                      fetchResources(resourceFilters);
                    }}
                    className={btnSecondary}
                  >
                    <Icon name="refresh" size={13} />
                    Actualiser
                  </button>
                </div>

                <div className="px-6 py-4 border-b border-slate-800 grid md:grid-cols-4 gap-3">
                  <select
                    className={selectCls}
                    value={resourceFilters.faculte}
                    onChange={e => setResourceFilters(prev => ({ ...prev, faculte: e.target.value, filiere: '', niveau: '' }))}
                  >
                    <option value="">Toutes les facultés</option>
                    {facultes.map(f => (
                      <option key={f.id} value={f.id}>{f.label || f.id}</option>
                    ))}
                  </select>
                  <select
                    className={selectCls}
                    value={resourceFilters.filiere}
                    onChange={e => setResourceFilters(prev => ({ ...prev, filiere: e.target.value }))}
                  >
                    <option value="">Toutes les filières</option>
                    {filieresForFaculte(resourceFilters.faculte).map(f => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <select
                    className={selectCls}
                    value={resourceFilters.niveau}
                    onChange={e => setResourceFilters(prev => ({ ...prev, niveau: e.target.value }))}
                  >
                    <option value="">Tous les niveaux</option>
                    {niveaux.map(n => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                  <select
                    className={selectCls}
                    value={resourceFilters.type}
                    onChange={e => setResourceFilters(prev => ({ ...prev, type: e.target.value }))}
                  >
                    <option value="">Tous les types</option>
                    {RESOURCE_TYPES.map(entry => (
                      <option key={entry.value} value={entry.value}>{entry.label}</option>
                    ))}
                  </select>
                </div>

                {loadingResources ? (
                  <p className="text-xs text-slate-500 text-center py-10 animate-pulse">
                    Chargement des ressources…
                  </p>
                ) : adminResources.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    Aucune ressource pour ces filtres.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-800">
                    {adminResources.map(item => (
                      <div key={item.id} className="px-6 py-4 flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-emerald-600/15 text-emerald-300 border border-emerald-600/30">
                              {resourceTypeLabel(item.type)}
                            </span>
                            <span className="text-[9px] font-black px-2 py-1 rounded-lg bg-blue-600/15 text-blue-300 border border-blue-600/30">
                              {String(item.originalName || '').split('.').pop()?.toUpperCase() || 'FICHIER'}
                            </span>
                            <h4 className="text-sm font-bold text-white truncate">{item.title}</h4>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                              {item.faculte}
                            </span>
                            <span className="text-[10px] font-bold text-blue-300 bg-blue-600/15 px-2 py-0.5 rounded-full">
                              {item.filiere}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                              {item.niveau}
                            </span>
                          </div>
                          {item.description && (
                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-1">{item.description}</p>
                          )}
                          <p className="text-[10px] text-slate-500 mt-1">
                            {item.ue ? `UE ${item.ue} · ` : ''}
                            {formatSize(item.size)} · {item.downloads || 0} téléchargement(s) ·{' '}
                            par {item.uploaderName || 'Anonyme'}
                            {item.uploaderRole === 'admin' ? ' (administration)' : ''} ·{' '}
                            {formatDate(item.createdAt)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button onClick={() => downloadAdminResource(item)} className={btnSecondary}>
                            <Icon name="download" size={13} />
                            Télécharger
                          </button>
                          <button
                            onClick={() => deleteAdminResource(item)}
                            aria-label={`Supprimer ${item.title}`}
                            className="w-8 h-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition"
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ════════════ GÉNÉRATION QCM IA ════════════ */}
          {activeSection === 'ai-generator' && (
            <div className="space-y-6">
              <div className="grid lg:grid-cols-2 gap-4 items-start">
                {/* Documents de référence */}
                <div className={`${card} p-6 space-y-4`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="document" size={15} className="text-blue-400" />
                      Documents de référence
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      PDF, Word, PowerPoint, Excel, OpenDocument, RTF, HTML, EPUB, TXT, MD, CSV, JSON, XML et ZIP · 25 Mo max. Le texte est extrait automatiquement.
                    </p>
                  </div>

                  {aiDocError && (
                    <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3">
                      {aiDocError}
                    </div>
                  )}

                  {aiDocNotice && (
                    <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs rounded-xl p-3">
                      {aiDocNotice}
                    </div>
                  )}

                  <form onSubmit={uploadAiDoc} className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.ods,.odp,.rtf,.txt,.md,.markdown,.csv,.json,.xml,.html,.htm,.epub,.zip"
                      onChange={e => setAiDocFile(e.target.files?.[0] || null)}
                      className="flex-1 text-xs text-slate-400 file:mr-2 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-slate-800 file:text-slate-200 file:text-xs file:font-bold hover:file:bg-slate-700 file:cursor-pointer"
                    />
                    <button type="submit" disabled={aiDocUploading} className={btnPrimary}>
                      <Icon name="upload" size={13} />
                      {aiDocUploading ? 'Extraction…' : 'Déposer'}
                    </button>
                  </form>

                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {loadingAiDocs ? (
                      <p className="text-xs text-slate-500 text-center py-6 animate-pulse">Chargement…</p>
                    ) : aiDocs.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-6">
                        Aucun document de référence déposé.
                      </p>
                    ) : (
                      aiDocs.map(doc => (
                        <label
                          key={doc.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border transition cursor-pointer ${
                            genDocIds.includes(doc.id)
                              ? 'bg-blue-950/40 border-blue-700'
                              : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={genDocIds.includes(doc.id)}
                            onChange={() => toggleGenDoc(doc.id)}
                            className="accent-blue-600"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-200 truncate">{doc.originalName}</p>
                            <p className="text-[10px] text-slate-500">
                              {formatSize(doc.size)} · {formatNumber(doc.charCount)} caractères ·{' '}
                              {formatDate(doc.createdAt)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              deleteAiDoc(doc);
                            }}
                            aria-label={`Supprimer ${doc.originalName}`}
                            className="w-7 h-7 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition shrink-0"
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </label>
                      ))
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500">
                    Sans sélection explicite, les 3 documents les plus récents sont utilisés.
                  </p>
                </div>

                {/* Paramètres de génération */}
                <div className={`${card} p-6 space-y-4`}>
                  <div className="border-b border-slate-800 pb-3">
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <Icon name="sparkles" size={15} className="text-purple-400" />
                      Générer des questions
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Décrivez le chapitre ou les notions à évaluer
                    </p>
                  </div>

                  {genError && (
                    <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3">
                      {genError}
                    </div>
                  )}
                  {genNotice && (
                    <div className="bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs rounded-xl p-3">
                      {genNotice}
                    </div>
                  )}

                  <div>
                    <label className={label}>Prompt / consignes</label>
                    <textarea
                      rows={4}
                      className={input + ' resize-none'}
                      placeholder="Ex: Génère des questions sur les bases de données relationnelles, chapitre 3 (normalisation, clés, jointures)."
                      value={genPrompt}
                      onChange={e => setGenPrompt(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={label}>Nombre de questions</label>
                      <input
                        type="number"
                        min="1"
                        max="40"
                        className={input}
                        value={genCount}
                        onChange={e => setGenCount(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={label}>Difficulté</label>
                      <select
                        className={selectCls}
                        value={genDifficulte}
                        onChange={e => setGenDifficulte(e.target.value)}
                      >
                        <option value="facile">Facile</option>
                        <option value="moyenne">Moyenne</option>
                        <option value="difficile">Difficile</option>
                      </select>
                    </div>
                    <div>
                      <label className={label}>Faculté</label>
                      <select
                        className={selectCls}
                        value={genFaculte}
                        onChange={e => {
                          const value = e.target.value;
                          setGenFaculte(value);
                          setGenFiliere(filieresForFaculte(value)[0] || '');
                        }}
                      >
                        {facultes.length === 0 && <option value="">Chargement…</option>}
                        {facultes.map(f => (
                          <option key={f.id} value={f.id}>{f.label || f.id}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Filière</label>
                      <select
                        className={selectCls}
                        value={genFiliere}
                        onChange={e => setGenFiliere(e.target.value)}
                      >
                        {filieresForFaculte(genFaculte).map(f => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>Niveau</label>
                      <select
                        className={selectCls}
                        value={genNiveau}
                        onChange={e => setGenNiveau(e.target.value)}
                      >
                        {niveaux.map(n => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className={label}>UE</label>
                      <input
                        type="text"
                        className={input}
                        placeholder="Ex: INF232"
                        value={genUe}
                        onChange={e => setGenUe(e.target.value.toUpperCase())}
                      />
                    </div>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-3">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="mt-0.5 accent-blue-600"
                        checked={genSave}
                        onChange={e => setGenSave(e.target.checked)}
                      />
                      <span className="text-[11px] text-slate-300">
                        Enregistrer directement les questions dans une épreuve
                        <span className="block text-[10px] text-slate-500">
                          Les questions existantes de cette épreuve seront remplacées.
                        </span>
                      </span>
                    </label>

                    {genSave && (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className={label}>Code de l'épreuve</label>
                          <input
                            type="text"
                            className={input}
                            placeholder="INF232"
                            value={genQuizId}
                            onChange={e => setGenQuizId(e.target.value.toUpperCase())}
                          />
                        </div>
                        <div>
                          <label className={label}>Temps / question (s)</label>
                          <input
                            type="number"
                            min="10"
                            className={input}
                            value={genTimePerQuestion}
                            onChange={e => setGenTimePerQuestion(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className={label}>Semestre</label>
                          <select
                            className={selectCls}
                            value={genSemestre}
                            onChange={e => setGenSemestre(e.target.value)}
                          >
                            <option value="1">Semestre 1</option>
                            <option value="2">Semestre 2</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleGenerateQuestions}
                    disabled={generating}
                    className={btnPrimary + ' w-full justify-center'}
                  >
                    <Icon name="sparkles" size={14} />
                    {generating ? 'Génération en cours…' : 'Générer les questions'}
                  </button>
                  <p className="text-[10px] text-slate-500">
                    La génération consomme le budget mensuel de tokens IA. Vérifiez toujours
                    les questions proposées avant publication.
                  </p>
                </div>
              </div>

              {/* Aperçu des questions générées */}
              {genQuestions.length > 0 && (
                <div className={`${card} overflow-hidden`}>
                  <div className="px-6 py-4 border-b border-slate-800">
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Icon name="eye" size={15} className="text-blue-400" />
                      Questions générées ({genQuestions.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Relisez chaque énoncé et la bonne réponse avant de les utiliser.
                    </p>
                  </div>
                  <div className="divide-y divide-slate-800">
                    {genQuestions.map((q, i) => (
                      <div key={i} className="px-6 py-4">
                        <p className="text-xs font-bold text-slate-200 leading-relaxed">
                          <span className="text-slate-500 mr-1.5">Q{i + 1}.</span>
                          {q.Question}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-2">
                          {q.tags && String(q.tags).split(/[;,]/).filter(Boolean).map(tag => (
                            <span key={tag} className="text-[10px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 px-2 py-0.5 rounded-full">
                              {tag.trim()}
                            </span>
                          ))}
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
                                    : 'bg-slate-950 border-slate-800 text-slate-400'
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
                        {q.explication && (
                          <div className="mt-2.5 bg-indigo-950/40 border border-indigo-800/60 rounded-lg px-3 py-2">
                            <p className="text-[9px] font-black uppercase tracking-wider text-indigo-300 mb-0.5">Explication</p>
                            <p className="text-[11px] text-slate-300 leading-relaxed">{q.explication}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
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
                  {allFiliereLabels.map(f => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
                <select
                  className={selectCls + ' flex-1 min-w-40'}
                  value={fbStatus}
                  onChange={e => setFbStatus(e.target.value)}
                >
                  <option value="">Tous les statuts</option>
                  <option value="en_attente">En attente</option>
                  <option value="en_cours">En cours</option>
                  <option value="traite">Traité</option>
                </select>
              </div>

              {feedbackNotice && (
                <div className="mx-6 mt-4 bg-blue-950/50 border border-blue-900 text-blue-300 text-xs rounded-xl px-3 py-2 flex items-start gap-2">
                  <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                  <span>{feedbackNotice}</span>
                </div>
              )}

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
                            {f.name || 'Étudiant'} • {f.email || '-'} • {f.filiere || '-'} •{' '}
                            {f.category} • {formatDate(f.date)}
                          </p>
                          <p className="text-xs text-slate-300 leading-relaxed mt-2 whitespace-pre-wrap">{f.message}</p>

                          {f.reply && (
                            <div className="mt-3 border-l-2 border-emerald-500 bg-emerald-950/30 rounded-r-xl px-3 py-2.5">
                              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300 flex items-center gap-1.5">
                                <Icon name="check-circle" size={12} />
                                Votre réponse · {formatDate(f.repliedAt)}
                              </p>
                              <p className="text-xs text-slate-200 leading-relaxed mt-1 whitespace-pre-wrap">{f.reply}</p>
                            </div>
                          )}

                          {replyOpen[f.id] && (
                            <div className="mt-3 bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                              <label className={label}>Votre réponse à {f.name || 'l’étudiant'}</label>
                              <textarea
                                rows={3}
                                className={input + ' resize-none'}
                                placeholder="Expliquez la marche à suivre, la correction apportée ou la décision prise…"
                                value={replyDrafts[f.id] || ''}
                                onChange={e => setReplyDrafts(prev => ({ ...prev, [f.id]: e.target.value }))}
                              />
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <p className="text-[10px] text-slate-500">
                                  Réponse visible dans l’espace étudiant · notification et email si configuré.
                                </p>
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setReplyOpen(prev => ({ ...prev, [f.id]: false }))}
                                    className={btnSecondary}
                                  >
                                    Annuler
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => sendFeedbackReply(f.id)}
                                    disabled={sendingReply === f.id}
                                    className={btnPrimary}
                                  >
                                    <Icon name="send" size={13} />
                                    {sendingReply === f.id ? 'Envoi…' : 'Envoyer la réponse'}
                                  </button>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setReplyDrafts(prev => ({ ...prev, [f.id]: prev[f.id] || f.reply || '' }));
                              setReplyOpen(prev => ({ ...prev, [f.id]: !prev[f.id] }));
                            }}
                            title="Répondre depuis l'application"
                            className={btnSecondary}
                          >
                            <Icon name={f.reply ? 'edit' : 'chat'} size={13} />
                            {f.reply ? 'Modifier' : 'Répondre'}
                          </button>
                          {f.email && (
                            <a
                              href={`mailto:${encodeURIComponent(f.email)}?subject=${encodeURIComponent('Re: ' + (f.subject || ''))}`}
                              title="Répondre par email (externe)"
                              className="w-8 h-8 rounded-lg text-blue-400 hover:text-blue-300 hover:bg-blue-950/50 flex items-center justify-center transition"
                            >
                              <Icon name="mail" size={14} />
                            </a>
                          )}
                          <select
                            className="p-2 border border-slate-800 rounded-lg bg-slate-950 text-slate-300 text-[11px] font-bold outline-none focus:border-blue-600 transition"
                            value={f.status || 'en_attente'}
                            onChange={e => updateMessageStatus(f.id, e.target.value)}
                          >
                            <option value="en_attente">En attente</option>
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

          {/* ════════════ SAUVEGARDES ════════════ */}
          {activeSection === 'backups' && (
            <div className="space-y-6">
              <div className={`${card} p-6 flex flex-col md:flex-row md:items-center justify-between gap-4`}>
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
                    <Icon name="download" size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white">Sauvegarde automatique de la base</h3>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                      Une copie complète et cohérente de la base SQLite est créée régulièrement.
                      Les fichiers sont conservés côté serveur et téléchargeables ici.
                    </p>
                  </div>
                </div>
                <button
                  onClick={createBackupNow}
                  disabled={creatingBackup}
                  className={btnPrimary + ' shrink-0'}
                >
                  <Icon name="refresh" size={13} />
                  {creatingBackup ? 'Sauvegarde en cours…' : 'Créer une sauvegarde'}
                </button>
              </div>

              <div className={`${card} overflow-hidden`}>
                <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                      <Icon name="document" size={15} className="text-blue-400" />
                      Sauvegardes disponibles ({backups.length})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Téléchargez ou supprimez les copies de sécurité
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setLoadingBackups(true);
                      fetchBackups();
                    }}
                    className={btnSecondary}
                  >
                    <Icon name="refresh" size={13} />
                    Actualiser
                  </button>
                </div>

                {loadingBackups ? (
                  <p className="text-xs text-slate-500 text-center py-10 animate-pulse">
                    Chargement des sauvegardes…
                  </p>
                ) : backups.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-10">
                    Aucune sauvegarde pour le moment. La première est créée automatiquement au démarrage du serveur.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-slate-950 border-b border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                          <th className="py-2.5 px-4 text-left">Fichier</th>
                          <th className="py-2.5 px-4 text-right">Taille</th>
                          <th className="py-2.5 px-4 text-left">Créée le</th>
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {backups.map((b) => (
                          <tr key={b.name} className="hover:bg-slate-950/60 transition">
                            <td className="py-3 px-4 font-mono text-slate-300 break-all">{b.name}</td>
                            <td className="py-3 px-4 text-right text-slate-400 font-bold">{formatSize(b.size)}</td>
                            <td className="py-3 px-4 text-slate-500">{formatDate(b.createdAt)}</td>
                            <td className="py-3 px-4">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => downloadBackup(b.name)}
                                  title="Télécharger cette sauvegarde"
                                  className={btnSecondary}
                                >
                                  <Icon name="download" size={13} />
                                  Télécharger
                                </button>
                                <button
                                  onClick={() => removeBackup(b.name)}
                                  aria-label={`Supprimer ${b.name}`}
                                  title="Supprimer cette sauvegarde"
                                  className="w-8 h-8 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-950/50 flex items-center justify-center transition"
                                >
                                  <Icon name="trash" size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-start gap-3 text-xs text-slate-400 leading-relaxed">
                <Icon name="shield" size={16} className="text-emerald-400 mt-0.5 shrink-0" />
                <p>
                  La rotation conserve uniquement les sauvegardes les plus récentes afin d'éviter
                  de saturer le disque. Pour restaurer une copie, arrêtez le serveur puis remplacez
                  le fichier <span className="font-mono text-slate-300">data/qcm.db</span> par la sauvegarde choisie.
                </p>
              </div>
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
                      placeholder="administration@gmail.com"
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
                  Aperçu de l'import · {csvFile?.name || 'fichier.csv'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {parsedCsvData.questions.length} question(s) détectée(s) • Cible : UE{' '}
                  <strong className="text-blue-300">{ue.trim().toUpperCase() || '· non saisie ·'}</strong>
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
                  {q.Tags && (
                    <div className="flex items-center gap-1.5 flex-wrap mt-2">
                      {String(q.Tags).split(/[;,]/).filter(Boolean).map(tag => (
                        <span key={tag} className="text-[10px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 px-2 py-0.5 rounded-full">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
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
                  {q.Explication && (
                    <div className="mt-2 bg-indigo-950/40 border border-indigo-800/60 rounded-lg px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-indigo-300 mb-0.5">Explication</p>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{q.Explication}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
              <p className="text-[11px] text-slate-500">
                L'import remplacera toutes les questions existantes de ce test (même UE + même nom).
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
