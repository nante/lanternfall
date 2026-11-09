import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { resolve, sep } from 'node:path';
import { contentApi } from './server/content-api.ts';
import { accountsApi } from './server/accounts-api.ts';

const PORT = 4174;
const repo = fileURLToPath(new URL('../..', import.meta.url));
const content = resolve(repo, 'content');

function studio(): Plugin {
  return {
    name: 'lanternfall-studio',
    configureServer(server) {
      // content/ is outside the Studio root; watch it so outside edits (and the game's own files) raise the "changed on disk" notice.
      server.watcher.add(content);
      server.middlewares.use(accountsApi({ gameUrl: 'http://127.0.0.1:2567', tokenFile: resolve(repo, '.local/admin-token'), port: PORT }));
      server.middlewares.use(contentApi({ contentRoot: content, backupRoot: resolve(repo, '.local/studio-backups'), port: PORT }));
    },
    // Saving content must not reload the Studio and wipe unsaved drafts: tell the page instead.
    hotUpdate({ file, server }) {
      if (!resolve(file).startsWith(content + sep)) return;
      server.ws.send({ type: 'custom', event: 'studio:content-changed', data: { file: file.slice(content.length + 1) } });
      return [];
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [studio()],
  server: { host: '127.0.0.1', port: PORT, strictPort: true, fs: { allow: [repo] } },
  worker: { format: 'es' },
});
