import '@fontsource-variable/inter';
import '@fontsource/silkscreen/400.css';
import './style.css';
import './chrome.css';
import { buildTown, placeAt } from '../../../packages/game/src/town.ts';
import {
  type Action, type Body, type GameView, type GameItem, type ItemKind, type Notice, type Pos, type Effect, type SpellId, type NpcSpawn,
  equipSlots, distance, G, T, grounds,
} from '../../../packages/game/src/model.ts';
import * as THREE from 'three';
import { WorldView } from './render/view.ts';
import { stops, stopIds, isStopId } from './render/stops.ts';
import { hourToMinute } from './render/clock-style.ts';
import { loadTextureOverrides } from './render/texture-overrides.ts';
import { startPreview } from './preview.ts';
import styleJson from '../../../content/render-style.json' with { type: 'json' };
import { RenderStyle, type ChromeLayout } from '../../../packages/game/src/content-schema.ts';
import { defaultStyle, stylePresets } from '../../../packages/game/src/style-presets.ts';
import { defaultBalance, defaultRules as rules } from '../../../packages/game/src/default-balance.ts';
import { Net } from './net.ts';
import { icon, iconCanvas } from './icons.ts';
import { Chrome, type PanelDef } from './chrome.ts';

const map = buildTown();
const getDef = rules.item, xpAt = rules.xpAt;
const spells = defaultBalance.spells, npcDefs = defaultBalance.merchants, mobDefs = defaultBalance.creatures;
const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => { const n = root.querySelector(sel); if (!n) throw Error(`Missing ${sel}`); return n as T; };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
// Panels re-render on every server tick; replacing DOM mid-click swallows the click, so only touch the DOM when markup changes.
const rendered = new WeakMap<HTMLElement, string>();
function patch(el: HTMLElement, html: string) { if (rendered.get(el) === html) return false; rendered.set(el, html); el.innerHTML = html; return true; }

$('#app').innerHTML = `
<div class="chrome" id="hud" data-ready="false"></div>
<div class="labels" id="labels" aria-hidden="true"></div>
<div class="fx" id="fx" aria-hidden="true"></div>
<div class="tooltip" id="tooltip" role="tooltip"></div>
<div hidden id="parts">
  <div class="c-viewport" id="viewport">
    <div class="world-host" id="world-host"></div>
    <div class="place" id="place" aria-live="polite"><span id="place-name"></span><small id="place-sub"></small></div>
    <div class="toast" id="toast" role="status"></div>
    <div class="views" id="views" role="group" aria-label="View"></div>
    <nav class="hotbar" id="hotbar" aria-label="Actions"></nav>
    <section class="dialogue" id="dialogue" aria-label="Conversation" data-open="false"></section>
    <section class="window" id="container" data-open="false" aria-label="Container"></section>
  </div>
  <footer class="c-foot" id="foot">
    <div class="c-console"><div class="c-tabs" role="tablist" aria-label="Messages" id="log-tabs"></div><ol class="c-lines" id="log-lines" aria-live="polite" data-filter="all"></ol></div>
    <form class="c-say" id="chat" autocomplete="off"><input id="chat-input" maxlength="180" placeholder="Press Enter to speak" aria-label="Say something" spellcheck="false"><button type="submit">Say</button></form>
  </footer>
</div>
<div class="gate" id="gate">
  <div class="gate-card">
    <p class="kicker">An evening in</p>
    <h1>Lanternfall</h1>
    <p class="lede">A walled town at the edge of the wildwood. Rats in the cellars, beetles below them, and something soft and hungry below that. The lamps never go out.</p>
    <form id="join">
      <div id="continue-wrap" hidden><button type="button" class="primary" id="continue">Continue as <span id="continue-name"></span></button><button type="button" class="link" id="new">Start a new wayfarer</button></div>
      <div id="new-wrap"><label for="name">Your name</label><div class="row"><input id="name" name="name" minlength="2" maxlength="20" required autocomplete="nickname" spellcheck="false" placeholder="Wayfarer"><button class="primary" type="submit">Enter town</button></div></div>
      <p class="error" id="join-error" role="alert"></p>
    </form>
    <p class="keys"><kbd>Click</kbd> walk · attack · talk <kbd>WASD</kbd> step <kbd>1–7</kbd> actions <kbd>I</kbd> pack <kbd>Enter</kbd> speak</p>
  </div>
</div>
<dialog class="menu" id="menu">
  <h2>Paused</h2>
  <dl class="help">
    <div><dt>Click ground</dt><dd>Walk there. Hold and move the pointer to keep walking. <kbd>Esc</kbd> stops</dd></div>
    <div><dt>Right-click</dt><dd>Everything you can do with it: attack, talk, open, use, look</dd></div>
    <div><dt>Click a creature</dt><dd>Attack it. <kbd>Space</kbd> picks the nearest</dd></div>
    <div><dt>Click a person</dt><dd>Talk. Ask about the words they highlight</dd></div>
    <div><dt>Click a body</dt><dd>Loot it</dd></div>
    <div><dt>Drag what stands beside you</dt><dd>Push a creature, hero or body one tile</dd></div>
    <div><dt>Pack items</dt><dd>Click to pick, double-click to eat, drink or wear</dd></div>
    <div><dt><kbd>WASD</kbd> or arrows</dt><dd>Step</dd></div>
    <div><dt><kbd>1</kbd>–<kbd>7</kbd></dt><dd>Spells, tonics, food</dd></div>
    <div><dt><kbd>I</kbd> · <kbd>C</kbd></dt><dd>Show or hide the pack · skills panel</dd></div>
    <div><dt>Panel headers</dt><dd>Drag to rearrange. Drag edges to resize</dd></div>
    <div><dt>Scroll</dt><dd>Change the view, or zoom the map when over it</dd></div>
    <div><dt><kbd>-</kbd> · <kbd>=</kbd></dt><dd>Lower · raise the view: Top-down, Close, Tilt, Third person, First person</dd></div>
    <div><dt><kbd>Q</kbd> · <kbd>E</kbd></dt><dd>Turn the view in Third and First person; <kbd>W</kbd> walks where you look</dd></div>
    <div><dt><kbd>V</kbd></dt><dd>Vista: look out over the land, under open sky</dd></div>
  </dl>
  <div class="menu-actions"><button class="primary" id="resume">Resume</button><button id="leave">Save and leave</button></div>
</dialog>`;

const hud = $('#hud'), fx = $('#fx');
try { await loadTextureOverrides(); } catch (e) { console.error(e); alert((e as Error).message); }
const world = new WorldView($('#world-host'), $('#labels'), map);
const savedStyle = RenderStyle.safeParse(styleJson);
if (!savedStyle.success) console.error('content/render-style.json is invalid; using the default look.', savedStyle.error);
world.applyStyle(savedStyle.success ? savedStyle.data : defaultStyle);
let view: GameView | undefined;
let serverOffset = 0;
const serverNow = () => performance.now() + serverOffset;
const log: Notice[] = [];
let place = '';
let pending: { kind: 'talk'; npc: string } | { kind: 'corpse'; id: string } | { kind: 'vault' } | { kind: 'ground'; at: Pos } | undefined;
let openContainer: { kind: 'corpse'; id: string } | { kind: 'vault' } | { kind: 'ground'; at: Pos } | undefined;
const inPz = (p: Pos) => { const r = map.floors[p.z]?.roof[p.y * map.width + p.x] ?? -1; return p.z === 0 && r >= 0 && !!map.buildings[r]?.pz; };
const groundKey = (p: Pos) => `ground:${p.x},${p.y},${p.z}`;
const pileAt = (p: Pos) => (view?.ground ?? []).filter(i => i.parent === groundKey(p)).sort((a, b) => a.slot - b.slot);
let openPouch: string | undefined;
let tradeMode: 'off' | 'buy' | 'sell' = 'off';

const net = new Net({
  view: v => onView(v),
  notice: n => addLog(n),
  error: text => addLog({ player: '', text, kind: 'error', at: Date.now() }),
  closed: reason => { hud.dataset.ready = 'false'; showGate(reason); },
});
/** Where actions go: the server, or the local engine in the Studio preview. */
let send: (a: Action) => void = a => { net.send(a); };
// Dev builds expose the view and the action sender, so a probe can drive and measure the real game.
if (import.meta.env.DEV) Object.assign(window, { __game: { world, send: (a: Action) => send(a), notice: (n: Notice) => addLog(n) } });

// ---------------------------------------------------------------- chrome: the HUD frame (layout picked in the Studio's Look tab)
const panels: Record<string, PanelDef> = {
  map: { title: 'Map', slots: ['minimap'] },
  status: { title: 'Status', slots: ['identity', 'vitals'] },
  gear: { title: 'Equipment', slots: ['doll'] },
  modes: { title: 'Fighting', slots: ['modes'] },
  battle: { title: 'Battle', slots: ['battle'] },
  skills: { title: 'Skills', slots: ['skills'] },
  pack: { title: 'Pack', slots: ['pack'] },
  journal: { title: 'Spells and tasks', slots: ['journal'] },
  menu: { title: 'Menu', slots: ['buttons'] },
};
const chrome = new Chrome({
  root: hud, viewport: $('#viewport'), footer: $('#foot'), labels: $('#labels'), panels,
  defaults: {
    classic: { side: ['map', 'status', 'gear', 'modes', 'menu', 'battle', 'pack', 'skills', 'journal'] },
    rails: { left: ['battle', 'modes', 'skills', 'journal'], right: ['map', 'status', 'gear', 'pack', 'menu'] },
    glass: { left: ['battle', 'skills', 'journal'], right: ['map', 'status', 'modes', 'gear', 'pack', 'menu'] },
  },
  collapsedByDefault: ['journal'],
  slot: name => (view ? slots[name]?.() ?? '' : ''),
  afterPatch: (name, el, changed) => {
    if (name === 'minimap') drawMinimap(el.querySelector('canvas'));
    if (changed && (name === 'doll' || name === 'pack')) wireItems(el);
  },
  onViewportResize: () => world.resize(),
});
$('#parts').remove();
const applyChrome = (id: ChromeLayout | undefined) => chrome.setLayout(id ?? 'classic');
applyChrome(savedStyle.success ? savedStyle.data.chrome : undefined);

