// The frame around the game view: one or two columns of stacked windows and the console under the view. Three
// arrangements (picked in the Studio's Look tab) place the same windows. Container windows come and go at a marker in
// the column; fixed windows can be reordered by dragging their header (or arrow keys on its icon), collapsed, and made
// taller or shorter by their bottom edge. The arrangement is saved per layout in this browser.
//
// Keyed: windows are created once and moved, never rebuilt, so a window being dragged from or scrolled keeps its DOM.
import type { ChromeLayout } from '../../../../packages/game/src/content-schema.ts';
import { art, esc, glyph, grid } from './kit.ts';

export type WinSpec = {
  id: string; title: string; icon: string;
  /** Draws the body; called on every update while the window is open (patch inside, so unchanged markup costs nothing). */
  render: (body: HTMLElement) => void;
  close?: () => void; back?: () => void;
  /** Fixed windows keep their height when the column is short; the rest shrink to a row and scroll. */
  fixed?: boolean;
  /** Extra class on the window (its kind, for styling). */
  kind?: string;
};
type Layout = Record<string, string[]>;
type Saved = { layouts: Partial<Record<ChromeLayout, Layout>>; heights: Record<string, number>; collapsed: string[]; foot: Partial<Record<ChromeLayout, number>> };
const BAGS = '@bags';
const KEY = 'lanternfall.column.v2';
const zoneNames: Record<string, string> = { side: 'side column', left: 'left column', right: 'right column' };
const FOOT = { min: 64, max: 240, def: 104 };

export class Column {
  id: ChromeLayout = 'classic';
  private layouts: Record<ChromeLayout, Layout>;
  private heights: Record<string, number>;
  private foot: Partial<Record<ChromeLayout, number>>;
  private collapsed: Set<string>;
  private wins = new Map<string, { el: HTMLElement; body: HTMLElement; spec: WinSpec; head: string }>();
  private built = '';
  private dynamic: WinSpec[] = [];
  private announcer: HTMLElement;
  private drag: null | { id: string; el: HTMLElement; ph?: HTMLElement; x: number; y: number; pointer: number } = null;
  private resize: null | { kind: 'panel' | 'foot'; id: string; start: number; from: number; pointer: number } = null;

  constructor(private o: { root: HTMLElement; viewport: HTMLElement; footer: HTMLElement; labels: HTMLElement; statics: Record<string, WinSpec | (() => WinSpec)>; defaults: Record<ChromeLayout, Layout>; collapsedByDefault: string[]; onViewportResize: () => void; canDraw: () => boolean }) {
    const saved = this.read();
    const ids = Object.keys(o.defaults) as ChromeLayout[];
    const all = (l: Layout) => Object.values(l).flat().sort().join();
    this.layouts = Object.fromEntries(ids.map(v => { const s = saved.layouts?.[v]; return [v, s && all(s) === all(o.defaults[v]) && Object.keys(s).join() === Object.keys(o.defaults[v]).join() ? s : structuredClone(o.defaults[v])]; })) as Record<ChromeLayout, Layout>;
    this.heights = { ...saved.heights };
    this.foot = { ...saved.foot };
    this.collapsed = new Set(saved.collapsed ?? o.collapsedByDefault);
    this.announcer = Object.assign(document.createElement('p'), { className: 'sr-only' });
    this.announcer.setAttribute('aria-live', 'polite');
    document.body.append(this.announcer, Object.assign(document.createElement('p'), { className: 'sr-only', id: 'w-move-help', textContent: 'Drag the header to move this window, or use the arrow keys: up and down to reorder, left and right to change columns.' }));
    this.wire();
    addEventListener('resize', () => this.place());
    this.o.root.addEventListener('scroll', () => this.place(), true);
    addEventListener('hud-scale', () => { this.built = ''; this.render(); this.o.onViewportResize(); });
  }

