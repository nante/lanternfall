// Extract a palette from reference images by k-means in OKLab. Usage:
// node extract-palette.mjs <png> <k> <x0> <y0> <x1> <y1> [...more images as groups of 6]
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const oklab = (r, g, b) => {
  const lr = lin(r), lg = lin(g), lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb), m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb), s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const args = process.argv.slice(2);
for (let a = 0; a < args.length; a += 6) {
  const [file, k, x0, y0, x1, y1] = [args[a], ...args.slice(a + 1, a + 6).map(Number)];
  const png = PNG.sync.read(readFileSync(file));
  const pts = [];
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const i = (y * png.width + x) * 4, r = png.data[i] / 255, g = png.data[i + 1] / 255, b = png.data[i + 2] / 255;
    pts.push({ lab: oklab(r, g, b), rgb: [png.data[i], png.data[i + 1], png.data[i + 2]] });
  }
  // k-means++ seeding, deterministic
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const d2 = (p, q) => (p[0] - q[0]) ** 2 * 1.4 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
  const cents = [pts[Math.floor(rnd() * pts.length)].lab];
  while (cents.length < k) {
    const ds = pts.map(p => Math.min(...cents.map(c => d2(p.lab, c))));
    let t = rnd() * ds.reduce((s, v) => s + v, 0), i = 0; while ((t -= ds[i]) > 0) i++;
    cents.push(pts[i].lab);
  }
  let groups;
  for (let it = 0; it < 25; it++) {
    groups = cents.map(() => []);
    for (const p of pts) { let best = 0, bd = Infinity; cents.forEach((c, j) => { const d = d2(p.lab, c); if (d < bd) { bd = d; best = j; } }); groups[best].push(p); }
    groups.forEach((g, j) => { if (g.length) cents[j] = [0, 1, 2].map(c => g.reduce((s, p) => s + p.lab[c], 0) / g.length); });
  }
  // Report each cluster by its median sRGB colour, sorted by lightness.
  const out = groups.map((g, j) => ({ L: cents[j][0], n: g.length, rgb: [0, 1, 2].map(c => g.map(p => p.rgb[c]).sort((a, b) => a - b)[g.length >> 1] ?? 0) }))
    .filter(c => c.n > pts.length * 0.002).sort((a, b) => a.L - b.L);
  console.log(file.split('/').pop(), JSON.stringify(out.map(c => '#' + c.rgb.map(v => v.toString(16).padStart(2, '0')).join(''))));
}
