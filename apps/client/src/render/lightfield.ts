import * as THREE from 'three';
import { T, type MapData } from '../../../../packages/game/src/model.ts';
import { ambientAt, lightPasses, outdoorAmbient, type Clock, type LightSource } from '../../../../packages/game/src/light.ts';

/**
 * The light field draws the shared rule. The CPU runs the rule's own occlusion (`lightPasses`) for every tile within
 * each source's reach and packs the result into a 32-bit mask per tile. The GPU draws `L − ⌈distance⌉` rings for the
 * sources in a fragment's tile mask, so every tile centre shows exactly the rule's level and shadows follow tile edges.
 */
export const MAX_SOURCES = 32;
export const LIGHT_COLORS = { amber: new THREE.Color('#ffaa48'), teal: new THREE.Color('#46e0c8') };

export const fieldUniforms = {
  uFMask: { value: null as THREE.DataTexture | null },
  uFAmb: { value: null as THREE.DataTexture | null },
  uFSize: { value: new THREE.Vector2(1, 1) },
  uFSrc: { value: Array.from({ length: MAX_SOURCES }, () => new THREE.Vector4()) },
  uFCol: { value: Array.from({ length: MAX_SOURCES }, () => new THREE.Color()) },
  uFOutdoor: { value: 7 },
  /** Our hero's tile (x, z) and whether the glow is on. See `selfGlow`. */
  uFSelf: { value: new THREE.Vector3(0, 0, 0) },
  uFGain: { value: 1 },
  uFOn: { value: 1 },
  uFCloud: { value: 0 },
  uFTime: { value: 0 },
  /** Scenery: surfaces closer than this to the camera dissolve in a dither, so walls by the lens never fill the frame. */
  uFNear: { value: 0 },
  /**
   * Scenery only: raised forms nearer the lens than this (horizontal distance) are cut away, so walls never wall off the
   * vista. Upright faces are cut down to the ground: stubs left below a cut height drew lamp-lit noise along the frame's
   * bottom edge.
   */
  uFCut: { value: 0 },
  /** The Scenery view axis on the ground (x, z), and the half-width of the cleared corridor as a tangent. */
  uFAxis: { value: new THREE.Vector3(0, -1, 0.3) },
  /** Painted strokes on the ground: 0 at Close and Play (tiles are painted by hand), 1 in Scenery. */
  uFGround: { value: 0 },
  /** Painted-block texture strength: 0 off, 1 the reference look. */
  uFBlocks: { value: 1 },
};

