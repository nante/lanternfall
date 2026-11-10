import * as THREE from 'three';
import { type MapData, type Building, G, T, grounds } from '../../../../packages/game/src/model.ts';
import { hash2 } from '../../../../packages/game/src/town.ts';
import { groundAtlas, wallTexture, roofTexture, plankTexture } from './textures.ts';
import { tuftMesh, type TuftKind } from './tufts.ts';
import { buildTrees } from './trees.ts';
import { ramps } from './palette.ts';

export const WALL_H = 2.0;
export const SUN_DIR = new THREE.Vector3(-7, 6.4, -4.6).normalize();
/** Look settings shared by every floor's materials; WorldView.applyStyle writes into these. */
export const styleUniforms = { uSkyTint: { value: new THREE.Color('#6a9cc0') }, uGlint: { value: new THREE.Color('#ffb060') }, uGrid: { value: 0 }, uDapple: { value: 1 }, uGrass: { value: 1 }, uGrassHeight: { value: 1 }, uGroundBright: { value: 1 }, uGroundDetail: { value: 1 } };

type Inst = { x: number; y: number; z: number; sx?: number; sy?: number; sz?: number; ry?: number; rx?: number; rz?: number; color?: THREE.ColorRepresentation };
const dummy = new THREE.Object3D();
export function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, list: Inst[], cast = true) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, list.length));
  mesh.count = list.length;
  list.forEach((e, i) => {
    dummy.position.set(e.x, e.y, e.z); dummy.scale.set(e.sx ?? 1, e.sy ?? 1, e.sz ?? 1); dummy.rotation.set(e.rx ?? 0, e.ry ?? 0, e.rz ?? 0); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    if (e.color !== undefined) mesh.setColorAt(i, new THREE.Color(e.color));
  });
  mesh.castShadow = cast; mesh.receiveShadow = true;
  return mesh;
}
const lambert = (color: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
// Box-projected UVs in world space: 1 texture width per unit, texture height spans 2 units.
export function worldMapped(tex: THREE.Texture, color: THREE.ColorRepresentation = '#ffffff') {
  const m = new THREE.MeshLambertMaterial({ color, map: tex });
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
        mat4 wm = modelMatrix * instanceMatrix;
      #else
        mat4 wm = modelMatrix;
      #endif
      vec3 wpos = (wm * vec4(position, 1.0)).xyz;
      vec3 wn = abs(normalize(mat3(wm) * normal));
      vec2 tuv = wn.y > 0.5 ? wpos.xz * vec2(1.0, 0.5) : wn.x > 0.5 ? vec2(wpos.z, wpos.y * 0.5) : vec2(wpos.x, wpos.y * 0.5);
      vMapUv = tuv + 0.5;`);
  };
  return m;
}
const box = new THREE.BoxGeometry(1, 1, 1);

/**
 * Ref-1's foreground: fallen stones at the foot of walls and rust-red leaf litter on the ground nearby. Purely visual and
 * low (under a quarter of a tile), so nothing in play is ever hidden; placement comes from a hash, so it never changes.
 */
function rubble(map: MapData, gr: (x: number, y: number) => number, at: (x: number, y: number) => number) {
  const stones: Inst[] = [], litter: Inst[] = [];
  const stoneTones = [ramps.stone[2], ramps.stone[3], ramps.stone[3], ramps.stone[4], ramps.stone[2], '#7d5a4a'];
  const rust = ['#be5b54', '#854457', '#b06621', '#6c3223', '#d7a875'];
  const solid = (t: number) => t === T.wall || t === T.rampart;
  for (let y = 1; y < map.height - 1; y++) for (let x = 1; x < map.width - 1; x++) {
    const t = at(x, y), g = gr(x, y);
    if (t !== T.none || g === G.water || map.floors[0].roof[y * map.width + x] >= 0) continue;
    const nearWall = solid(at(x - 1, y)) || solid(at(x + 1, y)) || solid(at(x, y - 1)) || solid(at(x, y + 1));
    const r = hash2(x * 7.3, y * 3.9), r2 = hash2(x * 2.1 + 5, y * 8.7), r3 = hash2(x + 41, y * 1.3);
    if (nearWall && r > 0.3) {
      // Lean the pile against the wall it fell from.
      const wx = solid(at(x - 1, y)) ? -1 : solid(at(x + 1, y)) ? 1 : 0, wz = wx ? 0 : solid(at(x, y - 1)) ? -1 : 1;
      const n = 2 + Math.floor(r2 * 4);
      for (let i = 0; i < n; i++) {
        const a = hash2(x * 11 + i, y * 13 - i), b = hash2(x * 17 - i, y * 5 + i), s = 0.11 + a * 0.15;
        stones.push({ x: x + wx * 0.36 + (b - 0.5) * (wx ? 0.25 : 0.8), y: s * 0.45, z: y + wz * 0.36 + (a - 0.5) * (wz ? 0.25 : 0.8), sx: s, sy: s * 0.75, sz: s * 1.1, ry: a * 6, rx: b, color: stoneTones[Math.floor(b * stoneTones.length)] });
      }
    }
    if ((nearWall ? r3 > 0.45 : r3 > 0.93) && g !== G.cobble && g !== G.flagstone) {
      for (let i = 0; i < 5; i++) {
        const a = hash2(x * 3 + i * 7, y * 19), b = hash2(x * 23, y * 3 + i * 5);
        litter.push({ x: x - 0.4 + a * 0.8, y: 0.012, z: y - 0.4 + b * 0.8, sx: 0.12, sy: 0.02, sz: 0.08, ry: a * 6, color: rust[Math.floor(hash2(x + i, y - i) * rust.length)] });
      }
    }
  }
  const geo = new THREE.DodecahedronGeometry(1, 0);
  return [instanced(geo, lambert('#ffffff', { flatShading: true }), stones), instanced(box, lambert('#ffffff'), litter, false)];
}

export type Lamp = { pos: THREE.Vector3; color: THREE.Color; strength: number; flicker: number };
export type FloorScene = {
  group: THREE.Group; uniforms: { uTime: { value: number } }; lamps: Lamp[];
  roofs: { building: Building; mesh: THREE.Object3D; walls: THREE.InstancedMesh }[];
  doors: Map<string, THREE.Group>;
  /** Lamp and altar flames, one instance per tile, so each can be lit or dark on its own. */
  lanterns?: { mesh: THREE.InstancedMesh; tiles: [number, number][] };
};

const groundVertex = /* glsl */`
varying vec3 vGroundPos;
`;
const groundFragment = /* glsl */`
uniform vec3 uSkyTint; uniform vec3 uGlint; uniform sampler2D uMap; uniform sampler2D uAo; uniform sampler2D uAtlas; uniform vec2 uSize; uniform float uKinds; uniform float uTime; uniform float uCave; uniform float uGrid; uniform float uDapple; uniform float uGroundBright; uniform float uGroundDetail; uniform vec3 uMean[11];
varying vec3 vGroundPos;
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
`;

function groundMaterial(map: MapData, z: number) {
  const floor = map.floors[z];
  const { width: w, height: h } = map;
  const data = new Uint8Array(w * h * 4), ao = new Uint8Array(w * h * 4);
  const solid = (x: number, y: number) => { if (x < 0 || y < 0 || x >= w || y >= h) return true; const t = floor.thing[y * w + x]; return t === T.cavewall || t === T.wall || t === T.rampart; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    let g = floor.ground[i];
    const t = floor.thing[i];
    if (z === 1 && t === T.cavewall) {
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!solid(x + dx, y + dy)) edge = true;
      if (!edge) g = G.void;
    }
    data[i * 4] = g;
    let occ = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && solid(x + dx, y + dy)) occ += dx && dy ? 0.5 : 1;
    if (t === T.tree || t === T.pine) occ += 2.5;
    ao[i * 4] = Math.round(255 * Math.max(0, 1 - occ * 0.11));
  }
  // Mean colour per ground kind (linear), so the "ground detail" knob can calm busy textures toward a flat tone.
  const atlas = groundAtlas();
  const img = atlas.image as HTMLCanvasElement, px = img.getContext('2d')!.getImageData(0, 0, img.width, img.height).data, tile = img.height;
  const means = grounds.map((_, k) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < tile; y++) for (let x = k * tile; x < (k + 1) * tile; x++) { const i = (y * img.width + x) * 4; r += (px[i] / 255) ** 2.2; g += (px[i + 1] / 255) ** 2.2; b += (px[i + 2] / 255) ** 2.2; n++; }
    return new THREE.Vector3(r / n, g / n, b / n);
  });
  const tex = (arr: Uint8Array, filter: THREE.MagnificationTextureFilter) => { const t = new THREE.DataTexture(arr, w, h, THREE.RGBAFormat); t.magFilter = filter; t.minFilter = filter as THREE.MinificationTextureFilter; t.needsUpdate = true; return t; };
  const uniforms = {
    uMap: { value: tex(data, THREE.NearestFilter) }, uAo: { value: tex(ao, THREE.LinearFilter) }, uAtlas: { value: atlas },
    uSize: { value: new THREE.Vector2(w, h) }, uKinds: { value: grounds.length }, uTime: { value: 0 }, uCave: { value: z },
  };
  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms, { uSkyTint: styleUniforms.uSkyTint, uGlint: styleUniforms.uGlint, uGrid: styleUniforms.uGrid, uDapple: styleUniforms.uDapple, uGroundBright: styleUniforms.uGroundBright, uGroundDetail: styleUniforms.uGroundDetail, uMean: { value: means } });
    shader.vertexShader = groundVertex + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGroundPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = groundFragment + shader.fragmentShader
      .replace('#include <map_fragment>', /* glsl */`
        vec2 wp = vGroundPos.xz;
        vec2 px = floor(wp * 32.0) / 32.0 + 1.0 / 64.0;
        vec2 blk = floor(px * 4.0);
        vec2 jit = (vec2(h21(blk), h21(blk + 17.0)) - 0.5) * 0.5;
        vec2 cell = floor(px + 0.5 + jit);
        float kind = floor(texture2D(uMap, (cell + 0.5) / uSize).r * 255.0 + 0.5);
        float own = floor(texture2D(uMap, (floor(px + 0.5) + 0.5) / uSize).r * 255.0 + 0.5);
        if (own == 7.0 || kind == 7.0 || own == 0.0 || kind == 0.0) kind = own;
        vec2 a = fract(px / 2.0);
        // The atlas is an sRGB texture, so sampling already returns linear colour.
        vec3 col = texture2D(uAtlas, vec2((kind + a.x) / uKinds, a.y)).rgb;
        vec3 glint = vec3(0.0);
        if (kind == 7.0) {
          float wave = sin(px.x * 2.3 + uTime * 0.9 + sin(px.y * 1.7 + uTime * 0.5) * 1.5) + sin(px.y * 3.1 - uTime * 0.7);
          // Single scattered glints on the crests, not clumps: clumps read as clouds and turn the river into sky.
          float sparkle = step(1.6, wave) * step(0.95, h21(floor(px * 32.0) + floor(uTime * 3.0)));
          // Low wave contrast: a regular wave snapped to two palette tones draws repeating blobs that read as clouds.
          col = mix(toLinear(vec3(0.16, 0.32, 0.40)), toLinear(vec3(0.18, 0.35, 0.43)), smoothstep(-1.5, 1.5, wave));
          // The river holds the sky's colour and glints with the sun or the moon.
          col = mix(col, uSkyTint, 0.3 * (1.0 - uCave));
          // Glints are a light ripple of the water's own colour, not white points (which read as stars).
          glint = mix(col * 0.9, uGlint * 0.35, 0.5) * sparkle * (1.0 - uCave);
        }
        if (kind != 7.0) col = mix(uMean[int(kind)], col, uGroundDetail) * uGroundBright;
        if (kind == 0.0) col = vec3(0.0);
        float ao = texture2D(uAo, (wp + 0.5) / uSize).r;
        // No per-tile brightness: it drew tile-sized rectangles across the field (the 'camouflage' look).
        float tileVar = 1.0;
        col *= mix(0.42, 1.0, ao) * tileVar;
        // Tile grid: one texel-wide line at tile borders so positions can be counted.
        vec2 tf = fract(wp + 0.5);
        float edgeDist = min(min(tf.x, 1.0 - tf.x), min(tf.y, 1.0 - tf.y));
        if (kind != 0.0) col *= 1.0 - uGrid * step(edgeDist, 1.0 / 32.0);
        diffuseColor.rgb = col;
      `)
      .replace('#include <opaque_fragment>', `
        float dap = sin(wp.x * 0.33 + sin(wp.y * 0.21) * 2.2) * sin(wp.y * 0.29 + wp.x * 0.11 + 1.3) + 0.35 * sin(wp.x * 0.9 + wp.y * 0.7);
        outgoingLight *= mix(1.0, 0.72 + 0.42 * smoothstep(-0.2, 0.45, dap), (1.0 - uCave) * uDapple);
        outgoingLight += glint;
        #include <opaque_fragment>`);
  };
  return { mat, uniforms };
}

