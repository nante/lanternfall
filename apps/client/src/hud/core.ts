// What every HUD window reads: the map, the world view, the latest game view and the way to act. One instance, set up
// by main.ts; the selectors below are pure functions of a view.
import { buildTown } from '../../../../packages/game/src/town.ts';
import { distance, G, T, type Action, type GameItem, type GameView, type ItemKind, type MapData, type Pos } from '../../../../packages/game/src/model.ts';
import { defaultBalance, defaultRules as rules } from '../../../../packages/game/src/default-balance.ts';
import type { WorldView } from '../render/view.ts';

export { rules, distance };
export const balance = defaultBalance;
export const itemDef = rules.item;

export const core = {
  map: buildTown() as MapData,
  world: undefined as unknown as WorldView,
  view: undefined as GameView | undefined,
  /** Server time as the client reads it. */
  serverOffset: 0,
  send: (_a: Action) => {},
  /** Asks every window to redraw from the current view (after a client-only change: a tab, a selection). */
  redraw: () => {},
};
export const serverNow = () => performance.now() + core.serverOffset;

// ---------------------------------------------------------------- selectors
export const same = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y && a.z === b.z;
export const groundKey = (p: Pos) => `ground:${p.x},${p.y},${p.z}`;
export const equipKey = (v: GameView) => `equip:${v.self.id}`;
export const vaultKey = (v: GameView) => `vault:${v.self.id}`;

export function stats(v: GameView) {
  const s = v.self, l = rules.level(s.xp);
  return { level: l, maxHp: rules.maxHP(l), maxMana: rules.maxMana(l), cap: rules.capacity(l), melee: rules.melee(s.melee), shielding: rules.shielding(s.shielding), magic: rules.magic(s.magic) };
}
const kidsCache = new WeakMap<GameView, Map<string, GameItem[]>>();
/** Items by the container (or slot holder) they sit in, for this view. */
export function byParent(v: GameView) {
  let m = kidsCache.get(v);
  if (m) return m;
  m = new Map();
  for (const i of [...v.items, ...v.ground]) { const l = m.get(i.parent) ?? []; l.push(i); m.set(i.parent, l); }
  kidsCache.set(v, m);
  return m;
}
export const kids = (v: GameView, parent: string) => byParent(v).get(parent) ?? [];
/** Everything worn or inside what is worn, depth first. */
export function carried(v: GameView) {
  const out: GameItem[] = [];
  const walk = (p: string) => { for (const i of kids(v, p)) { out.push(i); walk(i.id); } };
  walk(equipKey(v));
  return out;
}
export const isCarried = (v: GameView, id: string) => carried(v).some(c => c.id === id);
export const countOf = (v: GameView, kind: ItemKind) => carried(v).filter(i => i.kind === kind).reduce((n, i) => n + i.count, 0);
export const weightOf = (v: GameView) => carried(v).reduce((n, i) => n + itemDef(i.kind).weight * i.count, 0);
export const findItem = (v: GameView | undefined, id: string) => v?.items.find(x => x.id === id) ?? v?.ground.find(x => x.id === id);
/** A floor pile, bottom first. */
export const pileAt = (v: GameView | undefined, p: Pos) => (v ? kids(v, groundKey(p)).slice().sort((a, b) => a.slot - b.slot) : []);
/** Bodies on a tile, bottom first: the newest lies on top (ties by id). */
export const corpsesAt = (v: GameView | undefined, p: Pos) => (v?.corpses ?? []).filter(c => same(c, p) && c.stage < 2).sort((a, b) => a.born - b.born || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
export const topCorpse = (v: GameView | undefined, p: Pos) => corpsesAt(v, p).at(-1);
/** A living creature or another hero standing on the tile keeps what lies there out of reach. */
export const bodyOn = (v: GameView | undefined, p: Pos) => !!v && (v.monsters.some(m => m.hp > 0 && same(m, p)) || (v.shades ?? []).some(s => same(s, p)) || v.players.some(h => h.id !== v.self.id && same(h, p)));

export const thingAt = (p: Pos) => core.map.floors[p.z]?.thing[p.y * core.map.width + p.x];
export const usable = (p: Pos) => ([T.door, T.hatch, T.ladder, T.well, T.altar, T.vault] as number[]).includes(thingAt(p) ?? -1);
export const inPz = (p: Pos) => { const m = core.map, r = m.floors[p.z]?.roof[p.y * m.width + p.x] ?? -1; return p.z === 0 && r >= 0 && !!m.buildings[r]?.pz; };
export const npcAt = (id?: string | null) => core.map.npcs.find(n => n.id === id);
/** A tile a body could stand on: walkable ground, not a wall, not an NPC. */
export function standable(q: Pos) {
  const m = core.map, f = m.floors[q.z];
  if (!f || q.x < 0 || q.y < 0 || q.x >= m.width || q.y >= m.height) return false;
  const i = q.y * m.width + q.x, g = f.ground[i], t = f.thing[i];
  return g !== G.water && g !== G.void && ([T.none, T.flowers, T.door, T.hatch] as number[]).includes(t) && !m.npcs.some(n => same(n, q));
}
