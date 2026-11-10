import * as THREE from 'three';
import { ramps } from '../palette.ts';
import { Mason, prim, masonry, rnd, mix, type Shade } from './kit.ts';
import type { Ground } from './castle.ts';
import { pieceOf, type CathedralCity } from './scene.ts';
import { cityTower, townHouse } from './pieces.ts';

/**
 * Saint-Vigil, the cathedral city on the hills far behind the castle's eastern wing, ~320 units from the town, so its
 * spires rise in haze over the arched bridge: a gothic cathedral with twin
 * spires, pinnacles, flying buttresses and a crossing spire, over a city of steep roofs and towers climbing its hill,
 * and a hazier second skyline behind. Silhouette and massing only; everything merges into one mesh.
 */
/** Where the city stands and how large its cathedral is: a placed piece (`scene.ts`). */
export const CITY: CathedralCity = pieceOf('cathedralCity');

const clamp = (t: number, a = 0, b = 1) => Math.max(a, Math.min(b, t));
/** What the city's hill adds to the land: a broad dome. */
export function cityHill(x: number, z: number) {
  const d = Math.hypot((x - CITY.x) / 78, (z - CITY.z) / 46);
  return d >= 1 ? 0 : 16 * (1 - d * d) ** 1.5;
}

const C = {
  wall: mix(ramps.stone[3], ramps.slate[1], 0.45),
  wallDk: mix(ramps.stone[1], ramps.slate[0], 0.5),
  trim: mix(ramps.stone[4], ramps.slate[2], 0.3),
  spire: ramps.slate[0],
  void: ramps.night[2],
  roofs: [ramps.roof[1], ramps.roof[2], ramps.roof[2], ramps.roof[3], ramps.slate[1], mix(ramps.roof[2], ramps.earth[6], 0.5)],
};

/** A pinnacle: a square shaft and a four-sided spike. */
function pinnacle(m: Mason, x: number, y: number, z: number, s: number, color = C.wall) {
  m.put(prim.box(), color, x, y + s * 0.9, z, { sx: s * 1.3, sy: s * 1.8, sz: s * 1.3 });
  m.put(prim.cone(4), C.spire, x, y + s * 1.8 + s * 2, z, { sx: s, sy: s * 4, sz: s, ry: Math.PI / 4 });
}

