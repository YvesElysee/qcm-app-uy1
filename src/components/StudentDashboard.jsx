import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import { getCurrentUser } from '../services/authService';
import ContactAdmin from './ContactAdmin';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [currentUser, setCurrentUser] = useState(getCurrentUser());
  // Lien profond depuis une notification : le test concerné est mis en avant.
  const focusQuizId = searchParams.get('quiz') || '';

  // Division de l'expérience par semestre. Tant que l'étudiant n'a pas choisi
  // explicitement un semestre, on affiche celui du test ciblé par une
  // notification, sinon le semestre académique courant (S1 : sept.-janv.,
  // S2 : févr.-août).
  const [semesterChoice, setSemesterChoice] = useState(null);

  usePageTitle('Mon espace étudiant');

  // Le profil peut être modifié depuis la navbar partagée : on se synchronise
  useEffect(() => {
    const refresh = () => setCurrentUser(getCurrentUser());
    window.addEventListener('qcm:profile-updated', refresh);
    return () => window.removeEventListener('qcm:profile-updated', refresh);
  }, []);

  // Redirection si non connecté
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  // Filière et niveau FIXES de l'étudiant : aucune permutation de niveau
  // n'est possible depuis l'espace personnel (contrôle aussi côté serveur).
  const filiere = currentUser?.filiere || 'Informatique';
  const registeredNiveau = currentUser?.niveau || 'L1';
  const faculte = currentUser?.faculte || '';
  const selectedNiveau = registeredNiveau;
  const isMathsFiliere = /math/i.test(
    String(filiere).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  );
  const canGenerateExercises =
    isMathsFiliere && ['L1', 'L2', 'L3', 'M1'].includes(String(registeredNiveau || '').trim().toUpperCase());

  // Données
  const [availableUes, setAvailableUes] = useState([]);
  const [allQuizzes, setAllQuizzes] = useState([]);
  const [myResults, setMyResults] = useState([]);
  const [filiereRequest, setFiliereRequest] = useState(null);
  const [quizRequests, setQuizRequests] = useState([]);
  const [referral, setReferral] = useState(null);
  const [requestThreshold, setRequestThreshold] = useState(10);
  const [requestBusy, setRequestBusy] = useState('');
  const [requestNotice, setRequestNotice] = useState('');
  const [requestError, setRequestError] = useState('');
  const [copiedReferral, setCopiedReferral] = useState(false);
  const [nowTs, setNowTs] = useState(0);
  const [loading, setLoading] = useState(true);

  // Semestre affiché : choix explicite de l'étudiant, sinon semestre du test
  // ciblé par le lien de notification, sinon semestre académique courant.
  const academicSemester = (() => {
    const month = new Date().getMonth();
    return month >= 8 || month === 0 ? '1' : '2';
  })();
  const focusedQuiz = focusQuizId ? allQuizzes.find(q => q.id === focusQuizId) : null;
  const activeSemester = semesterChoice
    || (focusedQuiz?.semestre ? String(focusedQuiz.semestre) : null)
    || academicSemester;

  // Classement de la salle (filière + niveau) · chargé uniquement sur demande
  const [showRankings, setShowRankings] = useState(false);
  const [rankings, setRankings] = useState([]);
  const [loadingRankings, setLoadingRankings] = useState(false);
  const [rankingsError, setRankingsError] = useState('');

  // Modales
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedUeForStart, setSelectedUeForStart] = useState('');
  const [showStartWarning, setShowStartWarning] = useState(false);
  const [startAsMakeup, setStartAsMakeup] = useState(false);

  // Notification navigateur
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Charger les données
  const loadData = useCallback(async () => {
    if (!currentUser) return;
    setLoading(true);

    try {
      // 1. Charger les UEs de la filière et du niveau sélectionné
      // 2. Charger les Quizzes de la filière et du niveau sélectionné
      // 3. Charger STRICTEMENT les résultats de CET utilisateur (filtrés par le serveur)
      const scope = `filiere=${encodeURIComponent(filiere)}&niveau=${encodeURIComponent(selectedNiveau)}&faculte=${encodeURIComponent(faculte)}`;
      const [uesData, quizzesData, resultsData, requestData, quizRequestsData] = await Promise.all([
        api(`/ues?${scope}`),
        api(`/quizzes?${scope}&sort=asc`),
        api('/results/mine', { auth: 'student' }).catch(() => ({ results: [] })),
        api('/auth/filiere-request', { auth: 'student' }).catch(() => ({ request: null })),
        api('/quiz-requests/mine', { auth: 'student' }).catch(() => ({ requests: [], referral: null }))
      ]);

      setAvailableUes(uesData.ues);
      setFiliereRequest(requestData?.request || null);
      setQuizRequests(Array.isArray(quizRequestsData?.requests) ? quizRequestsData.requests : []);
      setReferral(quizRequestsData?.referral || null);
      if (Number(quizRequestsData?.threshold) > 0) setRequestThreshold(Number(quizRequestsData.threshold));
      // Uniquement les épreuves de la filière, du niveau et de la faculté
      setAllQuizzes(quizzesData.quizzes);
      setNowTs(Date.now());

      // Historique personnel exclusif : seuls les résultats par email OU nom
      const userEmail = (currentUser.email || '').toLowerCase();
      const userName = (currentUser.name || '').trim();
      const userRes = resultsData.results.filter(r => {
        const rEmail = (r.email || '').toLowerCase();
        const rName = (r.name || '').trim();
        return (userEmail && rEmail === userEmail) || (userName && rName === userName);
      });
      userRes.sort((a, b) => new Date(b.date) - new Date(a.date));
      setMyResults(userRes);
    } catch (err) {
      console.warn("Erreur chargement données :", err);
    } finally {
      setLoading(false);
    }
  }, [currentUser, filiere, faculte, selectedNiveau]);

  useEffect(() => {
    const load = async () => { await loadData(); };
    load();
  }, [loadData]);

  // Lien profond depuis une notification : on fait défiler jusqu'au test visé
  // dès que les données sont chargées (et dès que le semestre correspondant
  // est affiché).
  useEffect(() => {
    if (!focusQuizId || loading) return;
    const target = document.getElementById(`test-${focusQuizId}`);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [focusQuizId, loading, activeSemester]);

  const requestNotificationPermission = async () => {
    if (typeof Notification === 'undefined') {
      alert("Votre navigateur ne supporte pas les notifications.");
      return;
    }
    const perm = await Notification.requestPermission();
    setNotifPermission(perm);
    if (perm === 'granted') {
      new Notification("QCM App", {
        body: `Rappels activés pour la filière ${filiere} !`,
        icon: '/favicon.ico'
      });
    }
  };

  /**
   * Affiche le classement de la salle de l'étudiant (filière + niveau).
   * Les données ne sont demandées au serveur qu'après un clic explicite sur
   * « Classement » : rien n'est préchargé dans l'espace personnel.
   */
  const toggleRankings = async () => {
    if (showRankings) {
      setShowRankings(false);
      return;
    }

    setShowRankings(true);
    setLoadingRankings(true);
    setRankingsError('');
    try {
      // Le serveur verrouille le classement sur la salle de l'étudiant
      // (faculté + filière + niveau d'inscription) : aucun niveau à envoyer.
      const data = await api('/results/ranking', { auth: 'student' });
      setRankings(Array.isArray(data.groups) ? data.groups : []);
    } catch (err) {
      setRankingsError(err.message || 'Classement momentanément indisponible.');
      setRankings([]);
    } finally {
      setLoadingRankings(false);
    }
  };

  // ── Demandes de QCM & parrainage ──
  const requestByUe = new Map();
  quizRequests.forEach((r) => {
    const key = String(r.ue || '').toLowerCase();
    if (key && !requestByUe.has(key)) requestByUe.set(key, r);
  });

  const referralLink = referral?.path && typeof window !== 'undefined'
    ? `${window.location.origin}${referral.path}`
    : '';

  const submitQuizRequest = async (ueCode, ueLabel) => {
    if (!ueCode || requestBusy) return;
    setRequestBusy(ueCode);
    setRequestError('');
    setRequestNotice('');
    try {
      const data = await api('/quiz-requests', {
        method: 'POST',
        auth: 'student',
        body: { ue: ueCode, ueLabel: ueLabel || '' }
      });
      setRequestNotice(data?.message || 'Votre demande a bien été enregistrée.');
      const mine = await api('/quiz-requests/mine', { auth: 'student' });
      setQuizRequests(Array.isArray(mine.requests) ? mine.requests : []);
      setReferral(mine.referral || null);
      if (Number(mine.threshold) > 0) setRequestThreshold(Number(mine.threshold));
    } catch (err) {
      setRequestError(err.message || "La demande n'a pas pu être enregistrée.");
      if (/déjà programmée/i.test(err.message || '')) loadData();
    } finally {
      setRequestBusy('');
    }
  };

  const copyReferralLink = async () => {
    if (!referralLink) return;
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopiedReferral(true);
      setTimeout(() => setCopiedReferral(false), 2500);
    } catch {
      setRequestError("Impossible de copier automatiquement. Sélectionnez le lien pour le copier.");
    }
  };

  // ── Calcul des sous-groupes de QCM ──
  const now = nowTs;
  const passedQuizIds = new Set(myResults.map(r => r.quizId || r.ue));

  // Division par semestre : une matière ou un test sans semestre renseigné
  // reste visible quel que soit le filtre sélectionné.
  const matchesSemester = (value) =>
    activeSemester === 'all' || !value || String(value) === activeSemester;
  const semesterLabel = activeSemester === 'all' ? 'Tous les semestres' : `Semestre ${activeSemester}`;
  const semesterQuizzes = allQuizzes.filter(q => matchesSemester(q.semestre));
  // Une UE est visible si elle appartient au semestre OU si elle possède au
  // moins un test dans ce semestre (une même UE peut être enseignée sur les
  // deux semestres).
  const ueCodesWithSemesterTests = new Set(
    semesterQuizzes.map(q => String(q.ue || q.id).toUpperCase())
  );
  const semesterUes = availableUes.filter(ue =>
    matchesSemester(ue.semestre) ||
    ueCodesWithSemesterTests.has(String(ue.id || ue.code).toUpperCase())
  );

  // Plusieurs tests peuvent partager la même UE : on choisit pour la carte
  // rapide celui qui est en cours, sinon le prochain, sinon le plus récent.
  const quizByUe = new Map();
  semesterQuizzes.forEach(q => {
    const key = String(q.ue || q.id).toUpperCase();
    const priority = (item) => {
      if (!item.questionCount || !item.launchTime) return 0;
      if (item.launchTime > now) return 2;
      if (!item.endTime || item.endTime >= now) return 3;
      return 1;
    };
    const current = quizByUe.get(key);
    if (!current) {
      quizByUe.set(key, q);
      return;
    }
    const p = priority(q);
    const cp = priority(current);
    if (p > cp || (p === cp && (q.launchTime || 0) > (current.launchTime || 0))) {
      quizByUe.set(key, q);
    }
  });

  // Tous les tests regroupés par UE (plusieurs tests possibles sur une matière)
  const quizzesByUe = new Map();
  semesterQuizzes.forEach(q => {
    const key = String(q.ue || q.id).toUpperCase();
    if (!quizzesByUe.has(key)) quizzesByUe.set(key, []);
    quizzesByUe.get(key).push(q);
  });
  quizzesByUe.forEach(list => {
    list.sort((a, b) => (a.launchTime || Number.MAX_SAFE_INTEGER) - (b.launchTime || Number.MAX_SAFE_INTEGER));
  });

  // Toutes les épreuves programmées (date renseignée), triées chronologiquement
  const scheduledQuizzes = semesterQuizzes
    .filter(q => q.launchTime)
    .sort((a, b) => a.launchTime - b.launchTime);

  // 1. Quizz à venir (launchTime > now)
  const upcomingQuizzes = scheduledQuizzes.filter(q => q.launchTime > now);

  // État d'une épreuve pour l'affichage de la carte UE
  const getQuizState = (ueCode) => {
    const quiz = quizByUe.get(String(ueCode || '').toUpperCase());
    if (!quiz) return { quiz: null, state: 'none' };
    if (!quiz.questionCount) return { quiz, state: 'draft' };
    if (!quiz.launchTime) return { quiz, state: 'draft' };
    if (quiz.launchTime > now) return { quiz, state: 'upcoming' };
    if (quiz.endTime && quiz.endTime < now) {
      return { quiz, state: passedQuizIds.has(quiz.id) || passedQuizIds.has(ueCode) ? 'done' : 'missed' };
    }
    return { quiz, state: 'ongoing' };
  };

  // Le prochain quiz immédiat pour le compte à rebours
  const nextQuiz = upcomingQuizzes[0];
  const nextDiffMinutes = nextQuiz ? Math.round((nextQuiz.launchTime - now) / (60 * 1000)) : null;

  // Lancement d'un QCM
  const handleStartQuiz = (ueCode, isMakeup = false) => {
    setSelectedUeForStart(ueCode);
    setStartAsMakeup(isMakeup);
    setShowStartWarning(true);
  };

  const confirmStartQuiz = () => {
    localStorage.setItem('userSession', JSON.stringify({
      ...currentUser,
      filiere,
      niveau: selectedNiveau,
      ue: selectedUeForStart,
      isMakeup: startAsMakeup
    }));
    navigate(`/quiz/${selectedUeForStart}${startAsMakeup ? '?mode=rattrapage' : ''}`);
  };

  const formatDate = (isoOrTs) => {
    if (!isoOrTs) return '-';
    const d = new Date(isoOrTs);
    return d.toLocaleDateString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (!currentUser) return null;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-28 md:pb-16">
      {/* ── Main Content ── */}
      <main className="max-w-6xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 space-y-4 sm:space-y-6">
        {/* ── Bandeau Profil & Filière Cadenassée (Point 3) ── */}
        <div className="bg-gradient-to-r from-blue-900/60 via-indigo-900/50 to-slate-900 border border-blue-500/20 rounded-3xl p-4 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-extrabold uppercase tracking-wider text-blue-400">
                  Espace Personnel
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-xs text-slate-300 font-medium">{currentUser.anneeAcademique || '2025-2026'}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                Bienvenue, {currentUser.name}
              </h2>
              <div className="flex items-center gap-2 mt-2 flex-wrap text-xs">
                {/* Filière FIXE (Point 3) */}
                <div className="inline-flex items-center gap-1.5 bg-blue-600/30 text-blue-200 border border-blue-400/30 px-3 py-1 rounded-full font-bold">
                  <Icon name="lock" size={12} />
                  Filière : <span>{filiere}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 bg-slate-800/80 text-slate-300 border border-slate-700 px-3 py-1 rounded-full">
                  Niveau d'inscription : <strong className="text-white">{registeredNiveau}</strong>
                </div>
                <div className="text-slate-400 text-xs">
                  {currentUser.email}
                </div>
                <button
                  onClick={() => setShowContactModal(true)}
                  className="inline-flex items-center gap-1.5 bg-blue-950/60 hover:bg-blue-900 text-blue-300 hover:text-white border border-blue-800/80 px-3 py-1.5 rounded-full font-bold text-xs transition"
                >
                  <Icon name="lightbulb" size={13} />
                  Suggérer / Contacter l'administration
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* ── Division par semestre ── */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0">
              <Icon name="book" size={17} />
            </span>
            <div>
              <h3 className="text-sm font-black text-white">Mon semestre</h3>
              <p className="text-[11px] text-slate-400">
                Les matières et tests affichés correspondent au semestre sélectionné.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950/60 border border-slate-700 rounded-xl p-1 self-start sm:self-auto">
            {[
              { value: '1', label: 'Semestre 1' },
              { value: '2', label: 'Semestre 2' },
              { value: 'all', label: 'Tous' }
            ].map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSemesterChoice(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition ${
                  activeSemester === tab.value
                    ? 'bg-emerald-500 text-slate-950 shadow'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Révision & dépôt de documents ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-gradient-to-br from-blue-950/70 to-slate-900 border border-blue-700/40 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 flex items-center justify-center shrink-0">
                <Icon name="lightbulb" size={19} />
              </span>
              <div>
                <h3 className="text-sm font-black text-white">Réviser après un QCM</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Relisez vos copies, refaites vos erreurs et, en fin de sujet,
                  demandez à l'aide à la révision de vous expliquer les questions ratées.
                </p>
              </div>
            </div>
            {myResults.length > 0 ? (
              <Link
                to={`/review/${myResults[0].quizId || myResults[0].ue}`}
                className="mt-auto w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-2.5 rounded-xl transition shadow-md shadow-blue-600/25"
              >
                <Icon name="eye" size={14} />
                Revoir ma dernière copie
              </Link>
            ) : (
              <Link
                to="/schedule"
                className="mt-auto w-full inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-2.5 rounded-xl transition shadow-md shadow-blue-600/25"
              >
                <Icon name="calendar" size={14} />
                Voir les évaluations
              </Link>
            )}
          </div>

          <div className="bg-gradient-to-br from-emerald-950/60 to-slate-900 border border-emerald-700/40 rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-300 flex items-center justify-center shrink-0">
                <Icon name="upload" size={19} />
              </span>
              <div>
                <h3 className="text-sm font-black text-white">Partagez vos cours</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  PDF, Word, PowerPoint, Excel… Déposez vos documents de cours : ils aident
                  l'équipe à produire des QCM et des exercices pour votre filière.
                </p>
              </div>
            </div>
            <Link
              to="/resources"
              className="mt-auto w-full inline-flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black py-2.5 rounded-xl transition shadow-md shadow-emerald-600/25"
            >
              <Icon name="document" size={14} />
              Déposer un document
            </Link>
          </div>
        </div>

        {/* ── Générateur d'exercices (Mathématiques L1 → M1) ── */}
        {canGenerateExercises && (
          <Link
            to="/exercises"
            className="block bg-gradient-to-r from-indigo-950/70 via-slate-900 to-blue-950/60 border border-indigo-700/40 rounded-2xl p-5 hover:border-indigo-500/60 transition group"
          >
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 rounded-xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-300 flex items-center justify-center shrink-0">
                <Icon name="sparkles" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-black text-white flex items-center gap-2 flex-wrap">
                  Générateur d'exercices de Mathématiques
                  <span className="text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-2 py-0.5 rounded-full">
                    Nouveau
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Déposez vos cours et générez des QCM, QRO ou exercices de calcul corrigés,
                  adaptés à votre niveau. Réservé aux étudiants de Mathématiques (L1 → M1).
                </p>
              </div>
              <Icon
                name="arrow-right"
                size={18}
                className="text-indigo-300 group-hover:translate-x-0.5 transition-transform shrink-0 mt-1"
              />
            </div>
          </Link>
        )}

        {/* ── Suivi de la demande de filière (si absente du catalogue) ── */}
        {filiereRequest && filiereRequest.status !== 'approved' && (
          <div className={`rounded-2xl p-4 border flex items-start gap-3 ${
            filiereRequest.status === 'rejected'
              ? 'bg-red-950/40 border-red-800/60'
              : 'bg-amber-950/40 border-amber-700/50'
          }`}>
            <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              filiereRequest.status === 'rejected'
                ? 'bg-red-500/15 text-red-300'
                : 'bg-amber-500/15 text-amber-300'
            }`}>
              <Icon name={filiereRequest.status === 'rejected' ? 'alert' : 'clock'} size={17} />
            </span>
            <div className="min-w-0">
              <h3 className={`text-sm font-black ${
                filiereRequest.status === 'rejected' ? 'text-red-200' : 'text-amber-200'
              }`}>
                {filiereRequest.status === 'rejected'
                  ? `Demande de filière « ${filiereRequest.filiere} » non acceptée`
                  : `Filière « ${filiereRequest.filiere} » en attente de validation`}
              </h3>
              <p className="text-xs text-slate-300/80 mt-0.5">
                {filiereRequest.status === 'rejected'
                  ? (filiereRequest.note || "Contactez l'administration pour plus d'informations.")
                  : "Votre compte est actif. L'administration a bien reçu votre demande et vous serez notifié(e) ici et par email dès que la filière sera ajoutée au catalogue."}
              </p>
              <p className="text-[10px] text-slate-500 mt-1">
                {filiereRequest.faculte}{filiereRequest.faculte ? ' • ' : ''}Demande du {formatDate(filiereRequest.createdAt)}
              </p>
            </div>
          </div>
        )}

        {/* ── Avertissement & Alerte Prochain Quizz (Point 4) ── */}
        {nextQuiz && (
          <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center animate-pulse shrink-0">
                <Icon name="bell" size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                    Alerte Évaluation à venir
                  </span>
                  <span className="bg-amber-400/20 text-amber-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    {nextDiffMinutes <= 60
                      ? `Dans ~${nextDiffMinutes} min`
                      : nextDiffMinutes <= 1440
                      ? `Dans ~${Math.round(nextDiffMinutes / 60)}h`
                      : formatDate(nextQuiz.launchTime)}
                  </span>
                </div>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {nextQuiz.title || nextQuiz.ue || nextQuiz.id} · {nextQuiz.filiere} ({nextQuiz.niveau})
                </h3>
                {(nextQuiz.ue || nextQuiz.ueLabel) && (
                  <p className="text-[11px] text-amber-200/80">
                    UE {nextQuiz.ue || nextQuiz.id}{nextQuiz.ueLabel ? ` · ${nextQuiz.ueLabel}` : ''}
                  </p>
                )}
                <p className="text-xs text-amber-200/70">
                  Début : {formatDate(nextQuiz.launchTime)} {nextQuiz.timePerQuestion ? `• ${nextQuiz.timePerQuestion}s par question` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {notifPermission !== 'granted' && (
                <button
                  onClick={requestNotificationPermission}
                  className="inline-flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 text-xs font-bold px-3 py-2 rounded-xl transition border border-amber-500/30"
                >
                  <Icon name="bell" size={13} />
                  M'avertir
                </button>
              )}
              <Link
                to="/schedule"
                className="bg-amber-500 text-slate-950 hover:bg-amber-400 text-xs font-black px-4 py-2 rounded-xl transition shadow-md"
              >
                Voir l'emploi du temps
              </Link>
            </div>
          </div>
        )}

        {/* ── Épreuves programmées (chaque épreuve est reliée à son UE) ── */}
        {scheduledQuizzes.length > 0 && (
          <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Icon name="calendar" size={18} className="text-blue-400" />
                  Épreuves programmées ({scheduledQuizzes.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  {filiere} • {selectedNiveau} · {semesterLabel} · rejoignez l'épreuve au moment prévu ou rattrapez celles que vous avez manquées.
                </p>
              </div>
              <Link
                to="/schedule"
                className="text-xs font-bold text-blue-300 hover:text-white bg-blue-950/60 border border-blue-800 px-3 py-2 rounded-xl transition"
              >
                Voir l'emploi du temps
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {scheduledQuizzes.map(q => {
                const ueCode = q.ue || q.id;
                const isPassed = passedQuizIds.has(q.id);
                const notReady = !q.questionCount;
                const isUpcoming = q.launchTime > now;
                const isOpen = !isUpcoming && (!q.endTime || q.endTime >= now);
                const isMissed = !isPassed && !isUpcoming && !isOpen;

                const badge = notReady
                  ? { label: 'En préparation', cls: 'bg-slate-600/40 text-slate-300' }
                  : isUpcoming
                  ? { label: 'À venir', cls: 'bg-amber-500/20 text-amber-300' }
                  : isOpen
                  ? { label: 'En cours', cls: 'bg-emerald-500/20 text-emerald-300' }
                  : isPassed
                  ? { label: 'Passée', cls: 'bg-slate-600/40 text-slate-300' }
                  : { label: 'Manquée', cls: 'bg-red-500/20 text-red-300' };

                return (
                  <div
                    key={q.id}
                    id={`test-${q.id}`}
                    className={`bg-slate-900/80 border rounded-2xl p-4 flex flex-col justify-between gap-3 scroll-mt-24 ${
                      isOpen ? 'border-emerald-500/40' : isMissed ? 'border-red-500/30' : 'border-slate-700/80'
                    } ${focusQuizId === q.id ? 'ring-2 ring-blue-500 border-blue-500' : ''}`}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs text-slate-400">{q.filiere} · {q.niveau}</span>
                      </div>
                      <h4 className="font-black text-white text-base">{q.title || ueCode}</h4>
                      {(q.ue || q.ueLabel) && (
                        <p className="text-xs text-slate-300 mt-0.5">
                          UE {ueCode}{q.ueLabel && q.ueLabel !== ueCode ? ` · ${q.ueLabel}` : ''}
                        </p>
                      )}
                      <p className="text-[11px] text-slate-400 mt-1">
                        Début : {formatDate(q.launchTime)}
                        {q.endTime ? ` • Fin : ${formatDate(q.endTime)}` : ''}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {q.questionCount || 0} question(s)
                        {q.timePerQuestion ? ` • ${q.timePerQuestion}s / question` : ''}
                      </p>
                    </div>

                    {notReady ? (
                      <div className="w-full text-center bg-slate-800 border border-slate-700 text-slate-400 text-xs font-bold py-2.5 rounded-xl">
                        Questions en préparation
                      </div>
                    ) : isUpcoming ? (
                      <div className="w-full text-center bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold py-2.5 rounded-xl">
                        Ouverture le {formatDate(q.launchTime)}
                      </div>
                    ) : isOpen ? (
                      <button
                        onClick={() => handleStartQuiz(q.id, false)}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black py-2.5 rounded-xl transition shadow-lg shadow-emerald-500/20"
                      >
                        Rejoindre maintenant
                      </button>
                    ) : isPassed ? (
                      <Link
                        to={`/review/${q.id}`}
                        className="w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                      >
                        Relire ma copie
                      </Link>
                    ) : (
                      <button
                        onClick={() => handleStartQuiz(q.id, true)}
                        className="w-full bg-red-600 hover:bg-red-500 text-white text-xs font-black py-2.5 rounded-xl transition shadow-lg shadow-red-600/30"
                      >
                        Rattraper l'épreuve
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Section UEs et Démarrage rapide ── */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-black text-white">
                Unités d'Enseignement disponibles · {filiere} ({selectedNiveau})
              </h3>
              <p className="text-xs text-slate-400">
                Sélectionnez une matière pour lancer un entraînement ou passer l'épreuve
              </p>
            </div>
            <span className="bg-blue-600/20 text-blue-300 border border-blue-500/30 text-xs font-bold px-3 py-1 rounded-full">
              {semesterUes.length} UE(s) · {semesterLabel}
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 animate-pulse text-sm">
              Chargement des matières...
            </div>
          ) : semesterUes.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/50 rounded-2xl border border-dashed border-slate-700 text-slate-400 text-xs">
              Aucune unité d'enseignement enregistrée pour {filiere} en {selectedNiveau} ({semesterLabel.toLowerCase()}).
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {semesterUes.map(ue => {
                const { quiz, state } = getQuizState(ue.id);
                const ueTests = quizzesByUe.get(String(ue.id).toUpperCase()) || [];

                const statusMeta = {
                  none: { label: 'Non programmée', cls: 'bg-slate-600/40 text-slate-300' },
                  draft: { label: 'Brouillon', cls: 'bg-slate-600/40 text-slate-300' },
                  upcoming: { label: 'À venir', cls: 'bg-amber-500/20 text-amber-300' },
                  ongoing: { label: 'En cours', cls: 'bg-emerald-500/20 text-emerald-300' },
                  missed: { label: 'Manquée', cls: 'bg-red-500/20 text-red-300' },
                  done: { label: 'Passée', cls: 'bg-indigo-500/20 text-indigo-300' }
                }[state];

                return (
                  <div
                    key={ue.id}
                    className="bg-slate-900/70 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/50 rounded-2xl p-4 transition duration-200 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                          {filiere} • {selectedNiveau}{ue.semestre ? ` • S${ue.semestre}` : ''}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <h4 className="font-black text-white text-base mt-1">{ue.id}</h4>
                      <p className="text-xs text-slate-300 line-clamp-2 mt-0.5">
                        {ue.label || ue.id}
                      </p>

                      {/* Tous les tests de cette UE, regroupés sur la même carte */}
                      {ueTests.length > 0 && (
                        <div className="mt-2.5 space-y-1.5">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                            {ueTests.length} test(s) sur cette UE
                          </p>
                          {ueTests.map(test => {
                            const taken = myResults.find(r => (r.quizId || r.ue) === test.id);
                            const testNote = taken?.total
                              ? ((taken.score / taken.total) * 20).toFixed(1)
                              : null;
                            const isCurrent = quiz?.id === test.id;
                            return (
                              <div
                                key={test.id}
                                className={`flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 ${
                                  isCurrent
                                    ? 'bg-blue-950/40 border-blue-700/60'
                                    : 'bg-slate-950/50 border-slate-800'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block text-[11px] font-bold text-slate-200 truncate">
                                    {test.title || test.ue || test.id}
                                  </span>
                                  <span className="block text-[10px] text-slate-500">
                                    {test.launchTime ? formatDate(test.launchTime) : 'Non programmé'}
                                  </span>
                                </span>
                                {taken ? (
                                  <Link
                                    to={`/review/${test.id}`}
                                    className="shrink-0 text-[10px] font-black text-emerald-300 hover:text-emerald-200"
                                    title="Relire ma copie"
                                  >
                                    {testNote ? `${testNote}/20` : 'Relire'}
                                  </Link>
                                ) : (
                                  <span className="shrink-0 text-[10px] font-bold text-slate-500">
                                    {test.questionCount || 0} q.
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {state === 'ongoing' ? (
                      <button
                        onClick={() => handleStartQuiz(quiz.id, false)}
                        className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold py-2.5 rounded-xl transition shadow-md shadow-blue-600/20"
                      >
                        Démarrer l'épreuve
                      </button>
                    ) : state === 'done' ? (
                      <Link
                        to={`/review/${quiz.id}`}
                        className="mt-4 w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                      >
                        Relire ma copie
                      </Link>
                    ) : state === 'missed' ? (
                      <button
                        onClick={() => handleStartQuiz(quiz.id, true)}
                        className="mt-4 w-full bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold py-2.5 rounded-xl transition shadow-md shadow-red-600/20"
                      >
                        Rattraper l'épreuve
                      </button>
                    ) : state === 'upcoming' ? (
                      <div className="mt-4 w-full text-center bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold py-2.5 rounded-xl">
                        Ouverture le {formatDate(quiz.launchTime)}
                      </div>
                    ) : (() => {
                      const req = requestByUe.get(String(ue.id).toLowerCase());
                      if (req && req.status !== 'rejected') {
                        const validated = req.status === 'validated' || req.status === 'approved';
                        const percent = req.progress?.percent || 0;
                        return (
                          <div className="mt-4 space-y-2">
                            <div className="flex items-center justify-between text-[10px] font-bold">
                              <span className={validated ? 'text-emerald-300' : 'text-amber-300'}>
                                {req.status === 'approved'
                                  ? 'Demande acceptée'
                                  : validated
                                  ? 'Demande validée'
                                  : 'Demande en attente'}
                              </span>
                              <span className="text-slate-400">
                                {req.progress?.count || 0}/{req.progress?.threshold || requestThreshold}
                              </span>
                            </div>
                            <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full ${validated ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                style={{ width: `${Math.max(percent, 6)}%` }}
                              />
                            </div>
                            {!validated && (
                              <button
                                onClick={copyReferralLink}
                                disabled={!referralLink}
                                className="w-full bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-50 text-amber-200 border border-amber-500/30 text-[11px] font-bold py-2 rounded-xl transition"
                              >
                                {copiedReferral ? 'Lien copié !' : 'Inviter des camarades'}
                              </button>
                            )}
                          </div>
                        );
                      }
                      return (
                        <button
                          onClick={() => submitQuizRequest(ue.id, ue.label)}
                          disabled={requestBusy === ue.id}
                          className="mt-4 w-full bg-blue-950/60 hover:bg-blue-900 disabled:opacity-50 text-blue-200 border border-blue-800/80 text-[11px] font-bold py-2.5 rounded-xl transition"
                        >
                          {requestBusy === ue.id ? 'Envoi…' : 'Demander ce QCM'}
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Demandes de QCM & parrainage ── */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-6 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Icon name="users" size={18} className="text-blue-400" />
                Demandes de QCM & parrainage
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Une épreuve manque pour votre parcours ? Demandez-la. À {requestThreshold} demandes
                pour la même filière, le même niveau et la même UE, elle est validée auprès de l'administration.
              </p>
            </div>
            {referral?.privileges?.badge && (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/15 text-amber-200 border border-amber-500/30 text-[11px] font-black px-3 py-1.5 rounded-full">
                <Icon name="trophy" size={13} />
                {referral.privileges.badge}
              </span>
            )}
          </div>

          {requestNotice && (
            <div className="bg-emerald-950/50 border border-emerald-800/70 text-emerald-200 text-xs rounded-xl p-3 flex items-start gap-2">
              <Icon name="check-circle" size={15} className="mt-0.5" />
              <span>{requestNotice}</span>
            </div>
          )}
          {requestError && (
            <div className="bg-red-950/50 border border-red-800/70 text-red-200 text-xs rounded-xl p-3 flex items-start gap-2">
              <Icon name="alert" size={15} className="mt-0.5" />
              <span>{requestError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                Votre lien de parrainage
              </p>
              {referralLink ? (
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={referralLink}
                    onFocus={(e) => e.target.select()}
                    className="flex-1 min-w-0 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-[11px] text-slate-300"
                  />
                  <button
                    onClick={copyReferralLink}
                    className="shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black px-3 py-2 rounded-xl transition"
                  >
                    {copiedReferral ? 'Copié !' : 'Copier'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Lien indisponible pour le moment.</p>
              )}
              <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-400">
                <span>
                  Code : <strong className="text-slate-200">{referral?.code || '—'}</strong>
                </span>
                <span>
                  Filleuls : <strong className="text-slate-200">{referral?.privileges?.referralCount || 0}</strong>
                </span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                1 filleul = badge Ambassadeur · 3 filleuls = priorité sur la plateforme.
              </p>
            </div>

            <div className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-4">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 mb-2">
                Vos demandes en cours
              </p>
              {quizRequests.filter((r) => r.status !== 'rejected').length === 0 ? (
                <p className="text-xs text-slate-500">
                  Aucune demande active. Utilisez « Demander ce QCM » sur une UE non programmée.
                </p>
              ) : (
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {quizRequests.filter((r) => r.status !== 'rejected').map((r) => {
                    const validated = r.status === 'validated' || r.status === 'approved';
                    return (
                      <div key={r.id}>
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-slate-200 truncate">
                            {r.ue}{r.ueLabel ? ` · ${r.ueLabel}` : ''}
                          </span>
                          <span className={validated ? 'text-emerald-300' : 'text-amber-300'}>
                            {r.status === 'approved' ? 'Acceptée' : validated ? 'Validée' : 'En attente'}
                          </span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div
                            className={`h-full ${validated ? 'bg-emerald-500' : 'bg-amber-500'}`}
                            style={{ width: `${Math.max(r.progress?.percent || 0, 6)}%` }}
                          />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {r.progress?.count || 0}/{r.progress?.threshold || requestThreshold} demandes
                          {!validated && r.progress?.remaining
                            ? ` · encore ${r.progress.remaining}`
                            : ''}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Mes QCM Passés STRICTEMENT CET UTILISATEUR (Point 2) ── */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-black text-white">
                Mes Évaluations Passées ({myResults.length})
              </h3>
              <p className="text-xs text-slate-400">
                Historique exclusif de vos copies et notes · {currentUser.name}
              </p>
            </div>
          </div>

          {myResults.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/50 rounded-2xl border border-dashed border-slate-700 text-slate-400 text-xs">
              Vous n'avez pas encore passé de QCM sur votre compte.
            </div>
          ) : (
            <div className="space-y-2.5">
              {myResults.map(res => {
                const note20 = res.total ? ((res.score / res.total) * 20).toFixed(1) : '-';
                const isGood = parseFloat(note20) >= 10;
                const linkedQuiz = allQuizzes.find(q => q.id === (res.quizId || res.ue));
                const resultLabel = res.quizTitle || linkedQuiz?.title || res.ue;
                return (
                  <div
                    key={res.id}
                    className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-600 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-black text-white text-base">{resultLabel}</span>
                        {res.isMakeup && (
                          <span className="bg-purple-500/20 text-purple-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                            Rattrapage
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          UE {res.ue}{linkedQuiz?.ueLabel ? ` · ${linkedQuiz.ueLabel}` : ''} · {res.filiere} {res.niveau}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">
                        Passé le {formatDate(res.date)}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-auto">
                      <div className="text-right">
                        <div className={`text-xl font-black ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                          {note20}/20
                        </div>
                        <div className="text-xs text-slate-400">
                          Score : {res.score} / {res.total}
                        </div>
                      </div>

                      <Link
                        to={`/review/${res.quizId || res.ue}`}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold px-4 py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20 shrink-0"
                      >
                        Relire ma copie
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Classement de ma salle (chargé uniquement après clic) ── */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-lg font-black text-white flex items-center gap-2">
                <Icon name="trophy" size={18} className="text-amber-400" />
                Classement
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Votre salle : <strong className="text-slate-200">{filiere} · {selectedNiveau}</strong>.
                Chaque étudiant est classé sur sa meilleure tentative, par épreuve et par session.
              </p>
            </div>
            <button
              onClick={toggleRankings}
              className={`shrink-0 inline-flex items-center gap-1.5 text-xs font-black px-4 py-2.5 rounded-xl transition border ${
                showRankings
                  ? 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-800'
                  : 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
              }`}
            >
              <Icon name={showRankings ? 'close' : 'trophy'} size={13} />
              {showRankings ? 'Masquer le classement' : 'Classement'}
            </button>
          </div>

          {showRankings && (
            <div className="mt-5">
              {loadingRankings ? (
                <p className="text-xs text-slate-500 text-center py-8 animate-pulse">
                  Chargement du classement…
                </p>
              ) : rankingsError ? (
                <p className="text-xs text-red-400 text-center py-8">{rankingsError}</p>
              ) : rankings.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">
                  Aucune copie corrigée pour votre salle pour le moment.
                </p>
              ) : (
                <div className="space-y-4">
                  {rankings.map(group => (
                    <div
                      key={group.key}
                      className="bg-slate-900/70 border border-slate-700/80 rounded-2xl overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                        <div>
                          <p className="text-sm font-black text-white">{group.quizTitle || group.ue}</p>
                          <p className="text-[11px] text-slate-500">
                            UE {group.ue} · {group.salle} · {formatDate(group.sessionTimestamp)}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-blue-600/15 text-blue-300 border border-blue-600/30">
                          {group.count} étudiant(s) · moyenne {Number(group.averageNote).toFixed(2)}/20
                        </span>
                      </div>

                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr className="bg-slate-950/80 border-b border-slate-800 text-slate-500 uppercase text-[10px] tracking-wider">
                              <th className="py-2 px-4 text-left">Rang</th>
                              <th className="py-2 px-4 text-left">Étudiant</th>
                              <th className="py-2 px-4 text-right">Score</th>
                              <th className="py-2 px-4 text-right">Note /20</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800">
                            {group.participants.map(p => {
                              const rankCls = p.rank === 1
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : p.rank === 2
                                  ? 'bg-slate-400/20 text-slate-200 border-slate-400/40'
                                  : p.rank === 3
                                    ? 'bg-orange-600/20 text-orange-300 border-orange-600/40'
                                    : 'bg-slate-800 text-slate-400 border-slate-700';
                              return (
                                <tr
                                  key={`${group.key}-${p.rank}-${p.name}`}
                                  className={p.isMe ? 'bg-blue-600/10' : ''}
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
                                  <td className="py-2.5 px-4 text-right text-slate-400 font-bold">
                                    {p.score}/{p.total}
                                  </td>
                                  <td className="py-2.5 px-4 text-right font-black text-white">
                                    {Number(p.note).toFixed(2)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* ── Modal de Confirmation avant début de test ── */}
      {showStartWarning && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-3xl max-w-sm w-full p-6 text-slate-100 shadow-2xl shadow-black/50 border border-slate-800 text-center">
            <div className="w-14 h-14 rounded-2xl bg-blue-600/15 border border-blue-600/30 text-blue-400 flex items-center justify-center mx-auto mb-4">
              <Icon name={startAsMakeup ? 'refresh' : 'play'} size={26} />
            </div>
            <h3 className="text-xl font-black text-white">
              {startAsMakeup ? "Rattrapage de l'épreuve" : "Prêt pour l'épreuve ?"}
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Vous allez démarrer le test pour l'UE :
            </p>
            <div className="my-3 py-2 px-3 bg-blue-950/60 border border-blue-900 text-blue-300 font-black rounded-xl text-lg">
              {selectedUeForStart}
            </div>
            <div className="bg-amber-950/50 border border-amber-800 rounded-xl p-3 text-left text-xs text-amber-300 space-y-1 mb-5">
              <p>• Candidat : <strong>{currentUser.name}</strong></p>
              <p>• Filière : <strong>{filiere}</strong> ({selectedNiveau})</p>
              <p>• Les questions et réponses sont mélangées automatiquement.</p>
              {startAsMakeup && <p className="font-bold text-red-400">• Mode rattrapage activé.</p>}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowStartWarning(false)}
                className="flex-1 py-3 border border-slate-700 text-slate-300 font-bold rounded-xl text-xs hover:bg-slate-800 transition"
              >
                Annuler
              </button>
              <button
                onClick={confirmStartQuiz}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-xl text-xs transition shadow-lg shadow-blue-600/25"
              >
                Commencer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Contacter Admin (Point 5) ── */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <ContactAdmin onClose={() => setShowContactModal(false)} />
        </div>
      )}
    </div>
  );
}
