import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Standalone admin SPA (see MERGE_PLAN.md Phase 3). In dev it proxies /api and
// /uploads to web_hub/server (PORT=4000, see server/.env.example). In
// production it is built to dist/ and served by that same Express process
// (ADMIN_DIST_PATH) so admin and API share one origin — no CORS needed there.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5176,
    proxy: {
      '/api': 'http://localhost:4000',
      '/uploads': 'http://localhost:4000',
    },
  },
});
