import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../packages/game/src/engine.ts';
import { buildTown } from '../packages/game/src/town.ts';
import { Balance } from '../packages/game/src/content-schema.ts';
import { distance, type Hero } from '../packages/game/src/model.ts';
import fixture from './fixtures/balance.json' with { type: 'json' };

const balance = Balance.parse(fixture);
const map = buildTown();
const place = (h: Hero, x: number, y: number, z = 0) => Object.assign(h, { x, y, z });
const heard = (e: Engine, kind = 'say') => e.notices.filter(n => n.kind === kind).map(n => ({ player: n.player, text: n.text, from: n.from }));
const npcLines = (e: Engine) => e.notices.filter(n => n.kind === 'npc').map(n => n.text);

// ---- A1 speech -------------------------------------------------------------------------------
test('speech reaches every present hero within nine tiles on the floor, the speaker included', () => {
  const e = new Engine(map, balance);
  const ann = place(e.createPlayer('Ann'), 40, 34), bob = place(e.createPlayer('Bob'), 45, 34);
  const far = place(e.createPlayer('Far'), 50, 34), below = place(e.createPlayer('Below'), 40, 34, 1);
  const away = place(e.createPlayer('Away'), 41, 35); away.connected = false;
  e.notices = [];
  e.action(ann, { kind: 'say', text: 'Hello all' });
  assert.deepEqual(heard(e), [
    { player: ann.id, text: 'Ann: Hello all', from: ann.id },
    { player: bob.id, text: 'Ann: Hello all', from: ann.id },
  ]);
  assert.ok(far && below);
});

test('spell words are cast and also heard', () => {
  const e = new Engine(map, balance);
  const ann = place(e.createPlayer('Ann'), 40, 34), bob = place(e.createPlayer('Bob'), 41, 34);
  ann.hp = 50; e.notices = [];
  e.action(ann, { kind: 'say', text: 'mend' });
  assert.ok(ann.hp > 50);
  assert.deepEqual(heard(e).map(n => n.player), [ann.id, bob.id]);
});

test('plain speech near an NPC is not taken as talk to the NPC', () => {
  const e = new Engine(map, balance);
  const p = place(e.createPlayer('Tess'), 22, 20);
  e.notices = [];
  e.action(p, { kind: 'say', text: 'was dad 123' });
  assert.deepEqual(npcLines(e), []);
  assert.equal(p.talking, null);
  assert.deepEqual(heard(e).map(n => n.text), ['Tess: was dad 123']);
});

test('a greeting starts the talk; topics match whole words; bye ends it', () => {
  const e = new Engine(map, balance);
  const p = place(e.createPlayer('Tess'), 47, 48);
  const say = (text: string) => { e.notices = []; e.action(p, { kind: 'say', text }); return npcLines(e); };
  assert.deepEqual(say('hey pell'), [balance.merchants.store.greeting]);
  assert.equal(p.talking, 'pell');
  assert.deepEqual(say('what are the details?'), ['Ask me to "trade", or about something you have heard.']);
  assert.deepEqual(say('any rat tail work?'), [balance.merchants.store.topics.tails]);
  assert.deepEqual(say('trade'), ['Have a look.']);
  assert.deepEqual(say('bye'), ['Safe roads.']);
  assert.equal(p.talking, null);
  assert.deepEqual(say('tails'), [], 'after bye, topics are plain speech');
});

test('the shrine dialogue still answers heal, spells, undercroft and task', () => {
  const e = new Engine(map, balance);
  const p = place(e.createPlayer('Tess'), 22, 20);
  const say = (text: string) => { e.notices = []; e.action(p, { kind: 'say', text }); return npcLines(e); };
  const t = balance.merchants.shrine.topics;
  assert.deepEqual(say('Hello Sister Wren'), [balance.merchants.shrine.greeting]);
  assert.deepEqual(say('which spells?'), [t.spells]);
  assert.deepEqual(say('the undercroft'), [t.undercroft]);
  p.hp = 10;
  assert.deepEqual(say('heal me'), [t.heal]);
  assert.equal(p.hp, e.stats(p).maxHp);
  assert.match(say('a task?')[0], /Bring me 5/);
  assert.equal(p.quests.shells, 1);
});

