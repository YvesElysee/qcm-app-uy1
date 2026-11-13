/**
 * Tirage des questions d'une épreuve.
 *
 * Le tirage est déterministe pour un étudiant donné : le même étudiant
 * retrouve exactement les mêmes questions en cas de reprise, mais deux
 * étudiants n'ont pas le même ordre ni nécessairement le même sous-ensemble.
 *
 * Ce module est partagé entre la route qui sert les questions et celle qui
 * corrige la copie : le serveur ne dépend donc pas des identifiants envoyés
 * par le navigateur pour connaître les questions réellement présentées.
 */

export function seededShuffle(arr, seed) {
  const a = [...arr];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  for (let i = a.length - 1; i > 0; i--) {
    h = (Math.imul(h, 1664525) + 1013904223) | 0;
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Applique le tirage aléatoire paramétré sur l'épreuve.
 * `drawCount = 0` (ou absent) signifie « toutes les questions ».
 */
export function drawForStudent(allQuestions, quiz, user) {
  const count = Number(quiz?.drawCount) || 0;
  if (!count || count <= 0 || count >= allQuestions.length) return allQuestions;
  const seed = `${quiz?.id || ''}|${quiz?.launchTime || 0}|${user?.id || user?.email || 'anonyme'}`;
  return seededShuffle(allQuestions, seed).slice(0, count);
}
