import * as THREE from 'three';
import { ramps } from '../palette.ts';
import { Mason, prim, masonry, rnd, mix, roundArch, type Shade } from './kit.ts';
import { pieceOf } from './scene.ts';

/**
 * Hollow Keep: a ruined castle on the northern crag, seen from the town 110–180 units south. A square keep with a
 * broken crown and a corner turret, round towers with cone and dome caps, curtain walls stepping down the crag, a
 * great arched bridge over a gorge to a broken gatehouse, and rubble. Every piece is at least a unit thick so it
 * stays a few render pixels wide at the Scenery stop.
 */
export type Ground = (x: number, z: number) => number;

const clamp = (t: number, a = 0, b = 1) => Math.max(a, Math.min(b, t));
const smooth = (a: number, b: number, t: number) => { const k = clamp((t - a) / (b - a)); return k * k * (3 - 2 * k); };
/** A flat-topped rise with steep flanks. */
const mesa = (x: number, z: number, cx: number, cz: number, rx: number, rz: number, h: number) => h * (1 - smooth(0.45, 1, Math.hypot((x - cx) / rx, (z - cz) / rz)));

/** The keep's origin is a placed piece (`scene.ts`); the rest of the castle is still authored around x 34, z −106. */
export const KEEP: { x: number; z: number } = pieceOf('hollowKeep');
const BRIDGE = { x0: 63, x1: 89, z: -99 };

/** What the crag adds to the land: the keep's plateau, a western shoulder, the eastern spur, the far knoll, the gorge. */
export function cragHeight(x: number, z: number) {
  let h = mesa(x, z, KEEP.x + 3, KEEP.z, 30, 21, 7) + mesa(x, z, 10, -101, 15, 13, 4) + mesa(x, z, 56, -100, 13, 12, 6) + mesa(x, z, 97, -103, 13, 12, 7);
  // Rock ledges on the flanks.
  h += Math.sin(x * 0.83) * Math.sin(z * 0.71 + 1.3) * 0.7 * clamp(h / 3);
  // The gorge under the bridge, fading out north and south of the castle.
  h -= 8 * Math.exp(-(((x - 76) / 6) ** 2)) * Math.exp(-(((z + 101) / 34) ** 2));
  return h;
}

const C = {
  stone: mix(ramps.stone[3], ramps.slate[2], 0.3),
  light: mix(ramps.stone[4], ramps.bone[0], 0.2),
  dark: mix(ramps.stone[2], ramps.slate[1], 0.35),
  deep: mix(ramps.stone[1], ramps.slate[0], 0.4),
  void: ramps.night[2],
  slate: ramps.slate[1],
  slateLt: ramps.slate[2],
  banner: ramps.roof[2],
  bannerDk: ramps.roof[1],
  rubble: [ramps.stone[1], ramps.stone[2], ramps.stone[3], mix(ramps.stone[2], ramps.earth[6], 0.4)],
};

