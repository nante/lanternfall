import { chromeLayouts, type RenderStyle } from '../../../packages/game/src/content-schema.ts';
import { stylePresets } from '../../../packages/game/src/style-presets.ts';
import type { Store } from './store.ts';
import type { View } from './balance.ts';
import { h, fill } from './ui.ts';

type NumKey = { [K in keyof RenderStyle]-?: RenderStyle[K] extends number ? K : never }[keyof RenderStyle];
type BoolKey = { [K in keyof RenderStyle]-?: RenderStyle[K] extends boolean ? K : never }[keyof RenderStyle];
type Knob = { key: NumKey; label: string; min: number; max: number; step: number; unit?: string; hint?: string } | { key: BoolKey; label: string; toggle: true; hint?: string };

const groups: { title: string; knobs: Knob[] }[] = [
  { title: 'Clarity', knobs: [
    { key: 'outline', label: 'Outlines', min: 0, max: 1, step: 0.05, hint: 'Above 0.6 every silhouette edge is inked' },
    { key: 'actorPop', label: 'Character lift', min: 0, max: 1, step: 0.05, hint: 'Keeps figures bright in shade' },
    { key: 'alwaysNames', label: 'Always show names and health', toggle: true },
    { key: 'grid', label: 'Tile grid', min: 0, max: 0.6, step: 0.02 },
    { key: 'rim', label: 'Sunlit edges', min: 0, max: 1, step: 0.05 },
  ] },
  { title: 'Ground', knobs: [
    { key: 'groundBrightness', label: 'Brightness', min: 0.5, max: 2.5, step: 0.05 },
    { key: 'groundDetail', label: 'Texture detail', min: 0, max: 1, step: 0.05, hint: 'Lower is calmer' },
    { key: 'grass', label: 'Grass blades', min: 0, max: 1, step: 0.05 },
    { key: 'grassHeight', label: 'Grass height', min: 0.3, max: 1.5, step: 0.05 },
    { key: 'dapple', label: 'Dappled light', min: 0, max: 1, step: 0.05 },
  ] },
  { title: 'Camera', knobs: [
    { key: 'pitch', label: 'Camera angle', min: 30, max: 88, step: 1, unit: '°', hint: '88 is straight down' },
    { key: 'viewHeight', label: 'View size', min: 5, max: 20, step: 0.2, unit: 'tiles' },
    { key: 'pixelHeight', label: 'Pixel resolution', min: 120, max: 480, step: 5, unit: 'px', hint: 'Lower is chunkier' },
  ] },
  { title: 'Light', knobs: [
    { key: 'shadows', label: 'Cast shadows', toggle: true },
    { key: 'sunElevation', label: 'Sun height', min: 10, max: 85, step: 1, unit: '°' },
    { key: 'sunAzimuth', label: 'Sun direction', min: -180, max: 180, step: 1, unit: '°' },
    { key: 'sunIntensity', label: 'Sun strength', min: 0, max: 8, step: 0.1 },
    { key: 'sunWarmth', label: 'Sun warmth', min: 0, max: 1, step: 0.05 },
    { key: 'ambient', label: 'Fill light', min: 0, max: 6, step: 0.1 },
    { key: 'ambientTint', label: 'Fill tint', min: 0, max: 1, step: 0.05, hint: '0 is neutral, 1 is teal sky' },
  ] },
  { title: 'Colour', knobs: [
    { key: 'exposure', label: 'Exposure', min: 0.5, max: 3, step: 0.05 },
    { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.05 },
    { key: 'contrast', label: 'Contrast', min: 0.5, max: 1.8, step: 0.02 },
    { key: 'warmHighlights', label: 'Warm highlights', min: 0, max: 1, step: 0.05 },
    { key: 'coolShadows', label: 'Cool shadows', min: 0, max: 1, step: 0.05 },
    { key: 'vignette', label: 'Vignette', min: 0, max: 1.5, step: 0.05 },
    { key: 'levels', label: 'Colour steps', min: 6, max: 96, step: 1, hint: 'Fewer is more posterised' },
    { key: 'dither', label: 'Dither', min: 0, max: 1, step: 0.05 },
  ] },
  { title: 'Atmosphere', knobs: [
    { key: 'shafts', label: 'Light shafts', min: 0, max: 1, step: 0.05 },
    { key: 'dust', label: 'Floating dust', min: 0, max: 1, step: 0.05 },
  ] },
];

