import * as THREE from 'three';
import { Mason, masonry, prim, rnd } from './kit.ts';
import type { Ground } from './castle.ts';
import type { DragonPiece } from './scene.ts';

/**
 * The dragon of Hollow Keep, after ref-1's pose and colours, as an original creature: perched on the walls behind the
 * keep, a deep chest raised towards the town, an articulated neck arching up and over so the wedge head hangs low and
 * looks down on the town with its jaw open. Wings raised and spread four times the tower's width: bony arms, four
 * fingers, membranes billowed between them with scalloped, torn trailing edges. Forelimbs grip the wall, the tail runs
 * down the keep's flank. Blue-violet scales, pale belly plates, rust membranes. Far scenery, one merged mesh.
 */
const C = {
  scale: '#3d499b', dark: '#243166', belly: '#8591c0', plate: '#a3a9cc', bone: '#c8ac9f', horn: '#ddc9b4',
  membrane: '#be5b54', membraneDk: '#854457', membraneLt: '#d27a5e', torn: '#6a3c5a', spine: '#1c295c', eye: '#ef7125', mouth: '#3a1726',
};
const col = (h: string) => new THREE.Color(h);
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const Y = V(0, 1, 0);

/** Points along a smooth curve through `pts`, spaced by arc length. */
const curve = (pts: THREE.Vector3[], n: number) => new THREE.CatmullRomCurve3(pts, false, 'centripetal').getSpacedPoints(n);
/** Position a fraction `u` of the way along a polyline. */
function along(line: THREE.Vector3[], u: number) {
  const f = Math.min(0.9999, Math.max(0, u)) * (line.length - 1), i = Math.floor(f);
  return line[i].clone().lerp(line[i + 1], f - i);
}

