import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleSendResetCode, handleTestSmtp } from './server.js';

function smtpApiPlugin() {
  return {
    name: 'smtp-api-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === 'POST' && req.url === '/api/send-reset-code') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const result = await handleSendResetCode(data);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = result.success ? 200 : 400;
              res.end(JSON.stringify(result));
            } catch (err) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        if (req.method === 'POST' && req.url === '/api/test-smtp') {
          let body = '';
          req.on('data', chunk => { body += chunk; });
          req.on('end', async () => {
            try {
              const data = JSON.parse(body || '{}');
              const result = await handleTestSmtp(data);
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = result.success ? 200 : 400;
              res.end(JSON.stringify(result));
            } catch (err) {
              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 500;
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }

        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), smtpApiPlugin()],
});
