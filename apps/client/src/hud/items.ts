// Item cells (doll, containers, loot) and what you can do with an item: the tooltip, the double-click action, the
// context menu. Events are delegated from the document, so cells redrawn on an update need no wiring.
import { equipSlots, type GameItem, type ItemKind } from '../../../../packages/game/src/model.ts';
import { icon } from '../icons.ts';
import { core, equipKey, findItem, groundKey, isCarried, itemDef, kids, vaultKey } from './core.ts';
import { esc } from './kit.ts';
import { openMenu, type Entry, type Menu } from './menu.ts';
import { closeTip, showTip } from './tooltip.ts';
import { statusLine } from './overlay.ts';
import { openContainer, vaultOpen, windowOf } from './containers.ts';
import { dragItem, dragSuppressesClick } from './drag.ts';

/** A framed slot; empty slots on the doll show a faint picture of what goes there. */
export function cellHtml(i: GameItem | undefined, parent: string, slot: number, placeholder = '') {
  const attrs = `class="cell${i ? '' : ' empty'}" data-parent="${esc(parent)}" data-slot="${slot}"`;
  if (!i) return `<div ${attrs}>${placeholder ? `<span class="ph">${icon(placeholder)}</span>` : ''}</div>`;
  const d = itemDef(i.kind);
  return `<div ${attrs}><button type="button" class="item" data-id="${i.id}" aria-label="${esc(d.name)}${i.count > 1 ? ` × ${i.count}` : ''}">${icon(d.icon)}${i.count > 1 ? `<span class="n num">${i.count}</span>` : ''}</button></div>`;
}

// ---------------------------------------------------------------- where things go
export function move(i: GameItem, parent: string, slot: number, count = i.count) { core.send({ kind: 'moveItem', id: i.id, parent, slot, count, version: i.version }); }
function freeSlotIn(parent: string, size: number, reserved?: Set<string>) {
  const used = new Set(kids(core.view!, parent).map(i => i.slot));
  for (let s = 0; s < size; s++) if (!used.has(s) && !reserved?.has(`${parent}:${s}`)) return s;
  return -1;
}
/** Where an item should go in a set of containers: onto a matching stack with room, else the first free slot. */
export function targetIn(parents: { id: string; size: number }[], item?: GameItem, reserved?: Set<string>) {
  if (item && itemDef(item.kind).stack) for (const c of parents) {
    const stack = kids(core.view!, c.id).find(j => j.kind === item.kind && j.id !== item.id && j.count < 100);
    if (stack) return { parent: c.id, slot: stack.slot };
  }
  for (const c of parents) { const s = freeSlotIn(c.id, c.size, reserved); if (s >= 0) return { parent: c.id, slot: s }; }
}
/** The pack, then the pouches inside it. */
export function packTarget(item?: GameItem, reserved?: Set<string>) {
  const v = core.view; if (!v) return;
  const pack = kids(v, equipKey(v)).find(i => i.slot === equipSlots.indexOf('pack'));
  const bags = pack ? [pack, ...kids(v, pack.id).filter(i => itemDef(i.kind).slots && i.id !== item?.id)] : [];
  return targetIn(bags.map(b => ({ id: b.id, size: itemDef(b.kind).slots! })), item, reserved);
}
/** Into a container (dropped on its window, not a slot): onto a stack, else its first free slot. */
export function intoContainer(parent: string, item: GameItem) {
  const v = core.view!, holder = findItem(v, parent);
  const size = parent === vaultKey(v) ? 30 : holder ? itemDef(holder.kind).slots ?? 0 : 0;
  if (parent.startsWith('ground:')) return { parent, slot: 0 };
  return targetIn([{ id: parent, size }], item);
}
const isContainer = (k: ItemKind) => !!itemDef(k).slots;

// ---------------------------------------------------------------- actions
/** What a double-click (and the first menu entry) does with an item, as a word. */
export function primaryLabel(i: GameItem): string | undefined {
  const v = core.view; if (!v) return;
  const def = itemDef(i.kind), eq = equipKey(v);
  if (isContainer(i.kind)) return 'Open';
  if (!isCarried(v, i.id)) return 'Take';
  if (vaultOpen() && i.parent !== eq) return 'Store';
  if (def.food) return 'Eat';
  if (def.heal || def.mana) return 'Drink';
  if (i.parent === eq) return 'Take off';
  if (def.slot) return 'Wear';
}
/** `from` is the window the item was used in: a container opened from inside a window replaces its contents. */
export function primary(i: GameItem, from?: string) {
  const v = core.view; if (!v) return;
  const def = itemDef(i.kind), eq = equipKey(v);
  if (isContainer(i.kind)) return openContainer({ kind: 'item', id: i.id }, from);
  if (!isCarried(v, i.id)) { const t = packTarget(i); if (!t) return statusLine('Your pack is full.'); return move(i, t.parent, t.slot); }
  if (vaultOpen() && i.parent !== eq) { const t = targetIn([{ id: vaultKey(v), size: 30 }], i); if (!t) return statusLine('Your vault is full.'); return move(i, t.parent, t.slot); }
  if (def.food || def.heal || def.mana) return core.send({ kind: 'useItem', id: i.id });
  if (i.parent === eq) { const t = packTarget(); if (!t) return statusLine('Your pack is full.'); return move(i, t.parent, t.slot); }
  if (def.slot) return move(i, eq, equipSlots.indexOf(def.slot));
  statusLine(`${def.name} sells to a merchant.`);
}
/** What looking at each kind of item said, so its tooltip can carry the description after the first look. */
const looks = new Map<ItemKind, string>();
let looking: { kind: ItemKind; at: number } | undefined;
export function lookAt(i: GameItem) { const s = core.view?.self; if (!s) return; looking = { kind: i.kind, at: performance.now() }; core.send({ kind: 'look', at: { x: s.x, y: s.y, z: s.z }, item: i.id }); }
/** An information line just came back: if it answers a look at an item, remember it. */
export function heardInfo(text: string) { if (looking && performance.now() - looking.at < 2000) { looks.set(looking.kind, text); looking = undefined; } }

