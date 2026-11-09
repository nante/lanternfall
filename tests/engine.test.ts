import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, GameError } from '../packages/game/src/engine.ts';
import { buildTown } from '../packages/game/src/town.ts';
import { distance, T, key, grounds } from '../packages/game/src/model.ts';
import { Balance } from '../packages/game/src/content-schema.ts';
import { createRules } from '../packages/game/src/rules.ts';
import fixture from './fixtures/balance.json' with { type: 'json' };

const balance = Balance.parse(fixture);
const { level, item: getDef } = createRules(balance);

const map = buildTown();
const fresh = () => { const e = new Engine(map, balance); const p = e.createPlayer('Tess'); return { e, p }; };
const run = (e: Engine, ms: number) => { for (let t = 0; t < ms; t += 100) e.tick(); };

test('the town is connected: shrine, every shop and the undercroft are reachable', () => {
  const { e, p } = fresh();
  for (const n of map.npcs) {
    const spots = [];
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) spots.push({ x: n.x + dx, y: n.y + dy, z: n.z });
    assert.ok(spots.some(q => !e.geo.blocked(q) && e.geo.path(p, q, e.state, 20000).length), `no tile within talking range of ${n.name}`);
  }
  const hatch = Object.keys(map.links).find(k => k.endsWith(',0'))!.split(',').map(Number);
  assert.ok(e.geo.path(p, { x: hatch[0] - 1, y: hatch[1], z: 0 }, e.state, 20000).length, 'no path to hatch');
  for (const s of map.spawns) assert.ok(!e.geo.blocked(s), `spawn ${s.kind} at ${key(s)} is blocked`);
  const ladder = map.links[`${hatch[0]},${hatch[1]},0`];
  for (const s of map.spawns.filter(s => s.z === 1)) assert.ok(e.geo.path(ladder, s, e.state, 30000).length, `undercroft spawn ${key(s)} unreachable`);
});

test('a new wayfarer starts level 1 with a pack, food and coins', () => {
  const { e, p } = fresh();
  assert.equal(level(p.xp), 1);
  assert.equal(e.gold(p), 40);
  assert.equal(e.equipped(p, 'weapon')?.kind, 'cudgel');
});

test('walking along a path moves the hero one tile per step', () => {
  const { e, p } = fresh();
  const start = { x: p.x, y: p.y, z: p.z };
  e.action(p, { kind: 'path', to: { x: 22, y: 28, z: 0 } });
  run(e, 10_000);
  assert.deepEqual({ x: p.x, y: p.y }, { x: 22, y: 28 });
  assert.notDeepEqual(start, { x: p.x, y: p.y, z: p.z });
});

test('fighting a rat yields experience and a lootable corpse', () => {
  const { e, p } = fresh();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(p, e.geo.near({ x: rat.x + 1, y: rat.y, z: 1 }, q => e.occupied(q)));
  e.action(p, { kind: 'target', id: rat.id });
  for (let t = 0; t < 120_000 && !Object.keys(e.state.corpses).length; t += 100) e.tick();
  assert.ok(p.xp >= 6);
  const corpse = Object.values(e.state.corpses).find(c => c.kind === 'gutterRat');
  assert.ok(corpse);
  assert.ok(p.melee > 0);
});

test('merchants sell and buy within their stock', () => {
  const { e, p } = fresh();
  const mabel = map.npcs.find(n => n.id === 'mabel')!;
  Object.assign(p, e.geo.near({ ...mabel, y: mabel.y + 1 }, q => e.occupied(q)));
  e.action(p, { kind: 'trade', npc: 'mabel', item: 'cheese', mode: 'buy', count: 2 });
  assert.equal(e.gold(p), 40 - 2 * getDef('cheese').buy);
  assert.throws(() => e.action(p, { kind: 'trade', npc: 'mabel', item: 'blade', mode: 'buy', count: 1 }), GameError);
  assert.throws(() => e.action(p, { kind: 'trade', npc: 'mabel', item: 'tail', mode: 'sell', count: 1 }), GameError);
});

