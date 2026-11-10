import type { Skeleton, Vec3 } from './kit.ts';

/**
 * Keyframed poses. Each frame adds rotations (radians, XYZ Euler) and moves (tiles) to the rest skeleton in kit.ts.
 * Conventions at rest, figure facing +z: a hanging limb swings forward with negative x and back with positive x;
 * the spine and head lean forward with positive x; the right side is −x.
 * One pixel of height is about 0.047 tiles at Play, so anything meant to read moves at least that far.
 */
export type AnimName = 'idle' | 'walk' | 'attack' | 'hurt' | 'die' | 'cast';
export const animOrder: AnimName[] = ['idle', 'walk', 'attack', 'hurt', 'die', 'cast'];
export const animFrames: Record<AnimName, number> = { idle: 2, walk: 4, attack: 4, hurt: 1, die: 4, cast: 2 };
/** Attack frames by role. Only `STRIKE` carries the smear, and it is drawn only once the server's effect arrives. */
export const WINDUP = 0, HOLD = 1, STRIKE = 2, RECOVER = 3;

export type Pose = {
  r?: Record<string, Vec3>; t?: Record<string, Vec3>; smear?: true;
  /** Humans: fall sideways in the screen plane by this angle, feet shifted the other way so the body stays on its tile. */
  tip?: number; shift?: number; lift?: number;
  /** Quadrupeds: roll onto a side about the body's long axis, legs never towards the camera. */
  roll?: number;
};

const swap = (name: string) => name.replace(/[RL]$/, m => (m === 'R' ? 'L' : 'R'));
/** The same pose on the other side: swap left and right joints and negate turns about y and z. */
function mirror(p: Pose): Pose {
  const flipR = (v: Vec3): Vec3 => [v[0], -v[1], -v[2]], flipT = (v: Vec3): Vec3 => [-v[0], v[1], v[2]];
  const map = <T>(o: Record<string, Vec3> | undefined, f: (v: Vec3) => Vec3) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [swap(k), f(v)])) as T;
  return { ...p, r: map(p.r, flipR), t: map(p.t, flipT) };
}

const humanWalkA: Pose = {
  t: { pelvis: [0, -0.035, 0] },
  r: {
    hipR: [-0.52, 0, 0], kneeR: [0.12, 0, 0], footR: [0.3, 0, 0], hipL: [0.42, 0, 0], kneeL: [0.38, 0, 0], footL: [-0.35, 0, 0],
    shoulderR: [0.45, 0, -0.08], elbowR: [-0.2, 0, 0], shoulderL: [-0.48, 0, 0.08], elbowL: [-0.55, 0, 0],
    spine: [0.07, 0.09, 0], head: [-0.03, -0.06, 0], cloak: [0.2, 0, 0],
  },
};
const humanWalkB: Pose = {
  t: { pelvis: [0, 0.02, 0] },
  r: {
    hipR: [0.06, 0, 0], kneeR: [0.06, 0, 0], hipL: [-0.28, 0, 0], kneeL: [0.85, 0, 0], footL: [-0.35, 0, 0],
    shoulderR: [0.05, 0, -0.09], shoulderL: [-0.05, 0, 0.09], elbowR: [-0.22, 0, 0], elbowL: [-0.22, 0, 0], spine: [0.06, 0, 0], cloak: [0.12, 0, 0],
  },
};

