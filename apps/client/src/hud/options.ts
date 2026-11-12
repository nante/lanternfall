// The pause menu (Escape, or Options): interface scale, names over heads, window layout, the controls; and the log
// out confirmation, refused while a fight keeps you here.
import { core, inPz } from './core.ts';
import { $, grid, setScale, type ScaleSetting } from './kit.ts';
import { musicVolume, setMusicVolume } from '../audio/music.ts';

const controls: [string, string][] = [
  ['Click ground', 'Walk there. Hold and move the pointer to keep walking. <kbd>Esc</kbd> stops'],
  ['Right-click', 'Everything you can do with it: look, attack, talk, open, use'],
  ['Shift+click', 'Look at it'],
  ['Click a creature', 'Attack it. <kbd>Space</kbd> picks the nearest'],
  ['Click a person', 'Talk. Ask about the words they offer'],
  ['Click a body', 'Open it'],
  ['Drag', 'Move items between slots, windows and the world. Push what stands beside you'],
  ['Drop a stack', 'Asks how many. <kbd>Ctrl</kbd> moves all of it, <kbd>Shift</kbd> one'],
  ['Pack items', 'Click to pick, double-click to eat, drink, wear or open'],
  ['<kbd>WASD</kbd> or arrows', 'Step. Numpad <kbd>7</kbd> <kbd>9</kbd> <kbd>1</kbd> <kbd>3</kbd> step diagonally'],
  ['<kbd>1</kbd>–<kbd>7</kbd>', 'Spells, tonics, food'],
  ['<kbd>I</kbd> · <kbd>C</kbd>', 'Open or close the pack · the skills window'],
  ['Window headers', 'Drag to rearrange. Drag the bottom edge to resize'],
  ['<kbd>-</kbd> · <kbd>=</kbd>', 'Lower · raise the view; the wheel does the same'],
  ['<kbd>Q</kbd> · <kbd>E</kbd>', 'Turn the view in Third and First person'],
  ['<kbd>V</kbd>', 'Vista: look out over the land, under open sky'],
];

export const fightLocked = () => { const v = core.view; return !!v && v.self.combatUntil > v.time && !inPz(v.self); };
let leaveFn: () => void = () => {};
let resetFn: () => void = () => {};
export function mountOptions(o: { leave: () => void; resetLayout: () => void }) {
  leaveFn = o.leave; resetFn = o.resetLayout;
  document.body.insertAdjacentHTML('beforeend', `<dialog class="menu frame" id="menu" aria-labelledby="menu-title"></dialog>`);
  const d = $<HTMLDialogElement>('#menu');
  d.addEventListener('click', e => {
    const t = e.target as HTMLElement, b = t.closest<HTMLElement>('[data-m]');
    if (t === d) return d.close();
    if (!b) return;
    const a = b.dataset.m!;
    if (a === 'resume' || a === 'stay') d.close();
    else if (a === 'leave') { d.close(); leaveFn(); }
    else if (a === 'reset') { resetFn(); d.close(); }
    else if (a === 'controls') { d.querySelector('.help')?.toggleAttribute('hidden'); }
    else if (a.startsWith('scale:')) { const s = a.slice(6); setScale(s === 'auto' ? 'auto' : (Number(s) as ScaleSetting)); draw('pause'); }  });
  // Volume follows the slider live; the menu is not redrawn, so the drag is never interrupted.
  d.addEventListener('input', e => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.m !== 'music') return;
    setMusicVolume(Number(t.value));
    t.nextElementSibling!.textContent = String(musicVolume());
  });
  d.addEventListener('change', e => { const t = e.target as HTMLInputElement; if (t.dataset.m === 'names') core.world.labels.classList.toggle('names', t.checked); });
  document.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-open]'); if (b) openMenu(b.dataset.open === 'logout' ? 'logout' : 'pause'); });
}
export const menuIsOpen = () => !!document.querySelector<HTMLDialogElement>('#menu')?.open;
export function openMenu(kind: 'pause' | 'logout') { draw(kind); const d = $<HTMLDialogElement>('#menu'); if (!d.open) d.showModal(); d.querySelector<HTMLElement>('[autofocus], button')?.focus(); }

function draw(kind: 'pause' | 'logout') {
  const d = $<HTMLDialogElement>('#menu');
  if (kind === 'logout') {
    d.innerHTML = `<header class="w-head"><h2 id="menu-title">Log out</h2></header><div class="menu-body">`
      + (fightLocked() ? '<p>You are in a fight. Wait for it to end, or step into a shrine.</p></div><div class="w-foot"><button type="button" class="btn primary" data-m="stay" autofocus>Stay</button></div>'
        : '<p>Save and leave Lanternfall?</p></div><div class="w-foot"><button type="button" class="btn" data-m="stay">Stay</button><button type="button" class="btn primary" data-m="leave" autofocus>Save and leave</button></div>');
    return;
  }
  const scales: [ScaleSetting, string][] = [['auto', 'Auto'], [1, '1×'], [2, '2×'], [3, '3×']];
  d.innerHTML = `<header class="w-head"><h2 id="menu-title">Paused</h2></header><div class="menu-body">`
    + `<h3 class="banner"><span>Interface</span></h3>`
    + `<div class="opt"><span>Scale</span><span class="seg" role="radiogroup" aria-label="Interface scale">${scales.map(([s, l]) => `<button type="button" class="btn small" role="radio" aria-checked="${grid.setting === s}" data-m="scale:${s}">${l}</button>`).join('')}</span></div>`
    + `<label class="opt"><span>Names and health over everyone</span><input type="checkbox" class="check" data-m="names" ${core.world.labels.classList.contains('names') ? 'checked' : ''}></label>`
    + `<div class="opt"><span>Windows</span><button type="button" class="btn small" data-m="reset">Reset layout</button></div>`
    + `<h3 class="banner"><span>Sound</span></h3>`
    + `<label class="opt"><span>Music</span><span class="volume"><input type="range" min="0" max="100" step="1" value="${musicVolume()}" data-m="music" aria-label="Music volume"><output>${musicVolume()}</output></span></label>`
    + `<h3 class="banner"><span>Controls</span></h3><dl class="help">${controls.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`
    + `</div><div class="w-foot"><button type="button" class="btn" data-m="leave">Save and leave</button><button type="button" class="btn primary" data-m="resume" autofocus>Resume</button></div>`;
}
