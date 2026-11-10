import * as THREE from 'three';
import { type MapData, type Building, G, T, grounds } from '../../../../packages/game/src/model.ts';
import { hash2 } from '../../../../packages/game/src/town.ts';
import { groundAtlas, wallTexture, roofTexture, plankTexture } from './textures.ts';
import { tuftMesh, type TuftKind } from './tufts.ts';
import { Mason, prim, roundArch } from './architecture/kit.ts';
import { buildTrees } from './trees.ts';
import { ramps } from './palette.ts';
import { propModel, type PropPart } from './props.ts';

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
    // Pebbles scatter round a boulder, so rocks lie in groups.
    const nearRock = at(x - 1, y) === T.rock || at(x + 1, y) === T.rock || at(x, y - 1) === T.rock || at(x, y + 1) === T.rock;
    if (nearRock && r2 > 0.3) for (let i = 0; i < 3; i++) {
      const a = hash2(x * 5 + i, y * 3 - i), b = hash2(x * 3 - i, y * 7 + i), s = 0.05 + a * 0.07;
      stones.push({ x: x + (a - 0.5) * 0.8, y: s * 0.4, z: y + (b - 0.5) * 0.8, sx: s, sy: s * 0.7, sz: s * 1.2, ry: a * 6, rx: b, color: stoneTones[Math.floor(b * stoneTones.length)] });
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

/**
 * Where a town house's windows go: every other wall tile along each of its four faces, off the corners, where the face
 * looks onto open ground. `ry` turns a pane that faces +z onto its face; `gate` is the share of night it waits for, so
 * a street lights unevenly.
 */
export function windowSpots(map: MapData) {
  const { width: w, height: h } = map, th = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? T.none : map.floors[0].thing[y * w + x]);
  const spots: { x: number; z: number; ry: number; gate: number }[] = [];
  for (const b of map.buildings) {
    if (b.name === 'South gate') continue;
    const faces: [number, number, number, number, number, number][] = [[b.x0 + 1, b.y1, 1, 0, 0, 1], [b.x0 + 1, b.y0, 1, 0, 0, -1], [b.x1, b.y0 + 1, 0, 1, 1, 0], [b.x0, b.y0 + 1, 0, 1, -1, 0]];
    for (const [sx, sy, dx, dy, nx, nz] of faces) for (let x = sx, y = sy; dx ? x < b.x1 : y < b.y1; x += dx * 2, y += dy * 2) {
      if (th(x, y) !== T.wall || th(x + nx, y + nz) !== T.none) continue;
      spots.push({ x: x + nx * 0.505, z: y + nz * 0.505, ry: Math.atan2(nx, nz), gate: 0.15 + hash2(x * 3, y * 5) * 0.8 });
    }
  }
  return spots;
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
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }
float kindAt(vec2 c){ return floor(texture2D(uMap, (c + 0.5) / uSize).r * 255.0 + 0.5); }
bool grassy(float k){ return k == 1.0 || k == 2.0; }
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
        // Ground kinds meet along a ragged line: two octaves of noise on a two-pixel grid push each pixel's lookup
        // about, so edges wander instead of stepping in tile or block stairs.
        vec2 pq = floor(wp * 16.0) / 16.0;
        vec2 disp = (vec2(vn(pq * 1.1), vn(pq * 1.1 + 17.3)) - 0.5) * 0.62 + (vec2(vn(pq * 3.3 + 5.1), vn(pq * 3.3 + 41.7)) - 0.5) * 0.26;
        float own = kindAt(floor(px + 0.5));
        float kind = kindAt(floor(px + 0.5 + disp));
        // Grass reaches over the edge of a path in blades: a lookup pushed down by a different amount in every pixel
        // column, so grass below a path pokes up into it.
        float blade = h21(vec2(floor(px.x * 32.0), 7.0)) * h21(vec2(floor(px.x * 32.0), 11.0));
        float kb = kindAt(floor(px + 0.5 + disp + vec2(0.0, blade * 0.2)));
        if (grassy(kb) && !grassy(kind)) kind = kb;
        // Water wanders less, and the bridge deck and the dark keep their exact tiles.
        vec2 wdisp = disp * 0.75;
        if (own == 7.0 || kind == 7.0) kind = kindAt(floor(px + 0.5 + wdisp));
        if (own == 0.0 || own == 5.0 || kind == 0.0 || kind == 5.0) kind = own;
        // How far the shore is, in pixels (water side and land side alike).
        float shore = 99.0;
        if (uCave < 0.5) for (int i = 1; i <= 6; i++) {
          float d = float(i) * 2.0 / 32.0;
          bool w0 = kind == 7.0;
          bool hit = (kindAt(floor(px + 0.5 + wdisp + vec2(d, 0.0))) == 7.0) != w0 || (kindAt(floor(px + 0.5 + wdisp - vec2(d, 0.0))) == 7.0) != w0
                  || (kindAt(floor(px + 0.5 + wdisp + vec2(0.0, d))) == 7.0) != w0 || (kindAt(floor(px + 0.5 + wdisp - vec2(0.0, d))) == 7.0) != w0;
          if (hit) { shore = float(i) * 2.0; break; }
        }
        vec2 a = fract(px / 2.0);
        // The atlas is an sRGB texture, so sampling already returns linear colour.
        vec3 col = texture2D(uAtlas, vec2((kind + a.x) / uKinds, a.y)).rgb;
        // A path's top edge sits in the shadow of the grass above it.
        if (!grassy(kind) && kind != 7.0 && grassy(kindAt(floor(px + 0.5 + disp - vec2(0.0, 2.0 / 32.0))))) col *= 0.72;
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
          // Shallows lighten towards the bank; a broken foam line laps at the edge.
          if (shore < 13.0) col = mix(col, toLinear(vec3(0.36, 0.52, 0.5)), 0.32 * (1.0 - shore / 14.0));
          float lap = sin(uTime * 1.3 + px.x * 5.0 + px.y * 3.0 + vn(px * 3.0) * 6.0);
          if (shore <= 2.0 && lap > -0.5) col = toLinear(vec3(0.72, 0.8, 0.78));
          else if (shore <= 4.0 && lap > 0.55 && h21(floor(px * 32.0)) > 0.5) col = mix(col, toLinear(vec3(0.62, 0.72, 0.7)), 0.6);
        } else if (shore < 13.0 && kind != 0.0 && kind != 5.0) col = mix(col, col * toLinear(vec3(0.55, 0.5, 0.46)), shore <= 4.0 ? 0.9 : shore <= 8.0 ? 0.55 : 0.25);
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
    tri([x0 + ox, base, z0 + ox], [x0 + ox, base, z1 - ox], [x0 + ox, base + rise - 0.02, zm]);
    tri([x1 - ox, base, z1 - ox], [x1 - ox, base, z0 + ox], [x1 - ox, base + rise - 0.02, zm]);
  } else {
    const xm = (x0 + x1) / 2;
    quad([x0, base, z0], [x0, base, z1], [xm, base + rise, z1], [xm, base + rise, z0], len, slope);
    quad([x1, base, z1], [x1, base, z0], [xm, base + rise, z0], [xm, base + rise, z1], len, slope);
    tri([x0 + ox, base, z1 - ox], [x1 - ox, base, z1 - ox], [xm, base + rise - 0.02, z1 - ox]);
    tri([x1 - ox, base, z0 + ox], [x0 + ox, base, z0 + ox], [xm, base + rise - 0.02, z0 + ox]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.computeVertexNormals();
  const roofMat = lambert('#ffffff', { map: tex, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, roofMat);
  mesh.castShadow = true; mesh.receiveShadow = true;
  const group = new THREE.Group(); group.add(mesh);
  // Timber that gives the roof its edges: fascia boards on the eaves, bargeboards up the gable rakes, ridge tiles and
  // finials; on long clay and slate roofs, dormers on the slope that faces the town. All of it hides with the roof.
  const trim = new Mason(), cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, S = span / 2, L = len / 2;
  const timber = '#3b2819', tile = ({ clay: '#8e4630', slate: '#2e3a66', teal: '#24524e', thatch: '#6e5a34' } as Record<string, string>)[b.roof] ?? '#3a3040';
  const roofTone = ({ clay: '#b05a3a', slate: '#3e4c81', teal: '#2f6762', thatch: '#9a7e4a' } as Record<string, string>)[b.roof] ?? '#6a5a50';
  trim.within(cx, 0, cz, alongX ? 0 : Math.PI / 2, () => {
    for (const f of [-1, 1]) {
      trim.block(timber, 0, base - 0.12, base + 0.02, f * (S + 0.02), len + 0.04, 0.07);
      for (const e of [-1, 1]) trim.beam(timber, new THREE.Vector3(e * (L + 0.02), base - 0.04, f * (S + 0.03)), new THREE.Vector3(e * (L + 0.02), base + rise + 0.06, 0), 0.08, 0.11);
    }
    trim.block(tile, 0, base + rise - 0.04, base + rise + 0.1, 0, len + 0.06, 0.2);
    for (let u = -L + 0.25; u < L; u += 0.5) trim.block(roofTone, u, base + rise + 0.1, base + rise + 0.14, 0, 0.3, 0.16);
    for (const e of [-1, 1]) trim.block(timber, e * (L + 0.02), base + rise, base + rise + 0.34, 0, 0.07, 0.07);
    if ((b.roof === 'clay' || b.roof === 'slate') && len >= 5) {
      const n = Math.floor(len / 3.5), zz = S * 0.5, yb = base + rise * (1 - zz / S);
      for (let i = 0; i < n; i++) {
        const u = -L + (i + 0.5) * (len / n);
        trim.block('#d2c3a2', u, yb - 0.2, yb + 0.5, zz - 0.3, 0.62, 0.8);
        trim.block('#1c1816', u, yb + 0.02, yb + 0.36, zz + 0.11, 0.26, 0.02);
        trim.block(timber, u, yb - 0.02, yb + 0.02, zz + 0.12, 0.34, 0.04);
        trim.put(prim.gable(), roofTone, u, yb + 0.5, zz - 0.3, { sx: 0.86, sy: 0.34, sz: 0.78, ry: Math.PI / 2 });
        trim.put(prim.gable(), timber, u, yb + 0.49, zz + 0.11, { sx: 0.06, sy: 0.38, sz: 0.84, ry: Math.PI / 2 });
      }
    }
  });
  const trimMesh = trim.build(lambert('#ffffff', { vertexColors: true })); trimMesh.castShadow = true; trimMesh.receiveShadow = true;
  group.add(trimMesh);
  // Chimney on clay roofs, with a corbelled cap and a dark flue.
  if (b.roof === 'clay' || b.wall === 'timber') {
    const ch = new THREE.Mesh(box, worldMapped(wallTexture('stone'), '#c9bfb0'));
    const chx = alongX ? x1 - 1.6 : (x0 + x1) / 2 + 0.6, chz = alongX ? (z0 + z1) / 2 - 0.5 : z0 + 1.5, chy = base + rise * 0.7 + 0.3;
    ch.scale.set(0.45, 1.1, 0.45); ch.position.set(chx, chy, chz);
    ch.castShadow = true; group.add(ch);
    const cap = new Mason();
    cap.block('#b8afa2', chx, chy + 0.5, chy + 0.6, chz, 0.56, 0.56);
    cap.block('#1a1614', chx, chy + 0.6, chy + 0.64, chz, 0.3, 0.3);
    for (const dx of [-0.12, 0.12]) cap.block('#8a6050', chx + dx, chy + 0.6, chy + 0.76, chz, 0.1, 0.1);
    group.add(cap.build(lambert('#ffffff', { vertexColors: true })));
  }
  return group;
}

const tinted = <M extends THREE.MeshLambertMaterial>(m: M) => { m.vertexColors = true; return m; };
const STONE = { face: '#ffffff', light: '#e8e2d8', dark: '#8a8178', deep: '#5e5852', slit: '#1c1816' };
/** An arrow slit with a cross arm: a dark recess in a paler stone surround, on a face whose outward normal is (nx, nz). */
function slit(m: Mason, x: number, y: number, z: number, nx: number, nz: number, hgt = 0.62) {
  const ry = Math.atan2(nx, nz);
  m.within(x, y, z, ry, () => {
    m.block(STONE.light, 0, -0.08, hgt + 0.08, 0.01, 0.3, 0.06);
    m.block(STONE.slit, 0, 0, hgt, 0.035, 0.1, 0.04);
    m.block(STONE.slit, 0, hgt * 0.55, hgt * 0.55 + 0.08, 0.035, 0.26, 0.04);
  });
}
/** A row of merlons along an edge from (ax, az) to (bx, bz), standing on y, with corbels under a projecting course. The outer side is to the left of travel. */
function battlement(m: Mason, ax: number, az: number, bx: number, bz: number, y: number, merlon = 0.42, gap = 0.34) {
  const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az) - Math.PI / 2, n = Math.max(1, Math.floor((len + gap) / (merlon + gap)));
  const pad = (len - (n * merlon + (n - 1) * gap)) / 2;
  m.within((ax + bx) / 2, 0, (az + bz) / 2, ry, () => {
    // Corbels under the course, then the course, a parapet wall, and the merlons on it.
    for (let u = -len / 2 + 0.2; u < len / 2 - 0.1; u += 0.42) m.block(STONE.deep, u, y - 0.26, y, 0.06, 0.16, 0.16);
    m.block(STONE.light, 0, y, y + 0.12, 0.02, len + 0.1, 0.3);
    m.block(STONE.face, 0, y + 0.12, y + 0.42, -0.02, len, 0.22);
    for (let i = 0; i < n; i++) m.block(STONE.face, -len / 2 + pad + merlon / 2 + i * (merlon + gap), y + 0.42, y + 0.82, -0.02, merlon, 0.22);
  });
}

/**
 * A gate tower over its walls: a battered plinth, a string course, arrow slits on the faces that see the road and the
 * field, a machicolated parapet with merlons, and a slate pyramid roof with a finial, a pennant, and a banner hung on the
 * field side. The roof is kept low enough that, from the Play camera, nothing north of the tower is hidden that its
 * walls did not already hide.
 */
function gateTower(b: Building, h: number, wall: THREE.Material) {
  const x0 = b.x0 - 0.5, x1 = b.x1 + 0.5, z0 = b.y0 - 0.5, z1 = b.y1 + 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, W = x1 - x0, D = z1 - z0;
  const m = new Mason(), paint = new Mason(), slate = new Mason();
  m.block(STONE.dark, cx, 0, 0.32, cz, W + 0.24, D + 0.24);
  m.block(STONE.light, cx, 1.5, 1.62, cz, W + 0.1, D + 0.1);
  const faces: [number, number, number, number, number, number][] = [[x0, z1, x1, z1, 0, 1], [x1, z1, x1, z0, 1, 0], [x1, z0, x0, z0, 0, -1], [x0, z0, x0, z1, -1, 0]];
  for (const [ax, az, bx, bz, nx, nz] of faces) battlement(m, ax + nx * 0.12, az + nz * 0.12, bx + nx * 0.12, bz + nz * 0.12, h);
  m.block(STONE.deep, cx, h, h + 0.12, cz, W - 0.2, D - 0.2);
  // Slits on the field face (south) and the faces that flank the road.
  for (const x of [cx - 0.75, cx + 0.75]) slit(m, x, 0.8, z1, 0, 1);
  slit(m, cx, 2.0, z1, 0, 1, 0.5);
  const road = b.x0 < 40 ? 1 : -1, rx = road > 0 ? x1 : x0;
  for (const z of [cz - 0.8, cz + 0.9]) slit(m, rx, 1.9, z, road, 0, 0.5);
  // The roof: a slate pyramid inside the parapet, a finial and a pennant on a pole.
  const rh = 1.75, top = h + 0.12;
  slate.put(prim.cone(4), '#a4a2b4', cx, top + rh / 2, cz, { sx: (W - 0.5) * 0.71, sy: rh, sz: (D - 0.5) * 0.71, ry: Math.PI / 4 });
  paint.put(prim.box(), '#3c3836', cx, top + rh + 0.5, cz, { sx: 0.05, sy: 1.1, sz: 0.05 });
  paint.put(prim.box(), ramps.fire[5], cx, top + rh + 0.06, cz, { sx: 0.16, sy: 0.12, sz: 0.16 });
  paint.put(prim.box(), ramps.roof[2], cx + 0.24, top + rh + 0.88, cz, { sx: 0.44, sy: 0.16, sz: 0.02 });
  paint.put(prim.box(), ramps.roof[1], cx + 0.52, top + rh + 0.9, cz, { sx: 0.16, sy: 0.1, sz: 0.02 });
  // A banner on the field face: a pole on brackets, the cloth, a gold device, and a swallowtail.
  const bx2 = cx + (road > 0 ? -0.05 : 0.05), bz = z1 + 0.09;
  paint.put(prim.box(), '#3c3836', bx2, h - 0.35, bz + 0.03, { sx: 0.7, sy: 0.05, sz: 0.05 });
  paint.block(ramps.roof[2], bx2, h - 1.65, h - 0.38, bz, 0.56, 0.03);
  paint.block(ramps.roof[1], bx2 - 0.18, h - 1.95, h - 1.65, bz, 0.2, 0.03);
  paint.block(ramps.roof[1], bx2 + 0.18, h - 1.95, h - 1.65, bz, 0.2, 0.03);
  paint.block(ramps.fire[5], bx2, h - 1.2, h - 0.75, bz + 0.012, 0.22, 0.02);
  paint.block(ramps.fire[4], bx2, h - 1.42, h - 1.2, bz + 0.012, 0.08, 0.02);
  const g = new THREE.Group();
  const meshes = [m.build(tinted(wall as THREE.MeshLambertMaterial)), paint.build(lambert('#ffffff', { vertexColors: true })), slate.build(tinted(worldMapped(roofTexture('slate'))))];
  for (const mesh of meshes) { mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
  return g;
}

/**
 * The gate arch between the two towers, with a raised portcullis and a crenellated top. It is drawn only for a low
 * eye: from the Play and top-down cameras an arch over the passage would hide whoever stands just inside the gate.
 */
function gateArch(x0: number, x1: number, z: number, open0: number, open1: number, wall: THREE.MeshLambertMaterial) {
  const m = new Mason(), iron = new Mason(), crown = 3.0, top = 3.25, ow = open1 - open0, spring = crown - ow / 2;
  const shape = new THREE.Shape([new THREE.Vector2(x0, 0), new THREE.Vector2(x1, 0), new THREE.Vector2(x1, top), new THREE.Vector2(x0, top)]);
  shape.holes.push(roundArch(ow, spring, (open0 + open1) / 2, 0));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.8, bevelEnabled: false, curveSegments: 8 }).toNonIndexed(); geo.translate(0, 0, z - 0.4); geo.deleteAttribute('uv');
  m.putMatrix(geo, STONE.face, new THREE.Matrix4());
  // Voussoirs: a paler ring of stones round the arch on both faces.
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI - (i / 8) * Math.PI, r = ow / 2 + 0.14, px = (open0 + open1) / 2 + Math.cos(a) * r, py = spring + Math.sin(a) * r;
    for (const f of [-1, 1]) m.put(prim.box(), i === 4 ? STONE.light : STONE.dark, px, py, z + f * 0.41, { sx: 0.24, sy: 0.32, sz: 0.04, rz: a - Math.PI / 2 });
  }
  battlement(m, x0, z + 0.4, x1, z + 0.4, top);
  for (let x = open0 + 0.25; x < open1 - 0.1; x += 0.36) { iron.block('#3a3634', x, crown - 0.75, crown - 0.02, z, 0.05, 0.05); iron.put(prim.cone(4), '#3a3634', x, crown - 0.85, z, { sx: 0.05, sy: 0.2, sz: 0.05, rx: Math.PI }); }
  for (const y of [crown - 0.6, crown - 0.3]) iron.block('#3a3634', (open0 + open1) / 2, y, y + 0.05, z, ow - 0.2, 0.05);
  const g = new THREE.Group();
  // No shadow: from above, a dark band across the passage with no arch to cast it reads as a hole.
  for (const mesh of [m.build(lowOnly(tinted(wall))), iron.build(lowOnly(lambert('#ffffff', { vertexColors: true })))]) { mesh.receiveShadow = true; g.add(mesh); }
  return g;
}
/** Draw a material only where the eye looks at it from low down, dithering it out as the view steepens past ~35°. */
function lowOnly<M extends THREE.MeshLambertMaterial>(mat: M) {
  const key = mat.customProgramCacheKey(), prior = mat.onBeforeCompile.bind(mat);
  mat.customProgramCacheKey = () => key + '|low-only';
  mat.onBeforeCompile = (shader, renderer) => {
    prior(shader, renderer);
    shader.vertexShader = 'varying vec3 vLowPos;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vLowPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 vLowPos;\n' + shader.fragmentShader.replace('void main() {', `void main() {
      { float up = normalize(cameraPosition - vLowPos).y;
        float b = fract(dot(floor(gl_FragCoord.xy), vec2(0.5, 0.25)) + 0.125 * mod(floor(gl_FragCoord.y), 2.0));
        if (smoothstep(0.5, 0.62, up) > b) discard; }`);
  };
  return mat;
}

