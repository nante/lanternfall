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
  void: ramps.night[2],
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
  // Windows on all four faces: the street front (+z) with its door, the back with a back door now and then, and the
  // gable ends with fewer bays. A pane faces +z; `ry` turns it onto its face.
  const faces: [number, number, number][] = [[w, d / 2, 0], [w, d / 2, Math.PI], [d, w / 2, Math.PI / 2], [d, w / 2, -Math.PI / 2]];
  faces.forEach(([span, out, ry], f) => {
    const bays = clamp(Math.floor(span / (f < 2 ? 1.2 : 1.5)), 1, 4), door = f === 0 || (f === 1 && rnd(i, 41) < 0.4);
    for (let s = 0; s < Math.min(storeys, 4); s++) for (let b = 0; b < bays; b++) {
      const u = ((b + 0.5) / bays) * span - span / 2, wy = y + ((s + 0.55) * h) / storeys, k = i * 7 + f * 101 + s;
      const at = (v: number) => [Math.cos(ry) * v + Math.sin(ry) * (out + 0.03), -Math.sin(ry) * v + Math.cos(ry) * (out + 0.03)];
      if (s === 0 && b === 0 && door) { const [px, pz] = at(u); m.put(prim.pane(), TOWN.timber, px, y + 0.6, pz, { sx: 0.6, sy: 1.2, ry }); continue; }
      if (rnd(k, b) > (f < 2 ? 0.82 : 0.6)) continue;
      const [px, pz] = at(u);
      (rnd(i * 13 + f * 17 + s * 3, b + 9) < 0.3 ? lit : m).put(prim.pane(), TOWN.void, px, wy, pz, { sx: 0.42, sy: 0.72, ry });
    }
  });
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
 * Coursed ashlar across a wall from x0 to x1 (local frame), y0 to y1, `thick` deep about z = 0: courses of dressed stones
 * in staggered bond, each a touch proud or shy of the face and in its own tone, over a dark core that shows as mortar.
 * `top(x)` gives the broken top at each stone, so a ruined wall steps down stone by stone instead of in slabs.
 */
export function ashlar(m: Mason, x0: number, x1: number, y0: number, y1: number, thick: number, seed: number, tones: string[], top: (x: number) => number = () => y1) {
  const ch = 0.46;
  m.block(RUIN.deep, (x0 + x1) / 2, y0, Math.min(y1, Math.max(y0 + 0.1, top((x0 + x1) / 2))) - 0.05, 0, x1 - x0 - 0.04, thick - 0.12);
  for (let row = 0, y = y0; y < y1 - 0.05; row++, y += ch) {
    let x = x0 - (row % 2) * 0.35;
    for (let k = 0; x < x1; k++) {
      const len = 0.55 + rnd(seed * 13 + row * 7, k) * 0.5, a = Math.max(x, x0), b = Math.min(x + len, x1);
      const cx = (a + b) / 2;
      if (b - a > 0.12 && y + ch * 0.5 < top(cx)) {
        const j = rnd(seed + row * 3, k * 5), d = (rnd(seed * 3 + k, row) - 0.5) * 0.07;
        m.block(tones[Math.floor(j * tones.length)], cx, y, Math.min(y + ch - 0.05, y1), d, b - a - 0.05, thick + d * 0.5);
      }
      x += len;
    }
  }
}

/**
 * A ruin (ref-1's foreground): a broken wall of coursed stone stepping down to breaches, lancets, ivy climbing the face
 * that looks at the town, a stub of a round tower at one end, and fallen stone on the ground around it.
 */