const human: Record<AnimName, Pose[]> = {
  idle: [
    { r: { shoulderR: [0.04, 0, -0.1], shoulderL: [0.04, 0, 0.1], elbowR: [-0.18, 0, 0], elbowL: [-0.18, 0, 0], cloak: [0.05, 0, 0] } },
    { t: { spine: [0, 0.03, 0] }, r: { spine: [-0.03, 0, 0], head: [-0.05, 0, 0], shoulderR: [0.0, 0, -0.15], shoulderL: [0.0, 0, 0.15], elbowR: [-0.24, 0, 0], elbowL: [-0.24, 0, 0], cloak: [0.09, 0, 0] } },
  ],
  walk: [humanWalkA, humanWalkB, mirror(humanWalkA), mirror(humanWalkB)],
  attack: [
    {
      t: { root: [0, 0, -0.05], pelvis: [0, -0.04, 0] },
      r: { spine: [-0.12, -0.38, 0], head: [0, 0.25, 0], shoulderR: [2.25, 0, -0.25], elbowR: [-0.6, 0, 0], shoulderL: [-0.45, 0, 0.3], elbowL: [-0.6, 0, 0], hipR: [0.25, 0, 0], kneeR: [0.3, 0, 0], footR: [-0.3, 0, 0], hipL: [-0.35, 0, 0], kneeL: [0.25, 0, 0], cloak: [0.1, 0, 0] },
    },
    {
      // The hold: coiled lower and further back than the wind-up, so the two frames read as a draw and not a pause.
      t: { root: [0, 0, -0.11], pelvis: [0, -0.1, 0] },
      r: { spine: [-0.26, -0.62, 0], head: [0.08, 0.38, 0], shoulderR: [2.85, 0, -0.3], elbowR: [-1.05, 0, 0], shoulderL: [-0.7, 0, 0.4], elbowL: [-0.75, 0, 0], hipR: [0.45, 0, 0], kneeR: [0.6, 0, 0], footR: [-0.45, 0, 0], hipL: [-0.55, 0, 0], kneeL: [0.55, 0, 0], cloak: [0.0, 0, 0] },
    },
    {
      t: { root: [0, 0, 0.12], pelvis: [0, -0.07, 0] }, smear: true,
      r: { spine: [0.38, 0.32, 0], head: [0.12, -0.25, 0], shoulderR: [-1.25, 0, -0.1], elbowR: [-0.1, 0, 0], shoulderL: [0.55, 0, 0.35], elbowL: [-0.4, 0, 0], hipR: [-0.55, 0, 0], kneeR: [0.35, 0, 0], footR: [0.2, 0, 0], hipL: [0.5, 0, 0], kneeL: [0.25, 0, 0], footL: [-0.4, 0, 0], cloak: [0.5, 0, 0] },
    },
    {
      t: { root: [0, 0, 0.05], pelvis: [0, -0.035, 0] },
      r: { spine: [0.15, 0.12, 0], shoulderR: [-0.7, 0, -0.1], elbowR: [-0.3, 0, 0], shoulderL: [0.2, 0, 0.2], elbowL: [-0.3, 0, 0], hipR: [-0.25, 0, 0], kneeR: [0.2, 0, 0], hipL: [0.2, 0, 0], kneeL: [0.1, 0, 0], cloak: [0.25, 0, 0] },
    },
  ],
  hurt: [{
    t: { root: [0, 0, -0.07] },
    r: { spine: [-0.32, 0.12, 0.08], head: [-0.38, 0, 0], shoulderR: [0.55, 0, -0.55], elbowR: [-0.5, 0, 0], shoulderL: [0.55, 0, 0.55], elbowL: [-0.5, 0, 0], hipR: [-0.2, 0, 0], kneeR: [0.3, 0, 0], hipL: [0.15, 0, 0], kneeL: [0.2, 0, 0], cloak: [-0.15, 0, 0] },
  }],
  die: [
    { tip: 0.15, shift: 0.05, t: { pelvis: [0, -0.08, 0] }, r: { spine: [-0.25, 0, 0.1], head: [-0.3, 0, 0], shoulderR: [0.6, 0, -0.35], shoulderL: [0.5, 0, 0.35], elbowR: [-0.6, 0, 0], elbowL: [-0.6, 0, 0], hipR: [-0.4, 0, 0], kneeR: [0.8, 0, 0], hipL: [-0.2, 0, 0], kneeL: [0.6, 0, 0] } },
    { tip: 0.7, shift: 0.25, t: { pelvis: [0, -0.1, 0] }, r: { spine: [-0.15, 0, 0.2], head: [-0.2, 0, 0.2], shoulderR: [0.4, 0, -0.4], shoulderL: [0.3, 0, 0.3], elbowR: [-0.5, 0, 0], hipR: [-0.5, 0, 0], kneeR: [0.9, 0, 0], hipL: [-0.3, 0, 0], kneeL: [0.5, 0, 0], cloak: [0.3, 0, 0] } },
    { tip: 1.35, shift: 0.5, lift: 0.1, r: { spine: [0.1, 0, 0.15], head: [0.2, 0, 0.3], shoulderR: [0.2, 0, -0.2], shoulderL: [0.1, 0, 0.2], elbowR: [-0.4, 0, 0], hipR: [-0.3, 0, 0], kneeR: [0.5, 0, 0], hipL: [-0.1, 0, 0], kneeL: [0.3, 0, 0] } },
    { tip: Math.PI / 2, shift: 0.62, lift: 0.14, r: { spine: [0, 0, 0.05], head: [0.1, 0, 0.4], shoulderR: [0.15, 0, -0.12], shoulderL: [-0.1, 0, 0.15], elbowR: [-0.4, 0, 0], elbowL: [-0.2, 0, 0], hipR: [-0.15, 0, 0], kneeR: [0.3, 0, 0], kneeL: [0.1, 0, 0] } },
  ],
  cast: [
    { t: { pelvis: [0, -0.035, 0] }, r: { spine: [-0.14, 0, 0], head: [-0.28, 0, 0], shoulderR: [-2.4, 0, -0.25], shoulderL: [-2.4, 0, 0.25], elbowR: [-0.4, 0, 0], elbowL: [-0.4, 0, 0], cloak: [0.1, 0, 0] } },
    { t: { root: [0, 0, 0.06] }, r: { spine: [0.22, 0, 0], head: [0.05, 0, 0], shoulderR: [-1.5, 0, -0.5], shoulderL: [-1.5, 0, 0.5], hipR: [-0.3, 0, 0], kneeR: [0.2, 0, 0], hipL: [0.3, 0, 0], cloak: [0.4, 0, 0] } },
  ],
};