  private read(): Partial<Saved> { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } }
  private persist() { try { localStorage.setItem(KEY, JSON.stringify({ layouts: this.layouts, heights: this.heights, collapsed: [...this.collapsed], foot: this.foot } satisfies Saved)); } catch { /* not saved: the arrangement lasts this session */ } }
  private say(text: string) { this.announcer.textContent = text; }

  setLayout(id: ChromeLayout) { if (id === this.id && this.built) return; this.id = id; this.built = ''; this.render(); this.o.onViewportResize(); }
  isOpen(id: string) { return !this.collapsed.has(id) && (id in this.o.statics || this.dynamic.some(d => d.id === id)); }
  toggle(id: string) { if (this.collapsed.has(id)) this.collapsed.delete(id); else this.collapsed.add(id); this.persist(); this.render(); this.o.onViewportResize(); }
  reset() { this.layouts[this.id] = structuredClone(this.o.defaults[this.id]); this.heights = {}; this.foot = {}; this.collapsed = new Set(this.o.collapsedByDefault); this.persist(); this.built = ''; this.render(); this.say('Window layout reset.'); }
  setDynamic(list: WinSpec[]) { this.dynamic = list; }
  /** The window element for an id, if shown. */
  win(id: string) { return this.wins.get(id)?.el; }

  render() {
    const L = this.layouts[this.id], root = this.o.root;
    const skeleton = `${this.id}|${Object.keys(L).join()}`;
    if (skeleton !== this.built) {
      this.built = skeleton;
      root.className = `chrome v-${this.id}`;
      const zone = (z: string) => `<aside class="zone" data-zone="${z}" aria-label="${zoneNames[z]}"></aside>`;
      const zones = Object.keys(L);
      root.innerHTML = (this.id === 'rails' ? `${zone(zones[0])}<div data-mount="viewport"></div>${zone(zones[1])}` : `<div data-mount="viewport"></div>${zones.map(zone).join('')}`)
        + '<div data-mount="footer"></div><div class="split" data-split="foot" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Resize the console"></div>';
      root.querySelector('[data-mount="viewport"]')!.replaceWith(this.o.viewport);
      root.querySelector('[data-mount="footer"]')!.replaceWith(this.o.footer);
      for (const w of this.wins.values()) w.el.remove();
    }
    root.style.setProperty('--foot', String(this.foot[this.id] ?? FOOT.def));
    const specs = new Map<string, WinSpec>([...Object.entries(this.o.statics).map(([k, v]) => [k, typeof v === 'function' ? v() : v] as const), ...this.dynamic.map(d => [d.id, d] as const)]);
    for (const [z, list] of Object.entries(L)) {
      const zoneEl = root.querySelector<HTMLElement>(`.zone[data-zone="${z}"]`)!;
      const order = list.flatMap(id => (id === BAGS ? this.dynamic.map(d => d.id) : [id]));
      let prev: Element | null = null;
      for (const id of order) {
        const el = this.ensure(specs.get(id)!);
        if (this.drag?.id === id && this.drag.ph) { prev = this.drag.ph; continue; }
        const want: Element | null = prev ? prev.nextElementSibling : zoneEl.firstElementChild;
        if (want !== el || el.parentElement !== zoneEl) { if (prev) prev.after(el); else zoneEl.prepend(el); }
        prev = el;
      }
    }
    for (const [id, w] of this.wins) if (!specs.has(id)) { w.el.remove(); this.wins.delete(id); }
    if (this.o.canDraw()) for (const w of this.wins.values()) if (!this.collapsed.has(w.spec.id)) w.spec.render(w.body);
    this.place();
  }

  /** The window's shell: header, body, bottom edge. Its header is redrawn only when its title or buttons change. */
  private ensure(spec: WinSpec) {
    let w = this.wins.get(spec.id);
    const shut = this.collapsed.has(spec.id), h = this.heights[spec.id];
    const head = `<button type="button" class="w-grip" data-grip="${spec.id}" aria-label="Move ${esc(spec.title)}" aria-describedby="w-move-help">${art(spec.icon)}</button><h2>${esc(spec.title)}</h2>`
      + (spec.back ? `<button type="button" class="ibtn" data-w="back" aria-label="Back up to the container this one is in">${glyph('back')}</button>` : '')
      + `<button type="button" class="ibtn" data-w="collapse" aria-expanded="${!shut}" aria-label="${shut ? 'Expand' : 'Collapse'} ${esc(spec.title)}">${glyph(shut ? 'chev-down' : 'chev-up')}</button>`
      + (spec.close ? `<button type="button" class="ibtn" data-w="close" aria-label="Close ${esc(spec.title)}">${glyph('close')}</button>` : '');
    if (!w) {
      const el = document.createElement('section');
      el.innerHTML = `<header class="w-head"></header><div class="w-body"></div><div class="w-edge" data-resize="${spec.id}" role="separator" aria-orientation="horizontal" tabindex="-1" aria-label="Resize ${esc(spec.title)}"></div>`;
      w = { el, body: el.querySelector('.w-body')!, spec, head: '' };
      this.wins.set(spec.id, w);
    }
    w.spec = spec;
    w.el.className = `win frame${shut ? ' collapsed' : ''}${spec.fixed ? ' fixed' : ''}${spec.kind ? ` k-${spec.kind}` : ''}`;
    w.el.dataset.win = spec.id;
    w.el.setAttribute('aria-label', spec.title);
    if (w.head !== head) { w.head = head; w.el.querySelector('.w-head')!.innerHTML = head; }
    w.body.style.height = h && !shut ? `calc(${h} * var(--u))` : '';
    w.body.classList.toggle('sized', !!h);
    return w.el;
  }

  /** Clip world labels to the view, and set the console splitter over the console's top edge. */
  private place() {
    for (const z of this.o.root.querySelectorAll<HTMLElement>('.zone')) z.toggleAttribute('data-more', z.scrollTop + z.clientHeight < z.scrollHeight - 2);
    const vr = this.o.viewport.getBoundingClientRect();
    const clip = `inset(${vr.top}px ${innerWidth - vr.right}px ${innerHeight - vr.bottom}px ${vr.left}px)`;
    this.o.labels.style.clipPath = clip;
    const fx = document.getElementById('fx'); if (fx) fx.style.clipPath = clip;
    const split = this.o.root.querySelector<HTMLElement>('.split'), fr = this.o.footer.getBoundingClientRect();
    if (split) Object.assign(split.style, { left: `${fr.left}px`, width: `${fr.width}px`, top: `${fr.top - 3 * grid.u}px` });
  }

  private place_(id: string, z: string, index: number) {
    const L = this.layouts[this.id];
    for (const list of Object.values(L)) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); }
    L[z].splice(Math.max(0, Math.min(index, L[z].length)), 0, id);
    this.say(`${this.wins.get(id)?.spec.title ?? id} moved to position ${L[z].indexOf(id) + 1} of ${L[z].length}.`);
  }

  private wire() {
    const root = this.o.root;
    root.addEventListener('click', ev => {
      const b = (ev.target as HTMLElement).closest<HTMLElement>('[data-w]'), win = b?.closest<HTMLElement>('.win');
      const w = win && this.wins.get(win.dataset.win!);
      if (!b || !w) return;
      if (b.dataset.w === 'collapse') { this.toggle(w.spec.id); this.wins.get(w.spec.id)?.el.querySelector<HTMLElement>('[data-w="collapse"]')?.focus(); }
      else if (b.dataset.w === 'close') w.spec.close?.();
      else if (b.dataset.w === 'back') w.spec.back?.();
    });
    root.addEventListener('dblclick', ev => {
      const t = ev.target as HTMLElement;
      if (t.closest('[data-resize]')) { const id = t.closest<HTMLElement>('[data-resize]')!.dataset.resize!; delete this.heights[id]; this.persist(); this.render(); return; }
      if (t.closest('[data-split]')) { delete this.foot[this.id]; this.persist(); this.render(); this.o.onViewportResize(); }
    });
    root.addEventListener('keydown', ev => {
      const g = (ev.target as HTMLElement).closest<HTMLElement>('[data-grip]');
      if (!g || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key) || !(g.dataset.grip! in this.o.statics)) return;
      ev.preventDefault(); ev.stopPropagation();
      const id = g.dataset.grip!, L = this.layouts[this.id], zs = Object.keys(L), zi = zs.findIndex(z => L[z].includes(id)), i = L[zs[zi]].indexOf(id);
      if (ev.key === 'ArrowUp' && i > 0) this.place_(id, zs[zi], i - 1);
      else if (ev.key === 'ArrowDown' && i < L[zs[zi]].length - 1) this.place_(id, zs[zi], i + 1);
      else if (ev.key === 'ArrowLeft' && zi > 0) this.place_(id, zs[zi - 1], i);
      else if (ev.key === 'ArrowRight' && zi < zs.length - 1) this.place_(id, zs[zi + 1], i);
      else return;
      this.persist(); this.render(); this.o.onViewportResize();
      this.wins.get(id)?.el.querySelector<HTMLElement>('[data-grip]')?.focus();
    });
    root.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      const t = ev.target as HTMLElement, h = t.closest<HTMLElement>('[data-resize], [data-split]');
      if (h) {
        ev.preventDefault(); h.setPointerCapture(ev.pointerId);
        const id = h.dataset.resize ?? 'foot';
        const from = id === 'foot' ? this.o.footer.getBoundingClientRect().height : this.wins.get(id)!.body.getBoundingClientRect().height;
        this.resize = { kind: id === 'foot' ? 'foot' : 'panel', id, start: ev.clientY, from: from / grid.u, pointer: ev.pointerId };
        document.body.classList.add('resizing-y');
        return;
      }
      const head = t.closest<HTMLElement>('.w-head');
      const el = head?.parentElement as HTMLElement | undefined;
      if (!head || !el || t.closest('[data-w]') || !(el.dataset.win! in this.o.statics)) return;
      this.drag = { id: el.dataset.win!, el, x: ev.clientX, y: ev.clientY, pointer: ev.pointerId };
      head.setPointerCapture(ev.pointerId);
    });
    root.addEventListener('pointermove', ev => {
      const r = this.resize;
      if (r && ev.pointerId === r.pointer) {
        const v = Math.round(r.from + ((ev.clientY - r.start) / grid.u) * (r.kind === 'foot' ? -1 : 1));
        if (r.kind === 'foot') { this.foot[this.id] = Math.max(FOOT.min, Math.min(FOOT.max, v)); this.o.root.style.setProperty('--foot', String(this.foot[this.id])); this.o.onViewportResize(); this.place(); }
        else { this.heights[r.id] = Math.max(16, Math.min(400, v)); this.wins.get(r.id)!.body.style.height = `calc(${this.heights[r.id]} * var(--u))`; }
        return;
      }
      const d = this.drag;
      if (!d || ev.pointerId !== d.pointer) return;
      if (!d.ph) {
        if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) return;
        const rect = d.el.getBoundingClientRect();
        d.ph = document.createElement('div'); d.ph.className = 'win-drop'; d.ph.style.height = `${rect.height}px`;
        d.el.before(d.ph);
        Object.assign(d.el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
        d.el.classList.add('lifted'); document.body.classList.add('moving-win');
      }
      d.el.style.translate = `${Math.round((ev.clientX - d.x) / grid.u) * grid.u}px ${Math.round((ev.clientY - d.y) / grid.u) * grid.u}px`;
      const zones = [...root.querySelectorAll<HTMLElement>('.zone')];
      const dist = (z: HTMLElement) => { const b = z.getBoundingClientRect(); return ev.clientX < b.left ? b.left - ev.clientX : ev.clientX > b.right ? ev.clientX - b.right : 0; };
      const z = zones.sort((a, b) => dist(a) - dist(b))[0];
      const next = [...z.querySelectorAll<HTMLElement>(':scope > .win:not(.lifted)')].find(p => { const b = p.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (next) { if (d.ph.nextElementSibling !== next) next.before(d.ph); } else if (z.lastElementChild !== d.ph) z.append(d.ph);
    });
    const end = (ev: PointerEvent) => {
      const r = this.resize;
      if (r && ev.pointerId === r.pointer) { this.resize = null; document.body.classList.remove('resizing-y'); this.persist(); return; }
      const d = this.drag;
      if (!d || ev.pointerId !== d.pointer) return;
      this.drag = null;
      if (!d.ph) return;
      document.body.classList.remove('moving-win');
      d.el.classList.remove('lifted'); d.el.removeAttribute('style');
      if (ev.type === 'pointerup') {
        const z = d.ph.parentElement as HTMLElement, zone = z.dataset.zone!;
        // Position among the fixed windows of that column; container windows stand at the marker and are skipped.
        const before = [...z.querySelectorAll<HTMLElement>(':scope > .win:not(.lifted), :scope > .win-drop')].slice(0, [...z.children].indexOf(d.ph)).map(e => e.dataset.win).filter(id => id && id in this.o.statics);
        const L = this.layouts[this.id][zone].filter(id => id !== d.id);
        const at = before.length ? L.indexOf(before.at(-1)!) + 1 : 0;
        this.place_(d.id, zone, at);
        this.persist();
      }
      d.ph.remove();
      this.render(); this.o.onViewportResize();
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    addEventListener('keydown', ev => {
      if (ev.key !== 'Escape' || !this.drag?.ph) return;
      const d = this.drag; this.drag = null;
      d.el.classList.remove('lifted'); d.el.removeAttribute('style'); d.ph!.remove(); document.body.classList.remove('moving-win');
      ev.stopImmediatePropagation(); this.render();
    }, true);
  }
}
