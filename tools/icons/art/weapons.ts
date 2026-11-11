import type { MatId } from '../materials.ts';
import type { Icon, V2 } from '../raster.ts';
import { frame, haft, sword, tiers, type Tier } from '../kit.ts';

type Draw = (i: Icon) => Icon;

/** A stick that thickens towards its head, with knots: the wooden clubs. */
function club(i: Icon, o: { wood: MatId; grip: MatId; len: number; head: number; knots: V2[]; studs?: boolean }) {
  const f = frame([3.8, 20.2]);
  i.poly([f(0, -1.2), f(o.len - o.head, -o.head * 0.62), f(o.len - 0.6, -o.head * 0.5), f(o.len + 0.4, 0), f(o.len - 0.6, o.head * 0.5), f(o.len - o.head, o.head * 0.62), f(0, 1.2)], o.wood, { form: 'pillow', bevel: o.head * 0.7, axis: [1, -1] });
  i.line([f(0.2), f(3.6)], 2.8, o.grip);
  for (const [t, s] of o.knots) i.ellipse(...f(t, s), 1.1, 1.1, o.wood);
  if (o.studs) for (const [t, s] of [[o.len - 2.5, -1.8], [o.len - 4.5, 1.8], [o.len - 6.5, -1.4], [o.len - 2, 1.5]] as const) i.ellipse(...f(t, s), 0.9, 0.9, 'iron');
  return i;
}
/** A mace: haft, grip and a round head; flanged maces get blades round the head. */
function mace(i: Icon, o: { tier: Tier; r: number; flanges?: number; len?: number }) {
  const len = o.len ?? 16.5, f = haft(i, { mat: o.tier.wood, len, grip: o.tier.grip, origin: [3.6, 20.4] });
  const h = f(len + o.r * 0.6);
  if (o.flanges) for (let k = 0; k < o.flanges; k++) {
    const a = (k / o.flanges) * Math.PI * 2 + 0.4, d: V2 = [Math.cos(a), Math.sin(a)], q: V2 = [-d[1], d[0]];
    const p = (r: number, s: number): V2 => [h[0] + d[0] * r + q[0] * s, h[1] + d[1] * r + q[1] * s];
    i.poly([p(o.r * 0.4, -1), p(o.r + 1.8, -0.7), p(o.r + 2.1, 0.6), p(o.r * 0.4, 1)], o.tier.metal, { form: 'pillow', bevel: 1.2 });
  }
  i.ellipse(...h, o.r, o.r, o.tier.metal);
  i.ellipse(...f(len - 1.2), 1.7, 1.7, o.tier.trim);
  return i;
}
/** An axe: haft and a head on the upper-left side of the haft, flaring to a curved edge; `beard` draws it down along the haft. */
function axe(i: Icon, o: { tier: Tier; len: number; reach: number; spread: number; beard?: number; double?: boolean }) {
  const f = haft(i, { mat: o.tier.wood, len: o.len, grip: o.tier.grip, origin: [5.4, 21.2] });
  const c = o.len - 2.6, b = o.beard ?? 0, sp = o.spread;
  const head = (k: number): V2[] => [f(c + 1.4, -1.2 * k), f(c + 0.9, -3 * k), f(c + sp / 2, -o.reach * k), f(c + sp * 0.2, -(o.reach + 0.9) * k), f(c - sp * 0.2 - b * 0.4, -(o.reach + 0.9) * k), f(c - sp / 2 - b, -(o.reach - 0.2) * k), f(c - 1.2 - b * 0.7, -3 * k), f(c - 1.6, -1.2 * k)];
  i.poly(head(1), o.tier.metal, { form: 'ridge', ridge: [f(c + sp / 2, -o.reach + 1.4), f(c - sp / 2 - b, -o.reach + 1.4)], bevel: 1.5 });
  if (o.double) i.poly(head(-1), o.tier.metal, { form: 'ridge', ridge: [f(c - sp / 2, o.reach - 1.4), f(c + sp / 2, o.reach - 1.4)], bevel: 1.5 });
  else i.poly([f(c + 1, 1), f(c, 3.4), f(c - 1, 1)], o.tier.metal, { form: 'pillow', bevel: 1 });
  i.line([f(c - 2), f(c + 1.9)], 2.9, o.tier.trim, { sep: true });
  i.line([f(c + 2.2), f(o.len + 0.4)], 1.9, o.tier.wood);
  return i;
}
/** A spear: a long shaft corner to corner and a leaf-shaped head; lugs below the head on a boar spear. */
function spear(i: Icon, o: { tier: Tier; head: number; width: number; lugs?: boolean; blade?: boolean }) {
  const f = frame([2.6, 21.4]), base = 21.5 - o.head;
  i.line([f(0), f(base + 0.5)], 1.8, o.tier.wood);
  if (o.blade) { i.poly([f(base - 4.4, -1), f(base - 5.6, -6.8), f(base - 2, -7.6), f(base + 1.6, -6.6), f(base + 0.6, -1)], o.tier.metal, { form: 'pillow', bevel: 2 }); i.poly([f(base - 3.4, 1), f(base - 3.2, 3.6), f(base - 1.2, 1)], o.tier.metal, { form: 'pillow', bevel: 1 }); }
  i.poly([f(base, -0.9), f(base + o.head * 0.35, -o.width), f(21.5, 0), f(base + o.head * 0.35, o.width), f(base, 0.9)], o.tier.metal, { form: 'ridge', ridge: [f(base), f(21.5)] });
  if (o.lugs) i.line([f(base - 0.6, -2.4), f(base - 0.6, 2.4)], 1.5, o.tier.trim, { sep: true });
  i.line([f(base - 1.6), f(base + 0.3)], 2.5, o.tier.trim);
  if (o.tier.grip) i.line([f(6), f(9)], 2.3, o.tier.grip);
  return i;
}

