// The HUD's pixel art: icons (Pixelarticons, one-colour masks tinted by CSS), banner ends, plank parts and
// ground patterns, drawn on a grid in the game's palette and written as SVG data URIs to apps/client/src/hud/art.css.
// SVG rects on whole units stay crisp at any whole-number UI scale. Run: npx tsx tools/ui/art.ts
import { readFileSync, writeFileSync } from 'node:fs';

const P: Record<string, string> = {
  k: '#06070d', n: '#0c0f1e', m: '#141a31', s: '#1e2646', S: '#2b365d', t: '#3c4a78', l: '#55627a', L: '#7a879c',
  b: '#d6ccb2', B: '#ece2c8', W: '#fbf4e2',
  '1': '#2c1f15', '2': '#3b2819', '3': '#4d3422', '4': '#5a3d27', '5': '#6b4a30', '6': '#7b5737', '7': '#a07a4e', '8': '#c4a072',
  r: '#93391a', o: '#c95a24', O: '#ec8a35', y: '#ffb95e', Y: '#ffe2a0',
  x: '#6a2621', X: '#963c30', z: '#bd6447',
  q: '#17605e', Q: '#2c9a8e', p: '#5fd7c4', '#': '#ffffff',
  g: '#335631', G: '#678d43', h: '#90ab55', c: '#6f6a63', C: '#aaa395',
};
const rows = (s: string) => s.trim().split('\n').map(r => r.trim());

function svg(art: string[]) {
  const w = Math.max(...art.map(r => r.length)), h = art.length;
  let rects = '';
  art.forEach((row, y) => {
    for (let x = 0; x < row.length;) {
      const ch = row[x]; let n = 1;
      while (row[x + n] === ch) n++;
      if (ch !== '.' && ch !== ' ') rects += `<rect x='${x}' y='${y}' width='${n}' height='1' fill='${P[ch] ?? '#ff00ff'}'/>`;
      x += n;
    }
  });
  return `url("data:image/svg+xml,${`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' preserveAspectRatio='none' shape-rendering='crispEdges'>${rects}</svg>`.replace(/[<>#%"]/g, encodeURIComponent)}")`;
}

const art: Record<string, string[]> = {};
const sizes: Record<string, [number, number]> = {};
const put = (name: string, a: string[]) => { art[name] = a; sizes[name] = [Math.max(...a.map(r => r.length)), a.length]; };

// ---------------------------------------------------------------- icons: Pixelarticons (MIT, pixelarticons.com)
// Each icon is drawn on a 24-unit grid in 2-unit strokes that may start on any unit. It is rasterised on that grid and
// kept in its whole frame, where the set balances its icons by eye, so every icon is the same 12 UI pixels and centres
// the same way. Drawn at half a UI pixel per unit: crisp whenever the UI pixel is an even number of device pixels, as it
// is on most HiDPI screens. All icons are one-colour masks.
const icons: Record<string, string> = {
  close: 'close', 'chev-up': 'chevron-up', 'chev-down': 'chevron-down', back: 'arrow-left', plus: 'plus', minus: 'minus',
  'arrow-down': 'arrow-down', check: 'check',
  'm-attack': 'sword', 'm-balance': 'chevrons-horizontal', 'm-defend': 'shield', 'm-chase': 'arrow-right', 'm-stand': 'anchor',
  'm-options': 'settings-cog', 'm-logout': 'logout',
  'st-combat': 'sword', 'st-hungry': 'apple', 'st-protected': 'shield', 'st-torch': 'fire',
  'w-map': 'map', 'w-status': 'human', 'w-battle': 'target', 'w-skills': 'trending-up', 'w-journal': 'book-open',
  'w-pack': 'backpack', 'w-bag': 'handbag', 'w-body': 'skull', 'w-pile': 'archive', 'w-vault': 'lock',
};

