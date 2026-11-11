import * as THREE from 'three';
import { mobKinds, type ItemKind, type MobKind, type Worn } from '../../../../../packages/game/src/model.ts';

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
  /** Boots sit a step darker than any trousers, so feet and legs stay two shapes. */
  boot: ['#06070d', '#1a120c', '#2c1f15', '#3b2819', '#5a3d27'],
  pack: ['#1a120c', '#2c3318', '#434c20', '#5e6a2b', '#7f8b38'],
  steel: ['#0c0f1e', '#2b365d', '#55524f', '#6f6a63', '#aaa395'],
  bright: ['#141a31', '#55524f', '#8c867b', '#c8c0ae', '#fbf4e2'],
  purple: ['#0c0f1e', '#2d2140', '#4a3460', '#74507e', '#a8708e'],
  hairBrown: ['#1a120c', '#2c1f15', '#4d3422', '#6b4a30', '#7b5737'],
  hairBlack: ['#06070d', '#1a120c', '#2c1f15', '#3b2819', '#4d3422'],
  hairWhite: ['#55524f', '#8c867b', '#aaa395', '#c8c0ae', '#ece2c8'],
  hairAuburn: ['#2e130b', '#3f1716', '#5c2410', '#93391a', '#c95a24'],
  hairFlax: ['#3b2819', '#7b5737', '#a07a4e', '#c4a072', '#cdc875'],
  robe: ['#55524f', '#8c867b', '#aaa395', '#d6ccb2', '#ece2c8'],
  gold: ['#5c2410', '#93391a', '#c95a24', '#ec8a35', '#ffb95e'],
  flame: ['#93391a', '#ec8a35', '#ffb95e', '#ffe2a0', '#ffe2a0'],
  ember: ['#2e130b', '#5c2410', '#93391a', '#c95a24', '#ec8a35'],
  shirt: ['#2c1f15', '#3f352b', '#584a39', '#71614a', '#8b795b'],
  apronDark: ['#06070d', '#1a120c', '#2c1f15', '#3b2819', '#4d3422'],
  red: ['#2e130b', '#3f1716', '#6a2621', '#963c30', '#bd6447'],
  felt: ['#2e130b', '#3f1716', '#6a2621', '#963c30', '#bd6447'],
  linen: ['#6f6a63', '#aaa395', '#d6ccb2', '#ece2c8', '#fbf4e2'],
  /** The bedroll: a rust wool blanket (ref-1's accent), so the most-seen view of a traveller is not a white block. */
  wool: ['#2e130b', '#4a2418', '#6c3223', '#8a4a36', '#a8664a'],
  coatGreen: ['#0a120d', '#142218', '#1d3121', '#2b4a2d', '#3e6435'],
  hatBlack: ['#06070d', '#0c0f1e', '#141a31', '#1e2646', '#2b365d'],
  vestOlive: ['#2c3318', '#434c20', '#5e6a2b', '#7f8b38', '#a6ad4c'],
  straw: ['#3b2819', '#7b5737', '#a07a4e', '#c4a072', '#cdc875'],
  /** The quilted tunic: padded ochre cloth, stitched in rows. */
  quilt: ['#2a1d0f', '#5e4424', '#7d5b2e', '#a07636', '#c4923f'],
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
  /** Cave beetle: blue-violet shell after ref-1's stone, a violet glint on the dome, pale lichen. */
  shell: ['#0b1122', '#0f163b', '#1c295c', '#3d499b', '#8591c0'],
  chitin: ['#06070d', '#0b1122', '#16204c', '#243166', '#35427b'],
  lichen: ['#55524f', '#8c867b', '#a6936f', '#c2ae87', '#d6ccb2'],
  /** Mire grub: a pale soft body, dusk bands between segments, a dark capsule head, mire on its back. */
  grub: ['#584a39', '#8b795b', '#a6936f', '#c2ae87', '#ece2c8'],
  grubBand: ['#2d2140', '#4a3460', '#74507e', '#a8708e', '#d39a9c'],
  mire: ['#0a120d', '#2c3318', '#434c20', '#5e6a2b', '#7f8b38'],
  capsule: ['#06070d', '#1a120c', '#2c1f15', '#4d3422', '#7b5737'],
  /** Barrow troll: lichen-grey hide, mossy shoulders. */
  trollHide: ['#191725', '#3e3d3f', '#55524f', '#736574', '#927e85'],
  moss: ['#0a120d', '#18291c', '#2b4a2d', '#4a7139', '#678d43'],
  /** Metal tiers for worn and held gear, rough to fine: pitted iron, iron, blued steel, bronze, silver. */
  rust: ['#1a120c', '#3b2819', '#5a3d27', '#6f6a63', '#8c867b'],
  iron: ['#0c0f1e', '#3e3d3f', '#55524f', '#6f6a63', '#8c867b'],
  blued: ['#06070d', '#141a31', '#2b365d', '#3e4c81', '#616ca1'],
  bronze: ['#2e130b', '#43301a', '#7d5b2e', '#a07636', '#c4923f'],
  silver: ['#191725', '#3c2e3e', '#736574', '#a7b4cb', '#d2d3d3'],
  oak: ['#2c1f15', '#4d3422', '#7b5737', '#a07a4e', '#c4a072'],
} as const satisfies Record<string, Ramp>;
export type Mat = keyof typeof materials;
/** Self-lit share per material: the smear and a lantern flame read even at night. */
export const glow: Partial<Record<Mat, number>> = { smear: 0.85, flame: 1, ember: 0.6 };
/**
 * Surface grain: how a material breaks into clusters of its ramp, fixed to the body so it never boils between frames.
 * Kind 0 none, 1 cloth (soft blotches), 2 mail (pixel speckle), 3 fur (fine mottle), 4 grain (streaks along the part), 5 plates.
 */
export const grain: Partial<Record<Mat, [kind: number, amount: number]>> = {
  cloakBlue: [1, 0.3], tunicBlue: [1, 0.26], navy: [1, 0.24], purple: [1, 0.28], robe: [1, 0.24], red: [1, 0.3], linen: [1, 0.2], wool: [1, 0.3],
  coatGreen: [1, 0.3], vestOlive: [1, 0.28], shirt: [1, 0.26], trousersBrown: [1, 0.24], pack: [1, 0.3], apronDark: [1, 0.24], felt: [1, 0.24],
  quilt: [4, 0.4], mail: [2, 0.55], steel: [2, 0.3], leather: [4, 0.26], wood: [4, 0.32], straw: [4, 0.36], hatBlack: [1, 0.2],
  hairBrown: [4, 0.3], hairBlack: [4, 0.26], hairWhite: [4, 0.3], hairAuburn: [4, 0.34], hairFlax: [4, 0.34],
  boarHide: [3, 0.42], boarDark: [3, 0.36], boarSnout: [3, 0.15], thorn: [4, 0.2], ratFur: [3, 0.4], gold: [2, 0.25], skin: [3, 0.08], skinDark: [3, 0.08],
  shell: [5, 0.2], chitin: [5, 0.15], lichen: [3, 0.3], grub: [3, 0.22], grubBand: [1, 0.2], mire: [3, 0.45], capsule: [5, 0.2],
  trollHide: [3, 0.4], moss: [3, 0.5],
  rust: [2, 0.5], iron: [2, 0.25], blued: [2, 0.2], bronze: [5, 0.25], silver: [2, 0.15], oak: [4, 0.32],
};

