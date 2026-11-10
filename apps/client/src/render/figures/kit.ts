import * as THREE from 'three';

/**
 * Figures as code. A figure is a joint skeleton plus shaped primitives hung on its joints; poses.ts moves the joints.
 * Units are tiles (1 = 32 render px across). Every figure faces +z (south, towards the camera) at rest.
 * Colours are palette.ts entries only, as albedo: [outline, cavity, shade, base, glint]. Light and its colour come
 * from the scene at runtime (sun, sky, lamps), so the bake paints only form occlusion and surface grain.
 */
export type Ramp = readonly [ink: string, t0: string, t1: string, t2: string, t3: string];

export const materials = {
  skin: ['#4d3422', '#7b5737', '#9a6446', '#c48a62', '#e3b48c'],
  skinDark: ['#2c1f15', '#5a3d27', '#7b5737', '#9a6446', '#c48a62'],
  eye: ['#06070d', '#06070d', '#0c0f1e', '#0c0f1e', '#141a31'],
  cloakBlue: ['#06070d', '#141a31', '#1d4058', '#2f6180', '#4f8daa'],
  tunicBlue: ['#10283a', '#1d4058', '#2f6180', '#4f8daa', '#8cc0d2'],
  navy: ['#06070d', '#0c0f1e', '#141a31', '#1e2646', '#2b365d'],
  leather: ['#1a120c', '#2c1f15', '#3b2819', '#5a3d27', '#7b5737'],
  pack: ['#1a120c', '#2c3318', '#434c20', '#5e6a2b', '#7f8b38'],
  steel: ['#0c0f1e', '#2b365d', '#55524f', '#6f6a63', '#aaa395'],
  purple: ['#0c0f1e', '#2d2140', '#4a3460', '#74507e', '#a8708e'],
  hairBrown: ['#1a120c', '#2c1f15', '#4d3422', '#6b4a30', '#7b5737'],
  hairBlack: ['#06070d', '#1a120c', '#2c1f15', '#3b2819', '#4d3422'],
  hairWhite: ['#55524f', '#8c867b', '#aaa395', '#c8c0ae', '#ece2c8'],
  hairAuburn: ['#2e130b', '#3f1716', '#5c2410', '#93391a', '#c95a24'],
  robe: ['#55524f', '#8c867b', '#aaa395', '#d6ccb2', '#ece2c8'],
  gold: ['#5c2410', '#93391a', '#c95a24', '#ec8a35', '#ffb95e'],
  flame: ['#93391a', '#ec8a35', '#ffb95e', '#ffe2a0', '#ffe2a0'],
  shirt: ['#2c1f15', '#3f352b', '#584a39', '#71614a', '#8b795b'],
  apronDark: ['#06070d', '#1a120c', '#2c1f15', '#3b2819', '#4d3422'],
  red: ['#2e130b', '#3f1716', '#6a2621', '#963c30', '#bd6447'],
  linen: ['#6f6a63', '#aaa395', '#d6ccb2', '#ece2c8', '#fbf4e2'],
  /** The bedroll: a rust wool blanket (ref-1's accent), so the most-seen view of a traveller is not a white block. */
  wool: ['#2e130b', '#4a2418', '#6c3223', '#8a4a36', '#a8664a'],
  coatGreen: ['#0a120d', '#142218', '#1d3121', '#2b4a2d', '#3e6435'],
  hatBlack: ['#06070d', '#0c0f1e', '#141a31', '#1e2646', '#2b365d'],
  vestOlive: ['#2c3318', '#434c20', '#5e6a2b', '#7f8b38', '#a6ad4c'],
  straw: ['#3b2819', '#7b5737', '#a07a4e', '#c4a072', '#cdc875'],
  trousersBrown: ['#1a120c', '#3b2819', '#4d3422', '#5a3d27', '#6b4a30'],
  mail: ['#141a31', '#3e3d3f', '#55524f', '#6f6a63', '#8c867b'],
  wood: ['#1a120c', '#3b2819', '#5a3d27', '#7b5737', '#a07a4e'],
  smear: ['#ece2c8', '#d6ccb2', '#ece2c8', '#fbf4e2', '#fbf4e2'],
  boarHide: ['#1a120c', '#2c1f15', '#3b2819', '#5a3d27', '#7b5737'],
  boarDark: ['#06070d', '#1a120c', '#2c1f15', '#3b2819', '#5a3d27'],
  boarSnout: ['#2c1f15', '#9a6446', '#a8708e', '#d39a9c', '#e3b48c'],
  thorn: ['#1a120c', '#5a3d27', '#7b5737', '#c4a072', '#ece2c8'],
  tusk: ['#3e3d3f', '#8c867b', '#aaa395', '#d6ccb2', '#ece2c8'],
  hoof: ['#06070d', '#1a120c', '#2c1f15', '#3b2819', '#4d3422'],
  ratFur: ['#1a120c', '#3e3d3f', '#55524f', '#71614a', '#8b795b'],
  ratPink: ['#4a3460', '#9a6446', '#a8708e', '#d39a9c', '#e3b48c'],
} as const satisfies Record<string, Ramp>;
export type Mat = keyof typeof materials;
/** Self-lit share per material: the smear and a lantern flame read even at night. */
export const glow: Partial<Record<Mat, number>> = { smear: 0.85, flame: 1 };
/**
 * Surface grain: how a material breaks into clusters of its ramp, fixed to the body so it never boils between frames.
 * Kind 0 none, 1 cloth (soft blotches), 2 mail (pixel speckle), 3 fur (fine mottle), 4 grain (streaks along the part).
 */
