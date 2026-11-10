import * as THREE from 'three';
import { PX } from '../stops.ts';
import { figures, materials, glow, grain, type Figure, type Mat } from './kit.ts';
import { poses, basePose, animOrder, animFrames, rollJoint, holds, type AnimName, type Pose } from './poses.ts';

export const DIRS = 8;
export const animOffset = animOrder.reduce((o, a, i) => ({ ...o, [a]: i === 0 ? 0 : o[animOrder[i - 1]] + animFrames[animOrder[i - 1]] }), {} as Record<AnimName, number>);
export const FRAMES = animOrder.reduce((n, a) => n + animFrames[a], 0);
/** A baked frame in atlas texels (origin bottom-left), cropped to what it draws. `below` and `top` count opaque rows under and over the feet. */
export type FrameRect = { x: number; y: number; w: number; h: number; ax: number; ay: number; below: number; top: number };
/** A render cell in texels; (ax, ay) is the feet, counted from the cell's bottom-left corner. Fitted to every pose of one animation in one direction. */
type Cell = { w: number; h: number; ax: number; ay: number };
/** `height` is the standing figure's height in tiles; `span` its widest ground extent at rest, in tiles. */
export type Sheet = { figure: Figure; frames: FrameRect[]; height: number; span: number };
/**
 * Four bytes a texel: the world normal folded onto an octahedron in red and green, then a palette entry (`palette`)
 * in blue and the low bit of alpha, alpha 0 where nothing is drawn. `px` is texels per tile across the view: PX for
 * the orthographic stops, more for a figure near a lens.
 */
export type Atlas = { width: number; height: number; data: Uint8Array; sheets: Map<string, Sheet>; pitch: number; px: number; ms: number; phases: { setup: number; render: number; clean: number }; cells: number; clipped: string[] };
export const frameIndex = (anim: AnimName, frame: number, dir: number) => (animOffset[anim] + frame) * DIRS + dir;

/** WebGL's guaranteed texture size is smaller, but every GPU the game targets takes 16384; atlases wrap at this width. */
const WIDTH = 2048, MAX_HEIGHT = 16384;
/** Depth is stored in 8 bits across ±DEPTH tiles around the camera distance: room for a creature several tiles long. */
const DEPTH = 4;
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mats = Object.keys(materials) as Mat[], RAMP = 5;
/** Every material's ramp, RAMP entries each, as sRGB bytes with the material's self-lit share in alpha. */
export const palette = Uint8Array.from(mats.flatMap(m => materials[m].map(c => [...hex(c), Math.round((glow[m] ?? 0) * 255)]).flat()));
export const PALETTE_SIZE = palette.length / 4;
/** A unit normal from the normal pass's bytes, folded onto the octahedron and quantised to two bytes. */
function octahedral(r: number, g: number, b: number, out: Uint8Array, at: number) {
  let x = r / 127.5 - 1, y = g / 127.5 - 1, z = b / 127.5 - 1;
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  x /= l; y /= l; z /= l;
  if (z < 0) { const fx = (1 - Math.abs(y)) * Math.sign(x || 1), fy = (1 - Math.abs(x)) * Math.sign(y || 1); x = fx; y = fy; }
  out[at] = Math.round((x * 0.5 + 0.5) * 255); out[at + 1] = Math.round((y * 0.5 + 0.5) * 255);
}

/** Facing index d turns the figure to d·45° from south, matching the server's atan2(dx, dy). */
const dirAngle = (d: number) => (d * Math.PI) / 4;
/** Which way a body falls or rolls, picked so it never lies towards the camera. */
const fallSide = (d: number) => (Math.sin(dirAngle(d)) < -0.01 ? -1 : 1);