export type Vec3 = readonly [number, number, number];
export type JointDef = { name: string; parent?: string; at: Vec3 };
/** `smear` parts exist only on strike frames. */
export type PartDef = { joint: string; geo: THREE.BufferGeometry; mat: Mat; tag?: 'smear' };
export type Skeleton = 'human' | 'boar' | 'rat' | 'beetle' | 'grub';
/**
 * A bakeable figure. `scale` multiplies the whole model; cells, shadows, labels and hit areas follow from the baked
 * bounds. `hold` fixes joint rotations in every frame but hurt and die: a raised torch, a shield carried in front.
 * `stance` adds to every frame: a troll's hunch.
 */
export type Figure = { id: string; label: string; skeleton: Skeleton; joints: JointDef[]; parts: PartDef[]; scale: number; hold?: Record<string, Vec3>; stance?: Record<string, Vec3> };

// Primitives. All return geometry in the joint's space; `place` moves and turns it there.
const SEG = 10;
type P2 = readonly [number, number];
/** `open` leaves a gap of that angle centred on +z; `arc` instead sweeps only [start, start + length]. */
function lathe(profile: P2[], opts: { seg?: number; open?: number; arc?: [number, number]; sx?: number; sz?: number } = {}) {
  const open = opts.open ?? 0, [a0, len] = opts.arc ?? [open / 2, Math.PI * 2 - open];
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), opts.seg ?? SEG, a0, len);
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
type Add = (joint: string, mat: Mat, geo: THREE.BufferGeometry, tag?: 'smear') => void;
function parts(build: (add: Add) => void) { const P: PartDef[] = []; build((joint, mat, geo, tag) => P.push({ joint, mat, geo, tag })); return P; }

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

/**
 * Held in the right hand. Each model hangs along −y from the grip (down the forearm) and is turned forward by GRIP, so
 * it points forward and down at rest, over the shoulder at the wind-up and along the arm at the strike. `reach` sizes the smear.
 */
type Weapon = { reach: number; build: (add: Add) => void };
const GRIP: Vec3 = [0.7, 0, -0.35];
const grip = (g: THREE.BufferGeometry) => place(g, [0, -0.04, 0], GRIP);
/** Materials of a held piece: blade or head, guard and fittings, the wrap in the hand, the haft. Tiers differ by these. */
type Fit = { metal: Mat; trim: Mat; grip: Mat; wood: Mat };
const fit = (metal: Mat, trim: Mat, gripMat: Mat = 'leather', wood: Mat = 'wood'): Fit => ({ metal, trim, grip: gripMat, wood });
/** A straight blade: `len` from the guard, `w` wide at the guard, a crossguard `guard` wide. Daggers are short swords. */
const sword = (len: number, w: number, guard: number, m: Fit): Weapon => ({ reach: Math.max(0.3, len + 0.06), build: add => {
  add('handR', m.metal, grip(wedge(w, 0.022, w * 0.42, 0.012, len, [0, -0.05, 0], [Math.PI / 2, 0, 0])));
  add('handR', m.trim, grip(wedge(guard, 0.04, guard, 0.04, 0.04, [0, -0.02, 0], [Math.PI / 2, 0, 0])));
  add('handR', m.grip, grip(limb(0.028, 0.028, 0.1, [0, 0.08, 0])));
  add('handR', m.trim, grip(blob(0.035, 0.035, 0.035, [0, 0.1, 0], undefined, 6)));
} });
/** A haft with an axe head: `head` its depth from the haft, `drop` how far the beard runs down, `double` two bits. */
const axe = (head: number, drop: number, m: Fit, double = false): Weapon => ({ reach: 0.46 + head * 0.4, build: add => {
  add('handR', m.wood, grip(limb(0.026, 0.024, 0.48, [0, 0.06, 0])));
  for (const side of double ? [1, -1] : [1]) add('handR', m.metal, grip(wedge(0.035, 0.1 + drop * 0.5, 0.018, 0.2 + drop, head, [0, -0.34 + drop * 0.3, side > 0 ? 0.02 : -0.02], side > 0 ? [0, 0, 0] : [0, Math.PI, 0])));
  if (!double) add('handR', m.metal, grip(wedge(0.05, 0.08, 0.05, 0.08, 0.07, [0, -0.33, -0.07])));
  add('handR', m.trim, grip(limb(0.034, 0.034, 0.05, [0, -0.3, 0])));
} });
/** A mace: haft, grip, a round head; flanged heads carry blades round it. */
const mace = (r: number, flanges: number, m: Fit): Weapon => ({ reach: 0.48, build: add => {
  add('handR', m.wood, grip(limb(0.026, 0.026, 0.4, [0, 0.06, 0])));
  add('handR', m.grip, grip(limb(0.032, 0.032, 0.1, [0, 0.06, 0])));
  add('handR', m.metal, grip(blob(r, r, r, [0, -0.36, 0], undefined, 7)));
  for (let k = 0; k < flanges; k++) { const a = (k / flanges) * Math.PI * 2; add('handR', m.metal, grip(wedge(0.02, 0.11, 0.02, 0.07, r + 0.04, [0, -0.36, 0], [0, a, 0]))); }
} });
/** A two-handed hammer: a long haft and a block head across it. */
const maul = (m: Fit): Weapon => ({ reach: 0.62, build: add => {
  add('handR', m.wood, grip(limb(0.028, 0.026, 0.56, [0, 0.08, 0])));
  add('handR', m.grip, grip(limb(0.034, 0.034, 0.12, [0, 0.08, 0])));
  add('handR', m.metal, grip(wedge(0.13, 0.13, 0.13, 0.13, 0.3, [0, -0.5, -0.15])));
  for (const z of [-0.14, 0.13]) add('handR', m.trim, grip(wedge(0.14, 0.14, 0.14, 0.14, 0.025, [0, -0.5, z])));
} });
/** A spear held upright; lugs below a boar spear's head, an axe blade on a halberd. */
const spear = (head: number, m: Fit, o: { lugs?: boolean; blade?: boolean; pennant?: Mat } = {}): Weapon => ({ reach: 0.95, build: add => {
  add('handR', m.wood, place(limb(0.032, 0.03, 1.6), [0, 1.05, 0.03]));
  add('handR', m.metal, cone(0.07, head, [0, 1.05, 0.03], undefined, 4));
  if (o.lugs) add('handR', m.trim, wedge(0.22, 0.03, 0.22, 0.03, 0.03, [0, 1.02, 0.02]));
  if (o.blade) { add('handR', m.metal, wedge(0.02, 0.2, 0.02, 0.12, 0.22, [0, 0.95, 0.04])); add('handR', m.metal, cone(0.03, 0.12, [0, 0.95, -0.03], [-Math.PI / 2, 0, 0], 4)); }
  if (o.pennant) add('handR', o.pennant, wedge(0.025, 0.16, 0.025, 0.06, 0.16, [0, 0.9, 0.06]));
} });
const weapons = {
  cudgel: { reach: 0.4, build: add => {
    add('handR', 'wood', grip(limb(0.028, 0.062, 0.36, [0, 0.05, 0])));
    add('handR', 'wood', grip(blob(0.07, 0.075, 0.07, [0, -0.33, 0], undefined, 7)));
    add('handR', 'leather', grip(limb(0.034, 0.034, 0.06, [0, 0.05, 0])));
  } },
  club: { reach: 0.48, build: add => {
    add('handR', 'wood', grip(limb(0.032, 0.085, 0.44, [0, 0.05, 0])));
    for (const [y, a] of [[-0.3, 0.4], [-0.38, 2.6], [-0.2, 4.4]] as const) add('handR', 'iron', grip(blob(0.03, 0.03, 0.03, [Math.sin(a) * 0.075, y, Math.cos(a) * 0.075], undefined, 5)));
    add('handR', 'straw', grip(limb(0.036, 0.036, 0.07, [0, 0.05, 0])));
  } },
  mace: mace(0.085, 0, fit('iron', 'iron')),
  flangedmace: mace(0.07, 6, fit('bright', 'steel', 'red')),
  maul: maul(fit('bright', 'gold', 'purple', 'oak')),
  rustsword: sword(0.44, 0.07, 0.15, fit('rust', 'rust')),
  shortsword: sword(0.42, 0.07, 0.17, fit('bright', 'steel')),
  broadsword: sword(0.52, 0.095, 0.2, fit('bright', 'steel', 'red')),
  blade: sword(0.66, 0.085, 0.26, fit('bright', 'gold')),
  longsword: sword(0.72, 0.09, 0.28, fit('bright', 'gold', 'purple')),
  dawnblade: sword(0.76, 0.11, 0.3, fit('silver', 'gold', 'cloakBlue')),
  knife: sword(0.2, 0.05, 0.06, fit('iron', 'wood', 'wood')),
  dagger: sword(0.26, 0.06, 0.13, fit('iron', 'iron')),
  dirk: sword(0.3, 0.065, 0.14, fit('bright', 'bronze', 'red')),
  hatchet: axe(0.17, 0, fit('bright', 'steel')),
  beardedaxe: axe(0.2, 0.12, fit('bright', 'steel', 'red')),
  broadaxe: axe(0.28, 0.08, fit('blued', 'bronze', 'leather', 'hairBlack')),
  greataxe: axe(0.22, 0.06, fit('bright', 'gold', 'purple', 'oak'), true),
  spear: spear(0.26, fit('steel', 'steel', 'leather', 'wood'), { pennant: 'red' }),
  boarspear: spear(0.3, fit('bright', 'steel'), { lugs: true }),
  halberd: spear(0.24, fit('blued', 'bronze', 'leather', 'hairBlack'), { blade: true }),
  hammer: { reach: 0.5, build: add => {
    add('handR', 'wood', place(limb(0.025, 0.025, 0.36), [0, 0.06, 0.06], [-1.2, 0, 0]));
    add('handR', 'steel', wedge(0.12, 0.12, 0.12, 0.12, 0.2, [0, -0.13, 0.3], [0, Math.PI / 2, 0]));
  } },
  trollclub: { reach: 1.0, build: add => {
    add('handR', 'wood', grip(limb(0.05, 0.13, 0.75, [0, 0.06, 0])));
    for (const [y, a] of [[-0.45, 0], [-0.62, 2.1], [-0.3, 4.2]] as const) add('handR', 'wood', grip(cone(0.05, 0.12, [Math.sin(a) * 0.09, y, Math.cos(a) * 0.09], [Math.cos(a) * 1.4, 0, -Math.sin(a) * 1.4], 4)));
    add('handR', 'moss', grip(blob(0.1, 0.06, 0.1, [0, -0.7, 0], undefined, 6)));
  } },
} satisfies Record<string, Weapon>;
type Held = keyof typeof weapons;

