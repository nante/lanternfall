// The HUD frame around the game view. Three layouts (picked in the Studio's Look tab) arrange one set of panels.
// Players reorder panels by dragging their header (or arrow keys on the grip), collapse them, and resize rails,
// the chat and each panel. Their arrangement is saved per layout in this browser.
import type { ChromeLayout } from '../../../packages/game/src/content-schema.ts';

export type PanelDef = { title: string; slots: string[] };
type Layout = Record<string, string[]>;
type Sizes = { zones: Record<string, number>; foot?: number; heights: Record<string, number> };
type Saved = { layouts: Partial<Record<ChromeLayout, Layout>>; sizes: Partial<Record<ChromeLayout, Sizes>>; collapsed: string[]; mapZoom: number };

export type ChromeOptions = {
  root: HTMLElement;
  /** Persistent elements moved into each layout: the game view (with its overlays) and the chat. */
  viewport: HTMLElement;
  footer: HTMLElement;
  /** Fixed world-label layer, clipped to the game view so names never draw over panels. */
  labels: HTMLElement;
  panels: Record<string, PanelDef>;
  defaults: Record<ChromeLayout, Layout>;
  collapsedByDefault: string[];
  slot: (name: string) => string;
  /** Runs after every render for each slot; `changed` is true when its markup was just replaced (wire listeners then). */
  afterPatch?: (name: string, el: HTMLElement, changed: boolean) => void;
  onViewportResize: () => void;
};

const zoneNames: Record<string, string> = { side: 'side column', left: 'left rail', right: 'right rail' };
const defaultZoneWidth: Record<ChromeLayout, Record<string, number>> = { classic: { side: 264 }, rails: { left: 232, right: 256 }, glass: { left: 232, right: 264 } };
const defaultFoot: Record<ChromeLayout, number> = { classic: 168, rails: 156, glass: 204 };
const LIMITS = { zone: [180, 440], foot: [88, 420], panel: [48, 720] } as const;
const KEY = 'lanternfall.chrome.v1';
const clamp = (v: number, [lo, hi]: readonly [number, number]) => Math.round(Math.max(lo, Math.min(hi, v)));
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));
const grip = `<svg viewBox="0 0 8 12" aria-hidden="true"><g fill="currentColor"><circle cx="2" cy="2" r="1"/><circle cx="6" cy="2" r="1"/><circle cx="2" cy="6" r="1"/><circle cx="6" cy="6" r="1"/><circle cx="2" cy="10" r="1"/><circle cx="6" cy="10" r="1"/></g></svg>`;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');

export class Chrome {
  id: ChromeLayout = 'classic';
  mapZoom: number;
  private layouts: Record<ChromeLayout, Layout>;
  private sizes: Record<ChromeLayout, Sizes>;
  private collapsed: Set<string>;
  private key = '';
  private last = new WeakMap<Element, string>();
  private pop: HTMLElement;
  private popover: { trigger: string; content: () => string } | null = null;
  private announcer: HTMLElement;
  private drag: null | { id: string; el: HTMLElement; ph?: HTMLElement; x: number; y: number; pointer: number } = null;
  private resize: null | { kind: 'zone' | 'foot' | 'panel'; key: string; el: HTMLElement; start: number; from: number; sign: number; pointer: number; moved: boolean } = null;

