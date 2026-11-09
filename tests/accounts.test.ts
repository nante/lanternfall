import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine, GameError } from '../packages/game/src/engine.ts';
import { buildTown } from '../packages/game/src/town.ts';
import { Balance } from '../packages/game/src/content-schema.ts';
import { accountOf, applyAccountEdit, AccountEdit, StaleItems } from '../packages/game/src/accounts.ts';
import fixture from './fixtures/balance.json' with { type: 'json' };

const balance = Balance.parse(fixture);
const map = buildTown();
const fresh = () => { const e = new Engine(map, balance); const p = e.createPlayer('Tess'); return { e, p }; };
const edit = (e: Engine, id: string, input: unknown) => applyAccountEdit(e, id, AccountEdit.parse(input));
// An edit swaps in a new state object, so always look the character up again.
const read = (e: Engine, id: string) => accountOf(e, e.state.players[id]);

test('level and skills land at the start of the chosen level, and health follows the new maximum', () => {
  const { e, p } = fresh();
  edit(e, p.id, { level: 8, skills: { melee: 25, shielding: 14, magic: 3 }, hp: 9999, mana: 5 });
  const a = read(e, p.id);
  assert.equal(a.level, 8); assert.equal(a.xp, e.rules.xpAt(8));
  assert.deepEqual([a.skills.melee, a.skills.shielding, a.skills.magic].map(s => [s.level, s.progress]), [[25, 0], [14, 0], [3, 0]]);
  assert.equal(a.hp, a.maxHp, 'health above the maximum is lowered to it');
  assert.equal(a.mana, 5);
  e.state.players[p.id].melee += 3;
  const before = e.state.players[p.id].melee;
  edit(e, p.id, { skills: { melee: 25 } });
  assert.equal(e.state.players[p.id].melee, before, 'naming the current level keeps progress');
});

test('items are replaced as a tree, keep their ids, and must fit', () => {
  const { e, p } = fresh();
  const a = read(e, p.id);
  const pack = a.equip[5]!;
  const equip = structuredClone(a.equip);
  equip[0] = { kind: 'blade', count: 1 };
  equip[5]!.contents = [{ kind: 'gold', count: 77 }, { kind: 'pouch', count: 1, contents: [{ kind: 'tonic', count: 3 }] }];
  edit(e, p.id, { items: { stamp: a.itemsStamp, equip, vault: [null, { kind: 'tusk', count: 4 }] } });
  const b = read(e, p.id);
  assert.equal(b.equip[0]!.kind, 'blade');
  assert.equal(b.equip[5]!.id, pack.id, 'the pack keeps its id');
  assert.equal(b.gold, 77);
  assert.equal(b.equip[5]!.contents![1]!.contents![0]!.count, 3);
  assert.equal(b.vault[1]!.kind, 'tusk');
  assert.notEqual(b.itemsStamp, a.itemsStamp);

  assert.throws(() => edit(e, p.id, { items: { stamp: a.itemsStamp, equip: b.equip, vault: [] } }), StaleItems, 'an old stamp is refused');
  assert.deepEqual(read(e, p.id), b, 'a refused edit changes nothing');
  const wrongSlot = structuredClone(b.equip); wrongSlot[2] = { kind: 'boots', count: 1 };
  assert.throws(() => edit(e, p.id, { items: { stamp: b.itemsStamp, equip: wrongSlot, vault: [] } }), GameError);
  const stacked = structuredClone(b.equip); stacked[0] = { kind: 'blade', count: 2 };
  assert.throws(() => edit(e, p.id, { items: { stamp: b.itemsStamp, equip: stacked, vault: [] } }), /does not stack/);
});

test('edits to other players and unknown ids', () => {
  const { e } = fresh();
  assert.throws(() => edit(e, 'nobody', { level: 2 }), GameError);
  assert.equal(AccountEdit.safeParse({ name: 'x' }).success, false, 'names follow the join rules');
  assert.equal(AccountEdit.safeParse({ skills: { melee: 3 } }).success, false, 'melee starts at 10');
});
