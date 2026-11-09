import '@fontsource-variable/inter';
import '@fontsource/silkscreen/400.css';
import './style.css';
import { buildTown, placeAt } from '../../../packages/game/src/town.ts';
import {
  type GameView, type GameItem, type ItemKind, type Notice, type Pos, type Effect, type SpellId, type NpcSpawn,
  equipSlots, distance, G, T, grounds,
} from '../../../packages/game/src/model.ts';
import { WorldView } from './render/view.ts';
import { loadTextureOverrides } from './render/texture-overrides.ts';
import { startPreview } from './preview.ts';
import styleJson from '../../../content/render-style.json' with { type: 'json' };
import { RenderStyle } from '../../../packages/game/src/content-schema.ts';
import { defaultStyle, stylePresets } from '../../../packages/game/src/style-presets.ts';
import { defaultBalance, defaultRules as rules } from '../../../packages/game/src/default-balance.ts';
import { Net } from './net.ts';
import { icon, iconCanvas } from './icons.ts';

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
<div class="stage" id="stage"></div>
<div class="labels" id="labels" aria-hidden="true"></div>
<div class="fx" id="fx" aria-hidden="true"></div>
<div class="hud" id="hud" data-ready="false">
  <section class="vitals" aria-label="Character">
    <div class="who"><span class="name" id="v-name"></span><span class="lvl">Lv <b id="v-level">1</b></span></div>
    <div class="bar hp" role="meter" aria-label="Health" id="v-hp"><i></i><span></span></div>
    <div class="bar mp" role="meter" aria-label="Mana" id="v-mp"><i></i><span></span></div>
    <div class="xp" title="Experience to next level" id="v-xp"><i></i></div>
    <div class="flags" id="v-flags"></div>
    <div class="stance" id="stance" role="group" aria-label="Fighting mode"></div>
  </section>
  <div class="place" id="place" aria-live="polite"><span id="place-name"></span><small id="place-sub"></small></div>
  <section class="minimap" aria-label="Map">
    <canvas id="minimap" width="168" height="136" aria-label="Map. Click to walk there."></canvas>
    <div class="coords"><span id="mm-place"></span><span id="mm-xy" class="num"></span></div>
  </section>
  <section class="log" id="log"><ol id="log-lines" aria-live="polite"></ol>
    <form id="chat" autocomplete="off"><input id="chat-input" maxlength="180" placeholder="Press Enter to speak" aria-label="Say something" spellcheck="false"></form>
  </section>
  <div class="toast" id="toast" role="status"></div>
  <nav class="hotbar" id="hotbar" aria-label="Actions"></nav>
  <section class="dialogue" id="dialogue" aria-label="Conversation" data-open="false"></section>
  <section class="window" id="container" data-open="false" aria-label="Container"></section>
  <aside class="drawer" id="drawer" data-open="false" aria-label="Inventory and character"></aside>
  <div class="tooltip" id="tooltip" role="tooltip"></div>
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
    <div><dt>Click ground</dt><dd>Walk there</dd></div>
    <div><dt>Click a creature</dt><dd>Attack it. <kbd>Space</kbd> picks the nearest</dd></div>
    <div><dt>Click a person</dt><dd>Talk. Ask about the words they highlight</dd></div>
    <div><dt>Click a body</dt><dd>Loot it</dd></div>
    <div><dt><kbd>WASD</kbd> or arrows</dt><dd>Step</dd></div>
    <div><dt><kbd>1</kbd>–<kbd>7</kbd></dt><dd>Spells, tonics, food</dd></div>
    <div><dt><kbd>I</kbd> · <kbd>C</kbd></dt><dd>Pack · character</dd></div>
    <div><dt>Scroll</dt><dd>Zoom</dd></div>
  </dl>
  <div class="menu-actions"><button class="primary" id="resume">Resume</button><button id="leave">Save and leave</button></div>
