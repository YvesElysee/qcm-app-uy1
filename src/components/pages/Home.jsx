import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { getCurrentUser } from '../../services/authService';
import usePageTitle from '../../hooks/usePageTitle';
import Icon from '../ui/icons.jsx';
import { APK_DOWNLOAD_URL, FEATURES, STEPS } from '../../constants/portalInfo.js';
import { showApkDownload } from '../../utils/appEnvironment.js';

// Chaîne officielle QCM App : invitée sur toutes les pages, connecté ou non.
const WHATSAPP_CHANNEL = 'https://whatsapp.com/channel/0029Vb96OnjLCoXA4RDPES2n';

/**
 * Page d'accueil publique : présentation du portail et statistiques en direct
 * (API publique).
 */
export default function Home() {
  usePageTitle('Accueil');

  const user = getCurrentUser();
  const apkDownloadAvailable = showApkDownload();
  const [stats, setStats] = useState(null);

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

      setStats(publicStats || {
        quizzes: quizList.length,
        ues: 0,
        students: 0,
        upcoming: 0
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

          <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-center gap-3 mt-8">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm px-7 py-3.5 rounded-2xl transition shadow-lg shadow-blue-600/30"
                >
                  Accéder à mon espace
                  <Icon name="arrow-right" size={16} />
                </Link>
                <Link
                  to="/schedule"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm px-6 py-3.5 rounded-2xl transition"
                >
                  <Icon name="calendar" size={16} />
                  Voir le planning
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/register"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-sm px-7 py-3.5 rounded-2xl transition shadow-lg shadow-blue-600/30"
                >
                  Créer mon compte étudiant
                  <Icon name="arrow-right" size={16} />
                </Link>
                <Link
                  to="/schedule"
                  className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-sm px-6 py-3.5 rounded-2xl transition"
                >
                  <Icon name="calendar" size={16} />
                  Voir le planning public
                </Link>
                <Link
                  to="/login"
                  className="inline-flex w-full sm:w-auto items-center justify-center text-blue-300 hover:text-white text-sm font-bold underline-offset-4 hover:underline py-2"
                >
                  Déjà inscrit ? Se connecter
                </Link>
              </>
            )}
            <a
              href={WHATSAPP_CHANNEL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm px-6 py-3.5 rounded-2xl transition shadow-lg shadow-emerald-600/25"
            >
              <Icon name="chat" size={16} />
              Rejoindre la chaîne WhatsApp
            </a>
            {apkDownloadAvailable && (
              <a
                href={APK_DOWNLOAD_URL}
                download="QCM App.apk"
                title="Application Android · fichier APK"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-black text-sm px-6 py-3.5 rounded-2xl transition shadow-lg shadow-indigo-600/25"
              >
                <Icon name="download" size={16} />
                Télécharger l'application Android
              </a>
            )}
          </div>
          {apkDownloadAvailable && (
            <p className="text-[11px] text-slate-500 mt-3">
              Android uniquement · installez le fichier APK puis ouvrez l'application : elle se connecte directement au portail.
            </p>
          )}
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

      {/* ── IA & documents : ce que beaucoup d'étudiants ignorent ── */}
      <section className="max-w-6xl mx-auto px-4 mt-14" aria-label="Tuteur IA et partage de cours">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative overflow-hidden bg-gradient-to-br from-blue-950 via-slate-900 to-indigo-950 border border-blue-700/40 rounded-3xl p-6 md:p-8">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-blue-600/20 rounded-full blur-3xl" aria-hidden="true" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 bg-blue-500/15 border border-blue-500/30 text-blue-300 text-[11px] font-bold px-3 py-1 rounded-full">
                <Icon name="sparkles" size={13} />
                Nouveau · Tuteur IA
              </span>
              <h2 className="text-xl md:text-2xl font-black text-white mt-4">
                Une IA pour vous expliquer, pas pour tricher
              </h2>
              <p className="text-xs md:text-sm text-slate-300 mt-2 leading-relaxed">
                Après chaque QCM, demandez au tuteur IA pourquoi une réponse est fausse,
                faites-vous réexpliquer une notion ou obtenir une méthode de révision.
                Il est inclus dans votre espace étudiant.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                <Link
                  to={user ? '/dashboard' : '/register'}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-md shadow-blue-600/25"
                >
                  <Icon name="chat" size={14} />
                  {user ? 'Ouvrir le tuteur IA' : 'Créer un compte pour en profiter'}
                </Link>
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-950 via-slate-900 to-teal-950 border border-emerald-700/40 rounded-3xl p-6 md:p-8">
            <div className="absolute -top-10 -right-10 w-40 h-40 bg-emerald-600/20 rounded-full blur-3xl" aria-hidden="true" />
            <div className="relative">
              <span className="inline-flex items-center gap-2 bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[11px] font-bold px-3 py-1 rounded-full">
                <Icon name="upload" size={13} />
                Partage de cours
              </span>
              <h2 className="text-xl md:text-2xl font-black text-white mt-4">
                Déposez vos documents, on construit vos QCM
              </h2>
              <p className="text-xs md:text-sm text-slate-300 mt-2 leading-relaxed">
                PDF, Word, PowerPoint, Excel, texte… Partagez vos cours et annales.
                Plus votre filière dépose de documents, plus vite ses QCM et exercices
                sont produits par l'équipe.
              </p>
              <div className="flex flex-wrap gap-2 mt-5">
                <Link
                  to={user ? '/resources' : '/register'}
                  className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition shadow-md shadow-emerald-600/25"
                >
                  <Icon name="document" size={14} />
                  {user ? 'Déposer un document' : "Rejoindre ma filière"}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Présentation réservée aux visiteurs non connectés : une fois le
          compte ouvert, ces explications n'apparaissent plus nulle part. */}
      {!user && (
        <>
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
        </>
      )}

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
            <a
              href={WHATSAPP_CHANNEL}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex items-center justify-center gap-2 text-emerald-200 hover:text-white text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/30 px-4 py-2.5 rounded-xl transition"
            >
              <Icon name="chat" size={14} />
              Suivre la chaîne WhatsApp officielle
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