// ---------------------------------------------------------------- view picker: the perspective, kept across reloads
const VIEW_KEY = 'lanternfall.view';
function saveView() { try { localStorage.setItem(VIEW_KEY, JSON.stringify({ stop: world.stop.vista ? undefined : world.stop.id, yaw: Math.round(THREE.MathUtils.radToDeg(world.rig.yawGoal)) })); } catch { /* storage blocked: the view just won't survive a reload */ } }
{
  let saved: { stop?: string; yaw?: number } = {};
  try { saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}'); } catch { /* unreadable: start at Tilt */ }
  if (saved.stop && isStopId(saved.stop) && !stops[saved.stop].vista) world.setStop(saved.stop);
  if (Number.isFinite(saved.yaw)) world.rig.face(THREE.MathUtils.degToRad(saved.yaw!));
}
const viewsEl = $('#views');
function drawViews() {
  patch(viewsEl, stopIds.map(id => `<button type="button" data-stop="${id}" aria-pressed="${world.stop.id === id}"${stops[id].vista && !world.canScenery() ? ' disabled title="Needs open sky"' : ''}>${esc(stops[id].label)}</button>`).join(''));
}
viewsEl.addEventListener('click', e => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]')?.dataset.stop;
  if (id && isStopId(id)) { world.setStop(id); world.renderer.domElement.focus({ preventScroll: true }); }
});
function toggleVista() {
  if (world.stop.vista) world.stepStop(1);
  else if (world.canScenery()) world.setStop('scenery');
  else toast('The Vista needs open sky.');
}
world.onStop = () => { saveView(); drawViews(); };
drawViews();

// ---------------------------------------------------------------- gate
function showGate(error = '') {
  $('#gate').hidden = false;
  const token = localStorage.getItem('lanternfall.token'), name = localStorage.getItem('lanternfall.name');
  $('#continue-wrap').hidden = !token;
  $('#new-wrap').hidden = !!token;
  $('#continue-name').textContent = name ?? 'wayfarer';
  $('#join-error').textContent = error;
  if (!token) $<HTMLInputElement>('#name').focus();
}
async function enter(name: string, token?: string) {
  $('#join-error').textContent = '';
  $('#gate').dataset.busy = 'true';
  try {
    await net.join(name, token);
    $('#gate').hidden = true;
    hud.dataset.ready = 'true';
    world.renderer.domElement.focus();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (token && /could not be found/.test(msg)) { localStorage.removeItem('lanternfall.token'); showGate('That wayfarer is gone. Start a new one.'); }
    else showGate(/ECONNREFUSED|Failed|ws|connect/i.test(msg) ? 'The town is not answering. Start the server with npm run dev.' : msg);
  } finally { delete $('#gate').dataset.busy; }
}
$('#join').addEventListener('submit', e => { e.preventDefault(); const name = $<HTMLInputElement>('#name').value.trim() || 'Wayfarer'; enter(name); });
$('#continue').addEventListener('click', () => enter(localStorage.getItem('lanternfall.name') ?? 'Wayfarer', localStorage.getItem('lanternfall.token') ?? undefined));
$('#new').addEventListener('click', () => { localStorage.removeItem('lanternfall.token'); showGate(); });
const params = new URLSearchParams(location.search);
const previewScene = params.get('preview');
// The server sends its clock only under the darkness rule. Without it, use the bundled day length; Studio previews open at midday, not at the engine's 05:00 start.
const fallbackWorld = previewScene !== null ? { ...defaultBalance.world, dayOffset: hourToMinute(12) * 60_000 } : defaultBalance.world;
if (previewScene !== null) {
  // Studio Look tab: no server. A local engine plays a scene through the real HUD, and the Studio streams style and layout changes in.
  $('#gate').hidden = true;
  hud.dataset.ready = 'true';
  const play = (scene: string) => { view = undefined; log.length = 0; $('#log-lines').innerHTML = ''; const p = startPreview(map, scene, { view: onView, notice: addLog }, params.has('dark')); send = a => p.send(a); };
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

// ---------------------------------------------------------------- view
function onView(v: GameView) {
  const first = !view;
  view = v;
  serverOffset = v.time - performance.now();
  world.update(v);
  // After update, so the light field is built from this view's lights and doors, not the last one's.
  world.setWorld(v.time, v.world ?? fallbackWorld);
  if (first) { mmFloor = -1; renderLogTabs(); }
  if (pending) resolvePending();
  if (openContainer?.kind === 'corpse') {
    const c = v.corpses.find(c => c.id === (openContainer as { id: string }).id);
    // Out of reach, rotted away, or covered by a newer body or a living one: what lies there can no longer be taken.
    if (!c || distance(v.self, c) > 1 || c.stage >= 2) openContainer = undefined;
    else if (topCorpse(c)?.id !== c.id || bodyOn(c)) { openContainer = undefined; toast(bodyOn(c) ? 'Someone is standing on it.' : 'Something lies on top of it.'); }
  }
  if (openContainer?.kind === 'ground' && (distance(v.self, openContainer.at) > 1 || !pileAt(openContainer.at).length)) openContainer = undefined;
  if (openContainer?.kind === 'vault' && distance(v.self, map.vault) > 2) openContainer = undefined;
  if (!v.self.talking) { tradeMode = 'off'; tradeAmount = 1; }
  if (openMenuNow && !openMenuNow.alive()) closeMenu();
  renderHud();
}
function stats() {
  const s = view!.self, l = rules.level(s.xp);
  return { level: l, maxHp: rules.maxHP(l), maxMana: rules.maxMana(l), cap: rules.capacity(l), melee: rules.melee(s.melee), shielding: rules.shielding(s.shielding), magic: rules.magic(s.magic) };
}
const byParent = () => { const m = new Map<string, GameItem[]>(); for (const i of view!.items) { const l = m.get(i.parent) ?? []; l.push(i); m.set(i.parent, l); } return m; };
function carried() { const kids = byParent(), out: GameItem[] = []; const walk = (p: string) => { for (const i of kids.get(p) ?? []) { out.push(i); walk(i.id); } }; walk(`equip:${view!.self.id}`); return out; }
const count = (kind: ItemKind) => carried().filter(i => i.kind === kind).reduce((n, i) => n + i.count, 0);

function renderHud() {
  if (!view) return;
  drawViews();
  const s = view.self;
  const here = placeAt(map, s);
  if (here !== place) { const firstPlace = !place; place = here; announce(here, s.z === 1 ? 'Undercroft' : 'Lanternfall', firstPlace); }
  chrome.render();
  renderHotbar();
  renderDialogue();
  renderContainer();
  if (tipFor && (!tipFor.anchor.isConnected || (tipFor.id && !findItem(tipFor.id)))) closeTooltip();
  markSelected();
}

// ---------------------------------------------------------------- panel contents (one function per slot; the chrome places them)
const pct = (a: number, b: number) => Math.max(0, Math.min(100, (a / b) * 100));
const meter = (kind: 'hp' | 'mp', v: number, max: number, label: string) =>
  `<div class="c-bar ${kind}${kind === 'hp' && v / max < 0.3 ? ' low' : ''}" role="meter" aria-label="${label}" aria-valuenow="${Math.max(0, v)}" aria-valuemin="0" aria-valuemax="${max}"><i style="width:${pct(v, max)}%"></i><span class="num">${Math.max(0, v)}<em>/${max}</em></span></div>`;
const slotNames: Record<string, string> = { weapon: 'Weapon', shield: 'Shield', head: 'Head', body: 'Body', feet: 'Feet', pack: 'Pack' };
const slots: Record<string, () => string> = {
  identity() {
    const s = view!.self, st = stats();
    return `<div class="c-id"><b title="${esc(s.name)}">${esc(s.name)}</b><span class="c-lvl">Level <span class="num">${st.level}</span></span></div>`;
  },
  vitals() {
    const s = view!.self, st = stats(), lo = xpAt(st.level), hi = xpAt(st.level + 1);
    const flags = [s.combatUntil > view!.time ? '<span class="flag combat">In combat</span>' : '', s.fed <= 0 ? '<span class="flag hungry">Hungry · no regeneration</span>' : ''].join('');
    return `<div class="c-vitals">${meter('hp', s.hp, st.maxHp, 'Health')}${meter('mp', s.mana, st.maxMana, 'Mana')}<div class="c-xprow" title="${hi - s.xp} experience to level ${st.level + 1}"><div class="c-bar xp" role="meter" aria-label="Experience to next level" aria-valuenow="${Math.floor(pct(s.xp - lo, hi - lo))}" aria-valuemax="100"><i style="width:${pct(s.xp - lo, hi - lo)}%"></i></div><span class="num">${Math.floor(pct(s.xp - lo, hi - lo))}%</span></div>${flags ? `<div class="flags">${flags}</div>` : ''}</div>`;
  },
  minimap() {
    const s = view!.self, z = chrome.mapZoom;
    return `<div class="c-map"><canvas width="${map.width * 2}" height="${map.height * 2}" style="aspect-ratio:${map.width}/${map.height}" aria-label="Map at ${z}× zoom. Click to walk there; scroll to zoom."></canvas><div class="c-mapctl" role="group" aria-label="Map zoom"><button data-action="mapzoom" data-dir="1" aria-label="Zoom map in" ${z >= 4 ? 'disabled' : ''}>+</button><button data-action="mapzoom" data-dir="-1" aria-label="Zoom map out" ${z <= 1 ? 'disabled' : ''}>−</button><span class="c-zoomlvl num" aria-hidden="true">${z}×</span><span class="c-floor" title="Floor">${s.z ? 'B1' : 'G'}</span></div><p class="c-place"><span>${esc(placeAt(map, s))}</span><span class="num">${s.x}, ${s.y}</span></p></div>`;
  },
  doll() {
    const s = view!.self, st = stats(), eq = `equip:${s.id}`, equipped = byParent().get(eq) ?? [];
    const weight = carried().reduce((n, i) => n + getDef(i.kind).weight * i.count, 0);
    const cells = equipSlots.map((name, i) => `<div class="doll-${name}">${itemButton(equipped.find(e => e.slot === i), eq, i, slotNames[name])}</div>`).join('');
    return `<div class="c-doll">${cells}<div class="c-cap" title="${weight.toFixed(1)} of ${st.cap} oz carried"><span>Cap</span><b class="num">${Math.max(0, Math.floor(st.cap - weight))}</b></div><div class="c-gold" title="Gold">${icon('gold')}<b class="num">${count('gold')}</b></div></div>`;
  },
  modes() {
    const s = view!.self;
    const m: [string, string, string][] = [['offensive', 'Attack', 'More damage, weaker blocks'], ['balanced', 'Balanced', 'Even damage and blocks'], ['defensive', 'Defend', 'Less damage, much stronger blocks']];
    return `<div class="c-modes" role="group" aria-label="Fighting mode">${m.map(([k, l, tip]) => `<button data-action="mode" data-fight="${k}" aria-pressed="${s.fightMode === k}" title="${tip}">${l}</button>`).join('')}<button data-action="chase" aria-pressed="${s.chase}" class="c-chase" title="${s.chase ? 'Chase: you follow your target. Click to stand your ground.' : 'Stand: you hold your position. Click to chase.'}">${s.chase ? 'Chase' : 'Stand'}</button></div>`;
  },
  battle() {
    const self = view!.self;
    const list = view!.monsters.filter(m => m.z === self.z && distance(m, self) <= 8).sort((a, b) => distance(a, self) - distance(b, self));
    if (!list.length) return `<p class="c-empty">Nothing hostile nearby.</p>`;
    return `<ul class="c-battle">${list.map(m => { const d = mobDefs[m.kind]; return `<li><button data-action="target" data-id="${m.id}" aria-pressed="${self.target === m.id}" aria-label="${esc(d.name)}, ${Math.round(pct(m.hp, d.hp))}% health, ${distance(m, self)} away"><span class="c-name">${esc(d.name)}</span><span class="c-hp"><i style="width:${pct(m.hp, d.hp)}%"></i></span><span class="c-dist num">${distance(m, self)}</span></button></li>`; }).join('')}</ul>`;
  },
  skills() {
    const s = view!.self, st = stats(), lo = xpAt(st.level), hi = xpAt(st.level + 1);
    const row = (label: string, k: { level: number; progress: number }) => `<li><span>${label}</span><b class="num">${k.level}</b><i class="c-prog"><i style="width:${Math.floor(k.progress * 100)}%"></i></i></li>`;
    return `<ul class="c-skills">${row('Melee', st.melee)}${row('Shielding', st.shielding)}${row('Magic', st.magic)}<li class="c-plain"><span>Experience</span><b class="num">${s.xp.toLocaleString('en')}</b></li><li class="c-plain"><span>To level ${st.level + 1}</span><b class="num">${(hi - s.xp).toLocaleString('en')}</b></li><li class="c-plain"><span>Deaths</span><b class="num">${s.deaths}</b></li></ul>`;
  },
  pack() {
    const s = view!.self, eq = byParent().get(`equip:${s.id}`) ?? [], pack = eq.find(i => i.slot === 5);
    const pouch = openPouch && view!.items.find(i => i.id === openPouch);
    if (!pack) return '<p class="c-empty">You carry no pack. Your remains still hold it.</p>';
    return `<div class="grid">${grid(pack.id, getDef(pack.kind).slots!)}</div>${pouch ? `<h3>${esc(getDef(pouch.kind).name)}</h3><div class="grid">${grid(pouch.id, getDef(pouch.kind).slots!)}</div>` : ''}`;
  },
  journal() {
    const s = view!.self, st = stats();
    const quest = s.quests.shells === 1 ? `<li><b>Glaze for the shrine</b><span>Bring Sister Wren 5 beetle shells. You carry ${count('shell')}.</span></li>` : s.quests.shells === 2 ? '<li class="done"><b>Glaze for the shrine</b><span>Done.</span></li>' : '<li class="muted"><span>Ask Sister Wren for a task.</span></li>';
    return `<ul class="spells">${(Object.keys(spells) as SpellId[]).map(id => { const sp = spells[id]; return `<li class="${st.level < sp.level ? 'locked' : ''}">${icon(id)}<b>${sp.name}</b><span>say “${sp.words}” · ${sp.mana} mana${st.level < sp.level ? ` · level ${sp.level}` : ''}</span></li>`; }).join('')}</ul><h3>Tasks</h3><ul class="quests">${quest}</ul>`;
  },
  buttons() {
    return `<div class="c-buttons"><button data-action="options" aria-haspopup="dialog" aria-expanded="false">Options</button><button data-action="logout" aria-haspopup="dialog" aria-expanded="false">Log out</button></div>`;
  },
};
const locked = () => !!view && view.self.combatUntil > view.time && !inPz(view.self);
const popovers = {
  options: () => `<label><input type="checkbox" data-pop="names" ${world.labels.classList.contains('names') ? 'checked' : ''}> Always show names and health</label><div class="c-popact"><button data-pop="reset">Reset panel layout</button><button data-pop="help">Controls</button><button data-pop="close">Done</button></div>`,
  logout: () => locked()
    ? '<p>You are in a fight. Wait for the fight lock to end, or step into a shrine.</p><div class="c-popact"><button data-pop="close">Stay</button></div>'
    : '<p>Save and leave Lanternfall?</p><div class="c-popact"><button data-pop="close">Stay</button><button class="c-primary" data-pop="leave">Save and leave</button></div>',
};
function leave() {
  if (locked()) { toast('You may not log out during or right after a fight.'); return; }
  if (previewScene !== null) { toast('This is a preview. There is nothing to leave.'); return; }
  net.leave().then(r => { if (!r.ok) { toast(r.text || 'You cannot log out right now.'); return; } hud.dataset.ready = 'false'; view = undefined; location.reload(); });
}
hud.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!t || !view) return;
  const a = t.dataset.action;
  if (a === 'mode') send({ kind: 'mode', fight: t.dataset.fight as 'offensive' | 'balanced' | 'defensive' });
  else if (a === 'chase') send({ kind: 'mode', chase: !view.self.chase });
  else if (a === 'target') { pending = undefined; send({ kind: 'target', id: view.self.target === t.dataset.id ? null : t.dataset.id! }); }
  else if (a === 'mapzoom') chrome.setMapZoom(chrome.mapZoom + Number(t.dataset.dir));
  else if (a === 'options') chrome.openPopover('options', 'Options', popovers.options);
  else if (a === 'logout') chrome.openPopover('logout', 'Log out', popovers.logout);
  else if (a === 'logtab') { $('#log-lines').dataset.filter = t.dataset.tab!; renderLogTabs(); scrollLog(true); }
});
document.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-pop]');
  if (!t) return;
  const a = t.dataset.pop;
  if (a === 'names') world.labels.classList.toggle('names', (t as HTMLInputElement).checked);
  else if (a === 'reset') chrome.reset();
  else if (a === 'help') { chrome.closePopover(); $<HTMLDialogElement>('#menu').showModal(); }
  else if (a === 'leave') { chrome.closePopover(); leave(); }
  else if (a === 'close') chrome.closePopover(true);
});
let wheel = 0;
hud.addEventListener('wheel', e => {
  if (!(e.target as HTMLElement).closest('.c-map canvas')) return;
  e.preventDefault();
  wheel += e.deltaY; if (Math.abs(wheel) < 60) return; // trackpads send many tiny deltas; one notch ≈ one step
  chrome.setMapZoom(chrome.mapZoom + (wheel < 0 ? 1 : -1)); wheel = 0;
}, { passive: false });
let placeTimer = 0;
function announce(name: string, sub: string, quiet: boolean) {
  const el = $('#place');
  $('#place-name').textContent = name; $('#place-sub').textContent = sub;
  if (quiet) return;
  el.dataset.show = 'true';
  clearTimeout(placeTimer);
  placeTimer = window.setTimeout(() => { delete el.dataset.show; }, 2600);
}