export const grain: Partial<Record<Mat, [kind: number, amount: number]>> = {
  cloakBlue: [1, 0.3], tunicBlue: [1, 0.26], navy: [1, 0.24], purple: [1, 0.28], robe: [1, 0.24], red: [1, 0.3], linen: [1, 0.2], wool: [1, 0.3],
  coatGreen: [1, 0.3], vestOlive: [1, 0.28], shirt: [1, 0.26], trousersBrown: [1, 0.24], pack: [1, 0.3], apronDark: [1, 0.24],
  mail: [2, 0.55], steel: [2, 0.3], leather: [4, 0.26], wood: [4, 0.32], straw: [4, 0.36], hatBlack: [1, 0.2],
  hairBrown: [4, 0.3], hairBlack: [4, 0.26], hairWhite: [4, 0.3], hairAuburn: [4, 0.34],
  boarHide: [3, 0.42], boarDark: [3, 0.36], boarSnout: [3, 0.15], thorn: [4, 0.2], ratFur: [3, 0.4], gold: [2, 0.25], skin: [3, 0.08], skinDark: [3, 0.08],
};

export type Vec3 = readonly [number, number, number];
export type JointDef = { name: string; parent?: string; at: Vec3 };
/** `smear` parts exist only on strike frames. */
export type PartDef = { joint: string; geo: THREE.BufferGeometry; mat: Mat; tag?: 'smear' };
export type Skeleton = 'human' | 'boar' | 'rat';
/** Sprite cell in render px; (ax, ay) is the feet, counted from the cell's bottom-left corner. */
export type Cell = { w: number; h: number; ax: number; ay: number };
export type FigureId = 'hero' | 'other' | 'robe' | 'apron' | 'dress' | 'coat' | 'vest' | 'guard' | 'thornboar' | 'gutterRat';
export type Figure = { id: FigureId; label: string; skeleton: Skeleton; joints: JointDef[]; parts: PartDef[]; cell: Cell };

