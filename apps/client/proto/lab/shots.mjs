// Capture the named lab shots in real time. Usage: node shots.mjs <out-dir> [name ...]
// Every shot is a lab link; open http://127.0.0.1:4173/proto/lab/?<query> to see it live.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const shots = {
  'noon-market': 'at=market&t=12&hunt=0',
  'golden-meadow': 'at=meadow&t=19.4',
  'blue-shrine': 'at=steps&t=21.3&hunt=0',
  'night-gate': 'at=gate&t=23&hunt=0',
  'night-undercroft-torch': 'at=undercroft&t=12&torch=1',
  'figures-meadow-dusk': 'tab=figures&at=meadow&t=19.4',
  'scenery-gate-golden': 'tab=scenery&at=gate&t=19.6&stop=scenery&hunt=0',
  'scenery-bridge-night': 'tab=scenery&at=bridge&t=1&stop=scenery&hunt=0',
  'scenery-meadow-dawn': 'tab=scenery&at=meadow&t=5.9&stop=scenery&hunt=0',
  'lookout-market-noon': 'tab=scenery&at=market&t=12&scenery=lookout&hunt=0',
  'dark-undercroft-none': 'tab=darkness&at=undercroft&t=12&hunt=0&torch=0&darkness=1&darktorch=0',
  'dark-meadow-none': 'tab=darkness&at=meadow&t=1&hunt=0&torch=0&darkness=1&darktorch=0',
  'scenery-bridge-noon': 'tab=scenery&at=bridge&t=12&stop=scenery&hunt=0',
  'scenery-steps-blue': 'tab=scenery&at=steps&t=21.4&stop=scenery&hunt=0',
  'noon-meadow': 'at=meadow&t=12&hunt=0',
  'scenery-bridge-golden': 'tab=scenery&at=bridge&t=19.6&stop=scenery&hunt=0',
  'scenery-market-golden': 'tab=scenery&at=market&t=19.6&stop=scenery&hunt=0',
  'scenery-wood-noon': 'tab=scenery&at=wood&t=12&stop=scenery&hunt=0',
  'scenery-chapel-golden': 'tab=scenery&at=chapel&t=19.6&stop=scenery&hunt=0',
  'wood-play-noon': 'at=wood&t=12&hunt=0',
  'spire-play-noon': 'at=spire&t=12&hunt=0',
  'spire-play-night': 'at=spire&t=23&hunt=0',
};
const [out = '.', ...names] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const name of names.length ? names : Object.keys(shots)) {
  const file = join(out, `${name}.png`);
  execFileSync('node', [new URL('./eval.mjs', import.meta.url).pathname, shots[name], `shot:${file}`, '11000', '1200', '700'], { stdio: 'inherit' });
}
