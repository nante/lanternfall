import { mobKinds, itemKinds, type ItemKind, type MobKind } from '../../../packages/game/src/ids.ts';
import { seedList, type Scenario, type Summary } from '../../../packages/game/src/simulate.ts';
import type { Balance } from '../../../packages/game/src/content-schema.ts';
import type { Store } from './store.ts';
import type { View } from './balance.ts';
import { h, fmt, pct, fill } from './ui.ts';
import { cashPerKill } from './economy.ts';

type Slot = 'weapon' | 'shield' | 'head' | 'body' | 'feet';
type Result = { label: string; scenario: Scenario; summary: Summary };
const state = {
  scenario: { mob: 'gutterRat', level: 1, meleeSkill: 10, shieldSkill: 10, magicLevel: 0, equipment: { weapon: 'cudgel', head: 'cap', body: 'tunic', feet: 'boots' }, hpFraction: 1, fedMs: 120_000 } as Scenario,
  trials: 200, seedBase: 20251109, overhead: 30, foodCost: true,
  results: null as null | { focus: Result[]; sweep: Result[] | null; key: string },
};
let worker: Worker | null = null, jobId = 0;

export function simulateView(ctx: { store: Store; params: URLSearchParams }): View {
  const store = ctx.store;
  const mobParam = ctx.params.get('mob');
  if (mobParam && (mobKinds as readonly string[]).includes(mobParam)) state.scenario.mob = mobParam as MobKind;
  const saved = () => store.get('balance').saved, draft = () => store.get('balance').draft;
  const draftDiffers = () => store.dirty('balance');
  const scenarioKey = () => JSON.stringify([state.scenario, state.trials, state.seedBase, saved(), draft()]);

  const form = h('section', { class: 'detail sim-form' });
  const out = h('section', { class: 'sim-out', 'aria-live': 'polite' });
  const progress = h('div', { class: 'progress', hidden: true }, h('i', {}));

  const slotItems = (slot: Slot) => itemKinds.filter(k => draft().items[k].slot === slot);
  const select = <T extends string>(label: string, value: T, options: [T, string][], on: (v: T) => void) =>
    h('label', { class: 'field' }, h('span', {}, label), h('select', { onchange: (e: Event) => { on((e.target as HTMLSelectElement).value as T); markStale(); } }, options.map(([v, l]) => h('option', { value: v, selected: v === value }, l))));
  const num = (label: string, value: number, on: (v: number) => void, o: { min?: number; max?: number; step?: number; unit?: string } = {}) =>
    h('label', { class: 'field' }, h('span', {}, label), h('div', { class: 'control' }, h('input', { type: 'number', value, min: o.min, max: o.max, step: o.step ?? 1, oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) { on(v); markStale(); } } }), o.unit ? h('span', { class: 'unit' }, o.unit) : null));

  const drawForm = () => {
    const s = state.scenario, b = draft();
    form.replaceChildren(h('div', { class: 'form' },
      h('h2', {}, 'Fight lab'),
      h('p', { class: 'muted' }, 'Runs the real game engine: one hero against one creature, 100 ms ticks, up to 5 minutes. Saved and draft numbers use the same seeds.'),
      h('h3', {}, 'Opponent'),
      select('Creature', s.mob, mobKinds.map(m => [m, b.creatures[m].name]), v => { s.mob = v; }),
      h('h3', {}, 'Hero'),
      h('div', { class: 'grid2' }, num('Level', s.level, v => { s.level = Math.max(1, Math.min(100, Math.round(v))); }, { min: 1, max: 100 }), num('Melee skill', s.meleeSkill, v => { s.meleeSkill = Math.max(10, Math.round(v)); }, { min: 10, max: 80 }),
        num('Shielding skill', s.shieldSkill, v => { s.shieldSkill = Math.max(10, Math.round(v)); }, { min: 10, max: 80 }), num('Starting health', Math.round(s.hpFraction * 100), v => { s.hpFraction = Math.max(0.01, Math.min(1, v / 100)); }, { min: 1, max: 100, unit: '%' })),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: s.fedMs > 0, onchange: (e: Event) => { s.fedMs = (e.target as HTMLInputElement).checked ? 120_000 : 0; markStale(); } }), 'Fed for 2 minutes (regenerates during the fight)'),
      h('h3', {}, 'Equipment'),
      h('div', { class: 'seg presets' },
        h('button', { onclick: () => { s.equipment = { ...Object.fromEntries(Object.entries(b.starter.equipment).filter(([k]) => k !== 'pack')) }; drawForm(); markStale(); } }, 'Starter kit'),
        h('button', { onclick: () => { s.equipment = { weapon: 'shortsword', shield: 'buckler', head: 'coif', body: 'jerkin', feet: 'boots' }; drawForm(); markStale(); } }, 'Shop mid-tier'),
        h('button', { onclick: () => { s.equipment = { weapon: 'blade', shield: 'banded', head: 'coif', body: 'jerkin', feet: 'boots' }; drawForm(); markStale(); } }, 'Best in shop')),
      h('div', { class: 'grid2' }, (['weapon', 'shield', 'head', 'body', 'feet'] as Slot[]).map(slot =>
        select(slot[0].toUpperCase() + slot.slice(1), (s.equipment[slot] ?? '') as ItemKind | '', [['', 'Nothing'], ...slotItems(slot).map(k => [k, b.items[k].name] as [ItemKind, string])], v => { if (v) s.equipment[slot] = v as ItemKind; else delete s.equipment[slot]; }))),
      h('h3', {}, 'Run'),
      h('div', { class: 'grid2' }, num('Fights', state.trials, v => { state.trials = Math.max(1, Math.min(500, Math.round(v))); }, { min: 1, max: 500 }), num('Seed', state.seedBase, v => { state.seedBase = Math.max(1, Math.round(v)); }, { min: 1 })),
      h('div', { class: 'run-row' },
        h('button', { class: 'primary', onclick: () => run(false) }, draftDiffers() ? 'Run saved vs draft' : 'Run'),
        h('button', { class: 'ghost', onclick: () => run(true) }, 'Also sweep all creatures'),
        h('button', { class: 'ghost', hidden: true, id: 'cancel', onclick: cancel }, 'Cancel')),
      progress));
  };

  const markStale = () => { out.classList.toggle('stale', !!state.results && state.results.key !== scenarioKey()); };
  const cancel = () => { worker?.terminate(); worker = null; progress.hidden = true; (form.querySelector('#cancel') as HTMLElement).hidden = true; };
  const run = (sweep: boolean) => {
    if (store.get('balance').issues.length) { out.replaceChildren(h('p', { class: 'warn' }, 'The draft has problems. Fix them before simulating.')); return; }
    cancel();
    worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' });
    const id = ++jobId, seeds = seedList(state.seedBase, state.trials), key = scenarioKey();
    const runs: { label: string; balance: Balance; scenario: Scenario }[] = [{ label: 'Saved', balance: saved(), scenario: state.scenario }];
    if (draftDiffers()) runs.push({ label: 'Draft', balance: draft(), scenario: state.scenario });
    const focusCount = runs.length;
    if (sweep) for (const mob of mobKinds) { runs.push({ label: `Saved:${mob}`, balance: saved(), scenario: { ...state.scenario, mob } }); if (draftDiffers()) runs.push({ label: `Draft:${mob}`, balance: draft(), scenario: { ...state.scenario, mob } }); }
    progress.hidden = false; (form.querySelector('#cancel') as HTMLElement).hidden = false;
    const t0 = performance.now();
    worker.onmessage = (e: MessageEvent<{ id: number; progress?: number; results?: Result[] }>) => {
      if (e.data.id !== id) return;
      if (e.data.progress !== undefined) { (progress.firstElementChild as HTMLElement).style.transform = `scaleX(${e.data.progress})`; return; }
      const results = e.data.results!;
      state.results = { focus: results.slice(0, focusCount), sweep: sweep ? results.slice(focusCount) : null, key };
      cancel(); drawResults(performance.now() - t0); markStale();
    };
    worker.postMessage({ id, runs, seeds });
  };

  const drawResults = (elapsed?: number) => {
    const r = state.results;
    if (!r) { out.replaceChildren(h('div', { class: 'empty' }, h('p', {}, 'Choose a matchup and press Run.'), h('p', { class: 'muted' }, 'Results show how often the hero wins, how long kills take and how much damage they cost, for the saved numbers and your unsaved draft side by side.'))); return; }
    const cols = r.focus;
    const s0 = cols[0].scenario, b = (label: string) => (label.startsWith('Draft') ? draft() : saved());
    const perHour = (res: Result, value: number) => { const ttk = res.summary.ttk?.mean; return ttk === undefined ? null : (3600 / (ttk + state.overhead)) * value; };
    const food = (res: Result) => { const loaf = b(res.label).items.loaf; return state.foodCost && loaf.food ? (loaf.buy * 3_600_000) / loaf.food : 0; };
    const row = (label: string, f: (res: Result) => string, hint?: string) => h('tr', {}, h('th', { scope: 'row' }, label, hint ? h('span', { class: 'hint' }, hint) : null), cols.map(c => h('td', { class: 'r num' }, f(c))));
    const st = (x: Summary['ttk'], d = 1) => (x ? `${fmt(x.mean, d)}` : 'n/a');
    fill(out,
      h('header', { class: 'sim-head' }, h('h2', {}, `${saved().creatures[s0.mob].name} vs level ${s0.level} hero`), h('p', { class: 'muted' }, `${cols[0].summary.trials} fights per column · seed ${state.seedBase}${elapsed ? ` · ${fmt(elapsed / 1000, 2)} s` : ''}`)),
      h('div', { class: 'outcomes' }, cols.map(c => {
        const s = c.summary, w = s.wins / s.trials, d = s.deaths / s.trials, t = s.timeouts / s.trials;
        return h('figure', { class: 'outcome' }, h('figcaption', {}, c.label),
          h('div', { class: 'big num' }, pct(w)), h('div', { class: 'muted' }, 'wins'),
          h('div', { class: 'stack', role: 'img', 'aria-label': `${pct(w)} wins, ${pct(d)} deaths, ${pct(t)} timeouts` }, h('i', { class: 'w', style: `flex:${w}` }), h('i', { class: 'd', style: `flex:${d}` }), h('i', { class: 't', style: `flex:${t}` })),
          h('div', { class: 'legend' }, h('span', { class: 'w' }, `${s.wins} won`), h('span', { class: 'd' }, `${s.deaths} died`), s.timeouts ? h('span', { class: 't' }, `${s.timeouts} timed out`) : null),
          histogram(s));
      })),
      h('table', { class: 'results' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), cols.map(c => h('th', { class: 'r' }, c.label)))),
        h('tbody', {},
          h('tr', { class: 'section' }, h('th', { colspan: cols.length + 1 }, 'Winning fights only')),
          row('Time to kill', c => (c.summary.ttk ? `${st(c.summary.ttk)} s` : 'n/a'), 'mean'),
          row('Time to kill, slow fights', c => (c.summary.ttk ? `${fmt(c.summary.ttk.p90, 1)} s` : 'n/a'), '90th percentile'),
          row('Damage taken', c => (c.summary.damage ? `${st(c.summary.damage, 0)} hp` : 'n/a'), `of ${cols[0].summary.maxHp} max`),
          row('Damage taken, bad fights', c => (c.summary.damage ? `${fmt(c.summary.damage.p90, 0)} hp` : 'n/a'), '90th percentile'),
          row('Health left', c => (c.summary.endHp ? `${st(c.summary.endHp, 0)} hp` : 'n/a')),
          row('Experience per kill', c => fmt(c.summary.xpPerWin, 1)),
          row('Coins per kill', c => fmt(cashPerKill(b(c.label), s0.mob).total, 1), 'mean gold + sellable drops'),
          h('tr', { class: 'section' }, h('th', { colspan: cols.length + 1 }, h('span', {}, `Per hour, if every fight is won and each kill adds `), h('input', { type: 'number', class: 'inline', value: state.overhead, min: 0, step: 5, 'aria-label': 'Overhead seconds per kill', oninput: (e: Event) => { state.overhead = Math.max(0, Number((e.target as HTMLInputElement).value) || 0); drawResults(); } }), h('span', {}, ' s for resting, walking and looting'))),
          row('Experience per hour', c => { const v = perHour(c, c.summary.xpPerWin); return v === null ? 'n/a' : fmt(Math.round(v)); }),
          row('Coins per hour', c => { const v = perHour(c, cashPerKill(b(c.label), s0.mob).total); return v === null ? 'n/a' : fmt(Math.round(v)); }),
          row('After food', c => { const v = perHour(c, cashPerKill(b(c.label), s0.mob).total); return v === null ? 'n/a' : fmt(Math.round(v - food(c))); }, state.foodCost ? 'eating rye loaves non-stop' : 'food ignored'))),
      cols.some(c => c.summary.deaths) ? h('p', { class: 'warn' }, 'Hourly rates assume you never die. Deaths cost experience, your pack and a walk back; read them next to the death rate.') : null,
      r.sweep ? sweepTable(r.sweep) : null);
  };
  const histogram = (s: Summary) => {
    const max = Math.max(1, ...s.ttkHistogram);
    return h('div', { class: 'hist', role: 'img', 'aria-label': 'Time to kill distribution in 5 second buckets' },
      s.ttkHistogram.map((n, i) => h('i', { style: `--h:${(n / max) * 100}%`, title: `${i * 5}–${i * 5 + 5} s: ${n} fights` })),
      h('span', { class: 'axis' }, h('span', {}, '0 s'), h('span', {}, '60 s+')));
  };
  const sweepTable = (rows: Result[]) => {
    const byMob = mobKinds.map(m => rows.filter(r => r.scenario.mob === m));
    return h('div', {}, h('h3', {}, 'All creatures, same hero'),
      h('table', { class: 'results' }, h('thead', {}, h('tr', {}, h('th', {}, 'Creature'), byMob[0].map(r => [h('th', { class: 'r' }, `${r.label.split(':')[0]} wins`), h('th', { class: 'r' }, 'Kill time')]))),
        h('tbody', {}, byMob.map(group => h('tr', {}, h('th', { scope: 'row' }, saved().creatures[group[0].scenario.mob].name),
          group.map(r => [h('td', { class: `r num ${r.summary.wins / r.summary.trials < 0.5 ? 'bad' : r.summary.wins / r.summary.trials < 0.9 ? 'meh' : 'good'}` }, pct(r.summary.wins / r.summary.trials)), h('td', { class: 'r num' }, r.summary.ttk ? `${fmt(r.summary.ttk.mean, 1)} s` : 'n/a')]))))));
  };

  drawForm(); drawResults(); markStale();
  return { el: h('div', { class: 'split sim' }, form, out), update: () => { markStale(); }, destroy: cancel };
}
