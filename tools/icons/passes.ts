import { iconAlphabet, normalAlphabet, type IconDef, type WorldKind } from '../../packages/game/src/content-schema.ts';
import { materials, type Kind, type MatId } from './materials.ts';
import { SIZE as S, type Cell, type Icon } from './raster.ts';

/**
 * The tutorials' steps as passes over a drawn icon, in their order: cleanup of the silhouette, form shading from one
 * light (top left), secondary shadows where a part shades the one behind it, specular highlights by material, the cool
 * backlight on the shadow side's edge, small hue-shifted variation from the material's grain, painted details, a
 * cleanup of stray pixels, and last the coloured outline that takes the hue of what it borders.
 *
 * The same shapes also give the world sprite: albedo and grain only, the per-pixel normal and a material kind, so the
 * game lights items on the floor with the scene's own light (render/floor-items.ts).
 */
const L = (() => { const v = [-0.55, -0.65, 0.62], l = Math.hypot(...v); return v.map(c => c / l) as [number, number, number]; })();
/** Light passing through or bouncing back inside glass and gems, from the bottom right. */
const BACK = (() => { const v = [0.6, 0.65, 0.45], l = Math.hypot(...v); return v.map(c => c / l) as [number, number, number]; })();
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

function hash(x: number, y: number, s: number) { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x: number, y: number, s: number) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** The material's surface break-up in [-0.5, 0.5]: streaks along a part for wood, blotches for cloth, speckle for stone. */
function grainAt(c: Cell, x: number, y: number, seed: number) {
  const g = materials[c.mat].grain ?? 'none';
  if (g === 'none') return 0;
  const along = x * c.axis[0] + y * c.axis[1], across = -x * c.axis[1] + y * c.axis[0];
  if (g === 'wood') return vnoise(along * 0.22, across * 0.9, seed) - 0.5;
  if (g === 'cloth') return vnoise(x * 0.45, y * 0.45, seed) * 0.7 + hash(x, y, seed) * 0.3 - 0.5;
  if (g === 'fur') return vnoise(along * 0.5, across * 1.4, seed) * 0.6 + hash(x, y, seed) * 0.4 - 0.5;
  return hash(x, y, seed) - 0.5;
}
const shiny = (k: Kind) => k === 'metal' || k === 'gem' || k === 'glass' || k === 'liquid';
const ramp = (m: MatId) => materials[m].ramp;
const top = (m: MatId) => ramp(m).length - 1;

type Px = { tone: number; mat: MatId; colour?: string; keep?: boolean };

