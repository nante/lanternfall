import * as THREE from 'three';
import { grounds } from '../../../../packages/game/src/model.ts';

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
let seedState = 1;
const rnd = () => { seedState = (seedState * 16807) % 2147483647; return (seedState - 1) / 2147483646; };
const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];

class Pix {
  readonly c: HTMLCanvasElement; readonly x: CanvasRenderingContext2D; readonly img: ImageData;
  constructor(readonly w: number, readonly h: number) {
    this.c = document.createElement('canvas'); this.c.width = w; this.c.height = h;
    const ctx = this.c.getContext('2d'); if (!ctx) throw Error('Canvas unavailable'); this.x = ctx;
    this.img = ctx.createImageData(w, h);
  }
  set(x: number, y: number, c: RGB, a = 255) { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; const i = (y * this.w + x) * 4; this.img.data.set([c[0], c[1], c[2], a], i); }
  get(x: number, y: number): RGB { x = ((x % this.w) + this.w) % this.w; y = ((y % this.h) + this.h) % this.h; const i = (y * this.w + x) * 4; return [this.img.data[i], this.img.data[i + 1], this.img.data[i + 2]]; }
  fill(c: RGB) { for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.set(x, y, c); }
  noise(palette: RGB[], weights?: number[]) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      let r = rnd(), i = 0;
      if (weights) { while (i < weights.length - 1 && r > weights[i]) { r -= weights[i]; i++; } } else i = Math.floor(r * palette.length);
      this.set(x, y, palette[i]);
    }
  }
  flush() { this.x.putImageData(this.img, 0, 0); return this; }
  texture(repeat = true) {
    this.flush();
    const t = new THREE.CanvasTexture(this.c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
}
// Hand-made PNGs replace generated slots ("ground.cobble", "wall.stone", ...). Filled before the world is built.
export type Rgba = { width: number; height: number; data: Uint8ClampedArray };
const overrides = new Map<string, Rgba>();
export function setTextureOverride(slot: string, image: Rgba | null) { if (image) overrides.set(slot, image); else overrides.delete(slot); }
function fromOverride(slot: string, w: number, h: number): Pix | null {
  const img = overrides.get(slot);
  if (!img || img.width !== w || img.height !== h) return null;
  const p = new Pix(w, h); p.img.data.set(img.data); return p;
}
const shade = (c: RGB, f: number): RGB => [Math.min(255, c[0] * f), Math.min(255, c[1] * f), Math.min(255, c[2] * f)].map(Math.round) as RGB;

// Each ground kind is an S×S tile covering 2×2 world tiles (24 px per tile).
const S = 48;
function groundTile(kind: string): Pix {
  const p = new Pix(S, S);
  seedState = 1 + kind.length * 977 + kind.charCodeAt(0) * 31;
  const blades = (base: RGB[], streak: RGB[], count: number, len: number) => {
    p.noise(base, [0.5, 0.3, 0.2]);
    for (let i = 0; i < count * 2.25; i++) {
      const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S), c = pick(streak), l = 1 + Math.floor(rnd() * len);
      for (let k = 0; k < l; k++) p.set(x + (k > 1 && rnd() > 0.6 ? 1 : 0), y - k, c);
    }
  };
  switch (kind) {
    case 'grass': blades([hex('#3a604c'), hex('#365a47'), hex('#406651')], [hex('#4a7552'), hex('#568158'), hex('#2c4a3a'), hex('#678c55')], 150, 3);
      for (let i = 0; i < 5; i++) p.set(Math.floor(rnd() * S), Math.floor(rnd() * S), pick([hex('#e08a2e'), hex('#7a5ab0'), hex('#d7c070')]));
      break;
    case 'meadow': blades([hex('#335843'), hex('#2f523f'), hex('#385e48')], [hex('#44704e'), hex('#517c56'), hex('#264434'), hex('#688a50')], 220, 5); break;
    case 'dirt': p.noise([hex('#5e4c3a'), hex('#574636'), hex('#64513e'), hex('#4f4032')]);
      for (let i = 0; i < 16; i++) { const x = Math.floor(rnd() * S), y = Math.floor(rnd() * S); p.set(x, y, hex('#8f7352')); p.set(x + 1, y, hex('#7d6346')); p.set(x, y + 1, hex('#4b3725')); }
      break;
    case 'sand': p.noise([hex('#b39a6b'), hex('#ab9163'), hex('#bba274')]);
      for (let i = 0; i < 10; i++) p.set(Math.floor(rnd() * S), Math.floor(rnd() * S), hex('#8f7a52'));
      break;
    case 'cobble': case 'flagstone': {
      const n = kind === 'cobble' ? 6 : 4;
      const pts: [number, number, RGB][] = [];
      const stones = kind === 'cobble' ? [hex('#7a7a76'), hex('#72726e'), hex('#81807a'), hex('#76756f'), hex('#86847d')] : [hex('#8a8579'), hex('#827d72'), hex('#918b7f')];
      for (let gy = 0; gy < n; gy++) for (let gx = 0; gx < n; gx++) pts.push([(gx + 0.2 + rnd() * 0.6) * S / n, (gy + 0.2 + rnd() * 0.6) * S / n, pick(stones)]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        let d1 = 1e9, d2 = 1e9, c: RGB = stones[0], dy1 = 0;
        for (const [px, py, pc] of pts) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
          const d = Math.hypot(x - px - ox, y - py - oy);
          if (d < d1) { d2 = d1; d1 = d; c = pc; dy1 = y - py - oy; } else if (d < d2) d2 = d;
        }
        const edge = d2 - d1;
        if (edge < 1.1) p.set(x, y, kind === 'cobble' ? hex('#55534e') : hex('#5e5a52'));
        else if (edge < 2.2 && dy1 < 0) p.set(x, y, shade(c, 1.07));
        else if (edge < 2.2 && dy1 > 0) p.set(x, y, shade(c, 0.9));
        else p.set(x, y, rnd() > 0.94 ? shade(c, 0.96) : c);
      }
      break;
    }
    case 'plank': {
      const woods = [hex('#7a5637'), hex('#724fS'), hex('#83603d')];
      for (let y = 0; y < S; y++) { const row = Math.floor(y / 4); const c = woods[row % 3]; for (let x = 0; x < S; x++) {
        const seam = y % 4 === 3 || (x + row * 11) % 16 === 0;
        p.set(x, y, seam ? hex('#4a3322') : rnd() > 0.85 ? shade(c, 0.9) : y % 4 === 0 ? shade(c, 1.08) : c);
      } }
      break;
    }
    case 'stone': p.noise([hex('#5e5852'), hex('#57524c'), hex('#645e57'), hex('#4f4a45')]);
      for (let i = 0; i < 6; i++) { let x = Math.floor(rnd() * S), y = Math.floor(rnd() * S); for (let k = 0; k < 6; k++) { p.set(x, y, hex('#2f2c2a')); x += rnd() > 0.5 ? 1 : 0; y += rnd() > 0.5 ? 1 : -1; } }
      break;
    case 'moss': p.noise([hex('#46583c'), hex('#3f5037'), hex('#4e6240'), hex('#57524c')]);
      for (let i = 0; i < 20; i++) p.set(Math.floor(rnd() * S), Math.floor(rnd() * S), hex('#5b7140'));
      break;
    case 'water': p.noise([hex('#1d4048'), hex('#1b3b43'), hex('#20454e')]); break;
    default: p.fill([10, 9, 9]);
  }
  return p;
}

