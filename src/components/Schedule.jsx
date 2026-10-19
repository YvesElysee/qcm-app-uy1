import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { Link } from 'react-router-dom';
import { getCurrentUser } from '../services/authService';

export default function Schedule() {
  const [upcomingQuizzes, setUpcomingQuizzes] = useState([]);
  const [pastQuizzes, setPastQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = getCurrentUser();

  // Si l'utilisateur est connecté, sa filière est verrouillée (Point 3)
  const userFiliere = user?.filiere || '';
  const userNiveau = user?.niveau || 'L1';

  const [filter, setFilter] = useState({
    filiere: userFiliere,
    niveau: userNiveau
  });

  const [myResults, setMyResults] = useState([]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, "quizzes"), orderBy("launchTime", "asc")));
        const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        const now = Date.now();
        setUpcomingQuizzes(all.filter(q => q.launchTime && q.launchTime > now));
        setPastQuizzes(all.filter(q => q.launchTime && q.launchTime <= now).reverse());

        if (user) {
          const userEmail = (user.email || '').toLowerCase();
          const userName = (user.name || '').trim();
          const rSnap = await getDocs(collection(db, "results"));
          const res = rSnap.docs.map(d => d.data()).filter(r => {
            const rEmail = (r.email || '').toLowerCase();
            const rName = (r.name || '').trim();
            return (userEmail && rEmail === userEmail) || (userName && rName === userName);
          });
          setMyResults(res);
        }
      } catch (err) {
        console.warn("Erreur chargement emploi du temps :", err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [user]);

  const passedUes = new Set(myResults.map(r => r.ue));

  const filtered = (list) => list.filter(q =>
    (!filter.filiere || q.filiere === filter.filiere) &&
    (!filter.niveau || q.niveau === filter.niveau)
  );

  const formatDate = (ts) => new Date(ts).toLocaleString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });

  const badgeColor = (f) => {
    if (f === 'Informatique') return 'bg-blue-100 text-blue-700';
    if (f === 'Mathématiques') return 'bg-purple-100 text-purple-700';
    if (f === 'Physique') return 'bg-orange-100 text-orange-700';
    return 'bg-gray-100 text-gray-700';
  };

  const QuizCard = ({ quiz, past }) => {
    const hasTaken = passedUes.has(quiz.id || quiz.ue);
    return (
      <div className={`bg-white rounded-2xl shadow-sm border-l-4 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:shadow-md ${past ? (hasTaken ? 'border-emerald-500' : 'border-red-400') : 'border-blue-500'}`}>
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${badgeColor(quiz.filiere)}`}>
              {quiz.filiere}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
              {quiz.niveau}
            </span>
            {quiz.semestre && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                S{quiz.semestre}
              </span>
            )}
            {past && (
              hasTaken ? (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  ✓ Épreuve passée
                </span>
              ) : (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                  ⚠️ Évaluation manquée
                </span>
              )
            )}
          </div>
          <h3 className="font-black text-gray-800 text-lg">{quiz.ue || quiz.id}</h3>
          <p className="text-gray-500 text-xs mt-1">
            {past ? 'Session officielle : ' : 'Prévu le : '}
            <strong className="text-gray-700">{formatDate(quiz.launchTime)}</strong>
            {quiz.timePerQuestion ? ` • ${quiz.timePerQuestion}s par question` : ''}
          </p>
          {quiz.endTime && <p className="text-gray-400 text-[11px] mt-0.5">Clôture : {formatDate(quiz.endTime)}</p>}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {past ? (
            hasTaken ? (
              <Link
                to={`/review/${quiz.id || quiz.ue}`}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-sm"
              >
                Relire ma copie
              </Link>
            ) : (
              user && (
                <Link
                  to={`/quiz/${quiz.id || quiz.ue}?mode=rattrapage`}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-black transition shadow-sm"
                >
                  Rattraper l'épreuve
                </Link>
              )
            )
          ) : (
            <Link
              to="/dashboard"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-xs font-black transition shadow-sm"
            >
              Rejoindre l'espace
            </Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/dashboard" className="text-blue-600 hover:underline text-xs font-bold flex items-center gap-1">
            ← Retour à mon espace
          </Link>
          {user && (
            <div className="text-xs text-gray-500">
              Connecté : <strong>{user.name}</strong> ({user.filiere} • {user.niveau})
            </div>
          )}
        </div>

        <div>
          <h1 className="text-2xl font-black text-gray-800">Emploi du Temps — Évaluations QCM</h1>
          <p className="text-xs text-gray-500 mt-0.5">Portail Officiel • Université de Yaoundé 1</p>
        </div>

        {/* Barre de Filtres */}
        <div className="bg-white rounded-2xl shadow-sm p-4 border border-gray-200 flex gap-3 flex-wrap items-center">
          {/* Si utilisateur connecté, filière fixe avec badge (Point 3) */}
          {user ? (
            <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl text-xs">
              <span className="text-gray-500">Filière (liée à votre compte) :</span>
              <strong className="text-blue-700 font-extrabold">{user.filiere}</strong>
            </div>
          ) : (
            <select
              className="flex-1 min-w-32 p-2.5 border-2 border-gray-100 rounded-xl text-xs outline-none focus:border-blue-500"
              value={filter.filiere}
              onChange={e => setFilter(f => ({ ...f, filiere: e.target.value }))}
            >
              <option value="">Toutes filières</option>
              <option>Informatique</option>
              <option>Mathématiques</option>
              <option>Physique</option>
              <option>Chimie</option>
              <option>Biologie</option>
            </select>
          )}

          {/* Sélecteur de niveau au sein de la filière */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-bold">Niveau :</span>
            <select
              className="p-2 border-2 border-gray-100 rounded-xl text-xs outline-none focus:border-blue-500 font-bold"
              value={filter.niveau}
              onChange={e => setFilter(f => ({ ...f, niveau: e.target.value }))}
            >
              <option value="">Tous niveaux</option>
              <option>L1</option>
              <option>L2</option>
              <option>L3</option>
              <option>M1</option>
              <option>M2</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400 text-xs animate-pulse">
            Chargement de l'emploi du temps...
          </div>
        ) : (
          <div className="space-y-8">
            {/* Prochains QCM */}
            <section>
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                Prochaines Évaluations ({filtered(upcomingQuizzes).length})
              </h2>
              {filtered(upcomingQuizzes).length === 0 ? (
                <div className="text-center py-8 bg-white rounded-2xl text-gray-400 text-xs border border-dashed border-gray-200">
                  Aucune évaluation programmée à venir pour ces critères.
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered(upcomingQuizzes).map(q => <QuizCard key={q.id} quiz={q} past={false} />)}
                </div>
              )}
            </section>

            {/* QCM Passés */}
            <section>
              <h2 className="text-sm font-black text-gray-700 uppercase tracking-wider mb-3">
                📚 Évaluations Passées ({filtered(pastQuizzes).length})
              </h2>
              {filtered(pastQuizzes).length === 0 ? (
                <div className="text-center py-8 bg-white rounded-2xl text-gray-400 text-xs border border-dashed border-gray-200">
                  Aucune évaluation passée enregistrée.
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered(pastQuizzes).map(q => <QuizCard key={q.id} quiz={q} past={true} />)}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
