// Talking to someone: a window in the column with their name on a plank, their last words, the topics to ask about,
// and for merchants the shop: buy and sell tabs, how many, the stock with prices, and your gold.
import type { ItemKind, NpcSpawn } from '../../../../packages/game/src/model.ts';
import { balance, core, countOf, carried, itemDef, npcAt } from './core.ts';
import { esc, patch } from './kit.ts';
import { icon } from '../icons.ts';
import { log } from './console.ts';
import type { WinSpec } from './column.ts';

/** How many a Buy or Sell press trades. One by default, so nothing goes in bulk unless the player picks it. */
const amounts = [1, 10, 'all'] as const;
let amount: (typeof amounts)[number] = 1;
let mode: 'off' | 'buy' | 'sell' = 'off';
const roles: Record<NpcSpawn['role'], string> = { shrine: 'Keeper of the shrine', smith: 'Smith', inn: 'Innkeeper', apothecary: 'Apothecary', store: 'Provisioner', warden: 'Gate warden' };

const sellable = (k: ItemKind) => { const v = core.view!; return carried(v).filter(i => i.kind === k && !i.parent.startsWith('equip:')).reduce((n, i) => n + i.count, 0); };
/** The amount, cut to what you can pay for or have, and to the server's 50 per trade. */
function tradeCount(k: ItemKind) {
  const d = itemDef(k), most = mode === 'buy' ? Math.floor(countOf(core.view!, 'gold') / Math.max(1, d.buy)) : sellable(k);
  return Math.max(0, Math.min(50, most, amount === 'all' ? most : amount));
}
/** The merchant's answer to "trade" opens the shop, whether the word came from a topic button or the say box. */
export function heard(text: string, npcId?: string) {
  const v = core.view;
  if (!v || !npcId || npcId !== v.self.talking || mode !== 'off' || !/^(.*: )?Have a look\.$/.test(text)) return;
  const d = balance.merchants[npcAt(npcId)!.role];
  mode = d.sells.length ? 'buy' : 'sell';
}
export function saidTrade(text: string) {
  const v = core.view, npc = v?.self.talking ? npcAt(v.self.talking) : undefined, d = npc && balance.merchants[npc.role];
  if (d && /\btrade\b/i.test(text) && (d.sells.length || d.buys.length) && mode === 'off') mode = d.sells.length ? 'buy' : 'sell';
}
export function update() { if (!core.view?.self.talking) { mode = 'off'; amount = 1; } }

export function dialogueWindow(): WinSpec | undefined {
  const v = core.view, npc = v?.self.talking ? npcAt(v.self.talking) : undefined;
  if (!v || !npc) return;
  return { id: 'talk', title: npc.name, icon: 'w-journal', kind: 'talk', close: () => core.send({ kind: 'talk', npc: null }), render: body => draw(body, npc) };
}

function draw(body: HTMLElement, npc: NpcSpawn) {
  const v = core.view!, def = balance.merchants[npc.role];
  const lines = log.filter(n => n.npc === npc.id).slice(-3);
  const topics = [...new Set([...(npc.role === 'shrine' ? ['heal', 'task'] : []), ...Object.keys(def.topics).filter(t => def.topics[t]), ...(def.sells.length || def.buys.length ? ['trade'] : [])])];
  let shop = '';
  if (mode !== 'off') {
    const list = mode === 'buy' ? def.sells : def.buys;
    shop = `<div class="shop"><div class="seg" role="tablist">${def.sells.length ? `<button type="button" class="btn" role="tab" aria-selected="${mode === 'buy'}" data-shop="buy">Buy</button>` : ''}${def.buys.length ? `<button type="button" class="btn" role="tab" aria-selected="${mode === 'sell'}" data-shop="sell">Sell</button>` : ''}</div>`
      + `<div class="shop-bar"><span class="seg amount" role="radiogroup" aria-label="How many">${amounts.map(a => `<button type="button" class="btn small" role="radio" aria-checked="${amount === a}" data-amount="${a}">${a === 'all' ? 'All' : `×${a}`}</button>`).join('')}</span><span class="gold" title="Your gold">${icon('gold')}<b class="num">${countOf(v, 'gold')}</b></span></div>`
      + `<ul class="stock">${list.map(k => {
        const d = itemDef(k), price = mode === 'buy' ? d.buy : d.sell, n = tradeCount(k), have = sellable(k);
        const note = d.attack ? `Attack ${d.attack}` : d.defense ? `Defence ${d.defense}` : d.armor ? `Armour ${d.armor}` : d.heal ? `+${d.heal} health` : d.mana ? `+${d.mana} mana` : d.slots ? `${d.slots} slots` : mode === 'sell' ? `You have ${have}` : '';
        return `<li><span class="cell"><span class="item">${icon(d.icon)}</span></span><span class="nm">${esc(d.name)}${note ? `<small>${note}</small>` : ''}</span><span class="price num" title="Gold each">${price}</span><button type="button" class="btn small" data-trade="${k}" ${n < 1 ? 'disabled' : ''} title="${n > 0 ? `${n} for ${n * price} gold` : mode === 'buy' ? 'Not enough gold' : 'You have none'}">${mode === 'buy' ? 'Buy' : 'Sell'}${n > 1 ? ` ${n}` : ''}</button></li>`;
      }).join('')}</ul></div>`;
  }
  patch(body, `<div class="plank"><b>${esc(npc.name)}</b><small>${roles[npc.role]}</small></div>`
    + `<div class="lines">${lines.map(l => `<p>${esc(l.text.replace(`${npc.name}: `, ''))}</p>`).join('') || '<p class="muted">…</p>'}</div>`
    + `<div class="topics">${topics.map(t => `<button type="button" class="btn small chip" data-topic="${t}" aria-pressed="${t === 'trade' && mode !== 'off'}">${t}</button>`).join('')}<button type="button" class="btn small chip quiet" data-topic="bye">bye</button></div>${shop}`);
}

document.addEventListener('click', e => {
  const t = e.target as HTMLElement, v = core.view, npc = v?.self.talking ? npcAt(v.self.talking) : undefined;
  if (!v || !npc || !t.closest('.k-talk')) return;
  const b = t.closest<HTMLElement>('[data-topic], [data-shop], [data-amount], [data-trade]');
  if (!b) return;
  const def = balance.merchants[npc.role];
  if (b.dataset.topic) {
    const topic = b.dataset.topic;
    // Turning the shop off is the client's business; only turning it on says "trade".
    if (topic === 'trade' && mode !== 'off') { mode = 'off'; amount = 1; core.redraw(); return; }
    if (topic === 'trade') mode = def.sells.length ? 'buy' : 'sell';
    core.send({ kind: 'say', text: topic });
  } else if (b.dataset.shop) mode = b.dataset.shop as 'buy' | 'sell';
  else if (b.dataset.amount) amount = b.dataset.amount === 'all' ? 'all' : (Number(b.dataset.amount) as 1 | 10);
  else if (b.dataset.trade) { const k = b.dataset.trade as ItemKind, n = tradeCount(k); if (n > 0) core.send({ kind: 'trade', npc: npc.id, item: k, mode: mode === 'buy' ? 'buy' : 'sell', count: n }); }
  core.redraw();
});
