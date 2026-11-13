/**
 * Sauvegarde automatique de la base SQLite.
 *
 * - Une copie complète et cohérente est créée via `db.backup()` (API native
 *   better-sqlite3, sûre même pendant les écritures).
 * - Les fichiers sont conservés dans `data/backups` (ou BACKUP_DIR).
 * - Rotation automatique : seules les N sauvegardes les plus récentes restent.
 * - Planification : au démarrage puis toutes les BACKUP_INTERVAL_HOURS heures.
 */
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from './db.js';

export const BACKUP_DIR = process.env.BACKUP_DIR || path.join(DATA_DIR, 'backups');
const MAX_BACKUPS = Math.max(1, Number(process.env.BACKUP_MAX) || 10);
const INTERVAL_HOURS = Math.max(0.1, Number(process.env.BACKUP_INTERVAL_HOURS) || 6);
const ENABLED = String(process.env.BACKUP_ENABLED || 'true').toLowerCase() !== 'false';

let running = null;

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function safeName(name) {
  return path.basename(String(name || '')).replace(/[^a-zA-Z0-9._-]/g, '_');
}

/**
 * Liste les sauvegardes, de la plus récente à la plus ancienne.
 */
export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.db'))
    .map((file) => {
      const stat = fs.statSync(path.join(BACKUP_DIR, file));
      return { name: file, size: stat.size, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Supprime les sauvegardes au-delà de la limite.
 */
function prune() {
  const files = listBackups();
  for (const file of files.slice(MAX_BACKUPS)) {
    try {
      fs.unlinkSync(path.join(BACKUP_DIR, file.name));
    } catch (err) {
      console.warn('[backup] Suppression impossible :', file.name, err.message);
    }
  }
}

/**
 * Crée une sauvegarde et renvoie ses métadonnées.
 * @param {string} label suffixe lisible (ex: "auto", "manuel")
 */
export async function createBackup(label = 'auto') {
  if (running) return running;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = safeName(`qcm-${stamp()}-${label}.db`);
  const target = path.join(BACKUP_DIR, name);

  running = (async () => {
    try {
      await db.backup(target);
      prune();
      const stat = fs.statSync(target);
      console.log(`[backup] Sauvegarde créée : ${name} (${Math.round(stat.size / 1024)} Ko)`);
      return { name, size: stat.size, createdAt: stat.mtime.toISOString() };
    } finally {
      running = null;
    }
  })();

  return running;
}

/**
 * Résout le chemin d'une sauvegarde existante (protection contre le traversal).
 */
export function backupPath(name) {
  const clean = safeName(name);
  if (!clean.endsWith('.db')) return null;
  const root = path.resolve(BACKUP_DIR);
  const full = path.resolve(root, clean);
  if (!full.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(full)) return null;
  return full;
}

export function deleteBackup(name) {
  const full = backupPath(name);
  if (!full) return false;
  fs.unlinkSync(full);
  return true;
}

/**
 * Démarre la planification (sans bloquer le processus).
 */
export function scheduleBackups() {
  if (!ENABLED) {
    console.log('[backup] Sauvegardes automatiques désactivées (BACKUP_ENABLED=false).');
    return;
  }
  // Première sauvegarde peu après le démarrage, pour ne pas retarder l'API.
  setTimeout(() => {
    createBackup('auto').catch(err => console.warn('[backup] Échec :', err.message));
  }, 30 * 1000).unref();

  setInterval(() => {
    createBackup('auto').catch(err => console.warn('[backup] Échec :', err.message));
  }, INTERVAL_HOURS * 60 * 60 * 1000).unref();

  console.log(`[backup] Sauvegarde automatique toutes les ${INTERVAL_HOURS} h (max ${MAX_BACKUPS}).`);
}