function jointMatrices(fig: Figure, pose: Pose, dir: number, held: boolean) {
  const base = basePose[fig.skeleton], out = new Map<string, THREE.Matrix4>(), hold = held ? fig.hold : undefined;
  const e = new THREE.Euler(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  for (const j of fig.joints) {
    const r = [0, 0, 0], t = [...j.at];
    for (const p of [base, { r: fig.stance }, pose]) { const pr = p.r?.[j.name], pt = p.t?.[j.name]; if (pr) for (let i = 0; i < 3; i++) r[i] += pr[i]; if (pt) for (let i = 0; i < 3; i++) t[i] += pt[i]; }
    const h = hold?.[j.name]; if (h) for (let i = 0; i < 3; i++) r[i] = h[i];
    const local = new THREE.Matrix4().compose(new THREE.Vector3(t[0], t[1], t[2]), q.setFromEuler(e.set(r[0], r[1], r[2])), one);
    if (pose.roll && j.name === rollJoint[fig.skeleton]) local.multiply(new THREE.Matrix4().makeRotationZ(fallSide(dir) * pose.roll));
    out.set(j.name, j.parent ? out.get(j.parent)!.clone().multiply(local) : local);
  }
  return out;
}
/** The figure's own placement for one frame, feet at the origin: scale, then a fall's shift and tip, then the facing. */
function rootMatrix(fig: Figure, pose: Pose, dir: number) {
  const s = fallSide(dir);
  return new THREE.Matrix4().makeScale(fig.scale, fig.scale, fig.scale)
    .multiply(new THREE.Matrix4().makeTranslation(s * (pose.shift ?? 0), pose.lift ?? 0, 0))
    .multiply(new THREE.Matrix4().makeRotationZ(s * (pose.tip ?? 0)))
    .multiply(new THREE.Matrix4().makeRotationY(dirAngle(dir)));
}
type Posed = { anim: AnimName; frame: number; dir: number; pose: Pose; parts: THREE.Matrix4[] };
/** Poses do not depend on the pitch or density, so a figure baked again at another keeps them. */
const posedCache = new WeakMap<Figure, Posed[]>();
/** Every frame of a figure as part matrices relative to its feet; a smear part on a frame without a strike is scaled to nothing. */
function posed(fig: Figure): Posed[] {
  const cached = posedCache.get(fig);
  if (cached) return cached;
  const out: Posed[] = [];
  for (const anim of animOrder) for (let frame = 0; frame < animFrames[anim]; frame++) {
    const pose = poses[fig.skeleton][anim][frame];
    for (let dir = 0; dir < DIRS; dir++) {
      const root = rootMatrix(fig, pose, dir), joints = jointMatrices(fig, pose, dir, holds[anim]);
      out.push({ anim, frame, dir, pose, parts: fig.parts.map(p => (p.tag === 'smear' && !pose.smear ? new THREE.Matrix4().makeScale(0, 0, 0) : root.clone().multiply(joints.get(p.joint)!))) });
    }
  }
  for (const p of fig.parts) if (!p.geo.boundingBox) p.geo.computeBoundingBox();
  posedCache.set(fig, out);
  return out;
}
/** The cell that holds every pose given: bounding boxes of the parts, projected onto the camera's right and up axes. */
function fitCell(fig: Figure, frames: Posed[], sin: number, cos: number, px: number): Cell {
  let u0 = 0, u1 = 0, v0 = 0, v1 = 0;
  const boxes = fig.parts.map(p => p.geo.boundingBox!), c = new THREE.Vector3();
  for (const f of frames) fig.parts.forEach((_, k) => {
    const b = boxes[k], m = f.parts[k];
    for (let i = 0; i < 8; i++) {
      c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(m);
      const v = c.y * cos - c.z * sin;
      if (c.x < u0) u0 = c.x; if (c.x > u1) u1 = c.x; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
  });
  const ax = Math.ceil(-u0 * px) + 2, ay = Math.ceil(-v0 * px) + 2;
  return { w: ax + Math.ceil(u1 * px) + 2, h: ay + Math.ceil(v1 * px) + 2, ax, ay };
}
/** The widest ground extent of the standing figure, in tiles: the base of its shadow, hit area and target ring. */
function restSpan(fig: Figure, rest: Posed) {
  let x = 0, z = 0;
  const c = new THREE.Vector3();
  fig.parts.forEach((p, k) => {
    if (p.tag === 'smear') return;
    const b = p.geo.boundingBox!;
    for (let i = 0; i < 8; i++) { c.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(rest.parts[k]); x = Math.max(x, Math.abs(c.x)); z = Math.max(z, Math.abs(c.z)); }
  });
  return 2 * Math.max(x, z);
}

const vertex = /* glsl */`
  attribute float aPart; attribute vec2 aGrain; attribute vec4 aCell;
  uniform float uGrainScale;
  varying float vPart; varying float vDepth; varying vec3 vN; varying vec3 vObj; flat varying vec4 vCell; flat varying float vGrain;
  void main() {
    // Grain is in texels whatever the figure's scale or the bake's density, so a giant's hide, or a figure baked for a
    // near lens, breaks into pixel clusters of the same size as everyone else's.
    vCell = aCell; vGrain = aGrain.x; vObj = position * aGrain.y * uGrainScale;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vec4 vp = viewMatrix * wp;
    vPart = aPart; vDepth = -vp.z; vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
    gl_Position = projectionMatrix * vp;
  }`;
const clip = /* glsl */`varying float vPart; varying float vDepth; varying vec3 vN; varying vec3 vObj; flat varying vec4 vCell; flat varying float vGrain;
  uniform float uBandY;
  void inCell() { vec2 p = gl_FragCoord.xy + vec2(0.0, uBandY); if (p.x < vCell.x || p.y < vCell.y || p.x > vCell.z || p.y > vCell.w) discard; }
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
    if (kind < 4.5) return vnoise(p * vec3(9.0, 34.0, 9.0));
    // 5: plates, broad facets with a pale seam between them.
    vec3 q = p * 9.0; float s = vnoise(floor(q) * 1.7);
    return min(fract(q.x + q.y * 0.5) < 0.16 ? 1.0 : s * 0.6 + 0.2, 1.0);
  }`;
const D = 10;
const grainScale = { value: 1 }, bandY = { value: 0 };
/** Texels per GPU pass: a bake renders and reads back in bands of about 8 MB, so a large one never stalls a frame on its read back. */
const BAND_TEXELS = 2 ** 21;
let gpu: { renderer: THREE.WebGLRenderer; ids: THREE.ShaderMaterial; nrm: THREE.ShaderMaterial } | undefined;
/** One renderer for every bake, kept: outfit variants bake while playing, and a fresh context and shader compile each time would cost more than the bake. */
function baker() {
  if (gpu) return gpu;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, canvas: document.createElement('canvas') });
  renderer.setPixelRatio(1); renderer.setSize(1, 1, false); renderer.setClearColor(0x000000, 0);
  const ids = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexShader: vertex, uniforms: { uGrainScale: grainScale, uBandY: bandY },
    fragmentShader: `${clip}
      void main() {
        inCell();
        float g = gl_FrontFacing ? (1.0 + floor(clamp(grainAt(vGrain, vObj), 0.0, 1.0) * 254.0)) / 255.0 : 0.0;
        gl_FragColor = vec4(vPart / 255.0, clamp((vDepth - ${D.toFixed(1)} + ${DEPTH.toFixed(1)}) / ${(2 * DEPTH).toFixed(1)}, 0.0, 1.0), g, 1.0);
      }`,
  });
  const nrm = new THREE.ShaderMaterial({
    side: THREE.DoubleSide, vertexShader: vertex, uniforms: { uGrainScale: grainScale, uBandY: bandY },
    fragmentShader: `${clip}
      void main() { inCell(); vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0); gl_FragColor = vec4(n * 0.5 + 0.5, 1.0); }`,
  });
  return (gpu = { renderer, ids, nrm });
}

