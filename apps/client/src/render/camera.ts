import * as THREE from 'three';
import { stops, type Stop, type StopFog } from './stops.ts';

/**
 * Height-banded fog for every material that takes scene fog. `x`..`y`: world heights the fog fades out between, so
 * a far keep stands clear above the mist (no band when y <= x). `z`..`w`: a thin distance haze that ignores height, so
 * what rises above the band still sits back in the air (off when w <= z). One shared object: three copies uniform
 * values when it clones ShaderLib uniforms, but keeps a plain object by reference.
 */
export const fogBand = { x: 0, y: 0, z: 0, w: 0 };
for (const lib of Object.values(THREE.ShaderLib)) if ('fogColor' in lib.uniforms) (lib.uniforms as Record<string, THREE.IUniform>).fogBand = { value: fogBand };
THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth; varying float vFogY;
#endif`;
THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogY = ((mvPosition.xyz - viewMatrix[3].xyz) * mat3(viewMatrix)).y;
#endif`;
THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor; uniform vec4 fogBand; varying float vFogDepth; varying float vFogY;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear; uniform float fogFar;
  #endif
#endif`;
THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  if (fogBand.y > fogBand.x) fogFactor *= 1.0 - smoothstep(fogBand.x, fogBand.y, vFogY);
  if (fogBand.w > fogBand.z) fogFactor = max(fogFactor, smoothstep(fogBand.z, fogBand.w, vFogDepth));
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;

/**
 * A lens about a point: aimed at `ahead` tiles in front of the hero at height `look`, standing `dist` back from that
 * point at `angle` above level. Orthographic stops are a 1° lens far enough away to frame what the orthographic camera
 * frames, so any stop eases into any other by interpolating lenses.
 */
type Lens = { fov: number; dist: number; angle: number; ahead: number; look: number };
const ORTHO_FOV = 1;
const smooth = (x: number) => x * x * (3 - 2 * x);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const lerpLog = (a: number, b: number, k: number) => Math.exp(lerp(Math.log(a), Math.log(b), k));
const turnBetween = (a: number, b: number) => Math.atan2(Math.sin(b - a), Math.cos(b - a));

function lensOf(stop: Stop, viewH: number): Lens {
  if (stop.projection === 'ortho') return { fov: ORTHO_FOV, dist: viewH / (2 * Math.tan(THREE.MathUtils.degToRad(ORTHO_FOV) / 2)), angle: stop.pitch, ahead: 0, look: 0 };
  const e = stop.eye, run = e.back + e.ahead, rise = e.up - e.look;
  return { fov: e.fov, dist: Math.hypot(run, rise), angle: Math.atan2(rise, run), ahead: e.ahead, look: e.look };
}
const mixLens = (a: Lens, b: Lens, k: number): Lens => ({ fov: lerpLog(a.fov, b.fov, k), dist: lerpLog(a.dist, b.dist, k), angle: lerp(a.angle, b.angle, k), ahead: lerp(a.ahead, b.ahead, k), look: lerp(a.look, b.look, k) });
/** Seconds per transition: the Vista dolly is long, a pitch change between orthographic stops is short. */
const duration = (a: Stop, b: Stop) => (a.vista || b.vista ? 0.9 : a.projection === 'ortho' && b.projection === 'ortho' ? 0.25 : 0.6);
const TURN = Math.PI / 4, TURN_S = 0.35;

/**
 * Owns both cameras and moves between stops. Orthographic stops at rest use the pixel-snapped orthographic camera;
 * perspective stops, and every transition that touches one, use the perspective camera.
 */
