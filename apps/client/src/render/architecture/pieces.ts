import * as THREE from 'three';
import { ramps } from '../palette.ts';
import { Mason, prim, rnd, mix } from './kit.ts';
import type { District, Grove, Ruin } from './scene.ts';

/**
 * Builders for placed pieces: each takes a piece from `scene.ts` and the ground, and knows nothing else about where it
 * stands. Town houses, city towers, districts, ruins and groves.
 */
export type Ground = (x: number, z: number) => number;
/** May something be built at x, z? (Off the road, off the crag.) */
export type Clear = (x: number, z: number) => boolean;

const clamp = (t: number, a = 0, b = 1) => Math.max(a, Math.min(b, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export const TOWN = {
  walls: [ramps.bone[0], mix(ramps.stone[4], ramps.bone[0], 0.5), ramps.stone[3], mix(ramps.earth[7], ramps.bone[0], 0.4), mix(ramps.stone[4], ramps.slate[2], 0.3), ramps.bone[1]],
  roofs: [ramps.roof[1], ramps.roof[2], ramps.roof[2], ramps.roof[3], mix(ramps.roof[2], ramps.earth[6], 0.5), mix(ramps.earth[7], ramps.bone[0], 0.3), ramps.slate[1], mix(ramps.roof[1], ramps.slate[0], 0.5)],
  timber: ramps.earth[2],
  void: ramps.night[2],
  stone: mix(ramps.stone[3], ramps.slate[1], 0.45),
  trim: mix(ramps.stone[4], ramps.slate[2], 0.3),
  spire: ramps.slate[0],
};
const RUIN = {
  stone: mix(ramps.stone[3], ramps.slate[2], 0.3),
  light: mix(ramps.stone[4], ramps.bone[0], 0.2),
  dark: mix(ramps.stone[2], ramps.slate[1], 0.35),
  deep: mix(ramps.stone[1], ramps.slate[0], 0.4),
  rubble: [ramps.stone[1], ramps.stone[2], ramps.stone[3], mix(ramps.stone[2], ramps.earth[6], 0.4), mix(ramps.stone[3], ramps.slate[2], 0.3)],
};

/** A pinnacle: a square shaft and a four-sided spike. */
export function pinnacle(m: Mason, x: number, y: number, z: number, s: number, color = TOWN.stone) {
  m.put(prim.box(), color, x, y + s * 0.9, z, { sx: s * 1.3, sy: s * 1.8, sz: s * 1.3 });
  m.put(prim.cone(4), TOWN.spire, x, y + s * 1.8 + s * 2, z, { sx: s, sy: s * 4, sz: s, ry: Math.PI / 4 });
}

/**
 * A town house in the current frame, standing on height y: tall plastered walls in storeys, rows of small windows on
 * the street side (some of them lit at night, built into `lit`), a steep roof, and now and then a chimney, a dormer or
 * a corner turret. The tall pale fronts and many windows are what make ref-2's city read as dense.
 */
export function townHouse(m: Mason, lit: Mason, y: number, w: number, d: number, h: number, i: number) {
  const wall = TOWN.walls[Math.floor(rnd(i, 11) * TOWN.walls.length)], roof = TOWN.roofs[Math.floor(rnd(i, 9) * TOWN.roofs.length)];
  const storeys = Math.max(1, Math.round(h / 2.1));
  m.block(wall, 0, y - 1.5, y + h, 0, w, d);
  for (let s = 1; s < storeys; s++) m.block(TOWN.timber, 0, y + (s * h) / storeys - 0.1, y + (s * h) / storeys + 0.1, 0, w + 0.14, d + 0.14);
  const bays = clamp(Math.floor(w / 1.2), 1, 4);
  for (let s = 0; s < Math.min(storeys, 4); s++) for (let b = 0; b < bays; b++) {
    if (rnd(i * 7 + s, b) > 0.82) continue;
    const wx = ((b + 0.5) / bays) * w - w / 2, wy = y + ((s + 0.55) * h) / storeys;
    (rnd(i * 13 + s * 3, b + 9) < 0.3 ? lit : m).put(prim.pane(), TOWN.void, wx, wy, d / 2 + 0.03, { sx: 0.42, sy: 0.72 });
  }
  const along = w >= d, span = Math.min(w, d), rise = span * (1.0 + rnd(i, 4) * 0.7);
  m.put(prim.gable(), roof, 0, y + h, 0, { sx: (along ? w : d) + 0.5, sy: rise, sz: span + 0.5, ry: along ? 0 : Math.PI / 2 });
  if (rnd(i, 21) < 0.55) m.block(TOWN.stone, (rnd(i, 22) - 0.5) * w * 0.6, y + h + rise * 0.3, y + h + rise + 0.55, (rnd(i, 23) - 0.5) * d * 0.4, 0.5, 0.5);
  if (along && rnd(i, 24) < 0.3) {
    const dx = (rnd(i, 25) - 0.5) * w * 0.5;
    m.block(wall, dx, y + h + rise * 0.18, y + h + rise * 0.18 + 0.75, span * 0.3, 0.85, 0.7);
    m.put(prim.pane(), TOWN.void, dx, y + h + rise * 0.18 + 0.38, span * 0.3 + 0.37, { sx: 0.36, sy: 0.42 });
  }
  if (rnd(i, 26) < 0.14) {
    const tw = span * 0.5, sx = rnd(i, 27) < 0.5 ? -1 : 1, top = y + h + rise * 0.75;
    m.block(wall, (sx * w) / 2, y - 1.5, top, d * 0.3, tw, tw);
    m.put(prim.cone(4), TOWN.spire, (sx * w) / 2, top + tw * 0.9, d * 0.3, { sx: tw * 0.8, sy: tw * 1.8, sz: tw * 0.8, ry: Math.PI / 4 });
    m.put(prim.pane(), TOWN.void, (sx * w) / 2, top - 0.9, d * 0.3 + tw / 2 + 0.03, { sx: 0.34, sy: 0.6 });
  }
}

/** A city tower: a square shaft with a belfry opening, under a pyramid spire with corner pinnacles, a tall cone, or a dome. */
export function cityTower(m: Mason, x: number, y: number, z: number, w: number, h: number, kind: number) {
  m.block(TOWN.stone, x, y - 3, y + h, z, w, w);
  m.block(TOWN.trim, x, y + h - 0.8, y + h, z, w + 0.6, w + 0.6);
  m.block(TOWN.trim, x, y + h * 0.55, y + h * 0.55 + 0.4, z, w + 0.3, w + 0.3);
  m.put(prim.lancet(), TOWN.void, x, y + h - 3.6, z + w / 2, { sx: Math.max(0.9, w * 0.26), sy: 0.8, sz: 0.5 });
  if (kind === 0) {
    m.put(prim.cone(4), TOWN.spire, x, y + h + w * 1.3, z, { sx: w * 0.8, sy: w * 2.6, sz: w * 0.8, ry: Math.PI / 4 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pinnacle(m, x + sx * w * 0.5, y + h, z + sz * w * 0.5, w * 0.13);
  } else if (kind === 1) m.put(prim.cone(8), TOWN.roofs[2], x, y + h + w * 1.4, z, { sx: w * 0.72, sy: w * 2.8, sz: w * 0.72, ry: Math.PI / 8 });
  else { m.put(prim.dome(8, 3), TOWN.spire, x, y + h, z, { sx: w * 0.62, sy: w * 0.8, sz: w * 0.62 }); m.put(prim.box(), TOWN.spire, x, y + h + w * 0.8 + 0.8, z, { sx: 1.0, sy: 1.6, sz: 1.0 }); }
}

/** Fill a district's rectangle with houses on a jittered grid (so they pack like streets, not like scattered seed) and its towers. */
export function buildDistrict(m: Mason, lit: Mason, g: Ground, clear: Clear, p: District) {
  const depth = p.z0 - p.z1, cell = Math.sqrt(((p.x1 - p.x0) * depth) / p.houses);
  const nx = Math.max(1, Math.floor((p.x1 - p.x0) / cell)), nz = Math.max(1, Math.floor(depth / cell));
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const i = p.seed * 4099 + iz * nx + ix;
    const x = p.x0 + (ix + 0.2 + rnd(i, 1) * 0.6) * cell, z = p.z1 + (iz + 0.2 + rnd(i, 2) * 0.6) * cell;
    if (!clear(x, z)) continue;
    const far = (p.z0 - z) / depth;
    const w = Math.min(lerp(p.size[0], p.size[1], rnd(i, 3)), cell * 1.05), d = Math.min(lerp(p.size[0], p.size[1], rnd(i, 4)) * 0.85, cell * 1.05);
    const h = lerp(p.storeys[0], p.storeys[1], rnd(i, 5)) * 2.1 * (1 + (p.tiers ?? 0) * far);
    const ry = (rnd(i, 6) < 0.3 ? Math.PI / 2 : 0) + (rnd(i, 7) - 0.5) * 0.3, y = g(x, z);
    m.within(x, 0, z, ry, () => lit.within(x, 0, z, ry, () => townHouse(m, lit, y, w, d, h, i)));
  }
  for (let t = 0; t < p.towers; t++) {
    const i = p.seed * 911 + t, x = lerp(p.x0, p.x1, rnd(i, 31)), z = lerp(p.z1, p.z0, rnd(i, 32));
    if (clear(x, z)) cityTower(m, x, g(x, z), z, 2.2 + rnd(i, 33) * 1.4, 7 + rnd(i, 34) * 6, t % 3);
  }
}

/**
 * A ruin (ref-1's foreground): a broken wall of uneven height with breaches and a lancet, a stub of a round tower at one
 * end, and fallen stone on the ground around it.
 */
export function buildRuin(m: Mason, g: Ground, p: Ruin) {
  m.within(p.x, 0, p.z, p.ry, () => {
    const G = (x: number, z: number) => { const w = m.world(x, 0, z); return g(w.x, w.z); };
    const seg = 1.6, n = Math.max(2, Math.round(p.span / seg));
    let hgt = p.height * (0.5 + rnd(p.seed, 1) * 0.4);
    for (let i = 0; i < n; i++) {
      const x = -p.span / 2 + (i + 0.5) * seg, r = rnd(p.seed * 31 + i, 2), y = G(x, 0);
      hgt = clamp(hgt + (r - 0.5) * p.height * 0.7, 0.7, p.height);
      if (rnd(p.seed * 17 + i, 3) < 0.15) { hgt = 0.6; m.put(prim.rock(), RUIN.rubble[i % 5], x, y + 0.3, 0.2, { sx: 0.9, sy: 0.5, sz: 0.8, ry: r * 6 }); continue; }
      m.block(i % 3 === 0 ? RUIN.dark : RUIN.stone, x, y - 1, y + hgt, 0, seg + 0.08, 1.3);
      // A ragged top: a half-width stub left standing, and a paler course where the weather strikes.
      if (r > 0.55) m.block(RUIN.stone, x - 0.4, y + hgt, y + hgt + 0.5 + r * 0.6, 0, 0.8, 1.3);
      if (hgt > 2.4) m.block(RUIN.light, x, y + hgt - 0.3, y + hgt, 0, seg + 0.2, 1.4);
      if (hgt > 3.2 && r < 0.4) m.put(prim.lancet(), RUIN.deep, x, y + 1.0, 0, { sx: 0.6, sy: 0.6, sz: 1.5 });
    }
    if (p.tower) {
      const x = p.span / 2 + 1.4, y = G(x, 0), th = p.height * 1.35;
      m.put(prim.cyl(10), RUIN.stone, x, y + th / 2 - 0.5, 0, { sx: 1.9, sy: th + 1, sz: 1.9 });
      m.put(prim.cyl(10), RUIN.light, x, y + th * 0.55, 0, { sx: 2.05, sy: 0.3, sz: 2.05 });
      for (let k = 0; k < 4; k++) { const a = k * 1.3 + rnd(p.seed, 5 + k); m.block(RUIN.dark, x + Math.sin(a) * 1.5, y + th, y + th + 0.5 + rnd(p.seed, 9 + k) * 1.4, Math.cos(a) * 1.5, 0.9, 0.9, a); }
      m.put(prim.lancet(), RUIN.deep, x, y + th * 0.5, 1.75, { sx: 0.5, sy: 0.5, sz: 0.5 });
    }
    // Fallen stone: blocks lying where they fell, more on the side that faces the town.
    for (let i = 0; i < Math.round(p.span * 1.6); i++) {
      const a = rnd(p.seed * 53 + i, 6), b = rnd(p.seed * 59 + i, 7), c = rnd(p.seed * 61 + i, 8);
      const x = (a - 0.5) * (p.span + 7), z = (b < 0.72 ? 0.9 + b * 6 : -0.9 - (b - 0.72) * 9), y = G(x, z), s = 0.25 + c * c * 1.0;
      if (c < 0.55) m.put(prim.box(), RUIN.rubble[i % 5], x, y + s * 0.3, z, { sx: s * 1.5, sy: s * 0.8, sz: s, ry: a * 6, rz: (b - 0.5) * 0.7 });
      else m.put(prim.rock(), RUIN.rubble[i % 5], x, y + s * 0.2, z, { sx: s, sy: s * 0.6, sz: s * 0.9, ry: b * 6 });
    }
  });
}

export type TreeSpot = { x: number; y: number; z: number; s: number; ry: number; tone: number };
/** Where a grove's trees stand: round-crowned and fir, by its share. */
export function groveSpots(g: Ground, clear: Clear, p: Grove) {
  const broadleaf: TreeSpot[] = [], fir: TreeSpot[] = [];
  for (let k = 0; k < p.trees; k++) {
    const i = p.seed * 7919 + k, x = lerp(p.x0, p.x1, (k + rnd(i, 1)) / p.trees), z = lerp(p.z1, p.z0, rnd(i, 2));
    if (!clear(x, z)) continue;
    (rnd(i, 3) < p.broadleaf ? broadleaf : fir).push({ x, y: g(x, z), z, s: lerp(p.size[0], p.size[1], rnd(i, 4)), ry: rnd(i, 5) * 6.28, tone: rnd(i, 6) });
  }
  return { broadleaf, fir };
}

const merged = (parts: [THREE.BufferGeometry, string][]) => {
  const pos: number[] = [], nrm: number[] = [], col: number[] = [], c = new THREE.Color();
  for (const [geo, color] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo, P = g.attributes.position, N = g.attributes.normal; c.set(color);
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nrm.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(c.r, c.g, c.b); }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
};
/** A round-crowned tree, one unit of scale about 2.6 tall: a trunk and four overlapping heads (white, tinted per tree). */
export function broadleafGeometry() {
  const head = (x: number, y: number, z: number, r: number, shade: string) => [new THREE.IcosahedronGeometry(r, 1).scale(1, 0.86, 1).translate(x, y, z), shade] as [THREE.BufferGeometry, string];
  return merged([
    [new THREE.CylinderGeometry(0.1, 0.16, 1.2, 5).translate(0, 0.6, 0), '#5a4636'],
    head(0, 1.75, 0, 0.8, '#e6e6e6'), head(-0.5, 1.45, 0.12, 0.55, '#c4c4c4'), head(0.52, 1.5, -0.05, 0.58, '#d4d4d4'), head(0.06, 2.2, -0.2, 0.5, '#ffffff'),
  ]);
}
/** A fir: three stacked skirts narrowing to a point, darker underneath each, on a short trunk. */
export function firGeometry() {
  const skirt = (y: number, r: number, h: number, shade: string) => [new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2, 0), shade] as [THREE.BufferGeometry, string];
  return merged([
    [new THREE.CylinderGeometry(0.1, 0.14, 0.6, 5).translate(0, 0.3, 0), '#4a3a2e'],
    skirt(0.4, 1.0, 1.3, '#bcbcbc'), skirt(1.15, 0.76, 1.15, '#dcdcdc'), skirt(1.85, 0.5, 1.15, '#ffffff'),
  ]);
}