/** A curtain wall from (x0, z0) to (x1, z1), its outer face to the left of travel (south when running west to east). */
function curtain(m: Mason, g: Ground, x0: number, z0: number, x1: number, z1: number, h: number, seed: number, ruin: (i: number) => number = () => 0, thick = 2.6) {
  const len = Math.hypot(x1 - x0, z1 - z0), ry = Math.atan2(-(z1 - z0), x1 - x0), n = Math.max(1, Math.round(len / 5)), seg = len / n;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tc = (i + 0.5) / n;
    const px = x0 + (x1 - x0) * tc, pz = z0 + (z1 - z0) * tc;
    const gs = [g(x0 + (x1 - x0) * t0, z0 + (z1 - z0) * t0), g(px, pz), g(x0 + (x1 - x0) * t1, z0 + (z1 - z0) * t1)];
    const lo = Math.min(...gs) - 3, top = Math.round(Math.max(...gs) + h), r = ruin(i);
    m.within(px, 0, pz, ry, () => {
      if (r > 0) {
        // A breach: two jagged stubs and the fallen stone below.
        const a = top - h * r * (0.5 + rnd(i, seed) * 0.4), b = top - h * r * (0.2 + rnd(i, seed + 1) * 0.3);
        m.block(C.stone, -seg / 4, lo, Math.max(lo + 2, a), 0, seg / 2 + 0.02, thick);
        m.block(C.stone, seg / 4, lo, Math.max(lo + 2, b), 0, seg / 2 + 0.02, thick);
        for (let k = 0; k < 4; k++) m.put(prim.rock(), C.rubble[k % 4], (rnd(k, i + seed) - 0.5) * seg, Math.min(...gs) + 0.4, thick / 2 + 1 + rnd(i, k) * 2.5, { sx: 1 + rnd(k, i) * 1.4, sy: 0.7 + rnd(i + k, 3) * 0.6, sz: 1 + rnd(i, k + 5), ry: k });
        return;
      }
      m.block(C.stone, 0, lo, top, 0, seg + 0.02, thick);
      // Wall walk: a darker band under a projecting parapet carried on corbels.
      m.block(C.light, 0, top - 0.6, top - 0.04, thick / 2 - 0.35, seg + 0.04, 0.9);
      for (let u = -seg / 2 + 0.6; u < seg / 2; u += 1.2) m.block(C.deep, u, top - 1.3, top - 0.6, thick / 2 + 0.05, 0.6, 0.5);
      // Arrow slits along the face, and a stepped buttress on every other bay.
      const gy = Math.min(...gs);
      if (top - gy > 5) for (const u of [-seg / 4, seg / 4]) if (rnd(u + i, seed + 3) > 0.35) m.put(prim.box(), C.void, u, gy + (top - gy) * 0.55, thick / 2 + 0.02, { sx: 0.35, sy: 1.5, sz: 0.3 });
      if (i % 2 === 1) {
        m.block(C.stone, -seg / 2, lo, gy + (top - gy) * 0.45, thick / 2 + 0.6, 1.4, 1.4);
        m.block(C.stone, -seg / 2, gy + (top - gy) * 0.45, gy + (top - gy) * 0.75, thick / 2 + 0.3, 1.1, 0.8);
        m.put(prim.box(), C.light, -seg / 2, gy + (top - gy) * 0.75, thick / 2 + 0.35, { sx: 1.15, sy: 0.4, sz: 0.9, rx: 0.5 });
      }
      const k = Math.max(1, Math.round(seg / 2.5));
      for (let j = 0; j < k; j++) {
        if (rnd(i * 7 + j, seed) < 0.15) continue;
        m.block(C.stone, -seg / 2 + (j + 0.5) * (seg / k), top, top + 1.4 + (rnd(j, i + seed) < 0.2 ? -0.5 : 0), thick / 2 - 0.45, 1.3, 1.0);
      }
    });
  }
}

