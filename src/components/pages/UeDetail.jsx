import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, getSession } from '../../services/api';
import { getCurrentUser } from '../../services/authService';
import usePageTitle from '../../hooks/usePageTitle';
import Icon from '../ui/icons.jsx';
import { resourceTypeIcon, resourceTypeLabel } from '../../constants/resourceTypes.js';
import {
  QUIZ_STATUS_META,
  groupResultsByUe,
  isHighlighted,
  noteOn20,
  quizStatus,
  quizUeCode,
  ueCode
} from '../../utils/ueCatalog.js';

function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} o`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`;
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`;
}

const formatDate = (value) => {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
};

/** Vue détaillée d'une UE : cours/TD/anciens sujets + QCM passés et rattrapages. */
export default function UeDetail() {
  const { code: routeCode } = useParams();
  const code = ueCode(routeCode);
  const navigate = useNavigate();
  const user = getCurrentUser();
  usePageTitle(`UE ${code}`);

  const [ues, setUes] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [resources, setResources] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nowTs, setNowTs] = useState(0);

  const scope = useMemo(() => {
    const params = new URLSearchParams();
    if (user?.filiere) params.set('filiere', user.filiere);
    if (user?.niveau) params.set('niveau', user.niveau);
    if (user?.faculte) params.set('faculte', user.faculte);
    return params.toString();
  }, [user]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [uesData, quizzesData, resourcesData, resultsData] = await Promise.all([
        api(`/ues${scope ? `?${scope}` : ''}`),
        api(`/quizzes${scope ? `?${scope}&sort=asc` : '?sort=asc'}`),
        api(`/resources?ue=${encodeURIComponent(code)}`, { auth: 'student' }).catch(() => ({ resources: [] })),
        api('/results/mine', { auth: 'student' }).catch(() => ({ results: [] }))
      ]);
      setUes(Array.isArray(uesData.ues) ? uesData.ues : []);
      setQuizzes(Array.isArray(quizzesData.quizzes) ? quizzesData.quizzes : []);
      setResources(Array.isArray(resourcesData.resources) ? resourcesData.resources : []);
      setResults(Array.isArray(resultsData.results) ? resultsData.results : []);
      setNowTs(Date.now());
    } catch (err) {
      setError(err.message || "Impossible de charger l'UE.");
    } finally {
      setLoading(false);
    }
  }, [code, scope]);

  useEffect(() => {
    const start = async () => { await load(); };
    start();
  }, [load]);

  const ue = ues.find((u) => ueCode(u.code || u.id) === code) || {};
  const now = nowTs;
  const passedIds = useMemo(
    () => new Set(results.map((r) => r.quizId || ueCode(r.ue))),
    [results]
  );

  const ueQuizzes = useMemo(
    () => quizzes
      .filter((q) => quizUeCode(q) === code)
      .map((q) => ({ ...q, status: quizStatus(q, now, passedIds) }))
      .sort((a, b) => (a.launchTime || Number.MAX_SAFE_INTEGER) - (b.launchTime || Number.MAX_SAFE_INTEGER)),
    [quizzes, code, now, passedIds]
  );
  const highlighted = ueQuizzes.filter((q) => isHighlighted(q.status));
  const past = ueQuizzes.filter((q) => q.status === 'done' || q.status === 'makeup');
  const copiesByUe = useMemo(() => groupResultsByUe(results, quizzes), [results, quizzes]);
  const copies = copiesByUe.find((group) => group.code === code)?.items || [];

  const docsByType = useMemo(() => {
    const map = new Map();
    resources.forEach((item) => {
      const key = item.type || 'autre';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()].sort((a, b) => {
      const order = ['cours', 'td', 'tp', 'examen', 'corrige', 'fiche', 'autre'];
      return order.indexOf(a[0]) - order.indexOf(b[0]);
    });
  }, [resources]);

  const startQuiz = (quiz, makeup = false) => {
    localStorage.setItem('userSession', JSON.stringify({
      ...sessionForQuiz(user),
      filiere: user?.filiere || '',
      niveau: user?.niveau || '',
      ue: code,
      isMakeup: makeup
    }));
    navigate(`/quiz/${quiz.id}${makeup ? '?mode=rattrapage' : ''}`);
  };

  const download = async (item) => {
    try {
      const token = getSession()?.token;
      const res = await fetch(`/api/resources/${item.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Téléchargement impossible.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = item.originalName || 'ressource';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      setError(err.message || 'Téléchargement impossible.');
    }
  };

  return (
    <div className="flex-1 bg-slate-950 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Link
            to="/ues"
            className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-bold transition"
          >
            <Icon name="arrow-left" size={14} />
            Toutes les UE
          </Link>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white text-xs font-bold transition"
          >
            Mon espace
            <Icon name="arrow-right" size={14} />
          </Link>
        </div>

        <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-slate-900 border border-blue-700/40 rounded-3xl p-6">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black uppercase tracking-widest text-blue-400">Unité d'enseignement</span>
                {ue.semestre && (
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                    Semestre {ue.semestre}
                  </span>
                )}
              </div>
              <h1 className="text-3xl font-black text-white mt-1">{code}</h1>
              <p className="text-sm text-slate-300 mt-1">{ue.label || 'Intitulé à préciser par l’administration'}</p>
              <p className="text-[11px] text-slate-500 mt-2">
                {ue.filiere || user?.filiere || ''} · {ue.niveau || user?.niveau || ''}
              </p>
            </div>
            <Link
              to={`/resources?ue=${encodeURIComponent(code)}`}
              className="inline-flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition"
            >
              <Icon name="upload" size={14} />
              Déposer un document dans cette UE
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-slate-500 text-xs py-12 animate-pulse">Chargement de l'UE…</p>
        ) : (
          <>
            {/* ── QCM en cours et à venir (mis en avant) ── */}
            <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Icon name="calendar" size={18} className="text-emerald-400" />
                    QCM en cours et à venir
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Seules ces évaluations sont mises en avant dans l'espace.
                  </p>
                </div>
                <span className="text-[11px] font-black bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-full">
                  {highlighted.length} épreuve(s)
                </span>
              </div>

              {highlighted.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
                  Aucune épreuve en cours ou à venir pour cette UE.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {highlighted.map((quiz) => {
                    const meta = QUIZ_STATUS_META[quiz.status];
                    return (
                      <div key={quiz.id} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col gap-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                          <span className="text-[10px] text-slate-500">{quiz.questionCount || 0} question(s)</span>
                        </div>
                        <div>
                          <h3 className="text-sm font-black text-white">{quiz.title || code}</h3>
                          <p className="text-[11px] text-slate-400 mt-1">Début : {formatDate(quiz.launchTime)}</p>
                        </div>
                        {quiz.status === 'ongoing' ? (
                          <button
                            onClick={() => startQuiz(quiz, false)}
                            className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black py-2.5 rounded-xl transition"
                          >
                            Rejoindre l'épreuve
                          </button>
                        ) : (
                          <div className="w-full text-center bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-bold py-2.5 rounded-xl">
                            Ouverture le {formatDate(quiz.launchTime)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── Cours, TD, TP, anciens sujets et corrigés ── */}
            <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Icon name="book" size={18} className="text-blue-400" />
                    Cours, TD et anciens sujets
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tous les documents partagés pour cette UE, classés par type.
                  </p>
                </div>
                <span className="text-[11px] font-black bg-blue-500/15 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-full">
                  {resources.length} document(s)
                </span>
              </div>

              {docsByType.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
                  Aucun document déposé pour cette UE pour le moment.
                </div>
              ) : (
                <div className="space-y-4">
                  {docsByType.map(([type, items]) => (
                    <div key={type}>
                      <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1.5">
                        <Icon name={resourceTypeIcon(type)} size={12} />
                        {resourceTypeLabel(type)} ({items.length})
                      </h3>
                      <div className="space-y-2">
                        {items.map((item) => (
                          <div
                            key={item.id}
                            className="bg-slate-950/60 border border-slate-800 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-200 truncate">{item.title}</p>
                              <p className="text-[10px] text-slate-500 mt-0.5">
                                {item.originalName} · {humanSize(item.size)} · {formatDate(item.createdAt)}
                              </p>
                            </div>
                            <button
                              onClick={() => download(item)}
                              className="shrink-0 inline-flex items-center gap-1.5 bg-blue-600/15 hover:bg-blue-600/30 text-blue-300 border border-blue-600/30 text-[11px] font-black px-3 py-2 rounded-lg transition"
                            >
                              <Icon name="download" size={13} />
                              Télécharger
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── QCM passés + rattrapages, regroupés dans l'UE ── */}
            <section className="bg-slate-900/70 border border-slate-800 rounded-3xl p-6">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-4">
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    <Icon name="check-circle" size={18} className="text-indigo-400" />
                    QCM passés et rattrapages
                  </h2>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Vos copies de cette UE et les épreuves manquées à rattraper.
                  </p>
                </div>
                <span className="text-[11px] font-black bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 px-3 py-1.5 rounded-full">
                  {copies.length} copie(s)
                </span>
              </div>

              {copies.length === 0 && past.length === 0 ? (
                <div className="text-center py-8 bg-slate-950/50 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
                  Vous n'avez pas encore de QCM passé dans cette UE.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {copies.map((res) => {
                    const note = noteOn20(res);
                    const quiz = quizzes.find((q) => q.id === (res.quizId || res.ue));
                    const isGood = note !== null && note >= 10;
                    return (
                      <div key={res.id} className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-white">
                              {res.quizTitle || quiz?.title || res.ue}
                            </span>
                            {res.isMakeup ? (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300">
                                Rattrapage
                              </span>
                            ) : null}
                          </div>
                          <p className="text-[10px] text-slate-500 mt-1">Passé le {formatDate(res.date)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className={`text-lg font-black ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
                              {note === null ? '-' : `${note.toFixed(1)}/20`}
                            </p>
                            <p className="text-[10px] text-slate-500">{res.score}/{res.total}</p>
                          </div>
                          <Link
                            to={`/review/${res.quizId || res.ue}`}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-black px-3 py-2 rounded-xl transition"
                          >
                            Relire ma copie
                          </Link>
                        </div>
                      </div>
                    );
                  })}

                  {past.filter((q) => q.status === 'makeup').map((quiz) => (
                    <div key={`makeup-${quiz.id}`} className="bg-red-950/30 border border-red-800/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-white">{quiz.title || code} · rattrapage disponible</p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Session du {formatDate(quiz.launchTime)} non réussie ou manquée.
                        </p>
                      </div>
                      <button
                        onClick={() => startQuiz(quiz, true)}
                        className="bg-red-600 hover:bg-red-500 text-white text-[11px] font-black px-4 py-2.5 rounded-xl transition"
                      >
                        Rattraper l'épreuve
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

/** Conserve le jeton étudiant : la session QuizSession l'utilise pour l'API. */
function sessionForQuiz(user) {
  if (!user) return {};
  const safe = { ...user };
  delete safe.password;
  return safe;
}
