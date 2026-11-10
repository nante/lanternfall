import * as THREE from 'three';
import { ramps } from '../palette.ts';
import { Mason, prim, rnd, mix } from './kit.ts';
import { hash2 } from '../../../../../packages/game/src/town.ts';
import { buildRuin, roundRuin, townHouse, type Ground } from './pieces.ts';
import type { Cliffs, Country, Lake, Lighthouse, Range, River, Road, Watchtower, Windmill } from './scene.ts';

/**
 * The country round the map on the three sides the town did not face before: ground that rolls and climbs away from the
 * town, painted by its cover, lakes and rivers, mountain ranges that close the horizon, and the landmarks that stand
 * on it. Every builder takes a placed piece (`scene.ts`) and the ground, and nothing else about where it goes.
 */
const clamp = (t: number, a = 0, b = 1) => Math.max(a, Math.min(b, t));
const smooth = (a: number, b: number, t: number) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };

/** How far x, z is in from the side that faces the town. */
function depthIn(p: Country, x: number, z: number) {
  return p.faces === 'n' ? z - p.from : p.faces === 's' ? p.from - z : p.faces === 'w' ? x - p.from : p.from - x;
}
/** Signed distance in from the nearest of the three sides that do not face the town (negative outside them). */
function sideIn(p: Country, x: number, z: number) {
  const sides = { n: z - p.z0, s: p.z1 - z, w: x - p.x0, e: p.x1 - x };
  delete (sides as Partial<typeof sides>)[p.faces];
  return Math.min(...Object.values(sides));
}
const EDGE = 40;
/** The country's own height at x, z, before blending with its neighbours. */
function countryHeight(p: Country, x: number, z: number) {
  const d = depthIn(p, x, z), s = p.seed;
  const swell = (Math.sin(x * 0.043 + s) + Math.sin(z * 0.061 + x * 0.019 + s * 2.1) + 0.6 * Math.sin(x * 0.12 - z * 0.1 + s * 3.7)) / 2.6;
  return p.rise * smooth(p.ramp[0], p.ramp[1], d) + p.roll * (swell * 0.5 + 0.5) * smooth(18, 60, d);
}
/**
 * All countries' ground at x, z. Each weighs in over a band either side of its edges, and the weights are normalised,
 * so where two meet the ground is their average and there is no seam; past every country the land sinks to level.
 */
export function countriesHeight(list: Country[], x: number, z: number) {
  let sum = 0, weight = 0;
  for (const p of list) {
    const w = smooth(-EDGE, EDGE, Math.min(sideIn(p, x, z), depthIn(p, x, z)));
    if (w <= 0) continue;
    sum += w * countryHeight(p, x, z); weight += w;
  }
  return sum / Math.max(1, weight);
}

/** 0 at the middle of a lake, 1 on its shore and beyond: an oval whose shore wanders. */
export function lakeShore(p: Lake, x: number, z: number) {
  const dx = (x - p.x) / p.rx, dz = (z - p.z) / p.rz, a = Math.atan2(dz, dx);
  return Math.hypot(dx, dz) / (1 + 0.07 * Math.sin(a * 5 + p.seed) + 0.04 * Math.sin(a * 11 + p.seed * 2));
}
/** How much a lake takes out of the ground: a basin that drops below the water inside the shore. */
export function lakeDip(p: Lake, x: number, z: number) { return -4 * (1 - smooth(0.82, 1.0, lakeShore(p, x, z))); }

/** The river's course: the line the map's river follows, bending as it runs on. */
export function riverZ(p: River, x: number) { return p.z + Math.sin(x / 9) * 1.6 + Math.sin(x / 23) * 3; }
/** The ground is pressed flat along a river beyond the map, so hills never bury it. */
export function riverValley(p: River, x: number, z: number) { return x > p.x0 && x < p.x1 ? smooth(3, 22, Math.abs(z - riverZ(p, x))) : 1; }

/** Half the width of a road at z (it tapers from `width` at the map to `far` at its end), or 0 off its length. */
export function roadHalf(r: Road, z: number) {
  const t = (z - r.z0) / (r.z1 - r.z0);
  return t < 0 || t > 1 ? 0 : (r.width + (r.far - r.width) * t) / 2;
}
/** The road's centre at z: it wanders a little once it leaves the map. */
export function roadX(r: Road, z: number) { const d = Math.abs(z - r.z0); return r.x + Math.sin(d * 0.031 + r.x) * Math.min(1, d / 40) * r.wander; }

