// The battle list: every creature on your floor near enough to fight, in the order it came into view (rows do not jump
// under the pointer). Name and a stepped health bar; your target is framed. Click to attack or stop, Shift+click to
// look, right-click for the menu.
import { balance, core, distance } from './core.ts';
import { bar, esc, patch } from './kit.ts';
import { openMenu } from './menu.ts';
import type { WinSpec } from './column.ts';
import { attack, foeMenu, look } from './world-input.ts';

const seen: string[] = [];
type Row = { id: string; name: string; hp?: number; max?: number; at: { x: number; y: number; z: number } };
function rows(): Row[] {
  const v = core.view!, self = v.self, mobs = balance.creatures;
  const near = (p: { x: number; y: number; z: number }) => p.z === self.z && distance(p, self) <= 8;
  const list: Row[] = [
    ...v.monsters.filter(m => m.hp > 0 && near(m)).map(m => ({ id: m.id, name: mobs[m.kind].name, hp: m.hp, max: mobs[m.kind].hp, at: m })),
    ...(v.shades ?? []).filter(near).map(s => ({ id: s.id, name: 'Something', at: s })),
  ];
  const ids = new Set(list.map(r => r.id));
  for (let i = seen.length - 1; i >= 0; i--) if (!ids.has(seen[i])) seen.splice(i, 1);
  for (const r of list) if (!seen.includes(r.id)) seen.push(r.id);
  return list.sort((a, b) => seen.indexOf(a.id) - seen.indexOf(b.id));
}

export const battleWindow: WinSpec = {
  id: 'battle', title: 'Battle', icon: 'w-battle',
  render(body) {
    const list = rows(), target = core.view!.self.target;
    patch(body, list.length ? `<ul class="battle">${list.map(r => `<li><button type="button" class="b-row" data-foe="${r.id}" aria-pressed="${target === r.id}" aria-label="${esc(r.name)}${r.max ? `, ${Math.round((r.hp! / r.max) * 100)}% health` : ''}"><span class="b-name">${esc(r.name)}</span>${r.max ? bar('foe', r.hp!, r.max, `${r.name} health`) : '<span class="bar foe unknown"></span>'}</button></li>`).join('')}</ul>` : '<p class="muted">Nothing hostile nearby.</p>');
  },
};
const rowOf = (t: EventTarget | null) => (t as HTMLElement).closest?.<HTMLElement>('[data-foe]');
document.addEventListener('click', e => {
  const b = rowOf(e.target), r = b && rows().find(x => x.id === b.dataset.foe);
  if (!r) return;
  if (e.shiftKey) look(r.at, r.id); else attack(r.id);
});
document.addEventListener('contextmenu', e => {
  const b = rowOf(e.target); if (!b) return;
  e.preventDefault();
  const m = foeMenu(b.dataset.foe!); if (m) openMenu(e.clientX, e.clientY, m);
});
