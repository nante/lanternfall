import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repo = fileURLToPath(new URL('../..', import.meta.url));
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  base: './',
  // content/ lives outside the client root; watch it so new or deleted PNGs reach the import.meta.glob in texture-overrides.ts.
  plugins: [{ name: 'watch-content', configureServer(server) { server.watcher.add(resolve(repo, 'content')); } }],
  server: { host: '127.0.0.1', port: 4173, strictPort: true, fs: { allow: [repo] } },
  build: { outDir: '../../dist/client', emptyOutDir: true, chunkSizeWarningLimit: 900, target: 'es2022' },
});