export function render(icon: Icon): IconDef {
  const cells = icon.cells.slice(), at = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? null : cells[y * S + x]);
  // 1. Silhouette cleanup: lone pixels go, pinholes fill.
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = at(x, y), around = N4.map(([dx, dy]) => at(x + dx, y + dy));
    if (c && around.every(n => !n)) cells[y * S + x] = null;
    else if (!c && around.every(n => n) && around.every(n => n!.part === around[0]!.part)) cells[y * S + x] = { ...around[0]! };
  }
  // 2. Form shading from the top-left light, broken by the material's grain.
  const px: (Px | null)[] = cells.map((c, i) => {
    if (!c) return null;
    const x = i % S, y = Math.floor(i / S), mat = materials[c.mat];
    const d = dot(c.n, L) + grainAt(c, x, y, icon.seed) * (mat.amount ?? 0) * 0.7;
    const tone = d < 0.05 ? 1 : d < 0.36 ? 2 : d < 0.7 ? 3 : d < 0.9 ? 4 : 5;
    // Fire is its own light: brightest at the heart of each tongue, not where an outside light would fall.
    return { tone: mat.kind === 'emissive' ? (c.n[2] > 0.82 ? 5 : c.n[2] > 0.55 ? 4 : 3) : tone, mat: c.mat };
  });
  // 3. Secondary shadow: a part in front shades the pixels of the part behind it below and right of it.
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = at(x, y), p = px[y * S + x];
    if (!c || !p || materials[c.mat].kind === 'emissive') continue;
    const casters = [at(x - 1, y - 1), at(x, y - 1), at(x - 1, y)];
    if (casters.some(q => q && q.part > c.part)) p.tone = Math.max(1, p.tone - 1);
    // A part drawn with `sep` gets a dark line on the parts behind it where they meet.
    if (N4.some(([dx, dy]) => { const q = at(x + dx, y + dy); return q && q.part > c.part && icon.sep.has(q.part); })) p.tone = 1;
  }
  // 4. Specular highlights by material: metal glints along its brightest facets; gems and glass take one bright glint
  // and a soft reflection of light coming back through them from the far side.
  const byPart = new Map<number, number[]>();
  cells.forEach((c, i) => { if (c) { const l = byPart.get(c.part) ?? []; l.push(i); byPart.set(c.part, l); } });
  for (const idx of byPart.values()) {
    const c0 = cells[idx[0]]!, kind = materials[c0.mat].kind;
    if (!shiny(kind) || idx.length < 3) continue;
    const order = [...idx].sort((a, b) => dot(cells[b]!.n, L) - dot(cells[a]!.n, L));
    const glints = kind === 'metal' ? order.filter(i => dot(cells[i]!.n, L) > 0.95).slice(0, Math.max(1, Math.round(idx.length / 9))) : order.slice(0, idx.length > 20 ? 2 : 1);
    if (!glints.length) glints.push(order[0]);
    for (const i of glints) { px[i]!.tone = top(c0.mat); px[i]!.keep = true; }
    if (kind !== 'metal') for (const i of idx) if (!px[i]!.keep && dot(cells[i]!.n, BACK) > 0.72) px[i]!.tone = Math.min(top(c0.mat) - 2, px[i]!.tone + 2);
  }
  // 5. Backlight: a cool rim on the shadow side's edge, where the shape turns away from the light.
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = at(x, y), p = px[y * S + x];
    if (!c || !p || p.keep || materials[c.mat].kind === 'emissive') continue;
    const open = !at(x + 1, y) || !at(x, y + 1) || !at(x + 1, y + 1);
    if (open && c.n[0] + c.n[1] > 0.45 && p.tone <= 2) { p.colour = materials[c.mat].rim; p.keep = true; }
  }
  // 6. Painted details.
  for (const m of icon.marks) {
    const p = px[m.y * S + m.x]; if (!p) continue;
    if (m.mat) p.mat = m.mat;
    p.tone = Math.max(0, Math.min(top(p.mat), m.tone ?? p.tone + (m.dt ?? 0)));
    p.colour = undefined; p.keep = true;
  }
  // 7. Cleanup: a pixel whose four neighbours of its own part all share another tone takes that tone.
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = px[y * S + x], c = at(x, y);
    if (!p || !c || p.keep) continue;
    const ns = N4.map(([dx, dy]) => ({ c: at(x + dx, y + dy), p: px[(y + dy) * S + x + dx] }));
    if (ns.every(n => n.c && n.c.part === c.part && n.p && !n.p.colour && n.p.tone === ns[0].p!.tone) && ns[0].p!.tone !== p.tone) p.tone = ns[0].p!.tone;
  }
  // 8. Coloured outline: the empty pixel beside a shape takes the darkest hue of what it borders, a step lighter on
  // the lit (top-left) side.
  const outline: (string | null)[] = Array(S * S).fill(null), outlineOf: (Cell | null)[] = Array(S * S).fill(null);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (at(x, y)) continue;
    let best: Cell | null = null, lit = false;
    for (const [dx, dy] of N4) { const q = at(x + dx, y + dy); if (q && (!best || q.part > best.part)) { best = q; lit = dx > 0 || dy > 0; } }
    if (!best) continue;
    const r = ramp(best.mat);
    outline[y * S + x] = materials[best.mat].kind === 'emissive' ? r[0] : r[lit ? 1 : 0];
    outlineOf[y * S + x] = best;
  }

  // HUD: painted colours into an indexed palette.
  const colours: string[] = [], rows: string[] = [];
  const index = (hex: string) => { let i = colours.indexOf(hex); if (i < 0) { colours.push(hex); i = colours.length - 1; } return iconAlphabet[i]; };
  for (let y = 0; y < S; y++) {
    let row = '';
    for (let x = 0; x < S; x++) {
      const i = y * S + x, p = px[i];
      row += p ? index(p.colour ?? ramp(p.mat)[p.tone]) : outline[i] ? index(outline[i]!) : '.';
    }
    rows.push(row);
  }
  if (colours.length > iconAlphabet.length) throw new Error(`${icon.name}: ${colours.length} colours, more than ${iconAlphabet.length}`);

  // World: albedo (the material's base, broken by its grain, details kept), the form's normal, the material's kind.
  const wPal: string[] = [], wKinds: WorldKind[] = [], wRows: string[] = [], nRows: string[] = [];
  const windex = (hex: string, kind: WorldKind) => { let i = wPal.findIndex((h, k) => h === hex && wKinds[k] === kind); if (i < 0) { wPal.push(hex); wKinds.push(kind); i = wPal.length - 1; } return iconAlphabet[i]; };
  for (let y = 0; y < S; y++) {
    let row = '', nrow = '';
    for (let x = 0; x < S; x++) {
      const i = y * S + x, c = cells[i], p = px[i];
      if (c && p) {
        const mark = icon.marks.find(m => m.x === x && m.y === y);
        const g = grainAt(c, x, y, icon.seed) * (materials[c.mat].amount ?? 0);
        // Form occlusion only, the same from every side: a surface turning away from the viewer at the silhouette is a
        // step darker, as figure bakes do; which side the light comes from is left to the scene.
        const occ = c.n[2] < 0.5 ? -1 : 0;
        const base = materials[p.mat].kind === 'emissive' ? p.tone : mark ? Math.min(4, Math.max(1, p.tone)) : (g > 0.12 ? 4 : g < -0.12 ? 2 : 3) + occ;
        row += windex(ramp(p.mat)[base], materials[p.mat].kind);
        nrow += packNormal(c.n);
      } else if (outlineOf[i]) {
        const q = outlineOf[i]!;
        row += windex(ramp(q.mat)[1], materials[q.mat].kind === 'emissive' ? 'emissive' : 'matte');
        nrow += packNormal(q.n);
      } else { row += '.'; nrow += '..'; }
    }
    wRows.push(row); nRows.push(nrow);
  }
  if (wPal.length > iconAlphabet.length) throw new Error(`${icon.name}: world palette has ${wPal.length} colours`);
  return { palette: colours, pixels: rows, world: { palette: wPal, kinds: wKinds, pixels: wRows, normals: nRows } };
}

/** A unit normal folded onto the octahedron, 6 bits an axis, as two characters. */
export function packNormal(n: readonly number[]) {
  let [x, y, z] = n; const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  x /= l; y /= l; z /= l;
  if (z < 0) { const fx = (1 - Math.abs(y)) * Math.sign(x || 1), fy = (1 - Math.abs(x)) * Math.sign(y || 1); x = fx; y = fy; }
  const q = (v: number) => normalAlphabet[Math.max(0, Math.min(63, Math.round((v * 0.5 + 0.5) * 63)))];
  return q(x) + q(y);
}
