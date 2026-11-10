import * as THREE from 'three';
import { fieldFragment, fieldVertex, fieldUniforms } from './lightfield.ts';
import { spriteLight } from './figures/sprites.ts';

/**
 * Footfall dust, strike sparks and the puff of a collapse. Every particle is a whole render pixel (1 or 2 px) snapped
 * to the pixel grid, lit by the same sun, sky and light field as the figures, and fades by dropping out, not by alpha.
 */
const MAX = 512;
const vertex = /* glsl */`
${fieldVertex}
attribute vec3 aColor; attribute vec2 aLife; attribute float aSize;
uniform vec2 uRes;
varying vec3 vColor; varying vec2 vLife; flat varying float vSeed;
void main() {
  vColor = aColor; vLife = aLife; vSeed = float(gl_VertexID); vFPos = position; vFNrm = vec3(0.0, 1.0, 0.0);
  vec4 clip = projectionMatrix * viewMatrix * vec4(position, 1.0);
  vec2 p = (clip.xy / clip.w * 0.5 + 0.5) * uRes;
  // Snap to a pixel centre (odd sizes) or corner (even sizes).
  vec2 snapped = aSize > 1.5 ? floor(p + 0.5) : floor(p) + 0.5;
  clip.xy = ((snapped / uRes) * 2.0 - 1.0) * clip.w;
  gl_Position = clip;
  gl_PointSize = aLife.y > 0.0 ? aSize : 0.0;
}`;
const fragment = /* glsl */`
${fieldFragment}
uniform vec3 uSunCol; uniform vec3 uSky;
varying vec3 vColor; varying vec2 vLife; flat varying float vSeed;
float h(float n) { return fract(sin(n * 91.345) * 47453.5453); }
void main() {
  // Drop out instead of fading: each particle is a full pixel until its own moment in the last third of its life.
  if (vLife.y <= 0.0 || vLife.x / vLife.y > 0.6 + 0.4 * h(vSeed)) discard;
  float lv;
  vec3 light = (uSunCol * 0.7 + uSky) * 0.31831 + (uFOn > 0.5 ? fieldAt(vFPos.xz, 0.0, lv) * uFGain : vec3(0.0));
  gl_FragColor = vec4(vColor * light, 1.0);
}`;

export class Particles {
  readonly points: THREE.Points;
  private readonly pos = new Float32Array(MAX * 3);
  private readonly vel = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly life = new Float32Array(MAX * 2);
  private readonly size = new Float32Array(MAX);
  private readonly grav = new Float32Array(MAX);
  private next = 0;
  constructor() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aLife', new THREE.BufferAttribute(this.life, 2));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    const mat = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms: { ...fieldUniforms, ...spriteLight } });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    this.points.onBeforeRender = renderer => { const rt = renderer.getRenderTarget(); if (rt) spriteLight.uRes.value.set(rt.width, rt.height); };
  }
  private emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: THREE.Color, life: number, size: number, grav: number) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.pos.set([x, y, z], i * 3); this.vel.set([vx, vy, vz], i * 3); this.col.set([color.r, color.g, color.b], i * 3);
    this.life.set([0, life], i * 2); this.size[i] = size; this.grav[i] = grav;
  }
  /** A footfall: a few pixels of the ground kicked up behind the foot. */
  dust(at: THREE.Vector3, back: THREE.Vector2, count = 4) {
    const c = new THREE.Color('#a6936f');
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2, r = 0.05 + Math.random() * 0.08;
      this.emit(at.x + Math.cos(a) * r * 0.6, 0.03, at.z + Math.sin(a) * r * 0.4, back.x * 0.5 + Math.cos(a) * 0.25, 0.35 + Math.random() * 0.3, back.y * 0.5 + Math.sin(a) * 0.15, k % 3 ? c : new THREE.Color('#c2ae87'), 260 + Math.random() * 160, 1, 1.4);
    }
  }
  /** Bright chips where a blow lands or is turned aside. */
  sparks(at: THREE.Vector3, dir: THREE.Vector2, blocked: boolean) {
    const c = new THREE.Color(blocked ? '#fbf4e2' : '#ffe2a0');
    for (let k = 0; k < (blocked ? 6 : 4); k++) {
      const s = (Math.random() - 0.5) * 1.6;
      this.emit(at.x, at.y, at.z, dir.x * 1.4 - dir.y * s, 0.6 + Math.random() * 0.9, dir.y * 1.4 + dir.x * s, c, 140 + Math.random() * 120, 1, 3);
    }
  }
  /** The puff when a body hits the ground. */
  collapse(at: THREE.Vector3, width: number) {
    const c = new THREE.Color('#8b795b');
    for (let k = 0; k < 12; k++) {
      const u = (Math.random() - 0.5) * width, side = Math.random() < 0.5 ? -1 : 1;
      this.emit(at.x + u, 0.04, at.z + (Math.random() - 0.5) * 0.25, side * (0.2 + Math.random() * 0.4), 0.25 + Math.random() * 0.25, (Math.random() - 0.5) * 0.2, k % 4 ? c : new THREE.Color('#a6936f'), 380 + Math.random() * 260, k % 5 ? 1 : 2, 0.9);
    }
  }
  update(dtMs: number) {
    const dt = dtMs / 1000;
    for (let i = 0; i < MAX; i++) {
      const L = this.life[i * 2 + 1]; if (L <= 0) continue;
      const age = (this.life[i * 2] += dtMs);
      if (age >= L) { this.life[i * 2 + 1] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      for (let k = 0; k < 3; k++) this.pos[i * 3 + k] += this.vel[i * 3 + k] * dt;
      if (this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] = 0; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.aLife.needsUpdate = true; g.attributes.aColor.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
  }
}
