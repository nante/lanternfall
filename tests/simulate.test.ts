import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Balance } from '../packages/game/src/content-schema.ts';
import { runFight, runBatch, seedList, type Scenario } from '../packages/game/src/simulate.ts';
import fixture from './fixtures/balance.json' with { type: 'json' };

const balance = Balance.parse(fixture);
const starter: Scenario = { mob: 'gutterRat', level: 1, meleeSkill: 10, shieldSkill: 10, magicLevel: 0, equipment: { weapon: 'cudgel', head: 'cap', body: 'tunic', feet: 'boots' }, hpFraction: 1, fedMs: 120_000 };

test('the same seeds give the same fights', () => {
  const seeds = seedList(99, 20);
  assert.deepEqual(seeds.map(s => runFight(balance, starter, s)), seeds.map(s => runFight(balance, starter, s)));
});

test('a starter hero beats rats and loses to grubs most of the time', () => {
  const seeds = seedList(1, 120);
  const rat = runBatch(balance, starter, seeds), grub = runBatch(balance, { ...starter, mob: 'mireGrub' }, seeds);
  assert.ok(rat.wins / rat.trials > 0.95, `rat win rate ${rat.wins}`);
  assert.ok(grub.deaths / grub.trials > 0.6, `grub deaths ${grub.deaths}`);
  assert.equal(rat.wins + rat.deaths + rat.timeouts, rat.trials);
  assert.ok(rat.ttk && rat.ttk.mean > 0 && rat.damage!.mean >= 0);
});

test('a fight nobody can finish times out instead of hanging', () => {
  const b = structuredClone(balance);
  b.creatures.gutterRat.hp = 1_000_000; b.creatures.gutterRat.attack = 0;
  const t = runFight(b, starter, 5);
  assert.equal(t.outcome, 'timeout');
  assert.equal(t.ms, 300_000);
});

test('draft balance changes move the results; the saved balance is untouched', () => {
  const seeds = seedList(3, 60);
  const draft = structuredClone(balance);
  draft.creatures.mireGrub.attack = 4;
  const saved = runBatch(balance, { ...starter, mob: 'mireGrub' }, seeds), changed = runBatch(draft, { ...starter, mob: 'mireGrub' }, seeds);
  assert.ok(changed.wins > saved.wins);
  assert.equal(balance.creatures.mireGrub.attack, 22);
});

test('damage taken counts the fatal blow even though death restores health', () => {
  const t = runFight(balance, { ...starter, mob: 'mireGrub', hpFraction: 0.2 }, 11);
  assert.equal(t.outcome, 'death');
  assert.ok(t.damageTaken >= 30);
});
