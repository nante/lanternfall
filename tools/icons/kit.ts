import type { MatId } from './materials.ts';
import type { Icon, V2 } from './raster.ts';

/**
 * A frame along a diagonal: t runs along the item from `origin` towards `angle` (radians, 0 = right, −π/4 = up-right),
 * s runs across it (positive to the right of the direction of travel). Weapons are drawn in it.
 */
export function frame(origin: V2, angle = -Math.PI / 4) {
  const a: V2 = [Math.cos(angle), Math.sin(angle)], p: V2 = [-a[1], a[0]];
  return (t: number, s = 0): V2 => [origin[0] + a[0] * t + p[0] * s, origin[1] + a[1] * t + p[1] * s];
}

export type Tier = { metal: MatId; trim: MatId; grip: MatId; wood: MatId };
/** Metal tiers, rough to fine. A family's tiers share a silhouette and change material, with small shape steps. */
export const tiers = {
  rough: { metal: 'rust', trim: 'rust', grip: 'leather', wood: 'darkwood' },
  iron: { metal: 'iron', trim: 'iron', grip: 'leather', wood: 'wood' },
  steel: { metal: 'steel', trim: 'steel', grip: 'redleather', wood: 'wood' },
  dark: { metal: 'dark', trim: 'bronze', grip: 'leather', wood: 'darkwood' },
  gilded: { metal: 'steel', trim: 'gold', grip: 'purple', wood: 'oak' },
} satisfies Record<string, Tier>;

/** A straight blade: grip, pommel, crossguard and a ridged blade to a point. */
export function sword(i: Icon, o: { tier: Tier; len: number; width: number; guard: number; grip?: number; origin?: V2; taper?: number; fuller?: boolean; pommel?: number }) {
  const f = frame(o.origin ?? [4.2, 19.8]), g = o.grip ?? 4, w = o.width, start = g + 1.4, taper = o.taper ?? 0.75;
  i.line([f(0.8), f(g)], 2.2, o.tier.grip);
  i.ellipse(...f(0.2), o.pommel ?? 1.5, o.pommel ?? 1.5, o.tier.trim);
  i.poly([f(start, -w), f(start + (o.len - start) * taper, -w * 0.92), f(o.len, 0), f(start + (o.len - start) * taper, w * 0.92), f(start, w)], o.tier.metal, { form: 'ridge', ridge: [f(start), f(o.len)], axis: [1, -1] });
  if (o.fuller) i.markLine(f(start + 1.2, 0), f(start + (o.len - start) * 0.62, 0), { dt: -1 });
  i.line([f(g + 0.6, -o.guard), f(g + 0.6, o.guard)], 1.9, o.tier.trim, { sep: true });
  return i;
}
/** A haft with a head near its top: maces, axes, hammers. */
export function haft(i: Icon, o: { mat: MatId; len: number; width?: number; origin?: V2; grip?: MatId }) {
  const f = frame(o.origin ?? [4, 20]);
  i.line([f(0), f(o.len)], o.width ?? 2.1, o.mat);
  if (o.grip) i.line([f(0.4), f(4.2)], (o.width ?? 2.1) + 0.5, o.grip);
  return f;
}
/** A bottle: glass body, liquid inside, a neck and a stopper. `shape` picks the body. */
export function bottle(i: Icon, o: { liquid: MatId; shape: 'vial' | 'flask' | 'round'; fill?: number; stopper?: MatId }) {
  const cx = 12;
  if (o.shape === 'vial') {
    i.rect(8.5, 9, 15.5, 21, 'glass', { form: 'pillow', bevel: 3 });
    i.rect(9.5, 12.5 + (1 - (o.fill ?? 1)) * 6, 14.5, 20, o.liquid, { form: 'pillow', bevel: 2.5 });
    i.rect(9.5, 5.5, 14.5, 9.2, 'glass', { form: 'pillow', bevel: 2 });
    i.rect(9.5, 2.5, 14.5, 6, o.stopper ?? 'oak', { form: 'pillow', bevel: 2 });
  } else if (o.shape === 'flask') {
    i.poly([[cx - 2.5, 7], [cx + 2.5, 7], [cx + 2.5, 10], [cx + 7.5, 16], [cx + 7, 21.5], [cx - 7, 21.5], [cx - 7.5, 16], [cx - 2.5, 10]], 'glass', { form: 'dome' });
    i.poly([[cx - 4.8, 13.2], [cx + 4.8, 13.2], [cx + 6.3, 16.2], [cx + 5.9, 20.4], [cx - 5.9, 20.4], [cx - 6.3, 16.2]], o.liquid, { form: 'dome' });
    i.rect(cx - 2.5, 4, cx + 2.5, 8, 'glass', { form: 'pillow', bevel: 2 });
    i.rect(cx - 3, 1.6, cx + 3, 4.6, o.stopper ?? 'oak', { form: 'pillow', bevel: 2 });
  } else {
    i.ellipse(cx, 14.6, 8.2, 7.8, 'glass');
    i.ellipse(cx, 15.8, 6.9, 6.2, o.liquid);
    i.rect(cx - 2.5, 3.6, cx + 2.5, 8, 'glass', { form: 'pillow', bevel: 2 });
    i.rect(cx - 3.2, 1.4, cx + 3.2, 4.2, o.stopper ?? 'oak', { form: 'pillow', bevel: 2 });
  }
  return i;
}
