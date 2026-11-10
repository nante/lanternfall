/**
 * What stands where beyond the playable map, as data. One unit is one tile, the same scale as the town, so each piece
 * has a footprint that can later become walls, floors and doors on the map.
 *
 * This list is written by hand today. It is the shape a world-map editor would write: a placed building, a district
 * region filled with houses, a grove region, a ruin, a road. Builders (`pieces.ts`, `cathedral.ts`, `dragon.ts`) take a
 * piece and nothing else about where it goes. The one exception is Hollow Keep: its origin is data, but its towers and
 * walls are still authored around that origin in `castle.ts`.
 */
/** A road out of the map along z, from z0 (the map's edge) to z1, `width` wide at the edge and `far` wide at its end. */
export type Road = { kind: 'road'; x: number; z0: number; z1: number; width: number; far: number; /** How far it wanders from x once clear of the map. */ wander: number; /** Half-width kept free of buildings and trees. */ clearance: number };
export type HollowKeepPiece = { kind: 'hollowKeep'; x: number; z: number };
export type DragonPiece = { kind: 'dragon'; x: number; z: number; ry: number; scale: number; /** Height of its feet above the ground. */ perch: number };
export type CathedralCity = { kind: 'cathedralCity'; x: number; z: number; scale: number };
export type District = {
  kind: 'district'; name: string; x0: number; x1: number; /** Near edge (towards the town) and far edge. */ z0: number; z1: number;
  houses: number; seed: number; /** House width range, tiles. */ size: [number, number]; /** Storeys, low to high. */ storeys: [number, number];
  towers: number; /** How much taller houses stand at the far edge than the near edge (0 = level). */ tiers?: number;
};
export type Ruin = { kind: 'ruin'; x: number; z: number; ry: number; /** Length of the broken wall. */ span: number; height: number; seed: number; tower?: boolean };
export type Grove = { kind: 'grove'; x0: number; x1: number; z0: number; z1: number; trees: number; seed: number; /** Share of round-crowned trees; the rest are firs. */ broadleaf: number; size: [number, number] };
/**
 * A stretch of country beyond one side of the map: ground that stays level for the skirt by the map's edge, then rolls
 * and climbs away from the town between `ramp` distances, painted by its cover. `faces` is the side that looks at the town.
 */
export type Country = {
  kind: 'country'; name: string; x0: number; x1: number; z0: number; z1: number; faces: 'n' | 's' | 'e' | 'w';
  /** The line (a z for 'n' and 's', an x for 'e' and 'w') the climb is measured from: the map's edge. */ from: number;
  cover: 'fields' | 'forest' | 'heath'; /** Height reached at the far side. */ rise: number; /** Distance in from `faces` where the climb starts and ends. */ ramp: [number, number];
  /** Swell of the rolling ground. */ roll: number; seed: number;
};
/** The river beyond the map, from x0 to x1 (the map draws its own stretch), centred on z, bending as it goes. */
export type River = { kind: 'river'; z: number; x0: number; x1: number; width: number };
/** A lake: an oval basin with a wandering shore, water at `level`. */
export type Lake = { kind: 'lake'; x: number; z: number; rx: number; rz: number; level: number; seed: number };
/** A mountain range: a strip `length` long and `depth` deep, its back turned away from the town by `ry`; snow above `snow`. */
export type Range = { kind: 'range'; x: number; z: number; ry: number; length: number; depth: number; height: number; seed: number; tone: 0 | 1 | 2; snow?: number };
export type Windmill = { kind: 'windmill'; x: number; z: number; /** The way its sails face. */ ry: number; scale: number; seed: number };
export type Lighthouse = { kind: 'lighthouse'; x: number; z: number; scale: number; seed: number };
/** A ruined round watchtower on a hill, with a stub of curtain wall. */
export type Watchtower = { kind: 'watchtower'; x: number; z: number; height: number; seed: number };
/** A run of sea cliffs along local x, from the water up to the ground above, turned by `ry`. */
export type Cliffs = { kind: 'cliffs'; x: number; z: number; ry: number; span: number; seed: number };
export type SetPiece = Road | HollowKeepPiece | DragonPiece | CathedralCity | District | Ruin | Grove | Country | River | Lake | Range | Windmill | Lighthouse | Watchtower | Cliffs;

