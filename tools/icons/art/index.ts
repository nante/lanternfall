import type { Icon } from '../raster.ts';
import { weapons } from './weapons.ts';
import { armour } from './armour.ts';
import { goods } from './goods.ts';
import { spells, ui } from './interface.ts';

/** Every icon by name: a drawing program each. Item icons are named after their item kind. */
export const art: Record<string, (i: Icon) => Icon> = { ...weapons, ...armour, ...goods, ...spells, ...ui };
