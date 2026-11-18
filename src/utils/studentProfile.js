/**
 * Profil pédagogique de l'étudiant.
 *
 * Les libellés de filières étant libres dans le catalogue, la détection se
 * fait sur une version normalisée (sans accents) plutôt que sur une liste
 * fermée : « Mathématiques », « Maths », « MATHEMATIQUES » sont équivalents.
 */

export const PATHWAY_MESSAGES = {
  maths:
    'En filière maths, les évaluations ne se passent pas en QCM : le Tuteur IA est là pour vous aider à faire des sujets. Des QCM pourront aussi être faits par l’administration du site.',
  physics:
    'En filière physique, les évaluations ne se passent pas en QCM : le Tuteur IA vous aide à produire des sujets et des exercices à partir de vos documents. L’administration peut aussi programmer des QCM.',
  l3plus:
    'Les QCM sont juste un mode d’entraînement en L3 et au-delà : les épreuves sont à rédiger, le Tuteur IA vous aide à produire les sujets.'
};

const L3_PLUS = new Set(['L3', 'M1', 'M2']);

export function normalizeProfileText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function normalizeLevel(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
}

export function isMathsProfile(user) {
  return /math/.test(normalizeProfileText(user?.filiere));
}

export function isPhysicsProfile(user) {
  return /phys/.test(normalizeProfileText(user?.filiere));
}

export function isL3PlusProfile(user) {
  return L3_PLUS.has(normalizeLevel(user?.niveau));
}

/**
 * Retourne les messages à afficher pour le parcours de l'étudiant.
 * Un étudiant en Maths L3 voit le message Maths ET le message L3+.
 */
export function pathwayFor(user) {
  const maths = isMathsProfile(user);
  const physics = isPhysicsProfile(user);
  const l3plus = isL3PlusProfile(user);
  const messages = [];
  if (maths) messages.push(PATHWAY_MESSAGES.maths);
  if (physics) messages.push(PATHWAY_MESSAGES.physics);
  if (l3plus) messages.push(PATHWAY_MESSAGES.l3plus);

  return {
    maths,
    physics,
    l3plus,
    messages,
    highlighted: maths || physics || l3plus,
    title: maths
      ? 'Parcours Mathématiques · Tuteur IA'
      : physics
        ? 'Parcours Physique · Tuteur IA'
        : l3plus
          ? 'Parcours L3 et au-delà · Tuteur IA'
          : ''
  };
}
