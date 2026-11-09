import type { Balance } from '../../../packages/game/src/content-schema.ts';
import { itemKinds, mobKinds, spellIds, type ItemKind, type MobKind, type SpellId } from '../../../packages/game/src/ids.ts';
import { createRules } from '../../../packages/game/src/rules.ts';
import { iconSvg } from '../../../packages/game/src/icon-svg.ts';
import type { Store } from './store.ts';
import { h, svg, numberField, textField, fmt, pct, later } from './ui.ts';
import { cashPerKill, killsToAfford, sellersOf, buyersOf, roleNames } from './economy.ts';

export type View = { el: HTMLElement; update?: () => void; destroy?: () => void };
type Ctx = { store: Store; select: (id: string) => void; selected: string | null; go: (route: string) => void };

const bal = (s: Store) => s.get('balance');
const issueAt = (s: Store, path: string) => bal(s).issues.find(i => i.path === path)?.message;
const icon = (s: Store, name: string) => { const icons = s.docs.icons?.draft; const def = icons?.[name]; return def ? svg(iconSvg(def)) : h('span', { class: 'noicon' }); };

function listDetail(ctx: Ctx, rows: { id: string; label: string; sub: string; icon?: string; group?: string }[], detail: (id: string) => HTMLElement, aside?: (id: string) => HTMLElement) {
  const selected = rows.some(r => r.id === ctx.selected) ? ctx.selected! : rows[0].id;
  const search = h('input', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter list', autocomplete: 'off' });
  const list = h('ul', { class: 'records', role: 'listbox', 'aria-label': 'Records' });
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    list.replaceChildren();
    let group = '';
    for (const r of rows) {
      if (q && !`${r.label} ${r.id} ${r.sub}`.toLowerCase().includes(q)) continue;
      if (r.group && r.group !== group) { group = r.group; list.append(h('li', { class: 'group', role: 'presentation' }, group)); }
      list.append(h('li', { role: 'option', 'aria-selected': r.id === selected, tabindex: r.id === selected ? 0 : -1, onclick: () => ctx.select(r.id), onkeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); ctx.select(r.id); } } },
        r.icon ? h('span', { class: 'ico' }, icon(ctx.store, r.icon)) : null, h('span', { class: 'lbl' }, r.label), h('span', { class: 'sub' }, r.sub)));
    }
  };
  search.addEventListener('input', draw);
  draw();
  const asideEl = h('section', { class: 'derived', 'aria-label': 'Derived numbers' });
  const fillAside = () => { if (aside) asideEl.replaceChildren(aside(selected)); };
  fillAside();
  const el = h('div', { class: `split${aside ? ' three' : ''}` }, h('nav', { class: 'list' }, search, list), h('section', { class: 'detail' }, detail(selected)), aside ? asideEl : null);
  return { el, update: later(fillAside) };
}