export function buildRuin(m: Mason, g: Ground, p: Ruin) {
  m.within(p.x, 0, p.z, p.ry, () => {
    const G = (x: number, z: number) => { const w = m.world(x, 0, z); return g(w.x, w.z); };
    const seg = 1.6, n = Math.max(2, Math.round(p.span / seg)), tones = [RUIN.stone, RUIN.stone, RUIN.dark, RUIN.light, RUIN.rubble[4]];
    let hgt = p.height * (0.5 + rnd(p.seed, 1) * 0.4);
    for (let i = 0; i < n; i++) {
      const x = -p.span / 2 + (i + 0.5) * seg, r = rnd(p.seed * 31 + i, 2), y = G(x, 0);
      const prev = hgt;
      hgt = clamp(hgt + (r - 0.5) * p.height * 0.7, 0.7, p.height);
      if (rnd(p.seed * 17 + i, 3) < 0.15) { hgt = 0.6; m.put(prim.rock(), RUIN.rubble[i % 5], x, y + 0.3, 0.2, { sx: 0.9, sy: 0.5, sz: 0.8, ry: r * 6 }); continue; }
      // The top runs from the last segment's height to this one's, broken stone by stone.
      const h0 = prev, h1 = hgt, x0 = x - seg / 2, top = (u: number) => y + h0 + (h1 - h0) * ((u - x0) / seg) - rnd(Math.floor(u * 3), p.seed + i) * 0.5;
      ashlar(m, x0, x0 + seg, y - 0.4, y + Math.max(h0, h1), 1.3, p.seed * 101 + i, tones, top);
      if (hgt > 3.2 && r < 0.4) m.put(prim.lancet(), RUIN.deep, x, y + 1.0, 0, { sx: 0.6, sy: 0.6, sz: 1.5 });
      // Ivy on the town side: clumps climbing from the foot.
      if (rnd(p.seed * 7 + i, 4) < 0.45) for (let k = 0; k < 4; k++) {
        const iy = y + 0.2 + rnd(i, k + p.seed) * hgt * 0.7;
        m.put(prim.dome(6, 2), ['#2b4a2d', '#335631', '#3e6435'][k % 3], x + (rnd(k, i) - 0.5) * seg * 0.8, iy, 0.66, { sx: 0.35 + rnd(i, k) * 0.3, sy: 0.3 + rnd(k, i + 3) * 0.4, sz: 0.12, rx: Math.PI / 2 });
      }
    }
    if (p.tower) { const x = p.span / 2 + 1.4; roundRuin(m, x, G(x, 0), 0, 1.86, p.height * 1.35, p.seed, tones, RUIN.deep, RUIN.void); }
    // Fallen stone: blocks lying where they fell, more on the side that faces the town.
    for (let i = 0; i < Math.round(p.span * 1.6); i++) {
      const a = rnd(p.seed * 53 + i, 6), b = rnd(p.seed * 59 + i, 7), c = rnd(p.seed * 61 + i, 8);
      const x = (a - 0.5) * (p.span + 7), z = (b < 0.72 ? 0.9 + b * 6 : -0.9 - (b - 0.72) * 9), y = G(x, z), s = 0.25 + c * c * 1.0;
      if (c < 0.55) m.put(prim.box(), RUIN.rubble[i % 5], x, y + s * 0.3, z, { sx: s * 1.5, sy: s * 0.8, sz: s, ry: a * 6, rz: (b - 0.5) * 0.7 });
      else m.put(prim.rock(), RUIN.rubble[i % 5], x, y + s * 0.2, z, { sx: s, sy: s * 0.6, sz: s * 0.9, ry: b * 6 });
    }
  });
}

/**
 * A ruined round tower: coursed rings over a dark core, the upper courses broken away round one side, slits up the
 * face. Shared by the ruins' tower stubs and the watchtower.
 */
export function roundRuin(m: Mason, x: number, y: number, z: number, r: number, th: number, seed: number, tones: string[], core: string, slit: string, face = 0) {
  m.put(prim.cyl(12), core, x, y + th / 2 - 0.5, z, { sx: r - 0.02, sy: th + 1, sz: r - 0.02 });
  const n = Math.round(14 * r / 1.86);
  for (let row = 0, yy = y - 0.5; yy < y + th + 1.2; row++, yy += 0.46) {
    const gone = yy > y + th - 0.8;
    for (let k = 0; k < n; k++) {
      const a = ((k + (row % 2) * 0.5) / n) * Math.PI * 2;
      if (gone && Math.sin(a + seed) > -0.2 + (yy - y - th) * 0.6) continue;
      const j = rnd(seed + row, k), rr = r + 0.02 + (j - 0.5) * 0.06;
      m.block(tones[Math.floor(j * tones.length)], x + Math.sin(a) * rr, yy, yy + 0.41, z + Math.cos(a) * rr, (Math.PI * 2 * r) / n * 0.95, 0.3, a);
    }
  }
  for (let k = 0; k < Math.floor(th / 3); k++) { const a = face + (rnd(seed, k + 5) - 0.5) * 1.6, yy = y + 1.2 + k * 3; m.block(slit, x + Math.sin(a) * (r + 0.1), yy, yy + 0.8, z + Math.cos(a) * (r + 0.1), 0.16, 0.12, a); }
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
/**
 * A round-crowned tree, one unit of scale about 2.6 tall: a trunk and four overlapping heads (white, tinted per tree).
 * `detail` 0 is for trees seen only from far off, at a quarter of the triangles.
 */
export function broadleafGeometry(detail = 1) {
  const head = (x: number, y: number, z: number, r: number, shade: string) => [new THREE.IcosahedronGeometry(r, detail).scale(1, 0.86, 1).translate(x, y, z), shade] as [THREE.BufferGeometry, string];
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