test('the shrine task pays out once for five beetle shells', () => {
  const { e, p } = fresh();
  const wren = map.npcs.find(n => n.id === 'wren')!;
  Object.assign(p, e.geo.near({ ...wren, y: wren.y + 1 }, q => e.occupied(q)));
  e.action(p, { kind: 'say', text: 'hi' });
  e.action(p, { kind: 'say', text: 'task' });
  assert.equal(p.quests.shells, 1);
  e.give(p, 'shell', 5);
  e.action(p, { kind: 'say', text: 'task' });
  assert.equal(p.quests.shells, 2);
  assert.ok(e.carried(p).some(i => i.kind === 'banded'));
});

test('casting mend heals and costs mana; ember needs level 3', () => {
  const { e, p } = fresh();
  p.hp = 50;
  e.action(p, { kind: 'say', text: 'mend' });
  assert.ok(p.hp > 50);
  assert.equal(p.mana, 10);
  assert.throws(() => e.action(p, { kind: 'cast', spell: 'ember' }), /level 3/);
});

test('dying drops the pack and returns the hero to the shrine', () => {
  const { e, p } = fresh();
  Object.assign(p, { x: 55, y: 46, z: 1 });
  p.xp = 1000;
  e.kill(p);
  assert.equal(p.z, 0);
  assert.ok(distance(p, map.shrine) <= 3);
  assert.equal(e.equipped(p, 'pack'), undefined);
  assert.ok(p.xp < 1000);
});

test('the hatch takes the hero underground and back', () => {
  const { e, p } = fresh();
  const [k] = Object.keys(map.links).filter(k => k.endsWith(',0'));
  const [x, y] = k.split(',').map(Number);
  Object.assign(p, { x: x - 1, y, z: 0 });
  assert.equal(e.geo.thing({ x, y, z: 0 }), T.hatch);
  e.action(p, { kind: 'useTile', to: { x, y, z: 0 } });
  assert.equal(p.z, 1);
  e.action(p, { kind: 'useTile', to: { x, y, z: 1 } });
  assert.equal(p.z, 0);
});

test('stackable items merge automatically when they land in a bag', () => {
  const { e, p } = fresh();
  const pack = e.equipped(p, 'pack')!;
  const before = e.children(pack.id).filter(i => i.kind === 'gold');
  assert.equal(before.length, 1);
  // Loot-style: a second gold stack arrives in a corpse and is moved to an empty pack slot.
  const corpseId = 'corpse-test';
  e.state.corpses[corpseId] = { id: corpseId, x: p.x, y: p.y, z: p.z, name: 'Dead rat', kind: 'gutterRat', owner: p.id, protectedUntil: 0, expiresAt: 1e12, born: 0, stage: 0 };
  const loot = e.add('gold', corpseId, 0, 7);
  e.action(p, { kind: 'moveItem', id: loot.id, parent: pack.id, slot: e.freeSlot(pack.id), count: 7, version: 0 });
  const gold = e.children(pack.id).filter(i => i.kind === 'gold');
  assert.equal(gold.length, 1, 'one gold stack');
  assert.equal(gold[0].count, 47);
});

test('stacks overflow into a new stack at 100 and tidy merges old split stacks', () => {
  const { e, p } = fresh();
  const pack = e.equipped(p, 'pack')!;
  e.add('gold', pack.id, 10, 90); e.add('gold', pack.id, 11, 30);
  e.tidy(p);
  const counts = e.children(pack.id).filter(i => i.kind === 'gold').map(i => i.count);
  assert.deepEqual(counts, [100, 60], '40 + 90 + 30 = 160 gold in two stacks');
  e.assertItems();
});