const boarWalkA: Pose = { t: { body: [0, -0.025, 0] }, r: { legFR: [-0.55, 0, 0], legBL: [-0.5, 0, 0], legFL: [0.5, 0, 0], legBR: [0.5, 0, 0], head: [0.08, 0, 0], tail: [0.3, 0, 0.3] } };
const boarWalkB: Pose = { t: { body: [0, 0.03, 0], legFL: [0, 0.05, 0], legBR: [0, 0.05, 0] }, r: { legFL: [-0.15, 0, 0], legBR: [-0.1, 0, 0], head: [0.12, 0, 0], tail: [0.2, 0, 0] } };
const boar: Record<AnimName, Pose[]> = {
  idle: [
    { r: { head: [0.1, 0, 0], tail: [0.2, 0, 0.2] } },
    { t: { body: [0, -0.035, 0] }, r: { head: [0.25, 0, 0], tail: [0.1, 0, -0.2] } },
  ],
  walk: [boarWalkA, boarWalkB, mirror(boarWalkA), mirror(boarWalkB)],
  attack: [
    { t: { root: [0, 0, -0.08], body: [0, -0.04, 0] }, r: { body: [0.12, 0, 0], head: [0.45, 0, 0], legFR: [-0.3, 0, 0], legFL: [-0.3, 0, 0], legBR: [0.25, 0, 0], legBL: [0.25, 0, 0], tail: [0.6, 0, 0] } },
    { t: { root: [0, 0, -0.13], body: [0, -0.06, 0] }, r: { body: [0.18, 0, 0], head: [0.6, 0, 0], legFR: [-0.45, 0, 0], legFL: [-0.45, 0, 0], legBR: [0.4, 0, 0], legBL: [0.4, 0, 0], tail: [0.8, 0, 0] } },
    { t: { root: [0, 0, 0.2], body: [0, 0.05, 0] }, smear: true, r: { body: [-0.15, 0, 0], head: [-0.55, 0, 0], legFR: [-0.6, 0, 0], legFL: [-0.5, 0, 0], legBR: [0.6, 0, 0], legBL: [0.55, 0, 0], tail: [0.2, 0, 0] } },
    { t: { root: [0, 0, 0.08] }, r: { body: [-0.04, 0, 0], head: [-0.1, 0, 0], legFR: [-0.2, 0, 0], legBR: [0.2, 0, 0] } },
  ],
  hurt: [{ t: { root: [0, 0, -0.08], body: [0, 0.03, 0] }, r: { body: [-0.15, 0, 0.12], head: [-0.4, 0, 0.2], tail: [1.0, 0, 0] } }],
  die: [
    { roll: 0.25, t: { body: [0, -0.03, 0] }, r: { body: [0.1, 0, 0], head: [0.5, 0, 0.2], legFR: [-0.3, 0, 0] } },
    { roll: 0.7, t: { body: [0, -0.1, 0] }, r: { body: [0.2, 0, 0], head: [0.6, 0, 0.3], legFR: [-0.6, 0, 0], legFL: [-0.5, 0, 0] } },
    { roll: 1.3, t: { body: [0, -0.15, 0] }, r: { head: [0.3, 0, 0.3], legFR: [-0.3, 0, 0.3], legFL: [-0.2, 0, 0.4], legBR: [0.3, 0, 0.2], legBL: [0.2, 0, 0.3] } },
    { roll: Math.PI / 2, t: { body: [0, -0.16, 0] }, r: { head: [0.2, 0, 0.15], legFR: [-0.5, 0, 0], legFL: [-0.3, 0, 0], legBR: [0.5, 0, 0], legBL: [0.3, 0, 0], tail: [0.5, 0, 0] } },
  ],
  cast: [
    { t: { body: [0, 0.035, -0.03] }, r: { body: [-0.2, 0, 0], head: [-0.45, 0, 0], legFR: [-0.35, 0, 0], legFL: [-0.35, 0, 0], tail: [0.8, 0, 0] } },
    { t: { body: [0, 0.09, -0.06] }, r: { body: [-0.35, 0, 0], head: [-0.7, 0, 0], legFR: [-0.9, 0, 0], legFL: [-0.7, 0, 0], legBR: [0.2, 0, 0], legBL: [0.2, 0, 0], tail: [1.0, 0, 0] } },
  ],
};