/** A round tower; `cap` chooses its crown. Returns its top height. */
function roundTower(m: Mason, g: Ground, x: number, z: number, r: number, h: number, cap: 'cone' | 'dome' | 'ruin' | 'tall', seed: number) {
  let gl = Infinity; for (let a = 0; a < 8; a++) gl = Math.min(gl, g(x + Math.cos(a) * r, z + Math.sin(a) * r));
  const top = g(x, z) + h, base = gl - 3;
  m.put(prim.cyl(12), C.stone, x, (base + top) / 2, z, { sx: r, sy: top - base, sz: r });
  // Battered foot.
  m.put(prim.cyl(12, 0.86), C.dark, x, gl + 1, z, { sx: r * 1.16, sy: 8, sz: r * 1.16 });
  m.put(prim.cyl(12), C.light, x, top - h * 0.45, z, { sx: r * 1.05, sy: 0.6, sz: r * 1.05 });
  m.put(prim.cyl(12), C.light, x, top - h * 0.78, z, { sx: r * 1.04, sy: 0.5, sz: r * 1.04 });
  // Arrow slits in tiers up the shaft.
  for (let y = gl + 3; y < top - 6; y += 3.2) for (const a of [-1.2, 0.4, 1.6]) {
    const aa = a + y * 0.37 + seed;
    if (Math.cos(aa) < 0.1) continue;
    m.put(prim.box(), C.void, x + Math.sin(aa) * r, y, z + Math.cos(aa) * r, { ry: aa, sx: 0.32, sy: 1.3, sz: 0.4 });
  }
  // Windows on the faces turned to the town.
  for (const a of [-0.75, 0, 0.75]) for (const y of [top - 4, top - 9.5]) {
    if (y < g(x, z) + 3 || rnd(a * 3 + y, seed) < 0.25) continue;
    m.put(prim.lancet(), C.void, x + Math.sin(a) * r, y, z + Math.cos(a) * r, { ry: a, sx: 0.95, sy: 0.85, sz: 0.6 });
  }
  if (cap === 'ruin') {
    // Broken crown: a ring of merlons with gaps, one flank fallen lower.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, low = Math.sin(a + seed) > 0.55, hh = low ? -2.5 - rnd(i, seed) * 2 : rnd(i, seed) < 0.3 ? 0 : 1.5;
      if (hh === 0) continue;
      m.block(C.stone, x + Math.sin(a) * r * 0.86, top, top + hh, z + Math.cos(a) * r * 0.86, 1.6, 1.4, a);
    }
    return top;
  }
  // Corbelled crown: consoles under a projecting ring.
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; m.block(C.deep, x + Math.sin(a) * r * 1.02, top - 1.0, top, z + Math.cos(a) * r * 1.02, 0.9, 0.9, a); }
  m.put(prim.cyl(12), C.stone, x, top + 0.7, z, { sx: r * 1.14, sy: 1.4, sz: r * 1.14 });
  if (cap === 'dome') {
    m.put(prim.cyl(12), C.dark, x, top + 1.9, z, { sx: r * 0.98, sy: 1.0, sz: r * 0.98 });
    m.put(prim.dome(12, 4), C.slateLt, x, top + 2.4, z, { sx: r * 1.0, sy: r * 0.95, sz: r * 1.0 });
    m.put(prim.cyl(6), C.stone, x, top + 2.4 + r * 0.95 + 0.6, z, { sx: 0.8, sy: 1.6, sz: 0.8 });
    m.put(prim.cone(6), C.slate, x, top + 2.4 + r * 0.95 + 2.2, z, { sx: 0.8, sy: 1.8, sz: 0.8 });
    return top + r + 4;
  }
  const ch = cap === 'tall' ? r * 3.2 : r * 2.1;
  m.put(prim.cone(12), C.slate, x, top + 1.4 + ch / 2, z, { sx: r * 1.28, sy: ch, sz: r * 1.28 });
  // Lucarnes at the foot of the cone, a finial and a pennant at its point.
  for (const a of [-0.6, 0.6, Math.PI]) {
    const lx = x + Math.sin(a) * r * 0.95, lz = z + Math.cos(a) * r * 0.95;
    m.block(C.stone, lx, top + 1.4, top + 3.0, lz, 1.0, 0.9, a);
    m.put(prim.gable(), C.slate, lx, top + 3.0, lz, { sx: 0.9, sy: 0.9, sz: 1.2, ry: a + Math.PI / 2 });
    m.put(prim.box(), C.void, lx + Math.sin(a) * 0.46, top + 2.1, lz + Math.cos(a) * 0.46, { ry: a, sx: 0.4, sy: 0.7, sz: 0.1 });
  }
  m.put(prim.box(), C.dark, x, top + 1.4 + ch + 0.9, z, { sx: 0.4, sy: 2.4, sz: 0.4 });
  m.put(prim.rock(), C.dark, x, top + 1.4 + ch + 0.5, z, { sx: 0.6, sy: 0.5, sz: 0.6 });
  if (rnd(seed, 77) > 0.4) m.block(C.banner, x + 1.0, top + 1.4 + ch + 1.3, top + 1.4 + ch + 2.0, z, 1.8, 0.2);
  return top + 1.4 + ch;
}