// ---------------------------------------------------------------- items
const itemGroup = (b: Balance, k: ItemKind) => { const d = b.items[k]; return d.slot === 'weapon' ? 'Weapons' : d.slot === 'shield' ? 'Shields' : d.slot && d.slot !== 'pack' ? 'Armour' : d.slots ? 'Containers' : d.food || d.heal || d.mana ? 'Food & tonics' : k === 'gold' ? 'Currency' : 'Loot'; };
export function itemsView(ctx: Ctx): View {
  const b = bal(ctx.store).draft;
  const order = ['Weapons', 'Shields', 'Armour', 'Containers', 'Food & tonics', 'Loot', 'Currency'];
  const rows = [...itemKinds].sort((x, y) => order.indexOf(itemGroup(b, x)) - order.indexOf(itemGroup(b, y))).map(k => ({ id: k, label: b.items[k].name, sub: b.items[k].buy ? `${b.items[k].buy} gold` : b.items[k].sell ? `sells ${b.items[k].sell}` : '', icon: b.items[k].icon, group: itemGroup(b, k) }));
  const detail = (id: string) => {
    const k = id as ItemKind, d = bal(ctx.store).draft.items[k], saved = bal(ctx.store).saved.items[k];
    const set = (field: keyof typeof d) => (v: number | string) => ctx.store.edit('balance', x => { (x.items[k] as Record<string, unknown>)[field] = v; }, `items.${k}.${field}`);
    const num = (field: 'weight' | 'buy' | 'sell' | 'attack' | 'defense' | 'armor' | 'slots' | 'heal' | 'mana', label: string, unit?: string, hint?: string) =>
      d[field] === undefined ? null : numberField({ label, unit, hint, value: d[field]!, saved: saved[field], step: field === 'weight' ? 0.5 : 1, min: 0, issue: issueAt(ctx.store, `items.${k}.${field}`), onInput: set(field), round: field !== 'weight' });
    return h('div', { class: 'form' },
      h('header', { class: 'record-head' }, h('span', { class: 'ico big' }, icon(ctx.store, d.icon)), h('div', {}, h('h2', {}, d.name), h('p', { class: 'muted' }, `${id} · ${itemGroup(bal(ctx.store).draft, k)}${d.slot ? ` · ${d.slot} slot` : ''}${d.stack ? ' · stacks' : ''}`))),
      textField({ label: 'Name', value: d.name, saved: saved.name, onInput: set('name'), issue: issueAt(ctx.store, `items.${k}.name`) }),
      h('div', { class: 'grid2' },
        num('buy', 'Shop price', 'gold', 'What a merchant charges'), num('sell', 'Sell value', 'gold', 'What a buyer pays'),
        num('weight', 'Weight', 'oz'), num('attack', 'Attack'), num('defense', 'Block'), num('armor', 'Armour'),
        num('slots', 'Slots'), num('heal', 'Heals', 'hp'), num('mana', 'Restores', 'mana'),
        d.food === undefined ? null : numberField({ label: 'Feeds for', unit: 'min', value: d.food, saved: saved.food, scale: 1 / 60000, step: 0.5, min: 0, issue: issueAt(ctx.store, `items.${k}.food`), round: true, onInput: set('food') })),
      h('p', { class: 'hint-row' }, 'Slot, stacking and which stats an item has are fixed in this version.'));
  };
  const aside = (id: string) => {
    const k = id as ItemKind, b2 = bal(ctx.store).draft, d = b2.items[k];
    const sellers = sellersOf(b2, k), buyers = buyersOf(b2, k);
    const warnings = bal(ctx.store).warnings.filter(w => w.path.startsWith(`items.${k}.`));
    return h('div', {},
      h('h3', {}, 'Trade'),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Sold by'), h('dd', {}, sellers.length ? sellers.map(r => roleNames[r]).join(', ') : 'Nobody'),
        h('dt', {}, 'Bought by'), h('dd', {}, buyers.length ? buyers.map(r => roleNames[r]).join(', ') : 'Nobody'),
        sellers.length && buyers.length ? [h('dt', {}, 'Resale loss'), h('dd', {}, d.buy ? pct(1 - d.sell / d.buy) : '—')] : null),
      warnings.map(w => h('p', { class: 'warn' }, w.message)),
      sellers.length && d.buy ? [h('h3', {}, 'Kills to afford'), h('table', { class: 'mini' }, h('thead', {}, h('tr', {}, h('th', {}, 'Creature'), h('th', { class: 'r' }, 'Coins/kill'), h('th', { class: 'r' }, 'Kills'))),
        h('tbody', {}, mobKinds.map(m => { const c = cashPerKill(b2, m).total; const n = killsToAfford(d.buy, c); return h('tr', {}, h('td', {}, b2.creatures[m].name), h('td', { class: 'r num' }, fmt(c)), h('td', { class: 'r num' }, Number.isFinite(n) ? n : '—')); }))),
      h('p', { class: 'fine' }, 'Coins per kill counts mean gold plus drops a merchant buys, assuming every kill is looted and sold. Food and deaths are not included.')] : null);
  };
  return listDetail(ctx, rows, detail, aside);
}