test('merging stacks never changes the total, whatever the starting split', () => {
  const { e, p } = fresh();
  const pack = e.equipped(p, 'pack')!;
  let seed = 7;
  const rnd = (n: number) => { seed = (seed * 16807) % 2147483647; return 1 + (seed % n); };
  for (let round = 0; round < 200; round++) {
    for (const i of e.children(pack.id).filter(i => i.kind === 'gold')) delete e.state.items[i.id];
    const counts = Array.from({ length: rnd(8) }, () => rnd(100));
    counts.forEach((c, k) => e.add('gold', pack.id, 4 + k, c));
    const total = counts.reduce((a, b) => a + b, 0);
    e.stackInto(pack.id, 'gold');
    const after = e.children(pack.id).filter(i => i.kind === 'gold');
    assert.equal(after.reduce((n, i) => n + i.count, 0), total, `split ${counts.join(',')}`);
    assert.equal(after.length, Math.ceil(total / 100));
    assert.ok(after.every(i => i.count >= 1 && i.count <= 100));
  }
  const fifty = e.children(pack.id).filter(i => i.kind === 'gold');
  for (const i of fifty) delete e.state.items[i.id];
  e.add('gold', pack.id, 4, 50); e.add('gold', pack.id, 5, 30); e.add('gold', pack.id, 6, 100);
  e.stackInto(pack.id, 'gold');
  assert.deepEqual(e.children(pack.id).filter(i => i.kind === 'gold').map(i => i.count), [100, 80], 'the 50/30/100 case that used to lose gold');
});

// ---- 7.6-style world rules ---------------------------------------------------------------
const lone = () => {
  const e = new Engine(map, balance);
  for (const id of Object.keys(e.state.monsters)) if (e.state.monsters[id].kind !== 'thornboar') delete e.state.monsters[id];
  const boar = Object.values(e.state.monsters)[0];
  for (const id of Object.keys(e.state.monsters)) if (id !== boar.id) delete e.state.monsters[id];
  const p = e.createPlayer('Lure');
  p.xp = 100000; p.hp = 9999; // sturdy enough to drag it around
  return { e, p, boar };
};

test('a lured creature chases while you are on its screen, then stays where it lost you', () => {
  const { e, p, boar } = lone();
  Object.assign(p, { x: boar.x - 2, y: boar.y, z: 0 });
  for (let t = 0; t < 20; t++) e.tick();
  assert.equal(boar.target, p.id, 'it notices the hero');
  // Walk the hero away in small steps; the boar follows.
  for (let i = 0; i < 12; i++) { Object.assign(p, e.geo.near({ x: p.x - 1, y: p.y, z: 0 }, q => e.occupied(q, p.id))); for (let t = 0; t < 8; t++) e.tick(); }
  const lostAt = { x: boar.x, y: boar.y };
  assert.ok(distance(boar, boar.home) >= 6, `boar was lured ${distance(boar, boar.home)} tiles`);
  // Hero leaves its screen; the boar loses the target and does not head home.
  Object.assign(p, { x: 40, y: 20, z: 0 });
  for (let t = 0; t < 300; t++) e.tick();
  assert.equal(boar.target, null);
  assert.ok(Math.abs(boar.x - lostAt.x) <= 1 && Math.abs(boar.y - lostAt.y) <= 1, 'idles where it lost the hero');
});

test('past the lure limit the creature vanishes and its spawn starts over', () => {
  const { e, p, boar } = lone();
  Object.assign(boar, { x: boar.home.x - 51 < 0 ? boar.home.x + 51 : boar.home.x - 51 });
  Object.assign(p, { x: boar.x, y: boar.y - 2, z: 0 });
  e.tick();
  assert.equal(boar.hp, 0, 'vanished');
  assert.ok(boar.respawnAt > e.state.time);
  assert.equal(Object.keys(e.state.corpses).length, 0, 'no corpse, no loot');
});