/** The keep, built in its own frame (turned so two faces show). Returns the lit window's place. */
function keep(m: Mason, g: Ground) {
  const K = g(KEEP.x, KEEP.z), ry = 0.32, H = 30;
  let lit = new THREE.Vector3();
  m.within(KEEP.x, 0, KEEP.z, ry, () => {
    const S = 6; // half-width of the shaft
    m.block(C.dark, 0, K - 5, K + 3, 0, 13.8, 13.8);
    m.block(C.light, 0, K + 3, K + 3.6, 0, 12.8, 12.8);
    m.block(C.stone, 0, K + 3, K + H - 7, 0, 2 * S, 2 * S);
    // The crown: three walls standing, the east one broken into stubs; the hollow shows through.
    m.block(C.deep, 0, K + H - 9, K + H - 1.5, 0, 2 * S - 3, 2 * S - 3);
    m.block(C.stone, 0, K + H - 7, K + H - 1, S - 0.8, 2 * S, 1.6);
    m.block(C.stone, -S + 0.8, K + H - 7, K + H - 1, 0, 1.6, 2 * S);
    m.block(C.stone, 0, K + H - 7, K + H - 1, -S + 0.8, 2 * S, 1.6);
    m.block(C.stone, S - 0.8, K + H - 7, K + H - 2.5, 2.6, 1.6, 4.4);
    m.block(C.stone, S - 0.8, K + H - 7, K + H - 5.5, -1.5, 1.6, 3.6);
    m.block(C.stone, S - 0.8, K + H - 7, K + H - 3.6, -4.6, 1.6, 2.6);
    // Corner buttresses, stepping in.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      m.block(C.stone, sx * S, K - 2, K + 11, sz * S, 2.6, 2.6);
      m.block(C.stone, sx * S, K + 11, K + H - 8, sz * S, 2.0, 2.0);
    }
    // String courses mark the storeys.
    for (const y of [K + 11, K + 18]) m.block(C.light, 0, y, y + 0.7, 0, 2 * S + 0.8, 2 * S + 0.8);
    // Machicolations on the south and west faces: consoles under a projecting band, then merlons. The east end is gone.
    const band = K + H - 2.8;
    m.block(C.stone, -1.5, band, band + 1.8, S + 0.15, 2 * S - 2.4, 1.6);
    m.block(C.stone, -S - 0.15, band, band + 1.76, 0, 1.6, 2 * S + 1.4);
    m.block(C.stone, -1.5, band, band + 1.8, -S - 0.15, 2 * S - 2.4, 1.6);
    for (let i = 0; i < 5; i++) {
      const u = -S + 0.5 + i * 2.2;
      m.block(C.deep, u, band - 1, band, S + 0.2, 0.9, 1.2);
      m.block(C.deep, -S - 0.2, band - 1, band, u + 1, 1.2, 0.9);
      if (rnd(i, 4) > 0.2) m.block(C.stone, u, band + 1.8, band + 3.2 - (i === 3 ? 0.6 : 0), S + 0.5, 1.3, 1.0);
      if (rnd(i, 5) > 0.25) m.block(C.stone, -S - 0.5, band + 1.8, band + 3.2, u + 1, 1.0, 1.3);
    }
    // A corbelled turret on the south-west corner, its twin on the north-west broken off.
    const turret = (tx: number, tz: number, whole: boolean) => {
      m.put(prim.cone(10), C.dark, tx, K + H - 6, tz, { sx: 1.9, sy: -3.2, sz: 1.9 });
      m.put(prim.cyl(10), C.stone, tx, K + H - 4.4 + (whole ? 3.4 : 1.6), tz, { sx: 1.9, sy: whole ? 6.8 : 3.2, sz: 1.9 });
      if (!whole) return;
      m.put(prim.cyl(10), C.light, tx, K + H + 2.6, tz, { sx: 2.15, sy: 0.6, sz: 2.15 });
      m.put(prim.cone(10), C.slate, tx, K + H + 5.2, tz, { sx: 2.3, sy: 4.6, sz: 2.3 });
      m.put(prim.box(), C.dark, tx, K + H + 8, tz, { sx: 0.8, sy: 1.4, sz: 0.8 });
      m.put(prim.lancet(), C.void, tx + 0.6, K + H - 1.3, tz + 1.75, { sx: 0.7, sy: 0.6, sz: 0.5, ry: 0.4 });
    };
    turret(-S - 0.6, S + 0.6, true);
    // A torn red banner still flies from the crown: the one warm note in the stone.
    m.block(C.deep, -1.5, K + H - 1, K + H + 6.5, S - 0.8, 0.6, 0.6);
    m.block(C.banner, 0.9, K + H + 4.2, K + H + 6.2, S - 0.8, 4.2, 0.3);
    m.block(C.banner, 0.2, K + H + 2.8, K + H + 4.2, S - 0.8, 2.8, 0.3);
    m.block(C.bannerDk, 2.3, K + H + 3.4, K + H + 4.2, S - 0.8, 1.2, 0.3);
    turret(-S - 0.6, -S - 0.6, false);
    // Windows: slits low, paired lancets above, one broad arched window high on the south face.
    const south = (x: number, y: number, w: number, h: number) => m.put(prim.lancet(), C.void, x, y, S, { sx: w, sy: h / 3, sz: 0.7 });
    const west = (z: number, y: number, w: number, h: number) => m.put(prim.lancet(), C.void, -S, y, z, { sx: w, sy: h / 3, sz: 0.7, ry: Math.PI / 2 });
    for (const x of [-3, 0, 3]) south(x, K + 6, 0.9, 2.6);
    for (const x of [-2.4, 2.4]) south(x, K + 12.8, 1.3, 3.8);
    south(0, K + 19.8, 2.0, 4.2);
    for (const z of [-2.6, 2.6]) { west(z, K + 6.4, 0.9, 2.6); west(z, K + 13, 1.2, 3.6); }
    west(0, K + 20, 1.4, 3.8);
    // Rows of small square lights and putlog holes across both faces: the fine grain of a tall wall.
    for (const y of [K + 9, K + 16, K + 23]) for (let u = -4.5; u <= 4.5; u += 1.5) {
      if (rnd(u * 3 + y, 9) < 0.45) continue;
      m.put(prim.box(), C.void, u, y, S + 0.02, { sx: 0.5, sy: 0.7, sz: 0.3 });
      m.put(prim.box(), C.void, -S - 0.02, y + 0.5, u, { sx: 0.3, sy: 0.7, sz: 0.5 });
    }
    // Two long banners hung from the machicolations on the south face.
    for (const u of [-3.6, 3.4]) {
      m.block(C.deep, u, band - 0.4, band - 0.1, S + 0.75, 2.2, 0.3);
      m.block(C.banner, u, band - 8.5, band - 0.4, S + 0.7, 1.7, 0.15);
      m.block(C.bannerDk, u - 0.5, band - 9.4, band - 8.5, S + 0.7, 0.7, 0.15);
      m.block(C.bannerDk, u + 0.5, band - 9.4, band - 8.5, S + 0.7, 0.7, 0.15);
      m.block(ramps.fire[4], u, band - 4.6, band - 2.8, S + 0.77, 0.8, 0.1);
    }
    lit = m.world(-2.4, K + 12.8 + 1.5, S + 0.4);
  });
  return { lit, ry, top: K + H + 3 };
}

