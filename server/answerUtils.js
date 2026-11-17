/**
 * Comparaison des réponses, partagée entre la correction, les révisions
 * espacées et l'import des questions.
 *
 * Objectif : une copie ne doit jamais être notée 0/20 à cause d'un simple
 * formatage (lettre au lieu du texte, chiffre, accents, espaces, ponctuation).
 */

const LABELS = ['A', 'B', 'C', 'D'];
const BOM = String.fromCharCode(0xFEFF);
const DIACRITICS = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36F) + ']',
  'g'
);

/** Nettoie un texte sans en changer le sens (espaces, BOM, entourages). */
export function cleanText(value) {
  let text = String(value ?? '').replace(BOM, '').normalize('NFKC').trim();
  text = text.replace(/ +/g, ' ');
  let changed = true;
  while (changed) {
    changed = false;
    if (/^[(["']/.test(text)) {
      text = text.slice(1).trim();
      changed = true;
    }
    if (/[)\]"'.,:;]$/.test(text)) {
      text = text.slice(0, -1).trim();
      changed = true;
    }
  }
  return text;
}

/** Clé de comparaison tolérante : minuscules, sans accents ni ponctuation. */
export function looseKey(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]/g, '');
}

function labelFromToken(token) {
  const upper = String(token || '').trim().toUpperCase();
  if (LABELS.includes(upper)) return upper;
  if (['1', '2', '3', '4'].includes(upper)) return LABELS[Number(upper) - 1];
  return '';
}

/**
 * Retrouve la lettre A/B/C/D à partir de « B », « 2 », « Choix B »,
 * « Réponse : C », « (D) », « option 4 »…
 */
export function answerLabel(value) {
  const key = looseKey(value);
  if (!key) return '';

  const direct = labelFromToken(key);
  if (direct) return direct;

  const suffixed = key.match(/(option|choix|opt|reponse|answer|correct|solution|cle)([a-d1-4])$/);
  if (suffixed) return labelFromToken(suffixed[2]);

  return '';
}

/**
 * Convertit la réponse correcte stockée en texte d'option exact.
 * Tolère les anciennes colonnes qui contenaient une lettre ou un chiffre.
 */
export function normalizeCorrect(question) {
  const raw = cleanText(question?.ReponseCorrecte);
  if (!raw) return '';

  const label = answerLabel(raw);
  if (label) {
    const option = cleanText(question?.[`Opt${label}`]);
    return option || raw;
  }

  const key = looseKey(raw);
  for (const candidate of LABELS) {
    const option = cleanText(question?.[`Opt${candidate}`]);
    if (option && looseKey(option) === key) return option;
  }
  return raw;
}

/**
 * Compare la réponse de l'étudiant à la bonne réponse.
 * Accepte le texte exact de l'option, sa lettre ou son numéro.
 */
export function answersEqual(selected, question, correct) {
  const given = cleanText(selected);
  const expected = cleanText(correct);
  if (!given || !expected) return false;

  if (looseKey(given) === looseKey(expected)) return true;

  const correctLabel = answerLabel(cleanText(question?.ReponseCorrecte)) ||
    LABELS.find((label) => {
      const option = cleanText(question?.[`Opt${label}`]);
      return option && looseKey(option) === looseKey(expected);
    }) || '';
  if (!correctLabel) return false;

  const givenLabel = answerLabel(given);
  if (givenLabel) return givenLabel === correctLabel;

  return looseKey(given) === looseKey(cleanText(question?.[`Opt${correctLabel}`]));
}

/** Prépare une question importée : champs propres + bonne réponse normalisée. */
export function normalizeImportedQuestion(question) {
  const clean = {
    Question: cleanText(question?.Question),
    OptA: cleanText(question?.OptA),
    OptB: cleanText(question?.OptB),
    OptC: cleanText(question?.OptC),
    OptD: cleanText(question?.OptD),
    ReponseCorrecte: cleanText(question?.ReponseCorrecte),
    explication: cleanText(question?.Explication ?? question?.explication ?? question?.explanation).slice(0, 2000),
    tags: cleanText(question?.Tags ?? question?.tags),
    difficulte: cleanText(question?.Difficulte ?? question?.difficulte ?? 'moyenne').toLowerCase()
  };
  clean.ReponseCorrecte = normalizeCorrect(clean);
  return clean;
}
