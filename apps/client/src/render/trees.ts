import * as THREE from 'three';
import { hash2 } from '../../../../packages/game/src/town.ts';
import { ramps } from './palette.ts';

/**
 * Trees that hold up from any pitch: round canopies on tapered trunks, pines as stacked seven-sided cones, bushes as two
 * small clumps. Canopies are painted as foliage (`foliage`): leaf clumps on the pixel grid and a ragged leaf edge, so
 * they read as pixel-art trees rather than low-poly facets. Colour comes from palette ramps per instance.
 */
type Part = { geo: THREE.BufferGeometry; list: { m: THREE.Matrix4; c: string }[] };
const q = new THREE.Quaternion(), e = new THREE.Euler();
const mat4 = (x: number, y: number, z: number, s: number, sy = s, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(0, ry, 0)), new THREE.Vector3(s, sy, s));

export function buildTrees(tiles: { x: number; y: number; kind: 'tree' | 'pine' | 'bush' }[]) {
  const parts: Record<string, Part> = {
    trunk: { geo: new THREE.CylinderGeometry(0.11, 0.17, 1, 6), list: [] },
    blob: { geo: new THREE.IcosahedronGeometry(1, 1), list: [] },
    cone: { geo: new THREE.ConeGeometry(1, 1, 7), list: [] },
    berry: { geo: new THREE.IcosahedronGeometry(1, 0), list: [] },
  };
  const leaf = [ramps.moss[7], ramps.moss[8], ramps.moss[9]], lit = [ramps.moss[10], ramps.olive[3]], needles = [ramps.moss[4], ramps.moss[5], ramps.moss[6]];
  const autumn = [ramps.olive[3], ramps.olive[2], ramps.olive[4]];
  type Blob = [number, number, number, number, string];
  for (const { x, y, kind } of tiles) {
    const r = hash2(x * 3.1, y * 1.7), r2 = hash2(x * 7.3, y * 2.9), r3 = hash2(x * 1.9, y * 5.3), s = 0.85 + r * 0.4;
    if (kind === 'tree') {
      // Four crowns: a round head, a tall oval, a broad low spread, and an old tree with a forked trunk; now and then
      // one turning gold. Heights stay within the old range so nothing in play hides any more than it did.
      const shape = Math.floor(r3 * 4), turn = r2 > 0.9, L = turn ? autumn : leaf, Lt = turn ? [ramps.olive[4], ramps.olive[5]] : lit;
      const trunkH = shape === 1 ? 1.5 : shape === 2 ? 1.05 : 1.3, girth = shape === 3 ? 1.5 : 1;
      parts.trunk.list.push({ m: mat4(x, (trunkH / 2) * s, y, s * girth, trunkH * s), c: ramps.earth[shape === 3 ? 3 : 4] });
      const blobs: Blob[] = [
        [[0, 1.8, 0, 0.78, L[1]], [-0.48, 1.5, 0.12, 0.52, L[0]], [0.5, 1.55, -0.05, 0.55, L[2]], [0.08, 2.2, -0.28, 0.5, Lt[0]], [-0.18, 2.05, 0.3, 0.38, Lt[r2 > 0.5 ? 1 : 0]]],
        [[0, 1.65, 0, 0.58, L[0]], [0.05, 2.15, -0.05, 0.56, L[1]], [-0.06, 2.6, 0.04, 0.44, L[2]], [0.12, 2.95, -0.08, 0.3, Lt[0]], [-0.28, 1.95, 0.22, 0.32, Lt[1]]],
        [[0, 1.5, 0, 0.7, L[1]], [-0.66, 1.35, 0.1, 0.5, L[0]], [0.68, 1.4, -0.1, 0.52, L[2]], [-0.25, 1.75, -0.32, 0.46, Lt[0]], [0.3, 1.78, 0.28, 0.44, Lt[1]], [0, 1.95, 0, 0.42, Lt[0]]],
        [[-0.4, 1.7, 0.05, 0.6, L[0]], [0.45, 1.85, -0.1, 0.62, L[1]], [0, 2.25, 0, 0.55, L[2]], [-0.1, 1.45, 0.4, 0.4, Lt[1]], [0.3, 2.4, -0.2, 0.36, Lt[0]]],
      ][shape] as Blob[];
      const flat = shape === 2 ? 0.72 : shape === 1 ? 1.08 : 0.88;
      for (const [dx, dy, dz, br, c] of blobs) parts.blob.list.push({ m: mat4(x + dx * s, dy * s, y + dz * s, br * s, br * s * flat, r * 6 + dx), c });
      if (shape === 3) for (const side of [-1, 1]) parts.trunk.list.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x + side * 0.22 * s, 1.3 * s, y), q.setFromEuler(e.set(0, 0, -side * 0.55)), new THREE.Vector3(0.6 * s, 0.7 * s, 0.6 * s)), c: ramps.earth[3] });
    } else if (kind === 'pine') {
      // Pines vary in height and spread: a few tall and narrow, a few broad and low.
      const tall = 0.85 + r3 * 0.45, wide = 1.15 - (tall - 0.85) * 0.5;
      parts.trunk.list.push({ m: mat4(x, 0.35, y, 0.75, 0.8), c: ramps.earth[3] });
      const tiers = r2 > 0.55 ? [[1.0, 0.8, 1.2], [1.6, 0.66, 1.0], [2.15, 0.5, 0.95], [2.65, 0.34, 0.8], [3.05, 0.18, 0.55]] : [[1.0, 0.78, 1.2], [1.65, 0.62, 1.05], [2.25, 0.44, 0.95], [2.75, 0.26, 0.7]];
      tiers.forEach(([cy, cr, ch], i) => parts.cone.list.push({ m: mat4(x, cy * s * tall * 0.92, y, cr * s * wide, ch * s * tall * 0.92, r * 3 + i * 0.5), c: needles[(i + Math.floor(r * 3)) % 3] }));
    } else {
      // A bush: three to five clumps, sometimes with berries or blossom.
      const n = 3 + Math.floor(r3 * 3);
      for (let i = 0; i < n; i++) { const a = i * 2.4 + r * 6, d = i ? 0.17 : 0; parts.blob.list.push({ m: mat4(x + Math.cos(a) * d, 0.2 + (i ? 0 : 0.06), y + Math.sin(a) * d * 0.8, i ? 0.22 : 0.32, i ? 0.19 : 0.27, a), c: i % 2 ? lit[0] : leaf[i % 3] }); }
      if (r2 > 0.6) for (let i = 0; i < 4; i++) { const a = i * 1.7 + r2 * 5; parts.berry.list.push({ m: mat4(x + Math.cos(a) * 0.2, 0.28 + (i % 2) * 0.08, y + 0.16 + Math.sin(a) * 0.06, 0.04, 0.04), c: r > 0.5 ? ramps.roof[3] : ramps.bone[1] }); }
    }
  }
  const group = new THREE.Group();
  for (const p of Object.values(parts)) {
    if (!p.list.length) continue;
    const mesh = new THREE.InstancedMesh(p.geo, p.geo === parts.trunk.geo || p.geo === parts.berry.geo ? Object.assign(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), { userData: { frame: true } }) : foliage(), p.list.length);
    p.list.forEach((it, i) => { mesh.setMatrixAt(i, it.m); mesh.setColorAt(i, new THREE.Color(it.c)); });
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  return group;
}

/**
 * Foliage: smooth-shaded so light rolls round the canopy, then broken into leaf clumps four render pixels across (cells
 * fixed to the world, so they never swim), each a little lighter or darker; near the silhouette, clumps drop out so the
 * outline is a ragged edge of leaves instead of a polygon. Runs before the light field's patch, which chains after it.
 */
export function foliage() {
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  mat.userData.frame = true;
  mat.customProgramCacheKey = () => 'foliage';
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      {
        // Clump size doubles wherever a clump would fall under a pixel, so far trees stay in clusters instead of speckle.
        float fl = exp2(ceil(log2(max(length(fwidth(vFPos)) * 8.0, 1.0))));
        vec3 lc = floor(vFPos * 8.0 / fl);
        float n = fract(sin(dot(lc, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= 0.8 + 0.4 * floor(n * 3.0) / 2.0;
        float facing = abs(dot(normalize(vFNrm), normalize(cameraPosition - vFPos)));
        if (facing < 0.32 && n < 0.55) discard;
      }`);
  };
  return mat;
}