/** Carried in the left hand, with the arm held for it in every frame but hurt and die. */
type OffHand = { hold: Record<string, Vec3>; build: (add: Add) => void };
const shieldHold = { shoulderL: [-0.6, 0, 0.22], elbowL: [-0.95, 0.4, 0] } satisfies Record<string, Vec3>;
/** A shield is built face up (+y) and turned to face down the forearm, tilted out so it shows from the side too. */
const strap = (g: THREE.BufferGeometry) => place(g, [0, -0.05, 0], [Math.PI, 0, -0.4]);
const offHands = {
  buckler: { hold: shieldHold, build: add => {
    add('handL', 'wood', strap(lathe([[0.15, 0], [0.155, 0.02], [0.13, 0.04], [0, 0.045]], { seg: 12 })));
    add('handL', 'steel', strap(lathe([[0.158, 0], [0.162, 0.03]], { seg: 12 })));
    add('handL', 'steel', strap(blob(0.05, 0.035, 0.05, [0, 0.045, 0], undefined, 7)));
  } },
  banded: { hold: shieldHold, build: add => {
    add('handL', 'red', strap(lathe([[0.25, 0], [0.25, 0.025], [0.2, 0.06], [0, 0.08]], { seg: 14 })));
    for (const z of [-0.1, 0.1]) add('handL', 'steel', strap(wedge(0.46, 0.025, 0.46, 0.025, 0.05, [0, 0.065, z - 0.025])));
    add('handL', 'steel', strap(lathe([[0.258, 0], [0.262, 0.04]], { seg: 14 })));
    add('handL', 'gold', strap(blob(0.055, 0.04, 0.055, [0, 0.08, 0], undefined, 7)));
  } },
  lid: { hold: shieldHold, build: add => {
    add('handL', 'oak', strap(lathe([[0.16, 0], [0.165, 0.02], [0, 0.03]], { seg: 10 })));
    add('handL', 'rust', strap(wedge(0.34, 0.02, 0.34, 0.02, 0.05, [0, 0.03, -0.025])));
  } },
  heater: { hold: shieldHold, build: add => {
    add('handL', 'tunicBlue', strap(lathe([[0.21, 0], [0.21, 0.025], [0.17, 0.05], [0, 0.06]], { seg: 12, sz: 1.25 })));
    add('handL', 'iron', strap(lathe([[0.218, 0], [0.222, 0.035]], { seg: 12, sz: 1.25 })));
    add('handL', 'linen', strap(wedge(0.04, 0.02, 0.04, 0.02, 0.48, [0, 0.055, -0.24])));
  } },
  kite: { hold: shieldHold, build: add => {
    add('handL', 'pack', strap(lathe([[0.22, 0], [0.22, 0.025], [0.18, 0.05], [0, 0.065]], { seg: 12, sz: 1.55 })));
    add('handL', 'bright', strap(lathe([[0.228, 0], [0.232, 0.035]], { seg: 12, sz: 1.55 })));
    add('handL', 'gold', strap(blob(0.05, 0.035, 0.07, [0, 0.065, -0.05], undefined, 7)));
  } },
  tower: { hold: shieldHold, build: add => {
    add('handL', 'wood', strap(wedge(0.44, 0.05, 0.44, 0.05, 0.72, [0, 0.03, -0.36])));
    for (const z of [-0.2, 0.18]) add('handL', 'iron', strap(wedge(0.46, 0.06, 0.46, 0.06, 0.05, [0, 0.04, z])));
  } },
  sunshield: { hold: shieldHold, build: add => {
    add('handL', 'red', strap(lathe([[0.26, 0], [0.26, 0.025], [0.2, 0.06], [0, 0.08]], { seg: 16 })));
    add('handL', 'gold', strap(lathe([[0.268, 0], [0.272, 0.045]], { seg: 16 })));
    for (let k = 0; k < 8; k++) add('handL', 'gold', strap(wedge(0.03, 0.012, 0.008, 0.008, 0.2, [0, 0.07, 0], [0, (k / 8) * Math.PI * 2, 0])));
    add('handL', 'gold', strap(blob(0.07, 0.05, 0.07, [0, 0.08, 0], undefined, 8)));
  } },
  torch: { hold: { shoulderL: [-2.35, 0, 0.18], elbowL: [-0.55, 0, 0] }, build: add => {
    add('handL', 'wood', place(limb(0.03, 0.026, 0.3), [0, 0.06, 0]));
    add('handL', 'leather', place(limb(0.042, 0.042, 0.06), [0, -0.2, 0]));
    add('handL', 'ember', blob(0.065, 0.05, 0.065, [0, -0.28, 0], undefined, 7));
    add('handL', 'flame', place(cone(0.1, 0.32, [0, 0, 0], undefined, 7), [0, -0.27, 0], [Math.PI, 0, 0]));
    add('handL', 'flame', blob(0.07, 0.1, 0.07, [0.02, -0.38, 0.01], undefined, 6));
    add('handL', 'flame', place(cone(0.04, 0.12, [0, 0, 0], undefined, 5), [-0.04, -0.5, 0], [Math.PI - 0.4, 0, 0]));
  } },
  staff: { hold: {}, build: add => {
    add('handL', 'wood', place(limb(0.026, 0.024, 1.45), [0, 1.05, 0.03]));
    add('handL', 'wood', place(limb(0.022, 0.022, 0.16), [0, 1.08, 0.03], [0, 0, -1.4]));
    add('handL', 'gold', wedge(0.1, 0.12, 0.1, 0.12, 0.1, [-0.16, 0.92, -0.02]));
    add('handL', 'flame', blob(0.04, 0.05, 0.04, [-0.16, 0.92, 0.05], undefined, 6));
  } },
} satisfies Record<string, OffHand>;
type Off = keyof typeof offHands;