</dialog>`;

const stage = $('#stage'), hud = $('#hud'), fx = $('#fx');
try { await loadTextureOverrides(); } catch (e) { console.error(e); alert((e as Error).message); }
const world = new WorldView(stage, $('#labels'), map);
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
let drawerTab: 'pack' | 'character' = 'pack';
let tradeMode: 'off' | 'buy' | 'sell' = 'off';

const net = new Net({
  view: v => onView(v),
  notice: n => addLog(n),
  error: text => toast(text),
  closed: reason => { hud.dataset.ready = 'false'; showGate(reason); },
});

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
if (previewScene !== null) {
  // Studio Look tab: no server, no HUD; a local engine plays a scene and the Studio streams style changes in.
  $('#gate').hidden = true;
  startPreview(world, map, previewScene);
  addEventListener('message', e => {
    if (!/^http:\/\/(127\.0\.0\.1|localhost):4174$/.test(e.origin)) return;
    const msg = e.data as { type?: string; style?: unknown; scene?: string };
    if (msg.type === 'lanternfall:style') { const r = RenderStyle.safeParse(msg.style); if (r.success) world.applyStyle(r.data); }
    if (msg.type === 'lanternfall:scene' && msg.scene) startPreview(world, map, msg.scene);
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
  if (first) drawMinimapBase(v.self.z);
  if (pending) resolvePending();
  if (openContainer?.kind === 'corpse') { const c = v.corpses.find(c => c.id === (openContainer as { id: string }).id); if (!c || distance(v.self, c) > 1 || c.stage >= 2) openContainer = undefined; }
  if (openContainer?.kind === 'ground' && (distance(v.self, openContainer.at) > 1 || !pileAt(openContainer.at).length)) openContainer = undefined;
  if (openContainer?.kind === 'vault' && distance(v.self, map.vault) > 2) openContainer = undefined;
  if (!v.self.talking) tradeMode = 'off';
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
  const s = view.self, st = stats();
  $('#v-name').textContent = s.name;
  $('#v-level').textContent = String(st.level);
  bar('#v-hp', s.hp, st.maxHp); bar('#v-mp', s.mana, st.maxMana);
  const lo = xpAt(st.level), hi = xpAt(st.level + 1);
  $('#v-xp i').style.transform = `scaleX(${(s.xp - lo) / (hi - lo)})`;
  $('#v-xp').title = `${hi - s.xp} experience to level ${st.level + 1}`;
  const flags: string[] = [];
  if (s.combatUntil > view.time) flags.push('<span class="flag combat">In combat</span>');
  if (s.fed <= 0) flags.push('<span class="flag hungry">Hungry · no regeneration</span>');
  $('#v-flags').innerHTML = flags.join('');
  renderStance();
  const here = placeAt(map, s);
  if (here !== place) { const firstPlace = !place; place = here; announce(here, s.z === 1 ? 'Undercroft' : 'Lanternfall', firstPlace); }
  $('#mm-place').textContent = here;
  $('#mm-xy').textContent = `${s.x}, ${s.y}${s.z ? ' · below' : ''}`;
  drawMinimap();
  renderHotbar();
  renderDrawer();
  renderDialogue();
  renderContainer();
}
function renderStance() {
  if (!view) return;
  const s = view.self, el = $('#stance');
  const modes: [string, string, string][] = [['offensive', 'Attack', 'More damage, weaker blocks'], ['balanced', 'Balanced', 'Even damage and blocks'], ['defensive', 'Defend', 'Less damage, much stronger blocks']];
  if (!patch(el, `${modes.map(([m, label, tip]) => `<button aria-pressed="${s.fightMode === m}" data-fight="${m}" title="${tip}">${label}</button>`).join('')}<span class="sep" aria-hidden="true"></span><button aria-pressed="${s.chase}" data-chase title="${s.chase ? 'Chase: you follow your target. Click to stand your ground.' : 'Stand: you hold your position. Click to chase.'}">${s.chase ? 'Chase' : 'Stand'}</button>`)) return;
  el.querySelectorAll<HTMLButtonElement>('[data-fight]').forEach(b => b.addEventListener('click', () => net.send({ kind: 'mode', fight: b.dataset.fight as 'offensive' | 'balanced' | 'defensive' })));
  el.querySelector<HTMLButtonElement>('[data-chase]')?.addEventListener('click', () => net.send({ kind: 'mode', chase: !view!.self.chase }));
}
function bar(sel: string, v: number, max: number) {
  const el = $(sel);
  $('i', el).style.transform = `scaleX(${Math.max(0, Math.min(1, v / max))})`;
  $('span', el).textContent = `${Math.max(0, v)} / ${max}`;
  el.setAttribute('aria-valuenow', String(v)); el.setAttribute('aria-valuemax', String(max));
  el.classList.toggle('low', v / max < 0.3);
}
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
function addLog(n: Notice) {
  log.push(n); if (log.length > 80) log.shift();
  const li = document.createElement('li');
  li.className = n.kind;
  const who = n.npc ? map.npcs.find(x => x.id === n.npc)?.name : undefined;
  li.innerHTML = who && n.kind === 'npc' && !n.text.startsWith(who) ? `<b>${esc(who)}</b> ${esc(n.text)}` : esc(n.text);
  const ol = $('#log-lines'); ol.append(li);
  while (ol.children.length > 40) ol.firstElementChild?.remove();
  setTimeout(() => li.classList.add('old'), 14000);
  if (n.kind === 'level') floatText(innerWidth / 2, innerHeight * 0.38, n.text, 'level');
  renderDialogue();
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
world.onPick = (tile, info) => {
  if (!view) return;
  closeTooltip();
  const self = view.self;
  if (info.shift) { net.send({ kind: 'look', at: tile, actor: info.actor }); return; }
  if (info.drag) { pending = undefined; if (tile.x !== self.x || tile.y !== self.y) net.send({ kind: 'path', to: tile }); return; }
  if (info.actor) {
    const m = view.monsters.find(m => m.id === info.actor);
    if (m) { if (self.target !== m.id) net.send({ kind: 'target', id: m.id }); pending = undefined; return; }
    const npc = npcAt(info.actor);
    if (npc) { approach(npc, 3); pending = { kind: 'talk', npc: npc.id }; resolvePending(); return; }
  }
  if (!info.corpse && pileAt(tile).length) { pending = { kind: 'ground', at: tile }; if (distance(self, tile) > 1) approach(tile, 1); resolvePending(); return; }
  if (info.corpse) { pending = { kind: 'corpse', id: info.corpse }; const c = view.corpses.find(c => c.id === info.corpse)!; if (distance(self, c) > 1) approach(c, 1); resolvePending(); return; }
  const t = map.floors[tile.z].thing[tile.y * map.width + tile.x];
  if (t === T.vault) { pending = { kind: 'vault' }; net.send({ kind: 'useTile', to: tile }); resolvePending(); return; }
  if (t === T.hatch || t === T.ladder || t === T.well || t === T.altar || (t === T.door && info.button === 2)) { pending = undefined; net.send({ kind: 'useTile', to: tile }); return; }
  pending = undefined;
  if (tile.x === self.x && tile.y === self.y) return;
  net.send({ kind: 'path', to: tile });
};
// ---------------------------------------------------------------- items in the world: drop, throw, pick up
world.itemIcon = kind => iconCanvas(getDef(kind as ItemKind).icon);
const canvasEl = world.renderer.domElement;
const dropOnTile = (i: GameItem, clientX: number, clientY: number) => {
  const tile = world.tileAtPoint(clientX, clientY);
  if (!tile || !view) return;
  if (distance(view.self, tile) > 7) return toast('That is too far away to throw.');
  net.send({ kind: 'moveItem', id: i.id, parent: groundKey(tile), slot: 0, count: i.count, version: i.version });
};
// Pack or loot window → world: native drag and drop onto the canvas.
canvasEl.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('text/item')) e.preventDefault(); });
canvasEl.addEventListener('drop', e => {
  e.preventDefault();
  const i = view?.items.find(x => x.id === e.dataTransfer?.getData('text/item'));
  if (i) dropOnTile(i, e.clientX, e.clientY);
});
// World → world or world → pack: press on a pile within reach and drag the top item; a plain click opens the pile.
world.beforePick = (tile, e) => {
  if (!view || distance(view.self, tile) > 1) return false;
  const top = pileAt(tile).at(-1);
  if (!top) return false;
  const start = { x: e.clientX, y: e.clientY };
  let ghost: HTMLElement | null = null;
  const moveGhost = (ev: PointerEvent) => {
    if (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 6) return;
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.innerHTML = icon(getDef(top.kind).icon); document.body.append(ghost); closeTooltip(); }
    ghost.style.transform = `translate(${ev.clientX - 16}px, ${ev.clientY - 16}px)`;
  };
  const end = (ev: PointerEvent) => {
    removeEventListener('pointermove', moveGhost); removeEventListener('pointerup', end);
    if (!ghost) { openContainer = { kind: 'ground', at: tile }; pending = undefined; renderContainer(); return; }
    ghost.remove();
    const item = view?.items.find(x => x.id === top.id) ?? top;
    const cell = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.cell');
    if (cell) return move(item, cell.dataset.parent!, Number(cell.dataset.slot));
    if (document.elementFromPoint(ev.clientX, ev.clientY) === canvasEl) dropOnTile(item, ev.clientX, ev.clientY);
  };
  addEventListener('pointermove', moveGhost); addEventListener('pointerup', end);
  return true;
};

function approach(p: Pos, within: number) {
  if (!view || distance(view.self, p) <= within) return;
  const options: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) options.push({ x: p.x + dx, y: p.y + dy, z: p.z });
  const free = options.filter(q => { const i = q.y * map.width + q.x; const g = map.floors[q.z].ground[i], t = map.floors[q.z].thing[i]; return g !== G.water && g !== G.void && [T.none, T.flowers, T.door, T.hatch].includes(t) && !map.npcs.some(n => n.x === q.x && n.y === q.y); })
    .sort((a, b) => distance(view!.self, a) - distance(view!.self, b));
  if (free[0]) net.send({ kind: 'path', to: free[0] });
}
function resolvePending() {
  if (!view || !pending) return;
  const self = view.self;
  if (pending.kind === 'talk') { const n = npcAt(pending.npc)!; if (distance(self, n) <= 3) { net.send({ kind: 'talk', npc: n.id }); pending = undefined; } }
  else if (pending.kind === 'corpse') { const c = view.corpses.find(c => c.id === (pending as { id: string }).id); if (!c) pending = undefined; else if (distance(self, c) <= 1) { openContainer = { kind: 'corpse', id: c.id }; pending = undefined; renderContainer(); } }
  else if (pending.kind === 'vault') { if (distance(self, map.vault) <= 2) { openContainer = { kind: 'vault' }; pending = undefined; renderContainer(); } }
  else if (pending.kind === 'ground') { const at = pending.at; if (!pileAt(at).length) pending = undefined; else if (distance(self, at) <= 1) { openContainer = { kind: 'ground', at }; pending = undefined; renderContainer(); } }
}

// ---------------------------------------------------------------- input: keyboard
const held = new Set<string>();
const dirs: Record<string, [number, number]> = { arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0] };
let lastStep = 0;
setInterval(() => {
  if (!view || !held.size || document.activeElement === $('#chat-input')) return;
  let dx = 0, dy = 0;
  for (const k of held) { const d = dirs[k]; if (d) { dx += d[0]; dy += d[1]; } }
  dx = Math.sign(dx); dy = Math.sign(dy);
  // Send the next step as the current one is finishing, so held keys follow the real step time.
  if ((dx || dy) && serverNow() >= view.self.moveAt - 90 && performance.now() - lastStep > 120) { lastStep = performance.now(); pending = undefined; net.send({ kind: 'walk', dx, dy }); }
}, 30);
addEventListener('keydown', e => {
  if (!$('#gate').hidden || $<HTMLDialogElement>('#menu').open) return;
  const input = $<HTMLInputElement>('#chat-input');
  if (document.activeElement === input) { if (e.key === 'Escape') { input.value = ''; input.blur(); world.renderer.domElement.focus(); } return; }
  if ((e.target as HTMLElement).closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (dirs[k]) { e.preventDefault(); if (!held.has(k)) { held.add(k); lastStep = 0; } return; }
  if (e.key === 'Enter') { e.preventDefault(); input.focus(); return; }
  if (/^[1-7]$/.test(e.key)) { hotbarSlots()[Number(e.key) - 1]?.run(); return; }
  if (k === ' ' || k === 'tab') { e.preventDefault(); cycleTarget(); return; }
  if (k === 'i') { toggleDrawer('pack'); return; }
  if (k === 'c') { toggleDrawer('character'); return; }
  if (e.key === 'Escape') {
    if (openContainer) openContainer = undefined;
    else if (view?.self.talking) net.send({ kind: 'talk', npc: null });
    else if ($('#drawer').dataset.open === 'true') $('#drawer').dataset.open = 'false';
    else if (view?.self.target) net.send({ kind: 'target', id: null });
    else $<HTMLDialogElement>('#menu').showModal();
    renderHud();
  }
});
addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
addEventListener('blur', () => held.clear());
function cycleTarget() {
  if (!view) return;
  const list = view.monsters.filter(m => m.z === view!.self.z).sort((a, b) => distance(view!.self, a) - distance(view!.self, b)).filter(m => distance(view!.self, m) <= 7);
  if (!list.length) { toast('Nothing to fight nearby.'); return; }
  const i = list.findIndex(m => m.id === view!.self.target);
  net.send({ kind: 'target', id: list[(i + 1) % list.length].id });
}
$('#chat').addEventListener('submit', e => {
  e.preventDefault();
  const input = $<HTMLInputElement>('#chat-input'); const text = input.value.trim();
  if (text) net.send({ kind: 'say', text });
  input.value = ''; input.blur(); world.renderer.domElement.focus();
});
$('#chat-input').addEventListener('focus', () => $('#log').classList.add('active'));
$('#chat-input').addEventListener('blur', () => $('#log').classList.remove('active'));
$('#resume').addEventListener('click', () => $<HTMLDialogElement>('#menu').close());
$('#leave').addEventListener('click', () => {
  if (view && view.self.combatUntil > view.time && !inPz(view.self)) { $<HTMLDialogElement>('#menu').close(); toast('You may not log out during or right after a fight.'); return; } $<HTMLDialogElement>('#menu').close();
  net.leave().then(r => { if (!r.ok) { toast(r.text || 'You cannot log out right now.'); return; } hud.dataset.ready = 'false'; view = undefined; location.reload(); });
});

// ---------------------------------------------------------------- hotbar
type Slot = { key: string; label: string; sub: string; icon: string; disabled: boolean; cooldown: number; count?: number; run: () => void };
function hotbarSlots(): Slot[] {
  if (!view) return [];
  const st = stats(), now = serverNow(), self = view.self;
  const cd = Math.max(0, self.spellAt - now);
  const spell = (id: SpellId): Slot => { const sp = spells[id]; const locked = st.level < sp.level; return { key: id, label: sp.name, sub: locked ? `Level ${sp.level}` : `${sp.mana} mana`, icon: id, disabled: locked || self.mana < sp.mana, cooldown: cd / sp.cooldown, run: () => net.send({ kind: 'cast', spell: id }) }; };
  const item = (kind: ItemKind, label: string): Slot => { const n = count(kind); return { key: kind, label, sub: getDef(kind).name, icon: getDef(kind).icon, disabled: !n, cooldown: kind === 'tonic' || kind === 'tincture' ? cd / 1000 : 0, count: n, run: () => net.send({ kind: 'useKind', item: kind }) }; };
  const food = count('cheese') ? 'cheese' : 'loaf';
  return [spell('mend'), spell('ember'), spell('renew'), item('tonic', 'Tonic'), item('tincture', 'Tincture'), { ...item(food, 'Eat'), disabled: !count('cheese') && !count('loaf') }, spell('cinderburst')];
}
function renderHotbar() {
  const bar = $('#hotbar');
  const slots = hotbarSlots();
  if (bar.children.length !== slots.length + 4) {
    bar.innerHTML = slots.map((_, i) => `<button class="slot" data-i="${i}"><span class="ico"></span><span class="cd"></span><kbd>${i + 1}</kbd><span class="n num"></span></button>`).join('')
      + `<span class="sep" aria-hidden="true"></span><button class="slot tool" data-tool="pack" aria-label="Pack (I)"><span class="ico">${icon('bag')}</span><kbd>I</kbd></button><button class="slot tool" data-tool="character" aria-label="Character (C)"><span class="ico">${icon('person')}</span><kbd>C</kbd></button><button class="slot tool" data-tool="menu" aria-label="Menu (Esc)"><span class="ico">${icon('menu')}</span><kbd>Esc</kbd></button>`;
    bar.querySelectorAll<HTMLButtonElement>('.slot[data-i]').forEach(b => {
      b.addEventListener('click', () => hotbarSlots()[Number(b.dataset.i)]?.run());
      b.addEventListener('pointerenter', () => { const s = hotbarSlots()[Number(b.dataset.i)]; if (s) showTooltip(b, `<b>${esc(s.label)}</b><span>${esc(s.sub)}</span>`); });
      b.addEventListener('pointerleave', closeTooltip);
    });
    bar.querySelectorAll<HTMLButtonElement>('.tool').forEach(b => b.addEventListener('click', () => b.dataset.tool === 'menu' ? $<HTMLDialogElement>('#menu').showModal() : toggleDrawer(b.dataset.tool as 'pack' | 'character')));
  }
  slots.forEach((s, i) => {
    const b = $<HTMLButtonElement>(`.slot[data-i="${i}"]`, bar);
    if (b.dataset.icon !== s.icon) { $('.ico', b).innerHTML = icon(s.icon); b.dataset.icon = s.icon; }
    b.setAttribute('aria-label', `${s.label}, ${s.sub}`);
    b.classList.toggle('off', s.disabled);
    $('.n', b).textContent = s.count !== undefined ? String(s.count) : '';
    $('.cd', b).style.transform = `scaleY(${Math.min(1, s.cooldown)})`;
  });
  bar.querySelector('[data-tool="pack"]')?.classList.toggle('on', $('#drawer').dataset.open === 'true' && drawerTab === 'pack');
  bar.querySelector('[data-tool="character"]')?.classList.toggle('on', $('#drawer').dataset.open === 'true' && drawerTab === 'character');
}
setInterval(() => { if (view) renderHotbar(); }, 100);

// ---------------------------------------------------------------- drawer
function toggleDrawer(tab: 'pack' | 'character') {
  const d = $('#drawer');
  if (d.dataset.open === 'true' && drawerTab === tab) d.dataset.open = 'false';
  else { drawerTab = tab; d.dataset.open = 'true'; }
  renderDrawer(); renderHotbar();
}
const slotNames: Record<string, string> = { weapon: 'Weapon', shield: 'Shield', head: 'Head', body: 'Body', feet: 'Feet', pack: 'Pack' };
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
function renderDrawer() {
  const d = $('#drawer');
  if (!view || d.dataset.open !== 'true') { patch(d, ''); return; }
  const self = view.self, st = stats(), eq = `equip:${self.id}`, kids = byParent();
  const equipped = kids.get(eq) ?? [];
  const pack = equipped.find(i => i.slot === 5);
  const weight = carried().reduce((n, i) => n + getDef(i.kind).weight * i.count, 0);
  const tabs = `<div class="tabs" role="tablist"><button role="tab" aria-selected="${drawerTab === 'pack'}" data-tab="pack">Pack</button><button role="tab" aria-selected="${drawerTab === 'character'}" data-tab="character">Character</button><button class="close" aria-label="Close" data-close>×</button></div>`;
  let body = '';
  if (drawerTab === 'pack') {
    const doll = equipSlots.map((name, i) => `<div class="doll-${name}">${itemButton(equipped.find(e => e.slot === i), eq, i, slotNames[name])}</div>`).join('');
    const pouch = openPouch && view.items.find(i => i.id === openPouch);
    body = `<div class="doll">${doll}</div>
      <div class="meta"><span>${weight.toFixed(1)} / ${st.cap} oz</span><span class="gold">${icon('gold')}<b class="num">${count('gold')}</b></span></div>
      ${pack ? `<h3>${esc(getDef(pack.kind).name)}</h3><div class="grid">${grid(pack.id, getDef(pack.kind).slots!)}</div>` : '<p class="muted">You carry no pack. Your remains still hold it.</p>'}
      ${pouch ? `<h3>${esc(getDef(pouch.kind).name)}</h3><div class="grid">${grid(pouch.id, getDef(pouch.kind).slots!)}</div>` : ''}
      <p class="hint">Click to use or equip. Drag to move.</p>`;
  } else {
    const lo = xpAt(st.level), hi = xpAt(st.level + 1);
    const skill = (name: string, s: { level: number; progress: number }) => `<div class="skill"><span>${name}</span><b class="num">${s.level}</b><div class="prog"><i style="transform:scaleX(${s.progress})"></i></div></div>`;
    const quest = self.quests.shells === 1 ? `<li><b>Glaze for the shrine</b><span>Bring Sister Wren 5 beetle shells. You carry ${count('shell')}.</span></li>` : self.quests.shells === 2 ? '<li class="done"><b>Glaze for the shrine</b><span>Done.</span></li>' : '<li class="muted"><span>Ask Sister Wren for a task.</span></li>';
    body = `<div class="char-head"><div><p class="kicker">Wayfarer</p><h2>${esc(self.name)}</h2></div><div class="big num">${st.level}</div></div>
      <div class="skill"><span>Experience</span><b class="num">${self.xp}</b><div class="prog xp"><i style="transform:scaleX(${(self.xp - lo) / (hi - lo)})"></i></div></div>
      <div class="stats"><div><span>Health</span><b class="num">${self.hp}/${st.maxHp}</b></div><div><span>Mana</span><b class="num">${self.mana}/${st.maxMana}</b></div><div><span>Capacity</span><b class="num">${st.cap}</b></div><div><span>Deaths</span><b class="num">${self.deaths}</b></div></div>
      <h3>Skills</h3>${skill('Melee', st.melee)}${skill('Shielding', st.shielding)}${skill('Magic', st.magic)}
      <h3>Spells</h3><ul class="spells">${Object.values(spells).map(sp => `<li class="${st.level < sp.level ? 'locked' : ''}">${icon(Object.keys(spells).find(k => spells[k as SpellId] === sp)!)}<b>${sp.name}</b><span>say “${sp.words}” · ${sp.mana} mana${st.level < sp.level ? ` · level ${sp.level}` : ''}</span></li>`).join('')}</ul>
      <h3>Tasks</h3><ul class="quests">${quest}</ul>`;
  }
  if (!patch(d, tabs + `<div class="drawer-body">${body}</div>`)) return;
  d.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b => b.addEventListener('click', () => { drawerTab = b.dataset.tab as 'pack' | 'character'; renderDrawer(); renderHotbar(); }));
  d.querySelector('[data-close]')?.addEventListener('click', () => { d.dataset.open = 'false'; renderDrawer(); renderHotbar(); });
  wireItems(d);
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
function move(i: GameItem, parent: string, slot: number) { net.send({ kind: 'moveItem', id: i.id, parent, slot, count: i.count, version: i.version }); }
function primary(i: GameItem) {
  if (!view) return;
  const def = getDef(i.kind), eq = `equip:${view.self.id}`;
  const inCorpseOrVault = !carried().some(c => c.id === i.id);
  if (inCorpseOrVault) { const t = packTarget(i); if (!t) return toast('Your pack is full.'); return move(i, t.parent, t.slot); }
  if (openContainer?.kind === 'vault' && !i.parent.startsWith('equip:')) { const t = targetIn([{ id: `vault:${view.self.id}`, size: 30 }], i); if (!t) return toast('Your vault is full.'); return move(i, t.parent, t.slot); }
  if (def.food || def.heal || def.mana) return net.send({ kind: 'useItem', id: i.id });
  if (def.slots && !def.slot) { openPouch = openPouch === i.id ? undefined : i.id; return renderDrawer(); }
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
  return `<b>${esc(d.name)}${i.count > 1 ? ` × ${i.count}` : ''}</b><span>${bits.join(' · ')}</span>`;
}
function wireItems(root: HTMLElement) {
  root.querySelectorAll<HTMLButtonElement>('.item').forEach(b => {
    const it = () => view?.items.find(i => i.id === b.dataset.id);
    b.addEventListener('click', () => { const i = it(); if (i) primary(i); });
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
function showTooltip(anchor: HTMLElement, html: string) {
  const t = $('#tooltip'); t.innerHTML = html;
  const r = anchor.getBoundingClientRect();
  t.dataset.show = 'true';
  t.dataset.instant = performance.now() - tipShown < 400 ? 'true' : 'false';
  const tw = t.offsetWidth;
  t.style.left = `${Math.min(innerWidth - tw - 8, Math.max(8, r.left + r.width / 2 - tw / 2))}px`;
  t.style.top = `${r.top - t.offsetHeight - 8}px`;
  tipShown = performance.now();
}
function closeTooltip() { const t = $('#tooltip'); if (t.dataset.show) tipShown = performance.now(); delete t.dataset.show; }
world.onHover = (text, x, y) => {
  const t = $('#tooltip');
  if (!text) { if (t.dataset.world) { delete t.dataset.show; delete t.dataset.world; } return; }
  t.innerHTML = `<b>${esc(text)}</b>`; t.dataset.show = 'true'; t.dataset.world = 'true'; t.dataset.instant = 'true';
  t.style.left = `${x + 14}px`; t.style.top = `${y + 14}px`;
};

// ---------------------------------------------------------------- dialogue
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
    trade = `<div class="trade"><div class="seg" role="tablist">${def.sells.length ? `<button role="tab" aria-selected="${tradeMode === 'buy'}" data-mode="buy">Buy</button>` : ''}${def.buys.length ? `<button role="tab" aria-selected="${tradeMode === 'sell'}" data-mode="sell">Sell</button>` : ''}<span class="gold">${icon('gold')}<b class="num">${count('gold')}</b></span></div><ul>${list.map(k => {
      const d = getDef(k), have = carried().filter(i => i.kind === k && !i.parent.startsWith('equip:')).reduce((n, i) => n + i.count, 0);
      const price = tradeMode === 'buy' ? d.buy : d.sell;
      const disabled = tradeMode === 'buy' ? count('gold') < price : have < 1;
      return `<li><span class="ico">${icon(d.icon)}</span><span class="nm">${esc(d.name)}<small>${d.attack ? `Attack ${d.attack}` : d.defense ? `Defense ${d.defense}` : d.armor ? `Armor ${d.armor}` : d.heal ? `+${d.heal} health` : d.mana ? `+${d.mana} mana` : d.slots ? `${d.slots} slots` : tradeMode === 'sell' ? `You have ${have}` : ''}</small></span><span class="price num">${price}</span><button class="small" data-trade="${k}" ${disabled ? 'disabled' : ''}>${tradeMode === 'buy' ? 'Buy' : have > 1 ? `Sell ${Math.min(have, 50)}` : 'Sell'}</button></li>`;
    }).join('')}</ul></div>`;
  }
  if (!patch(el, `<header><div><b>${esc(npc.name)}</b><small>${role[npc.role]}</small></div><button class="close" aria-label="End conversation" data-bye>×</button></header>
    <div class="lines">${lines.map(l => `<p>${esc(l.text.replace(`${npc.name}: `, ''))}</p>`).join('')}</div>
    <div class="chips">${topics.map(t => `<button class="chip ${t === 'trade' && tradeMode !== 'off' ? 'on' : ''}" data-topic="${t}">${t}</button>`).join('')}<button class="chip quiet" data-topic="bye">bye</button></div>${trade}`)) return;
  el.querySelectorAll<HTMLButtonElement>('[data-topic]').forEach(b => b.addEventListener('click', () => {
    const t = b.dataset.topic!;
    if (t === 'trade') { tradeMode = tradeMode === 'off' ? (def.sells.length ? 'buy' : 'sell') : 'off'; }
    net.send({ kind: 'say', text: t });
    renderDialogue();
  }));
  el.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(b => b.addEventListener('click', () => { tradeMode = b.dataset.mode as 'buy' | 'sell'; renderDialogue(); }));
  el.querySelector('[data-bye]')?.addEventListener('click', () => net.send({ kind: 'talk', npc: null }));
  el.querySelectorAll<HTMLButtonElement>('[data-trade]').forEach(b => b.addEventListener('click', () => {
    const item = b.dataset.trade as ItemKind;
    const have = carried().filter(i => i.kind === item && !i.parent.startsWith('equip:')).reduce((n, i) => n + i.count, 0);
    net.send({ kind: 'trade', npc: npc.id, item, mode: tradeMode === 'buy' ? 'buy' : 'sell', count: tradeMode === 'sell' ? Math.max(1, Math.min(50, have)) : 1 });
  }));
}

// ---------------------------------------------------------------- loot / vault window
function renderContainer() {
  const el = $('#container');
  if (!view || !openContainer) { el.dataset.open = 'false'; patch(el, ''); return; }
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
    ${openContainer.kind === 'vault' ? '<p class="hint">Click items in your pack to store them. Click here to take them back.</p>' : openContainer.kind === 'ground' ? '<p class="hint">Click to pick up, or drag to your pack or onto the world.</p>' : ''}`)) return;
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