export const fieldVertex = /* glsl */`
varying vec3 vFPos; varying vec3 vFNrm;
`;
export const fieldVertexMain = /* glsl */`
  vec4 fWorld = vec4(transformed, 1.0);
  vec3 fN = objectNormal;
  #ifdef USE_INSTANCING
    fWorld = instanceMatrix * fWorld; fN = mat3(instanceMatrix) * fN;
  #endif
  fWorld = modelMatrix * fWorld;
  vFPos = fWorld.xyz; vFNrm = normalize(mat3(modelMatrix) * fN);
`;
export const fieldFragment = /* glsl */`
uniform sampler2D uFMask; uniform sampler2D uFAmb; uniform vec2 uFSize;
uniform vec4 uFSrc[${MAX_SOURCES}]; uniform vec3 uFCol[${MAX_SOURCES}];
uniform float uFOutdoor; uniform vec3 uFSelf; uniform float uFGain; uniform float uFOn; uniform float uFCloud; uniform float uFTime; uniform float uFNear; uniform float uFBlocks; uniform float uFCut; uniform vec3 uFAxis; uniform float uFGround;
varying vec3 vFPos; varying vec3 vFNrm;
// Each level a readable step brighter than the last, so a pool falls off in rings and its edge still shows ground.
// What our hero makes out around themselves with no light at all: the tiles beside them faintly, the ring after
// that fainter still, nothing beyond. It is how the picture shows the rule's sense of what stands within reach in the
// dark; it lights nothing for anyone else and a torch outshines it at once.
float selfGlow(vec2 p) {
  if (uFSelf.z < 0.5) return 0.0;
  vec2 d = abs(floor(p + 0.5) - uFSelf.xy);
  float ring = max(d.x, d.y);
  return ring < 1.5 ? 0.42 : ring < 2.5 ? 0.2 : 0.0;
}
float fieldCurve(float lv) { return lv <= 0.0 ? 0.0 : lv * (0.21 + lv * 0.007); }
// The Lantern on upright stone: half strength, as saturated teal on grey stone snaps to scattered single teal pixels.
float fHighWall = 1.0;
// Returns light colour × intensity; lv receives the rule level the fragment shows (sources and interior hearth only).
vec3 fieldAt(vec2 p, float dither, out float lv) {
  vec2 tile = floor(p + 0.5);
  lv = 0.0;
  if (tile.x < 0.0 || tile.y < 0.0 || tile.x >= uFSize.x || tile.y >= uFSize.y) return vec3(0.0);
  vec2 uv = (tile + 0.5) / uFSize;
  uvec4 m = uvec4(texture2D(uFMask, uv) * 255.0 + 0.5);
  uint mask = m.r | (m.g << 8u) | (m.b << 16u) | (m.a << 24u);
  vec3 col = vec3(0.0);
  for (int i = 0; i < ${MAX_SOURCES}; i++) {
    if ((mask & (1u << uint(i))) == 0u) continue;
    vec4 s = uFSrc[i];
    float d = length(p - s.xy);
    float l = s.z - ceil(d - 1e-4);
    if (l <= 0.0 && dither <= 0.0) continue;
    lv = max(lv, l);
    // The picture may pull a band edge outward by up to half a tile in a Bayer pattern; the rule level above is exact.
    float shown = s.z - ceil(d - dither - 1e-4);
    if (shown > 0.0) col = max(col, uFCol[i] * fieldCurve(shown) * (s.w > 0.5 ? fHighWall : 1.0));
  }
  // Roofed tiles keep a warm hearth glow when the sky is darker than they are.
  float amb = floor(texture2D(uFAmb, uv).r * 255.0 + 0.5);
  float hearth = amb > uFOutdoor ? amb : 0.0;
  if (hearth > 0.0) { col = max(col, vec3(1.0, 0.62, 0.32) * fieldCurve(hearth) * 0.7); lv = max(lv, hearth); }
  return col;
}
float cHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float cNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), f.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), f.x), f.y); }
// Drifting cloud shadows on sunlit ground: two levels with a dithered edge on the 32 px grid.
float cloudShade() {
  if (uFCloud <= 0.0) return 1.0;
  vec2 cell = floor(vFPos.xz * 32.0);
  vec2 p = (cell + 0.5) / 32.0 / 17.0 + vec2(uFTime * 0.02, uFTime * 0.007);
  p += vec2(cNoise(p * 1.7 + 11.0), cNoise(p * 1.7 + 23.0)) * 0.6;
  float n = cNoise(p) * 0.5 + cNoise(p * 2.3 + 7.0) * 0.3 + cNoise(p * 5.1 + 3.0) * 0.2;
  int bi = int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4;
  float b4[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  return 1.0 - uFCloud * step(0.62 + (b4[bi] / 16.0 - 0.5) * 0.05, n);
}
// Sun through foliage (ref-4): under the canopy the sun breaks into flecks on the 32 px grid, drifting a little with the
// wind; between them the ground lies in leaf shade. Only for sunlit, up-facing ground.
float canopyShade() {
  if (uFCloud <= 0.0 || vFNrm.y < 0.7 || vFPos.y > 0.6) return 1.0;
  vec2 uv = (floor(vFPos.xz + 0.5) + 0.5) / uFSize;
  // Bilinear on tile centres so the canopy edge is soft across tiles, then dithered below.
  vec2 t = vFPos.xz + 0.5, i = floor(t - 0.5), f = t - 0.5 - i;
  float c00 = texture2D(uFAmb, (i + 0.5) / uFSize).g, c10 = texture2D(uFAmb, (i + vec2(1.5, 0.5)) / uFSize).g;
  float c01 = texture2D(uFAmb, (i + vec2(0.5, 1.5)) / uFSize).g, c11 = texture2D(uFAmb, (i + 1.5) / uFSize).g;
  float canopy = mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
  if (canopy <= 0.01) return 1.0;
  vec2 cell = floor(vFPos.xz * 16.0);
  vec2 p = cell / 16.0 * 1.3 + vec2(sin(uFTime * 0.7) * 0.06, cos(uFTime * 0.5) * 0.05);
  float n = cNoise(p * 1.6) * 0.6 + cNoise(p * 3.7 + 9.0) * 0.4;
  int bi = int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4;
  float b4[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  float fleck = step(0.66 - canopy * 0.06, n);
  // Solid leaf shade where the canopy is dense; the Bayer threshold only roughens its rim.
  float shade = step(0.3 + (b4[bi] / 16.0 - 0.5) * 0.18, canopy);
  return mix(1.0, mix(0.28, 1.15, fleck), shade);
}
// Painted stonework, as in the references: surfaces break into small blocks of shifted value and hue, cool or warm,
// laid in courses on upright faces. Blocks are anchored to the world (they never swim) and come in five fixed sizes;
// each size shows only while its blocks are a few screen pixels tall and fades out below that, so distance calms a
// surface (haze takes over) instead of coarsening it into a mosaic. Returns a multiplier for the lit colour.
float bHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
// One size of brushwork: rows rowH units tall, split into blocks one to two and a half rows wide, staggered row to row.
vec3 course(vec2 uv, float rowH, float plane, float amp, out float h) {
  vec2 c = uv / rowH;
  float row = floor(c.y);
  float w = 1.0 + floor(bHash(vec3(row, plane, rowH * 3.1)) * 4.0) * 0.5;
  float col = floor((c.x + bHash(vec3(row, plane, rowH * 7.7)) * 2.5) / w);
  h = bHash(vec3(col, row, plane + rowH));
  float g = bHash(vec3(row, col, plane - rowH));
  vec3 tint = g < 0.33 ? vec3(0.88, 0.92, 1.12) : g > 0.7 ? vec3(1.1, 1.0, 0.86) : vec3(1.0);
  return tint * (1.0 - amp * 0.5 + h * amp);
}
vec3 blockTone() {
  if (uFBlocks <= 0.0) return vec3(1.0);
  vec3 n = abs(vFNrm);
  bool isUp = n.y > 0.6;
  // The plane the surface lies in: ground (x,z), or a wall facing x or z (with y running up, so rows are courses).
  vec2 uv = isUp ? vFPos.xz : n.x > n.z ? vec2(vFPos.z, vFPos.y) : vec2(vFPos.x, vFPos.y);
  float plane = isUp ? 0.0 : n.x > n.z ? 1.0 : 2.0;
  // The ground keeps its own painted tiles at Close and Play; in Scenery it takes long strokes (ref-1's foreground).
  bool ground = isUp && vFPos.y < 0.3;
  if (ground && uFGround <= 0.0) return vec3(1.0);
  // World size of one screen pixel on this surface.
  float pw = max(length(fwidth(vFPos)) * 0.75, 1e-4);
  float amp = ground ? 0.5 : mix(0.24, 0.4, uFGround);
  vec3 m = vec3(1.0); float hd = 0.5, wd = 0.0;
  for (int k = 0; k < 5; k++) {
    float rowH = exp2(float(k)) / 16.0, rows = rowH / pw;
    // The largest sizes are a castle's courses seen from afar: quieter than brushwork, but enough that a far wall is
    // not one flat value (the palette would snap it to a single dull colour).
    float a = smoothstep(1.0, 2.2, rows) * (1.0 - smoothstep(4.5, 7.0, rows)) * (k == 4 ? 0.55 : k == 3 ? 0.75 : 1.0);
    if (a <= 0.0) continue;
    float h;
    vec3 c = course(ground ? uv * vec2(0.25, 1.0) : uv, rowH, plane, amp, h);
    m *= mix(vec3(1.0), c, a);
    if (a > wd) { wd = a; hd = h; }
  }
  // Rougher brickwork in Scenery (ref-1): now and then a dark gap where a stone is lost, and a pale one catching light.
  if (!ground && n.y < 0.35) m *= mix(1.0, hd < 0.07 ? 0.65 : hd > 0.93 ? 1.18 : 1.0, uFGround * wd);
  return mix(vec3(1.0), m, uFBlocks * (isUp && !ground ? 0.5 : 1.0));
}
// Brushwork shows where light falls and dies away in shade and at night, as a painter leaves dark passages quiet.
vec3 blockLit(vec3 tone, vec3 lit, vec3 direct) {
  float lum = dot(lit, vec3(0.3, 0.59, 0.11));
  float share = dot(direct, vec3(0.3, 0.59, 0.11)) / (lum + 1e-4);
  return mix(vec3(1.0), tone, smoothstep(0.015, 0.12, lum) * mix(0.3, 1.0, clamp(share, 0.0, 1.0)));
}
// Near the Scenery lens, walls and raised forms sink into a dark silhouette that frames the view, the way ref-2's nearest
// trees and roofs do, instead of showing their texels magnified. The ground in front of the hero stays lit.
float nearShade() {
  if (uFNear <= 0.0 || vFPos.y < 0.3) return 1.0;
  float cd = distance(cameraPosition.xz, vFPos.xz);
  return cd >= uFNear ? 1.0 : mix(0.06, 1.0, smoothstep(uFNear * 0.72, uFNear, cd));
}
vec3 fieldRadiance() {
  if (uFOn < 0.5) return vec3(0.0);
  // Faces sample the tile they look into, so a wall turned towards a lamp lights up and its back stays dark.
  vec2 p = vFPos.xz + vFNrm.xz * 0.45;
  // Quantise to the 32 px grid so ring edges are pixel steps.
  vec2 cell = floor(p * 32.0);
  p = (cell + 0.5) / 32.0;
  int bi = int(mod(cell.x, 4.0)) + int(mod(cell.y, 4.0)) * 4;
  float bayer4[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
  float lv;
  // The field is light on the ground the rule plays on: it climbs the foot of walls and trees and fades out between
  // one and three units up, so roofs and towers keep their own stone. After golden hour a faint sheen of the lamp stays
  // on the stone above; in daylight teal on warm stone would read olive. The fade is smooth: a dithered fade scattered
  // single teal pixels over the Spire's stone, and stronger light on roofs speckled them with the Lantern's teal.
  // Underground (the only place the outdoor level is 0) there are no roofs to keep clear: a torch lights the cellar
  // wall to its top, as a lens at head height sees mostly wall.
  float sheen = 0.12 * clamp((5.0 - uFOutdoor) / 3.0, 0.0, 1.0);
  float climb = uFOutdoor < 0.5 ? 2.4 : 1.2;
  float up = max(sheen, 1.0 - smoothstep(climb, climb + 2.0, vFPos.y));
  fHighWall = mix(0.45, 1.0, abs(vFNrm.y));
  vec3 lit = fieldAt(p, bayer4[bi] / 16.0 * 0.5, lv) * uFGain * up;
  return max(lit, vec3(0.74, 0.8, 1.0) * selfGlow(p) * up);
}
`;