const ratWalkA: Pose = { t: { body: [0, -0.012, 0] }, r: { legFR: [-0.6, 0, 0], legBL: [-0.6, 0, 0], legFL: [0.6, 0, 0], legBR: [0.6, 0, 0], tail2: [0, -0.3, 0], tail3: [0, -0.4, 0] } };
const ratWalkB: Pose = { t: { body: [0, 0.02, 0] }, r: { head: [-0.08, 0, 0] } };
const rat: Record<AnimName, Pose[]> = {
  idle: [
    { r: { head: [0.05, 0, 0] } },
    { t: { head: [0, 0.015, 0] }, r: { head: [-0.2, 0.25, 0], tail3: [0, 0.3, 0] } },
  ],
  walk: [ratWalkA, ratWalkB, mirror(ratWalkA), ratWalkB],
  attack: [
    { t: { root: [0, 0, -0.05], body: [0, -0.02, 0] }, r: { body: [0.1, 0, 0], head: [0.3, 0, 0], legFR: [-0.4, 0, 0], legFL: [-0.4, 0, 0], legBR: [0.4, 0, 0], legBL: [0.4, 0, 0], tail1: [0.4, 0, 0] } },
    { t: { root: [0, 0, -0.08], body: [0, -0.03, 0] }, r: { body: [0.15, 0, 0], head: [0.45, 0, 0], legFR: [-0.6, 0, 0], legFL: [-0.6, 0, 0], legBR: [0.55, 0, 0], legBL: [0.55, 0, 0], tail1: [0.6, 0, 0] } },
    { t: { root: [0, 0, 0.14], body: [0, 0.04, 0] }, smear: true, r: { body: [-0.25, 0, 0], head: [-0.5, 0, 0], legFR: [-0.9, 0, 0], legFL: [-0.9, 0, 0], legBR: [0.7, 0, 0], legBL: [0.7, 0, 0] } },
    { t: { root: [0, 0, 0.05] }, r: { head: [-0.1, 0, 0] } },
  ],
  hurt: [{ t: { root: [0, 0, -0.06], body: [0, 0.03, 0] }, r: { body: [-0.3, 0, 0.15], head: [-0.4, 0, 0], tail1: [0.8, 0, 0] } }],
  die: [
    { roll: 0.3, r: { head: [0.3, 0, 0.2] } },
    { roll: 0.8, t: { body: [0, -0.02, 0] }, r: { head: [0.4, 0, 0.3], legFR: [-0.5, 0, 0] } },
    { roll: 1.3, t: { body: [0, -0.03, 0] }, r: { head: [0.2, 0, 0.3], legFR: [-0.4, 0, 0.3], legBR: [0.4, 0, 0.3] } },
    { roll: Math.PI / 2, t: { body: [0, -0.035, 0] }, r: { head: [0.1, 0, 0.2], legFR: [-0.6, 0, 0], legBR: [0.6, 0, 0], tail2: [0, 0.4, 0] } },
  ],
  cast: [
    { t: { body: [0, 0.06, -0.04] }, r: { body: [-0.6, 0, 0], head: [0.2, 0, 0], legFR: [-0.8, 0, 0], legFL: [-0.8, 0, 0] } },
    { t: { body: [0, 0.09, -0.06] }, r: { body: [-0.8, 0, 0], head: [0.3, 0.2, 0], legFR: [-1.1, 0, 0], legFL: [-0.6, 0, 0] } },
  ],
};

