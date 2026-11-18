import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../services/api.js';
import Icon from './ui/icons.jsx';

/**
 * Mode test de l'administration.
 *
 * Rejoue une épreuve réelle (toutes filières / niveaux confondus) avec le même
 * déroulé que l'étudiant : questions sans correction, minuteur par question,
 * puis correction détaillée. Aucune copie n'est enregistrée : les routes
 * `/api/admin/preview/*` ne touchent ni aux résultats, ni aux révisions, ni
 * aux classements.
 */
export default function AdminQuizPreview({ open, onClose, quiz }) {
  const [loading, setLoading] = useState(Boolean(open && quiz?.id));
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [answers, setAnswers] = useState({});
  const [index, setIndex] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const nextRef = useRef(null);

  useEffect(() => {
    if (!open || !quiz?.id) return undefined;
    // Le composant est remonté par AdminPanel quand le test ou l'ouverture
    // change : les états sont donc déjà à leur valeur initiale ici.
    let active = true;
    api(`/admin/preview/${encodeURIComponent(quiz.id)}/questions`, { auth: 'admin' })
      .then((payload) => {
        if (!active) return;
        setData(payload);
        setRemaining(Number(payload.timePerQuestion) || 60);
      })
      .catch((err) => {
        if (active) setError(err.message || "Impossible de charger l'aperçu.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open, quiz?.id]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const submit = useCallback(async () => {
    if (!data || submitting) return;
    setSubmitting(true);
    setError('');
    const payload = (data.questions || []).map((q) => ({
      questionId: q.id,
      selected: answers[q.id] || ''
    }));
    try {
      const correction = await api(`/admin/preview/${encodeURIComponent(data.quiz.id)}/answers`, {
        method: 'POST',
        auth: 'admin',
        body: { answers: payload, questionIds: data.questionIds }
      });
      setResult(correction);
    } catch (err) {
      setError(err.message || 'La correction a échoué.');
    } finally {
      setSubmitting(false);
    }
  }, [data, answers, submitting]);

  const next = useCallback(() => {
    if (!data) return;
    if (index + 1 >= data.questions.length) {
      submit();
      return;
    }
    setIndex((i) => i + 1);
    setRemaining(Number(data.timePerQuestion) || 60);
  }, [data, index, submit]);

  // Garde la dernière version de `next` sans faire dépendre le minuteur des
  // réponses (qui changeraient l'identité de `submit` à chaque clic).
  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  useEffect(() => {
    if (!open || !data || result || submitting) return undefined;
    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          if (nextRef.current) setTimeout(() => nextRef.current(), 0);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [open, data, result, submitting]);

  if (!open) return null;

  const questions = data?.questions || [];
  const current = questions[index];
  const answeredCount = questions.filter((q) => !!answers[q.id]).length;

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Tester l'épreuve"
        className="w-full max-w-3xl max-h-[94vh] bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden"
      >
        {/* En-tête */}
        <div className="px-5 sm:px-6 py-4 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 bg-amber-500/15 border border-amber-600/40 px-2 py-0.5 rounded-full">
                Mode test · copie non enregistrée
              </span>
              {data?.quiz?.semestre && (
                <span className="text-[10px] font-bold text-emerald-300 bg-emerald-600/15 px-2 py-0.5 rounded-full">
                  S{data.quiz.semestre}
                </span>
              )}
            </div>
            <h2 className="text-base font-black text-white mt-1.5 truncate">
              {quiz?.title || data?.quiz?.title || data?.quiz?.ue || 'Épreuve'}
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              {quiz?.filiere || data?.quiz?.filiere || '-'} · {quiz?.niveau || data?.quiz?.niveau || '-'} ·
              UE {quiz?.ue || data?.quiz?.ue || '-'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer le mode test"
            className="w-9 h-9 shrink-0 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Contenu */}
        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">
          {error && (
            <div className="mb-4 rounded-xl border border-red-800 bg-red-950/50 text-red-300 text-xs p-3.5">
              {error}
            </div>
          )}

          {loading && (
            <div className="py-16 text-center text-xs text-slate-400">
              <div className="w-9 h-9 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              Chargement des questions…
            </div>
          )}

          {!loading && data && !result && current && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <span className="text-[11px] font-bold text-slate-400">
                  Question {index + 1} / {questions.length}
                  <span className="ml-2 text-slate-500">· {answeredCount} réponse(s) donnée(s)</span>
                </span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-black px-3 py-1.5 rounded-full ${
                  remaining <= 10
                    ? 'bg-red-950/60 text-red-300 border border-red-800'
                    : 'bg-slate-800 text-slate-300 border border-slate-700'
                }`}>
                  <Icon name="clock" size={13} />
                  {Math.max(0, remaining)} s
                </span>
              </div>

              <p className="text-sm sm:text-base font-bold text-slate-100 leading-relaxed whitespace-pre-wrap">
                {current.Question}
              </p>

              <div className="grid gap-2">
                {['A', 'B', 'C', 'D'].map((label) => {
                  const text = current[`Opt${label}`];
                  if (!text) return null;
                  const checked = answers[current.id] === label;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setAnswers((prev) => ({ ...prev, [current.id]: label }))}
                      className={`w-full text-left rounded-xl border px-3.5 py-3 text-xs leading-relaxed transition ${
                        checked
                          ? 'bg-blue-600/20 border-blue-500 text-white'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <strong className="mr-2 text-blue-300">{label}.</strong>
                      {text}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && data && result && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-blue-700/50 bg-blue-950/40 p-5 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-blue-300">
                    Correction du test
                  </p>
                  <p className="text-2xl font-black text-white mt-1">
                    {result.score}/{result.total}
                    <span className="text-sm text-slate-300 ml-2">· {result.note}/20</span>
                  </p>
                </div>
                <p className="text-[11px] text-slate-400 max-w-xs leading-relaxed">
                  Ce résultat est uniquement affiché à l'administrateur : aucune copie, note ou
                  carte de révision n'a été enregistrée.
                </p>
              </div>

              {result.answers.map((item, i) => (
                <article key={item.questionId} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-start gap-2">
                    <span className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-black ${
                      item.isOk ? 'bg-emerald-600/20 text-emerald-300' : 'bg-red-600/20 text-red-300'
                    }`}>
                      {item.isOk ? <Icon name="check" size={12} /> : <Icon name="close" size={12} />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-100 leading-relaxed">
                        {i + 1}. {item.question}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        Votre réponse : <span className="font-black text-slate-200">{item.selected || '—'}</span>
                        <span className="mx-2 text-slate-600">·</span>
                        Bonne réponse : <span className="font-black text-emerald-300">{item.correct || '—'}</span>
                      </p>
                      {item.explication && (
                        <p className="text-[11px] text-slate-300 mt-2 leading-relaxed border-l-2 border-blue-700/60 pl-3">
                          {item.explication}
                        </p>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!loading && !data && !error && (
            <p className="py-12 text-center text-xs text-slate-500">Aucune question disponible.</p>
          )}
        </div>

        {/* Pied */}
        <div className="px-5 sm:px-6 py-4 border-t border-slate-800 bg-slate-900 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] text-slate-500">
            Le minuteur et le tirage sont identiques à ceux d'un étudiant.
          </p>
          <div className="flex items-center gap-2">
            {data && !result && (
              <>
                <button
                  type="button"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white border border-slate-700 rounded-xl px-3 py-2 disabled:opacity-40"
                >
                  <Icon name="arrow-left" size={13} />
                  Précédent
                </button>
                <button
                  type="button"
                  onClick={next}
                  disabled={submitting}
                  className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2 rounded-xl transition disabled:opacity-50"
                >
                  {index + 1 >= questions.length ? 'Terminer' : 'Valider et suivant'}
                  <Icon name="arrow-right" size={13} />
                </button>
              </>
            )}
            {result && (
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black px-4 py-2 rounded-xl transition"
              >
                <Icon name="check" size={13} />
                Terminer le test
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
