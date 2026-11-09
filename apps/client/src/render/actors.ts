import * as THREE from 'three';

const box = new THREE.BoxGeometry(1, 1, 1);
const mats = new Map<string, THREE.MeshLambertMaterial>();
let pop = 0;
/** Lift characters and creatures off the ground: a self-lit share of their own colour, so they never sink into shade. */
export function setActorPop(v: number) { pop = v; for (const m of mats.values()) m.emissive.copy(m.color).multiplyScalar(pop); }
const mat = (c: string) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c }); m.emissive.copy(m.color).multiplyScalar(pop); mats.set(c, m); } return m; };
function part(parent: THREE.Object3D, color: string, w: number, h: number, d: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(box, mat(color)); m.scale.set(w, h, d); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
}

export type Rig = { root: THREE.Group; body: THREE.Group; legs: THREE.Object3D[]; arms: THREE.Object3D[]; height: number; kind: string };

export const looks: Record<string, { cloth: string; trim: string; skin: string; hair: string; hood?: boolean; pack?: string; hat?: string; apron?: string; long?: boolean }> = {
  hero: { cloth: '#35628e', trim: '#24405e', skin: '#e0b088', hair: '#2a1d16', hood: true, pack: '#7a7a42' },
  other: { cloth: '#6a4a72', trim: '#47304f', skin: '#c8956a', hair: '#5a3a22', pack: '#5a4a34' },
  robe: { cloth: '#d9cfb4', trim: '#b08a3a', skin: '#e0b48c', hair: '#8a8a8a', hood: true, long: true },
  apron: { cloth: '#5a4636', trim: '#3a2c22', skin: '#c48a60', hair: '#1e1612', apron: '#2e2a26' },
  dress: { cloth: '#8a3a3a', trim: '#e6dcc4', skin: '#e0ae86', hair: '#a8562a', long: true, apron: '#e6dcc4' },
  coat: { cloth: '#3a5a4a', trim: '#24382e', skin: '#d0a07a', hair: '#cfc6b0', hat: '#2a2a2a', long: true },
  vest: { cloth: '#7a6a3a', trim: '#4a3f22', skin: '#b8835a', hair: '#3a2a1a', hat: '#8a6a3a' },
  guard: { cloth: '#7a2e2a', trim: '#8a8a8a', skin: '#c8956a', hair: '#2a1d16', hat: '#9a9a9a' },
};

export function human(lookName: string): Rig {
  const L = looks[lookName] ?? looks.other;
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const legs: THREE.Object3D[] = [], arms: THREE.Object3D[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(side * 0.09, 0.36, 0);
    part(leg, L.trim, 0.13, 0.32, 0.15, 0, -0.17, 0); part(leg, '#2a2018', 0.14, 0.07, 0.19, 0, -0.33, 0.02);
    body.add(leg); legs.push(leg);
  }
  part(body, L.cloth, 0.34, 0.36, 0.22, 0, 0.53, 0);
  if (L.long) part(body, L.cloth, 0.36, 0.26, 0.24, 0, 0.3, 0);
  if (L.apron) part(body, L.apron, 0.24, 0.34, 0.03, 0, 0.42, 0.12);
  part(body, L.trim, 0.36, 0.05, 0.24, 0, 0.42, 0);
  for (const side of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(side * 0.22, 0.68, 0);
    part(arm, L.cloth, 0.1, 0.3, 0.12, 0, -0.14, 0); part(arm, L.skin, 0.09, 0.07, 0.1, 0, -0.32, 0);
    body.add(arm); arms.push(arm);
  }
  part(body, L.skin, 0.24, 0.22, 0.22, 0, 0.84, 0);
  part(body, '#1b1410', 0.04, 0.04, 0.02, -0.06, 0.85, 0.11); part(body, '#1b1410', 0.04, 0.04, 0.02, 0.06, 0.85, 0.11);
  if (L.hood) { part(body, L.trim, 0.28, 0.14, 0.26, 0, 0.98, -0.01); part(body, L.trim, 0.28, 0.22, 0.08, 0, 0.86, -0.12); }
  else part(body, L.hair, 0.26, 0.08, 0.24, 0, 0.98, -0.01);
  if (L.hat) { part(body, L.hat, 0.34, 0.04, 0.32, 0, 1.0, 0); part(body, L.hat, 0.22, 0.1, 0.2, 0, 1.06, 0); }
  if (L.pack) { part(body, L.pack, 0.26, 0.3, 0.12, 0, 0.56, -0.17); part(body, '#3a3020', 0.28, 0.05, 0.14, 0, 0.7, -0.17); }
  if (lookName === 'hero' || lookName === 'other') { const sword = new THREE.Group(); part(sword, '#c9c9c0', 0.04, 0.34, 0.03, 0, -0.32, 0.06); part(sword, '#8a6a3a', 0.12, 0.03, 0.05, 0, -0.16, 0.06); arms[1].add(sword); }
  if (lookName === 'guard') part(arms[1], '#7a6a5a', 0.04, 1.0, 0.04, 0, -0.1, 0.08);
  return { root, body, legs, arms, height: 1.15, kind: 'human' };
}

