// What is written over the world: speech over heads, floating numbers, the look line above the middle of the view,
// status lines at its bottom, the place banner, and the perspective picker. All in the pixel font, on the UI grid.
import type { Effect, Notice } from '../../../../packages/game/src/model.ts';
import { stops, stopIds, isStopId } from '../render/stops.ts';
import { core } from './core.ts';
import { $, esc, grid, patch, reduceMotion, snap } from './kit.ts';

export function mountOverlay(viewport: HTMLElement) {
  viewport.insertAdjacentHTML('beforeend', `
    <div class="place" id="place" aria-live="polite"><div class="banner"><span id="place-name"></span></div><small id="place-sub"></small></div>
    <p class="look-line" id="look-line" aria-live="polite"></p>
    <div class="status-lines" id="status-lines" role="status"></div>
    <div class="views" id="views" role="group" aria-label="View"></div>`);
  $('#views').addEventListener('click', e => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-stop]')?.dataset.stop;
    if (id && isStopId(id)) { core.world.setStop(id); core.world.renderer.domElement.focus({ preventScroll: true }); }
  });
}

/** The perspective buttons, top right of the view. */
export function drawViews() {
  const w = core.world;
  patch($('#views'), stopIds.map(id => `<button type="button" class="btn" data-stop="${id}" aria-pressed="${w.stop.id === id}"${stops[id].vista && !w.canScenery() ? ' disabled title="Needs open sky"' : ''}>${esc(stops[id].label)}</button>`).join(''));
}

// ---------------------------------------------------------------- lines over the view
let lookTimer = 0;
/** A look result or other information, centred above the middle of the view; a new one replaces the old. */
export function lookLine(text: string) {
  const el = $('#look-line');
  el.textContent = text; el.dataset.show = 'true';
  clearTimeout(lookTimer); lookTimer = window.setTimeout(() => { delete el.dataset.show; }, 3000 + text.length * 40);
}
/** A status line at the bottom of the view: refusals, warnings, what hurt you. Up to three stack, newest at the bottom. */
export function statusLine(text: string, kind: 'status' | 'warn' = 'status') {
  const box = $('#status-lines');
  const last = box.lastElementChild as HTMLElement | null;
  if (last?.textContent === text) { last.dataset.until = String(performance.now() + 5000); return; }
  const p = document.createElement('p');
  p.className = kind; p.textContent = text; p.dataset.until = String(performance.now() + 5000);
  box.append(p);
  while (box.children.length > 3) box.firstElementChild!.remove();
}
setInterval(() => { const box = document.getElementById('status-lines'); if (!box) return; for (const p of [...box.children] as HTMLElement[]) if (Number(p.dataset.until) < performance.now()) p.remove(); }, 250);

let placeTimer = 0;
export function announce(name: string, sub: string, quiet: boolean) {
  $('#place-name').textContent = name; $('#place-sub').textContent = sub;
  if (quiet) return;
  const el = $('#place');
  el.dataset.show = 'true';
  clearTimeout(placeTimer); placeTimer = window.setTimeout(() => { delete el.dataset.show; }, 2600);
}

// ---------------------------------------------------------------- speech over heads
type Box = { from: string; el: HTMLElement; until: number; lines: number };
const boxes: Box[] = [];
let loop = 0;
/** Speech over the speaker: the name, then the words. More from the same speaker joins their open box. */
export function speak(from: string, name: string, words: string, kind: Notice['kind']) {
  const life = 3000 + 50 * words.length;
  const open = boxes.find(b => b.from === from && b.lines < 10);
  if (open) {
    open.el.insertAdjacentHTML('beforeend', `<span class="words">${esc(words)}</span>`);
    open.until = performance.now() + life; open.lines++;
  } else {
    const el = document.createElement('div');
    el.className = `bubble ${kind}`;
    el.innerHTML = `${name ? `<b>${esc(name)}</b>` : ''}<span class="words">${esc(words)}</span>`;
    $('#labels').append(el);
    boxes.push({ from, el, until: performance.now() + life, lines: 1 });
    while (boxes.length > 10) boxes.shift()!.el.remove();
  }
  if (!loop) loop = requestAnimationFrame(placeBoxes);
}
function placeBoxes() {
  const now = performance.now(), vp = $('#viewport').getBoundingClientRect();
  for (let i = boxes.length - 1; i >= 0; i--) if (boxes[i].until <= now) { boxes[i].el.remove(); boxes.splice(i, 1); }
  for (const b of boxes) {
    const at = core.world.actors.overHead(b.from);
    b.el.style.visibility = at?.shown ? 'visible' : 'hidden';
    if (!at) continue;
    const w = b.el.offsetWidth, h = b.el.offsetHeight;
    // Centred over the head, kept inside the view, on whole UI pixels.
    const x = Math.max(vp.left + 4, Math.min(vp.right - w - 4, at.x - w / 2)), y = Math.max(vp.top + 4, at.y - 10 * grid.u - h);
    b.el.style.transform = `translate3d(${snap(x)}px, ${snap(y)}px, 0)`;
  }
  loop = boxes.length ? requestAnimationFrame(placeBoxes) : 0;
}

// ---------------------------------------------------------------- floating numbers
/** Damage, healing and experience rise 20 UI pixels in ten steps over a second, as numbers did in the classic client. */
export function floatText(x: number, y: number, text: string, kind: string) {
  const el = document.createElement('span');
  el.className = `float ${kind}`; el.textContent = text;
  $('#fx').append(el);
  const left = snap(x - el.offsetWidth / 2), top = snap(y);
  el.style.transform = `translate(${left}px, ${top}px)`;
  const rise = (kind === 'level' ? 30 : 20) * grid.u;
  const anim = el.animate(reduceMotion.matches
    ? [{ opacity: 1 }, { opacity: 1, offset: 0.7 }, { opacity: 0 }]
    : [{ transform: `translate(${left}px, ${top}px)` }, { transform: `translate(${left}px, ${top - rise}px)` }],
    { duration: kind === 'level' ? 2000 : 1000, easing: 'steps(10, end)', fill: 'forwards' });
  anim.onfinish = () => el.remove();
}
const effectText: Record<Effect['kind'], [string, string] | undefined> = {
  hit: ['', 'hit'], miss: ['miss', 'miss'], block: ['blocked', 'miss'], heal: ['+', 'heal'], mana: ['+', 'mana'],
  ember: ['', 'ember'], burst: undefined, xp: ['+', 'xp'], level: undefined,
};
export function onEffect(e: Effect, p: { x: number; y: number }) {
  const t = effectText[e.kind];
  if (!t) return;
  const text = e.kind === 'miss' || e.kind === 'block' ? t[0] : `${t[0]}${e.value}${e.kind === 'xp' ? ' xp' : ''}`;
  floatText(p.x + (Math.random() - 0.5) * 12 * grid.u, p.y - (e.kind === 'xp' ? 12 * grid.u : 0), text, t[1]);
}
