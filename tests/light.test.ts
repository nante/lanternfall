import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Balance, defaultWorld } from '../packages/game/src/content-schema.ts';
import {
  BLUE_MINUTE, CYCLE_MINUTES, RIPPLE_MS_PER_TILE, PHASES, ambientAt, clockAt, lampDistance, lampIgniteAt, lamps, lightGrid, lightLevel,
  lightPasses, outdoorAmbient, perceive, reachMasks, sourceLevelAt, staticSources, wildWisps,
  type LightSource,
} from '../packages/game/src/light.ts';
import { T, key } from '../packages/game/src/model.ts';
import { buildTown } from '../packages/game/src/town.ts';
import { Geography } from '../packages/game/src/world.ts';
import fixture from './fixtures/balance.json' with { type: 'json' };

const map = buildTown();
const geo = new Geography(map);
const world = { dayMs: 2_400_000, dayOffset: 0 };
const night = clockAt(1_700_000, world);

test('clock boundaries, offsets and proportional cycles determine ambient light', () => {
  assert.deepEqual(PHASES, [
    { phase: 'dawn', minutes: 3 }, { phase: 'day', minutes: 20 },
    { phase: 'golden', minutes: 3 }, { phase: 'blue', minutes: 2 }, { phase: 'night', minutes: 12 },
  ]);
  for (const [time, phase, ambient] of [
    [0, 'dawn', 1], [30_000, 'dawn', 2], [90_000, 'dawn', 4], [179_999, 'dawn', 7],
    [180_000, 'day', 7], [1_379_999, 'day', 7], [1_380_000, 'golden', 5],
    [1_559_999, 'golden', 5], [1_560_000, 'blue', 2], [1_679_999, 'blue', 2],
    [1_680_000, 'night', 1], [2_399_999, 'night', 1], [2_400_000, 'dawn', 1],
  ] as const) {
    const clock = clockAt(time, world);
    assert.equal(clock.phase, phase, `phase at ${time}`);
    assert.equal(outdoorAmbient(clock), ambient, `ambient at ${time}`);
    assert.ok(clock.phaseT >= 0 && clock.phaseT < 1);
    assert.ok(clock.dayT >= 0 && clock.dayT < 1);
  }
  assert.deepEqual(clockAt(90_000, world), { day: 0, phase: 'dawn', phaseT: 0.5, dayT: 0.0375 });
  assert.deepEqual(clockAt(0, { ...world, dayOffset: -1 }), {
    day: -1, phase: 'night', phaseT: 719_999 / 720_000, dayT: 2_399_999 / 2_400_000,
  });
  assert.deepEqual(clockAt(1_560_000, world), clockAt(780_000, { dayMs: 1_200_000, dayOffset: 0 }));
  assert.deepEqual(clockAt(0, { ...world, dayOffset: 180_000 }), clockAt(180_000, world));
  assert.equal(ambientAt(map, { x: 16, y: 22, z: 0 }, night), 1);
  assert.equal(ambientAt(map, { x: 18, y: 22, z: 0 }, night), 3);
  assert.equal(ambientAt(map, { x: 18, y: 22, z: 1 }, clockAt(200_000, world)), 0);
});

test('balance defaults provide a valid world light clock for older files', () => {
  const parsed = Balance.parse(fixture);
  assert.deepEqual([parsed.world.dayMs, parsed.world.dayOffset, parsed.world.darkness], [2_400_000, 0, false]);
  assert.deepEqual([defaultWorld.dayMs, defaultWorld.dayOffset, defaultWorld.darkness], [2_400_000, 0, false]);
  assert.equal(Balance.safeParse({ ...fixture, world: { ...fixture.world, dayMs: 0 } }).success, false);
  assert.equal(Balance.parse({ ...fixture, world: { ...fixture.world, dayOffset: -500, darkness: true } }).world.dayOffset, -500);
});

test('source falloff uses exact Euclidean tile rings and stays on the same floor', () => {
  const source: LightSource = { id: 'lamp', x: 0, y: 0, z: 0, level: 6, color: 'amber' };
  assert.equal(sourceLevelAt(source, { x: 0, y: 0, z: 0 }), 6);
  assert.equal(sourceLevelAt(source, { x: 1, y: 0, z: 0 }), 5);
  assert.equal(sourceLevelAt(source, { x: 1, y: 1, z: 0 }), 4);
  assert.equal(sourceLevelAt(source, { x: 3, y: 4, z: 0 }), 1);
  assert.equal(sourceLevelAt(source, { x: 4, y: 4, z: 0 }), 0);
  assert.equal(sourceLevelAt(source, { x: 0, y: 0, z: 1 }), 0);
});

