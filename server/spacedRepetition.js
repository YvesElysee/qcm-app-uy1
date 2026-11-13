/**
 * Répétition espacée (algorithme type SM-2 simplifié).
 *
 * Les erreurs du QCM créent une carte de révision due le lendemain.
 * Lors d'une révision, l'étudiant indique s'il se souvenait de la réponse :
 * - oui  : intervalle multiplié par la facilité (3 j, puis 7 j, 18 j, …)
 * - non  : retour à 1 jour et pénalité de facilité.
 */
import { db } from './db.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_EASE = 1.3;
const MAX_EASE = 3.0;

export function normalizeCorrect(question) {
  const raw = String(question?.ReponseCorrecte || '').trim();
  const upper = raw.toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(upper)) {
    return String(question?.[`Opt${upper}`] || raw).trim();
  }
  return raw;
}

function optionsOf(question) {
  return {
    OptA: question?.OptA || '',
    OptB: question?.OptB || '',
    OptC: question?.OptC || '',
    OptD: question?.OptD || ''
  };
}

/**
 * Crée (ou met à jour) la carte d'une question ratée.
 */
export function upsertWrongCard(user, ue, question, selected) {
  if (!user?.id || !question?.id) return;
  const now = new Date();
  const nowIso = now.toISOString();
  const existing = db.prepare(
    'SELECT * FROM review_cards WHERE userId = ? AND ue = ? AND questionId = ?'
  ).get(user.id, ue, question.id);

  if (existing) {
    const ease = Math.max(MIN_EASE, Number(existing.ease) - 0.2);
    db.prepare(`
      UPDATE review_cards SET
        question = ?, options = ?, correct = ?, lastSelected = ?,
        ease = ?, intervalDays = 1, repetitions = 0,
        lapses = lapses + 1, dueAt = ?, updatedAt = ?
      WHERE id = ?
    `).run(
      String(question.Question || '').trim(),
      JSON.stringify(optionsOf(question)),
      normalizeCorrect(question),
      String(selected || ''),
      ease,
      new Date(now.getTime() + DAY_MS).toISOString(),
      nowIso,
      existing.id
    );
    return;
  }

  db.prepare(`
    INSERT INTO review_cards
      (userId, ue, questionId, question, options, correct, lastSelected,
       ease, intervalDays, repetitions, lapses, dueAt, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, 2.5, 1, 0, 1, ?, ?, ?)
  `).run(
    user.id,
    ue,
    question.id,
    String(question.Question || '').trim(),
    JSON.stringify(optionsOf(question)),
    normalizeCorrect(question),
    String(selected || ''),
    new Date(now.getTime() + DAY_MS).toISOString(),
    nowIso,
    nowIso
  );
}

/**
 * Réévalue une carte après une session de révision.
 * @param {object} card ligne review_cards
 * @param {boolean} remembered l'étudiant a-t-il retrouvé la bonne réponse ?
 */
export function scheduleReview(card, remembered) {
  const now = new Date();
  let ease = Number(card.ease) || 2.5;
  let repetitions = Number(card.repetitions) || 0;
  let interval = Number(card.intervalDays) || 1;
  let lapses = Number(card.lapses) || 0;

  if (remembered) {
    repetitions += 1;
    interval = repetitions <= 1 ? 3 : Math.min(60, Math.max(2, Math.round(interval * ease)));
    ease = Math.min(MAX_EASE, ease + 0.05);
  } else {
    repetitions = 0;
    interval = 1;
    ease = Math.max(MIN_EASE, ease - 0.2);
    lapses += 1;
  }

  const dueAt = new Date(now.getTime() + interval * DAY_MS).toISOString();
  const nowIso = now.toISOString();

  db.prepare(`
    UPDATE review_cards SET
      ease = ?, intervalDays = ?, repetitions = ?, lapses = ?,
      dueAt = ?, lastReviewedAt = ?, updatedAt = ?
    WHERE id = ?
  `).run(ease, interval, repetitions, lapses, dueAt, nowIso, nowIso, card.id);

  return db.prepare('SELECT * FROM review_cards WHERE id = ?').get(card.id);
}