  constructor(private o: ChromeOptions) {
    const saved = this.read();
    const fits = (l: unknown, d: Layout): l is Layout => !!l && typeof l === 'object' && sameSet(Object.keys(l), Object.keys(d)) && Object.values(l as Layout).every(Array.isArray) && sameSet(Object.values(l as Layout).flat(), Object.values(d).flat());
    const ids = Object.keys(o.defaults) as ChromeLayout[];
    this.layouts = Object.fromEntries(ids.map(v => [v, fits(saved.layouts?.[v], o.defaults[v]) ? saved.layouts![v] : structuredClone(o.defaults[v])])) as Record<ChromeLayout, Layout>;
    this.sizes = Object.fromEntries(ids.map(v => { const x = saved.sizes?.[v]; return [v, { zones: { ...x?.zones }, foot: x?.foot, heights: { ...x?.heights } }]; })) as Record<ChromeLayout, Sizes>;
    this.collapsed = new Set(saved.collapsed ?? o.collapsedByDefault);
    this.mapZoom = Math.min(4, Math.max(1, Math.round(saved.mapZoom ?? 2)));
    this.pop = Object.assign(document.createElement('div'), { className: 'c-pop', hidden: true });
    this.pop.setAttribute('role', 'dialog');
    this.announcer = Object.assign(document.createElement('p'), { className: 'sr-only' });
    this.announcer.setAttribute('aria-live', 'polite');
    const help = (id: string, text: string) => Object.assign(document.createElement('p'), { className: 'sr-only', id, textContent: text });
    document.body.append(this.pop, this.announcer, help('c-move-help', 'Drag the header to move this panel, or use the arrow keys: up and down to reorder, left and right to switch rails.'), help('c-size-help', 'Drag to resize, or use the arrow keys. Double-click to reset.'));
    this.wire();
    addEventListener('resize', () => this.render());
  }