// ---------------------------------------------------------------- log, toast, fx
const logTabs: [string, string][] = [['all', 'All'], ['fight', 'Fight'], ['talk', 'People']];
const logGroup = (n: Notice) => (n.kind === 'combat' || n.kind === 'loot' ? 'fight' : n.kind === 'npc' || n.kind === 'say' ? 'talk' : 'other');
function renderLogTabs() {
  const cur = $('#log-lines').dataset.filter;
  patch($('#log-tabs'), logTabs.map(([id, label]) => `<button role="tab" data-action="logtab" data-tab="${id}" aria-selected="${cur === id}">${label}</button>`).join(''));
}
function scrollLog(force = false) { const ol = $('#log-lines'); if (force || ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40) ol.scrollTop = ol.scrollHeight; }
function addLog(n: Notice) {
  log.push(n); if (log.length > 80) log.shift();
  const ol = $('#log-lines'), stick = ol.scrollHeight - ol.scrollTop - ol.clientHeight < 40;
  const li = document.createElement('li');
  li.className = n.kind; li.dataset.group = logGroup(n);
  const who = n.npc ? map.npcs.find(x => x.id === n.npc)?.name : undefined;
  const said = n.kind === 'say' ? speech(n) : undefined;
  li.innerHTML = who && n.kind === 'npc' && !n.text.startsWith(who) ? `<b>${esc(who)}</b> ${esc(n.text)}` : said?.name ? `<b>${esc(said.name)}:</b> ${esc(said.words)}` : esc(n.text);
  ol.append(li);
  while (ol.children.length > 200) ol.firstElementChild?.remove();
  if (stick) scrollLog(true);
  if (n.kind === 'level') floatText(innerWidth / 2, innerHeight * 0.38, n.text, 'level');
  if (n.kind === 'error') toast(n.text);
  if (said && n.from) bubble(n.from, said.words);
  // The merchant's answer to "trade" opens the shop, whether the word came from the chip or the chat.
  if (n.kind === 'npc' && n.npc && n.npc === view?.self.talking && /^(.*: )?Have a look\.$/.test(n.text) && tradeMode === 'off') { const d = npcDefs[npcAt(n.npc)!.role]; tradeMode = d.sells.length ? 'buy' : 'sell'; }
  renderDialogue();
}
renderLogTabs();
/** "<Name>: <words>" as the server sends speech, split so the log can bold the name and the bubble show the words. */
function speech(n: Notice) {
  const name = n.from ? (view?.self.id === n.from ? view.self.name : view?.players.find(p => p.id === n.from)?.name) : undefined;
  if (name && n.text.startsWith(`${name}: `)) return { name, words: n.text.slice(name.length + 2) };
  const i = n.text.indexOf(': ');
  return i > 0 ? { name: n.text.slice(0, i), words: n.text.slice(i + 2) } : { name: '', words: n.text };
}
// ---------------------------------------------------------------- speech bubbles: over the speaker, where the name label sits
const bubbles: { from: string; el: HTMLElement; until: number }[] = [];
const BUBBLE_MS = 4000;
function bubble(from: string, words: string) {
  const el = document.createElement('div');
  el.className = 'bubble'; el.textContent = words;
  $('#labels').append(el);
  bubbles.push({ from, el, until: performance.now() + BUBBLE_MS + Math.min(2000, words.length * 30) });
  if (!bubbleLoop) bubbleLoop = requestAnimationFrame(placeBubbles);
}
let bubbleLoop = 0;
function placeBubbles() {
  const now = performance.now();
  for (let i = bubbles.length - 1; i >= 0; i--) if (bubbles[i].until <= now) { bubbles[i].el.remove(); bubbles.splice(i, 1); }
  // Newest lowest, nearest the head; older lines of the same speaker stack above it.
  const lift = new Map<string, number>();
  for (let i = bubbles.length - 1; i >= 0; i--) {
    const b = bubbles[i], at = world.actors.overHead(b.from), up = lift.get(b.from) ?? 0;
    b.el.style.visibility = at?.shown ? 'visible' : 'hidden';
    if (at) b.el.style.transform = `translate3d(${at.x}px, ${at.y - 14 - up}px, 0) translate(-50%, -100%)`;
    lift.set(b.from, up + b.el.offsetHeight + 3);
    b.el.dataset.fading = String(b.until - now < 300);
  }
  bubbleLoop = bubbles.length ? requestAnimationFrame(placeBubbles) : 0;
}
let toastTimer = 0;
function toast(text: string) {
  const t = $('#toast'); t.textContent = text; t.dataset.show = 'true';
  clearTimeout(toastTimer); toastTimer = window.setTimeout(() => { delete t.dataset.show; }, 2200);
}
function floatText(x: number, y: number, text: string, kind: string) {
  const el = document.createElement('span');
  el.className = `float ${kind}`; el.textContent = text;
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  fx.append(el);
  const rise = kind === 'level' ? -40 : -30;
  const anim = el.animate(reduceMotion
    ? [{ opacity: 1 }, { opacity: 1, offset: 0.6 }, { opacity: 0 }]
    : [{ transform: 'translate(-50%, 0) scale(0.9)', opacity: 0 }, { transform: 'translate(-50%, -8px) scale(1)', opacity: 1, offset: 0.15 }, { transform: `translate(-50%, ${rise}px) scale(1)`, opacity: 0 }],
    { duration: kind === 'level' ? 2400 : 1000, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}
world.onEffect = (e: Effect, p) => {
  const jitter = (Math.random() - 0.5) * 16;
  const map2: Record<Effect['kind'], [string, string]> = {
    hit: [String(e.value), 'hit'], miss: ['miss', 'miss'], block: ['blocked', 'miss'], heal: [`+${e.value}`, 'heal'], mana: [`+${e.value}`, 'mana'],
    ember: [String(e.value), 'ember'], burst: ['', 'ember'], xp: [`+${e.value} xp`, 'xp'], level: [`Level ${e.value}`, 'level'],
  };
  const [text, kind] = map2[e.kind];
  if (e.kind === 'level' || e.kind === 'burst') return;
  floatText(p.x + jitter, p.y - (e.kind === 'xp' ? 18 : 0), text, kind);
};

// ---------------------------------------------------------------- input: world
const npcAt = (id?: string) => map.npcs.find(n => n.id === id);
const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y && a.z === b.z;
const thingAt = (p: Pos) => map.floors[p.z]?.thing[p.y * map.width + p.x];
const usable = (p: Pos) => ([T.door, T.hatch, T.ladder, T.well, T.altar, T.vault] as number[]).includes(thingAt(p) ?? -1);
/** A tile a body could stand on: walkable ground, not a wall, not an NPC. */
function standable(q: Pos) {
  const f = map.floors[q.z];
  if (!f || q.x < 0 || q.y < 0 || q.x >= map.width || q.y >= map.height) return false;
  const i = q.y * map.width + q.x, g = f.ground[i], t = f.thing[i];
  return g !== G.water && g !== G.void && ([T.none, T.flowers, T.door, T.hatch] as number[]).includes(t) && !map.npcs.some(n => same(n, q));
}
/** Bodies on a tile, bottom first: the newest lies on top (ties by id). */
const corpsesAt = (p: Pos) => (view?.corpses ?? []).filter(c => same(c, p) && c.stage < 2).sort((a, b) => a.born - b.born || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
const topCorpse = (p: Pos) => corpsesAt(p).at(-1);
/** A living creature or another hero standing on the tile keeps what lies there out of reach. */
const bodyOn = (p: Pos) => !!view && (view.monsters.some(m => m.hp > 0 && same(m, p)) || (view.shades ?? []).some(s => same(s, p)) || view.players.some(h => h.id !== view!.self.id && same(h, p)));
type Who = { kind: 'foe' | 'npc' | 'player'; id: string; name: string; at: Pos };
/** What an actor id under the pointer is. A shade (a creature seen only as a dark figure) is a foe like any other. */
function who(id?: string): Who | undefined {
  if (!view || !id) return;
  const m = view.monsters.find(m => m.id === id); if (m) return { kind: 'foe', id, name: mobDefs[m.kind].name, at: m };
  const s = view.shades?.find(s => s.id === id); if (s) return { kind: 'foe', id, name: 'Something', at: s };
  const n = npcAt(id); if (n) return { kind: 'npc', id, name: n.name, at: n };
  const h = view.players.find(h => h.id === id); if (h) return { kind: 'player', id, name: h.name, at: h };
}
function attack(id: string) { if (!view) return; pending = undefined; send({ kind: 'target', id: view.self.target === id ? null : id }); }
function talkTo(npcId: string) { const npc = npcAt(npcId); if (!npc) return; approach(npc, 3); pending = { kind: 'talk', npc: npc.id }; resolvePending(); }
/** Walk to a tile; your own tile stops a walk in progress. */
function walkTo(tile: Pos) {
  if (!view) return;
  pending = undefined; closeMenu();
  if (same(tile, view.self)) { if (view.route.length) send({ kind: 'stop' }); return; }
  send({ kind: 'path', to: tile });
}
function useAt(tile: Pos) {
  if (thingAt(tile) === T.vault) { pending = { kind: 'vault' }; send({ kind: 'useTile', to: tile }); resolvePending(); return; }
  pending = undefined; send({ kind: 'useTile', to: tile });
}
function openCorpse(c: Body) {
  if (topCorpse(c)?.id !== c.id) return toast('Something lies on top of it.');
  if (bodyOn(c)) return toast('Someone is standing on it.');
  pending = { kind: 'corpse', id: c.id }; if (view && distance(view.self, c) > 1) approach(c, 1); resolvePending();
}
function openPile(tile: Pos) { pending = { kind: 'ground', at: tile }; if (view && distance(view.self, tile) > 1) approach(tile, 1); resolvePending(); }
const look = (at: Pos, actor?: string) => send({ kind: 'look', at, actor });
world.onPick = (tile, info) => {
  if (!view) return;
  closeTooltip(); closeMenu();
  if (info.shift) { look(tile, info.actor); return; }
  if (info.drag) { walkTo(tile); return; }
  const w = who(info.actor);
  if (w?.kind === 'foe') return attack(w.id);
  if (w?.kind === 'npc') return talkTo(w.id);
  // Another hero: stand beside them, never step into them.
  if (w?.kind === 'player') { pending = undefined; approach(w.at, 1); return; }
  const c = topCorpse(tile);
  if (c) return openCorpse(c);
  if (pileAt(tile).length) return openPile(tile);
  const t = thingAt(tile);
  if (t === T.vault || t === T.hatch || t === T.ladder || t === T.well || t === T.altar) return useAt(tile);
  walkTo(tile);
};
/**
 * A press within reach on something that can be dragged belongs to that drag: the top floor item, a creature or hero
 * (push), or the top body (push). Released without moving, it is a click. Open ground may become hold-to-walk; anything
 * else that can be clicked stays a click.
 */
world.onPress = (tile, e, info) => {
  if (!view || info.shift) return 'click';
  const self = view.self, w = who(info.actor);
  if (w) {
    if (w.kind !== 'npc' && distance(self, w.at) <= 1) { dragFrom(e, ghostLabel(w.name), () => world.onPick(tile, info), ev => pushTo(w.id, w.at, ev)); return 'own'; }
    return 'click';
  }
  if (distance(self, tile) <= 1) {
    const top = pileAt(tile).at(-1);
    if (top) { dragFrom(e, icon(getDef(top.kind).icon), () => world.onPick(tile, info), ev => dropItemAt(top, ev)); return 'own'; }
    const c = topCorpse(tile);
    if (c) { dragFrom(e, ghostLabel(c.name), () => world.onPick(tile, info), ev => pushTo(c.id, c, ev)); return 'own'; }
  }
  return pileAt(tile).length || corpsesAt(tile).length || usable(tile) ? 'click' : 'hold';
};
world.onMenu = (tile, info, x, y) => { const m = worldMenu(tile, info.actor); if (m) openMenu(x, y, m); };
// ---------------------------------------------------------------- items in the world: drop, throw, pick up
world.itemIcon = kind => iconCanvas(getDef(kind as ItemKind).icon);
const canvasEl = world.renderer.domElement;
const dropOnTile = (i: GameItem, clientX: number, clientY: number) => {
  const tile = world.tileAtPoint(clientX, clientY);
  if (!tile || !view) return;
  if (distance(view.self, tile) > 7) return toast('That is too far away to throw.');
  send({ kind: 'moveItem', id: i.id, parent: groundKey(tile), slot: 0, count: i.count, version: i.version });
};
// Pack or loot window → world: native drag and drop onto the canvas.
canvasEl.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('text/item')) e.preventDefault(); });
canvasEl.addEventListener('drop', e => {
  e.preventDefault();
  const i = view?.items.find(x => x.id === e.dataTransfer?.getData('text/item'));
  if (i) dropOnTile(i, e.clientX, e.clientY);
});
const ghostLabel = (name: string) => `<span class="ghost-name">${esc(name)}</span>`;
/** Follow the pointer with a ghost once it has moved; release runs `drop`, or `click` if it never moved. */
function dragFrom(e: PointerEvent, ghostHtml: string, click: () => void, drop: (ev: PointerEvent) => void) {
  const start = { x: e.clientX, y: e.clientY }, pointer = e.pointerId;
  let ghost: HTMLElement | null = null;
  const moveGhost = (ev: PointerEvent) => {
    if (ev.pointerId !== pointer || (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6)) return;
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.innerHTML = ghostHtml; document.body.append(ghost); closeTooltip(); closeMenu(); }
    ghost.style.transform = `translate(${ev.clientX - 16}px, ${ev.clientY - 16}px)`;
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== pointer) return;
    removeEventListener('pointermove', moveGhost); removeEventListener('pointerup', end); removeEventListener('pointercancel', end);
    const g = ghost as HTMLElement | null;
    if (ev.type === 'pointercancel') { g?.remove(); return; }
    if (!g) return click();
    g.remove();
    drop(ev);
  };
  addEventListener('pointermove', moveGhost); addEventListener('pointerup', end); addEventListener('pointercancel', end);
}
function dropItemAt(top: GameItem, ev: PointerEvent) {
  const item = view?.items.find(x => x.id === top.id) ?? view?.ground.find(x => x.id === top.id) ?? top;
  const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
  const cell = under?.closest<HTMLElement>('.cell');
  if (cell) return move(item, cell.dataset.parent!, Number(cell.dataset.slot));
  if (under === canvasEl) dropOnTile(item, ev.clientX, ev.clientY);
}
/** A dragged creature, hero or body dropped on a neighbouring tile: the server decides whether it moves. */
function pushTo(id: string, from: Pos, ev: PointerEvent) {
  if (document.elementFromPoint(ev.clientX, ev.clientY) !== canvasEl) return;
  const to = world.tileAtPoint(ev.clientX, ev.clientY);
  if (!to || same(to, from)) return;
  if (distance(from, to) > 1) return toast('Push it to a tile next to it.');
  send({ kind: 'push', id, to });
}

