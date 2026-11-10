import * as THREE from 'three';
import { PX } from '../stops.ts';
import { figures, materials, glow, grain, type Figure, type FigureId, type Mat } from './kit.ts';
import { poses, basePose, animOrder, animFrames, rollJoint, type AnimName, type Pose } from './poses.ts';

export const DIRS = 8;
export const animOffset = animOrder.reduce((o, a, i) => ({ ...o, [a]: i === 0 ? 0 : o[animOrder[i - 1]] + animFrames[animOrder[i - 1]] }), {} as Record<AnimName, number>);
export const FRAMES = animOrder.reduce((n, a) => n + animFrames[a], 0);
/** A baked frame in atlas texels (origin bottom-left). `below` and `top` count opaque rows under and over the feet. */
export type FrameRect = { x: number; y: number; w: number; h: number; ax: number; ay: number; below: number; top: number };
export type Sheet = { figure: Figure; frames: FrameRect[]; height: number };
/** Colour holds palette sRGB with coverage in alpha; normal holds world normals (×0.5+0.5) with the self-lit share in alpha. */
export type Atlas = { width: number; height: number; color: Uint8Array; normal: Uint8Array; sheets: Map<FigureId, Sheet>; pitch: number; ms: number; phases: { setup: number; render: number; clean: number }; cells: number; clipped: string[] };
export const frameIndex = (anim: AnimName, frame: number, dir: number) => (animOffset[anim] + frame) * DIRS + dir;

const WIDTH = 2048;
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rampBytes = Object.fromEntries(Object.entries(materials).map(([k, r]) => [k, r.map(hex)])) as Record<Mat, number[][]>;

/** Facing index d turns the figure to d·45° from south, matching the server's atan2(dx, dy). */
const dirAngle = (d: number) => (d * Math.PI) / 4;
/** Which way a body falls or rolls, picked so it never lies towards the camera. */
const fallSide = (d: number) => (Math.sin(dirAngle(d)) < -0.01 ? -1 : 1);

function jointMatrices(fig: Figure, pose: Pose, dir: number) {
  const base = basePose[fig.skeleton], out = new Map<string, THREE.Matrix4>();
  const e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (const j of fig.joints) {
    const r = [0, 0, 0], t = [...j.at];
    for (const p of [base, pose]) { const pr = p.r?.[j.name], pt = p.t?.[j.name]; if (pr) for (let i = 0; i < 3; i++) r[i] += pr[i]; if (pt) for (let i = 0; i < 3; i++) t[i] += pt[i]; }
    const local = new THREE.Matrix4().compose(new THREE.Vector3(t[0], t[1], t[2]), q.setFromEuler(e.set(r[0], r[1], r[2])), one);
    if (pose.roll && j.name === rollJoint[fig.skeleton]) local.multiply(new THREE.Matrix4().makeRotationZ(fallSide(dir) * pose.roll));
    out.set(j.name, j.parent ? out.get(j.parent)!.clone().multiply(local) : local);
  }
  return out;
}

/**
 * Render every figure × animation × direction at `pitch` with an orthographic camera at exactly PX px per tile, then
 * clean up on the CPU: 4-tone palette ramps by surface direction, a selective 1 px outline, no stray pixels.
 */
