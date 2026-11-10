import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, groundKey } from '../packages/game/src/engine.ts';
import { defaultBalance } from '../packages/game/src/default-balance.ts';
import { equipSlots, key, T, type GameView, type Hero, type Pos } from '../packages/game/src/model.ts';
import { buildTown } from '../packages/game/src/town.ts';
import { darknessOffScenario } from './fixtures/darkness-off-scenario.ts';
import baseline from './fixtures/darkness-off-baseline.json' with { type: 'json' };

const fresh = () => {
  const balance = structuredClone(defaultBalance);
  balance.world.darkness = true;
  balance.world.wanderRadius = 0;
  const e = new Engine(buildTown(), balance);
  e.state.time = 1_700_000;
  const p = e.createPlayer('Wayfarer');
  Object.assign(p, { x: 51, y: 45, z: 1 });
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  for (const id of Object.keys(e.state.monsters)) if (id !== rat.id) delete e.state.monsters[id];
  Object.assign(rat, { x: 56, y: 45, z: 1, home: { x: 56, y: 45, z: 1 }, moveAt: 9_999_999, attackAt: 9_999_999, target: null });
  return { e, p, rat, balance };
};

function torch(e: Engine, p: Hero, on: boolean) {
  let item = e.carried(p).find(i => i.kind === 'torch');
  if (on && !item) { e.give(p, 'torch', 1); item = e.carried(p).find(i => i.kind === 'torch'); }
  assert.ok(item);
  const pack = e.equipped(p, 'pack');
  assert.ok(pack);
  e.action(p, { kind: 'moveItem', id: item.id, parent: on ? `equip:${p.id}` : pack.id,
    slot: on ? equipSlots.indexOf('shield') : e.freeSlot(pack.id), count: 1, version: item.version });
}

const shade = (p: Pos, id: string, facing = 0) => ({ id, x: p.x, y: p.y, z: p.z, facing, size: 1 });

test('darkness sends full actors, anonymous shades, or nothing as light changes', () => {
  const { e, p, rat } = fresh();
  assert.deepEqual(e.view(p).monsters, []);
  assert.deepEqual(e.view(p).shades, []);
  rat.x = 54;
  assert.deepEqual(e.view(p).monsters, []);
  assert.deepEqual(e.view(p).shades, [shade(rat, rat.id)]);
  assert.throws(() => e.action(p, { kind: 'target', id: rat.id }), /cannot see/);
  torch(e, p, true);
  rat.x = 55;
  assert.deepEqual(e.view(p).monsters.map(m => m.id), [rat.id]);
  assert.deepEqual(e.view(p).shades, []);
  assert.deepEqual(e.view(p).lights, [{ id: `torch:${p.id}`, x: 51, y: 45, z: 1, level: 6, color: 'amber' }]);
  rat.x = 56;
  assert.deepEqual(e.view(p).monsters, []);
  assert.deepEqual(e.view(p).shades, [shade(rat, rat.id)]);
  torch(e, p, false);
  assert.deepEqual(e.view(p).lights, []);
});

test('closed doors block full visibility even on a lit tile', () => {
  const { e, p, rat } = fresh();
  Object.assign(p, { x: 22, y: 26, z: 0 });
  Object.assign(rat, { x: 22, y: 24, z: 0 });
  const door = { x: 22, y: 25, z: 0 };
  assert.equal(e.geo.thing(door), T.door);
  assert.deepEqual(e.view(p).monsters, []);
  assert.throws(() => e.action(p, { kind: 'target', id: rat.id }), /cannot see/);
  e.state.doors[key(door)] = true;
  assert.deepEqual(e.view(p).monsters.map(m => m.id), [rat.id]);
});

test('a rat behind rock is absent in darkness, dim light and bright light', () => {
  const { e, p, rat, balance } = fresh();
  rat.x = 53;
  e.map.floors[1].thing[45 * e.map.width + 52] = T.cavewall;
  const carrier = e.createPlayer('Carrier');
  Object.assign(carrier, { x: 53, y: 45, z: 1 });
  for (const level of [0, 1, 2]) {
    balance.items.torch.light = level;
    if (level === 1) torch(e, carrier, true);
    const view = e.view(p);
    assert.equal(view.monsters.some(m => m.id === rat.id), false);
    assert.equal(view.shades?.some(s => s.id === rat.id), false);
  }
  e.map.floors[1].thing[45 * e.map.width + 52] = T.none;
  balance.items.torch.light = 0;
  assert.ok(e.view(p).shades?.some(s => s.id === rat.id));
  balance.items.torch.light = 2;
  assert.ok(e.view(p).monsters.some(m => m.id === rat.id));
});

