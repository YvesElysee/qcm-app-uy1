import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { getCurrentUser } from '../../services/authService';
import usePageTitle from '../../hooks/usePageTitle';
import Icon from '../ui/icons.jsx';

const FEATURES = [
  {
    icon: 'clock',
    title: 'Évaluations chronométrées',
    desc: 'Un temps imparti par question, avec questions et réponses mélangées différemment pour chaque candidat.',
    style: 'bg-blue-500/15 text-blue-300'
  },
  {
    icon: 'refresh',
    title: 'Rattrapage garanti',
    desc: "Une épreuve manquée ? Repassez-la à votre rythme avec les mêmes questions et le même temps imparti.",
    style: 'bg-red-500/15 text-red-300'
  },
  {
    icon: 'document',
    title: 'Corrections détaillées',
    desc: 'Relisez votre copie question par question avec la bonne réponse et votre note sur 20.',
    style: 'bg-emerald-500/15 text-emerald-300'
  },
  {
    icon: 'calendar',
    title: 'Emploi du temps public',
    desc: 'La programmation des évaluations est consultable librement, même sans compte étudiant.',
    style: 'bg-amber-500/15 text-amber-300'
  },
  {
    icon: 'chat',
    title: 'Assistance intégrée',
    desc: "Suggérez des améliorations ou signalez un problème à l'administration depuis votre espace.",
    style: 'bg-purple-500/15 text-purple-300'
  },
  {
    icon: 'lock',
    title: 'Comptes sécurisés',
    desc: 'Mots de passe protégés côté serveur et sessions par jeton : vos résultats ne sont visibles que par vous.',
    style: 'bg-cyan-500/15 text-cyan-300'
  }
];

const STEPS = [
  {
    n: '1',
    title: 'Créez votre compte',
    desc: "Nom, email, filière et niveau · c'est tout. Votre filière est ensuite verrouillée pour la sécurité des épreuves."
  },
  {
    n: '2',
    title: 'Suivez le planning',
    desc: 'Consultez les évaluations à venir, en cours et passées de votre filière et de votre niveau.'
  },
  {
    n: '3',
    title: 'Passez vos épreuves',
    desc: 'Rejoignez l’épreuve au moment voulu, obtenez votre note immédiatement et relisez votre copie.'
  }
];

function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * Page d'accueil publique : présentation du portail, statistiques en direct
 * (API publique) et prochaines évaluations.
 */