test('a greeting needs the NPC within three tiles and in sight', () => {
  const e = new Engine(map, balance);
  const p = place(e.createPlayer('Tess'), 43, 49); // three tiles from Pell, with the shop wall between
  e.notices = [];
  e.action(p, { kind: 'say', text: 'hi' });
  assert.deepEqual(npcLines(e), []);
  assert.equal(p.talking, null);
});

// ---- A6 push ---------------------------------------------------------------------------------
const pair = () => {
  const e = new Engine(map, balance);
  const ann = place(e.createPlayer('Ann'), 40, 34), bob = place(e.createPlayer('Bob'), 41, 34);
  return { e, ann, bob };
};

test('a hero pushes another hero one tile, then must recover', () => {
  const { e, ann, bob } = pair();
  bob.path = [{ x: 42, y: 35, z: 0 }];
  e.action(ann, { kind: 'push', id: bob.id, to: { x: 42, y: 34, z: 0 } });
  assert.deepEqual([bob.x, bob.y, bob.path], [42, 34, []]);
  assert.equal(ann.moveAt, e.state.time + 1000);
  assert.ok(bob.moveAt > e.state.time, 'the pushed hero does not step again at once');
  assert.throws(() => e.action(ann, { kind: 'push', id: bob.id, to: { x: 43, y: 34, z: 0 } }), /Move closer/);
  place(ann, 41, 34);
  assert.throws(() => e.action(ann, { kind: 'push', id: bob.id, to: { x: 43, y: 34, z: 0 } }), /still recovering/);
  e.tick(1000);
  e.action(ann, { kind: 'push', id: bob.id, to: { x: 43, y: 34, z: 0 } });
  assert.deepEqual([bob.x, bob.y], [43, 34]);
});

test('a push needs a free tile next to the body, and never moves an NPC', () => {
  const { e, ann, bob } = pair();
  const push = (x: number, y: number) => () => e.action(ann, { kind: 'push', id: bob.id, to: { x, y, z: 0 } });
  assert.throws(push(40, 34), /no room/, 'not onto the pusher');
  assert.throws(push(43, 34), /no room/, 'only one tile');
  place(e.createPlayer('Cara'), 42, 34);
  assert.throws(push(42, 34), /no room/, 'not onto another body');
  place(ann, 22, 27); place(bob, 21, 26);
  assert.throws(push(20, 26), /no room/, 'not into the shrine wall');
  place(ann, 47, 48);
  assert.throws(() => e.action(ann, { kind: 'push', id: 'pell', to: { x: 47, y: 49, z: 0 } }), /cannot push/);
  assert.throws(() => e.action(ann, { kind: 'push', id: ann.id, to: { x: 48, y: 48, z: 0 } }), /cannot push/);
  assert.deepEqual([bob.x, bob.y, ann.moveAt], [21, 26, 0], 'refused pushes move nothing and cost nothing');
});

test('pushing an idle creature makes it turn on the pusher', () => {
  const { e, ann } = pair();
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  Object.assign(rat, { x: 41, y: 35, z: 0, home: { x: 41, y: 35, z: 0 }, target: null });
  e.action(ann, { kind: 'push', id: rat.id, to: { x: 42, y: 36, z: 0 } });
  assert.deepEqual([rat.x, rat.y, rat.target], [42, 36, ann.id]);
});

test('walking into a body that cannot be passed says there is not enough room, once a second', () => {
  const { e, ann } = pair();
  e.notices = [];
  for (let t = 0; t < 8; t++) { e.action(ann, { kind: 'walk', dx: 1, dy: 0 }); e.tick(100); }
  assert.deepEqual([ann.x, ann.y], [40, 34]);
  assert.deepEqual(e.notices.filter(n => n.player === ann.id && n.kind === 'error').map(n => n.text), ['There is not enough room.']);
});

// ---- corpses block and stack (amendment 1) ---------------------------------------------------
const corpses = () => {
  const { e, ann, bob } = pair();
  const tile = { x: 41, y: 35, z: 0 };
  place(bob, tile.x, tile.y); e.kill(bob);
  const body = Object.values(e.state.corpses).find(c => c.owner === bob.id)!;
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  e.tick(100);
  Object.assign(rat, { ...tile, home: { ...tile }, hp: 1 });
  e.hurt(ann, rat, 5);
  const ratBody = Object.values(e.state.corpses).find(c => c.kind === 'gutterRat')!;
  return { e, ann, bob, body, ratBody, rat, tile };
};

