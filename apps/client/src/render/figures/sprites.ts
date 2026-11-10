import * as THREE from 'three';
import { fieldFragment, fieldVertex, fieldUniforms, MAX_SOURCES } from '../lightfield.ts';
import type { Key } from '../clock-style.ts';
import { PX } from '../stops.ts';
import { fogBand } from '../camera.ts';
/** Render layer for figures, shades and their effects; cameras that show actors enable it. */
export const ACTOR_LAYER = 1;
import { palette, PALETTE_SIZE, type Atlas, type FrameRect } from './bake.ts';

/** The frame's light, shared by every sprite: sun or moon, sky and ground bounce, and the render target size. */
export const spriteLight = {
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uSunCol: { value: new THREE.Color() },
  uSky: { value: new THREE.Color() },
  uGround: { value: new THREE.Color() },
  uRes: { value: new THREE.Vector2(1, 1) },
  /** Camera yaw: atlas normals were baked looking north and turn with the view. */
  uYaw: { value: 0 },
};
/** Mirrors view.ts applyLights: the same key drives the world's Lambert lights and the sprites. */
export function setSpriteLight(key: Key, sunDir: THREE.Vector3, cave: boolean, wide = false) {
  const L = spriteLight;
  L.uSunDir.value.copy(sunDir);
  L.uSunCol.value.set(key.sun).multiplyScalar(cave ? 0 : key.sunI);
  // Figures take a little more sky than the ground does, so a figure backlit by a low sun still reads by its front.
  // In Scenery the camera looks into a low sun, so figures face away from it: give them more sky.
  L.uSky.value.set(cave ? '#3a4a70' : key.sky).multiplyScalar(cave ? 0.06 : key.ambI * (wide ? 2.4 : 1.45));
  L.uGround.value.set(cave ? '#120e0c' : key.ground).multiplyScalar(cave ? 0.06 : key.ambI * 1.2);
}

/**
 * One sprite texel lands on one render pixel: the plane is placed in tiles from texel offsets at the sheet's density
 * (`uPx` texels per tile), and in the orthographic stops the feet snap to a pixel corner.
 */
const vertex = /* glsl */`
${fieldVertex}
#include <fog_pars_vertex>
uniform vec4 uRect; uniform vec2 uAnchor; uniform vec3 uFoot; uniform float uFront; uniform float uTilt; uniform vec2 uRes; uniform float uPx;
varying vec2 vTex;
vec3 planePoint(vec2 off, out vec3 base) {
  // The plane faces the camera: its rows run along the camera's right axis, its pitch is the back axis's rise.
  vec2 back = vec2(viewMatrix[0][2], viewMatrix[2][2]);
  float s = viewMatrix[1][2], c = length(back);
  vec3 toCam = vec3(back.x, 0.0, back.y) / max(c, 1e-4), right = vec3(viewMatrix[0][0], 0.0, viewMatrix[2][0]);
  // Upright planes step forward by uFront and rise to match, so the feet still project onto the server tile.
  base = uFoot + toCam * uFront + vec3(0.0, uFront * s / c + (uTilt > 0.1 ? 0.02 : 0.0), 0.0);
  vec3 up = vec3(0.0, cos(uTilt), 0.0) - toCam * sin(uTilt);
  float k = c * cos(uTilt) + s * sin(uTilt);
  return base + right * (off.x / uPx) + up * (off.y / (uPx * k));
}
void main() {
  vec2 tex = position.xy * uRect.zw;
  vec3 base;
  vec3 world = planePoint(tex - uAnchor, base);
  vec4 clip = projectionMatrix * viewMatrix * vec4(world, 1.0);
  if (projectionMatrix[3][3] > 0.5) {
    vec4 a = projectionMatrix * viewMatrix * vec4(base, 1.0);
    vec2 ap = (a.xy * 0.5 + 0.5) * uRes;
    clip.xy += (floor(ap + 0.5) - ap) / uRes * 2.0;
  }
  vTex = tex; vFPos = uFoot; vFNrm = vec3(0.0, 1.0, 0.0);
  gl_Position = clip;
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  #include <fog_vertex>
}`;

