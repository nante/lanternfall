// The context menu: right-click on the world, an item, or a battle-list row. Most likely action first; each entry may
// show its shortcut. Keyboard: arrows, Home, End, Enter, Escape; keys it uses never reach the world.
import { esc, snap } from './kit.ts';
import { closeTip } from './tooltip.ts';

export type Entry = { label: string; run: () => void; hint?: string; sep?: boolean };
/** `alive` is asked on every update; the menu closes once what it was opened on is gone. */
export type Menu = { title: string; entries: Entry[]; alive: () => boolean };

const el = Object.assign(document.createElement('div'), { className: 'ctx frame', hidden: true });
el.setAttribute('role', 'menu');
document.body.append(el);
let open: Menu | undefined;
let returnTo: HTMLElement | null = null;
export const menuOpen = () => !el.hidden;
export const menuEl = el;
/** What gets focus back when the menu closes over the world. */
let worldFocus: () => void = () => {};
export function setWorldFocus(f: () => void) { worldFocus = f; }

export function openMenu(x: number, y: number, m: Menu) {
  closeTip();
  returnTo = document.activeElement as HTMLElement | null;
  el.setAttribute('aria-label', m.title);
  el.innerHTML = `<p class="ctx-title" aria-hidden="true">${esc(m.title)}</p>${m.entries.map((en, i) => `${en.sep ? '<hr>' : ''}<button type="button" role="menuitem" tabindex="-1" data-i="${i}"><span>${esc(en.label)}</span>${en.hint ? `<kbd>${esc(en.hint)}</kbd>` : ''}</button>`).join('')}`;
  el.hidden = false; open = m;
  const w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${snap(Math.max(4, Math.min(innerWidth - w - 4, x)))}px`;
  el.style.top = `${snap(Math.max(4, Math.min(innerHeight - h - 4, y)))}px`;
  el.querySelector<HTMLElement>('[data-i]')?.focus({ preventScroll: true });
}
export function closeMenu() {
  if (el.hidden) return;
  const back = el.contains(document.activeElement) ? returnTo : null;
  el.hidden = true; el.innerHTML = ''; open = undefined;
  if (back?.isConnected && back !== document.body) back.focus({ preventScroll: true }); else if (back) worldFocus();
}
export function checkMenu() { if (open && !open.alive()) closeMenu(); }

el.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
  const en = b && open?.entries[Number(b.dataset.i)];
  if (!en) return;
  closeMenu(); en.run();
});
el.addEventListener('pointermove', e => (e.target as HTMLElement).closest<HTMLElement>('[data-i]')?.focus({ preventScroll: true }));
el.addEventListener('keydown', e => {
  const items = [...el.querySelectorAll<HTMLElement>('[data-i]')], i = items.indexOf(document.activeElement as HTMLElement);
  const go = (n: number) => { e.preventDefault(); items[(n + items.length) % items.length]?.focus(); };
  if (e.key === 'ArrowDown') go(i + 1);
  else if (e.key === 'ArrowUp') go(i - 1);
  else if (e.key === 'Home') go(0);
  else if (e.key === 'End') go(items.length - 1);
  else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeMenu(); }
  else if (e.key !== 'Enter' && e.key !== ' ') return;
  // Arrows would walk, Escape would stop or pause, Space would target.
  e.stopPropagation();
});
document.addEventListener('pointerdown', e => { if (!el.hidden && !el.contains(e.target as Node)) closeMenu(); }, true);
addEventListener('blur', closeMenu);
addEventListener('resize', closeMenu);
