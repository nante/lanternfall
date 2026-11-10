// PROTOTYPE. The visuals lab: one page, every state in the URL. Nothing in production imports this.
import '@fontsource-variable/inter';
import '@fontsource/silkscreen/400.css';
import '../../src/style.css';
import './lab.css';
import { buildTown } from '../../../../packages/game/src/town.ts';
import { RenderStyle } from '../../../../packages/game/src/content-schema.ts';
import { T, type GameView } from '../../../../packages/game/src/model.ts';
import styleJson from '../../../../content/render-style.json' with { type: 'json' };
import { WorldView } from '../../src/render/view.ts';
import { stops, stopIds, isStopId, type StopId } from '../../src/render/stops.ts';
import { hourToMinute, minuteToHour, phaseOf } from '../../src/render/clock-style.ts';
import * as THREE from 'three';
import { defaultBalance } from '../../../../packages/game/src/default-balance.ts';
import { clockAt, lightGrid, lightLevel, lightPasses, staticSources } from '../../../../packages/game/src/light.ts';
import { fieldUniforms } from '../../src/render/lightfield.ts';
import { startLab, places } from './harness.ts';

const tabs = { light: 'Light', figures: 'Figures', scenery: 'Scenery', darkness: 'Darkness' } as const;
/** Each prototype tab can add its own pickers. A module exports `mount(ctx)`; see tabs/README.md. */
export type TabContext = { view: WorldView; lab: ReturnType<typeof startLab>; url: URL; picks: HTMLElement; write: (reload: boolean) => void };
const tabMounts: Partial<Record<string, () => Promise<{ mount: (ctx: TabContext) => void }>>> = import.meta.glob('./tabs/*.ts') as never;
const mountTab = async (tab: string, ctx: TabContext) => { const load = tabMounts[`./tabs/${tab}.ts`]; if (load) (await load()).mount(ctx); };
type Tab = keyof typeof tabs;
const url = new URL(location.href);
const q = (k: string, d: string) => url.searchParams.get(k) ?? d;
const state = {
  tab: q('tab', 'light') as Tab,
  at: q('at', 'meadow'),
  stop: (isStopId(q('stop', 'play')) ? q('stop', 'play') : 'play') as StopId,
  yaw: Number(q('yaw', '0')),
  pal: q('pal', '1') === '1',
  hunt: q('hunt', '1') === '1',
  shot: q('shot', '0') === '1',
  t: Number(q('t', '12')),
  field: q('field', '1') === '1',
  torch: q('torch', '0') === '1',
  levels: q('levels', '0') === '1',
  speed: Number(q('speed', '0')),
};
const write = (reload: boolean) => {
  for (const [k, v] of Object.entries(state)) url.searchParams.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  if (reload) location.href = url.toString(); else history.replaceState(null, '', url);
};
document.body.classList.toggle('lab-shot', state.shot);

const $ = (id: string) => document.getElementById(id)!;
const seg = (host: HTMLElement, items: [string, string][], current: string, pick: (id: string) => void, disabled: (id: string) => boolean = () => false) => {
  host.innerHTML = '';
  for (const [id, label] of items) {
    const b = document.createElement('button');
    b.textContent = label; b.setAttribute('aria-pressed', String(id === current)); b.disabled = disabled(id);
    b.onclick = () => pick(id);
    host.append(b);
  }
};
seg($('tabs'), Object.entries(tabs), state.tab, id => { state.tab = id as Tab; write(true); }, id => !(`./tabs/${id}.ts` in tabMounts) && id !== 'light');
seg($('places'), Object.entries(places).map(([id, p]) => [id, p.label]), state.at, id => { state.at = id; write(true); });

const map = buildTown();
const stage = $('stage');
let view: GameView | undefined;