// ---------------------------------------------------------------- creatures
export function creaturesView(ctx: Ctx): View {
  const b = bal(ctx.store).draft;
  const rows = mobKinds.map(k => ({ id: k, label: b.creatures[k].name, sub: `${b.creatures[k].hp} hp · ${b.creatures[k].xp} xp` }));
  const detail = (id: string) => {
    const k = id as MobKind, d = bal(ctx.store).draft.creatures[k], saved = bal(ctx.store).saved.creatures[k];
    const edit = (fn: (c: typeof d) => void, key: string) => ctx.store.edit('balance', x => fn(x.creatures[k]), `creatures.${k}.${key}`);
    const num = (field: 'hp' | 'armor' | 'attack' | 'xp' | 'step' | 'aggro', label: string, unit?: string, hint?: string) => numberField({ label, unit, hint, value: d[field], saved: saved[field], min: 0, step: field === 'step' ? 20 : 1, round: true, issue: issueAt(ctx.store, `creatures.${k}.${field}`), onInput: v => edit(c => { c[field] = v; }, field) });
    const loot = h('div', { class: 'loot' });
    const drawLoot = () => {
      const cur = bal(ctx.store).draft.creatures[k];
      loot.replaceChildren(
        h('table', { class: 'mini edit' }, h('thead', {}, h('tr', {}, h('th', {}, 'Drop'), h('th', { class: 'r' }, 'Chance'), h('th', {}, ''))),
          h('tbody', {}, cur.loot.map((l, i) => h('tr', {},
            h('td', {}, h('select', { 'aria-label': 'Dropped item', onchange: (e: Event) => { edit(c => { c.loot[i].item = (e.target as HTMLSelectElement).value as ItemKind; }, `loot${i}item`); drawLoot(); } }, itemKinds.map(it => h('option', { value: it, selected: it === l.item }, bal(ctx.store).draft.items[it].name)))),
            h('td', { class: 'r' }, numberField({ label: '', value: l.chance, saved: saved.loot[i]?.item === l.item ? saved.loot[i].chance : undefined, percent: true, unit: '%', step: 1, min: 0, issue: issueAt(ctx.store, `creatures.${k}.loot.${i}.chance`), onInput: v => edit(c => { c.loot[i].chance = v; }, `loot${i}`) })),
            h('td', {}, h('button', { class: 'icon-btn', 'aria-label': `Remove ${l.item} drop`, onclick: () => { edit(c => { c.loot.splice(i, 1); }, `loot-remove${i}`); drawLoot(); } }, '×')))))),
        h('button', { class: 'ghost', onclick: () => { const used = new Set(bal(ctx.store).draft.creatures[k].loot.map(l => l.item)); const next = itemKinds.find(it => !used.has(it) && it !== 'gold'); if (next) { edit(c => { c.loot.push({ item: next, chance: 0.1 }); }, 'loot-add'); drawLoot(); } } }, 'Add drop'));
    };
    drawLoot();
    return h('div', { class: 'form' },
      h('header', { class: 'record-head' }, h('div', {}, h('h2', {}, d.name), h('p', { class: 'muted' }, id))),
      textField({ label: 'Name', value: d.name, saved: saved.name, onInput: v => edit(c => { c.name = v; }, 'name') }),
      h('div', { class: 'grid3' }, num('hp', 'Health', 'hp'), num('attack', 'Attack', '', 'Max raw hit'), num('armor', 'Armour', '', 'Soaks player hits'),
        num('xp', 'Experience', 'xp'), num('step', 'Move delay', 'ms', 'Per tile'), num('aggro', 'Aggro range', 'tiles'),
        numberField({ label: 'Gold min', value: d.gold[0], saved: saved.gold[0], min: 0, round: true, issue: issueAt(ctx.store, `creatures.${k}.gold`), onInput: v => edit(c => { c.gold[0] = v; }, 'gold0') }),
        numberField({ label: 'Gold max', value: d.gold[1], saved: saved.gold[1], min: 0, round: true, onInput: v => edit(c => { c.gold[1] = v; }, 'gold1') })),
      h('h3', {}, 'Drops'), h('p', { class: 'hint-row' }, 'Each drop rolls on its own; chances do not need to add up to 100%.'), loot);
  };
  const aside = (id: string) => {
    const k = id as MobKind, b2 = bal(ctx.store).draft, c = b2.creatures[k], cash = cashPerKill(b2, k);
    return h('div', {},
      h('h3', {}, 'Per kill'),
      h('dl', { class: 'facts' },
        h('dt', {}, 'Mean gold'), h('dd', { class: 'num' }, fmt(cash.gold)),
        cash.drops.map(d => [h('dt', {}, b2.items[d.item].name), h('dd', { class: 'num' }, d.sold ? `${fmt(d.value, 2)} (${pct(d.chance)} × ${b2.items[d.item].sell})` : `${pct(d.chance)}, nobody buys`)]),
        h('dt', { class: 'strong' }, 'Coins per kill'), h('dd', { class: 'num strong' }, fmt(cash.total, 2)),
        h('dt', {}, 'Experience per hp'), h('dd', { class: 'num' }, fmt(c.xp / c.hp, 2))),
      h('button', { class: 'primary wide', onclick: () => ctx.go(`simulate?mob=${k}`) }, `Simulate fights vs ${c.name}`),
      h('p', { class: 'fine' }, 'Time to kill, damage taken and win rate come from the simulator, which runs the real engine.'));
  };
  return listDetail(ctx, rows, detail, aside);
}

