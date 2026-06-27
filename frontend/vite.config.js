import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Env files live in the repo root (one .env shared by web + iOS builds), not
  // in frontend/. Without this, local `vite build` (the iOS bundle) couldn't see
  // VITE_GIPHY_API_KEY etc. and baked an empty key — Giphy then 401s.
  envDir: '..',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api':   'http://localhost:3001',
      '/media': 'http://localhost:3001',
    },
  },
});
