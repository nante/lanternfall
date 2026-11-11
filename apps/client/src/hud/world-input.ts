// Pointer input on the world: what a click, a press-and-drag and a right-click do with what is under the pointer, and
// the errands that walk you somewhere first (talk, loot, open the vault). The press and drag rules are the input lane's.
import { placeAt } from '../../../../packages/game/src/town.ts';
import { T, type Body, type Pos } from '../../../../packages/game/src/model.ts';
import { balance, bodyOn, core, corpsesAt, distance, npcAt, pileAt, same, standable, thingAt, topCorpse, usable } from './core.ts';
import { esc } from './kit.ts';
import { closeMenu, openMenu, type Entry, type Menu } from './menu.ts';
import { closeTip, worldTip } from './tooltip.ts';
import { statusLine } from './overlay.ts';
import { openContainer } from './containers.ts';
import { dragFrom, dragItem, ghostLabel, pushTo } from './drag.ts';

type Pending = { kind: 'talk'; npc: string } | { kind: 'corpse'; id: string } | { kind: 'vault' } | { kind: 'ground'; at: Pos };
let pending: Pending | undefined;
export const clearPending = () => { pending = undefined; };

type Who = { kind: 'foe' | 'npc' | 'player'; id: string; name: string; at: Pos };
/** What an actor id under the pointer is. A shade (a creature seen only as a dark figure) is a foe like any other. */
function who(id?: string): Who | undefined {
  const v = core.view;
  if (!v || !id) return;
  const m = v.monsters.find(m => m.id === id); if (m) return { kind: 'foe', id, name: balance.creatures[m.kind].name, at: m };
  const s = v.shades?.find(s => s.id === id); if (s) return { kind: 'foe', id, name: 'Something', at: s };
  const n = npcAt(id); if (n) return { kind: 'npc', id, name: n.name, at: n };
  const h = v.players.find(h => h.id === id); if (h) return { kind: 'player', id, name: h.name, at: h };
}

export function attack(id: string) { const v = core.view; if (!v) return; pending = undefined; core.send({ kind: 'target', id: v.self.target === id ? null : id }); }
export const look = (at: Pos, actor?: string) => core.send({ kind: 'look', at, actor });
function talkTo(npcId: string) { const npc = npcAt(npcId); if (!npc) return; approach(npc, 3); pending = { kind: 'talk', npc: npc.id }; resolvePending(); }
/** Walk to a tile; your own tile stops a walk in progress (while walking, the hero is drawn a step ahead, on the route's first tile). */
export function walkTo(tile: Pos) {
  const v = core.view; if (!v) return;
  pending = undefined; closeMenu();
  if (same(tile, v.self) || (v.route[0] && same(tile, v.route[0]))) { if (v.route.length) core.send({ kind: 'stop' }); return; }
  core.send({ kind: 'path', to: tile });
}
function useAt(tile: Pos) {
  if (thingAt(tile) === T.vault) { pending = { kind: 'vault' }; core.send({ kind: 'useTile', to: tile }); resolvePending(); return; }
  pending = undefined; core.send({ kind: 'useTile', to: tile });
}
function openCorpse(c: Body) {
  const v = core.view;
  if (topCorpse(v, c)?.id !== c.id) return statusLine('Something lies on top of it.');
  if (bodyOn(v, c)) return statusLine('Someone is standing on it.');
  pending = { kind: 'corpse', id: c.id }; if (v && distance(v.self, c) > 1) approach(c, 1); resolvePending();
}
function openPile(tile: Pos) { const v = core.view; pending = { kind: 'ground', at: tile }; if (v && distance(v.self, tile) > 1) approach(tile, 1); resolvePending(); }
function approach(p: Pos, within: number) {
  const v = core.view;
  if (!v || distance(v.self, p) <= within) return;
  const options: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) options.push({ x: p.x + dx, y: p.y + dy, z: p.z });
  const free = options.filter(standable).sort((a, b) => distance(v.self, a) - distance(v.self, b));
  if (free[0]) core.send({ kind: 'path', to: free[0] });
}
/** Runs an errand once you are close enough; called on every update. */
export function resolvePending() {
  const v = core.view;
  if (!v || !pending) return;
  const self = v.self, p = pending;
  if (p.kind === 'talk') { const n = npcAt(p.npc)!; if (distance(self, n) <= 3) { core.send({ kind: 'talk', npc: n.id }); pending = undefined; } }
  else if (p.kind === 'corpse') { const c = v.corpses.find(c => c.id === p.id); if (!c) pending = undefined; else if (distance(self, c) <= 1) { pending = undefined; openContainer({ kind: 'corpse', id: c.id }); } }
  else if (p.kind === 'vault') { if (distance(self, core.map.vault) <= 2) { pending = undefined; openContainer({ kind: 'vault' }); } }
  else if (!pileAt(v, p.at).length) pending = undefined;
  else if (distance(self, p.at) <= 1) { pending = undefined; openContainer({ kind: 'ground', at: p.at }); }
}