// ---------------------------------------------------------------- spells
export function spellsView(ctx: Ctx): View {
  const b = bal(ctx.store).draft;
  const rows = spellIds.map(k => ({ id: k, label: b.spells[k].name, sub: `“${b.spells[k].words}” · level ${b.spells[k].level}`, icon: k }));
  const detail = (id: string) => {
    const k = id as SpellId, d = bal(ctx.store).draft.spells[k], saved = bal(ctx.store).saved.spells[k];
    const edit = (field: string, v: number | string) => ctx.store.edit('balance', x => { (x.spells[k] as Record<string, unknown>)[field] = v; }, `spells.${k}.${field}`);
    const num = (field: 'mana' | 'level' | 'cooldown' | 'base' | 'perLevel' | 'perMagic', label: string, unit?: string, step = 1) => numberField({ label, unit, value: d[field], saved: saved[field], min: 0, step, issue: issueAt(ctx.store, `spells.${k}.${field}`), onInput: v => edit(field, v) });
    return h('div', { class: 'form' },
      h('header', { class: 'record-head' }, h('span', { class: 'ico big' }, icon(ctx.store, k)), h('div', {}, h('h2', {}, d.name), h('p', { class: 'muted' }, `${d.kind === 'heal' ? 'Heals the caster' : d.kind === 'area' ? 'Burns every creature around the caster' : 'Damages the target'} · say “${d.words}”`))),
      h('div', { class: 'grid2' }, textField({ label: 'Name', value: d.name, saved: saved.name, onInput: v => edit('name', v) }), textField({ label: 'Spoken words', value: d.words, saved: saved.words, issue: issueAt(ctx.store, `spells.${k}.words`), onInput: v => edit('words', v) })),
      h('div', { class: 'grid3' }, num('level', 'Unlocks at level'), num('mana', 'Mana cost', 'mana'), num('cooldown', 'Cooldown', 'ms', 100),
        num('base', 'Base power', d.kind === 'heal' ? 'hp' : 'dmg'), num('perLevel', 'Per level', '', 0.5), num('perMagic', 'Per magic level', '', 0.5),
        d.kind === 'heal'
          ? numberField({ label: 'Random bonus', hint: 'Fraction of power', value: d.spread, saved: saved.spread, percent: true, unit: '%', min: 0, issue: issueAt(ctx.store, `spells.${k}.spread`), onInput: v => edit('spread', v) })
          : numberField({ label: 'Random bonus', hint: 'Up to this many points', value: d.spread, saved: saved.spread, unit: 'dmg', min: 0, round: true, issue: issueAt(ctx.store, `spells.${k}.spread`), onInput: v => edit('spread', v) }),
        d.kind === 'attack' ? numberField({ label: 'Range', unit: 'tiles', value: d.range, saved: saved.kind === 'attack' ? saved.range : undefined, min: 1, round: true, onInput: v => edit('range', v) }) : null,
        d.kind === 'area' ? numberField({ label: 'Radius', unit: 'tiles', hint: 'Around the caster', value: d.radius, saved: saved.kind === 'area' ? saved.radius : undefined, min: 1, round: true, onInput: v => edit('radius', v) }) : null));
  };
  const aside = (id: string) => {
    const k = id as SpellId, d = bal(ctx.store).draft.spells[k];
    const levels = [...new Set([d.level, 5, 10, 20].filter(l => l >= d.level))];
    const range = (l: number, m: number) => { const p = d.base + l * d.perLevel + m * d.perMagic; const extra = d.kind === 'heal' ? Math.floor(p * d.spread) : d.spread; return `${fmt(Math.floor(p))}–${fmt(Math.floor(p + extra))}`; };
    return h('div', {}, h('h3', {}, d.kind === 'heal' ? 'Healing by level' : 'Damage by level'),
      h('table', { class: 'mini' }, h('thead', {}, h('tr', {}, h('th', {}, 'Level'), [0, 3, 6].map(m => h('th', { class: 'r' }, `Magic ${m}`)))),
        h('tbody', {}, levels.map(l => h('tr', {}, h('td', {}, l), [0, 3, 6].map(m => h('td', { class: 'r num' }, range(l, m))))))),
      h('p', { class: 'fine' }, d.kind === 'heal' ? 'Healing is capped at missing health.' : 'Ember damage ignores armour.'));
  };
  return listDetail(ctx, rows, detail, aside);
}

