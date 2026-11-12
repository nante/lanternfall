// Edge's tab rail, on the left edge: one labelled button per window. The essentials (map, hero, pack, battle) start open
// in the right column and the rail toggles them; the rare ones (skills, spells and tasks) are summoned beside the rail,
// one at a time. It lives on the body, above the windows, so it can sit inset in the pane it opens. Health and mana
// stand over the action bar under the hero's name, and open the equipment window when clicked.
import { core, distance, stats } from './core.ts';
import { $, art, bar, esc, glyph, patch } from './kit.ts';
import { closeTip, showTip } from './tooltip.ts';

const items = [
  { id: 'map', label: 'Map', tab: 'Map', key: 'M', icon: 'w-map' },
  { id: 'gear', label: 'Equipment', tab: 'Gear', key: 'G', icon: 'w-status' },
  { id: 'pack', label: 'Pack', tab: 'Pack', key: 'I', icon: 'w-pack' },
  { id: 'battle', label: 'Battle', tab: 'Battle', key: 'B', icon: 'w-battle' },
  { id: 'skills', label: 'Skills', tab: 'Skills', key: 'C', icon: 'w-skills' },
  { id: 'journal', label: 'Spells and tasks', tab: 'Spells', key: 'J', icon: 'w-journal' },
  { id: 'menu', label: 'Menu', tab: 'Menu', key: 'Esc', icon: 'm-options' },
];
let o: { isOpen: (id: string) => boolean; toggle: (id: string) => void };

export function mountDock(opts: typeof o) {
  o = opts;
  document.body.insertAdjacentHTML('beforeend', '<nav class="dock frame" id="dock" aria-label="Windows"></nav>');
  $('#viewport').insertAdjacentHTML('beforeend', '<button type="button" class="vitals" id="vitals" aria-label="Your hero"></button>');
  const dock = $('#dock');
  dock.addEventListener('click', e => { const id = (e.target as HTMLElement).closest<HTMLElement>('[data-dock]')?.dataset.dock; if (id) { closeTip(); o.toggle(id); drawDock(); } });
  dock.addEventListener('pointerover', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-dock]'), it = b && items.find(i => i.id === b.dataset.dock);
    if (b && it) showTip(b, `<div class="tip-row"><b>${esc(it.label)}</b><kbd>${it.key}</kbd></div>`);
  });
  dock.addEventListener('pointerout', e => { if ((e.target as HTMLElement).closest('[data-dock]')) closeTip(); });
  $('#vitals').addEventListener('click', () => { o.toggle('gear'); drawDock(); });
}

export function drawDock() {
  const v = core.view;
  if (!v) return;
  const s = v.self, st = stats(v);
  const foes = v.monsters.some(m => m.hp > 0 && m.z === s.z && distance(m, s) <= 8);
  patch($('#dock'), items.map(i => {
    const open = o.isOpen(i.id);
    return `<button type="button" class="ibtn dock-btn" data-dock="${i.id}" aria-pressed="${open}" aria-label="${esc(i.label)} (${i.key})"${i.id === 'battle' && foes && !open ? ' data-alert="true"' : ''}>${i.icon.startsWith('m-') ? glyph(i.icon) : art(i.icon)}<span class="dock-tab" aria-hidden="true">${i.tab}</span></button>`;
  }).join(''));
  patch($('#vitals'), `<b class="v-name">${esc(s.name)}</b><span class="v-sub">Level <span class="num">${st.level}</span></span>`
    + bar('hp', s.hp, st.maxHp, 'Health', `${Math.max(0, s.hp)}/${st.maxHp}`) + bar('mp', s.mana, st.maxMana, 'Mana', `${Math.max(0, s.mana)}/${st.maxMana}`));
}
