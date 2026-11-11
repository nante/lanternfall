import type { Icon } from '../raster.ts';
import { goods } from './goods.ts';

type Draw = (i: Icon) => Icon;

/** Spell icons in the Lantern's teal (magic) and fire; HUD buttons in parchment. */
export const spells: Record<string, Draw> = {
  mend: i => {
    i.ellipse(12, 12, 9.6, 9.6, 'magic', { form: 'pillow' });
    i.rect(10, 4.6, 14, 19.4, 'linen', { form: 'pillow', bevel: 1.5 });
    i.rect(4.6, 10, 19.4, 14, 'linen', { form: 'pillow', bevel: 1.5 });
    return i;
  },
  ember: i => {
    i.poly([[12, 1.6], [15, 6], [18.6, 9], [19.4, 15], [16.6, 20.4], [12, 22], [7.4, 20.4], [4.6, 15], [6, 9.6], [8.4, 11], [9, 6]], 'flame', { form: 'dome' });
    i.ellipse(12, 15.6, 4.6, 5.2, 'flame');
    return i;
  },
  renew: i => {
    i.ring(12, 12, 8, 2.6, 'magic');
    i.poly([[12, 5], [16.4, 10], [15, 16.6], [12, 19], [9, 16.6], [7.6, 10]], 'leaf', { form: 'ridge', ridge: [[12, 5], [12, 19]] });
    return i;
  },
  cinderburst: i => {
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; i.ellipse(12 + Math.cos(a) * 7.6, 12 + Math.sin(a) * 7.6, 2.8, 2.8, 'flame'); }
    i.ellipse(12, 12, 3.6, 3.6, 'flame');
    return i;
  },
};
export const ui: Record<string, Draw> = {
  bag: goods.pack,
  person: i => {
    i.poly([[3, 22], [4.4, 16], [8, 13.6], [16, 13.6], [19.6, 16], [21, 22]], 'ink', { form: 'pillow', bevel: 4 });
    i.ellipse(12, 7.6, 4.6, 5, 'ink');
    return i;
  },
  menu: i => { for (const y of [5, 11, 17]) i.rect(3.5, y, 20.5, y + 3, 'ink', { form: 'pillow', bevel: 1.5 }); return i; },
};
