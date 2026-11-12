// The minimap: one canvas pixel per UI pixel, from two tiles per pixel (½×) to 4 pixels per tile, centred on you; click to walk there, wheel or the
// buttons to zoom. Zoomed out past the map's size, the whole map sits centred on the dark. Shows the floor and the place you stand in.
import { placeAt } from '../../../../packages/game/src/town.ts';
import { grounds, T } from '../../../../packages/game/src/model.ts';
import { core } from './core.ts';
import { glyph, parts, patch } from './kit.ts';
import type { WinSpec } from './column.ts';
import { walkTo } from './world-input.ts';

const SIZE = 96;
const KEY = 'lanternfall.map-zoom';
/** Pixels per tile at each zoom step; below 1 a pixel covers several tiles. */
const ZOOMS = [0.5, 1, 2, 3, 4];
const VOID = '#06070d';
/** The step nearest a saved zoom, so an old or odd value still lands on a real step. */
const stepOf = (z: number) => ZOOMS.reduce((best, s, i) => (Math.abs(s - z) < Math.abs(ZOOMS[best]! - z) ? i : best), 0);
let step = (() => { try { return stepOf(Number(localStorage.getItem(KEY)) || 2); } catch { return stepOf(2); } })();
const zoomNow = () => ZOOMS[step]!;
function stepZoom(by: number) { step = Math.max(0, Math.min(ZOOMS.length - 1, step + by)); try { localStorage.setItem(KEY, String(zoomNow())); } catch { /* lasts this session */ } core.redraw(); }

const base = document.createElement('canvas');
let baseFloor = -1;
const groundColors: Record<string, string> = { void: VOID, grass: '#33522f', meadow: '#2e4a2b', dirt: '#5e4a32', cobble: '#76705f', plank: '#6b4a30', stone: '#3e3d3f', water: '#1d4058', sand: '#a6936f', moss: '#335631', flagstone: '#6f6a63' };
function drawBase(z: number) {
  const m = core.map, f = m.floors[z], g = base.getContext('2d')!;
  base.width = m.width; base.height = m.height;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const i = y * m.width + x, t = f.thing[i];
    let c = groundColors[grounds[f.ground[i]]];
    if (t === T.wall || t === T.rampart) c = '#aaa395';
    else if (t === T.cavewall) c = VOID;
    else if (t === T.tree || t === T.pine) c = '#18291c';
    else if (t === T.door) c = '#c4923f';
    else if (t === T.hatch || t === T.ladder) c = '#ffb95e';
    g.fillStyle = c; g.fillRect(x, y, 1, 1);
  }
  if (z === 0) for (const b of m.buildings) { g.fillStyle = b.roof === 'clay' ? '#963c30' : b.roof === 'thatch' ? '#8b795b' : b.roof === 'teal' ? '#17605e' : '#3a4456'; g.fillRect(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); }
  baseFloor = z;
}
/** The tile at the canvas's top-left corner: you centred, but the map's edge kept in view; on an axis the map is too
 * small to fill, the map is centred instead (the corner then lies off the map, at a negative tile). */