test('hidden torch carriers are omitted or anonymised when their light spills into view', () => {
  const { e, p, balance } = fresh();
  const carrier = e.createPlayer('Carrier');
  Object.assign(p, { x: 49, y: 45, z: 1 });
  Object.assign(carrier, { x: 56, y: 45, z: 1 });
  for (let y = 0; y < e.map.height; y++) for (const x of [53, 54]) e.map.floors[1].thing[y * e.map.width + x] = T.cavewall;
  torch(e, carrier, true);
  let view = e.view(p);
  assert.equal(view.players.some(h => h.id === carrier.id), false);
  assert.equal(view.shades?.some(s => s.id === carrier.id), false);
  assert.deepEqual(view.lights, []);

  Object.assign(p, { x: 22, y: 26, z: 0 });
  Object.assign(carrier, { x: 22, y: 24, z: 0 });
  view = e.view(p);
  assert.equal(view.players.some(h => h.id === carrier.id), false);
  assert.equal(view.shades?.some(s => s.id === carrier.id), false);
  assert.deepEqual(view.lights, [{ id: 'torch:anon:0', x: 22, y: 24, z: 0, level: 6, color: 'amber' }]);
  assert.deepEqual(e.view(p).lights, view.lights);
  e.state.doors[key({ x: 22, y: 25, z: 0 })] = true;
  assert.deepEqual(e.view(p).lights, [{ id: `torch:${carrier.id}`, x: 22, y: 24, z: 0, level: 6, color: 'amber' }]);

  Object.assign(p, { x: 51, y: 45, z: 1 });
  Object.assign(carrier, { x: 51, y: 47, z: 1 });
  balance.items.torch.light = 1;
  view = e.view(p);
  assert.ok(view.shades?.some(s => s.id === carrier.id));
  assert.deepEqual(view.lights, [{ id: `torch:${carrier.id}`, x: 51, y: 47, z: 1, level: 1, color: 'amber' }]);

  Object.assign(p, { x: 20, y: 60, z: 0 });
  Object.assign(carrier, { x: 44, y: 60, z: 0 });
  for (let x = 20; x <= 44; x++) e.map.floors[0].thing[60 * e.map.width + x] = T.none;
  balance.items.torch.light = 6;
  view = e.view(p);
  assert.equal(view.players.some(h => h.id === carrier.id), false);
  assert.deepEqual(view.lights, [{ id: 'torch:anon:0', x: 44, y: 60, z: 0, level: 6, color: 'amber' }]);
  carrier.x = 49;
  assert.deepEqual(e.view(p).lights, []);
});

test('targets drop when light disappears, preserving manual walks but stopping chase', () => {
  const { e, p, rat } = fresh();
  rat.x = 55;
  torch(e, p, true);
  e.action(p, { kind: 'target', id: rat.id });
  e.action(p, { kind: 'walk', dx: 1, dy: 0 });
  torch(e, p, false);
  e.tick(100);
  assert.equal(p.target, null);
  assert.deepEqual({ x: p.x, y: p.y, z: p.z }, { x: 52, y: 45, z: 1 });
  Object.assign(p, { x: 51, y: 45, moveAt: e.state.time + 1000 });
  torch(e, p, true);
  e.action(p, { kind: 'target', id: rat.id });
  p.path = [{ x: 52, y: 45, z: 1 }];
  torch(e, p, false);
  e.tick(100);
  assert.equal(p.target, null);
  assert.deepEqual(p.path, []);
});

test('creatures notice dark heroes at three tiles and lit heroes within aggro', () => {
  const { e, p, rat } = fresh();
  e.think(rat, e.state.time);
  assert.equal(rat.target, null);
  rat.x = 54;
  e.think(rat, e.state.time);
  assert.equal(rat.target, p.id);
  rat.target = null; rat.x = 59;
  torch(e, p, true);
  e.think(rat, e.state.time);
  assert.equal(rat.target, p.id);
});

test('one hero’s torch illuminates creatures for another hero', () => {
  const { e, p, rat } = fresh();
  const mira = e.createPlayer('Mira');
  Object.assign(mira, { x: 52, y: 46, z: 1 });
  rat.x = 55;
  assert.deepEqual(e.view(mira).monsters, []);
  torch(e, p, true);
  assert.deepEqual(e.view(mira).monsters.map(m => m.id), [rat.id]);
  assert.deepEqual(e.view(mira).lights, [{ id: `torch:${p.id}`, x: 51, y: 45, z: 1, level: 6, color: 'amber' }]);
  assert.deepEqual(e.view(mira).players.map(h => h.id), [p.id]);
});

test('other heroes become anonymous medium shades and a torch cannot block attacks', () => {
  const { e, p, rat } = fresh();
  const mira = e.createPlayer('Mira');
  Object.assign(mira, { x: 54, y: 45, z: 1 });
  assert.deepEqual(e.view(p).players, []);
  assert.deepEqual(e.view(p).shades?.filter(s => s.id === mira.id), [{ id: mira.id, x: 54, y: 45, z: 1, facing: mira.facing, size: 2 }]);
  Object.assign(rat, { x: 52, y: 45, target: p.id, attackAt: 0 });
  torch(e, p, true);
  e.think(rat, e.state.time);
  assert.equal(p.blocks, 2);
  assert.equal(e.effects.some(effect => effect.kind === 'block'), false);
});

