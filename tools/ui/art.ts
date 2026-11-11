// The HUD's pixel art: masks (one-colour glyphs tinted by CSS), status and window icons, banner ends, plank parts and
// ground patterns, drawn on a grid in the game's palette and written as SVG data URIs to apps/client/src/hud/art.css.
// SVG rects on whole units stay crisp at any whole-number UI scale. Run: npx tsx tools/ui/art.ts
import { writeFileSync } from 'node:fs';

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
  return `url("data:image/svg+xml,${`<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' viewBox='0 0 ${w} ${h}' shape-rendering='crispEdges'>${rects}</svg>`.replace(/[<>#%"]/g, encodeURIComponent)}")`;
}

const art: Record<string, string[]> = {};
const sizes: Record<string, [number, number]> = {};
const put = (name: string, a: string[]) => { art[name] = a; sizes[name] = [Math.max(...a.map(r => r.length)), a.length]; };

// ---------------------------------------------------------------- masks: '#' is ink, tinted with currentColor
put('close', rows(`
#...#
.#.#.
..#..
.#.#.
#...#`));
put('chev-up', rows(`
.....
..#..
.#.#.
#...#
.....`));
put('chev-down', rows(`
.....
#...#
.#.#.
..#..
.....`));
put('back', rows(`
..#..
.#...
#####
.#...
..#..`));
put('plus', rows(`
..#..
..#..
#####
..#..
..#..`));
put('minus', rows(`
.....
.....
#####
.....
.....`));
put('arrow-down', rows(`
..#..
..#..
#.#.#
.###.
..#..`));
put('check', rows(`
....#
...#.
#.#..
.#...
.....`));

// ---------------------------------------------------------------- fight controls beside the doll (masks, 9×9)
put('m-attack', rows(`
.......##
......###
.....###.
....###..
.#.###...
..###....
..##.....
.#..#....
#........`));
put('m-balance', rows(`
......##.
.....##..
####.#...
#..##....
#..##....
#..#.#...
.#..#....
..##.....
.........`));
put('m-defend', rows(`
#########
#.......#
#.#####.#
#.#####.#
#.#####.#
.#.###.#.
..#.#.#..
...#.#...
....#....`));
put('m-chase', rows(`
....#....
.....#...
######.#.
.......##
######.#.
.....#...
....#....
.........
.........`));
put('m-stand', rows(`
.#######.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#.....#.
.#######.
.........
#########`));
put('m-options', rows(`
...#.#...
.#.###.#.
..#####..
.##...##.
###...###
.##...##.
..#####..
.#.###.#.
...#.#...`));
put('m-logout', rows(`
#####....
#...#....
#...#..#.
#...#...#
#.#.#####
#...#...#
#...#..#.
#...#....
#####....`));

// ---------------------------------------------------------------- status icons (9×9, coloured)
put('st-combat', rows(`
L.......L
bL.....Lb
.bL...Lb.
..bL.Lb..
...bLb...
..7b.b7..
.7.7.7.7.
7.....7..
.........`));
put('st-hungry', rows(`
.........
....BB...
...BbbB..
..B7777B.
.B777777B
.8777776.
..866665.
...5555..
.........`));
put('st-protected', rows(`
.kkkkkkk.
kQQQQQQQk
kQQpppQQk
kQQpPpQQk
kQQpppQQk
.kQQQQQk.
..kQQQk..
...kQk...
....k....`));
put('st-torch', rows(`
....y....
...yY....
...yYy...
..oyYyo..
..ooyoo..
...rOr...
....6....
....5....
....5....`));

// ---------------------------------------------------------------- window icons (9×9, coloured)
put('w-map', rows(`
.........
.88.888..
8778777.8
87h87hh78
8h7877h78
87hh8777.
.888.888.
.........
.........`));
put('w-status', rows(`
.........
.XX...XX.
XzzX.XzzX
XzYzXzzzX
XzzzzzzzX
.XzzzzzX.
..XzzzX..
...XzX...
....X....`));
put('w-battle', rows(`
...BBB...
..BBBBB..
.BkBBBkB.
.BkkBkkB.
.BBBBBBB.
..BBkBB..
..B.B.B..
.........
.........`));
put('w-skills', rows(`
....y....
....y....
...yYy...
yyyYYYyyy
.yyYYYyy.
..yYyYy..
..yy.yy..
.yy...yy.
.........`));
put('w-journal', rows(`
.888888..
8777777..
.8BBBB7..
.8BkkB7..
.8BBBB7..
.8BkkB7..
.8BBBB78.
..8888887
.........`));
put('w-pack', rows(`
...666...
..6...6..
.6777776.
6777777776
.67766776
.67766776
.67777776
..666666.
.........`));
put('w-bag', rows(`
...7.7...
....7....
...777...
..77777..
.7787777.
.7777787.
.7777777.
..77777..
.........`));
put('w-body', rows(`
.........
..CCCC...
.CbbbbC..
.CbkbkC..
..CbbCC..
...CbC...
.CbCbCbC.
.C.C.C.C.
.........`));
put('w-pile', rows(`
.........
.........
....c....
...cCc...
..cCCcc..
.cCcccCc.
cccCcccCc
.........
.........`));
put('w-vault', rows(`
.........
.6666666.
6777777776
6555y55556
6777777776
6777777776
6666666666
.........
.........`));

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

const masks = new Set(['m-attack', 'm-balance', 'm-defend', 'm-chase', 'm-stand', 'm-options', 'm-logout', 'close', 'chev-up', 'chev-down', 'back', 'plus', 'minus', 'arrow-down', 'check']);
const lines = ['/* Generated by tools/ui/art.ts. Do not edit; change the drawing there and rerun it. */', ':root {'];
for (const [name, a] of Object.entries(art)) lines.push(`  --a-${name}: ${svg(a)};`);
lines.push('}');
// Masks are tinted with the text colour; the rest are drawn in their own colours. Sizes are in UI pixels.
for (const name of Object.keys(art)) {
  const [w, h] = sizes[name];
  lines.push(masks.has(name) ? `.g-${name} { --w: ${w}; --h: ${h}; -webkit-mask-image: var(--a-${name}); mask-image: var(--a-${name}); }` : `.a-${name} { --w: ${w}; --h: ${h}; background-image: var(--a-${name}); }`);
}
lines.push('');
writeFileSync(new URL('../../apps/client/src/hud/art.css', import.meta.url), lines.join('\n'));
console.log(`art.css: ${Object.keys(art).length} pieces`);