type Outfit = {
  skin: Mat; top: Mat; sleeve: Mat; forearm?: Mat; legs: Mat; boots: Mat;
  /** Boots to below the knee; without them the feet are wrapped and the shin bare. */
  tall?: boolean;
  hair?: Mat; hood?: 'round' | 'tall'; hoodMat?: Mat; cloak?: Mat;
  skirt?: { mat: Mat; to: number; flare: number }; apron?: Mat; trim?: Mat; studs?: Mat;
  hat?: 'kettle' | 'top' | 'straw' | 'cap' | 'coif' | 'visor' | 'greathelm'; hatMat?: Mat; beard?: Mat; bun?: boolean;
  pack?: boolean; hand?: Held; off?: Off; pauldrons?: Mat;
  /** A small leather bag on the hip instead of a pack on the back. */
  satchel?: boolean;
  /** The back is the most-seen view: a leather pack, a bedroll, an unlit lantern cage and a hem make it read. */
  packMat?: Mat; lantern?: boolean; cloakTrim?: Mat;
  /** A short shoulder mantle over the cloak, in a contrasting colour: shows the shoulders, so the figure is not a bell. */
  mantle?: Mat;
  /** A troll's extras: tusks, a heavy brow, a moss mane. */
  brute?: Mat;
};

const HEAD = 0.8;
function humanParts(o: Outfit): PartDef[] {
  const P = parts(add => {
    for (const s of ['R', 'L'] as const) {
      const side = s === 'R' ? -1 : 1;
      add(`foot${s}`, o.boots, wedge(0.13, 0.1, 0.11, 0.08, 0.24, [0, -0.04, -0.08]));
      if (o.tall) {
        add(`knee${s}`, o.boots, limb(0.074, 0.066, 0.17, [0, -0.06, 0]));
        add(`knee${s}`, o.boots, lathe([[0.084, -0.02], [0.088, 0.02], [0.08, 0.04]], { seg: 8 }));
      }
      add(`knee${s}`, o.legs, limb(0.066, 0.054, 0.22));
      add(`hip${s}`, o.legs, limb(0.086, 0.07, 0.29));
      add(`shoulder${s}`, o.sleeve, limb(0.075, 0.064, 0.21, [0, 0, 0]));
      add(`elbow${s}`, o.forearm ?? o.sleeve, limb(0.064, 0.054, 0.15));
      add(`hand${s}`, o.skin, blob(0.06, 0.065, 0.06, [0, -0.02, 0]));
      if (o.pauldrons) add(`shoulder${s}`, o.pauldrons, blob(0.11, 0.08, 0.11, [side * 0.02, 0.02, 0]));
      if (o.brute) {
        add(`shoulder${s}`, o.skin, blob(0.13, 0.11, 0.13, [side * 0.03, 0.0, 0]));
        add(`hand${s}`, o.skin, blob(0.085, 0.08, 0.085, [0, -0.04, 0]));
        add(`elbow${s}`, o.skin, limb(0.08, 0.07, 0.15));
      }
    }
    // Torso: hips and chest, flattened front to back.
    add('pelvis', o.legs, lathe([[0, -0.08], [0.15, -0.07], [0.17, 0.02], [0.155, 0.13], [0, 0.14]], { sz: 0.74 }));
    add('spine', o.top, lathe([[0, -0.04], [0.155, -0.03], [0.18, 0.1], [0.2, 0.24], [0.17, 0.33], [0.09, 0.38], [0, 0.39]], { sz: 0.74 }));
    add('pelvis', 'leather', lathe([[0.162, 0.1], [0.165, 0.14]], { sz: 0.76 }));
    if (o.studs) {
      // Rows of rivets on the jerkin, front and back, and leather tassets over the hips.
      for (const y of [0.06, 0.15, 0.24]) for (const x of [-0.11, -0.04, 0.04, 0.11]) for (const z of [1, -1]) add('spine', o.studs, blob(0.022, 0.022, 0.012, [x, y, z * (0.142 - Math.abs(x) * 0.2)], undefined, 5));
      for (const a of [-0.5, 0.5, Math.PI - 0.5, Math.PI + 0.5]) add('pelvis', o.top, place(wedge(0.12, 0.02, 0.11, 0.02, 0.2, [0, 0, 0]), [Math.sin(a) * 0.16, 0.12, Math.cos(a) * 0.12], [Math.PI / 2 + 0.2, a, 0]));
    }
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
    if (o.hair && (!o.hood || o.hat) && o.hat !== 'coif' && o.hat !== 'visor' && o.hat !== 'greathelm') {
      // The camera looks down on the crown, so hair must cover it and stop at the brow, or every face reads as bald.
      add('head', o.hair, blob(0.255, 0.2, 0.24, [0, 0.3, -0.02]));
      add('head', o.hair, blob(0.23, 0.21, 0.09, [0, 0.19, -0.16]));
    }
    if (o.bun && o.hair) add('head', o.hair, blob(0.1, 0.1, 0.1, [0, 0.36, -0.2]));
    if (o.beard) add('head', o.beard, wedge(0.3, 0.16, 0.14, 0.06, 0.16, [0, 0.07, 0.1], [0.5, 0, 0]));
    if (o.brute) {
      // Moss grows down the back of the head and over the shoulders like a mane.
      add('spine', o.brute, lathe([[0.3, 0.14], [0.3, 0.24], [0.25, 0.33], [0.14, 0.4], [0, 0.42]], { arc: [Math.PI / 2, Math.PI], sz: 0.9 }));
      add('head', o.brute, blob(0.25, 0.14, 0.22, [0, 0.3, -0.08]));
      add('head', o.skin, wedge(0.4, 0.06, 0.36, 0.05, 0.12, [0, 0.25, 0.1]));
      for (const x of [-0.1, 0.1]) add('head', 'tusk', cone(0.035, 0.12, [x, 0.06, 0.17], [0.3, 0, -x * 2], 5));
    }
    if (o.hood && !o.hat) {
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
      // With a hat on, the hood lies down on the back as a folded collar.
      if (o.hood && o.hat) add('spine', o.hoodMat ?? o.mantle, blob(0.17, 0.1, 0.1, [0, 0.36, -0.15], [-0.5, 0, 0], 8));
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
    } else if (o.hat === 'cap') {
      // A felt cap: a low crown above the brow, a turned-up band, and a soft point flopping back over the crown.
      add('head', o.hatMat!, blob(0.25, 0.13, 0.245, [0, 0.36, -0.02]));
      add('head', 'leather', lathe([[0.258, 0.28], [0.266, 0.32], [0.25, 0.34]], { seg: 12 }));
      add('head', o.hatMat!, place(cone(0.11, 0.26, [0, 0, 0], undefined, 6), [0, 0.44, -0.12], [-1.75, 0, 0]));
    } else if (o.hat === 'coif') {
      // A mail coif: hood and collar of rings over the shoulders, the face left open.
      add('head', o.hatMat!, place(lathe([[0.29, -0.06], [0.28, 0.04], [0.27, 0.16], [0.26, 0.3], [0.2, 0.4], [0.1, 0.45], [0, 0.46]], { open: 2.3, sz: 1 }), [0, 0, -0.015], [-0.12, 0, 0]));
      add('head', 'steel', lathe([[0.272, 0.29], [0.276, 0.33], [0.262, 0.35]], { seg: 12 }));
      add('spine', o.hatMat!, lathe([[0.25, 0.24], [0.255, 0.3], [0.2, 0.36], [0.1, 0.4]], { sz: 0.86 }));
    }
    if (o.hat === 'visor' || o.hat === 'greathelm') {
      // Closed helms: a visored barbute with a T slit, or a flat-topped great helm with a gilded band and a crest.
      const great = o.hat === 'greathelm';
      add('head', o.hatMat!, lathe(great ? [[0.27, -0.04], [0.275, 0.2], [0.27, 0.42], [0.2, 0.47], [0, 0.48]] : [[0.27, -0.06], [0.27, 0.12], [0.265, 0.3], [0.21, 0.42], [0.1, 0.47], [0, 0.48]], { seg: 12 }));
      add('head', 'eye', wedge(0.3, 0.035, 0.3, 0.035, 0.05, [0, 0.2, 0.24]));
      if (!great) add('head', 'eye', wedge(0.05, 0.16, 0.05, 0.16, 0.05, [0, 0.1, 0.24]));
      if (great) { add('head', 'steel', lathe([[0.282, 0.28], [0.286, 0.33]], { seg: 12 })); add('head', 'red', wedge(0.05, 0.12, 0.05, 0.06, 0.4, [0, 0.52, -0.2])); }
    }
    if (o.satchel) {
      add('pelvis', 'leather', wedge(0.08, 0.17, 0.07, 0.15, 0.2, [-0.2, 0.0, -0.1]));
      add('spine', 'leather', place(limb(0.018, 0.018, 0.52), [-0.13, 0.36, 0.02], [0, 0, -0.62]));
    }
    if (o.pack) {
      const pm = o.packMat ?? 'pack', big = !!o.packMat;
      add('spine', pm, wedge(big ? 0.36 : 0.32, big ? 0.38 : 0.34, big ? 0.31 : 0.28, big ? 0.35 : 0.31, big ? 0.19 : 0.16, [0, 0.16, big ? -0.34 : -0.3]));
      if (!big) add('spine', 'leather', wedge(0.33, 0.06, 0.3, 0.05, 0.17, [0, 0.27, -0.305]));
      if (big) add('spine', 'wood', wedge(0.38, 0.045, 0.38, 0.045, 0.21, [0, 0.29, -0.34]));
      add('spine', 'wool', place(limb(big ? 0.075 : 0.07, big ? 0.075 : 0.07, big ? 0.4 : 0.32), [big ? -0.2 : -0.16, big ? 0.42 : 0.4, big ? -0.3 : -0.24], [0, 0, Math.PI / 2]));
      if (o.lantern) {
        add('spine', 'steel', blob(0.075, 0.1, 0.075, [0.22, 0.02, -0.46], undefined, 6));
        add('spine', 'eye', blob(0.05, 0.07, 0.05, [0.22, 0.02, -0.5], undefined, 6));
        add('spine', 'steel', cone(0.07, 0.07, [0.22, 0.14, -0.46], undefined, 6));
      }
    }
    if (o.hand) weapons[o.hand].build(add);
    if (o.off) offHands[o.off].build(add);
  });
  // The head and everything worn on it shrink together about the neck, so hoods and hats keep their fit.
  for (const p of P) if (p.joint === 'head') p.geo.scale(HEAD, HEAD, HEAD);
  // The strike smear: the weapon's path from over the shoulder to the front, drawn on the strike frame only.
  const reach = o.hand ? weapons[o.hand].reach : 0.2;
  if (o.hand === 'spear') P.push({ joint: 'spine', mat: 'smear', geo: sweep(0.5, 0.95, -0.2, 0.25, [-0.22, 0.25, 0.1]), tag: 'smear' });
  else P.push({ joint: 'spine', mat: 'smear', geo: sweep(0.18 + reach * 0.5, 0.36 + reach, -0.35, 1.9, [-0.22, 0.32, 0.05]), tag: 'smear' });
  return P;
}
const human = (id: string, label: string, o: Outfit, scale = 1): Figure => ({
  id, label, skeleton: 'human', joints: humanJoints, parts: humanParts(o), scale, hold: o.off ? offHands[o.off].hold : undefined,
});

