// PROTOTYPE — game chrome directions. Throwaway: nothing in production imports this file.
import '@fontsource-variable/inter';
import '@fontsource/silkscreen/400.css';
import '../../src/style.css';
import './chrome.css';
import { Engine } from '../../../../packages/game/src/engine.ts';
import { defaultBalance } from '../../../../packages/game/src/default-balance.ts';
import { buildTown, placeAt } from '../../../../packages/game/src/town.ts';
import { distance, equipSlots, grounds, T, type Hero, type Notice } from '../../../../packages/game/src/model.ts';
import { WorldView } from '../../src/render/view.ts';
import { icon, iconCanvas } from '../../src/icons.ts';
import styleJson from '../../../../content/render-style.json' with { type: 'json' };
import { RenderStyle } from '../../../../packages/game/src/content-schema.ts';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

// ---------------------------------------------------------------- live world (local engine, real rules)
const map = buildTown();
const e = new Engine(map, defaultBalance);
const hero = e.createPlayer('Wayfarer of the Long Road');
const ally = e.createPlayer('Mira');
Object.assign(hero, e.geo.near({ x: 40, y: 59, z: 0 }, q => e.occupied(q, hero.id)));
Object.assign(ally, e.geo.near({ x: 38, y: 60, z: 0 }, q => e.occupied(q, ally.id)));
hero.xp = e.rules.xpAt(14) + 900; hero.melee = e.rules.meleeAt(31) + 40; hero.shielding = e.rules.shieldingAt(24) + 30; hero.magic = e.rules.magicAt(3) + 500;
hero.hp = e.stats(hero).maxHp - 40; hero.mana = e.stats(hero).maxMana - 25;
ally.xp = e.rules.xpAt(9);
e.add('buckler', `equip:${hero.id}`, 1);
const pack = e.equipped(hero, 'pack')!;
for (const [k, n] of [['tail', 23], ['shell', 6], ['tonic', 4], ['tincture', 2], ['cheese', 3], ['tusk', 9], ['silk', 1]] as const) e.add(k, pack.id, e.freeSlot(pack.id), n);
const log: (Notice & { tab: string })[] = [];
const say = (text: string, kind: Notice['kind'] = 'info') => log.push({ player: hero.id, text, kind, at: e.state.time, tab: kind === 'combat' || kind === 'loot' ? 'Fight' : kind === 'npc' ? 'Town' : 'Default' });
say('Welcome back. The lamps of Lanternfall are lit; the meadow beyond the south gate is restless tonight.');
say('You advanced to magic level 3.', 'level');
say('Mira: thornboars on the left, I will pull the big one if you hold the gate road and keep your shield up.', 'info');

const world = new WorldView(document.createElement('div'), document.getElementById('labels')!, map);
const worldHost = world.host;
worldHost.className = 'world-host';
world.applyStyle(RenderStyle.parse(styleJson));
world.onPick = (tile, info) => {
  if (info.actor && e.state.monsters[info.actor]) { e.action(hero, { kind: 'target', id: info.actor }); return; }
  if (info.shift) { say(e.describe(hero, tile, info.actor)); return; }
  try { e.action(hero, { kind: 'path', to: tile }); } catch (err) { say((err as Error).message, 'error'); }
};
const hunt = () => {
  if (hero.target && e.state.monsters[hero.target]?.hp) return;
  if (ui.autoHunt) { const m = Object.values(e.state.monsters).filter(m => m.hp > 0 && m.z === hero.z && distance(m, hero) < 9).sort((a, b) => distance(a, hero) - distance(b, hero))[0]; if (m) e.action(hero, { kind: 'target', id: m.id }); }
  const m2 = Object.values(e.state.monsters).filter(m => m.hp > 0 && m.z === ally.z && distance(m, ally) < 9).sort((a, b) => distance(a, ally) - distance(b, ally))[0];
  if (m2 && !ally.target) e.action(ally, { kind: 'target', id: m2.id });
};
setInterval(() => {
  hunt();
  for (const p of [hero, ally]) { if (p.hp < e.stats(p).maxHp * 0.35) p.hp = e.stats(p).maxHp; p.fed = 600_000; }
  e.tick(50); e.tick(50);
  for (const n of e.notices.splice(0)) if (n.player === hero.id) say(n.text, n.kind);
  while (log.length > 80) log.shift();
  world.update(e.view(hero));
  render();
}, 100);


// ---------------------------------------------------------------- slot renderers (same functions, laid out differently per variant)
const st = () => e.stats(hero);
const pct = (a: number, b: number) => Math.max(0, Math.min(100, (a / b) * 100));
const bar = (kind: 'hp' | 'mp' | 'xp', v: number, max: number, label: string) =>
  `<div class="c-bar ${kind}" role="meter" aria-label="${label}" aria-valuenow="${v}" aria-valuemax="${max}"><i style="width:${pct(v, max)}%"></i>${kind === 'xp' ? '' : `<span class="num">${v}<em>/${max}</em></span>`}</div>`;