/** How much foliage stands over each tile, 0 to 1: trees and pines within two tiles, nearer counting more. */
export function canopyAt(map: MapData, z: number): Float32Array {
  const { width: w, height: h } = map, floor = map.floors[z], out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let c = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
      const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
      const t = floor.thing[ty * w + tx];
      if (t === T.tree || t === T.pine) c += Math.max(dx * dx, dy * dy) <= 1 ? 0.45 : 0.18;
    }
    out[y * w + x] = Math.min(1, c);
  }
  return out;
}

/** Add the field to any Lambert material, chaining its own onBeforeCompile. */
const patched = new WeakSet<THREE.Material>();
export function withField(mat: THREE.Material) {
  if (patched.has(mat) || !(mat instanceof THREE.MeshLambertMaterial)) return;
  patched.add(mat);
  const priorKey = mat.customProgramCacheKey();
  // Foliage (material.userData.frame) is cut only down the middle of the Scenery view, so trees at the frame's edges stay
  // as dark framing; everything else nearer than the hero is cut across the whole width (sliced walls read as boxes).
  const frame = mat.userData.frame === true;
  mat.customProgramCacheKey = () => priorKey + (frame ? '|field-frame' : '|field');
  const prior = mat.onBeforeCompile.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prior(shader, renderer);
    Object.assign(shader.uniforms, fieldUniforms);
    shader.vertexShader = fieldVertex + shader.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n' + fieldVertexMain);
    shader.fragmentShader = fieldFragment + shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (uFCut > 0.0 && (vFPos.y > 0.35 || (vFPos.y > 0.03 && vFNrm.y < 0.8))) { vec2 rel = vFPos.xz - cameraPosition.xz; float dep = dot(rel, uFAxis.xy); if (dep < uFCut && (' + (frame ? 'abs(dot(rel, vec2(-uFAxis.y, uFAxis.x))) < dep * uFAxis.z + 0.9' : 'true') + ')) discard; }\n  vec3 fBlock = blockTone();').replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= cloudShade() * canopyShade() * nearShade();\n  vec3 fRad = diffuseColor.rgb * fieldRadiance();\n  reflectedLight.indirectDiffuse += fRad;\n  reflectedLight.indirectDiffuse *= nearShade();').replace('#include <opaque_fragment>', 'outgoingLight *= blockLit(fBlock, outgoingLight, reflectedLight.directDiffuse + fRad);\n  #include <opaque_fragment>');
  };

  mat.needsUpdate = true;
}
export function patchTree(root: THREE.Object3D) {
  root.traverse(o => { const m = (o as THREE.Mesh).material; if (Array.isArray(m)) m.forEach(withField); else if (m) withField(m); });
}

