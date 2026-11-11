import * as THREE from 'three';
import { ICON_SIZE as S, iconAlphabet, normalAlphabet, worldKinds, type IconDef, type Icons } from '../../../../packages/game/src/content-schema.ts';
import { fieldFragment, fieldUniforms } from './lightfield.ts';
import { spriteLight, spriteLightChunk, spriteVertex } from './figures/sprites.ts';
import { PX } from './stops.ts';
import { fogBand } from './camera.ts';

/**
 * Items lying on the floor, lit by the scene like figures are. Each icon's world sprite (albedo, normal, material kind;
 * written by tools/icons) goes into one atlas; a sprite stands on its tile one texel to a render pixel, takes the sun,
 * sky and ground light, the light field and our hero's faint glow, and the palette snap with everything else. Metal,
 * gems, glass and liquids catch a glint from the light's actual direction; fire keeps its own light.
 */
const COLS = 16;
/** Texel bytes as in the figure atlas: a folded normal in red and green, a palette entry in blue and alpha's low bits. */
function octahedral(x: number, y: number, z: number): [number, number] {
  const l = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
  x /= l; y /= l; z /= l;
  if (y < 0) { const fx = (1 - Math.abs(z)) * Math.sign(x || 1), fz = (1 - Math.abs(x)) * Math.sign(z || 1); x = fx; z = fz; }
  // Red and green hold x and z; the up axis is the folded one, as an item lying down mostly faces up.
  return [Math.round((x * 0.5 + 0.5) * 255), Math.round((z * 0.5 + 0.5) * 255)];
}
/** A world sprite's normal, in the icon's frame (x right, y down, z out of the picture). */
function unpack(row: string, x: number): [number, number, number] {
  const a = normalAlphabet.indexOf(row[x * 2]) / 63 * 2 - 1, b = normalAlphabet.indexOf(row[x * 2 + 1]) / 63 * 2 - 1;
  let nx = a, ny = b, nz = 1 - Math.abs(a) - Math.abs(b);
  if (nz < 0) { const fx = (1 - Math.abs(ny)) * Math.sign(nx || 1), fy = (1 - Math.abs(nx)) * Math.sign(ny || 1); nx = fx; ny = fy; }
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

type Built = { atlas: THREE.DataTexture; palette: THREE.DataTexture; size: THREE.Vector2; paletteSize: number; cells: Map<string, [number, number]> };
function build(icons: Icons): Built {
  const names = Object.keys(icons), rows = Math.ceil(names.length / COLS), W = COLS * S, H = rows * S;
  const data = new Uint8Array(W * H * 4), entries: number[] = [], index = new Map<string, number>(), cells = new Map<string, [number, number]>();
  const entry = (hex: string, kind: number) => {
    const key = `${hex}${kind}`;
    let e = index.get(key);
    if (e === undefined) { e = entries.length / 4; index.set(key, e); entries.push(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), kind); }
    return e;
  };
  names.forEach((name, n) => {
    const def: IconDef = icons[name], cx = (n % COLS) * S, cy = Math.floor(n / COLS) * S;
    cells.set(name, [cx, cy]);
    // Without a world block (an icon repainted in the Studio) the painted colours stand in, lying flat.
    const w = def.world;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const ch = (w ? w.pixels : def.pixels)[y][x];
      if (ch === '.') continue;
      const i = iconAlphabet.indexOf(ch);
      const e = w ? entry(w.palette[i], worldKinds.indexOf(w.kinds[i])) : entry(def.palette[i], 0);
      const [nx, ny, nz] = w ? unpack(w.normals[y], x) : [0, 0, 1];
      // Lying on the ground seen from the south: the picture's up is north (−z), its depth is the world's up.
      const [r, g] = octahedral(nx, nz, ny);
      const o = ((cy + S - 1 - y) * W + cx + x) * 4;
      data[o] = r; data[o + 1] = g; data[o + 2] = e & 255; data[o + 3] = 1 + (e >> 8);
    }
  });
  const tex = (d: Uint8Array, w: number, h: number, srgb: boolean) => {
    const t = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
    return t;
  };
  const paletteSize = entries.length / 4;
  return { atlas: tex(data, W, H, false), palette: tex(Uint8Array.from(entries), paletteSize, 1, true), size: new THREE.Vector2(W, H), paletteSize, cells };
}

