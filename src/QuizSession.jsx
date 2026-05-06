import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from './firebase';
import {
  collection, getDocs, addDoc, doc, getDoc,
  onSnapshot, query, where, setDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';

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
  const [feedbackState, setFeedbackState] = useState(null);     // 'correct' | 'wrong' | null
  const [correctText, setCorrectText] = useState('');           // texte bonne réponse (pour feedback)

  const [phase, setPhase] = useState('loading');
  const [countdown, setCountdown] = useState(null);
  const [timeLeft, setTimeLeft] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [participants, setParticipants] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [quizMeta, setQuizMeta] = useState(null);

  const submitted = useRef(false);
  const timerInterval = useRef(null);
  const feedbackTimeout = useRef(null);

  const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
  const safeName = (user.name || 'Anonyme').trim();
  const sessionId = useRef(`${safeName}_${Date.now()}`).current;
  const storageKey = STORAGE_KEY(quizId, safeName);

  // ── Chargement des questions ─────────────────────────────────────────
  const loadFresh = useCallback(async (meta) => {
    const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
    const raw = qSnap.docs.map(d => {
      const data = d.data();
      // Normaliser ReponseCorrecte : si c'est une lettre (A/B/C/D) → convertir en texte
      const rc = (data.ReponseCorrecte || '').trim().toUpperCase();
      if (['A', 'B', 'C', 'D'].includes(rc)) {
        data.ReponseCorrecte = (data['Opt' + rc] || rc).trim();
      } else {
        data.ReponseCorrecte = (data.ReponseCorrecte || '').trim();
      }
      // Nettoyer toutes les options
      ['Question', 'OptA', 'OptB', 'OptC', 'OptD'].forEach(k => {
        if (data[k]) data[k] = data[k].trim();
      });
      return data;
    });
    return seededShuffle(raw, safeName);
  }, [quizId, safeName]);

  useEffect(() => {
    const init = async () => {
      const metaDoc = await getDoc(doc(db, "quizzes", quizId));
      if (!metaDoc.exists()) { setPhase('finished'); return; }
      const meta = metaDoc.data();
      setQuizMeta(meta);

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
        } catch (_) { /* ignore */ }
      }

      const qs = await loadFresh(meta);
      setQuestions(qs);
      setPhase(meta.launchTime && meta.launchTime > Date.now() ? 'waiting' : 'quiz');
    };
    init();
  }, [quizId]);

  // ── Sauvegarde de progression ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || questions.length === 0) return;
    localStorage.setItem(storageKey, JSON.stringify({
      qs: questions, idx: currentIndex, sc: score, ans: answers,
      quizSession: quizMeta?.launchTime || 0
    }));
  }, [currentIndex, score, phase]);

  // ── Salle d'attente ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'waiting' || !quizMeta?.launchTime) return;
    const iv = setInterval(() => {
      const dist = quizMeta.launchTime - Date.now();
      if (dist <= 0) { clearInterval(iv); setCountdown(0); setPhase('quiz'); }
      else setCountdown(dist);
    }, 500);
    return () => clearInterval(iv);
  }, [phase, quizMeta]);

  // ── Présence participants ────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz') return;
    const ref = doc(db, `quizzes/${quizId}/sessions`, sessionId);
    setDoc(ref, { name: safeName, ts: serverTimestamp() });
    const unsub = onSnapshot(collection(db, `quizzes/${quizId}/sessions`), s => setParticipants(s.size));
    return () => { unsub(); deleteDoc(ref); };
  }, [phase, quizId]);

  // ── Timer par question ───────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || !quizMeta?.timePerQuestion || quizMeta.timePerQuestion <= 0) return;
    if (feedbackState) return; // ne pas relancer le timer pendant le feedback

    setTimeLeft(quizMeta.timePerQuestion * 1000);
    clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev === null || prev <= 500) {
          clearInterval(timerInterval.current);
          return 0;
        }
        return prev - 500;
      });
    }, 500);
    return () => clearInterval(timerInterval.current);
  }, [phase, currentIndex, quizMeta, feedbackState]);

  useEffect(() => {
    if (timeLeft === 0 && phase === 'quiz' && !feedbackState) {
      handleValidate(true);
    }
  }, [timeLeft]);

  // ── Soumission à endTime ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || !quizMeta?.endTime) return;
    const msLeft = quizMeta.endTime - Date.now();
    if (msLeft <= 0) { if (!submitted.current) finalSubmit(score, answers); return; }
    const t = setTimeout(() => { if (!submitted.current) finalSubmit(score, answers); }, msLeft);
    return () => clearTimeout(t);
  }, [phase, quizMeta]);

  // ── Classement ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'finished' || !quizMeta) return;
    const sessionTimestamp = quizMeta.launchTime || 0;
    const q = query(collection(db, "results"),
      where("ue", "==", quizId),
      where("sessionTimestamp", "==", sessionTimestamp)
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => d.data()).sort((a, b) => b.score - a.score);
      setLeaderboard(data);
    });
    return () => unsub();
  }, [phase, quizId, quizMeta]);

  // ── Submit final ─────────────────────────────────────────────────────
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

    await addDoc(collection(db, "results"), {
      name: safeName, ue: quizId,
      filiere: quizMeta?.filiere || '', niveau: quizMeta?.niveau || '',
      score: finalScore, total: questions.length,
      answers: finalAnswers,
      sessionTimestamp: quizMeta?.launchTime || 0,
      date: new Date().toISOString()
    });
  }, [quizId, safeName, questions.length, quizMeta, storageKey]);

  // ── Sélection d'une option ───────────────────────────────────────────
  const handleOptionClick = (opt) => {
    if (feedbackState) return; // bloqué pendant le feedback
    setSelectedOption(opt);
  };

  // ── Validation (manuelle ou auto-timer) ─────────────────────────────
  const handleValidate = useCallback((forced = false) => {
    if (feedbackState) return;
    clearInterval(timerInterval.current);

    const q = questions[currentIndex];
    const correct = (q?.ReponseCorrecte || '').trim();
    const chosen = (forced ? null : selectedOption);
    const cleanChosen = (chosen || '').trim();
    const isOk = cleanChosen !== '' && cleanChosen === correct;
    const newScore = isOk ? score + 1 : score;
    const newAnswers = [...answers, { selected: cleanChosen || null, correct, isOk }];

    setScore(newScore);
    setAnswers(newAnswers);
    setCorrectText(correct);
    setFeedbackState(isOk ? 'correct' : 'wrong');

    // Après 1.8s de feedback coloré → passer à la suivante
    feedbackTimeout.current = setTimeout(() => {
      setFeedbackState(null);
      setSelectedOption(null);
      setCorrectText('');
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex(i => i + 1);
        if (quizMeta?.timePerQuestion) setTimeLeft(quizMeta.timePerQuestion * 1000);
      } else {
        finalSubmit(newScore, newAnswers);
      }
    }, 1800);
  }, [feedbackState, currentIndex, questions, score, answers, selectedOption, quizMeta, finalSubmit]);

  const sendFeedback = async () => {
    if (!feedbackMsg.trim()) return;
    await addDoc(collection(db, "feedback"), {
      name: safeName, ue: quizId,
      filiere: quizMeta?.filiere || '', niveau: quizMeta?.niveau || '',
      message: feedbackMsg.trim(), date: new Date().toISOString()
    });
    setFeedbackSent(true);
  };

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
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-8 text-center mb-5">
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
                <div className="text-2xl font-black">#{myRank || '—'}</div>
                <div className="text-xs opacity-75 mt-1">Rang</div>
              </div>
            </div>
            <p className="text-xs opacity-60 mt-3">{participation} participant(s) dans cette session</p>
          </div>

          <div className="flex gap-3 mb-5">
            <Link to={`/review/${quizId}`} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-center hover:bg-indigo-700 transition shadow text-sm">Relire ma copie</Link>
            <Link to="/schedule" className="flex-1 bg-white border-2 border-gray-100 text-gray-700 py-3 rounded-xl font-bold text-center hover:border-blue-300 transition shadow-sm text-sm">Emploi du temps</Link>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 mb-5">
            <h2 className="text-base font-bold text-gray-700 mb-3">Laisser un message a l'administrateur</h2>
            {feedbackSent ? (
              <div className="text-green-600 font-semibold text-sm bg-green-50 border border-green-200 rounded-lg p-3">Message envoye avec succes.</div>
            ) : (
              <div className="flex gap-2">
                <textarea className="flex-1 border-2 border-gray-100 rounded-lg p-3 text-sm outline-none focus:border-blue-400 transition resize-none" rows={3} placeholder="Appreciations, suggestions..." value={feedbackMsg} onChange={e => setFeedbackMsg(e.target.value)} />
                <button onClick={sendFeedback} disabled={!feedbackMsg.trim()} className="bg-blue-600 text-white px-4 py-2 rounded-xl font-bold text-sm hover:bg-blue-700 transition disabled:opacity-50 self-end">Envoyer</button>
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center justify-between mb-4 border-b pb-3">
              <h2 className="text-lg font-bold text-gray-800">Classement de la session</h2>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{participation} participants</span>
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {leaderboard.map((entry, index) => {
                const isMe = entry.name === safeName;
                const entryNote = entry.total ? ((entry.score / entry.total) * 20).toFixed(1) : '—';
                return (
                  <div key={index} className={`flex justify-between items-center p-3 rounded-xl border-2 ${isMe ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`font-black text-lg w-7 text-center ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-amber-600' : 'text-gray-400'}`}>#{index + 1}</span>
                      <div>
                        <span className="font-bold text-gray-700 text-sm">{entry.name}</span>
                        {isMe && <span className="ml-2 text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">Moi</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-extrabold text-blue-600 text-sm">{entryNote}/20</div>
                      <div className="text-xs text-gray-400">{entry.score}/{entry.total}</div>
                    </div>
                  </div>
                );
              })}
              {leaderboard.length === 0 && <p className="text-gray-400 text-sm text-center py-4">En attente des resultats...</p>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md border border-orange-200">
        <h2 className="text-2xl font-bold mt-4 text-orange-600">Epreuve non disponible</h2>
        <p className="text-gray-500 mt-2">Le quiz n'est pas encore configure.</p>
        <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">Retour</Link>
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">{quizId}</span>
          <span className="text-gray-500 text-sm font-semibold">{safeName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {participants} en cours
          </span>
          <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full">{currentIndex + 1} / {questions.length}</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-200">
        <div className="h-1 bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Timer */}
      {quizMeta?.timePerQuestion > 0 && (
        <div className="bg-white px-4 py-2 border-b">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 font-semibold">Temps restant</span>
            <span className={`text-sm font-black font-mono ${timerPct <= 20 ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>{fmtMs(timeLeft)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-2 rounded-full transition-all duration-500 ${timerColor}`} style={{ width: `${timerPct}%` }}></div>
          </div>
        </div>
      )}

      {/* Question */}
      <div className="flex-1 flex flex-col items-center pt-8 px-4 pb-20">
        <div className="w-full max-w-3xl bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
          <h2 className="text-xl font-bold mb-8 text-gray-800 leading-relaxed">{q.Question}</h2>

          {/* Feedback banner */}
          {feedbackState && (
            <div className={`mb-4 p-3 rounded-xl text-sm font-bold text-center ${feedbackState === 'correct' ? 'bg-green-100 text-green-800 border-2 border-green-400' : 'bg-red-100 text-red-800 border-2 border-red-400'}`}>
              {feedbackState === 'correct' ? 'Bonne reponse !' : `Mauvaise reponse — La bonne reponse etait : ${correctText}`}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 mb-8">
            {shuffledOptions.map(opt => {
              const isSelected = opt === selectedOption;
              const clean = opt.trim();
              const isCorrect = clean === (q.ReponseCorrecte || '').trim();

              let cls = 'w-full text-left p-4 border-2 rounded-xl transition font-semibold text-sm ';
              if (feedbackState === 'correct' && isSelected) {
                cls += 'bg-green-100 border-green-500 text-green-900';
              } else if (feedbackState === 'wrong' && isSelected) {
                cls += 'bg-red-100 border-red-500 text-red-900';
              } else if (feedbackState === 'wrong' && isCorrect) {
                cls += 'bg-green-100 border-green-500 text-green-900';
              } else if (isSelected) {
                cls += 'bg-blue-50 border-blue-500 text-blue-900 shadow-sm';
              } else if (feedbackState) {
                cls += 'bg-gray-50 border-gray-100 text-gray-400';
              } else {
                cls += 'border-gray-100 text-gray-700 hover:bg-gray-50 hover:border-gray-300 cursor-pointer';
              }

              return (
                <button key={opt} onClick={() => handleOptionClick(opt)} disabled={!!feedbackState} className={cls}>
                  {opt}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => handleValidate(false)}
              disabled={!selectedOption || !!feedbackState}
              className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:shadow-none">
              Valider et Suivant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