const slots: Record<string, () => string> = {
  identity() {
    const s = st();
    return `<div class="c-id"><b title="${esc(hero.name)}">${esc(hero.name)}</b><span class="c-lvl">Level <span class="num">${s.level}</span></span></div>`;
  },
  vitals() {
    const s = st(), lo = e.rules.xpAt(s.level), hi = e.rules.xpAt(s.level + 1);
    return `<div class="c-vitals">${bar('hp', hero.hp, s.maxHp, 'Health')}${bar('mp', hero.mana, s.maxMana, 'Mana')}<div class="c-xprow">${bar('xp', hero.xp - lo, hi - lo, 'Experience to next level')}<span class="num">${Math.floor(pct(hero.xp - lo, hi - lo))}%</span></div></div>`;
  },
  doll() {
    const eq = e.children(`equip:${hero.id}`);
    const cell = (slot: (typeof equipSlots)[number]) => { const it = eq.find(i => i.slot === equipSlots.indexOf(slot)); return `<div class="c-cell" data-area="${slot}" title="${it ? esc(e.rules.item(it.kind).name) : slot}">${it ? icon(e.rules.item(it.kind).icon) : `<span class="c-ph">${slot}</span>`}</div>`; };
    const s = st();
    return `<div class="c-doll">${equipSlots.map(cell).join('')}<div class="c-cap" data-area="cap"><span>Cap</span><b class="num">${Math.round(s.cap - e.weight(hero))}</b></div></div>`;
  },
  modes() {
    const m: [string, string][] = [['offensive', 'Attack'], ['balanced', 'Balanced'], ['defensive', 'Defend']];
    return `<div class="c-modes" role="group" aria-label="Fighting mode">${m.map(([k, l]) => `<button data-action="mode" data-fight="${k}" aria-pressed="${hero.fightMode === k}">${l}</button>`).join('')}<button data-action="chase" aria-pressed="${hero.chase}" class="c-chase">${hero.chase ? 'Chase' : 'Stand'}</button></div>`;
  },
  minimap() { const z = ui.mapZoom; return `<div class="c-map"><canvas width="${map.width * 2}" height="${map.height * 2}" style="aspect-ratio:${map.width}/${map.height}" aria-label="Map at ${z}× zoom. Click to walk there; scroll to zoom."></canvas><div class="c-mapctl" role="group" aria-label="Map zoom"><button data-action="mapzoom" data-dir="1" aria-label="Zoom map in" ${z >= MAP_ZOOM_MAX ? 'disabled' : ''}>+</button><button data-action="mapzoom" data-dir="-1" aria-label="Zoom map out" ${z <= 1 ? 'disabled' : ''}>−</button><span class="c-zoomlvl num" aria-hidden="true">${z}×</span><span class="c-floor" title="Floor" aria-label="Floor">${hero.z ? 'B1' : 'G'}</span></div><p class="c-place">${esc(placeAt(map, hero))} <span class="num">${hero.x}, ${hero.y}</span></p></div>`; },
  battle() {
    const list = Object.values(e.state.monsters).filter(m => m.hp > 0 && e.onScreen(m, hero)).sort((a, b) => distance(a, hero) - distance(b, hero));
    if (!list.length) return `<p class="c-empty">Nothing hostile on screen.</p>`;
    return `<ul class="c-battle">${list.map(m => { const d = defaultBalance.creatures[m.kind]; return `<li><button data-action="target" data-id="${m.id}" aria-pressed="${hero.target === m.id}"><span class="c-name">${esc(d.name)}</span><span class="c-hp"><i style="width:${pct(m.hp, d.hp)}%"></i></span><span class="c-dist num">${distance(m, hero)}</span></button></li>`; }).join('')}</ul>`;
  },
  skills() {
    const s = st(), r = e.rules;
    const row = (label: string, lvl: number, prog: number) => `<li><span>${label}</span><b class="num">${lvl}</b><i class="c-prog"><i style="width:${Math.floor(prog * 100)}%"></i></i></li>`;
    return `<ul class="c-skills">${row('Melee', s.melee, r.melee(hero.melee).progress)}${row('Shielding', s.shielding, r.shielding(hero.shielding).progress)}${row('Magic', s.magic, r.magic(hero.magic).progress)}<li class="c-plain"><span>Experience</span><b class="num">${hero.xp.toLocaleString('en')}</b></li><li class="c-plain"><span>Deaths</span><b class="num">${hero.deaths}</b></li></ul>`;
  },
  pack() {
    const kids = e.children(pack.id), size = e.rules.item(pack.kind).slots ?? 16;
    return `<div class="c-pack">${Array.from({ length: size }, (_, i) => { const it = kids.find(k => k.slot === i); return `<div class="c-cell" title="${it ? esc(e.rules.item(it.kind).name) : ''}">${it ? icon(e.rules.item(it.kind).icon) + (it.count > 1 ? `<span class="c-n num">${it.count}</span>` : '') : ''}</div>`; }).join('')}</div>`;
  },
  buttons() {
    return `<div class="c-buttons"><button data-action="options" aria-haspopup="dialog" aria-expanded="${ui.popover === 'options'}">Options</button><button data-action="logout" aria-haspopup="dialog" aria-expanded="${ui.popover === 'logout'}">Log out</button></div>`;
  },
  console() {
    const tabs = ['Default', 'Fight', 'Town'];
    const lines = log.filter(l => ui.consoleTab === 'Default' || l.tab === ui.consoleTab).slice(-30);
    const time = (ms: number) => { const m = Math.floor(ms / 60000) % 60, h = 18 + Math.floor(ms / 3600000); return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
    return `<div class="c-console"><div class="c-tabs" role="tablist">${tabs.map(t => `<button role="tab" data-action="tab" data-tab="${t}" aria-selected="${ui.consoleTab === t}">${t}</button>`).join('')}</div><ol class="c-lines" aria-live="polite">${lines.map(l => `<li class="${l.kind}"><time class="num">${time(l.at)}</time><span>${esc(l.text)}</span></li>`).join('')}</ol></div>`;
  },
};
// ---------------------------------------------------------------- variants: zones of reorderable panels. Layout only; every slot is the same live function.
const variantIds = ['classic', 'rails', 'glass'] as const;
type VariantId = (typeof variantIds)[number];
type Layout = Record<string, string[]>;
const panelDefs: Record<string, { title: string; slots: string[] }> = {
  map: { title: 'Map', slots: ['minimap'] },
  status: { title: 'Status', slots: ['identity', 'vitals'] },
  gear: { title: 'Equipment', slots: ['doll'] },
  modes: { title: 'Fighting', slots: ['modes'] },
  battle: { title: 'Battle', slots: ['battle'] },
  skills: { title: 'Skills', slots: ['skills'] },
  pack: { title: 'Canvas pack', slots: ['pack'] },
  menu: { title: 'Menu', slots: ['buttons'] },
};
const zoneNames: Record<string, string> = { side: 'side column', left: 'left rail', right: 'right rail' };
const defaults: Record<VariantId, Layout> = {
  classic: { side: ['map', 'status', 'gear', 'modes', 'menu', 'battle', 'skills', 'pack'] },
  rails: { left: ['battle', 'modes', 'skills'], right: ['map', 'status', 'gear', 'pack', 'menu'] },
  glass: { left: ['battle', 'skills'], right: ['map', 'status', 'modes', 'gear', 'pack', 'menu'] },
};
const KEY = 'proto-chrome.layout.v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } })();
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
const fits = (l: unknown, d: Layout): l is Layout => !!l && typeof l === 'object' && sameSet(Object.keys(l), Object.keys(d)) && Object.values(l as Layout).every(Array.isArray) && sameSet(Object.values(l as Layout).flat(), Object.values(d).flat());
const layouts = Object.fromEntries(variantIds.map(v => [v, fits(saved.layouts?.[v], defaults[v]) ? saved.layouts[v] : structuredClone(defaults[v])])) as Record<VariantId, Layout>;
const MAP_ZOOM_MAX = 4;
const ui = { consoleTab: 'Default', collapsed: new Set<string>(saved.collapsed ?? []), autoHunt: true, popover: '' as '' | 'options' | 'logout', mapZoom: Math.min(MAP_ZOOM_MAX, Math.max(1, Math.round(saved.mapZoom ?? 2))) };
/** Per-variant sizes: rail widths and chat height (px, null = default) and per-panel body heights (null = fit content). */
type Sizes = { zones: Record<string, number>; foot?: number; heights: Record<string, number> };
const sizes = Object.fromEntries(variantIds.map(v => { const x = saved.sizes?.[v]; return [v, { zones: { ...x?.zones }, foot: x?.foot, heights: { ...x?.heights } }]; })) as Record<VariantId, Sizes>;
const defaultZoneWidth: Record<VariantId, Record<string, number>> = { classic: { side: 260 }, rails: { left: 228, right: 252 }, glass: { left: 228, right: 260 } };
const defaultFoot: Record<VariantId, number> = { classic: 176, rails: 160, glass: 212 };
const LIMITS = { zone: [180, 440], foot: [88, 420], panel: [48, 720] } as const;
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.round(Math.max(lo, Math.min(hi, v)));
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify({ layouts, sizes, collapsed: [...ui.collapsed], mapZoom: ui.mapZoom })); } catch { /* private mode: layout just won't persist */ } };
const vid = () => variantIds[current];