/** Reads an atlas texel (see Atlas): whether it is drawn, its palette colour and self-lit share, its world normal. */
const atlasRead = /* glsl */`
uniform sampler2D uColor; uniform sampler2D uPalette; uniform vec2 uAtlas;
bool drawnAt(vec2 t) { return texture2D(uColor, t / uAtlas).a > 0.002; }
vec4 paletteOf(vec4 t) {
  float e = floor(t.b * 255.0 + 0.5) + 256.0 * (floor(t.a * 255.0 + 0.5) - 1.0);
  return texture2D(uPalette, vec2((e + 0.5) / ${PALETTE_SIZE.toFixed(1)}, 0.5));
}
vec3 normalOf(vec4 t) {
  vec2 f = t.rg * 2.0 - 1.0;
  vec3 n = vec3(f, 1.0 - abs(f.x) - abs(f.y));
  if (n.z < 0.0) n.xy = (1.0 - abs(n.yx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.y >= 0.0 ? 1.0 : -1.0);
  return normalize(n);
}`;

const fragment = /* glsl */`
${fieldFragment}
${atlasRead}
uniform vec4 uRect; uniform vec3 uFoot;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround; uniform float uFlash; uniform float uDim; uniform float uSelf; uniform float uYaw; uniform float uGhost;
varying vec2 vTex;
#include <fog_pars_fragment>
// Three steps of light, so faces turn in clusters like painted pixels instead of smooth gradients.
float band(float x) { return x < 0.12 ? 0.0 : x < 0.5 ? 0.55 : 1.0; }
// Where the field's light comes from at p: the sum of directions to every source that reaches the tile, by strength.
vec3 fieldDir(vec2 p) {
  vec2 tile = floor(p + 0.5);
  if (tile.x < 0.0 || tile.y < 0.0 || tile.x >= uFSize.x || tile.y >= uFSize.y) return vec3(0.0, 1.0, 0.0);
  uvec4 m = uvec4(texture2D(uFMask, (tile + 0.5) / uFSize) * 255.0 + 0.5);
  uint mask = m.r | (m.g << 8u) | (m.b << 16u) | (m.a << 24u);
  vec3 dir = vec3(0.0);
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if ((mask & (1u << uint(i))) == 0u) continue;
    vec4 s = uFSrc[i];
    float l = s.z - ceil(length(p - s.xy) - 1e-4);
    if (l > 0.0) dir += normalize(vec3(s.x - p.x, s.w > 0.5 ? 4.0 : 1.1, s.y - p.y)) * fieldCurve(l);
  }
  return length(dir) > 1e-3 ? normalize(dir) : vec3(0.0, 1.0, 0.0);
}
void main() {
  vec2 t = floor(vTex) + 0.5;
  vec4 tx = texture2D(uColor, (uRect.xy + t) / uAtlas);
  if (tx.a < 0.002) discard;
  // A figure between the lens and the hero is drawn as a checkerboard, so it never hides them.
  if (uGhost > 0.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
  vec4 c = paletteOf(tx);
  vec3 n = normalOf(tx);
  float cy = cos(uYaw), sy = sin(uYaw);
  n = vec3(n.x * cy + n.z * sy, n.y, n.z * cy - n.x * sy);
  vec3 albedo = mix(c.rgb, vec3(dot(c.rgb, vec3(0.3, 0.5, 0.2))) * 0.6, uDim);
  vec3 light = (uSunCol * band(max(dot(n, uSunDir), 0.0)) + mix(uGround, uSky, n.y * 0.5 + 0.5)) * 0.31831;
  if (uFOn > 0.5) {
    vec2 p = (floor(uFoot.xz * ${PX.toFixed(1)}) + 0.5) / ${PX.toFixed(1)};
    float lv;
    vec3 f = fieldAt(p, 0.0, lv) * uFGain;
    // The side facing the light takes it; the far side keeps a quarter, so the silhouette still reads.
    if (dot(f, f) > 0.0) light += f * (0.25 + 0.75 * band(max(dot(n, fieldDir(p)), 0.0)));
  }
  // Your own figure never drops below a faint read of its colours, so you never lose yourself in the dark. Presentation only:
  // the server never sends what the dark hides, so this reveals nothing.
  vec3 col = max(max(albedo * light, albedo * c.a * 1.4), albedo * uSelf);
  // Rim: a pixel on the silhouette edge that faces the sun (or the moon) catches its light, so figures separate from
  // dark ground at dusk and night instead of reading as blobs. The neighbour one pixel towards the light decides it.
  vec2 sd = (mat3(viewMatrix) * uSunDir).xy;
  vec2 o = vec2(sd.x > 0.3 ? 1.0 : sd.x < -0.3 ? -1.0 : 0.0, sd.y > 0.3 ? 1.0 : sd.y < -0.3 ? -1.0 : 0.0);
  vec2 tn = t + o;
  float open = (tn.x < 0.0 || tn.y < 0.0 || tn.x > uRect.z || tn.y > uRect.w || !drawnAt(uRect.xy + tn)) ? 1.0 : 0.0;
  float sunLum = max(uSunCol.r, max(uSunCol.g, uSunCol.b));
  vec3 rimCol = sunLum > 0.0 ? uSunCol / sunLum : vec3(0.0);
  col = mix(col, max(col, albedo * 0.5 + rimCol * 0.3), open * min(1.0, sunLum) * (1.0 - uDim) * step(0.01, dot(o, o)));
  gl_FragColor = vec4(mix(col, vec3(4.0), uFlash), 1.0);
  #include <fog_fragment>
}`;

