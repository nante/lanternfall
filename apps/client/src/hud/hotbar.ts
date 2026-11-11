// The action bar, keys 1 to 7: spells, tonics, food. Slots show their key, how many you carry, and the cooldown as a
// stepped wipe. It sits beside the console tabs, off the world.
import type { ItemKind, SpellId } from '../../../../packages/game/src/model.ts';
import { balance, core, countOf, itemDef, serverNow, stats } from './core.ts';
import { $, esc, grid } from './kit.ts';
import { icon } from '../icons.ts';
import { closeTip, showTip } from './tooltip.ts';

type Slot = { label: string; sub: string; icon: string; disabled: boolean; cooldown: number; count?: number; run: () => void };
export function hotbarSlots(): Slot[] {
  const v = core.view;
  if (!v) return [];
  const st = stats(v), self = v.self, cd = Math.max(0, self.spellAt - serverNow());
  const spell = (id: SpellId): Slot => { const sp = balance.spells[id], locked = st.level < sp.level; return { label: sp.name, sub: locked ? `Level ${sp.level}` : `${sp.mana} mana · “${sp.words}”`, icon: id, disabled: locked || self.mana < sp.mana, cooldown: cd / sp.cooldown, run: () => core.send({ kind: 'cast', spell: id }) }; };
  const item = (kind: ItemKind, label: string): Slot => { const n = countOf(v, kind); return { label, sub: itemDef(kind).name, icon: itemDef(kind).icon, disabled: !n, cooldown: kind === 'tonic' || kind === 'tincture' ? cd / 1000 : 0, count: n, run: () => core.send({ kind: 'useKind', item: kind }) }; };
  const food = countOf(v, 'cheese') ? 'cheese' : 'loaf';
  return [spell('mend'), spell('ember'), spell('renew'), item('tonic', 'Tonic'), item('tincture', 'Tincture'), { ...item(food, 'Eat'), disabled: !countOf(v, 'cheese') && !countOf(v, 'loaf') }, spell('cinderburst')];
}
export function runSlot(i: number) { const s = hotbarSlots()[i]; if (s && !s.disabled) s.run(); }

export function mountHotbar(host: HTMLElement) {
  host.innerHTML = Array.from({ length: 7 }, (_, i) => `<button type="button" class="hb cell" data-hb="${i}"><span class="item"></span><span class="cd"></span><kbd>${i + 1}</kbd><span class="n num"></span></button>`).join('');
  host.addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-hb]'); if (b) runSlot(Number(b.dataset.hb)); });
  host.addEventListener('pointerover', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-hb]'), s = b && hotbarSlots()[Number(b.dataset.hb)]; if (b && s) showTip(b, `<b>${esc(s.label)}</b><span>${esc(s.sub)}</span><span class="tip-how">Key ${Number(b.dataset.hb) + 1}</span>`); });
  host.addEventListener('pointerout', closeTip);
}
/** Ten times a second: only attributes and text change, never the slots themselves. */
export function drawHotbar() {
  const host = $('#hotbar'), slots = hotbarSlots(), inner = grid.u * (Number(getComputedStyle(host).getPropertyValue('--cell')) || 20);
  slots.forEach((s, i) => {
    const b = $<HTMLElement>(`[data-hb="${i}"]`, host);
    if (b.dataset.icon !== s.icon) { $('.item', b).innerHTML = icon(s.icon); b.dataset.icon = s.icon; }
    const label = `${s.label}, ${s.sub}`;
    if (b.getAttribute('aria-label') !== label) b.setAttribute('aria-label', label);
    b.classList.toggle('off', s.disabled);
    b.setAttribute('aria-disabled', String(s.disabled));
    const n = s.count !== undefined ? String(s.count) : '';
    const ne = $('.n', b); if (ne.textContent !== n) ne.textContent = n;
    // The wipe falls in whole UI pixels.
    const h = `${Math.ceil((Math.min(1, s.cooldown) * inner) / grid.u) * grid.u}px`;
    const cd = $('.cd', b); if (cd.style.height !== h) cd.style.height = h;
  });
}
