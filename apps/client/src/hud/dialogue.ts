// Talking to someone happens in the console, as it did in the classic client: their words are the NPC channel, and
// beside it a panel holds their name on a plank, the topics to ask about and, for merchants, the shop: buy and sell
// tabs, the stock as a grid of slots with prices, the one picked with how many to trade, and your gold.
import type { ItemKind, NpcSpawn } from '../../../../packages/game/src/model.ts';
import { balance, carried, core, countOf, itemDef, npcAt } from './core.ts';
import { $, esc, patch } from './kit.ts';
import { icon } from '../icons.ts';
import { showChannel } from './console.ts';

/** How many a Buy or Sell press trades. One by default, so nothing goes in bulk unless the player picks it. */
const amounts = [1, 10, 'all'] as const;
let amount: (typeof amounts)[number] = 1;
let mode: 'off' | 'buy' | 'sell' = 'off';
let picked: ItemKind | undefined;
let with_: string | undefined;
const roles: Record<NpcSpawn['role'], string> = { shrine: 'Keeper of the shrine', smith: 'Smith', inn: 'Innkeeper', apothecary: 'Apothecary', store: 'Provisioner', warden: 'Gate warden' };

const sellable = (k: ItemKind) => carried(core.view!).filter(i => i.kind === k && !i.parent.startsWith('equip:')).reduce((n, i) => n + i.count, 0);
/** The amount, cut to what you can pay for or have, and to the server's 50 per trade. */
function tradeCount(k: ItemKind) {
  const d = itemDef(k), most = mode === 'buy' ? Math.floor(countOf(core.view!, 'gold') / Math.max(1, d.buy)) : sellable(k);
  return Math.max(0, Math.min(50, most, amount === 'all' ? most : amount));
}
const openShop = (role: NpcSpawn['role']) => { const d = balance.merchants[role]; mode = d.sells.length ? 'buy' : 'sell'; picked = undefined; };
/** The merchant's answer to "trade" opens the shop, whether the word came from a topic button or the say box. */
export function heard(text: string, npcId?: string) {
  const v = core.view;
  if (!v || !npcId || npcId !== v.self.talking || mode !== 'off' || !/^(.*: )?Have a look\.$/.test(text)) return;
  openShop(npcAt(npcId)!.role);
}
export function saidTrade(text: string) {
  const v = core.view, npc = v?.self.talking ? npcAt(v.self.talking) : undefined, d = npc && balance.merchants[npc.role];
  if (npc && d && /\btrade\b/i.test(text) && (d.sells.length || d.buys.length) && mode === 'off') openShop(npc.role);
}
/** Whether a shop is open, so the console can make room for it. */
export const trading = () => mode !== 'off';