test('a real lamp does not illuminate through the town wall', () => {
  const lamp = staticSources(map, 1_700_000, world).find(source => source.id === 'lamp:0');
  assert.ok(lamp);
  assert.deepEqual({ x: lamp.x, y: lamp.y, z: lamp.z }, { x: 38, y: 15, z: 0 });
  const wall = { x: 38, y: 13, z: 0 }, before = { x: 38, y: 14, z: 0 }, behind = { x: 38, y: 11, z: 0 };
  assert.equal(geo.thing(wall), T.rampart);
  assert.equal(lightLevel(map, before, [lamp], {}, night), 5);
  assert.equal(sourceLevelAt(lamp, behind), 2);
  assert.equal(lightPasses(map, lamp, behind, {}), false);
  assert.equal(lightLevel(map, behind, [lamp], {}, night), 1);
});

test('a real closed shrine door blocks light but an open door passes it', () => {
  const door = { x: 22, y: 25, z: 0 };
  const source: LightSource = { id: 'test-lamp', x: 22, y: 24, z: 0, level: 6, color: 'amber' };
  const outside = { x: 22, y: 26, z: 0 };
  assert.equal(geo.thing(door), T.door);
  assert.equal(geo.sight(source, outside, {}), false, 'sight stops at the closed door too');
  assert.equal(lightPasses(map, source, outside, {}), false);
  assert.equal(lightPasses(map, source, outside, { [key(door)]: false }), false);
  assert.equal(lightLevel(map, outside, [source], {}, night), 1);
  assert.equal(lightPasses(map, source, outside, { [key(door)]: true }), true);
  assert.equal(lightLevel(map, outside, [source], { [key(door)]: true }, night), 4);
  assert.equal(lightPasses(map, source, door, {}), true, 'endpoints follow Geography.sight');
  assert.equal(lightPasses(map, source, { ...outside, z: 1 }, {}), false);
});

test('light rays use the same intermediate tiles as sight when doors are open', () => {
  const doors: Record<string, boolean> = {};
  for (let z = 0; z < map.floors.length; z++) for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const p = { x, y, z };
    if (geo.thing(p) === T.door) doors[key(p)] = true;
  }
  for (const from of [{ x: 22, y: 24, z: 0 }, { x: 38, y: 15, z: 0 }, { x: 55, y: 46, z: 1 }]) {
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      const to = { x: from.x + dx, y: from.y + dy, z: from.z };
      assert.equal(lightPasses(map, from, to, doors), geo.sight(from, to, doors), `${key(from)} to ${key(to)}`);
      assert.equal(lightPasses(map, to, from, doors), geo.sight(to, from, doors), `${key(to)} to ${key(from)}`);
    }
  }
});

test('lamps ignite nearest first and extinguish farthest first at dawn', () => {
  const positions = lamps(map);
  assert.equal(positions.length, 17);
  const near = positions.findIndex(p => p.x === 18 && p.y === 32);
  const far = positions.findIndex(p => p.x === 67 && p.y === 46);
  assert.equal(near, 6);
  assert.equal(far, 14);
  assert.deepEqual([BLUE_MINUTE, CYCLE_MINUTES, RIPPLE_MS_PER_TILE], [26, 40, 500]);
  assert.equal(lampDistance(map, positions[near]), 10);
  assert.equal(lampIgniteAt(map, near, world), 1_565_000);
  assert.equal(lampIgniteAt(map, far, world), 1_582_500);
  const lit = (time: number, i: number) => staticSources(map, time, world).some(s => s.id === `lamp:${i}`);
  assert.equal(lit(1_564_999, near), false);
  assert.equal(lit(1_565_000, near), true);
  assert.equal(lit(1_582_499, far), false);
  assert.equal(lit(1_582_500, far), true);
  assert.equal(lit(2_399_999, far), true);
  assert.equal(lit(2_400_000, far), false);
  assert.equal(lit(2_400_000, near), true);
  assert.equal(lit(2_417_499, near), true);
  assert.equal(lit(2_417_500, near), false);
  assert.equal(staticSources(map, 1_565_000 - 500, { ...world, dayOffset: 500 }).some(s => s.id === `lamp:${near}`), true);
  const shortDay = { dayMs: 1_200_000, dayOffset: 0 };
  assert.equal(lampIgniteAt(map, near, shortDay), 785_000);
  assert.equal(staticSources(map, 784_999, shortDay).some(s => s.id === `lamp:${near}`), false);
  assert.equal(staticSources(map, 785_000, shortDay).some(s => s.id === `lamp:${near}`), true);
  const veryShortDay = { dayMs: 60_000, dayOffset: 0 };
  assert.equal(lampIgniteAt(map, far, veryShortDay), 61_500);
  assert.equal(staticSources(map, 59_999, veryShortDay).some(s => s.id === `lamp:${far}`), false);
  assert.equal(staticSources(map, 61_500, veryShortDay).some(s => s.id === `lamp:${far}`), false);
});