/** The bridge: one great round arch over the gorge between two lesser ones, a crenellated parapet on top. */
function bridge(m: Mason, g: Ground) {
  const { x0, x1, z } = BRIDGE, L = x1 - x0, deck = Math.round(Math.max(g(x0, z), g(x1, z)) + 6), floor = g((x0 + x1) / 2, z);
  const shape = new THREE.Shape([new THREE.Vector2(0, floor - 6), new THREE.Vector2(L, floor - 6), new THREE.Vector2(L, deck), new THREE.Vector2(0, deck)]);
  const spring = floor + 1, big = Math.min(15, L * 0.46, 2 * (deck - 2.2 - spring));
  shape.holes.push(roundArch(big, Math.max(0, deck - 2.2 - big / 2 - spring), L / 2, spring));
  for (const s of [-1, 1]) {
    const cx = L / 2 + s * (big / 2 + 4.4), gy = g(x0 + cx, z) + 0.5, w = 4.2, post = deck - 2 - w / 2 - gy;
    if (post > 0.6) shape.holes.push(roundArch(w, Math.min(3, post), cx, gy));
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 4.4, bevelEnabled: false, curveSegments: 7 });
  geo.translate(x0, 0, z - 2.2);
  m.putMatrix(geo, C.stone, new THREE.Matrix4());
  // Piers between the arches with cutwaters, a string course, and the parapet.
  for (const s of [-1, 1]) m.block(C.dark, x0 + L / 2 + s * (big / 2 + 1.1), floor - 4, deck - 3, z, 2.2, 6.2);
  m.block(C.light, (x0 + x1) / 2, deck - 2.2, deck - 1.5, z, L + 0.6, 5.2);
  m.block(C.stone, (x0 + x1) / 2, deck, deck + 0.8, z + 1.8, L, 0.9);
  for (let i = 0; i < Math.floor(L / 2.4); i++) if (rnd(i, 21) > 0.18) m.block(C.stone, x0 + 1.2 + i * 2.4, deck + 0.8, deck + 2.1, z + 1.8, 1.3, 0.9);
  return deck;
}