export default function Home() {
  usePageTitle('Accueil');

  const user = getCurrentUser();
  const [stats, setStats] = useState(null);
  const [upcoming, setUpcoming] = useState([]);

  // Statistiques publiques : QCM, UE, étudiants inscrits et épreuves à venir
  useEffect(() => {
    let ignore = false;
    (async () => {
      let quizList = [];
      let publicStats = null;
      try {
        const [qData, sData] = await Promise.all([api('/quizzes'), api('/stats')]);
        quizList = qData.quizzes || [];
        publicStats = sData;
      } catch (err) {
        console.warn('Erreur chargement des données publiques :', err);
      }
      if (ignore) return;

      const nowMs = Date.now();
      const upcomingList = quizList
        .filter(q => q.launchTime && q.launchTime > nowMs)
        .sort((a, b) => a.launchTime - b.launchTime);

      setUpcoming(upcomingList);
      setStats(publicStats || {
        quizzes: quizList.length,
        ues: 0,
        students: 0,
        upcoming: upcomingList.length
      });
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const statCards = [
    { label: 'Évaluations programmées', value: stats ? stats.quizzes : '…', icon: 'document' },
    { label: 'Étudiants inscrits', value: stats ? stats.students : '…', icon: 'users' },
    { label: "Unités d'enseignement", value: stats ? stats.ues : '…', icon: 'book' },
    { label: 'Épreuves à venir', value: stats ? stats.upcoming : '…', icon: 'calendar' }
  ];

  return (
    <div className="bg-slate-950 text-slate-100">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-blue-950">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-blue-600/20 rounded-full blur-3xl" aria-hidden="true" />
        <div className="absolute -bottom-32 -left-24 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" aria-hidden="true" />

        <div className="relative max-w-6xl mx-auto px-4 pt-16 pb-24 text-center">
          <span className="inline-flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-bold px-4 py-1.5 rounded-full">
            <Icon name="graduation" size={14} />
            QCM App · Évaluation en ligne 2026
          </span>

          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight max-w-3xl mx-auto mt-6">
            Vos évaluations QCM{' '}
            <span className="bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              en ligne et sans stress
            </span>
          </h1>

          <p className="text-slate-300 text-sm md:text-base max-w-2xl mx-auto mt-5 leading-relaxed">
            Passez vos évaluations officielles en ligne : questions chronométrées, corrections
            détaillées, rattrapages garantis et emploi du temps public.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm px-7 py-3.5 rounded-2xl transition shadow-lg shadow-blue-600/30"
                >
                  Accéder à mon espace
                  <Icon name="arrow-right" size={16} />
                </Link>
                <Link
                  to="/schedule"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm px-6 py-3.5 rounded-2xl transition"
                >
                  <Icon name="calendar" size={16} />
                  Voir le planning
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="bg-blue-600 hover:bg-blue-500 text-white font-black text-sm px-7 py-3.5 rounded-2xl transition shadow-lg shadow-blue-600/30"
                >
                  Créer mon compte étudiant
                </Link>
                <Link
                  to="/schedule"
                  className="inline-flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm px-6 py-3.5 rounded-2xl transition"
                >
                  <Icon name="calendar" size={16} />
                  Voir le planning public
                </Link>
                <Link
                  to="/login"
                  className="text-blue-300 hover:text-white text-sm font-bold underline-offset-4 hover:underline"
                >
                  Déjà inscrit ? Se connecter
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ── Statistiques en direct ── */}
      <section className="max-w-6xl mx-auto px-4 -mt-10 relative z-10" aria-label="Statistiques du portail">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {statCards.map(s => (
            <div
              key={s.label}
              className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl shadow-black/30"
            >
              <div className="flex items-center justify-between">
                <div className="text-3xl font-black text-white">{s.value}</div>
                <span className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-300 flex items-center justify-center">
                  <Icon name={s.icon} size={17} />
                </span>
              </div>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mt-1">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Prochaines évaluations ── */}
      <section className="max-w-6xl mx-auto px-4 mt-14">
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 md:p-8">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
            <div>
              <h2 className="text-xl font-black text-white">Prochaines évaluations</h2>
              <p className="text-xs text-slate-400 mt-0.5">Programmation officielle · consultable librement</p>
            </div>
            <Link
              to="/schedule"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-300 hover:text-white bg-blue-950/60 border border-blue-800/60 hover:bg-blue-900 px-4 py-2 rounded-xl transition"
            >
              Tout le planning
              <Icon name="arrow-right" size={13} />
            </Link>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-slate-700 rounded-2xl text-slate-400 text-xs">
              Aucune évaluation programmée pour le moment. Revenez bientôt !
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {upcoming.slice(0, 3).map(q => (
                <div key={q.id} className="bg-slate-950/60 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-4 transition">
                  <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                    <span className="bg-blue-500/15 text-blue-300 text-[10px] font-black px-2 py-0.5 rounded-full">
                      {q.filiere}
                    </span>
                    <span className="bg-slate-800 text-slate-300 text-[10px] font-bold px-2 py-0.5 rounded-full">
                      {q.niveau}
                    </span>
                  </div>
                  <h3 className="font-black text-white text-base truncate">{q.ue || q.id}</h3>
                  <p className="flex items-center gap-1.5 text-xs text-slate-400 mt-1">
                    <Icon name="clock" size={13} />
                    {formatDate(q.launchTime)}
                  </p>
                  {q.endTime && (
                    <p className="text-[11px] text-slate-500 mt-0.5">Clôture : {formatDate(q.endTime)}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Fonctionnalités ── */}
      <section className="max-w-6xl mx-auto px-4 mt-14">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-white">Ce que le portail vous offre</h2>
          <p className="text-xs text-slate-400 mt-1">Tout ce qu'il faut pour évaluer et être évalué sereinement</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div
              key={f.title}
              className="bg-slate-900 border border-slate-800 hover:border-blue-500/40 rounded-2xl p-5 transition"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${f.style}`}>
                <Icon name={f.icon} size={20} />
              </div>
              <h3 className="font-black text-white text-sm">{f.title}</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Comment ça marche ── */}
      <section className="max-w-6xl mx-auto px-4 mt-14">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-black text-white">Comment ça marche ?</h2>
          <p className="text-xs text-slate-400 mt-1">Trois étapes, et vous êtes prêt</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {STEPS.map(s => (
            <div key={s.n} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 relative">
              <div className="w-9 h-9 rounded-full bg-blue-600 text-white font-black flex items-center justify-center text-sm shadow-lg shadow-blue-600/30">
                {s.n}
              </div>
              <h3 className="font-black text-white text-sm mt-4">{s.title}</h3>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Appel à l'action final ── */}
      <section className="max-w-6xl mx-auto px-4 mt-14 mb-6">
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 rounded-3xl p-10 md:p-14 text-center">
          <div className="absolute -top-16 -right-16 w-64 h-64 bg-white/10 rounded-full blur-3xl" aria-hidden="true" />
          <div className="relative">
            <h2 className="text-2xl md:text-3xl font-black text-white">
              Prêt pour votre prochaine évaluation ?
            </h2>
            <p className="text-blue-100/80 text-sm mt-2 max-w-xl mx-auto">
              {user
                ? 'Retrouvez toutes vos UE, épreuves et résultats au même endroit.'
                : "Créez votre compte en moins d'une minute et rejoignez votre filière."}
            </p>
            <div className="mt-6 flex justify-center gap-3 flex-wrap">
              {user ? (
                <Link
                  to="/dashboard"
                  className="bg-white text-blue-800 hover:bg-blue-50 font-black text-sm px-7 py-3.5 rounded-2xl transition shadow-lg"
                >
                  Accéder à mon espace
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="bg-white text-blue-800 hover:bg-blue-50 font-black text-sm px-7 py-3.5 rounded-2xl transition shadow-lg"
                  >
                    Créer mon compte
                  </Link>
                  <Link
                    to="/login"
                    className="bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold text-sm px-6 py-3.5 rounded-2xl transition"
                  >
                    Se connecter
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