const fragment = (paletteSize: number) => /* glsl */`
${fieldFragment}
uniform sampler2D uColor; uniform sampler2D uPalette; uniform vec2 uAtlas;
uniform vec4 uRect; uniform vec3 uFoot;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSky; uniform vec3 uGround; uniform float uYaw;
varying vec2 vTex;
#include <fog_pars_fragment>
${spriteLightChunk}
bool drawnAt(vec2 t) { return texture2D(uColor, t / uAtlas).a > 0.002; }
float glintOf(vec3 n, vec3 l) { float d = dot(n, l); return step(0.35, d) * step(0.12, d - max(l.y, 0.0)); }
void main() {
  vec2 t = floor(vTex) + 0.5;
  vec4 tx = texture2D(uColor, (uRect.xy + t) / uAtlas);
  if (tx.a < 0.002) discard;
  float e = floor(tx.b * 255.0 + 0.5) + 256.0 * (floor(tx.a * 255.0 + 0.5) - 1.0);
  vec4 c = texture2D(uPalette, vec2((e + 0.5) / ${paletteSize.toFixed(1)}, 0.5));
  // 0 matte, 1 metal, 2 gem, 3 glass, 4 liquid, 5 emissive (content-schema worldKinds).
  float kind = floor(c.a * 255.0 + 0.5);
  vec2 f2 = tx.rg * 2.0 - 1.0;
  vec3 n = vec3(f2.x, 1.0 - abs(f2.x) - abs(f2.y), f2.y);
  if (n.y < 0.0) n.xz = (1.0 - abs(n.zx)) * vec2(n.x >= 0.0 ? 1.0 : -1.0, n.z >= 0.0 ? 1.0 : -1.0);
  n = normalize(n);
  float cy = cos(uYaw), sy = sin(uYaw);
  n = vec3(n.x * cy + n.z * sy, n.y, n.z * cy - n.x * sy);
  vec3 albedo = c.rgb;
  float shine = kind == 1.0 ? 0.9 : kind == 2.0 ? 1.1 : kind == 3.0 || kind == 4.0 ? 0.8 : 0.0;
  vec3 light = (uSunCol * band(max(dot(n, uSunDir), 0.0)) + mix(uGround, uSky, n.y * 0.5 + 0.5)) * 0.31831;
  // A glint where a facet turns towards the light better than the flat ground does: it follows the sun, moon or lamp
  // and stays put as the camera moves. Flat tops never glint, so a blade catches a low sun along its edge.
  vec3 glint = uSunCol * glintOf(n, uSunDir) * 0.3;
  if (uFOn > 0.5) {
    vec2 p = (floor(uFoot.xz * ${PX.toFixed(1)}) + 0.5) / ${PX.toFixed(1)};
    float lv;
    vec3 f = fieldAt(p, 0.0, lv) * uFGain;
    if (dot(f, f) > 0.0) { vec3 fd = fieldDir(p); light += f * (0.25 + 0.75 * band(max(dot(n, fd), 0.0))); glint += f * glintOf(n, fd) * 0.7; }
    light = max(light, vec3(0.74, 0.8, 1.0) * selfGlow(p));
  }
  vec3 col = albedo * light + glint * shine * mix(vec3(1.0), albedo * 1.6, kind == 1.0 ? 0.45 : 0.15);
  // Fire is its own light.
  if (kind == 5.0) col = max(col, albedo * 1.3);
  // Rim, as on figures: an edge pixel facing the sun or moon catches its light.
  vec2 sd = (mat3(viewMatrix) * uSunDir).xy;
  vec2 o = vec2(sd.x > 0.3 ? 1.0 : sd.x < -0.3 ? -1.0 : 0.0, sd.y > 0.3 ? 1.0 : sd.y < -0.3 ? -1.0 : 0.0);
  vec2 tn = t + o;
  float open = (tn.x < 0.0 || tn.y < 0.0 || tn.x > uRect.z || tn.y > uRect.w || !drawnAt(uRect.xy + tn)) ? 1.0 : 0.0;
  float sunLum = max(uSunCol.r, max(uSunCol.g, uSunCol.b));
  vec3 rimCol = sunLum > 0.0 ? uSunCol / sunLum : vec3(0.0);
  col = mix(col, max(col, albedo * 0.5 + rimCol * 0.3), open * min(1.0, sunLum) * step(0.01, dot(o, o)));
  gl_FragColor = vec4(col, 1.0);
  #include <fog_fragment>
}`;