function approach(p: Pos, within: number) {
  if (!view || distance(view.self, p) <= within) return;
  const options: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) options.push({ x: p.x + dx, y: p.y + dy, z: p.z });
  const free = options.filter(standable).sort((a, b) => distance(view!.self, a) - distance(view!.self, b));
  if (free[0]) send({ kind: 'path', to: free[0] });
}
function resolvePending() {
  if (!view || !pending) return;
  const self = view.self;
  if (pending.kind === 'talk') { const n = npcAt(pending.npc)!; if (distance(self, n) <= 3) { send({ kind: 'talk', npc: n.id }); pending = undefined; } }
  else if (pending.kind === 'corpse') { const c = view.corpses.find(c => c.id === (pending as { id: string }).id); if (!c) pending = undefined; else if (distance(self, c) <= 1) { openContainer = { kind: 'corpse', id: c.id }; pending = undefined; renderContainer(); } }
  else if (pending.kind === 'vault') { if (distance(self, map.vault) <= 2) { openContainer = { kind: 'vault' }; pending = undefined; renderContainer(); } }
  else if (pending.kind === 'ground') { const at = pending.at; if (!pileAt(at).length) pending = undefined; else if (distance(self, at) <= 1) { openContainer = { kind: 'ground', at }; pending = undefined; renderContainer(); } }
}

