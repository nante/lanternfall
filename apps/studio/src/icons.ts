import { iconAlphabet, type IconDef } from '../../../packages/game/src/content-schema.ts';
import { iconSvg } from '../../../packages/game/src/icon-svg.ts';
import { spellIds, uiIcons } from '../../../packages/game/src/ids.ts';
import type { Store } from './store.ts';
import { h, svg, toast, fill } from './ui.ts';
import { decodePng, encodePng, download, pickFile, hex } from './png.ts';
import type { View } from './balance.ts';

type Tool = 'pencil' | 'eraser' | 'picker';
const ZOOM = 24;

export function iconsView(ctx: { store: Store; selected: string | null; select: (id: string) => void }): View {
  const store = ctx.store;
  const icons = () => store.get('icons').draft;
  const names = Object.keys(icons()).sort();
  const name = ctx.selected && icons()[ctx.selected] ? ctx.selected : names[0];
  let tool: Tool = 'pencil', colour = 0, stroke = 0;
  const usedBy = (n: string) => {
    const b = store.docs.balance?.draft;
    const items = b ? Object.values(b.items).filter(i => i.icon === n).map(i => i.name) : [];
    if ((spellIds as readonly string[]).includes(n)) items.push(`${n} spell`);
    if ((uiIcons as readonly string[]).includes(n)) items.push('HUD button');
    return items;
  };

  // ---- list
  const search = h('input', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter icons', autocomplete: 'off' });
  const list = h('ul', { class: 'icon-list', 'aria-label': 'Icons' });
  const drawList = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren(...names.filter(n => !q || n.includes(q) || usedBy(n).join(' ').toLowerCase().includes(q)).map(n =>
      h('li', {}, h('button', { class: 'icon-pick', 'aria-pressed': n === name, title: usedBy(n).join(', ') || 'Unused', onclick: () => ctx.select(n) }, svg(iconSvg(icons()[n])), h('span', {}, n)))));
  };
  search.addEventListener('input', drawList);

  // ---- canvas
  const canvas = h('canvas', { width: 16 * ZOOM, height: 16 * ZOOM, class: 'pixels', 'aria-label': `Pixel editor for ${name}. Use the tools to draw.` });
  const g = canvas.getContext('2d')!;
  const draw = () => {
    const def = icons()[name];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ch = def.pixels[y][x];
      g.fillStyle = (x + y) % 2 ? '#2a2724' : '#221f1d';
      g.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM);
      if (ch !== '.') { g.fillStyle = def.palette[iconAlphabet.indexOf(ch)]; g.fillRect(x * ZOOM, y * ZOOM, ZOOM, ZOOM); }
    }
    g.strokeStyle = 'rgba(255,240,220,.06)'; g.lineWidth = 1;
    for (let i = 1; i < 16; i++) { g.beginPath(); g.moveTo(i * ZOOM + 0.5, 0); g.lineTo(i * ZOOM + 0.5, 16 * ZOOM); g.moveTo(0, i * ZOOM + 0.5); g.lineTo(16 * ZOOM, i * ZOOM + 0.5); g.stroke(); }
    previews.replaceChildren(
      h('figure', {}, h('div', { class: 'pv x1' }, svg(iconSvg(def))), h('figcaption', {}, '1×')),
      h('figure', {}, h('div', { class: 'pv x2' }, svg(iconSvg(def))), h('figcaption', {}, '2×')),
      h('figure', {}, h('div', { class: 'pv hud' }, h('span', {}, svg(iconSvg(def)))), h('figcaption', {}, 'Hotbar')),
      h('figure', {}, h('div', { class: 'pv cell' }, svg(iconSvg(def))), h('figcaption', {}, 'Pack slot')));
    const thumb = list.querySelector('[aria-pressed="true"] svg');
    if (thumb) thumb.replaceWith(svg(iconSvg(def)));
  };
  const cellAt = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); return { x: Math.floor(((e.clientX - r.left) / r.width) * 16), y: Math.floor(((e.clientY - r.top) / r.height) * 16) }; };
  const paint = (x: number, y: number, pick: boolean) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    const def = icons()[name], ch = def.pixels[y][x];
    if (pick || tool === 'picker') { if (ch !== '.') { colour = iconAlphabet.indexOf(ch); drawPalette(); } return; }
    const next = tool === 'eraser' ? '.' : iconAlphabet[colour];
    if (ch === next) return;
    store.edit('icons', d => { const row = d[name].pixels[y]; d[name].pixels[y] = row.slice(0, x) + next + row.slice(x + 1); }, `stroke:${stroke}`);
    draw();
  };
  canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); stroke++; const c = cellAt(e); paint(c.x, c.y, e.altKey || e.button === 2); });
  canvas.addEventListener('pointermove', e => { if (!canvas.hasPointerCapture(e.pointerId) || tool === 'picker') return; const c = cellAt(e); paint(c.x, c.y, false); });
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  // ---- tools & palette
  const tools = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': 'Tool' });
  const drawTools = () => tools.replaceChildren(...(['pencil', 'eraser', 'picker'] as Tool[]).map(t =>
    h('button', { role: 'radio', 'aria-checked': t === tool, onclick: () => { tool = t; drawTools(); } }, t === 'pencil' ? 'Pencil' : t === 'eraser' ? 'Eraser' : 'Pick', h('kbd', {}, t === 'pencil' ? 'B' : t === 'eraser' ? 'E' : 'I'))));
  const palette = h('div', { class: 'palette', role: 'radiogroup', 'aria-label': 'Colours' });
  const drawPalette = () => {
    const def = icons()[name];
    const used = new Set(def.pixels.join(''));
    fill(palette, ...def.palette.map((c, i) => {
      const input = h('input', { type: 'color', value: c, 'aria-label': `Edit colour ${i + 1}`, oninput: (e: Event) => { const v = (e.target as HTMLInputElement).value; store.edit('icons', d => { d[name].palette[i] = v; }, `palette:${name}:${i}`); draw(); } });
      return h('div', { class: `swatch${i === colour ? ' on' : ''}` },
        h('button', { role: 'radio', 'aria-checked': i === colour, 'aria-label': `Colour ${i + 1} ${c}`, style: `--c:${c}`, onclick: () => { colour = i; if (tool === 'eraser') { tool = 'pencil'; drawTools(); } drawPalette(); } }),
        input,
        used.has(iconAlphabet[i]) ? null : h('button', { class: 'drop', 'aria-label': `Remove unused colour ${c}`, onclick: () => removeColour(i) }, '×'));
    }), def.palette.length < iconAlphabet.length ? h('button', { class: 'add', 'aria-label': 'Add colour', onclick: () => { store.edit('icons', d => { d[name].palette.push(d[name].palette[colour] ?? '#ffffff'); }); colour = icons()[name].palette.length - 1; draw(); drawPalette(); } }, '+') : null);
  };
  const removeColour = (i: number) => {
    store.edit('icons', d => {
      const def = d[name], last = def.palette.length - 1;
      // Keep indices stable: move the last colour into the freed slot.
      if (i !== last) { def.palette[i] = def.palette[last]; def.pixels = def.pixels.map(r => r.replaceAll(iconAlphabet[last], iconAlphabet[i])); }
      def.palette.pop();
    });
    colour = Math.min(colour, icons()[name].palette.length - 1);
    draw(); drawPalette();
  };

  // ---- import / export
  const importPng = async () => {
    const file = await pickFile(); if (!file) return;
    try {
      const img = await decodePng(file);
      if (img.width !== 16 || img.height !== 16) throw new Error(`Icons must be exactly 16×16; this image is ${img.width}×${img.height}.`);
      const pal: string[] = [], rows: string[] = [];
      for (let y = 0; y < 16; y++) {
        let row = '';
        for (let x = 0; x < 16; x++) {
          const o = (y * 16 + x) * 4, a = img.data[o + 3];
          if (a === 0) { row += '.'; continue; }
          if (a !== 255) throw new Error('Partial transparency found. Export with every pixel either fully opaque or fully transparent.');
          const c = hex(img.data[o], img.data[o + 1], img.data[o + 2]);
          let i = pal.indexOf(c); if (i < 0) { pal.push(c); i = pal.length - 1; }
          if (i >= iconAlphabet.length) throw new Error(`Too many colours: icons can use up to ${iconAlphabet.length}.`);
          row += iconAlphabet[i];
        }
        rows.push(row);
      }
      if (!pal.length) throw new Error('The image is fully transparent.');
      store.edit('icons', d => { d[name] = { palette: pal, pixels: rows }; });
      colour = 0; draw(); drawPalette(); toast(`Imported ${file.name} into ${name}. Save to keep it.`, 'ok');
    } catch (e) { toast((e as Error).message, 'error'); }
  };
  const exportPng = async () => {
    const def: IconDef = icons()[name], data = new Uint8ClampedArray(16 * 16 * 4);
    def.pixels.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.') return; const c = def.palette[iconAlphabet.indexOf(ch)]; const o = (y * 16 + x) * 4; data.set([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255], o); }));
    download(await encodePng({ width: 16, height: 16, data }), `${name}.png`);
  };

  const keys = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey) return;
    const k = e.key.toLowerCase();
    if (k === 'b') tool = 'pencil'; else if (k === 'e') tool = 'eraser'; else if (k === 'i') tool = 'picker'; else return;
    drawTools();
  };
  addEventListener('keydown', keys);

  const previews = h('div', { class: 'previews', 'aria-label': 'Previews' });
  const used = usedBy(name);
  drawList(); drawTools(); draw(); drawPalette();
  const el = h('div', { class: 'split icons' },
    h('nav', { class: 'list' }, search, list),
    h('section', { class: 'detail icon-editor' },
      h('header', { class: 'record-head' }, h('div', {}, h('h2', {}, name), h('p', { class: 'muted' }, used.length ? `Used by ${used.join(', ')}` : 'Not used by anything yet'))),
      h('div', { class: 'toolbar' }, tools, h('span', { class: 'spacer' }), h('button', { class: 'ghost', onclick: importPng }, 'Import PNG'), h('button', { class: 'ghost', onclick: exportPng }, 'Export PNG')),
      h('div', { class: 'canvas-wrap' }, canvas),
      h('p', { class: 'hint-row' }, 'Alt-click or right-click picks a colour. Click the selected swatch again to change its colour. Undo with ⌘Z.'),
      h('h3', {}, 'Palette'), palette),
    h('section', { class: 'derived' }, h('h3', {}, 'Preview'), previews));
  return { el, update: draw, destroy: () => removeEventListener('keydown', keys) };
}