export function groundAtlas() {
  const atlas = new Pix(S * grounds.length, S);
  grounds.forEach((g, i) => { const t = fromOverride(`ground.${g}`, S, S) ?? groundTile(g); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) atlas.set(i * S + x, y, t.get(x, y)); });
  const t = atlas.texture(false);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Wall faces: 16 px per world unit; height 2 units => 16×32.
export function wallTexture(style: string) { return (fromOverride(`wall.${style}`, 16, 32) ?? wallPix(style)).texture(); }
function wallPix(style: string) {
  seedState = 11 + style.length * 131;
  const p = new Pix(16, 32);
  if (style === 'stone' || style === 'rampart' || style === 'cave') {
    const base = style === 'cave' ? [hex('#4d4843'), hex('#45403c'), hex('#544e48')] : [hex('#8a8476'), hex('#7f796b'), hex('#948d7d')];
    for (let y = 0; y < 32; y++) { const row = Math.floor(y / 5); for (let x = 0; x < 16; x++) {
      const mortar = y % 5 === 4 || (x + (row % 2) * 6) % 12 === 0;
      const c = base[(row + Math.floor((x + (row % 2) * 6) / 12)) % 3];
      p.set(x, y, mortar ? (style === 'cave' ? hex('#2e2a27') : hex('#5c5649')) : y % 5 === 0 ? shade(c, 1.1) : rnd() > 0.9 ? shade(c, 0.92) : c);
    } }
    if (style === 'cave') for (let i = 0; i < 30; i++) p.set(Math.floor(rnd() * 16), Math.floor(rnd() * 32), pick([hex('#3b3632'), hex('#5e574f')]));
  } else if (style === 'timber') {
    p.noise([hex('#c7b38d'), hex('#c0ab84'), hex('#cbb894')]);
    for (let y = 0; y < 32; y++) { p.set(0, y, hex('#4f3825')); p.set(1, y, hex('#5c432c')); p.set(15, y, hex('#4f3825')); }
    for (let x = 0; x < 16; x++) { p.set(x, 0, hex('#4f3825')); p.set(x, 1, hex('#5c432c')); p.set(x, 15, hex('#4f3825')); p.set(x, 30, hex('#4f3825')); p.set(x, 31, hex('#3f2c1d')); }
    for (let k = 2; k < 14; k++) p.set(k, 2 + k, hex('#5c432c'));
  } else {
    p.noise([hex('#d6c7a6'), hex('#cfbf9c'), hex('#dbcdae')]);
    for (let x = 0; x < 16; x++) { p.set(x, 28, hex('#8a7a5c')); p.set(x, 29, hex('#7b6c50')); p.set(x, 30, hex('#7b6c50')); p.set(x, 31, hex('#6a5c44')); }
    for (let i = 0; i < 6; i++) p.set(Math.floor(rnd() * 16), Math.floor(rnd() * 26), hex('#bfae8b'));
  }
  return p;
}

