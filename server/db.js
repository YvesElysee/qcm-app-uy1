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
    niveau   TEXT
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

  -- Cartes de révision espacée · créées à partir des erreurs du QCM
  CREATE TABLE IF NOT EXISTS review_cards (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    userId          TEXT NOT NULL,
    ue              TEXT NOT NULL,
    questionId      INTEGER,
    question        TEXT NOT NULL,
    options         TEXT,                      -- JSON { OptA, OptB, OptC, OptD }
    correct         TEXT NOT NULL,
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
