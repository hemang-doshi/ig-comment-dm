import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Built into web/dist/app-static and served by the Worker as static assets
// under /app-static/. The HTML shell is served at /a/<secret>/app by the
// Worker, which writes the admin base into %ADMIN_BASE%.
export default defineConfig({
  base: '/app-static/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    outDir: 'dist/app-static',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
  server: {
    // npm run dev in web/ talks to a local `wrangler dev` on :8787.
    proxy: { '/a/': 'http://localhost:8787' },
  },
});