/**
 * Bakes figures × animations × directions at `pitch` with an orthographic camera at exactly `px` texels per tile, then cleans
 * up on the CPU: 4-tone palette ramps by surface direction, a selective 1 px outline, no stray pixels. `step` does as
 * much as fits in a time budget, so a bake can spread over several frames: building the scene and each band of each GPU
 * pass are a step apiece, cleaning splits by cell.
 */
export class BakeJob {
  private readonly t0 = performance.now();
  private readonly phases = { setup: 0, render: 0, clean: 0 };
  private posedFigs?: Posed[][];
  private sheets = new Map<string, Sheet>();
  private W = WIDTH; private H = 0;
  private A?: Uint8Array; private B?: Uint8Array;
  private gpu?: { scene: THREE.Scene; cam: THREE.OrthographicCamera; rt: THREE.WebGLRenderTarget; band: number; out: [Uint8Array, Uint8Array]; passes: [THREE.ShaderMaterial, Uint8Array][]; next: number; reading?: boolean };
  /** Per frame, the box the cleaner drew into, in cell texels: x0, y0, x1, y1 (x1 < x0 when nothing was drawn). */
  private readonly drawn = new Map<FrameRect, [number, number, number, number]>();
  private queue: [Sheet, number][] = [];
  private packed?: { frames: FrameRect[]; at: Map<FrameRect, [number, number]>; H: number; data: Uint8Array; next: number };
  private clipped: string[] = [];
  private done?: Atlas;
  private readonly sin: number; private readonly cos: number;
  constructor(readonly figs: Figure[], readonly pitch: number, readonly px = PX) { this.sin = Math.sin(pitch); this.cos = Math.cos(pitch); }