// Beetle legs move in tripods: front and back of one side with the middle of the other. A leg turns about y to swing
// (forward is +y on the right, −y on the left) and about z to lift (−z on the right, +z on the left); mirror() swaps sides.
const tripod = (swing: number, lift: number, plant: number): Record<string, Vec3> => ({
  legFR: [0, swing, -lift], legML: [0, -swing, lift], legBR: [0, swing, -lift],
  legFL: [0, plant, 0], legMR: [0, -plant, 0], legBL: [0, plant, 0],
});
const jaws = (open: number): Record<string, Vec3> => ({ jawR: [0, -open, 0], jawL: [0, open, 0] });
const cases = (open: number): Record<string, Vec3> => ({ caseR: [0, 0, -open], caseL: [0, 0, open] });
const curl = (k: number): Record<string, Vec3> => Object.fromEntries(['F', 'M', 'B'].flatMap(n => [[`leg${n}R`, [0, 0, -0.5 * k]], [`leg${n}L`, [0, 0, 0.5 * k]], [`shin${n}R`, [0, 0, 1.1 * k]], [`shin${n}L`, [0, 0, -1.1 * k]]]));
const beetleWalkA: Pose = { t: { body: [0, 0.012, 0] }, r: { ...tripod(0.4, 0.3, 0.3), ...jaws(0.1), head: [0, 0.08, 0] } };
const beetleWalkB: Pose = { r: { legFL: [0, 0, 0.25], legMR: [0, 0, -0.25], legBL: [0, 0, 0.25], ...jaws(-0.1) } };
const beetle: Record<AnimName, Pose[]> = {
  idle: [
    { r: { ...jaws(-0.15) } },
    { t: { body: [0, 0.012, 0] }, r: { ...jaws(0.35), ...cases(0.1), head: [-0.08, 0, 0] } },
  ],
  walk: [beetleWalkA, beetleWalkB, mirror(beetleWalkA), mirror(beetleWalkB)],
  attack: [
    { t: { root: [0, 0, -0.06], body: [0, 0.03, 0] }, r: { body: [-0.22, 0, 0], head: [-0.2, 0, 0], ...jaws(0.6), ...cases(0.3), legFR: [0, 0.25, -0.45], legFL: [0, -0.25, 0.45] } },
    { t: { root: [0, 0, -0.1], body: [0, 0.05, 0] }, r: { body: [-0.34, 0, 0], head: [-0.25, 0, 0], ...jaws(0.75), ...cases(0.55), legFR: [0, 0.35, -0.6], legFL: [0, -0.35, 0.6] } },
    { t: { root: [0, 0, 0.2], body: [0, -0.01, 0] }, smear: true, r: { body: [0.16, 0, 0], head: [0.3, 0, 0], ...jaws(-0.4), ...cases(0.35), legBR: [0, -0.45, 0], legBL: [0, 0.45, 0], legFR: [0, 0.5, 0], legFL: [0, -0.5, 0] } },
    { t: { root: [0, 0, 0.07] }, r: { body: [0.05, 0, 0], head: [0.1, 0, 0], ...jaws(0.1), ...cases(0.12) } },
  ],
  hurt: [{ t: { root: [0, 0, -0.06], body: [0, 0.03, 0] }, r: { body: [-0.18, 0, 0.14], head: [-0.25, 0, 0], ...cases(0.35), ...jaws(0.5), ...curl(0.3) } }],
  die: [
    { roll: 0.6, t: { body: [0, 0.03, 0] }, r: { ...cases(0.25), ...curl(0.3) } },
    { roll: 1.6, t: { body: [0, 0.06, 0] }, r: { ...cases(0.2), ...curl(0.6) } },
    { roll: 2.6, t: { body: [0, 0.05, 0] }, r: { ...curl(0.9), ...jaws(0.4) } },
    { roll: 3.0, t: { body: [0, 0.04, 0] }, r: { ...curl(1.1), ...jaws(0.5) } },
  ],
  cast: [
    { t: { body: [0, 0.02, 0] }, r: { body: [-0.12, 0, 0], ...cases(0.7), ...jaws(0.4) } },
    { t: { body: [0, 0.04, 0] }, r: { body: [-0.2, 0, 0], ...cases(1.05), ...jaws(0.6) } },
  ],
};

