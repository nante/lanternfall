type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, string | number | boolean | null | undefined | ((e: Event) => void)>;

/** Tiny element builder. `on*` keys become listeners; `class`, `for`, data and aria attributes pass through. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === 'value' && 'value' in el) (el as HTMLInputElement).value = String(v);
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  append(el, children);
  return el;
}
function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}
/** replaceChildren that accepts nulls and nested arrays like h() does. */
export function fill(el: Element, ...children: Child[]) { el.replaceChildren(); append(el, children); }
export const svg = (markup: string) => { const t = document.createElement('template'); t.innerHTML = markup; return t.content.firstElementChild as SVGElement; };
export const fmt = (n: number, digits = 1) => (Number.isInteger(n) ? n.toLocaleString('en') : n.toLocaleString('en', { maximumFractionDigits: digits }));
export const pct = (n: number) => `${fmt(n * 100, 1)}%`;

let fieldId = 0;
export type FieldOpts = {
  label: string; value: number; saved?: number; unit?: string; step?: number; min?: number; hint?: string;
  issue?: string; onInput: (v: number) => void; readOnly?: boolean; percent?: boolean; scale?: number; round?: boolean;
};
/** Numeric field that keeps half-typed text visible and shows the saved value when it differs. */
export function numberField(o: FieldOpts) {
  const id = `f${++fieldId}`;
  const scale = o.scale ?? (o.percent ? 100 : 1);
  const shown = (v: number) => String(Math.round(v * scale * 10000) / 10000);
  const input = h('input', { id, type: 'text', inputmode: 'decimal', value: shown(o.value), readonly: o.readOnly, autocomplete: 'off', spellcheck: 'false' });
  const was = h('span', { class: 'was' });
  const err = h('span', { class: 'err', role: 'alert' });
  const sync = (v: number) => {
    const changed = o.saved !== undefined && Math.abs(v - o.saved) > 1e-9;
    was.textContent = changed ? `was ${shown(o.saved!)}` : '';
    wrap.classList.toggle('changed', changed);
  };
  const wrap = h('div', { class: 'field num' },
    h('label', { for: id }, o.label, o.hint ? h('span', { class: 'hint' }, o.hint) : null),
    h('div', { class: 'control' }, input, o.unit ? h('span', { class: 'unit' }, o.unit) : null),
    h('div', { class: 'meta' }, was, err));
  input.addEventListener('input', () => {
    const text = input.value.trim().replace(',', '.');
    const v = Number(text);
    if (text === '' || !Number.isFinite(v)) { err.textContent = 'Enter a number'; wrap.classList.add('invalid'); return; }
    err.textContent = ''; wrap.classList.remove('invalid');
    const stored = o.round ? Math.round(v / scale) : v / scale;
    o.onInput(stored); sync(stored);
  });
  input.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = (o.step ?? 1) * (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
    const v = Math.round((Number(input.value) + step) * 10000) / 10000;
    input.value = String(o.min !== undefined ? Math.max(o.min, v) : v);
    input.dispatchEvent(new Event('input'));
  });
  if (o.issue) { err.textContent = o.issue; wrap.classList.add('invalid'); }
  sync(o.value);
  return wrap;
}
export function textField(o: { label: string; value: string; saved?: string; onInput: (v: string) => void; issue?: string; hint?: string }) {
  const id = `f${++fieldId}`;
  const input = h('input', { id, type: 'text', value: o.value, autocomplete: 'off', spellcheck: 'false' });
  const was = h('span', { class: 'was' }), err = h('span', { class: 'err', role: 'alert' }, o.issue ?? '');
  const wrap = h('div', { class: `field text${o.issue ? ' invalid' : ''}` }, h('label', { for: id }, o.label, o.hint ? h('span', { class: 'hint' }, o.hint) : null), h('div', { class: 'control' }, input), h('div', { class: 'meta' }, was, err));
  const sync = () => { const changed = o.saved !== undefined && input.value !== o.saved; was.textContent = changed ? `was “${o.saved}”` : ''; wrap.classList.toggle('changed', changed); };
  input.addEventListener('input', () => { o.onInput(input.value); sync(); });
  sync();
  return wrap;
}
export function toast(message: string, tone: 'ok' | 'error' | 'info' = 'info') {
  const host = document.querySelector('.toasts') ?? document.body.appendChild(h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }));
  const t = h('div', { class: `toast ${tone}` }, message);
  host.append(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 200); }, tone === 'error' ? 6000 : 3800);
}
/** Debounced re-render for derived panels so typing stays smooth. */
export function later(fn: () => void, ms = 120) { let t = 0; return () => { clearTimeout(t); t = window.setTimeout(fn, ms); }; }