const grip = `<svg viewBox="0 0 8 12" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/></g></svg>`;
const panelHtml = (id: string) => {
  const d = panelDefs[id], shut = ui.collapsed.has(id), h = sizes[vid()].heights[id];
  return `<section class="c-panel${shut ? ' collapsed' : ''}" data-panel="${id}" aria-label="${d.title}"><header><button class="c-grip" data-grip="${id}" aria-label="Move ${d.title}" aria-describedby="c-move-help">${grip}</button><h2>${d.title}</h2><button class="c-icon" data-action="collapse" data-panel="${id}" aria-expanded="${!shut}" aria-label="${shut ? 'Expand' : 'Collapse'} ${d.title}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 ${shut ? '4.5l3 3 3-3' : '7.5l3-3 3 3'}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></header><div class="c-body${h ? ' sized' : ''}"${h ? ` style="height:${h}px"` : ''}>${d.slots.map(s => `<div data-slot="${s}"></div>`).join('')}</div>${shut ? '' : `<div class="c-resize" data-resize="${id}" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Resize ${d.title}" aria-describedby="c-size-help"${h ? ` aria-valuenow="${h}"` : ''} aria-valuemin="${LIMITS.panel[0]}" aria-valuemax="${LIMITS.panel[1]}"></div>`}</section>`;
};
const zone = (z: string) => `<aside class="c-zone" data-zone="${z}" aria-label="${zoneNames[z]}">${layouts[vid()][z].map(panelHtml).join('')}</aside>`;
/** Splitters live outside the scrolling rails (fixed, positioned each frame) so they never scroll away. */
const splitters = () => [...Object.keys(layouts[vid()]).map(z => `<div class="c-split" data-split="${z}" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize ${zoneNames[z]}" aria-describedby="c-size-help"></div>`), `<div class="c-split horiz" data-split="foot" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Resize chat" aria-describedby="c-size-help"></div>`].join('');
const chat = `<form class="c-say"><input name="say" autocomplete="off" spellcheck="false" placeholder="Say something, or a spell word" aria-label="Say"><button type="submit">Say</button></form>`;
const foot = `<footer class="c-foot"><div data-slot="console"></div>${chat}</footer>`;
const view = `<div class="c-viewport" data-slot="viewport"></div>`;
const variants: Record<VariantId, () => string> = {
  classic: () => `${view}${zone('side')}${foot}${splitters()}`,
  rails: () => `${zone('left')}${view}${zone('right')}${foot}${splitters()}`,
  glass: () => `${view}${zone('left')}${zone('right')}${foot}${splitters()}`,
};