test('only the top corpse of a tile can be reached: a rat on a hero corpse hides it until moved', () => {
  const { e, ann, bob, body, ratBody } = corpses();
  place(bob, 40, 35); bob.moveAt = 0;
  const reach = (id: string) => e.view(bob).items.some(i => i.parent === id);
  assert.equal(reach(body.id), false, 'the rat lies on top');
  assert.equal(reach(ratBody.id), true);
  assert.equal(e.access(bob, body.id), false);
  assert.throws(() => e.action(bob, { kind: 'push', id: body.id, to: { x: 42, y: 35, z: 0 } }), /on top of it/);
  e.action(bob, { kind: 'push', id: ratBody.id, to: { x: 42, y: 35, z: 0 } });
  assert.deepEqual([ratBody.x, ratBody.y], [42, 35]);
  assert.equal(bob.moveAt, e.state.time + 1000);
  assert.equal(reach(body.id), true, 'the hero corpse is uncovered');
  assert.ok(ann);
});

test('a corpse moved onto another lands on top, and keeps its own decay', () => {
  const { e, bob, body, ratBody } = corpses();
  place(bob, 40, 36);
  e.action(bob, { kind: 'push', id: ratBody.id, to: { x: 40, y: 35, z: 0 } });
  assert.equal(e.access(bob, body.id), true);
  e.tick(5000);
  e.action(bob, { kind: 'push', id: ratBody.id, to: { x: 41, y: 35, z: 0 } });
  assert.equal(e.access(bob, ratBody.id), true, 'back on top of the hero corpse');
  assert.equal(e.access(bob, body.id), false);
  const [s0] = balance.world.corpseStages, made = ratBody.expiresAt - balance.world.corpseStages.reduce((a, b) => a + b, 0) * 1000;
  while (e.state.time < made + (s0 + 1) * 1000) e.tick(1000);
  assert.equal(ratBody.stage, 1, 'moving it did not reset its rot');
});

test('a corpse under a living creature or another hero cannot be opened', () => {
  const { e, ann, bob, ratBody, tile } = corpses();
  place(bob, 40, 35);
  const boar = Object.values(e.state.monsters).find(m => m.kind === 'thornboar')!;
  Object.assign(boar, { ...tile, home: { ...tile } });
  assert.equal(e.access(bob, ratBody.id), false, 'a creature stands on it');
  Object.assign(boar, { x: 10, y: 60, home: { x: 10, y: 60, z: 0 } });
  place(ann, tile.x, tile.y);
  assert.equal(e.access(bob, ratBody.id), false, 'another hero stands on it');
  assert.equal(e.access(ann, ratBody.id), true, 'the hero standing on it can');
});

test('a corpse can only be moved to a tile a body could stand on', () => {
  const { e, ann, ratBody } = corpses();
  place(ann, 40, 35);
  assert.throws(() => e.action(ann, { kind: 'push', id: ratBody.id, to: { x: 43, y: 35, z: 0 } }), /no room/, 'one tile at most');
  ratBody.x = 21; ratBody.y = 26; place(ann, 22, 27);
  assert.throws(() => e.action(ann, { kind: 'push', id: ratBody.id, to: { x: 20, y: 26, z: 0 } }), /no room/, 'not into a wall');
  assert.throws(() => e.action(ann, { kind: 'push', id: ratBody.id, to: { x: 22, y: 25, z: 0 } }), /no room/, 'not into a closed door');
  e.action(ann, { kind: 'push', id: ratBody.id, to: { x: 22, y: 26, z: 0 } });
  assert.deepEqual([ratBody.x, ratBody.y], [22, 26]);
});

