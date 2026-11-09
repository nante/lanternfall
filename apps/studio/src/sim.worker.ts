import { runFight, summarize, type Scenario, type Trial } from '../../../packages/game/src/simulate.ts';
import { Balance } from '../../../packages/game/src/content-schema.ts';

type Job = { id: number; runs: { label: string; balance: unknown; scenario: Scenario }[]; seeds: number[] };

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, runs, seeds } = e.data;
  const total = runs.length * seeds.length;
  let done = 0, lastPost = 0;
  const results = runs.map(run => {
    const balance = Balance.parse(run.balance);
    const trials: Trial[] = [];
    for (const seed of seeds) {
      trials.push(runFight(balance, run.scenario, seed));
      done++;
      if (performance.now() - lastPost > 60) { lastPost = performance.now(); postMessage({ id, progress: done / total }); }
    }
    return { label: run.label, scenario: run.scenario, summary: summarize(balance, run.scenario, trials) };
  });
  postMessage({ id, results });
};