test('walking toward torchlight produces the expected visibility on each tile', () => {
  const { e, p, rat } = fresh();
  torch(e, p, true);
  const seen: string[] = [];
  for (let i = 0; i < 5; i++) {
    const view = e.view(p);
    seen.push(view.monsters.some(m => m.id === rat.id) ? 'full' : view.shades?.some(s => s.id === rat.id) ? 'shade' : 'none');
    e.action(p, { kind: 'walk', dx: 1, dy: 0 });
    e.tick(1000);
  }
  assert.deepEqual(seen, ['shade', 'full', 'full', 'full', 'full']);
});

test('adjacent shades can be targeted but still cannot be hit by Ember in darkness', () => {
  const { e, p, rat } = fresh();
  rat.x = 52;
  e.action(p, { kind: 'target', id: rat.id });
  assert.equal(p.target, rat.id);
  p.xp = e.rules.xpAt(3); p.mana = 100;
  assert.throws(() => e.action(p, { kind: 'cast', spell: 'ember' }), /not lit/);
});

test('look, targeted spells, corpses and effects do not disclose unseen details', () => {
  const { e, p, rat } = fresh();
  const dark = { x: 56, y: 45, z: 1 };
  assert.equal(e.describe(p, dark, rat.id), 'It is too dark to make out.');
  p.xp = e.rules.xpAt(3); p.mana = 100; p.target = rat.id;
  rat.x = 54;
  assert.throws(() => e.action(p, { kind: 'cast', spell: 'ember' }), /not lit/);
  const corpse = { ...dark, id: 'body', name: 'Dead rat', kind: 'gutterRat', owner: '', protectedUntil: 0, expiresAt: 2_000_000, born: 0, stage: 0 };
  e.state.corpses[corpse.id] = corpse;
  const loaf = e.add('loaf', groundKey(dark), 0);
  e.effect('hit', dark, 3);
  e.effect('ember', p, 4, dark);
  e.effect('ember', dark, 5, p);
  let view = e.view(p);
  assert.deepEqual(view.corpses, []);
  assert.deepEqual(view.ground, []);
  assert.deepEqual(view.effects.map(f => [f.value, f.from]), [[4, undefined], [5, { x: 51, y: 45, z: 1 }]]);
  torch(e, p, true);
  view = e.view(p);
  assert.deepEqual(view.corpses.map(c => c.id), ['body']);
  assert.deepEqual(view.ground.map(item => item.id), [loaf.id]);
  assert.deepEqual(view.effects.map(f => f.value), [3, 4, 5]);
  assert.equal(e.describe(p, dark), 'You see a rye loaf (feeds 3 min). It weighs 2.0 oz.');
});

test('the world clock and flag are read again on a live engine', () => {
  const { e, p, rat, balance } = fresh();
  Object.assign(p, { x: 10, y: 60, z: 0 });
  Object.assign(rat, { x: 15, y: 60, z: 0 });
  assert.deepEqual(e.view(p).monsters, []);
  assert.deepEqual(e.view(p).world, { dayMs: balance.world.dayMs, dayOffset: 0, darkness: true });
  balance.world.dayOffset = -1_400_000;
  balance.world.dayMs = 2_400_001;
  assert.deepEqual(e.view(p).world, { dayMs: 2_400_001, dayOffset: -1_400_000, darkness: true });
  assert.deepEqual(e.view(p).monsters.map(m => m.id), [rat.id]);
  balance.world.dayOffset = 0;
  balance.world.darkness = false;
  assert.deepEqual(e.view(p).monsters.map(m => m.id), [rat.id]);
  assert.equal('shades' in e.view(p), false);
  assert.equal('world' in e.view(p), false);
});

test('disabled darkness matches recorded views from the engine at HEAD', () => {
  const restoreUndefined = (value: unknown): unknown => {
    if (value === '__darkness_fixture_undefined__') return undefined;
    if (Array.isArray(value)) return value.map(restoreUndefined);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, restoreUndefined(entry)]));
    return value;
  };
  // The baseline predates `worn` (tests/worn.test.ts covers it); everything else must match.
  const unworn = ({ worn: _w, ...hero }: GameView['self']) => hero;
  const views = darknessOffScenario().map(v => ({ ...v, self: unworn(v.self), players: v.players.map(unworn) }));
  assert.equal(views.length, 300);
  assert.ok(views.some(view => view.effects.some(effect => effect.kind === 'hit')));
  assert.ok(views.some(view => view.corpses.length > 0));
  assert.notEqual(views[0].self.x, views[20].self.x);
  assert.deepEqual(views, restoreUndefined(baseline));
});