/**
 * The town wall: a battered foot, a string course, a parapet with merlons on the field side (corbelled out over the
 * face), buttress piers and arrow slits along the outer face. One merged mesh over the rampart tiles.
 */
function ramparts(at: (x: number, y: number) => number, w: number, h: number, wall: THREE.MeshLambertMaterial) {
  const m = new Mason();
  let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (at(x, y) === T.rampart) { bx0 = Math.min(bx0, x); by0 = Math.min(by0, y); bx1 = Math.max(bx1, x); by1 = Math.max(by1, y); }
  if (bx0 === Infinity) return undefined;
  const H = 2.5;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== T.rampart) continue;
    m.block(STONE.face, x, 0, H, y, 1, 1);
    m.block(STONE.dark, x, 0, 0.28, y, 1.16, 1.16);
    m.block(STONE.light, x, 1.3, 1.38, y, 1.06, 1.06);
    m.block(STONE.deep, x, H - 0.01, H + 0.02, y, 0.98, 0.98);
    const outs: [number, number][] = [];
    if (y === by1) outs.push([0, 1]); if (y === by0) outs.push([0, -1]); if (x === bx0) outs.push([-1, 0]); if (x === bx1) outs.push([1, 0]);
    // A short run of rampart beside a gate (not on the outer ring) faces the way its row does.
    if (!outs.length) outs.push(y > (by0 + by1) / 2 ? [0, 1] : [0, -1]);
    for (const [nx, nz] of outs) {
      const along = nx === 0, cx = x + nx * 0.45, cz = y + nz * 0.45, tx = nz * 0.5, tz = -nx * 0.5;
      const run = (dx: number, dz: number) => at(x + dx, y + dz) === T.rampart;
      battlement(m, cx - tx, cz - tz, cx + tx, cz + tz, H, 0.46, 0.54);
      const k = along ? x : y;
      if (k % 5 === 0 && (along ? run(-1, 0) && run(1, 0) : run(0, -1) && run(0, 1))) {
        m.block(STONE.face, x + nx * 0.6, 0, 1.9, y + nz * 0.6, along ? 0.46 : 0.24, along ? 0.24 : 0.46);
        m.put(prim.box(), STONE.light, x + nx * 0.6, 1.95, y + nz * 0.6, { sx: along ? 0.48 : 0.26, sy: 0.12, sz: along ? 0.26 : 0.48, rx: along ? nz * 0.6 : 0, rz: along ? 0 : -nx * 0.6 });
      } else if (k % 5 === 2) slit(m, x + nx * 0.5, 0.9, y + nz * 0.5, nx, nz);
    }
  }
  const mesh = m.build(tinted(wall)); mesh.castShadow = true; mesh.receiveShadow = true;
  return mesh;
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
    const spots: Record<TuftKind, { x: number; z: number }[]> = { tall: [], short: [], daisy: [], bloom: [], reed: [] };
    const near = (x: number, y: number, f: (x: number, y: number) => boolean) => f(x - 1, y) || f(x + 1, y) || f(x, y - 1) || f(x, y + 1);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const g = gr(x, y), t = at(x, y);
      // Reeds stand along the banks, on the side that meets the water.
      if (t === T.none && g !== G.water && g !== G.plank && near(x, y, (a, b) => gr(a, b) === G.water)) {
        const wz = gr(x, y - 1) === G.water ? -0.3 : gr(x, y + 1) === G.water ? 0.3 : 0, wx = wz ? 0 : gr(x - 1, y) === G.water ? -0.3 : 0.3;
        for (let i = 0; i < 2; i++) if (hash2(x * 3.7 + i, y * 5.1) > 0.45) spots.reed.push({ x: x + wx + (hash2(x + i, y * 2) - 0.5) * (wz ? 0.8 : 0.2), z: y + wz + (hash2(x * 2, y + i) - 0.5) * (wx ? 0.8 : 0.2) });
      }
      // Flowers and grass gather round the flower beds and bushes the map has, so they cluster instead of standing alone.
      if ((g === G.grass || g === G.meadow) && t === T.none) {
        const rr = hash2(x * 9.1, y * 4.3);
        if (near(x, y, (a, b) => at(a, b) === T.flowers) && rr > 0.55) spots[rr > 0.78 ? 'daisy' : 'bloom'].push({ x: x - 0.3 + hash2(x, y * 7) * 0.6, z: y - 0.3 + hash2(x * 7, y) * 0.6 });
        if (near(x, y, (a, b) => at(a, b) === T.bush) && rr > 0.4) spots.short.push({ x: x - 0.3 + hash2(x * 3, y) * 0.6, z: y - 0.3 + hash2(x, y * 3) * 0.6 });
      }
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
  const trees: { x: number; y: number; kind: 'tree' | 'pine' | 'bush' }[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = at(x, y);
    if (t === T.tree) trees.push({ x, y, kind: 'tree' });
    else if (t === T.pine) trees.push({ x, y, kind: 'pine' });
    else if (t === T.bush) trees.push({ x, y, kind: 'bush' });
  }
  group.add(buildTrees(trees));
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
    const roof = tower ? gateTower(b, wh, worldMapped(wallTexture('rampart'))) : gableRoof(b, roofTexture(b.roof));
    group.add(roof);
    roofs.push({ building: b, mesh: roof, walls });
  }
  // Ramparts and cave walls.
  const cave: Inst[] = [];
  const open = (x: number, y: number) => { const t = at(x, y); return t !== T.cavewall; };
  if (z === 1) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (at(x, y) !== T.cavewall) continue;
    let edge = false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (open(x + dx, y + dy)) edge = true;
    if (edge) { const r = hash2(x * 1.3, y * 2.9); cave.push({ x, y: 0.8 + r * 0.3, z: y, sx: 1.02, sy: 1.6 + r * 0.6, sz: 1.02, color: r > 0.5 ? '#9a948a' : '#8a847a' }); }
  }
  const wallRing = ramparts(at, w, h, worldMapped(wallTexture('rampart')));
  if (wallRing) group.add(wallRing);
  // The arch over the gate passage, between the two gate towers.
  const gates = map.buildings.filter(b => b.name === 'South gate').sort((a, b2) => a.x0 - b2.x0);
  if (z === 0 && gates.length === 2) {
    const [l, r] = gates, gz = l.y1 - 1;
    let o0 = l.x1 + 1, o1 = r.x0 - 1;
    while (at(o0, gz) === T.rampart) o0++;
    while (at(o1, gz) === T.rampart) o1--;
    group.add(gateArch(l.x1 + 0.5, r.x0 - 0.5, gz, o0 - 0.5, o1 + 0.5, worldMapped(wallTexture('rampart'))));
  }
  if (cave.length) group.add(instanced(box, worldMapped(wallTexture('cave')), cave));

  // Props: one model per thing kind and variant (`props.ts`), instanced per part.
  const plank = lambert('#ffffff', { map: plankTexture() }), darkPlank = lambert('#ffffff', { map: plankTexture(true) });
  const props: { mat: THREE.Material; geo: THREE.BufferGeometry; list: Inst[] }[] = [];
  const add = (mat: THREE.Material, geo: THREE.BufferGeometry, inst: Inst) => { let p = props.find(p => p.mat === mat && p.geo === geo); if (!p) { p = { mat, geo, list: [] }; props.push(p); } p.list.push(inst); };
  const iron = lambert('#2c2a2a');
  const lanternMat = new THREE.MeshBasicMaterial({ color: '#ffc27a' });
  const fireMat = new THREE.MeshBasicMaterial({ color: '#ff9a3a' });
  const tinted = (m: THREE.MeshLambertMaterial) => { m.vertexColors = true; return m; };
  const partMat: Record<PropPart, THREE.Material> = {
    wood: tinted(worldMapped(plankTexture())), darkWood: tinted(worldMapped(plankTexture(true))), stone: tinted(worldMapped(wallTexture('stone'))),
    paint: lambert('#ffffff', { vertexColors: true }), fire: fireMat,
  };
  const isFenceLike = (x: number, y: number) => { const t = at(x, y); return t === T.fence || t === T.rampart || t === T.wall; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = at(x, y), r = hash2(x * 2.3, y * 4.1);
    const model = propModel(t, Math.floor(hash2(x * 5.7, y * 3.3) * 97));
    if (model) {
      // Loose things sit a little askew; fixtures stand square to the room.
      const loose = t === T.crate || t === T.barrel || t === T.rock || t === T.stump;
      const inst: Inst = { x: x + (t === T.rock ? (r - 0.5) * 0.2 : 0), y: 0, z: y, ry: loose ? (t === T.crate ? (r - 0.5) * 0.4 : r * 6.28) : 0, color: t === T.rock && z ? '#8a8378' : undefined };
      for (const [part, geo] of Object.entries(model) as [PropPart, THREE.BufferGeometry][]) add(partMat[part], geo, inst);
    }
    if (t === T.lamp) {
      add(lanternMat, box, { x: x + 0.32, y: 1.64, z: y, sx: 0.15, sy: 0.25, sz: 0.15 });
      lamps.push({ pos: new THREE.Vector3(x + 0.3, 1.7, y), color: new THREE.Color('#ffb066'), strength: 1, flicker: r * 10 });
    } else if (t === T.altar) {
      add(lanternMat, box, { x, y: 1.0, z: y - 0.1, sx: 0.16, sy: 0.22, sz: 0.16 });
      lamps.push({ pos: new THREE.Vector3(x, 1.2, y), color: new THREE.Color('#ffd08a'), strength: 1.2, flicker: r * 10 });
    } else if (t === T.brazier) lamps.push({ pos: new THREE.Vector3(x, 1.1, y), color: new THREE.Color('#ff8a3a'), strength: 1.3, flicker: r * 10 });
    switch (t) {
      case T.fence: {
        // A split-rail fence: squared posts with a weathered cap, two rails that sit on the posts' faces and sag a touch.
        add(darkPlank, box, { x, y: 0.42, z: y, sx: 0.16, sy: 0.84, sz: 0.16 });
        add(plank, box, { x, y: 0.86, z: y, sx: 0.2, sy: 0.05, sz: 0.2 });
        const sag = (hash2(x * 1.7, y * 2.3) - 0.5) * 0.06;
        if (isFenceLike(x + 1, y)) for (const hy of [0.3, 0.64]) add(plank, box, { x: x + 0.5, y: hy + sag, z: y + 0.09, sx: 1.04, sy: 0.1, sz: 0.06, rz: sag * 0.3 });
        if (isFenceLike(x, y + 1)) for (const hy of [0.3, 0.64]) add(plank, box, { x: x + 0.09, y: hy + sag, z: y + 0.5, sx: 0.06, sy: 0.1, sz: 1.04, rx: sag * 0.3 });
        break;
      }
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