const C = {
  wheat: mix(ramps.olive[5], ramps.ochre[5], 0.55), hay: ramps.olive[4], barley: ramps.moss[9], pasture: ramps.moss[8], meadow: ramps.moss[10],
  fallow: ramps.earth[6], plough: ramps.soil[2], furrow: ramps.soil[1], hedge: ramps.moss[4], road: ramps.soil[3],
  wood: [ramps.moss[4], ramps.moss[5], ramps.moss[6], ramps.moss[5]], glade: ramps.olive[2],
  heath: [ramps.olive[2], ramps.moss[6], ramps.earth[5], ramps.olive[1], ramps.moss[7]], rock: [ramps.stone[2], ramps.stone[3], mix(ramps.stone[3], ramps.slate[1], 0.5)],
};

/**
 * Paint a country's cover into a texture at about one texel per 1.5 units, so fields keep crisp edges at any distance:
 * fields are a patchwork of crops in hedged plots on a slanted grid, with furrows in the ploughland; forest is mottled
 * dark green with glades; heath is mottled olive and brown. Steep ground shows rock, and roads are painted through.
 */
export function coverTexture(p: Country, g: Ground, roads: Road[]) {
  const W = p.x1 - p.x0, D = p.z1 - p.z0, nx = Math.ceil(W / 1.5), nz = Math.ceil(D / 1.5), data = new Uint8Array(nx * nz * 4);
  const c = new THREE.Color(), tone = new THREE.Color(), a = 0.16 + rnd(p.seed, 1) * 0.2, ca = Math.cos(a), sa = Math.sin(a);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = p.x0 + (i + 0.5) * (W / nx), z = p.z0 + (j + 0.5) * (D / nz), n = rnd(i * 0.37 + p.seed, j * 0.53);
    const d = depthIn(p, x, z);
    if (p.cover === 'fields') {
      const u = x * ca + z * sa, v = -x * sa + z * ca, row = Math.floor(v / 12), rv = v - row * 12;
      const cw = 14 + rnd(row, p.seed + 7) * 14, su = u + rnd(row, p.seed) * 40, col = Math.floor(su / cw), ru = su - col * cw;
      const k = rnd(row * 31 + col, p.seed + 3), crop = [C.wheat, C.barley, C.pasture, C.wheat, C.plough, C.hay, C.fallow, C.pasture][Math.floor(k * 8)];
      c.set(crop);
      if (crop === C.plough || crop === C.wheat) { const f = Math.floor((rnd(row, col) < 0.5 ? ru : rv) / 1.6) % 2; if (f) c.lerp(tone.set(crop === C.plough ? C.furrow : C.hay), 0.5); }
      const hedged = rnd(row * 7 + col, p.seed + 9) < 0.7;
      if (hedged && (ru < 1.3 || rv < 1.3)) c.set(C.hedge);
      // Near the map the land is still meadow, as the map's own edge is.
      c.lerp(tone.set(C.meadow), 1 - smooth(30, 70, d));
    } else if (p.cover === 'forest') {
      const glade = Math.sin(x * 0.09 + p.seed) + Math.sin(z * 0.11 - x * 0.03) > 1.3;
      c.set(glade ? C.glade : C.wood[Math.floor(n * 4)]);
    } else c.set(C.heath[Math.floor(rnd(Math.floor(x / 3), Math.floor(z / 3) + p.seed) * 5)]).lerp(tone.set(C.heath[Math.floor(n * 5)]), 0.35);
    if (p.cover !== 'fields' && Math.hypot(g(x + 1, z) - g(x - 1, z), g(x, z + 1) - g(x, z - 1)) > 1.1) c.set(C.rock[Math.floor(n * 3)]);
    for (const r of roads) { const h = roadHalf(r, z); if (h && Math.abs(x - roadX(r, z)) < h + (n - 0.5) * 0.8) c.set(C.road).multiplyScalar(0.9 + n * 0.2); }
    c.multiplyScalar(0.92 + n * 0.16);
    const o = (j * nx + i) * 4;
    data[o] = Math.round(clamp(c.r) * 255); data[o + 1] = Math.round(clamp(c.g) * 255); data[o + 2] = Math.round(clamp(c.b) * 255); data[o + 3] = 255;
  }
  const t = new THREE.DataTexture(data, nx, nz, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

/** A country's ground: a grid over its rectangle on the shared ground, its cover painted on, darker in the valleys. */
export function countryMesh(p: Country, g: Ground, roads: Road[], step = 4) {
  const W = p.x1 - p.x0, D = p.z1 - p.z0, geo = new THREE.PlaneGeometry(W, D, Math.ceil(W / step), Math.ceil(D / step));
  geo.rotateX(-Math.PI / 2); geo.translate((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2);
  const P = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute, cols = new Float32Array(P.count * 3);
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i), h = g(x, z);
    P.setY(i, h); uv.setXY(i, (x - p.x0) / W, 1 - (z - p.z0) / D);
    const v = 0.8 + 0.3 * clamp(h / 20);
    cols.set([v, v, v], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: coverTexture(p, g, roads), vertexColors: true, flatShading: true }));
  mesh.name = `country:${p.name}`; mesh.receiveShadow = true;
  return mesh;
}

