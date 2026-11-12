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

export default function QuizSession() {
  const { quizId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]); // {selected, correct, isOk}[]

  const [selectedOption, setSelectedOption] = useState(null);   // option choisie

  const [phase, setPhase] = useState('loading');
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [participants, setParticipants] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [quizMeta, setQuizMeta] = useState(null);
  const [accessError, setAccessError] = useState('');

  const submitted = useRef(false);
  const timerInterval = useRef(null);
  const lastValidatedRef = useRef(-1);

  const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
  const safeName = (user.name || 'Anonyme').trim();
  const urlParams = new URLSearchParams(window.location.search);
  const isMakeupMode = urlParams.get('mode') === 'rattrapage' || !!user.isMakeup;
  const [makeupEndTime, setMakeupEndTime] = useState(null);
  const sessionIdRef = useRef(null);
  const storageKey = STORAGE_KEY(quizId, safeName);

  // ── Chargement des questions ─────────────────────────────────────────
  const loadFresh = useCallback(async () => {
    const data = await api(`/quizzes/${quizId}/questions`);
    const raw = data.questions.map((data) => {
      const q = { ...data };
      // Normaliser ReponseCorrecte : si c'est une lettre (A/B/C/D) → convertir en texte
      const rc = (q.ReponseCorrecte || '').trim().toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(rc)) {
        q.ReponseCorrecte = (q['Opt' + rc] || rc).trim();
      } else {
        q.ReponseCorrecte = (q.ReponseCorrecte || '').trim();
      }
      // Nettoyer toutes les options
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
          const { qs, idx, sc, ans, quizSession } = JSON.parse(saved);
          if (qs && quizSession === (meta.launchTime || 0)) {
            setQuestions(qs);
            setCurrentIndex(idx);
            setScore(sc);
            setAnswers(ans);
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
      qs: questions, idx: currentIndex, sc: score, ans: answers,
      quizSession: quizMeta?.launchTime || 0
    }));
  }, [currentIndex, score, phase, answers, questions, quizMeta?.launchTime, storageKey]);

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

  // ── Présence participants (heartbeat + polling, remplace onSnapshot) ──
  useEffect(() => {
    if (phase !== 'quiz') return;
    if (sessionIdRef.current === null) {
      sessionIdRef.current = `${safeName}_${Date.now()}`;
    }
    const sid = sessionIdRef.current;
    let active = true;

    // Battement de cœur : annonce la présence et récupère le compteur
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

    // Sortie propre + compteur rafraîchi une dernière fois
    return () => {
      active = false;
      clearInterval(iv);
      api(`/quizzes/${quizId}/sessions/${sid}`, { method: 'DELETE' }).catch(() => {});
    };
  }, [phase, quizId, safeName]);

  // ── Validation (manuelle ou auto-timer) ─────────────────────────────
  const finalSubmit = useCallback(async (finalScore, finalAnswers) => {
    if (submitted.current) return;
    submitted.current = true;
    localStorage.removeItem(storageKey);
    setPhase('finished');

    const histKey = `qcm_history_${safeName}`;
    const existing = JSON.parse(localStorage.getItem(histKey) || '[]');
    const entry = {
      quizId,
      filiere: quizMeta?.filiere || '', niveau: quizMeta?.niveau || '',
      score: finalScore, total: questions.length,
      date: new Date().toISOString(), sessionTimestamp: quizMeta?.launchTime || 0
    };
    localStorage.setItem(histKey, JSON.stringify(
      [entry, ...existing.filter(e => !(e.quizId === quizId && e.sessionTimestamp === entry.sessionTimestamp))].slice(0, 50)
    ));

    await api('/results', {
      method: 'POST',
      auth: 'student',
      body: {
        ue: quizId,
        filiere: quizMeta?.filiere || '',
        niveau: quizMeta?.niveau || '',
        score: finalScore,
        total: questions.length,
        answers: finalAnswers,
        sessionTimestamp: quizMeta?.launchTime || 0,
        isMakeup: isMakeupMode
      }
    }).catch(err => console.warn("Enregistrement du résultat impossible :", err.message));
  }, [quizId, safeName, questions.length, quizMeta, storageKey, isMakeupMode]);

  const handleValidate = useCallback((forced = false) => {
    // Empêche une double validation (double-clic ou clic + fin du timer)
    if (lastValidatedRef.current === currentIndex) return;
    lastValidatedRef.current = currentIndex;
    clearInterval(timerInterval.current);

    const q = questions[currentIndex];
    const correct = (q?.ReponseCorrecte || '').trim();
    const chosen = forced ? null : selectedOption;
    const cleanChosen = (chosen || '').trim();
    const isOk = cleanChosen !== '' && cleanChosen === correct;
    const newScore = isOk ? score + 1 : score;
    const newAnswers = [...answers, { selected: cleanChosen || null, correct, isOk }];

    setScore(newScore);
    setAnswers(newAnswers);
    setSelectedOption(null);

    // Aucun feedback intermédiaire : la correction n'apparaît qu'à la fin.
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(i => i + 1);
      setTimeLeft(quizMeta?.timePerQuestion ? quizMeta.timePerQuestion * 1000 : null);
    } else {
      finalSubmit(newScore, newAnswers);
    }
  }, [currentIndex, questions, score, answers, selectedOption, quizMeta, finalSubmit]);

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
      if (!submitted.current) finalSubmit(score, answers);
      return;
    }
    const t = setTimeout(() => {
      if (!submitted.current) finalSubmit(score, answers);
    }, msLeft);
    return () => clearTimeout(t);
  }, [phase, quizMeta, makeupEndTime, isMakeupMode, score, answers, finalSubmit]);

  // ── Classement (polling toutes les 3s, remplace onSnapshot) ──────────
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

  // ── Submit final ─────────────────────────────────────────────────────


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
        <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 flex items-center justify-center mb-4">
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
    const myNote = myEntry ? ((myEntry.score / myEntry.total) * 20).toFixed(2) : ((score / questions.length) * 20).toFixed(2);
    const participation = leaderboard.length;
    return (
      <div className="min-h-screen bg-slate-950 py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-8 text-center mb-5 shadow-lg shadow-blue-600/20">
            <h1 className="text-2xl font-black mb-1">Epreuve terminee</h1>
            <p className="opacity-80 mb-4 text-sm">{safeName}</p>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white/10 rounded-xl p-3">
                <div className="text-2xl font-black">{score}/{questions.length}</div>
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

          <div className="flex gap-3 mb-5">
            <Link to={`/review/${quizId}`} className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-bold text-center hover:bg-blue-500 transition shadow text-sm">
              <Icon name="eye" size={15} />
              Relire ma copie
            </Link>
            <Link to="/schedule" className="flex-1 inline-flex items-center justify-center gap-2 bg-slate-900 border border-slate-700 text-slate-200 py-3 rounded-xl font-bold text-center hover:bg-slate-800 hover:border-slate-600 transition text-sm">
              <Icon name="calendar" size={15} />
              Emploi du temps
            </Link>
          </div>

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
                <Icon name="trophy" size={18} className="text-indigo-400" />
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
                      <span className={`font-black text-lg w-7 text-center ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-slate-300' : index === 2 ? 'text-indigo-500' : 'text-slate-500'}`}>#{index + 1}</span>
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
        <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-500/15 border border-indigo-600/30 text-indigo-400 flex items-center justify-center mb-4">
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
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top bar */}
      <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-blue-600/20 text-blue-300 text-xs font-bold px-2.5 py-1 rounded-full">{quizId}</span>
          <span className="text-slate-300 text-sm font-semibold">{safeName}</span>
        </div>
        <div className="flex items-center gap-3">
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
