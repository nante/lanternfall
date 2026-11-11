import './hud/fonts.css';
import './hud/art.css';
import './style.css';
import { placeAt } from '../../../packages/game/src/town.ts';
import type { Action, GameView, Notice } from '../../../packages/game/src/model.ts';
import * as THREE from 'three';
import { WorldView } from './render/view.ts';
import { stops, isStopId } from './render/stops.ts';
import { hourToMinute } from './render/clock-style.ts';
import { loadTextureOverrides } from './render/texture-overrides.ts';
import { startPreview } from './preview.ts';
import styleJson from '../../../content/render-style.json' with { type: 'json' };
import { RenderStyle, type ChromeLayout } from '../../../packages/game/src/content-schema.ts';
import { defaultStyle, stylePresets } from '../../../packages/game/src/style-presets.ts';
import { Net } from './net.ts';
import { $ } from './hud/kit.ts';
import { balance, core, findItem } from './hud/core.ts';
import { Column } from './hud/column.ts';
import { minimapWindow } from './hud/minimap.ts';
import { dollWindow } from './hud/doll.ts';
import { battleWindow } from './hud/battle.ts';
import { journalWindow, skillsWindow } from './hud/skills.ts';
import * as containers from './hud/containers.ts';
import * as dialogue from './hud/dialogue.ts';
import { addNotice, clearConsole, mountConsole, remember } from './hud/console.ts';
import { drawHotbar, mountHotbar } from './hud/hotbar.ts';
import { announce, drawViews, mountOverlay, onEffect, statusLine } from './hud/overlay.ts';
import { markSelected } from './hud/items.ts';
import { checkTip } from './hud/tooltip.ts';
import { checkMenu, setWorldFocus } from './hud/menu.ts';
import { resolvePending, wireWorld } from './hud/world-input.ts';
import { wireKeys } from './hud/keys.ts';
import { fightLocked, mountOptions } from './hud/options.ts';
import { gateBusy, mountGate, showGate } from './hud/gate.ts';

$('#app').innerHTML = `
<div class="chrome" id="hud" data-ready="false"></div>
<div class="labels" id="labels" aria-hidden="true"></div>
<div class="fx" id="fx" aria-hidden="true"></div>`;
const hud = $('#hud');
const viewport = Object.assign(document.createElement('div'), { className: 'viewport', id: 'viewport', innerHTML: '<div class="world-host" id="world-host"></div>' });
const footer = Object.assign(document.createElement('footer'), { className: 'foot frame', id: 'foot' });

try { await loadTextureOverrides(); } catch (e) { console.error(e); alert((e as Error).message); }
const world = new WorldView($('#world-host', viewport), $('#labels'), core.map);
core.world = world;
const savedStyle = RenderStyle.safeParse(styleJson);
if (!savedStyle.success) console.error('content/render-style.json is invalid; using the default look.', savedStyle.error);
world.applyStyle(savedStyle.success ? savedStyle.data : defaultStyle);
setWorldFocus(() => world.renderer.domElement.focus({ preventScroll: true }));

const net = new Net({
  view: v => onView(v),
  notice: n => notice(n),
  error: text => notice({ player: '', text, kind: 'error', at: Date.now() }),
  closed: reason => { hud.dataset.ready = 'false'; showGate(reason); },
});
/** Where actions go: the server, or the local engine in the Studio preview. */
let route: (a: Action) => void = a => { net.send(a); };
let tap: ((a: Action) => void) | undefined;
core.send = (a: Action) => { tap?.(a); route(a); if (a.kind === 'say') { remember(a.text); dialogue.saidTrade(a.text); } };
// Dev builds expose the view, the action sender, a tap on every action sent and a way to post a notice, so a probe can drive and check the real game.
if (import.meta.env.DEV) Object.assign(window, { __game: { world, send: core.send, notice: (n: Notice) => notice(n), tap: (f?: (a: Action) => void) => { tap = f; } } });

// ---------------------------------------------------------------- the frame (arrangement picked in the Studio's Look tab)
const column = new Column({
  root: hud, viewport, footer, labels: $('#labels'),
  statics: { map: minimapWindow, gear: dollWindow, battle: battleWindow, skills: skillsWindow, journal: journalWindow },
  defaults: {
    classic: { side: ['map', 'gear', 'battle', '@bags', 'skills', 'journal'] },
    rails: { left: ['battle', 'skills', 'journal'], right: ['map', 'gear', '@bags'] },
    glass: { left: ['battle', 'skills', 'journal'], right: ['map', 'gear', '@bags'] },
  },
  collapsedByDefault: ['journal', 'skills'],
  onViewportResize: () => world.resize(),
  canDraw: () => !!core.view,
});
const applyChrome = (id: ChromeLayout | undefined) => column.setLayout(id ?? 'classic');
applyChrome(savedStyle.success ? savedStyle.data.chrome : undefined);
mountOverlay(viewport);
mountConsole(footer);
mountHotbar($('#hotbar', footer));

function redraw() {
  const v = core.view;
  drawViews();
  if (!v) return;
  column.setDynamic(containers.windows());
  dialogue.drawTalk();
  // A shop needs room under the view: the console grows while one is open.
  const footMin = dialogue.trading() ? '156' : v.self.talking ? '110' : '0';
  if (hud.style.getPropertyValue('--foot-min') !== footMin) { hud.style.setProperty('--foot-min', footMin); requestAnimationFrame(() => world.resize()); }
  column.render();
  const shown = containers.takeReveal();
  if (shown) column.win(shown)?.scrollIntoView({ block: 'nearest' });
  checkTip(a => !a.dataset.id || !!findItem(core.view, a.dataset.id));
  checkMenu();
  markSelected();
}
core.redraw = redraw;

