/**
 * Règles d'accès transverses : faculté + filière + niveau.
 *
 * Un étudiant ne peut consulter une épreuve, ses questions, déposer une copie
 * ou télécharger une ressource que si elle appartient exactement à sa
 * faculté, sa filière et son niveau d'inscription. L'administration conserve
 * un accès global (bypass explicite).
 */
import { db } from './db.js';

export function normalizeText(value) {
  return String(value || '').trim();
}

export function normalizeFaculte(value) {
  const clean = normalizeText(value).toUpperCase();
  return clean || 'FACSCIENCES';
}

export function sameText(a, b) {
  return normalizeText(a).toLowerCase() === normalizeText(b).toLowerCase();
}

export function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function filiereId(faculte, label) {
  return `${slugify(faculte)}:${slugify(label)}`;
}

/**
 * Faculté officielle d'une filière (la première trouvée dans le catalogue).
 */
export function facultyOfFiliere(label) {
  const row = db.prepare(`
    SELECT faculte FROM filieres
    WHERE LOWER(TRIM(label)) = LOWER(TRIM(?))
    ORDER BY faculte ASC
    LIMIT 1
  `).get(normalizeText(label));
  return row?.faculte || '';
}

export function filiereExists(faculte, label) {
  const row = db.prepare(`
    SELECT id FROM filieres
    WHERE LOWER(TRIM(faculte)) = LOWER(TRIM(?))
      AND LOWER(TRIM(label)) = LOWER(TRIM(?))
    LIMIT 1
  `).get(normalizeText(faculte), normalizeText(label));
  return !!row;
}

/**
 * Faculté effective d'un étudiant (colonne ou déduite de sa filière).
 */
export function studentFaculte(user) {
  return normalizeFaculte(user?.faculte || facultyOfFiliere(user?.filiere) || 'FACSCIENCES');
}

export function quizFaculte(quiz) {
  return normalizeFaculte(quiz?.faculte || facultyOfFiliere(quiz?.filiere) || 'FACSCIENCES');
}

/**
 * Vérifie qu'un étudiant peut accéder à une épreuve donnée.
 * Le niveau d'inscription est verrouillé : impossible de passer une épreuve
 * d'un autre niveau, même en connaissant son identifiant.
 */
export function canStudentAccessQuiz(user, quiz) {
  if (!user || !quiz) return false;
  const userFiliere = normalizeText(user.filiere);
  const quizFiliere = normalizeText(quiz.filiere);
  if (!userFiliere || !quizFiliere || !sameText(userFiliere, quizFiliere)) return false;

  const userNiveau = normalizeText(user.niveau);
  const quizNiveau = normalizeText(quiz.niveau);
  if (!userNiveau || !quizNiveau || !sameText(userNiveau, quizNiveau)) return false;

  return studentFaculte(user) === quizFaculte(quiz);
}

/**
 * Vérifie qu'un étudiant peut télécharger une ressource de cours.
 */
export function canStudentAccessResource(user, resource) {
  if (!user || !resource) return false;
  if (!sameText(user.filiere, resource.filiere)) return false;
  if (resource.niveau && !sameText(user.niveau, resource.niveau)) return false;
  if (resource.faculte && studentFaculte(user) !== normalizeFaculte(resource.faculte)) return false;
  return true;
}

/**
 * Clause SQL de filtrage par faculté (tolère les anciennes lignes vides).
 */
export function faculteWhere(column = 'faculte', faculte) {
  return {
    sql: `UPPER(COALESCE(NULLIF(TRIM(${column}), ''), 'FACSCIENCES')) = ?`,
    param: normalizeFaculte(faculte)
  };
}
