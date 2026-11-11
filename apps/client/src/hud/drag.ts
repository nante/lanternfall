// Dragging: items between slots, windows and the world, and pushing what stands beside you. A press becomes a drag
// after 4 pixels of movement; until then it is a click. While an item is dragged, slots that could take it light up.
// Dropping a stack asks how many (the whole stack by default); Ctrl drops all of it and Shift exactly one, unasked.
import { equipSlots, type GameItem, type Pos } from '../../../../packages/game/src/model.ts';
import { icon } from '../icons.ts';
import { core, distance, equipKey, findItem, groundKey, itemDef, same } from './core.ts';
import { esc, grid, snap } from './kit.ts';
import { closeTip } from './tooltip.ts';
import { closeMenu } from './menu.ts';
import { statusLine } from './overlay.ts';
import { intoContainer, move } from './items.ts';

let suppress = 0;
/** True for the click that ends a drag, so dropping an item does not also select or use it. */
export const dragSuppressesClick = () => performance.now() - suppress < 50;

type Drag = { ghost: string; item?: GameItem; click?: () => void; drop: (ev: PointerEvent) => void };
/** Follow the pointer with a ghost once it has moved; release runs `drop`, or `click` if it never moved. */
export function dragFrom(e: PointerEvent, d: Drag) {
  const start = { x: e.clientX, y: e.clientY }, pointer = e.pointerId;
  let ghost: HTMLElement | null = null, over: HTMLElement | null = null;
  const move_ = (ev: PointerEvent) => {
    if (ev.pointerId !== pointer || (!ghost && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4)) return;
    if (!ghost) {
      ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.innerHTML = d.ghost; document.body.append(ghost);
      document.body.classList.add('dragging'); closeTip(); closeMenu();
      if (d.item) light(d.item);
    }
    ghost.style.transform = `translate(${snap(ev.clientX - 10 * grid.u)}px, ${snap(ev.clientY - 10 * grid.u)}px)`;
    const cell = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>('.cell, [data-drop]') ?? null;
    if (cell !== over) { over?.classList.remove('drop-over'); over = cell; over?.classList.add('drop-over'); }
  };
  const end = (ev: PointerEvent) => {
    if (ev.pointerId !== pointer) return;
    removeEventListener('pointermove', move_); removeEventListener('pointerup', end); removeEventListener('pointercancel', end); removeEventListener('keydown', esc_, true);
    over?.classList.remove('drop-over');
    const g = ghost; ghost = null;
    if (!g) { if (ev.type === 'pointerup') d.click?.(); return; }
    g.remove(); unlight(); document.body.classList.remove('dragging');
    suppress = performance.now();
    if (ev.type === 'pointerup') d.drop(ev);
  };
  const esc_ = (ev: KeyboardEvent) => { if (ev.key === 'Escape' && ghost) { ev.stopImmediatePropagation(); ghost.remove(); ghost = null; unlight(); document.body.classList.remove('dragging'); over?.classList.remove('drop-over'); } };
  addEventListener('pointermove', move_); addEventListener('pointerup', end); addEventListener('pointercancel', end); addEventListener('keydown', esc_, true);
}

/** Slots that could take the item: its own slot on the doll, any container slot that is not the item or inside it. */
function light(item: GameItem) {
  const v = core.view!, def = itemDef(item.kind);
  const inside = (parent: string) => { for (let p = parent, n = 0; n < 8; n++) { if (p === item.id) return true; const up = findItem(v, p); if (!up) return false; p = up.parent; } return false; };
  for (const c of document.querySelectorAll<HTMLElement>('.cell')) {
    const parent = c.dataset.parent!, slot = Number(c.dataset.slot);
    const ok = parent === equipKey(v) ? def.slot === equipSlots[slot] : !inside(parent);
    c.classList.toggle('drop-ok', ok); c.classList.toggle('drop-no', !ok);
  }
}
function unlight() { for (const c of document.querySelectorAll('.drop-ok, .drop-no')) c.classList.remove('drop-ok', 'drop-no'); }

const canvas = () => core.world.renderer.domElement;
/** A dragged item from a slot or the floor. */
export function dragItem(e: PointerEvent, i: GameItem, click?: () => void) {
  dragFrom(e, { ghost: `${icon(itemDef(i.kind).icon)}${i.count > 1 ? `<span class="n num">${i.count}</span>` : ''}`, item: i, click, drop: ev => dropItem(i.id, ev) });
}
export const ghostLabel = (name: string) => `<span class="ghost-name">${esc(name)}</span>`;