/** A lake's water: an oval a touch larger than its shore, so the ground's edge hides its rim. */
export function lakeMesh(p: Lake) {
  const geo = new THREE.CircleGeometry(1.08, 48); geo.rotateX(-Math.PI / 2); geo.scale(p.rx, 1, p.rz); geo.translate(p.x, p.level, p.z);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: ramps.water[2] }));
  mesh.name = 'lake';
  return mesh;
}

/** Height of a range at local x (along it) and local z (towards its back at −z): layered sines rising from its front. */
function rangeHeight(p: Range, u: number, w: number) {
  const back = (p.depth / 2 - w) / p.depth, x = u + p.x * Math.cos(p.ry);
  // Broad swells, then sharper teeth so the far ranges break into peaks instead of smooth triangles.
  const teeth = Math.abs(Math.sin(x * 0.53 + p.seed * 3.1)) * 0.12 + Math.abs(Math.sin(x * 1.37 + p.seed * 1.7)) * 0.06;
  const crest = Math.sin(x * 0.045 + p.seed) * 0.45 + Math.sin(x * 0.11 + p.seed * 2.3) * 0.3 + Math.sin(x * 0.27 + p.seed * 0.7) * 0.15 + 0.55 + teeth * (p.height > 30 ? 1 : 0.3);
  return Math.max(0, crest) * p.height * Math.sin(clamp(back) * Math.PI * 0.5) - 0.5;
}
/** A range: a strip of ground whose height follows layered sines, faceted, dark in the valleys, snow on the peaks. */
export function rangeMesh(p: Range) {
  const segs = Math.round(p.length / 5), geo = new THREE.PlaneGeometry(p.length, p.depth, segs, 4);
  geo.rotateX(-Math.PI / 2);
  const P = geo.attributes.position as THREE.BufferAttribute, cols = new Float32Array(P.count * 3), base = new THREE.Color(ramps.slate[p.tone]), white = new THREE.Color(ramps.bone[2]), c = new THREE.Color();
  for (let i = 0; i < P.count; i++) {
    const h = rangeHeight(p, P.getX(i), P.getZ(i));
    P.setY(i, h);
    if (p.snow !== undefined) c.copy(h > p.snow + hash2(i, 9) * 10 ? white : base.clone().multiplyScalar(0.6 + 0.6 * Math.min(1, h / 60)));
    else { const t = clamp((h + 0.5) / Math.max(1, p.height)); c.copy(base).multiplyScalar(0.62 + 0.62 * t * t); }
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.rotateY(p.ry); geo.translate(p.x, 0, p.z); geo.deleteAttribute('uv'); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true }));
  mesh.name = 'range';
  return mesh;
}

const W = {
  white: mix(ramps.bone[0], ramps.stone[4], 0.35), tar: mix(ramps.earth[2], ramps.slate[0], 0.4), stone: mix(ramps.stone[3], ramps.slate[1], 0.35),
  timber: ramps.earth[3], sail: mix(ramps.bone[1], ramps.earth[8], 0.3), cap: ramps.roof[1], void: ramps.night[2], red: ramps.roof[2], slate: ramps.slate[0],
};

