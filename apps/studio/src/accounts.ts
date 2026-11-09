import { AccountEdit, vaultSlots, type Account, type ItemNode } from '../../../packages/game/src/accounts.ts';
import { equipSlots, itemKinds, type ItemKind } from '../../../packages/game/src/ids.ts';
import { HeroName } from '../../../packages/game/src/model.ts';
import { createRules } from '../../../packages/game/src/rules.ts';
import { iconSvg } from '../../../packages/game/src/icon-svg.ts';
import type { Store } from './store.ts';
import type { View } from './balance.ts';
import { h, svg, fill, numberField, textField, fmt, toast, later } from './ui.ts';

type Ctx = { store: Store; select: (id: string) => void; selected: string | null };
type Slots = (ItemNode | null)[];
type Stats = { name: string; level: number; hp: number; mana: number; melee: number; shielding: number; magic: number; deaths: number };
type Draft = Stats & { base: Account; equip: Slots; vault: Slots };

const statsOf = (a: Account): Stats => ({ name: a.name, level: a.level, hp: a.hp, mana: a.mana, melee: a.skills.melee.level, shielding: a.skills.shielding.level, magic: a.skills.magic.level, deaths: a.deaths });
const statKeys = ['name', 'level', 'hp', 'mana', 'melee', 'shielding', 'magic', 'deaths'] as const;
const fresh = (a: Account): Draft => ({ ...statsOf(a), base: a, equip: structuredClone(a.equip), vault: structuredClone(a.vault) });
const itemsEdited = (d: Draft) => JSON.stringify([d.equip, d.vault]) !== JSON.stringify([d.base.equip, d.base.vault]);

// Kept across route changes so switching characters or pages never loses an unsaved edit.
let accounts: Account[] | null = null, loadedAt = 0;
const drafts = new Map<string, Draft>();
const draftOf = (a: Account) => drafts.get(a.id) ?? drafts.set(a.id, fresh(a)).get(a.id)!;

function patchOf(d: Draft): AccountEdit {
  const b = statsOf(d.base), out: Record<string, unknown> = {}, skills: Record<string, number> = {};
  if (d.name.trim() !== b.name) out.name = d.name.trim();
  for (const k of ['level', 'hp', 'mana', 'deaths'] as const) if (d[k] !== b[k]) out[k] = d[k];
  for (const k of ['melee', 'shielding', 'magic'] as const) if (d[k] !== b[k]) skills[k] = d[k];
  if (Object.keys(skills).length) out.skills = skills;
  if (itemsEdited(d)) out.items = { stamp: d.base.itemsStamp, equip: d.equip, vault: d.vault };
  return out as AccountEdit;
}
const dirty = (d: Draft | undefined) => !!d && Object.keys(patchOf(d)).length > 0;
export const accountsDirty = () => [...drafts.values()].some(dirty);

/** Carry unsaved edits onto a newer copy of the character. Item edits only survive if their items did not change in game. */
function rebase(d: Draft, a: Account) {
  const next = fresh(a), was = statsOf(d.base);
  for (const k of statKeys) if (d[k] !== was[k]) (next as Record<string, unknown>)[k] = d[k];
  const lost = itemsEdited(d) && a.itemsStamp !== d.base.itemsStamp;
  if (itemsEdited(d) && !lost) { next.equip = d.equip; next.vault = d.vault; }
  return { next, lost };
}

async function request(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({ message: `The Studio answered ${res.status}.` }));
  return { ok: res.ok, status: res.status, body };
}

