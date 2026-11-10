import * as THREE from 'three';
import { grounds } from '../../../../packages/game/src/model.ts';
import { groundArt, GS } from './ground-art.ts';

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

export function groundAtlas() {
  const atlas = new Pix(GS * grounds.length, GS);
  grounds.forEach((g, i) => { const d = fromOverride(`ground.${g}`, GS, GS)?.img.data ?? groundArt(g); for (let y = 0; y < GS; y++) for (let x = 0; x < GS; x++) { const o = (y * GS + x) * 4; atlas.set(i * GS + x, y, [d[o], d[o + 1], d[o + 2]]); } });
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
    // Roof colours from the references: ref-1's blue-violet slate, ref-2's terracotta and straw.
    slate: [hex('#3e4c81'), hex('#35427b'), hex('#495689'), hex('#243166')],
    clay: [hex('#b05a3a'), hex('#9e4c30'), hex('#c06840'), hex('#5e2c1c')],
    teal: [hex('#2f6762'), hex('#2a5d58'), hex('#35706a'), hex('#24524e')],
    thatch: [hex('#9a7e4a'), hex('#8c7244'), hex('#a88a54'), hex('#5a4a2e')],
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
  if (family === 'ground') return { width: GS, height: GS, data: groundArt(kind) };
  const p = family === 'wall' ? wallPix(kind) : roofPix(kind);
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