function gableRoof(b: Building, tex: THREE.Texture) {
  const ox = 0.32, x0 = b.x0 - 0.5 - ox, x1 = b.x1 + 0.5 + ox, z0 = b.y0 - 0.5 - ox, z1 = b.y1 + 0.5 + ox;
  const alongX = x1 - x0 >= z1 - z0;
  const span = alongX ? z1 - z0 : x1 - x0, len = alongX ? x1 - x0 : z1 - z0;
  const rise = Math.min(2.2, span * 0.42), base = WALL_H - 0.05;
  const g = new THREE.BufferGeometry();
  const P: number[] = [], U: number[] = [];
  const quad = (a: number[], b2: number[], c: number[], d: number[], u: number, v: number) => { P.push(...a, ...b2, ...c, ...a, ...c, ...d); U.push(0, 0, u, 0, u, v, 0, 0, u, v, 0, v); };
  const tri = (a: number[], b2: number[], c: number[]) => { P.push(...a, ...b2, ...c); U.push(0, 0, 1, 0, 0.5, 1); };
  const slope = Math.hypot(span / 2, rise);
  if (alongX) {
    const zm = (z0 + z1) / 2;
    quad([x0, base, z1], [x1, base, z1], [x1, base + rise, zm], [x0, base + rise, zm], len, slope);
    quad([x1, base, z0], [x0, base, z0], [x0, base + rise, zm], [x1, base + rise, zm], len, slope);
    tri([x0 + ox, base, z0 + ox], [x0 + ox, base, z1 - ox], [x0 + ox, base + rise - 0.2, zm]);
    tri([x1 - ox, base, z1 - ox], [x1 - ox, base, z0 + ox], [x1 - ox, base + rise - 0.2, zm]);
  } else {
    const xm = (x0 + x1) / 2;
    quad([x0, base, z0], [x0, base, z1], [xm, base + rise, z1], [xm, base + rise, z0], len, slope);
    quad([x1, base, z1], [x1, base, z0], [xm, base + rise, z0], [xm, base + rise, z1], len, slope);
    tri([x0 + ox, base, z1 - ox], [x1 - ox, base, z1 - ox], [xm, base + rise - 0.2, z1 - ox]);
    tri([x1 - ox, base, z0 + ox], [x0 + ox, base, z0 + ox], [xm, base + rise - 0.2, z0 + ox]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  const roofMat = lambert('#ffffff', { map: tex, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, roofMat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group(); group.add(mesh);
  const ridge = new THREE.Mesh(box, lambert('#2a2420'));
  if (alongX) { ridge.scale.set(len + 0.05, 0.12, 0.16); ridge.position.set((x0 + x1) / 2, base + rise + 0.02, (z0 + z1) / 2); }
  else { ridge.scale.set(0.16, 0.12, len + 0.05); ridge.position.set((x0 + x1) / 2, base + rise + 0.02, (z0 + z1) / 2); }
  ridge.castShadow = true; group.add(ridge);
  // Chimney on clay roofs.
  if (b.roof === 'clay' || b.wall === 'timber') {
    const ch = new THREE.Mesh(box, worldMapped(wallTexture('stone'), '#c9bfb0'));
    ch.scale.set(0.45, 1.1, 0.45); ch.position.set(alongX ? x1 - 1.6 : (x0 + x1) / 2 + 0.6, base + rise * 0.7 + 0.3, alongX ? (z0 + z1) / 2 - 0.5 : z0 + 1.5);
    ch.castShadow = true; group.add(ch);
  }
  return group;
}

function towerTop(b: Building, h: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const w = b.x1 - b.x0 + 1.3, d = b.y1 - b.y0 + 1.3, cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2;
  const slab = new THREE.Mesh(box, mat); slab.scale.set(w, 0.25, d); slab.position.set(cx, h + 0.12, cz); slab.castShadow = true; slab.receiveShadow = true; g.add(slab);
  for (let x = b.x0 - 0.15; x <= b.x1 + 0.2; x += 1) for (const z of [b.y0 - 0.5, b.y1 + 0.5]) { const c = new THREE.Mesh(box, mat); c.scale.set(0.5, 0.45, 0.3); c.position.set(x, h + 0.45, z); c.castShadow = true; g.add(c); }
  for (let z = b.y0; z <= b.y1; z += 1) for (const x of [b.x0 - 0.5, b.x1 + 0.5]) { const c = new THREE.Mesh(box, mat); c.scale.set(0.3, 0.45, 0.5); c.position.set(x, h + 0.45, z); c.castShadow = true; g.add(c); }
  const banner = new THREE.Mesh(box, lambert('#8a2e26')); banner.scale.set(0.5, 1.1, 0.05); banner.position.set(cx, h - 0.7, b.y1 + 0.53); g.add(banner);
  return g;
}

export function buildFloor(map: MapData, z: number, doorsOpen: Record<string, boolean>): FloorScene {
  const group = new THREE.Group();
  const floor = map.floors[z];
  const { width: w, height: h } = map;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? T.cavewall : floor.thing[y * w + x]);
  const gr = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? G.void : floor.ground[y * w + x]);
  const lamps: Lamp[] = [];
  const doors = new Map<string, THREE.Group>();

  const { mat: gm, uniforms } = groundMaterial(map, z);
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), gm);
  plane.rotation.x = -Math.PI / 2; plane.position.set(w / 2 - 0.5, 0, h / 2 - 0.5);
  plane.receiveShadow = true;
  group.add(plane);
  // Water sits a touch lower with dark banks.
  const timeUniform = { uTime: uniforms.uTime };

  // Pixel tufts: tall clumps in the meadow, a few short ones in town grass, flowers where the map has them.
  if (z === 0) {
    const spots: Record<TuftKind, { x: number; z: number }[]> = { tall: [], short: [], daisy: [], bloom: [] };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const g = gr(x, y), t = at(x, y);
      if (g !== G.grass && g !== G.meadow) continue;
      if (t !== T.none && t !== T.flowers) continue;
      const r1 = hash2(x * 13, y * 7), r2 = hash2(x * 5, y * 11), r3 = hash2(x + 17, y + 29);
      if (t === T.flowers) { spots[r1 > 0.5 ? 'daisy' : 'bloom'].push({ x: x - 0.2 + r2 * 0.4, z: y - 0.3 + r3 * 0.6 }); continue; }
      if (g === G.meadow) { if (r1 > 0.35) spots.tall.push({ x: x - 0.3 + r2 * 0.6, z: y - 0.4 + r3 * 0.5 }); if (r2 > 0.55) spots.short.push({ x: x - 0.4 + r3 * 0.8, z: y + 0.1 + r1 * 0.3 }); }
      else if (r1 > 0.72) spots.short.push({ x: x - 0.3 + r2 * 0.6, z: y - 0.3 + r3 * 0.6 });
    }
    for (const k of Object.keys(spots) as TuftKind[]) if (spots[k].length) group.add(tuftMesh(k, spots[k], uniforms.uTime));
  }

  // Trees, bushes, rocks.
  const trunks: Inst[] = [], rocks: Inst[] = [], trees: { x: number; y: number; kind: 'tree' | 'pine' | 'bush' }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = at(x, y), r = hash2(x * 3.1, y * 1.7);
    if (t === T.tree) trees.push({ x, y, kind: 'tree' });
    else if (t === T.pine) trees.push({ x, y, kind: 'pine' });
    else if (t === T.bush) trees.push({ x, y, kind: 'bush' });
    else if (t === T.rock) rocks.push({ x: x + (r - 0.5) * 0.3, y: 0.18, z: y, sx: 0.45 + r * 0.2, sy: 0.32 + r * 0.15, sz: 0.4, ry: r * 6, color: z ? '#5a554e' : '#7d796d' });
    else if (t === T.stump) trunks.push({ x, y: 0.1, z: y, sx: 0.38, sy: 0.2, sz: 0.38, color: '#4a3a2e' });
  }
  group.add(buildTrees(trees));
  if (trunks.length) group.add(instanced(box, lambert('#ffffff'), trunks));
  group.add(instanced(new THREE.DodecahedronGeometry(0.6, 0), lambert('#ffffff', { flatShading: true }), rocks));
  if (z === 0) group.add(...rubble(map, gr, at));

  // Building walls, grouped per building for cut-away.
  const roofs: FloorScene['roofs'] = [];
  const wallMats: Record<string, THREE.Material> = {};
  const wallMat = (style: string) => (wallMats[style] ??= worldMapped(wallTexture(style)));
  if (z === 0) for (const b of map.buildings) {
    const tower = b.name === 'South gate';
    const wh = tower ? 3.1 : WALL_H;
    const list: Inst[] = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (at(x, y) === T.wall) list.push({ x, y: wh / 2, z: y, sy: wh });
    const walls = instanced(new THREE.BoxGeometry(1, 1, 1), wallMat(b.wall), list);
    group.add(walls);
    const roof = tower ? towerTop(b, wh, wallMat('rampart')) : gableRoof(b, roofTexture(b.roof));
    group.add(roof);
    roofs.push({ building: b, mesh: roof, walls });
  }
  // Ramparts and cave walls.
  const ramp: Inst[] = [], crenel: Inst[] = [], cave: Inst[] = [];
  const open = (x: number, y: number) => { const t = at(x, y); return t !== T.cavewall; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = at(x, y);
    if (t === T.rampart) { ramp.push({ x, y: 1.25, z: y, sy: 2.5 }); if ((x + y) % 2 === 0) crenel.push({ x, y: 2.7, z: y, sx: 0.55, sy: 0.4, sz: 0.55 }); }
    if (z === 1 && t === T.cavewall) {
      let edge = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) edge = true;
      if (edge) { const r = hash2(x * 1.3, y * 2.9); cave.push({ x, y: 0.8 + r * 0.3, z: y, sx: 1.02, sy: 1.6 + r * 0.6, sz: 1.02, color: r > 0.5 ? '#9a948a' : '#8a847a' }); }
    }
  }
  group.add(instanced(box, wallMat('rampart'), ramp));
  group.add(instanced(box, wallMat('rampart'), crenel));
  if (cave.length) group.add(instanced(box, worldMapped(wallTexture('cave')), cave));

  // Props.
  const plank = lambert('#ffffff', { map: plankTexture() }), darkPlank = lambert('#ffffff', { map: plankTexture(true) });
  const props: { mat: THREE.Material; geo: THREE.BufferGeometry; list: Inst[] }[] = [];
  const add = (mat: THREE.Material, geo: THREE.BufferGeometry, inst: Inst) => { let p = props.find(p => p.mat === mat && p.geo === geo); if (!p) { p = { mat, geo, list: [] }; props.push(p); } p.list.push(inst); };
  const iron = lambert('#2c2a2a'), stone = worldMapped(wallTexture('stone')), white = lambert('#ffffff');
  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), cyl6 = new THREE.CylinderGeometry(0.5, 0.5, 1, 6);
  const lanternMat = new THREE.MeshBasicMaterial({ color: '#ffc27a' });
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff9a3a' });
  const isFenceLike = (x: number, y: number) => { const t = at(x, y); return t === T.fence || t === T.rampart || t === T.wall; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = at(x, y), r = hash2(x * 2.3, y * 4.1);
    switch (t) {
      case T.fence: {
        add(darkPlank, box, { x, y: 0.4, z: y, sx: 0.14, sy: 0.8, sz: 0.14 });
        if (isFenceLike(x + 1, y)) for (const hy of [0.3, 0.62]) add(plank, box, { x: x + 0.5, y: hy, z: y, sx: 1, sy: 0.08, sz: 0.06 });
        if (isFenceLike(x, y + 1)) for (const hy of [0.3, 0.62]) add(plank, box, { x, y: hy, z: y + 0.5, sx: 0.06, sy: 0.08, sz: 1 });
        break;
      }
      case T.lamp: {
        add(iron, box, { x, y: 1.0, z: y, sx: 0.09, sy: 2.0, sz: 0.09 });
        add(iron, box, { x: x + 0.15, y: 1.95, z: y, sx: 0.38, sy: 0.06, sz: 0.06 });
        add(lanternMat, box, { x: x + 0.3, y: 1.75, z: y, sx: 0.16, sy: 0.22, sz: 0.16 });
        add(iron, box, { x: x + 0.3, y: 1.9, z: y, sx: 0.22, sy: 0.05, sz: 0.22 });
        lamps.push({ pos: new THREE.Vector3(x + 0.3, 1.7, y), color: new THREE.Color('#ffb066'), strength: 1, flicker: r * 10 });
        break;
      }
      case T.brazier: {
        add(iron, cyl6, { x, y: 0.35, z: y, sx: 0.12, sy: 0.7, sz: 0.12 });
        add(iron, cyl6, { x, y: 0.72, z: y, sx: 0.5, sy: 0.14, sz: 0.5 });
        add(fireMat, box, { x, y: 0.86, z: y, sx: 0.26, sy: 0.2, sz: 0.26, ry: r });
        lamps.push({ pos: new THREE.Vector3(x, 1.1, y), color: new THREE.Color('#ff8a3a'), strength: 1.3, flicker: r * 10 });
        break;
      }
      case T.crate: add(plank, box, { x, y: 0.33, z: y, sx: 0.66, sy: 0.66, sz: 0.66, ry: (r - 0.5) * 0.3 }); break;
      case T.barrel: add(darkPlank, cyl, { x, y: 0.36, z: y, sx: 0.56, sy: 0.72, sz: 0.56 }); add(iron, cyl, { x, y: 0.5, z: y, sx: 0.59, sy: 0.06, sz: 0.59 }); add(iron, cyl, { x, y: 0.2, z: y, sx: 0.59, sy: 0.06, sz: 0.59 }); break;
      case T.counter: add(darkPlank, box, { x, y: 0.4, z: y, sx: 1, sy: 0.8, sz: 0.62 }); add(plank, box, { x, y: 0.82, z: y, sx: 1.04, sy: 0.06, sz: 0.7 }); break;
      case T.table: add(plank, box, { x, y: 0.62, z: y, sx: 0.86, sy: 0.07, sz: 0.86 }); for (const [dx, dz] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) add(darkPlank, box, { x: x + dx, y: 0.3, z: y + dz, sx: 0.08, sy: 0.6, sz: 0.08 }); if (r > 0.4) add(lambert('#c9a46a'), cyl6, { x: x + 0.1, y: 0.72, z: y, sx: 0.14, sy: 0.14, sz: 0.14 }); break;
      case T.shelf: {
        add(darkPlank, box, { x, y: 0.85, z: y - 0.25, sx: 0.96, sy: 1.7, sz: 0.4 });
        const cols = ['#b5523e', '#4b7ab0', '#6aa05a', '#d4b04a', '#8b5aa0'];
        for (let i = 0; i < 6; i++) add(white, box, { x: x - 0.35 + (i % 3) * 0.33, y: 0.55 + Math.floor(i / 3) * 0.55, z: y - 0.08, sx: 0.12, sy: 0.2, sz: 0.12, color: cols[Math.floor(hash2(x + i, y) * 5 * 0.999)] });
        break;
      }
      case T.well: add(stone, cyl, { x, y: 0.3, z: y, sx: 0.95, sy: 0.6, sz: 0.95 }); add(lambert('#13282c'), cyl, { x, y: 0.58, z: y, sx: 0.7, sy: 0.04, sz: 0.7 }); for (const dx of [-0.42, 0.42]) add(darkPlank, box, { x: x + dx, y: 0.9, z: y, sx: 0.09, sy: 1.2, sz: 0.09 }); add(darkPlank, box, { x, y: 1.5, z: y, sx: 1.1, sy: 0.08, sz: 0.5, rx: 0 }); break;
      case T.vault: add(darkPlank, box, { x, y: 0.32, z: y, sx: 0.8, sy: 0.64, sz: 0.6 }); add(iron, box, { x, y: 0.5, z: y, sx: 0.84, sy: 0.07, sz: 0.64 }); add(lambert('#d0a84a'), box, { x, y: 0.4, z: y + 0.31, sx: 0.12, sy: 0.14, sz: 0.04 }); break;
      case T.altar: add(stone, box, { x, y: 0.42, z: y, sx: 1.4, sy: 0.84, sz: 0.7 }); add(lanternMat, box, { x, y: 1.0, z: y, sx: 0.18, sy: 0.3, sz: 0.18 }); lamps.push({ pos: new THREE.Vector3(x, 1.2, y), color: new THREE.Color('#ffd08a'), strength: 1.2, flicker: r * 10 }); break;
      case T.pillar: add(stone, cyl, { x, y: WALL_H / 2, z: y, sx: 0.5, sy: WALL_H, sz: 0.5 }); break;
      case T.bed: add(darkPlank, box, { x, y: 0.22, z: y, sx: 0.8, sy: 0.3, sz: 0.95 }); add(lambert('#8a3a34'), box, { x, y: 0.4, z: y + 0.1, sx: 0.74, sy: 0.08, sz: 0.7 }); add(lambert('#e2d6bc'), box, { x, y: 0.42, z: y - 0.32, sx: 0.6, sy: 0.1, sz: 0.24 }); break;
      case T.anvil: add(iron, box, { x, y: 0.25, z: y, sx: 0.36, sy: 0.5, sz: 0.3 }); add(lambert('#3e3c3c'), box, { x, y: 0.56, z: y, sx: 0.8, sy: 0.16, sz: 0.34 }); break;
      case T.hatch: add(lambert('#1a1512'), box, { x, y: 0.03, z: y, sx: 0.96, sy: 0.06, sz: 0.96 }); add(plank, box, { x, y: 0.07, z: y - 0.04, sx: 0.8, sy: 0.05, sz: 0.74 }); add(iron, box, { x, y: 0.11, z: y + 0.2, sx: 0.3, sy: 0.04, sz: 0.06 }); break;
      case T.ladder: for (const dx of [-0.25, 0.25]) add(darkPlank, box, { x: x + dx, y: 1.5, z: y - 0.38, sx: 0.08, sy: 3, sz: 0.08 }); for (let i = 0; i < 7; i++) add(plank, box, { x, y: 0.25 + i * 0.4, z: y - 0.38, sx: 0.5, sy: 0.05, sz: 0.06 }); break;
      case T.door: {
        const horizontal = at(x - 1, y) === T.wall || at(x + 1, y) === T.wall;
        const pivot = new THREE.Group();
        pivot.position.set(horizontal ? x - 0.45 : x, 0, horizontal ? y : y - 0.45);
        const leaf = new THREE.Mesh(box, darkPlank); leaf.castShadow = true;
        leaf.scale.set(horizontal ? 0.9 : 0.14, 1.65, horizontal ? 0.14 : 0.9);
        leaf.position.set(horizontal ? 0.45 : 0, 0.83, horizontal ? 0 : 0.45);
        pivot.add(leaf);
        const lintel = new THREE.Mesh(box, wallMat('timber')); lintel.scale.set(horizontal ? 1 : 0.9, WALL_H - 1.7, horizontal ? 0.9 : 1); lintel.position.set(x, 1.7 + (WALL_H - 1.7) / 2, y); lintel.castShadow = true;
        group.add(pivot, lintel);
        pivot.userData.horizontal = horizontal;
        pivot.rotation.y = doorsOpen[`${x},${y},${z}`] ? (horizontal ? -Math.PI / 2 : Math.PI / 2) : 0;
        doors.set(`${x},${y},${z}`, pivot);
        break;
      }
    }
  }
  let lanterns: FloorScene['lanterns'];
  for (const p of props) {
    const mesh = instanced(p.geo, p.mat, p.list.map(e => ({ ...e, color: e.color ?? '#ffffff' })), p.mat !== lanternMat && p.mat !== fireMat);
    if (p.mat === lanternMat) lanterns = { mesh, tiles: p.list.map(e => [Math.round(e.x), Math.round(e.z)]) };
    group.add(mesh);
  }
  return { group, uniforms: timeUniform, lamps, roofs, doors, lanterns };
}