const scenes = [['meadow', 'Meadow fight'], ['square', 'Market square'], ['undercroft', 'Undercroft'], ['shrine', 'Inside the shrine']] as const;
const gameOrigin = 'http://127.0.0.1:4173';
let scene = 'meadow';
const same = (a: RenderStyle, b: RenderStyle) => (Object.keys(a) as (keyof RenderStyle)[]).every(k => k === 'name' || k === 'chrome' || a[k] === b[k]);

export function lookView(ctx: { store: Store }): View {
  const store = ctx.store;
  const doc = () => store.get('style');
  const frame = h('iframe', { class: 'game-frame', title: 'Live game preview', src: `${gameOrigin}/?preview=${scene}` });
  let ready = false, showingSaved = false, queued = 0;
  const send = (style: RenderStyle) => { if (ready) frame.contentWindow?.postMessage({ type: 'lanternfall:style', style }, gameOrigin); };
  const push = () => { cancelAnimationFrame(queued); queued = requestAnimationFrame(() => send(showingSaved ? doc().saved : doc().draft)); };
  const onMessage = (e: MessageEvent) => { if (e.origin === gameOrigin && (e.data as { type?: string })?.type === 'lanternfall:preview-ready') { ready = true; push(); } };
  addEventListener('message', onMessage);

  const presets = h('div', { class: 'presets-list' });
  const drawPresets = () => {
    const cur = doc().draft;
    const match = stylePresets.find(p => same(p.style, cur));
    fill(presets,
      stylePresets.map(p => h('button', { class: `preset${match === p ? ' on' : ''}`, 'aria-pressed': match === p, onclick: () => { store.edit('style', d => { Object.assign(d, structuredClone(p.style)); }); drawKnobs(); } },
        h('span', { class: 'preset-head' }, h('b', {}, p.style.name), p.flat ? h('span', { class: 'badge' }, '2D') : null),
        h('span', { class: 'blurb' }, p.blurb))),
      match ? null : h('p', { class: 'fine' }, 'Custom: your own mix of settings.'));
  };

  /** The HUD frame the live game uses. Same save path as the look: content/render-style.json. */
  const chrome = h('div', { class: 'presets-list', role: 'radiogroup', 'aria-label': 'Interface layout' });
  const drawChrome = () => {
    const cur = doc().draft.chrome ?? 'classic', saved = doc().saved.chrome ?? 'classic';
    fill(chrome, chromeLayouts.map(c => h('button', { class: `preset${cur === c.id ? ' on' : ''}`, role: 'radio', 'aria-checked': cur === c.id, onclick: () => { store.edit('style', d => { d.chrome = c.id; }); drawChrome(); } },
      h('span', { class: 'preset-head' }, h('b', {}, c.label), saved === c.id ? h('span', { class: 'badge' }, 'Live') : null),
      h('span', { class: 'blurb' }, c.blurb))));
  };

  const knobs = h('div', { class: 'knobs' });
  const drawKnobs = () => {
    const d = doc().draft, saved = doc().saved;
    fill(knobs,
      h('label', { class: 'field' }, h('span', {}, 'Name'), h('div', { class: 'control' }, h('input', { type: 'text', value: d.name, oninput: (e: Event) => store.edit('style', x => { x.name = (e.target as HTMLInputElement).value; }, 'style.name') }))),
      groups.map(g => h('section', { class: 'knob-group' }, h('h3', {}, g.title), g.knobs.map(k => {
        if ('toggle' in k) {
          return h('label', { class: `check${d[k.key] !== saved[k.key] ? ' changed' : ''}` }, h('input', { type: 'checkbox', checked: d[k.key], onchange: (e: Event) => { store.edit('style', x => { x[k.key] = (e.target as HTMLInputElement).checked; }); drawKnobs(); } }), k.label);
        }
        const value = d[k.key], changed = value !== saved[k.key];
        const out = h('output', { class: 'num' }, `${+value.toFixed(2)}${k.unit ? ` ${k.unit}` : ''}`);
        const range = h('input', { type: 'range', min: k.min, max: k.max, step: k.step, value, 'aria-label': k.label,
          oninput: (e: Event) => { const v = Number((e.target as HTMLInputElement).value); store.edit('style', x => { x[k.key] = v; }, `style.${k.key}`); out.textContent = `${+v.toFixed(2)}${k.unit ? ` ${k.unit}` : ''}`; row.classList.toggle('changed', v !== saved[k.key]); } });
        const row = h('div', { class: `knob${changed ? ' changed' : ''}`, title: changed ? `Saved: ${saved[k.key]}` : null },
          h('div', { class: 'knob-head' }, h('span', {}, k.label), out), range, k.hint ? h('span', { class: 'hint' }, k.hint) : null);
        return row;
      }))));
  };

  const sceneBar = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Preview scene' });
  const drawScenes = () => fill(sceneBar, scenes.map(([id, label]) => h('button', { role: 'radio', 'aria-checked': id === scene, onclick: () => { scene = id; frame.contentWindow?.postMessage({ type: 'lanternfall:scene', scene: id }, gameOrigin); drawScenes(); } }, label)));
  const holdSaved = h('button', { class: 'ghost', title: 'Hold to see the saved look',
    onpointerdown: () => { showingSaved = true; push(); holdSaved.textContent = 'Showing saved'; },
    onpointerup: () => { showingSaved = false; push(); holdSaved.textContent = 'Hold to compare'; },
    onpointerleave: () => { if (showingSaved) { showingSaved = false; push(); holdSaved.textContent = 'Hold to compare'; } } }, 'Hold to compare');

  drawPresets(); drawChrome(); drawKnobs(); drawScenes();
  const el = h('div', { class: 'look' },
    h('aside', { class: 'look-presets' },
      h('h2', {}, 'Looks'), h('p', { class: 'muted' }, 'Pick a starting point, then tune it on the right. The preview is the real renderer running a local fight.'),
      presets,
      h('h2', { class: 'section-gap' }, 'Interface'), h('p', { class: 'muted' }, 'The frame around the game view. Players can still drag, collapse and resize its panels; their changes stay in their browser.'),
      chrome,
      h('h3', {}, 'What keeps a frame readable'),
      h('ul', { class: 'fixed' },
        h('li', {}, 'Quiet ground, louder things: the floor stays mid-value and low-detail.'),
        h('li', {}, 'Every object and figure is cut out with a dark edge.'),
        h('li', {}, 'Even light. Shade and haze never hide gameplay.'),
        h('li', {}, 'One tile is one readable unit.'),
        h('li', {}, 'Figures are bright, distinct and always named.'))),
    h('section', { class: 'look-stage' }, h('div', { class: 'stage-bar' }, sceneBar, h('span', { class: 'spacer' }), holdSaved), h('div', { class: 'frame-wrap' }, frame),
      h('p', { class: 'fine' }, 'The preview needs the game client running (npm run dev). Saving writes content/render-style.json; the game reloads with it.')),
    h('aside', { class: 'look-knobs' }, knobs));
  return { el, update: () => { drawPresets(); drawChrome(); push(); }, destroy: () => { removeEventListener('message', onMessage); cancelAnimationFrame(queued); } };
}
