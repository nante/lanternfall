// Reading and editing a character from outside play (the Studio). The game server applies edits inside its own transaction.
import { z } from 'zod';
import { equipSlots, itemKinds, stackMax, HeroName, type GameItem, type Hero, type ItemKind, type Pos } from './model.ts';
import { Engine, GameError } from './engine.ts';

/** An item and what it holds. Arrays are indexed by slot; null is an empty slot. */
export type ItemNode = { id?: string; kind: ItemKind; count: number; contents?: (ItemNode | null)[] };
const Node: z.ZodType<ItemNode> = z.lazy(() => z.object({
  id: z.string().max(64).optional(), kind: z.enum(itemKinds), count: z.number().int().min(1).max(stackMax), contents: z.array(Node.nullable()).max(40).optional(),
}).strict());

export const vaultSlots = 30;
const maxDepth = 6;

export type Skill = { level: number; progress: number };
export type Account = {
  id: string; name: string; connected: boolean; position: Pos;
  level: number; xp: number; xpLevel: number; xpNext: number;
  hp: number; maxHp: number; mana: number; maxMana: number;
  skills: { melee: Skill; shielding: Skill; magic: Skill };
  deaths: number; fed: number; quests: Record<string, number>;
  weight: number; capacity: number; gold: number;
  equip: (ItemNode | null)[]; vault: (ItemNode | null)[];
  /** Changes whenever any item the character owns changes; item edits must name the stamp they were made against. */
  itemsStamp: string;
};

export const AccountEdit = z.object({
  name: HeroName.optional(),
  level: z.number().int().min(1).max(1000).optional(),
  hp: z.number().int().min(1).optional(),
  mana: z.number().int().min(0).optional(),
  skills: z.object({ melee: z.number().int().min(10).max(500), shielding: z.number().int().min(10).max(500), magic: z.number().int().min(0).max(500) }).partial().strict().optional(),
  deaths: z.number().int().min(0).optional(),
  items: z.object({ stamp: z.string(), equip: z.array(Node.nullable()).length(equipSlots.length), vault: z.array(Node.nullable()).max(vaultSlots) }).strict().optional(),
}).strict();
export type AccountEdit = z.infer<typeof AccountEdit>;

/** Item edits made against items that have since changed in game. */
export class StaleItems extends GameError {}

const roots = (id: string) => [`equip:${id}`, `vault:${id}`];

function owned(e: Engine, p: Hero) {
  const mine = new Set(roots(p.id));
  return Object.values(e.state.items).filter(i => mine.has(e.root(i)));
}
function stampOf(items: GameItem[]) {
  const text = items.map(i => `${i.id}:${i.kind}:${i.count}:${i.parent}:${i.slot}:${i.version}`).sort().join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return `${items.length}-${(h >>> 0).toString(16)}`;
}
function tree(e: Engine, parent: string, size: number): (ItemNode | null)[] {
  const out: (ItemNode | null)[] = Array(size).fill(null);
  for (const i of e.children(parent)) {
    if (i.slot >= size) continue;
    const slots = e.rules.item(i.kind).slots;
    out[i.slot] = { id: i.id, kind: i.kind, count: i.count, ...(slots ? { contents: tree(e, i.id, slots) } : {}) };
  }
  return out;
}

export function accountOf(e: Engine, p: Hero): Account {
  const r = e.rules, s = e.stats(p);
  return {
    id: p.id, name: p.name, connected: p.connected, position: { x: p.x, y: p.y, z: p.z },
    level: s.level, xp: p.xp, xpLevel: r.xpAt(s.level), xpNext: r.xpAt(s.level + 1),
    hp: p.hp, maxHp: s.maxHp, mana: p.mana, maxMana: s.maxMana,
    skills: { melee: r.melee(p.melee), shielding: r.shielding(p.shielding), magic: r.magic(p.magic) },
    deaths: p.deaths, fed: p.fed, quests: p.quests,
    weight: e.weight(p), capacity: s.cap, gold: e.gold(p),
    equip: tree(e, `equip:${p.id}`, equipSlots.length), vault: tree(e, `vault:${p.id}`, vaultSlots),
    itemsStamp: stampOf(owned(e, p)),
  };
}

/** Apply a Studio edit to one character, all or nothing. Throws GameError on bad input and leaves the state as it was. */
export function applyAccountEdit(e: Engine, id: string, edit: AccountEdit) {
  const before = e.state;
  e.state = structuredClone(before);
  try { apply(e, id, edit); } catch (error) { e.state = before; throw error; }
}
function apply(e: Engine, id: string, edit: AccountEdit) {
  const p = e.state.players[id];
  if (!p) throw new GameError('That character no longer exists.');
  const r = e.rules;
  if (edit.name !== undefined) p.name = edit.name;
  if (edit.level !== undefined && edit.level !== r.level(p.xp)) p.xp = r.xpAt(edit.level);
  const sk = edit.skills ?? {};
  if (sk.melee !== undefined && sk.melee !== r.melee(p.melee).level) p.melee = r.meleeAt(sk.melee);
  if (sk.shielding !== undefined && sk.shielding !== r.shielding(p.shielding).level) p.shielding = r.shieldingAt(sk.shielding);
  if (sk.magic !== undefined && sk.magic !== r.magic(p.magic).level) p.magic = r.magicAt(sk.magic);
  const s = e.stats(p);
  p.hp = Math.min(s.maxHp, edit.hp ?? p.hp);
  p.mana = Math.min(s.maxMana, edit.mana ?? p.mana);
  if (edit.deaths !== undefined) p.deaths = edit.deaths;
  if (edit.items) replaceItems(e, p, edit.items);
}

function replaceItems(e: Engine, p: Hero, input: NonNullable<AccountEdit['items']>) {
  const old = owned(e, p);
  if (stampOf(old) !== input.stamp) throw new StaleItems('Their items changed in game since you loaded them. Refresh and make the item changes again.');
  const reusable = new Map(old.map(i => [i.id, i]));
  for (const i of old) delete e.state.items[i.id];
  const place = (node: ItemNode, parent: string, slot: number, depth: number) => {
    const def = e.rules.item(node.kind);
    if (node.count > 1 && !def.stack) throw new GameError(`${def.name} does not stack, so its count must be 1.`);
    if (node.contents?.length && !def.slots) throw new GameError(`${def.name} is not a container.`);
    if (node.contents && def.slots && node.contents.length > def.slots) throw new GameError(`${def.name} holds ${def.slots} items, not ${node.contents.length}.`);
    if (depth > maxDepth) throw new GameError('Containers are nested too deeply.');
    const prev = node.id ? reusable.get(node.id) : undefined;
    if (prev) reusable.delete(prev.id);
    const item: GameItem = { id: prev?.id ?? crypto.randomUUID(), kind: node.kind, count: node.count, parent, slot, version: (prev?.version ?? 0) + 1 };
    e.state.items[item.id] = item;
    node.contents?.forEach((child, i) => { if (child) place(child, item.id, i, depth + 1); });
  };
  input.equip.forEach((node, i) => {
    if (!node) return;
    const def = e.rules.item(node.kind);
    if (def.slot !== equipSlots[i]) throw new GameError(`${def.name} does not go in the ${equipSlots[i]} slot.`);
    place(node, `equip:${p.id}`, i, 1);
  });
  input.vault.forEach((node, i) => { if (node) place(node, `vault:${p.id}`, i, 1); });
  e.assertItems();
}
