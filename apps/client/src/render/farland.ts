import * as THREE from 'three';
import type { MapData } from '../../../../packages/game/src/model.ts';
import { hash2 } from '../../../../packages/game/src/town.ts';
import { ramps } from './palette.ts';
import { groundArt, GS } from './ground-art.ts';
import { hollowKeep, cragHeight } from './architecture/castle.ts';
import { keepDragon } from './architecture/dragon.ts';
import { cathedralCity, cityHill } from './architecture/cathedral.ts';
import { Mason, masonry } from './architecture/kit.ts';
import { pieceOf, piecesOf } from './architecture/scene.ts';
import { cliffs, countriesHeight, countryMesh, lakeDip, lakeMesh, lakeShore, lighthouse, rangeMesh, riverValley, riverZ, roadHalf, roadX, watchtower, windmill } from './architecture/country.ts';
import { tuftMesh, type TuftKind } from './tufts.ts';
import { buildTrees } from './trees.ts';
import { styleUniforms } from './terrain.ts';
import { buildDistrict, buildRuin, groveSpots, broadleafGeometry, firGeometry, type TreeSpot, type Ground } from './architecture/pieces.ts';
import { foliage } from './trees.ts';

/**
 * The world beyond the town, on every side, so a camera that turns finds a horizon worth looking at and can tell which
 * way it faces. Not walkable: scenery only. North, the grandest: the river running on, a forest band, the lower town,
 * the highland with Hollow Keep on its crag and the cathedral city of Saint-Vigil on its hill. South: farmland rolling
 * up to a ridge of windmills. East: the Whisperwood climbing into forested hills with a ruined watchtower. West: a
 * great lake under sea cliffs, with a lighthouse. Ranges close the circle. Every piece is placed from `scene.ts`.
 */
const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

const clamp = (t: number) => Math.max(0, Math.min(1, t));
/** The highland behind the forest band: rolling ground rising north, plus the castle's crag and the city's hill. */
export function highland(x: number, z: number) {
  const t = clamp((-z - 44) / 28), front = t * t * (3 - 2 * t);
  const rolling = 2.4 + Math.sin(x * 0.047 + 1.3) * 1.6 + Math.sin(x * 0.13 + z * 0.07) * 0.9 + Math.sin(z * 0.11 + x * 0.021) * 1.1;
  const rise = clamp((-z - 150) / 110) * 6;
  return front * (rolling + rise) + cragHeight(x, z) + cityHill(x, z) - 0.3;
}
function highlandMesh(g: Ground) {
  const x0 = -330, x1 = 430, z0 = -44, z1 = -310, step = 3.5;
  const geo = new THREE.PlaneGeometry(x1 - x0, z0 - z1, Math.round((x1 - x0) / step), Math.round((z0 - z1) / step));
  geo.rotateX(-Math.PI / 2); geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = geo.attributes.position as THREE.BufferAttribute, cols = new Float32Array(p.count * 3);
  const grass = new THREE.Color(ramps.moss[6]), crest = new THREE.Color(ramps.olive[2]), rock = new THREE.Color(ramps.stone[2]).lerp(new THREE.Color(ramps.slate[1]), 0.4);
  const city = new THREE.Color(ramps.olive[1]), far = new THREE.Color(ramps.slate[0]), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = g(x, z), crag = cragHeight(x, z);
    p.setY(i, h);
    c.copy(grass).lerp(crest, clamp((h - 3) / 8) * 0.6 * (0.6 + hash2(i, 3) * 0.4));
    c.lerp(city, clamp(cityHill(x, z) / 4) * 0.5);
    c.lerp(rock, clamp(Math.abs(crag) / 2.5) * (0.75 + hash2(i, 5) * 0.25));
    c.multiplyScalar(0.72 + 0.4 * clamp(h / 16));
    c.lerp(far, clamp((-z - 140) / 180) * 0.45);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  geo.deleteAttribute('uv'); geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, lambert('#ffffff', { vertexColors: true })); mesh.name = 'highland';
  return mesh;
}
/** Pine groves on the highland, kept off the crag, the city and the castle's foreground. */
function highlandPines(g: Ground, clear: (x: number, z: number) => boolean) {
  const pine = new THREE.ConeGeometry(1, 1, 6), n = 900;
  const inst = new THREE.InstancedMesh(pine, lambert('#ffffff'), n), m = new THREE.Matrix4(), c = new THREE.Color();
  const tones = [ramps.moss[3], ramps.moss[4], ramps.moss[5]].map(h => new THREE.Color(h)), far = new THREE.Color(ramps.slate[0]);
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const x = -300 + hash2(i, 41) * 700, z = -48 - hash2(i, 43) ** 1.3 * 200;
    const grove = Math.sin(x * 0.06 + 2) + Math.sin(z * 0.09 + x * 0.03) + Math.sin(x * 0.021 - z * 0.05);
    if (grove < 0.4 || cragHeight(x, z) > 0.4 || cityHill(x, z) > 0.6 || !clear(x, z)) continue;
    const nearKeep = x > -14 && x < 130 && z < -78 && z > -132;
    if (nearKeep) continue;
    const s = (1.2 + hash2(i, 47) * 1.1) * (z > -80 && x > -10 && x < 125 ? 0.7 : 1);
    m.compose(new THREE.Vector3(x, g(x, z) + s * 1.3, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 3, s));
    inst.setMatrixAt(k, m);
    inst.setColorAt(k, c.copy(tones[i % 3]).lerp(far, clamp((-z - 60) / 200) * 0.5));
    k++;
  }
  inst.count = k;
  return inst;
}