/** Townsfolk by look (the map's `look`). Silhouette first: each has its own hat, hem or tool. */
const townsfolk: Record<string, [string, Outfit]> = {
  robe: ['Shrine keeper', { skin: 'skin', top: 'robe', sleeve: 'robe', legs: 'robe', boots: 'leather', hood: 'tall', hoodMat: 'robe', skirt: { mat: 'robe', to: 0.63, flare: 0.34 }, trim: 'gold', off: 'staff' }],
  apron: ['Smith', { skin: 'skinDark', top: 'shirt', sleeve: 'shirt', forearm: 'skinDark', legs: 'trousersBrown', boots: 'leather', hair: 'hairBlack', beard: 'hairBlack', apron: 'apronDark', hand: 'hammer' }],
  dress: ['Innkeeper', { skin: 'skin', top: 'red', sleeve: 'linen', legs: 'red', boots: 'leather', hair: 'hairAuburn', bun: true, skirt: { mat: 'red', to: 0.63, flare: 0.37 }, apron: 'linen' }],
  coat: ['Apothecary', { skin: 'skin', top: 'coatGreen', sleeve: 'coatGreen', legs: 'navy', boots: 'leather', hair: 'hairWhite', beard: 'hairWhite', skirt: { mat: 'coatGreen', to: 0.5, flare: 0.28 }, hat: 'top', hatMat: 'hatBlack' }],
  vest: ['Storekeeper', { skin: 'skinDark', top: 'vestOlive', sleeve: 'linen', legs: 'trousersBrown', boots: 'leather', hair: 'hairBrown', hat: 'straw', hatMat: 'straw' }],
  guard: ['Guard', { skin: 'skin', top: 'red', sleeve: 'mail', legs: 'mail', boots: 'leather', tall: true, hat: 'kettle', hatMat: 'steel', pauldrons: 'steel', hand: 'spear', skirt: { mat: 'mail', to: 0.18, flare: 0.2 } }],
};