/** The closed outlines of an SVG path made only of straight moves (M L H V Z, absolute or relative). */
function outlines(d: string) {
  const loops: [number, number][][] = [];
  let x = 0, y = 0, loop: [number, number][] = [];
  const toks = d.match(/[a-zA-Z]|-?\d*\.?\d+/g)!;
  let cmd = '';
  for (let i = 0; i < toks.length;) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const n = () => Number(toks[i++]);
    switch (cmd) {
      case 'M': if (loop.length) loops.push(loop); x = n(); y = n(); loop = [[x, y]]; cmd = 'L'; break;
      case 'm': if (loop.length) loops.push(loop); x += n(); y += n(); loop = [[x, y]]; cmd = 'l'; break;
      case 'L': x = n(); y = n(); loop.push([x, y]); break;
      case 'l': x += n(); y += n(); loop.push([x, y]); break;
      case 'H': x = n(); loop.push([x, y]); break;
      case 'h': x += n(); loop.push([x, y]); break;
      case 'V': y = n(); loop.push([x, y]); break;
      case 'v': y += n(); loop.push([x, y]); break;
      case 'Z': case 'z': if (loop.length) { loops.push(loop); [x, y] = loop[0]; loop = [[x, y]]; } break;
      default: throw new Error(`pixelarticons: path command ${cmd} is not a straight move`);
    }
  }
  if (loop.length > 1) loops.push(loop);
  return loops;
}
/** Non-zero winding: is the point inside the filled path? */
function inside(loops: [number, number][][], px: number, py: number) {
  let wind = 0;
  for (const l of loops) for (let i = 0; i < l.length; i++) {
    const [x1, y1] = l[i], [x2, y2] = l[(i + 1) % l.length];
    if (y1 <= py ? y2 > py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) > 0 : y2 <= py && (x2 - x1) * (py - y1) - (px - x1) * (y2 - y1) < 0) wind += y1 <= py ? 1 : -1;
  }
  return wind !== 0;
}
function pixelarticon(name: string): string[] {
  const src = readFileSync(new URL(`../../node_modules/pixelarticons/svg/${name}.svg`, import.meta.url), 'utf8');
  const loops = [...src.matchAll(/ d="([^"]+)"/g)].flatMap(m => outlines(m[1]));
  return Array.from({ length: 24 }, (_, y) => Array.from({ length: 24 }, (_, x) => (inside(loops, x + 0.5, y + 0.5) ? '#' : '.')).join(''));
}
for (const [name, src] of Object.entries(icons)) { put(name, pixelarticon(src)); sizes[name] = [sizes[name][0] / 2, sizes[name][1] / 2]; }


// ---------------------------------------------------------------- banner ends: dark slate cloth with torn ends (14 tall)
const bannerRows = ['k', 't', 'S', 'S', 's', 's', 's', 's', 's', 's', 's', 's', 'm', 'k'];
const indents = [5, 3, 2, 0, 1, 3, 1, 0, 2, 4, 1, 0, 2, 5];
const streak = [false, false, true, false, false, true, false, false, true, false, false, false, false, false];
const bannerLeft = bannerRows.map((c, r) => { const i = indents[r]; let row = '.'.repeat(i) + 'k'; for (let x = i + 1; x < 8; x++) row += streak[r] && x === i + 1 ? 't' : c; return row; });
put('banner-l', bannerLeft);
put('banner-r', bannerLeft.map(r => [...r].reverse().join('')));
put('banner-mid', bannerRows);

// ---------------------------------------------------------------- plank: warm wood, grain, nail heads (18 tall)
const plankRows = ['k', '7', '6', '6', '5', '6', '6', '5', '5', '6', '5', '5', '4', '5', '4', '4', '3', 'k'];
const grain = (x: number, r: number) => ((x * 7 + r * 13) % 23 === 0 ? '4' : (x * 5 + r * 3) % 31 === 0 ? '7' : null);
put('plank-mid', plankRows.map((c, r) => Array.from({ length: 32 }, (_, x) => (r === 0 || r === 17 ? c : grain(x, r) ?? c)).join('')));
const plankEnd = plankRows.map((c, r) => {
  const cut = [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 3][r];
  let row = '.'.repeat(cut) + 'k';
  for (let x = cut + 1; x < 8; x++) row += r === 0 || r === 17 ? 'k' : x === cut + 1 ? '3' : c;
  return row;
});
for (const [y, x] of [[4, 4], [13, 4]]) plankEnd[y] = plankEnd[y].slice(0, x) + 'L' + plankEnd[y].slice(x + 1), plankEnd[y + 1] = plankEnd[y + 1].slice(0, x) + 'n' + plankEnd[y + 1].slice(x + 1);
put('plank-l', plankEnd);
put('plank-r', plankEnd.map(r => [...r].reverse().join('')));

// ---------------------------------------------------------------- grounds
put('ground-panel', ['Ssss', 'ssss', 'ssss', 'ssss']);
put('ground-column', ['mnnn', 'nnnn', 'nnnn', 'nnnn']);
put('dither-dark', ['k.', '.k']);
put('dither-amber', ['O.', '..']);
put('glass-panel', ['mm', 'm.']);

const lines = ['/* Generated by tools/ui/art.ts. Do not edit; change the drawing there and rerun it. Icons: Pixelarticons (MIT). */', ':root {'];
for (const [name, a] of Object.entries(art)) lines.push(`  --a-${name}: ${svg(a)};`);
lines.push('}');
// Icons are masks tinted with the text colour, as .g- (glyph) and .a- (art) alike; the rest are drawn in their own
// colours. Sizes are in UI pixels.
for (const name of Object.keys(art)) {
  const [w, h] = sizes[name];
  lines.push(name in icons
    ? `.g-${name}, .a-${name} { --w: ${w}; --h: ${h}; background: currentColor; -webkit-mask: var(--a-${name}) 0 0 / 100% 100% no-repeat; mask: var(--a-${name}) 0 0 / 100% 100% no-repeat; }`
    : `.a-${name} { --w: ${w}; --h: ${h}; background-image: var(--a-${name}); }`);
}
lines.push('');
writeFileSync(new URL('../../apps/client/src/hud/art.css', import.meta.url), lines.join('\n'));
console.log(`art.css: ${Object.keys(art).length} pieces`);
