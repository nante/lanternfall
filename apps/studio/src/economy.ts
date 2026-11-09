import type { Balance } from '../../../packages/game/src/content-schema.ts';
import type { ItemKind, MobKind } from '../../../packages/game/src/ids.ts';

export const sellersOf = (b: Balance, item: ItemKind) => Object.entries(b.merchants).filter(([, m]) => m.sells.includes(item)).map(([r]) => r);
export const buyersOf = (b: Balance, item: ItemKind) => Object.entries(b.merchants).filter(([, m]) => m.buys.includes(item)).map(([r]) => r);

/** Ideal coins per kill: mean gold plus expected value of drops that some merchant actually buys. */
export function cashPerKill(b: Balance, mob: MobKind) {
  const c = b.creatures[mob];
  const gold = (c.gold[0] + c.gold[1]) / 2;
  const drops = c.loot.map(l => ({ ...l, value: buyersOf(b, l.item).length ? l.chance * b.items[l.item].sell : 0, sold: buyersOf(b, l.item).length > 0 }));
  return { gold, drops, total: gold + drops.reduce((n, d) => n + d.value, 0) };
}
export const killsToAfford = (price: number, perKill: number) => (perKill > 0 ? Math.ceil(price / perKill) : Infinity);

export const roleNames: Record<string, string> = { shrine: 'Sister Wren', smith: 'Brann (smith)', inn: 'Mabel (inn)', apothecary: 'Odo (apothecary)', store: 'Pell (provisions)', warden: 'Warden Corin' };
