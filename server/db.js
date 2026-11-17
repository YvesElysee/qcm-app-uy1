/**
 * Base de données SQLite (better-sqlite3) · remplace Firebase Firestore.
 * Les noms de colonnes reproduisent exactement les champs des documents Firestore
 * d'origine afin de conserver la même logique métier côté frontend.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'qcm.db');

export { DATA_DIR, DB_PATH };

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');      // Écritures concurrentes sûres
db.pragma('foreign_keys = ON');       // Intégrité référentielle
db.pragma('busy_timeout = 5000');    // Attente max 5s si base occupée

// ── Création du schéma ────────────────────────────────────────────────
db.exec(`
  -- Étudiants inscrits (ex-collection "users")
  CREATE TABLE IF NOT EXISTS users (
    id               TEXT PRIMARY KEY,          -- ID historique basé sur l'email
    name             TEXT NOT NULL,
    email            TEXT NOT NULL UNIQUE,
    passwordHash     TEXT NOT NULL,
    filiere          TEXT DEFAULT 'Informatique',
    niveau           TEXT DEFAULT 'L1',
    anneeAcademique  TEXT DEFAULT '2025-2026',
    dateNaissance    TEXT DEFAULT '',
    createdAt        TEXT,
    lastLogin        TEXT,
    updatedAt        TEXT
  );

  -- Codes de réinitialisation de mot de passe (ex-"password_resets")
  CREATE TABLE IF NOT EXISTS password_resets (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL,
    code       TEXT NOT NULL,
    expiresAt  INTEGER NOT NULL,
    used       INTEGER DEFAULT 0,
    usedAt     TEXT,
    createdAt   TEXT
  );

  -- Métadonnées des QCM (ex-collection "quizzes")
  CREATE TABLE IF NOT EXISTS quizzes (
    id               TEXT PRIMARY KEY,          -- Code UE (ex: INF232)
    ue               TEXT,
    filiere          TEXT,
    niveau           TEXT,
    semestre         TEXT,
    questionCount    INTEGER DEFAULT 0,
    timePerQuestion  INTEGER DEFAULT 60,
    drawCount        INTEGER DEFAULT 0,         -- nombre de questions tirées par étudiant (0 = toutes)
    launchTime       INTEGER,                   -- ms epoch
    endTime          INTEGER,                   -- ms epoch
    updatedAt        TEXT
  );

  -- Questions d'un QCM (ex-sous-collection "quizzes/{id}/questions")
  CREATE TABLE IF NOT EXISTS questions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    quizId           TEXT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
    Question         TEXT NOT NULL,
    OptA             TEXT DEFAULT '',
    OptB             TEXT DEFAULT '',
    OptC             TEXT DEFAULT '',
    OptD             TEXT DEFAULT '',
    ReponseCorrecte  TEXT NOT NULL,
    explication      TEXT DEFAULT '',           -- justification pédagogique (affichée après le QCM)
    tags             TEXT DEFAULT '',           -- étiquettes libres séparées par des virgules
    difficulte       TEXT DEFAULT 'moyenne',    -- facile | moyenne | difficile
    position         INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_questions_quiz ON questions(quizId);

  -- Présence temps réel des participants (ex-"quizzes/{id}/sessions")
  CREATE TABLE IF NOT EXISTS quiz_sessions (
    id        TEXT PRIMARY KEY,
    quizId    TEXT NOT NULL,
    name      TEXT,
    lastSeen  INTEGER NOT NULL,                 -- ms epoch (heartbeat)
    ts        TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_quiz_sessions_quiz ON quiz_sessions(quizId);

  -- Résultats des étudiants (ex-collection "results")
  CREATE TABLE IF NOT EXISTS results (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT,
    email            TEXT,
    ue               TEXT,
    filiere          TEXT,
    niveau           TEXT,
    score            INTEGER,
    total            INTEGER,
    answers          TEXT,                      -- JSON [{selected, correct, isOk}]
    sessionTimestamp INTEGER DEFAULT 0,
    isMakeup         INTEGER DEFAULT 0,
    date             TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_results_ue ON results(ue);

  -- Messages & suggestions étudiants (ex-collection "feedback")
  CREATE TABLE IF NOT EXISTS feedback (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    userId          TEXT DEFAULT '',
    name            TEXT,
    email           TEXT,
    filiere         TEXT,
    niveau          TEXT,
    anneeAcademique TEXT,
    category        TEXT,
    ue              TEXT,
    subject         TEXT,
    message         TEXT,
    status          TEXT DEFAULT 'en_attente',  -- 'en_attente' | 'en_cours' | 'traite'
    date            TEXT
  );

  -- Unités d'enseignement (ex-collection "ues")
  CREATE TABLE IF NOT EXISTS ues (
    id       TEXT PRIMARY KEY,                  -- Code UE
    code     TEXT,
    label    TEXT,
    filiere  TEXT,
    niveau   TEXT,
    semestre TEXT DEFAULT ''                    -- '1' | '2' (division par semestre)
  );

  -- Paramètres système (ex-"settings/smtp") · stockés en JSON
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  -- Jetons de session étudiants (équivalent de la session localStorage, côté serveur)
  CREATE TABLE IF NOT EXISTS tokens (
    token      TEXT PRIMARY KEY,
    userId    TEXT NOT NULL,
    createdAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(userId);

  -- Jetons de session administrateur
  CREATE TABLE IF NOT EXISTS admin_tokens (
    token      TEXT PRIMARY KEY,
    createdAt TEXT
  );

  -- Quota d'utilisation du tuteur IA (2 questions max par erreur et par étudiant)
  CREATE TABLE IF NOT EXISTS ai_usage (
    userId     TEXT NOT NULL,
    contextKey TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    updatedAt  TEXT NOT NULL,
    PRIMARY KEY (userId, contextKey)
  );
  CREATE INDEX IF NOT EXISTS idx_ai_usage_updated ON ai_usage(updatedAt);

  -- Journal des requêtes IA · nombre de requêtes et tokens réellement consommés
  CREATE TABLE IF NOT EXISTS ai_requests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    userId          TEXT NOT NULL,
    contextKey      TEXT,
    provider        TEXT,                      -- 'groq' | 'gemini' (usage interne admin)
    model           TEXT,
    status          TEXT NOT NULL DEFAULT 'ok', -- 'ok' | 'error' | 'quota'
    promptTokens    INTEGER NOT NULL DEFAULT 0,
    completionTokens INTEGER NOT NULL DEFAULT 0,
    totalTokens     INTEGER NOT NULL DEFAULT 0,
    createdAt       TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_ai_requests_created ON ai_requests(createdAt);
  CREATE INDEX IF NOT EXISTS idx_ai_requests_user ON ai_requests(userId);

  -- Cartes de révision espacée · créées à partir des erreurs du QCM
  CREATE TABLE IF NOT EXISTS review_cards (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    userId          TEXT NOT NULL,
    ue              TEXT NOT NULL,
    questionId      INTEGER,
    question        TEXT NOT NULL,
    options         TEXT,                      -- JSON { OptA, OptB, OptC, OptD }
    correct         TEXT NOT NULL,
    explication     TEXT DEFAULT '',
    lastSelected    TEXT,
    ease            REAL DEFAULT 2.5,
    intervalDays    INTEGER DEFAULT 1,
    repetitions     INTEGER DEFAULT 0,
    lapses          INTEGER DEFAULT 0,
    dueAt           TEXT NOT NULL,
    lastReviewedAt  TEXT,
    createdAt       TEXT NOT NULL,
    updatedAt       TEXT NOT NULL,
    UNIQUE(userId, ue, questionId)
  );
  CREATE INDEX IF NOT EXISTS idx_review_due ON review_cards(userId, dueAt);
`);

// ── Catalogue des facultés / filières & fonctionnalités transverses ────
db.exec(`
  -- Facultés de l'université (ex: FACSCIENCES, FALSH)
  CREATE TABLE IF NOT EXISTS facultes (
    id        TEXT PRIMARY KEY,
    label     TEXT NOT NULL,
    createdAt TEXT
  );

  -- Filières rattachées à une faculté (catalogue proposé à l'inscription)
  CREATE TABLE IF NOT EXISTS filieres (
    id        TEXT PRIMARY KEY,
    label     TEXT NOT NULL,
    faculte   TEXT NOT NULL,
    createdAt TEXT,
    UNIQUE(faculte, label)
  );
  CREATE INDEX IF NOT EXISTS idx_filieres_faculte ON filieres(faculte);

  -- Demandes de filières absentes du catalogue (formulaire d'inscription)
  CREATE TABLE IF NOT EXISTS filiere_requests (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    userId    TEXT DEFAULT '',
    name      TEXT,
    email     TEXT,
    faculte   TEXT,
    filiere   TEXT,
    niveau    TEXT,
    status    TEXT DEFAULT 'pending',          -- pending | approved | rejected
    note      TEXT DEFAULT '',
    createdAt TEXT,
    handledAt TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_filiere_requests_status ON filiere_requests(status);

  -- Notifications par utilisateur (QCM disponible, filière ajoutée, etc.)
  CREATE TABLE IF NOT EXISTS notifications (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    userId    TEXT NOT NULL,
    type      TEXT NOT NULL,
    title     TEXT NOT NULL,
    message   TEXT DEFAULT '',
    link      TEXT DEFAULT '',
    entityKey TEXT DEFAULT '',
    isRead    INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(userId, isRead, createdAt);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedupe
    ON notifications(userId, entityKey) WHERE entityKey <> '';

  -- Documents de référence utilisés par le générateur de QCM IA
  CREATE TABLE IF NOT EXISTS ai_documents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    originalName TEXT NOT NULL,
    storedName   TEXT NOT NULL,
    mimeType     TEXT DEFAULT '',
    size         INTEGER DEFAULT 0,
    charCount    INTEGER DEFAULT 0,
    textContent  TEXT DEFAULT '',
    uploadedBy   TEXT DEFAULT 'admin',
    createdAt    TEXT
  );

  -- Ressources de cours partagées par les étudiants et l'administration
  CREATE TABLE IF NOT EXISTS resources (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    title        TEXT NOT NULL,
    description  TEXT DEFAULT '',
    ue           TEXT DEFAULT '',
    faculte      TEXT,
    filiere      TEXT,
    niveau       TEXT,
    originalName TEXT NOT NULL,
    storedName   TEXT NOT NULL,
    mimeType     TEXT DEFAULT '',
    size         INTEGER DEFAULT 0,
    uploaderId   TEXT DEFAULT '',
    uploaderName TEXT DEFAULT '',
    uploaderRole TEXT DEFAULT 'student',       -- student | admin
    downloads    INTEGER DEFAULT 0,
    createdAt    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_resources_scope ON resources(faculte, filiere, niveau);
  CREATE INDEX IF NOT EXISTS idx_resources_created ON resources(createdAt);

  -- Demandes de QCM : un étudiant peut réclamer une épreuve absente pour son
  -- parcours (faculté + filière + niveau + UE). Le regroupement sert de
  -- pétition : au seuil atteint, la demande passe en « validée ».
  CREATE TABLE IF NOT EXISTS quiz_requests (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    userId    TEXT NOT NULL,
    name      TEXT,
    email     TEXT,
    faculte   TEXT NOT NULL,
    filiere   TEXT NOT NULL,
    niveau    TEXT NOT NULL,
    ue        TEXT NOT NULL,
    ueLabel   TEXT DEFAULT '',
    message   TEXT DEFAULT '',
    status    TEXT DEFAULT 'pending',          -- pending | validated | approved | rejected
    note      TEXT DEFAULT '',
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_quiz_requests_group
    ON quiz_requests(faculte, filiere, niveau, ue, status);
  CREATE INDEX IF NOT EXISTS idx_quiz_requests_user ON quiz_requests(userId, createdAt);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_requests_active
    ON quiz_requests(userId, faculte, filiere, niveau, ue)
    WHERE status IN ('pending', 'validated');

  -- Parrainage : chaque étudiant possède un code unique. Un filleul est
  -- rattaché à son parrain à l'inscription (référence users.referredBy).
  CREATE TABLE IF NOT EXISTS referrals (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    referrerId     TEXT NOT NULL,
    referredUserId TEXT NOT NULL,
    code           TEXT NOT NULL,
    createdAt      TEXT NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_referrals_referred
    ON referrals(referredUserId);
  CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrerId);

  -- Générateur d'exercices (Mathématiques) : documents personnels déposés par
  -- l'étudiant et historiques de génération. Les fichiers restent hors du
  -- dossier public et ne sont visibles que par leur propriétaire.
  CREATE TABLE IF NOT EXISTS student_documents (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    userId       TEXT NOT NULL,
    originalName TEXT NOT NULL,
    storedName   TEXT NOT NULL,
    mimeType     TEXT DEFAULT '',
    size         INTEGER DEFAULT 0,
    charCount    INTEGER DEFAULT 0,
    textContent  TEXT DEFAULT '',
    createdAt    TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_student_documents_user
    ON student_documents(userId, createdAt);

  CREATE TABLE IF NOT EXISTS student_exercises (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    userId      TEXT NOT NULL,
    filiere     TEXT DEFAULT '',
    niveau      TEXT DEFAULT '',
    type        TEXT DEFAULT 'mixte',
    prompt      TEXT DEFAULT '',
    documentIds TEXT DEFAULT '',
    content     TEXT DEFAULT '[]',
    provider    TEXT DEFAULT '',
    createdAt   TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_student_exercises_user
    ON student_exercises(userId, createdAt);
`);

/**
 * Ajoute une colonne si elle n'existe pas encore (migration douce des bases
 * créées avant l'ajout des fonctionnalités de banque de questions).
 */