/** The cathedral, west front to the south (towards the town), nave running north. */
function cathedral(m: Mason, g: Ground) {
  // Built about its own ground point, so the piece's scale grows it in place.
  const G = 0;
  m.within(CITY.x, g(CITY.x, CITY.z), CITY.z, 0.12, () => {
    const tower = (tx: number) => {
      m.block(C.wall, tx, G - 4, G + 30, -3, 8, 8);
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
        m.block(C.wall, tx + sx * 4, G - 4, G + 27, -3 + sz * 4, 1.8, 1.8);
        pinnacle(m, tx + sx * 4, G + 30, -3 + sz * 4, 1.0);
      }
      m.block(C.trim, tx, G + 13, G + 13.8, -3, 8.6, 8.6);
      m.block(C.trim, tx, G + 29.4, G + 30.4, -3, 8.8, 8.8);
      m.put(prim.lancet(), C.void, tx, G + 16, 1.1, { sx: 2.0, sy: 3.4, sz: 0.6 });
      // Octagonal belfry with tall openings, then the spire.
      m.put(prim.cyl(8), C.wall, tx, G + 34.5, -3, { sx: 3.4, sy: 9, sz: 3.4, ry: Math.PI / 8 });
      for (const a of [-0.8, 0, 0.8]) m.put(prim.lancet(), C.void, tx + Math.sin(a) * 3.1, G + 31.5, -3 + Math.cos(a) * 3.1, { ry: a, sx: 1.1, sy: 1.8, sz: 0.6 });
      m.put(prim.cone(8), C.spire, tx, G + 39 + 13, -3, { sx: 3.6, sy: 26, sz: 3.6, ry: Math.PI / 8 });
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; pinnacle(m, tx + Math.sin(a) * 3.2, G + 39, -3 + Math.cos(a) * 3.2, 0.8); }
      m.put(prim.box(), C.spire, tx, G + 66, -3, { sx: 1.1, sy: 2.4, sz: 1.1 });
    };
    tower(-9.5); tower(9.5);
    // West front between the towers: portals, a rose window, a gable with a pinnacle at its peak.
    m.block(C.wall, 0, G - 4, G + 24, -2, 11, 6);
    m.put(prim.gable(), C.wall, 0, G + 24, -2, { sx: 4, sy: 7, sz: 11, ry: Math.PI / 2 });
    pinnacle(m, 0, G + 30.5, -2, 0.9);
    m.put(prim.cyl(12), C.void, 0, G + 16.5, 1.1, { sx: 3, sy: 0.6, sz: 3, rx: Math.PI / 2 });
    m.put(prim.cyl(12), C.trim, 0, G + 16.5, 1.0, { sx: 3.6, sy: 0.5, sz: 3.6, rx: Math.PI / 2 });
    m.put(prim.lancet(), C.void, 0, G, 1.2, { sx: 3.4, sy: 3.2, sz: 0.6 });
    for (const x of [-9.5, 9.5]) m.put(prim.lancet(), C.void, x, G, 1.2, { sx: 2.2, sy: 2.2, sz: 0.6 });
    m.block(C.trim, 0, G + 10.6, G + 11.4, -1.6, 11.4, 6.6);
    // Nave, aisles and the flying buttresses that hold the nave up, a pinnacle on every pier.
    m.block(C.wall, 0, G - 4, G + 24, -28, 12, 46);
    m.put(prim.gable(), C.spire, 0, G + 24, -28, { sx: 46, sy: 9, sz: 13.2, ry: Math.PI / 2 });
    for (const s of [-1, 1]) {
      m.block(C.wallDk, s * 9, G - 4, G + 12, -28, 6, 44);
      m.put(prim.box(), C.spire, s * 9.3, G + 13, -28, { sx: 6.6, sy: 0.8, sz: 44, rz: -s * 0.35 });
      for (let i = 0; i < 8; i++) {
        const z = -8 - i * 5.4;
        m.block(C.wall, s * 14, G - 4, G + 19, z, 2.2, 2.4);
        pinnacle(m, s * 14, G + 19, z, 0.9);
        // The flyer: a strut from the pier head to the clerestory wall.
        const dx = -s * 7.6, dy = 5;
        m.put(prim.box(), C.wall, s * 14 + dx / 2, G + 15.5 + dy / 2, z, { sx: Math.hypot(dx, dy), sy: 1.0, sz: 0.9, rz: Math.atan2(dy, dx) });
        m.put(prim.lancet(), C.void, s * 6.2, G + 14.5, z - 2.7, { sx: 1.6, sy: 2.0, sz: 0.6, ry: Math.PI / 2 });
      }
    }
    // Crossing tower and its slender spire, transept ends, apse.
    m.block(C.wall, 0, G + 20, G + 36, -33, 10, 10);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pinnacle(m, sx * 5, G + 36, -33 + sz * 5, 1.1);
    for (const a of [-0.6, 0.6]) m.put(prim.lancet(), C.void, Math.sin(a) * 5.1, G + 27, -33 + Math.cos(a) * 5.1, { ry: a, sx: 1.4, sy: 2.2, sz: 0.6 });
    m.put(prim.cone(8), C.spire, 0, G + 36 + 11, -33, { sx: 3.2, sy: 22, sz: 3.2, ry: Math.PI / 8 });
    for (const s of [-1, 1]) {
      m.block(C.wall, s * 15, G - 4, G + 22, -33, 8, 12);
      m.put(prim.gable(), C.spire, s * 15, G + 22, -33, { sx: 8, sy: 7, sz: 12.4 });
      m.put(prim.cyl(12), C.void, s * 19.1, G + 15, -33, { sx: 2.4, sy: 0.6, sz: 2.4, rz: Math.PI / 2 });
    }
    m.put(prim.cyl(10), C.wall, 0, G + 8, -51, { sx: 6, sy: 24, sz: 6 });
    m.put(prim.cone(10), C.spire, 0, G + 24, -51, { sx: 6.4, sy: 8, sz: 6.4 });
  }, CITY.scale);
}

