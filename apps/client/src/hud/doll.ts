// The equipment window: a figure with a framed slot for each thing worn, capacity and gold beside it, then the fight
// mode, chase or stand, and the Options and Log out buttons. Slots are placed from a table, on a grid of half-slot
// rows (side slots sit half a slot lower than the centre ones), so more slots can be added as rows of the table.
import type { EquipSlot } from '../../../../packages/game/src/model.ts';
import { equipSlots } from '../../../../packages/game/src/model.ts';
import { core, countOf, equipKey, kids, stats, weightOf } from './core.ts';
import { ICON, esc, glyph, patch } from './kit.ts';
import { cellHtml } from './items.ts';
import type { WinSpec } from './column.ts';
import { icon } from '../icons.ts';

/**
 * The ten places on the figure, by grid column (1 left, 2 centre, 3 right) and half-slot row. `slot` is today's equipment
 * slot shown there; places without one are drawn locked with their silhouette until the rules give them a slot.
 */
const places: { id: string; col: 1 | 2 | 3; row: number; label: string; slot?: EquipSlot }[] = [
  { id: 'head', col: 2, row: 1, label: 'Head', slot: 'head' },
  { id: 'body', col: 2, row: 3, label: 'Body', slot: 'body' },
  { id: 'legs', col: 2, row: 5, label: 'Legs' },
  { id: 'feet', col: 2, row: 7, label: 'Feet', slot: 'feet' },
  { id: 'neck', col: 1, row: 2, label: 'Neck' },
  { id: 'right', col: 1, row: 4, label: 'Right hand', slot: 'weapon' },
  { id: 'ring', col: 1, row: 6, label: 'Ring' },
  { id: 'back', col: 3, row: 2, label: 'Back', slot: 'pack' },
  { id: 'left', col: 3, row: 4, label: 'Left hand', slot: 'shield' },
  { id: 'belt', col: 3, row: 6, label: 'Belt' },
];
const modes: [string, string, string][] = [['offensive', 'attack', 'Attack: hit harder, block less'], ['balanced', 'balance', 'Balanced: even hits and blocks'], ['defensive', 'defend', 'Defend: hit softer, block much more']];

/** A faint standing figure behind the slots, drawn for the current slot size (UI pixels). */
let figure = '';
function figureArt() {
  if (figure) return figure;
  const c = ICON + 4, g = 2, half = (c + g) / 2, w = 3 * c + 2 * g, h = 8 * half;
  const r = (x: number, y: number, rw: number, rh: number) => `<rect x='${Math.round(x)}' y='${Math.round(y)}' width='${Math.round(rw)}' height='${Math.round(rh)}'/>`;
  const cx = w / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' shape-rendering='crispEdges' fill='%231e2646'>`
    + r(cx - c * 0.15, c, c * 0.3, half) // neck
    + r(c * 0.5, half * 3 - 2, w - c, 4) // shoulders
    + r(c * 0.4, half * 3, 4, half * 2) + r(w - c * 0.4 - 4, half * 3, 4, half * 2) // arms
    + r(cx - c * 0.35, half * 4 + c, c * 0.25, half * 3) + r(cx + c * 0.1, half * 4 + c, c * 0.25, half * 3) // legs
    + '</svg>';
  figure = `url("data:image/svg+xml,${svg.replace(/[<>#"]/g, encodeURIComponent)}")`;
  return figure;
}

export const dollWindow: WinSpec = {
  id: 'gear', title: 'Equipment', icon: 'w-gear', fixed: true, kind: 'gear',
  render(body) {
    const v = core.view!, s = v.self, st = stats(v), eq = equipKey(v), worn = kids(v, eq);
    const free = Math.max(0, Math.floor(st.cap - weightOf(v)));
    const cells = places.map(p => `<div class="doll-slot" style="grid-column:${p.col};grid-row:${p.row} / span 2" title="${p.label}">${p.slot
      ? cellHtml(worn.find(i => i.slot === equipSlots.indexOf(p.slot!)), eq, equipSlots.indexOf(p.slot), `slot${p.id}`)
      : `<div class="cell empty locked" aria-disabled="true" aria-label="${p.label}: not used yet"><span class="ph">${icon(`slot${p.id}`)}</span></div>`}</div>`).join('');
    patch(body, `<div class="gear"><div class="doll" style="background-image:${figureArt()}">${cells}`
      + `<div class="doll-box" style="grid-column:1;grid-row:8 / span 2" title="${weightOf(v).toFixed(1)} of ${st.cap} oz carried"><span>Cap</span><b class="num">${free}</b></div>`
      + `<div class="doll-box" style="grid-column:3;grid-row:8 / span 2" title="Gold carried"><span>Gold</span><b class="num">${countOf(v, 'gold')}</b></div></div>`
      + `<div class="doll-ctl" role="group" aria-label="Fighting">${modes.map(([k, g, tip]) => `<button type="button" class="ibtn btn big" data-mode="${k}" aria-pressed="${s.fightMode === k}" aria-label="${esc(tip)}" title="${esc(tip)}">${glyph(`m-${g}`)}</button>`).join('')}`
      + `<button type="button" class="ibtn btn big gap" data-chase aria-pressed="${s.chase}" aria-label="${s.chase ? 'Chase: you follow your target' : 'Stand: you hold your place'}" title="${s.chase ? 'Chase: you follow your target. Click to stand your ground.' : 'Stand: you hold your place. Click to chase your target.'}">${glyph(s.chase ? 'm-chase' : 'm-stand')}</button>`
      + `<button type="button" class="ibtn btn big gap" data-open="options" aria-label="Options" title="Options">${glyph('m-options')}</button><button type="button" class="ibtn btn big" data-open="logout" aria-label="Log out" title="Log out">${glyph('m-logout')}</button></div></div>`);
  },
};
document.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-mode], [data-chase]'), v = core.view;
  if (!t || !v) return;
  if (t.dataset.mode) core.send({ kind: 'mode', fight: t.dataset.mode as 'offensive' | 'balanced' | 'defensive' });
  else core.send({ kind: 'mode', chase: !v.self.chase });
});