// ---- look at an item ---------------------------------------------------------------------------
test('look at an item in reach says what it is, what it weighs and what it does', () => {
  const e = new Engine(map, balance);
  const p = place(e.createPlayer('Tess'), 40, 34);
  const pack = e.equipped(p, 'pack')!;
  const loaves = e.children(pack.id).find(i => i.kind === 'loaf')!;
  const look = (item: string) => { e.notices = []; e.action(p, { kind: 'look', at: p, item }); return e.notices.map(n => n.text); };
  assert.deepEqual(look(loaves.id), ['You see 3 × rye loaf (feeds 3 min each). It weighs 6.0 oz.']);
  assert.deepEqual(look(e.equipped(p, 'weapon')!.id), ['You see an ash cudgel (attack 7, block 4). It weighs 12.0 oz.']);
  assert.deepEqual(look(pack.id), ['You see a canvas pack (holds 16). It weighs 6.0 oz.']);
  const tonic = e.children(pack.id).find(i => i.kind === 'tonic')!;
  assert.deepEqual(look(tonic.id), ['You see a red tonic (heals 60 to 80). It weighs 2.0 oz.']);
  const other = place(e.createPlayer('Other'), 45, 34);
  assert.throws(() => e.action(p, { kind: 'look', at: p, item: e.equipped(other, 'weapon')!.id }), /cannot reach/);
});

// ---- the world runs with nobody online -------------------------------------------------------
test('with every hero logged out, creatures respawn and corpses rot', () => {
  const e = new Engine(map, balance);
  const p = e.createPlayer('Tess');
  e.action(p, { kind: 'logout' });
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  e.dead(rat);
  const corpse = Object.values(e.state.corpses)[0];
  const [, s1, s2] = balance.world.corpseStages, until = Math.max(rat.respawnAt, corpse.expiresAt - (s1 + s2) * 1000);
  while (e.state.time <= until) e.tick(1000);
  assert.equal(rat.hp, balance.creatures.gutterRat.hp, 'respawned');
  assert.equal(corpse.stage, 1, 'the corpse rotted');
});

// ---- B1 a save that fails to load is reported, never replaced ---------------------------------
import { loadWorld } from '../packages/game/src/save.ts';

test('a good save loads as it was, and fields added since take their defaults', () => {
  const e = new Engine(map, balance);
  const p = e.createPlayer('Tess');
  const saved = JSON.parse(JSON.stringify(e.state));
  delete saved.players[p.id].fightMode; delete saved.players[p.id].blocks;
  const loaded = loadWorld(JSON.stringify(saved));
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.ok && loaded.state, e.state);
  assert.deepEqual(loadWorld(undefined), { ok: true, state: undefined });
});

test('a save that does not fit is reported by path', () => {
  const e = new Engine(map, balance);
  const p = e.createPlayer('Tess');
  const saved = JSON.parse(JSON.stringify(e.state));
  const loaf = Object.values(saved.items as Record<string, { id: string; kind: string }>).find(i => i.kind === 'loaf')!;
  loaf.kind = 'scroll'; saved.players[p.id].hp = 'full';
  const loaded = loadWorld(JSON.stringify(saved));
  assert.equal(loaded.ok, false);
  assert.deepEqual(!loaded.ok && loaded.problems.map(t => t.split(':')[0]), [`players.${p.id}.hp`, `items.${loaf.id}.kind`]);
  const broken = loadWorld('{"version":2,');
  assert.equal(!broken.ok && broken.problems.length, 1);
  assert.match(!broken.ok ? broken.problems[0] : '', /^\(whole save\): not JSON/);
});

// ---- C1 two bodies on one tile -----------------------------------------------------------------
test('a hero who rejoins onto a taken tile stands one step away', () => {
  const { e, ann, bob } = pair();
  e.action(ann, { kind: 'logout' });
  place(bob, 40, 34);
  e.rejoin(ann);
  assert.equal(ann.connected, true);
  assert.deepEqual([bob.x, bob.y], [40, 34]);
  assert.equal(distance(ann, { x: 40, y: 34, z: 0 }), 1);
  assert.equal(e.occupied(ann, ann.id), false);
});

test('a hero who rejoins with every neighbour taken wakes at the shrine', () => {
  const { e, ann, bob } = pair();
  e.action(ann, { kind: 'logout' });
  place(bob, 40, 34);
  for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]) place(e.createPlayer('Crowd'), 40 + dx, 34 + dy);
  e.rejoin(ann);
  assert.ok(distance(ann, map.shrine) <= 1, `at ${ann.x},${ann.y}`);
  assert.equal(e.occupied(ann, ann.id), false);
});

