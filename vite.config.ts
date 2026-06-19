import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite dev server on :5173 (must match backend CLIENT_ORIGIN).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
