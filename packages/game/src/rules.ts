import type { Balance, ItemDef } from './content-schema.ts';
import type { ItemKind } from './ids.ts';

export type Rules = ReturnType<typeof createRules>;

/** Formulas derived from one balance snapshot. Engine, client HUD and Studio all read numbers through this. */
export function createRules(balance: Balance) {
  const p = balance.progression;
  const [a, b, c] = p.xpCurve;
  const xpAt = (l: number) => Math.floor((a * (l - 1) ** 3 + b * (l - 1) ** 2 + c * (l - 1)) / 3);
  const triesFor = (base: number, s: number) => Math.ceil(base * p.skillGrowth ** (s - 10));
  const skill = (tries: number, base: number) => {
    let s = 10;
    while (tries >= triesFor(base, s)) { tries -= triesFor(base, s); s++; }
    return { level: s, progress: tries / triesFor(base, s) };
  };
  /** Mana to go from magic level m to m+1: base × growth^m, each level computed directly (no compounding rounding). */
  const magicNeed = (m: number) => Math.ceil(p.magicBase * p.magicGrowth ** m);
  /** Fewest tries that reach skill level `s` (10 is the starting level). */
  const skillStart = (s: number, base: number) => { let t = 0; for (let k = 10; k < s; k++) t += triesFor(base, k); return t; };
  return {
    balance,
    item: (kind: ItemKind): ItemDef => balance.items[kind],
    xpAt,
    level(xp: number) { let l = 1; while (xp >= xpAt(l + 1)) l++; return l; },
    maxHP: (l: number) => p.hpBase + p.hpPerLevel * (l - 1),
    maxMana: (l: number) => p.manaBase + p.manaPerLevel * (l - 1),
    capacity: (l: number) => p.capBase + p.capPerLevel * (l - 1),
    melee: (tries: number) => skill(tries, p.meleeSkillBase),
    shielding: (tries: number) => skill(tries, p.shieldSkillBase),
    meleeAt: (s: number) => skillStart(s, p.meleeSkillBase),
    shieldingAt: (s: number) => skillStart(s, p.shieldSkillBase),
    /** Least mana spent that reaches magic level `m`. */
    magicAt(m: number) { let spent = 0; for (let k = 0; k < m; k++) spent += magicNeed(k); return spent; },
    /** Movement: ms for one step onto `ground` at `speed` (7.6 rule, rounded up to 50 ms). */
    stepMs(speed: number, ground: string, diagonal: boolean) {
      const w = balance.world, g = w.groundSpeed[ground] ?? 100;
      return Math.ceil(((1000 * g) / speed) * (diagonal ? w.diagonalCost : 1) / 50) * 50;
    },
    heroSpeed: (level: number) => balance.world.speedBase + balance.world.speedPerLevel * level,
    /** Creatures' `step` is their ms per tile on even ground (speed 100). */
    creatureStepMs(step: number, ground: string, diagonal: boolean) {
      const w = balance.world, g = w.groundSpeed[ground] ?? 100;
      return Math.ceil((step * g / 100) * (diagonal ? w.diagonalCost : 1) / 50) * 50;
    },
    magic(spent: number) {
      let m = 0;
      while (spent >= magicNeed(m)) { spent -= magicNeed(m); m++; }
      return { level: m, progress: spent / magicNeed(m) };
    },
  };
}
