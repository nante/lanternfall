// The equipment window: a figure with a framed slot for each thing worn, capacity and gold beside it, then the fight
// mode, chase or stand, and the Options and Log out buttons. Slots are placed from a table, on a grid of half-slot
// rows (side slots sit half a slot lower than the centre ones), so more slots can be added as rows of the table.
import type { EquipSlot } from '../../../../packages/game/src/model.ts';
import { equipSlots } from '../../../../packages/game/src/model.ts';
import { core, countOf, equipKey, kids, stats, weightOf } from './core.ts';
import { ICON, esc, patch } from './kit.ts';
import { cellHtml } from './items.ts';
import type { WinSpec } from './column.ts';
import { icon } from '../icons.ts';

/** col 1 left, 2 centre, 3 right; row counts half slots from the top. */
const dollSlots: { slot: EquipSlot; col: 1 | 2 | 3; row: number; label: string }[] = [
  { slot: 'head', col: 2, row: 1, label: 'Head' },
  { slot: 'body', col: 2, row: 3, label: 'Body' },
  { slot: 'feet', col: 2, row: 5, label: 'Feet' },
  { slot: 'pack', col: 3, row: 2, label: 'Pack' },
  { slot: 'weapon', col: 1, row: 4, label: 'Weapon' },
  { slot: 'shield', col: 3, row: 4, label: 'Shield' },
];
const modes: [string, string, string][] = [['offensive', 'Attack', 'Hit harder, block less'], ['balanced', 'Balance', 'Even hits and blocks'], ['defensive', 'Defend', 'Hit softer, block much more']];

/** A faint standing figure behind the slots, drawn for the current slot size (UI pixels). */
let figure = '';
function figureArt() {
  if (figure) return figure;
  const c = ICON + 4, g = 2, half = (c + g) / 2, w = 3 * c + 2 * g, h = 7 * half;
  const r = (x: number, y: number, rw: number, rh: number) => `<rect x='${Math.round(x)}' y='${Math.round(y)}' width='${Math.round(rw)}' height='${Math.round(rh)}'/>`;
  const cx = w / 2;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}' shape-rendering='crispEdges' fill='%231e2646'>`
    + r(cx - c * 0.15, c, c * 0.3, half) // neck
    + r(c * 0.5, half * 3 - 2, w - c, 4) // shoulders
    + r(c * 0.4, half * 3, 4, half * 2) + r(w - c * 0.4 - 4, half * 3, 4, half * 2) // arms
    + r(cx - c * 0.35, half * 4 + c * 0.5, c * 0.25, half * 2) + r(cx + c * 0.1, half * 4 + c * 0.5, c * 0.25, half * 2) // legs
    + '</svg>';
  figure = `url("data:image/svg+xml,${svg.replace(/[<>#"]/g, encodeURIComponent)}")`;
  return figure;
}

export const dollWindow: WinSpec = {
  id: 'gear', title: 'Equipment', icon: 'w-gear', fixed: true, kind: 'gear',
  render(body) {
    const v = core.view!, s = v.self, st = stats(v), eq = equipKey(v), worn = kids(v, eq);
    const free = Math.max(0, Math.floor(st.cap - weightOf(v)));
    const cells = dollSlots.map(d => `<div class="doll-slot" style="grid-column:${d.col};grid-row:${d.row} / span 2">${cellHtml(worn.find(i => i.slot === equipSlots.indexOf(d.slot)), eq, equipSlots.indexOf(d.slot), `ph-${d.slot}`)}</div>`).join('');
    patch(body, `<div class="doll" style="background-image:${figureArt()}">${cells}`
      + `<div class="doll-box" style="grid-column:1;grid-row:6 / span 2" title="${weightOf(v).toFixed(1)} of ${st.cap} oz carried"><span>Cap</span><b class="num">${free}</b></div>`
      + `<div class="doll-box gold" style="grid-column:3;grid-row:6 / span 2" title="Gold carried"><span>${icon('gold')}</span><b class="num">${countOf(v, 'gold')}</b></div></div>`
      + `<div class="seg" role="group" aria-label="Fight mode">${modes.map(([k, l, tip]) => `<button type="button" class="btn" data-mode="${k}" aria-pressed="${s.fightMode === k}" title="${esc(tip)}">${l}</button>`).join('')}</div>`
      + `<div class="seg"><button type="button" class="btn" data-chase aria-pressed="${s.chase}" title="${s.chase ? 'You follow your target. Click to stand your ground.' : 'You hold your place. Click to chase your target.'}">${s.chase ? 'Chase' : 'Stand'}</button></div>`
      + `<div class="seg"><button type="button" class="btn" data-open="options">Options</button><button type="button" class="btn" data-open="logout">Log out</button></div>`);
  },
};
document.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('[data-mode], [data-chase]'), v = core.view;
  if (!t || !v) return;
  if (t.dataset.mode) core.send({ kind: 'mode', fight: t.dataset.mode as 'offensive' | 'balanced' | 'defensive' });
  else core.send({ kind: 'mode', chase: !v.self.chase });
});