// ---------------------------------------------------------------- context menu: right-click on the world or an item
type Entry = { label: string; run: () => void };
/** `alive` is asked on every update; the menu closes once what it was opened on is gone. */
type Menu = { title: string; entries: Entry[]; alive: () => boolean };
function worldMenu(tile: Pos, actorId?: string): Menu | undefined {
  if (!view) return;
  const self = view.self, w = who(actorId), entries: Entry[] = [];
  if (w?.kind === 'foe') entries.push({ label: self.target === w.id ? 'Stop attacking' : 'Attack', run: () => attack(w.id) });
  if (w?.kind === 'npc') entries.push({ label: 'Talk', run: () => talkTo(w.id) });
  const c = topCorpse(tile), pile = pileAt(tile).length > 0;
  // A body under a living creature or another hero stays shut until they move or are moved.
  if (c && !bodyOn(c)) entries.push({ label: pile ? 'Open body' : 'Open', run: () => openCorpse(c) });
  if (pile) entries.push({ label: c ? 'Open pile' : 'Open', run: () => openPile(tile) });
  if (!w && usable(tile)) entries.push({ label: 'Use', run: () => useAt(tile) });
  if (!w && !c && !pile && !usable(tile) && !same(tile, self) && standable(tile)) entries.push({ label: 'Walk here', run: () => walkTo(tile) });
  if (!w && same(tile, self) && view.route.length) entries.push({ label: 'Stop walking', run: () => walkTo(tile) });
  entries.push({ label: 'Look', run: () => look(tile, w?.id) });
  const title = w?.name ?? c?.name ?? (pile ? 'On the ground' : placeAt(map, tile));
  const alive = () => (w ? !!who(w.id) : true) && (!c || corpsesAt(tile).some(x => x.id === c.id)) && (!pile || pileAt(tile).length > 0);
  return { title, entries, alive };
}
const findItem = (id: string) => view?.items.find(x => x.id === id) ?? view?.ground.find(x => x.id === id);
/** What a double-click (and the first menu entry) does with an item, as a word for the menu. */
function primaryLabel(i: GameItem): string | undefined {
  if (!view) return;
  const def = getDef(i.kind), eq = `equip:${view.self.id}`;
  if (!carried().some(c => c.id === i.id)) return 'Take';
  if (openContainer?.kind === 'vault' && !i.parent.startsWith('equip:')) return 'Store';
  if (def.food) return 'Eat';
  if (def.heal || def.mana) return 'Drink';
  if (def.slots && !def.slot) return openPouch === i.id ? 'Close' : 'Open';
  if (i.parent === eq) return def.slot === 'pack' ? undefined : 'Unequip';
  if (def.slot) return 'Equip';
}
function itemMenu(i: GameItem): Menu | undefined {
  if (!view) return;
  const main = primaryLabel(i), mine = carried().some(c => c.id === i.id), entries: Entry[] = [];
  if (main) entries.push({ label: main, run: () => { const now = findItem(i.id); if (now) primary(now); } });
  if (mine) entries.push({ label: 'Drop', run: () => { const now = findItem(i.id); if (now && view) move(now, groundKey(view.self), 0); } });
  entries.push({ label: 'Look', run: () => { if (view) send({ kind: 'look', at: { x: view.self.x, y: view.self.y, z: view.self.z }, item: i.id }); } });
  return { title: `${getDef(i.kind).name}${i.count > 1 ? ` × ${i.count}` : ''}`, entries, alive: () => !!findItem(i.id) };
}
const menuEl = Object.assign(document.createElement('div'), { className: 'ctx', hidden: true });
menuEl.setAttribute('role', 'menu');
document.body.append(menuEl);
let openMenuNow: Menu | undefined;
let menuReturn: HTMLElement | null = null;
function openMenu(x: number, y: number, m: Menu) {
  closeTooltip(); held.clear();
  menuReturn = document.activeElement as HTMLElement | null;
  menuEl.setAttribute('aria-label', m.title);
  menuEl.innerHTML = `<p class="ctx-title" aria-hidden="true">${esc(m.title)}</p>${m.entries.map((en, i) => `<button type="button" role="menuitem" tabindex="-1" data-i="${i}">${esc(en.label)}</button>`).join('')}`;
  menuEl.querySelectorAll<HTMLButtonElement>('[data-i]').forEach(b => b.addEventListener('click', () => { const en = m.entries[Number(b.dataset.i)]; closeMenu(); en.run(); }));
  menuEl.hidden = false; openMenuNow = m;
  const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
  const left = Math.max(8, Math.min(innerWidth - w - 8, x)), top = Math.max(8, Math.min(innerHeight - h - 8, y));
  menuEl.style.left = `${left}px`; menuEl.style.top = `${top}px`;
  menuEl.style.transformOrigin = `${x - left}px ${y - top}px`;
  menuEl.querySelector<HTMLElement>('[data-i]')?.focus({ preventScroll: true });
}
function closeMenu() {
  if (menuEl.hidden) return;
  const back = menuEl.contains(document.activeElement) ? menuReturn : null;
  menuEl.hidden = true; menuEl.innerHTML = ''; openMenuNow = undefined;
  if (back?.isConnected && back !== document.body) back.focus({ preventScroll: true }); else if (back) canvasEl.focus({ preventScroll: true });
}
menuEl.addEventListener('keydown', e => {
  const items = [...menuEl.querySelectorAll<HTMLElement>('[data-i]')], i = items.indexOf(document.activeElement as HTMLElement);
  const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(items.length - 1);
  else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); }
  else if (e.key !== 'Enter' && e.key !== ' ') return;
  // Keys the menu uses never reach the world: arrows would walk, Escape would stop or pause, Space would target.
  e.stopPropagation();
});
document.addEventListener('pointerdown', e => { if (!menuEl.hidden && !menuEl.contains(e.target as Node)) closeMenu(); }, true);
addEventListener('blur', closeMenu);
addEventListener('resize', closeMenu);
// The browser's own menu never opens over the game; text fields keep theirs, for paste.
document.addEventListener('contextmenu', e => {
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea') || !(hud.contains(t) || menuEl.contains(t))) return;
  e.preventDefault();
  const b = t.closest<HTMLElement>('.item[data-id]'), i = b && findItem(b.dataset.id!);
  const m = i && itemMenu(i); if (m) openMenu(e.clientX, e.clientY, m);
});

