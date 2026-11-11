import type { MatId } from '../materials.ts';
import type { Icon, V2 } from '../raster.ts';

type Draw = (i: Icon) => Icon;
const mirror = (half: V2[]): V2[] => [...half, ...[...half].reverse().map(([x, y]) => [24 - x, y] as V2)];
/** A shield outline drawn twice: the rim in metal, the face inside it. */
function faced(i: Icon, outer: V2[], inner: V2[], rim: MatId, face: MatId) {
  i.poly(outer, rim, { form: 'pillow', bevel: 4 });
  i.poly(inner, face, { form: 'pillow', bevel: 6, axis: [0, 1] });
  return i;
}
const heaterShape = (k: number): V2[] => mirror([[12, 2 + k], [4 + k, 3 + k], [3.6 + k, 9], [5 + k, 15], [8.4 + k * 0.6, 19 - k * 0.6], [12, 22 - k]]);
const kiteShape = (k: number): V2[] => mirror([[12, 1.4 + k], [6 + k, 2.4 + k], [4.8 + k, 6.5], [6.4 + k, 12.5], [9.4 + k * 0.6, 18.4 - k * 0.5], [12, 22.8 - k * 1.2]]);
/** A torso front view: shoulders, optional sleeves, a hem. `len` is the hem's y. */
function torso(i: Icon, mat: MatId, o: { sleeve: number; len: number; waist?: number; collar?: MatId }) {
  const w = o.waist ?? 6.6;
  i.poly(mirror([[12, 4.2], [8.6, 3.6], [5, 5], [3.2 - o.sleeve * 0.3, 7.4 + o.sleeve], [5.3, 9 + o.sleeve * 0.6], [6.4, 8.6], [12 - w * 0.95, 14], [12 - w, o.len], [12, o.len]]), mat, { form: 'pillow', bevel: 4.5 });
  if (o.collar) i.poly(mirror([[12, 6.6], [9.4, 3.6], [10.4, 3.6], [12, 5]]), o.collar, { form: 'pillow', bevel: 1.5 });
  return i;
}
function boots(i: Icon, mat: MatId, o: { toe?: MatId; cuff?: MatId; tall?: number }) {
  const t = o.tall ?? 0;
  for (const [dx, dy] of [[5.5, -1.5], [0, 0]] as const) {
    i.poly([[4 + dx, 6 - t + dy], [10 + dx, 6 - t + dy], [10.3 + dx, 15 + dy], [14 + dx, 16.4 + dy], [15.6 + dx, 18.6 + dy], [15.4 + dx, 20.6 + dy], [3.6 + dx, 20.6 + dy], [3.9 + dx, 14 + dy]], mat, { form: 'pillow', bevel: 3.2 });
    if (o.cuff) i.rect(3.5 + dx, 5.4 - t + dy, 10.5 + dx, 8 - t + dy, o.cuff, { form: 'pillow', bevel: 1.5, sep: true });
    if (o.toe) i.poly([[10.2 + dx, 15.6 + dy], [14 + dx, 16.6 + dy], [15.6 + dx, 18.6 + dy], [15.4 + dx, 20.6 + dy], [10 + dx, 20.6 + dy]], o.toe, { form: 'pillow', bevel: 2 });
    i.rect(3.6 + dx, 19.8 + dy, 15.4 + dx, 20.9 + dy, 'darkwood', { form: 'flat' });
  }
  return i;
}