export function bake(pitch: number): Atlas {
  const t0 = performance.now();
  const figs = figures();
  const sheets = new Map<FigureId, Sheet>();
  let y = 0;
  for (const f of figs) {
    const { w, h, ax, ay } = f.cell, perRow = Math.floor(WIDTH / w), n = FRAMES * DIRS;
    const frames: FrameRect[] = [];
    for (let i = 0; i < n; i++) frames.push({ x: (i % perRow) * w, y: y + Math.floor(i / perRow) * h, w, h, ax, ay, below: 0, top: 0 });
    y += Math.ceil(n / perRow) * h;
    sheets.set(f.id, { figure: f, frames, height: 1 });
  }
  const W = WIDTH, H = Math.ceil(y / 4) * 4;

  const sin = Math.sin(pitch), cos = Math.cos(pitch), D = 10;
  const camUp = new THREE.Vector3(0, cos, -sin);
  const scene = new THREE.Scene();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (const f of figs) {
    const sheet = sheets.get(f.id)!;
    // Each instance draws only inside its own cell, so a raised blade never bleeds into a neighbour.
    const cells = new THREE.InstancedBufferAttribute(new Float32Array(sheet.frames.flatMap(c => [c.x, c.y, c.x + c.w, c.y + c.h])), 4);
    const meshes = f.parts.map((p, k) => {
      const ids = new Float32Array(p.geo.attributes.position.count).fill(k + 1);
      p.geo.setAttribute('aPart', new THREE.BufferAttribute(ids, 1));
      p.geo.setAttribute('aGrain', new THREE.BufferAttribute(new Float32Array(ids.length).fill(grain[p.mat]?.[0] ?? 0), 1));
      p.geo.setAttribute('aCell', cells);
      const m = new THREE.InstancedMesh(p.geo, undefined, sheet.frames.length);
      m.frustumCulled = false; scene.add(m);
      return m;
    });
    for (const anim of animOrder) for (let fr = 0; fr < animFrames[anim]; fr++) {
      const pose = poses[f.skeleton][anim][fr];
      for (let d = 0; d < DIRS; d++) {
        const cell = sheet.frames[frameIndex(anim, fr, d)];
        // The feet sit on a pixel corner of the cell, in the camera plane through the origin.
        const u = (cell.x + cell.ax - W / 2) / PX, v = (cell.y + cell.ay - H / 2) / PX;
        const s = fallSide(d);
        const root = new THREE.Matrix4().makeTranslation(new THREE.Vector3(u, 0, 0).addScaledVector(camUp, v))
          .multiply(new THREE.Matrix4().makeTranslation(s * (pose.shift ?? 0), pose.lift ?? 0, 0))
          .multiply(new THREE.Matrix4().makeRotationZ(s * (pose.tip ?? 0)))
          .multiply(new THREE.Matrix4().makeRotationY(dirAngle(d)));
        const joints = jointMatrices(f, pose, d), i = frameIndex(anim, fr, d);
        f.parts.forEach((p, k) => meshes[k].setMatrixAt(i, p.tag === 'smear' && !pose.smear ? zero : root.clone().multiply(joints.get(p.joint)!)));
      }
    }
  }

  const vertex = /* glsl */`
    attribute float aPart; attribute float aGrain; attribute vec4 aCell;
    varying float vPart; varying float vDepth; varying vec3 vN; varying vec3 vObj; flat varying vec4 vCell; flat varying float vGrain;
    void main() {
      vCell = aCell; vGrain = aGrain; vObj = position;
      vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vec4 vp = viewMatrix * wp;
      vPart = aPart; vDepth = -vp.z; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
      gl_Position = projectionMatrix * vp;
    }`;
  const clip = /* glsl */`varying float vPart; varying float vDepth; varying vec3 vN; varying vec3 vObj; flat varying vec4 vCell; flat varying float vGrain;
    void inCell() { if (gl_FragCoord.x < vCell.x || gl_FragCoord.y < vCell.y || gl_FragCoord.x > vCell.z || gl_FragCoord.y > vCell.w) discard; }
    float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float vnoise(vec3 x) {
      vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
                 mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
    }
    // Grain lives in the part's own space, so it moves with the body instead of crawling across it.
    float grainAt(float kind, vec3 p) {
      if (kind < 0.5) return 0.5;
      if (kind < 1.5) return vnoise(p * 13.0) * 0.7 + vnoise(p * 29.0) * 0.3;
      if (kind < 2.5) return h3(floor(p * 34.0));
      if (kind < 3.5) return vnoise(p * 24.0) * 0.6 + h3(floor(p * 40.0)) * 0.4;
      return vnoise(p * vec3(9.0, 34.0, 9.0));
    }`;
  const ids = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexShader: vertex,
    fragmentShader: `${clip}
      void main() {
        inCell();
        float g = gl_FrontFacing ? (1.0 + floor(clamp(grainAt(vGrain, vObj), 0.0, 1.0) * 254.0)) / 255.0 : 0.0;
        gl_FragColor = vec4(vPart / 255.0, clamp((vDepth - ${D.toFixed(1)} + 2.0) / 4.0, 0.0, 1.0), g, 1.0);
      }`,
  });
  const nrm = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexShader: vertex,
    fragmentShader: `${clip}
      void main() { inCell(); vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); }`,
  });
  const cam = new THREE.OrthographicCamera(-W / 2 / PX, W / 2 / PX, H / 2 / PX, -H / 2 / PX, 0.1, 40);
  cam.position.set(0, sin * D, cos * D); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();

  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, canvas: document.createElement('canvas') });
  renderer.setPixelRatio(1); renderer.setSize(1, 1, false); renderer.setClearColor(0x000000, 0);
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
  const A = new Uint8Array(W * H * 4), B = new Uint8Array(W * H * 4);
  const t1 = performance.now();
  renderer.setRenderTarget(rt);
  for (const [mat, buf] of [[ids, A], [nrm, B]] as const) {
    scene.overrideMaterial = mat;
    renderer.clear(); renderer.render(scene, cam);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
  }
  renderer.setRenderTarget(null);
  rt.dispose(); ids.dispose(); nrm.dispose();
  for (const o of scene.children) (o as THREE.InstancedMesh).dispose();
  renderer.dispose(); renderer.forceContextLoss();

  const color = new Uint8Array(W * H * 4), normal = new Uint8Array(W * H * 4), clipped: string[] = [];
  const t2 = performance.now();
  for (const sheet of sheets.values()) clean(sheet, A, B, color, normal, W, sin, cos, clipped);
  const t3 = performance.now();
  for (const sheet of sheets.values()) {
    const idle = sheet.frames.slice(0, animFrames.idle * DIRS);
    sheet.height = Math.max(...idle.map(f => f.top)) / (PX * cos);
  }
  const ms = performance.now() - t0;
  return { width: W, height: H, color, normal, sheets, pitch, ms, phases: { setup: t1 - t0, render: t2 - t1, clean: t3 - t2 }, cells: [...sheets.values()].reduce((n, s) => n + s.frames.length, 0), clipped };
}