/** A hero's own colours: the cape over the shoulders, the hair, and whether the hood is up when the head is bare. */
export type Identity = { cape: Mat; hair: Mat; hood: boolean };
export const selfIdentity: Identity = { cape: 'cloakBlue', hair: 'hairBrown', hood: true };
const capes: Mat[] = ['wool', 'coatGreen', 'purple', 'red', 'navy'], hairs: Mat[] = ['hairBrown', 'hairBlack', 'hairAuburn', 'hairFlax'];
/** Another hero's colours, fixed by their id, so two heroes in the same kit still tell apart. */
export function identityOf(id: string): Identity {
  let h = 2166136261; for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  h ^= h >>> 13;
  return { cape: capes[h % capes.length], hair: hairs[(h >>> 4) % hairs.length], hood: false };
}

/** What each worn item does to the outfit. Items that are never worn change nothing. */
const wornLook: Partial<Record<ItemKind, Partial<Outfit>>> = {
  cudgel: { hand: 'cudgel' }, club: { hand: 'club' }, mace: { hand: 'mace' }, flangedmace: { hand: 'flangedmace' }, maul: { hand: 'maul' },
  rustsword: { hand: 'rustsword' }, shortsword: { hand: 'shortsword' }, broadsword: { hand: 'broadsword' }, blade: { hand: 'blade' }, longsword: { hand: 'longsword' }, dawnblade: { hand: 'dawnblade' },
  hatchet: { hand: 'hatchet' }, beardedaxe: { hand: 'beardedaxe' }, broadaxe: { hand: 'broadaxe' }, greataxe: { hand: 'greataxe' },
  knife: { hand: 'knife' }, dagger: { hand: 'dagger' }, dirk: { hand: 'dirk' }, spear: { hand: 'spear' }, boarspear: { hand: 'boarspear' }, halberd: { hand: 'halberd' },
  lid: { off: 'lid' }, buckler: { off: 'buckler' }, heater: { off: 'heater' }, banded: { off: 'banded' }, kite: { off: 'kite' }, tower: { off: 'tower' }, sunshield: { off: 'sunshield' }, torch: { off: 'torch' },
  cap: { hat: 'cap', hatMat: 'felt' }, coif: { hat: 'coif', hatMat: 'mail' }, kettlehat: { hat: 'kettle', hatMat: 'iron' }, visorhelm: { hat: 'visor', hatMat: 'steel' }, gildedhelm: { hat: 'greathelm', hatMat: 'gold' },
  tunic: { top: 'quilt', sleeve: 'quilt', skirt: { mat: 'quilt', to: 0.17, flare: 0.2 } },
  gambeson: { top: 'linen', sleeve: 'linen', skirt: { mat: 'linen', to: 0.26, flare: 0.22 }, trim: 'quilt' },
  jerkin: { top: 'leather', sleeve: 'shirt', forearm: 'leather', studs: 'steel', pauldrons: 'leather' },
  mailshirt: { top: 'mail', sleeve: 'mail', forearm: 'mail', skirt: { mat: 'mail', to: 0.22, flare: 0.21 } },
  scalecoat: { top: 'bronze', sleeve: 'mail', pauldrons: 'bronze', skirt: { mat: 'bronze', to: 0.2, flare: 0.21 } },
  cuirass: { top: 'steel', sleeve: 'mail', forearm: 'steel', pauldrons: 'steel', studs: 'gold' },
  boots: { boots: 'boot', tall: true }, shodboots: { boots: 'apronDark', tall: true }, sabatons: { boots: 'steel', tall: true },
  pack: { pack: true }, rucksack: { pack: true, packMat: 'pack' }, satchel: { satchel: true },
};
/** True if an item changes the hero's figure when worn. */
export const hasWornLook = (kind: ItemKind) => kind in wornLook;
const slotOrder = ['weapon', 'shield', 'head', 'body', 'feet', 'pack'] as const;
export const heroKey = (worn: Worn, who: Identity) => `hero:${who.cape}:${who.hair}:${who.hood ? 1 : 0}:${slotOrder.map(s => worn[s] ?? '').join(',')}`;
/** A hero as they are dressed: bare, a linen shirt and wrapped feet, then each worn item laid over it. */
export function heroFigure(worn: Worn, who: Identity): Figure {
  const o: Outfit = { skin: 'skin', top: 'linen', sleeve: 'linen', legs: 'shirt', boots: 'trousersBrown', hair: who.hair, hood: who.hood ? 'round' : undefined, hoodMat: who.cape, mantle: who.cape };
  for (const s of slotOrder) { const k = worn[s]; if (k) Object.assign(o, wornLook[k]); }
  return human(heroKey(worn, who), 'Hero', o);
}

