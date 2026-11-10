// Ground art, 32 texels per world tile. Each kind is a 64×64 tile covering 2×2 world tiles and must wrap seamlessly.
// Painted in clusters with 3–4 tones from the palette ramps: quiet surfaces, a few deliberate details.
import { ramps } from './palette.ts';

export const GS = 64;
type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

class Tile {
  readonly data = new Uint8ClampedArray(GS * GS * 4);
  private seed: number;
  constructor(seed: number) { this.seed = seed; }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
  int(n: number) { return Math.floor(this.rnd() * n); }
  set(x: number, y: number, c: RGB) { x = ((x % GS) + GS) % GS; y = ((y % GS) + GS) % GS; const i = (y * GS + x) * 4; this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = 255; }
  get(x: number, y: number): RGB { x = ((x % GS) + GS) % GS; y = ((y % GS) + GS) % GS; const i = (y * GS + x) * 4; return [this.data[i], this.data[i + 1], this.data[i + 2]]; }
}

/** Tileable value noise with period GS, sampled on a lattice of `cells` per tile. */
function noiseField(seed: number, cells: number) {
  const h = (x: number, y: number) => { const s = Math.sin(((x % cells) + cells) % cells * 127.1 + (((y % cells) + cells) % cells) * 311.7 + seed * 74.7) * 43758.5453; return s - Math.floor(s); };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const fx = (x / GS) * cells, fy = (y / GS) * cells, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy);
    const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
    return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
  };
}
/** Two octaves of noise, quantized to tones with an ordered threshold so cluster edges break up in pixel steps. */
function clusters(t: Tile, tones: RGB[], seed: number, cells = 4, bias = 0) {
  const n1 = noiseField(seed, cells), n2 = noiseField(seed + 9, cells * 4);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let y = 0; y < GS; y++) for (let x = 0; x < GS; x++) {
    const v = n1(x, y) * 0.75 + n2(x, y) * 0.25 + bias + (bayer[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * 0.09;
    t.set(x, y, tones[Math.max(0, Math.min(tones.length - 1, Math.floor(v * tones.length)))]);
  }
}

const RR = Object.fromEntries(Object.entries(ramps).map(([k, v]) => [k, v.map(hex)])) as Record<keyof typeof ramps, RGB[]>;
// Seven-step views of the long ramps, so the painting code below reads in simple dark-to-light steps.
const R = { ...RR, moss: [1, 3, 5, 7, 9, 10, 11].map(i => RR.moss[i]), earth: [0, 2, 4, 6, 7, 8].map(i => RR.earth[i]) };

function grass(t: Tile, long: boolean) {
  // Olive-leaning greens, after the forest and field references: golden light warms them instead of making them glare.
  // A hue-shifted ramp: shade leans cool blue-green, light leans warm yellow-green (the references' signature), in
  // tighter clusters so the field reads as grass, not as camouflage.
  const cool: RGB = [57, 79, 53], warm: RGB = [146, 146, 73];
  const base = long ? [cool, RR.moss[6], RR.moss[7], RR.olive[2], RR.moss[8], RR.olive[3]] : [RR.moss[7], RR.moss[8], RR.olive[2], RR.moss[9], RR.olive[3], warm];
  clusters(t, base, long ? 3 : 1, 8);
  // Sun-caught blades: short warm strokes scattered over the clusters.
  for (let i = 0; i < (long ? 60 : 44); i++) { const x = t.int(GS), y = t.int(GS); t.set(x, y, long ? RR.olive[3] : warm); if (t.rnd() > 0.5) t.set(x, y - 1, long ? RR.olive[3] : warm); }
  // Tufts: small inverted-V clumps, dark root and a lit tip, leaning with the wind.
  const tufts = long ? 34 : 18;
  for (let i = 0; i < tufts; i++) {
    const x = t.int(GS), y = t.int(GS), lean = t.rnd() > 0.5 ? 1 : 0, tall = long ? 3 + t.int(3) : 2 + t.int(2);
    for (let k = 0; k < tall; k++) {
      const c = k === tall - 1 ? (long ? RR.olive[4] : RR.moss[11]) : k === 0 ? RR.moss[6] : RR.moss[10];
      t.set(x - 1 + (k > tall / 2 ? lean : 0), y - k, c);
      if (k < tall - 1) t.set(x + 1 + (k > tall / 2 ? lean : 0), y - k, k === 0 ? RR.moss[7] : RR.olive[3]);
    }
  }
  if (!long) for (let i = 0; i < 3; i++) { const x = t.int(GS), y = t.int(GS); t.set(x, y, R.bone[1]); t.set(x + 1, y, R.fire[5]); }
  else for (let i = 0; i < 4; i++) { const x = t.int(GS), y = t.int(GS); const c = [R.dusk[3], R.fire[5], R.bone[1]][i % 3]; t.set(x, y, c); t.set(x, y + 1, R.moss[1]); }
}

function dirt(t: Tile) {
  clusters(t, [RR.soil[2], RR.soil[3], RR.soil[3], RR.soil[4]], 5, 4);
  for (let i = 0; i < 14; i++) { const x = t.int(GS), y = t.int(GS); t.set(x, y, RR.soil[5]); t.set(x + 1, y, RR.soil[4]); t.set(x, y + 1, RR.soil[1]); t.set(x + 1, y + 1, RR.soil[2]); }
  for (let i = 0; i < 2; i++) { let x = t.int(GS); const y = t.int(GS); for (let k = 0; k < 18; k++) { t.set(x, y + (k % 7 === 0 ? 1 : 0), RR.soil[1]); x++; } }
}

function sand(t: Tile) {
  clusters(t, [R.earth[4], R.earth[5], R.earth[5], RR.soil[5]], 7, 3);
  for (let y = 3; y < GS; y += 8) for (let x = 0; x < GS; x++) if (((x + y * 3) % 13) < 7) t.set(x, y + Math.round(Math.sin((x + y) * 0.3)), R.earth[4]);
}

/** Rounded stones on a dark bed: lit top-left rim, shaded bottom-right rim, Voronoi cells that wrap. */
function stones(t: Tile, n: number, tones: RGB[], bed: RGB, gap: number) {
  const pts: [number, number, RGB][] = [];
  for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) pts.push([(gx + 0.25 + t.rnd() * 0.5) * GS / n, (gy + 0.25 + t.rnd() * 0.5) * GS / n, tones[1 + t.int(tones.length - 2)]]);
  for (let y = 0; y < GS; y++) for (let x = 0; x < GS; x++) {
    let d1 = 1e9, d2 = 1e9, c = tones[1], dx1 = 0, dy1 = 0;
    for (const [px, py, pc] of pts) for (const ox of [-GS, 0, GS]) for (const oy of [-GS, 0, GS]) {
      const dx = x - px - ox, dy = y - py - oy, d = Math.hypot(dx, dy);
      if (d < d1) { d2 = d1; d1 = d; c = pc; dx1 = dx; dy1 = dy; } else if (d < d2) d2 = d;
    }
    const edge = d2 - d1;
    if (edge < gap) t.set(x, y, bed);
    else if (edge < gap + 1.6 && dx1 + dy1 < 0) t.set(x, y, tones[tones.length - 1]);
    else if (edge < gap + 1.6) t.set(x, y, tones[0]);
    else t.set(x, y, c);
  }
}