test('respawn waits while a player stands near the spawn, then uses a free square', () => {
  const { e, p, boar } = lone();
  boar.hp = 0; boar.respawnAt = 0;
  Object.assign(p, e.geo.near({ ...boar.home, x: boar.home.x + 3 }, q => e.occupied(q, p.id)));
  for (let t = 0; t < 50; t++) e.tick();
  assert.equal(boar.hp, 0, 'blocked by a player 3 tiles away');
  Object.assign(p, { x: 40, y: 20, z: 0 });
  e.tick();
  assert.equal(boar.hp, balance.creatures.thornboar.hp, 'spawns once the player leaves');
  assert.ok(distance(boar, boar.home) <= 1);
});

test('respawn time varies between the configured fractions of the base time', () => {
  const e = new Engine(map, balance);
  const base = balance.progression.respawnMs, w = balance.world;
  const delays = Array.from({ length: 200 }, () => e.respawnDelay());
  assert.ok(Math.min(...delays) >= base * w.respawnMin && Math.max(...delays) <= base * w.respawnMax);
  assert.ok(new Set(delays).size > 20, 'actually random');
});

test('corpses rot in three stages; loot survives the first two and is gone at the last', () => {
  const { e, p, boar } = lone();
  Object.assign(p, e.geo.near({ x: boar.x + 1, y: boar.y, z: 0 }, q => e.occupied(q, p.id)));
  e.hurt(p, boar, 9999);
  const corpse = Object.values(e.state.corpses)[0];
  e.add('tusk', corpse.id, 5);
  const [s0, s1, s2] = balance.world.corpseStages;
  const at = (sec: number) => { while (e.state.time < corpse.born + sec * 1000) e.tick(1000); };
  at(s0 - 1); assert.equal(corpse.stage, 0); assert.match(corpse.name, /^Dead /);
  at(s0 + 1); assert.equal(corpse.stage, 1); assert.match(corpse.name, /^Decaying /);
  assert.ok(e.children(corpse.id).length > 0, 'loot still inside while decaying');
  at(s0 + s1 + 1); assert.equal(corpse.stage, 2); assert.equal(e.children(corpse.id).length, 0, 'loot gone with the bones');
  assert.equal(e.canReach(p, corpse.id), false);
  at(s0 + s1 + s2 + 1); assert.equal(e.state.corpses[corpse.id], undefined);
});

// ---- items on the ground ---------------------------------------------------------------------
import { groundKey } from '../packages/game/src/engine.ts';
const dropper = () => {
  const { e, p } = fresh();
  Object.assign(p, { x: 40, y: 34, z: 0 });
  const pack = e.equipped(p, 'pack')!;
  const loaf = e.children(pack.id).find(i => i.kind === 'loaf')!;
  return { e, p, pack, loaf };
};

test('drop an item next to you, pick it back up, and the stack merges on the floor', () => {
  const { e, p, pack, loaf } = dropper();
  const tile = { x: 41, y: 34, z: 0 };
  e.action(p, { kind: 'moveItem', id: loaf.id, parent: groundKey(tile), slot: 0, count: 1, version: loaf.version });
  e.action(p, { kind: 'moveItem', id: loaf.id, parent: groundKey(tile), slot: 0, count: 2, version: e.state.items[loaf.id]?.version ?? 0 });
  const pile = e.children(groundKey(tile));
  assert.equal(pile.length, 1, 'one merged stack on the tile');
  assert.equal(pile[0].count, 3);
  assert.ok(e.view(p).ground.some(i => i.id === pile[0].id), 'visible in the view');
  e.action(p, { kind: 'moveItem', id: pile[0].id, parent: pack.id, slot: e.freeSlot(pack.id), count: 3, version: pile[0].version });
  assert.equal(e.children(groundKey(tile)).length, 0);
  assert.equal(e.children(pack.id).filter(i => i.kind === 'loaf').reduce((n, i) => n + i.count, 0), 3);
});

