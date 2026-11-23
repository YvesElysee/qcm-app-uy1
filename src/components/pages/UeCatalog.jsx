import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../services/api';
import { getCurrentUser } from '../../services/authService';
import usePageTitle from '../../hooks/usePageTitle';
import Icon from '../ui/icons.jsx';
import {
  QUIZ_STATUS_META,
  isHighlighted,
  quizStatus,
  quizUeCode,
  ueCode
} from '../../utils/ueCatalog.js';

/**
 * Annuaire des UE : point d'entrée unique de l'espace étudiant.
 * Chaque carte résume les cours, les QCM en cours/à venir et les copies
 * passées ; le détail de l'UE contient tout le reste.
 */
export default function UeCatalog() {
  usePageTitle('Mes UE');
  const user = getCurrentUser();

  const [ues, setUes] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [resources, setResources] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [semester, setSemester] = useState('all');
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
        api('/resources', { auth: 'student' }).catch(() => ({ resources: [] })),
        api('/results/mine', { auth: 'student' }).catch(() => ({ results: [] }))
      ]);
      setUes(Array.isArray(uesData.ues) ? uesData.ues : []);
      setQuizzes(Array.isArray(quizzesData.quizzes) ? quizzesData.quizzes : []);
      setResources(Array.isArray(resourcesData.resources) ? resourcesData.resources : []);
      setResults(Array.isArray(resultsData.results) ? resultsData.results : []);
      setNowTs(Date.now());
    } catch (err) {
      setError(err.message || "Impossible de charger les unités d'enseignement.");
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    const start = async () => { await load(); };
    start();
  }, [load]);

  const now = nowTs;
  const passedIds = useMemo(
    () => new Set(results.map((r) => r.quizId || ueCode(r.ue))),
    [results]
  );

  const catalog = useMemo(() => {
    const codes = new Set(ues.map((u) => ueCode(u.code || u.id)));
    quizzes.forEach((q) => codes.add(quizUeCode(q)));
    resources.forEach((r) => { if (ueCode(r.ue)) codes.add(ueCode(r.ue)); });
    results.forEach((r) => { if (ueCode(r.ue)) codes.add(ueCode(r.ue)); });

    const term = search.trim().toLocaleLowerCase('fr');
    return [...codes]
      .map((code) => {
        const ue = ues.find((u) => ueCode(u.code || u.id) === code) || {};
        const tests = quizzes
          .filter((q) => quizUeCode(q) === code)
          .map((q) => ({ ...q, status: quizStatus(q, now, passedIds) }))
          .sort((a, b) => (a.launchTime || Number.MAX_SAFE_INTEGER) - (b.launchTime || Number.MAX_SAFE_INTEGER));
        const docs = resources.filter((r) => ueCode(r.ue) === code);
        const copies = results.filter((r) => ueCode(r.ue) === code);
        const highlighted = tests.filter((t) => isHighlighted(t.status));
        const status = highlighted.some((t) => t.status === 'ongoing')
          ? 'ongoing'
          : highlighted.length
            ? 'upcoming'
            : copies.length
              ? 'done'
              : 'none';
        return {
          code,
          label: ue.label || ue.name || '',
          semestre: String(ue.semestre || tests[0]?.semestre || ''),
          tests,
          docs,
          copies,
          highlighted,
          status
        };
      })
      .filter((ue) => {
        const matchesSemester = semester === 'all' || !ue.semestre || ue.semestre === semester;
        const matchesTerm = !term ||
          ue.code.toLocaleLowerCase('fr').includes(term) ||
          String(ue.label).toLocaleLowerCase('fr').includes(term);
        return matchesSemester && matchesTerm;
      })
      .sort((a, b) => {
        if (a.status === 'ongoing' && b.status !== 'ongoing') return -1;
        if (b.status === 'ongoing' && a.status !== 'ongoing') return 1;
        if (a.status === 'upcoming' && b.status !== 'upcoming') return -1;
        if (b.status === 'upcoming' && a.status !== 'upcoming') return 1;
        return a.code.localeCompare(b.code, 'fr', { numeric: true });
      });
  }, [ues, quizzes, resources, results, passedIds, search, semester, now]);

  const totalHighlighted = quizzes.filter((q) =>
    isHighlighted(quizStatus(q, now, passedIds))
  ).length;

  return (
    <div className="flex-1 bg-slate-950 py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div>
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs font-bold transition mb-2"
            >
              <Icon name="arrow-left" size={14} />
              Retour à mon espace
            </Link>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Icon name="book" size={22} className="text-blue-400" />
              Mes unités d'enseignement
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              Tout est regroupé ici : cours, TD, anciens sujets, QCM en cours ou à venir et copies passées.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] font-bold">
            <span className="bg-blue-500/15 text-blue-300 border border-blue-500/30 px-3 py-1.5 rounded-full">
              {catalog.length} UE(s)
            </span>
            <span className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-full">
              {totalHighlighted} QCM en cours / à venir
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-r from-blue-950/70 via-slate-900 to-emerald-950/60 border border-blue-700/40 rounded-2xl p-5 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex items-start gap-3">
            <span className="w-11 h-11 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 flex items-center justify-center shrink-0">
              <Icon name="graduation" size={21} />
            </span>
            <div>
              <h2 className="text-sm font-black text-white">Ouvrez une UE pour tout retrouver au même endroit</h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Les rattrapages et les QCM déjà passés ne sont plus affichés en tête de l'espace :
                ils sont rangés dans leur UE, avec les cours, TD et anciens sujets.
              </p>
            </div>
          </div>
          <Link
            to="/dashboard"
            className="shrink-0 inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition"
          >
            <Icon name="arrow-right" size={14} />
            Voir l'espace
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher une UE (code ou intitulé)"
            className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-600"
          />
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1">
            {[
              { value: 'all', label: 'Tous' },
              { value: '1', label: 'S1' },
              { value: '2', label: 'S2' }
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSemester(tab.value)}
                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition ${
                  semester === tab.value
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-950/50 border border-red-800 text-red-300 text-xs rounded-xl p-3">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-slate-500 text-xs py-12 animate-pulse">Chargement des UE…</p>
        ) : catalog.length === 0 ? (
          <div className="text-center py-12 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-xs text-slate-500">
            Aucune UE ne correspond à votre recherche.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {catalog.map((ue) => {
              const meta = QUIZ_STATUS_META[ue.status] || QUIZ_STATUS_META.none;
              return (
                <Link
                  key={ue.code}
                  to={`/ues/${encodeURIComponent(ue.code)}`}
                  className="group bg-slate-900/70 hover:bg-slate-800 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-5 transition flex flex-col gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-base font-black text-white">{ue.code}</span>
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${meta.cls}`}>
                          {meta.label}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                        {ue.label || 'Intitulé à préciser par l’administration'}
                      </p>
                    </div>
                    <Icon name="arrow-right" size={16} className="text-blue-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 text-center">
                    <div className="bg-slate-950/60 rounded-xl px-2 py-2">
                      <p className="text-sm font-black text-blue-300">{ue.docs.length}</p>
                      <p className="text-[10px] text-slate-500">Cours / TD</p>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl px-2 py-2">
                      <p className="text-sm font-black text-emerald-300">{ue.highlighted.length}</p>
                      <p className="text-[10px] text-slate-500">En cours / à venir</p>
                    </div>
                    <div className="bg-slate-950/60 rounded-xl px-2 py-2">
                      <p className="text-sm font-black text-indigo-300">{ue.copies.length}</p>
                      <p className="text-[10px] text-slate-500">QCM passés</p>
                    </div>
                  </div>

                  {ue.highlighted.length > 0 && (
                    <div className="space-y-1">
                      {ue.highlighted.slice(0, 2).map((test) => (
                        <div key={test.id} className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="truncate text-slate-300">{test.title || test.id}</span>
                          <span className={QUIZ_STATUS_META[test.status].cls + ' px-2 py-0.5 rounded-full font-black'}>
                            {QUIZ_STATUS_META[test.status].label}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] font-black text-blue-400 uppercase tracking-wider mt-auto">
                    Ouvrir l'UE →
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
