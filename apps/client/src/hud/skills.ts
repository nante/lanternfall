// Skills (each with a stepped bar to its next level, then experience and deaths) and Spells and tasks.
import type { SpellId } from '../../../../packages/game/src/model.ts';
import { balance, core, countOf, rules, stats } from './core.ts';
import { bar, esc, patch } from './kit.ts';
import { icon } from '../icons.ts';
import type { WinSpec } from './column.ts';

export const skillsWindow: WinSpec = {
  id: 'skills', title: 'Skills', icon: 'w-skills',
  render(body) {
    const v = core.view!, s = v.self, st = stats(v), hi = rules.xpAt(st.level + 1);
    const row = (label: string, k: { level: number; progress: number }) => `<li><span>${label}</span><b class="num">${k.level}</b>${bar('skill', k.progress, 1, `${label}: ${Math.floor(k.progress * 100)}% to level ${k.level + 1}`)}</li>`;
    const plain = (label: string, value: string) => `<li class="plain"><span>${label}</span><b class="num">${value}</b></li>`;
    patch(body, `<ul class="skills">${row('Melee', st.melee)}${row('Shielding', st.shielding)}${row('Magic', st.magic)}</ul>`
      + `<ul class="skills sub">${plain('Experience', s.xp.toLocaleString('en'))}${plain(`To level ${st.level + 1}`, (hi - s.xp).toLocaleString('en'))}${plain('Deaths', String(s.deaths))}</ul>`);
  },
};

export const journalWindow: WinSpec = {
  id: 'journal', title: 'Spells and tasks', icon: 'w-journal',
  render(body) {
    const v = core.view!, s = v.self, st = stats(v), spells = balance.spells;
    const task = s.quests.shells === 1 ? `<li><b>Glaze for the shrine</b><span>Bring Sister Wren 5 beetle shells. You carry ${countOf(v, 'shell')}.</span></li>`
      : s.quests.shells === 2 ? '<li class="done"><b>Glaze for the shrine</b><span>Done.</span></li>' : '<li class="muted"><span>Ask Sister Wren for a task.</span></li>';
    patch(body, `<ul class="spells">${(Object.keys(spells) as SpellId[]).map(id => { const sp = spells[id], locked = st.level < sp.level; return `<li class="${locked ? 'locked' : ''}"><span class="sp-ico">${icon(id)}</span><b>${esc(sp.name)}</b><span>“${esc(sp.words)}” · ${sp.mana} mana${locked ? ` · level ${sp.level}` : ''}</span></li>`; }).join('')}</ul>`
      + `<h3 class="banner"><span>Tasks</span></h3><ul class="tasks">${task}</ul>`);
  },
};
