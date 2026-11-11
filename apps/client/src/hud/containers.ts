// Container windows: the pack, each pouch or bag, a corpse, a floor pile and the vault, each its own window in the
// column, several at once. Opening a container from inside a window replaces that window's contents and shows a back
// arrow (so a pack of pouches does not flood the column); opening one from the doll, the world or "Open in new window"
// makes a new window. A window closes when what it shows goes out of reach.
import { equipSlots, type GameItem, type GameView, type Pos } from '../../../../packages/game/src/model.ts';
import { bodyOn, core, distance, findItem, equipKey, groundKey, itemDef, kids, pileAt, topCorpse, vaultKey } from './core.ts';
import { esc, patch } from './kit.ts';
import { cellHtml, move, packTarget } from './items.ts';
import { statusLine } from './overlay.ts';
import type { WinSpec } from './column.ts';

export type Source = { kind: 'item'; id: string } | { kind: 'corpse'; id: string } | { kind: 'ground'; at: Pos } | { kind: 'vault' };
type Win = { key: string; src: Source; trail: Source[] };
const wins: Win[] = [];
let next = 1;
const sameSrc = (a: Source, b: Source) => a.kind === b.kind && (a.kind === 'vault' || (a.kind === 'ground' ? groundKey(a.at) === groundKey((b as { at: Pos }).at) : a.id === (b as { id: string }).id));
const COLS = 4;
let reveal: string | undefined;
/** The window just opened, once, so the column can scroll it into view. */
export function takeReveal() { const r = reveal; reveal = undefined; return r; }

/** What a source shows right now, or why it cannot be shown. */
type Shown = { parent: string; size: number; title: string; icon: string; loot: boolean; pile?: boolean };
function reach(v: GameView, src: Source): Shown | string {
  const self = v.self;
  if (src.kind === 'vault') return distance(self, core.map.vault) <= 2 ? { parent: vaultKey(v), size: 30, title: 'Your vault', icon: 'w-vault', loot: false } : 'out of reach';
  if (src.kind === 'ground') {
    const pile = pileAt(v, src.at);
    if (distance(self, src.at) > 1 || src.at.z !== self.z) return 'out of reach';
    if (!pile.length) return 'empty';
    return { parent: groundKey(src.at), size: Math.ceil(pile.length / COLS) * COLS, title: 'On the ground', icon: 'w-pile', loot: true, pile: true };
  }
  if (src.kind === 'corpse') {
    const c = v.corpses.find(c => c.id === src.id);
    if (!c || c.stage >= 2) return 'gone';
    if (distance(self, c) > 1 || c.z !== self.z) return 'out of reach';
    if (topCorpse(v, c)?.id !== c.id) return 'Something lies on top of it.';
    if (bodyOn(v, c)) return 'Someone is standing on it.';
    const used = kids(v, c.id).reduce((m, i) => Math.max(m, i.slot + 1), 0);
    return { parent: c.id, size: Math.max(COLS, Math.ceil(used / COLS) * COLS), title: c.name, icon: 'w-body', loot: true };
  }
  const item = findItem(v, src.id);
  if (!item) return 'gone';
  // Follow the item up to what holds it: worn, the vault, a corpse or the floor decide whether it is in reach.
  let p = item.parent;
  for (let guard = 0; guard < 8; guard++) {
    const up = findItem(v, p);
    if (!up) break;
    p = up.parent;
  }
  const root: Source | undefined = p === equipKey(v) ? undefined : p === vaultKey(v) ? { kind: 'vault' } : p.startsWith('ground:') ? { kind: 'ground', at: parseGround(p) } : { kind: 'corpse', id: p };
  if (root) { const r = reach(v, root); if (typeof r === 'string') return r; }
  const def = itemDef(item.kind);
  return { parent: item.id, size: def.slots ?? 0, title: def.name, icon: item.kind === 'pack' ? 'w-pack' : 'w-bag', loot: !!root && root.kind !== 'vault' };
}
const parseGround = (k: string) => { const [x, y, z] = k.slice(7).split(',').map(Number); return { x, y, z }; };

