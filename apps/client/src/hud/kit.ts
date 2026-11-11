// The shared kit every HUD window builds from: the UI pixel grid, markup helpers and the few drawn parts (bars, buttons,
// banners) so no window invents its own.
import { ICON_SIZE } from '../../../../packages/game/src/content-schema.ts';

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => { const n = root.querySelector(sel); if (!n) throw Error(`Missing ${sel}`); return n as T; };
export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
export const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

// Windows re-render on every update; replacing DOM mid-click swallows the click, so only touch the DOM when markup changes.
const rendered = new WeakMap<Element, string>();
export function patch(el: Element, html: string) { if (rendered.get(el) === html) return false; rendered.set(el, html); el.innerHTML = html; return true; }
export function forget(el: Element) { rendered.delete(el); }

/** Item icons are square, ICON UI pixels a side; cells and the column follow it. */
export const ICON = ICON_SIZE;

// ---------------------------------------------------------------- the UI pixel grid
/** One UI pixel in CSS pixels, chosen so it is a whole number of device pixels. */
export type ScaleSetting = 'auto' | 1 | 2 | 3;
const SCALE_KEY = 'lanternfall.ui-scale';
export const grid = { setting: 'auto' as ScaleSetting, u: 2 };
function readSetting(): ScaleSetting { try { const v = localStorage.getItem(SCALE_KEY); return v === '1' || v === '2' || v === '3' ? (Number(v) as 1 | 2 | 3) : 'auto'; } catch { return 'auto'; } }
/** Auto follows the window height so a UI pixel sits near a world pixel (the world upscales by its height too). */
function autoScale() { return Math.max(1, Math.min(3, Math.round(innerHeight / 450))); }
export function applyScale(setting = grid.setting) {
  grid.setting = setting;
  const css = setting === 'auto' ? autoScale() : setting, dpr = devicePixelRatio || 1;
  grid.u = Math.max(1, Math.round(css * dpr)) / dpr;
  const root = document.documentElement;
  root.style.setProperty('--u', `${grid.u}px`);
  root.style.setProperty('--icon', String(ICON));
  root.dataset.scale = String(css);
}
export function setScale(setting: ScaleSetting) {
  try { if (setting === 'auto') localStorage.removeItem(SCALE_KEY); else localStorage.setItem(SCALE_KEY, String(setting)); } catch { /* not saved: still applies now */ }
  applyScale(setting);
  dispatchEvent(new Event('hud-scale'));
}
grid.setting = readSetting();
applyScale();
addEventListener('resize', () => { const before = grid.u; applyScale(); if (grid.u !== before) dispatchEvent(new Event('hud-scale')); });
/** A CSS-pixel coordinate moved onto the UI grid. */
export const snap = (px: number) => Math.round(px / grid.u) * grid.u;

// ---------------------------------------------------------------- drawn parts
export type BarKind = 'hp' | 'mp' | 'xp' | 'skill' | 'foe';
/** A stepped bar: the fill is cut to whole UI pixels by CSS, the number sits on it. */
export function bar(kind: BarKind, value: number, max: number, label: string, text = '') {
  const v = Math.max(0, Math.min(max, value)), p = max > 0 ? v / max : 0;
  return `<div class="bar ${kind}${kind === 'hp' && p < 0.3 ? ' low' : ''}" role="meter" aria-label="${esc(label)}" aria-valuenow="${Math.round(v)}" aria-valuemin="0" aria-valuemax="${max}" style="--p:${p.toFixed(4)}"><i></i>${text ? `<span class="num">${text}</span>` : ''}</div>`;
}
/** A glyph from art.css (masks take the text colour). */
export const glyph = (name: string, cls = '') => `<i class="g g-${name}${cls ? ` ${cls}` : ''}" aria-hidden="true"></i>`;
export const art = (name: string, cls = '') => `<i class="art a-${name}${cls ? ` ${cls}` : ''}" aria-hidden="true"></i>`;
export const iconBtn = (name: string, label: string, attrs = '') => `<button type="button" class="ibtn" aria-label="${esc(label)}" ${attrs}>${glyph(name)}</button>`;
