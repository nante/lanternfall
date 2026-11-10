import * as THREE from 'three';

const box = new THREE.BoxGeometry(1, 1, 1);
const bone = new THREE.MeshLambertMaterial({ color: '#d8cfb8' });
function part(parent: THREE.Object3D, w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(box, bone); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

/** What is left of a body at the last decay stage: a pale skull and a few ribs, sized to the kind. */
export function corpseMesh(kind: string) {
  const g = new THREE.Group();
  const len = kind === 'gutterRat' ? 0.3 : kind === 'mireGrub' ? 0.7 : kind === 'thornboar' ? 0.75 : 0.55;
  part(g, len * 0.28, 0.08, len * 0.26, 0, 0.04, len * 0.3);
  for (let i = 0; i < 3; i++) part(g, len * 0.5, 0.03, 0.035, 0, 0.02, -i * len * 0.18).rotation.y = 0.3 * (i - 1);
  part(g, 0.03, 0.03, len * 0.6, 0.02, 0.02, -len * 0.15);
  return g;
}