function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(c => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] Migration : ${table}.${column} ajoutée`);
  }
}

ensureColumn('quizzes', 'drawCount', 'INTEGER DEFAULT 0');
ensureColumn('questions', 'tags', "TEXT DEFAULT ''");
ensureColumn('questions', 'difficulte', "TEXT DEFAULT 'moyenne'");
ensureColumn('questions', 'explication', "TEXT DEFAULT ''");
ensureColumn('review_cards', 'explication', "TEXT DEFAULT ''");
// Dimension faculté (migration douce des bases existantes)
ensureColumn('users', 'faculte', "TEXT DEFAULT 'FACSCIENCES'");
ensureColumn('quizzes', 'faculte', "TEXT DEFAULT 'FACSCIENCES'");
ensureColumn('ues', 'faculte', "TEXT DEFAULT 'FACSCIENCES'");
ensureColumn('ues', 'semestre', "TEXT DEFAULT ''");
ensureColumn('results', 'faculte', "TEXT DEFAULT ''");
// Plusieurs tests peuvent désormais porter sur la même UE : les lignes sont
// identifiées par un `id` propre et un `title` lisible (ex. « Test 1 »).
ensureColumn('quizzes', 'title', "TEXT DEFAULT ''");
// Les copies mémorisent le test exact (et son intitulé) en plus de l'UE.
ensureColumn('results', 'quizId', "TEXT DEFAULT ''");
ensureColumn('results', 'quizTitle', "TEXT DEFAULT ''");

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_results_quiz ON results(quizId);
  UPDATE quizzes SET title = COALESCE(NULLIF(TRIM(ue), ''), id)
    WHERE title IS NULL OR TRIM(title) = '';
  UPDATE results SET quizId = ue WHERE quizId IS NULL OR TRIM(quizId) = '';
  UPDATE results SET quizTitle = ue WHERE quizTitle IS NULL OR TRIM(quizTitle) = '';
`);