// The grub crawls by a hump that runs from tail to head: each segment rises in turn and the body bunches behind it.
const GRUB_SEGS = 6;
function crawl(phase: number): Pose {
  const t: Record<string, Vec3> = {}, r: Record<string, Vec3> = {};
  let below = 0;
  for (let i = GRUB_SEGS - 1; i >= 0; i--) {
    const w = Math.sin(2 * Math.PI * ((GRUB_SEGS - 1 - i) / 4 - phase)), up = 0.045 * Math.max(0, w);
    t[`seg${i}`] = [0, up - below, i === GRUB_SEGS - 1 ? 0 : -0.018 * Math.max(0, w)];
    r[`seg${i}`] = [-0.12 * Math.cos(2 * Math.PI * ((GRUB_SEGS - 1 - i) / 4 - phase)), 0, 0];
    below = up;
  }
  return { t, r: { ...r, head: [0.05 * Math.sin(2 * Math.PI * phase), 0, 0] } };
}
const rear = (k: number, head: number): Record<string, Vec3> => ({ seg3: [-0.1 * k, 0, 0], seg2: [-0.28 * k, 0, 0], seg1: [-0.26 * k, 0, 0], seg0: [-0.16 * k, 0, 0], head: [head, 0, 0] });
const coil = (k: number): Record<string, Vec3> => Object.fromEntries(Array.from({ length: GRUB_SEGS - 1 }, (_, i) => [`seg${i}`, [0, 0.32 * k, 0]]));
const grub: Record<AnimName, Pose[]> = {
  idle: [
    { r: { seg2: [0, 0.05, 0], seg0: [0, -0.04, 0] } },
    { t: { seg3: [0, 0.015, 0] }, r: { seg2: [0, -0.06, 0], seg1: [-0.06, 0, 0], seg0: [-0.05, 0.05, 0], head: [-0.12, 0, 0] } },
  ],
  walk: [crawl(0), crawl(0.25), crawl(0.5), crawl(0.75)],
  attack: [
    { t: { root: [0, 0, -0.05] }, r: rear(0.8, 0.35) },
    { t: { root: [0, 0, -0.09] }, r: rear(1.15, 0.5) },
    { t: { root: [0, 0, 0.16] }, smear: true, r: { seg2: [0.12, 0, 0], seg1: [0.22, 0, 0], seg0: [0.18, 0, 0], head: [-0.1, 0, 0] } },
    { t: { root: [0, 0, 0.05] }, r: { seg1: [0.06, 0, 0], head: [0.05, 0, 0] } },
  ],
  hurt: [{ t: { root: [0, 0, -0.06] }, r: { ...coil(0.35), seg1: [-0.2, 0.32, 0], head: [-0.35, 0, 0] } }],
  die: [
    { roll: 0.3, r: coil(0.3) },
    { roll: 0.8, t: { seg5: [0, -0.02, 0] }, r: coil(0.55) },
    { roll: 1.3, t: { seg5: [0, -0.04, 0] }, r: coil(0.75) },
    { roll: Math.PI / 2, t: { seg5: [0, -0.05, 0] }, r: { ...coil(0.85), head: [0.3, 0, 0] } },
  ],
  cast: [
    { r: rear(0.9, 0.1) },
    { t: { root: [0, 0, -0.03] }, r: rear(1.3, -0.1) },
  ],
};

/** Added under every frame: the rat's tail curls to one side so it reads as a tail and not a stick. */
export const basePose: Record<Skeleton, Pose> = {
  human: {},
  boar: {},
  rat: { r: { tail1: [0.15, 0.35, 0], tail2: [0, 0.55, 0], tail3: [0, 0.65, 0] } },
  beetle: {},
  grub: {},
};
export const poses: Record<Skeleton, Record<AnimName, Pose[]>> = { human, boar, rat, beetle, grub };
/** The joint a body rolls about when it dies. */
export const rollJoint: Record<Skeleton, string> = { human: 'pelvis', boar: 'body', rat: 'body', beetle: 'body', grub: 'seg5' };
/** Animations in which a figure's held joints (a raised torch, a carried shield) keep their hold. */
export const holds: Record<AnimName, boolean> = { idle: true, walk: true, attack: true, cast: true, hurt: false, die: false };