// ---------------------------------------------------------------- minimap
const mm = $<HTMLCanvasElement>('#minimap');
const mmCtx = mm.getContext('2d')!;
let mmBase: ImageData | undefined, mmFloor = -1;
const groundColors: Record<string, string> = { void: '#0b0a09', grass: '#3d6236', meadow: '#34572f', dirt: '#6e5537', cobble: '#8a816f', plank: '#7a5a3a', stone: '#4a4744', water: '#1f4650', sand: '#b39a6b', moss: '#3d5236', flagstone: '#7d7768' };
function drawMinimapBase(z: number) {
  const f = map.floors[z];
  mm.width = map.width * 2; mm.height = map.height * 2;
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const i = y * map.width + x, t = f.thing[i];
    let c = groundColors[grounds[f.ground[i]]];
    if (t === T.wall || t === T.rampart) c = '#b9ac8f';
    else if (t === T.cavewall) c = '#0b0a09';
    else if (t === T.tree || t === T.pine) c = '#24402a';
    else if (t === T.door) c = '#d8a050';
    else if (t === T.hatch || t === T.ladder) c = '#f0c060';
    mmCtx.fillStyle = c; mmCtx.fillRect(x * 2, y * 2, 2, 2);
  }
  if (z === 0) for (const b of map.buildings) { mmCtx.fillStyle = b.roof === 'clay' ? '#8e4a34' : b.roof === 'thatch' ? '#9c8448' : b.roof === 'teal' ? '#2f6762' : '#3c5873'; mmCtx.fillRect(b.x0 * 2 + 1, b.y0 * 2 + 1, (b.x1 - b.x0 + 1) * 2 - 2, (b.y1 - b.y0 + 1) * 2 - 2); }
  mmBase = mmCtx.getImageData(0, 0, mm.width, mm.height); mmFloor = z;
}
function drawMinimap() {
  if (!view) return;
  if (mmFloor !== view.self.z) drawMinimapBase(view.self.z);
  mmCtx.putImageData(mmBase!, 0, 0);
  for (const n of map.npcs) if (n.z === view.self.z) { mmCtx.fillStyle = '#f0d27a'; mmCtx.fillRect(n.x * 2, n.y * 2, 2, 2); }
  for (const m of view.monsters) if (m.z === view.self.z) { mmCtx.fillStyle = '#e0604a'; mmCtx.fillRect(m.x * 2, m.y * 2, 2, 2); }
  for (const p of view.players) if (p.z === view.self.z) { mmCtx.fillStyle = '#c8a0e0'; mmCtx.fillRect(p.x * 2 - 1, p.y * 2 - 1, 3, 3); }
  mmCtx.fillStyle = '#ffffff'; mmCtx.fillRect(view.self.x * 2 - 1, view.self.y * 2 - 1, 4, 4);
  mmCtx.strokeStyle = 'rgba(255,240,220,.5)'; mmCtx.lineWidth = 1;
  const vw = (world.camera.right - world.camera.left) * 2, vh = (world.camera.top - world.camera.bottom) * 2.3;
  mmCtx.strokeRect(view.self.x * 2 - vw / 2 + 0.5, view.self.y * 2 - vh / 2 + 0.5, vw, vh);
}
mm.addEventListener('click', e => {
  if (!view) return;
  const r = mm.getBoundingClientRect();
  const x = Math.floor(((e.clientX - r.left) / r.width) * map.width), y = Math.floor(((e.clientY - r.top) / r.height) * map.height);
  pending = undefined;
  net.send({ kind: 'path', to: { x, y, z: view.self.z } });
});

// Developer hook for automated screenshots.
Object.assign(window, { __lanternfall: { world, net, enter, get view() { return view; }, mobDefs, stylePresets } });