// Thornboar: a dark heavy head and mane in front, a pale snout with tusks, thorns raked back over the hump, a small rump.
// Front and back must differ in value and outline, so its facing reads from any of the 8 directions.
const boarJoints: JointDef[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.5, 0] },
  { name: 'head', parent: 'body', at: [0, -0.07, 0.38] },
  { name: 'legFR', parent: 'body', at: [-0.15, -0.13, 0.19] },
  { name: 'legFL', parent: 'body', at: [0.15, -0.13, 0.19] },
  { name: 'legBR', parent: 'body', at: [-0.13, -0.13, -0.24] },
  { name: 'legBL', parent: 'body', at: [0.13, -0.13, -0.24] },
  { name: 'tail', parent: 'body', at: [0, 0.07, -0.4] },
];
const boarParts = () => parts(add => {
  add('body', 'boarHide', place(lathe([[0, -0.42], [0.13, -0.4], [0.22, -0.28], [0.28, -0.1], [0.32, 0.08], [0.31, 0.24], [0.23, 0.34], [0, 0.37]], { sx: 1.05 }), [0, 0, 0], [Math.PI / 2, 0, 0]));
  add('body', 'boarDark', blob(0.27, 0.2, 0.29, [0, 0.15, 0.12]));
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
  for (const [z, h] of ridge) add('body', 'thorn', cone(0.07, h, [0, 0.31 - Math.abs(z - 0.1) * 0.2, z], [-0.5, 0, 0], 5));
  for (const leg of ['legFR', 'legFL', 'legBR', 'legBL']) {
    // Legs long enough to show under the barrel from above, so the trot reads and the boar is not a rolling blob.
    add(leg, 'boarDark', limb(0.09, 0.058, 0.33));
    add(leg, 'hoof', blob(0.058, 0.045, 0.068, [0, -0.36, 0.01], undefined, 6));
  }
  add('tail', 'boarHide', place(limb(0.028, 0.018, 0.14), [0, 0, 0], [-2.3, 0, 0]));
  add('tail', 'boarDark', blob(0.045, 0.06, 0.045, [0, 0.1, -0.12], undefined, 5));
  add('head', 'smear', sweep(0.3, 0.58, -0.5, 1.2, [0, 0.0, 0.05]), 'smear');
});

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
const ratParts = () => parts(add => {
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
});

// Cave beetle: a knee-high blue-violet dome split down the back, a plated thorax shield, a low head with hooked
// mandibles and swept antennae, six jointed legs, and pale lichen grown on the shell. The wing cases open to strike.
const beetleLegs = [['F', 0.13, 0.4], ['M', 0, 0], ['B', -0.13, -0.45]] as const;
const beetleJoints: JointDef[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: 'body', parent: 'root', at: [0, 0.16, 0] },
  { name: 'caseR', parent: 'body', at: [-0.01, 0.02, 0.08] },
  { name: 'caseL', parent: 'body', at: [0.01, 0.02, 0.08] },
  { name: 'thorax', parent: 'body', at: [0, 0.02, 0.16] },
  { name: 'head', parent: 'thorax', at: [0, -0.03, 0.14] },
  { name: 'jawR', parent: 'head', at: [-0.05, -0.02, 0.07] },
  { name: 'jawL', parent: 'head', at: [0.05, -0.02, 0.07] },
  ...beetleLegs.flatMap(([n, z]) => (['R', 'L'] as const).flatMap(s => [
    { name: `leg${n}${s}`, parent: 'body', at: [(s === 'R' ? -1 : 1) * 0.15, -0.04, z] as Vec3 },
    { name: `shin${n}${s}`, parent: `leg${n}${s}`, at: [(s === 'R' ? -1 : 1) * 0.13, 0.03, 0] as Vec3 },
  ])),
];
const beetleParts = () => parts(add => {
  add('body', 'chitin', blob(0.2, 0.08, 0.27, [0, -0.01, -0.02]));
  for (const s of [-1, 1]) {
    const c = s < 0 ? 'caseR' : 'caseL';
    // Each wing case is half a dome, hinged at the front of the spine seam.
    // Lathed along z after the turn; the arc keeps one upper quarter, this side's half of the dome.
    add(c, 'shell', place(lathe([[0, -0.33], [0.1, -0.3], [0.2, -0.18], [0.24, -0.02], [0.22, 0.08], [0.12, 0.15], [0, 0.16]], { arc: s < 0 ? [Math.PI, Math.PI / 2] : [Math.PI / 2, Math.PI / 2], seg: 8, sx: 0.95, sz: 0.62 }), [0, 0, -0.14], [Math.PI / 2, 0, 0]));
    // A dark ridge along each case and the seam between them break the dome into plates.
    add(c, 'chitin', place(limb(0.014, 0.014, 0.36), [s * 0.12, 0.125, 0.0], [-Math.PI / 2 + 0.25, 0, -s * 0.5]));
    add(c, 'chitin', place(limb(0.012, 0.012, 0.42), [s * 0.012, 0.15, 0.02], [-Math.PI / 2 + 0.12, 0, 0]));
    add(c, 'lichen', blob(0.05, 0.02, 0.06, [s * 0.09, 0.12, -0.24], [0, 0, s * 0.4], 6));
    add(c, 'lichen', blob(0.035, 0.018, 0.04, [s * 0.17, 0.08, -0.06], [0, 0, s * 0.8], 6));
  }
  add('thorax', 'shell', place(lathe([[0, -0.08], [0.14, -0.06], [0.17, 0.02], [0.13, 0.09], [0, 0.11]], { seg: 10, sx: 1.1, sz: 0.55 }), [0, 0.02, 0], [Math.PI / 2, 0, 0]));
  // A horn swept forward off the thorax shield: the beetle's own outline from every side.
  add('thorax', 'chitin', place(cone(0.05, 0.2, [0, 0, 0], undefined, 5), [0, 0.07, 0.04], [1.05, 0, 0]));
  add('thorax', 'shell', place(lathe([[0.15, -0.075], [0.175, 0.0], [0.16, 0.05]], { seg: 10, sx: 1.1 }), [0, 0.02, 0], [Math.PI / 2, 0, 0]));
  add('head', 'chitin', blob(0.1, 0.07, 0.09, [0, 0, 0.02], undefined, 8));
  for (const s of [-1, 1]) {
    add('head', 'eye', blob(0.03, 0.03, 0.025, [s * 0.075, 0.025, 0.05], undefined, 5));
    add(s < 0 ? 'jawR' : 'jawL', 'capsule', place(cone(0.03, 0.14, [0, 0, 0], undefined, 5), [0, 0, 0], [Math.PI / 2 - 0.15, s * 0.5, 0]));
    // Antennae: thin, swept back over the thorax, clubbed at the tip.
    add('head', 'chitin', place(limb(0.012, 0.01, 0.26), [s * 0.05, 0.05, 0.05], [-0.9, 0, s * 0.5]));
    add('head', 'capsule', blob(0.022, 0.03, 0.022, [s * 0.16, 0.22, -0.11], undefined, 5));
  }
  for (const [n] of beetleLegs) for (const s of ['R', 'L'] as const) {
    const x = s === 'R' ? -1 : 1;
    add(`leg${n}${s}`, 'chitin', place(limb(0.028, 0.022, 0.13), [0, 0, 0], [0, 0, x * (Math.PI / 2 + 0.35)]));
    add(`shin${n}${s}`, 'capsule', place(limb(0.022, 0.012, 0.15), [0, 0, 0], [0, 0, x * 0.35]));
  }
  add('head', 'smear', sweep(0.16, 0.38, -0.5, 0.9, [0, -0.02, 0.06]), 'smear');
});