// ---------------------------------------------------------------- the view picker: the perspective, kept across reloads
const VIEW_KEY = 'lanternfall.view';
function saveView() { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ stop: world.stop.vista ? undefined : world.stop.id, yaw: Math.round(THREE.MathUtils.radToDeg(world.rig.yawGoal)) })); } catch { /* storage blocked: the view just won't survive a reload */ } }
{
  let saved: { stop?: string; yaw?: number } = {};
  try { saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}'); } catch { /* unreadable: start at Tilt */ }
  if (saved.stop && isStopId(saved.stop) && !stops[saved.stop].vista) world.setStop(saved.stop);
  if (Number.isFinite(saved.yaw)) world.rig.face(THREE.MathUtils.degToRad(saved.yaw!));
}
function toggleVista() {
  if (world.stop.vista) world.stepStop(1);
  else if (world.canScenery()) world.setStop('scenery');
  else statusLine('The Vista needs open sky.');
}
world.onStop = () => { saveView(); drawViews(); };
drawViews();

// ---------------------------------------------------------------- gate, options, input
async function enter(name: string, token?: string) {
  $('#join-error').textContent = '';
  gateBusy(true);
  try {
    await net.join(name, token);
    $('#gate').hidden = true;
    hud.dataset.ready = 'true';
    world.renderer.domElement.focus();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (token && /could not be found/.test(msg)) { localStorage.removeItem('lanternfall.token'); showGate('That wayfarer is gone. Start a new one.'); }
    else showGate(/ECONNREFUSED|Failed|ws|connect/i.test(msg) ? 'The town is not answering. Start the server with npm run dev.' : msg);
  } finally { gateBusy(false); }
}
mountGate(enter);
function leave() {
  if (fightLocked()) { statusLine('You may not log out during or right after a fight.', 'warn'); return; }
  if (previewScene !== null) { statusLine('This is a preview. There is nothing to leave.'); return; }
  net.leave().then(r => { if (!r.ok) { statusLine(r.text || 'You cannot log out right now.', 'warn'); return; } hud.dataset.ready = 'false'; core.view = undefined; location.reload(); });
}
mountOptions({ leave, resetLayout: () => column.reset() });
wireWorld();
world.onEffect = onEffect;
wireKeys({ saveView, toggleVista, toggleWindow: id => column.toggle(id) });
$('#chat').addEventListener('submit', e => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#chat-input'), text = input.value.trim();
  if (text) core.send({ kind: 'say', text });
  input.value = ''; input.blur(); world.renderer.domElement.focus();
  redraw();
});
// The browser's own menu never opens over the game; text fields keep theirs, for paste.
document.addEventListener('contextmenu', e => { const t = e.target as HTMLElement; if (!t.closest('input, textarea') && (hud.contains(t) || t.closest('.ctx'))) e.preventDefault(); });

const params = new URLSearchParams(location.search);
const previewScene = params.get('preview');
// The server sends its clock only under the darkness rule. Without it, use the bundled day length; Studio previews open at midday, not at the engine's 05:00 start.
const fallbackWorld = previewScene !== null ? { ...balance.world, dayOffset: hourToMinute(Number(params.get('hour') ?? 12)) * 60_000 } : balance.world;
if (previewScene !== null) {
  // Studio Look tab: no server. A local engine plays a scene through the real HUD, and the Studio streams style and layout changes in.
  $('#gate').hidden = true;
  hud.dataset.ready = 'true';
  const play = (scene: string) => { core.view = undefined; clearConsole(); const p = startPreview(core.map, scene, { view: onView, notice }, params.has('dark'), params.get('names')?.split(',') ?? []); route = a => p.send(a); };
  play(previewScene);
  addEventListener('message', e => {
    if (!/^http:\/\/(127\.0\.0\.1|localhost):4174$/.test(e.origin)) return;
    const msg = e.data as { type?: string; style?: unknown; scene?: string };
    if (msg.type === 'lanternfall:style') { const r = RenderStyle.safeParse(msg.style); if (r.success) { world.applyStyle(r.data); applyChrome(r.data.chrome); } }
    if (msg.type === 'lanternfall:scene' && msg.scene) play(msg.scene);
  });
  parent.postMessage({ type: 'lanternfall:preview-ready' }, '*');
} else if (params.get('as')) enter(params.get('as')!);
else showGate();

// ---------------------------------------------------------------- updates
let place = '';
function notice(n: Notice) { addNotice(n); if (n.kind === 'npc') dialogue.heard(n.text, n.npc); if (core.view) redraw(); }
function onView(v: GameView) {
  const first = !core.view;
  core.view = v;
  core.serverOffset = v.time - performance.now();
  world.update(v);
  // After update, so the light field is built from this view's lights and doors, not the last one's.
  world.setWorld(v.time, v.world ?? fallbackWorld);
  resolvePending();
  containers.update(v);
  if (first) containers.openPack();
  const here = placeAt(core.map, v.self);
  if (here !== place) { const firstPlace = !place; place = here; announce(here, v.self.z === 1 ? 'Undercroft' : 'Lanternfall', firstPlace); }
  redraw();
}
setInterval(() => { if (core.view) drawHotbar(); }, 100);

// Developer hook for automated screenshots.
Object.assign(window, { __lanternfall: { world, net, enter, get view() { return core.view; }, mobDefs: balance.creatures, stylePresets, column, core, redraw } });
