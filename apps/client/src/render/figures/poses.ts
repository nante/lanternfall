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
      t: { root: [0, 0, -0.08], pelvis: [0, -0.07, 0] },
      r: { spine: [-0.2, -0.5, 0], head: [0.05, 0.3, 0], shoulderR: [2.7, 0, -0.2], elbowR: [-0.95, 0, 0], shoulderL: [-0.6, 0, 0.35], elbowL: [-0.7, 0, 0], hipR: [0.35, 0, 0], kneeR: [0.45, 0, 0], footR: [-0.4, 0, 0], hipL: [-0.45, 0, 0], kneeL: [0.4, 0, 0], cloak: [0.05, 0, 0] },
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

const boarWalkA: Pose = { t: { body: [0, -0.02, 0] }, r: { legFR: [-0.45, 0, 0], legBL: [-0.4, 0, 0], legFL: [0.45, 0, 0], legBR: [0.4, 0, 0], head: [0.05, 0, 0], tail: [0.3, 0, 0.3] } };
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

/** Added under every frame: the rat's tail curls to one side so it reads as a tail and not a stick. */
export const basePose: Record<Skeleton, Pose> = {
  human: {},
  boar: {},
  rat: { r: { tail1: [0.15, 0.35, 0], tail2: [0, 0.55, 0], tail3: [0, 0.65, 0] } },
};
export const poses: Record<Skeleton, Record<AnimName, Pose[]>> = { human, boar, rat };
/** The joint a quadruped rolls about when it dies. */
export const rollJoint: Record<Skeleton, string> = { human: 'pelvis', boar: 'body', rat: 'body' };