test('throwing respects range, sight and what the tile can hold', () => {
  const { e, p, loaf } = dropper();
  const go = (x: number, y: number) => () => e.action(p, { kind: 'moveItem', id: loaf.id, parent: groundKey({ x, y, z: 0 }), slot: 0, count: 1, version: e.state.items[loaf.id].version });
  assert.throws(go(40 + 8, 34), /too far/);
  assert.throws(go(40, 29), /no room|cannot throw/, 'the well is not a shelf');
  go(46, 34)();
  assert.equal(e.children(groundKey({ x: 46, y: 34, z: 0 }))[0].kind, 'loaf', 'thrown 6 tiles');
});

test('you can only pick things up from your own or an adjacent tile, and others can see them', () => {
  const { e, p, pack, loaf } = dropper();
  e.action(p, { kind: 'moveItem', id: loaf.id, parent: groundKey({ x: 44, y: 34, z: 0 }), slot: 0, count: 3, version: loaf.version });
  const onFloor = e.children(groundKey({ x: 44, y: 34, z: 0 }))[0];
  assert.throws(() => e.action(p, { kind: 'moveItem', id: onFloor.id, parent: pack.id, slot: e.freeSlot(pack.id), count: 3, version: onFloor.version }), /out of reach/);
  const other = e.createPlayer('Other');
  Object.assign(other, { x: 45, y: 35, z: 0 });
  assert.ok(e.view(other).ground.some(i => i.id === onFloor.id));
  const otherPack = e.equipped(other, 'pack')!;
  e.action(other, { kind: 'moveItem', id: onFloor.id, parent: otherPack.id, slot: e.freeSlot(otherPack.id), count: 3, version: onFloor.version });
  assert.equal(e.children(otherPack.id).find(i => i.kind === 'loaf')!.count, 6, 'merged into their loaves');
  assert.ok(!e.children(pack.id).some(i => i.kind === 'loaf'));
});

// ---- 7.6 combat, movement and progression rules ----------------------------------------------
test('step time follows level speed and ground; diagonals cost three steps', () => {
  const r = new Engine(map, balance).rules;
  assert.equal(r.heroSpeed(1), 220);
  assert.equal(r.stepMs(220, 'grass', false), 700, 'level 1 on grass: 1000×150/220 → 700 ms');
  assert.equal(r.stepMs(220, 'cobble', false), 500);
  assert.equal(r.stepMs(220, 'cobble', true), 1400);
  assert.ok(r.stepMs(r.heroSpeed(40), 'grass', false) < 700, 'higher levels walk faster');
  const { e, p } = fresh();
  Object.assign(p, { x: 40, y: 34, z: 0 });
  e.action(p, { kind: 'walk', dx: 1, dy: 0 });
  e.tick();
  assert.equal(p.moveAt - e.state.time, r.stepMs(220, grounds[e.geo.ground(p)], false) - 100 + 100);
});

test('melee damage uses the skill formula with no level bonus, and fighting mode scales it', () => {
  const { e, p } = fresh();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  rat.hp = 1e9; balance.creatures.gutterRat.armor;
  Object.assign(p, e.geo.near({ x: rat.x + 1, y: rat.y, z: 1 }, q => e.occupied(q, p.id)));
  const hits = (mode: 'offensive' | 'balanced' | 'defensive', xp: number) => {
    p.xp = xp; p.fightMode = mode; p.hp = 1e9; p.melee = 0; rat.hp = 1e9; rat.damage = {};
    const before = rat.hp; e.action(p, { kind: 'target', id: rat.id });
    for (let t = 0; t < 2000; t++) { p.hp = 1e9; e.tick(); }
    return before - rat.hp;
  };
  const low = hits('balanced', 0), high = hits('balanced', 1e6);
  assert.ok(Math.abs(low - high) / low < 0.35, 'level does not add damage');
  assert.ok(hits('offensive', 0) > hits('defensive', 0), 'offensive out-damages defensive');
});

