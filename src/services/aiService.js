/**
 * Assistant pédagogique IA — Puter.js (gratuit, exécuté dans le navigateur).
 *
 * - Aucune clé API à gérer et aucun coût serveur : les requêtes partent du
 *   navigateur de l'étudiant via le script https://js.puter.com/v2/ chargé
 *   dans index.html. La première utilisation peut proposer une connexion
 *   Puter gratuite (popup).
 * - API : window.puter.ai.chat(messages) → réponse dans response.message.content
 */

export const TUTOR_SYSTEM_PROMPT = [
  'Tu es « Tuteur QCM », un assistant pédagogique bienveillant qui aide des étudiants',
  "de premier cycle universitaire à comprendre leurs mauvaises réponses aux QCM.",
  'Règles de comportement :',
  '1. Réponds toujours en français, sur un ton clair, encourageant et professionnel.',
  "2. Ne donne jamais simplement la lettre de la bonne réponse : guide l'étudiant pour",
  'qu\'il comprenne pourquoi sa réponse était incorrecte et pourquoi la bonne réponse',
  'est la bonne.',
  '3. Reste concis (environ 180 mots maximum), structuré : explication courte, exemple',
  'concret si utile, étapes numérotées si nécessaire.',
  "4. Si la question de l'étudiant sort du cadre des QCM et des études, ramène-le",
  'gentiment au sujet.',
  "5. N'invente pas de faits : si tu n'es pas sûr, dis-le et propose une méthode pour",
  'vérifier.'
].join('\n');

/**
 * Indique si le script Puter.js est chargé et utilisable.
 */
export function isAiAvailable() {
  return typeof window !== 'undefined' && !!window.puter?.ai?.chat;
}

/**
 * Extrait le texte d'une réponse Puter, quel que soit son format.
 * Puter peut renvoyer une chaîne, un objet `{ message: { content } }`
 * ou un contenu sous forme de tableau de blocs.
 */
function extractText(response) {
  if (typeof response === 'string') return response.trim();
  if (!response || typeof response !== 'object') return '';

  const content = response?.message?.content ?? response?.content ?? response?.text;
  if (typeof content === 'string') return content.trim();

  if (Array.isArray(content)) {
    return content
      .map(part => (typeof part === 'string' ? part : part?.text || part?.content || ''))
      .join('')
      .trim();
  }

  return '';
}

/**
 * Pose une conversation au tuteur IA.
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 *   Historique complet (message système d'abord).
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<string>} La réponse du tuteur.
 */
export async function askTutor(messages, { signal } = {}) {
  if (!isAiAvailable()) {
    throw new Error(
      "L'assistant IA n'est pas disponible (script Puter non chargé). Rechargez la page puis réessayez."
    );
  }

  // Puter n'accepte que les champs role/content : on retire les `id` locaux
  const payload = (Array.isArray(messages) ? messages : [])
    .filter(m => m && typeof m.content === 'string' && m.content.trim())
    .filter(m => ['system', 'user', 'assistant'].includes(m.role))
    .map(({ role, content }) => ({ role, content }));

  if (payload.length === 0) {
    throw new Error("Aucun message à envoyer à l'assistant IA.");
  }

  // Garde-fou : une réponse qui ne vient pas en 60 s est abandonnée
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onExternalAbort, { once: true });
  }

  let response;
  try {
    response = await window.puter.ai.chat(payload, {
      normalize: true,
      signal: controller.signal
    });
  } catch (err) {
    if (err?.name === 'AbortError' || controller.signal.aborted) {
      throw new Error("L'assistant IA met trop de temps à répondre. Réessayez.", { cause: err });
    }
    const detail = err?.message || err?.error?.message || '';
    throw new Error(
      detail
        ? `L'assistant IA a échoué : ${detail}`
        : "L'assistant IA a échoué. Autorisez les fenêtres popups puis réessayez.",
      { cause: err }
    );
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener('abort', onExternalAbort);
  }

  const text = extractText(response);
  if (!text) {
    throw new Error("L'assistant IA n'a pas renvoyé de réponse exploitable. Réessayez.");
  }
  return text;
}