// ---------------------------------------------------------------- input: keyboard
const held = new Set<string>();
const dirs: Record<string, [number, number]> = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
let lastStep = 0;
const typing = () => document.activeElement === $('#chat-input');
/** Something modal is up: the gate, the pause menu, or a context menu. Held keys never walk behind it. */
const blocked = () => !$('#gate').hidden || $<HTMLDialogElement>('#menu').open || !menuEl.hidden;
function heldStep() {
  let dx = 0, dy = 0;
  for (const k of held) { const d = dirs[k]; if (d) { dx += d[0]; dy += d[1]; } }
  return world.walkStep(Math.sign(dx), Math.sign(dy));
}
function step(dx: number, dy: number) { if (!dx && !dy) return; lastStep = performance.now(); pending = undefined; send({ kind: 'walk', dx, dy }); }
setInterval(() => {
  if (!view || !held.size || typing()) return;
  if (blocked()) { held.clear(); return; }
  const [dx, dy] = heldStep();
  // Send the next step as the current one is finishing, so held keys follow the real step time.
  if (serverNow() >= view.self.moveAt - 90 && performance.now() - lastStep > 120) step(dx, dy);
}, 30);
/** Focus is on the world (or nowhere): Space, Enter and Tab are the game's. On a button or a field they are the page's. */
const worldFocus = () => { const f = document.activeElement; return !f || f === document.body || f === canvasEl; };
addEventListener('keydown', e => {
  // Cmd, Ctrl or Alt mean a browser or system shortcut; on macOS the key-up of a key pressed with Cmd never arrives.
  if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') { held.clear(); return; }
  if (e.key === 'Escape' && !menuEl.hidden) { closeMenu(); return; }
  if (blocked()) return;
  const input = $<HTMLInputElement>('#chat-input');
  if (typing()) { if (e.key === 'Escape') { input.value = ''; input.blur(); canvasEl.focus(); } return; }
  if ((e.target as HTMLElement).closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (dirs[k]) {
    e.preventDefault();
    if (held.has(k)) return;
    held.add(k);
    // A tap steps at once: the poll alone can miss a key that is down for less than its interval.
    if (view) step(...heldStep());
    return;
  }
  const own = worldFocus();
  if (e.key === 'Enter') { if (!own) return; e.preventDefault(); input.focus(); return; }
  if (/^[1-7]$/.test(e.key)) { if (!e.repeat) hotbarSlots()[Number(e.key) - 1]?.run(); return; }
  if (k === ' ' || k === 'tab') { if (!own) return; e.preventDefault(); if (!e.repeat) cycleTarget(); return; }
  if (k === 'i') { chrome.toggle('pack'); world.resize(); return; }
  if (k === 'c') { chrome.toggle('skills'); world.resize(); return; }
  if (e.key === '-') { world.stepStop(1); return; }
  if (e.key === '=' || e.key === '+') { world.stepStop(-1); return; }
  if (k === 'q' || k === 'e') { world.turn(k === 'q' ? 1 : -1); saveView(); return; }
  if (k === 'v') { toggleVista(); return; }
  if (e.key === 'Escape') {
    // First stop walking, then close what is open, then drop the target, then pause.
    if (view?.route.length) send({ kind: 'stop' });
    else if (openContainer) openContainer = undefined;
    else if (view?.self.talking) send({ kind: 'talk', npc: null });
    else if (view?.self.target) send({ kind: 'target', id: null });
    else { held.clear(); $<HTMLDialogElement>('#menu').showModal(); }
    renderHud();
  }
});
addEventListener('keyup', e => { held.delete(e.key.toLowerCase()); if (e.key === 'Meta') held.clear(); });
addEventListener('blur', () => held.clear());
function cycleTarget() {
  if (!view) return;
  const self = view.self;
  // Shades count: a creature seen only as a dark figure can still be fought.
  const foes: { id: string; at: Pos }[] = [...view.monsters.map(m => ({ id: m.id, at: m as Pos })), ...(view.shades ?? []).map(s => ({ id: s.id, at: s as Pos }))];
  const list = foes.filter(f => f.at.z === self.z && distance(self, f.at) <= 7).sort((a, b) => distance(self, a.at) - distance(self, b.at));
  if (!list.length) { toast('Nothing to fight nearby.'); return; }
  const i = list.findIndex(f => f.id === self.target);
  send({ kind: 'target', id: list[(i + 1) % list.length].id });
}
$('#chat').addEventListener('submit', e => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#chat-input'); const text = input.value.trim();
  if (text) send({ kind: 'say', text });
  const npc = view?.self.talking ? npcAt(view.self.talking) : undefined, def = npc && npcDefs[npc.role];
  if (def && /\btrade\b/i.test(text) && (def.sells.length || def.buys.length) && tradeMode === 'off') { tradeMode = def.sells.length ? 'buy' : 'sell'; renderDialogue(); }
  input.value = ''; input.blur(); world.renderer.domElement.focus();
});
$('#resume').addEventListener('click', () => $<HTMLDialogElement>('#menu').close());
$('#leave').addEventListener('click', () => { $<HTMLDialogElement>('#menu').close(); leave(); });

// ---------------------------------------------------------------- hotbar
type Slot = { key: string; label: string; sub: string; icon: string; disabled: boolean; cooldown: number; count?: number; run: () => void };
function hotbarSlots(): Slot[] {
  if (!view) return [];
  const st = stats(), now = serverNow(), self = view.self;
  const cd = Math.max(0, self.spellAt - now);
  const spell = (id: SpellId): Slot => { const sp = spells[id]; const locked = st.level < sp.level; return { key: id, label: sp.name, sub: locked ? `Level ${sp.level}` : `${sp.mana} mana`, icon: id, disabled: locked || self.mana < sp.mana, cooldown: cd / sp.cooldown, run: () => send({ kind: 'cast', spell: id }) }; };
  const item = (kind: ItemKind, label: string): Slot => { const n = count(kind); return { key: kind, label, sub: getDef(kind).name, icon: getDef(kind).icon, disabled: !n, cooldown: kind === 'tonic' || kind === 'tincture' ? cd / 1000 : 0, count: n, run: () => send({ kind: 'useKind', item: kind }) }; };
  const food = count('cheese') ? 'cheese' : 'loaf';
  return [spell('mend'), spell('ember'), spell('renew'), item('tonic', 'Tonic'), item('tincture', 'Tincture'), { ...item(food, 'Eat'), disabled: !count('cheese') && !count('loaf') }, spell('cinderburst')];
}
function renderHotbar() {
  const bar = $('#hotbar');
  const slots = hotbarSlots();
  if (bar.children.length !== slots.length) {
    bar.innerHTML = slots.map((_, i) => `<button class="slot" data-i="${i}"><span class="ico"></span><span class="cd"></span><kbd>${i + 1}</kbd><span class="n num"></span></button>`).join('');
    bar.querySelectorAll<HTMLButtonElement>('.slot[data-i]').forEach(b => {
      b.addEventListener('click', () => hotbarSlots()[Number(b.dataset.i)]?.run());
      b.addEventListener('pointerenter', () => { const s = hotbarSlots()[Number(b.dataset.i)]; if (s) showTooltip(b, `<b>${esc(s.label)}</b><span>${esc(s.sub)}</span>`); });
      b.addEventListener('pointerleave', closeTooltip);
    });
  }
  slots.forEach((s, i) => {
    const b = $<HTMLButtonElement>(`.slot[data-i="${i}"]`, bar);
    if (b.dataset.icon !== s.icon) { $('.ico', b).innerHTML = icon(s.icon); b.dataset.icon = s.icon; }
    b.setAttribute('aria-label', `${s.label}, ${s.sub}`);
    b.classList.toggle('off', s.disabled);
    $('.n', b).textContent = s.count !== undefined ? String(s.count) : '';
    $('.cd', b).style.transform = `scaleY(${Math.min(1, s.cooldown)})`;
  });
}
setInterval(() => { if (view) renderHotbar(); }, 100);

// ---------------------------------------------------------------- item cells (doll, pack, loot)
function itemButton(i: GameItem | undefined, parent: string, slot: number, placeholder = '') {
  if (!i) return `<div class="cell empty" data-parent="${esc(parent)}" data-slot="${slot}">${placeholder ? `<span class="ph">${placeholder}</span>` : ''}</div>`;
  return `<div class="cell" data-parent="${esc(parent)}" data-slot="${slot}"><button class="item" draggable="true" data-id="${i.id}" aria-label="${esc(getDef(i.kind).name)}${i.count > 1 ? ` × ${i.count}` : ''}">${icon(getDef(i.kind).icon)}${i.count > 1 ? `<span class="n num">${i.count}</span>` : ''}</button></div>`;
}
function grid(parent: string, size: number) {
  const kids = byParent().get(parent) ?? [];
  let html = '';
  for (let s = 0; s < size; s++) html += itemButton(kids.find(k => k.slot === s), parent, s);
  return html;
}

