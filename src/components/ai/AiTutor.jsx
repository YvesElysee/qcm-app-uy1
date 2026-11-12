import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from '../ui/icons.jsx';
import { askTutor, fetchAiStatus } from '../../services/aiService.js';

/**
 * Drawer « Tuteur IA » · aide les étudiants à comprendre leurs mauvaises
 * réponses de QCM. Les appels passent par le proxy serveur /api/ai : aucune
 * clé, aucun fournisseur et aucun modèle ne sont exposés au navigateur.
 *
 * Props :
 * - open      : affichage du drawer
 * - onClose   : fermeture
 * - context   : {
 *     key: 'q12' | 'general',   // changement => réinitialise la discussion
 *     kind: 'question' | 'general',
 *     quizId: 'INF232',
 *     questionId: 42,
 *     question: 'Texte de la question',
 *     options: [{label:'A', text:'...'}, ...],
 *     selected: 'A',              // réponse de l'étudiant (fausse)
 *     correct: 'B'                // bonne réponse
 *   }
 * - status    : { available, maxPerError, dailyLimit, remainingToday }
 */

const QUICK_PROMPTS_QUESTION = [
  'Pourquoi ma réponse est-elle incorrecte ?',
  'Explique-moi la bonne réponse simplement.',
  'Donne-moi un exemple concret pour mieux comprendre.',
  'Comment retenir facilement cette notion ?'
];

const QUICK_PROMPTS_GENERAL = [
  'Quelles méthodes pour mieux réussir mes QCM ?',
  'Comment organiser mes révisions efficacement ?',
  'Comment comprendre mes erreurs récurrentes ?'
];

// Identifiant de message · crypto.randomUUID n'existe qu'en contexte sécurisé
let idSeq = 0;
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idSeq += 1;
  return `msg-${idSeq}-${Math.random().toString(36).slice(2)}`;
}

