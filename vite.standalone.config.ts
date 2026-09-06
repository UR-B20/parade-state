/**
 * Builds the client alone against the in-memory demo API as one self-contained HTML file
 * (scripts, styles and fonts inlined) for design review. Not used in production.
 */
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

function inlineEverything(): Plugin {
  return {
    name: 'inline-everything',
    enforce: 'post',
    generateBundle(_opts, bundle) {
      const html = Object.values(bundle).find((f) => f.type === 'asset' && f.fileName.endsWith('.html'));
      if (!html || html.type !== 'asset') return;
      let source = String(html.source);
      for (const [name, file] of Object.entries(bundle)) {
        if (file === html) continue;
        if (file.type === 'chunk') {
          source = source.replace(new RegExp(`<script[^>]*src="[./]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*></script>`), () => `<script type="module">${file.code.replace(/<\/script>/g, '<\\/script>')}</script>`);
          delete bundle[name];
        } else if (file.type === 'asset' && name.endsWith('.css')) {
          let css = String(file.source);
          css = css.replace(/url\(\/fonts\/([^)]+)\)/g, (_m, f: string) => {
            const b64 = readFileSync(fileURLToPath(new URL(`./public/fonts/${f}`, import.meta.url))).toString('base64');
            return `url(data:font/woff2;base64,${b64})`;
          });
          source = source.replace(new RegExp(`<link[^>]*href="[./]*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`), () => `<style>${css}</style>`);
          delete bundle[name];
        }
      }
      source = source.replace(/<link rel="(manifest|icon|apple-touch-icon|preload)"[^>]*>\s*/g, '');
      // Emit a body fragment (title, styles, root, script) so a host page can wrap it.
      const title = /<title>[^<]*<\/title>/.exec(source)?.[0] ?? '<title>SoldierTrack</title>';
      const styles = [...source.matchAll(/<style>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
      const scripts = [...source.matchAll(/<script type="module">[\s\S]*?<\/script>/g)].map((m) => m[0]).join('\n');
      html.source = `${title}\n${styles}\n<div id="root"></div>\n${scripts}\n`;
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), inlineEverything()],
  define: { 'import.meta.env.VITE_MOCK_API': '"1"', 'import.meta.env.VITE_HASH_ROUTER': '"1"' },
  resolve: { alias: { '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)) } },
  build: {
    outDir: 'dist-standalone',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