/**
 * Per cell: tones from the surface normal and grain, inner edges, stray pixels, then the outline; writes palette colours.
 * Works on a grid padded by one empty pixel, inside each cell's occupied box, so neighbour reads need no bounds checks.
 */
function clean(sheet: Sheet, A: Uint8Array, B: Uint8Array, color: Uint8Array, normal: Uint8Array, W: number, sin: number, cos: number, clipped: string[]) {
  const f = sheet.figure, parts = f.parts;
  const matOf = Int16Array.from([-1, ...parts.map(p => Object.keys(materials).indexOf(p.mat))]);
  const smear = Uint8Array.from([0, ...parts.map(p => (p.tag === 'smear' ? 1 : 0))]);
  const amount = Float32Array.from([0, ...parts.map(p => grain[p.mat]?.[1] ?? 0)]);
  const ramp = [rampBytes.eye, ...parts.map(p => rampBytes[p.mat])];
  const lit = Uint8Array.from([0, ...parts.map(p => Math.round((glow[p.mat] ?? 0) * 255))]);
  const { w, h } = f.cell, P = w + 2, n = P * (h + 2);
  const part = new Uint8Array(n), tone = new Int8Array(n), depth = new Float32Array(n), src = new Int32Array(n), edge = new Uint8Array(n);
  const N = [1, -1, P, -P];
  // Outline neighbours, the pixel below first: an outline above the figure takes the softer shade.
  const below = [-P, -1, 1, P];
  sheet.frames.forEach((cell, ci) => {
    part.fill(0);
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      let o = ((cell.y + y) * W + cell.x) * 4, i = (y + 1) * P + 1;
      for (let x = 0; x < w; x++, o += 4, i++) {
        if (!A[o + 3]) continue;
        const k = A[o]; part[i] = k; src[i] = o; depth[i] = (A[o + 1] / 255) * 4 - 2;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (A[o + 2] === 0) { tone[i] = 0; continue; }
        // Occlusion only: undersides and grazing edges darken, tops catch a glint. Direction and colour of light come at runtime.
        const ny = B[o + 1] / 127.5 - 1, nz = B[o + 2] / 127.5 - 1;
        const v = 0.62 + 0.18 * ny + 0.18 * (ny * sin + nz * cos - 0.4) + ((A[o + 2] - 1) / 254 - 0.5) * amount[k];
        tone[i] = smear[k] ? 2 : v >= 0.86 ? 3 : v >= 0.52 ? 2 : v >= 0.3 ? 1 : 0;
      }
    }
    if (x1 < 0) { cell.below = cell.top = 0; return; }
    const row = (y: number) => (y + 1) * P + 1;
    for (let y = y0; y <= y1; y++) for (let x = x0, i = row(y) + x0; x <= x1; x++, i++) {
      const k = part[i]; if (!k) continue;
      const m = matOf[k], a = i + 1, b = i - 1, c = i + P, d = i - P;
      if (matOf[part[a]] !== m || matOf[part[b]] !== m || matOf[part[c]] !== m || matOf[part[d]] !== m) continue;
      const t = tone[a]; if (t !== tone[i] && tone[b] === t && tone[c] === t && tone[d] === t) tone[i] = t;
    }
    // Where a nearer part overlaps a farther one, the farther pixel darkens: arms read against the torso.
    for (let y = y0; y <= y1; y++) for (let x = x0, i = row(y) + x0; x <= x1; x++, i++) {
      const k = part[i]; edge[i] = 0; if (!k || smear[k]) continue;
      for (const dn of N) { const j = i + dn, q = part[j]; if (q && q !== k && !smear[q] && depth[j] < depth[i] - 0.08) { edge[i] = 1; break; } }
    }
    for (let y = y0; y <= y1; y++) for (let x = x0, i = row(y) + x0; x <= x1; x++, i++) if (edge[i]) tone[i] = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0, i = row(y) + x0; x <= x1; x++, i++) {
      let c = 0, from = -1;
      for (const dn of N) if (part[i + dn]) { c++; if (from < 0 || dn === -P) from = i + dn; }
      if (part[i] && c === 0) part[i] = 0;
      else if (!part[i] && c === 4) { part[i] = part[from]; tone[i] = tone[from]; src[i] = src[from]; depth[i] = depth[from]; }
    }
    // Selective outline outside the silhouette: the darkened colour of the pixel it borders, softer along the top.
    let minRow = h, maxRow = -1, clip = false;
    const ox0 = Math.max(0, x0 - 1), ox1 = Math.min(w - 1, x1 + 1), oy0 = Math.max(0, y0 - 1), oy1 = Math.min(h - 1, y1 + 1);
    for (let y = oy0; y <= oy1; y++) for (let x = ox0, i = row(y) + ox0; x <= ox1; x++, i++) {
      let k = part[i], shade = 1 + tone[i], from = src[i];
      if (!k) {
        let j = -1;
        for (const dn of below) { const q = part[i + dn]; if (q && !smear[q]) { j = i + dn; break; } }
        if (j < 0) continue;
        k = part[j]; shade = j === i - P ? 1 : 0; from = src[j];
      }
      const o = ((cell.y + y) * W + cell.x + x) * 4, c = ramp[k][shade];
      color[o] = c[0]; color[o + 1] = c[1]; color[o + 2] = c[2]; color[o + 3] = 255;
      normal[o] = B[from]; normal[o + 1] = B[from + 1]; normal[o + 2] = B[from + 2]; normal[o + 3] = lit[k];
      if (y < minRow) minRow = y; if (y > maxRow) maxRow = y;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) clip = true;
    }
    cell.below = maxRow < 0 ? 0 : Math.max(0, cell.ay - minRow);
    cell.top = maxRow < 0 ? 0 : maxRow + 1 - cell.ay;
    if (clip) { const an = animOrder.find(a => ci < (animOffset[a] + animFrames[a]) * DIRS)!; const key = `${f.id}:${an}`; if (!clipped.includes(key)) clipped.push(key); }
  });
}