export type HollowKeep = { mesh: THREE.Mesh; window: THREE.Mesh };

export function hollowKeep(g: Ground): HollowKeep {
  const cool = new THREE.Color(ramps.slate[1]);
  const shade: Shade = (c, p) => {
    // Dark at the foot of every wall, cooler the further north it stands.
    c.multiplyScalar(0.7 + 0.3 * clamp((p.y - g(p.x, p.z)) / 6));
    c.lerp(cool, clamp((-p.z - 102) / 30) * 0.4);
  };
  const m = new Mason(shade);
  // Behind the keep: the inner ward's tall back wall and a slender tower, cooler, for depth.
  curtain(m, g, 4, -118, 62, -124, 11, 7, i => (i === 6 ? 0.6 : 0));
  roundTower(m, g, 20, -121, 3.0, 27, 'tall', 2);
  roundTower(m, g, 58, -124, 3.4, 15, 'ruin', 8);
  // The ruined hall east of the keep: roofless walls with tall lancets and one standing gable.
  m.within(53, 0, -112, -0.12, () => {
    const G = g(53, -112);
    m.block(C.dark, 0, G - 3, G + 9, -4.2, 17, 1.4);
    m.block(C.stone, -4, G - 3, G + 10, 4.2, 9, 1.4);
    m.block(C.stone, 4.6, G - 3, G + 7.5, 4.2, 4.2, 1.4);
    m.block(C.stone, 7.6, G - 3, G + 4.5, 4.2, 1.8, 1.4);
    m.block(C.stone, -8.5, G - 3, G + 10, 0, 1.4, 9.8);
    m.put(prim.gable(), C.stone, -8.5, G + 10, 0, { sx: 1.4, sy: 5, sz: 9.8 });
    m.block(C.stone, 8.5, G - 3, G + 6, 0, 1.4, 9.8);
    for (const x of [-6, -2.2]) m.put(prim.lancet(), C.void, x, G + 2.5, 4.2, { sx: 1.6, sy: 1.8, sz: 1.8 });
    m.put(prim.lancet(), C.void, 3.8, G + 2.5, 4.2, { sx: 1.6, sy: 1.4, sz: 1.8 });
    m.put(prim.cyl(12), C.void, -8.5, G + 11.5, 0, { sx: 1.4, sy: 1.8, sz: 1.4, rz: Math.PI / 2 });
  });
  const k = keep(m, g);
  // The outer curtain, west to east, stepping down the crag in front of the keep.
  curtain(m, g, -6, -112, 12, -99, 8, 1, i => (i === 0 ? 0.7 : 0));
  roundTower(m, g, 12, -99, 4.3, 17, 'cone', 3);
  curtain(m, g, 12, -99, 30, -93, 8, 2, i => (i === 2 ? 0.55 : 0));
  roundTower(m, g, 46, -92, 3.7, 13, 'dome', 4);
  curtain(m, g, 30, -93, 46, -92, 8, 3);
  curtain(m, g, 46, -92, 60, -97, 8, 4, i => (i === 1 ? 0.8 : 0));
  roundTower(m, g, 61, -98, 4.6, 16, 'ruin', 5);
  const deck = bridge(m, g);
  // The far gatehouse: square, broken, with a gate arch onto the bridge and a lone turret.
  m.within(96, 0, -101, -0.2, () => {
    const G = g(96, -101);
    m.block(C.stone, 0, G - 4, G + 11, 0, 9, 8.5);
    for (let i = 0; i < 5; i++) m.block(C.stone, -4 + i * 2, G + 11, G + 11 + [3.5, 1.5, 4.5, 0.8, 2.2][i], 3.5, 1.6, 1.6);
    m.block(C.stone, 3.6, G + 11, G + 13.5, -1.5, 1.6, 5.5);
    m.put(prim.lancet(), C.void, -1, deck - G > 2 ? G + 1 : G, 4.3, { sx: 3.2, sy: 2.2, sz: 0.8 });
    for (const x of [-2.4, 1.8]) m.put(prim.lancet(), C.void, x, G + 7.6, 4.3, { sx: 0.9, sy: 0.85, sz: 0.6 });
  });
  roundTower(m, g, 103, -107, 2.8, 16, 'cone', 6);
  curtain(m, g, 100, -103, 118, -114, 6, 9, i => (i === 2 ? 0.9 : i === 1 ? 0.4 : 0));
  // Rubble: fallen blocks and stone heaps along the foot of the walls and across the slope.
  for (let i = 0; i < 90; i++) {
    const x = -4 + rnd(i, 1) * 124, z = -86 - rnd(i, 2) * 14, y = g(x, z), r = 0.6 + rnd(i, 3) ** 2 * 2.2;
    if (x > 66 && x < 87) continue;
    if (rnd(i, 4) < 0.35) m.put(prim.box(), C.rubble[i % 4], x, y + r * 0.3, z, { sx: r * 1.4, sy: r * 0.8, sz: r, ry: rnd(i, 5) * 3, rz: (rnd(i, 6) - 0.5) * 0.6 });
    else m.put(prim.rock(), C.rubble[i % 4], x, y + r * 0.15, z, { sx: r, sy: r * 0.6, sz: r * 0.9, ry: rnd(i, 7) * 3 });
  }
  const mesh = m.build(masonry());
  mesh.name = 'hollow-keep';
  // The one lit window: its own unlit plane so the night can kindle it.
  const window = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 2.2), new THREE.MeshBasicMaterial({ color: ramps.stone[0] }));
  window.position.copy(k.lit); window.rotation.y = k.ry; window.name = 'keep-window';
  return { mesh, window };
}