export function accountsView(ctx: Ctx): View {
  const el = h('div', { class: 'split three accounts' });
  const balance = () => ctx.store.get('balance').saved;
  const rules = () => createRules(balance());
  const def = (k: ItemKind) => balance().items[k];
  const icon = (k: ItemKind) => { const d = ctx.store.docs.icons?.saved[def(k).icon]; return d ? svg(iconSvg(d)) : h('span', { class: 'noicon' }); };
  let saving = false;

  async function load() {
    const r = await request('/api/accounts');
    if (!r.ok) { if (!accounts) fill(el, h('div', { class: 'page' }, h('div', { class: 'empty' }, h('p', {}, 'Characters are unavailable'), h('p', { class: 'muted' }, r.body.message), h('button', { class: 'primary wide', onclick: () => { fill(el, h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Loading characters…'))); load(); } }, 'Try again')))); else toast(r.body.message, 'error'); return; }
    accounts = r.body as Account[]; loadedAt = Date.now();
    const lost: string[] = [];
    for (const [id, d] of drafts) {
      const a = accounts.find(x => x.id === id);
      if (!a || !dirty(d)) { drafts.delete(id); continue; }
      const { next, lost: dropped } = rebase(d, a);
      drafts.set(id, next);
      if (dropped) lost.push(a.name);
    }
    if (lost.length) toast(`Item edits for ${lost.join(', ')} were dropped: their items changed in game.`, 'info');
    draw();
  }

  function draw() {
    if (!accounts) return;
    if (!accounts.length) { fill(el, h('div', { class: 'page' }, h('div', { class: 'empty' }, h('p', {}, 'No characters yet'), h('p', { class: 'muted' }, 'Characters appear here once someone enters the town.')))); return; }
    const a = accounts.find(x => x.id === ctx.selected) ?? accounts[0];
    const d = draftOf(a);
    const list = h('ul', { class: 'records', role: 'listbox', 'aria-label': 'Characters' });
    const drawList = () => fill(list, accounts!.map(x => h('li', { role: 'option', 'aria-selected': x.id === a.id, tabindex: x.id === a.id ? 0 : -1, onclick: () => ctx.select(x.id), onkeydown: (e: Event) => { const k = (e as KeyboardEvent).key; if (k === 'Enter' || k === ' ') { e.preventDefault(); ctx.select(x.id); } } },
      h('span', { class: `presence${x.connected ? ' on' : ''}`, 'aria-label': x.connected ? 'online' : 'offline' }),
      h('span', { class: 'lbl' }, drafts.get(x.id)?.name.trim() || x.name),
      h('span', { class: 'sub' }, `lvl ${drafts.get(x.id)?.level ?? x.level}`, dirty(drafts.get(x.id)) ? h('span', { class: 'dot', 'aria-label': 'unsaved changes' }) : null))));
    const search = h('input', { type: 'search', placeholder: 'Filter', 'aria-label': 'Filter characters', autocomplete: 'off' });
    search.addEventListener('input', () => { const q = search.value.trim().toLowerCase(); for (const [i, li] of [...list.children].entries()) (li as HTMLElement).hidden = !!q && !accounts![i].name.toLowerCase().includes(q); });
    drawList();

    const aside = h('section', { class: 'derived', 'aria-label': 'Derived numbers' });
    const bar = h('div', { class: 'toolbar save-bar' });
    const refreshMeta = () => { drawBar(); drawList(); drawAside(); };
    const soon = later(refreshMeta);

    const drawBar = () => fill(bar,
      h('span', { class: `pill${dirty(d) ? ' dirty' : ''}` }, saving ? 'Saving…' : dirty(d) ? 'Unsaved changes' : 'Saved'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'ghost', onclick: () => load() }, 'Refresh'),
      h('button', { class: 'ghost', disabled: !dirty(d), onclick: () => { drafts.delete(a.id); draw(); } }, 'Revert'),
      h('button', { class: 'primary', disabled: !dirty(d) || saving, onclick: save, title: 'Save (⌘S)' }, 'Save'));

    function drawAside() {
      const r = rules(), level = d.level;
      const xp = level === d.base.level ? d.base.xp : r.xpAt(level);
      const carried = d.equip.reduce((n, node) => n + weigh(node), 0);
      const gold = d.equip.reduce((n, node) => n + coins(node), 0);
      const cap = r.capacity(level);
      fill(aside,
        h('h3', {}, 'Status'),
        h('dl', { class: 'facts' },
          h('dt', {}, 'In game'), h('dd', {}, d.base.connected ? 'Online' : 'Offline'),
          h('dt', {}, 'Standing at'), h('dd', { class: 'num' }, `${d.base.position.x}, ${d.base.position.y} · ${d.base.position.z ? 'undercroft' : 'town'}`),
          h('dt', {}, 'Fed for'), h('dd', { class: 'num' }, `${fmt(d.base.fed / 60000)} min`)),
        h('h3', {}, 'At this level'),
        h('dl', { class: 'facts' },
          h('dt', {}, 'Experience'), h('dd', { class: 'num' }, fmt(xp)),
          h('dt', {}, 'Next level at'), h('dd', { class: 'num' }, fmt(r.xpAt(level + 1))),
          h('dt', {}, 'Max health'), h('dd', { class: 'num' }, fmt(r.maxHP(level))),
          h('dt', {}, 'Max mana'), h('dd', { class: 'num' }, fmt(r.maxMana(level))),
          h('dt', {}, 'Carrying'), h('dd', { class: `num${carried > cap ? ' over' : ''}` }, `${fmt(carried)} / ${fmt(cap)} oz`),
          h('dt', {}, 'Gold carried'), h('dd', { class: 'num' }, fmt(gold))),
        carried > cap ? h('p', { class: 'warn' }, 'They carry more than their capacity. They can still move, but cannot pick anything up.') : null,
        d.hp > r.maxHP(level) || d.mana > r.maxMana(level) ? h('p', { class: 'warn' }, 'Health and mana above the maximum are lowered to it when you save.') : null,
        Object.keys(d.base.quests).length ? [h('h3', {}, 'Quests'), h('dl', { class: 'facts' }, Object.entries(d.base.quests).map(([q, s]) => [h('dt', {}, q), h('dd', { class: 'num' }, `stage ${s}`)]))] : null,
        h('p', { class: 'fine' }, 'Saving updates an online character at once and tells them. Numbers use the saved balance, which is what the game server runs.'));
    }
    const weigh = (n: ItemNode | null): number => n ? def(n.kind).weight * n.count + (n.contents ?? []).reduce((s, c) => s + weigh(c), 0) : 0;
    const coins = (n: ItemNode | null): number => n ? (n.kind === 'gold' ? n.count : 0) + (n.contents ?? []).reduce((s, c) => s + coins(c), 0) : 0;

    async function save() {
      const patch = patchOf(d);
      const name = HeroName.safeParse(d.name);
      if (!name.success) { toast(name.error.issues[0].message, 'error'); return; }
      const valid = AccountEdit.safeParse(patch);
      if (!valid.success) { toast(valid.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'), 'error'); return; }
      saving = true; drawBar();
      const r = await request(`/api/accounts/${encodeURIComponent(a.id)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid.data) }).finally(() => { saving = false; });
      if (r.ok) {
        const next = r.body as Account;
        accounts = accounts!.map(x => x.id === next.id ? next : x);
        drafts.delete(a.id);
        toast(next.connected ? `Saved. ${next.name} sees the change now.` : `Saved. ${next.name} has it on their next login.`, 'ok');
        draw();
        return;
      }
      toast(r.body.message, 'error');
      if (r.status === 409) await load(); else drawBar();
    }

    const stat = (k: keyof Stats & ('level' | 'hp' | 'mana' | 'melee' | 'shielding' | 'magic' | 'deaths'), label: string, min: number, hint?: string, unit?: string) =>
      numberField({ label, hint, unit, value: d[k], saved: statsOf(d.base)[k], min, round: true, onInput: v => { d[k] = Math.max(min, v); after(k); soon(); } });
    const hp = stat('hp', 'Health', 1, undefined, 'hp'), mana = stat('mana', 'Mana', 0);
    const setNumber = (wrap: HTMLElement, v: number) => { const i = wrap.querySelector('input')!; i.value = String(v); i.dispatchEvent(new Event('input')); };
    // A new level brings new maxima; start the character full so the change is easy to try.
    const after = (k: string) => { if (k !== 'level') return; const r = rules(); setNumber(hp, r.maxHP(d.level)); setNumber(mana, r.maxMana(d.level)); };

    const itemsHost = h('div', { class: 'inventory' });
    const drawItems = () => fill(itemsHost,
      h('h3', {}, 'Equipment'),
      h('div', { class: 'slots' }, equipSlots.map((slot, i) => {
        const node = d.equip[i];
        const options = itemKinds.filter(k => def(k).slot === slot);
        return [itemRow(node, {
          label: slot, options, empty: true,
          onKind: k => { d.equip[i] = k ? retype(node, k) : null; },
        }), node && def(node.kind).slots ? container(node) : null];
      })),
      h('h3', {}, 'Vault'),
      slotList(d.vault, vaultSlots, 'the vault'));
    const changed = () => { drawItems(); refreshMeta(); };

    /** Change an item's kind, keeping what still fits inside it. */
    function retype(node: ItemNode | null, k: ItemKind): ItemNode {
      const slots = def(k).slots;
      const kept = (node?.contents ?? []).filter(Boolean);
      const next: ItemNode = { ...(node?.id ? { id: node.id } : {}), kind: k, count: def(k).stack ? Math.max(1, node?.count ?? 1) : 1 };
      if (slots) {
        const inside = (node?.contents ?? []).slice(0, slots);
        next.contents = [...inside, ...Array(Math.max(0, slots - inside.length)).fill(null)];
        const lost = kept.length - next.contents.filter(Boolean).length;
        if (lost) toast(`${lost} item${lost > 1 ? 's' : ''} that no longer fit${lost > 1 ? '' : 's'} were removed.`, 'info');
      } else if (kept.length) toast(`${def(k).name} is not a container; the ${kept.length} item${kept.length > 1 ? 's' : ''} inside were removed.`, 'info');
      return next;
    }

    function itemRow(node: ItemNode | null, o: { label?: string; options: readonly ItemKind[]; empty: boolean; onKind: (k: ItemKind | null) => void; onRemove?: () => void }) {
      const select = h('select', { 'aria-label': o.label ? `${o.label} item` : 'Item', onchange: () => { o.onKind((select.value || null) as ItemKind | null); changed(); } },
        o.empty ? h('option', { value: '', selected: !node }, 'Empty') : null,
        o.options.map(k => h('option', { value: k, selected: node?.kind === k }, def(k).name)));
      const count = node && def(node.kind).stack
        ? numberField({ label: 'Count', value: node.count, min: 1, round: true, onInput: v => { node.count = Math.min(100, Math.max(1, v)); soon(); } })
        : null;
      return h('div', { class: `item-row${o.label ? ' labelled' : ''}` },
        o.label ? h('span', { class: 'slot-name' }, o.label) : null,
        h('span', { class: 'ico' }, node ? icon(node.kind) : h('span', { class: 'noicon' })),
        select,
        count ?? h('span', {}),
        o.onRemove ? h('button', { class: 'icon-btn', 'aria-label': `Remove ${node ? def(node.kind).name : 'item'}`, onclick: () => { o.onRemove!(); changed(); } }, '×') : h('span', {}));
    }

    function container(node: ItemNode): HTMLElement {
      const size = def(node.kind).slots!;
      node.contents ??= [];
      while (node.contents.length < size) node.contents.push(null);
      return h('div', { class: 'nested' }, slotList(node.contents, size, `the ${def(node.kind).name.toLowerCase()}`));
    }

    function slotList(slots: Slots, size: number, where: string): HTMLElement {
      const used = slots.filter(Boolean).length;
      const add = h('select', { 'aria-label': `Add an item to ${where}`, disabled: used >= size, onchange: () => {
        const k = add.value as ItemKind; if (!k) return;
        let free = slots.indexOf(null); if (free < 0) free = slots.length;
        slots[free] = retype(null, k);
        changed();
      } }, h('option', { value: '', selected: true }, used >= size ? 'Full' : 'Add item…'), itemKinds.map(k => h('option', { value: k }, def(k).name)));
      return h('div', { class: 'slot-list' },
        slots.map((node, i) => node ? [itemRow(node, { options: itemKinds, empty: false, onKind: k => { slots[i] = retype(node, k!); }, onRemove: () => { slots[i] = null; } }), def(node.kind).slots ? container(node) : null] : null),
        h('div', { class: 'add-row' }, add, h('span', { class: 'sub' }, `${used} / ${size} slots`)));
    }
    drawItems();

    const detail = h('section', { class: 'detail' }, h('div', { class: 'form' },
      bar,
      h('header', { class: 'record-head' }, h('div', {}, h('h2', {}, a.name), h('p', { class: 'muted' }, `${d.base.connected ? 'Online' : 'Offline'} · died ${d.base.deaths} time${d.base.deaths === 1 ? '' : 's'}`))),
      textField({ label: 'Name', value: d.name, saved: a.name, onInput: v => { d.name = v; soon(); } }),
      h('div', { class: 'grid3' }, stat('level', 'Level', 1, 'Sets experience to the start of the level'), hp, mana),
      h('h3', {}, 'Skills'),
      h('div', { class: 'grid3' }, stat('melee', 'Melee', 10), stat('shielding', 'Shielding', 10), stat('magic', 'Magic', 0)),
      h('p', { class: 'hint-row' }, 'A changed skill starts at 0% of its new level. Melee and shielding start at 10, magic at 0.'),
      h('div', { class: 'grid3' }, stat('deaths', 'Deaths', 0)),
      itemsHost));
    drawBar(); drawAside();
    fill(el, h('nav', { class: 'list' }, search, list), detail, aside);
  }

  const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); (el.querySelector('.save-bar .primary') as HTMLButtonElement | null)?.click(); } };
  addEventListener('keydown', onKey);
  if (accounts) draw(); else fill(el, h('div', { class: 'page' }, h('p', { class: 'muted' }, 'Loading characters…')));
  // Moving between characters re-creates the view; only refetch when the list is a few seconds old.
  if (Date.now() - loadedAt > 5000) load();
  return { el, destroy: () => removeEventListener('keydown', onKey) };
}
