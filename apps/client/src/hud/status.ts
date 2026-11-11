// The hero's status: name and level, health and mana as stepped bars, experience to the next level, and status icons
// (in a fight, hungry, in a protected place, a lit torch), each with a tooltip.
import { core, inPz, rules, stats } from './core.ts';
import { art, bar, esc } from './kit.ts';
import { showTip, closeTip } from './tooltip.ts';

type Flag = { id: string; art: string; label: string; tip: string };
function flags(): Flag[] {
  const v = core.view!, s = v.self, out: Flag[] = [];
  if (s.combatUntil > v.time) out.push({ id: 'combat', art: 'st-combat', label: 'In a fight', tip: `You cannot log out for ${Math.ceil((s.combatUntil - v.time) / 1000)} s, unless you step into a shrine.` });
  if (s.fed <= 0) out.push({ id: 'hungry', art: 'st-hungry', label: 'Hungry', tip: 'You do not regain health or mana. Eat something.' });
  if (inPz(s)) out.push({ id: 'pz', art: 'st-protected', label: 'Protected', tip: 'Within the Lantern’s ward: no one can attack here, and you may log out.' });
  if (s.worn?.shield === 'torch') out.push({ id: 'torch', art: 'st-torch', label: 'Torch lit', tip: 'Your torch lights the way around you.' });
  return out;
}

/** Health, mana, level and experience, and the status icons: the top of the hero's window. */
export function statusHtml() {
  const v = core.view!, s = v.self, st = stats(v), lo = rules.xpAt(st.level), hi = rules.xpAt(st.level + 1), f = flags();
  const pct = Math.floor(((s.xp - lo) / (hi - lo)) * 100);
  return `<div class="st-bars">${bar('hp', s.hp, st.maxHp, 'Health', `${Math.max(0, s.hp)}/${st.maxHp}`)}${bar('mp', s.mana, st.maxMana, 'Mana', `${Math.max(0, s.mana)}/${st.maxMana}`)}</div>`
    + `<div class="st-xp" title="${(hi - s.xp).toLocaleString('en')} experience to level ${st.level + 1}"><span class="st-lvl">Level <b class="num">${st.level}</b></span>${bar('xp', s.xp - lo, hi - lo, 'Experience to the next level')}<span class="num">${pct}%</span>`
    + `<ul class="st-flags" aria-label="Conditions">${f.map(x => `<li tabindex="0" data-flag="${x.id}" aria-label="${esc(x.label)}: ${esc(x.tip)}">${art(x.art)}</li>`).join('')}</ul></div>`;
}
document.addEventListener('pointerover', e => {
  const li = (e.target as HTMLElement).closest<HTMLElement>('[data-flag]');
  const f = li && core.view && flags().find(x => x.id === li.dataset.flag);
  if (li && f) showTip(li, `<b>${esc(f.label)}</b><span>${esc(f.tip)}</span>`);
});
document.addEventListener('pointerout', e => { if ((e.target as HTMLElement).closest('[data-flag]')) closeTip(); });
