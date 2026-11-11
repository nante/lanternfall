// Server cost of one world tick with nobody online. Not part of `npm test`: timings depend on machine load.
// Run: npx tsx tests/bench/idle-tick.ts
// Measures what the server does every 50 ms: clone the state for rollback, tick the engine, and (every save) JSON.stringify it.
import { performance } from 'node:perf_hooks';
import { Engine } from '../../packages/game/src/engine.ts';
import { defaultBalance } from '../../packages/game/src/default-balance.ts';
import { buildTown } from '../../packages/game/src/town.ts';

function run(heroes: number, items: number) {
  const e = new Engine(buildTown(), structuredClone(defaultBalance));
  for (let i = 0; i < heroes; i++) e.createPlayer(`Hero ${i}`).connected = false;
  for (let i = 0; i < items; i++) e.add('tail', `ground:${20 + (i % 44)},${15 + (Math.floor(i / 44) % 50)},0`, i % 8, 1);
  for (const m of Object.values(e.state.monsters).slice(0, 5)) e.dead(m);
  const clone: number[] = [], tick: number[] = [], save: number[] = [];
  for (let i = 0; i < 400; i++) {
    let a = performance.now(); e.state = structuredClone(e.state); clone.push(performance.now() - a);
    a = performance.now(); e.tick(50); tick.push(performance.now() - a);
    if (i % 40 === 0) { a = performance.now(); JSON.stringify(e.state); save.push(performance.now() - a); }
  }
  const median = (xs: number[]) => xs.sort((x, y) => x - y)[Math.floor(xs.length / 2)].toFixed(3);
  const bytes = JSON.stringify(e.state).length;
  console.log(`${heroes} offline heroes, ${items} ground items, ${Object.keys(e.state.monsters).length} creatures: tick ${median(tick)} ms, clone ${median(clone)} ms, stringify ${median(save)} ms, ${(bytes / 1024).toFixed(0)} KiB`);
}
for (const [h, i] of [[0, 0], [20, 100], [200, 1000], [1500, 3000]]) run(h, i);
