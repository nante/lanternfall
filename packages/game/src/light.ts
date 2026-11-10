import { type MapData, type Pos, type Hero, type GameItem, T, key, distance, equipSlots, thingHidesSight } from './model.ts';
import type { Balance } from './content-schema.ts';

export type Phase = 'dawn' | 'day' | 'golden' | 'blue' | 'night';
export type WorldLight = { dayMs: number; dayOffset: number };
export type Clock = { day: number; phase: Phase; phaseT: number; dayT: number };
export type LightColor = 'amber' | 'teal';
export type LightSource = { id: string; x: number; y: number; z: number; level: number; color: LightColor; high?: boolean };

export const PHASES: { phase: Phase; minutes: number }[] = [
  { phase: 'dawn', minutes: 3 },
  { phase: 'day', minutes: 20 },
  { phase: 'golden', minutes: 3 },
  { phase: 'blue', minutes: 2 },
  { phase: 'night', minutes: 12 },
];

export const CYCLE_MINUTES = 40;
export const BLUE_MINUTE = 26;
export const RIPPLE_MS_PER_TILE = 500;
const dayTime = (time: number, world: WorldLight) => {
  const elapsed = time + world.dayOffset;
  return elapsed - Math.floor(elapsed / world.dayMs) * world.dayMs;
};

export function clockAt(time: number, world: WorldLight): Clock {
  const elapsed = time + world.dayOffset;
  const day = Math.floor(elapsed / world.dayMs);
  const withinDay = dayTime(time, world);
  let startMinutes = 0;
  for (const { phase, minutes } of PHASES) {
    const start = world.dayMs * startMinutes / CYCLE_MINUTES;
    const end = world.dayMs * (startMinutes + minutes) / CYCLE_MINUTES;
    if (withinDay < end) return { day, phase, phaseT: (withinDay - start) / (end - start), dayT: withinDay / world.dayMs };
    startMinutes += minutes;
  }
  throw new RangeError('Invalid day length');
}

export function outdoorAmbient(clock: Clock): number {
  switch (clock.phase) {
    case 'dawn': return Math.round(1 + 6 * clock.phaseT);
    case 'day': return 7;
    case 'golden': return 5;
    case 'blue': return 2;
    case 'night': return 1;
  }
}

export function ambientAt(map: MapData, p: Pos, clock: Clock): number {
  if (p.z === 1) return 0;
  const floor = map.floors[p.z];
  const roofed = floor && p.x >= 0 && p.y >= 0 && p.x < map.width && p.y < map.height
    && floor.roof[p.y * map.width + p.x] >= 0;
  const ambient = outdoorAmbient(clock);
  return roofed ? Math.max(3, ambient) : ambient;
}

export function lamps(map: MapData): Pos[] {
  const result: Pos[] = [];
  for (let z = 0; z < map.floors.length; z++) {
    const floor = map.floors[z];
    for (let i = 0; i < map.width * map.height; i++) {
      if (floor.thing[i] === T.lamp) result.push({ x: i % map.width, y: Math.floor(i / map.width), z });
    }
  }
  return result;
}

export const lampDistance = (map: MapData, lamp: Pos) => Math.max(Math.abs(lamp.x - map.shrine.x), Math.abs(lamp.y - map.shrine.y));
const lampIgnition = (map: MapData, lamp: Pos, world: WorldLight) =>
  world.dayMs * BLUE_MINUTE / CYCLE_MINUTES + RIPPLE_MS_PER_TILE * lampDistance(map, lamp);

export function lampIgniteAt(map: MapData, lampIndex: number, world: WorldLight): number {
  const lamp = lamps(map)[lampIndex];
  if (!lamp) throw new RangeError('Invalid lamp index');
  return lampIgnition(map, lamp, world);
}

// Each rectangle lies on walkable meadow tiles south of the gate.
const wispLoops = [
  { x0: 30, y0: 59, x1: 33, y1: 62, period: 24_000 },
  { x0: 40, y0: 59, x1: 43, y1: 62, period: 28_000 },
  { x0: 51, y0: 62, x1: 53, y1: 64, period: 32_000 },
];

export function wildWisps(time: number, world: WorldLight): LightSource[] {
  if (clockAt(time, world).phase !== 'night') return [];
  return wispLoops.map((loop, i) => {
    const t = ((time + world.dayOffset) % loop.period + loop.period) % loop.period / loop.period * 4;
    const edge = Math.floor(t), along = t - edge;
    const x = edge === 0 ? loop.x0 + (loop.x1 - loop.x0) * along
      : edge === 2 ? loop.x1 - (loop.x1 - loop.x0) * along
      : edge === 1 ? loop.x1 : loop.x0;
    const y = edge === 1 ? loop.y0 + (loop.y1 - loop.y0) * along
      : edge === 3 ? loop.y1 - (loop.y1 - loop.y0) * along
      : edge === 2 ? loop.y1 : loop.y0;
    return { id: `wisp:${i}`, x: Math.round(x), y: Math.round(y), z: 0, level: 3, color: 'teal' };
  });
}