function plank(t: Tile) {
  const woods = [R.earth[3], R.earth[4], R.earth[3]];
  for (let y = 0; y < GS; y++) { const row = Math.floor(y / 8); for (let x = 0; x < GS; x++) {
    const seam = y % 8 === 7 || (x + row * 23) % 32 === 0;
    t.set(x, y, seam ? R.earth[1] : y % 8 === 0 ? R.earth[5] : woods[row % 3]);
  } }
  for (let i = 0; i < 10; i++) { const x = t.int(GS), y = t.int(GS); if (y % 8 > 1 && y % 8 < 6) { t.set(x, y, R.earth[2]); t.set(x + 1, y, R.earth[2]); } }
}

function caveStone(t: Tile, mossy: boolean) {
  clusters(t, mossy ? [R.stone[0], R.moss[2], R.moss[3], R.stone[1]] : [R.night[4], R.stone[0], R.stone[0], R.stone[1]], mossy ? 13 : 11, 3);
  for (let i = 0; i < 5; i++) { let x = t.int(GS), y = t.int(GS); for (let k = 0; k < 9; k++) { t.set(x, y, R.night[2]); x += t.rnd() > 0.4 ? 1 : 0; y += t.rnd() > 0.5 ? 1 : -1; } }
  for (let i = 0; i < 8; i++) t.set(t.int(GS), t.int(GS), R.stone[2]);
}

export function groundArt(kind: string): Uint8ClampedArray {
  const t = new Tile(7 + kind.length * 977 + kind.charCodeAt(0) * 31);
  switch (kind) {
    case 'grass': grass(t, false); break;
    case 'meadow': grass(t, true); break;
    case 'dirt': dirt(t); break;
    case 'sand': sand(t); break;
    case 'cobble': stones(t, 7, [RR.stone[1], RR.stone[2], RR.stone[3], RR.stone[3], RR.stone[4]], RR.soil[0], 1.2); break;
    case 'flagstone': stones(t, 4, [RR.stone[2], RR.stone[3], RR.stone[4], RR.stone[4], RR.stone[5]], RR.stone[1], 1.3); break;
    case 'plank': plank(t); break;
    case 'stone': caveStone(t, false); break;
    case 'moss': caveStone(t, true); break;
    case 'water': clusters(t, [R.water[0], R.water[1], R.water[1]], 17, 3); break;
    default: for (let y = 0; y < GS; y++) for (let x = 0; x < GS; x++) t.set(x, y, R.night[0]);
  }
  return t.data;
}
