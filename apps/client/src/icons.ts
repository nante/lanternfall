import iconsJson from '../../../content/icons.json' with { type: 'json' };
import { Icons, missingIcons } from '../../../packages/game/src/content-schema.ts';
import { iconSvg } from '../../../packages/game/src/icon-svg.ts';
import { defaultBalance } from '../../../packages/game/src/default-balance.ts';

const parsed = Icons.safeParse(iconsJson);
if (!parsed.success) throw new Error(`content/icons.json is invalid: ${parsed.error.message}`);
const icons = parsed.data;
const missing = missingIcons(defaultBalance, icons);
if (missing.length) throw new Error(`content/icons.json is missing icons the game needs: ${missing.join(', ')}`);

export function icon(kind: string, label?: string) {
  return iconSvg(icons[kind] ?? icons.bag, label);
}

const canvases = new Map<string, HTMLCanvasElement>();
/** The icon as a 16×16 canvas, for drawing items lying in the world. */
export function iconCanvas(kind: string) {
  let c = canvases.get(kind);
  if (c) return c;
  const def = icons[kind] ?? icons.bag;
  c = document.createElement('canvas'); c.width = c.height = 16;
  const g = c.getContext('2d')!;
  def.pixels.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.') return; g.fillStyle = def.palette['123456789abcdefghijklmnopqrstuvwxyz'.indexOf(ch)]; g.fillRect(x, y, 1, 1); }));
  canvases.set(kind, c);
  return c;
}
