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
  };
  const leaf = [ramps.moss[7], ramps.moss[8], ramps.moss[9]], lit = [ramps.moss[10], ramps.olive[3]], needles = [ramps.moss[4], ramps.moss[5], ramps.moss[6]];
  for (const { x, y, kind } of tiles) {
    const r = hash2(x * 3.1, y * 1.7), r2 = hash2(x * 7.3, y * 2.9), s = 0.85 + r * 0.4;
    if (kind === 'tree') {
      parts.trunk.list.push({ m: mat4(x, 0.65 * s, y, s, 1.3 * s), c: ramps.earth[4] });
      const blobs: [number, number, number, number, string][] = [
        [0, 1.8, 0, 0.78, leaf[1]], [-0.48, 1.5, 0.12, 0.52, leaf[0]], [0.5, 1.55, -0.05, 0.55, leaf[2]],
        [0.08, 2.2, -0.28, 0.5, lit[0]], [-0.18, 2.05, 0.3, 0.38, lit[r2 > 0.5 ? 1 : 0]],
      ];
      for (const [dx, dy, dz, br, c] of blobs) parts.blob.list.push({ m: mat4(x + dx * s, dy * s, y + dz * s, br * s, br * s * 0.88, r * 6 + dx), c });
    } else if (kind === 'pine') {
      parts.trunk.list.push({ m: mat4(x, 0.35, y, 0.75, 0.8), c: ramps.earth[3] });
      [[1.0, 0.78, 1.2], [1.65, 0.62, 1.05], [2.25, 0.44, 0.95], [2.75, 0.26, 0.7]].forEach(([cy, cr, ch], i) =>
        parts.cone.list.push({ m: mat4(x, cy * s, y, cr * s, ch * s, r * 3 + i * 0.5), c: needles[(i + Math.floor(r * 3)) % 3] }));
    } else {
      parts.blob.list.push({ m: mat4(x - 0.1, 0.22, y, 0.34, 0.28, r * 6), c: leaf[0] });
      parts.blob.list.push({ m: mat4(x + 0.16, 0.3, y - 0.08, 0.26, 0.22, r2 * 6), c: lit[0] });
    }
  }
  const group = new THREE.Group();
  for (const p of Object.values(parts)) {
    if (!p.list.length) continue;
    const mesh = new THREE.InstancedMesh(p.geo, p.geo === parts.trunk.geo ? Object.assign(new THREE.MeshLambertMaterial({ color: '#ffffff', flatShading: true }), { userData: { frame: true } }) : foliage(), p.list.length);
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