  step(budget = Infinity): Atlas | undefined {
    const start = performance.now(), left = () => budget - (performance.now() - start);
    while (!this.done && left() > 0) {
      const t = performance.now();
      if (!this.posedFigs) { this.layout(); this.phases.setup += performance.now() - t; continue; }
      if (!this.A) {
        if (this.gpu?.reading) break;
        if (!this.gpu) this.build(); else this.pass(budget === Infinity);
        this.phases.render += performance.now() - t; continue;
      }
      if (this.queue.length) {
        const cleaner = new Cleaner(this);
        while (this.queue.length && left() > 0) { const [sheet, ci] = this.queue.shift()!; cleaner.cell(sheet, ci); }
        this.phases.clean += performance.now() - t;
        continue;
      }
      if (!this.packed) this.pack();
      while (this.packed!.next < this.packed!.frames.length && left() > 0) this.crop(this.packed!.frames[this.packed!.next++]);
      this.phases.clean += performance.now() - t;
      if (this.packed!.next === this.packed!.frames.length) this.finish();
    }
    return this.done;
  }

  /**
   * Render cells on shelves, one size per animation and direction (a body lying dead is wide and low, a raised blade
   * tall and narrow), so the render target stays small. `pack` then crops each frame to what it draws.
   */
  private layout() {
    const cells = this.figs.map(f => {
      const frames = posed(f), fit = new Map<string, Cell>();
      for (const a of animOrder) for (let d = 0; d < DIRS; d++) fit.set(`${a}${d}`, fitCell(f, frames.filter(p => p.anim === a && p.dir === d), this.sin, this.cos, this.px));
      return { f, frames, cells: frames.map(p => fit.get(`${p.anim}${p.dir}`)!) };
    });
    const area = cells.reduce((n, c) => n + c.cells.reduce((m, cell) => m + cell.w * cell.h, 0), 0);
    while (this.W < 8192 && area * 1.25 > this.W * MAX_HEIGHT * 0.5) this.W *= 2;
    let x = 0, y = 0, shelf = 0;
    this.posedFigs = cells.map(({ f, frames, cells }) => {
      const rects = cells.map((cell): FrameRect => {
        if (x + cell.w > this.W) { x = 0; y += shelf; shelf = 0; }
        const r = { x, y, w: cell.w, h: cell.h, ax: cell.ax, ay: cell.ay, below: 0, top: 0 };
        x += cell.w; shelf = Math.max(shelf, cell.h);
        return r;
      });
      this.sheets.set(f.id, { figure: f, frames: rects, height: 1, span: restSpan(f, frames[0]) });
      return frames;
    });
    this.H = Math.ceil((y + shelf) / 4) * 4;
  }