export default function AiTutor({ open, onClose, context, status }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [aiStatus, setAiStatus] = useState(status || null);
  const [remaining, setRemaining] = useState(status?.maxPerError ?? null);
  const [limit, setLimit] = useState(status?.maxPerError ?? 2);
  const [quotaReached, setQuotaReached] = useState(false);
  const scrollRef = useRef(null);

  const unavailable = aiStatus ? aiStatus.available === false : false;
  const blocked = unavailable || quotaReached || remaining === 0;

  useEffect(() => {
    if (!open || aiStatus) return undefined;
    let active = true;
    fetchAiStatus()
      .then((next) => {
        if (!active) return;
        setAiStatus(next);
        setLimit(next.maxPerError || 2);
        setRemaining(next.maxPerError || 2);
        if (!next.available) setError("L'assistant IA n'est pas encore activé sur cette plateforme.");
      })
      .catch(() => { /* indisponibilité silencieuse : le bouton reste masqué */ });
    return () => { active = false; };
  }, [open, aiStatus]);

  // Défilement automatique vers le dernier message
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [history, loading, open]);

  // Échap pour fermer
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const send = useCallback(
    async (text) => {
      const content = (text || input).trim();
      if (!content || loading || blocked) return;

      const previous = history.map(({ role, content: c }) => ({ role, content: c }));
      const userMessage = { role: 'user', content, id: newId() };
      setHistory((h) => [...h, userMessage]);
      setInput('');
      setError(null);
      setLoading(true);

      try {
        const data = await askTutor({ context, message: content, history: previous });
        setHistory((h) => [...h, { role: 'assistant', content: data.reply, id: newId() }]);
        if (Number.isFinite(data.limit)) setLimit(data.limit);
        if (Number.isFinite(data.remaining)) setRemaining(data.remaining);
        if (data.remaining === 0) setQuotaReached(true);
      } catch (e) {
        if (e?.status === 429) {
          setQuotaReached(true);
          setRemaining(0);
        }
        setError(e.message || 'Une erreur inattendue est survenue.');
      } finally {
        setLoading(false);
      }
    },
    [input, loading, blocked, history, context]
  );

  const quickPrompts =
    context?.kind === 'question' ? QUICK_PROMPTS_QUESTION : QUICK_PROMPTS_GENERAL;
  const quotaLabel = context?.kind === 'question' ? 'cette erreur' : 'ce QCM';

  return (
    <div
      className={`fixed inset-0 z-50 ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
    >
      {/* Fond assombri */}
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300 ${
          open ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Panneau */}
      <aside
        role="dialog"
        aria-label="Tuteur IA"
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* En-tête */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800 bg-slate-900">
          <span className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
            <Icon name="sparkles" size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold text-white leading-tight">Tuteur IA</h2>
            <p className="text-[11px] text-slate-400">Assistant pédagogique QCM App</p>
          </div>
          {!unavailable && remaining !== null && (
            <span
              className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                remaining > 0
                  ? 'bg-blue-600/20 text-blue-300'
                  : 'bg-slate-800 text-slate-500'
              }`}
              title={`Questions restantes pour ${quotaLabel}`}
            >
              {remaining}/{limit}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Fermer le tuteur IA"
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 flex items-center justify-center transition"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Carte de contexte : la question en cours */}
        {context?.kind === 'question' && (
          <div className="mx-4 mt-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
              <Icon name="book" size={13} />
              <span>Question en cours · {context.quizId}</span>
            </div>
            <p className="text-slate-200 leading-relaxed line-clamp-3">{context.question}</p>
            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
              <span className="inline-flex items-center gap-1.5 text-red-400">
                <Icon name="x-circle" size={13} />
                Votre réponse : {context.selected || 'aucune'}
              </span>
              <span className="inline-flex items-center gap-1.5 text-emerald-400">
                <Icon name="check-circle" size={13} />
                Réponse correcte : {context.correct}
              </span>
            </div>
          </div>
        )}

        {/* Discussion */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {unavailable && (
            <div className="flex items-start gap-2 bg-slate-800/60 border border-slate-700 text-slate-300 text-xs rounded-xl px-3.5 py-3">
              <Icon name="info" size={15} className="mt-0.5" />
              <p>L'assistant IA n'est pas encore activé sur cette plateforme.</p>
            </div>
          )}

          {history.length === 0 && !loading && !unavailable && (
            <div className="text-center py-8 space-y-4">
              <div className="w-12 h-12 mx-auto rounded-2xl bg-blue-600/10 border border-blue-600/30 text-blue-400 flex items-center justify-center">
                <Icon name="lightbulb" size={22} />
              </div>
              <p className="text-xs text-slate-400 max-w-[16rem] mx-auto leading-relaxed">
                Posez vos questions sur la question ci-dessus, ou choisissez une suggestion
                pour démarrer la discussion.
              </p>
              <div className="flex flex-col gap-2 items-center">
                {quickPrompts.map((p) => (
                  <button
                    key={p}
                    onClick={() => send(p)}
                    disabled={blocked}
                    className="text-xs text-slate-300 bg-slate-800/70 hover:bg-blue-600 hover:text-white border border-slate-700 hover:border-blue-600 rounded-xl px-3.5 py-2 transition text-left max-w-[17rem] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {quotaReached && !unavailable && (
            <div className="flex items-start gap-2 bg-indigo-950/50 border border-indigo-800 text-indigo-300 text-xs rounded-xl px-3.5 py-3">
              <Icon name="info" size={15} className="mt-0.5" />
              <p>
                Limite atteinte : {limit} questions maximum pour {quotaLabel}.
                Continuez à relire la correction, vous pouvez revenir demain.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl px-3.5 py-3">
              <Icon name="alert" size={15} className="mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-1.5 text-[11px] font-semibold underline underline-offset-2 hover:text-red-200"
                >
                  Fermer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Saisie */}
        <div className="border-t border-slate-800 bg-slate-900 p-3.5">
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            className="flex items-center gap-2 bg-slate-950 border border-slate-800 focus-within:border-blue-600 rounded-xl px-3 py-2 transition"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={blocked ? 'Limite atteinte pour ce contexte' : 'Posez votre question au tuteur…'}
              disabled={loading || blocked}
              className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || blocked || !input.trim()}
              aria-label="Envoyer"
              className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center transition hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="send" size={15} />
            </button>
          </form>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
            <Icon name="info" size={11} />
            {unavailable
              ? 'Assistant pédagogique QCM App · bientôt disponible'
              : `${remaining ?? limit} question(s) restante(s) pour ${quotaLabel} · assistant QCM App`}
          </p>
        </div>
      </aside>
    </div>
  );
}