function origin() {
  const s = core.view!.self, n = SIZE / zoomNow(), m = core.map;
  const axis = (p: number, len: number) => len <= n ? Math.floor((len - n) / 2) : Math.max(0, Math.min(len - n, Math.floor(p + 0.5 - n / 2)));
  return { x0: axis(s.x, m.width), y0: axis(s.y, m.height) };
}
function draw(c: HTMLCanvasElement) {
  const v = core.view!, self = v.self;
  if (baseFloor !== self.z) drawBase(self.z);
  const g = c.getContext('2d')!, { x0, y0 } = origin(), zoom = zoomNow();
  // Shrunk below a pixel per tile, the tiles are averaged, so thin walls and roads fade rather than vanish at random.
  g.imageSmoothingEnabled = zoom < 1;
  g.imageSmoothingQuality = 'high';
  g.fillStyle = VOID; g.fillRect(0, 0, SIZE, SIZE);
  g.drawImage(base, Math.round(-x0 * zoom), Math.round(-y0 * zoom), base.width * zoom, base.height * zoom);
  // Every creature and person stays at least one whole pixel, whatever the zoom.
  const px = (x: number, from: number) => Math.floor((x - from) * zoom), size = Math.max(1, zoom);
  const dot = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(px(x, x0), px(y, y0), size, size); };
  for (const n of core.map.npcs) if (n.z === self.z) dot(n.x, n.y, '#ffe2a0');
  for (const m of v.monsters) if (m.z === self.z) dot(m.x, m.y, '#ec8a35');
  for (const p of v.players) if (p.z === self.z) dot(p.x, p.y, '#5fd7c4');
  // You: a small white cross on a dark ring, readable on any ground.
  const cx = px(self.x, x0) + Math.floor(size / 2), cy = px(self.y, y0) + Math.floor(size / 2);
  g.fillStyle = '#06070d'; g.fillRect(cx - 2, cy - 1, 5, 3); g.fillRect(cx - 1, cy - 2, 3, 5);
  g.fillStyle = '#fbf4e2'; g.fillRect(cx - 1, cy, 3, 1); g.fillRect(cx, cy - 1, 1, 3);
}

/** The map's title is the place you stand in. */
export const minimapWindow = (): WinSpec => ({
  id: 'map', title: core.view ? placeAt(core.map, core.view.self) : 'Map', icon: 'w-map', fixed: true,
  render(body) {
    const s = core.view!.self, zoom = zoomNow();
    const p = parts(body, ['mm']);
    if (!p.mm.firstElementChild) p.mm.innerHTML = `<canvas class="mm-canvas" width="${SIZE}" height="${SIZE}" aria-label="Map. Click to walk there; scroll to zoom."></canvas><div class="mm-side"></div>`;
    patch(p.mm.lastElementChild!, `<div class="mm-zoom" role="group" aria-label="Map zoom"><button type="button" class="ibtn btn" data-mm="1" aria-label="Zoom the map in" ${step >= ZOOMS.length - 1 ? 'disabled' : ''}>${glyph('plus')}</button>`
      + `<span class="mm-level" title="Zoom">${zoom < 1 ? '½' : zoom}×</span><button type="button" class="ibtn btn" data-mm="-1" aria-label="Zoom the map out" ${step <= 0 ? 'disabled' : ''}>${glyph('minus')}</button></div>`
      + `<div class="mm-where" title="Where you stand: floor, then east and south"><span class="mm-floor">${s.z ? 'B1' : 'G'}</span><span>${s.x}</span><span>${s.y}</span></div>`);
    draw(body.querySelector('canvas')!);
  },
});
document.addEventListener('click', e => {
  const t = e.target as HTMLElement, b = t.closest<HTMLElement>('[data-mm]');
  if (b) return stepZoom(Number(b.dataset.mm));
  const c = t.closest<HTMLCanvasElement>('.mm-canvas'), v = core.view;
  if (!c || !v) return;
  const r = c.getBoundingClientRect(), { x0, y0 } = origin();
  const zoom = zoomNow(), x = x0 + Math.floor(((e.clientX - r.left) / r.width) * SIZE / zoom), y = y0 + Math.floor(((e.clientY - r.top) / r.height) * SIZE / zoom);
  if (x < 0 || y < 0 || x >= core.map.width || y >= core.map.height) return; // the dark around a small map
  walkTo({ x, y, z: v.self.z });
});
let wheel = 0;
document.addEventListener('wheel', e => {
  if (!(e.target as HTMLElement).closest?.('.mm-canvas')) return;
  e.preventDefault();
  wheel += e.deltaY; if (Math.abs(wheel) < 60) return; // trackpads send many small deltas; one notch is one step
  stepZoom(wheel < 0 ? 1 : -1); wheel = 0;
}, { passive: false });