const shadowVertex = /* glsl */`
uniform vec3 uFoot; uniform vec2 uDir; uniform vec4 uBox;
varying vec2 vXZ;
void main() {
  vec2 perp = vec2(-uDir.y, uDir.x);
  vec2 pq = mix(uBox.xz, uBox.yw, position.xy);
  vec2 xz = uFoot.xz + perp * pq.x + uDir * pq.y;
  vXZ = xz;
  gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, 0.012, xz.y, 1.0);
}`;
/** A contact blob plus the silhouette laid along the sun or moon, both on a ground grid as fine as the figure's texels. */
const shadowFragment = /* glsl */`
${atlasRead}
uniform vec4 uRect; uniform vec2 uAnchor; uniform vec3 uFoot;
uniform vec2 uDir; uniform float uLen; uniform float uSil; uniform vec2 uBlob; uniform float uBlobA; uniform float uPx;
varying vec2 vXZ;
void main() {
  vec2 g = (floor(vXZ * uPx) + 0.5) / uPx - uFoot.xz;
  vec2 e = g / uBlob;
  float a = dot(e, e) < 1.0 ? uBlobA : 0.0;
  float q = dot(g, uDir);
  if (uSil > 0.0 && q > 0.0) {
    float c = length(vec2(viewMatrix[0][2], viewMatrix[2][2]));
    vec2 tex = uAnchor + vec2(dot(g, vec2(-uDir.y, uDir.x)) * uPx, q / uLen * uPx * c);
    if (tex.x >= 0.0 && tex.y >= 0.0 && tex.x < uRect.z && tex.y < uRect.w && drawnAt(uRect.xy + floor(tex) + 0.5)) a = max(a, uSil);
  }
  if (a <= 0.0) discard;
  gl_FragColor = vec4(0.012, 0.014, 0.035, a);
}`;

const nearest = (t: THREE.DataTexture, srgb: boolean) => {
  t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
  return t;
};
/** Every material ramp in sRGB, with its self-lit share in alpha: atlas texels name an entry. */
const paletteTexture = nearest(new THREE.DataTexture(palette, PALETTE_SIZE, 1, THREE.RGBAFormat, THREE.UnsignedByteType), true);

/** The atlas on the GPU. Once uploaded its CPU copy is let go, so a bake costs its memory once, on the GPU. */
export class SpriteSheet {
  readonly color: THREE.DataTexture;
  private readonly quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
  constructor(readonly atlas: Atlas) {
    const t = (this.color = nearest(new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat, THREE.UnsignedByteType), false));
    t.onUpdate = () => { t.image.data = null; atlas.data = new Uint8Array(0); };
  }
  get bytes() { return this.atlas.width * this.atlas.height * 4; }
  body() { return new SpriteBody(this, this.quad); }
  dispose() { this.color.dispose(); }
}

