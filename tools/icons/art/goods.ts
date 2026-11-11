import type { MatId } from '../materials.ts';
import type { Icon, V2 } from '../raster.ts';
import { bottle } from '../kit.ts';

type Draw = (i: Icon) => Icon;
const mirror = (half: V2[]): V2[] => [...half, ...[...half].reverse().map(([x, y]) => [24 - x, y] as V2)];

/** A cut crystal like the tutorial's: three faces down its length and a bright crown facet. */
function crystal(i: Icon, mat: MatId, cx: number, top: number, bot: number, w: number) {
  const mid = top + (bot - top) * 0.28;
  i.poly([[cx - w, mid], [cx - w * 0.35, mid + 1], [cx - w * 0.3, bot - 1], [cx, bot], [cx - w * 0.85, bot - 3.5]], mat, { form: 'flat', tilt: [-0.75, 0.1] });
  i.poly([[cx - w * 0.35, mid + 1], [cx + w * 0.4, mid + 1], [cx + w * 0.35, bot - 1], [cx, bot], [cx - w * 0.3, bot - 1]], mat, { form: 'flat', tilt: [0.15, 0.1] });
  i.poly([[cx + w * 0.4, mid + 1], [cx + w, mid], [cx + w * 0.85, bot - 3.5], [cx, bot], [cx + w * 0.35, bot - 1]], mat, { form: 'flat', tilt: [0.95, 0.5] });
  i.poly([[cx, top], [cx + w, mid], [cx + w * 0.4, mid + 1], [cx - w * 0.35, mid + 1], [cx - w, mid]], mat, { form: 'flat', tilt: [-0.4, -1.1] });
  return i;
}
function ring(i: Icon, band: MatId, gem?: MatId) {
  i.ring(12, 14.5, 6.6, 2.4, band, { ry: 5.6 });
  if (gem) { i.ellipse(12, 7.6, 3.6, 2.4, band, { form: 'pillow' }); i.ellipse(12, 6.6, 2.6, 2.6, gem); }
  return i;
}
function coin(i: Icon, mat: MatId, cx: number, cy: number, r: number, flat = 1) {
  i.ellipse(cx, cy + 0.9, r, r * flat, mat, { form: 'pillow', tilt: [0.3, 0.9], sep: true });
  i.ellipse(cx, cy, r, r * flat, mat, { form: 'pillow', sep: true });
  i.ring(cx, cy, r - 1.5, 0.8, mat, { ry: r * flat - 1.5 });
  return i;
}

