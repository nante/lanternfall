import * as THREE from 'three';
import type { Key } from './clock-style.ts';

/**
 * A storybook sky on a dome that follows the camera: gradient, sun disc, an oversized cratered moon with a dithered
 * glow, stars in three brightnesses, and billowing cumulus lit from the sun or the moon. It renders at the low internal resolution, so every
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
float bayer4(vec2 p){ int i = int(mod(p.x, 4.0)) + int(mod(p.y, 4.0)) * 4;
  float m[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.); return m[i] / 16.0; }
// A soft glow drawn as a few flat steps with an ordered dither between them, so the palette pass shows a dithered
// halo instead of hard concentric bands.
float dithered(float g, float steps){ return floor(g * steps + bayer4(gl_FragCoord.xy)) / steps; }
void main(){
  vec3 d = normalize(vDir);
  float el = d.y;
  float t = clamp(el / 0.55, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 1.0, t));
  if (el < 0.0) c = mix(uHorizon, uGround, smoothstep(0.0, 0.08, -el));
  // Sun: hard disc plus a warm glow that hugs the horizon.
  float sa = dot(d, uSunDir);
  c += uSunCol * uSunVis * (smoothstep(0.9989, 0.9992, sa) * 2.4 + dithered(pow(max(sa, 0.0), 24.0) * 0.55 + pow(max(sa, 0.0), 4.0) * 0.12 * (1.0 - t), 8.0));
  // Stars: one point per cell of a direction grid, in three brightnesses and faintly warm or cool; the brightest
  // twinkle by one step and throw a one-pixel cross. Hidden near the horizon haze and in the moon's glow.
  float ma = dot(d, uMoonDir);
  if (uStars > 0.01 && el > 0.04) {
    vec2 g = floor(vec2(atan(d.x, -d.z), asin(el)) * 220.0);
    float s = h21(g);
    float star = s > 0.9965 ? (s > 0.9993 ? 1.15 : s > 0.998 ? 0.75 : 0.42) : 0.0;
    float spark = 0.0;
    for (int k = 0; k < 4; k++) { vec2 o = k == 0 ? vec2(1, 0) : k == 1 ? vec2(-1, 0) : k == 2 ? vec2(0, 1) : vec2(0, -1); if (h21(g + o) > 0.9993) spark = 0.35; }
    float tw = s > 0.9993 ? 0.75 + 0.25 * step(0.5, fract(s * 91.0 + uTime * 0.6)) : 1.0;
    vec3 sc = mix(vec3(1.0, 0.92, 0.8), vec3(0.8, 0.9, 1.0), fract(s * 517.0));
    c += sc * uStars * max(star * tw, spark) * smoothstep(0.04, 0.2, el) * (1.0 - smoothstep(0.96, 0.99, ma) * uMoonVis);
  }
  // Moon: far larger than life. A cratered face in four values: maria, crater floors, rims catching light, highlands.
  // Low on the horizon it is a harvest moon (ref-5), higher it turns pale (ref-4).
  float low = 1.0 - smoothstep(0.07, 0.24, uMoonDir.y);
  vec3 moonTint = mix(vec3(0.92, 0.96, 1.0), vec3(1.0, 0.62, 0.3), low);
  if (uMoonVis > 0.01) {
    float R = 0.0945, ang = acos(clamp(ma, -1.0, 1.0));
    vec3 mx = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0))), my = cross(mx, uMoonDir);
    vec2 mp = vec2(dot(d, mx), dot(d, my)) / R;
    float r2 = dot(mp, mp);
    // Glow: a soft dithered falloff out to about three radii, warm when the moon is low.
    float glow = exp(-max(0.0, ang - R) / 0.05) * (1.0 - step(ang, R));
    c += mix(vec3(0.3, 0.42, 0.56), vec3(0.62, 0.38, 0.2), low) * dithered(glow * 0.42, 5.0) * uMoonVis;
    if (r2 < 1.0) {
      float maria = noise(mp * 2.2 + 2.0) * 0.65 + noise(mp * 5.0 + 7.0) * 0.35;
      vec2 cp = mp * 4.5 + 11.0, ci = floor(cp), cf = fract(cp);
      float rim = 0.0, floor_ = 0.0;
      for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
        vec2 o = vec2(float(x), float(y)), q = h22(ci + o);
        float rad = 0.18 + 0.3 * q.x;
        if (q.y > 0.6) continue;
        vec2 rel = o + q * 0.6 + 0.2 - cf; float dd = length(rel);
        floor_ = max(floor_, 1.0 - step(rad * 0.75, dd));
        // The rim catches the light on the side facing up and left.
        rim = max(rim, step(rad * 0.75, dd) * (1.0 - step(rad, dd)) * step(0.0, dot(rel, vec2(0.7, -0.7))));
      }
      float v = 3.0 - step(0.5, maria) * 2.0 - floor_ * 1.0 + rim * 1.0 - smoothstep(0.6, 1.0, r2) * 0.8;
      int tone = int(clamp(floor(v + 0.5), 0.0, 3.0));
      float value = tone == 3 ? 0.86 : tone == 2 ? 0.52 : tone == 1 ? 0.32 : 0.2;
      c = mix(c, moonTint * value, uMoonVis);
    }
  }
  // Cumulus in four tones. Lit from the light that rules the sky: the sun by day (tops lit, bases shaded, as in ref-1),
  // a low sun or the moon from the side they stand on, so edges facing them catch it (ref-2, ref-4, ref-5).
  if (uCloud > 0.01 && el > 0.005) {
    vec2 p = cloudUv(d);
    float n = cloudDensity(p) - 0.3 * uMoonVis * smoothstep(0.975, 0.998, ma), cover = 0.76 - uCloud * 0.2;
    if (n > cover && el > 0.02) {
      float day = smoothstep(0.2, 0.6, uSunDir.y) * (1.0 - uMoonVis);
      vec3 ld = uMoonVis > 0.5 ? uMoonDir : uSunDir;
      vec2 towards = normalize(mix(vec2(0.0001, 1.0), cloudUv(ld) - p, (1.0 - day) * step(0.001, length(cloudUv(ld) - p))));
      // Billows: denser away from the light and thinner towards it marks the lit side of each lump.
      float grad = cloudDensity(p - towards * 0.11) - cloudDensity(p + towards * 0.11);
      float tone = 0.45 + grad * 3.2 - (n - cover) * mix(1.6, 0.8, day);
      float lit = step(cloudDensity(p + towards * 0.09), cover + 0.01);
      tone = max(tone, lit);
      // Near the moon its light silvers the edges most.
      float near = uMoonVis > 0.5 ? 0.55 + 0.45 * pow(max(ma, 0.0), 6.0) : 1.0;
      float q = clamp(floor(tone * 3.99), 0.0, 3.0) / 3.0;
      vec3 shade = mix(uCloudShade, uCloudShade * 1.45, day);
      vec3 cc = mix(shade, mix(mix(uCloudShade, uCloudLit, 0.7), uCloudLit, step(0.99, q) * near), smoothstep(0.0, 0.67, q));
      c = cc;
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