// ---------------------------------------------------------------- item interactions
function freeSlotIn(parent: string, size: number, reserved?: Set<string>) { const used = new Set((byParent().get(parent) ?? []).map(i => i.slot)); for (let s = 0; s < size; s++) if (!used.has(s) && !reserved?.has(`${parent}:${s}`)) return s; return -1; }
/** Where an item should go in a set of containers: onto a matching stack with room, else the first free slot. */
function targetIn(parents: { id: string; size: number }[], item?: GameItem, reserved?: Set<string>): { parent: string; slot: number } | undefined {
  if (item && getDef(item.kind).stack) for (const c of parents) {
    const stack = (byParent().get(c.id) ?? []).find(j => j.kind === item.kind && j.id !== item.id && j.count < 100);
    if (stack) return { parent: c.id, slot: stack.slot };
  }
  for (const c of parents) { const s = freeSlotIn(c.id, c.size, reserved); if (s >= 0) return { parent: c.id, slot: s }; }
}
function packTarget(item?: GameItem, reserved?: Set<string>) {
  if (!view) return;
  const eq = byParent().get(`equip:${view.self.id}`) ?? [];
  const pack = eq.find(i => i.slot === 5);
  const bags = [pack, ...(pack ? (byParent().get(pack.id) ?? []).filter(i => getDef(i.kind).slots) : [])].filter(Boolean) as GameItem[];
  return targetIn(bags.map(b => ({ id: b.id, size: getDef(b.kind).slots! })), item, reserved);
}
function move(i: GameItem, parent: string, slot: number) { send({ kind: 'moveItem', id: i.id, parent, slot, count: i.count, version: i.version }); }
function primary(i: GameItem) {
  if (!view) return;
  const def = getDef(i.kind), eq = `equip:${view.self.id}`;
  const inCorpseOrVault = !carried().some(c => c.id === i.id);
  if (inCorpseOrVault) { const t = packTarget(i); if (!t) return toast('Your pack is full.'); return move(i, t.parent, t.slot); }
  if (openContainer?.kind === 'vault' && !i.parent.startsWith('equip:')) { const t = targetIn([{ id: `vault:${view.self.id}`, size: 30 }], i); if (!t) return toast('Your vault is full.'); return move(i, t.parent, t.slot); }
  if (def.food || def.heal || def.mana) return send({ kind: 'useItem', id: i.id });
  if (def.slots && !def.slot) { openPouch = openPouch === i.id ? undefined : i.id; if (!chrome.isOpen('pack')) chrome.toggle('pack'); return renderHud(); }
  if (i.parent === eq) { if (def.slot === 'pack') return toast('Drag the pack to move it.'); const t = packTarget(); if (!t) return toast('Your pack is full.'); return move(i, t.parent, t.slot); }
  if (def.slot) return move(i, eq, equipSlots.indexOf(def.slot));
  toast(`${def.name} sells to a merchant.`);
}
function describe(i: GameItem) {
  const d = getDef(i.kind), bits: string[] = [];
  if (d.attack) bits.push(`Attack ${d.attack}`); if (d.defense) bits.push(`Defense ${d.defense}`); if (d.armor) bits.push(`Armor ${d.armor}`);
  if (d.slots) bits.push(`${d.slots} slots`); if (d.heal) bits.push(`Restores ~${d.heal} health`); if (d.mana) bits.push(`Restores ~${d.mana} mana`); if (d.food) bits.push(`Feeds ${Math.round(d.food / 60000)} min`);
  bits.push(`${(d.weight * i.count).toFixed(1)} oz`);
  if (d.sell) bits.push(`Sells for ${d.sell}`);
  const use = primaryLabel(i), mine = carried().some(c => c.id === i.id);
  const how = use ? `${mine ? 'Double-click' : 'Click'}: ${use.toLowerCase()} · right-click for more` : 'Right-click for more';
  return `<b>${esc(d.name)}${i.count > 1 ? ` × ${i.count}` : ''}</b><span>${bits.join(' · ')}</span><span class="tip-how">${how}</span>`;
}
/** Pack and doll: one click selects, a second click soon after uses. Loot, vault and floor windows take on one click. */
let selected: string | undefined;
let lastItemClick = { id: '', at: 0 };
function itemClick(i: GameItem) {
  closeTooltip();
  const now = performance.now(), twice = lastItemClick.id === i.id && now - lastItemClick.at < 400;
  lastItemClick = twice ? { id: '', at: 0 } : { id: i.id, at: now };
  if (!carried().some(c => c.id === i.id) || twice) { primary(i); return; }
  selected = i.id; markSelected();
}
function markSelected() {
  if (selected && !findItem(selected)) selected = undefined;
  for (const b of document.querySelectorAll<HTMLElement>('.item[data-id]')) b.classList.toggle('selected', b.dataset.id === selected);
}
function wireItems(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('.item').forEach(b => {
    const it = () => findItem(b.dataset.id!);
    b.addEventListener('click', () => { const i = it(); if (i) itemClick(i); });
    b.addEventListener('dragstart', e => { e.dataTransfer?.setData('text/item', b.dataset.id!); b.classList.add('dragging'); closeTooltip(); });
    b.addEventListener('dragend', () => b.classList.remove('dragging'));
    b.addEventListener('pointerenter', () => { const i = it(); if (i) showTooltip(b, describe(i)); });
    b.addEventListener('pointerleave', closeTooltip);
  });
  root.querySelectorAll<HTMLElement>('.cell').forEach(c => {
    c.addEventListener('dragover', e => { e.preventDefault(); c.classList.add('over'); });
    c.addEventListener('dragleave', () => c.classList.remove('over'));
    c.addEventListener('drop', e => { e.preventDefault(); c.classList.remove('over'); const id = e.dataTransfer?.getData('text/item'); const i = view?.items.find(x => x.id === id); if (i) move(i, c.dataset.parent!, Number(c.dataset.slot)); });
  });
}
let tipShown = 0;
/** The item cell the tooltip describes; the tooltip closes when that item goes away or its cell is redrawn. */
let tipFor: { anchor: HTMLElement; id?: string } | undefined;
function showTooltip(anchor: HTMLElement, html: string) {
  tipFor = { anchor, id: anchor.dataset.id };
  const t = $('#tooltip'); t.innerHTML = html;
  const r = anchor.getBoundingClientRect();
  t.dataset.show = 'true';
  t.dataset.instant = performance.now() - tipShown < 400 ? 'true' : 'false';
  const tw = t.offsetWidth;
  t.style.left = `${Math.min(innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2))}px`;
  t.style.top = `${r.top - t.offsetHeight - 8}px`;
  tipShown = performance.now();
}
function closeTooltip() { const t = $('#tooltip'); if (t.dataset.show) tipShown = performance.now(); delete t.dataset.show; tipFor = undefined; }
world.onHover = (text, x, y) => {
  const t = $('#tooltip');
  if (!text) { if (t.dataset.world) { delete t.dataset.show; delete t.dataset.world; } return; }
  t.innerHTML = `<b>${esc(text)}</b>`; t.dataset.show = 'true'; t.dataset.world = 'true'; t.dataset.instant = 'true';
  t.style.left = `${x + 14}px`; t.style.top = `${y + 14}px`;
};

// ---------------------------------------------------------------- dialogue
/** How many a Buy or Sell press trades. One by default, so nothing goes in bulk unless the player picks it. */
const tradeAmounts = [1, 10, 'all'] as const;
let tradeAmount: (typeof tradeAmounts)[number] = 1;
const sellable = (k: ItemKind) => carried().filter(i => i.kind === k && !i.parent.startsWith('equip:')).reduce((n, i) => n + i.count, 0);
/** The amount, cut to what you can pay for or have, and to the server's 50 per trade. */
function tradeCount(k: ItemKind) {
  const d = getDef(k), most = tradeMode === 'buy' ? Math.floor(count('gold') / Math.max(1, d.buy)) : sellable(k);
  return Math.max(0, Math.min(50, most, tradeAmount === 'all' ? most : tradeAmount));
}
function renderDialogue() {
  const el = $('#dialogue');
  const npc = view?.self.talking ? npcAt(view.self.talking) : undefined;
  el.dataset.open = String(!!npc);
  if (!npc || !view) { patch(el, ''); return; }
  const def = npcDefs[npc.role];
  const lines = log.filter(n => n.npc === npc.id).slice(-3);
  const topics = [...new Set([...(npc.role === 'shrine' ? ['heal', 'task'] : []), ...Object.keys(def.topics).filter(t => def.topics[t]), ...(def.sells.length || def.buys.length ? ['trade'] : [])])];
  const role: Record<NpcSpawn['role'], string> = { shrine: 'Keeper of the shrine', smith: 'Smith', inn: 'Innkeeper', apothecary: 'Apothecary', store: 'Provisioner', warden: 'Gate warden' };
  let trade = '';
  if (tradeMode !== 'off') {
    const list = tradeMode === 'buy' ? def.sells : def.buys;
    const amounts = tradeAmounts.map(a => `<button role="radio" aria-checked="${tradeAmount === a}" data-amount="${a}">${a === 'all' ? 'All' : a}</button>`).join('');
    trade = `<div class="trade"><div class="seg" role="tablist">${def.sells.length ? `<button role="tab" aria-selected="${tradeMode === 'buy'}" data-mode="buy">Buy</button>` : ''}${def.buys.length ? `<button role="tab" aria-selected="${tradeMode === 'sell'}" data-mode="sell">Sell</button>` : ''}<span class="amount" role="radiogroup" aria-label="How many">${amounts}</span><span class="gold" title="Your gold">${icon('gold')}<b class="num">${count('gold')}</b></span></div><ul>${list.map(k => {
      const d = getDef(k), have = sellable(k), price = tradeMode === 'buy' ? d.buy : d.sell, n = tradeCount(k);
      return `<li><span class="ico">${icon(d.icon)}</span><span class="nm">${esc(d.name)}<small>${d.attack ? `Attack ${d.attack}` : d.defense ? `Defense ${d.defense}` : d.armor ? `Armor ${d.armor}` : d.heal ? `+${d.heal} health` : d.mana ? `+${d.mana} mana` : d.slots ? `${d.slots} slots` : tradeMode === 'sell' ? `You have ${have}` : ''}</small></span><span class="price num" title="Each">${price}</span><button class="small" data-trade="${k}" ${n < 1 ? 'disabled' : ''} title="${n > 0 ? `${n} for ${n * price} gold` : tradeMode === 'buy' ? 'Not enough gold' : 'You have none'}">${tradeMode === 'buy' ? 'Buy' : 'Sell'}${n > 1 ? ` ${n}` : ''}</button></li>`;
    }).join('')}</ul></div>`;
  }
  if (!patch(el, `<header><div><b>${esc(npc.name)}</b><small>${role[npc.role]}</small></div><button class="close" aria-label="End conversation" data-bye>×</button></header>
    <div class="lines">${lines.map(l => `<p>${esc(l.text.replace(`${npc.name}: `, ''))}</p>`).join('')}</div>
    <div class="chips">${topics.map(t => `<button class="chip ${t === 'trade' && tradeMode !== 'off' ? 'on' : ''}" data-topic="${t}">${t}</button>`).join('')}<button class="chip quiet" data-topic="bye">bye</button></div>${trade}`)) return;
  el.querySelectorAll<HTMLButtonElement>('[data-topic]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.topic!;
    // Turning the shop off is the client's business; only turning it on says "trade".
    if (t === 'trade' && tradeMode !== 'off') { tradeMode = 'off'; renderDialogue(); return; }
    if (t === 'trade') tradeMode = def.sells.length ? 'buy' : 'sell';
    send({ kind: 'say', text: t });
    renderDialogue();
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => { tradeMode = b.dataset.mode as 'buy' | 'sell'; renderDialogue(); }));
  el.querySelectorAll<HTMLButtonElement>('[data-amount]').forEach(b => b.addEventListener('click', () => { const a = b.dataset.amount!; tradeAmount = a === 'all' ? 'all' : Number(a) as 1 | 10; renderDialogue(); }));
  el.querySelector('[data-bye]')?.addEventListener('click', () => send({ kind: 'talk', npc: null }));
  el.querySelectorAll<HTMLButtonElement>('[data-trade]').forEach(b => b.addEventListener('click', () => {
    const item = b.dataset.trade as ItemKind, n = tradeCount(item);
    if (n > 0) send({ kind: 'trade', npc: npc.id, item, mode: tradeMode === 'buy' ? 'buy' : 'sell', count: n });
  }));
}

