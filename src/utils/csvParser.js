import Papa from 'papaparse';

/**
 * Normalise un texte (minuscules, sans accents, sans espaces superflus)
 */
function normalizeHeader(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Détecte les colonnes de manière ultra-tolérante
 */
function findMatchingKey(rowKeys, aliases) {
  for (const key of rowKeys) {
    const norm = normalizeHeader(key);
    for (const alias of aliases) {
      if (norm === alias || norm.includes(alias)) {
        return key;
      }
    }
  }
  return null;
}

/**
 * Parse un fichier CSV avec auto-détection du délimiteur, BOM et normalisation des colonnes
 */
export function parseQuestionsCsv(fileOrString) {
  return new Promise((resolve, reject) => {
    Papa.parse(fileOrString, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.replace(/^\uFEFF/, '').trim(), // Supprime le BOM Excel
      complete: (results) => {
        try {
          if (!results.data || results.data.length === 0) {
            return resolve({
              success: false,
              questions: [],
              warnings: ["Le fichier CSV est vide ou ne contient aucune ligne de données."],
              errors: []
            });
          }

          const firstRow = results.data[0];
          const keys = Object.keys(firstRow);

          // Mapping tolérant des en-têtes
          const questionKey = findMatchingKey(keys, ['question', 'enonce', 'prompt', 'intitule', 'titre', 'q', 'texte']);
          const optAKey = findMatchingKey(keys, ['opta', 'optiona', 'choixa', 'reponsea', 'a', 'choix1', 'opt1']);
          const optBKey = findMatchingKey(keys, ['optb', 'optionb', 'choixb', 'reponseb', 'b', 'choix2', 'opt2']);
          const optCKey = findMatchingKey(keys, ['optc', 'optionc', 'choixc', 'reponsec', 'c', 'choix3', 'opt3']);
          const optDKey = findMatchingKey(keys, ['optd', 'optiond', 'choixd', 'reponsed', 'd', 'choix4', 'opt4']);
          const correctKey = findMatchingKey(keys, [
            'reponsecorrecte', 'reponsebonne', 'bonnereponse', 'reponsejuste',
            'justereponse', 'correctanswer', 'answer', 'correct', 'solution',
            'cle', 'reponse'
          ]);

          const warnings = [];
          const errors = [];
          const questions = [];

          if (!questionKey) {
            errors.push("Colonne 'Question' ou 'Énoncé' introuvable dans le CSV.");
            return resolve({ success: false, questions: [], warnings, errors });
          }

          results.data.forEach((row, idx) => {
            const rawQuestion = (row[questionKey] || '').toString().trim();
            if (!rawQuestion) return; // ignore les lignes vides

            const optA = (optAKey ? row[optAKey] : (row['OptA'] || row['A'] || '')).toString().trim();
            const optB = (optBKey ? row[optBKey] : (row['OptB'] || row['B'] || '')).toString().trim();
            const optC = (optCKey ? row[optCKey] : (row['OptC'] || row['C'] || '')).toString().trim();
            const optD = (optDKey ? row[optDKey] : (row['OptD'] || row['D'] || '')).toString().trim();

            const rawCorrect = (correctKey ? row[correctKey] : (row['ReponseCorrecte'] || '')).toString().trim();

            // Normalisation de la réponse correcte
            let finalCorrect = '';
            const upper = rawCorrect.toUpperCase();

            // Cas 1 : Réponse sous forme de lettre A, B, C, D
            if (['A', 'OPT A', 'OPTION A', 'CHOIX A', '1'].includes(upper)) {
              finalCorrect = optA;
            } else if (['B', 'OPT B', 'OPTION B', 'CHOIX B', '2'].includes(upper)) {
              finalCorrect = optB;
            } else if (['C', 'OPT C', 'OPTION C', 'CHOIX C', '3'].includes(upper)) {
              finalCorrect = optC;
            } else if (['D', 'OPT D', 'OPTION D', 'CHOIX D', '4'].includes(upper)) {
              finalCorrect = optD;
            } else {
              // Cas 2 : Réponse sous forme de texte complet
              const cleanRaw = rawCorrect.toLowerCase();
              if (optA && optA.toLowerCase() === cleanRaw) finalCorrect = optA;
              else if (optB && optB.toLowerCase() === cleanRaw) finalCorrect = optB;
              else if (optC && optC.toLowerCase() === cleanRaw) finalCorrect = optC;
              else if (optD && optD.toLowerCase() === cleanRaw) finalCorrect = optD;
              else {
                // Si non trouvé, on garde le texte tel quel
                finalCorrect = rawCorrect;
              }
            }

            // Vérification de validité
            if (!optA && !optB) {
              warnings.push(`Ligne ${idx + 1} : Au moins 2 options sont requises pour la question "${rawQuestion.slice(0, 30)}...".`);
            }
            if (!finalCorrect) {
              warnings.push(`Ligne ${idx + 1} : Aucune réponse correcte détectée pour la question "${rawQuestion.slice(0, 30)}...".`);
            }

            questions.push({
              Question: rawQuestion,
              OptA: optA,
              OptB: optB,
              OptC: optC,
              OptD: optD,
              ReponseCorrecte: finalCorrect
            });
          });

          resolve({
            success: questions.length > 0,
            questions,
            warnings,
            errors,
            detectedColumns: {
              question: questionKey,
              optA: optAKey,
              optB: optBKey,
              optC: optCKey,
              optD: optDKey,
              reponseCorrecte: correctKey
            }
          });
        } catch (err) {
          reject(err);
        }
      },
      error: (err) => {
        reject(err);
      }
    });
  });
}

/**
 * Télécharge un modèle CSV prêt à l'emploi (Virgule ou Point-Virgule Excel)
 */
export function downloadCsvTemplate(separator = ';') {
  const isSemicolon = separator === ';';
  const headers = isSemicolon
    ? "Question;Option A;Option B;Option C;Option D;Bonne Réponse\r\n"
    : "Question,OptA,OptB,OptC,OptD,ReponseCorrecte\r\n";

  const rows = isSemicolon ? [
    '"Quel est le rôle du compilateur ?";"Traduire le code source en langage machine";"Exécuter le code pas à pas";"Formater le texte";"Supprimer les bugs";"A"',
    '"Quel protocole sécurise les échanges Web ?";"HTTP";"FTP";"HTTPS";"Telnet";"HTTPS"',
    '"Quelle structure de données fonctionne en FIFO ?";"Pile";"File";"Arbre binaire";"Table de hachage";"File"'
  ].join("\r\n") : [
    '"Quel est le rôle du compilateur ?","Traduire le code source en langage machine","Exécuter le code pas à pas","Formater le texte","Supprimer les bugs","A"',
    '"Quel protocole sécurise les échanges Web ?","HTTP","FTP","HTTPS","Telnet","HTTPS"',
    '"Quelle structure de données fonctionne en FIFO ?","Pile","File","Arbre binaire","Table de hachage","File"'
  ].join("\r\n");

  const bom = "\uFEFF"; // Pour forcer Excel à lire en UTF-8
  const csvContent = bom + headers + rows;
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = isSemicolon ? "modele_qcm_excel_uy1.csv" : "modele_qcm_standard_uy1.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