/** Ground textures stay put on the world as the map's do, and take the same broad dapple of light. */
function skirtMaterial(kind: string) {
  const d = groundArt(kind), t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), GS, GS, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  const mat = new THREE.MeshLambertMaterial({ map: t });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uDapple = styleUniforms.uDapple;
    shader.vertexShader = 'varying vec2 vSkirt;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vSkirt = (modelMatrix * vec4(transformed, 1.0)).xz;');
    shader.fragmentShader = 'uniform float uDapple; varying vec2 vSkirt;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', `
      { vec2 wp = vSkirt; float dap = sin(wp.x * 0.33 + sin(wp.y * 0.21) * 2.2) * sin(wp.y * 0.29 + wp.x * 0.11 + 1.3) + 0.35 * sin(wp.x * 0.9 + wp.y * 0.7);
        outgoingLight *= mix(1.0, 0.72 + 0.42 * smoothstep(-0.2, 0.45, dap), uDapple); }
      #include <opaque_fragment>`);
  };
  return mat;
}
/**
 * A level skirt of ground from x0..x1, z0..z1 (world UVs, two units to a texture repeat) whose outer edge sinks under
 * the country's ground along a ragged line, so the map's edge and the skirt's edge are never straight.
 */
function skirt(mat: THREE.Material, x0: number, z0: number, x1: number, z1: number, out: 'n' | 's' | 'e' | 'w' | null) {
  const w = x1 - x0, d = z1 - z0, geo = out ? new THREE.PlaneGeometry(w, d, Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(d / 2))) : new THREE.PlaneGeometry(w, d);
  geo.rotateX(-Math.PI / 2); geo.translate(x0 + w / 2, -0.01, z0 + d / 2);
  const P = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < P.count; i++) {
    const x = P.getX(i), z = P.getZ(i);
    uv.setXY(i, x / 2, -z / 2);
    if (!out) continue;
    const t = out === 'n' ? (z1 - z) / d : out === 's' ? (z - z0) / d : out === 'e' ? (x - x0) / w : (x1 - x) / w, along = out === 'n' || out === 's' ? x : z;
    const sink = t - 0.55 - 0.25 * (Math.sin(along * 0.21) * 0.5 + Math.sin(along * 0.57 + 1.3) * 0.3 + hash2(Math.round(along), 7) * 0.4);
    if (sink > 0) P.setY(i, -0.01 - sink * 1.6);
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true;
  return m;
}

