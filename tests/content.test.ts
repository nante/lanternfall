import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Engine } from '../packages/game/src/engine.ts';
import { buildTown } from '../packages/game/src/town.ts';
import { Balance, Icons, RenderStyle, RegionMoods, missingIcons, balanceWarnings, xpCurveRises } from '../packages/game/src/content-schema.ts';
import { stylePresets } from '../packages/game/src/style-presets.ts';
import { iconSvg } from '../packages/game/src/icon-svg.ts';
import { fightScenarios, spellScenarios } from './m0-scenarios.ts';
import fixture from './fixtures/balance.json' with { type: 'json' };
import baseline from './fixtures/m0-baseline.json' with { type: 'json' };

const map = buildTown();
const balance = Balance.parse(fixture);

// Baseline first captured before balance moved out of code; re-captured when the 7.6-style world rules
// (screen-based luring, idle creatures, respawn jitter) intentionally changed the dice sequence.
test('fixed-seed fights and spells stay reproducible', () => {
  const make = () => new Engine(map, balance);
  assert.deepEqual(fightScenarios(make), baseline.fights);
  assert.deepEqual(spellScenarios(make), baseline.spells);
});

test('authored content files are valid and complete', () => {
  const b = Balance.parse(JSON.parse(readFileSync('content/balance.json', 'utf8')));
  const icons = Icons.parse(JSON.parse(readFileSync('content/icons.json', 'utf8')));
  assert.deepEqual(missingIcons(b, icons), []);
});

test('two engines with different balance snapshots stay independent', () => {
  const tougher = structuredClone(balance);
  tougher.creatures.gutterRat.hp = 500;
  tougher.items.cheese.buy = 1;
  const a = new Engine(map, balance), b = new Engine(map, tougher);
  const ratA = Object.values(a.state.monsters).find(m => m.kind === 'gutterRat')!;
  const ratB = Object.values(b.state.monsters).find(m => m.kind === 'gutterRat')!;
  assert.equal(ratA.hp, 15);
  assert.equal(ratB.hp, 500);
  assert.equal(a.rules.item('cheese').buy, 6);
  assert.equal(b.rules.item('cheese').buy, 1);
});

test('spell power and creature stats come from the balance document', () => {
  const strong = structuredClone(balance);
  strong.spells.mend.base = 1000;
  const e = new Engine(map, strong);
  const p = e.createPlayer('Test');
  p.hp = 10;
  e.action(p, { kind: 'cast', spell: 'mend' });
  assert.equal(p.hp, e.stats(p).maxHp);
});

test('schema rejects broken references and flags arbitrage', () => {
  const bad = structuredClone(fixture) as typeof fixture & { starter: { equipment: Record<string, string> } };
  bad.starter.equipment.weapon = 'cap';
  assert.equal(Balance.safeParse(bad).success, false);
  const cheap = structuredClone(balance);
  cheap.items.cudgel.sell = 50;
  assert.ok(balanceWarnings(cheap).some(w => w.path === 'items.cudgel.sell'));
});

test('the xp curve check covers every level, not just the first few hundred', () => {
  assert.equal(xpCurveRises([50, -150, 400]), true);
  assert.equal(xpCurveRises([0, 0, 0]), false);
  assert.equal(xpCurveRises([1, -1800, 1050000]), false, 'rises early but falls around level 600');
  const dup = structuredClone(balance);
  dup.creatures.gutterRat.loot.push({ item: 'tail', chance: 0.1 });
  assert.equal(Balance.safeParse(dup).success, true, 'duplicate drops are allowed');
  assert.ok(balanceWarnings(dup).some(w => w.path.startsWith('creatures.gutterRat.loot')));
});

test('icon renderer rejects pixels outside the palette', () => {
  const icons = Icons.parse(JSON.parse(readFileSync('content/icons.json', 'utf8')));
  const broken = structuredClone(icons.sword);
  broken.pixels[0] = 'z'.padEnd(16, '.');
  assert.equal(Icons.safeParse({ sword: broken }).success, false);
  assert.match(iconSvg(icons.sword), /^<svg/);
});

test('the saved look and every preset are valid render styles', () => {
  assert.equal(RenderStyle.safeParse(JSON.parse(readFileSync('content/render-style.json', 'utf8'))).success, true);
  for (const p of stylePresets) assert.equal(RenderStyle.safeParse(p.style).success, true, p.id);
  assert.equal(new Set(stylePresets.map(p => p.style.name)).size, stylePresets.length);
});

test('region moods are valid and claim only places the map has', () => {
  const moods = RegionMoods.parse(JSON.parse(readFileSync('content/moods.json', 'utf8')));
  const names = new Set(map.places.map(p => p.name));
  const claimed = Object.values(moods.moods).flatMap(m => m.places);
  assert.deepEqual(claimed.filter(n => !names.has(n)), []);
  assert.equal(new Set(claimed).size, claimed.length);
  const broken = structuredClone(moods); broken.fallback = 'nowhere';
  assert.equal(RegionMoods.safeParse(broken).success, false);
});