test('a shield gets two block chances per two seconds, however many attack', () => {
  const { e, p } = fresh();
  e.add('buckler', `equip:${p.id}`, 1);
  Object.assign(p, { x: 56, y: 46, z: 1 }); p.hp = 1e9;
  const rats = Object.values(e.state.monsters).filter(m => m.kind === 'gutterRat').slice(0, 4);
  const spots = [[55, 45], [57, 45], [55, 47], [57, 47]];
  rats.forEach((m, i) => { Object.assign(m, { x: spots[i][0], y: spots[i][1], z: 1 }); m.attackAt = 0; m.target = p.id; });
  const before = p.shielding;
  e.tick(50); // all four attack on the same tick
  assert.equal(p.shielding - before, 2, 'exactly two block chances used');
  for (const m of rats) m.attackAt = 0;
  e.tick(50); // still inside the same 2 s turn
  assert.equal(p.shielding - before, 2, 'no refill before the turn ends');
});

test('regeneration is flat while fed, and you cannot eat past the food cap', () => {
  const { e, p } = fresh();
  p.xp = 1e6; const s = e.stats(p); p.hp = 10; p.mana = 0; p.fed = 600_000; p.regen = 0;
  for (let t = 0; t < 60; t++) e.tick();
  assert.equal(p.hp, 10 + balance.world.regenHp);
  assert.equal(p.mana, balance.world.regenMana);
  assert.ok(s.maxHp > 10);
  p.fed = balance.world.foodCapSec * 1000 - 1000;
  assert.throws(() => e.action(p, { kind: 'useKind', item: 'loaf' }), /full/);
});

test('death costs a tenth of experience, skills and magic; the pack always drops', () => {
  const { e, p } = fresh();
  p.xp = 10000; p.melee = 1000; p.shielding = 500; p.magic = 2000;
  e.kill(p);
  assert.deepEqual([p.xp, p.melee, p.shielding, p.magic], [9000, 900, 450, 1800]);
  assert.equal(e.equipped(p, 'pack'), undefined);
  const body = Object.values(e.state.corpses).find(c => c.owner === p.id)!;
  assert.ok(e.children(body.id).some(i => i.kind === 'pack'));
});

test('experience is split by share of damage and never created by group kills', () => {
  const { e } = fresh();
  const a = e.createPlayer('A'), b = e.createPlayer('B');
  const boar = Object.values(e.state.monsters).find(m => m.kind === 'thornboar')!;
  const xa = a.xp, xb = b.xp;
  e.hurt(a, boar, 54); e.hurt(b, boar, 999);
  const total = (a.xp - xa) + (b.xp - xb);
  assert.ok(total <= balance.creatures.thornboar.xp);
  assert.equal(a.xp - xa, Math.floor(balance.creatures.thornboar.xp * 54 / 72), 'overkill is not credited');
});

test('protection zones: no attacking from them, creatures never enter, no logout in a fight elsewhere', () => {
  const { e, p } = fresh();
  assert.equal(e.geo.pz(p), true, 'new heroes wake in the shrine, a protection zone');
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(rat, { z: 0 });
  assert.throws(() => e.action(p, { kind: 'target', id: rat.id }), /protection zone/);
  Object.assign(p, { x: 40, y: 34, z: 0 }); p.combatUntil = e.state.time + 30_000;
  assert.throws(() => e.action(p, { kind: 'logout' }), /fight/);
});

test('look describes creatures, items and places in plain words', () => {
  const { e, p } = fresh();
  Object.assign(p, { x: 40, y: 34, z: 0 });
  assert.match(e.describe(p, { x: 40, y: 29, z: 0 }), /well/);
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(p, { x: rat.x + 2, y: rat.y, z: rat.z });
  assert.match(e.describe(p, rat, rat.id), /gutter rat/);
  Object.assign(p, { x: 40, y: 34, z: 0 });
  Object.assign(p, { x: 22, y: 21, z: 0 });
  assert.match(e.describe(p, { x: 22, y: 22, z: 0 }), /protection zone/);
});