/** A tower mill: a tapered octagonal body on a stone plinth, a reefing stage, a domed cap, and four lattice sails. */
export function windmill(m: Mason, lit: Mason, g: Ground, p: Windmill) {
  const y = g(p.x, p.z), body = rnd(p.seed, 1) < 0.6 ? W.white : W.tar;
  const build = () => {
    m.put(prim.cyl(8), W.stone, 0, 0.1, 0, { sx: 2.5, sy: 2.4, sz: 2.5, ry: Math.PI / 8 });
    m.put(prim.cyl(8, 0.64), body, 0, 4.6, 0, { sx: 2.2, sy: 8, sz: 2.2, ry: Math.PI / 8 });
    m.put(prim.cyl(8), W.timber, 0, 3.0, 0, { sx: 2.6, sy: 0.2, sz: 2.6, ry: Math.PI / 8 });
    m.put(prim.dome(8, 3), W.cap, 0, 8.5, 0, { sx: 1.6, sy: 1.9, sz: 1.6 });
    m.put(prim.cone(6), W.cap, 0, 10.6, 0, { sx: 0.25, sy: 0.8, sz: 0.25 });
    m.put(prim.box(), W.tar, 0, 9.1, 1.6, { sx: 0.5, sy: 0.5, sz: 0.8 });
    m.put(prim.pane(), W.timber, 0, 1.1, 2.37, { sx: 0.8, sy: 1.6 });
    for (const [yy, ry] of [[4.2, 0], [6.4, Math.PI], [5.3, Math.PI / 2], [5.3, -Math.PI / 2]] as const) {
      const r = 1.82 - (yy - 0.6) * 0.1;
      (rnd(p.seed + yy, ry) < 0.5 ? lit : m).put(prim.pane(), W.void, Math.sin(ry) * r, yy, Math.cos(ry) * r, { sx: 0.4, sy: 0.6, ry });
    }
    // The sails turn in the plane in front of the cap: a stock to each, a lattice frame offset to its trailing side.
    const a0 = rnd(p.seed, 2) * Math.PI / 2;
    for (let k = 0; k < 4; k++) {
      const a = a0 + (k * Math.PI) / 2, ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux;
      m.put(prim.box(), W.tar, ux * 3.3, 9.1 + uy * 3.3, 2.05, { sx: 6.6, sy: 0.22, sz: 0.2, rz: a });
      m.put(prim.box(), W.sail, ux * 4 + px * 0.62, 9.1 + uy * 4 + py * 0.62, 2.1, { sx: 5, sy: 1.1, sz: 0.06, rz: a });
      for (const t of [1.8, 3.4, 5]) m.put(prim.box(), W.tar, ux * (t + 0.7) + px * 0.62, 9.1 + uy * (t + 0.7) + py * 0.62, 2.14, { sx: 0.1, sy: 1.2, sz: 0.06, rz: a });
    }
  };
  m.within(p.x, y, p.z, p.ry, () => lit.within(p.x, y, p.z, p.ry, build, p.scale), p.scale);
}

