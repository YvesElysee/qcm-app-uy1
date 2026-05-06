import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { db } from './firebase';
import {
  collection, getDocs, addDoc, doc, getDoc,
  onSnapshot, query, where, setDoc, deleteDoc, serverTimestamp
} from 'firebase/firestore';

export default function QuizSession() {
  const { quizId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState([]);

  const [phase, setPhase] = useState('loading'); // loading | waiting | quiz | finished
  const [countdown, setCountdown] = useState(null); // ms avant le lancement
  const [timeLeft, setTimeLeft] = useState(null);   // ms pour la question en cours
  const [leaderboard, setLeaderboard] = useState([]);
  const [participants, setParticipants] = useState(0);

  const [quizMeta, setQuizMeta] = useState(null);
  const submitted = useRef(false);
  const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };
  const sessionId = useRef(`${user.name}_${Date.now()}`).current;

  // ── Chargement initial ─────────────────────────────────────────────────
  useEffect(() => {
    const init = async () => {
      const qSnap = await getDocs(collection(db, `quizzes/${quizId}/questions`));
      let qs = qSnap.docs.map(d => d.data());
      qs = qs.sort(() => 0.5 - Math.random());
      setQuestions(qs);

      const metaDoc = await getDoc(doc(db, "quizzes", quizId));
      if (!metaDoc.exists()) { setPhase('finished'); return; }
      const meta = metaDoc.data();
      setQuizMeta(meta);

      const now = Date.now();
      if (meta.launchTime && meta.launchTime > now) {
        // Salle d'attente
        setPhase('waiting');
      } else {
        setPhase('quiz');
      }
    };
    init();
  }, [quizId]);

  // ── Compte à rebours salle d'attente ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'waiting' || !quizMeta?.launchTime) return;
    const interval = setInterval(() => {
      const dist = quizMeta.launchTime - Date.now();
      if (dist <= 0) {
        clearInterval(interval);
        setCountdown(0);
        setPhase('quiz');
      } else {
        setCountdown(dist);
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase, quizMeta]);

  // ── Enregistrement de la présence en temps réel ───────────────────────
  useEffect(() => {
    if (phase !== 'quiz') return;
    const presenceRef = doc(db, `quizzes/${quizId}/sessions`, sessionId);
    setDoc(presenceRef, { name: user.name, ts: serverTimestamp() });

    const unsubscribe = onSnapshot(collection(db, `quizzes/${quizId}/sessions`), snap => {
      setParticipants(snap.size);
    });

    return () => {
      unsubscribe();
      deleteDoc(presenceRef);
    };
  }, [phase, quizId]);

  // ── Soumission automatique à endTime ──────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || !quizMeta?.endTime) return;
    const msLeft = quizMeta.endTime - Date.now();
    if (msLeft <= 0) { submitQuiz(score, answers); return; }
    const timeout = setTimeout(() => submitQuiz(score, answers), msLeft);
    return () => clearTimeout(timeout);
  }, [phase, quizMeta]);

  // ── Timer par question ────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'quiz' || !quizMeta?.timePerQuestion || quizMeta.timePerQuestion <= 0) return;
    setTimeLeft(quizMeta.timePerQuestion * 1000);
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 500) {
          clearInterval(interval);
          // Passer à la question suivante automatiquement
          handleAnswer(null, true);
          return 0;
        }
        return prev - 500;
      });
    }, 500);
    return () => clearInterval(interval);
  }, [phase, currentIndex, quizMeta]);

  // ── Classement en direct ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'finished') return;
    const q = query(collection(db, "results"), where("ue", "==", quizId));
    const unsubscribe = onSnapshot(q, snap => {
      let data = snap.docs.map(d => d.data());
      data.sort((a, b) => b.score - a.score);
      setLeaderboard(data);
    });
    return () => unsubscribe();
  }, [phase, quizId]);

  // ── Soumission du quiz ────────────────────────────────────────────────
  const submitQuiz = useCallback(async (finalScore, finalAnswers) => {
    if (submitted.current) return;
    submitted.current = true;
    setPhase('finished');
    await addDoc(collection(db, "results"), {
      name: user.name,
      ue: quizId,
      score: finalScore,
      total: questions.length,
      answers: finalAnswers,
      date: new Date().toISOString()
    });
  }, [quizId, user.name, questions.length]);

  const handleAnswer = useCallback((selectedOption, autoSkip = false) => {
    const q = questions[currentIndex];
    const isCorrect = !autoSkip && selectedOption === q?.ReponseCorrecte;
    const newScore = isCorrect ? score + 1 : score;
    const newAnswers = [...answers, autoSkip ? null : selectedOption];

    setScore(newScore);
    setAnswers(newAnswers);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(i => i + 1);
    } else {
      submitQuiz(newScore, newAnswers);
    }
  }, [currentIndex, questions, score, answers, submitQuiz]);

  // ── Helpers UI ────────────────────────────────────────────────────────
  const fmtMs = (ms) => {
    if (!ms || ms < 0) return '00:00';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerPercent = (timeLeft && quizMeta?.timePerQuestion)
    ? Math.max(0, (timeLeft / (quizMeta.timePerQuestion * 1000)) * 100) : 100;
  const timerColor = timerPercent > 50 ? 'bg-green-500' : timerPercent > 20 ? 'bg-yellow-500' : 'bg-red-500';

  // ── PHASES ────────────────────────────────────────────────────────────
  if (phase === 'loading') return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900">
      <div className="text-white text-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-300">Chargement de l'épreuve...</p>
      </div>
    </div>
  );

  if (phase === 'waiting') return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-black mb-1 text-blue-400">Salle d'attente</h1>
        <p className="text-slate-400 mb-2 text-sm">{quizId}</p>
        <p className="text-slate-400 mb-8 text-sm">L'évaluation démarre dans :</p>
        <div className="text-7xl font-mono bg-slate-800 px-8 py-6 rounded-2xl shadow-2xl border border-slate-700 tracking-wider mb-6">
          {fmtMs(countdown)}
        </div>
        <div className="flex items-center justify-center gap-2 text-emerald-400 animate-pulse font-semibold text-sm">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
          Synchronisation en temps réel active
        </div>
        <Link to="/schedule" className="mt-8 inline-block text-slate-500 hover:text-slate-300 text-sm transition">← Emploi du temps</Link>
      </div>
    </div>
  );

  if (phase === 'finished') {
    const myEntry = leaderboard.find(e => e.name === user.name);
    const myRank = leaderboard.findIndex(e => e.name === user.name) + 1;
    const myNote = myEntry ? ((myEntry.score / myEntry.total) * 20).toFixed(2) : '—';
    const participation = leaderboard.length;

    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-8 text-center mb-6">
            <h1 className="text-3xl font-black mb-1">Épreuve terminée !</h1>
            <p className="opacity-80 mb-4">{user.name}</p>
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
            <p className="text-xs opacity-60 mt-3">{participation} participant(s) au total</p>
          </div>

          <div className="flex gap-3 mb-6">
            <Link to={`/review/${quizId}`} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold text-center hover:bg-indigo-700 transition shadow">
              📖 Relire ma copie
            </Link>
            <Link to="/schedule" className="flex-1 bg-white border-2 border-gray-100 text-gray-700 py-3 rounded-xl font-bold text-center hover:border-blue-300 transition shadow-sm">
              📅 Emploi du temps
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-xl font-bold mb-4 text-gray-800 border-b pb-3 flex items-center gap-2">
              🏆 Classement en direct <span className="text-sm bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-normal animate-pulse">{participation} participants</span>
            </h2>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {leaderboard.map((entry, index) => {
                const isMe = entry.name === user.name;
                const entryNote = entry.total ? ((entry.score / entry.total) * 20).toFixed(1) : '—';
                return (
                  <div key={index} className={`flex justify-between items-center p-3 rounded-xl border-2 transition ${isMe ? 'bg-blue-50 border-blue-400' : 'bg-gray-50 border-gray-100'}`}>
                    <div className="flex items-center gap-3">
                      <span className={`font-black text-lg w-7 text-center ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                        #{index + 1}
                      </span>
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
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Phase quiz ────────────────────────────────────────────────────────
  if (questions.length === 0) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
      <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md border border-orange-200">
        <span className="text-5xl">🕒</span>
        <h2 className="text-2xl font-bold mt-4 text-orange-600">Épreuve non disponible</h2>
        <p className="text-gray-500 mt-2">Le quiz <strong>{quizId}</strong> n'est pas encore configuré.</p>
        <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">← Retour à l'accueil</Link>
      </div>
    </div>
  );

  const q = questions[currentIndex];
  const progress = ((currentIndex) / questions.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top bar */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full">{quizId}</span>
          <span className="text-gray-500 text-sm font-semibold">{user.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-xs text-gray-500 bg-gray-100 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            {participants} en cours
          </span>
          <span className="bg-blue-50 text-blue-600 text-xs font-bold px-2.5 py-1 rounded-full">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>
      </div>

      {/* Barre de progression globale */}
      <div className="h-1 bg-gray-200">
        <div className="h-1 bg-blue-600 transition-all duration-500" style={{ width: `${progress}%` }}></div>
      </div>

      {/* Timer par question */}
      {quizMeta?.timePerQuestion > 0 && (
        <div className="bg-white px-4 py-2 border-b">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-gray-500 font-semibold">Temps restant</span>
            <span className={`text-sm font-black font-mono ${timerPercent <= 20 ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>{fmtMs(timeLeft)}</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className={`h-2 rounded-full transition-all duration-500 ${timerColor}`} style={{ width: `${timerPercent}%` }}></div>
          </div>
        </div>
      )}

      {/* Question */}
      <div className="flex-1 flex flex-col items-center pt-10 px-4 pb-12">
        <div className="w-full max-w-3xl bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
          <h2 className="text-2xl font-bold mb-8 text-gray-800 leading-relaxed">{q.Question}</h2>
          <div className="grid grid-cols-1 gap-3">
            {['OptA', 'OptB', 'OptC', 'OptD'].map(opt => (
              q[opt] && (
                <button key={opt} onClick={() => handleAnswer(q[opt])}
                  className="w-full text-left p-5 border-2 border-gray-100 rounded-xl hover:bg-blue-50 hover:border-blue-400 hover:shadow-sm transition font-semibold text-gray-700 active:scale-[0.99]">
                  {q[opt]}
                </button>
              )
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
