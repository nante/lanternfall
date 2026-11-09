// Fixed-seed behaviour scenarios captured before balance data moved into content/balance.json.
// The engine must reproduce these numbers exactly after the migration.
import type { Engine } from '../packages/game/src/engine.ts';
import type { Hero } from '../packages/game/src/model.ts';

export type Factory = () => Engine;
const seeds = [1, 7, 42, 1234, 99991];
const xpAt = (l: number) => Math.floor((50 * (l - 1) ** 3 - 150 * (l - 1) ** 2 + 400 * (l - 1)) / 3);

function placeNear(e: Engine, p: Hero, kind: string) {
  const m = Object.values(e.state.monsters).find(m => m.kind === kind)!;
  Object.assign(p, e.geo.near({ x: m.x + 1, y: m.y, z: m.z }, q => e.occupied(q, p.id)));
  return m;
}

export function fightScenarios(make: Factory) {
  const out: Record<string, unknown>[] = [];
  for (const [kind, lvl] of [['gutterRat', 1], ['caveBeetle', 2], ['mireGrub', 6], ['thornboar', 4]] as const) for (const seed of seeds) {
    const e = make();
    e.state.rng = seed;
    const p = e.createPlayer('Probe');
    p.xp = xpAt(lvl);
    const m = placeNear(e, p, kind);
    e.action(p, { kind: 'target', id: m.id });
    let ticks = 0;
    while (ticks < 1200 && m.hp > 0 && p.deaths === 0) { e.tick(); ticks++; }
    const loot = Object.values(e.state.items).filter(i => e.state.corpses[i.parent]?.kind === kind).map(i => `${i.kind}:${i.count}`).sort();
    out.push({ kind, seed, ticks, hp: p.hp, xp: p.xp, melee: p.melee, shielding: p.shielding, deaths: p.deaths, mobHp: m.hp, rng: e.state.rng, loot });
  }
  return out;
}

export function spellScenarios(make: Factory) {
  const out: Record<string, unknown>[] = [];
  for (const seed of seeds) {
    const e = make();
    e.state.rng = seed;
    const p = e.createPlayer('Caster');
    p.xp = xpAt(9); p.magic = 500; p.mana = 200; p.hp = 40;
    e.action(p, { kind: 'cast', spell: 'mend' });
    const mend = p.hp;
    p.hp = 40; p.spellAt = 0;
    e.action(p, { kind: 'cast', spell: 'renew' });
    const renew = p.hp;
    const m = placeNear(e, p, 'mireGrub');
    p.spellAt = 0;
    e.action(p, { kind: 'target', id: m.id });
    e.action(p, { kind: 'cast', spell: 'ember' });
    out.push({ seed, mend, renew, emberMobHp: m.hp, mana: p.mana, magic: p.magic, rng: e.state.rng });
  }
  return out;
}