/** A lighthouse on its own rock: a banded tower, a gallery, a lantern room that lights at night, a keeper's cottage. */
export function lighthouse(m: Mason, lit: Mason, p: Lighthouse) {
  const rock = [ramps.stone[2], ramps.stone[3], mix(ramps.stone[2], ramps.slate[1], 0.5)];
  const build = () => {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2 + rnd(p.seed, k), r = 3 + rnd(k, p.seed) * 4, s = 2.2 + rnd(k, 3) * 2.4;
      m.put(prim.rock(), rock[k % 3], Math.cos(a) * r, 0.4 + s * 0.3, Math.sin(a) * r, { sx: s, sy: s * 0.9, sz: s * 1.1, ry: a });
    }
    m.put(prim.cyl(10), rock[1], 0, 1.2, 0, { sx: 5, sy: 4, sz: 5 });
    const bands = 6, H = 20, r0 = 2.2, r1 = 1.45;
    for (let b = 0; b < bands; b++) {
      const t0 = b / bands, t1 = (b + 1) / bands, ra = r0 + (r1 - r0) * t0, rb = r0 + (r1 - r0) * t1;
      m.put(prim.cyl(10, rb / ra), b % 2 ? W.red : W.white, 0, 3.2 + (t0 + t1) / 2 * H, 0, { sx: ra, sy: H / bands, sz: ra });
    }
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2 + 0.4, r = r0 + (r1 - r0) * (0.25 + k * 0.17); (k % 2 ? lit : m).put(prim.pane(), W.void, Math.sin(a) * (r + 0.02), 3.2 + H * (0.25 + k * 0.17), Math.cos(a) * (r + 0.02), { sx: 0.4, sy: 0.7, ry: a }); }
    const top = 3.2 + H;
    m.put(prim.cyl(12), W.slate, 0, top + 0.2, 0, { sx: 2.4, sy: 0.4, sz: 2.4 });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; m.put(prim.box(), W.slate, Math.sin(a) * 2.25, top + 0.85, Math.cos(a) * 2.25, { sx: 0.1, sy: 0.9, sz: 0.1 }); }
    m.put(prim.cyl(12), W.slate, 0, top + 1.3, 0, { sx: 2.3, sy: 0.12, sz: 2.3 });
    // The lantern room: dark mullions round a lit core that shows through every side.
    lit.put(prim.cyl(8), W.void, 0, top + 1.6, 0, { sx: 1.15, sy: 2.2, sz: 1.15 });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + Math.PI / 8; m.put(prim.box(), W.slate, Math.sin(a) * 1.2, top + 1.6, Math.cos(a) * 1.2, { sx: 0.14, sy: 2.2, sz: 0.14 }); }
    m.put(prim.cone(8), W.red, 0, top + 3.4, 0, { sx: 1.6, sy: 1.6, sz: 1.6, ry: Math.PI / 8 });
    m.put(prim.box(), W.slate, 0, top + 4.5, 0, { sx: 0.2, sy: 0.8, sz: 0.2 });
    m.within(4.6, 0, -1.5, 0.3, () => lit.within(4.6, 0, -1.5, 0.3, () => townHouse(m, lit, 2.6, 4, 3, 2.6, p.seed * 977)));
  };
  m.within(p.x, -0.6, p.z, 0, () => lit.within(p.x, -0.6, p.z, 0, build, p.scale), p.scale);
}

const RUIN = { stone: mix(ramps.stone[3], ramps.slate[2], 0.3), light: mix(ramps.stone[4], ramps.bone[0], 0.2), dark: mix(ramps.stone[2], ramps.slate[1], 0.35), deep: mix(ramps.stone[1], ramps.slate[0], 0.4) };
/** A ruined watchtower on its hill: a tall broken round tower, a stub of curtain wall, and fallen stone. */
export function watchtower(m: Mason, g: Ground, p: Watchtower) {
  const y = g(p.x, p.z), tones = [RUIN.stone, RUIN.stone, RUIN.dark, RUIN.light];
  roundRuin(m, p.x, y, p.z, 2.8, p.height, p.seed, tones, RUIN.deep, ramps.night[2], -Math.PI / 2);
  buildRuin(m, g, { kind: 'ruin', x: p.x - 7, z: p.z + 2, ry: 0.35, span: 9, height: 4.5, seed: p.seed + 40 });
}

/** Sea cliffs: rock buttresses from below the water up to the ground behind them, with ledges, the face towards +z. */
export function cliffs(m: Mason, g: Ground, p: Cliffs, level: number) {
  // Pale chalky stone with darker bands, so the cliffs stand out of the haze over the water.
  const tones = [ramps.bone[0], ramps.stone[4], mix(ramps.bone[0], ramps.stone[3], 0.5), ramps.stone[5]];
  m.within(p.x, 0, p.z, p.ry, () => {
    for (let u = -p.span / 2; u < p.span / 2; u += 2.6) {
      const k = Math.round(u * 7), back = m.world(u, 0, -4), top = g(back.x, back.z);
      if (top < level + 2) continue;
      const lo = level - 1.5, n = Math.max(2, Math.round((top - lo) / 3.5)), z = (rnd(k, p.seed) - 0.5) * 2;
      for (let i = 0; i < n; i++) {
        const yy = lo + ((i + 0.5) / n) * (top - lo), s = 1.6 + rnd(k, i) * 1.4;
        m.put(prim.rock(), tones[(k + i) % 4], u + (rnd(i, k) - 0.5) * 1.2, yy, z - i * 0.5, { sx: s * 1.2, sy: ((top - lo) / n) * 0.75, sz: s, ry: rnd(k, i + 3) * 6 });
      }
      if (rnd(k, 9) < 0.35) m.put(prim.box(), tones[k % 4], u, lo + (top - lo) * (0.3 + rnd(k, 8) * 0.4), z + 1, { sx: 2.6, sy: 0.5, sz: 1.6, ry: rnd(k, 7) - 0.5 });
    }
  });
}
