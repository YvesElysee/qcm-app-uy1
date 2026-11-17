import Papa from 'papaparse';

/**
 * Parser CSV universel pour les banques de questions QCM.
 *
 * Règles d'or (elles évitent les erreurs historiques de détection de colonnes) :
 *  1. Un en-tête est comparé par jetons entiers, jamais par simple sous-chaîne.
 *     (avant, la lettre « c » dans « Énoncé » ou « RéponseCorrecte » faisait
 *     passer la colonne Question / Bonne Réponse pour l'option C.)
 *  2. Chaque colonne ne peut être attribuée qu'à UN seul rôle.
 *  3. La réponse correcte est identifiée AVANT les options, pour qu'une colonne
 *     « Réponse correcte » ne puisse jamais être confondue avec « Réponse A ».
 *  4. La valeur de la bonne réponse accepte A/B/C/D, 1/2/3/4, « Choix B »,
 *     « Réponse : C », le texte exact d'une option, avec ou sans accents.
 */

const BOM = String.fromCharCode(0xFEFF);
const DIACRITICS = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36F) + ']',
  'g'
);
const LABELS = ['A', 'B', 'C', 'D'];

const QUESTION_EXACT = new Set([
  'question', 'questions', 'enonce', 'enonces', 'intitule', 'libelle',
  'prompt', 'titre', 'texte', 'q'
]);

const CORRECT_EXACT = new Set([
  'reponsecorrecte', 'reponse correcte', 'bonnereponse', 'bonne reponse',
  'reponsejuste', 'reponse juste', 'correctanswer', 'correct answer',
  'answer', 'correct', 'solution', 'cle', 'key', 'correction', 'reponse',
  'bonnereponsecorrecte', 'bonnereponsejuste'
]);

const EXPLANATION_EXACT = new Set([
  'explication', 'explications', 'explanation', 'justification',
  'commentaire', 'rationale', 'pourquoi'
]);

const TAGS_EXACT = new Set([
  'tags', 'tag', 'etiquettes', 'etiquette', 'chapitres', 'chapitre',
  'themes', 'theme', 'sujets', 'sujet'
]);

const DIFFICULTY_EXACT = new Set([
  'difficulte', 'difficulty', 'niveaudifficulte', 'difficultequestion'
]);

/** Normalise un en-tête : minuscules, sans accents, séparateurs = espaces. */
function normalizeHeader(value) {
  return String(value ?? '')
    .replace(BOM, '')
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .split(' ').join(' ')
    .replace(/ +/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

/** Normalise une valeur de texte (pour comparer réponse et options). */
function normalizeText(value) {
  return String(value ?? '')
    .replace(BOM, '')
    .normalize('NFKC')
    .replace(/ +/g, ' ')
    .replace(/^\s+|\s+$/g, '');
}

function looseKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]/g, '');
}

function optionAliases(letter, digit) {
  const l = letter.toLowerCase();
  return new Set([
    l, digit,
    'opt' + l, 'opt' + digit,
    'option ' + l, 'option' + l, 'option ' + digit, 'option' + digit,
    'choix ' + l, 'choix' + l, 'choix ' + digit, 'choix' + digit,
    'reponse ' + l, 'reponse' + l, 'reponse ' + digit, 'reponse' + digit,
    'answer ' + l, 'answer' + l
  ]);
}

function stripDecorations(value) {
  let s = String(value || '').trim();
  while (/^[([{]/.test(s)) s = s.slice(1).trim();
  while (/[)\]},.:;]$/.test(s)) s = s.slice(0, -1).trim();
  return s;
}

function optionScore(header, letter, digit) {
  if (optionAliases(letter, digit).has(header)) return 100;
  const bare = stripDecorations(header);
  if (bare === letter || bare === digit) return 90;
  const prefixes = ['option ', 'choix ', 'opt ', 'reponse ', 'answer '];
  for (const prefix of prefixes) {
    if (bare.startsWith(prefix)) {
      const rest = stripDecorations(bare.slice(prefix.length));
      if (rest === letter || rest === digit) return 85;
    }
  }
  return 0;
}

function roleScore(header, role) {
  if (!header) return 0;
  switch (role) {
    case 'question':
      if (QUESTION_EXACT.has(header)) return 100;
      if (header.includes('question') || header.includes('enonce') || header.includes('intitule')) return 60;
      return 0;
    case 'correct':
      if (CORRECT_EXACT.has(header)) return header === 'reponse' ? 45 : 100;
      if (header.startsWith('bonne reponse') || header.startsWith('reponse correcte') || header.startsWith('reponse juste')) return 90;
      if (/^(correct|answer|solution|reponse) /.test(header) && !/[a-d1-4]$/.test(header)) return 50;
      return 0;
    case 'explanation':
      if (EXPLANATION_EXACT.has(header)) return 100;
      if (header.startsWith('explication') || header.startsWith('justification')) return 80;
      return 0;
    case 'tags':
      if (TAGS_EXACT.has(header)) return 100;
      return 0;
    case 'difficulty':
      if (DIFFICULTY_EXACT.has(header)) return 100;
      return 0;
    case 'optA': return optionScore(header, 'a', '1');
    case 'optB': return optionScore(header, 'b', '2');
    case 'optC': return optionScore(header, 'c', '3');
    case 'optD': return optionScore(header, 'd', '4');
    default: return 0;
  }
}

