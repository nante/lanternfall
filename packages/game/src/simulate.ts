// Headless fights on the real Engine: one hero against one creature in a 7×7 arena.
import { Engine } from './engine.ts';
import type { Balance } from './content-schema.ts';
import { createRules } from './rules.ts';
import { equipSlots, type EquipSlot, type ItemKind, type MobKind } from './ids.ts';
import { G, T, type MapData } from './model.ts';

export type Scenario = {
  mob: MobKind; level: number; meleeSkill: number; shieldSkill: number; magicLevel: number;
  equipment: Partial<Record<Exclude<EquipSlot, 'pack'>, ItemKind>>;
  hpFraction: number; fedMs: number;
};
export type Trial = {
  seed: number; outcome: 'win' | 'death' | 'timeout'; ms: number; damageTaken: number; endHp: number;
  xp: number; meleeGain: number; shieldGain: number; loot: Partial<Record<ItemKind, number>>; rng: number;
};
export type Summary = {
  trials: number; wins: number; deaths: number; timeouts: number;
  ttk: Stats | null; damage: Stats | null; endHp: Stats | null; xpPerWin: number; lootPerWin: Partial<Record<ItemKind, number>>;
  ttkHistogram: number[]; maxHp: number;
};
export type Stats = { mean: number; median: number; p90: number; min: number; max: number };

const SIZE = 7, TICK = 50, LIMIT_TICKS = 6000;
export function arenaMap(mob: MobKind): MapData {
  const floor = { ground: new Uint8Array(SIZE * SIZE).fill(G.grass), thing: new Uint8Array(SIZE * SIZE).fill(T.none), roof: new Int16Array(SIZE * SIZE).fill(-1) };
  return { name: 'Arena', width: SIZE, height: SIZE, floors: [floor], buildings: [], links: {}, npcs: [], places: [], spawns: [{ kind: mob, x: 4, y: 3, z: 0 }], shrine: { x: 0, y: 6, z: 0 }, vault: { x: 6, y: 6, z: 0 } };
}

/** Raw counters that produce a given skill level under these rules. */
export function triesForSkill(balance: Balance, base: number, level: number) {
  let tries = 0;
  for (let s = 10; s < level; s++) tries += Math.ceil(base * balance.progression.skillGrowth ** (s - 10));
  return tries;
}
export function manaForMagic(balance: Balance, level: number) {
  let spent = 0, need = balance.progression.magicBase;
  for (let m = 0; m < level; m++) spent += Math.ceil(balance.progression.magicBase * balance.progression.magicGrowth ** m);
  return spent;
}

export function runFight(balance: Balance, scenario: Scenario, seed: number): Trial {
  const map = arenaMap(scenario.mob);
  const e = new Engine(map, balance);
  const rules = e.rules;
  e.state.rng = seed >>> 0 || 1;
  const p = e.createPlayer('Sim');
  // Swap the starter equipment for the scenario's loadout; keep the pack.
  for (const item of e.children(`equip:${p.id}`)) if (item.slot !== equipSlots.indexOf('pack')) delete e.state.items[item.id];
  for (const [slot, kind] of Object.entries(scenario.equipment)) if (kind) e.add(kind, `equip:${p.id}`, equipSlots.indexOf(slot as EquipSlot));
  p.xp = rules.xpAt(scenario.level);
  p.melee = triesForSkill(balance, balance.progression.meleeSkillBase, scenario.meleeSkill);
  p.shielding = triesForSkill(balance, balance.progression.shieldSkillBase, scenario.shieldSkill);
  p.magic = manaForMagic(balance, scenario.magicLevel);
  const maxHp = rules.maxHP(scenario.level);
  p.hp = Math.max(1, Math.round(maxHp * scenario.hpFraction)); p.mana = rules.maxMana(scenario.level); p.fed = scenario.fedMs;
  Object.assign(p, { x: 3, y: 3, z: 0 });
  const mob = Object.values(e.state.monsters)[0];
  e.action(p, { kind: 'target', id: mob.id });
  const start = { xp: p.xp, melee: p.melee, shield: p.shielding };
  let ticks = 0, damage = 0, lastEffect = 0, outcome: Trial['outcome'] = 'timeout';
  while (ticks < LIMIT_TICKS) {
    const hero = { x: p.x, y: p.y }, foe = { x: mob.x, y: mob.y };
    e.tick(TICK); ticks++;
    for (const fx of e.effects) {
      if (fx.id <= lastEffect) continue;
      lastEffect = fx.id;
      if (fx.kind === 'hit' && fx.at.x === hero.x && fx.at.y === hero.y && fx.from?.x === foe.x && fx.from?.y === foe.y) damage += fx.value;
    }
    e.notices.length = 0;
    if (p.deaths > 0) { outcome = 'death'; break; }
    if (mob.hp <= 0) { outcome = 'win'; break; }
  }
  const loot: Trial['loot'] = {};
  if (outcome === 'win') for (const c of Object.values(e.state.corpses)) for (const i of e.children(c.id)) loot[i.kind] = (loot[i.kind] ?? 0) + i.count;
  return { seed, outcome, ms: ticks * TICK, damageTaken: damage, endHp: p.hp, xp: p.xp - start.xp, meleeGain: p.melee - start.melee, shieldGain: p.shielding - start.shield, loot, rng: e.state.rng };
}

const stats = (xs: number[]): Stats | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), at = (q: number) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { mean: xs.reduce((a, b) => a + b, 0) / xs.length, median: at(0.5), p90: at(0.9), min: s[0], max: s[s.length - 1] };
};
export function seedList(base: number, count: number) {
  const out: number[] = [];
  let x = base >>> 0 || 1;
  while (out.length < count) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; if (x) out.push(x); }
  return out;
}
export function summarize(balance: Balance, scenario: Scenario, trials: Trial[]): Summary {
  const wins = trials.filter(t => t.outcome === 'win');
  const lootPerWin: Summary['lootPerWin'] = {};
  for (const t of wins) for (const [k, n] of Object.entries(t.loot)) lootPerWin[k as ItemKind] = (lootPerWin[k as ItemKind] ?? 0) + n! / wins.length;
  const hist = Array(12).fill(0);
  for (const t of wins) hist[Math.min(11, Math.floor(t.ms / 5000))]++;
  return {
    trials: trials.length, wins: wins.length, deaths: trials.filter(t => t.outcome === 'death').length, timeouts: trials.filter(t => t.outcome === 'timeout').length,
    ttk: stats(wins.map(t => t.ms / 1000)), damage: stats(wins.map(t => t.damageTaken)), endHp: stats(wins.map(t => t.endHp)),
    xpPerWin: wins.length ? wins.reduce((n, t) => n + t.xp, 0) / wins.length : 0, lootPerWin, ttkHistogram: hist,
    maxHp: createRules(balance).maxHP(scenario.level),
  };
}
export function runBatch(balance: Balance, scenario: Scenario, seeds: number[]) {
  return summarize(balance, scenario, seeds.map(s => runFight(balance, scenario, s)));
}
