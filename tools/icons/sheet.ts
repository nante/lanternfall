import { PNG } from 'pngjs';
import { iconAlphabet, ICON_SIZE as S, type IconDef } from '../../packages/game/src/content-schema.ts';

/** A tiny 3×5 font for the contact sheet's labels, rows top to bottom as 3-bit numbers. */
const FONT: Record<string, number[]> = {
  a: [2, 5, 7, 5, 5], b: [6, 5, 6, 5, 6], c: [3, 4, 4, 4, 3], d: [6, 5, 5, 5, 6], e: [7, 4, 6, 4, 7], f: [7, 4, 6, 4, 4],
  g: [3, 4, 5, 5, 3], h: [5, 5, 7, 5, 5], i: [7, 2, 2, 2, 7], j: [1, 1, 1, 5, 2], k: [5, 5, 6, 5, 5], l: [4, 4, 4, 4, 7],
  m: [5, 7, 7, 5, 5], n: [6, 5, 5, 5, 5], o: [2, 5, 5, 5, 2], p: [6, 5, 6, 4, 4], q: [2, 5, 5, 6, 3], r: [6, 5, 6, 5, 5],
  s: [3, 4, 2, 1, 6], t: [7, 2, 2, 2, 2], u: [5, 5, 5, 5, 7], v: [5, 5, 5, 5, 2], w: [5, 5, 7, 7, 5], x: [5, 5, 2, 5, 5],
  y: [5, 5, 2, 2, 2], z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2], 8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
};
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/**
 * Every icon at 1× and 3× on a dark and a mid-tone ground, and its world sprite's albedo at 3× (flat, unlit: only a
 * check that the sprite exists and has the right shapes; it is judged in the scene, never here).
 */
export function contactSheet(icons: [string, IconDef][], cols = 5) {
  const DARK = '#141a31', MID = '#6f6a63', BG = '#0c0f1e';
  const cellW = 8 + S + 4 + S + 8 + S * 3 + 4 + S * 3 + 8 + S * 3 + 8, cellH = 8 + S * 3 + 12;
  const W = cols * cellW, H = Math.ceil(icons.length / cols) * cellH;
  const png = new PNG({ width: W, height: H });
  const put = (x: number, y: number, hex: string) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const [r, g, b] = rgb(hex), o = (y * W + x) * 4; png.data[o] = r; png.data[o + 1] = g; png.data[o + 2] = b; png.data[o + 3] = 255; };
  const rect = (x: number, y: number, w: number, h: number, hex: string) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) put(x + i, y + j, hex); };
  const draw = (pal: string[], rows: string[], x0: number, y0: number, k: number) => rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.') rect(x0 + x * k, y0 + y * k, k, k, pal[iconAlphabet.indexOf(ch)]); }));
  const text = (s: string, x: number, y: number) => [...s.toLowerCase()].forEach((ch, i) => (FONT[ch] ?? []).forEach((bits, r) => { for (let c = 0; c < 3; c++) if (bits & (4 >> c)) put(x + i * 4 + c, y + r, '#c8c0ae'); }));
  rect(0, 0, W, H, BG);
  icons.forEach(([name, def], n) => {
    const x0 = (n % cols) * cellW, y0 = Math.floor(n / cols) * cellH;
    let x = x0 + 8;
    rect(x - 2, y0 + 6, S + 4, S + 4, DARK); draw(def.palette, def.pixels, x, y0 + 8, 1); x += S + 4;
    rect(x - 2, y0 + 6, S + 4, S + 4, MID); draw(def.palette, def.pixels, x, y0 + 8, 1); x += S + 8;
    rect(x, y0 + 8, S * 3, S * 3, DARK); draw(def.palette, def.pixels, x, y0 + 8, 3); x += S * 3 + 4;
    rect(x, y0 + 8, S * 3, S * 3, MID); draw(def.palette, def.pixels, x, y0 + 8, 3); x += S * 3 + 8;
    rect(x, y0 + 8, S * 3, S * 3, '#2b365d'); if (def.world) draw(def.world.palette, def.world.pixels, x, y0 + 8, 3);
    text(name, x0 + 8, y0 + 8 + S * 3 + 3);
  });
  return PNG.sync.write(png);
}