// Division par semestre : le catalogue UE hérite du semestre des épreuves
// déjà programmées (les bases existantes restent cohérentes).
db.exec(`
  UPDATE ues
  SET semestre = (
    SELECT q.semestre FROM quizzes q
    WHERE UPPER(TRIM(q.ue)) = UPPER(TRIM(COALESCE(ues.code, ues.id)))
      AND q.semestre IS NOT NULL AND TRIM(q.semestre) <> ''
    ORDER BY COALESCE(q.launchTime, 0) DESC, q.id DESC
    LIMIT 1
  )
  WHERE (semestre IS NULL OR TRIM(semestre) = '')
    AND EXISTS (
      SELECT 1 FROM quizzes q
      WHERE UPPER(TRIM(q.ue)) = UPPER(TRIM(COALESCE(ues.code, ues.id)))
        AND q.semestre IS NOT NULL AND TRIM(q.semestre) <> ''
    );
`);
// Parrainage (migration douce)
ensureColumn('users', 'referralCode', "TEXT DEFAULT ''");
ensureColumn('users', 'referredBy', "TEXT DEFAULT ''");

// Un code de parrainage est unique (les lignes vides sont ignorées).
db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
    ON users(referralCode) WHERE referralCode <> '';
`);

// ── Catalogue initial : facultés et filières ───────────────────────────
// Seules les valeurs par défaut sont créées ici. L'administration peut
// ensuite ajouter d'autres facultés/filières depuis son panneau.
function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function filiereId(faculte, label) {
  return `${slugify(faculte)}:${slugify(label)}`;
}

const DEFAULT_FACULTES = [
  ['FACSCIENCES', 'Faculté des Sciences'],
  ['FALSH', 'Faculté des Lettres et Sciences Humaines']
];

const DEFAULT_FILIERES = {
  FACSCIENCES: ['Informatique', 'Mathématiques', 'Physique', 'Chimie', 'Biologie'],
  FALSH: ['Lettres Modernes', 'Histoire', 'Géographie', 'Anglais', 'Philosophie', 'Sociologie', 'Psychologie']
};

const nowIso = new Date().toISOString();
const insertFaculte = db.prepare(
  'INSERT INTO facultes (id, label, createdAt) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING'
);
DEFAULT_FACULTES.forEach(([id, label]) => insertFaculte.run(id, label, nowIso));

const insertFiliere = db.prepare(`
  INSERT INTO filieres (id, label, faculte, createdAt)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(id) DO NOTHING
