import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../ui/icons.jsx';
import { askTutor, TUTOR_SYSTEM_PROMPT } from '../../services/aiService.js';

/**
 * Drawer « Tuteur IA » — aide les étudiants à comprendre leurs mauvaises
 * réponses de QCM en discutant avec l'IA (Puter.js, gratuit).
 *
 * Props :
 * - open      : affichage du drawer
 * - onClose   : fermeture
 * - context   : {
 *     key: 'q12' | 'general',   // changement => réinitialise la discussion
 *     kind: 'question' | 'general',
 *     quizId: 'INF232',
 *     question: 'Texte de la question',
 *     options: [{label:'A', text:'...'}, ...],
 *     selected: 'A',              // réponse de l'étudiant (fausse)
 *     correct: 'B'                // bonne réponse
 *   }
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

// Identifiant de message — crypto.randomUUID n'existe que en contexte
// sécurisé (HTTPS / localhost) : on prévoit une alternative simple.
let idSeq = 0;
function newId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  idSeq += 1;
  return `msg-${idSeq}-${Math.random().toString(36).slice(2)}`;
}

function buildSystemMessage(context) {
  const base = TUTOR_SYSTEM_PROMPT;
  if (context?.kind !== 'question') {
    return {
      role: 'system',
      content: `${base}\n\nContexte : l'étudiant vient de terminer le QCM « ${context?.quizId || 'QCM'} » et souhaite des conseils généraux de révision.`
    };
  }
  const options = (context.options || [])
    .map((o) => `${o.label}. ${o.text}`)
    .join('\n');
  return {
    role: 'system',
    content: [
      base,
      '',
      `Contexte : l'étudiant a mal répondu à une question du QCM « ${context.quizId} ».`,
      `Question : ${context.question}`,
      'Options :',
      options,
      `Réponse choisie par l'étudiant : ${context.selected || 'aucune'}.`,
      `Bonne réponse : ${context.correct || 'inconnue'}.`,
      'Aide-le à comprendre son erreur sans simplement lui donner la lettre de la bonne réponse.'
    ].join('\n')
  };
}

export default function AiTutor({ open, onClose, context }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const scrollRef = useRef(null);

  const contextKey = context?.key || 'general';
  const systemMessage = useMemo(() => buildSystemMessage(context), [contextKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Nouveau contexte (autre question) => le composant est remonté par le
  // parent via la prop `key={context.key}` : la discussion repart de zéro.

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
      if (!content || loading) return;

      const userMessage = { role: 'user', content, id: newId() };
      setHistory((h) => [...h, userMessage]);
      setInput('');
      setError(null);
      setLoading(true);

      try {
        const reply = await askTutor([systemMessage, ...history, userMessage]);
        setHistory((h) => [...h, { role: 'assistant', content: reply, id: newId() }]);
      } catch (e) {
        setError(e.message || 'Une erreur inattendue est survenue.');
      } finally {
        setLoading(false);
      }
    },
    [input, loading, history, systemMessage]
  );

  const quickPrompts =
    context?.kind === 'question' ? QUICK_PROMPTS_QUESTION : QUICK_PROMPTS_GENERAL;

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
            <p className="text-[11px] text-slate-400">
              Comprendre vos erreurs, pas les corriger pour vous
            </p>
          </div>
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
              <span>Question en cours — {context.quizId}</span>
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
          {history.length === 0 && !loading && (
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
                    className="text-xs text-slate-300 bg-slate-800/70 hover:bg-blue-600 hover:text-white border border-slate-700 hover:border-blue-600 rounded-xl px-3.5 py-2 transition text-left max-w-[17rem]"
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

          {error && (
            <div className="flex items-start gap-2 bg-red-950/60 border border-red-800 text-red-300 text-xs rounded-xl px-3.5 py-3">
              <Icon name="alert" size={15} className="mt-0.5" />
              <div className="flex-1">
                <p>{error}</p>
                <button
                  onClick={() => setError(null)}
                  className="mt-1.5 text-[11px] font-semibold underline underline-offset-2 hover:text-red-200"
                >
                  Réessayer
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
              placeholder="Posez votre question au tuteur…"
              disabled={loading}
              className="flex-1 bg-transparent text-xs text-slate-200 placeholder:text-slate-500 outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Envoyer"
              className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center transition hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="send" size={15} />
            </button>
          </form>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-500">
            <Icon name="info" size={11} />
            Assistant IA gratuit via Puter.js — une connexion gratuite peut être proposée
            à la première utilisation.
          </p>
        </div>
      </aside>
    </div>
  );
}
