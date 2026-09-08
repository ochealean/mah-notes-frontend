import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import downloadHandler from './api/download.js';

// `vercel dev` isn't in the loop for `npm run dev`, so /api/download would 404
// locally and the Download button couldn't be tested on a real phone. Mount the
// very same handler as dev middleware — one implementation, so what you test
// over the LAN is what ships.
function apiRoutes() {
  return {
    name: 'api-routes-dev',
    configureServer(server) {
      server.middlewares.use('/api/download', (req, res) => downloadHandler(req, res));
    },
  };
}

// Vite dev server on :5173 (must match backend CLIENT_ORIGIN).
export default defineConfig({
  plugins: [react(), apiRoutes()],
  server: { port: 5173 },
});
