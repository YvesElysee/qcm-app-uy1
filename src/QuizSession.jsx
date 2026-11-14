import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from './services/api';
import Icon from './components/ui/icons.jsx';

// Shuffle déterministe par seed (nom étudiant)
function seededShuffle(arr, seed) {
  const a = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const STORAGE_KEY = (quizId, name) => `qcm_progress_v2_${quizId}_${name}`;
const MAX_VIOLATIONS = 3;

export default function QuizSession() {
  const { quizId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [correctedAnswers, setCorrectedAnswers] = useState([]);
  const [responses, setResponses] = useState({}); // { [questionId]: option choisie }

  const [selectedOption, setSelectedOption] = useState(null);

  const [phase, setPhase] = useState('loading');
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [participants, setParticipants] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [quizMeta, setQuizMeta] = useState(null);
  const [accessError, setAccessError] = useState('');
  const [resultError, setResultError] = useState('');

  // Anti-triche
  const [violations, setViolations] = useState(0);
  const [warningMessage, setWarningMessage] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);

  const submitted = useRef(false);
  const timerInterval = useRef(null);
  const lastValidatedRef = useRef(-1);
  const responsesRef = useRef({});
  const phaseRef = useRef(phase);
  const violationsRef = useRef(0);
  const fullscreenRef = useRef(false);

  const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
  const safeName = (user.name || 'Anonyme').trim();
  const urlParams = new URLSearchParams(window.location.search);
  const isMakeupMode = urlParams.get('mode') === 'rattrapage' || !!user.isMakeup;
  const [makeupEndTime, setMakeupEndTime] = useState(null);
  const sessionIdRef = useRef(null);
  const storageKey = STORAGE_KEY(quizId, safeName);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // ── Chargement des questions ─────────────────────────────────────────
  const loadFresh = useCallback(async () => {
    // Le serveur ne renvoie jamais la correction et applique le tirage
    // aléatoire propre à l'étudiant connecté.
    const data = await api(`/quizzes/${quizId}/questions`, { auth: 'student' });
    const raw = data.questions.map((question) => {
      const q = { ...question };
      ['Question', 'OptA', 'OptB', 'OptC', 'OptD'].forEach(k => {
        if (q[k]) q[k] = q[k].trim();
      });
      return q;
    });
    return seededShuffle(raw, safeName);
  }, [quizId, safeName]);

  useEffect(() => {
    const init = async () => {
      let meta;
      try {
        const data = await api(`/quizzes/${quizId}`);
        meta = data.quiz;
      } catch {
        setAccessError("Cette épreuve est introuvable ou a été retirée de la plateforme.");
        return;
      }

      // Une épreuve non programmée (ou sans questions) n'est pas accessible aux étudiants.
      // L'admin conserve un aperçu via son jeton de session.
      const isAdminPreview = !!sessionStorage.getItem('adminToken');
      if (!meta.launchTime && !isAdminPreview) {
        setAccessError("Cette épreuve n'est pas encore programmée. Consultez l'emploi du temps pour connaître la date d'ouverture.");
        return;
      }
      if (!meta.questionCount) {
        setAccessError("Les questions de cette épreuve ne sont pas encore disponibles. Réessayez plus tard.");
        return;
      }

      setQuizMeta(meta);

      if (meta.endTime && meta.launchTime) {
        const duration = meta.endTime - meta.launchTime;
        if ((isMakeupMode || Date.now() > meta.endTime) && duration > 0) {
          setMakeupEndTime(Date.now() + duration);
        }
      }

      // Reprise d'une session sauvegardée
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        try {
          const { qs, idx, responses: savedResponses, ans, quizSession } = JSON.parse(saved);
          if (qs && quizSession === (meta.launchTime || 0)) {
            const restored = savedResponses || {};
            if (!savedResponses && Array.isArray(ans)) {
              ans.forEach((a) => {
                if (a?.questionId != null) restored[a.questionId] = a.selected || a.chosen || '';
              });
            }
            responsesRef.current = restored;
            setResponses(restored);
            setQuestions(qs);
            setCurrentIndex(idx || 0);
            setPhase(meta.launchTime && meta.launchTime > Date.now() ? 'waiting' : 'quiz');
            return;
          }
        } catch { /* ignore */ }
      }

      const qs = await loadFresh();
      setQuestions(qs);
      setPhase(meta.launchTime && meta.launchTime > Date.now() ? 'waiting' : 'quiz');
    };
    init();
  }, [quizId, loadFresh, storageKey, isMakeupMode]);

  // ── Sauvegarde de progression ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || questions.length === 0) return;
    localStorage.setItem(storageKey, JSON.stringify({
      qs: questions, idx: currentIndex, responses,
      quizSession: quizMeta?.launchTime || 0
    }));
  }, [currentIndex, phase, responses, questions, quizMeta?.launchTime, storageKey]);

  // ── Salle d'attente ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'waiting' || !quizMeta?.launchTime) return;
    const iv = setInterval(() => {
      const dist = quizMeta.launchTime - Date.now();
      if (dist <= 0) {
        clearInterval(iv);
        setCountdown(0);
        setPhase('quiz');
      } else {
        setCountdown(dist);
      }
    }, 500);
    return () => clearInterval(iv);
  }, [phase, quizMeta]);

  // ── Présence participants (heartbeat + polling) ──────────────────────
  useEffect(() => {
    if (phase !== 'quiz') return;
    if (sessionIdRef.current === null) {
      sessionIdRef.current = `${safeName}_${Date.now()}`;
    }
    const sid = sessionIdRef.current;
    let active = true;

    const beat = async () => {
      try {
        const r = await api(`/quizzes/${quizId}/sessions`, {
          method: 'POST',
          body: { sid, name: safeName }
        });
        if (active) setParticipants(r.participants);
      } catch { /* compteur non critique */ }
    };
    beat();
    const iv = setInterval(beat, 8000);

    return () => {
      active = false;
      clearInterval(iv);
      api(`/quizzes/${quizId}/sessions/${sid}`, { method: 'DELETE' }).catch(() => {});
    };
  }, [phase, quizId, safeName]);

  // ── Soumission finale (correction côté serveur) ──────────────────────
  const finalSubmit = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    clearInterval(timerInterval.current);
    localStorage.removeItem(storageKey);

    // Inclut le choix en cours même s'il n'a pas été validé.
    const current = questions[currentIndex];
    const allResponses = { ...responsesRef.current };
    if (phaseRef.current === 'quiz' && current?.id != null && selectedOption) {
      allResponses[current.id] = selectedOption;
    }

    const payload = questions.map(q => ({
      questionId: q.id,
      selected: allResponses[q.id] || ''
    }));

    setPhase('submitting');

    try {
      const res = await api('/results', {
        method: 'POST',
        auth: 'student',
        body: {
          ue: quizId,
          filiere: quizMeta?.filiere || '',
          niveau: quizMeta?.niveau || '',
          questionIds: questions.map(q => q.id),
          answers: payload,
          sessionTimestamp: quizMeta?.launchTime || 0,
          isMakeup: isMakeupMode
        }
      });

      setScore(res.score || 0);
      setTotal(res.total || payload.length);
      setCorrectedAnswers(Array.isArray(res.answers) ? res.answers : []);
      setResultError('');

      const histKey = `qcm_history_${safeName}`;
      const existing = JSON.parse(localStorage.getItem(histKey) || '[]');
      const entry = {
        quizId,
        filiere: quizMeta?.filiere || '', niveau: quizMeta?.niveau || '',
        score: res.score || 0, total: res.total || payload.length,
        date: new Date().toISOString(), sessionTimestamp: quizMeta?.launchTime || 0
      };
      localStorage.setItem(histKey, JSON.stringify(
        [entry, ...existing.filter(e => !(e.quizId === quizId && e.sessionTimestamp === entry.sessionTimestamp))].slice(0, 50)
      ));
    } catch (err) {
      console.warn('Enregistrement du résultat impossible :', err.message);
      setResultError(err.message);
      setScore(0);
      setTotal(payload.length);
      // Même si la copie n'a pas pu être enregistrée, l'étudiant peut revoir
      // les cases qu'il a cochées (sans la correction serveur).
      setCorrectedAnswers(questions.map((q) => ({
        questionId: q.id,
        question: q.Question,
        options: {
          OptA: q.OptA || '',
          OptB: q.OptB || '',
          OptC: q.OptC || '',
          OptD: q.OptD || ''
        },
        selected: allResponses[q.id] || '',
        correct: '',
        isOk: false
      })));
    } finally {
      setPhase('finished');
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    }
  }, [quizId, safeName, questions, currentIndex, selectedOption, quizMeta, storageKey, isMakeupMode]);

  const handleValidate = useCallback((forced = false) => {
    if (lastValidatedRef.current === currentIndex) return;
    lastValidatedRef.current = currentIndex;
    clearInterval(timerInterval.current);

    const q = questions[currentIndex];
    const chosen = forced ? '' : (selectedOption || '');
    if (q?.id != null) {
      const nextResponses = { ...responsesRef.current, [q.id]: chosen };
      responsesRef.current = nextResponses;
      setResponses(nextResponses);
    }

    setSelectedOption('');

    // Aucun feedback intermédiaire : la correction n'apparaît qu'à la fin.
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(i => i + 1);
      setTimeLeft(quizMeta?.timePerQuestion ? quizMeta.timePerQuestion * 1000 : null);
    } else {
      finalSubmit();
    }
  }, [currentIndex, questions, selectedOption, quizMeta, finalSubmit]);

  // ── Timer par question ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || !quizMeta?.timePerQuestion || quizMeta.timePerQuestion <= 0) return;

    clearInterval(timerInterval.current);
    const ms = quizMeta.timePerQuestion * 1000;
    timerInterval.current = setInterval(() => {
      setTimeLeft(prev => {
        const next = (prev === null ? ms : prev) - 500;
        if (next <= 0) {
          clearInterval(timerInterval.current);
          return 0;
        }
        return next;
      });
    }, 500);
    return () => clearInterval(timerInterval.current);
  }, [phase, currentIndex, quizMeta]);

  useEffect(() => {
    if (timeLeft === 0 && phase === 'quiz') {
      const id = setTimeout(() => handleValidate(true), 0);
      return () => clearTimeout(id);
    }
  }, [timeLeft, phase, handleValidate]);

  // ── Soumission à endTime (Officielle ou Rattrapage) ───────────────────
  useEffect(() => {
    if (phase !== 'quiz') return;
    const effectiveEndTime = makeupEndTime || (!isMakeupMode && quizMeta?.endTime > Date.now() ? quizMeta.endTime : null);
    if (!effectiveEndTime) return;

    const msLeft = effectiveEndTime - Date.now();
    if (msLeft <= 0) {
      if (!submitted.current) finalSubmit();
      return;
    }
    const t = setTimeout(() => {
      if (!submitted.current) finalSubmit();
    }, msLeft);
    return () => clearTimeout(t);
  }, [phase, quizMeta, makeupEndTime, isMakeupMode, finalSubmit]);

  // ── Classement (polling toutes les 3s) ───────────────────────────────
  useEffect(() => {
    if (phase !== 'finished' || !quizMeta) return;
    const sessionTimestamp = quizMeta.launchTime || 0;
    let active = true;

    const load = async () => {
      try {
        const data = await api(`/results?ue=${encodeURIComponent(quizId)}&sessionTimestamp=${sessionTimestamp}`);
        if (!active) return;
        setLeaderboard(data.results.slice().sort((a, b) => b.score - a.score));
      } catch { /* classement non critique */ }
    };
    load();
    const iv = setInterval(load, 3000);
    return () => { active = false; clearInterval(iv); };
  }, [phase, quizId, quizMeta]);

  // ── Anti-triche ──────────────────────────────────────────────────────
  const registerViolation = useCallback((message) => {
    if (phaseRef.current !== 'quiz' || submitted.current) return;
    const next = violationsRef.current + 1;
    violationsRef.current = next;
    setViolations(next);
    setWarningMessage(message);
    if (next >= MAX_VIOLATIONS) {
      setWarningMessage('Trop d\'infractions détectées. Votre copie est soumise automatiquement.');
      finalSubmit();
    }
  }, [finalSubmit]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
        fullscreenRef.current = true;
        setIsFullscreen(true);
      } else {
        fullscreenRef.current = false;
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {
      registerViolation("Le plein écran n'a pas pu être activé. Vous pouvez continuer normalement.");
    }
  }, [registerViolation]);

  useEffect(() => {
    if (phase !== 'quiz') return;

    const onVisibility = () => {
      if (document.hidden) {
        registerViolation("Changement d'onglet détecté. Restez sur la page de l'épreuve.");
      }
    };
    const block = (e) => {
      e.preventDefault();
      const labels = {
        copy: 'Copie de contenu bloquée pendant l\'épreuve.',
        cut: 'Copie de contenu bloquée pendant l\'épreuve.',
        paste: 'Collage de contenu bloqué pendant l\'épreuve.',
        contextmenu: 'Menu contextuel désactivé pendant l\'épreuve.'
      };
      registerViolation(labels[e.type] || 'Action non autorisée pendant l\'épreuve.');
    };
    const onFullscreenChange = () => {
      const active = !!document.fullscreenElement;
      setIsFullscreen(active);
      if (active) {
        fullscreenRef.current = true;
      } else if (fullscreenRef.current) {
        fullscreenRef.current = false;
        registerViolation('Sortie du plein écran détectée.');
      }
    };
    const onBeforeUnload = (e) => {
      if (submitted.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('paste', block);
    document.addEventListener('contextmenu', block);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('paste', block);
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [phase, registerViolation]);

  useEffect(() => {
    if (!warningMessage) return;
    const t = setTimeout(() => setWarningMessage(''), 9000);
    return () => clearTimeout(t);
  }, [warningMessage]);

  // ── Sélection d'une option ───────────────────────────────────────────
  const handleOptionClick = useCallback((opt) => {
    setSelectedOption(opt);
  }, []);

  // ── Feedback à l'admin (depuis l'écran de fin de QCM) ────────────────
  const sendFeedback = useCallback(async () => {
    if (!feedbackMsg.trim()) return;
    try {
      await api('/feedback', {
        method: 'POST',
        auth: 'student',
        body: {
          ue: quizId,
          filiere: quizMeta?.filiere || '',
          niveau: quizMeta?.niveau || '',
          message: feedbackMsg.trim()
        }
      });
      setFeedbackSent(true);
    } catch (e) {
      console.error(e);
    }
  }, [feedbackMsg, quizId, quizMeta]);

  // ── Utils ────────────────────────────────────────────────────────────
  const fmtMs = (ms) => {
    if (!ms || ms < 0) return '00:00';
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const h = Math.floor(ms / 3600000);
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };
  const timerPct = (timeLeft && quizMeta?.timePerQuestion)
    ? Math.max(0, (timeLeft / (quizMeta.timePerQuestion * 1000)) * 100) : 100;
  const timerColor = timerPct > 50 ? 'bg-green-500' : timerPct > 20 ? 'bg-yellow-500' : 'bg-red-500';

  // ─────────────────────────── RENDUS ─────────────────────────────────

  if (accessError) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md text-center">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center mb-4">
          <Icon name="lock" size={22} />
        </div>
        <h1 className="text-xl font-black text-white mb-2">Épreuve indisponible</h1>
        <p className="text-sm text-slate-400 mb-5">{accessError}</p>
        <Link
          to="/schedule"
          className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-sm px-4 py-2.5 rounded-xl transition"
        >
          <Icon name="calendar" size={15} />
          Voir l'emploi du temps
        </Link>
      </div>
    </div>
  );

  if (phase === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-white text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-300">Chargement de l'epreuve...</p>
      </div>
    </div>
  );

  if (phase === 'submitting') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-md text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-5"></div>
        <h1 className="text-xl font-black text-white mb-2">Correction en cours</h1>
        <p className="text-sm text-slate-400">
          Vos réponses sont transmises au serveur. La correction et votre note seront affichées dans un instant.
        </p>
      </div>
    </div>
  );

  if (phase === 'waiting') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-black mb-1 text-blue-400">Salle d'attente</h1>
        <p className="text-slate-400 mb-2 text-sm">{quizId}</p>
        <p className="text-slate-400 mb-8 text-sm">L'evaluation demarre dans :</p>
        <div className="text-7xl font-mono bg-slate-800 px-8 py-6 rounded-2xl shadow-2xl border border-slate-700 tracking-wider mb-6">{fmtMs(countdown)}</div>
        <div className="flex items-center justify-center gap-2 text-emerald-400 animate-pulse font-semibold text-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          Synchronisation en temps reel active
        </div>
      </div>
    </div>
  );

  if (phase === 'finished') {
    const myEntry = leaderboard.find(e => e.name === safeName);
    const myRank = leaderboard.findIndex(e => e.name === safeName) + 1;
    const safeTotal = total || questions.length;
    const myNote = myEntry ? ((myEntry.score / myEntry.total) * 20).toFixed(2) : (safeTotal ? ((score / safeTotal) * 20).toFixed(2) : '0.00');
    const participation = leaderboard.length;
    return (
      <div className="min-h-screen bg-slate-950 py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-8 text-center mb-5 shadow-lg shadow-blue-600/20">
            <h1 className="text-2xl font-black mb-1">Epreuve terminee</h1>
            <p className="opacity-80 mb-4 text-sm">{safeName}</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-2xl font-black">{score}/{safeTotal}</div>
                <div className="text-xs opacity-75 mt-1">Score</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-2xl font-black">{myNote}/20</div>
                <div className="text-xs opacity-75 mt-1">Note</div>
              </div>
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-2xl font-black">#{myRank || '-'}</div>
                <div className="text-xs opacity-75 mt-1">Rang</div>
              </div>
            </div>
            <p className="text-xs opacity-60 mt-3">{participation} participant(s) dans cette session</p>
          </div>

          {resultError && (
            <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3 mb-5 flex items-start gap-2">
              <Icon name="alert" size={14} className="mt-0.5" />
              <span>
                Votre copie n'a pas pu être enregistrée : {resultError}. Contactez l'administration
                si le problème persiste.
              </span>
            </div>
          )}

          <div className="flex gap-3 mb-5">
            <Link to={`/review/${quizId}`} className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold text-center hover:bg-blue-500 transition shadow text-sm">
              <Icon name="eye" size={15} />
              Relire ma copie
            </Link>
            <Link to="/revision" className="flex-1 inline-flex items-center justify-center gap-2 bg-emerald-600 text-white py-3 rounded-xl font-bold text-center hover:bg-emerald-500 transition shadow text-sm">
              <Icon name="sparkles" size={15} />
              Réviser mes erreurs
            </Link>
            <Link to="/schedule" className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-900 border border-slate-700 text-slate-200 py-3 rounded-xl font-bold text-center hover:bg-slate-800 hover:border-slate-600 transition text-sm">
              <Icon name="calendar" size={15} />
              Emploi du temps
            </Link>
          </div>

          {/* Détail des réponses · uniquement APRÈS la soumission finale */}
          {correctedAnswers.length > 0 && (
            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-5">
              <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                    <Icon name="check-circle" size={16} className="text-emerald-400" />
                    Vos réponses et la correction
                  </h2>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Les cases que vous avez cochées, avec la bonne réponse pour chaque question.
                  </p>
                </div>
                <span className="text-[10px] font-black px-2 py-1 rounded-full bg-blue-600/20 text-blue-300">
                  {score}/{safeTotal} bonnes réponses
                </span>
              </div>

              <div className="space-y-3 max-h-[30rem] overflow-y-auto pr-1">
                {correctedAnswers.map((a, index) => {
                  const opts = ['A', 'B', 'C', 'D']
                    .map(l => ({ label: l, text: a.options?.['Opt' + l] }))
                    .filter(o => typeof o.text === 'string' && o.text.trim() !== '');
                  const selected = typeof a.selected === 'string' ? a.selected.trim() : '';
                  const correct = typeof a.correct === 'string' ? a.correct.trim() : '';
                  const notAnswered = !selected;
                  const selectedFound = opts.some(o => o.text.trim() === selected);
                  const badge = notAnswered
                    ? { label: 'Sans réponse', cls: 'bg-slate-800 text-slate-400' }
                    : a.isOk
                      ? { label: 'Correct', cls: 'bg-emerald-500/15 text-emerald-300' }
                      : { label: 'Incorrect', cls: 'bg-red-500/15 text-red-300' };

                  return (
                    <div key={a.questionId ?? index} className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <p className="text-xs font-bold text-slate-100 leading-relaxed">
                          <span className="text-slate-500 mr-1">Q{index + 1}.</span>
                          {a.question}
                        </p>
                        <span className={`shrink-0 text-[10px] font-black px-2 py-0.5 rounded-full ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        {opts.map(option => {
                          const text = option.text.trim();
                          const isGiven = !!selected && text === selected;
                          const isCorrect = !!correct && text === correct;

                          let cls = 'flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ';
                          if (isGiven && isCorrect) {
                            cls += 'border-emerald-600 bg-emerald-950/40 text-emerald-200';
                          } else if (isGiven) {
                            cls += 'border-red-600 bg-red-950/40 text-red-200';
                          } else if (isCorrect) {
                            cls += 'border-emerald-700/60 bg-emerald-950/20 text-emerald-300';
                          } else {
                            cls += 'border-slate-800 bg-slate-900/60 text-slate-400';
                          }

                          return (
                            <div key={option.label} className={cls}>
                              <span className="font-black w-4 shrink-0">{option.label}</span>
                              <span className="flex-1">{option.text}</span>
                              {isGiven && (
                                <span className="shrink-0 text-[9px] font-black bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                                  Votre case cochée
                                </span>
                              )}
                              {!isGiven && isCorrect && (
                                <span className="shrink-0 text-[9px] font-black bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
                                  Bonne réponse
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {selected && !selectedFound && (
                          <p className="text-[11px] text-slate-300 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2">
                            Votre réponse : <strong>{selected}</strong>
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 mb-5">
            <h2 className="text-base font-bold text-slate-200 mb-3 flex items-center gap-2">
              <Icon name="chat" size={16} className="text-blue-400" />
              Laisser un message a l'administrateur
            </h2>
            {feedbackSent ? (
              <div className="text-emerald-400 font-semibold text-sm bg-emerald-950/60 border border-emerald-800 rounded-lg p-3">Message envoye avec succes.</div>
            ) : (
              <div className="flex gap-2">
                <textarea className="flex-1 border border-slate-800 bg-slate-950 text-slate-200 placeholder:text-slate-600 rounded-lg p-3 text-sm outline-none focus:border-blue-600 transition resize-none" rows={3} placeholder="Appreciations, suggestions..." value={feedbackMsg} onChange={e => setFeedbackMsg(e.target.value)} />
                <button onClick={sendFeedback} disabled={!feedbackMsg.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-500 transition disabled:opacity-50 self-end inline-flex items-center gap-1.5">
                  <Icon name="send" size={14} />
                  Envoyer
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Icon name="trophy" size={18} className="text-amber-400" />
                Classement de la session
              </h2>
              <span className="text-xs bg-blue-600/20 text-blue-300 px-2 py-0.5 rounded-full font-bold">{participation} participants</span>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {leaderboard.map((entry, index) => {
                const isMe = entry.name === safeName;
                const entryNote = entry.total ? ((entry.score / entry.total) * 20).toFixed(1) : '-';
                return (
                  <div key={index} className={`flex justify-between items-center p-3 rounded-xl border ${isMe ? 'bg-blue-600/15 border-blue-600' : 'bg-slate-950 border-slate-800'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`font-black text-lg w-7 text-center ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-amber-500' : 'text-slate-500'}`}>#{index + 1}</span>
                      <div>
                        <span className="font-bold text-slate-200 text-sm">{entry.name}</span>
                        {isMe && <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Moi</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-blue-400 text-sm">{entryNote}/20</div>
                      <div className="text-xs text-slate-500">{entry.score}/{entry.total}</div>
                    </div>
                  </div>
                );
              })}
              {leaderboard.length === 0 && <p className="text-slate-500 text-sm text-center py-4">En attente des resultats...</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 text-center max-w-md">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-500/15 border border-amber-600/30 text-amber-400 flex items-center justify-center mb-4">
          <Icon name="alert" size={22} />
        </div>
        <h2 className="text-2xl font-bold text-white">Epreuve non disponible</h2>
        <p className="text-slate-400 mt-2 text-sm">Le quiz n'est pas encore configure.</p>
        <Link to="/dashboard" className="mt-4 inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold text-sm">
          <Icon name="arrow-left" size={14} />
          Retour
        </Link>
      </div>
    </div>
  );

  // ── Phase Quiz ──────────────────────────────────────────────────────
  const q = questions[currentIndex];
  const progress = ((currentIndex) / questions.length) * 100;

  const validOptions = ['OptA', 'OptB', 'OptC', 'OptD']
    .map(k => q[k]).filter(v => typeof v === 'string' && v.trim() !== '');
  const shuffledOptions = seededShuffle(validOptions, safeName + '_' + currentIndex);

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col select-none">
      {/* Bandeau anti-triche */}
      {warningMessage && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[min(92vw,42rem)] bg-red-950/95 border border-red-700 text-red-100 rounded-xl px-4 py-3 shadow-2xl shadow-black/50 flex items-start gap-2.5">
          <Icon name="shield" size={17} className="mt-0.5 text-red-300" />
          <div className="flex-1">
            <p className="text-xs font-bold">{warningMessage}</p>
            <p className="text-[11px] text-red-300/80 mt-0.5">
              Avertissement {violations}/{MAX_VIOLATIONS}. Au-delà de {MAX_VIOLATIONS}, la copie est soumise automatiquement.
            </p>
          </div>
          <button onClick={() => setWarningMessage('')} aria-label="Fermer l'avertissement" className="text-red-300 hover:text-white transition">
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      {/* Top bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-blue-600/20 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full">{quizId}</span>
          <span className="text-slate-300 text-sm font-semibold">{safeName}</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className={`flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${violations ? 'bg-red-950/60 text-red-300' : 'bg-slate-800 text-slate-400'}`}>
            <Icon name="shield" size={12} />
            {violations} alerte(s)
          </span>
          <button
            onClick={toggleFullscreen}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-full transition"
          >
            <Icon name={isFullscreen ? 'close' : 'eye'} size={12} />
            {isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          </button>
          <span className="flex items-center gap-1.5 text-xs text-slate-400 bg-slate-800 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            {participants} en cours
          </span>
          <span className="bg-blue-600/20 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full">{currentIndex + 1} / {questions.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-800">
        <div className="h-1 bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Timer */}
      {quizMeta?.timePerQuestion > 0 && (
        <div className="bg-slate-900 px-4 py-2 border-b border-slate-800">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-slate-400 font-semibold">Temps restant</span>
            <span className={`text-sm font-black font-mono ${timerPct <= 20 ? 'text-red-400 animate-pulse' : 'text-slate-200'}`}>{fmtMs(timeLeft)}</span>
          </div>
          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
            <div className={`h-2 rounded-full transition-all duration-500 ${timerColor}`} style={{ width: `${timerPct}%` }}></div>
          </div>
        </div>
      )}

      {/* Question */}
      <div className="flex-1 flex flex-col items-center pt-8 px-4 pb-20">
        <div className="w-full max-w-3xl bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-xl shadow-black/30">
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            {q.tags && String(q.tags).split(/[;,]/).filter(Boolean).map(tag => (
              <span key={tag} className="text-[10px] font-bold text-blue-300 bg-blue-600/15 border border-blue-600/30 px-2 py-0.5 rounded-full">
                {tag.trim()}
              </span>
            ))}
            {q.difficulte && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                q.difficulte === 'facile'
                  ? 'text-emerald-300 bg-emerald-600/15 border-emerald-600/30'
                  : q.difficulte === 'difficile'
                    ? 'text-red-300 bg-red-600/15 border-red-600/30'
                    : 'text-amber-300 bg-amber-600/15 border-amber-600/30'
              }`}>
                {q.difficulte}
              </span>
            )}
          </div>

          <h2 className="text-xl font-bold mb-8 text-slate-100 leading-relaxed">{q.Question}</h2>

          <div className="grid grid-cols-1 gap-3 mb-6">
            {shuffledOptions.map(opt => {
              const isSelected = opt === selectedOption;

              const cls = 'w-full text-left p-4 border rounded-xl transition font-semibold text-sm ' +
                (isSelected
                  ? 'bg-blue-600/20 border-blue-500 text-blue-100'
                  : 'border-slate-800 bg-slate-950 text-slate-200 hover:bg-slate-800 hover:border-blue-600 cursor-pointer');

              return (
                <button key={opt} onClick={() => handleOptionClick(opt)} className={cls}>
                  {opt}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Icon name="info" size={13} />
              La correction sera disponible uniquement à la fin de l'épreuve.
            </p>
            <button
              onClick={() => handleValidate(false)}
              disabled={!selectedOption}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-600/25 hover:bg-blue-500 transition disabled:opacity-40 disabled:shadow-none">
              {currentIndex + 1 === questions.length ? 'Valider et terminer' : 'Valider et suivant'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