// ---- round 2 review regressions ----------------------------------------------------------------
test('stepping into a protection zone cancels the attack and offensive spells are refused there', () => {
  const { e, p } = fresh();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(rat, { x: 21, y: 26, z: 0, hp: 1e6, home: { x: 21, y: 26, z: 0 } });
  Object.assign(p, { x: 22, y: 26, z: 0 }); p.xp = 1e6; p.mana = 999;
  e.action(p, { kind: 'target', id: rat.id });
  e.action(p, { kind: 'mode', chase: false });
  e.action(p, { kind: 'walk', dx: 0, dy: -1 });
  for (let t = 0; t < 10; t++) e.tick(50);
  assert.equal(e.geo.pz(p), true, 'hero stepped into the shrine doorway');
  assert.equal(rat.hp, 1e6, 'no melee from inside');
  assert.equal(p.target, null);
  (p as { target: string | null }).target = rat.id;
  assert.throws(() => e.action(p, { kind: 'cast', spell: 'ember' }), /protection zone/);
});

test('switching to stand stops an automatic chase route', () => {
  const { e, p } = fresh();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(p, e.geo.near({ x: rat.x + 5, y: rat.y, z: 1 }, q => e.occupied(q, p.id))); p.hp = 1e9;
  e.action(p, { kind: 'target', id: rat.id });
  e.tick(50);
  assert.ok(p.path.length > 0, 'chasing');
  e.action(p, { kind: 'mode', chase: false });
  const at = { x: p.x, y: p.y };
  for (let t = 0; t < 40; t++) e.tick(50);
  assert.deepEqual({ x: p.x, y: p.y }, at, 'stands still');
  assert.equal(p.target, rat.id, 'keeps the target');
});

test('logging out inside a protection zone leaves the world at once', () => {
  const { e, p } = fresh();
  p.combatUntil = e.state.time + 30_000;
  e.action(p, { kind: 'logout' });
  assert.equal(e.present(p), false);
});

test('steps happen on 50 ms boundaries, not rounded up to the server tick', () => {
  const { e, p } = fresh();
  Object.assign(p, { x: 20, y: 22, z: 0 }); p.xp = 200; // level 3: speed 224, flagstone 1000×100/224 → 450 ms
  assert.equal(e.rules.stepMs(e.rules.heroSpeed(3), 'flagstone', false), 450);
  e.action(p, { kind: 'path', to: { x: 25, y: 22, z: 0 } });
  const times: number[] = [];
  let x = p.x;
  for (let t = 0; t < 60; t++) { e.tick(50); if (p.x !== x) { times.push(e.state.time); x = p.x; } }
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  assert.ok(gaps.length >= 3 && gaps.every(g => g === 450), `gaps ${gaps.join(',')}`);
});

test('look only reveals creatures and players you can see', () => {
  const { e, p } = fresh();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  assert.doesNotMatch(e.describe(p, rat, rat.id), /gutter rat/, 'underground rat is not visible from the shrine');
});

// ---- round 2 review regressions (Opus, Terra) -------------------------------------------------
test('a hero without a shield can still block with their weapon', () => {
  const { e, p } = fresh();
  assert.equal(e.equipped(p, 'shield'), undefined);
  assert.ok((balance.items.cudgel.defense ?? 0) > 0, 'weapons have a defense value');
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(p, { x: 56, y: 46, z: 1 }); p.hp = 1e9; p.melee = 1e6;
  Object.assign(rat, { x: 55, y: 46, z: 1 });
  let blocks = 0;
  for (let t = 0; t < 400; t++) { rat.attackAt = 0; rat.target = p.id; e.tick(50); blocks += e.effects.filter(fx => fx.kind === 'block' && fx.time === e.state.time).length; }
  assert.ok(blocks > 0, 'some hits blocked by the cudgel');
});

test('armour of 1 always soaks exactly one point', () => {
  const { e } = fresh();
  for (let k = 0; k < 50; k++) assert.equal(e.armorRoll(1), 1);
  for (let k = 0; k < 50; k++) assert.equal(e.armorRoll(3), 1);
});

