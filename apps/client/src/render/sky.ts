import * as THREE from 'three';
import type { Key } from './clock-style.ts';

/**
 * A storybook sky on a dome that follows the camera: gradient, sun disc, an oversized moon, pixel stars that twinkle by
 * one step, and banded cumulus whose edges catch a low sun. It renders at the low internal resolution, so every
 * feature is drawn in whole pixels, and the palette pass snaps its colours.
 */
const vertex = /* glsl */`
varying vec3 vDir;
void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w * 0.9999; }`;
const fragment = /* glsl */`
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunCol; uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform float uSunVis; uniform float uMoonVis; uniform float uStars; uniform float uTime; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uCloud;
varying vec3 vDir;
float h21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 45758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ return noise(p) * 0.55 + noise(p * 2.1 + 3.7) * 0.3 + noise(p * 4.3 + 8.1) * 0.15; }
uniform float uTimeC; uniform float uStreak; uniform float uPix;
vec2 h22(vec2 p){ return fract(sin(vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)))) * 43758.5453); }
// Rounded lumps: 1 at a feature point, falling to 0 at the cell walls. Summed over two sizes they make cumulus heads.
float lumps(vec2 p){
  vec2 i = floor(p), f = fract(p); float d = 1.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(float(x), float(y)); d = min(d, length(g + h22(i + g) - f)); }
  return 1.0 - clamp(d, 0.0, 1.0);
}
// Clouds live in direction space (bearing, elevation), so they keep their round shapes down to the horizon instead of
// stretching into bands. The sample point snaps to dashes three pixels wide and one tall, staggered row to row: the
// references' ragged, hand-placed cloud edges.
vec2 cloudUv(vec3 d){
  float az = atan(d.x, -d.z), el = asin(clamp(d.y, -1.0, 1.0));
  if (uPix > 0.0) { float row = floor(el / uPix); el = (row + 0.5) * uPix; float w = uPix * 3.0, o = mod(row, 2.0) * 0.5; az = (floor(az / w + o) + 0.5 - o) * w; }
  return vec2(az * 3.4 / sqrt(uStreak), el * 7.5 * sqrt(uStreak)) + vec2(uTimeC * 0.004, 0.0);
}
float cloudDensity(vec2 p){
  float mass = noise(p * 0.55) * 0.6 + noise(p * 1.3 + 4.1) * 0.4;
  float puff = lumps(p * 1.6) * 0.62 + lumps(p * 3.7 + 9.0) * 0.38;
  return mass * 0.6 + puff * 0.4;
}
void main(){
  vec3 d = normalize(vDir);
  float el = d.y;
  // Gradient in three bands so the palette pass does not band it at random.
  float t = clamp(el / 0.55, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, t));
  if (el < 0.0) c = mix(uHorizon, uGround, smoothstep(0.0, 0.08, -el));
  // Sun: hard disc plus a warm glow that hugs the horizon.
  float sa = dot(d, uSunDir);
  c += uSunCol * uSunVis * (smoothstep(0.9989, 0.9992, sa) * 2.4 + pow(max(sa, 0.0), 24.0) * 0.55 + pow(max(sa, 0.0), 4.0) * 0.12 * (1.0 - t));
  // Stars: one-pixel points on a direction grid, twinkling by one step; hidden near the horizon haze.
  if (uStars > 0.01 && el > 0.04) {
    vec2 g = floor(vec2(atan(d.x, -d.z), asin(el)) * 220.0);
    float s = h21(g);
    if (s > 0.9965) c += vec3(0.85, 0.9, 1.0) * uStars * (0.55 + 0.45 * step(0.5, fract(s * 91.0 + uTime * 0.6))) * smoothstep(0.04, 0.2, el);
  }
  // Moon: far larger than life, with two darker maria and a pale halo.
  float ma = dot(d, uMoonDir);
  if (uMoonVis > 0.01) {
    float disc = smoothstep(0.9955, 0.9958, ma);
    vec3 mx = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), my = cross(mx, uMoonDir);
    vec2 mp = vec2(dot(d, mx), dot(d, my)) / 0.094;
    float maria = step(0.18, noise(mp * 3.0 + 2.0) * 0.6 + noise(mp * 7.0) * 0.4 - 0.35);
    vec3 moon = mix(vec3(0.93, 0.9, 0.78), vec3(0.62, 0.66, 0.74), maria * 0.8);
    c = mix(c, moon, disc * uMoonVis);
    c += vec3(0.42, 0.5, 0.75) * pow(max(ma, 0.0), 160.0) * 0.5 * uMoonVis * (1.0 - disc);
  }
  // Cumulus in three tones: a rim of light on the side facing the sun in elevation (tops by day as in ref-1, undersides
  // when the sun is low as in ref-2), a shaded base on the far side and in the dense core, and a body between.
  if (uCloud > 0.01 && el > 0.005) {
    vec2 p = cloudUv(d);
    // Clouds part around the moon, so its disc is never barred.
    float n = cloudDensity(p) - 0.3 * uMoonVis * smoothstep(0.975, 0.998, dot(d, uMoonDir)), cover = 0.76 - uCloud * 0.2;
    if (n > cover) {
      vec2 up = vec2(0.0, sign(uSunDir.y - d.y));
      float lit = step(cloudDensity(p + up * 0.09), cover + 0.01);
      // By day the body is bright (white cumulus with soft blue bases, ref-1); with the sun low it is slate with darker
      // cores and lit edges (ref-2).
      float day = smoothstep(0.2, 0.6, uSunDir.y);
      float base = max(step(cloudDensity(p - up * 0.12), cover + 0.02), (1.0 - day) * step(cover + 0.1, n));
      vec3 cc = mix(mix(uCloudShade * 1.45, mix(uCloudShade, uCloudLit, 0.72), day), uCloudShade, base);
      cc = mix(cc, uCloudLit, lit);
      if (el > 0.02) c = cc;
    }
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export class Sky {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
    uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uMoonDir: { value: new THREE.Vector3(0, 0.4, -1).normalize() },
    uSunVis: { value: 0 }, uMoonVis: { value: 0 }, uStars: { value: 0 }, uTime: { value: 0 }, uTimeC: { value: 0 }, uStreak: { value: 1 }, uPix: { value: 0 },
    uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() }, uCloud: { value: 0.6 },
  };
  constructor() {
    const mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: vertex, fragmentShader: fragment, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(380, 48, 24), mat);
    this.mesh.renderOrder = -1000; this.mesh.frustumCulled = false;
  }
  /** `pixelAngle`: radians one render pixel covers, so cloud edges break into whole-pixel dashes. */
  update(key: Key, sunDir: THREE.Vector3, moonDir: THREE.Vector3, camera: THREE.Camera, time: number, pixelAngle = 0) {
    const u = this.uniforms; u.uPix.value = pixelAngle;
    u.uZenith.value.set(key.zenith); u.uHorizon.value.set(key.horizon); u.uGround.value.set(key.haze);
    u.uSunCol.value.set(key.sun); u.uSunDir.value.copy(sunDir);
    u.uSunVis.value = key.sunElev > -3 && key.moon < 0.5 ? 1 : 0;
    u.uMoonVis.value = key.moon; u.uMoonDir.value.copy(moonDir);
    u.uStars.value = key.stars; u.uTime.value = time; u.uTimeC.value = time; u.uStreak.value = key.streak;
    u.uCloudLit.value.set(key.cloudLit); u.uCloudShade.value.set(key.cloudShade); u.uCloud.value = key.clouds;
    this.mesh.position.copy(camera.position);
  }
}