// Primitives. All return geometry in the joint's space; `place` moves and turns it there.
const SEG = 10;
type P2 = readonly [number, number];
function lathe(profile: P2[], opts: { seg?: number; open?: number; sx?: number; sz?: number } = {}) {
  const open = opts.open ?? 0;
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), opts.seg ?? SEG, open / 2, Math.PI * 2 - open);
  if (opts.sx || opts.sz) g.scale(opts.sx ?? 1, 1, opts.sz ?? 1);
  return g;
}
function place(g: THREE.BufferGeometry, at: Vec3 = [0, 0, 0], rot: Vec3 = [0, 0, 0]) {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(1, 1, 1)));
  return g;
}
/** Ellipsoid from a lathed half circle. */
function blob(rx: number, ry: number, rz: number, at?: Vec3, rot?: Vec3, seg = SEG) {
  const prof: P2[] = [];
  for (let i = 0; i <= 6; i++) { const a = -Math.PI / 2 + (i / 6) * Math.PI; prof.push([Math.max(0, Math.cos(a)) * rx, Math.sin(a) * ry]); }
  prof[0] = [0, -ry]; prof[6] = [0, ry];
  return place(lathe(prof, { seg, sz: rz / rx }), at, rot);
}
/** Tapered capsule hanging from the joint along −y: radius r0 at the joint, r1 at the far end. */
function limb(r0: number, r1: number, len: number, at?: Vec3, rot?: Vec3, sz = 1) {
  const prof: P2[] = [[0, -len - r1], [r1 * 0.75, -len - r1 * 0.7], [r1, -len], [(r0 + r1) / 2 * 1.04, -len / 2], [r0, 0], [r0 * 0.75, r0 * 0.7], [0, r0]];
  return place(lathe(prof, { seg: 8, sz }), at, rot);
}
/** A cone standing on its base, tip up. */
function cone(r: number, h: number, at?: Vec3, rot?: Vec3, seg = 6) { return place(lathe([[0, 0], [r, 0.001], [0, h]], { seg }), at, rot); }
/** Square-section frustum along +z from (w0, h0) to (w1, h1): snouts, boots, plates. */
function wedge(w0: number, h0: number, w1: number, h1: number, len: number, at?: Vec3, rot?: Vec3) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 1);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const front = p.getZ(i) > 0;
    p.setXYZ(i, p.getX(i) * (front ? w1 : w0), p.getY(i) * (front ? h1 : h0), (p.getZ(i) + 0.5) * len);
  }
  g.computeVertexNormals();
  return place(g.toNonIndexed(), at, rot);
}
/** A flat ring sector in the y–z plane, swept from angle a0 to a1 (0 = forward, π/2 = up): the strike smear. */
function sweep(r0: number, r1: number, a0: number, a1: number, at?: Vec3, rot?: Vec3) {
  const pos: number[] = [], n = 7;
  const q = (u: number, r: number) => [0, Math.sin(u) * r, Math.cos(u) * r];
  // Full width at the leading edge (a0, where the blade is now), thinning towards the tail like a drawn swoosh.
  const inner = (i: number) => r1 - (r1 - r0) * (1 - 0.85 * (i / n));
  for (let i = 0; i < n; i++) {
    const u0 = a0 + ((a1 - a0) * i) / n, u1 = a0 + ((a1 - a0) * (i + 1)) / n;
    const a = q(u0, r1), b = q(u1, r1), c = q(u1, inner(i + 1)), d = q(u0, inner(i));
    pos.push(...a, ...b, ...c, ...a, ...c, ...d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return place(g, at, rot);
}

// Human kit. Storybook-heroic proportions, after the references' cloaked riders and travellers: about four heads tall,
// long legs, a modest head under a big hood. Still a clear head and hood from the Play camera, no longer a toy.
const humanJoints: JointDef[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'pelvis', parent: 'root', at: [0, 0.63, 0] },
  { name: 'spine', parent: 'pelvis', at: [0, 0.12, 0] },
  { name: 'neck', parent: 'spine', at: [0, 0.37, 0] },
  { name: 'head', parent: 'neck', at: [0, 0.04, 0] },
  { name: 'cloak', parent: 'spine', at: [0, 0.36, -0.03] },
  { name: 'shoulderR', parent: 'spine', at: [-0.215, 0.31, 0] },
  { name: 'elbowR', parent: 'shoulderR', at: [0, -0.23, 0] },
  { name: 'handR', parent: 'elbowR', at: [0, -0.2, 0] },
  { name: 'shoulderL', parent: 'spine', at: [0.215, 0.31, 0] },
  { name: 'elbowL', parent: 'shoulderL', at: [0, -0.23, 0] },
  { name: 'handL', parent: 'elbowL', at: [0, -0.2, 0] },
  { name: 'hipR', parent: 'pelvis', at: [-0.095, -0.02, 0] },
  { name: 'kneeR', parent: 'hipR', at: [0, -0.3, 0] },
  { name: 'footR', parent: 'kneeR', at: [0, -0.24, 0] },
  { name: 'hipL', parent: 'pelvis', at: [0.095, -0.02, 0] },
  { name: 'kneeL', parent: 'hipL', at: [0, -0.3, 0] },
  { name: 'footL', parent: 'kneeL', at: [0, -0.24, 0] },
];

type Outfit = {
  skin: Mat; top: Mat; sleeve: Mat; forearm?: Mat; legs: Mat; boots: Mat;
  hair?: Mat; hood?: 'round' | 'tall'; hoodMat?: Mat; cloak?: Mat;
  skirt?: { mat: Mat; to: number; flare: number }; apron?: Mat; trim?: Mat;
  hat?: 'kettle' | 'top' | 'straw'; hatMat?: Mat; beard?: Mat; bun?: boolean;
  pack?: boolean; hand?: 'sword' | 'spear' | 'hammer' | 'staff'; pauldrons?: Mat;
  /** The back is the most-seen view of the hero: a leather pack, a bedroll, an unlit lantern cage and a hem make it read. */
  packMat?: Mat; lantern?: boolean; cloakTrim?: Mat;
  /** A short shoulder mantle over the cloak, in a contrasting colour: shows the shoulders, so the hero is not a bell. */
  mantle?: Mat;
};

const HEAD = 0.8;
function humanParts(o: Outfit): PartDef[] {
  const P: PartDef[] = [];
  const add = (joint: string, mat: Mat, geo: THREE.BufferGeometry, tag?: 'smear') => P.push({ joint, mat, geo, tag });
  for (const s of ['R', 'L'] as const) {
    const side = s === 'R' ? -1 : 1;
    add(`foot${s}`, o.boots, wedge(0.13, 0.1, 0.11, 0.08, 0.24, [0, -0.04, -0.08]));
    add(`knee${s}`, o.legs, limb(0.066, 0.054, 0.22));
    add(`hip${s}`, o.legs, limb(0.086, 0.07, 0.29));
    add(`shoulder${s}`, o.sleeve, limb(0.075, 0.064, 0.21, [0, 0, 0]));
    add(`elbow${s}`, o.forearm ?? o.sleeve, limb(0.064, 0.054, 0.15));
    add(`hand${s}`, o.skin, blob(0.06, 0.065, 0.06, [0, -0.02, 0]));
    if (o.pauldrons) add(`shoulder${s}`, o.pauldrons, blob(0.11, 0.08, 0.11, [side * 0.02, 0.02, 0]));
  }
  // Torso: hips and chest, flattened front to back.
  add('pelvis', o.legs, lathe([[0, -0.08], [0.15, -0.07], [0.17, 0.02], [0.155, 0.13], [0, 0.14]], { sz: 0.74 }));
  add('spine', o.top, lathe([[0, -0.04], [0.155, -0.03], [0.18, 0.1], [0.2, 0.24], [0.17, 0.33], [0.09, 0.38], [0, 0.39]], { sz: 0.74 }));
  add('pelvis', 'leather', lathe([[0.162, 0.1], [0.165, 0.14]], { sz: 0.76 }));
  if (o.skirt) {
    const { mat, to, flare } = o.skirt;
    add('pelvis', mat, lathe([[flare, -to], [flare * 0.9, -to * 0.7], [(flare + 0.17) / 2, -to * 0.35], [0.168, 0.06], [0.155, 0.14]], { sz: 0.82 }));
    if (o.trim) add('pelvis', o.trim, lathe([[flare * 1.02, -to], [flare * 0.99, -to + 0.05]], { sz: 0.83 }));
  }
  if (o.apron) {
    add('spine', o.apron, lathe([[0.17, -0.04], [0.192, 0.12], [0.2, 0.22]], { open: Math.PI * 1.2, sz: 0.78 }));
    add('pelvis', o.apron, lathe([[0.25, -0.42], [0.22, -0.2], [0.18, 0.02], [0.172, 0.14]], { open: Math.PI * 1.25, sz: 0.85 }));
  }
  if (o.trim && !o.skirt) add('spine', o.trim, lathe([[0.2, 0.22], [0.205, 0.27]], { sz: 0.76 }));
  if (o.trim && o.skirt) {
    // A stole: two bands from the shoulders down the front.
    for (const x of [-0.07, 0.07]) add('spine', o.trim, wedge(0.05, 0.04, 0.05, 0.04, 0.44, [x, 0.36, 0.11], [Math.PI / 2 + 0.08, 0, 0]));
  }
  // Head: a lathed egg, eyes as dark beads on the face.
  add('neck', o.skin, limb(0.07, 0.07, 0.02, [0, 0.06, 0]));
  add('head', o.skin, blob(0.235, 0.215, 0.215, [0, 0.21, 0.01]));
  for (const x of [-0.09, 0.09]) add('head', 'eye', blob(0.04, 0.056, 0.03, [x, 0.17, 0.2], undefined, 6));
  if (o.hair && !o.hood) {
    // The camera looks down on the crown, so hair must cover it and stop at the brow, or every face reads as bald.
    add('head', o.hair, blob(0.255, 0.2, 0.24, [0, 0.3, -0.02]));
    add('head', o.hair, blob(0.23, 0.21, 0.09, [0, 0.19, -0.16]));
  }
  if (o.bun && o.hair) add('head', o.hair, blob(0.1, 0.1, 0.1, [0, 0.36, -0.2]));
  if (o.beard) add('head', o.beard, wedge(0.3, 0.16, 0.14, 0.06, 0.16, [0, 0.07, 0.1], [0.5, 0, 0]));
  if (o.hood) {
    const m = o.hoodMat ?? o.top, tall = o.hood === 'tall';
    const prof: P2[] = [[0.33, -0.1], [0.3, 0.02], [0.29, 0.16], [0.28, 0.3], [0.22, 0.42], [0.12, tall ? 0.56 : 0.5], [0, tall ? 0.7 : 0.54]];
    add('head', m, place(lathe(prof, { open: 1.9, sz: 0.98 }), [0, 0, -0.03], [tall ? -0.22 : -0.12, 0, 0]));
    // A soft point at the back of the hood breaks the round silhouette seen from behind.
    if (!tall) add('head', m, place(cone(0.1, 0.22, [0, 0, 0], undefined, 6), [0, 0.42, -0.25], [-1.1, 0, 0]));
    add('spine', m, lathe([[0.27, 0.22], [0.26, 0.3], [0.2, 0.37], [0.1, 0.4]], { sz: 0.85 }));
  }
  if (o.cloak) add('cloak', o.cloak, lathe([[0.3, -0.7], [0.27, -0.48], [0.24, -0.26], [0.21, -0.06], [0.13, 0.03]], { open: 2.5, sz: 0.78 }));
  if (o.mantle) {
    add('spine', o.mantle, lathe([[0.26, 0.18], [0.27, 0.24], [0.24, 0.31], [0.16, 0.37], [0.09, 0.39]], { sz: 0.86 }));
    add('pelvis', 'leather', lathe([[0.172, 0.08], [0.176, 0.14]], { sz: 0.78 }));
    add('pelvis', 'gold', blob(0.04, 0.035, 0.02, [0, 0.11, 0.135], undefined, 6));
  }
  if (o.cloak && o.cloakTrim) add('cloak', o.cloakTrim, lathe([[0.306, -0.705], [0.3, -0.64]], { open: 2.5, sz: 0.79 }));
  if (o.hat === 'kettle') {
    add('head', o.hatMat!, blob(0.25, 0.19, 0.245, [0, 0.32, -0.01]));
    add('head', o.hatMat!, lathe([[0.28, 0.29], [0.29, 0.32], [0.23, 0.34]], { seg: 12 }));
    add('head', 'red', cone(0.04, 0.14, [0, 0.5, -0.02], undefined, 5));
  } else if (o.hat === 'top') {
    add('head', o.hatMat!, lathe([[0.27, 0.31], [0.27, 0.34], [0.16, 0.35], [0.165, 0.6], [0, 0.61]], { seg: 10 }));
  } else if (o.hat === 'straw') {
    add('head', o.hatMat!, lathe([[0.33, 0.31], [0.32, 0.34], [0.2, 0.38], [0.17, 0.48], [0, 0.5]], { seg: 12 }));
  }
  if (o.pack) {
    const pm = o.packMat ?? 'pack', big = !!o.packMat;
    add('spine', pm, wedge(big ? 0.36 : 0.3, big ? 0.38 : 0.32, big ? 0.31 : 0.26, big ? 0.35 : 0.3, big ? 0.19 : 0.15, [0, 0.16, big ? -0.34 : -0.3]));
    if (big) add('spine', 'wood', wedge(0.38, 0.045, 0.38, 0.045, 0.21, [0, 0.29, -0.34]));
    add('spine', 'wool', place(limb(big ? 0.075 : 0.065, big ? 0.075 : 0.065, big ? 0.4 : 0.3), [big ? -0.2 : -0.15, big ? 0.42 : 0.37, big ? -0.3 : -0.23], [0, 0, Math.PI / 2]));
    if (o.lantern) {
      add('spine', 'steel', blob(0.075, 0.1, 0.075, [0.22, 0.02, -0.46], undefined, 6));
      add('spine', 'eye', blob(0.05, 0.07, 0.05, [0.22, 0.02, -0.5], undefined, 6));
      add('spine', 'steel', cone(0.07, 0.07, [0.22, 0.14, -0.46], undefined, 6));
    }
  }
  if (o.hand === 'sword') {
    const blade: Vec3 = [-0.55, 0, 0];
    add('handR', 'steel', place(wedge(0.045, 0.02, 0.022, 0.014, 0.6, [0, 0, 0.09]), [0, -0.03, 0], [blade[0] - Math.PI / 2, 0, 0]));
    add('handR', 'gold', place(wedge(0.17, 0.035, 0.17, 0.035, 0.04, [0, 0, 0.05]), [0, -0.03, 0], [blade[0] - Math.PI / 2, 0, 0]));
    add('handR', 'leather', place(wedge(0.035, 0.035, 0.035, 0.035, 0.11, [0, 0, -0.05]), [0, -0.03, 0], [blade[0] - Math.PI / 2, 0, 0]));
  } else if (o.hand === 'spear') {
    add('handR', 'wood', place(limb(0.032, 0.03, 1.6), [0, 1.05, 0.03]));
    add('handR', 'steel', cone(0.07, 0.26, [0, 1.05, 0.03], undefined, 4));
    add('handR', 'red', wedge(0.025, 0.16, 0.025, 0.06, 0.16, [0, 0.9, 0.06]));
  } else if (o.hand === 'hammer') {
    add('handR', 'wood', place(limb(0.025, 0.025, 0.36), [0, 0.06, 0.06], [-1.2, 0, 0]));
    add('handR', 'steel', wedge(0.12, 0.12, 0.12, 0.12, 0.2, [0, -0.13, 0.3], [0, Math.PI / 2, 0]));
  } else if (o.hand === 'staff') {
    add('handL', 'wood', place(limb(0.026, 0.024, 1.45), [0, 1.05, 0.03]));
    add('handL', 'wood', place(limb(0.022, 0.022, 0.16), [0, 1.08, 0.03], [0, 0, -1.4]));
    add('handL', 'gold', wedge(0.1, 0.12, 0.1, 0.12, 0.1, [-0.16, 0.92, -0.02]));
    add('handL', 'flame', blob(0.04, 0.05, 0.04, [-0.16, 0.92, 0.05], undefined, 6));
  }
  // The head and everything worn on it shrink together about the neck, so hoods and hats keep their fit.
  for (const p of P) if (p.joint === 'head') p.geo.scale(HEAD, HEAD, HEAD);
  // The strike smear: the blade's path from over the shoulder to the front, drawn on the strike frame only.
  if (o.hand === 'spear') add('spine', 'smear', sweep(0.5, 0.95, -0.2, 0.25, [-0.22, 0.25, 0.1]), 'smear');
  else add('spine', 'smear', sweep(0.4, 0.78, -0.35, 1.9, [-0.22, 0.32, 0.05]), 'smear');
  return P;
}

const outfits: Record<Exclude<FigureId, 'thornboar' | 'gutterRat'>, [string, Outfit]> = {
  hero: ['Wayfarer', { skin: 'skin', top: 'tunicBlue', sleeve: 'tunicBlue', legs: 'trousersBrown', boots: 'leather', hood: 'round', hoodMat: 'cloakBlue', cloak: 'cloakBlue', cloakTrim: 'gold', mantle: 'wool', pack: true, packMat: 'leather', lantern: true, hand: 'sword' }],
  other: ['Traveller', { skin: 'skin', top: 'purple', sleeve: 'purple', legs: 'trousersBrown', boots: 'leather', hair: 'hairBrown', pack: true, hand: 'sword' }],
  robe: ['Shrine keeper', { skin: 'skin', top: 'robe', sleeve: 'robe', legs: 'robe', boots: 'leather', hood: 'tall', hoodMat: 'robe', skirt: { mat: 'robe', to: 0.63, flare: 0.34 }, trim: 'gold', hand: 'staff' }],
  apron: ['Smith', { skin: 'skinDark', top: 'shirt', sleeve: 'shirt', forearm: 'skinDark', legs: 'trousersBrown', boots: 'leather', hair: 'hairBlack', beard: 'hairBlack', apron: 'apronDark', hand: 'hammer' }],
  dress: ['Innkeeper', { skin: 'skin', top: 'red', sleeve: 'linen', legs: 'red', boots: 'leather', hair: 'hairAuburn', bun: true, skirt: { mat: 'red', to: 0.63, flare: 0.37 }, apron: 'linen' }],
  coat: ['Apothecary', { skin: 'skin', top: 'coatGreen', sleeve: 'coatGreen', legs: 'navy', boots: 'leather', hair: 'hairWhite', beard: 'hairWhite', skirt: { mat: 'coatGreen', to: 0.5, flare: 0.28 }, hat: 'top', hatMat: 'hatBlack' }],
  vest: ['Storekeeper', { skin: 'skinDark', top: 'vestOlive', sleeve: 'linen', legs: 'trousersBrown', boots: 'leather', hair: 'hairBrown', hat: 'straw', hatMat: 'straw' }],
  guard: ['Guard', { skin: 'skin', top: 'red', sleeve: 'mail', legs: 'mail', boots: 'leather', hat: 'kettle', hatMat: 'steel', pauldrons: 'steel', hand: 'spear', skirt: { mat: 'mail', to: 0.18, flare: 0.2 } }],
};

const HUMAN_CELL: Cell = { w: 82, h: 74, ax: 41, ay: 21 };

// Thornboar: a dark heavy head and mane in front, a pale snout with tusks, thorns raked back over the hump, a small rump.
// Front and back must differ in value and outline, so its facing reads from any of the 8 directions.
const boarJoints: JointDef[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.42, 0] },
  { name: 'head', parent: 'body', at: [0, -0.07, 0.38] },
  { name: 'legFR', parent: 'body', at: [-0.14, -0.13, 0.19] },
  { name: 'legFL', parent: 'body', at: [0.14, -0.13, 0.19] },
  { name: 'legBR', parent: 'body', at: [-0.12, -0.13, -0.24] },
  { name: 'legBL', parent: 'body', at: [0.12, -0.13, -0.24] },
  { name: 'tail', parent: 'body', at: [0, 0.07, -0.4] },
];
function boarParts(): PartDef[] {
  const P: PartDef[] = [];
  const add = (joint: string, mat: Mat, geo: THREE.BufferGeometry, tag?: 'smear') => P.push({ joint, mat, geo, tag });
  add('body', 'boarHide', place(lathe([[0, -0.42], [0.13, -0.4], [0.21, -0.28], [0.26, -0.1], [0.3, 0.08], [0.29, 0.24], [0.22, 0.34], [0, 0.37]], { sx: 0.95 }), [0, 0, 0], [Math.PI / 2, 0, 0]));
  add('body', 'boarDark', blob(0.24, 0.17, 0.27, [0, 0.14, 0.12]));
  add('head', 'boarDark', place(lathe([[0, -0.12], [0.18, -0.1], [0.21, 0.04], [0.15, 0.22], [0.11, 0.32], [0, 0.33]], { seg: 8, sx: 1.12 }), [0, 0, 0], [Math.PI / 2 + 0.45, 0, 0]));
  add('head', 'boarSnout', blob(0.11, 0.095, 0.05, [0, -0.14, 0.3], [0.45, 0, 0], 8));
  for (const s of [-1, 1]) {
    add('head', 'hoof', blob(0.024, 0.026, 0.012, [s * 0.042, -0.14, 0.35], undefined, 5));
    add('head', 'tusk', cone(0.034, 0.17, [s * 0.1, -0.14, 0.22], [-0.75, 0, s * -0.85], 5));
    add('head', 'boarDark', cone(0.08, 0.19, [s * 0.12, 0.12, -0.06], [-0.35, 0, s * -0.55], 5));
    add('head', 'eye', blob(0.03, 0.034, 0.02, [s * 0.13, 0.0, 0.1], undefined, 5));
  }
  // Thorns: tall spikes over the hump, raked back, breaking the outline.
  const ridge = [[0.26, 0.2], [0.15, 0.3], [0.03, 0.29], [-0.09, 0.23], [-0.2, 0.15]] as const;
  for (const [z, h] of ridge) add('body', 'thorn', cone(0.07, h, [0, 0.28 - Math.abs(z - 0.1) * 0.2, z], [-0.5, 0, 0], 5));
  for (const leg of ['legFR', 'legFL', 'legBR', 'legBL']) {
    add(leg, 'boarDark', limb(0.085, 0.055, 0.25));
    add(leg, 'hoof', blob(0.055, 0.045, 0.065, [0, -0.28, 0.01], undefined, 6));
  }
  add('tail', 'boarHide', place(limb(0.028, 0.018, 0.14), [0, 0, 0], [-2.3, 0, 0]));
  add('tail', 'boarDark', blob(0.045, 0.06, 0.045, [0, 0.1, -0.12], undefined, 5));
  add('head', 'smear', sweep(0.3, 0.58, -0.5, 1.2, [0, 0.0, 0.05]), 'smear');
  return P;
}

