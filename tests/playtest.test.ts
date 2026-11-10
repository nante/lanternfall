import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../packages/game/src/engine.ts';
import { buildTown } from '../packages/game/src/town.ts';
import { Balance } from '../packages/game/src/content-schema.ts';
import type { Hero } from '../packages/game/src/model.ts';
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