export class FarLand {
  readonly group = new THREE.Group();
  readonly keepWindow: THREE.Mesh;
  readonly townWindows: THREE.Mesh;
  constructor(map: MapData) {
    const W = map.width, H = map.height;
    const roads = piecesOf('road'), lakes = piecesOf('lake'), rivers = piecesOf('river'), countries = piecesOf('country');
    /** The ground everywhere beyond the map: the highland, the countries round it, pressed flat along rivers, dipped under lakes. */
    const ground: Ground = (x, z) => {
      let h = highland(x, z) + countriesHeight(countries, x, z) * rivers.reduce((v, r) => v * riverValley(r, x, z), 1);
      for (const l of lakes) h += lakeDip(l, x, z);
      return h;
    };
    const onRoad = (x: number, z: number) => roads.some(r => roadHalf(r, z) > 0 && Math.abs(x - roadX(r, z)) < r.clearance);
    const inLake = (x: number, z: number) => lakes.some(l => lakeShore(l, x, z) < 1.04);
    const clear = (x: number, z: number) => cragHeight(x, z) < 0.05 && !onRoad(x, z) && !inLake(x, z);

    // Skirts: level ground round the map that the countries' hills rise out of. North of the river it is meadow, as
    // the map's north bank is; elsewhere it is grass, as the map's other edges are.
    const meadow = skirtMaterial('meadow'), grass = skirtMaterial('grass');
    this.group.add(skirt(meadow, -40, -260, W + 160, -0.5, null));
    this.group.add(skirt(grass, -40, -0.5, -0.5, H - 0.5, 'w'), skirt(grass, W - 0.5, -0.5, W + 40, H - 0.5, 'e'), skirt(grass, -40, H - 0.5, W + 40, H + 40, 's'));
    // The river carries on past both edges, west into the lake and east down its valley.
    const water = new THREE.MeshLambertMaterial({ color: ramps.water[2] });
    for (const r of rivers) for (const [x0, x1] of [[r.x0, -0.5], [W - 0.5, r.x1]]) {
      const geo = new THREE.PlaneGeometry(x1 - x0, r.width, Math.round((x1 - x0) / 2), 1); geo.rotateX(-Math.PI / 2);
      const p = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x0 + x1) / 2; p.setZ(i, p.getZ(i) + riverZ(r, x)); }
      const m = new THREE.Mesh(geo, water); m.position.set((x0 + x1) / 2, -0.005, 0); this.group.add(m);
    }
    for (const l of lakes) this.group.add(lakeMesh(l));
    // Roads out of the map: a dirt track with a ragged edge across the skirt; on the countries it is painted on.
    const dirt = skirtMaterial('dirt');
    for (const r of roads) {
      const len = Math.min(Math.abs(r.z1 - r.z0), 46), dir = Math.sign(r.z1 - r.z0), geo = new THREE.PlaneGeometry(1, len, 3, Math.round(len / 0.5));
      geo.rotateX(-Math.PI / 2);
      const P = geo.attributes.position as THREE.BufferAttribute, uv = geo.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < P.count; i++) {
        const z = r.z0 + dir * (P.getZ(i) * -dir + len / 2), u = -P.getX(i), half = roadHalf(r, z) || r.width / 2;
        const rag = Math.abs(u) > 0.4 ? (hash2(Math.round(z * 2), u > 0 ? 3 : 5) - 0.5) * 0.5 : 0;
        const x = roadX(r, z) + Math.sign(u) * Math.min(1, Math.abs(u) * 3) * (half + rag) * (Math.abs(u) > 0.2 ? 1 : 0.5);
        P.setXYZ(i, x, 0.004, z); uv.setXY(i, x / 2, -z / 2);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, dirt); m.receiveShadow = true; this.group.add(m);
    }

    this.group.add(highlandMesh(ground), highlandPines(ground, clear));
    for (const c of countries) this.group.add(countryMesh(c, ground, roads));
    for (const r of piecesOf('range')) this.group.add(rangeMesh(r));

    const keep = hollowKeep(highland);
    this.group.add(keep.mesh, keep.window);
    this.group.add(keepDragon(highland, pieceOf('dragon')));
    this.keepWindow = keep.window;
    // Buildings, one merged mesh per side of the map so a view that faces away from a side does not draw it.
    const side = (x: number, z: number) => (z < 0 ? 'n' : x < 0 ? 'w' : x > W ? 'e' : z > H ? 's' : 'n');
    const sides = new Map<string, { town: Mason; lit: Mason }>();
    const at = (x: number, z: number) => {
      const k = side(x, z);
      let v = sides.get(k);
      if (!v) { v = { town: new Mason((c, p) => c.multiplyScalar(0.78 + 0.22 * clamp((p.y - ground(p.x, p.z)) / 5))), lit: new Mason() }; sides.set(k, v); }
      return v;
    };
    for (const d of piecesOf('district')) { const { town, lit } = at((d.x0 + d.x1) / 2, (d.z0 + d.z1) / 2); buildDistrict(town, lit, ground, clear, d); }
    for (const r of piecesOf('ruin')) buildRuin(at(r.x, r.z).town, ground, r);
    for (const p of piecesOf('windmill')) { const { town, lit } = at(p.x, p.z); windmill(town, lit, ground, p); }
    for (const p of piecesOf('lighthouse')) { const { town, lit } = at(p.x, p.z); lighthouse(town, lit, p); }
    for (const p of piecesOf('watchtower')) watchtower(at(p.x, p.z).town, ground, p);
    for (const p of piecesOf('cliffs')) cliffs(at(p.x, p.z).town, ground, p, lakes[0]?.level ?? 0);
    const north = at(0, -1);
    this.group.add(cathedralCity(highland, north.lit));
    const windows = new THREE.MeshBasicMaterial({ color: ramps.night[2] });
    this.townWindows = new THREE.Mesh();
    for (const [k, { town, lit }] of sides) {
      const mesh = town.build(masonry()); mesh.name = `districts:${k}`; this.group.add(mesh);
      const lights = lit.build(windows); lights.name = `town-windows:${k}`; this.group.add(lights);
      if (k === 'n') this.townWindows = lights;
    }
    // Groves: round-crowned trees and firs, painted as foliage, one instanced mesh per kind and side. The far
    // countries' trees cast no shadow: the shadow map covers the town, and they would only cost a pass.
    const spots = new Map<string, { broadleaf: TreeSpot[]; fir: TreeSpot[] }>();
    for (const gr of piecesOf('grove')) {
      const k = side((gr.x0 + gr.x1) / 2, (gr.z0 + gr.z1) / 2), s2 = groveSpots(ground, clear, gr);
      const v = spots.get(k) ?? { broadleaf: [], fir: [] }; spots.set(k, v);
      v.broadleaf.push(...s2.broadleaf); v.fir.push(...s2.fir);
    }
    const plant = (geo: THREE.BufferGeometry, list: TreeSpot[], tones: string[], cast: boolean) => {
      const mat = foliage(); mat.vertexColors = true;
      const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); inst.name = `grove:${geo === fir ? 'fir' : 'broadleaf'}:${cast ? 'n' : 'far'}`;
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
      list.forEach((t, i) => { m4.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(up, t.ry), new THREE.Vector3(t.s, t.s, t.s)); inst.setMatrixAt(i, m4); inst.setColorAt(i, c.set(tones[Math.floor(t.tone * tones.length)])); });
      inst.count = list.length; inst.castShadow = cast; inst.computeBoundingSphere(); this.group.add(inst);
    };
    const broadleaf = broadleafGeometry(), farBroadleaf = broadleafGeometry(0), fir = firGeometry();
    for (const [k, v] of spots) {
      plant(k === 'n' ? broadleaf : farBroadleaf, v.broadleaf, [ramps.moss[8], ramps.moss[9], ramps.olive[2], ramps.moss[10]], k === 'n');
      plant(fir, v.fir, [ramps.moss[5], ramps.moss[6], ramps.moss[7]], k === 'n');
    }
    this.group.add(...edgeBand(W, H, onRoad));
  }
  /** The keep's window is lit from blue hour to dawn. */
  update(night: number) {
    (this.keepWindow.material as THREE.MeshBasicMaterial).color.set(night > 0.5 ? ramps.fire[5] : ramps.stone[0]);
    // The far windows kindle from blue hour on: amber against the blue, as in video-1.
    (this.townWindows.material as THREE.MeshBasicMaterial).color.set(night > 0.5 ? ramps.fire[5] : night > 0.2 ? ramps.fire[3] : ramps.night[2]);
  }
}