`);
Object.entries(DEFAULT_FILIERES).forEach(([faculte, labels]) => {
  labels.forEach((label) => insertFiliere.run(filiereId(faculte, label), label, faculte, nowIso));
});

// Récupère les filières déjà présentes dans les anciennes données (users,
// quizzes, ues) et les rattache au catalogue pour ne rien perdre.
const existingFilieres = new Set();
['users', 'quizzes', 'ues'].forEach((table) => {
  db.prepare(`SELECT DISTINCT TRIM(filiere) AS f FROM ${table} WHERE filiere IS NOT NULL AND TRIM(filiere) <> ''`)
    .all()
    .forEach((row) => existingFilieres.add(row.f));
});
existingFilieres.forEach((label) => {
  const known = db.prepare(
    'SELECT id FROM filieres WHERE LOWER(TRIM(label)) = LOWER(TRIM(?)) LIMIT 1'
  ).get(label);
  if (!known) insertFiliere.run(filiereId('FACSCIENCES', label), label, 'FACSCIENCES', nowIso);
});

// Aligne la faculté des anciennes lignes sur le catalogue (filière → faculté)
['users', 'quizzes', 'ues', 'results'].forEach((table) => {
  db.prepare(`
    UPDATE ${table}
    SET faculte = (
      SELECT f.faculte FROM filieres f
      WHERE LOWER(TRIM(f.label)) = LOWER(TRIM(${table}.filiere))
      LIMIT 1
    )
    WHERE filiere IS NOT NULL AND TRIM(filiere) <> ''
      AND EXISTS (
        SELECT 1 FROM filieres f
        WHERE LOWER(TRIM(f.label)) = LOWER(TRIM(${table}.filiere))
      )
  `).run();
});

/**
 * Lit un paramètre JSON de la table settings
 */
export function getSetting(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return null;
  try {
    return JSON.parse(row.value);
  } catch {
    return null;
  }
}

/**
 * Écrit un paramètre JSON dans la table settings
 */
export function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
    .run(key, JSON.stringify(value));
}

console.log(`[db] SQLite prête : ${DB_PATH}`);
