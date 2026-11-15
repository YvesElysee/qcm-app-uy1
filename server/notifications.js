/**
 * Notifications internes par utilisateur.
 *
 * Elles sont volontairement légères (une ligne par événement) et dédupliquées
 * par `entityKey` : reprogrammer une épreuve ne crée pas de doublon pour la
 * même date d'ouverture.
 */
import { db } from './db.js';
import { normalizeFaculte, quizFaculte } from './access.js';

export function createNotification({
  userId,
  type,
  title,
  message = '',
  link = '',
  entityKey = ''
}) {
  if (!userId || !type || !title) return false;
  try {
    const info = db.prepare(`
      INSERT OR IGNORE INTO notifications
        (userId, type, title, message, link, entityKey, isRead, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?)
    `).run(
      userId,
      type,
      String(title).slice(0, 200),
      String(message).slice(0, 800),
      String(link).slice(0, 300),
      String(entityKey).slice(0, 200),
      new Date().toISOString()
    );
    return info.changes > 0;
  } catch (err) {
    console.warn('[notifications] Création impossible :', err.message);
    return false;
  }
}

function formatLaunch(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '';
  try {
    return new Date(n).toLocaleString('fr-FR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}

/**
 * Prévient tous les étudiants de la salle (faculté + filière + niveau)
 * lorsqu'une épreuve dotée de questions et d'une date d'ouverture existe.
 */
export function notifyQuizAvailable(quiz) {
  if (!quiz || !quiz.launchTime || !Number(quiz.questionCount)) return 0;

  const faculte = quizFaculte(quiz);
  const filiere = String(quiz.filiere || '').trim();
  const niveau = String(quiz.niveau || '').trim();
  if (!filiere || !niveau) return 0;

  const users = db.prepare(`
    SELECT id FROM users
    WHERE LOWER(TRIM(filiere)) = LOWER(TRIM(?))
      AND LOWER(TRIM(niveau)) = LOWER(TRIM(?))
      AND UPPER(COALESCE(NULLIF(TRIM(faculte), ''), 'FACSCIENCES')) = ?
  `).all(filiere, niveau, normalizeFaculte(faculte));

  const launch = formatLaunch(quiz.launchTime);
  const ue = quiz.ue || quiz.id;
  const entityKey = `quiz:${quiz.id}:${quiz.launchTime}`;

  let created = 0;
  users.forEach((user) => {
    const ok = createNotification({
      userId: user.id,
      type: 'quiz_available',
      title: `Nouvelle évaluation : ${ue}`,
      message: launch
        ? `Le QCM ${ue} de ${filiere} (${niveau}) est programmé pour le ${launch}.`
        : `Le QCM ${ue} de ${filiere} (${niveau}) est disponible dans votre espace.`,
      link: '/dashboard',
      entityKey
    });
    if (ok) created += 1;
  });
  return created;
}

export function notifyFiliereAvailable({ userId, filiere, faculte }) {
  return createNotification({
    userId,
    type: 'filiere_available',
    title: `Votre filière « ${filiere} » est disponible`,
    message: `L'administration a ajouté la filière ${filiere} (${faculte}). Vos épreuves et ressources sont désormais accessibles.`,
    link: '/dashboard',
    entityKey: `filiere:${faculte}:${filiere}`
  });
}