export const armour: Record<string, Draw> = {
  // Shields, smallest to largest.
  lid: i => {
    i.ellipse(12, 12, 9, 9, 'oak', { form: 'pillow', axis: [0, 1] });
    for (const x of [8.5, 12.5, 16.5]) i.markLine([x, 4], [x, 20], { dt: -1 });
    i.ring(12, 12, 8.6, 1.6, 'rust');
    i.rect(5, 10.5, 19, 13, 'rust', { form: 'pillow', bevel: 1.2 });
    return i;
  },
  buckler: i => { i.ellipse(12, 12, 9.4, 9.4, 'wood', { form: 'pillow', axis: [1, 1] }); i.ring(12, 12, 9, 1.6, 'iron'); i.ellipse(12, 12, 3, 3, 'iron'); return i; },
  heater: i => { faced(i, heaterShape(0), heaterShape(1.6), 'iron', 'blue'); i.markLine([12, 3.6], [12, 20.5], { tone: 4, mat: 'linen' }); i.markLine([5.2, 9], [18.8, 9], { tone: 4, mat: 'linen' }); return i; },
  banded: i => {
    faced(i, heaterShape(0), heaterShape(1.6), 'steel', 'felt');
    for (const y of [7.5, 13]) i.rect(4.6, y, 19.4, y + 2, 'steel', { form: 'pillow', bevel: 1 });
    i.ellipse(12, 11, 2.2, 2.2, 'gold');
    return i;
  },
  kite: i => { faced(i, kiteShape(0), kiteShape(1.5), 'steel', 'canvas'); i.poly(mirror([[12, 5], [9, 8], [12, 15]]), 'gold', { form: 'ridge', ridge: [[12, 5], [12, 15]] }); return i; },
  tower: i => {
    i.poly([[4, 4], [8, 2], [16, 2], [20, 4], [20, 21.5], [4, 21.5]], 'iron', { form: 'pillow', bevel: 4 });
    i.poly([[5.5, 5], [8.6, 3.4], [15.4, 3.4], [18.5, 5], [18.5, 20.2], [5.5, 20.2]], 'wood', { form: 'pillow', bevel: 6, axis: [0, 1] });
    for (const x of [9.5, 14.5]) i.markLine([x, 4], [x, 20], { dt: -1 });
    for (const y of [7, 15]) i.rect(5.3, y, 18.7, y + 1.8, 'iron', { form: 'pillow', bevel: 1 });
    for (const [x, y] of [[7, 8], [17, 8], [7, 16], [17, 16]] as const) i.mark(x, y, { tone: 5, mat: 'iron' });
    return i;
  },
  sunshield: i => {
    i.ellipse(12, 12, 10.3, 10.3, 'gold', { form: 'pillow' });
    i.ellipse(12, 12, 8.4, 8.4, 'felt', { form: 'pillow', axis: [1, 1] });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; i.poly([[12 + Math.cos(a - 0.22) * 3, 12 + Math.sin(a - 0.22) * 3], [12 + Math.cos(a) * 8, 12 + Math.sin(a) * 8], [12 + Math.cos(a + 0.22) * 3, 12 + Math.sin(a + 0.22) * 3]], 'gold', { form: 'ridge', ridge: [[12, 12], [12 + Math.cos(a) * 8, 12 + Math.sin(a) * 8]] }); }
    i.ellipse(12, 12, 3.2, 3.2, 'gold');
    return i;
  },
  // Head, felt to gilded.
  cap: i => {
    i.ellipse(11.5, 13, 8.5, 6.5, 'felt');
    i.poly([[16, 8], [21.5, 10.5], [19.8, 14.4], [16.6, 12]], 'felt', { form: 'dome' });
    i.rect(3.2, 14.5, 20, 18.5, 'leather', { form: 'pillow', bevel: 2, sep: true });
    return i;
  },
  coif: i => {
    i.poly(mirror([[12, 2.5], [7, 3.6], [4, 8], [3.5, 16], [2.8, 21.5], [12, 21.5]]), 'mail', { form: 'dome' });
    i.poly(mirror([[12, 7], [9, 7.6], [7.6, 11], [8, 16], [12, 17]]), 'leather', { form: 'pillow', bevel: 3 });
    i.cutEllipse(12, 12.4, 3.2, 4.4);
    i.rect(5, 17.5, 19, 19.5, 'leather', { form: 'pillow', bevel: 1 });
    return i;
  },
  kettlehat: i => {
    i.ellipse(12, 15.6, 11, 4, 'iron', { form: 'pillow' });
    i.poly(mirror([[12, 4], [8.4, 4.6], [6.4, 7.6], [5.6, 15.8], [12, 16.6]]), 'iron', { form: 'dome', sep: true });
    i.markLine([12, 4.5], [12, 15.5], { dt: 1 });
    return i;
  },
  visorhelm: i => {
    i.poly(mirror([[12, 2.4], [7.6, 3.4], [5, 7], [4.4, 14], [5, 20.6], [9.6, 21.6], [12, 21.6]]), 'steel', { form: 'dome' });
    i.markLine([7.4, 10.2], [16.6, 10.2], { tone: 0 });
    i.markLine([12, 10.2], [12, 17.4], { tone: 0 });
    i.markLine([12, 2.8], [12, 9], { dt: 1 });
    return i;
  },
  gildedhelm: i => {
    i.poly([[12, 1.5], [14.4, 5.4], [12, 7], [9.6, 5.4]], 'felt', { form: 'dome' });
    i.poly(mirror([[12, 4.6], [7.4, 5.4], [4.6, 8.6], [4.2, 20.6], [12, 21.8]]), 'steel', { form: 'dome', sep: true });
    i.rect(4.4, 9.6, 19.6, 11, 'gold', { form: 'pillow', bevel: 1 });
    i.markLine([7, 13.3], [17, 13.3], { tone: 0 });
    i.markLine([12, 6], [12, 20.6], { mat: 'gold', tone: 4 });
    for (const [x, y] of [[8, 17], [16, 17], [8, 19], [16, 19]] as const) i.mark(x, y, { tone: 0 });
    return i;
  },
  // Body, quilted to plate.
  tunic: i => { torso(i, 'quilt', { sleeve: 2, len: 20.5 }); i.markLine([5, 17.2], [19, 17.2], { dt: -1 }); i.markLine([12, 6], [12, 12], { tone: 1 }); return i; },
  gambeson: i => {
    torso(i, 'linen', { sleeve: 6, len: 21.5, collar: 'quilt' });
    for (const y of [9, 12, 15, 18]) i.markLine([6.2, y], [17.8, y], { dt: -1 });
    return i;
  },
  jerkin: i => {
    torso(i, 'leather', { sleeve: 0, len: 20, collar: 'darkwood' });
    for (const y of [9, 12, 15, 18]) for (const x of [8, 11, 13, 16]) i.mark(x, y, { mat: 'steel', tone: 5 });
    return i;
  },
  mailshirt: i => { torso(i, 'mail', { sleeve: 5, len: 21.6, collar: 'leather' }); i.rect(5.6, 19.8, 18.4, 21.6, 'leather', { form: 'pillow', bevel: 1 }); return i; },
  scalecoat: i => {
    torso(i, 'bronze', { sleeve: 3, len: 21.4, collar: 'leather' });
    for (let y = 7; y <= 20; y += 2) for (let x = 6 + (y % 4 ? 1 : 0); x <= 17; x += 2) i.mark(x, y, { dt: -2 });
    return i;
  },
  cuirass: i => {
    i.poly(mirror([[12, 3.2], [8.6, 3.2], [4.6, 5], [4.2, 9.6], [6.2, 11.6], [6.4, 17.5], [8.2, 20.6], [12, 21.4]]), 'steel', { form: 'dome' });
    i.poly(mirror([[12, 3.2], [9.4, 3.2], [10.4, 5.2], [12, 6]]), 'gold', { form: 'pillow', bevel: 1 });
    i.rect(6.6, 16.4, 17.4, 17.8, 'gold', { form: 'pillow', bevel: 1, sep: true });
    i.markLine([12, 6.4], [12, 15.6], { dt: 2 });
    return i;
  },
  // Feet.
  boots: i => boots(i, 'leather', { cuff: 'darkwood' }),
  shodboots: i => boots(i, 'darkwood', { toe: 'iron', cuff: 'leather', tall: 2 }),
  sabatons: i => boots(i, 'steel', { toe: 'steel', cuff: 'gold', tall: 1 }),
};
