import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // En développement, toutes les requêtes /api sont transmises au serveur
    // Express (server/index.js) qui écoute sur le port 3001.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      },
      // Téléchargement de l'APK : le fichier est servi par Express en prod,
      // on le proxie aussi en développement pour que le lien fonctionne partout.
      '/download': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  }
});
