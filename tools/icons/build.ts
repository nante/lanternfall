// Regenerates content/icons.json and a contact sheet from the drawing programs in art/.
// Usage: npm run icons [-- sheet.png]   (DRY=1 writes only the sheet)
import { writeFileSync } from 'node:fs';
import { Icons, type IconDef } from '../../packages/game/src/content-schema.ts';
import { Icon, SIZE } from './raster.ts';
import { render } from './passes.ts';
import { art } from './art/index.ts';
import { contactSheet } from './sheet.ts';

const out = process.argv[2] ?? 'docs/visuals/items-sheet.png';
const seed = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261) % 9973;
const icons: Record<string, IconDef> = {};
for (const [name, draw] of Object.entries(art)) {
  const icon = draw(new Icon(name, seed(name)));
  // A shape on the border row has no room for its outline there.
  const edge = icon.cells.filter((c, i) => c && (i % SIZE === 0 || i % SIZE === SIZE - 1 || i < SIZE || i >= SIZE * (SIZE - 1))).length;
  if (edge) console.warn(`${name}: ${edge} pixels touch the border`);
  icons[name] = render(icon);
}
const parsed = Icons.parse(icons);
const json = JSON.stringify(parsed, null, 1);
if (!process.env.DRY) writeFileSync('content/icons.json', json + '\n');
writeFileSync(out, contactSheet(Object.entries(parsed)));
console.log(`${Object.keys(parsed).length} icons; sheet ${out}; json ${(json.length / 1024).toFixed(0)} KB`);