  // ---------------------------------------------------------------- persistence
  private read(): Partial<Saved> { try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; } }
  private persist() { try { localStorage.setItem(KEY, JSON.stringify({ layouts: this.layouts, sizes: this.sizes, collapsed: [...this.collapsed], mapZoom: this.mapZoom } satisfies Saved)); } catch { /* storage blocked: the arrangement just won't survive a reload */ } }

  // ---------------------------------------------------------------- public
  setLayout(id: ChromeLayout) { if (id === this.id && this.key) return; this.id = id; this.closePopover(); this.key = ''; this.render(); }
  isOpen(panel: string) { return !this.collapsed.has(panel); }
  toggle(panel: string) { this.collapsed.has(panel) ? this.collapsed.delete(panel) : this.collapsed.add(panel); this.persist(); this.render(); if (this.isOpen(panel)) this.o.root.querySelector(`[data-panel="${panel}"]`)?.scrollIntoView({ block: 'nearest' }); }
  setMapZoom(z: number) { this.mapZoom = Math.max(1, Math.min(4, z)); this.persist(); this.render(); }
  reset() { const before = this.rects(); this.layouts[this.id] = structuredClone(this.o.defaults[this.id]); this.sizes[this.id] = { zones: {}, heights: {} }; this.collapsed = new Set(this.o.collapsedByDefault); this.closePopover(); this.say('Panel layout reset.'); this.relayout(before); }
  openPopover(trigger: string, label: string, content: () => string) {
    if (this.popover?.trigger === trigger) return this.closePopover(true);
    this.popover = { trigger, content }; this.pop.setAttribute('aria-label', label); this.last.delete(this.pop); this.render();
  }
  closePopover(refocus = false) {
    if (!this.popover) return;
    const t = this.popover.trigger; this.popover = null; this.render();
    if (refocus) this.o.root.querySelector<HTMLElement>(`[data-action="${t}"]`)?.focus();
  }
  get popoverOpen() { return !!this.popover; }

  render() {
    const html = this.layoutHtml();
    const root = this.o.root;
    if (html !== this.key) {
      const scroll = new Map([...root.querySelectorAll<HTMLElement>('.c-zone')].map(z => [z.dataset.zone!, z.scrollTop]));
      this.key = html; root.className = `chrome v-${this.id}`; root.innerHTML = html;
      root.querySelector('[data-mount="viewport"]')!.replaceWith(this.o.viewport);
      root.querySelector('[data-mount="footer"]')!.replaceWith(this.o.footer);
      for (const z of root.querySelectorAll<HTMLElement>('.c-zone')) z.scrollTop = scroll.get(z.dataset.zone!) ?? 0;
    }
    const sz = this.sizes[this.id];
    for (const [z, w] of Object.entries(defaultZoneWidth[this.id])) root.style.setProperty(`--w-${z}`, `${sz.zones[z] ?? w}px`);
    root.style.setProperty('--h-foot', `${sz.foot ?? defaultFoot[this.id]}px`);
    this.placeSplitters();
    const vr = this.o.viewport.getBoundingClientRect();
    this.o.labels.style.clipPath = `inset(${vr.top}px ${innerWidth - vr.right}px ${innerHeight - vr.bottom}px ${vr.left}px)`;
    for (const el of root.querySelectorAll<HTMLElement>('.c-zone [data-part]')) {
      const name = el.dataset.part!, out = this.o.slot(name);
      const changed = this.last.get(el) !== out;
      if (changed) { this.last.set(el, out); el.innerHTML = out; }
      this.o.afterPatch?.(name, el, changed);
    }
    this.placePopover();
  }

  // ---------------------------------------------------------------- markup
  private layoutHtml() {
    const zone = (z: string) => `<aside class="c-zone" data-zone="${z}" aria-label="${zoneNames[z]}">${this.layouts[this.id][z].map(id => this.panelHtml(id)).join('')}</aside>`;
    const splitters = [...Object.keys(this.layouts[this.id]).map(z => `<div class="c-split" data-split="${z}" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Resize ${zoneNames[z]}" aria-describedby="c-size-help"></div>`),
      `<div class="c-split horiz" data-split="foot" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Resize chat" aria-describedby="c-size-help"></div>`].join('');
    const view = '<div data-mount="viewport"></div>', foot = '<div data-mount="footer"></div>';
    const body = this.id === 'rails' ? `${zone('left')}${view}${zone('right')}${foot}` : this.id === 'glass' ? `${view}${zone('left')}${zone('right')}${foot}` : `${view}${zone('side')}${foot}`;
    return body + splitters;
  }
  private panelHtml(id: string) {
    const d = this.o.panels[id], shut = this.collapsed.has(id), h = this.sizes[this.id].heights[id];
    return `<section class="c-panel${shut ? ' collapsed' : ''}" data-panel="${id}" aria-label="${d.title}"><header><button class="c-grip" data-grip="${id}" aria-label="Move ${d.title}" aria-describedby="c-move-help">${grip}</button><h2>${d.title}</h2><button class="c-icon" data-chrome="collapse" data-panel="${id}" aria-expanded="${!shut}" aria-label="${shut ? 'Expand' : 'Collapse'} ${d.title}"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 ${shut ? '4.5l3 3 3-3' : '7.5l3-3 3 3'}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button></header>`
      + `<div class="c-body${h ? ' sized' : ''}"${h ? ` style="height:${h}px"` : ''}>${d.slots.map(s => `<div data-part="${s}"></div>`).join('')}</div>`
      + (shut ? '' : `<div class="c-resize" data-resize="${id}" role="separator" aria-orientation="horizontal" tabindex="0" aria-label="Resize ${d.title}" aria-describedby="c-size-help"${h ? ` aria-valuenow="${h}"` : ''} aria-valuemin="${LIMITS.panel[0]}" aria-valuemax="${LIMITS.panel[1]}"></div>`) + '</section>';
  }

  // ---------------------------------------------------------------- placement
  private facing(z: string) { return z === 'left' ? 'right' : 'left'; }
  private placeSplitters() {
    for (const el of this.o.root.querySelectorAll<HTMLElement>('.c-split')) {
      const k = el.dataset.split!;
      const target = this.o.root.querySelector<HTMLElement>(k === 'foot' ? '.c-foot' : `.c-zone[data-zone="${k}"]`); if (!target) continue;
      const r = target.getBoundingClientRect();
      if (k === 'foot') { Object.assign(el.style, { left: `${r.left}px`, width: `${r.width}px`, top: `${r.top - 6}px` }); el.setAttribute('aria-valuenow', String(Math.round(r.height))); }
      else { Object.assign(el.style, { top: `${r.top}px`, height: `${r.height}px`, left: `${(this.facing(k) === 'left' ? r.left : r.right) - 6}px` }); el.setAttribute('aria-valuenow', String(Math.round(r.width))); }
    }
  }
  private placePopover() {
    const trigger = this.popover && this.o.root.querySelector<HTMLElement>(`[data-action="${this.popover.trigger}"]`);
    if (!trigger || !this.popover) { if (!this.pop.hidden) { this.pop.hidden = true; this.pop.innerHTML = ''; this.last.delete(this.pop); } return; }
    for (const b of this.o.root.querySelectorAll('[aria-haspopup]')) b.setAttribute('aria-expanded', String(b === trigger));
    const out = this.popover.content(), opening = this.pop.hidden;
    if (this.last.get(this.pop) !== out) { this.last.set(this.pop, out); this.pop.innerHTML = out; }
    this.pop.hidden = false;
    const r = trigger.getBoundingClientRect(), w = this.pop.offsetWidth, h = this.pop.offsetHeight;
    const above = r.top - h - 8 > 8;
    const left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w));
    this.pop.style.left = `${left}px`; this.pop.style.top = `${above ? r.top - h - 8 : r.bottom + 8}px`;
    this.pop.style.transformOrigin = `${r.left + r.width / 2 - left}px ${above ? '100%' : '0%'}`;
    if (opening) this.pop.querySelector<HTMLElement>('button, input')?.focus({ preventScroll: true });
  }
  private say(text: string) { this.announcer.textContent = text; }

  // ---------------------------------------------------------------- reorder
  private rects() { return new Map([...this.o.root.querySelectorAll<HTMLElement>('.c-panel')].map(p => [p.dataset.panel!, p.getBoundingClientRect()])); }
  /** Rebuild, then slide every panel from where it was (FLIP) so a move reads as a move, not a jump. */
  private relayout(before: Map<string, DOMRect>, focusGrip?: string) {
    this.persist(); this.key = ''; this.render(); this.o.onViewportResize();
    if (focusGrip) this.o.root.querySelector<HTMLElement>(`[data-grip="${focusGrip}"]`)?.focus();
    if (reduced.matches) return;
    for (const p of this.o.root.querySelectorAll<HTMLElement>('.c-panel')) {
      const a = before.get(p.dataset.panel!), b = p.getBoundingClientRect();
      if (!a || (Math.abs(a.left - b.left) < 1 && Math.abs(a.top - b.top) < 1)) continue;
      p.animate([{ transform: `translate(${a.left - b.left}px, ${a.top - b.top}px)` }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
  }
  private place(id: string, z: string, index: number) {
    const L = this.layouts[this.id];
    for (const list of Object.values(L)) { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); }
    L[z].splice(Math.max(0, Math.min(index, L[z].length)), 0, id);
    this.say(`${this.o.panels[id].title} moved to position ${L[z].indexOf(id) + 1} of ${L[z].length}${Object.keys(L).length > 1 ? ` in the ${zoneNames[z]}` : ''}.`);
  }

  // ---------------------------------------------------------------- resize
  private resizeTarget(h: HTMLElement) {
    if (h.dataset.resize) { const el = h.parentElement!.querySelector<HTMLElement>('.c-body')!; return { kind: 'panel' as const, key: h.dataset.resize, el, from: el.getBoundingClientRect().height, sign: 1 }; }
    const k = h.dataset.split; if (!k) return null;
    if (k === 'foot') { const el = this.o.root.querySelector<HTMLElement>('.c-foot')!; return { kind: 'foot' as const, key: k, el, from: el.getBoundingClientRect().height, sign: -1 }; }
    const el = this.o.root.querySelector<HTMLElement>(`.c-zone[data-zone="${k}"]`)!;
    return { kind: 'zone' as const, key: k, el, from: el.getBoundingClientRect().width, sign: this.facing(k) === 'left' ? -1 : 1 };
  }
  private applySize(t: { kind: 'zone' | 'foot' | 'panel'; key: string; el: HTMLElement }, v: number, commit: boolean) {
    const sz = this.sizes[this.id], root = this.o.root;
    if (t.kind === 'panel') { v = clamp(v, LIMITS.panel); t.el.style.height = `${v}px`; t.el.classList.add('sized'); if (commit) sz.heights[t.key] = v; }
    else if (t.kind === 'zone') { v = clamp(v, LIMITS.zone); root.style.setProperty(`--w-${t.key}`, `${v}px`); if (commit) sz.zones[t.key] = v; }
    else { v = clamp(v, LIMITS.foot); root.style.setProperty('--h-foot', `${v}px`); if (commit) sz.foot = v; }
    this.o.onViewportResize(); this.placeSplitters();
    if (commit) { this.persist(); this.key = ''; this.render(); }
  }

  // ---------------------------------------------------------------- events
  private wire() {
    const root = this.o.root;
    root.addEventListener('click', ev => {
      const t = (ev.target as HTMLElement).closest<HTMLElement>('[data-chrome="collapse"]');
      if (!t) return;
      const id = t.dataset.panel!;
      this.toggle(id); this.o.onViewportResize();
      root.querySelector<HTMLElement>(`[data-chrome="collapse"][data-panel="${id}"]`)?.focus();
    });
    document.addEventListener('pointerdown', ev => { if (this.popover && !this.pop.contains(ev.target as Node) && !(ev.target as HTMLElement).closest('[aria-haspopup]')) this.closePopover(); }, true);
    addEventListener('keydown', ev => {
      if (ev.key !== 'Escape') return;
      if (this.drag?.ph) { const d = this.drag; this.drag = null; d.el.classList.remove('lifted'); d.el.removeAttribute('style'); d.ph!.remove(); document.body.classList.remove('c-dragging'); ev.stopImmediatePropagation(); }
      else if (this.popover) { this.closePopover(true); ev.stopImmediatePropagation(); }
    }, true);

    // keyboard: grips move panels, separators resize
    root.addEventListener('keydown', ev => {
      const g = (ev.target as HTMLElement).closest<HTMLElement>('[data-grip]');
      if (g && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.key)) {
        ev.preventDefault(); ev.stopPropagation();
        const id = g.dataset.grip!, L = this.layouts[this.id], zs = Object.keys(L);
        const zi = zs.findIndex(z => L[z].includes(id)), i = L[zs[zi]].indexOf(id), before = this.rects();
        if (ev.key === 'ArrowUp' && i > 0) this.place(id, zs[zi], i - 1);
        else if (ev.key === 'ArrowDown' && i < L[zs[zi]].length - 1) this.place(id, zs[zi], i + 1);
        else if (ev.key === 'ArrowLeft' && zi > 0) this.place(id, zs[zi - 1], i);
        else if (ev.key === 'ArrowRight' && zi < zs.length - 1) this.place(id, zs[zi + 1], i);
        else return;
        this.relayout(before, id); return;
      }
      const h = (ev.target as HTMLElement).closest<HTMLElement>('[data-resize], [data-split]');
      const t = h && this.resizeTarget(h); if (!t || !h) return;
      const grow = t.kind === 'zone' ? (t.sign > 0 ? 'ArrowRight' : 'ArrowLeft') : t.kind === 'foot' ? 'ArrowUp' : 'ArrowDown';
      const shrink = ({ ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowUp: 'ArrowDown', ArrowDown: 'ArrowUp' } as Record<string, string>)[grow];
      if (ev.key !== grow && ev.key !== shrink) return;
      ev.preventDefault(); ev.stopPropagation();
      const sel = h.dataset.resize ? `[data-resize="${h.dataset.resize}"]` : `[data-split="${h.dataset.split}"]`;
      this.applySize(t, t.from + (ev.key === grow ? 16 : -16), true);
      root.querySelector<HTMLElement>(sel)?.focus();
    });
    root.addEventListener('dblclick', ev => {
      const h = (ev.target as HTMLElement).closest<HTMLElement>('[data-resize], [data-split]'); if (!h) return;
      const sz = this.sizes[this.id], k = h.dataset.resize ?? h.dataset.split!;
      if (h.dataset.resize) delete sz.heights[k]; else if (k === 'foot') sz.foot = undefined; else delete sz.zones[k];
      this.say('Size reset.'); this.persist(); this.key = ''; this.render(); this.o.onViewportResize();
    });

    // pointer: drag a header to move, drag a separator to resize
    root.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      const target = ev.target as HTMLElement;
      const h = target.closest<HTMLElement>('[data-resize], [data-split]');
      if (h) {
        const t = this.resizeTarget(h); if (!t) return;
        ev.preventDefault(); h.setPointerCapture(ev.pointerId);
        this.resize = { ...t, start: t.kind === 'zone' ? ev.clientX : ev.clientY, pointer: ev.pointerId, moved: false };
        document.body.classList.add(t.kind === 'zone' ? 'c-resizing-x' : 'c-resizing-y'); h.classList.add('active');
        return;
      }
      const head = target.closest<HTMLElement>('.c-panel > header');
      if (!head || target.closest('[data-chrome], [data-action]')) return;
      const el = head.parentElement as HTMLElement;
      this.drag = { id: el.dataset.panel!, el, x: ev.clientX, y: ev.clientY, pointer: ev.pointerId };
      head.setPointerCapture(ev.pointerId);
    });
    root.addEventListener('pointermove', ev => {
      const r = this.resize;
      if (r && ev.pointerId === r.pointer) { r.moved = true; this.applySize(r, r.from + ((r.kind === 'zone' ? ev.clientX : ev.clientY) - r.start) * r.sign, false); return; }
      const d = this.drag;
      if (!d || ev.pointerId !== d.pointer) return;
      const dx = ev.clientX - d.x, dy = ev.clientY - d.y;
      if (!d.ph) {
        if (Math.hypot(dx, dy) < 5) return; // a click on the header is not a drag
        const rect = d.el.getBoundingClientRect();
        d.ph = document.createElement('div'); d.ph.className = 'c-drop'; d.ph.style.height = `${rect.height}px`;
        d.el.before(d.ph);
        Object.assign(d.el.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
        d.el.classList.add('lifted'); document.body.classList.add('c-dragging');
      }
      d.el.style.transform = `translate(${dx}px, ${dy}px)`;
      const zones = [...root.querySelectorAll<HTMLElement>('.c-zone')];
      const dist = (z: HTMLElement) => { const b = z.getBoundingClientRect(); return ev.clientX < b.left ? b.left - ev.clientX : ev.clientX > b.right ? ev.clientX - b.right : 0; };
      const z = zones.sort((a, b) => dist(a) - dist(b))[0];
      const next = [...z.querySelectorAll<HTMLElement>(':scope > .c-panel:not(.lifted)')].find(p => { const b = p.getBoundingClientRect(); return ev.clientY < b.top + b.height / 2; });
      if (next) { if (d.ph.nextElementSibling !== next) next.before(d.ph); } else if (z.lastElementChild !== d.ph) z.append(d.ph);
      const zr = z.getBoundingClientRect();
      if (ev.clientY > zr.bottom - 40) z.scrollTop += 12; else if (ev.clientY < zr.top + 40) z.scrollTop -= 12;
    });
    const end = (ev: PointerEvent) => {
      const r = this.resize;
      if (r && ev.pointerId === r.pointer) {
        this.resize = null;
        document.body.classList.remove('c-resizing-x', 'c-resizing-y'); root.querySelector('.c-split.active, .c-resize.active')?.classList.remove('active');
        if (r.moved) this.applySize(r, r.from + ((r.kind === 'zone' ? ev.clientX : ev.clientY) - r.start) * r.sign, true);
        return;
      }
      const d = this.drag;
      if (!d || ev.pointerId !== d.pointer) return;
      this.drag = null;
      if (!d.ph) return;
      document.body.classList.remove('c-dragging');
      const before = this.rects();
      if (ev.type === 'pointerup') {
        const z = d.ph.parentElement as HTMLElement;
        this.place(d.id, z.dataset.zone!, [...z.querySelectorAll(':scope > .c-panel:not(.lifted), :scope > .c-drop')].indexOf(d.ph));
      }
      this.relayout(before);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
  }
}
