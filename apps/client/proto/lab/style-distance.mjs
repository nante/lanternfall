// How far a game picture's colours are from a reference's, in OKLab. Usage: node style-distance.mjs <ref.png> <game.png> [...]
// For each picture: the colours it uses (sRGB rounded to 4 bits per channel, weighted by how often they appear). The
// distance is the mean, over both pictures' pixels, of the OKLab distance to the nearest colour the other picture uses
// (a symmetric chamfer), plus the gap in mean lightness and mean chroma. Lower is closer; 0 is the same colours.
// The chamfer favours pictures with many colours, so the main score is `overlap`: how much of the two pictures' colour
// distributions coincide, binned by lightness (10 steps), hue (8 sectors) and chroma (grey, muted, vivid). 1 is identical.
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const lin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const oklab = (r, g, b) => {
  const lr = lin(r), lg = lin(g), lb = lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb), m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb), s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
function colours(file) {
  const png = PNG.sync.read(readFileSync(file)), bins = new Map();
  for (let y = 0; y < png.height; y += 2) for (let x = 0; x < png.width; x += 2) {
    const i = (y * png.width + x) * 4, key = (png.data[i] >> 4) << 8 | (png.data[i + 1] >> 4) << 4 | png.data[i + 2] >> 4;
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  const total = [...bins.values()].reduce((a, b) => a + b, 0);
  return [...bins].map(([k, n]) => ({ lab: oklab(((k >> 8) * 17) / 255, (((k >> 4) & 15) * 17) / 255, ((k & 15) * 17) / 255), w: n / total }));
}
const near = (a, b) => a.reduce((s, p) => s + p.w * Math.min(...b.map(q => Math.hypot(p.lab[0] - q.lab[0], p.lab[1] - q.lab[1], p.lab[2] - q.lab[2]))), 0);
const bin = l => { const C = Math.hypot(l[1], l[2]), h = Math.floor(((Math.atan2(l[2], l[1]) / (2 * Math.PI)) + 1) * 8) % 8; return Math.min(9, Math.floor(l[0] * 10)) * 24 + (C < 0.03 ? 0 : C < 0.09 ? 1 : 2) * 8 + (C < 0.03 ? 0 : h); };
const hist = a => { const H = new Float64Array(240); for (const p of a) H[bin(p.lab)] += p.w; return H; };
const mean = (a, f) => a.reduce((s, p) => s + p.w * f(p.lab), 0);
const args = process.argv.slice(2), ref = colours(args[0]);
for (const file of args.slice(1)) {
  const g = colours(file);
  const chamfer = (near(g, ref) + near(ref, g)) / 2, hr = hist(ref), hg = hist(g);
  const overlap = hr.reduce((t, v, i) => t + Math.min(v, hg[i]), 0);
  const dL = Math.abs(mean(g, l => l[0]) - mean(ref, l => l[0])), dC = Math.abs(mean(g, l => Math.hypot(l[1], l[2])) - mean(ref, l => Math.hypot(l[1], l[2])));
  console.log(`${file.split('/').pop().padEnd(34)} overlap ${overlap.toFixed(2)}  colour ${chamfer.toFixed(4)}  lightness gap ${dL.toFixed(3)}  chroma gap ${dC.toFixed(3)}`);
}