export const farScene: SetPiece[] = [
  // The street out of the bridge, the width of the map's path at the edge, widening into the riverside quarter.
  { kind: 'road', x: 40.5, z0: -0.5, z1: -64, width: 2.2, far: 4, wander: 0, clearance: 4.2 },
  // The road south from the gate across the farmland, towards the windmill ridge.
  { kind: 'road', x: 42.5, z0: 67.5, z1: 330, width: 5, far: 3, wander: 6, clearance: 4 },
  { kind: 'hollowKeep', x: 34, z: -106 },
  { kind: 'dragon', x: 48, z: -114, ry: 0.32, scale: 1.7, perch: 7 },
  { kind: 'cathedralCity', x: 128, z: -255, scale: 1.2 },

  { kind: 'district', name: 'Riverside quarter', x0: -70, x1: 160, z0: -27, z1: -56, houses: 300, seed: 3, size: [2.4, 3.8], storeys: [1.3, 2.8], towers: 5 },
  { kind: 'district', name: 'Lower town, west', x0: -80, x1: 48, z0: -64, z1: -120, houses: 330, seed: 5, size: [3, 5], storeys: [1.6, 3.2], towers: 6, tiers: 0.5 },
  { kind: 'district', name: 'Lower town, east', x0: 108, x1: 172, z0: -64, z1: -120, houses: 170, seed: 7, size: [3, 5], storeys: [1.6, 3.2], towers: 4, tiers: 0.5 },
  { kind: 'district', name: 'Cathedral rise', x0: 62, x1: 200, z0: -132, z1: -200, houses: 260, seed: 9, size: [3.5, 5.5], storeys: [2, 3.8], towers: 9, tiers: 0.6 },

  // Old walls on the north bank, either side of the road out of the bridge.
  { kind: 'ruin', x: 21, z: -8, ry: 0.12, span: 15, height: 4.6, seed: 1, tower: true },
  { kind: 'ruin', x: 63, z: -7, ry: -0.18, span: 12, height: 3.8, seed: 2 },
  { kind: 'ruin', x: 33, z: -14, ry: 1.2, span: 6, height: 3.2, seed: 3 },
  { kind: 'ruin', x: 51, z: -13, ry: -1.1, span: 7, height: 5.2, seed: 4, tower: true },
  { kind: 'ruin', x: -6, z: -6, ry: -0.1, span: 10, height: 3, seed: 5 },
  { kind: 'ruin', x: 90, z: -10, ry: 0.25, span: 9, height: 4.2, seed: 6 },

  { kind: 'grove', x0: -150, x1: 240, z0: -12, z1: -22, trees: 120, seed: 1, broadleaf: 0.75, size: [1.2, 2.0] },
  { kind: 'grove', x0: -150, x1: 240, z0: -22, z1: -30, trees: 70, seed: 2, broadleaf: 0.5, size: [1.5, 2.4] },
  { kind: 'grove', x0: -150, x1: 240, z0: -56, z1: -66, trees: 150, seed: 3, broadleaf: 0.35, size: [1.8, 2.8] },
  // Giants along the north bank: old trees three times a house's height, for scale against the figures on the bridge.
  { kind: 'grove', x0: -40, x1: 130, z0: -9.5, z1: -13, trees: 16, seed: 4, broadleaf: 1, size: [3.4, 4.6] },

  // The north closes on a slate ridge and the snow range behind it.
  { kind: 'range', x: 82, z: -335, ry: 0, length: 764, depth: 60, height: 30, seed: 2.2, tone: 1 },
  { kind: 'range', x: 82, z: -440, ry: 0, length: 1004, depth: 100, height: 78, seed: 7.7, tone: 2, snow: 50 },

  // The river runs west into the lake and east down a valley pressed flat through the hills.
  { kind: 'river', z: 5, x0: -62, x1: 414, width: 5 },

  // South: rolling farmland past the meadow, hedged fields and farmsteads, climbing to a ridge of windmills; low downs
  // behind, and the range far off.
  { kind: 'country', name: 'The Wold', x0: -0.5, x1: 103.5, z0: 67.5, z1: 200, faces: 'n', from: 67.5, cover: 'fields', rise: 13, ramp: [70, 150], roll: 3.5, seed: 4 },
  { kind: 'country', name: 'The far Wold', x0: -310, x1: 414, z0: 200, z1: 380, faces: 'n', from: 67.5, cover: 'fields', rise: 13, ramp: [70, 150], roll: 3.5, seed: 4 },
  { kind: 'district', name: 'Wold farmsteads', x0: -10, x1: 110, z0: 100, z1: 170, houses: 18, seed: 21, size: [2.6, 4.2], storeys: [1, 1.6], towers: 0 },
  { kind: 'district', name: 'Millbrook', x0: 52, x1: 96, z0: 176, z1: 204, houses: 26, seed: 23, size: [2.6, 4], storeys: [1.1, 2], towers: 1 },
  { kind: 'windmill', x: -6, z: 226, ry: Math.PI, scale: 1.25, seed: 1 },
  { kind: 'windmill', x: 30, z: 236, ry: Math.PI + 0.3, scale: 1.4, seed: 2 },
  { kind: 'windmill', x: 112, z: 228, ry: Math.PI - 0.2, scale: 1.3, seed: 3 },
  { kind: 'windmill', x: 166, z: 240, ry: Math.PI + 0.1, scale: 1.15, seed: 4 },
  { kind: 'grove', x0: -10, x1: 114, z0: 110, z1: 150, trees: 40, seed: 11, broadleaf: 0.85, size: [1.6, 2.6] },
  { kind: 'grove', x0: -260, x1: 360, z0: 250, z1: 310, trees: 140, seed: 12, broadleaf: 0.6, size: [2, 3] },
  { kind: 'range', x: 52, z: 405, ry: Math.PI, length: 820, depth: 60, height: 22, seed: 5.1, tone: 1 },
  { kind: 'range', x: 52, z: 520, ry: Math.PI, length: 1100, depth: 110, height: 64, seed: 3.3, tone: 2, snow: 46 },

  // East: the Whisperwood runs on into forested hills, with a ruined watchtower on the highest; a dark range behind.
  { kind: 'country', name: 'The Whisperwold', x0: 103.5, x1: 414, z0: -44, z1: 200, faces: 'w', from: 103.5, cover: 'forest', rise: 30, ramp: [24, 150], roll: 7, seed: 6 },
  { kind: 'watchtower', x: 214, z: 40, height: 17, seed: 3 },
  { kind: 'grove', x0: 112, x1: 400, z0: 14, z1: 200, trees: 1100, seed: 13, broadleaf: 0.3, size: [1.6, 2.8] },
  { kind: 'grove', x0: 112, x1: 400, z0: -40, z1: 0, trees: 160, seed: 14, broadleaf: 0.4, size: [1.6, 2.6] },
  { kind: 'range', x: 439, z: 34, ry: -Math.PI / 2, length: 760, depth: 60, height: 34, seed: 8.4, tone: 1 },
  { kind: 'range', x: 545, z: 34, ry: -Math.PI / 2, length: 1000, depth: 110, height: 82, seed: 1.9, tone: 2, snow: 56 },

  // West: a great lake below the map, sea cliffs along its far shore, a lighthouse on a rock off them; the range
  // beyond, low over the water.
  { kind: 'country', name: 'Greywater shore', x0: -310, x1: -0.5, z0: -44, z1: 200, faces: 'e', from: -0.5, cover: 'heath', rise: 30, ramp: [206, 222], roll: 2.5, seed: 8 },
  { kind: 'lake', x: -165, z: 40, rx: 115, rz: 110, level: -0.7, seed: 2 },
  { kind: 'cliffs', x: -213, z: 40, ry: Math.PI / 2, span: 210, seed: 5 },
  { kind: 'lighthouse', x: -192, z: 8, scale: 1, seed: 1 },
  { kind: 'range', x: -335, z: 34, ry: Math.PI / 2, length: 760, depth: 60, height: 26, seed: 6.6, tone: 1 },
  { kind: 'range', x: -440, z: 34, ry: Math.PI / 2, length: 1000, depth: 100, height: 70, seed: 4.2, tone: 2, snow: 50 },
];

export const pieceOf = <K extends SetPiece['kind']>(kind: K) => farScene.find(p => p.kind === kind) as Extract<SetPiece, { kind: K }>;
export const piecesOf = <K extends SetPiece['kind']>(kind: K) => farScene.filter(p => p.kind === kind) as Extract<SetPiece, { kind: K }>[];