test('perception cannot see through walls at any light level and never worsens as light increases', () => {
  const cave = structuredClone(map);
  const viewer = { x: 51, y: 45, z: 1 }, rat = { x: 53, y: 45, z: 1 };
  const source = (level: number): LightSource[] => level ? [{ id: 'test', ...rat, level, color: 'amber' }] : [];
  cave.floors[1].thing[45 * cave.width + 52] = T.cavewall;
  for (const level of [0, 1, 2, 7]) assert.equal(perceive(cave, viewer, rat, source(level), {}, night), 'none');
  cave.floors[1].thing[45 * cave.width + 52] = T.none;
  assert.deepEqual([0, 1, 2].map(level => perceive(cave, viewer, rat, source(level), {}, night)), ['shade', 'shade', 'full']);
  const farRat = { ...rat, x: 56 };
  assert.deepEqual([0, 1, 2].map(level => perceive(cave, viewer, farRat, level ? [{ id: 'test', ...farRat, level, color: 'amber' }] : [], {}, night)), ['none', 'shade', 'full']);
  assert.equal(perceive(cave, viewer, { ...viewer, x: 52 }, [], {}, night), 'shade');
});

test('three stable teal wisps move around walkable meadow loops only at night', () => {
  assert.deepEqual(wildWisps(180_000, world), []);
  assert.deepEqual(wildWisps(1_679_999, world), []);
  assert.deepEqual(wildWisps(1_680_000, world), [
    { id: 'wisp:0', x: 30, y: 59, z: 0, level: 3, color: 'teal' },
    { id: 'wisp:1', x: 40, y: 59, z: 0, level: 3, color: 'teal' },
    { id: 'wisp:2', x: 53, y: 64, z: 0, level: 3, color: 'teal' },
  ]);
  const seen = new Map<string, Set<string>>();
  for (let time = 1_680_000; time < 1_712_000; time += 250) {
    for (const wisp of wildWisps(time, world)) {
      assert.equal(geo.blocked(wisp), false, `${wisp.id} at ${key(wisp)}`);
      const points = seen.get(wisp.id) ?? new Set<string>();
      points.add(key(wisp));
      seen.set(wisp.id, points);
    }
  }
  assert.ok([...seen.values()].every(points => points.size > 1));
  assert.equal(staticSources(map, 1_700_000, world).filter(s => s.id.startsWith('wisp:')).length, 3);
  assert.equal(staticSources(map, 180_000, world).filter(s => s.id.startsWith('wisp:')).length, 0);
});

test('the Lantern crosses walls but never lights a different floor', () => {
  const lantern = staticSources(map, 1_700_000, world).find(source => source.id === 'lantern');
  assert.deepEqual(lantern, { id: 'lantern', x: 22, y: 22, z: 0, level: 10, color: 'teal', high: true });
  assert.ok(lantern);
  const outside = { x: 16, y: 22, z: 0 };
  assert.equal(geo.thing({ x: 17, y: 22, z: 0 }), T.wall);
  assert.equal(lightPasses(map, lantern, outside, {}), false);
  assert.equal(lightLevel(map, outside, [lantern], {}, night), 4);
  assert.equal(lightLevel(map, outside, [{ ...lantern, high: false }], {}, night), 1);
  assert.equal(lightLevel(map, { ...lantern, z: 1 }, [lantern], {}, night), 0);
  assert.equal(lightLevel(map, lantern, [lantern], {}, night), 7);
  const permanent = staticSources(map, 180_000, world);
  assert.equal(permanent.filter(s => s.id.startsWith('brazier:')).length, 9);
  assert.equal(permanent.filter(s => s.id.startsWith('altar:')).length, 1);
  assert.ok(permanent.filter(s => s.id.startsWith('brazier:') || s.id.startsWith('altar:')).every(s => s.level === 5 && s.color === 'amber'));
});

test('grid entries equal lightLevel in inclusive row-major rectangles on both floors', () => {
  const sources = staticSources(map, 1_700_000, world);
  const rect = { x0: 19, y0: 23, x1: 25, y1: 27 };
  for (const z of [0, 1]) {
    const doors = { '22,25,0': true };
    const grid = lightGrid(map, z, rect, sources, doors, night);
    assert.equal(grid.length, 35);
    for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) {
      assert.equal(grid[(y - rect.y0) * 7 + x - rect.x0], lightLevel(map, { x, y, z }, sources, doors, night));
    }
  }
});

test('reach masks match passing rays, high sources, floors and the 32-bit limit', () => {
  const source: LightSource = { id: 'low', x: 22, y: 24, z: 0, level: 6, color: 'amber' };
  const sources: LightSource[] = [source, { ...source, id: 'high', high: true }, { ...source, id: 'other-floor', z: 1 }];
  for (let i = 3; i <= 32; i++) sources.push({ ...source, id: `source:${i}` });
  const rect = { x0: 21, y0: 24, x1: 23, y1: 27 };
  for (const open of [false, true]) {
    const doors = { '22,25,0': open };
    const masks = reachMasks(map, 0, rect, sources, doors);
    assert.equal(masks.length, 12);
    assert.equal(masks[7], open ? 0xfffffffb : 2);
    for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) {
      const p = { x, y, z: 0 }, mask = masks[(y - rect.y0) * 3 + x - rect.x0];
      for (let i = 0; i < 32; i++) {
        const s = sources[i];
        assert.equal(Boolean(mask & (1 << i)), s.z === p.z && (Boolean(s.high) || lightPasses(map, s, p, doors)));
      }
    }
  }
});
