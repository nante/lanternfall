import * as THREE from 'three';

/**
 * The Lanternfall palette. Every pixel on screen is snapped to one of these.
 * Ramps run dark to light. Teal appears only in `lantern`: it means magic and nothing else.
 */
export const ramps = {
  night: ['#06070d', '#0c0f1e', '#141a31', '#1e2646', '#2b365d', '#3c4a78'],
  stone: ['#3e3d3f', '#55524f', '#6f6a63', '#8c867b', '#aaa395', '#c8c0ae'],
  slate: ['#3a4456', '#55627a', '#7a879c'],
  bone: ['#d6ccb2', '#ece2c8', '#fbf4e2'],
  fire: ['#2e130b', '#5c2410', '#93391a', '#c95a24', '#ec8a35', '#ffb95e', '#ffe2a0'],
  earth: ['#1a120c', '#2c1f15', '#3b2819', '#4d3422', '#5a3d27', '#6b4a30', '#7b5737', '#a07a4e', '#c4a072'],
  moss: ['#0a120d', '#0f1a13', '#142218', '#18291c', '#1d3121', '#233d27', '#2b4a2d', '#335631', '#3e6435', '#4a7139', '#678d43', '#90ab55'],
  olive: ['#2c3318', '#434c20', '#5e6a2b', '#7f8b38', '#a6ad4c', '#cdc875'],
  soil: ['#3f352b', '#584a39', '#71614a', '#8b795b', '#a6936f', '#c2ae87'],
  // Firelit stone and earth: warm amber-browns, so a torch pool reads amber instead of snapping to the roof reds.
  ochre: ['#2a1d0f', '#43301a', '#5e4424', '#7d5b2e', '#a07636', '#c4923f'],
  roof: ['#3f1716', '#6a2621', '#963c30', '#bd6447'],
  dusk: ['#2d2140', '#4a3460', '#74507e', '#a8708e', '#d39a9c'],
  water: ['#10283a', '#1d4058', '#2f6180', '#4f8daa', '#8cc0d2'],
  skin: ['#9a6446', '#c48a62', '#e3b48c'],
  lantern: ['#0d3236', '#17605e', '#2c9a8e', '#5fd7c4', '#bff7ec'],
} as const;

export const palette: string[] = Object.values(ramps).flat();

/**
 * What the screen snaps to: colours taken from the reference art by k-means in OKLab (apps/client/proto/lab/extract-palette.mjs),
 * so the final picture speaks the references' language: blue-violet stone and peach light (ref-1), slate shadow and gilded
 * stone (ref-2), forest and field greens (ref-3, ref-4), night blues and moon orange (video-1). The Lantern's teal is
 * added because no reference has magic in it. Near-duplicates are merged at load.
 */
const fromReferences = {
  ruins: ['#0b1122', '#191725', '#0f163b', '#16204c', '#1c295c', '#3c2e3e', '#243166', '#2d3a70', '#4c3a67', '#35427b', '#6a3c5a', '#3e4c81', '#3d499b', '#495689', '#854457', '#525f95', '#736574', '#616ca1', '#727cab', '#be5b54', '#927e85', '#8591c0', '#b59180', '#99a5cd', '#c8ac9f', '#a7b4cb', '#b8c3cb', '#d2d3d3'],
  city: ['#020a1c', '#070d1f', '#0f2135', '#212624', '#132a3b', '#243241', '#393a36', '#313c4a', '#3b4553', '#4c4a45', '#424d5a', '#4a5461', '#605b51', '#545e6b', '#606872', '#67727f', '#797062', '#7e7f76', '#8c8f83', '#b88b6c', '#999d8e', '#a9a98f', '#d7a875', '#c0bca0', '#e5c18a', '#d0d2b7', '#f4d399', '#f6e1c5'],
  forest: ['#130e04', '#231c0e', '#2c2b19', '#313d29', '#464842', '#394f35', '#5a5841', '#856338', '#7f804d', '#929249', '#a3a648', '#c1b852', '#efb759', '#dccd5b'],
  // The field's two acid greens are left out: sunlit grass should settle on the forest's olives.
  field: ['#141c07', '#67662d', '#6c3223', '#af574c', '#b77c65', '#c39569'],
  night: ['#060000', '#140606', '#00142a', '#2d120d', '#0a273f', '#452217', '#1b4461', '#623620', '#3a5878', '#864a1e', '#b06621', '#988878', '#ef7125', '#c19f7b', '#fb9645', '#fcbd73', '#fdfefd'],
};

const srgbToLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
function oklab(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r), lg = srgbToLinear(g), lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255] as const;

export const lutColors: string[] = (() => {
  // Teal only at the bright end: it is the Lantern's glow and must never catch a blue cloak.
  const all = [...Object.values(fromReferences).flat(), ramps.lantern[2], ramps.lantern[3], ramps.lantern[4]];
  const kept: { hex: string; lab: [number, number, number] }[] = [];
  for (const hex of all) {
    const [r, g, b] = rgb(hex), lab = oklab(r, g, b);
    if (!kept.some(k => (k.lab[0] - lab[0]) ** 2 + (k.lab[1] - lab[1]) ** 2 + (k.lab[2] - lab[2]) ** 2 < 0.018 ** 2)) kept.push({ hex, lab });
  }
  return kept.map(k => k.hex);
})();

/**
 * ref-3's living field greens. At noon they make sunlit grass glare, so the day palette leaves them out; with the sun
 * low they keep the grass green instead of letting the slate shadow tint grey it.
 */
export const LOW_SUN_GREENS = ['#385318', '#283f0f'];

/** 32³ lookup: display-referred sRGB in, nearest palette colour out (OKLab distance). `extra` adds colours to the set. */
export function paletteLut(size = 32, extra: string[] = []): THREE.Data3DTexture {
  const pal = [...lutColors, ...extra].map(h => { const [r, g, b] = rgb(h); return { lab: oklab(r, g, b), rgb: [r, g, b] }; });
  const data = new Uint8Array(size * size * size * 4);
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    const [L, A, B] = oklab(r / (size - 1), g / (size - 1), b / (size - 1));
    let best = 0, bestD = Infinity;
    for (let i = 0; i < pal.length; i++) {
      const [l2, a2, b2] = pal[i].lab;
      // Weight lightness a little more than hue so value structure survives the snap.
      const d = 1.6 * (L - l2) ** 2 + (A - a2) ** 2 + (B - b2) ** 2;
      if (d < bestD) { bestD = d; best = i; }
    }
    const o = ((b * size + g) * size + r) * 4, c = pal[best].rgb;
    data[o] = Math.round(c[0] * 255); data[o + 1] = Math.round(c[1] * 255); data[o + 2] = Math.round(c[2] * 255); data[o + 3] = 255;
  }
  const tex = new THREE.Data3DTexture(data, size, size, size);
  tex.format = THREE.RGBAFormat; tex.type = THREE.UnsignedByteType;
  tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.unpackAlignment = 1;
  tex.needsUpdate = true;
  return tex;
}
