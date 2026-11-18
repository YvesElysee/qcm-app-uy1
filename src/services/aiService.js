/**
 * Assistant pédagogique IA · couche cliente du proxy serveur /api/ai.
 *
 * Les clés des fournisseurs restent exclusivement côté serveur. Le navigateur
 * ne connaît ni le fournisseur, ni le modèle : il envoie simplement le contexte
 * de la question et le message de l'étudiant.
 */
import { api } from './api';

const DEFAULT_STATUS = {
  available: false,
  maxPerError: 2,
  generalLimit: 5,
  dailyLimit: 0,
  remainingToday: 0,
  remainingForContext: null,
  contextLimit: null,
  contextResetAt: null,
  contextWindowHours: 24
};

/**
 * Récupère la disponibilité de l'assistant et les quotas de l'étudiant.
 * Quand `context` est fourni, le serveur renvoie aussi le restant propre à
 * cette question (fenêtre de 24 h), ce qui évite de réafficher un faux quota.
 * En cas d'erreur réseau/session, l'assistant est considéré indisponible.
 */
export async function fetchAiStatus({ context, signal } = {}) {
  try {
    const params = new URLSearchParams();
    if (context && (context.kind === 'question' || context.kind === 'general')) {
      params.set('kind', context.kind);
      if (context.quizId) params.set('quizId', String(context.quizId));
      if (context.questionId !== undefined && context.questionId !== null) {
        params.set('questionId', String(context.questionId));
      }
      if (context.question) params.set('question', String(context.question));
    }
    const query = params.toString();
    const data = await api(`/ai/status${query ? `?${query}` : ''}`, { auth: 'student', signal });
    return {
      available: !!data.available,
      maxPerError: Number.isFinite(data.maxPerError) ? data.maxPerError : DEFAULT_STATUS.maxPerError,
      generalLimit: Number.isFinite(data.generalLimit) ? data.generalLimit : DEFAULT_STATUS.generalLimit,
      dailyLimit: Number.isFinite(data.dailyLimit) ? data.dailyLimit : 0,
      remainingToday: Number.isFinite(data.remainingToday) ? data.remainingToday : 0,
      contextKey: data.contextKey || null,
      contextLimit: Number.isFinite(data.contextLimit) ? data.contextLimit : null,
      remainingForContext: Number.isFinite(data.remainingForContext) ? data.remainingForContext : null,
      contextResetAt: data.contextResetAt || null,
      contextWindowHours: Number.isFinite(data.contextWindowHours) ? data.contextWindowHours : 24
    };
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return { ...DEFAULT_STATUS };
  }
}

/**
 * Envoie une question au tuteur.
 * @param {object} params
 * @param {object} params.context   Contexte de la question (kind, quizId, questionId, ...)
 * @param {string} params.message   Message de l'étudiant
 * @param {Array<{role:'user'|'assistant', content:string}>} [params.history]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{reply:string, remaining:number, limit:number, remainingToday:number, resetAt?:string}>}
 */
export async function askTutor({ context, message, history = [], signal } = {}) {
  const controller = new AbortController();
  // Le serveur enchaîne plusieurs clés en repli : on laisse le temps à la rotation
  // de se terminer, tout en gardant un plafond clair pour l'utilisateur.
  const timeout = setTimeout(() => controller.abort(), 75000);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  try {
    return await api('/ai/tutor', {
      method: 'POST',
      auth: 'student',
      signal: controller.signal,
      body: {
        context,
        message,
        history: history.map(({ role, content }) => ({ role, content }))
      }
    });
  } catch (err) {
    if (err?.name === 'AbortError') {
      const error = new Error(
        'Votre question a mis trop de temps à être traitée. Veuillez reformuler votre prompt et réessayer.',
        { cause: err }
      );
      error.code = 'timeout';
      throw error;
    }
    const code = err?.data?.code;
    if (code === 'timeout') {
      const error = new Error(
        'Votre question a mis trop de temps à être traitée. Veuillez reformuler votre prompt et réessayer.',
        { cause: err }
      );
      error.code = 'timeout';
      error.status = err.status;
      error.data = err.data;
      throw error;
    }
    if (code === 'upstream' || code === 'unavailable') {
      const error = new Error(
        "L'assistant IA est momentanément indisponible. Revenez plus tard.",
        { cause: err }
      );
      error.code = code;
      error.status = err.status;
      error.data = err.data;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }
}
