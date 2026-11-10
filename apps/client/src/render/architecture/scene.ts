/**
 * What stands where beyond the playable map, as data. One unit is one tile, the same scale as the town, so each piece
 * has a footprint that can later become walls, floors and doors on the map.
 *
 * This list is written by hand today. It is the shape a world-map editor would write: a placed building, a district
 * region filled with houses, a grove region, a ruin, a road. Builders (`pieces.ts`, `cathedral.ts`, `dragon.ts`) take a
 * piece and nothing else about where it goes. The one exception is Hollow Keep: its origin is data, but its towers and
 * walls are still authored around that origin in `castle.ts`.
 */
export type Road = { kind: 'road'; x: number; z0: number; z1: number; width: number };
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
export type SetPiece = Road | HollowKeepPiece | DragonPiece | CathedralCity | District | Ruin | Grove;

export const farScene: SetPiece[] = [
  { kind: 'road', x: 41, z0: -0.5, z1: -64, width: 5 },
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
];

export const pieceOf = <K extends SetPiece['kind']>(kind: K) => farScene.find(p => p.kind === kind) as Extract<SetPiece, { kind: K }>;
export const piecesOf = <K extends SetPiece['kind']>(kind: K) => farScene.filter(p => p.kind === kind) as Extract<SetPiece, { kind: K }>[];