export function staticSources(map: MapData, time: number, world: WorldLight): LightSource[] {
  const sources: LightSource[] = [{ id: 'lantern', ...map.shrine, level: 10, color: 'teal', high: true }];
  const lampPositions = lamps(map);
  const maxDistance = Math.max(0, ...lampPositions.map(lamp => lampDistance(map, lamp)));
  const withinDay = dayTime(time, world);
  const blueStart = world.dayMs * BLUE_MINUTE / CYCLE_MINUTES;
  lampPositions.forEach((lamp, i) => {
    const ignition = lampIgnition(map, lamp, world);
    const extinguish = (maxDistance - lampDistance(map, lamp)) * RIPPLE_MS_PER_TILE;
    // If the fixed travel time extends past dawn, this lamp has not ignited in that cycle.
    const lit = withinDay >= blueStart ? withinDay >= ignition : ignition < world.dayMs && withinDay < extinguish;
    if (lit) sources.push({ id: `lamp:${i}`, ...lamp, level: 6, color: 'amber' });
  });
  for (let z = 0; z < map.floors.length; z++) {
    const floor = map.floors[z];
    for (let i = 0; i < map.width * map.height; i++) {
      const thing = floor.thing[i];
      if (thing === T.brazier || thing === T.altar) {
        const kind = thing === T.brazier ? 'brazier' : 'altar';
        sources.push({ id: `${kind}:${z}:${i}`, x: i % map.width, y: Math.floor(i / map.width), z, level: 5, color: 'amber' });
      }
    }
  }
  return sources.concat(wildWisps(time, world));
}

export function lightPasses(map: MapData, from: Pos, to: Pos, doors: Record<string, boolean>): boolean {
  if (from.z !== to.z) return false;
  const n = Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y));
  for (let i = 1; i < n; i++) {
    const q = { x: Math.round(from.x + (to.x - from.x) * i / n), y: Math.round(from.y + (to.y - from.y) * i / n), z: from.z };
    const floor = map.floors[q.z];
    const thing = floor && q.x >= 0 && q.y >= 0 && q.x < map.width && q.y < map.height
      ? floor.thing[q.y * map.width + q.x] : T.cavewall;
    if (thingHidesSight(thing) || (thing === T.door && !doors[key(q)])) return false;
  }
  return true;
}

export function sourceLevelAt(src: LightSource, p: Pos): number {
  if (src.z !== p.z) return 0;
  const dx = src.x - p.x, dy = src.y - p.y;
  const squared = dx * dx + dy * dy;
  for (let level = src.level; level > 0; level--) {
    const radius = src.level - level;
    if (squared <= radius * radius) return level;
  }
  return 0;
}

export function lightLevel(map: MapData, p: Pos, sources: LightSource[], doors: Record<string, boolean>, clock: Clock): number {
  let level = ambientAt(map, p, clock);
  for (const source of sources) {
    const candidate = sourceLevelAt(source, p);
    if (candidate > level && (source.high || lightPasses(map, source, p, doors))) level = candidate;
  }
  return Math.min(7, level);
}

/** Only equipped, lit torches shine; a torch in a pack is unlit. */
export function carriedTorches(players: Hero[], items: GameItem[], balance: Balance): LightSource[] {
  const carriers = new Map(players.map(p => [`equip:${p.id}`, p]));
  const sources: LightSource[] = [];
  for (const item of items) {
    if (item.kind !== 'torch' || item.slot !== equipSlots.indexOf('shield')) continue;
    const carrier = carriers.get(item.parent), level = balance.items.torch.light ?? 0;
    if (carrier && level > 0) sources.push({ id: `torch:${carrier.id}`, x: carrier.x, y: carrier.y, z: carrier.z, level, color: 'amber' });
  }
  return sources;
}

/** `level` may be passed when the caller already knows the target tile's light level (a per-tick cache). */
export function perceive(map: MapData, viewer: Pos, target: Pos, sources: LightSource[], doors: Record<string, boolean>, clock: Clock, level?: number): 'full' | 'shade' | 'none' {
  const d = distance(viewer, target);
  if (d === Infinity) return 'none';
  if (d > 1 && !lightPasses(map, viewer, target, doors)) return 'none';
  const lv = level ?? lightLevel(map, target, sources, doors, clock);
  if (lv >= 2) return 'full';
  if (d <= 3 || lv === 1) return 'shade';
  return 'none';
}

export function lightGrid(map: MapData, z: number, rect: { x0: number; y0: number; x1: number; y1: number }, sources: LightSource[], doors: Record<string, boolean>, clock: Clock): Uint8Array {
  const width = Math.max(0, rect.x1 - rect.x0 + 1), height = Math.max(0, rect.y1 - rect.y0 + 1);
  const grid = new Uint8Array(width * height);
  for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) {
    grid[(y - rect.y0) * width + x - rect.x0] = lightLevel(map, { x, y, z }, sources, doors, clock);
  }
  return grid;
}

export function reachMasks(map: MapData, z: number, rect: { x0: number; y0: number; x1: number; y1: number }, sources: LightSource[], doors: Record<string, boolean>): Uint32Array {
  const width = Math.max(0, rect.x1 - rect.x0 + 1), height = Math.max(0, rect.y1 - rect.y0 + 1);
  const masks = new Uint32Array(width * height);
  for (let y = rect.y0; y <= rect.y1; y++) for (let x = rect.x0; x <= rect.x1; x++) {
    const p = { x, y, z };
    let mask = 0;
    for (let i = 0; i < Math.min(32, sources.length); i++) {
      const source = sources[i];
      if (source.z === z && (source.high || lightPasses(map, source, p, doors))) mask |= 1 << i;
    }
    masks[(y - rect.y0) * width + x - rect.x0] = mask;
  }
  return masks;
}