export const weapons: Record<string, Draw> = {
  cudgel: i => club(i, { wood: 'oak', grip: 'leather', len: 19, head: 3, knots: [[11, -1.8]] }),
  club: i => club(i, { wood: 'wood', grip: 'rope', len: 21, head: 4, knots: [[10, 1.8], [15, -2.6], [18.5, 2.4]], studs: true }),
  mace: i => mace(i, { tier: tiers.iron, r: 3.9 }),
  flangedmace: i => mace(i, { tier: tiers.steel, r: 3.2, flanges: 6, len: 15.5 }),
  maul: i => {
    const f = haft(i, { mat: 'oak', len: 17, grip: 'purple', origin: [3.4, 20.6] });
    i.poly([f(14.4, -6), f(20.6, -6), f(20.6, 6), f(14.4, 6)], 'steel', { form: 'pillow', bevel: 2.4 });
    i.line([f(14.6, -6.1), f(14.6, 6.1)], 1.5, 'gold', { sep: true });
    i.line([f(20.4, -6.1), f(20.4, 6.1)], 1.5, 'gold', { sep: true });
    return i;
  },
  rustsword: i => {
    sword(i, { tier: tiers.rough, len: 21, width: 2, guard: 3.2, origin: [3.4, 20.6] });
    const f = frame([3.4, 20.6]);
    for (const t of [9, 13, 16.5]) i.mark(...f(t, 1.4).map(Math.floor) as [number, number], { tone: 1 });
    return i;
  },
  shortsword: i => sword(i, { tier: tiers.iron, len: 22, width: 2.1, guard: 3.6, fuller: true, origin: [3.4, 20.6] }),
  broadsword: i => sword(i, { tier: tiers.steel, len: 23.4, width: 2.7, guard: 4.2, fuller: true, origin: [3.2, 20.8], taper: 0.85 }),
  blade: i => sword(i, { tier: { metal: 'steel', trim: 'gold', grip: 'leather', wood: 'wood' }, len: 24.6, width: 2.2, guard: 4.4, fuller: true, grip: 4.8, origin: [2.8, 21.2] }),
  longsword: i => sword(i, { tier: tiers.gilded, len: 25.6, width: 2.4, guard: 4.8, fuller: true, grip: 5.2, origin: [2.6, 21.4], pommel: 1.8 }),
  dawnblade: i => sword(i, { tier: { metal: 'silver', trim: 'gold', grip: 'blue', wood: 'oak' }, len: 26, width: 2.8, guard: 5, fuller: true, grip: 5.2, origin: [2.6, 21.4], taper: 0.6, pommel: 1.9 }),
  hatchet: i => axe(i, { tier: tiers.iron, len: 17, reach: 6.2, spread: 6.4 }),
  beardedaxe: i => axe(i, { tier: tiers.steel, len: 17.6, reach: 7, spread: 6.4, beard: 3 }),
  broadaxe: i => axe(i, { tier: tiers.dark, len: 18, reach: 8, spread: 9.6 }),
  greataxe: i => axe(i, { tier: tiers.gilded, len: 18, reach: 6.4, spread: 8.6, double: true }),
  knife: i => sword(i, { tier: { metal: 'iron', trim: 'wood', grip: 'wood', wood: 'wood' }, len: 16, width: 1.9, guard: 1.8, grip: 5, origin: [4.4, 19.6], taper: 0.5 }),
  dagger: i => sword(i, { tier: tiers.iron, len: 17.6, width: 2.1, guard: 3.4, grip: 4.4, origin: [4, 20], fuller: true }),
  dirk: i => sword(i, { tier: { metal: 'steel', trim: 'bronze', grip: 'redleather', wood: 'wood' }, len: 19, width: 2.2, guard: 3.6, grip: 4.8, origin: [3.6, 20.4], fuller: true, taper: 0.4 }),
  spear: i => spear(i, { tier: { ...tiers.iron, wood: 'oak', grip: 'leather' }, head: 6, width: 1.9 }),
  boarspear: i => spear(i, { tier: { ...tiers.steel, wood: 'wood', grip: 'leather' }, head: 7, width: 2.4, lugs: true }),
  halberd: i => spear(i, { tier: { ...tiers.dark, wood: 'darkwood', grip: 'redleather' }, head: 5.5, width: 1.6, blade: true }),
  torch: i => {
    const f = frame([5, 20.5], -Math.PI / 3);
    i.line([f(0), f(12.5)], 2.4, 'wood');
    i.line([f(10), f(13.5)], 3.6, 'rope');
    i.ellipse(...f(15.6), 3.6, 4.6, 'flame', { rot: -0.5 });
    i.poly([f(15, -3.4), f(19.8, -1.6), f(22.5, 0.6), f(18.4, 2.6), f(14.6, 3.4)], 'flame', { form: 'dome' });
    i.ellipse(...f(15.4, 0.3), 2.2, 2.8, 'flame', { rot: -0.5 });
    return i;
  },
};
