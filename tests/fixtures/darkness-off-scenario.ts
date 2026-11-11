// darkness-off-baseline.json was recorded from HEAD 7b337a7b21141ffb8d0020a756b09190ab628135.
// Both engines receive the same actions, RNG seed and IDs.
import { Engine } from '../../packages/game/src/engine.ts';
import { defaultBalance } from '../../packages/game/src/default-balance.ts';
import { buildTown } from '../../packages/game/src/town.ts';
import type { GameView } from '../../packages/game/src/model.ts';

export function darknessOffScenario(): GameView[] {
  const originalRandomUUID = crypto.randomUUID;
  let nextId = 0;
  crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}`;
  try {
    const balance = structuredClone(defaultBalance);
    Object.assign(balance.world, { darkness: false });
    // The baseline was recorded with the rat's loot of that time; content changes to loot must not move it.
    balance.creatures.gutterRat.loot = [{ item: 'tail', chance: 0.6 }, { item: 'loaf', chance: 0.08 }];
    const e = new Engine(buildTown(), balance);
    e.state.rng = 4242;
    e.state.time = 1_700_000;
    const first = e.createPlayer('Aster'), second = e.createPlayer('Mira');
    Object.assign(first, { x: 51, y: 45, z: 1 });
    Object.assign(second, { x: 51, y: 46, z: 1 });
    const rat = Object.values(e.state.monsters).find(m => m.kind === 'gutterRat');
    if (!rat) throw new Error('Scenario needs a rat');
    for (const id of Object.keys(e.state.monsters)) if (id !== rat.id) delete e.state.monsters[id];
    Object.assign(rat, { x: 56, y: 45, z: 1, home: { x: 56, y: 45, z: 1 }, moveAt: 9_999_999, attackAt: 0, target: null });
    const views: GameView[] = [];
    for (let tick = 0; tick < 150; tick++) {
      if (tick === 0 || tick === 6) e.action(first, { kind: 'walk', dx: 1, dy: 0 });
      if (tick === 0) e.action(second, { kind: 'walk', dx: 1, dy: 0 });
      if (tick === 12) e.action(first, { kind: 'target', id: rat.id });
      e.tick();
      views.push(structuredClone(e.view(first)), structuredClone(e.view(second)));
    }
    return views;
  } finally {
    crypto.randomUUID = originalRandomUUID;
  }
}