// Mire grub: a fat, low, segmented larva longer than a man is wide. Pale rings with dusk-coloured folds between them,
// mire caked along its back, a dark capsule head with pincers and three pairs of stub legs behind it.
const GRUB = 6;
// The chain grows from the tail forward, so bending a middle segment rears the front half and leaves the tail down.
const grubJoints: JointDef[] = [
  { name: 'root', at: [0, 0, 0] },
  { name: `seg${GRUB - 1}`, parent: 'root', at: [0, 0.2, -0.45] },
  ...Array.from({ length: GRUB - 1 }, (_, k) => { const i = GRUB - 2 - k; return { name: `seg${i}`, parent: `seg${i + 1}`, at: [0, 0, 0.15] as Vec3 }; }),
  { name: 'head', parent: 'seg0', at: [0, -0.04, 0.15] },
];
const grubParts = () => parts(add => {
  for (let i = 0; i < GRUB; i++) {
    const r = 0.235 - Math.abs(i - 1.6) * 0.026, h = r * 0.82, j = `seg${i}`;
    add(j, 'grub', blob(r, h, 0.11, [0, h - 0.2, 0], undefined, 12));
    add(j, 'grubBand', blob(r * 0.94, h * 0.9, 0.04, [0, h - 0.2, -0.085], undefined, 12));
    if (i > 0 && i < GRUB - 1) add(j, 'mire', blob(r * 0.6, 0.06, 0.08, [((i * 37) % 5 - 2) * 0.015, h * 1.85 - 0.2, 0], undefined, 7));
    if (i >= 1 && i <= 3) for (const s of [-1, 1]) add(j, 'grub', place(limb(0.03, 0.022, 0.06), [s * r * 0.8, -0.13, 0.02], [0, 0, s * 0.5]));
  }
  add('seg5', 'grub', place(cone(0.08, 0.14, [0, 0, 0], undefined, 7), [0, -0.12, -0.08], [-Math.PI / 2 - 0.3, 0, 0]));
  add('head', 'capsule', blob(0.12, 0.1, 0.1, [0, 0, 0.02], undefined, 9));
  for (const s of [-1, 1]) {
    add('head', 'gold', place(cone(0.03, 0.12, [0, 0, 0], undefined, 5), [s * 0.05, -0.04, 0.09], [Math.PI / 2, s * 0.6, 0]));
    add('head', 'eye', blob(0.022, 0.022, 0.02, [s * 0.06, 0.04, 0.09], undefined, 5));
  }
  add('head', 'smear', sweep(0.18, 0.42, -0.6, 1.0, [0, 0.0, 0.05]), 'smear');
});

/**
 * Creatures by size and build, one row each. `scale` sets how big the kind is drawn against a person (a person is about
 * 1.55 tiles tall): the rat is ankle-high, the grub low and long, the beetle knee-high, the boar shoulder-high and heavier
 * than a man. `cadence` is walk cycles per step: small things skitter. A new giant is one more row.
 */
type Creature = { label: string; skeleton: Skeleton; joints: JointDef[]; parts: () => PartDef[]; scale: number; cadence: number; stance?: Record<string, Vec3> };
export const creatures = {
  gutterRat: { label: 'Gutter rat', skeleton: 'rat', joints: ratJoints, parts: ratParts, scale: 0.8, cadence: 4 },
  mireGrub: { label: 'Mire grub', skeleton: 'grub', joints: grubJoints, parts: grubParts, scale: 1.1, cadence: 1.5 },
  caveBeetle: { label: 'Cave beetle', skeleton: 'beetle', joints: beetleJoints, parts: beetleParts, scale: 1.15, cadence: 3 },
  thornboar: { label: 'Thornboar', skeleton: 'boar', joints: boarJoints, parts: boarParts, scale: 1.3, cadence: 2 },
  /** Display only: no mob kind uses it. It proves a giant is a row, at two and a half times a person. */
  barrowTroll: { label: 'Barrow troll', skeleton: 'human', joints: humanJoints, scale: 2.5, cadence: 1.5,
    stance: { spine: [0.38, 0, 0], neck: [-0.2, 0, 0], head: [-0.25, 0, 0], shoulderR: [-0.15, 0, -0.2], shoulderL: [-0.1, 0, 0.25], hipR: [-0.15, 0, 0], hipL: [-0.15, 0, 0], kneeR: [0.3, 0, 0], kneeL: [0.3, 0, 0] },
    parts: () => humanParts({ skin: 'trollHide', top: 'trollHide', sleeve: 'trollHide', legs: 'trollHide', boots: 'trollHide', skirt: { mat: 'wool', to: 0.3, flare: 0.22 }, brute: 'moss', hand: 'trollclub' }) },
} satisfies Record<MobKind | 'barrowTroll', Creature>;
export type CreatureKind = keyof typeof creatures;
export const isCreature = (k: string): k is CreatureKind => k in creatures;
export const isTownsfolk = (k: string) => k in townsfolk;

const cache = new Map<string, Figure>();
const memo = (id: string, make: () => Figure) => { let f = cache.get(id); if (!f) { f = make(); cache.set(id, f); } return f; };
export const creatureFigure = (k: CreatureKind) => memo(k, () => { const c: Creature = creatures[k]; return { id: k, label: c.label, skeleton: c.skeleton, joints: c.joints, parts: c.parts(), scale: c.scale, stance: c.stance }; });
export const townsfolkFigure = (look: string) => memo(look, () => human(look, townsfolk[look][0], townsfolk[look][1]));
export const heroFigureOf = (worn: Worn, who: Identity) => memo(heroKey(worn, who), () => heroFigure(worn, who));
/** What the eye sees of its own figure in first person: forearms, hands and what they hold, posed like the rest of it. */
export const heldFigure = (f: Figure): Figure => memo(`held:${f.id}`, () => ({ ...f, id: `held:${f.id}`, label: `${f.label} (held)`, parts: f.parts.filter(p => p.tag !== 'smear' && heldJoints.has(p.joint)) }));
const heldJoints = new Set(['elbowR', 'handR', 'elbowL', 'handL']);
/** The plain hero: no gear, a brown cape. Stands in while a hero's own outfit bakes, and lies as a hero's corpse. */
export const plainHero = () => heroFigureOf({}, { cape: 'wool', hair: 'hairBrown', hood: false });
/** The starting kit, in your colours: what you most likely wear the first time the game draws you. */
export const starterWorn: Worn = { weapon: 'cudgel', head: 'cap', body: 'tunic', feet: 'boots', pack: 'pack' };

/** Everything the game can draw before it knows who wears what: townsfolk, every mob kind, and the two stand-in heroes. */
export function figures(): Figure[] {
  return [
    heroFigureOf(starterWorn, selfIdentity), plainHero(),
    ...Object.keys(townsfolk).map(townsfolkFigure),
    ...mobKinds.map(creatureFigure),
  ];
}