export class CameraRig {
  readonly ortho = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 120);
  readonly persp = new THREE.PerspectiveCamera(40, 1, 0.1, 700);
  stop: Stop = stops.play;
  private from: Stop = stops.play;
  private fromLens: Lens = lensOf(stops.play, 10);
  private lens: Lens = this.fromLens;
  private t = 1;
  /** The player's heading for free-yaw stops, in 45° steps; kept while visiting a north-up stop. */
  private heading = 0;
  private yawFrom = 0;
  private yawT = 1;
  /** Radians the view is turned from north-up; positive turns the view to the left. Eased. */
  yaw = 0;
  /** How far the picture is into the Vista: 0 away from it, 1 there. */
  vista = 0;
  /** How much of the way into a perspective stop the lens is: 0 in orthographic stops, 1 between perspective ones. */
  perspShare = 0;
  /** The camera drawing this frame. */
  active: THREE.Camera = this.ortho;
  /** Distance from the lens to the hero's head; fog is measured from the hero. */
  heroDist = 0;
  /** This frame's scene fog, from the hero outwards, or none in orthographic views. */
  fog: (StopFog & { haze?: [number, number] }) | null = null;

  /** The yaw the view is easing towards: the heading in free-yaw stops, north elsewhere. */
  get yawGoal() { return this.stop.yaw === 'free' ? this.heading : 0; }
  /** The pitch figures are baked at: the transition's nearer end. */
  get figurePitch() { return smooth(this.t) < 0.5 ? this.from.figures : this.stop.figures; }
  get settled() { return this.t >= 1; }

  set(stop: Stop) {
    if (stop === this.stop) return;
    this.fromLens = this.lens; this.from = this.stop; this.stop = stop; this.t = 0;
    this.yawFrom = this.yaw; this.yawT = 0;
  }
  /** Turn the heading by 45° steps (+1 turns the view left). Only free-yaw stops turn. */
  turn(steps: number) {
    if (this.stop.yaw !== 'free') return;
    this.yawFrom = this.yaw; this.heading = Math.round((this.heading + steps * TURN) / TURN) * TURN; this.yawT = 0;
  }
  /** Set the heading outright (the lab's `yaw=`), with no ease. */
  face(yaw: number) { this.heading = Math.round(yaw / TURN) * TURN; this.yaw = this.yawFrom = this.yawGoal; this.yawT = 1; }

  /**
   * Place this frame's camera around `center` (the hero's feet). `viewH` is the buffer's height in tiles, `bufW` and
   * `bufH` in pixels, `kick` the camera kick in whole render pixels.
   */
  place(center: THREE.Vector3, viewH: number, bufW: number, bufH: number, kick: THREE.Vector2, dt: number) {
    this.t = Math.min(1, this.t + dt / duration(this.from, this.stop));
    this.yawT = Math.min(1, this.yawT + dt / TURN_S);
    this.yaw = this.yawFrom + turnBetween(this.yawFrom, this.yawGoal) * smooth(this.yawT);
    const k = smooth(this.t);
    this.vista = this.stop.vista ? k : this.from.vista ? 1 - k : 0;
    const p0 = this.from.projection === 'persp' ? 1 : 0, p1 = this.stop.projection === 'persp' ? 1 : 0;
    this.perspShare = lerp(p0, p1, k);
    const to = lensOf(this.stop, viewH);
    this.lens = this.t >= 1 ? to : mixLens(this.fromLens, to, k);
    const orthoNow = this.stop.projection === 'ortho' && (this.t >= 1 || this.from.projection === 'ortho');
    if (orthoNow) {
      this.placeOrtho(center, this.lens.angle, bufH, kick);
      this.active = this.ortho; this.fog = null; this.heroDist = 0;
      return;
    }
    this.placeLens(this.lens, center, bufW / bufH);
    this.active = this.persp;
    this.heroDist = this.persp.position.distanceTo(new THREE.Vector3(center.x, center.y + 0.9, center.z));
    const a = this.from.projection === 'persp' ? this.from.fog : this.stop.projection === 'persp' ? this.stop.fog : null;
    const b = this.stop.projection === 'persp' ? this.stop.fog : a;
    if (!a || !b) { this.fog = null; return; }
    const top = (k < 0.5 ? a : b).top;
    // Above the fog band the land still takes the Vista's haze, so far ridges keep their depth.
    this.fog = { near: lerp(a.near, b.near, k), far: lerp(a.far, b.far, k), top, haze: top ? [stops.scenery.fog.near, stops.scenery.fog.far] : undefined };
  }

  /** The Vista's lens at rest, for the lab's lookout inset. */
  placeVista(center: THREE.Vector3, aspect: number) { this.placeLens(lensOf(stops.scenery, 10), center, aspect, 0); }

  private placeLens(l: Lens, center: THREE.Vector3, aspect: number, yaw = this.yaw) {
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), run = Math.cos(l.angle) * l.dist;
    const tx = center.x + fx * l.ahead, ty = center.y + l.look, tz = center.z + fz * l.ahead;
    const p = this.persp;
    p.position.set(tx - fx * run, ty + Math.sin(l.angle) * l.dist, tz - fz * run);
    const head = Math.hypot(p.position.x - center.x, p.position.y - center.y - 0.9, p.position.z - center.z);
    p.fov = l.fov; p.aspect = aspect; p.near = Math.min(40, Math.max(0.06, head * 0.05)); p.far = l.dist + 700;
    p.updateProjectionMatrix();
    p.lookAt(tx, ty, tz);
    p.updateMatrixWorld();
  }

  /** Pixel-snapped orthographic camera: the hero's feet land on a whole render pixel, the kick after the snap. */
  private placeOrtho(center: THREE.Vector3, pitch: number, bufH: number, kick: THREE.Vector2) {
    const c = this.ortho, cp = Math.cos(pitch);
    const offset = new THREE.Vector3(Math.sin(this.yaw) * cp, Math.sin(pitch), Math.cos(this.yaw) * cp).multiplyScalar(19.5);
    c.position.copy(center).add(offset);
    c.lookAt(center);
    c.updateMatrixWorld();
    const upp = (c.top - c.bottom) / bufH;
    const right = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
    const sx = center.dot(right), sy = center.dot(up);
    const snapped = center.clone().addScaledVector(right, Math.round(sx / upp) * upp - sx).addScaledVector(up, Math.round(sy / upp) * upp - sy);
    c.position.copy(snapped).add(offset).addScaledVector(right, Math.round(kick.x) * upp).addScaledVector(up, Math.round(kick.y) * upp);
    c.updateMatrixWorld();
  }
}