// ---------------------------------------------------------------- render (only touch DOM when markup changes, so clicks never get swallowed)
const stage = document.getElementById('stage')!;
const pop = document.getElementById('c-pop')!;
const announce = document.getElementById('c-announce')!;
const last = new WeakMap<Element, string>();
let layoutKey = '';
function render() {
  const html = variants[vid()]();
  if (html !== layoutKey) {
    const scroll = new Map([...stage.querySelectorAll<HTMLElement>('.c-zone')].map(z => [z.dataset.zone!, z.scrollTop]));
    layoutKey = html; stage.className = `v-${vid()}`; stage.innerHTML = html;
    for (const z of stage.querySelectorAll<HTMLElement>('.c-zone')) z.scrollTop = scroll.get(z.dataset.zone!) ?? 0;
    stage.querySelector('[data-slot="viewport"]')!.append(worldHost); world.resize();
  }
  const sz = sizes[vid()];
  for (const [z, w] of Object.entries(defaultZoneWidth[vid()])) stage.style.setProperty(`--w-${z}`, `${sz.zones[z] ?? w}px`);
  stage.style.setProperty('--h-foot', `${sz.foot ?? defaultFoot[vid()]}px`);
  placeSplitters();
  const vr = worldHost.getBoundingClientRect();
  world.labels.style.clipPath = `inset(${vr.top}px ${innerWidth - vr.right}px ${innerHeight - vr.bottom}px ${vr.left}px)`;
  for (const el of stage.querySelectorAll<HTMLElement>('[data-slot]')) {
    const name = el.dataset.slot!;
    if (name === 'viewport') continue;
    const out = slots[name]();
    if (last.get(el) !== out) { last.set(el, out); el.innerHTML = out; if (name === 'console') { const l = el.querySelector('.c-lines'); if (l) l.scrollTop = l.scrollHeight; } }
    if (name === 'minimap') drawMap(el);
  }
  placePopover();
}
/** Rails grow away from the game view: a splitter sits on the rail edge that faces it. */
const facing = (z: string) => (z === 'left' ? 'right' : 'left');
function placeSplitters() {
  for (const el of stage.querySelectorAll<HTMLElement>('.c-split')) {
    const k = el.dataset.split!;
    const target = stage.querySelector<HTMLElement>(k === 'foot' ? '.c-foot' : `.c-zone[data-zone="${k}"]`); if (!target) continue;
    const r = target.getBoundingClientRect();
    if (k === 'foot') { Object.assign(el.style, { left: `${r.left}px`, width: `${r.width}px`, top: `${r.top - 6}px` }); el.setAttribute('aria-valuenow', String(Math.round(r.height))); }
    else { Object.assign(el.style, { top: `${r.top}px`, height: `${r.height}px`, left: `${(facing(k) === 'left' ? r.left : r.right) - 6}px` }); el.setAttribute('aria-valuenow', String(Math.round(r.width))); }
  }
}
function setMapZoom(z: number) {
  ui.mapZoom = Math.max(1, Math.min(MAP_ZOOM_MAX, z)); persist(); render();
  const btn = stage.querySelector<HTMLButtonElement>('[data-action="mapzoom"]:not([disabled])'); if (document.activeElement?.matches('[data-action="mapzoom"][disabled], body')) btn?.focus();
}
function placePopover() {
  const trigger = ui.popover && stage.querySelector<HTMLElement>(`[data-action="${ui.popover}"]`);
  if (!trigger) { if (!pop.hidden) { pop.hidden = true; pop.innerHTML = ''; last.delete(pop); } return; }
  const out = popover();
  const opening = pop.hidden;
  if (last.get(pop) !== out) { last.set(pop, out); pop.innerHTML = out; }
  pop.hidden = false;
  const r = trigger.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const above = r.top - h - 8 > 8;
  const left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w));
  pop.style.left = `${left}px`; pop.style.top = `${above ? r.top - h - 8 : r.bottom + 8}px`;
  pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${above ? '100%' : '0%'}`;
  if (opening) pop.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
}
function popover() {
  if (ui.popover === 'logout') {
    const locked = hero.combatUntil > e.state.time;
    return `<p>${locked ? 'You are in a fight. Wait for the fight lock to end, or step into the shrine.' : 'Save and leave Lanternfall?'}</p><div class="c-popact"><button data-action="close">Stay</button>${locked ? '' : '<button class="c-primary" data-action="close">Save and leave</button>'}</div>`;
  }
  return `<label><input type="checkbox" data-action="autohunt" ${ui.autoHunt ? 'checked' : ''}> Auto-target nearby creatures (preview only)</label><label><input type="checkbox" data-action="names" ${world.labels.classList.contains('names') ? 'checked' : ''}> Always show names</label><div class="c-popact"><button data-action="reset">Reset panel layout</button><button data-action="close">Done</button></div>`;
}
/** The visible window of the map at the current minimap zoom, centred on the hero and clamped to the edges. */
function mapWindow() {
  const z = ui.mapZoom, w = map.width / z, h = map.height / z;
  return { x0: Math.max(0, Math.min(map.width - w, hero.x + 0.5 - w / 2)), y0: Math.max(0, Math.min(map.height - h, hero.y + 0.5 - h / 2)), s: 2 * z };
}
function drawMap(host: HTMLElement) {
  const c = host.querySelector('canvas'); if (!c) return;
  const g = c.getContext('2d')!, f = map.floors[hero.z];
  const { x0, y0, s } = mapWindow();
  g.setTransform(s, 0, 0, s, -x0 * s, -y0 * s); g.imageSmoothingEnabled = false;
  g.fillStyle = '#0b0a09'; g.fillRect(0, 0, map.width, map.height);
  const col: Record<string, string> = { grass: '#3d6236', meadow: '#34572f', dirt: '#6e5537', cobble: '#8a816f', plank: '#7a5a3a', stone: '#4a4744', water: '#1f4650', sand: '#b39a6b', moss: '#3d5236', flagstone: '#7d7768', void: '#0b0a09' };
  for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) {
    const i = y * map.width + x, t = f.thing[i];
    g.fillStyle = t === T.wall || t === T.rampart ? '#b9ac8f' : t === T.cavewall ? '#0b0a09' : t === T.tree || t === T.pine ? '#24402a' : col[grounds[f.ground[i]]];
    g.fillRect(x, y, 1, 1);
  }
  for (const m of Object.values(e.state.monsters)) if (m.hp > 0 && m.z === hero.z) { g.fillStyle = '#e0604a'; g.fillRect(m.x, m.y, 1, 1); }
  const dot = (x: number, y: number, px: number) => { const d = Math.max(1, px / s); g.fillRect(x + 0.5 - d / 2, y + 0.5 - d / 2, d, d); };
  g.fillStyle = '#c8a0e0'; dot(ally.x, ally.y, 3);
  g.fillStyle = '#fff'; dot(hero.x, hero.y, 4);
}

// ---------------------------------------------------------------- reorganizing: drag a panel by its header, or focus its grip and use the arrow keys
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const rects = () => new Map([...stage.querySelectorAll<HTMLElement>('.c-panel')].map(p => [p.dataset.panel!, p.getBoundingClientRect()]));
/** Rebuild the layout, then slide every panel from where it was (FLIP) so a move reads as a move, not a jump. */
function relayout(before: Map<string, DOMRect>, focusGrip?: string) {
  persist(); layoutKey = ''; render();
  if (focusGrip) stage.querySelector<HTMLElement>(`[data-grip="${focusGrip}"]`)?.focus({ preventScroll: false });
  if (reduced.matches) return;
  for (const p of stage.querySelectorAll<HTMLElement>('.c-panel')) {
    const a = before.get(p.dataset.panel!), b = p.getBoundingClientRect();
    if (!a || (Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1)) continue;
    p.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }
}
function place(id: string, z: string, index: number) {
  const L = layouts[vid()];
  for (const list of Object.values(L)) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); }
  L[z].splice(Math.max(0, Math.min(index, L[z].length)), 0, id);
  const zs = Object.keys(L);
  announce.textContent = `${panelDefs[id].title} moved to position ${L[z].indexOf(id) + 1} of ${L[z].length}${zs.length > 1 ? ` in the ${zoneNames[z]}` : ''}.`;
}
stage.addEventListener('keydown', ev => {
  const g = (ev.target as HTMLElement).closest<HTMLElement>('[data-grip]');
  if (!g || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) return;
  ev.preventDefault(); ev.stopPropagation(); // arrows here move the panel, not the prototype picker
  const id = g.dataset.grip!, L = layouts[vid()], zs = Object.keys(L);
  const zi = zs.findIndex(z => L[z].includes(id)), i = L[zs[zi]].indexOf(id);
  const before = rects();
  if (ev.key === 'ArrowUp' && i > 0) place(id, zs[zi], i - 1);
  else if (ev.key === 'ArrowDown' && i < L[zs[zi]].length - 1) place(id, zs[zi], i + 1);
  else if (ev.key === 'ArrowLeft' && zi > 0) place(id, zs[zi - 1], i);
  else if (ev.key === 'ArrowRight' && zi < zs.length - 1) place(id, zs[zi + 1], i);
  else return;
  relayout(before, id);
});

let drag: null | { id: string; el: HTMLElement; ph?: HTMLElement; x: number; y: number; ox: number; oy: number; pointer: number } = null;
stage.addEventListener('pointerdown', ev => {
  const head = (ev.target as HTMLElement).closest<HTMLElement>('.c-panel > header');
  if (!head || ev.button !== 0 || (ev.target as HTMLElement).closest('[data-action]')) return;
  const el = head.parentElement as HTMLElement;
  drag = { id: el.dataset.panel!, el, x: ev.clientX, y: ev.clientY, ox: 0, oy: 0, pointer: ev.pointerId };
  head.setPointerCapture(ev.pointerId);
});
stage.addEventListener('pointermove', ev => {
  if (!drag || ev.pointerId !== drag.pointer) return;
  const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
  if (!drag.ph) {
    if (Math.hypot(dx, dy) < 5) return; // a click on the header is not a drag
    const r = drag.el.getBoundingClientRect();
    drag.ph = document.createElement('div'); drag.ph.className = 'c-drop'; drag.ph.style.height = `${r.height}px`;
    drag.el.before(drag.ph);
    Object.assign(drag.el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
    drag.el.classList.add('lifted'); document.body.classList.add('c-dragging');
  }
  drag.el.style.transform = `translate(${dx}px, ${dy}px)`;
  // nearest zone horizontally, then the first panel whose middle is below the pointer
  const zones = [...stage.querySelectorAll<HTMLElement>('.c-zone')];
  const dist = (z: HTMLElement) => { const r = z.getBoundingClientRect(); return ev.clientX < r.left ? r.left - ev.clientX : ev.clientX > r.right ? ev.clientX - r.right : 0; };
  const z = zones.sort((a, b) => dist(a) - dist(b))[0];
  const next = [...z.querySelectorAll<HTMLElement>(':scope > .c-panel:not(.lifted)')].find(p => { const r = p.getBoundingClientRect(); return ev.clientY < r.top + r.height / 2; });
  if (next) { if (drag.ph.nextElementSibling !== next) next.before(drag.ph); } else if (z.lastElementChild !== drag.ph) z.append(drag.ph);
  // keep the drop line visible when dragging past the edge of a scrolling rail
  const zr = z.getBoundingClientRect();
  if (ev.clientY > zr.bottom - 40) z.scrollTop += 12; else if (ev.clientY < zr.top + 40) z.scrollTop -= 12;
});
const endDrag = (ev: PointerEvent) => {
  if (!drag || ev.pointerId !== drag.pointer) return;
  const d = drag; drag = null;
  if (!d.ph) return;
  document.body.classList.remove('c-dragging');
  const before = rects();
  if (ev.type === 'pointerup') {
    const z = d.ph.parentElement as HTMLElement;
    const index = [...z.querySelectorAll(':scope > .c-panel:not(.lifted), :scope > .c-drop')].indexOf(d.ph);
    place(d.id, z.dataset.zone!, index);
  }
  relayout(before);
};
stage.addEventListener('pointerup', endDrag);
stage.addEventListener('pointercancel', endDrag);
addEventListener('keydown', ev => { if (ev.key === 'Escape' && drag?.ph) { const d = drag; drag = null; d.el.classList.remove('lifted'); d.el.removeAttribute('style'); d.ph!.remove(); document.body.classList.remove('c-dragging'); } });

// ---------------------------------------------------------------- resizing: drag a splitter or a panel's bottom edge; arrows nudge 16px, double-click resets
type Resize = { kind: 'zone' | 'foot' | 'panel'; key: string; el: HTMLElement; start: number; from: number; sign: number; pointer: number; moved: boolean };
let resize: Resize | null = null;
function resizeTarget(h: HTMLElement): Omit<Resize, 'start' | 'pointer' | 'moved'> | null {
  if (h.dataset.resize) { const body = h.parentElement!.querySelector<HTMLElement>('.c-body')!; return { kind: 'panel', key: h.dataset.resize, el: body, from: body.getBoundingClientRect().height, sign: 1 }; }
  const k = h.dataset.split; if (!k) return null;
  if (k === 'foot') { const el = stage.querySelector<HTMLElement>('.c-foot')!; return { kind: 'foot', key: k, el, from: el.getBoundingClientRect().height, sign: -1 }; }
  const el = stage.querySelector<HTMLElement>(`.c-zone[data-zone="${k}"]`)!;
  return { kind: 'zone', key: k, el, from: el.getBoundingClientRect().width, sign: facing(k) === 'left' ? -1 : 1 };
}
function applySize(t: Pick<Resize, 'kind' | 'key' | 'el'>, v: number, commit: boolean) {
  const sz = sizes[vid()];
  if (t.kind === 'panel') { v = clamp(v, LIMITS.panel); t.el.style.height = `${v}px`; t.el.classList.add('sized'); if (commit) sz.heights[t.key] = v; }
  else if (t.kind === 'zone') { v = clamp(v, LIMITS.zone); stage.style.setProperty(`--w-${t.key}`, `${v}px`); if (commit) sz.zones[t.key] = v; }
  else { v = clamp(v, LIMITS.foot); stage.style.setProperty('--h-foot', `${v}px`); if (commit) sz.foot = v; }
  world.resize(); placeSplitters();
  if (commit) { persist(); layoutKey = ''; render(); }
}
stage.addEventListener('pointerdown', ev => {
  const h = (ev.target as HTMLElement).closest<HTMLElement>('[data-resize], [data-split]');
  if (!h || ev.button !== 0) return;
  const t = resizeTarget(h); if (!t) return;
  ev.preventDefault(); h.setPointerCapture(ev.pointerId);
  resize = { ...t, start: t.kind === 'zone' ? ev.clientX : ev.clientY, pointer: ev.pointerId, moved: false };
  document.body.classList.add(t.kind === 'zone' ? 'c-resizing-x' : 'c-resizing-y'); h.classList.add('active');
});
stage.addEventListener('pointermove', ev => {
  if (!resize || ev.pointerId !== resize.pointer) return;
  resize.moved = true;
  applySize(resize, resize.from + ((resize.kind === 'zone' ? ev.clientX : ev.clientY) - resize.start) * resize.sign, false);
});
const endResize = (ev: PointerEvent) => {
  if (!resize || ev.pointerId !== resize.pointer) return;
  const r = resize; resize = null;
  document.body.classList.remove('c-resizing-x', 'c-resizing-y'); stage.querySelector('.c-split.active, .c-resize.active')?.classList.remove('active');
  if (r.moved) applySize(r, r.from + ((r.kind === 'zone' ? ev.clientX : ev.clientY) - r.start) * r.sign, true);
};
stage.addEventListener('pointerup', endResize);
stage.addEventListener('pointercancel', endResize);
stage.addEventListener('dblclick', ev => {
  const h = (ev.target as HTMLElement).closest<HTMLElement>('[data-resize], [data-split]'); if (!h) return;
  const sz = sizes[vid()], k = h.dataset.resize ?? h.dataset.split!;
  if (h.dataset.resize) delete sz.heights[k]; else if (k === 'foot') sz.foot = undefined; else delete sz.zones[k];
  announce.textContent = 'Size reset.'; persist(); layoutKey = ''; render(); world.resize();
});
stage.addEventListener('keydown', ev => {
  const h = (ev.target as HTMLElement).closest<HTMLElement>('[data-resize], [data-split]');
  if (!h) return;
  const t = resizeTarget(h); if (!t) return;
  const grow = t.kind === 'zone' ? (t.sign > 0 ? 'ArrowRight' : 'ArrowLeft') : t.kind === 'foot' ? 'ArrowUp' : 'ArrowDown';
  const shrink = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' }[grow];
  if (ev.key !== grow && ev.key !== shrink) return;
  ev.preventDefault(); ev.stopPropagation();
  const key = h.dataset.resize ? `[data-resize="${h.dataset.resize}"]` : `[data-split="${h.dataset.split}"]`;
  applySize(t, t.from + (ev.key === grow ? 16 : -16), true);
  stage.querySelector<HTMLElement>(key)?.focus();
});
stage.addEventListener('wheel', ev => {
  if (!(ev.target as HTMLElement).closest('.c-map canvas')) return;
  ev.preventDefault();
  wheel += ev.deltaY; if (Math.abs(wheel) < 60) return; // trackpads send many tiny deltas; one notch ≈ one step
  setMapZoom(ui.mapZoom + (wheel < 0 ? 1 : -1)); wheel = 0;
}, { passive: false });
let wheel = 0;

// ---------------------------------------------------------------- interactions (delegated, work in every variant)
document.addEventListener('click', ev => {
  const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!t) { if (ui.popover && !pop.contains(ev.target as Node)) { ui.popover = ''; render(); } return; }
  const a = t.dataset.action;
  try {
    if (a === 'target') e.action(hero, { kind: 'target', id: hero.target === t.dataset.id ? null : t.dataset.id! });
    else if (a === 'mode') e.action(hero, { kind: 'mode', fight: t.dataset.fight as Hero['fightMode'] });
    else if (a === 'chase') e.action(hero, { kind: 'mode', chase: !hero.chase });
    else if (a === 'tab') ui.consoleTab = t.dataset.tab!;
    else if (a === 'collapse') { const id = t.dataset.panel!; ui.collapsed.has(id) ? ui.collapsed.delete(id) : ui.collapsed.add(id); persist(); requestAnimationFrame(() => stage.querySelector<HTMLElement>(`[data-action="collapse"][data-panel="${id}"]`)?.focus()); }
    else if (a === 'mapzoom') { setMapZoom(ui.mapZoom + Number(t.dataset.dir)); return; }
    else if (a === 'options' || a === 'logout') ui.popover = ui.popover === a ? '' : a;
    else if (a === 'close') { const back = ui.popover; ui.popover = ''; render(); stage.querySelector<HTMLElement>(`[data-action="${back}"]`)?.focus(); return; }
    else if (a === 'reset') { const before = rects(); layouts[vid()] = structuredClone(defaults[vid()]); sizes[vid()] = { zones: {}, heights: {} }; ui.collapsed.clear(); ui.popover = ''; announce.textContent = 'Panel layout reset.'; relayout(before); return; }
    else if (a === 'autohunt') ui.autoHunt = (t as HTMLInputElement).checked;
    else if (a === 'names') world.labels.classList.toggle('names', (t as HTMLInputElement).checked);
  } catch (err) { say((err as Error).message, 'error'); }
  render();
});
stage.addEventListener('click', ev => {
  const c = (ev.target as HTMLElement).closest('.c-map canvas') as HTMLCanvasElement | null;
  if (!c) return;
  const r = c.getBoundingClientRect(), { x0, y0 } = mapWindow(), z = ui.mapZoom;
  const to = { x: Math.floor(x0 + ((ev.clientX - r.left) / r.width) * map.width / z), y: Math.floor(y0 + ((ev.clientY - r.top) / r.height) * map.height / z), z: hero.z };
  try { e.action(hero, { kind: 'path', to }); } catch (err) { say((err as Error).message, 'error'); }
});
stage.addEventListener('submit', ev => {
  ev.preventDefault();
  const input = (ev.target as HTMLElement).querySelector('input')!;
  const text = input.value.trim(); if (!text) return;
  say(`${hero.name}: ${text}`);
  try { e.action(hero, { kind: 'say', text }); } catch (err) { say((err as Error).message, 'error'); }
  input.value = '';
});
addEventListener('keydown', ev => { if (ev.key === 'Escape' && ui.popover) { const back = ui.popover; ui.popover = ''; render(); stage.querySelector<HTMLElement>(`[data-action="${back}"]`)?.focus(); } });
addEventListener('resize', () => render());
world.itemIcon = kind => iconCanvas(e.rules.item(kind as never).icon);

// ---------------------------------------------------------------- picker (verbatim wiring from the prototype skill)
const picker = document.querySelector('.proto-picker')!;
const highlight = picker.querySelector<HTMLElement>('.proto-picker-highlight')!;
const items = [...picker.querySelectorAll<HTMLElement>('.proto-picker-item:not(.proto-picker-replay)')];
let current = 0;
function moveHighlight() { const el = items[current]; highlight.style.width = el.offsetWidth + 'px'; highlight.style.transform = `translateX(${el.offsetLeft}px)`; }
function setActive(i: number) {
  if (i < 0 || i >= variantIds.length) return;
  current = i;
  items.forEach((el, j) => { el.toggleAttribute('data-active', j === i); if (j === i) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current'); });
  moveHighlight();
  const url = new URL(location.href); url.searchParams.set('v', String(i + 1)); history.replaceState(null, '', url);
  ui.popover = ''; layoutKey = ''; render();
}
items.forEach((el, i) => el.addEventListener('click', () => setActive(i)));
addEventListener('resize', moveHighlight);
document.addEventListener('keydown', ev => {
  const tg = ev.target as HTMLElement;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(tg.tagName) || tg.isContentEditable) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const num = parseInt(ev.key, 10);
  if (num >= 1 && num <= variantIds.length) setActive(num - 1);
  else if (ev.key === 'ArrowRight') setActive((current + 1) % variantIds.length);
  else if (ev.key === 'ArrowLeft') setActive((current - 1 + variantIds.length) % variantIds.length);
});
setActive((parseInt(new URLSearchParams(location.search).get('v') ?? '', 10) || 1) - 1);
requestAnimationFrame(() => requestAnimationFrame(() => picker.setAttribute('data-ready', '')));