/** Owns the mask and ambient textures for one floor and refills them when sources, doors or the hour change. */
export class LightField {
  readonly w: number; readonly h: number;
  private readonly mask: Uint32Array;
  private readonly maskTex: THREE.DataTexture;
  private readonly amb: Uint8Array;
  private readonly ambTex: THREE.DataTexture;
  sources: LightSource[] = [];
  private lastKey = '';
  private lastAmb = -1;
  constructor(readonly map: MapData, readonly z: number) {
    this.w = map.width; this.h = map.height;
    this.mask = new Uint32Array(this.w * this.h);
    this.maskTex = new THREE.DataTexture(new Uint8Array(this.mask.buffer), this.w, this.h, THREE.RGBAFormat);
    this.amb = new Uint8Array(this.w * this.h * 4);
    this.ambTex = new THREE.DataTexture(this.amb, this.w, this.h, THREE.RGBAFormat);
    for (const t of [this.maskTex, this.ambTex]) { t.magFilter = t.minFilter = THREE.NearestFilter; t.flipY = false; t.needsUpdate = true; }
    // Canopy density in the ambient texture's green channel. The picture breaks sunlight into flecks there; the rule
    // never reads it.
    canopyAt(map, z).forEach((c, i) => { this.amb[i * 4 + 1] = Math.round(c * 255); });
  }
  /** Bind this floor's textures to the shared uniforms. */
  /** Bind this floor's textures and its own source table: the uniforms are shared, so a floor change must re-upload them. */
  bind() {
    fieldUniforms.uFMask.value = this.maskTex; fieldUniforms.uFAmb.value = this.ambTex; fieldUniforms.uFSize.value.set(this.w, this.h);
    this.uploadSources();
  }
  /**
   * Flame flicker, picture only: each amber source's colour steps between three strengths on its own beat. Levels (the
   * rule) are untouched, so the field still equals the rule; the Lantern's teal stays steady.
   */
  flicker(t: number) {
    this.sources.forEach((s, i) => {
      if (s.color !== 'amber') return;
      const beat = Math.floor(t * 7 + i * 1.7), h = Math.sin(beat * 12.9898 + i * 78.233) * 43758.5453;
      const step = Math.floor((h - Math.floor(h)) * 3);
      fieldUniforms.uFCol.value[i].copy(LIGHT_COLORS.amber).multiplyScalar([0.86, 0.94, 1.0][step]);
    });
  }
  private uploadSources() {
    this.sources.forEach((s, i) => { fieldUniforms.uFSrc.value[i].set(s.x, s.y, s.level, s.high ? 1 : 0); fieldUniforms.uFCol.value[i].copy(LIGHT_COLORS[s.color]); });
    for (let i = this.sources.length; i < MAX_SOURCES; i++) fieldUniforms.uFSrc.value[i].set(-99, -99, 0, 0);
  }