function dropItem(id: string, ev: PointerEvent) {
  const v = core.view, i = findItem(v, id);
  if (!v || !i) return;
  const under = document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null;
  let to: { parent: string; slot: number } | undefined;
  const cell = under?.closest<HTMLElement>('.cell'), box = under?.closest<HTMLElement>('[data-drop]');
  if (cell) to = { parent: cell.dataset.parent!, slot: Number(cell.dataset.slot) };
  else if (box) { to = intoContainer(box.dataset.drop!, i); if (!to) return statusLine('There is no room there.'); }
  else if (under?.closest('.k-gear')) { const def = itemDef(i.kind); to = def.slot ? { parent: equipKey(v), slot: equipSlots.indexOf(def.slot) } : undefined; if (!to) return statusLine('That is not worn.'); }
  else if (under === canvas()) {
    const tile = core.world.tileAtPoint(ev.clientX, ev.clientY);
    if (!tile) return;
    if (distance(v.self, tile) > 7) return statusLine('That is too far away to throw.');
    to = { parent: groundKey(tile), slot: 0 };
  }
  if (!to || (to.parent === i.parent && to.slot === i.slot)) return;
  const target = to;
  if (i.count < 2) return move(i, target.parent, target.slot);
  if (ev.ctrlKey || ev.metaKey) return move(i, target.parent, target.slot);
  if (ev.shiftKey) return move(i, target.parent, target.slot, 1);
  askCount(i, ev.clientX, ev.clientY).then(n => { const now = findItem(core.view, id); if (n && now) move(now, target.parent, target.slot, Math.min(n, now.count)); });
}

/** A dragged creature, hero or body dropped on a neighbouring tile: the server decides whether it moves. */
export function pushTo(id: string, from: Pos, ev: PointerEvent) {
  if (document.elementFromPoint(ev.clientX, ev.clientY) !== canvas()) return;
  const to = core.world.tileAtPoint(ev.clientX, ev.clientY);
  if (!to || same(to, from)) return;
  if (distance(from, to) > 1) return statusLine('Push it to a tile next to it.');
  core.send({ kind: 'push', id, to });
}

// ---------------------------------------------------------------- how many?
const dlg = Object.assign(document.createElement('div'), { className: 'count frame', hidden: true });
dlg.setAttribute('role', 'dialog');
dlg.setAttribute('aria-label', 'How many');
document.body.append(dlg);
let settle: ((n: number | null) => void) | undefined;
export const countOpen = () => !dlg.hidden;
/** Up and down change by one, Page Up and Down by ten, Home is all, End is one; digits type; Enter moves, Escape cancels. */
function askCount(i: GameItem, x: number, y: number): Promise<number | null> {
  settle?.(null);
  const max = i.count, def = itemDef(i.kind);
  dlg.innerHTML = `<header class="w-head"><h2>Move how many?</h2></header>
    <div class="count-body"><span class="cell"><span class="item">${icon(def.icon)}</span></span><span class="count-name">${esc(def.name)}</span>
    <input type="range" min="1" max="${max}" value="${max}" aria-label="Amount"><input type="number" class="field num" min="1" max="${max}" value="${max}" aria-label="Amount, typed"></div>
    <div class="w-foot"><button type="button" class="btn" data-c="cancel">Cancel</button><button type="button" class="btn primary" data-c="ok">Move <span class="num" data-n>${max}</span></button></div>`;
  dlg.hidden = false;
  const range = dlg.querySelector<HTMLInputElement>('input[type=range]')!, num = dlg.querySelector<HTMLInputElement>('input[type=number]')!;
  const set = (n: number) => { const v = Math.max(1, Math.min(max, Math.round(n) || 1)); range.value = num.value = String(v); dlg.querySelector('[data-n]')!.textContent = String(v); };
  range.oninput = () => set(Number(range.value));
  num.oninput = () => { if (num.value) set(Number(num.value)); };
  const w = dlg.offsetWidth, h = dlg.offsetHeight;
  dlg.style.left = `${snap(Math.max(4, Math.min(innerWidth - w - 4, x - w / 2)))}px`;
  dlg.style.top = `${snap(Math.max(4, Math.min(innerHeight - h - 4, y - h - 8 * grid.u)))}px`;
  num.focus(); num.select();
  return new Promise(resolve => {
    settle = n => { settle = undefined; dlg.hidden = true; dlg.onkeydown = null; resolve(n); core.world.renderer.domElement.focus({ preventScroll: true }); };
    dlg.onclick = e => { const c = (e.target as HTMLElement).closest<HTMLElement>('[data-c]')?.dataset.c; if (c) settle?.(c === 'ok' ? Number(range.value) : null); };
    dlg.onkeydown = e => {
      const n = Number(range.value), keys: Record<string, number> = { ArrowUp: n + 1, ArrowRight: n + 1, ArrowDown: n - 1, ArrowLeft: n - 1, PageUp: n + 10, PageDown: n - 10, Home: max, End: 1 };
      if (e.key in keys) { e.preventDefault(); set(keys[e.key]); }
      else if (e.key === 'Enter') { e.preventDefault(); settle?.(Number(range.value)); }
      else if (e.key === 'Escape') { e.preventDefault(); settle?.(null); }
      e.stopPropagation();
    };
  });
}
document.addEventListener('pointerdown', e => { if (!dlg.hidden && !dlg.contains(e.target as Node)) settle?.(null); }, true);