  private build() {
    const { W, H, sin, cos, px } = this;
    const camUp = new THREE.Vector3(0, cos, -sin), scene = new THREE.Scene();
    this.figs.forEach((f, fi) => {
      const sheet = this.sheets.get(f.id)!, frames = this.posedFigs![fi];
      // Each instance draws only inside its own cell, so a raised blade never bleeds into a neighbour.
      const cells = new THREE.InstancedBufferAttribute(new Float32Array(sheet.frames.flatMap(c => [c.x, c.y, c.x + c.w, c.y + c.h])), 4);
      f.parts.forEach((p, k) => {
        const geo = p.geo.clone(), n = geo.attributes.position.count;
        geo.setAttribute('aPart', new THREE.BufferAttribute(new Float32Array(n).fill(k + 1), 1));
        const g = new Float32Array(n * 2); for (let i = 0; i < n; i++) { g[i * 2] = grain[p.mat]?.[0] ?? 0; g[i * 2 + 1] = f.scale; }
        geo.setAttribute('aGrain', new THREE.BufferAttribute(g, 2));
        geo.setAttribute('aCell', cells);
        const m = new THREE.InstancedMesh(geo, undefined, sheet.frames.length);
        m.frustumCulled = false; scene.add(m);
        frames.forEach((fr, i) => {
          const cell = sheet.frames[i];
          // The feet sit on a pixel corner of the cell, in the camera plane through the origin.
          const u = (cell.x + cell.ax - W / 2) / px, v = (cell.y + cell.ay - H / 2) / px;
          m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(new THREE.Vector3(u, 0, 0).addScaledVector(camUp, v)).multiply(fr.parts[k]));
        });
      });
    });
    const cam = new THREE.OrthographicCamera(-W / 2 / px, W / 2 / px, H / 2 / px, -H / 2 / px, 0.1, 40);
    cam.position.set(0, sin * D, cos * D); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
    const { ids, nrm } = baker(), band = Math.min(H, Math.max(4, Math.floor(BAND_TEXELS / W)));
    const rt = new THREE.WebGLRenderTarget(W, band, { depthBuffer: true, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false });
    const out: [Uint8Array, Uint8Array] = [new Uint8Array(W * H * 4), new Uint8Array(W * H * 4)], passes: [THREE.ShaderMaterial, Uint8Array][] = [];
    for (const [mat, buf] of [[ids, out[0]], [nrm, out[1]]] as const) for (let y = 0; y < H; y += band) passes.push([mat, buf.subarray(y * W * 4, Math.min(H, y + band) * W * 4)]);
    this.gpu = { scene, cam, rt, band, out, passes, next: 0 };
  }

  /**
   * One GPU pass and its read back: part ids, depth and grain first, then normals. A bake spread over frames reads back
   * asynchronously, so waiting for the GPU never blocks a frame; the next step starts once the pixels are in.
   */
  private pass(sync: boolean) {
    const g = this.gpu!, { renderer } = baker(), { W, H, px } = this, [mat, buf] = g.passes[g.next];
    const y0 = (g.next % Math.ceil(H / g.band)) * g.band, rows = buf.length / (W * 4);
    g.next++;
    grainScale.value = px / PX; bandY.value = y0;
    g.cam.top = (y0 + g.band - H / 2) / px; g.cam.bottom = (y0 - H / 2) / px; g.cam.updateProjectionMatrix();
    renderer.setRenderTarget(g.rt);
    g.scene.overrideMaterial = mat;
    renderer.clear(); renderer.render(g.scene, g.cam);
    if (sync) renderer.readRenderTargetPixels(g.rt, 0, 0, W, rows, buf);
    else { g.reading = true; void renderer.readRenderTargetPixelsAsync(g.rt, 0, 0, W, rows, buf).then(() => { g.reading = false; if (g.next === g.passes.length) this.read(); }); }
    renderer.setRenderTarget(null);
    if (sync && g.next === g.passes.length) this.read();
  }
  private read() {
    const g = this.gpu!;
    g.rt.dispose();
    for (const o of g.scene.children) { (o as THREE.InstancedMesh).geometry.dispose(); (o as THREE.InstancedMesh).dispose(); }
    [this.A, this.B] = g.out;
    for (const sheet of this.sheets.values()) sheet.frames.forEach((_, i) => this.queue.push([sheet, i]));
  }

  /** Crop every frame to what it draws and place the crops on shelves, tallest first: about a third of the render cells. */
  private pack() {
    const W = this.W, frames = [...this.sheets.values()].flatMap(s => s.frames), box = (f: FrameRect) => this.drawn.get(f)!;
    const order = frames.filter(f => box(f)[2] >= box(f)[0]).sort((a, b) => (box(b)[3] - box(b)[1]) - (box(a)[3] - box(a)[1]));
    let x = 0, y = 0, shelf = 0;
    const at = new Map<FrameRect, [number, number]>();
    for (const f of order) {
      const [x0, y0, x1, y1] = box(f), w = x1 - x0 + 1, h = y1 - y0 + 1;
      if (x + w > W) { x = 0; y += shelf; shelf = 0; }
      at.set(f, [x, y]); x += w; shelf = Math.max(shelf, h);
    }
    const H = Math.max(4, Math.ceil((y + shelf) / 4) * 4);
    this.packed = { frames, at, H, data: new Uint8Array(W * H * 4), next: 0 };
  }
  /** Copy one frame's crop into the packed atlas; a frame that draws nothing keeps an empty rect. */
  private crop(f: FrameRect) {
    const { at, data } = this.packed!, A = this.A!, W = this.W, [x0, y0, x1, y1] = this.drawn.get(f)!, to = at.get(f);
    if (!to) { Object.assign(f, { x: 0, y: 0, w: 0, h: 0, ax: 0, ay: 0 }); return; }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    for (let r = 0; r < h; r++) { const from = ((f.y + y0 + r) * W + f.x + x0) * 4; data.set(A.subarray(from, from + w * 4), ((to[1] + r) * W + to[0]) * 4); }
    Object.assign(f, { x: to[0], y: to[1], w, h, ax: f.ax - x0, ay: f.ay - y0 });
  }
  private finish() {
    for (const sheet of this.sheets.values()) {
      const idle = sheet.frames.slice(0, animFrames.idle * DIRS);
      sheet.height = Math.max(...idle.map(f => f.top)) / (this.px * this.cos);
    }
    const { frames, H, data } = this.packed!;
    this.done = {
      width: this.W, height: H, data, sheets: this.sheets, pitch: this.pitch, px: this.px, ms: performance.now() - this.t0,
      phases: this.phases, cells: frames.length, clipped: this.clipped,
    };
    this.A = this.B = new Uint8Array(0);
  }

  /** For the cleaner: the GPU passes, which it overwrites cell by cell with the cleaned texels. */
  get io() { return { A: this.A!, B: this.B!, W: this.W, sin: this.sin, cos: this.cos, clipped: this.clipped, drawn: this.drawn }; }
}

