import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react(), cloudflare({ configPath: './wrangler.jsonc' })],
  // A literal, so production builds drop the demo backend (and PGlite) entirely.
  define: { 'import.meta.env.VITE_MOCK_API': JSON.stringify(process.env.VITE_MOCK_API ?? '') },
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) },
  },
  server: { port: 5173 },
  preview: { port: 4173 },
  // PGlite (demo backend) ships its own WASM and must not be pre-bundled.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  build: { chunkSizeWarningLimit: 1500 },
});