// ---------------------------------------------------------------- progression
export function progressionView(ctx: Ctx): View {
  const el = h('div', { class: 'split two-wide' });
  const form = h('section', { class: 'detail' }), aside = h('section', { class: 'derived' });
  const p = bal(ctx.store).draft.progression, saved = bal(ctx.store).saved.progression;
  type PK = keyof typeof p;
  const num = (field: Exclude<PK, 'xpCurve'>, label: string, unit?: string, o: { step?: number; percent?: boolean; hint?: string; round?: boolean } = {}) =>
    numberField({ label, unit, value: p[field], saved: saved[field], step: o.step ?? 1, percent: o.percent, hint: o.hint, round: o.round, issue: issueAt(ctx.store, `progression.${field}`), onInput: v => ctx.store.edit('balance', x => { x.progression[field] = v; }, `progression.${field}`) });
  const curve = (i: 0 | 1 | 2, label: string) => numberField({ label, value: p.xpCurve[i], saved: saved.xpCurve[i], step: 10, issue: issueAt(ctx.store, 'progression.xpCurve'), onInput: v => ctx.store.edit('balance', x => { x.progression.xpCurve[i] = v; }, `progression.xpCurve${i}`) });
  form.append(h('div', { class: 'form' },
    h('h2', {}, 'Progression'),
    h('h3', {}, 'Per level'), h('div', { class: 'grid3' }, num('hpBase', 'Health at level 1', 'hp', { round: true }), num('manaBase', 'Mana at level 1', '', { round: true }), num('capBase', 'Capacity at level 1', 'oz'), num('hpPerLevel', 'Health per level', 'hp', { round: true }), num('manaPerLevel', 'Mana per level', '', { round: true }), num('capPerLevel', 'Capacity per level', 'oz')),
    h('h3', {}, 'Experience curve'), h('p', { class: 'hint-row' }, 'Experience for level L is ⌊(a·n³ + b·n² + c·n) / 3⌋ with n = L − 1.'),
    h('div', { class: 'grid3' }, curve(0, 'a'), curve(1, 'b'), curve(2, 'c')),
    h('h3', {}, 'Melee'), h('p', { class: 'hint-row' }, 'Max hit = (5 × skill + 50) × attack ÷ 100, adjusted by fighting mode (offensive +20%, defensive −40%). Two averaged rolls make mid-range hits most common. No level bonus.'),
    h('h3', {}, 'Skills'), h('div', { class: 'grid3' }, num('meleeSkillBase', 'Melee tries at 10'), num('shieldSkillBase', 'Shield tries at 10'), num('skillGrowth', 'Growth per level', '×', { step: 0.01 }), num('magicBase', 'Mana for magic 1', '', { round: true }), num('magicGrowth', 'Magic growth', '×', { step: 0.01 })),
    h('h3', {}, 'Timing'), h('div', { class: 'grid3' }, num('stepMs', 'Walk step', 'ms', { step: 10, round: true }), num('attackMs', 'Player attack', 'ms', { step: 50, round: true }), num('monsterAttackMs', 'Creature attack', 'ms', { step: 50, round: true }), num('regenMs', 'Regen tick', 'ms', { step: 100, round: true }), num('respawnMs', 'Respawn', 'ms', { step: 1000, round: true })),
    h('h3', {}, 'Death'), h('div', { class: 'grid3' }, num('deathXpLoss', 'Experience lost', '%', { percent: true }), num('deathSkillLoss', 'Skill lost', '%', { percent: true })),
    worldRules(ctx)));
  const fill = () => {
    const r = createRules(bal(ctx.store).draft), s = createRules(bal(ctx.store).saved);
    const cell = (a: number, b: number) => h('td', { class: `r num${a !== b ? ' diff' : ''}`, title: a !== b ? `saved: ${fmt(b)}` : null }, fmt(a));
    aside.replaceChildren(h('h3', {}, 'Levels 1–15'), h('table', { class: 'mini' },
      h('thead', {}, h('tr', {}, ['Lv', 'Total xp', 'To next', 'Health', 'Mana', 'Cap'].map((t, i) => h('th', { class: i ? 'r' : '' }, t)))),
      h('tbody', {}, Array.from({ length: 15 }, (_, i) => i + 1).map(l => h('tr', {}, h('td', {}, l), cell(r.xpAt(l), s.xpAt(l)), cell(r.xpAt(l + 1) - r.xpAt(l), s.xpAt(l + 1) - s.xpAt(l)), cell(r.maxHP(l), s.maxHP(l)), cell(r.maxMana(l), s.maxMana(l)), cell(r.capacity(l), s.capacity(l)))))),
      h('h3', {}, 'Fixed in the engine'), h('ul', { class: 'fixed' },
        h('li', {}, 'Fed regeneration: 1 + level÷4 hp and 2 + level÷3 mana per regen tick'),
        h('li', {}, 'Shield block: random(0 … block × (0.5 + shielding ÷ 20))'),
        h('li', {}, 'Creature hit: random(0 … attack) − block − random(0 … armour)'),
        h('li', {}, 'Tonics heal value + 0…20; tinctures restore value + 0…15'),
        h('li', {}, 'Combat lasts 30 s after the last blow; helpers get a third of the xp')));
  };
  fill();
  el.append(form, aside);
  return { el, update: later(fill) };
}