const shadowVertex = /* glsl */`
uniform vec3 uFoot; varying vec2 vXZ;
void main() { vec2 xz = uFoot.xz + (position.xy - 0.5) * 0.9; vXZ = xz; gl_Position = projectionMatrix * viewMatrix * vec4(xz.x, 0.012, xz.y, 1.0); }`;
/** A small contact shadow on the ground's own pixel grid. */
const shadowFragment = /* glsl */`
uniform vec3 uFoot; uniform vec2 uBlob; varying vec2 vXZ;
void main() {
  vec2 g = (floor(vXZ * ${PX.toFixed(1)}) + 0.5) / ${PX.toFixed(1)} - uFoot.xz;
  vec2 e = g / uBlob;
  if (dot(e, e) > 1.0) discard;
  gl_FragColor = vec4(0.012, 0.014, 0.035, 0.42);
}`;

type Placed = { mesh: THREE.Mesh; shadow: THREE.Mesh; icon: string };
export class FloorItems {
  readonly group = new THREE.Group();
  private readonly built: Built;
  private readonly quad = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);
  private readonly items = new Map<string, Placed>();
  private readonly frag: string;
  constructor(icons: Icons) { this.built = build(icons); this.frag = fragment(this.built.paletteSize); }

  private make(icon: string): Placed {
    const b = this.built, [cx, cy] = b.cells.get(icon) ?? b.cells.values().next().value!;
    const own = { uRect: { value: new THREE.Vector4(cx, cy, S, S) }, uAnchor: { value: new THREE.Vector2(S / 2, 0) }, uFoot: { value: new THREE.Vector3() }, uFront: { value: 0 }, uTilt: { value: 0 }, uPx: { value: PX } };
    const mesh = new THREE.Mesh(this.quad, new THREE.ShaderMaterial({
      vertexShader: spriteVertex, fragmentShader: this.frag, side: THREE.DoubleSide, fog: true,
      uniforms: { ...fieldUniforms, ...spriteLight, ...THREE.UniformsLib.fog, fogBand: { value: fogBand }, uColor: { value: b.atlas }, uPalette: { value: b.palette }, uAtlas: { value: b.size }, ...own },
    }));
    mesh.frustumCulled = false;
    mesh.onBeforeRender = renderer => { const rt = renderer.getRenderTarget(); if (rt) spriteLight.uRes.value.set(rt.width, rt.height); };
    const shadow = new THREE.Mesh(this.quad, new THREE.ShaderMaterial({ vertexShader: shadowVertex, fragmentShader: shadowFragment, transparent: true, depthWrite: false, uniforms: { uFoot: own.uFoot, uBlob: { value: new THREE.Vector2(0.3, 0.14) } } }));
    shadow.frustumCulled = false; shadow.renderOrder = -1;
    this.group.add(mesh, shadow);
    return { mesh, shadow, icon };
  }
  /**
   * Draw item `id` with `icon` lying at (x, y) tiles, `k` its place in the pile from the bottom. The picture stands
   * on a point a little south of (x, y), so the sprite's middle sits on the tile.
   */
  place(id: string, icon: string, x: number, y: number, k: number, visible: boolean) {
    let p = this.items.get(id);
    if (p && p.icon !== icon) { this.drop(id); p = undefined; }
    if (!p) { p = this.make(icon); this.items.set(id, p); }
    (p.mesh.material as THREE.ShaderMaterial).uniforms.uFoot.value.set(x, 0, y + 0.26);
    p.mesh.visible = p.shadow.visible = visible;
    p.mesh.renderOrder = k;
  }
  /** Forget every item not in `live`. */
  keep(live: Set<string>) { for (const id of [...this.items.keys()]) if (!live.has(id)) this.drop(id); }
  private drop(id: string) {
    const p = this.items.get(id); if (!p) return;
    this.group.remove(p.mesh, p.shadow);
    (p.mesh.material as THREE.Material).dispose(); (p.shadow.material as THREE.Material).dispose();
    this.items.delete(id);
  }
}