export function creature(kind: string): Rig {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const legs: THREE.Object3D[] = [];
  const leg = (color: string, x: number, z: number, h: number, w = 0.06) => { const g = new THREE.Group(); g.position.set(x, h, z); part(g, color, w, h, w, 0, -h / 2, 0); body.add(g); legs.push(g); };
  let height = 0.6;
  if (kind === 'gutterRat') {
    part(body, '#6a5e52', 0.22, 0.17, 0.36, 0, 0.14, 0); part(body, '#7a6e60', 0.16, 0.14, 0.16, 0, 0.16, 0.24); part(body, '#d79a8a', 0.05, 0.04, 0.04, 0, 0.14, 0.33);
    part(body, '#c88a7a', 0.06, 0.07, 0.03, -0.07, 0.26, 0.2); part(body, '#c88a7a', 0.06, 0.07, 0.03, 0.07, 0.26, 0.2);
    part(body, '#1a1210', 0.03, 0.03, 0.02, -0.05, 0.19, 0.32); part(body, '#1a1210', 0.03, 0.03, 0.02, 0.05, 0.19, 0.32);
    part(body, '#b88a7a', 0.03, 0.03, 0.34, 0, 0.1, -0.33);
    for (const [x, z] of [[-0.09, 0.1], [0.09, 0.1], [-0.09, -0.12], [0.09, -0.12]]) leg('#5a4e44', x, z, 0.07, 0.05);
    height = 0.45;
  } else if (kind === 'caveBeetle') {
    part(body, '#1e2a30', 0.42, 0.2, 0.5, 0, 0.22, -0.02); part(body, '#2c4a52', 0.2, 0.06, 0.46, -0.11, 0.33, -0.02); part(body, '#2c4a52', 0.2, 0.06, 0.46, 0.11, 0.33, -0.02);
    part(body, '#5fa0a0', 0.06, 0.03, 0.3, -0.13, 0.37, 0); part(body, '#141a1e', 0.26, 0.14, 0.16, 0, 0.2, 0.3);
    part(body, '#3a3028', 0.04, 0.04, 0.14, -0.08, 0.2, 0.42); part(body, '#3a3028', 0.04, 0.04, 0.14, 0.08, 0.2, 0.42);
    for (const z of [-0.18, 0.02, 0.2]) for (const x of [-0.25, 0.25]) leg('#141a1e', x, z, 0.14, 0.05);
    height = 0.6;
  } else if (kind === 'mireGrub') {
    for (let i = 0; i < 5; i++) { const s = 0.36 - Math.abs(i - 1.5) * 0.05; part(body, i % 2 ? '#c2b08a' : '#b09c76', s, s * 0.8, 0.2, 0, s * 0.42, 0.36 - i * 0.18); }
    part(body, '#5a3a2a', 0.22, 0.14, 0.08, 0, 0.16, 0.48); part(body, '#e0d0a0', 0.04, 0.06, 0.03, -0.07, 0.12, 0.52); part(body, '#e0d0a0', 0.04, 0.06, 0.03, 0.07, 0.12, 0.52);
    height = 0.6;
  } else {
    part(body, '#5a3e2a', 0.4, 0.34, 0.66, 0, 0.42, 0); part(body, '#4a3020', 0.42, 0.14, 0.5, 0, 0.62, -0.02);
    for (let i = 0; i < 4; i++) part(body, '#2e2018', 0.06, 0.12, 0.06, 0, 0.72, 0.2 - i * 0.14);
    part(body, '#5a3e2a', 0.3, 0.28, 0.26, 0, 0.42, 0.42); part(body, '#7a5a44', 0.18, 0.12, 0.08, 0, 0.36, 0.57);
    part(body, '#ece2c8', 0.04, 0.12, 0.04, -0.12, 0.42, 0.55); part(body, '#ece2c8', 0.04, 0.12, 0.04, 0.12, 0.42, 0.55);
    part(body, '#140c08', 0.04, 0.04, 0.02, -0.08, 0.5, 0.56); part(body, '#140c08', 0.04, 0.04, 0.02, 0.08, 0.5, 0.56);
    for (const [x, z] of [[-0.13, 0.22], [0.13, 0.22], [-0.13, -0.22], [0.13, -0.22]]) leg('#3a2818', x, z, 0.26, 0.09);
    height = 0.85;
  }
  return { root, body, legs, arms: [], height, kind };
}

/** Corpse by decay stage: 0 fresh, 1 decaying (darker, flatter, flies of colour gone), 2 bones only. */
export function corpseMesh(kind: string, stage = 0) {
  const g = new THREE.Group();
  const color = kind === 'gutterRat' ? '#5a4e44' : kind === 'caveBeetle' ? '#1e2a30' : kind === 'mireGrub' ? '#9a8a66' : kind === 'thornboar' ? '#4a3424' : '#4a3a2a';
  const len = kind === 'gutterRat' ? 0.34 : kind === 'hero' ? 0.6 : 0.55;
  if (stage < 2) {
    const body = new THREE.Color(color).lerp(new THREE.Color('#3a3328'), stage ? 0.55 : 0);
    part(g, `#${body.getHexString()}`, len * 0.6, stage ? 0.06 : 0.1, len * (stage ? 0.9 : 1), 0, stage ? 0.03 : 0.05, 0).rotation.y = 0.6;
    part(g, stage ? '#3a1a14' : '#5a1e18', len * (stage ? 0.85 : 0.7), 0.01, len * (stage ? 0.95 : 0.8), 0.05, 0.006, 0.05).rotation.y = 0.2;
    if (kind === 'hero') part(g, '#6b6a3a', 0.3, 0.16, 0.24, 0.2, 0.08, -0.1);
  } else {
    // Bones: a pale skull and a few ribs.
    const bone = '#d8cfb8';
    part(g, bone, len * 0.28, 0.08, len * 0.26, 0, 0.04, len * 0.3);
    for (let i = 0; i < 3; i++) part(g, bone, len * 0.5, 0.03, 0.035, 0, 0.02, -i * len * 0.18).rotation.y = 0.3 * (i - 1);
    part(g, bone, 0.03, 0.03, len * 0.6, 0.02, 0.02, -len * 0.15);
  }
  return g;
}

