import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Engine } from '../packages/game/src/engine.ts';
import { defaultBalance } from '../packages/game/src/default-balance.ts';
import { equipSlots, type EquipSlot, type Hero, type ItemKind } from '../packages/game/src/model.ts';
import { buildTown } from '../packages/game/src/town.ts';

const fresh = (darkness = false) => {
  const balance = structuredClone(defaultBalance);
  balance.world.darkness = darkness;
  balance.world.wanderRadius = 0;
  const e = new Engine(buildTown(), balance);
  e.state.time = 1_700_000;
  for (const id of Object.keys(e.state.monsters)) delete e.state.monsters[id];
  const p = e.createPlayer('Wayfarer'), mira = e.createPlayer('Mira');
  Object.assign(p, { x: 51, y: 45, z: 1 });
  Object.assign(mira, { x: 52, y: 45, z: 1 });
  return { e, p, mira };
};

function equip(e: Engine, p: Hero, kind: ItemKind, slot: EquipSlot) {
  if (!e.carried(p).some(i => i.kind === kind)) e.give(p, kind, 1);
  const item = e.carried(p).find(i => i.kind === kind)!;
  e.action(p, { kind: 'moveItem', id: item.id, parent: `equip:${p.id}`, slot: equipSlots.indexOf(slot), count: 1, version: item.version });
}
function unequip(e: Engine, p: Hero, slot: EquipSlot) {
  const item = e.equipped(p, slot)!, pack = e.equipped(p, 'pack')!;
  e.action(p, { kind: 'moveItem', id: item.id, parent: pack.id, slot: e.freeSlot(pack.id), count: 1, version: item.version });
}

const starter = { weapon: 'cudgel', head: 'cap', body: 'tunic', feet: 'boots', pack: 'pack' };

test('the view says what you and every visible hero wear', () => {
  const { e, p, mira } = fresh();
  const view = e.view(p);
  assert.deepEqual(view.self.worn, starter);
  assert.deepEqual(view.players.map(h => [h.id, h.worn]), [[mira.id, starter]]);
});

test('worn follows equip and unequip, and a torch in the shield slot is the lit one', () => {
  const { e, p, mira } = fresh();
  unequip(e, mira, 'head');
  equip(e, mira, 'shortsword', 'weapon');
  equip(e, mira, 'torch', 'shield');
  assert.deepEqual(e.view(p).players[0].worn, { weapon: 'shortsword', shield: 'torch', body: 'tunic', feet: 'boots', pack: 'pack' });
  equip(e, mira, 'coif', 'head');
  equip(e, mira, 'banded', 'shield');
  assert.deepEqual(e.view(p).players[0].worn, { weapon: 'shortsword', shield: 'banded', head: 'coif', body: 'tunic', feet: 'boots', pack: 'pack' });
  assert.deepEqual(e.view(mira).self.worn, e.view(p).players[0].worn);
});

test('a hero seen only as a shade carries no equipment', () => {
  const { e, p, mira } = fresh(true);
  equip(e, mira, 'banded', 'shield');
  Object.assign(mira, { x: 54, y: 45, z: 1 });
  const view = e.view(p);
  assert.deepEqual(view.players, []);
  assert.deepEqual(view.shades, [{ id: mira.id, x: 54, y: 45, z: 1, facing: mira.facing, size: 2 }]);
  assert.deepEqual(view.self.worn, starter);
});