export function itemMenu(i: GameItem, from?: string): Menu | undefined {
  const v = core.view; if (!v) return;
  const main = primaryLabel(i), mine = isCarried(v, i.id), entries: Entry[] = [];
  const now = () => findItem(core.view, i.id);
  entries.push({ label: 'Look', hint: 'Shift+click', run: () => { const n = now(); if (n) lookAt(n); } });
  if (main) entries.push({ label: main, hint: 'Double-click', sep: true, run: () => { const n = now(); if (n) primary(n, from); } });
  if (isContainer(i.kind) && from) entries.push({ label: 'Open in new window', run: () => openContainer({ kind: 'item', id: i.id }) });
  const holder = findItem(v, i.parent);
  if (holder && findItem(v, holder.parent) && isContainer(holder.kind)) entries.push({ label: 'Move up', run: () => { const n = now(), up = findItem(core.view, holder.parent); if (n && up) { const t = intoContainer(up.id, n); if (t) move(n, t.parent, t.slot); else statusLine('There is no room there.'); } } });
  if (mine) entries.push({ label: 'Drop', run: () => { const n = now(), s = core.view?.self; if (n && s) move(n, groundKey(s), 0); } });
  return { title: `${itemDef(i.kind).name}${i.count > 1 ? ` × ${i.count}` : ''}`, entries, alive: () => !!now() };
}

export function describe(i: GameItem) {
  const d = itemDef(i.kind), bits: string[] = [];
  if (d.attack) bits.push(`Attack ${d.attack}`); if (d.defense) bits.push(`Defence ${d.defense}`); if (d.armor) bits.push(`Armour ${d.armor}`);
  if (d.slots) bits.push(`${d.slots} slots`); if (d.heal) bits.push(`Restores about ${d.heal} health`); if (d.mana) bits.push(`Restores about ${d.mana} mana`); if (d.food) bits.push(`Feeds ${Math.round(d.food / 60000)} min`);
  if (d.light) bits.push(`Light ${d.light}`);
  const use = primaryLabel(i), mine = core.view && isCarried(core.view, i.id);
  const how = use ? `${mine ? 'Double-click' : 'Click'} to ${use.toLowerCase()}. Right-click for more.` : 'Right-click for more.';
  const seen = looks.get(i.kind);
  return `<b>${esc(d.name)}${i.count > 1 ? ` × ${i.count}` : ''}</b>${seen ? `<span class="tip-look">${esc(seen)}</span>` : ''}${bits.length ? `<span>${bits.join(' · ')}</span>` : ''}<span class="tip-row"><span>${(d.weight * i.count).toFixed(1)} oz</span>${d.sell ? `<span class="gold">${d.sell} gold each</span>` : ''}</span><span class="tip-how">${how}</span>`;
}

// ---------------------------------------------------------------- selection and clicks
/** In the pack and on the doll one click selects and a second soon after uses; loot, vault and floor take on one click. */
let selected: string | undefined;
let last = { id: '', at: 0 };
export function markSelected() {
  if (selected && !findItem(core.view, selected)) selected = undefined;
  for (const b of document.querySelectorAll<HTMLElement>('.item[data-id]')) b.classList.toggle('selected', b.dataset.id === selected);
}
function itemClick(i: GameItem, el: HTMLElement, shift: boolean) {
  closeTip();
  if (shift) return lookAt(i);
  const now = performance.now(), twice = last.id === i.id && now - last.at < 400;
  last = twice ? { id: '', at: 0 } : { id: i.id, at: now };
  if (!isCarried(core.view!, i.id) || twice) { primary(i, windowOf(el)); return; }
  selected = i.id; markSelected();
}
const itemOf = (t: EventTarget | null) => { const b = (t as HTMLElement | null)?.closest?.<HTMLElement>('.item[data-id]'); const i = b && findItem(core.view, b.dataset.id!); return i ? { b, i } : undefined; };
document.addEventListener('click', e => { const x = itemOf(e.target); if (!x || dragSuppressesClick()) return; itemClick(x.i, x.b, e.shiftKey); });
document.addEventListener('pointerdown', e => { const x = itemOf(e.target); if (x && e.button === 0) dragItem(e, x.i); });
document.addEventListener('pointerover', e => { const x = itemOf(e.target); if (x && !document.body.classList.contains('dragging')) showTip(x.b, describe(x.i)); });
document.addEventListener('pointerout', e => { if (itemOf(e.target) && !itemOf(e.relatedTarget)) closeTip(); });
document.addEventListener('contextmenu', e => {
  const x = itemOf(e.target); if (!x) return;
  e.preventDefault();
  const m = itemMenu(x.i, windowOf(x.b)); if (m) openMenu(e.clientX, e.clientY, m);
});
