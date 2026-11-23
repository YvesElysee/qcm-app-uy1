/**
 * Utilitaires partagés pour afficher les Unités d'Enseignement.
 *
 * Une UE est identifiée par son code en majuscules (INF232, MATHS…). Un code
 * peut porter plusieurs tests (interro, partiel, rattrapage) : le code reste
 * la clé de regroupement, `quiz.id` identifie le test exact.
 */
import { RESOURCE_TYPES, normalizeResourceType } from '../constants/resourceTypes.js';

export const ueCode = (value) => String(value || '').trim().toUpperCase();

export function quizUeCode(quiz) {
  return ueCode(quiz?.ue || quiz?.id || '');
}

/** Statut pédagogique d'un test, calculé une seule fois pour toute l'UI. */
export function quizStatus(quiz, now = Date.now(), passedIds = new Set()) {
  if (!quiz) return 'none';
  if (!quiz.questionCount || !quiz.launchTime) return 'draft';
  if (quiz.launchTime > now) return 'upcoming';
  const finished = quiz.endTime && quiz.endTime < now;
  if (finished) {
    return passedIds.has(quiz.id) || passedIds.has(ueCode(quiz.ue))
      ? 'done'
      : 'makeup';
  }
  return 'ongoing';
}

/** Seuls ces deux états sont mis en avant sur l'espace étudiant. */
export function isHighlighted(status) {
  return status === 'ongoing' || status === 'upcoming';
}

export const QUIZ_STATUS_META = {
  none: { label: 'Non programmée', cls: 'bg-slate-600/40 text-slate-300' },
  draft: { label: 'En préparation', cls: 'bg-slate-600/40 text-slate-300' },
  upcoming: { label: 'À venir', cls: 'bg-amber-500/20 text-amber-300' },
  ongoing: { label: 'En cours', cls: 'bg-emerald-500/20 text-emerald-300' },
  done: { label: 'Passée', cls: 'bg-indigo-500/20 text-indigo-300' },
  makeup: { label: 'À rattraper', cls: 'bg-red-500/20 text-red-300' }
};

/**
 * Regroupe les ressources par UE. Les documents sans UE sont placés dans un
 * groupe « Divers » afin de rester accessibles.
 */
export function groupResourcesByUe(resources = [], ues = []) {
  const groups = new Map();
  const labelOf = (code) => {
    const found = ues.find(u => ueCode(u.code || u.id) === code);
    return found?.label || found?.name || '';
  };

  resources.forEach((item) => {
    const code = ueCode(item.ue) || 'DIVERS';
    if (!groups.has(code)) {
      groups.set(code, {
        code,
        label: code === 'DIVERS' ? 'Documents sans UE' : labelOf(code),
        items: []
      });
    }
    groups.get(code).items.push(item);
  });

  return [...groups.values()]
    .sort((a, b) => {
      if (a.code === 'DIVERS') return 1;
      if (b.code === 'DIVERS') return -1;
      return String(a.code).localeCompare(String(b.code), 'fr', { numeric: true });
    })
    .map((group) => ({
      ...group,
      types: RESOURCE_TYPES
        .map((entry) => ({
          ...entry,
          items: group.items.filter((item) => normalizeResourceType(item.type) === entry.value)
        }))
        .filter((entry) => entry.items.length > 0)
    }));
}

/** Regroupe les copies par UE en conservant le test exact. */
export function groupResultsByUe(results = [], quizzes = []) {
  const groups = new Map();
  results.forEach((result) => {
    const code = ueCode(result.ue) || 'DIVERS';
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(result);
  });
  return [...groups.entries()].map(([code, items]) => ({
    code,
    items: [...items].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)),
    quizzes: quizzes.filter(q => quizUeCode(q) === code)
  }));
}

export function noteOn20(result) {
  const total = Number(result?.total) || 0;
  if (!total) return null;
  return ((Number(result.score) || 0) / total) * 20;
}