/**
 * Just past the map's west, east and south edges: the map's own trees, bushes and grass tufts carry on thinning out
 * across the skirt, so the map's edge is not a line where the planting stops.
 */
function edgeBand(W: number, H: number, onRoad: (x: number, z: number) => boolean) {
  const trees: { x: number; y: number; kind: 'tree' | 'pine' | 'bush' }[] = [], tufts: Record<TuftKind, { x: number; z: number }[]> = { tall: [], short: [], daisy: [], bloom: [], reed: [] };
  for (let z = -1; z < H + 26; z++) for (let x = -26; x < W + 26; x++) {
    const out = Math.max(-x, x - (W - 1), z - (H - 1));
    if (out < 1) continue;
    if (x > -1 && x < W && z < H) continue;
    if (onRoad(x, z) || Math.abs(z - 5) < 5 && (x < 0 || x >= W)) continue;
    const r = hash2(x * 3.3 + 11, z * 1.7 - 5), r2 = hash2(x * 1.3 - 3, z * 4.1 + 2), thin = 1 - out / 26;
    if (r < 0.05 * thin + 0.015) trees.push({ x: x + (r2 - 0.5) * 0.6, y: z + (r - 0.5) * 0.6, kind: r2 < 0.35 ? 'tree' : r2 < 0.75 ? 'pine' : 'bush' });
    else if (r2 < 0.45 * thin) tufts[r < 0.6 ? 'tall' : r < 0.85 ? 'short' : r < 0.93 ? 'daisy' : 'bloom'].push({ x: x + (r - 0.5) * 0.8, z: z + (r2 - 0.5) * 0.8 });
  }
  const still = { value: 0 };
  const band = buildTrees(trees); band.name = 'edge-band';
  return [band, ...(Object.keys(tufts) as TuftKind[]).filter(k => tufts[k].length).map(k => tuftMesh(k, tufts[k], still))];
}