export function keepDragon(g: Ground, piece: DragonPiece) {
  const top = g(piece.x, piece.z) + piece.perch, s = piece.scale;
  const m = new Mason((c, p) => c.multiplyScalar(0.8 + 0.25 * Math.min(1, Math.max(0, (p.y - top) / 20))));
  // Local units: +z towards the town, y up from the perch; everything is scaled by the piece.
  const P = (x: number, y: number, z: number) => V(x * s, top + y * s, z * s);
  const pts = (list: number[][]) => list.map(([x, y, z]) => P(x, y, z));

  /** A cone from `base` pointing along `dir`: spines, claws, teeth. `flat` squashes it into a blade across `side`. */
  const cone = (color: string, base: THREE.Vector3, dir: THREE.Vector3, len: number, w: number, flat = 1) => {
    const d = dir.clone().normalize(), q = new THREE.Quaternion().setFromUnitVectors(Y, d);
    m.putMatrix(prim.cone(5), color, new THREE.Matrix4().compose(base.clone().addScaledVector(d, len * s * 0.5), q, V(w * s, len * s, w * s * flat)));
  };
  /** Scales: dark along the ridge, blue on the flanks, pale banded plates underneath. */
  const hide = (bands: number) => (t: number, a: number) => {
    const under = Math.cos(a) < -0.45, ridge = Math.cos(a) > 0.7;
    if (under) return col(Math.floor(t * bands) % 3 ? C.belly : C.plate);
    return col(ridge ? C.dark : rnd(Math.floor(t * bands * 2), Math.floor(a * 3)) < 0.25 ? C.dark : C.scale);
  };
  /** A row of dorsal spines on a tube's ridge. */
  const ridge = (spine: THREE.Vector3[], r: (t: number) => number, every: number, len: (t: number) => number, from = 0, to = 1) => {
    for (let i = 1; i < spine.length - 1; i += every) {
      const t = i / (spine.length - 1); if (t < from || t > to) continue;
      const tan = spine[i + 1].clone().sub(spine[i - 1]).normalize(), side = V(1, 0, 0).addScaledVector(tan, -tan.x).normalize(), up = tan.clone().cross(side).normalize();
      cone(C.spine, spine[i].clone().addScaledVector(up, r(t) * 0.85), up.clone().addScaledVector(tan, -0.55), len(t), 0.32, 0.35);
    }
  };

  m.within(piece.x, 0, piece.z, piece.ry, () => {
    // Body: from the tail root up to the shoulders, the chest deep and raised.
    const body = curve(pts([[0, 3.4, -6.2], [0, 3.9, -3.6], [0, 4.8, -0.8], [0, 6.0, 1.8], [0, 7.1, 3.1]]), 16);
    const bodyR = (t: number): [number, number] => {
      const w = [1.7, 2.3, 2.6, 2.75, 2.1], h = [1.6, 2.2, 2.7, 3.2, 2.2], f = t * 4, i = Math.min(3, Math.floor(f)), k = f - i;
      return [(w[i] + (w[i + 1] - w[i]) * k) * s, (h[i] + (h[i + 1] - h[i]) * k) * s];
    };
    m.loft(body, bodyR, hide(10), 12);
    ridge(body, t => bodyR(t)[1], 2, t => 1.3 + t * 0.6);

    // Neck: arches up from the shoulders, over and down, so the head hangs low between the wings (ref-1). Each segment
    // swells a little, so it reads as articulated, with a spine on every other segment.
    const neck = curve(pts([[0, 7.0, 3.0], [0, 11.2, 2.4], [0, 14.6, 4.2], [0, 15.1, 7.8], [0, 12.6, 10.9], [0, 9.6, 12.3]]), 34);
    const neckR = (t: number): [number, number] => { const r = (1.85 - 0.9 * t) * (1 + 0.08 * Math.cos(t * Math.PI * 2 * 9)); return [r * s, r * 1.05 * s]; };
    m.loft(neck, neckR, hide(18), 10);
    ridge(neck, t => neckR(t)[1], 2, t => 1.5 - t * 0.7, 0.04, 0.94);

    // Head: a wedge skull in its own frame, looking down and forward at the town.
    const H = neck[neck.length - 1], fw = V(0, -0.62, 0.78).normalize(), sd = V(1, 0, 0), up = sd.clone().cross(fw).multiplyScalar(-1).normalize();
    const hs = 1.3 * s, HP = (x: number, y: number, z: number) => H.clone().addScaledVector(sd, x * hs).addScaledVector(up, y * hs).addScaledVector(fw, z * hs);
    const skull = [HP(0, 0.1, -0.8), HP(0, 0.25, 0.9), HP(0, 0.05, 2.5), HP(0, -0.25, 3.9), HP(0, -0.45, 4.9)];
    const skullR = [[1.35, 1.2], [1.3, 1.15], [0.95, 0.72], [0.72, 0.5], [0.46, 0.34]];
    m.loft(skull, t => { const f = t * 4, i = Math.min(3, Math.floor(f)), k = f - i; return [(skullR[i][0] + (skullR[i + 1][0] - skullR[i][0]) * k) * hs, (skullR[i][1] + (skullR[i + 1][1] - skullR[i][1]) * k) * hs]; },
      (_t, a) => col(Math.cos(a) < -0.5 ? C.mouth : Math.cos(a) > 0.6 ? C.dark : C.scale), 8, up);
    // Lower jaw, hanging open.
    const jd = fw.clone().applyAxisAngle(sd, 0.5), hinge = HP(0, -0.75, 0.3);
    const jaw = [0, 1.3, 2.6, 3.9].map(k => hinge.clone().addScaledVector(jd, k * hs));
    m.loft(jaw, t => [(0.95 - t * 0.5) * hs, (0.42 - t * 0.16) * hs], (_t, a) => col(Math.cos(a) > 0.5 ? C.mouth : C.scale), 8, up);
    for (const x of [-1, 1]) {
      // Teeth down from the snout and up from the jaw.
      for (let k = 0; k < 4; k++) {
        cone(C.horn, HP(x * (0.55 - k * 0.07), -0.55 - k * 0.12, 2.1 + k * 0.75), up.clone().multiplyScalar(-1), 0.55, 0.13);
        cone(C.horn, hinge.clone().addScaledVector(jd, (1.2 + k * 0.7) * hs).addScaledVector(sd, x * (0.62 - k * 0.08) * hs), up.clone().applyAxisAngle(sd, 0.5), 0.45, 0.12);
      }
      // Brow ridge over an ember eye, a swept crown of horns, and cheek spines.
      m.loft([HP(x * 0.55, 0.85, 1.7), HP(x * 0.95, 0.95, 0.6), HP(x * 1.1, 0.8, -0.4)], t => [(0.32 - t * 0.08) * hs, 0.3 * hs], () => col(C.dark), 6);
      m.put(prim.box(), C.eye, ...HP(x * 0.92, 0.45, 1.25).toArray() as [number, number, number], { sx: 0.32 * hs, sy: 0.2 * hs, sz: 0.42 * hs, ry: x * 0.3 });
      const horn = (ps: number[][], r0: number) => m.loft(curve(ps.map(([a, b, c]) => HP(x * a, b, c)), 8), t => [(r0 * (1 - t) + 0.04) * hs, (r0 * (1 - t) + 0.04) * hs], t => col(t > 0.7 ? C.bone : C.horn), 6);
      horn([[0.65, 0.9, 0.0], [1.1, 1.9, -1.3], [1.55, 2.5, -3.1], [1.4, 2.2, -4.7]], 0.42);
      horn([[1.05, 0.25, -0.2], [2.1, 0.7, -1.7], [2.8, 0.55, -3.0]], 0.3);
      horn([[0.3, 1.1, 0.4], [0.5, 2.1, -0.7], [0.6, 2.5, -2.0]], 0.22);
      for (let k = 0; k < 3; k++) cone(C.spine, HP(x * 0.9, -0.5 - k * 0.3, -0.4 - k * 0.5), V(x, 0, 0).addScaledVector(fw, -1.2).addScaledVector(up, -0.3), 1.0 - k * 0.2, 0.2, 0.4);
    }

    // Forelimbs gripping the wall's edge, claws hooked over it; hind legs folded under the haunches.
    for (const x of [-1, 1]) {
      const fore = curve(pts([[x * 2.3, 5.0, 2.2], [x * 3.4, 2.7, 3.0], [x * 3.2, 0.7, 4.6], [x * 3.2, 0.25, 5.6]]), 10);
      m.loft(fore, t => [(1.15 - t * 0.55) * s, (1.25 - t * 0.6) * s], hide(6), 8);
      const hind = curve(pts([[x * 2.2, 3.6, -3.4], [x * 3.4, 2.7, -1.1], [x * 3.4, 1.0, -3.6], [x * 3.3, 0.3, -2.6]]), 10);
      m.loft(hind, t => [(1.55 - t * 0.95) * s, (1.7 - t * 1.05) * s], hide(6), 8);
      for (const k of [-1, 0, 1]) {
        const toe = P(x * 3.2 + k * 0.5, 0.25, 5.7 + (k === 0 ? 0.3 : 0));
        m.loft([toe, toe.clone().add(V(k * 0.15 * s, -0.05 * s, 0.7 * s)), toe.clone().add(V(k * 0.2 * s, -0.4 * s, 1.15 * s))], t => [(0.26 - t * 0.1) * s, (0.24 - t * 0.1) * s], () => col(C.scale), 5);
        cone(C.bone, toe.clone().add(V(k * 0.2 * s, -0.4 * s, 1.15 * s)), V(0, -1, 0.35), 0.75, 0.15);
        cone(C.bone, P(x * 3.3 + k * 0.45, 0.2, -1.9), V(k * 0.2, -0.3, 1), 0.7, 0.14);
      }
    }

    // Tail: over the back wall and down the keep's flank, spined, ending in a barbed blade.
    const tail = curve(pts([[0, 3.4, -6.2], [0.8, 2.6, -9.0], [2.0, 0.4, -10.6], [3.0, -3.0, -10.8], [3.2, -6.4, -9.4], [2.4, -9.4, -7.6], [1.2, -11.6, -6.6]]), 30);
    const tailR = (t: number): [number, number] => { const r = (1.65 - 1.4 * t) * s; return [r, r]; };
    m.loft(tail, tailR, hide(16), 8);
    ridge(tail, t => tailR(t)[1], 2, t => 1.2 - t * 0.8, 0, 0.92);
    const tip = tail[tail.length - 1], tdir = tip.clone().sub(tail[tail.length - 3]).normalize();
    cone(C.spine, tip, tdir, 2.4, 0.9, 0.22);
    cone(C.spine, tip.clone().addScaledVector(tdir, 0.4 * s), tdir.clone().add(V(0.8, 0, 0)), 1.2, 0.4, 0.3);
    cone(C.spine, tip.clone().addScaledVector(tdir, 0.4 * s), tdir.clone().add(V(-0.8, 0, 0)), 1.2, 0.4, 0.3);

    // Wings.
    for (const x of [-1, 1]) {
      const S = P(x * 2.4, 7.4, 1.8), E = P(x * 8.4, 14.2, -0.8), W = P(x * 13.6, 20.2, 0.4), flank = P(x * 2.2, 3.8, -2.6);
      // The arm is the leading edge, pale bone, so the silhouette reads against the sky; knuckles at elbow and wrist.
      m.loft(curve([S, S.clone().lerp(E, 0.5).add(V(0, 0.6 * s, 0)), E], 8), t => [(1.0 - t * 0.35) * s, (1.1 - t * 0.35) * s], () => col(C.bone), 7);
      m.loft(curve([E, E.clone().lerp(W, 0.5).add(V(0, 0.3 * s, 0.3 * s)), W], 8), t => [(0.7 - t * 0.2) * s, (0.75 - t * 0.2) * s], () => col(C.bone), 7);
      m.loft([E.clone().add(V(0, -0.6 * s, 0)), E.clone().add(V(0, 0.6 * s, 0))], () => [0.95 * s, 0.95 * s], () => col(C.bone), 7);
      m.loft([W.clone().add(V(0, -0.5 * s, 0)), W.clone().add(V(0, 0.5 * s, 0))], () => [0.75 * s, 0.75 * s], () => col(C.bone), 7);
      cone(C.horn, W.clone().add(V(0, 0.4 * s, 0.2 * s)), V(x * 0.15, 1, 0.5), 2.0, 0.3);
      // Four fingers sweep back from the wrist, bowed, so the wings have depth and catch light at different angles.
      const tips = [P(x * 26.5, 18.5, -6.0), P(x * 25.5, 11.0, -7.6), P(x * 21, 4.4, -6.4), P(x * 13.4, 1.8, -3.8)];
      const fingers = tips.map(t => curve([W, W.clone().lerp(t, 0.5).add(V(0, 0.8 * s, -1.2 * s)), t], 12));
      fingers.forEach(f => m.loft(f, t => [(0.42 - t * 0.3) * s, (0.46 - t * 0.32) * s], () => col(C.dark), 6));
      fingers.forEach(f => cone(C.bone, f[f.length - 1], f[f.length - 1].clone().sub(f[f.length - 3]), 1.2, 0.2));
      // Membranes between the fingers and from the last finger to the flank; the trailing edges scallop and tear.
      const arm = [...curve([W, E, S], 8), flank];
      const panels: [THREE.Vector3[], THREE.Vector3[], number][] = [[fingers[0], fingers[1], 0.22], [fingers[1], fingers[2], 0.26], [fingers[2], fingers[3], 0.3], [fingers[3], arm, 0.18]];
      panels.forEach(([a, b, depth], i) => membrane(a, b, depth, i * 11 + (x > 0 ? 3 : 0)));
    }
  });

  /**
   * A membrane between two bones that start together at the wrist. Billowed back between them, so one side faces the
   * light and the other falls into shade; two layers a hand apart, so it has an edge; the trailing edge is pulled in
   * towards the wrist (the scallop) and cut by notches of different depth, with a few holes torn through near the edge.
   */
  function membrane(a: THREE.Vector3[], b: THREE.Vector3[], depth: number, seed: number) {
    const NU = 10, NV = 8;
    const tipA = a[a.length - 1], tipB = b[b.length - 1], root = a[0];
    const n = tipA.clone().sub(root).cross(tipB.clone().sub(root)).normalize();
    if (n.z > 0) n.negate();
    const thick = 0.14 * s, bulge = 0.09 * tipA.distanceTo(tipB);
    const reach = (j: number) => {
      const v = j / NV, notch = j > 0 && j < NV && rnd(j, seed) < 0.45 ? 0.08 + rnd(j, seed + 1) * 0.22 : 0;
      return 1 - depth * Math.pow(Math.sin(Math.PI * v), 0.7) - notch;
    };
    const grid: THREE.Vector3[][] = [], tone: THREE.Color[][] = [];
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, u1 = reach(j), row: THREE.Vector3[] = [], tr: THREE.Color[] = [];
      for (let k = 0; k <= NU; k++) {
        const u = (k / NU) * u1;
        row.push(along(a, u).lerp(along(b, u), v).addScaledVector(n, Math.sin(Math.PI * v) * bulge * Math.min(1, u * 1.6)));
        const nearBone = Math.min(v, 1 - v) < 0.13, edge = k === NU;
        tr.push(col(edge ? C.torn : nearBone ? C.membraneDk : k > NU * 0.6 && rnd(j * 3 + k, seed) < 0.5 ? C.membraneLt : C.membrane));
      }
      grid.push(row); tone.push(tr);
    }
    for (let j = 0; j < NV; j++) for (let k = 0; k < NU; k++) {
      if (k > NU * 0.55 && rnd(j * 31 + k, seed + 7) < 0.05) continue;
      const p = [grid[j][k], grid[j + 1][k], grid[j + 1][k + 1], grid[j][k + 1]], c = [tone[j][k], tone[j + 1][k], tone[j + 1][k + 1], tone[j][k + 1]];
      m.face(p[0], p[1], p[2], c[0], c[1], c[2]).face(p[0], p[2], p[3], c[0], c[2], c[3]);
      const q = p.map(v => v.clone().addScaledVector(n, thick)), d = c.map(k2 => k2.clone().multiplyScalar(0.85));
      m.face(q[0], q[2], q[1], d[0], d[2], d[1]).face(q[0], q[3], q[2], d[0], d[3], d[2]);
    }
    // The edge between the layers along the trailing edge.
    for (let j = 0; j < NV; j++) {
      const p0 = grid[j][NU], p1 = grid[j + 1][NU], q0 = p0.clone().addScaledVector(n, thick), q1 = p1.clone().addScaledVector(n, thick), c2 = col(C.torn);
      m.face(p0, q0, q1, c2).face(p0, q1, p1, c2);
    }
  }

  // Form and rim, painted into the vertex colours: tops catch the sky, undersides fall into shade, and faces turned side-on
  // to the town (the silhouette) take a pale rim, so the dragon reads as a mass against the sky instead of a cut-out.
  const geo = m.geometry(), N = geo.attributes.normal as THREE.BufferAttribute, Col = geo.attributes.color as THREE.BufferAttribute;
  for (let i = 0; i < N.count; i++) {
    const ny = N.getY(i), side = 1 - Math.abs(N.getZ(i));
    const k = (ny > 0 ? 1 + 0.32 * ny : 1 + 0.38 * ny) + 0.3 * side * side * side;
    Col.setXYZ(i, Col.getX(i) * k, Col.getY(i) * k, Col.getZ(i) * k);
  }
  const mesh = new THREE.Mesh(geo, masonry({ side: THREE.DoubleSide }));
  mesh.name = 'keep-dragon';
  return mesh;
}