export function wireWorld() {
  const w = core.world;
  w.onPick = (tile, info) => {
    const v = core.view; if (!v) return;
    closeTip(); closeMenu();
    if (info.shift) { look(tile, info.actor); return; }
    if (info.drag) { walkTo(tile); return; }
    const x = who(info.actor);
    if (x?.kind === 'foe') return attack(x.id);
    if (x?.kind === 'npc') return talkTo(x.id);
    // Another hero: stand beside them, never step into them.
    if (x?.kind === 'player') { pending = undefined; approach(x.at, 1); return; }
    const c = topCorpse(v, tile);
    if (c) return openCorpse(c);
    if (pileAt(v, tile).length) return openPile(tile);
    const t = thingAt(tile);
    if (t === T.vault || t === T.hatch || t === T.ladder || t === T.well || t === T.altar) return useAt(tile);
    walkTo(tile);
  };
  /**
   * A press within reach on something that can be dragged belongs to that drag: the top floor item, a creature or hero
   * (push), or the top body (push). Released without moving, it is a click. Open ground may become hold-to-walk; anything
   * else that can be clicked stays a click.
   */
  w.onPress = (tile, e, info) => {
    const v = core.view;
    if (!v || info.shift) return 'click';
    const x = who(info.actor);
    if (x) {
      if (x.kind !== 'npc' && distance(v.self, x.at) <= 1) { dragFrom(e, { ghost: ghostLabel(x.name), click: () => w.onPick(tile, info), drop: ev => pushTo(x.id, x.at, ev) }); return 'own'; }
      return 'click';
    }
    if (distance(v.self, tile) <= 1) {
      const top = pileAt(v, tile).at(-1);
      if (top) { dragItem(e, top, () => w.onPick(tile, info)); return 'own'; }
      const c = topCorpse(v, tile);
      if (c) { dragFrom(e, { ghost: ghostLabel(c.name), click: () => w.onPick(tile, info), drop: ev => pushTo(c.id, c, ev) }); return 'own'; }
    }
    return pileAt(v, tile).length || corpsesAt(v, tile).length || usable(tile) ? 'click' : 'hold';
  };
  w.onMenu = (tile, info, x, y) => { const m = worldMenu(tile, info.actor); if (m) openMenu(x, y, m); };
  w.onHover = (text, x, y) => worldTip(text ? `<b>${esc(text)}</b>` : undefined, x, y);
}

export function foeMenu(id: string): Menu | undefined {
  const x = who(id), v = core.view;
  if (!x || !v) return;
  return { title: x.name, entries: [{ label: 'Look', hint: 'Shift+click', run: () => look(x.at, x.id) }, { label: v.self.target === x.id ? 'Stop attacking' : 'Attack', hint: 'Click', sep: true, run: () => attack(x.id) }], alive: () => !!who(id) };
}
function worldMenu(tile: Pos, actorId?: string): Menu | undefined {
  const v = core.view;
  if (!v) return;
  const self = v.self, x = who(actorId), entries: Entry[] = [{ label: 'Look', hint: 'Shift+click', run: () => look(tile, x?.id) }];
  const add = (e: Entry) => entries.push(entries.length === 1 ? { ...e, sep: true } : e);
  if (x?.kind === 'foe') add({ label: self.target === x.id ? 'Stop attacking' : 'Attack', hint: 'Click', run: () => attack(x.id) });
  if (x?.kind === 'npc') add({ label: 'Talk', hint: 'Click', run: () => talkTo(x.id) });
  const c = topCorpse(v, tile), pile = pileAt(v, tile).length > 0;
  // A body under a living creature or another hero stays shut until they move or are moved.
  if (c && !bodyOn(v, c)) add({ label: pile ? 'Open body' : 'Open', hint: 'Click', run: () => openCorpse(c) });
  if (pile) add({ label: c ? 'Open pile' : 'Open', run: () => openPile(tile) });
  if (!x && usable(tile)) add({ label: 'Use', hint: 'Click', run: () => useAt(tile) });
  if (!x && !c && !pile && !usable(tile) && !same(tile, self) && standable(tile)) add({ label: 'Walk here', hint: 'Click', run: () => walkTo(tile) });
  if (!x && same(tile, self) && v.route.length) add({ label: 'Stop walking', hint: 'Esc', run: () => walkTo(tile) });
  const title = x?.name ?? c?.name ?? (pile ? 'On the ground' : placeAt(core.map, tile));
  const alive = () => (x ? !!who(x.id) : true) && (!c || corpsesAt(core.view, tile).some(k => k.id === c.id)) && (!pile || pileAt(core.view, tile).length > 0);
  return { title, entries, alive };
}

/** Space and Tab: the next creature near you, shades included. */
export function cycleTarget() {
  const v = core.view;
  if (!v) return;
  const self = v.self;
  const foes = [...v.monsters.map(m => ({ id: m.id, at: m as Pos })), ...(v.shades ?? []).map(s => ({ id: s.id, at: s as Pos }))];
  const list = foes.filter(f => f.at.z === self.z && distance(self, f.at) <= 7).sort((a, b) => distance(self, a.at) - distance(self, b.at));
  if (!list.length) { statusLine('Nothing to fight nearby.'); return; }
  const i = list.findIndex(f => f.id === self.target);
  core.send({ kind: 'target', id: list[(i + 1) % list.length].id });
}
