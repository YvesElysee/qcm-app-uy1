import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { db } from './firebase';
import { collection, getDocs, addDoc, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';

export default function QuizSession() {
  const { quizId } = useParams();
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [score, setScore] = useState(0);

  const [isWaiting, setIsWaiting] = useState(true);
  const [timeLeft, setTimeLeft] = useState(null);
  const [isFinished, setIsFinished] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);

  const user = JSON.parse(localStorage.getItem('userSession')) || { name: 'Anonyme' };

  useEffect(() => {
    const initializeSession = async () => {
      const qSnapshot = await getDocs(collection(db, `quizzes/${quizId}/questions`));
      let fetched = qSnapshot.docs.map(d => d.data());
      fetched = fetched.sort(() => 0.5 - Math.random());
      setQuestions(fetched);

      const metaDoc = await getDoc(doc(db, "quizzes", quizId));
      if (metaDoc.exists() && metaDoc.data().launchTime) {
        const targetTime = metaDoc.data().launchTime;

        const interval = setInterval(() => {
          const now = new Date().getTime();
          const distance = targetTime - now;

          if (distance <= 0) {
            clearInterval(interval);
            setIsWaiting(false);
          } else {
            setTimeLeft(distance);
          }
        }, 1000);
        return () => clearInterval(interval);
      } else {
        setIsWaiting(false);
      }
    };
    initializeSession();
  }, [quizId]);

  useEffect(() => {
    if (!isFinished) return;

    const q = query(collection(db, "results"), where("ue", "==", quizId));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let resultsData = snapshot.docs.map(doc => doc.data());
      resultsData.sort((a, b) => b.score - a.score);
      setLeaderboard(resultsData);
    });

    return () => unsubscribe();
  }, [isFinished, quizId]);

  const handleAnswer = async (selectedOption) => {
    const isCorrect = selectedOption === questions[currentIndex].ReponseCorrecte;
    const newScore = isCorrect ? score + 1 : score;
    setScore(newScore);

    if (currentIndex + 1 < questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsFinished(true);
      await addDoc(collection(db, "results"), {
        name: user.name,
        ue: quizId,
        score: newScore,
        total: questions.length,
        date: new Date().toISOString()
      });
    }
  };

  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-6">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-md border border-orange-200">
          <span className="text-5xl">🕒</span>
          <h2 className="text-2xl font-bold mt-4 text-orange-600">Épreuve en veille</h2>
          <p className="text-gray-500 mt-2">Le quizz pour l'UE <span className="font-bold">{quizId}</span> n'est pas encore programmé ou configuré par l'administrateur.</p>
        </div>
      </div>
    );
  }

  if (isWaiting && timeLeft > 0) {
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white p-4">
        <h1 className="text-3xl font-black mb-2 text-blue-400">Salle d'attente - {quizId}</h1>
        <p className="text-slate-400 mb-8">L'évaluation démarre précisément à l'heure programmée :</p>
        <div className="text-6xl md:text-7xl font-mono bg-slate-800 px-8 py-5 rounded-2xl shadow-2xl border border-slate-700 tracking-wider">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </div>
        <div className="mt-8 flex items-center gap-2 text-emerald-400 animate-pulse font-semibold">
          <span className="h-3 w-3 rounded-full bg-emerald-400"></span>
          Synchronisation avec le serveur active...
        </div>
      </div>
    );
  }

  if (isFinished) {
    return (
      <div className="min-h-screen bg-gray-50 py-10 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-8 text-center">
            <h1 className="text-3xl font-black mb-2">Félicitations, épreuve finie !</h1>
            <p className="text-lg opacity-90">Ton score final :</p>
            <div className="text-5xl font-black mt-2">{score} / {questions.length}</div>
          </div>

          <div className="p-8">
            <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2 border-b pb-4">
              🏆 Classement Général en Direct ({quizId})
            </h2>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
              {leaderboard.map((entry, index) => (
                <div key={index} className={`flex justify-between items-center p-4 rounded-xl border-2 transition ${entry.name === user.name ? 'bg-blue-50/50 border-blue-400' : 'bg-gray-50/50 border-gray-100'}`}>
                  <div className="flex items-center gap-4">
                    <span className={`font-black text-xl w-8 text-center ${index === 0 ? 'text-yellow-500' : index === 1 ? 'text-slate-400' : index === 2 ? 'text-amber-600' : 'text-gray-400'}`}>
                      #{index + 1}
                    </span>
                    <span className="font-bold text-gray-700">{entry.name} {entry.name === user.name && <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full ml-2">Moi</span>}</span>
                  </div>
                  <span className="font-extrabold text-blue-600">{entry.score} / {entry.total}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const q = questions[currentIndex];
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center pt-16 px-4 pb-12">
      <div className="w-full max-w-3xl bg-white p-8 rounded-2xl shadow-lg border border-gray-100">
        <div className="flex justify-between text-gray-500 mb-8 font-bold text-xs uppercase tracking-wider">
          <span>Étudiant : <span className="text-blue-600">{user.name}</span></span>
          <span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-full">Question {currentIndex + 1} / {questions.length}</span>
        </div>

        <h2 className="text-2xl font-bold mb-10 text-gray-800 leading-relaxed">{q.Question}</h2>

        <div className="grid grid-cols-1 gap-4">
          {['OptA', 'OptB', 'OptC', 'OptD'].map(opt => (
            q[opt] && (
              <button key={opt} onClick={() => handleAnswer(q[opt])}
                className="w-full text-left p-5 border-2 border-gray-100 rounded-xl hover:bg-blue-50/50 hover:border-blue-400 hover:shadow-sm transition font-semibold text-gray-700">
                {q[opt]}
              </button>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