// ---------------------------------------------------------------- merchants (read-only)
export function merchantsView(ctx: Ctx): View {
  const b = bal(ctx.store).draft;
  const price = (k: ItemKind, mode: 'buy' | 'sell') => h('li', {}, h('span', { class: 'ico' }, icon(ctx.store, b.items[k].icon)), h('span', {}, b.items[k].name), h('span', { class: 'num r' }, `${mode === 'buy' ? b.items[k].buy : b.items[k].sell} g`));
  return {
    el: h('div', { class: 'page' },
      h('h2', {}, 'Merchants, quest and starter kit'), h('p', { class: 'muted' }, 'Read-only in this version. Prices come from the item records; dialogue is shown so you can check it still matches after a change.'),
      h('div', { class: 'cards' }, Object.entries(b.merchants).map(([role, m]) => h('article', { class: 'card' },
        h('h3', {}, roleNames[role]), h('p', { class: 'quote' }, m.greeting),
        m.sells.length ? [h('h4', {}, 'Sells'), h('ul', { class: 'prices' }, m.sells.map(k => price(k, 'buy')))] : null,
        m.buys.length ? [h('h4', {}, 'Buys'), h('ul', { class: 'prices' }, m.buys.map(k => price(k, 'sell')))] : null,
        Object.entries(m.topics).filter(([, t]) => t).length ? [h('h4', {}, 'Topics'), h('dl', { class: 'topics' }, Object.entries(m.topics).filter(([, t]) => t).map(([k, t]) => [h('dt', {}, k), h('dd', {}, t)]))] : null))),
      h('div', { class: 'cards' },
        h('article', { class: 'card' }, h('h3', {}, 'Shrine task'), h('p', {}, `Bring ${b.quests.shells.need} × ${b.items[b.quests.shells.item].name}. Reward: ${b.items[b.quests.shells.reward].name} and ${b.quests.shells.gold} gold.`)),
        h('article', { class: 'card' }, h('h3', {}, 'Starter kit'), h('ul', { class: 'prices' },
          Object.entries(b.starter.equipment).filter(([, k]) => k).map(([slot, k]) => h('li', {}, h('span', { class: 'ico' }, icon(ctx.store, b.items[k!].icon)), h('span', {}, b.items[k!].name), h('span', { class: 'muted r' }, slot))),
          b.starter.pack.map(e => h('li', {}, h('span', { class: 'ico' }, icon(ctx.store, b.items[e.item].icon)), h('span', {}, b.items[e.item].name), h('span', { class: 'num r' }, `× ${e.count}`))))))),
  };
}