// Ordre important : la question et la bonne réponse sont réservées avant les
// options, sinon « Réponse correcte » peut être volée par l'option C.
const ROLE_ORDER = [
  'question', 'correct', 'explanation', 'tags', 'difficulty',
  'optA', 'optB', 'optC', 'optD'
];

function detectColumns(keys) {
  const normalized = keys.map((key) => ({ key, header: normalizeHeader(key) }));
  const used = new Set();
  const columns = {};
  for (const role of ROLE_ORDER) {
    let best = null;
    let bestScore = 0;
    for (const candidate of normalized) {
      if (used.has(candidate.key)) continue;
      const score = roleScore(candidate.header, role);
      if (score > bestScore) {
        bestScore = score;
        best = candidate.key;
      }
    }
    columns[role] = best;
    if (best) used.add(best);
  }
  return columns;
}

/**
 * Convertit la valeur de la colonne « bonne réponse » en texte d'option.
 * Accepte A/B/C/D, 1/2/3/4, « Choix B », « Réponse : C », « (D) », le texte
 * exact d'une option, avec ou sans accents, majuscules ou espaces.
 */
function resolveCorrectValue(raw, options) {
  let value = normalizeText(raw);
  if (!value) return '';

  const prefixes = [
    'la bonne reponse correcte ', 'la bonne reponse juste ', 'la bonne reponse ',
    'bonne reponse correcte ', 'bonne reponse juste ', 'bonne reponse ',
    'reponse correcte ', 'reponse juste ', 'reponse ',
    'correct answer ', 'answer ', 'correct ', 'solution ', 'cle '
  ];
  const compact = looseKey(value);
  for (const prefix of prefixes) {
    if (looseKey(prefix) && compact.startsWith(looseKey(prefix))) {
      value = value.slice(prefix.length).trim();
      break;
    }
  }
  value = stripDecorations(value);
  if (!value) return '';

  const labelMatch = value.toUpperCase().match(/^([A-D]|[1-4])$/);
  if (labelMatch) {
    const token = labelMatch[1];
    const label = /[A-D]/.test(token) ? token : LABELS[Number(token) - 1];
    return options[label] || '';
  }

  const labeled = value.toLowerCase().match(/^(option|choix|opt|reponse|answer)\s+([a-d]|[1-4])$/);
  if (labeled) {
    const token = labeled[2];
    const label = /[a-d]/.test(token) ? token.toUpperCase() : LABELS[Number(token) - 1];
    return options[label] || '';
  }

  const key = looseKey(value);
  for (const label of LABELS) {
    const option = options[label];
    if (!option) continue;
    if (option === value || looseKey(option) === key) return option;
    const withLabel = (label + '. ' + option).toLowerCase();
    const withLabelAlt = (label + ') ' + option).toLowerCase();
    if (withLabel === value.toLowerCase() || withLabelAlt === value.toLowerCase()) return option;
  }

  // Valeur inconnue : on la conserve pour que l'admin la voie dans l'aperçu.
  return value;
}

/** Détecte le séparateur en comptant les occurrences hors guillemets. */
function detectDelimiter(text) {
  const firstLine = String(text).replace(BOM, '').split(/\r?\n/).find((line) => line.trim());
  if (!firstLine) return undefined;
  let best;
  let bestCount = 0;
  for (const delimiter of [';', '\t', '|', ',']) {
    let count = 0;
    let quoted = false;
    for (let i = 0; i < firstLine.length; i++) {
      const char = firstLine[i];
      if (char === '"') quoted = !quoted;
      else if (char === delimiter && !quoted) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      best = delimiter;
    }
  }
  return bestCount > 0 ? best : undefined;
}

async function readSource(source) {
  if (typeof source === 'string') return source;
  if (source && typeof source.text === 'function') return source.text();
  return String(source ?? '');
}

function normalizeDifficulty(value) {
  const raw = normalizeText(value).toLowerCase();
  if (raw === 'facile' || raw === 'easy') return 'facile';
  if (raw === 'difficile' || raw === 'difficult' || raw === 'hard') return 'difficile';
  return 'moyenne';
}

/**
 * Parse un fichier CSV (ou une chaîne) en questions QCM.
 * Retourne { success, questions, warnings, errors, detectedColumns }.
 */
