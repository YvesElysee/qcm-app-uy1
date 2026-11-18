/**
 * Types de documents partagés entre les vues étudiant et administration.
 * Les valeurs sont les mêmes slugs que ceux validés par le serveur
 * (`server/routes/resources.js`) ; les libellés sont affichés dans l'UI.
 */
export const RESOURCE_TYPES = [
  { value: 'cours', label: 'Cours', icon: 'book' },
  { value: 'td', label: 'TD', icon: 'document' },
  { value: 'tp', label: 'TP', icon: 'settings' },
  { value: 'examen', label: 'Examen', icon: 'clock' },
  { value: 'corrige', label: 'Corrigé', icon: 'check-circle' },
  { value: 'fiche', label: 'Fiche de révision', icon: 'lightbulb' },
  { value: 'autre', label: 'Autre', icon: 'document' }
];

export const RESOURCE_TYPE_VALUES = RESOURCE_TYPES.map((item) => item.value);

export function resourceTypeLabel(value) {
  return RESOURCE_TYPES.find((item) => item.value === value)?.label || 'Autre';
}

export function resourceTypeIcon(value) {
  return RESOURCE_TYPES.find((item) => item.value === value)?.icon || 'document';
}

export function normalizeResourceType(value) {
  return RESOURCE_TYPE_VALUES.includes(value) ? value : 'autre';
}
