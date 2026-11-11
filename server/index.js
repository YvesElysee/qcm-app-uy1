/**
 * Serveur API Node.js / Express — Portail QCM UY1
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
app.use('/api/admin', adminRoutes);
app.use('/api/settings', settingsRoutes);

// 404 propre pour toute route API inconnue
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Route API introuvable.' });
});

// ── Frontend statique (production) ─────────────────────────────────────
const distDir = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  // SPA : toutes les autres requêtes GET renvoient index.html (routing React)
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
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
  } catch (err) {
    console.warn('[cleanup] Échec du nettoyage périodique :', err.message);
  }
}, 60 * 1000).unref();

// ── Démarrage ─────────────────────────────────────────────────────────
if (!process.env.ADMIN_PASSWORD) {
  console.warn('[api] ⚠️  ADMIN_PASSWORD non défini dans .env — la connexion administrateur sera refusée.');
}

app.listen(PORT, () => {
  console.log(`[api] Serveur QCM UY1 démarré sur http://localhost:${PORT}`);
  if (fs.existsSync(distDir)) {
    console.log(`[api] Frontend de production servi depuis ${distDir}`);
  }
});
