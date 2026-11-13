import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import usePageTitle from '../hooks/usePageTitle';
import Icon from './ui/icons.jsx';

function formatDate(iso) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('fr-FR', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
  });
}

/**
 * Révisions intelligentes : cartes issues des erreurs du QCM, planifiées par
 * répétition espacée. L'étudiant se réentraîne puis indique s'il savait.
 */
export default function RevisionSession() {
  usePageTitle('Révisions intelligentes');

  const [mode, setMode] = useState('due'); // 'due' | 'all'
  const [cards, setCards] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadStats = useCallback(async () => {
    try {
      const data = await api('/review/stats', { auth: 'student' });
      setStats(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const loadCards = useCallback(async (nextMode) => {
    const data = await api(`/review${nextMode === 'all' ? '?all=1' : ''}`, { auth: 'student' });
    setCards(data.cards || []);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([loadCards(mode), loadStats()]);
      } catch (err) {
        console.warn('Chargement des révisions impossible :', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [loadCards, loadStats, mode]);

  const current = cards[0];

  const currentOptions = current
    ? ['OptA', 'OptB', 'OptC', 'OptD']
      .map(k => current.options?.[k])
      .filter(v => typeof v === 'string' && v.trim() !== '')
    : [];

  const handleSelect = (option) => {
    if (revealed || saving) return;
    setSelected(option);
    setRevealed(true);
  };

  const schedule = async (remembered) => {
    if (!current || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const res = await api(`/review/${current.id}/answer`, {
        method: 'POST',
        auth: 'student',
        body: { remembered }
      });
      setCards(prev => prev.filter(c => c.id !== current.id));
      setSelected('');
      setRevealed(false);
      setMessage(remembered
        ? `Bien joué ! Prochaine révision : ${formatDate(res.nextDueAt)}.`
        : `Carte replanifiée demain (${formatDate(res.nextDueAt)}).`);
      await loadStats();
    } catch (err) {
      setMessage(`Erreur : ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const changeMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setCards([]);
    setSelected('');
    setRevealed(false);
    setMessage('');
  };

  const isCorrect = revealed && selected.trim() === (current?.correct || '').trim();

  return (
    <div className="min-h-screen bg-slate-950 py-10 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <Link to="/dashboard" className="text-blue-400 hover:text-blue-300 font-bold text-xs flex items-center gap-1.5 transition">
            <Icon name="arrow-left" size={14} />
            Retour à mon espace
          </Link>
          <Link to="/schedule" className="text-slate-400 hover:text-white font-bold text-xs flex items-center gap-1.5 transition">
            <Icon name="calendar" size={14} />
            Emploi du temps
          </Link>
        </div>

        <div className="bg-gradient-to-r from-emerald-700 to-blue-800 text-white rounded-2xl p-7 mb-5 shadow-lg shadow-emerald-900/30">
          <h1 className="text-2xl font-black flex items-center gap-2">
            <Icon name="sparkles" size={22} />
            Révisions intelligentes
          </h1>
          <p className="text-sm opacity-85 mt-1">
            Vos erreurs reviennent au bon moment pour être mémorisées durablement.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-5">
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <div className="text-2xl font-black">{stats?.due ?? '-'}</div>
              <div className="text-[11px] opacity-75 mt-0.5 font-bold uppercase tracking-wider">À réviser</div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <div className="text-2xl font-black">{stats?.total ?? '-'}</div>
              <div className="text-[11px] opacity-75 mt-0.5 font-bold uppercase tracking-wider">Cartes</div>
            </div>
            <div className="bg-white/10 rounded-xl p-3 text-center">
              <div className="text-sm font-black leading-tight mt-1">{stats?.nextDueAt ? formatDate(stats.nextDueAt) : '-'}</div>
              <div className="text-[11px] opacity-75 mt-1 font-bold uppercase tracking-wider">Prochaine</div>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => changeMode('due')}
            className={`text-xs font-bold px-3.5 py-2 rounded-xl transition border ${
              mode === 'due'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
            }`}
          >
            À réviser aujourd'hui {stats?.due ? `(${stats.due})` : ''}
          </button>
          <button
            onClick={() => changeMode('all')}
            className={`text-xs font-bold px-3.5 py-2 rounded-xl transition border ${
              mode === 'all'
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-600'
            }`}
          >
            Toutes mes cartes {stats?.total ? `(${stats.total})` : ''}
          </button>
        </div>

        {message && (
          <div className="bg-blue-950/50 border border-blue-800 text-blue-200 text-xs rounded-xl p-3 mb-4 flex items-start gap-2">
            <Icon name="info" size={14} className="mt-0.5" />
            {message}
          </div>
        )}

        {loading ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400 text-sm animate-pulse">
            Chargement des cartes de révision...
          </div>
        ) : !current ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-600/30 text-emerald-400 flex items-center justify-center mb-4">
              <Icon name="check-circle" size={26} />
            </div>
            <h2 className="text-xl font-black text-white">
              {mode === 'due' ? 'Tout est à jour !' : 'Aucune carte pour le moment'}
            </h2>
            <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">
              {mode === 'due'
                ? 'Vous avez révisé toutes les cartes dues. Revenez plus tard ou consultez vos prochaines échéances.'
                : 'Les questions ratées lors de vos QCM apparaîtront ici automatiquement.'}
            </p>
            {stats?.nextDueAt && (
              <p className="text-xs text-emerald-300 font-bold mt-3">
                Prochaine révision prévue : {formatDate(stats.nextDueAt)}
              </p>
            )}
            <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
              {mode === 'due' && (stats?.total || 0) > 0 && (
                <button onClick={() => changeMode('all')} className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition">
                  Voir toutes mes cartes
                </button>
              )}
              <Link to="/dashboard" className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold px-4 py-2.5 rounded-xl transition">
                Retour au tableau de bord
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-6 pt-5 pb-3 flex items-center justify-between gap-2 border-b border-slate-800">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-black bg-blue-600/20 text-blue-300 px-2.5 py-1 rounded-full">{current.ue}</span>
                {current.tags && String(current.tags).split(/[;,]/).filter(Boolean).map(tag => (
                  <span key={tag} className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full">
                    {tag.trim()}
                  </span>
                ))}
              </div>
              <span className="text-[11px] text-slate-500 font-bold">
                {cards.length} carte(s) restante(s)
              </span>
            </div>

            <div className="p-6">
              <h2 className="text-lg font-bold text-slate-100 leading-relaxed mb-5">{current.question}</h2>

              {currentOptions.length > 0 ? (
                <div className="grid grid-cols-1 gap-2.5">
                  {currentOptions.map((option) => {
                    const clean = option.trim();
                    const isGiven = clean === selected.trim();
                    const isRight = clean === (current.correct || '').trim();

                    let cls = 'w-full text-left p-4 rounded-xl border text-sm font-semibold transition ';
                    if (!revealed) {
                      cls += 'bg-slate-950 border-slate-800 text-slate-200 hover:bg-slate-800 hover:border-blue-600 cursor-pointer';
                    } else if (isRight) {
                      cls += 'bg-emerald-950/50 border-emerald-600 text-emerald-200';
                    } else if (isGiven) {
                      cls += 'bg-red-950/50 border-red-600 text-red-200';
                    } else {
                      cls += 'bg-slate-950 border-slate-800 text-slate-500';
                    }

                    return (
                      <button key={option} onClick={() => handleSelect(option)} disabled={revealed} className={cls}>
                        {option}
                        {revealed && isRight && <span className="ml-2 text-[10px] font-black uppercase text-emerald-300">Bonne réponse</span>}
                        {revealed && isGiven && !isRight && <span className="ml-2 text-[10px] font-black uppercase text-red-300">Votre choix</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">Réponse attendue</p>
                  <p className="text-sm font-bold text-emerald-300">{current.correct}</p>
                </div>
              )}

              {revealed && (
                <div className={`mt-5 rounded-xl border p-4 ${isCorrect ? 'bg-emerald-950/40 border-emerald-800' : 'bg-amber-950/40 border-amber-800'}`}>
                  <p className={`text-sm font-black flex items-center gap-2 ${isCorrect ? 'text-emerald-300' : 'text-amber-300'}`}>
                    <Icon name={isCorrect ? 'check-circle' : 'alert'} size={16} />
                    {isCorrect ? 'Bonne réponse !' : 'Pas encore. La bonne réponse est affichée en vert.'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    Dites-nous honnêtement si vous vous en souviendrez : cela ajuste la prochaine échéance.
                  </p>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <button
                      onClick={() => schedule(true)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                    >
                      <Icon name="check" size={14} strokeWidth={3} />
                      Je savais
                    </button>
                    <button
                      onClick={() => schedule(false)}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black px-4 py-2.5 rounded-xl transition disabled:opacity-50"
                    >
                      <Icon name="refresh" size={14} />
                      À revoir
                    </button>
                  </div>
                </div>
              )}

              {!revealed && currentOptions.length > 0 && (
                <p className="text-[11px] text-slate-500 mt-4 flex items-center gap-1.5">
                  <Icon name="info" size={12} />
                  Choisissez une réponse pour afficher la correction.
                </p>
              )}
            </div>
          </div>
        )}

        {stats?.byUe?.length > 0 && (
          <div className="mt-5 bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <h3 className="text-xs font-black text-white uppercase tracking-wider mb-3 flex items-center gap-2">
              <Icon name="book" size={14} className="text-blue-400" />
              Répartition par UE
            </h3>
            <div className="space-y-2">
              {stats.byUe.map(item => (
                <div key={item.ue} className="flex items-center justify-between gap-3 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5">
                  <span className="text-xs font-bold text-slate-200">{item.ue}</span>
                  <span className="text-[11px] text-slate-400">
                    {item.due} à réviser · {item.total} carte(s)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