// Gutter rat: a low grey teardrop, a pointed wedge snout, pink ears and a long curling tail.
const ratJoints: JointDef[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.14, 0] },
  { name: 'head', parent: 'body', at: [0, 0.03, 0.15] },
  { name: 'legFR', parent: 'body', at: [-0.07, -0.06, 0.09] },
  { name: 'legFL', parent: 'body', at: [0.07, -0.06, 0.09] },
  { name: 'legBR', parent: 'body', at: [-0.07, -0.06, -0.1] },
  { name: 'legBL', parent: 'body', at: [0.07, -0.06, -0.1] },
  { name: 'tail1', parent: 'body', at: [0, -0.02, -0.17] },
  { name: 'tail2', parent: 'tail1', at: [0, 0, -0.12] },
  { name: 'tail3', parent: 'tail2', at: [0, 0, -0.11] },
];
function ratParts(): PartDef[] {
  const P: PartDef[] = [];
  const add = (joint: string, mat: Mat, geo: THREE.BufferGeometry, tag?: 'smear') => P.push({ joint, mat, geo, tag });
  add('body', 'ratFur', place(lathe([[0, -0.2], [0.09, -0.17], [0.12, -0.06], [0.115, 0.06], [0.085, 0.14], [0, 0.17]], { seg: 8, sx: 0.92 }), [0, 0, 0], [Math.PI / 2, 0, 0]));
  add('head', 'ratFur', place(lathe([[0, -0.02], [0.08, 0], [0.07, 0.06], [0.035, 0.15], [0, 0.17]], { seg: 8 }), [0, 0, 0], [Math.PI / 2 + 0.15, 0, 0]));
  add('head', 'ratPink', blob(0.022, 0.02, 0.02, [0, -0.025, 0.17], undefined, 5));
  for (const s of [-1, 1]) {
    add('head', 'ratPink', blob(0.045, 0.05, 0.015, [s * 0.06, 0.075, 0.0], [0, s * 0.5, 0], 6));
    add('head', 'eye', blob(0.018, 0.02, 0.015, [s * 0.05, 0.035, 0.075], undefined, 5));
  }
  for (const leg of ['legFR', 'legFL', 'legBR', 'legBL']) add(leg, 'ratPink', limb(0.022, 0.018, 0.06));
  const tail = [['tail1', 0.024, 0.02], ['tail2', 0.02, 0.016], ['tail3', 0.016, 0.01]] as const;
  for (const [j, r0, r1] of tail) add(j, 'ratPink', place(limb(r0, r1, 0.12), [0, 0, 0], [-Math.PI / 2, 0, 0]));
  add('head', 'smear', sweep(0.14, 0.3, -0.4, 0.9, [0, 0, 0.04]), 'smear');
  return P;
}

let built: Figure[] | undefined;
export function figures(): Figure[] {
  if (built) return built;
  built = [
    ...Object.entries(outfits).map(([id, [label, o]]) => ({ id: id as FigureId, label, skeleton: 'human' as const, joints: humanJoints, parts: humanParts(o), cell: HUMAN_CELL })),
    { id: 'thornboar', label: 'Thornboar', skeleton: 'boar', joints: boarJoints, parts: boarParts(), cell: { w: 72, h: 54, ax: 36, ay: 15 } },
    { id: 'gutterRat', label: 'Gutter rat', skeleton: 'rat', joints: ratJoints, parts: ratParts(), cell: { w: 40, h: 32, ax: 20, ay: 10 } },
  ];
  return built;
}