/** The cathedral, the city climbing its hill, the city walls and a hazier skyline behind. Windows that light at night go into `lit`. */
export function cathedralCity(g: Ground, lit: Mason) {
  const far = new THREE.Color(ramps.slate[1]);
  const shade: Shade = (c, p) => {
    c.multiplyScalar(0.75 + 0.25 * clamp((p.y - g(p.x, p.z)) / 5));
    c.lerp(far, clamp((CITY.z + 70 - p.z) / 120) * 0.6);
  };
  const m = new Mason(shade);
  cathedral(m, g);
  // The city climbs the hill: denser and taller near the cathedral, never on its footprint.
  const S = CITY.scale, inCathedral = (x: number, z: number) => Math.abs(x - CITY.x) < 24 * S && z < CITY.z + 8 * S && z > CITY.z - 60 * S;
  for (let i = 0; i < 520; i++) {
    const a = rnd(i, 1) * Math.PI * 2, r = Math.sqrt(rnd(i, 2)) * 0.95;
    const x = CITY.x + Math.cos(a) * r * 82, z = CITY.z + Math.sin(a) * r * 46;
    if (inCathedral(x, z)) continue;
    const near = 1 - r, w = 3 + rnd(i, 3) * 3.5, d = 3 + rnd(i, 4) * 3.5, h = 4 + rnd(i, 5) * 5 + near * 7;
    const ry = (rnd(i, 6) < 0.5 ? 0 : Math.PI / 2) + (rnd(i, 7) - 0.5) * 0.3, y = g(x, z);
    m.within(x, 0, z, ry, () => lit.within(x, 0, z, ry, () => townHouse(m, lit, y, w, d, h, i + 20000)));
  }
  for (let i = 0; i < 26; i++) {
    const a = rnd(i, 11) * Math.PI * 2, r = 0.2 + rnd(i, 12) * 0.7;
    const x = CITY.x + Math.cos(a) * r * 78, z = CITY.z + Math.sin(a) * r * 42;
    if (inCathedral(x, z)) continue;
    cityTower(m, x, g(x, z), z, 2.6 + rnd(i, 13) * 2.2, 10 + rnd(i, 14) * 14 * (1 - r * 0.6), i % 3);
  }
  // City walls along the foot of the hill, with round towers.
  for (let i = 0; i < 9; i++) {
    const x = CITY.x - 70 + i * 17.5, z = CITY.z + 44 - Math.abs(i - 4) ** 1.6 * 2.2, y = g(x, z);
    m.block(C.wallDk, x + 8.75, y - 3, y + 7, z, 17.5, 2.4);
    m.put(prim.cyl(10), C.wall, x, y + 3, z, { sx: 2.6, sy: 12, sz: 2.6 });
    m.put(prim.cone(10), C.roofs[1], x, y + 11.5, z, { sx: 3.1, sy: 5, sz: 3.1 });
  }
  // A second skyline far behind: towers and spires in haze.
  for (let i = 0; i < 22; i++) {
    const x = CITY.x - 50 + i * 10 + rnd(i, 21) * 8, z = CITY.z - 50 - rnd(i, 22) * 40, y = g(x, z);
    cityTower(m, x, y, z, 4 + rnd(i, 23) * 3, 14 + rnd(i, 24) * 26, i % 3);
  }
  const mesh = m.build(masonry());
  mesh.name = 'cathedral-city';
  return mesh;
}
