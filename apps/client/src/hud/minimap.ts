// The minimap: one canvas pixel per UI pixel, 1 to 4 per tile, centred on you; click to walk there, wheel or the
// buttons to zoom. Shows the floor and the place you stand in.
import { placeAt } from '../../../../packages/game/src/town.ts';
import { grounds, T } from '../../../../packages/game/src/model.ts';
import { core } from './core.ts';
import { glyph, patch } from './kit.ts';
import type { WinSpec } from './column.ts';
import { walkTo } from './world-input.ts';

const SIZE = 96;
const KEY = 'lanternfall.map-zoom';
let zoom = (() => { try { return Math.min(4, Math.max(1, Number(localStorage.getItem(KEY)) || 2)); } catch { return 2; } })();
function setZoom(z: number) { zoom = Math.max(1, Math.min(4, z)); try { localStorage.setItem(KEY, String(zoom)); } catch { /* lasts this session */ } core.redraw(); }

const base = document.createElement('canvas');
let baseFloor = -1;
const groundColors: Record<string, string> = { void: '#06070d', grass: '#33522f', meadow: '#2e4a2b', dirt: '#5e4a32', cobble: '#76705f', plank: '#6b4a30', stone: '#3e3d3f', water: '#1d4058', sand: '#a6936f', moss: '#335631', flagstone: '#6f6a63' };
function drawBase(z: number) {
  const m = core.map, f = m.floors[z], g = base.getContext('2d')!;
  base.width = m.width; base.height = m.height;
  for (let y = 0; y < m.height; y++) for (let x = 0; x < m.width; x++) {
    const i = y * m.width + x, t = f.thing[i];
    let c = groundColors[grounds[f.ground[i]]];
    if (t === T.wall || t === T.rampart) c = '#aaa395';
    else if (t === T.cavewall) c = '#06070d';
    else if (t === T.tree || t === T.pine) c = '#18291c';
    else if (t === T.door) c = '#c4923f';
    else if (t === T.hatch || t === T.ladder) c = '#ffb95e';
    g.fillStyle = c; g.fillRect(x, y, 1, 1);
  }
  if (z === 0) for (const b of m.buildings) { g.fillStyle = b.roof === 'clay' ? '#963c30' : b.roof === 'thatch' ? '#8b795b' : b.roof === 'teal' ? '#17605e' : '#3a4456'; g.fillRect(b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); }
  baseFloor = z;
}
/** The tile at the canvas's top-left corner, keeping you centred but the map's edge in view. */
function origin() {
  const s = core.view!.self, n = SIZE / zoom, m = core.map;
  return { x0: Math.max(0, Math.min(m.width - n, Math.floor(s.x + 0.5 - n / 2))), y0: Math.max(0, Math.min(m.height - n, Math.floor(s.y + 0.5 - n / 2))) };
}
function draw(c: HTMLCanvasElement) {
  const v = core.view!, self = v.self;
  if (baseFloor !== self.z) drawBase(self.z);
  const g = c.getContext('2d')!, { x0, y0 } = origin();
  g.imageSmoothingEnabled = false;
  g.fillStyle = '#06070d'; g.fillRect(0, 0, SIZE, SIZE);
  g.drawImage(base, x0, y0, SIZE / zoom, SIZE / zoom, 0, 0, SIZE, SIZE);
  const dot = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect((x - x0) * zoom, (y - y0) * zoom, zoom, zoom); };
  for (const n of core.map.npcs) if (n.z === self.z) dot(n.x, n.y, '#ffe2a0');
  for (const m of v.monsters) if (m.z === self.z) dot(m.x, m.y, '#ec8a35');
  for (const p of v.players) if (p.z === self.z) dot(p.x, p.y, '#5fd7c4');
  // You: a small white cross on a dark ring, readable on any ground.
  const cx = (self.x - x0) * zoom + Math.floor(zoom / 2), cy = (self.y - y0) * zoom + Math.floor(zoom / 2);
  g.fillStyle = '#06070d'; g.fillRect(cx - 2, cy - 1, 5, 3); g.fillRect(cx - 1, cy - 2, 3, 5);
  g.fillStyle = '#fbf4e2'; g.fillRect(cx - 1, cy, 3, 1); g.fillRect(cx, cy - 1, 1, 3);
}

/** The map's title is the place you stand in. */
export const minimapWindow = (): WinSpec => ({
  id: 'map', title: core.view ? placeAt(core.map, core.view.self) : 'Map', icon: 'w-map', fixed: true,
  render(body) {
    const s = core.view!.self;
    patch(body, `<div class="mm"><canvas class="mm-canvas" width="${SIZE}" height="${SIZE}" aria-label="Map. Click to walk there; scroll to zoom."></canvas>`
      + `<div class="mm-side"><button type="button" class="ibtn btn" data-mm="1" aria-label="Zoom the map in" ${zoom >= 4 ? 'disabled' : ''}>${glyph('plus')}</button><button type="button" class="ibtn btn" data-mm="-1" aria-label="Zoom the map out" ${zoom <= 1 ? 'disabled' : ''}>${glyph('minus')}</button>`
      + `<span class="mm-tag num" title="Zoom">${zoom}×</span><span class="mm-tag" title="Floor">${s.z ? 'B1' : 'G'}</span><span class="mm-tag num" title="Where you stand">${s.x}</span><span class="mm-tag num">${s.y}</span></div></div>`
      );
    draw(body.querySelector('canvas')!);
  },
});
document.addEventListener('click', e => {
  const t = e.target as HTMLElement, b = t.closest<HTMLElement>('[data-mm]');
  if (b) return setZoom(zoom + Number(b.dataset.mm));
  const c = t.closest<HTMLCanvasElement>('.mm-canvas'), v = core.view;
  if (!c || !v) return;
  const r = c.getBoundingClientRect(), { x0, y0 } = origin();
  const x = x0 + Math.floor(((e.clientX - r.left) / r.width) * SIZE / zoom), y = y0 + Math.floor(((e.clientY - r.top) / r.height) * SIZE / zoom);
  walkTo({ x, y, z: v.self.z });
});
let wheel = 0;
document.addEventListener('wheel', e => {
  if (!(e.target as HTMLElement).closest?.('.mm-canvas')) return;
  e.preventDefault();
  wheel += e.deltaY; if (Math.abs(wheel) < 60) return; // trackpads send many small deltas; one notch is one step
  setZoom(zoom + (wheel < 0 ? 1 : -1)); wheel = 0;
}, { passive: false });
