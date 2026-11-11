import type { MatId } from '../materials.ts';
import type { Icon, V2 } from '../raster.ts';
import { goods } from './goods.ts';
import { armour } from './armour.ts';
import { weapons } from './weapons.ts';

/**
 * Icons for the equipment slots the game does not have yet (legs, neck, ring, belt) and the doll's empty-slot
 * silhouettes. Registered as icons only: no item uses them until the ten-slot pass adds the kinds.
 */
type Draw = (i: Icon) => Icon;
const mirror = (half: V2[]): V2[] => [...half, ...[...half].reverse().map(([x, y]) => [24 - x, y] as V2)];

function legs(i: Icon, mat: MatId, o: { belt?: MatId; knee?: MatId; plates?: boolean }) {
  i.poly(mirror([[12, 3], [6, 3], [5, 10], [5.4, 21.6], [10.4, 21.6], [11, 11], [12, 9]]), mat, { form: 'pillow', bevel: 3.4, axis: [0, 1] });
  i.markLine([12, 9], [12, 3.6], { dt: -1 });
  if (o.belt) i.rect(5.4, 2.6, 18.6, 5, o.belt, { form: 'pillow', bevel: 1, sep: true });
  if (o.knee) for (const x of [7.9, 16.1]) i.ellipse(x, 14, 2.6, 2.2, o.knee);
  if (o.plates) for (const y of [8, 11, 17, 19.6]) i.markLine([5.6, y], [10.6, y], { dt: -1 });
  return i;
}
function ring(i: Icon, band: MatId, gem?: MatId, signet?: boolean) {
  i.ring(12, 14.5, 6.6, 2.4, band, { ry: 5.6 });
  if (signet) { i.ellipse(12, 7.6, 4.4, 3, band, { form: 'pillow' }); i.mark(11, 7, { dt: -2 }); i.mark(12, 8, { dt: -2 }); i.mark(13, 7, { dt: -2 }); }
  else if (gem) { i.ellipse(12, 7.6, 3.6, 2.4, band, { form: 'pillow' }); i.ellipse(12, 6.6, 2.6, 2.6, gem); }
  return i;
}
/** A cord or chain round the neck, drawn as the lower arc of a loop, and what hangs from it. */
function cord(i: Icon, mat: MatId, w = 1.2) { i.line([[4, 2.5], [5.6, 8], [8.4, 11.6], [12, 13], [15.6, 11.6], [18.4, 8], [20, 2.5]], w, mat, { form: 'flat' }); return i; }
function belt(i: Icon, strap: MatId, buckle: MatId, o: { studs?: MatId; knot?: boolean } = {}) {
  i.poly([[2.5, 9], [21.5, 7], [21.5, 13], [2.5, 15]], strap, { form: 'pillow', bevel: 2.2, axis: [1, 0] });
  if (o.knot) { i.ellipse(12, 12, 3.2, 3, strap); i.line([[11, 14], [9, 21]], 2.2, strap); i.line([[13, 14], [15, 20.5]], 2.2, strap); }
  else { i.ring(12, 11, 2.8, 1.4, buckle, { ry: 3.2 }); i.line([[12, 9], [12, 13]], 1, buckle, { form: 'flat' }); }
  if (o.studs) for (const x of [5, 8, 16, 19]) i.mark(x, x < 12 ? 12 : 10, { mat: o.studs, tone: 5 });
  return i;
}
const ghost = (draw: Draw): Draw => i => { draw(i); for (let k = 0; k < i.cells.length; k++) { const c = i.cells[k]; if (c) i.cells[k] = { ...c, mat: 'ghost', n: [0, 0, 1] }; } i.marks.length = 0; i.sep.clear(); return i; };

export const slots: Record<string, Draw> = {
  // Legs, in the body armour's tiers.
  trousers: i => legs(i, 'quilt', { belt: 'leather' }),
  leggings: i => legs(i, 'leather', { belt: 'darkwood', knee: 'darkwood' }),
  chausses: i => legs(i, 'mail', { belt: 'leather' }),
  scalelegs: i => { legs(i, 'bronze', { belt: 'leather' }); for (let y = 7; y <= 20; y += 2) for (const x of y % 4 ? [6, 8, 16, 18] : [7, 9, 15, 17]) i.mark(x, y, { dt: -2 }); return i; },
  greaves: i => legs(i, 'steel', { belt: 'gold', knee: 'steel', plates: true }),
  // Rings.
  ironring: i => ring(i, 'iron'),
  bonering: i => ring(i, 'bone'),
  signet: i => ring(i, 'gold', undefined, true),
  amethystring: i => ring(i, 'silver', 'amethyst'),
  emeraldring: i => ring(i, 'gold', 'emerald'),
  pearlring: i => ring(i, 'silver', 'pearl'),
  // Neck.
  toothcharm: i => { cord(i, 'rope'); i.poly([[10, 13], [14, 13], [12.6, 21], [11.4, 21]], 'ivory', { form: 'dome' }); return i; },
  beads: i => { for (let k = 0; k <= 8; k++) { const a = Math.PI * (0.08 + (k / 8) * 0.84); i.ellipse(12 + Math.cos(a) * 8.4, 5 + Math.sin(a) * 13.6, 1.7, 1.7, k % 2 ? 'amber' : 'wood'); } return i; },
  pendant: i => { cord(i, 'silver'); i.ellipse(12, 17, 3.6, 4.4, 'silver', { form: 'pillow' }); i.ellipse(12, 17, 2.2, 2.8, 'garnet'); return i; },
  torc: i => { i.ring(12, 11, 8.4, 2.6, 'bronze', { ry: 7.6 }); i.cutPoly([[8, 0], [16, 0], [14, 6], [10, 6]]); i.ellipse(8.8, 4.6, 1.8, 1.8, 'bronze'); i.ellipse(15.2, 4.6, 1.8, 1.8, 'bronze'); return i; },
  sigil: i => { cord(i, 'gold'); i.ellipse(12, 17, 4.6, 4.6, 'gold', { form: 'pillow' }); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; i.mark(Math.round(12 + Math.cos(a) * 2.4), Math.round(17 + Math.sin(a) * 2.4), { dt: -2 }); } return i; },
  // Belts and sashes.
  ropebelt: i => belt(i, 'rope', 'rope', { knot: true }),
  leatherbelt: i => belt(i, 'leather', 'iron'),
  studdedbelt: i => belt(i, 'darkwood', 'bronze', { studs: 'steel' }),
  sash: i => belt(i, 'felt', 'felt', { knot: true }),
  // The doll's empty slots: flat, faint silhouettes.
  slothead: ghost(armour.kettlehat),
  slotneck: ghost(i => { cord(i, 'ghost', 1.4); i.ellipse(12, 17, 3.6, 4.4, 'ghost'); return i; }),
  slotback: ghost(goods.pack),
  slotbody: ghost(armour.tunic),
  slotright: ghost(weapons.shortsword),
  slotleft: ghost(armour.heater),
  slotlegs: ghost(i => legs(i, 'ghost', {})),
  slotfeet: ghost(armour.boots),
  slotring: ghost(i => ring(i, 'ghost', 'ghost')),
  slotbelt: ghost(i => belt(i, 'ghost', 'ghost')),
};