/** Draws the panel beside the console lines; empty when no one is being talked to. */
export function drawTalk() {
  const el = $('#talk'), v = core.view, npc = v?.self.talking ? npcAt(v.self.talking) : undefined;
  if (!npc) { if (with_) { with_ = undefined; mode = 'off'; amount = 1; picked = undefined; } el.hidden = true; patch(el, ''); return; }
  if (with_ !== npc.id) { with_ = npc.id; showChannel('npc'); }
  el.hidden = false;
  const def = balance.merchants[npc.role];
  const topics = [...new Set([...(npc.role === 'shrine' ? ['heal', 'task'] : []), ...Object.keys(def.topics).filter(t => def.topics[t]), ...(def.sells.length || def.buys.length ? ['trade'] : [])])];
  let shop = '', tabs = '';
  if (mode !== 'off') {
    const list = mode === 'buy' ? def.sells : def.buys;
    if (picked && !list.includes(picked)) picked = undefined;
    const p = picked ?? list[0];
    const d = p && itemDef(p), price = d ? (mode === 'buy' ? d.buy : d.sell) : 0, n = p ? tradeCount(p) : 0;
    const note = !d ? '' : d.attack ? `Attack ${d.attack}` : d.defense ? `Defence ${d.defense}` : d.armor ? `Armour ${d.armor}` : d.heal ? `+${d.heal} health` : d.mana ? `+${d.mana} mana` : d.slots ? `${d.slots} slots` : d.food ? `Feeds ${Math.round(d.food / 60000)} min` : '';
    tabs = `<span class="shop-tabs seg" role="tablist">${def.sells.length ? `<button type="button" class="btn small" role="tab" aria-selected="${mode === 'buy'}" data-shop="buy">Buy</button>` : ''}${def.buys.length ? `<button type="button" class="btn small" role="tab" aria-selected="${mode === 'sell'}" data-shop="sell">Sell</button>` : ''}</span>`;
    shop = `<ul class="stock" role="listbox" aria-label="${mode === 'buy' ? 'For sale' : 'Wanted'}">${list.map(k => { const s = itemDef(k), have = sellable(k); return `<li role="option" aria-selected="${k === p}" data-pick="${k}" title="${esc(s.name)}"><span class="cell"><span class="item">${icon(s.icon)}</span>${mode === 'sell' && have ? `<span class="n num">${have}</span>` : ''}</span><span class="price num">${mode === 'buy' ? s.buy : s.sell}</span></li>`; }).join('')}</ul>`
      + (d ? `<div class="deal"><span class="deal-name"><b>${esc(d.name)}</b>${note ? ` <span>${note}</span>` : ''}</span><span class="gold" title="Your gold">Gold <b class="num">${countOf(v!, 'gold')}</b></span><span class="seg amount" role="radiogroup" aria-label="How many">${amounts.map(a => `<button type="button" class="btn small" role="radio" aria-checked="${amount === a}" data-amount="${a}">${a === 'all' ? 'All' : `×${a}`}</button>`).join('')}</span>`
        + `<button type="button" class="btn small primary" data-trade="${p}" ${n < 1 ? 'disabled' : ''} title="${n > 0 ? `${n} for ${n * price} gold` : mode === 'buy' ? 'Not enough gold' : 'You have none'}">${mode === 'buy' ? 'Buy' : 'Sell'} ${n || ''}${n ? ` · ${n * price}` : ''}</button></div>` : '');
  }
  patch(el, `<div class="talk-head"><div class="plank"><b>${esc(npc.name)}</b></div><small>${roles[npc.role]}</small><button type="button" class="ibtn" data-topic="bye" aria-label="End the conversation"><i class="g g-close" aria-hidden="true"></i></button></div>`
    + `<div class="topics">${topics.map(t => `<button type="button" class="btn small" data-topic="${t}" aria-pressed="${t === 'trade' && mode !== 'off'}">${t}</button>`).join('')}${tabs}</div>${shop}`);
}

document.addEventListener('click', e => {
  const t = e.target as HTMLElement, v = core.view, npc = v?.self.talking ? npcAt(v.self.talking) : undefined;
  if (!v || !npc || !t.closest('#talk')) return;
  const b = t.closest<HTMLElement>('[data-topic], [data-shop], [data-amount], [data-trade], [data-pick]');
  if (!b) return;
  if (b.dataset.topic) {
    const topic = b.dataset.topic;
    // Turning the shop off is the client's business; only turning it on says "trade".
    if (topic === 'trade' && mode !== 'off') { mode = 'off'; amount = 1; core.redraw(); return; }
    if (topic === 'bye') { core.send({ kind: 'talk', npc: null }); return; }
    if (topic === 'trade') openShop(npc.role);
    core.send({ kind: 'say', text: topic });
  } else if (b.dataset.shop) { mode = b.dataset.shop as 'buy' | 'sell'; picked = undefined; }
  else if (b.dataset.pick) picked = b.dataset.pick as ItemKind;
  else if (b.dataset.amount) amount = b.dataset.amount === 'all' ? 'all' : (Number(b.dataset.amount) as 1 | 10);
  else if (b.dataset.trade) { const k = b.dataset.trade as ItemKind, n = tradeCount(k); if (n > 0) core.send({ kind: 'trade', npc: npc.id, item: k, mode: mode === 'buy' ? 'buy' : 'sell', count: n }); }
  core.redraw();
});