// World rules: 7.6-style luring, respawn and corpse decay.
function worldRules(ctx: Ctx) {
  const w = bal(ctx.store).draft.world, saved = bal(ctx.store).saved.world;
  type WK = 'viewX' | 'viewY' | 'lureLimit' | 'wanderRadius' | 'respawnMin' | 'respawnMax' | 'blockRange' | 'lootProtectSec' | 'speedBase' | 'speedPerLevel' | 'diagonalCost' | 'regenHp' | 'regenMana' | 'foodCapSec' | 'blocksPerTurn' | 'fightLockSec' | 'equipmentLossChance' | 'throwRange' | 'tileItemLimit';
  const num = (field: WK, label: string, unit?: string, o: { step?: number; percent?: boolean; hint?: string; round?: boolean } = {}) =>
    numberField({ label, unit, value: w[field], saved: saved[field], step: o.step ?? 1, percent: o.percent, hint: o.hint, round: o.round ?? !o.percent, min: 0, issue: issueAt(ctx.store, `world.${field}`), onInput: v => ctx.store.edit('balance', x => { x.world[field] = v; }, `world.${field}`) });
  const stage = (list: 'corpseStages' | 'heroCorpseStages', i: 0 | 1 | 2, label: string) =>
    numberField({ label, unit: 's', value: w[list][i], saved: saved[list][i], step: 10, min: 1, round: true, onInput: v => ctx.store.edit('balance', x => { x.world[list][i] = v; }, `world.${list}${i}`) });
  const groundKeys = Object.keys(w.groundSpeed);
  return h('div', {},
    h('h3', {}, 'Movement'), h('p', { class: 'hint-row' }, 'Speed = base + per level × level. A step takes 1000 × ground ÷ speed ms, rounded up to 50 ms; diagonal steps cost more.'),
    h('div', { class: 'grid3' }, num('speedBase', 'Base speed'), num('speedPerLevel', 'Speed per level', '', { round: false, step: 0.5 }), num('diagonalCost', 'Diagonal cost', '×', { round: false, step: 0.5 }),
      groundKeys.map(g => numberField({ label: `Ground: ${g}`, value: w.groundSpeed[g], saved: saved.groundSpeed[g], step: 10, min: 50, round: true, onInput: v => ctx.store.edit('balance', x => { x.world.groundSpeed[g] = v; }, `world.groundSpeed.${g}`) }))),
    h('h3', {}, 'Regeneration and food'), h('p', { class: 'hint-row' }, 'Only while fed, once per regen tick (Timing above). You cannot eat past the food cap.'),
    h('div', { class: 'grid3' }, num('regenHp', 'Health per tick'), num('regenMana', 'Mana per tick'), num('foodCapSec', 'Food cap', 's')),
    h('h3', {}, 'Combat rules'), h('div', { class: 'grid3' }, num('blocksPerTurn', 'Blocks per 2 s', '', { hint: 'Shield blocks; more attackers get through' }), num('fightLockSec', 'Fight lock', 's', { hint: 'No logging out' }), num('equipmentLossChance', 'Equipment loss on death', '%', { percent: true, hint: 'Per item; the pack always drops' })),
    h('h3', {}, 'Items on the ground'), h('div', { class: 'grid3' }, num('throwRange', 'Throw range', 'tiles'), num('tileItemLimit', 'Items per tile')),
    h('h3', {}, 'Luring'), h('p', { class: 'hint-row' }, 'Creatures chase anyone inside their screen and stay where they lose them. Pulled past the lure limit, they vanish and their spawn starts over.'),
    h('div', { class: 'grid3' }, num('viewX', 'Screen reach, sideways', 'tiles'), num('viewY', 'Screen reach, up/down', 'tiles'), num('lureLimit', 'Lure limit', 'tiles', { hint: 'From the spawn' }), num('wanderRadius', 'Idle wander', 'tiles')),
    h('h3', {}, 'Respawn'), h('p', { class: 'hint-row' }, 'Wait is the base respawn time × a random factor between min and max. A player within the block range of the spawn holds it back.'),
    h('div', { class: 'grid3' }, num('respawnMin', 'Fastest', '%', { percent: true, step: 0.05 }), num('respawnMax', 'Slowest', '%', { percent: true, step: 0.05 }), num('blockRange', 'Block range', 'tiles')),
    h('h3', {}, 'Corpses'), h('p', { class: 'hint-row' }, 'Fresh, then decaying (loot still inside), then bones (loot gone).'),
    h('div', { class: 'grid3' }, stage('corpseStages', 0, 'Creature: fresh'), stage('corpseStages', 1, 'Creature: decaying'), stage('corpseStages', 2, 'Creature: bones'),
      stage('heroCorpseStages', 0, 'Hero: fresh'), stage('heroCorpseStages', 1, 'Hero: decaying'), stage('heroCorpseStages', 2, 'Hero: bones'),
      num('lootProtectSec', "Killer's loot right", 's', { hint: '0 = anyone may loot' })));
}
