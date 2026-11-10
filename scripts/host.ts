// `npm run host`: build the client for same-origin play, then run the world server on all interfaces serving it.
import { execFileSync, spawn } from 'node:child_process';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

const repo = resolve(import.meta.dirname, '..');
const port = process.env.PORT ?? '2567';
const out = resolve(repo, 'dist/host');

execFileSync('npx', ['vite', 'build', '--config', 'apps/client/vite.config.ts', '--outDir', out, '--logLevel', 'warn'], {
  cwd: repo, stdio: 'inherit', env: { ...process.env, VITE_WORLD_URL: 'same-origin' },
});

const ips = Object.values(networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a!.address);
let tailscale = ips.find(ip => ip.startsWith('100.'));
if (!tailscale) try { tailscale = execFileSync('tailscale', ['ip', '-4'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n')[0]; } catch {}

const world = spawn('npx', ['tsx', 'apps/server/src/index.ts'], {
  cwd: repo, stdio: ['ignore', 'pipe', 'inherit'],
  env: { ...process.env, PORT: port, LANTERNFALL_HOST: '0.0.0.0', LANTERNFALL_STATIC: out },
});
world.stdout.on('data', (chunk: Buffer) => {
  process.stdout.write(chunk);
  if (!chunk.toString().includes('world_ready')) return;
  console.log(`\nLanternfall is hosted. Share one of these:`);
  console.log(`  this Mac:   http://127.0.0.1:${port}`);
  for (const ip of ips.filter(ip => ip !== tailscale)) console.log(`  same Wi-Fi: http://${ip}:${port}`);
  if (tailscale) console.log(`  Tailscale:  http://${tailscale}:${port}`);
  console.log(`Press Ctrl+C to stop.\n`);
});
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => world.kill(sig));
world.on('exit', code => process.exit(code ?? 0));