test('a creature never respawns on a hero, even one who is logged out', () => {
  const e = new Engine(map, balance);
  const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat')!;
  const p = place(e.createPlayer('Tess'), rat.home.x, rat.home.y, rat.home.z);
  e.action(p, { kind: 'logout' });
  rat.hp = 0; rat.respawnAt = 0;
  e.tick();
  assert.equal(rat.hp, balance.creatures.gutterRat.hp);
  assert.equal(distance(rat, rat.home), 1);
});

// ---- C3 doors ------------------------------------------------------------------------------------
test('a door cannot be closed on anyone standing in it', () => {
  const { e, ann, bob } = pair();
  const door = { x: 22, y: 25, z: 0 };
  place(ann, 22, 26);
  e.action(ann, { kind: 'useTile', to: door });
  assert.equal(e.state.doors['22,25,0'], true);
  place(bob, 22, 25);
  assert.throws(() => e.action(ann, { kind: 'useTile', to: door }), /Someone is standing in the doorway/);
  e.action(bob, { kind: 'logout' });
  assert.throws(() => e.action(ann, { kind: 'useTile', to: door }), /Someone is standing in the doorway/, 'logged out, still there');
  place(bob, 30, 30);
  place(ann, 22, 25);
  assert.throws(() => e.action(ann, { kind: 'useTile', to: door }), /Someone is standing in the doorway/, 'not on yourself either');
  place(ann, 22, 26);
  e.action(ann, { kind: 'useTile', to: door });
  assert.equal(e.state.doors['22,25,0'], false);
  e.action(ann, { kind: 'useTile', to: door });
  e.state.corpses.c = { id: 'c', ...door, name: 'Dead rat', kind: 'gutterRat', owner: '', protectedUntil: 0, expiresAt: 1e12, born: 0, stage: 0 };
  assert.throws(() => e.action(ann, { kind: 'useTile', to: door }), /lies in the doorway/);
});

// ---- C4 a closed door blocks sight ---------------------------------------------------------------
const shopDoor = () => {
  const e = new Engine(map, balance);
  for (const id of Object.keys(e.state.monsters)) if (e.state.monsters[id].kind !== 'gutterRat') delete e.state.monsters[id];
  const rats = Object.values(e.state.monsters);
  for (const m of rats.slice(1)) delete e.state.monsters[m.id];
  const rat = Object.assign(rats[0], { x: 49, y: 45, z: 0, home: { x: 49, y: 45, z: 0 }, target: null, hp: 1000 });
  const p = place(e.createPlayer('Tess'), 49, 49);
  p.xp = e.rules.xpAt(20); p.mana = 999; p.hp = 1e6;
  const door = { x: 49, y: 47, z: 0 };
  return { e, p, rat, door, open: () => { e.state.doors['49,47,0'] = true; } };
};

test('a creature behind a closed door does not notice you', () => {
  const { e, rat, open } = shopDoor();
  e.tick(); assert.equal(rat.target, null);
  open(); e.tick();
  assert.notEqual(rat.target, null);
});

test('you cannot target, cast at or burn a creature behind a closed door', () => {
  const { e, p, rat, open } = shopDoor();
  assert.throws(() => e.action(p, { kind: 'target', id: rat.id }), /cannot see/);
  p.target = rat.id;
  assert.throws(() => e.action(p, { kind: 'cast', spell: 'ember' }), /out of reach/);
  rat.y = 46; p.y = 48;
  e.action(p, { kind: 'cast', spell: 'cinderburst' });
  assert.equal(rat.hp, 1000, 'the burst stops at the door');
  open(); p.spellAt = 0;
  e.action(p, { kind: 'target', id: rat.id });
  e.action(p, { kind: 'cast', spell: 'ember' });
  assert.ok(rat.hp < 1000);
});

test('you cannot throw through a closed door', () => {
  const { e, p, open } = shopDoor();
  const loaf = e.carried(p).find(i => i.kind === 'loaf')!;
  const throwTo = () => e.action(p, { kind: 'moveItem', id: loaf.id, parent: 'ground:49,45,0', slot: 0, count: 1, version: e.state.items[loaf.id].version });
  assert.throws(throwTo, /cannot throw/);
  open(); throwTo();
  assert.equal(e.children('ground:49,45,0')[0].kind, 'loaf');
});