/** Opens a container. From inside window `from`, it replaces that window's contents; otherwise it gets a window of its own. */
export function openContainer(src: Source, from?: string) {
  const w = from && wins.find(w => w.key === from);
  if (w) { if (!sameSrc(w.src, src)) { w.trail.push(w.src); w.src = src; } }
  else if (!wins.some(w => sameSrc(w.src, src))) { const key = `bag${next++}`; wins.push({ key, src, trail: [] }); reveal = key; }
  else reveal = wins.find(w => sameSrc(w.src, src))!.key;
  core.redraw();
}
export function closeContainer(key: string) { const i = wins.findIndex(w => w.key === key); if (i >= 0) wins.splice(i, 1); core.redraw(); }
export function back(key: string) { const w = wins.find(w => w.key === key); if (w?.trail.length) { w.src = w.trail.pop()!; core.redraw(); } }
export const isOpen = (src: Source) => wins.some(w => sameSrc(w.src, src) || w.trail.some(t => sameSrc(t, src)));
export const vaultOpen = () => wins.some(w => w.src.kind === 'vault');
/** The window a container item is shown in, if any. */
export const windowOf = (el: Element | null) => el?.closest<HTMLElement>('.k-bag')?.dataset.win;
/** Closes the newest window other than the worn pack's (I opens and closes that); Escape uses this. */
export function closeNewest() {
  const v = core.view;
  for (let i = wins.length - 1; i >= 0; i--) {
    const s = wins[i].src;
    if (v && s.kind === 'item' && findItem(v, s.id)?.parent === equipKey(v)) continue;
    wins.splice(i, 1); core.redraw(); return true;
  }
  return false;
}
export const anyOpen = () => wins.length > 0;
/** The worn pack, open in a window (at the start of play). */
export function openPack() {
  const v = core.view; if (!v) return;
  const pack = kids(v, equipKey(v)).find(i => i.slot === equipSlots.indexOf('pack'));
  if (pack) openContainer({ kind: 'item', id: pack.id });
}
export function togglePack() {
  const v = core.view; if (!v) return;
  const pack = kids(v, equipKey(v)).find(i => i.slot === equipSlots.indexOf('pack'));
  if (!pack) return statusLine('You carry no pack.');
  const w = wins.find(w => w.src.kind === 'item' && w.src.id === pack.id);
  if (w) closeContainer(w.key); else openContainer({ kind: 'item', id: pack.id });
}

/** Drops windows whose container went out of reach; a window that was showing a child steps back to its parent. */
export function update(v: GameView) {
  for (let i = wins.length - 1; i >= 0; i--) {
    const w = wins[i];
    let r = reach(v, w.src);
    while (typeof r === 'string' && w.trail.length) { w.src = w.trail.pop()!; r = reach(v, w.src); }
    if (typeof r === 'string') {
      wins.splice(i, 1);
      if (r !== 'gone' && r !== 'out of reach' && r !== 'empty') statusLine(r);
    }
  }
}

export function windows(): WinSpec[] {
  const v = core.view;
  if (!v) return [];
  return wins.flatMap(w => {
    const r = reach(v, w.src);
    if (typeof r === 'string') return [];
    return [{ id: w.key, title: r.title, icon: r.icon, kind: 'bag', close: () => closeContainer(w.key), back: w.trail.length ? () => back(w.key) : undefined, render: (body: HTMLElement) => draw(body, v, w, r) }];
  });
}

function draw(body: HTMLElement, v: GameView, w: Win, r: Shown) {
  const items = kids(v, r.parent);
  let cells = '';
  if (r.pile) [...items].sort((a, b) => b.slot - a.slot).forEach(i => { cells += cellHtml(i, r.parent, 0); });
  else for (let s = 0; s < r.size; s++) cells += cellHtml(items.find(k => k.slot === s), r.parent, s);
  const empty = r.loot && !items.length;
  const html = `<div class="cgrid" data-drop="${esc(r.parent)}">${empty ? '<p class="muted">Nothing left.</p>' : cells}</div>`
    + (r.loot && items.length ? `<div class="w-foot"><button type="button" class="btn small" data-take="${esc(w.key)}">Take all</button></div>` : '');
  patch(body, html);
}

document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-take]');
  const w = b && wins.find(w => w.key === b.dataset.take), v = core.view;
  if (!w || !v) return;
  const r = reach(v, w.src);
  if (typeof r === 'string') return;
  // Moves go out together before the next view arrives, so reserve the slots handed out.
  const reserved = new Set<string>();
  for (const i of kids(v, r.parent)) {
    const t = itemDef(i.kind).slot === 'pack' && !kids(v, equipKey(v)).some(e => e.slot === equipSlots.indexOf('pack')) ? { parent: equipKey(v), slot: equipSlots.indexOf('pack') } : packTarget(i, reserved);
    if (!t) { statusLine('Your pack is full.'); break; }
    reserved.add(`${t.parent}:${t.slot}`);
    move(i as GameItem, t.parent, t.slot);
  }
});