export function roofTexture(kind: string) { return (fromOverride(`roof.${kind}`, 16, 16) ?? roofPix(kind)).texture(); }
function roofPix(kind: string) {
  seedState = 3 + kind.length * 71 + kind.charCodeAt(1);
  const palette: Record<string, RGB[]> = {
    slate: [hex('#3c5873'), hex('#36506a'), hex('#41607d'), hex('#2f465d')],
    clay: [hex('#9b4a30'), hex('#8e432b'), hex('#a65336'), hex('#7d3a25')],
    teal: [hex('#2f6762'), hex('#2a5d58'), hex('#35706a'), hex('#24524e')],
    thatch: [hex('#76684c'), hex('#6c5f45'), hex('#7f7152'), hex('#574b36')],
  };
  const cols = palette[kind] ?? palette.slate;
  const p = new Pix(16, 16);
  for (let y = 0; y < 16; y++) { const row = Math.floor(y / 4); for (let x = 0; x < 16; x++) {
    const seamX = (x + (row % 2) * 4) % 8 === 0 && kind !== 'thatch';
    const c = cols[(row * 3 + Math.floor((x + (row % 2) * 4) / 8)) % 3];
    if (kind === 'thatch') p.set(x, y, y % 4 === 3 ? cols[3] : rnd() > 0.6 ? shade(c, 1.1) : c);
    else p.set(x, y, y % 4 === 3 ? cols[3] : seamX ? shade(c, 0.85) : y % 4 === 0 ? shade(c, 1.15) : c);
  } }
  return p;
}

/** The procedural version of a slot, ignoring overrides. The Studio uses this as a starting point for painting. */
export function generatedPixels(slot: string): Rgba {
  const [family, kind] = slot.split('.');
  const p = family === 'ground' ? groundTile(kind) : family === 'wall' ? wallPix(kind) : roofPix(kind);
  return { width: p.w, height: p.h, data: new Uint8ClampedArray(p.img.data) };
}

export function plankTexture(dark = false) {
  seedState = dark ? 55 : 44;
  const p = new Pix(16, 16);
  const woods = dark ? [hex('#4e3523'), hex('#563b27'), hex('#47301f')] : [hex('#8a6440'), hex('#805c3a'), hex('#946d47')];
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const col = Math.floor(x / 4); p.set(x, y, x % 4 === 3 ? shade(woods[0], 0.6) : rnd() > 0.85 ? shade(woods[col % 3], 0.9) : woods[col % 3]); }
  for (let x = 0; x < 16; x++) { p.set(x, 0, shade(woods[0], 0.55)); p.set(x, 15, shade(woods[0], 0.55)); }
  return p.texture();
}

export function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const ctx = c.getContext('2d'); if (!ctx) throw Error('Canvas unavailable');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
