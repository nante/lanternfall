import * as THREE from 'three';
import { Mason, prim, masonry } from './kit.ts';
import type { Ground } from './castle.ts';
import type { DragonPiece } from './scene.ts';

/**
 * The dragon of Hollow Keep, after ref-1: perched on the keep's broken crown, facing the town, wings raised and spread
 * far wider than the tower, neck reared and jaws open. Blue-violet scales and rust-red membranes, the reference's two
 * signature colours. Far scenery, one merged mesh, no part of play.
 */
const C = {
  scale: '#3d499b', dark: '#243166', belly: '#8591c0', bone: '#c8ac9f',
  membrane: '#be5b54', membraneDk: '#854457', spine: '#1c295c',
};
const ball = new THREE.IcosahedronGeometry(1, 1);

/** A two-sided triangle of membrane. */
function tri(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a.toArray(), ...b.toArray(), ...c.toArray(), ...a.toArray(), ...c.toArray(), ...b.toArray()], 3));
  g.computeVertexNormals();
  return g;
}
const bezier = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, t: number) =>
  a.clone().multiplyScalar((1 - t) ** 2).add(b.clone().multiplyScalar(2 * (1 - t) * t)).add(c.clone().multiplyScalar(t * t));

export function keepDragon(g: Ground, piece: DragonPiece) {
  const m = new Mason((c, p) => c.multiplyScalar(0.8 + 0.25 * Math.min(1, Math.max(0, (p.y - top) / 20))));
  // Perched on the walls behind and beside the keep, not on its crown: the tower stands in front of one wing, as in ref-1.
  const top = g(piece.x, piece.z) + piece.perch, s = piece.scale;
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x * s, top + y * s, z * s);
  const blob = (color: string, p: THREE.Vector3, r: number, sx = 1, sy = 1, sz = 1, rx = 0) => m.put(ball, color, p.x, p.y, p.z, { sx: r * sx * s, sy: r * sy * s, sz: r * sz * s, rx });
  const spike = (color: string, p: THREE.Vector3, len: number, r: number, rx: number, rz = 0) => m.put(prim.cone(5), color, p.x, p.y, p.z, { sx: r * s, sy: len * s, sz: r * s, rx, rz });
  m.within(piece.x, 0, piece.z, piece.ry, () => {
    // Body: chest raised towards the town, belly paler.
    blob(C.scale, P(0, 3.6, 0), 1, 3.1, 2.9, 5.2, -0.45);
    blob(C.belly, P(0, 3.2, 2.2), 1, 2.3, 2.2, 3.0, -0.6);
    // Neck: arches up from the shoulders, then forward and down, so the head hangs low between the wings and looks down
    // on the town (ref-1). One colour and heavily overlapped, so it reads as a tapering neck, with a pale crest of spines.
    const A = P(0, 6.5, 2.5), B = P(0, 15, 1.5), Cn = P(0, 15.5, 10), D = P(0, 8.2, 11.5);
    const cubic = (t: number) => bezier(bezier(A, B, Cn, t), bezier(B, Cn, D, t), bezier(Cn, D, D, t), t);
    for (let i = 0; i <= 18; i++) {
      const t = i / 18, p = cubic(t), r = 2.0 - t * 1.05;
      blob(C.scale, p, r, 1.05, 1, 1);
      if (i % 2 === 0 && i > 0 && i < 17) {
        const q = cubic(t + 0.02).sub(p).normalize(), out = new THREE.Vector3(0, q.z, -q.y).normalize();
        m.beam(C.bone, p.clone().addScaledVector(out, r * s * 0.7), p.clone().addScaledVector(out, r * s * 0.7 + (1.5 - t * 0.7) * s), 0.34 * s);
      }
    }
    // Head: a heavy skull tilted down, a long snout, an open lower jaw, a crown of swept-back horns, ember eyes.
    const h = D.clone().add(new THREE.Vector3(0, -0.4 * s, 0.9 * s)), V = (x: number, y: number, z: number) => h.clone().add(new THREE.Vector3(x * s, y * s, z * s));
    blob(C.scale, h, 1, 1.55, 1.25, 1.7, 0.55);
    blob(C.scale, V(0, -1.0, 1.7), 1, 1.0, 0.75, 1.7, 0.6);
    blob(C.dark, V(0, -2.1, 1.0), 1, 0.8, 0.4, 1.5, 0.95);
    blob(C.bone, V(0, -1.75, 2.75), 0.28, 2.2, 0.7, 0.7);
    for (const x of [-1, 1]) {
      m.beam(C.bone, V(x * 0.8, 0.8, -0.5), V(x * 1.9, 3.4, -3.4), 0.5 * s);
      m.beam(C.bone, V(x * 1.2, 0.2, -0.7), V(x * 3.0, 1.6, -3.0), 0.4 * s);
      m.beam(C.bone, V(x * 0.3, 1.1, -0.6), V(x * 0.6, 3.0, -2.6), 0.36 * s);
      blob('#ef7125', V(x * 0.95, 0.05, 1.25), 0.3);
      blob(C.dark, V(x * 0.9, 0.5, 1.0), 0.5, 1.2, 0.5, 1.4);
    }
    // Legs gripping the crown, three claws each.
    for (const x of [-1, 1]) {
      const sh = P(x * 2.2, 3, 2.6), ft = P(x * 2.9, 0.2, 5.4), hip = P(x * 2.5, 2.6, -2.6), hf = P(x * 3.4, 0.2, -4.6);
      m.beam(C.scale, sh, ft, 1.1 * s); m.beam(C.scale, hip, hf, 1.3 * s);
      for (const [f, d] of [[ft, 1], [hf, 1]] as const) for (const k of [-0.5, 0, 0.5]) spike(C.bone, f.clone().add(new THREE.Vector3(k * s, 0, 0.4 * s * d)), 1.0, 0.18, Math.PI / 2 + 0.4);
    }
    // Tail: over the back wall and down the keep's flank, ending in a spade.
    const tail = [P(0, 3, -5), P(0.6, 2.4, -7.6), P(1.6, 0.4, -9.2), P(2.6, -3, -9.6), P(3, -6.2, -8.6), P(2.5, -8.8, -7)];
    tail.forEach((p, i) => { blob(C.scale, p, 1.6 - i * 0.22); if (i < 5) spike(C.spine, p.clone().add(new THREE.Vector3(0, (1.5 - i * 0.2) * s, 0)), 1.1, 0.26, -0.6); });
    m.put(prim.cone(4), C.dark, tail[5].x, tail[5].y - 1 * s, tail[5].z, { sx: 0.9 * s, sy: 2.2 * s, sz: 0.3 * s, rx: Math.PI });
    // Wings: arm to elbow and wrist, four fingers fanning out, membrane scalloped between them, raised high as in ref-1.
    for (const x of [-1, 1]) {
      const S = P(x * 2.6, 6, 0.5), E = P(x * 9, 14, -1), W = P(x * 14, 19, 0.2);
      // Fingers sweep back from the wrist, so the wings have depth and catch light at different angles.
      const tips = [P(x * 25.5, 17, -6.5), P(x * 24, 10.5, -7.5), P(x * 19, 4, -5.5), P(x * 11.5, 2.5, -3)];
      const root = P(x * 2, 3.2, -2.4);
      // The arm is the wing's leading edge: pale bone, so the silhouette reads against the sky.
      m.beam(C.bone, S, E, 0.8 * s); m.beam(C.bone, E, W, 0.65 * s);
      spike(C.bone, W, 1.6, 0.3, 0, x * -0.3);
      tips.forEach(t => m.beam(C.dark, W, t, 0.38 * s));
      const panels: [THREE.Vector3, THREE.Vector3][] = [[tips[0], tips[1]], [tips[1], tips[2]], [tips[2], tips[3]]];
      panels.forEach(([a, b], i) => {
        // The trailing edge between two fingers is pulled in towards the wrist: the ragged scallop.
        // Torn edge: the span between two fingers is cut by three notches of different depth, like ref-1's ragged wings.
        const col = [C.membrane, C.membraneDk, '#6a3c5a'][i];
        const edge = [a];
        for (let k = 1; k < 6; k++) {
          const t = k / 6, p = a.clone().lerp(b, t);
          edge.push(k % 2 ? p.lerp(W, 0.16 + 0.14 * ((k * 7 + i * 3) % 5) / 4) : p.lerp(W, 0.06));
        }
        edge.push(b);
        for (let k = 0; k < edge.length - 1; k++) m.putMatrix(tri(W, edge[k], edge[k + 1]), col, new THREE.Matrix4());
      });
      // Inner membrane: wrist, last finger, elbow, shoulder, flank.
      m.putMatrix(tri(W, tips[3], E), C.membraneDk, new THREE.Matrix4());
      m.putMatrix(tri(E, tips[3], S), C.membrane, new THREE.Matrix4());
      m.putMatrix(tri(S, tips[3], root), C.membraneDk, new THREE.Matrix4());
    }
  });
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
