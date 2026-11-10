// Server cost of the darkness rule. Not part of `npm test`: timings depend on machine load.
// Run: npx tsx tests/bench/darkness-cost.ts
// 16 heroes at night clustered in the meadow, each holding a torch, with 0 to 5,000 loose items in the world.
// The 2 ms limit applies up to 1,500 items. At 5,000 the engine itself is past its 50 ms tick with darkness off,
// because its item lookups scan every item; that line is printed as a stress case.
import { performance } from 'node:perf_hooks';
import { Engine } from '../../packages/game/src/engine.ts';
import { defaultBalance } from '../../packages/game/src/default-balance.ts';
import { equipSlots } from '../../packages/game/src/model.ts';
import { buildTown } from '../../packages/game/src/town.ts';

function run(items: number) {
  const balance = structuredClone(defaultBalance);
  balance.world.dayOffset = 1_700_000;
  const e = new Engine(buildTown(), balance);
  const heroes = Array.from({ length: 16 }, (_, i) => {
    const p = e.createPlayer(`Hero ${i}`);
    Object.assign(p, e.geo.near({ x: 30 + (i % 4), y: 59 + Math.floor(i / 4), z: 0 }, q => e.occupied(q, p.id)));
    e.give(p, 'torch', 1);
    const item = e.carried(p).find(it => it.kind === 'torch')!;
    e.action(p, { kind: 'moveItem', id: item.id, parent: `equip:${p.id}`, slot: equipSlots.indexOf('shield'), count: 1, version: item.version });
    return p;
  });
  for (let i = 0; i < items; i++) e.add('tail', `ground:${20 + (i % 44)},${15 + (Math.floor(i / 44) % 50)},0`, i % 8, 1);
  const tick = (on: boolean, n: number) => {
    balance.world.darkness = on;
    e.state.time = n * 100;
    const a = performance.now();
    e.tick(100);
    for (const p of heroes) e.view(p);
    return performance.now() - a;
  };
  for (let i = 0; i < 30; i++) { tick(false, i); tick(true, i); }
  const off: number[] = [], on: number[] = [];
  for (let i = 30; i < 230; i++) { if (i % 2) { off.push(tick(false, i)); on.push(tick(true, i)); } else { on.push(tick(true, i)); off.push(tick(false, i)); } }
  const median = (xs: number[]) => xs.sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  return { off: median(off), on: median(on), extra: median(on) - median(off) };
}

let ok = true;
for (const items of [0, 500, 1500, 5000]) {
  const r = run(items), judged = items <= 1500;
  if (judged && r.extra > 2) ok = false;
  console.log(`${String(items).padStart(5)} items: off ${r.off.toFixed(2)} ms, on ${r.on.toFixed(2)} ms, darkness adds ${r.extra.toFixed(2)} ms${judged ? (r.extra <= 2 ? ' (within 2 ms)' : ' (OVER 2 ms)') : ' (stress case, not judged)'}`);
}
process.exitCode = ok ? 0 : 1;
