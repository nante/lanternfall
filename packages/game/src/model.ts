import { z } from 'zod';
import type { LightSource } from './light.ts';
import { grounds, things, itemKinds, mobKinds, spellIds, type GroundKind, type ThingKind, type MobKind, type NpcRole } from './ids.ts';
export { grounds, things, equipSlots, itemKinds, mobKinds, spellIds, npcRoles, type GroundKind, type ThingKind, type EquipSlot, type ItemKind, type MobKind, type SpellId, type NpcRole } from './ids.ts';

export const Position = z.object({ x: z.number().int(), y: z.number().int(), z: z.number().int().min(0).max(1) });
export type Pos = z.infer<typeof Position>;
export const key = (p: Pos) => `${p.x},${p.y},${p.z}`;
export const distance = (a: Pos, b: Pos) => (a.z === b.z ? Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) : Infinity);

export const G = Object.fromEntries(grounds.map((g, i) => [g, i])) as Record<GroundKind, number>;

export const T = Object.fromEntries(things.map((t, i) => [t, i])) as Record<ThingKind, number>;
const open = new Set<ThingKind>(['none', 'hatch', 'ladder', 'flowers', 'door']);
const opaque = new Set<ThingKind>(['wall', 'rampart', 'cavewall', 'tree', 'pine']);
export const thingBlocks = (t: number) => !open.has(things[t]);
export const thingHidesSight = (t: number) => opaque.has(things[t]);

export type Floor = { ground: Uint8Array; thing: Uint8Array; roof: Int16Array };
export type Building = { id: number; name: string; x0: number; y0: number; x1: number; y1: number; roof: 'slate' | 'clay' | 'thatch' | 'teal'; wall: 'plaster' | 'stone' | 'timber'; pz?: boolean };
export type NpcSpawn = Pos & { id: string; name: string; role: NpcRole; look: string };
export type Spawn = Pos & { kind: MobKind };
export type Place = { name: string; x0: number; y0: number; x1: number; y1: number; z: number };
export type MapData = {
  name: string; width: number; height: number; floors: Floor[]; buildings: Building[];
  links: Record<string, Pos>; npcs: NpcSpawn[]; spawns: Spawn[]; places: Place[]; shrine: Pos; vault: Pos;
};

export const stackMax = 100;
export const HeroName = z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _'-]+$/u, 'Names are 2–20 letters, digits, spaces, _ \' or -');

export const Item = z.object({ id: z.string(), kind: z.enum(itemKinds), count: z.number().int().min(1).max(stackMax), parent: z.string(), slot: z.number().int(), version: z.number().int() });
export type GameItem = z.infer<typeof Item>;
export const Player = Position.extend({
  id: z.string(), name: z.string(), token: z.string(), epoch: z.number(), seq: z.number(),
  hp: z.number(), mana: z.number(), xp: z.number(), melee: z.number(), shielding: z.number(), magic: z.number(),
  fed: z.number(), regen: z.number(), moveAt: z.number(), attackAt: z.number(), spellAt: z.number(), combatUntil: z.number(),
  connected: z.boolean(), target: z.string().nullable(), path: z.array(Position), facing: z.number(),
  quests: z.record(z.string(), z.number()), talking: z.string().nullable(), deaths: z.number(),
  fightMode: z.enum(['offensive', 'balanced', 'defensive']).default('balanced'), chase: z.boolean().default(true),
  manual: z.boolean().default(false), blocks: z.number().default(2), blockTurn: z.number().default(0),
});
export type Hero = z.infer<typeof Player>;
export const Monster = Position.extend({ id: z.string(), kind: z.enum(mobKinds), hp: z.number(), home: Position, moveAt: z.number(), attackAt: z.number(), respawnAt: z.number(), target: z.string().nullable(), damage: z.record(z.string(), z.number()), facing: z.number() });
export type Mob = z.infer<typeof Monster>;
export const Corpse = Position.extend({ id: z.string(), name: z.string(), kind: z.string(), owner: z.string(), protectedUntil: z.number(), expiresAt: z.number(), born: z.number().default(0), stage: z.number().int().min(0).max(2).default(0) });
export type Body = z.infer<typeof Corpse>;
export const GameState = z.object({ version: z.literal(2), revision: z.number(), time: z.number(), rng: z.number(), players: z.record(z.string(), Player), items: z.record(z.string(), Item), monsters: z.record(z.string(), Monster), corpses: z.record(z.string(), Corpse), doors: z.record(z.string(), z.boolean()) });
export type State = z.infer<typeof GameState>;

export const Command = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('walk'), dx: z.number().int().min(-1).max(1), dy: z.number().int().min(-1).max(1) }),
  z.object({ kind: z.literal('path'), to: Position }),
  z.object({ kind: z.literal('stop') }),
  z.object({ kind: z.literal('target'), id: z.string().nullable() }),
  z.object({ kind: z.literal('useTile'), to: Position }),
  z.object({ kind: z.literal('say'), text: z.string().min(1).max(180) }),
  z.object({ kind: z.literal('cast'), spell: z.enum(spellIds) }),
  z.object({ kind: z.literal('useItem'), id: z.string() }),
  z.object({ kind: z.literal('useKind'), item: z.enum(itemKinds) }),
  z.object({ kind: z.literal('moveItem'), id: z.string(), parent: z.string(), slot: z.number().int().min(0).max(40), count: z.number().int().min(1).max(stackMax), version: z.number().int() }),
  z.object({ kind: z.literal('trade'), npc: z.string(), item: z.enum(itemKinds), mode: z.enum(['buy', 'sell']), count: z.number().int().min(1).max(50) }),
  z.object({ kind: z.literal('talk'), npc: z.string().nullable() }),
  z.object({ kind: z.literal('logout') }),
  z.object({ kind: z.literal('mode'), fight: z.enum(['offensive', 'balanced', 'defensive']).optional(), chase: z.boolean().optional() }),
  z.object({ kind: z.literal('look'), at: Position, actor: z.string().max(64).optional() }),
]);
export type Action = z.infer<typeof Command>;
export const Envelope = z.object({ requestId: z.string().uuid(), epoch: z.number().int(), seq: z.number().int().positive(), action: Command });
export type Notice = { player: string; text: string; kind: 'info' | 'combat' | 'error' | 'npc' | 'level' | 'loot'; at: number; npc?: string };
export type Effect = { id: number; kind: 'hit' | 'miss' | 'heal' | 'mana' | 'ember' | 'burst' | 'block' | 'xp' | 'level'; at: Pos; value: number; time: number; from?: Pos };
export type PublicHero = Omit<Hero, 'token' | 'path'>;
export type Shade = Pos & { id: string; facing: number; size: 1 | 2 | 3 };
export type GameView = { revision: number; time: number; self: PublicHero; route: Pos[]; players: PublicHero[]; monsters: Mob[]; corpses: Body[]; items: GameItem[]; ground: GameItem[]; doors: Record<string, boolean>; effects: Effect[]; shades?: Shade[]; lights?: LightSource[]; world?: { dayMs: number; dayOffset: number; darkness: boolean } };

