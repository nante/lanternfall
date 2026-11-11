// One tooltip for the whole HUD: item cells, hotbar slots, status icons, and names under the pointer in the world.
// Placed on the UI grid, above its anchor, kept inside the window.
import { snap } from './kit.ts';

const el = Object.assign(document.createElement('div'), { className: 'tooltip', id: 'tooltip' });
el.setAttribute('role', 'tooltip');
document.body.append(el);
let shownAt = 0;
/** The element the tooltip describes; it closes when that element leaves the page or its item goes away. */
let anchor: HTMLElement | undefined;

export function showTip(a: HTMLElement, html: string) {
  anchor = a;
  el.innerHTML = html;
  el.dataset.show = 'true';
  delete el.dataset.world;
  // Moving from one cell to the next shows at once; the first one waits a moment (CSS delay).
  el.dataset.instant = String(performance.now() - shownAt < 400);
  const r = a.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
  el.style.left = `${snap(Math.min(innerWidth - w - 4, Math.max(4, r.left + r.width / 2 - w / 2)))}px`;
  const above = r.top - h - 6;
  el.style.top = `${snap(above >= 4 ? above : r.bottom + 6)}px`;
  shownAt = performance.now();
}
export function closeTip() { if (el.dataset.show) shownAt = performance.now(); delete el.dataset.show; anchor = undefined; }
/** Drops the tooltip when what it points at is gone (called on every update). */
export function checkTip(alive: (a: HTMLElement) => boolean) { if (anchor && (!anchor.isConnected || !alive(anchor))) closeTip(); }
/** A name under the pointer in the world: beside the pointer, no delay. */
export function worldTip(html: string | undefined, x: number, y: number) {
  if (!html) { if (el.dataset.world) { delete el.dataset.show; delete el.dataset.world; } return; }
  if (anchor) return;
  el.innerHTML = html; el.dataset.show = 'true'; el.dataset.world = 'true'; el.dataset.instant = 'true';
  el.style.left = `${snap(Math.min(innerWidth - el.offsetWidth - 4, x + 14))}px`; el.style.top = `${snap(y + 14)}px`;
}
