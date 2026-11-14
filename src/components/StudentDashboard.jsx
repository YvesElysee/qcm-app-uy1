import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api';
import { getCurrentUser } from '../services/authService';
import ContactAdmin from './ContactAdmin';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';

const NIVEAUX = ['L1', 'L2', 'L3', 'M1', 'M2'];

export default function StudentDashboard() {
  const navigate = useNavigate();
  const [currentUser, setCurrentUser] = useState(getCurrentUser());

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

  // Filière fixe de l'étudiant
  const filiere = currentUser?.filiere || 'Informatique';
  const registeredNiveau = currentUser?.niveau || 'L1';

  // Niveau actif sélectionné (par défaut celui de l'inscription)
  const [selectedNiveau, setSelectedNiveau] = useState(registeredNiveau);

  // Données
  const [availableUes, setAvailableUes] = useState([]);
  const [allQuizzes, setAllQuizzes] = useState([]);
  const [otherLevelQuizzes, setOtherLevelQuizzes] = useState([]);
  const [myResults, setMyResults] = useState([]);
  const [reviewStats, setReviewStats] = useState(null);
  const [nowTs, setNowTs] = useState(0);
  const [loading, setLoading] = useState(true);

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
      const [uesData, quizzesData, resultsData, reviewData] = await Promise.all([
        api(`/ues?filiere=${encodeURIComponent(filiere)}&niveau=${encodeURIComponent(selectedNiveau)}`),
        api(`/quizzes?filiere=${encodeURIComponent(filiere)}&sort=asc`),
        api('/results/mine', { auth: 'student' }).catch(() => ({ results: [] })),
        api('/review/stats', { auth: 'student' }).catch(() => null)
      ]);

      setAvailableUes(uesData.ues);
      setReviewStats(reviewData);
      // Épreuves du niveau actif + celles des autres niveaux (simplement signalées)
      setAllQuizzes(quizzesData.quizzes.filter(q => q.niveau === selectedNiveau));
      setOtherLevelQuizzes(
        quizzesData.quizzes.filter(q => q.niveau && q.niveau !== selectedNiveau && q.launchTime)
      );
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
  }, [currentUser, filiere, selectedNiveau]);

  useEffect(() => {
    const load = async () => { await loadData(); };
    load();
  }, [loadData]);

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
      const data = await api(
        `/results/ranking?niveau=${encodeURIComponent(selectedNiveau)}`,
        { auth: 'student' }
      );
      setRankings(Array.isArray(data.groups) ? data.groups : []);
    } catch (err) {
      setRankingsError(err.message || 'Classement momentanément indisponible.');
      setRankings([]);
    } finally {
      setLoadingRankings(false);
    }
  };

  // ── Calcul des sous-groupes de QCM ──
  const now = nowTs;
  const passedQuizIds = new Set(myResults.map(r => r.ue));

  // Une seule épreuve par UE : on relie chaque matière à son QCM programmé
  const quizByUe = new Map();
  allQuizzes.forEach(q => {
    const key = q.ue || q.id;
    if (!quizByUe.has(key)) quizByUe.set(key, q);
  });

  // Toutes les épreuves programmées (date renseignée), triées chronologiquement
  const scheduledQuizzes = allQuizzes
    .filter(q => q.launchTime)
    .sort((a, b) => a.launchTime - b.launchTime);

  // 1. Quizz à venir (launchTime > now)
  const upcomingQuizzes = scheduledQuizzes.filter(q => q.launchTime > now);

  // État d'une épreuve pour l'affichage de la carte UE
  const getQuizState = (ueCode) => {
    const quiz = quizByUe.get(ueCode);
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
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-16">
      {/* ── Main Content ── */}
      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        {/* ── Bandeau Profil & Filière Cadenassée (Point 3) ── */}
        <div className="bg-gradient-to-r from-blue-900/60 via-indigo-900/50 to-slate-900 border border-blue-500/20 rounded-3xl p-6 shadow-xl relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-extrabold uppercase tracking-wider text-blue-400">
                  Espace Personnel
                </span>
                <span className="text-slate-600">•</span>
                <span className="text-xs text-slate-300 font-medium">{currentUser.anneeAcademique || '2025-2026'}</span>
              </div>
              <h2 className="text-2xl font-black text-white">
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

            {/* Sélecteur de niveau de la filière (Point 3) */}
            <div className="bg-slate-950/60 p-3 rounded-2xl border border-slate-800 text-right">
              <span className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 text-left">
                Niveau actif de la filière :
              </span>
              <div className="flex gap-1.5">
                {NIVEAUX.map(niv => {
                  const isCurrent = selectedNiveau === niv;
                  const isReg = registeredNiveau === niv;
                  return (
                    <button
                      key={niv}
                      onClick={() => {
                        setSelectedNiveau(niv);
                        setShowRankings(false);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black transition relative ${
                        isCurrent
                          ? 'bg-blue-600 text-white shadow-md shadow-blue-500/30'
                          : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                      }`}
                    >
                      {niv}
                      {isReg && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-slate-900" title="Votre niveau d'inscription" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* ── Révisions intelligentes (répétition espacée) ── */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border ${
              (reviewStats?.due || 0) > 0
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-blue-500/15 border-blue-500/30 text-blue-400'
            }`}>
              <Icon name="sparkles" size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-white">Révisions intelligentes</h3>
                {(reviewStats?.due || 0) > 0 && (
                  <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {reviewStats.due} carte(s) à réviser
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {reviewStats?.total
                  ? `${reviewStats.total} question(s) issue(s) de vos erreurs, planifiées par répétition espacée.`
                  : 'Les questions ratées lors de vos QCM seront ajoutées ici automatiquement.'}
              </p>
              {reviewStats?.nextDueAt && (
                <p className="text-[11px] text-slate-500 mt-1">
                  Prochaine échéance : {formatDate(reviewStats.nextDueAt)}
                </p>
              )}
            </div>
          </div>
          <Link
            to="/revision"
            className="shrink-0 inline-flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-md shadow-emerald-600/20"
          >
            <Icon name="refresh" size={13} />
            {(reviewStats?.due || 0) > 0 ? 'Réviser maintenant' : 'Ouvrir mes révisions'}
          </Link>
        </div>

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
                  QCM {nextQuiz.ue || nextQuiz.id} · {nextQuiz.filiere} ({nextQuiz.niveau})
                </h3>
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
                  {filiere} • {selectedNiveau} · rejoignez l'épreuve au moment prévu ou rattrapez celles que vous avez manquées.
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
                const isPassed = passedQuizIds.has(q.id) || passedQuizIds.has(ueCode);
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
                    className={`bg-slate-900/80 border rounded-2xl p-4 flex flex-col justify-between gap-3 ${
                      isOpen ? 'border-emerald-500/40' : isMissed ? 'border-red-500/30' : 'border-slate-700/80'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                        <span className="text-xs text-slate-400">{q.filiere} · {q.niveau}</span>
                      </div>
                      <h4 className="font-black text-white text-base">{ueCode}</h4>
                      {q.ueLabel && q.ueLabel !== ueCode && (
                        <p className="text-xs text-slate-300 mt-0.5">{q.ueLabel}</p>
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
                        to={`/review/${ueCode}`}
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

        {/* ── Épreuves des autres niveaux de la même filière (information) ── */}
        {otherLevelQuizzes.length > 0 && (
          <div className="bg-slate-800/40 border border-slate-700/60 rounded-3xl p-5">
            <div className="flex items-start gap-3">
              <span className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center shrink-0">
                <Icon name="info" size={17} />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-black text-white">
                  Autres épreuves programmées en {filiere} ({otherLevelQuizzes.length})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vous consultez le niveau {selectedNiveau}. D'autres épreuves sont programmées dans les niveaux suivants :
                </p>
                <div className="flex flex-wrap gap-2 mt-2.5">
                  {[...new Set(otherLevelQuizzes.map(q => q.niveau))]
                    .sort((a, b) => a.localeCompare(b, 'fr'))
                    .map(niv => {
                      const count = otherLevelQuizzes.filter(q => q.niveau === niv).length;
                      return (
                        <button
                          key={niv}
                          onClick={() => {
                        setSelectedNiveau(niv);
                        setShowRankings(false);
                      }}
                          className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/50 text-slate-200 text-xs font-bold px-3 py-1.5 rounded-xl transition"
                        >
                          <Icon name="graduation" size={13} className="text-blue-400" />
                          Niveau {niv}
                          <span className="text-slate-500">({count})</span>
                        </button>
                      );
                    })}
                </div>
              </div>
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
              {availableUes.length} UE(s) répertoriée(s)
            </span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-slate-500 animate-pulse text-sm">
              Chargement des matières...
            </div>
          ) : availableUes.length === 0 ? (
            <div className="text-center py-10 bg-slate-900/50 rounded-2xl border border-dashed border-slate-700 text-slate-400 text-xs">
              Aucune unité d'enseignement enregistrée pour {filiere} en {selectedNiveau}.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {availableUes.map(ue => {
                const { quiz, state } = getQuizState(ue.id);
                const passedResult = myResults.find(r => r.ue === ue.id);

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
                          {filiere} • {selectedNiveau}
                        </span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${statusMeta.cls}`}>
                          {statusMeta.label}
                        </span>
                      </div>
                      <h4 className="font-black text-white text-base mt-1">{ue.id}</h4>
                      <p className="text-xs text-slate-300 line-clamp-2 mt-0.5">
                        {ue.label || ue.id}
                      </p>
                      {quiz?.launchTime && (
                        <p className="text-[11px] text-slate-400 mt-1">
                          {state === 'upcoming' ? 'Prévue' : 'Programmée'} : {formatDate(quiz.launchTime)}
                        </p>
                      )}
                      {passedResult && (
                        <p className="text-[11px] text-emerald-300 mt-1 font-bold">
                          Note : {passedResult.total ? ((passedResult.score / passedResult.total) * 20).toFixed(1) : '-'}/20
                          {passedResult.isMakeup ? ' (rattrapage)' : ''}
                        </p>
                      )}
                    </div>

                    {state === 'ongoing' ? (
                      <button
                        onClick={() => handleStartQuiz(ue.id, false)}
                        className="mt-4 w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold py-2.5 rounded-xl transition shadow-md shadow-blue-600/20"
                      >
                        Démarrer l'épreuve
                      </button>
                    ) : state === 'done' ? (
                      <Link
                        to={`/review/${ue.id}`}
                        className="mt-4 w-full text-center bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-extrabold py-2.5 rounded-xl transition shadow-md shadow-indigo-600/20"
                      >
                        Relire ma copie
                      </Link>
                    ) : state === 'missed' ? (
                      <button
                        onClick={() => handleStartQuiz(ue.id, true)}
                        className="mt-4 w-full bg-red-600 hover:bg-red-500 text-white text-xs font-extrabold py-2.5 rounded-xl transition shadow-md shadow-red-600/20"
                      >
                        Rattraper l'épreuve
                      </button>
                    ) : state === 'upcoming' ? (
                      <div className="mt-4 w-full text-center bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold py-2.5 rounded-xl">
                        Ouverture le {formatDate(quiz.launchTime)}
                      </div>
                    ) : (
                      <div className="mt-4 w-full text-center bg-slate-800 border border-slate-700 text-slate-400 text-[11px] font-bold py-2.5 rounded-xl">
                        Épreuve non programmée
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
                return (
                  <div
                    key={res.id}
                    className="bg-slate-900/70 border border-slate-700/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-600 transition"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-white text-base">{res.ue}</span>
                        {res.isMakeup && (
                          <span className="bg-purple-500/20 text-purple-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                            Rattrapage
                          </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {res.filiere} · {res.niveau}
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
                        to={`/review/${res.ue}`}
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
                          <p className="text-sm font-black text-white">{group.ue}</p>
                          <p className="text-[11px] text-slate-500">
                            {group.salle} · {formatDate(group.sessionTimestamp)}
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