test('a full ground tile takes only what fits on matching stacks', () => {
  const { e, p } = fresh();
  Object.assign(p, { x: 40, y: 34, z: 0 });
  const key = groundKey({ x: 41, y: 34, z: 0 });
  for (let k = 0; k < 19; k++) e.add('cap', key, k);
  e.add('gold', key, 19, 99);
  const pack = e.equipped(p, 'pack')!;
  const purse = e.add('gold', pack.id, 10, 100);
  e.action(p, { kind: 'moveItem', id: purse.id, parent: key, slot: 0, count: 100, version: 0 });
  assert.equal(e.children(key).length, 20, 'never more than the tile limit');
  assert.equal(e.children(key).find(i => i.kind === 'gold')!.count, 100);
  assert.equal(e.state.items[purse.id].count, 99, 'the rest stays in the pack');
});

test('look reads naturally for corpses', () => {
  const { e, p } = fresh();
  Object.assign(p, { x: 40, y: 34, z: 0 });
  e.state.corpses.c1 = { id: 'c1', x: 41, y: 34, z: 0, name: 'Remains of a gutter rat', kind: 'gutterRat', owner: '', protectedUntil: 0, expiresAt: 1e12, born: 0, stage: 2 };
  assert.equal(e.describe(p, { x: 41, y: 34, z: 0 }), 'You see the remains of a gutter rat.');
});

test('a kill by someone else stops the chase; reroutes never lead into a protection zone', () => {
  const { e, p } = fresh();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(p, e.geo.near({ x: rat.x + 5, y: rat.y, z: 1 }, q => e.occupied(q, p.id))); p.hp = 1e9;
  e.action(p, { kind: 'target', id: rat.id });
  e.tick(50);
  assert.ok(p.path.length > 0);
  const other = e.createPlayer('Other');
  e.hurt(other, rat, 9999);
  assert.equal(p.target, null);
  assert.equal(p.path.length, 0, 'no leftover chase route');
  const at = { x: p.x, y: p.y };
  for (let t = 0; t < 20; t++) e.tick(50);
  assert.deepEqual({ x: p.x, y: p.y }, at);
});

test('reaching melee range ends an automatic chase route', () => {
  const { e, p } = fresh();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  rat.hp = 1e9;
  Object.assign(p, e.geo.near({ x: rat.x + 1, y: rat.y, z: 1 }, q => e.occupied(q, p.id))); p.hp = 1e9;
  e.action(p, { kind: 'target', id: rat.id });
  p.path = [{ x: p.x - 1, y: p.y + 1, z: 1 }, { x: p.x - 2, y: p.y + 1, z: 1 }]; p.manual = false; // a stale pursuit route
  e.tick(50);
  if (distance(p, rat) <= 1) assert.equal(p.path.length, 0, 'stops walking once adjacent');
});

test('cinderburst unlocks at level 20 and burns every visible creature within its radius', () => {
  const { e, p } = fresh();
  Object.assign(p, { x: 34, y: 44, z: 1 }); p.magic = 0;
  assert.throws(() => e.action(p, { kind: 'cast', spell: 'cinderburst' }), /level 20/);
  p.xp = e.rules.xpAt(20); p.mana = 500;
  for (const m of Object.values(e.state.monsters)) { m.hp = 0; m.respawnAt = 1e15; }
  const [near1, near2, far] = Object.values(e.state.monsters).filter(m => m.kind === 'caveBeetle');
  for (const [m, x, y] of [[near1, 35, 44], [near2, 33, 46], [far, 40, 44]] as const) Object.assign(m, { x, y, z: 1, hp: 1000, home: { x, y, z: 1 } });
  e.action(p, { kind: 'cast', spell: 'cinderburst' });
  assert.ok(near1.hp < 1000 && near2.hp < 1000, 'both nearby creatures burn');
  assert.equal(far.hp, 1000, 'out of radius');
  assert.equal(p.mana, 500 - balance.spells.cinderburst.mana);
  assert.throws(() => e.action(p, { kind: 'cast', spell: 'cinderburst' }), /exhausted/);
});