const w = new WorldView(stage, $('labels'), map);
w.applyStyle(RenderStyle.parse(styleJson));
w.setPalette(state.pal);
w.setStop(state.stop);
w.rig.face(THREE.MathUtils.degToRad(state.yaw));
const drawStops = () => seg($('stops'), stopIds.map(id => [id, stops[id].label]), w.stop.id, id => w.setStop(id as StopId), id => stops[id as StopId].vista && !w.canScenery());
w.onStop = s => { state.stop = s.id; write(false); drawStops(); };
drawStops();
const picks = $('picks');
const drawPicks = () => {
  picks.innerHTML = '<span class="lab-label">Colour</span>';
  for (const [on, label] of [[true, 'Palette'], [false, 'Free']] as const) {
    const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', String(state.pal === on));
    b.onclick = () => { state.pal = on; w.setPalette(on); write(false); drawPicks(); };
    picks.append(b);
  }
};
drawPicks();
// Clock: the rule's clock (light.ts) runs on engine time plus a lab-only day offset. t is the hour on a 24 h face.
const clock = $('clock');
clock.innerHTML = '<span class="lab-label">Time</span><input type="range" min="0" max="24" step="0.05" aria-label="Hour of day"><output></output><span class="lab-seg" id="speeds"></span>';
const range = clock.querySelector('input')!, out = clock.querySelector('output')!;
const dayMs = defaultBalance.world.dayMs;
let first = true;
const lab = startLab(map, state.at, { hunt: state.hunt, tickMs: Number(q('tick', '100')) }, v => { view = v; w.update(v); if (first) { first = false; w.setStop(state.stop); drawStops(); } });
void mountTab(state.tab, { view: w, lab, url, picks: $('picks'), write });
// Play: clicks and keys drive the observed hero through the same actions the network client sends.
const useable = new Set<number>([T.door, T.hatch, T.ladder, T.well, T.vault]);
w.onPick = (tile, info) => {
  if (info.shift) { lab.look(tile, info.actor); return; }
  if (info.actor) {
    const v = view as (GameView & { shades?: { id: string }[] }) | undefined;
    const npc = map.npcs.find(n => n.id === info.actor);
    if (npc) lab.send({ kind: 'talk', npc: npc.id });
    else if (v?.monsters.some(m => m.id === info.actor) || v?.shades?.some(sh => sh.id === info.actor)) lab.send({ kind: 'target', id: info.actor! });
    return;
  }
  if (info.drag) return;
  lab.send(useable.has(map.floors[tile.z].thing[tile.y * map.width + tile.x]) ? { kind: 'useTile', to: tile } : { kind: 'path', to: tile });
};
const steps: Record<string, [number, number]> = { w: [0, -1], ArrowUp: [0, -1], s: [0, 1], ArrowDown: [0, 1], a: [-1, 0], ArrowLeft: [-1, 0], d: [1, 0], ArrowRight: [1, 0] };
addEventListener('keydown', e => {
  if ((e.target as HTMLElement).closest('input, textarea')) return;
  const step = steps[e.key];
  if (step) { e.preventDefault(); const [dx, dy] = w.walkStep(step[0], step[1]); lab.send({ kind: 'walk', dx, dy }); }
  else if (e.key === '-') w.stepStop(1);
  else if (e.key === '=' || e.key === '+') w.stepStop(-1);
  else if (e.key === 'q' || e.key === 'e') { w.turn(e.key === 'q' ? 1 : -1); state.yaw = Math.round(THREE.MathUtils.radToDeg(w.rig.yawGoal)); write(false); }
  else if (e.key === 'v') w.setStop(w.stop.vista ? 'play' : 'scenery');
  else if (e.key === ' ' && view) {
    e.preventDefault();
    const near = [...view.monsters].sort((a, b) => Math.max(Math.abs(a.x - view!.self.x), Math.abs(a.y - view!.self.y)) - Math.max(Math.abs(b.x - view!.self.x), Math.abs(b.y - view!.self.y)))[0];
    if (near) lab.send({ kind: 'target', id: near.id });
  }
});
const logEl = $('log');
setInterval(() => { logEl.innerHTML = lab.notices.slice(-4).map(n => `<li class="${n.kind === 'error' ? 'error' : ''}">${n.text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!)}</li>`).join(''); }, 300);
let offset = hourToMinute(state.t) * 60_000 - lab.engine.state.time, lastT = performance.now(), lastWrite = 0;
const world = () => ({ dayMs, dayOffset: Math.round(offset) });
const minuteNow = () => clockAt(lab.engine.state.time, world()).dayT * 40;
const showClock = () => { const m = minuteNow(), h = minuteToHour(m); range.value = h.toFixed(2); out.textContent = `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')} · ${phaseOf(m)}`; };
range.oninput = () => { offset = hourToMinute(Number(range.value)) * 60_000 - lab.engine.state.time; state.t = Number(range.value); showClock(); write(false); };
const drawSpeeds = () => seg(clock.querySelector('#speeds') as HTMLElement, [['0', 'Hold'], ['1', '1×'], ['60', '60×'], ['600', '600×']], String(state.speed), id => { state.speed = Number(id); write(false); drawSpeeds(); });
drawSpeeds();
// Light picks: field on or off, a carried torch, the rule overlay, and a verify pass.
const lightPicks = document.createElement('div'); lightPicks.className = 'lab-group';
$('picks').after(lightPicks);
const drawLight = () => {
  lightPicks.innerHTML = '<span class="lab-label">Light</span>';
  const toggle = (label: string, on: boolean, flip: () => void) => { const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', String(on)); b.onclick = () => { flip(); write(false); drawLight(); }; lightPicks.append(b); };
  toggle('Field', state.field, () => { state.field = !state.field; w.setFieldOn(state.field); });
  toggle('Torch', state.torch, () => { state.torch = !state.torch; });
  toggle('Levels', state.levels, () => { state.levels = !state.levels; overlay.hidden = !state.levels; });
  const v = document.createElement('button'); v.textContent = 'Verify'; v.onclick = verify; lightPicks.append(v);
};
w.setFieldOn(state.field);
w.fieldGain = Number(q('gain', '1'));
// eye=back,up,look[,fov[,ahead]] retunes the current perspective stop's lens.
{ const e = q('eye', '').split(',').map(Number), s = stops[state.stop]; if (e.length >= 3 && e.every(Number.isFinite) && s.projection === 'persp') Object.assign(s.eye, { back: e[0], up: e[1], look: e[2], fov: e[3] ?? s.eye.fov, ahead: e[4] ?? s.eye.ahead }); }
// Level overlay: the rule's number on every tile in view.
const overlay = document.createElement('canvas'); overlay.className = 'lab-overlay'; overlay.hidden = !state.levels; document.body.append(overlay);
const drawOverlay = () => {
  if (overlay.hidden || !view) return;
  const r = w.renderer.domElement.getBoundingClientRect();
  overlay.width = Math.round(r.width); overlay.height = Math.round(r.height); overlay.style.left = `${r.left}px`; overlay.style.top = `${r.top}px`;
  const g = overlay.getContext('2d')!; g.font = '600 11px Inter Variable, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const z = view.self.z, src = sources();
  for (let y = view.self.y - 9; y <= view.self.y + 9; y++) for (let x = view.self.x - 14; x <= view.self.x + 14; x++) {
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) continue;
    const lv = lightLevel(map, { x, y, z }, src, view.doors, clockAt(lab.engine.state.time, world()));
    const p = w.screen(new THREE.Vector3(x, 0, y));
    g.fillStyle = lv >= 2 ? 'rgba(255,230,170,0.9)' : lv === 1 ? 'rgba(160,170,255,0.85)' : 'rgba(255,90,70,0.85)';
    g.fillText(String(lv), p.x - r.left, p.y - r.top);
  }
};
const sources = () => staticSources(map, lab.engine.state.time, world()).concat(w.carried);
let verdict = '';
function verify() {
  if (!view) return;
  w.setWorld(lab.engine.state.time, world());
  const f = w.field(); if (!f) return;
  const got = f.readLevels(w.renderer);
  const want = lightGrid(map, view.self.z, { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 }, sources(), view.doors, clockAt(lab.engine.state.time, world()));
  let bad = 0, first = '';
  for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) { bad++; if (!first) first = ` first at ${i % map.width},${Math.floor(i / map.width)}: field ${got[i]} rule ${want[i]}`; }
  verdict = `${bad === 0 ? '<span class="ok">0 mismatches</span>' : `<span class="bad">${bad} mismatches</span>${first}`} · ${f.sources.length} sources`;
  console.log('verify', bad, first);
}
(window as unknown as { labVerify: () => string }).labVerify = () => { verify(); return verdict.replace(/<[^>]+>/g, ''); };
drawLight();
(window as unknown as { labProbe: () => string }).labProbe = () => {
  const progs = (w.renderer.info.programs ?? []) as unknown as { cacheKey: string; name: string }[];
  let lambert = 0, field = 0; w.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m instanceof THREE.MeshLambertMaterial) { lambert++; if (m.customProgramCacheKey().includes('field')) field++; } });
  const kinds = new Map<string, number>(); w.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { const k = `${m.type}:${m.customProgramCacheKey().includes('field')}:${o.visible}`; kinds.set(k, (kinds.get(k) ?? 0) + 1); } });
  return `programs ${progs.length} withField ${progs.filter(p => p.cacheKey.includes('field')).length} · lambert meshes ${lambert} patched ${field} · ${[...kinds].map(([k, n]) => k + '=' + n).join(' ')}`;
};
(window as unknown as { labBench: () => string }).labBench = () => {
  const gl = w.renderer.getContext(), times: number[] = [], t0 = performance.now();
  for (let i = 0; i < 120; i++) { const a = performance.now(); w.setWorld(lab.engine.state.time, world()); w.frame(t0 + i * 16.7); gl.finish(); times.push(performance.now() - a); }
  times.sort((a, b) => a - b);
  const L = w.lock;
  return `median ${times[60].toFixed(2)} ms p95 ${times[114].toFixed(2)} ms · buffer ${L.bufW}x${L.bufH} · sources ${w.field()?.sources.length ?? 0} · calls ${w.renderer.info.render.calls}`;
};
// Handles for CDP drivers: the view, the local engine and the latest GameView.
Object.assign(window, { __lab: { w, lab, get view() { return view; } } });
if (q('bench', '0') === '1') setTimeout(() => { document.title = `bench: ${(window as unknown as { labBench: () => string }).labBench()}`; }, 1500);
// Picture vs server under darkness, while walking a scripted square: every sample reads the light field back from the
// GPU (the picture) and checks each creature the server sent against it, and the field against the rule.
(window as unknown as { labDarkCheck: (ms: number) => Promise<string> }).labDarkCheck = ms => new Promise(done => {
  let samples = 0, full = 0, shaded = 0, bad = 0, fieldBad = 0, walked = 0; const examples: string[] = [];
  const route: [number, number][] = [[1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [-1, 0], [-1, 0], [-1, 0], [0, -1], [0, -1]];
  const walker = setInterval(() => { const [dx, dy] = route[walked++ % route.length]; lab.send({ kind: 'walk', dx, dy }); }, 700);
  const tick = setInterval(() => {
    if (!view) return;
    const v = view as GameView & { shades?: { x: number; y: number; z: number }[]; world?: { dayMs: number; dayOffset: number } };
    const wl = v.world ?? world(), z = v.self.z;
    w.setWorld(v.time, wl);
    const f = w.field(); if (!f) return;
    const gpu = f.readLevels(w.renderer), at = (x: number, y: number) => gpu[y * map.width + x];
    const rule = lightGrid(map, z, { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 }, staticSources(map, v.time, wl).concat(v.lights ?? []), v.doors, clockAt(v.time, wl));
    for (let i = 0; i < rule.length; i++) if (rule[i] !== gpu[i]) fieldBad++;
    const adjacent = (x: number, y: number) => Math.max(Math.abs(x - v.self.x), Math.abs(y - v.self.y)) <= 1;
    for (const m of v.monsters) { full++; if (at(m.x, m.y) < 2 && !adjacent(m.x, m.y)) { bad++; examples.push(`full on dark ${m.x},${m.y}`); } }
    for (const sh of v.shades ?? []) { shaded++; if (at(sh.x, sh.y) >= 2 && lightPasses(map, v.self, sh, v.doors)) { bad++; examples.push(`shade on lit ${sh.x},${sh.y}`); } }
    samples++;
  }, 250);
  setTimeout(() => { clearInterval(tick); clearInterval(walker); done(`samples ${samples} · steps ${walked} · full ${full} · shades ${shaded} · picture/server disagreements ${bad} · field/rule mismatches ${fieldBad}${examples.length ? ' · ' + examples.slice(0, 3).join('; ') : ''}`); }, ms);
});
// The surface's field must survive a trip to the undercroft and back with nothing else changing.
(window as unknown as { labFloorTrip: () => string }).labFloorTrip = () => {
  if (!view) return 'no view';
  const t = lab.engine.state.time, wl = world(), z0 = w.floor, z1 = z0 === 0 ? 1 : 0;
  w.setWorld(t, wl);
  w.setFloor(z1, view.doors); w.setWorld(t, wl);
  w.setFloor(z0, view.doors); w.setWorld(t, wl);
  const got = w.field()!.readLevels(w.renderer);
  const want = lightGrid(map, z0, { x0: 0, y0: 0, x1: map.width - 1, y1: map.height - 1 }, staticSources(map, t, wl).concat(w.carried), view.doors, clockAt(t, wl));
  let bad = 0; for (let i = 0; i < want.length; i++) if (got[i] !== want[i]) bad++;
  return `round trip ${z0}→${z1}→${z0}: ${bad} mismatches`;
};
(window as unknown as { labProbe: () => string }).labProbe = () => {
  const progs = (w.renderer.info.programs ?? []) as unknown as { cacheKey: string; name: string }[];
  let lambert = 0, field = 0; w.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m instanceof THREE.MeshLambertMaterial) { lambert++; if (m.customProgramCacheKey().includes('field')) field++; } });
  const kinds = new Map<string, number>(); w.scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) { const k = `${m.type}:${m.customProgramCacheKey().includes('field')}:${o.visible}`; kinds.set(k, (kinds.get(k) ?? 0) + 1); } });
  return `programs ${progs.length} withField ${progs.filter(p => p.cacheKey.includes('field')).length} · lambert meshes ${lambert} patched ${field} · ${[...kinds].map(([k, n]) => k + '=' + n).join(' ')}`;
};
(window as unknown as { labBench: () => string }).labBench = () => {
  const gl = w.renderer.getContext(), times: number[] = [], t0 = performance.now();
  for (let i = 0; i < 120; i++) { const a = performance.now(); w.setWorld(lab.engine.state.time, world()); w.frame(t0 + i * 16.7); gl.finish(); times.push(performance.now() - a); }
  times.sort((a, b) => a - b);
  const L = w.lock;
  return `median ${times[60].toFixed(2)} ms p95 ${times[114].toFixed(2)} ms · buffer ${L.bufW}x${L.bufH} · sources ${w.field()?.sources.length ?? 0} · calls ${w.renderer.info.render.calls}`;
};
if (q('bench', '0') === '1') setTimeout(() => { document.title = `bench: ${(window as unknown as { labBench: () => string }).labBench()}`; }, 1500);
if (q('probe', '0') === '1') setTimeout(() => { document.title = `probe: ${(window as unknown as { labProbe: () => string }).labProbe()}`; }, 2500);
if (q('verify', '0') === '1') setTimeout(() => { document.title = `verify: ${(window as unknown as { labVerify: () => string }).labVerify()}`; }, 2500);
const advance = (t: number) => {
  const dt = t - lastT; lastT = t;
  if (state.speed === 0) offset -= dt; else offset += dt * (state.speed - 1);
  w.carried = state.torch && view ? [{ id: 'torch:self', x: view.self.x, y: view.self.y, z: view.self.z, level: 6, color: 'amber' }] : [];
  // The engine reads its own world settings each tick: keep its clock on the lab's hour so the rule and the picture agree.
  lab.balance.world.dayOffset = Math.round(offset); lab.balance.world.dayMs = dayMs;
  w.setWorld(lab.engine.state.time, world());
  showClock();
  if (t - lastWrite > 1000) { state.t = Math.round(minuteToHour(minuteNow()) * 100) / 100; write(false); lastWrite = t; drawOverlay(); }
  requestAnimationFrame(advance);
};
requestAnimationFrame(advance);
meter(() => {
  const L = w.lock, tileH = w.stop.projection === 'ortho' ? Math.round(Math.sin(w.stop.pitch) * 32 * 100) / 100 : 'lens';
  const cv = w.renderer.domElement.getBoundingClientRect();
  const exact = Math.abs(cv.width * devicePixelRatio - L.bufW * L.k) < 0.5 && Math.abs(cv.height * devicePixelRatio - L.bufH * L.k) < 0.5;
  return `<b>${w.stop.label}</b>\nbuffer ${L.bufW}×${L.bufH}\nscale ×${L.k} · dpr ${devicePixelRatio}\ncanvas ${Math.round(cv.width * devicePixelRatio)}×${Math.round(cv.height * devicePixelRatio)} phys <span class="${exact ? 'ok' : 'bad'}">${exact ? 'exact' : 'stretched'}</span>\ntile 32×${tileH} px${verdict ? '\n' + verdict : ''}`;
});

function meter(readout: () => string) {
  let frames = 0, last = performance.now(), fps = 0;
  const tick = (t: number) => {
    frames++;
    if (t - last > 500) { fps = (frames * 1000) / (t - last); frames = 0; last = t; if (!state.shot) $('readout').innerHTML = `${readout()}\n${fps.toFixed(0)} fps`; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