export function parseQuestionsCsv(fileOrString) {
  return (async () => {
    const text = await readSource(fileOrString);
    if (!text || !text.trim()) {
      return {
        success: false,
        questions: [],
        warnings: [],
        errors: ['Le fichier CSV est vide ou ne contient aucune ligne de données.']
      };
    }

    const parsed = Papa.parse(text, {
      delimiter: detectDelimiter(text),
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (header) => normalizeText(header)
    });

    const fatal = (parsed.errors || []).find((error) => error.type === 'Quotes' || error.type === 'Delimiter');
    if (fatal) {
      return {
        success: false,
        questions: [],
        warnings: [],
        errors: ['Le fichier CSV est mal formé : ' + fatal.message]
      };
    }

    if (!parsed.data || parsed.data.length === 0) {
      return {
        success: false,
        questions: [],
        warnings: [],
        errors: ['Le fichier CSV est vide ou ne contient aucune ligne de données.']
      };
    }

    const columns = detectColumns(Object.keys(parsed.data[0]));
    const detectedColumns = {
      question: columns.question,
      optA: columns.optA,
      optB: columns.optB,
      optC: columns.optC,
      optD: columns.optD,
      reponseCorrecte: columns.correct,
      tags: columns.tags,
      difficulte: columns.difficulty,
      explication: columns.explanation
    };

    const warnings = [];
    const errors = [];
    const questions = [];

    if (!columns.question) {
      errors.push("Colonne 'Question' ou 'Énoncé' introuvable dans le CSV.");
      return { success: false, questions: [], warnings, errors, detectedColumns };
    }

    parsed.data.forEach((row, index) => {
      const questionText = normalizeText(row[columns.question]);
      if (!questionText) return;

      const options = {
        A: columns.optA ? normalizeText(row[columns.optA]) : '',
        B: columns.optB ? normalizeText(row[columns.optB]) : '',
        C: columns.optC ? normalizeText(row[columns.optC]) : '',
        D: columns.optD ? normalizeText(row[columns.optD]) : ''
      };
      const answerCount = LABELS.filter((label) => options[label]).length;

      const rawCorrect = columns.correct ? normalizeText(row[columns.correct]) : '';
      const correct = resolveCorrectValue(rawCorrect, options);

      if (answerCount < 2) {
        warnings.push(
          'Ligne ' + (index + 1) + ' : au moins 2 options sont requises pour « ' +
          questionText.slice(0, 40) + ' ».'
        );
      }
      if (!correct) {
        warnings.push(
          'Ligne ' + (index + 1) + ' : aucune réponse correcte détectée pour « ' +
          questionText.slice(0, 40) + ' ». Indiquez A, B, C, D, 1 à 4 ou le texte exact de l’option.'
        );
      } else if (!LABELS.some((label) => options[label] && looseKey(options[label]) === looseKey(correct))) {
        warnings.push(
          'Ligne ' + (index + 1) + ' : la réponse « ' + correct +
          ' » ne correspond à aucune option de « ' + questionText.slice(0, 40) + ' ».'
        );
      }

      questions.push({
        Question: questionText,
        OptA: options.A,
        OptB: options.B,
        OptC: options.C,
        OptD: options.D,
        ReponseCorrecte: correct,
        Explication: columns.explanation ? normalizeText(row[columns.explanation]).slice(0, 2000) : '',
        Tags: columns.tags ? normalizeText(row[columns.tags]) : '',
        Difficulte: columns.difficulty ? normalizeDifficulty(row[columns.difficulty]) : 'moyenne'
      });
    });

    return {
      success: questions.length > 0 && errors.length === 0,
      questions,
      warnings,
      errors,
      detectedColumns
    };
  })();
}

/**
 * Télécharge un modèle CSV prêt à l'emploi (séparateur « ; » Excel ou « , »).
 */
export function downloadCsvTemplate(separator = ';') {
  const isSemicolon = separator === ';';
  const delimiter = isSemicolon ? ';' : ',';
  const headers = isSemicolon
    ? 'Question;Option A;Option B;Option C;Option D;Bonne Réponse;Explication;Tags'
    : 'Question,OptA,OptB,OptC,OptD,ReponseCorrecte,Explication,Tags';
  const quote = (value) => '"' + String(value).replace(/"/g, '""') + '"';
  const examples = [
    [
      'Quel est le rôle du compilateur ?',
      'Traduire le code source en langage machine',
      'Exécuter le code pas à pas',
      'Formater le texte',
      'Supprimer les bugs',
      'A',
      'Le compilateur traduit le code source en langage machine avant l’exécution.',
      'compilation;bases'
    ],
    [
      'Quel protocole sécurise les échanges Web ?',
      'HTTP', 'FTP', 'HTTPS', 'Telnet', 'HTTPS',
      'HTTPS chiffre les échanges via TLS, contrairement à HTTP.',
      'réseaux;web'
    ],
    [
      'Quelle structure de données fonctionne en FIFO ?',
      'Pile', 'File', 'Arbre binaire', 'Table de hachage', 'B',
      'Une file traite le premier élément arrivé en premier (First In, First Out).',
      'structures;algorithmes'
    ]
  ];
  const rows = examples.map((cells) => cells.map(quote).join(delimiter));
  const csvContent = BOM + headers + '\r\n' + rows.join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = isSemicolon
    ? 'modele_qcm_excel_qcm_app.csv'
    : 'modele_qcm_standard_qcm_app.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
