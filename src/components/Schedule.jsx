import { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Link } from 'react-router-dom';
import { getCurrentUser } from '../services/authService';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';

export default function Schedule() {
  usePageTitle('Emploi du temps');

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
        const data = await api('/quizzes?sort=asc');
        const all = data.quizzes;
        const now = Date.now();
        setUpcomingQuizzes(all.filter(q => q.launchTime && q.launchTime > now));
        setPastQuizzes(all.filter(q => q.launchTime && q.launchTime <= now).reverse());

        if (user) {
          const rData = await api('/results/mine', { auth: 'student' }).catch(() => ({ results: [] }));
          setMyResults(rData.results);
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
    if (f === 'Informatique') return 'bg-blue-500/15 text-blue-300';
    if (f === 'Mathématiques') return 'bg-purple-500/15 text-purple-300';
    if (f === 'Physique') return 'bg-amber-500/15 text-amber-300';
    return 'bg-slate-800 text-slate-300';
  };

  const QuizCard = ({ quiz, past }) => {
    const hasTaken = passedUes.has(quiz.id || quiz.ue);
    return (
      <div className={`bg-slate-900 rounded-2xl border border-slate-800 border-l-4 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition hover:border-slate-700 ${past ? (hasTaken ? 'border-l-emerald-500' : 'border-l-red-500') : 'border-l-blue-500'}`}>
        <div>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full ${badgeColor(quiz.filiere)}`}>
              {quiz.filiere}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
              {quiz.niveau}
            </span>
            {quiz.semestre && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                S{quiz.semestre}
              </span>
            )}
            {past && (
              hasTaken ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                  <Icon name="check-circle" size={11} />
                  Épreuve passée
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full bg-red-500/15 text-red-300">
                  <Icon name="alert" size={11} />
                  Évaluation manquée
                </span>
              )
            )}
          </div>
          <h3 className="font-black text-white text-lg">{quiz.ue || quiz.id}</h3>
          <p className="text-slate-400 text-xs mt-1">
            {past ? 'Session officielle : ' : 'Prévu le : '}
            <strong className="text-slate-200">{formatDate(quiz.launchTime)}</strong>
            {quiz.timePerQuestion ? ` • ${quiz.timePerQuestion}s par question` : ''}
          </p>
          {quiz.endTime && <p className="text-slate-500 text-[11px] mt-0.5">Clôture : {formatDate(quiz.endTime)}</p>}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          {past ? (
            hasTaken ? (
              <Link
                to={`/review/${quiz.id || quiz.ue}`}
                className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-xs font-bold transition"
              >
                <Icon name="eye" size={14} />
                Relire ma copie
              </Link>
            ) : (
              user && (
                <Link
                  to={`/quiz/${quiz.id || quiz.ue}?mode=rattrapage`}
                  className="inline-flex items-center gap-1.5 bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-black transition"
                >
                  <Icon name="refresh" size={14} />
                  Rattraper l'épreuve
                </Link>
              )
            )
          ) : user ? (
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black transition"
            >
              <Icon name="arrow-right" size={14} />
              Rejoindre depuis mon espace
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-xs font-black transition"
            >
              <Icon name="lock" size={14} />
              Se connecter pour rejoindre
            </Link>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 bg-slate-950 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          {user ? (
            <Link to="/dashboard" className="text-blue-400 hover:text-blue-300 text-xs font-bold flex items-center gap-1.5 transition">
              <Icon name="arrow-left" size={14} />
              Retour à mon espace
            </Link>
          ) : (
            <Link to="/" className="text-blue-400 hover:text-blue-300 text-xs font-bold flex items-center gap-1.5 transition">
              <Icon name="arrow-left" size={14} />
              Retour à l'accueil
            </Link>
          )}
          <span className="text-xs text-slate-500">
            {user ? `${user.filiere} • ${user.niveau}` : 'Consultation publique'}
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-black text-white">Emploi du Temps — Évaluations QCM</h1>
          <p className="text-xs text-slate-400 mt-0.5">Portail Officiel • UY1</p>
        </div>

        {/* Barre de Filtres */}
        <div className="bg-slate-900 rounded-2xl p-4 border border-slate-800 flex gap-3 flex-wrap items-center">
          {/* Si utilisateur connecté, filière fixe avec badge (Point 3) */}
          {user ? (
            <div className="flex items-center gap-2 bg-blue-950/50 border border-blue-900/60 px-3 py-2 rounded-xl text-xs">
              <span className="text-slate-400">Filière (liée à votre compte) :</span>
              <strong className="text-blue-300 font-extrabold">{user.filiere}</strong>
            </div>
          ) : (
            <select
              className="flex-1 min-w-32 p-2.5 border border-slate-800 bg-slate-950 text-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 transition"
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
            <span className="text-xs text-slate-400 font-bold">Niveau :</span>
            <select
              className="p-2 border border-slate-800 bg-slate-950 text-slate-200 rounded-xl text-xs outline-none focus:border-blue-600 transition font-bold"
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
          <div className="text-center py-20 text-slate-500 text-xs animate-pulse">
            Chargement de l'emploi du temps...
          </div>
        ) : (
          <div className="space-y-8">
            {/* Prochains QCM */}
            <section>
              <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping"></span>
                Prochaines Évaluations ({filtered(upcomingQuizzes).length})
              </h2>
              {filtered(upcomingQuizzes).length === 0 ? (
                <div className="text-center py-8 bg-slate-900 rounded-2xl text-slate-500 text-xs border border-dashed border-slate-800">
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
              <h2 className="text-sm font-black text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                <Icon name="book" size={15} className="text-blue-400" />
                Évaluations Passées ({filtered(pastQuizzes).length})
              </h2>
              {filtered(pastQuizzes).length === 0 ? (
                <div className="text-center py-8 bg-slate-900 rounded-2xl text-slate-500 text-xs border border-dashed border-slate-800">
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
