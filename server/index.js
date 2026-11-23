/**
 * Serveur API Node.js / Express · QCM App
 *
 * Remplace Firebase Firestore : toute la logique de données est désormais
 * gérée ici (SQLite) et exposée via une API REST sécurisée par jetons.
 *
 * Développement : `npm run dev` (serveur API :3001 + Vite :5173 avec proxy /api)
 * Production    : `npm run build` puis `npm start` (le serveur sert dist/ et l'API)
 */
import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

import authRoutes from './routes/auth.js';
import quizzesRoutes from './routes/quizzes.js';
import resultsRoutes from './routes/results.js';
import feedbackRoutes from './routes/feedback.js';
import uesRoutes from './routes/ues.js';
import adminRoutes from './routes/admin.js';
import settingsRoutes from './routes/settings.js';
import aiRoutes from './routes/ai.js';
import aiGenerationRoutes from './routes/aiGeneration.js';
import reviewRoutes from './routes/review.js';
import catalogRoutes from './routes/catalog.js';
import notificationsRoutes from './routes/notifications.js';
import pushRoutes from './routes/push.js';
import { initPush, startReminderScheduler } from './push.js';
import resourcesRoutes from './routes/resources.js';
import quizRequestsRoutes, { adminRouter as quizRequestsAdminRoutes } from './routes/quizRequests.js';
import exercisesRoutes from './routes/exercises.js';
import adminPreviewRoutes from './routes/adminPreview.js';
import { scheduleBackups } from './backup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// ── Routes API ────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/quizzes', quizzesRoutes);
app.use('/api/results', resultsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/ues', uesRoutes);
app.use('/api/admin/quiz-requests', quizRequestsAdminRoutes);
app.use('/api/admin/preview', adminPreviewRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/ai-generation', aiGenerationRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/catalog', catalogRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/push', pushRoutes);
app.use('/api/resources', resourcesRoutes);
app.use('/api/exercises', exercisesRoutes);
app.use('/api/quiz-requests', quizRequestsRoutes);
app.use('/api/admin/quiz-requests', quizRequestsAdminRoutes);

/**
 * Statistiques publiques de la plateforme (page d'accueil).
 * Aucune donnée personnelle : uniquement des compteurs agrégés.
 */
app.get('/api/stats', (_req, res) => {
  try {
    const students = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
    const quizzes = db.prepare('SELECT COUNT(*) AS c FROM quizzes').get().c;
    const ues = db.prepare('SELECT COUNT(*) AS c FROM ues').get().c;
    const upcoming = db.prepare(
      'SELECT COUNT(*) AS c FROM quizzes WHERE launchTime IS NOT NULL AND launchTime >= ?'
    ).get(Date.now()).c;
    const filieres = db.prepare(
      "SELECT COUNT(DISTINCT filiere) AS c FROM ues WHERE filiere IS NOT NULL AND filiere <> ''"
    ).get().c;
    const facultes = db.prepare('SELECT COUNT(*) AS c FROM facultes').get().c;

    res.json({ students, quizzes, ues, upcoming, filieres, facultes });
  } catch (err) {
    console.error('[api] Erreur statistiques :', err);
    res.status(500).json({ error: 'Impossible de charger les statistiques.' });
  }
});

// Version de l'APK disponible au téléchargement (pour le bandeau de mise à jour)
const releasePath = path.join(__dirname, '..', 'downloads', 'release.json');
app.get('/api/app-version', (_req, res) => {
  try {
    const release = JSON.parse(fs.readFileSync(releasePath, 'utf8'));
    res.setHeader('Cache-Control', 'no-cache');
    res.json(release);
  } catch {
    res.status(404).json({ error: 'Version indisponible.' });
  }
});

// 404 propre pour toute route API inconnue
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route API introuvable.' });
});

// ── Téléchargement de l'application Android ───────────────────────────
// L'APK est servi depuis downloads/ (hors public/ pour ne pas être embarqué
// dans les ressources web de l'application Android).
// Route explicite avant le statique pour forcer le type et le nom de fichier,
// ce qui déclenche bien le téléchargement depuis le navigateur mobile.
const apkPath = path.join(__dirname, '..', 'downloads', 'qcm-app.apk');
app.get('/download/apk', (_req, res) => {
  if (!fs.existsSync(apkPath)) {
    return res.status(404).json({ error: "L'application Android n'est pas disponible pour le moment." });
  }
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', 'attachment; filename="QCM App.apk"');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.sendFile(apkPath);
});

// ── Frontend statique (production) ─────────────────────────────────────
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  // Les fichiers de /assets ont des noms hachés : cache immutable sans risque.
  // La WebView Android les garde ainsi entre deux lancements de l'APK.
  app.use('/assets', express.static(path.join(distDir, 'assets'), {
    maxAge: '1y',
    immutable: true,
    index: false
  }));
  app.use(express.static(distDir, {
    maxAge: '1h',
    index: false,
    setHeaders(res, filePath) {
      if (path.basename(filePath) === 'index.html') res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  // SPA : toutes les autres requêtes GET renvoient index.html (routing React).
  // index.html doit toujours être revalidé pour récupérer les nouveaux hashes.
  app.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method) || req.path.startsWith('/api')) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

// ── Gestion des erreurs (JSON cohérent, jamais de stack HTML) ─────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[api] Erreur :', err);
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Corps de requête JSON invalide.' });
  }
  res.status(500).json({ error: 'Erreur interne du serveur.' });
});

// ── Nettoyage périodique ─────────────────────────────────────────────
// Supprime les sessions de présence obsolètes (participants partis sans DELETE,
// ex: onglet fermé brutalement) et les codes de réinitialisation de +24h.
setInterval(() => {
  try {
    const now = Date.now();
    db.prepare('DELETE FROM quiz_sessions WHERE lastSeen < ?').run(now - 5 * 60 * 1000);
    db.prepare('DELETE FROM password_resets WHERE expiresAt < ?').run(now - 24 * 60 * 60 * 1000);
    // Historique de quota IA de plus de 30 jours (les compteurs quotidiens n'en ont plus besoin)
    db.prepare('DELETE FROM ai_usage WHERE updatedAt < ?')
      .run(new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString());
  } catch (err) {
    console.warn('[cleanup] Échec du nettoyage périodique :', err.message);
  }
}, 60 * 1000).unref();

// ── Notifications push et rappels de QCM ──────────────────────────────
initPush().then(startReminderScheduler);

// ── Démarrage ─────────────────────────────────────────────────────────
if (!process.env.ADMIN_PASSWORD) {
  console.warn('[api] ⚠️  ADMIN_PASSWORD non défini dans .env · la connexion administrateur sera refusée.');
}
const hasAiKey = [
  'GROQ_API_KEYS', 'GROQ_API_KEY', 'GROQ_API_KEYS_EXTRA',
  'GROK_API_KEYS', 'GROK_API_KEY', 'XAI_API_KEYS', 'XAI_API_KEY',
  'GEMINI_API_KEYS', 'GEMINI_API_KEY',
  'DASHSCOPE_API_KEYS', 'DASHSCOPE_API_KEY', 'QWEN_API_KEYS', 'QWEN_API_KEY'
].some((name) => !!process.env[name]);
if (!hasAiKey) {
  console.warn('[api] ⚠️  Aucune clé IA configurée · le tuteur IA reste masqué dans l\'interface.');
}

app.listen(PORT, () => {
  console.log(`[api] Serveur QCM App démarré sur http://localhost:${PORT}`);
  if (fs.existsSync(distDir)) {
    console.log(`[api] Frontend de production servi depuis ${distDir}`);
  }
  scheduleBackups();
});
