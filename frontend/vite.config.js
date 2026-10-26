import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En desarrollo, /api (incluido el flujo SSE /api/eventos) se redirige al backend Express.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' },
  },
});