/** Bake every base figure at `pitch` in one go. */
export function bake(pitch: number, figs: Figure[] = figures(), px = PX): Atlas { return new BakeJob(figs, pitch, px).step()!; }

/**
 * Per cell: tones from the surface normal and grain, inner edges, stray pixels, then the outline; writes palette
 * entries and folded normals over the cell's own render texels, which it has read by then.
 * Works on a grid padded by one empty pixel, inside each cell's occupied box, so neighbour reads need no bounds checks.
 */
class Cleaner {
  private last?: Sheet;
  private matOf!: Int16Array; private smear!: Uint8Array; private amount!: Float32Array; private entry!: Int16Array;
  private part!: Uint8Array; private tone!: Int8Array; private depth!: Float32Array; private src!: Int32Array; private edge!: Uint8Array; private oct!: Uint8Array;
  constructor(private readonly job: BakeJob) {}
  private prepare(sheet: Sheet) {
    if (this.last === sheet) return;
    this.last = sheet;
    const parts = sheet.figure.parts;
    this.matOf = Int16Array.from([-1, ...parts.map(p => mats.indexOf(p.mat))]);
    this.smear = Uint8Array.from([0, ...parts.map(p => (p.tag === 'smear' ? 1 : 0))]);
    this.amount = Float32Array.from([0, ...parts.map(p => grain[p.mat]?.[1] ?? 0)]);
    this.entry = Int16Array.from([0, ...parts.map(p => mats.indexOf(p.mat) * RAMP)]);
    const n = Math.max(...sheet.frames.map(f => (f.w + 2) * (f.h + 2)));
    this.part = new Uint8Array(n); this.tone = new Int8Array(n); this.depth = new Float32Array(n); this.src = new Int32Array(n); this.edge = new Uint8Array(n); this.oct = new Uint8Array(n * 2);
  }
  cell(sheet: Sheet, ci: number) {
    this.prepare(sheet);
    const { A, B, W, sin, cos, clipped, drawn } = this.job.io;
    const { matOf, smear, amount, entry, part, tone, depth, src, edge, oct } = this;
    const cell = sheet.frames[ci], { w, h } = cell, P = w + 2;
    const N = [1, -1, P, -P];
    // Outline neighbours, the pixel below first: an outline above the figure takes the softer shade.
    const below = [-P, -1, 1, P];
    part.fill(0, 0, P * (h + 2));
    let x0 = w, x1 = -1, y0 = h, y1 = -1;
    for (let y = 0; y < h; y++) {
      let o = ((cell.y + y) * W + cell.x) * 4, i = (y + 1) * P + 1;
      for (let x = 0; x < w; x++, o += 4, i++) {
        if (!A[o + 3]) continue;
        const k = A[o]; part[i] = k; src[i] = i; depth[i] = (A[o + 1] / 255) * 2 * DEPTH - DEPTH;
        octahedral(B[o], B[o + 1], B[o + 2], oct, i * 2);
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (A[o + 2] === 0) { tone[i] = 0; continue; }
        // Occlusion only: undersides and grazing edges darken, tops catch a glint. Direction and colour of light come at runtime.
        const ny = B[o + 1] / 127.5 - 1, nz = B[o + 2] / 127.5 - 1;
        const v = 0.62 + 0.18 * ny + 0.18 * (ny * sin + nz * cos - 0.4) + ((A[o + 2] - 1) / 254 - 0.5) * amount[k];
        tone[i] = smear[k] ? 2 : v >= 0.86 ? 3 : v >= 0.52 ? 2 : v >= 0.3 ? 1 : 0;
      }
    }
    for (let y = 0; y < h; y++) { const o = ((cell.y + y) * W + cell.x) * 4; A.fill(0, o, o + w * 4); }
    if (x1 < 0) { cell.below = cell.top = 0; drawn.set(cell, [0, 0, -1, -1]); return; }
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
    let minRow = h, maxRow = -1, minCol = w, maxCol = -1, clip = false;
    const ox0 = Math.max(0, x0 - 1), ox1 = Math.min(w - 1, x1 + 1), oy0 = Math.max(0, y0 - 1), oy1 = Math.min(h - 1, y1 + 1);
    for (let y = oy0; y <= oy1; y++) for (let x = ox0, i = row(y) + ox0; x <= ox1; x++, i++) {
      let k = part[i], shade = 1 + tone[i], from = src[i];
      if (!k) {
        let j = -1;
        for (const dn of below) { const q = part[i + dn]; if (q && !smear[q]) { j = i + dn; break; } }
        if (j < 0) continue;
        k = part[j]; shade = j === i - P ? 1 : 0; from = src[j];
      }
      const o = ((cell.y + y) * W + cell.x + x) * 4, e = entry[k] + shade;
      A[o] = oct[from * 2]; A[o + 1] = oct[from * 2 + 1]; A[o + 2] = e & 255; A[o + 3] = 1 + (e >> 8);
      if (y < minRow) minRow = y; if (y > maxRow) maxRow = y; if (x < minCol) minCol = x; if (x > maxCol) maxCol = x;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) clip = true;
    }
    cell.below = maxRow < 0 ? 0 : Math.max(0, cell.ay - minRow);
    cell.top = maxRow < 0 ? 0 : maxRow + 1 - cell.ay;
    drawn.set(cell, [minCol, minRow, maxCol, maxRow]);
    if (clip) { const an = animOrder.find(a => ci < (animOffset[a] + animFrames[a]) * DIRS)!; const key = `${sheet.figure.id}:${an}`; if (!clipped.includes(key)) clipped.push(key); }
  }
}