/** One drawn figure: an upright (or, for the dead, flat) plane and its ground shadow. */
export class SpriteBody {
  readonly mesh: THREE.Mesh;
  readonly shadow: THREE.Mesh;
  private readonly u;
  private readonly s;
  constructor(readonly sheet: SpriteSheet, quad: THREE.BufferGeometry) {
    const atlasSize = new THREE.Vector2(sheet.atlas.width, sheet.atlas.height);
    const own = { uRect: { value: new THREE.Vector4() }, uAnchor: { value: new THREE.Vector2() }, uFoot: { value: new THREE.Vector3() }, uFront: { value: 0 }, uTilt: { value: 0 }, uFlash: { value: 0 }, uDim: { value: 0 }, uSelf: { value: 0 }, uGhost: { value: 0 }, uPx: { value: sheet.atlas.px } };
    this.u = own;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment, side: THREE.DoubleSide, fog: true,
      uniforms: { ...fieldUniforms, ...spriteLight, ...THREE.UniformsLib.fog, fogBand: { value: fogBand }, uColor: { value: sheet.color }, uPalette: { value: paletteTexture }, uAtlas: { value: atlasSize }, ...own },
    });
    this.mesh = new THREE.Mesh(quad, mat);
    this.mesh.frustumCulled = false;
    this.mesh.onBeforeRender = renderer => { const rt = renderer.getRenderTarget(); if (rt) spriteLight.uRes.value.set(rt.width, rt.height); };
    const sh = { uFoot: own.uFoot, uRect: own.uRect, uAnchor: own.uAnchor, uPx: own.uPx, uDir: { value: new THREE.Vector2(0, -1) }, uBox: { value: new THREE.Vector4() }, uLen: { value: 1 }, uSil: { value: 0 }, uBlob: { value: new THREE.Vector2(0.3, 0.2) }, uBlobA: { value: 0.45 } };
    this.s = sh;
    this.shadow = new THREE.Mesh(quad, new THREE.ShaderMaterial({
      vertexShader: shadowVertex, fragmentShader: shadowFragment, transparent: true, depthWrite: false,
      uniforms: { uColor: { value: sheet.color }, uPalette: { value: paletteTexture }, uAtlas: { value: atlasSize }, ...sh },
    }));
    this.shadow.frustumCulled = false; this.shadow.renderOrder = -1;
  }
  /**
   * Draw `frame` of the current sheet with its feet at `foot`. `flat` lays it on the ground (the dead); `sun` is the
   * direction to the sun or moon and `sunStrength` how dark its shadow is. `blob` is the contact shadow's radii in tiles.
   */
  set(frame: FrameRect, foot: THREE.Vector3, o: { flat: boolean; flash: boolean; dim: number; sun: THREE.Vector3; sunStrength: number; blob: [number, number]; self?: number; ghost?: boolean }) {
    const u = this.u, { pitch, px } = this.sheet.atlas;
    u.uSelf.value = o.self ?? 0;
    u.uGhost.value = o.ghost ? 1 : 0;
    u.uRect.value.set(frame.x, frame.y, frame.w, frame.h);
    u.uAnchor.value.set(frame.ax, frame.ay);
    u.uFoot.value.copy(foot);
    u.uTilt.value = o.flat ? Math.PI / 2 : 0;
    // Rows under the feet (a snout, a lunge) need the plane in front of the tile so they stay above the ground.
    u.uFront.value = o.flat ? 0 : Math.min(0.9, frame.below / (px * Math.sin(pitch)));
    u.uFlash.value = o.flash ? 1 : 0;
    u.uDim.value = o.dim;
    const s = this.s, horiz = Math.hypot(o.sun.x, o.sun.z);
    s.uBlob.value.set(...o.blob);
    s.uBlobA.value = 0.4;
    if (!o.flat && o.sun.y > 0.05 && horiz > 1e-3 && o.sunStrength > 0.01) {
      s.uDir.value.set(-o.sun.x / horiz, -o.sun.z / horiz);
      s.uLen.value = Math.min(1.7, horiz / o.sun.y);
      s.uSil.value = 0.32 * Math.min(1, o.sunStrength);
    } else s.uSil.value = 0;
    const halfW = frame.w / 2 / px + 0.1, reach = (frame.top / (px * Math.cos(pitch))) * (s.uSil.value > 0 ? s.uLen.value : 0);
    s.uBox.value.set(-Math.max(halfW, o.blob[0] + 0.1), Math.max(halfW, o.blob[0] + 0.1), -o.blob[0] - 0.1, Math.max(reach, o.blob[0]) + 0.1);
  }
  /** Draw from another bake: another pitch or density, or the figure's own bake once it is ready. */
  use(sheet: SpriteSheet) {
    if (sheet === this.sheet) return;
    (this as { sheet: SpriteSheet }).sheet = sheet;
    this.u.uPx.value = sheet.atlas.px;
    for (const m of [this.mesh.material, this.shadow.material] as THREE.ShaderMaterial[]) {
      m.uniforms.uColor.value = sheet.color; m.uniforms.uAtlas.value.set(sheet.atlas.width, sheet.atlas.height);
    }
  }
  /** How far the plane stands in front of the feet, towards the camera. */
  get front() { return this.u.uFront.value; }
  get visible() { return this.mesh.visible; }
  set visible(v: boolean) { this.mesh.visible = v; this.shadow.visible = v; }
  addTo(scene: THREE.Scene) { this.mesh.layers.set(ACTOR_LAYER); this.shadow.layers.set(ACTOR_LAYER); scene.add(this.mesh, this.shadow); }
  dispose() { this.mesh.removeFromParent(); this.shadow.removeFromParent(); (this.mesh.material as THREE.Material).dispose(); (this.shadow.material as THREE.Material).dispose(); }
}