  /** Pick up to 32 sources (nearest the focus first), then rebuild masks only if something that matters moved. */
  update(all: LightSource[], doors: Record<string, boolean>, clock: Clock, focus: { x: number; y: number }) {
    const onFloor = all.filter(s => s.z === this.z).sort((a, b) => Math.hypot(a.x - focus.x, a.y - focus.y) - Math.hypot(b.x - focus.x, b.y - focus.y)).slice(0, MAX_SOURCES);
    onFloor.sort((a, b) => (a.id < b.id ? -1 : 1));
    const doorKey = Object.entries(doors).filter(([k]) => k.endsWith(`,${this.z}`)).map(([k, v]) => (v ? k : '')).join('|');
    const key = onFloor.map(s => `${s.id}@${s.x},${s.y}:${s.level}`).join(';') + '#' + doorKey;
    if (key !== this.lastKey) {
      this.lastKey = key; this.sources = onFloor;
      this.mask.fill(0);
      onFloor.forEach((s, i) => {
        const r = s.level;
        for (let y = Math.max(0, s.y - r); y <= Math.min(this.h - 1, s.y + r); y++) for (let x = Math.max(0, s.x - r); x <= Math.min(this.w - 1, s.x + r); x++) {
          if (s.high || lightPasses(this.map, s, { x, y, z: this.z }, doors)) this.mask[y * this.w + x] |= 1 << i;
        }
      });
      this.uploadSources();
      this.maskTex.needsUpdate = true;
    }
    const outdoor = this.z === 1 ? 0 : outdoorAmbient(clock);
    if (outdoor !== this.lastAmb) {
      this.lastAmb = outdoor;
      for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) this.amb[(y * this.w + x) * 4] = ambientAt(this.map, { x, y, z: this.z }, clock);
      this.ambTex.needsUpdate = true;
    }
    fieldUniforms.uFOutdoor.value = outdoor;
  }

  /**
   * Render each tile centre's level through the same GLSL and read it back: min(7, max(ambient, field)).
   * Returns a row-major w×h array, comparable with `lightGrid` over the whole floor.
   */
  readLevels(renderer: THREE.WebGLRenderer): Uint8Array {
    const rt = new THREE.WebGLRenderTarget(this.w, this.h, { magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    const mat = new THREE.ShaderMaterial({
      uniforms: { ...fieldUniforms },
      vertexShader: 'varying vec3 vFPos; varying vec3 vFNrm; void main(){ vFPos = (modelMatrix * vec4(position, 1.0)).xyz; vFNrm = vec3(0.0, 1.0, 0.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: fieldFragment + `void main(){ float lv; fieldAt(vFPos.xz, 0.0, lv); float amb = floor(texture2D(uFAmb, (floor(vFPos.xz + 0.5) + 0.5) / uFSize).r * 255.0 + 0.5); gl_FragColor = vec4(min(7.0, max(amb, lv)) / 255.0, 0.0, 0.0, 1.0); }`,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), mat);
    plane.rotation.x = -Math.PI / 2; plane.position.set(this.w / 2 - 0.5, 0, this.h / 2 - 0.5);
    const scene = new THREE.Scene(); scene.add(plane);
    // Looking straight down with +z (map y) towards the bottom of the image: pixel (x, row) sits on tile (x, y).
    const cx = (this.w - 1) / 2, cz = (this.h - 1) / 2;
    const cam = new THREE.OrthographicCamera(-this.w / 2, this.w / 2, this.h / 2, -this.h / 2, 0.1, 10);
    cam.position.set(cx, 5, cz); cam.up.set(0, 0, -1); cam.lookAt(cx, 0, cz); cam.updateMatrixWorld();
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prev);
    const px = new Uint8Array(this.w * this.h * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, this.w, this.h, px);
    rt.dispose(); mat.dispose(); plane.geometry.dispose();
    // readPixels rows start at the bottom of the image.
    const out = new Uint8Array(this.w * this.h);
    for (let row = 0; row < this.h; row++) for (let x = 0; x < this.w; x++) out[(this.h - 1 - row) * this.w + x] = px[(row * this.w + x) * 4];
    return out;
  }
}