export const goods: Record<string, Draw> = {
  // Containers.
  pack: i => {
    i.poly([[4.5, 8], [19.5, 8], [20, 20], [18.6, 21.6], [5.4, 21.6], [4, 20]], 'canvas', { form: 'pillow', bevel: 5 });
    i.ellipse(12, 5.6, 8.4, 3, 'wool', { form: 'pillow', axis: [1, 0] });
    i.poly([[4.6, 8.4], [19.4, 8.4], [19, 13.6], [12, 15], [5, 13.6]], 'canvas', { form: 'pillow', bevel: 3, sep: true });
    for (const x of [8, 16]) i.rect(x - 0.9, 7.6, x + 0.9, 18.5, 'leather', { form: 'pillow', bevel: 1 });
    for (const x of [8, 16]) i.mark(x, 15, { mat: 'iron', tone: 5 });
    return i;
  },
  satchel: i => {
    i.ring(12, 10, 7.4, 1.4, 'leather', { ry: 7.4 });
    i.poly([[3.5, 10], [20.5, 10], [20.8, 20], [19, 21.6], [5, 21.6], [3.2, 20]], 'leather', { form: 'pillow', bevel: 4 });
    i.poly([[3.6, 10.2], [20.4, 10.2], [20.2, 15], [12, 16.6], [3.8, 15]], 'redleather', { form: 'pillow', bevel: 2, sep: true });
    i.rect(10.8, 14.6, 13.2, 17.6, 'bronze', { form: 'pillow', bevel: 1 });
    return i;
  },
  rucksack: i => {
    i.rect(3.2, 3, 5, 22, 'wood', { form: 'pillow', bevel: 1 }); i.rect(19, 3, 20.8, 22, 'wood', { form: 'pillow', bevel: 1 });
    i.poly([[5, 6], [19, 6], [19.6, 19.6], [18, 21], [6, 21], [4.4, 19.6]], 'canvas', { form: 'pillow', bevel: 5 });
    i.ellipse(12, 4.4, 7.6, 2.6, 'linen', { form: 'pillow', axis: [1, 0] });
    i.poly([[5.2, 6.4], [18.8, 6.4], [18.4, 11.6], [12, 13], [5.6, 11.6]], 'canvas', { form: 'pillow', bevel: 3, sep: true });
    i.rect(2.6, 9, 21.4, 10.6, 'wood', { form: 'pillow', bevel: 1 });
    i.ellipse(12, 16.4, 3.2, 2.6, 'leather', { form: 'pillow' });
    return i;
  },
  pouch: i => {
    i.ellipse(12, 15.2, 7.6, 6.8, 'leather', { form: 'dome' });
    i.poly([[9, 9], [15, 9], [17.4, 5], [6.6, 5]], 'leather', { form: 'pillow', bevel: 2 });
    i.line([[8.6, 9.4], [15.4, 9.4]], 1.6, 'rope', { sep: true });
    i.line([[15, 9.6], [17.4, 13.4]], 1.2, 'rope');
    return i;
  },
  purse: i => {
    i.poly([[5, 9], [19, 9], [20, 17], [17, 20.6], [7, 20.6], [4, 17]], 'redleather', { form: 'dome' });
    i.ring(12, 9.4, 5.6, 1.4, 'gold', { ry: 3.6 });
    i.ellipse(8, 7, 1.4, 1.4, 'gold'); i.ellipse(16, 7, 1.4, 1.4, 'gold');
    i.cutPoly([[0, 0], [24, 0], [24, 9.4], [0, 9.4]]);
    i.ellipse(10.6, 6.4, 1.4, 1.4, 'gold'); i.ellipse(13.4, 6.4, 1.4, 1.4, 'gold');
    return i;
  },
  sack: i => {
    i.poly([[7.4, 7.6], [16.6, 7.6], [20.4, 13], [20.6, 19.4], [17.4, 21.8], [6.6, 21.8], [3.4, 19.4], [3.6, 13]], 'linen', { form: 'dome' });
    i.poly([[9.6, 2.6], [14.4, 2.6], [13.6, 7.6], [10.4, 7.6]], 'linen', { form: 'pillow', bevel: 2 });
    i.line([[9, 7.4], [15, 7.4]], 1.8, 'rope', { sep: true });
    i.markLine([8, 13], [9, 19], { dt: -1 }); i.markLine([15.5, 12], [15, 18], { dt: -1 });
    return i;
  },
  // Food.
  apple: i => {
    i.ellipse(12, 14, 8, 7.4, 'apple');
    i.line([[12, 7.6], [13.2, 3.6]], 1.4, 'wood');
    i.ellipse(16.4, 5.6, 3, 1.6, 'leaf', { rot: -0.5 });
    return i;
  },
  mushroom: i => {
    i.poly([[10, 12], [14, 12], [14.6, 20], [13.6, 21.6], [10.4, 21.6], [9.4, 20]], 'mushroom', { form: 'pillow', bevel: 2.5, axis: [0, 1] });
    i.poly([[12, 3], [17.6, 5.4], [21, 11], [20, 13], [4, 13], [3, 11], [6.4, 5.4]], 'cap', { form: 'dome' });
    i.rect(5, 12, 19, 13.6, 'mushroom', { form: 'flat', tilt: [0, 0.6] });
    for (const [x, y] of [[9, 6], [14, 8], [17, 10], [7, 10]] as const) i.mark(x, y, { mat: 'crumb', tone: 4 });
    return i;
  },
  loaf: i => {
    i.ellipse(12, 14, 9.6, 6.6, 'crust', { rot: -0.25 });
    for (const x of [7.5, 11.5, 15.5]) i.markLine([x, 11.5 - (x - 11) * 0.25 - 1], [x + 1.6, 11.5 - (x - 11) * 0.25 + 2], { tone: 1 });
    for (const x of [8, 12, 16]) i.mark(Math.floor(x), Math.floor(11.2 - (x - 11) * 0.25), { mat: 'crumb', tone: 4 });
    return i;
  },
  sausage: i => {
    i.line([[4.4, 13], [7, 8], [12, 6.4], [17, 8], [19.6, 13]], 5.2, 'meat');
    i.line([[3.4, 14], [3, 16.6]], 1.2, 'rope'); i.line([[20.6, 14], [21, 16.6]], 1.2, 'rope');
    for (const [x, y] of [[9, 8], [12, 8], [15, 8]] as const) i.mark(x, y, { mat: 'fat', tone: 4 });
    return i;
  },
  cheese: i => {
    i.poly([[3, 12], [20.6, 6], [21, 17], [3.4, 20]], 'cheese', { form: 'flat', tilt: [0.1, 0.3] });
    i.poly([[3, 12], [20.6, 6], [21, 9], [3.4, 15]], 'cheese', { form: 'flat', tilt: [-0.2, -0.9] });
    i.poly([[20.6, 6], [21.8, 6.6], [22, 17.4], [21, 17]], 'rind', { form: 'pillow', bevel: 1 });
    for (const [x, y, r] of [[9, 16, 1.4], [15, 13.6, 1.1], [12, 11, 0.8]] as const) i.cutEllipse(x, y, r, r);
    return i;
  },
  trout: i => {
    i.poly([[16.4, 12], [21.8, 7.6], [20.6, 12], [21.8, 16.6]], 'fish', { form: 'pillow', bevel: 1.5 });
    i.ellipse(10.6, 12, 8.4, 3.8, 'fish', { form: 'dome' });
    i.poly([[8, 8.6], [12, 6.4], [13, 8.6]], 'fish', { form: 'pillow', bevel: 1 });
    i.markLine([4, 12.6], [16, 12.6], { mat: 'fat', tone: 4 });
    for (const [x, y] of [[8, 10], [11, 9], [13, 10], [10, 14], [14, 14]] as const) i.mark(x, y, { mat: 'rind', tone: 3 });
    i.mark(5, 11, { tone: 0 });
    return i;
  },
  pie: i => {
    i.ellipse(12, 15.4, 10.2, 5.6, 'copper', { form: 'pillow' });
    i.ellipse(12, 13.4, 9, 5, 'crust', { form: 'dome' });
    for (const x of [8, 12, 16]) i.markLine([x - 1.5, 10], [x + 1.5, 17], { dt: 1 });
    for (const x of [8, 12, 16]) i.markLine([x + 1.5, 10], [x - 1.5, 17], { dt: -1 });
    return i;
  },
  haunch: i => {
    i.line([[15, 9], [20.6, 3.6]], 2.4, 'bone');
    i.ellipse(20.8, 3.8, 1.8, 1.8, 'bone'); i.ellipse(19, 2.4, 1.6, 1.6, 'bone');
    i.ellipse(10, 14, 7.6, 6.4, 'meat', { rot: -0.7 });
    i.ellipse(8.6, 15.6, 3.4, 2.8, 'fat', { rot: -0.7, form: 'pillow' });
    return i;
  },
  // Tonics and tinctures in three sizes, and the elixir.
  draught: i => bottle(i, { liquid: 'red', shape: 'vial' }),
  tonic: i => bottle(i, { liquid: 'red', shape: 'flask' }),
  greattonic: i => bottle(i, { liquid: 'red', shape: 'round', stopper: 'redleather' }),
  drop: i => bottle(i, { liquid: 'bluedrop', shape: 'vial' }),
  tincture: i => bottle(i, { liquid: 'bluedrop', shape: 'flask' }),
  greattincture: i => bottle(i, { liquid: 'bluedrop', shape: 'round', stopper: 'redleather' }),
  elixir: i => bottle(i, { liquid: 'honey', shape: 'round', stopper: 'gold' }),
  // Creature products.
  tail: i => { i.line([[4, 20], [6, 15], [11, 13], [15, 15], [18, 12], [19, 7], [17.4, 4]], 2.4, 'pink'); i.ellipse(4.6, 19.6, 2, 2, 'fur'); return i; },
  pelt: i => {
    i.poly([[9, 3], [15, 3], [16.4, 7], [21, 8], [19, 11], [18, 17], [21, 19], [16, 20], [12, 22.4], [8, 20], [3, 19], [6, 17], [5, 11], [3, 8], [7.6, 7]], 'fur', { form: 'pillow', bevel: 4.5, axis: [0, 1] });
    i.ellipse(12, 12.6, 4, 6.4, 'leather', { form: 'pillow' });
    return i;
  },
  shell: i => {
    i.ellipse(12, 13, 9, 8.4, 'chitin');
    i.markLine([12, 4.8], [12, 21.2], { tone: 0 });
    i.markLine([7, 9], [9, 14], { dt: 1 });
    return i;
  },
  horn: i => { i.poly([[3.4, 20.6], [9.6, 21.6], [13, 14.6], [16.4, 8.6], [21, 2.4], [13.8, 5.8], [8.4, 10.4], [4.6, 15.4]], 'chitin', { form: 'ridge', ridge: [[6.4, 21], [21, 2.4]], bevel: 2 }); i.ellipse(6.2, 20.6, 2.6, 1.4, 'chitin', { form: 'pillow' }); return i; },
  silk: i => {
    i.line([[4, 17], [20, 7]], 6.4, 'silk', { form: 'round' });
    for (const t of [0.2, 0.4, 0.6, 0.8]) { const x = 4 + 16 * t, y = 17 - 10 * t; i.markLine([x - 1.4, y - 2.6], [x + 1.4, y + 2.6], { dt: -1 }); }
    i.line([[5.4, 19.4], [8, 21], [12, 20], [16, 21.4]], 1.1, 'silk');
    return i;
  },
  wax: i => { i.poly([[5, 18], [4.6, 12], [8, 7.6], [13, 6], [17.4, 8], [20, 13], [19.4, 19], [16, 20.6], [8, 20.6]], 'wax', { form: 'dome' }); i.ellipse(10, 11, 2, 1.4, 'wax'); return i; },
  tusk: i => { i.poly([[3.4, 18], [7, 21], [12.6, 18.4], [17.4, 12.4], [20.6, 3], [15, 10], [9.6, 14.4]], 'ivory', { form: 'dome' }); i.rect(2.6, 17, 6.6, 21.4, 'rind', { form: 'pillow', bevel: 1.5 }); return i; },
  hide: i => {
    i.poly([[4, 6], [9, 4], [15, 4], [20, 6], [21.4, 12], [20, 19], [15, 21], [9, 21], [4, 19], [2.6, 12]], 'hide', { form: 'pillow', bevel: 4 });
    i.poly([[6.4, 8], [10, 6.6], [14, 6.6], [17.6, 8], [18.8, 12], [17.6, 17], [14, 18.6], [10, 18.6], [6.4, 17], [5.2, 12]], 'leather', { form: 'pillow', bevel: 3 });
    for (const [a, b] of [[[8, 10], [10, 9]], [[13, 11], [15, 9]], [[9, 15], [11, 14]], [[14, 16], [16, 14]]] as [V2, V2][]) i.markLine(a, b, { dt: 1 });
    return i;
  },
  // Valuables.
  gold: i => { coin(i, 'gold', 15, 9.8, 6.2, 0.95); for (const y of [18.6, 16.4, 14.2]) coin(i, 'gold', 8.6, y, 5.4, 0.42); coin(i, 'gold', 17.4, 18.8, 4.4, 0.42); return i; },
  crown: i => { coin(i, 'silver', 12, 11.6, 9); i.poly(mirror([[12, 7.6], [9.4, 9], [8, 8], [8.6, 14.6], [12, 14.6]]), 'silver', { form: 'pillow', bevel: 1.2 }); return i; },
  garnet: i => { i.ellipse(12, 12.6, 8, 7, 'garnet', { form: 'dome' }); return i; },
  sapphire: i => crystal(i, 'sapphire', 12, 2.4, 22, 5.6),
  amethyst: i => { crystal(i, 'amethyst', 8.4, 8, 22, 3.8); crystal(i, 'amethyst', 16, 6, 22, 3.8); crystal(i, 'amethyst', 12, 2.6, 22.4, 4.4); return i; },
  emerald: i => {
    i.poly([[6, 4], [18, 4], [20.5, 7], [20.5, 17], [18, 20], [6, 20], [3.5, 17], [3.5, 7]], 'emerald', { form: 'flat', tilt: [0.2, 0.3] });
    i.poly([[3.5, 7], [6, 4], [18, 4], [20.5, 7], [17, 8], [7, 8]], 'emerald', { form: 'flat', tilt: [-0.3, -0.9] });
    i.poly([[3.5, 7], [7, 8], [7, 16], [3.5, 17]], 'emerald', { form: 'flat', tilt: [-0.9, -0.2] });
    i.rect(7, 8, 17, 16, 'emerald', { form: 'flat' });
    return i;
  },
  amberstone: i => { i.poly([[12, 3], [16.6, 9], [18, 15], [15, 20.6], [9, 20.6], [6, 15], [7.4, 9]], 'amber', { form: 'dome' }); i.mark(11, 14, { mat: 'darkwood', tone: 3 }); i.mark(12, 15, { mat: 'darkwood', tone: 3 }); return i; },
  pearl: i => { i.ellipse(12, 15, 4.4, 2.2, 'chitin', { form: 'pillow' }); i.ellipse(12, 11.4, 6.6, 6.6, 'pearl'); return i; },
  copperring: i => ring(i, 'copper'),
  silverring: i => ring(i, 'silver', 'garnet'),
  goldring: i => ring(i, 'gold', 'sapphire'),
  brooch: i => {
    i.line([[3, 15], [21, 9]], 1.2, 'iron');
    i.ellipse(12, 12, 8.4, 7.4, 'gold', { form: 'pillow' });
    i.ellipse(12, 12, 4.4, 3.8, 'emerald');
    for (const [x, y] of [[12, 6], [12, 18], [6, 12], [18, 12]] as const) i.mark(x, y, { tone: 6 });
    return i;
  },
  locket: i => {
    i.ring(12, 6.4, 3.4, 1, 'gold', { ry: 3.8 });
    i.ellipse(12, 15.6, 6, 6.6, 'gold');
    i.ring(12, 15.6, 4, 0.9, 'gold');
    return i;
  },
  // Curiosities.
  key: i => { i.ring(7, 7.4, 4, 2.2, 'rust'); i.line([[9.8, 10.2], [19.6, 20]], 2.2, 'rust'); i.poly([[15.4, 18.4], [17.2, 16.6], [19.6, 19], [17.8, 20.8]], 'rust', { form: 'pillow', bevel: 1 }); i.poly([[17.8, 14], [19.6, 12.2], [21, 13.6], [19.2, 15.4]], 'rust', { form: 'pillow', bevel: 1 }); return i; },
  tinsoldier: i => {
    i.rect(8.6, 20, 15.4, 22, 'iron', { form: 'pillow', bevel: 1 });
    i.rect(9.4, 13, 11.6, 20, 'blue', { form: 'pillow', bevel: 1 }); i.rect(12.4, 13, 14.6, 20, 'blue', { form: 'pillow', bevel: 1 });
    i.rect(8.8, 7, 15.2, 14, 'felt', { form: 'pillow', bevel: 2 });
    i.ellipse(12, 5.4, 2.4, 2.4, 'linen');
    i.rect(9.6, 0.8, 14.4, 4.2, 'dark', { form: 'pillow', bevel: 1 });
    i.line([[17, 2], [17, 16]], 1.2, 'iron');
    for (const y of [9, 11]) i.mark(12, y, { mat: 'gold', tone: 5 });
    return i;
  },
  idol: i => {
    i.poly(mirror([[12, 2.4], [9, 3.4], [8, 7.4], [9.4, 9.6], [7, 11], [6.4, 17], [8, 21.4], [12, 21.4]]), 'bone', { form: 'dome' });
    i.mark(10, 6, { tone: 0 }); i.mark(13, 6, { tone: 0 }); i.markLine([10, 8], [13, 8], { tone: 1 });
    i.markLine([9, 14], [14, 14], { tone: 1 }); i.markLine([9, 17], [14, 17], { tone: 1 });
    return i;
  },
  glasseye: i => { i.ellipse(12, 12, 8.6, 8.6, 'pearl'); i.ellipse(14, 13, 3.8, 3.8, 'bluedrop', { form: 'flat', tilt: [0.3, 0.2] }); i.ellipse(14.4, 13.2, 1.6, 1.6, 'dark', { form: 'flat' }); return i; },
  mapscrap: i => {
    i.poly([[3, 5], [8, 3.4], [13, 5], [17, 3], [21, 5], [20, 11], [21.4, 17], [19, 21], [13, 19.6], [9, 21], [4, 19.4], [4.4, 13]], 'paper', { form: 'pillow', bevel: 3 });
    i.markLine([6, 9], [11, 12], { mat: 'leather', tone: 3 }); i.markLine([11, 12], [14, 10], { mat: 'leather', tone: 3 }); i.markLine([14, 10], [18, 15], { mat: 'leather', tone: 3 });
    i.markLine([16, 13], [18, 15], { mat: 'felt', tone: 3 }); i.markLine([18, 13], [16, 15], { mat: 'felt', tone: 3 });
    return i;
  },
};
