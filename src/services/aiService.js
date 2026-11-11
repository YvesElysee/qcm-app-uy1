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
 * Pose une conversation au tuteur IA.
 * @param {Array<{role:'system'|'user'|'assistant', content:string}>} messages
 *   Historique complet (message système d'abord).
 * @returns {Promise<string>} La réponse du tuteur.
 */
export async function askTutor(messages) {
  if (!isAiAvailable()) {
    throw new Error(
      "L'assistant IA n'est pas disponible (script Puter non chargé). Rechargez la page puis réessayez."
    );
  }

  let response;
  try {
    response = await window.puter.ai.chat(messages);
  } catch (err) {
    const detail = err?.message || err?.error?.message || '';
    throw new Error(
      detail
        ? `L'assistant IA a échoué : ${detail}`
        : "L'assistant IA a échoué. Autorisez les fenêtres popups puis réessayez.",
      { cause: err }
    );
  }

  const text = response?.message?.content ?? '';
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error("L'assistant IA n'a pas renvoyé de réponse exploitable. Réessayez.");
  }
  return text.trim();
}