// ---------------------------------------------------------------- loot / vault window
/** Beside the hero, in open view: to the right of them, else to the left, never over them or under a glass rail. */
let windowPlacedFor = '';
function placeWindow(el: HTMLElement, key: string) {
  if (!view || windowPlacedFor === key) return;
  const head = world.actors.overHead(view.self.id), vp = $('#viewport').getBoundingClientRect();
  if (!head) return;
  windowPlacedFor = key;
  let lo = 12, hi = vp.width - 12;
  for (const z of document.querySelectorAll<HTMLElement>('.c-zone')) {
    const r = z.getBoundingClientRect();
    if (r.width === 0 || r.bottom < vp.top || r.top > vp.bottom || r.right <= vp.left || r.left >= vp.right) continue;
    if (r.left - vp.left > vp.width / 2) hi = Math.min(hi, r.left - vp.left - 12); else lo = Math.max(lo, r.right - vp.left + 12);
  }
  const w = el.offsetWidth, h = el.offsetHeight, hx = head.x - vp.left, hy = head.y - vp.top, gap = 56;
  const left = hx + gap + w <= hi ? hx + gap : Math.max(lo, hx - gap - w);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(Math.max(12, Math.min(vp.height - h - 12, hy - h / 3)))}px`;
}
function renderContainer() {
  const el = $('#container');
  if (!view || !openContainer) { el.dataset.open = 'false'; windowPlacedFor = ''; patch(el, ''); return; }
  el.dataset.open = 'true';
  let title = '', parent = '', size = 0;
  if (openContainer.kind === 'vault') { title = 'Your vault'; parent = `vault:${view.self.id}`; size = 30; }
  else if (openContainer.kind === 'ground') { title = 'On the ground'; parent = groundKey(openContainer.at); size = Math.max(4, pileAt(openContainer.at).length + 1); }
  else { const c = view.corpses.find(c => c.id === (openContainer as { id: string }).id); if (!c) { openContainer = undefined; return renderContainer(); } title = c.name; parent = c.id; size = Math.max(4, (byParent().get(c.id) ?? []).reduce((m, i) => Math.max(m, i.slot + 1), 0)); }
  const kids = byParent().get(parent) ?? [];
  const nested = kids.filter(i => getDef(i.kind).slots);
  const empty = openContainer.kind !== 'vault' && !kids.length;
  if (!patch(el, `<header><b>${esc(title)}</b><div>${openContainer.kind !== 'vault' && kids.length ? '<button class="small" data-all>Take all</button>' : ''}<button class="close" aria-label="Close" data-close>×</button></div></header>
    ${empty ? '<p class="muted">Nothing left.</p>' : openContainer.kind === 'ground' ? pileList(parent) : `<div class="grid">${grid(parent, size)}</div>`}
    ${nested.map(n => `<h3>${esc(getDef(n.kind).name)}</h3><div class="grid">${grid(n.id, getDef(n.kind).slots!)}</div>`).join('')}
    ${openContainer.kind === 'vault' ? '<p class="hint">Double-click items in your pack to store them. Click here to take them back.</p>' : openContainer.kind === 'ground' ? '<p class="hint">Click to pick up, or drag to your pack or onto the world.</p>' : ''}`)) return placeWindow(el, JSON.stringify(openContainer));
  placeWindow(el, JSON.stringify(openContainer));
  el.querySelector('[data-close]')?.addEventListener('click', () => { openContainer = undefined; renderContainer(); });
  el.querySelector('[data-all]')?.addEventListener('click', () => {
    // Moves go out together before the next view arrives, so reserve the empty slots we hand out.
    const items = byParent().get(parent) ?? [], reserved = new Set<string>();
    for (const i of items) {
      if (getDef(i.kind).slots) { const pt = equipLike(i); if (pt) move(i, pt.parent, pt.slot); continue; }
      const t = packTarget(i, reserved);
      if (!t) { toast('Your pack is full.'); break; }
      reserved.add(`${t.parent}:${t.slot}`);
      move(i, t.parent, t.slot);
    }
  });
  wireItems(el);
}
/** A pile on the floor is a list, top item first: no slots, because the ground is not a container. */
function pileList(parent: string) {
  const items = [...(byParent().get(parent) ?? [])].sort((a, b) => b.slot - a.slot);
  return `<ul class="pile">${items.map(i => `<li><button class="item" draggable="true" data-id="${i.id}" aria-label="Pick up ${esc(getDef(i.kind).name)}${i.count > 1 ? ` × ${i.count}` : ''}"><span class="pile-ico">${icon(getDef(i.kind).icon)}</span><span class="pile-name">${esc(getDef(i.kind).name)}</span>${i.count > 1 ? `<span class="pile-n num">× ${i.count}</span>` : ''}</button></li>`).join('')}</ul>`;
}
function equipLike(i: GameItem) { if (!view) return; const eq = byParent().get(`equip:${view.self.id}`) ?? []; if (getDef(i.kind).slot === 'pack' && !eq.some(e => e.slot === 5)) return { parent: `equip:${view.self.id}`, slot: 5 }; return packTarget(); }

// ---------------------------------------------------------------- minimap: a cached 2px-per-tile base, drawn through a zoom window centred on you
const mmBase = document.createElement('canvas');
const mmBaseCtx = mmBase.getContext('2d')!;
let mmFloor = -1;
const groundColors: Record<string, string> = { void: '#0b0a09', grass: '#3d6236', meadow: '#34572f', dirt: '#6e5537', cobble: '#8a816f', plank: '#7a5a3a', stone: '#4a4744', water: '#1f4650', sand: '#b39a6b', moss: '#3d5236', flagstone: '#7d7768' };
function drawMinimapBase(z: number) {
  const f = map.floors[z], g = mmBaseCtx;
  mmBase.width = map.width * 2; mmBase.height = map.height * 2;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const i = y * map.width + x, t = f.thing[i];
    let c = groundColors[grounds[f.ground[i]]];
    if (t === T.wall || t === T.rampart) c = '#b9ac8f';
    else if (t === T.cavewall) c = '#0b0a09';
    else if (t === T.tree || t === T.pine) c = '#24402a';
    else if (t === T.door) c = '#d8a050';
    else if (t === T.hatch || t === T.ladder) c = '#f0c060';
    g.fillStyle = c; g.fillRect(x * 2, y * 2, 2, 2);
  }
  if (z === 0) for (const b of map.buildings) { g.fillStyle = b.roof === 'clay' ? '#8e4a34' : b.roof === 'thatch' ? '#9c8448' : b.roof === 'teal' ? '#2f6762' : '#3c5873'; g.fillRect(b.x0 * 2 + 1, b.y0 * 2 + 1, (b.x1 - b.x0 + 1) * 2 - 2, (b.y1 - b.y0 + 1) * 2 - 2); }
  mmFloor = z;
}
/** The visible part of the map in base pixels (2 per tile), centred on you and clamped to the edges. */
function mapWindow() {
  const z = chrome.mapZoom, w = map.width / z, h = map.height / z, s = view!.self;
  return { z, x0: Math.max(0, Math.min(map.width - w, s.x + 0.5 - w / 2)), y0: Math.max(0, Math.min(map.height - h, s.y + 0.5 - h / 2)), w, h };
}
function drawMinimap(canvas: HTMLCanvasElement | null) {
  if (!view || !canvas) return;
  if (mmFloor !== view.self.z) drawMinimapBase(view.self.z);
  const g = canvas.getContext('2d')!, { z, x0, y0 } = mapWindow(), self = view.self;
  g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = false;
  g.fillStyle = '#0b0a09'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.setTransform(z, 0, 0, z, -x0 * 2 * z, -y0 * 2 * z);
  g.drawImage(mmBase, 0, 0);
  const dot = (x: number, y: number, size: number) => { const d = Math.max(2 / z, size / z); g.fillRect(x * 2 + 1 - d / 2, y * 2 + 1 - d / 2, d, d); };
  g.fillStyle = '#f0d27a'; for (const n of map.npcs) if (n.z === self.z) dot(n.x, n.y, 2);
  g.fillStyle = '#e0604a'; for (const m of view.monsters) if (m.z === self.z) dot(m.x, m.y, 2);
  g.fillStyle = '#c8a0e0'; for (const p of view.players) if (p.z === self.z) dot(p.x, p.y, 3);
  g.fillStyle = '#ffffff'; dot(self.x, self.y, 4);
  g.strokeStyle = 'rgba(255,240,220,.5)'; g.lineWidth = 1 / z;
  if (world.stop.projection !== 'ortho') return;
  const vw = (world.camera.right - world.camera.left) * 2, vh = (world.camera.top - world.camera.bottom) * 2 / Math.sin(world.stop.pitch);
  g.strokeRect(self.x * 2 - vw / 2 + 0.5, self.y * 2 - vh / 2 + 0.5, vw, vh);
}
hud.addEventListener('click', e => {
  const c = (e.target as HTMLElement).closest<HTMLCanvasElement>('.c-map canvas');
  if (!c || !view) return;
  const r = c.getBoundingClientRect(), { x0, y0, w, h } = mapWindow();
  const x = Math.floor(x0 + ((e.clientX - r.left) / r.width) * w), y = Math.floor(y0 + ((e.clientY - r.top) / r.height) * h);
  pending = undefined;
  send({ kind: 'path', to: { x, y, z: view.self.z } });
});

// Developer hook for automated screenshots.
Object.assign(window, { __lanternfall: { world, net, enter, get view() { return view; }, mobDefs, stylePresets } });
