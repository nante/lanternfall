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
import { buildDistrict, buildRuin, groveSpots, broadleafGeometry, firGeometry, type TreeSpot } from './architecture/pieces.ts';
import { foliage } from './trees.ts';

/**
 * The world beyond the town, seen from the Scenery stop. The camera never turns, so the far land is authored to the
 * north, with skirts east and west so a widening view never finds the edge of the map. Not walkable: scenery only.
 * Layers, near to far: meadow skirts and the river running on, a forest band, the highland (rolling hills, pine
 * groves, Hollow Keep on its crag, the cathedral city of Saint-Vigil on its hill to the west), a slate ridge and a
 * snow range low enough that the keep and the spires break the skyline. Haze (scene fog) separates the layers.
 */
const lambert = (color: string, extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function meadowTexture() {
  const d = groundArt('meadow');
  const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), GS, GS, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestMipmapNearestFilter;
  t.generateMipmaps = true; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

/** Height of a ridge (see `ridge`) at world x, z: layered sines along x, rising from its front edge to its back. */
function ridgeHeight(x: number, zz: number, z: number, depth: number, height: number, seed: number) {
  const back = (z + depth / 2 - zz) / depth;
  // Broad swells, then sharper teeth so the far ranges break into peaks instead of smooth triangles.
  const teeth = Math.abs(Math.sin(x * 0.53 + seed * 3.1)) * 0.12 + Math.abs(Math.sin(x * 1.37 + seed * 1.7)) * 0.06;
  const crest = Math.sin(x * 0.045 + seed) * 0.45 + Math.sin(x * 0.11 + seed * 2.3) * 0.3 + Math.sin(x * 0.27 + seed * 0.7) * 0.15 + 0.55 + teeth * (height > 30 ? 1 : 0.3);
  return Math.max(0, crest) * height * Math.sin(Math.min(1, Math.max(0, back)) * Math.PI * 0.5) - 0.5;
}
/** A ridge: a strip of ground whose height follows layered sines, faceted by flat shading. */
function ridge(x0: number, x1: number, z: number, depth: number, height: number, seed: number, color: string, segs = 48) {
  const g = new THREE.PlaneGeometry(x1 - x0, depth, segs, 4);
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, z);
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    p.setY(i, ridgeHeight(p.getX(i), p.getZ(i), z, depth, height, seed));
  }
  g.computeVertexNormals();
  // A value ramp up each slope: dark valleys, lighter crests, so the ridgelines read against the sky.
  const p2 = g.attributes.position as THREE.BufferAttribute, cols = new Float32Array(p2.count * 3), base = new THREE.Color(color);
  for (let i = 0; i < p2.count; i++) {
    const t = Math.max(0, Math.min(1, (p2.getY(i) + 0.5) / Math.max(1, height)));
    const c = base.clone().multiplyScalar(0.62 + 0.62 * t * t);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return new THREE.Mesh(g, lambert('#ffffff', { vertexColors: true }));
}

const clamp = (t: number) => Math.max(0, Math.min(1, t));
/** The highland behind the forest band: rolling ground rising north, plus the castle's crag and the city's hill. */
export function highland(x: number, z: number) {
  const t = clamp((-z - 44) / 28), front = t * t * (3 - 2 * t);
  const rolling = 2.4 + Math.sin(x * 0.047 + 1.3) * 1.6 + Math.sin(x * 0.13 + z * 0.07) * 0.9 + Math.sin(z * 0.11 + x * 0.021) * 1.1;
  const rise = clamp((-z - 150) / 110) * 6;
  return front * (rolling + rise) + cragHeight(x, z) + cityHill(x, z) - 0.3;
}
function highlandMesh() {
  const x0 = -330, x1 = 430, z0 = -44, z1 = -310, step = 3.5;
  const g = new THREE.PlaneGeometry(x1 - x0, z0 - z1, Math.round((x1 - x0) / step), Math.round((z0 - z1) / step));
  g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position as THREE.BufferAttribute, cols = new Float32Array(p.count * 3);
  const grass = new THREE.Color(ramps.moss[6]), crest = new THREE.Color(ramps.olive[2]), rock = new THREE.Color(ramps.stone[2]).lerp(new THREE.Color(ramps.slate[1]), 0.4);
  const city = new THREE.Color(ramps.olive[1]), far = new THREE.Color(ramps.slate[0]), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = highland(x, z), crag = cragHeight(x, z);
    p.setY(i, h);
    c.copy(grass).lerp(crest, clamp((h - 3) / 8) * 0.6 * (0.6 + hash2(i, 3) * 0.4));
    c.lerp(city, clamp(cityHill(x, z) / 4) * 0.5);
    c.lerp(rock, clamp(Math.abs(crag) / 2.5) * (0.75 + hash2(i, 5) * 0.25));
    c.multiplyScalar(0.72 + 0.4 * clamp(h / 16));
    c.lerp(far, clamp((-z - 140) / 180) * 0.45);
    cols.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.deleteAttribute('uv'); g.computeVertexNormals();
  return new THREE.Mesh(g, lambert('#ffffff', { vertexColors: true }));
}
/** Pine groves on the highland, kept off the crag, the city and the castle's foreground. */
function highlandPines() {
  const pine = new THREE.ConeGeometry(1, 1, 6), n = 900;
  const inst = new THREE.InstancedMesh(pine, lambert('#ffffff'), n), m = new THREE.Matrix4(), c = new THREE.Color();
  const tones = [ramps.moss[3], ramps.moss[4], ramps.moss[5]].map(h => new THREE.Color(h)), far = new THREE.Color(ramps.slate[0]);
  let k = 0;
  for (let i = 0; i < n * 3 && k < n; i++) {
    const x = -300 + hash2(i, 41) * 700, z = -48 - hash2(i, 43) ** 1.3 * 200;
    const grove = Math.sin(x * 0.06 + 2) + Math.sin(z * 0.09 + x * 0.03) + Math.sin(x * 0.021 - z * 0.05);
    if (grove < 0.4 || cragHeight(x, z) > 0.4 || cityHill(x, z) > 0.6) continue;
    const nearKeep = x > -14 && x < 130 && z < -78 && z > -132;
    if (nearKeep) continue;
    const s = (1.2 + hash2(i, 47) * 1.1) * (z > -80 && x > -10 && x < 125 ? 0.7 : 1);
    m.compose(new THREE.Vector3(x, highland(x, z) + s * 1.3, z), new THREE.Quaternion(), new THREE.Vector3(s, s * 3, s));
    inst.setMatrixAt(k, m);
    inst.setColorAt(k, c.copy(tones[i % 3]).lerp(far, clamp((-z - 60) / 200) * 0.5));
    k++;
  }
  inst.count = k;
  return inst;
}

export class FarLand {
  readonly group = new THREE.Group();
  readonly keepWindow: THREE.Mesh;
  readonly townWindows: THREE.Mesh;
  constructor(map: MapData) {
    const W = map.width, H = map.height, tex = meadowTexture();
    // Skirts: north beyond the river, east and west of the map, and south past the meadow.
    const skirt = (x0: number, z0: number, x1: number, z1: number) => {
      const w = x1 - x0, d = z1 - z0, t = tex.clone(); t.repeat.set(w / 2, d / 2); t.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshLambertMaterial({ map: t }));
      m.rotation.x = -Math.PI / 2; m.position.set(x0 + w / 2, -0.01, z0 + d / 2); m.receiveShadow = true;
      this.group.add(m);
    };
    skirt(-160, -260, W + 160, -0.5);
    skirt(-160, -0.5, -0.5, H + 60);
    skirt(W - 0.5, -0.5, W + 160, H + 60);
    skirt(-0.5, H - 0.5, W - 0.5, H + 60);
    // The river carries on past both edges, gently bending.
    const water = new THREE.MeshLambertMaterial({ color: ramps.water[2] });
    for (const [x0, x1] of [[-160, -0.5], [W - 0.5, W + 160]]) {
      const g = new THREE.PlaneGeometry(x1 - x0, 5, 64, 1); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x0 + x1) / 2; p.setZ(i, p.getZ(i) + 5 + Math.sin(x / 9) * 1.6 + Math.sin(x / 23) * 3); }
      const m = new THREE.Mesh(g, water); m.position.set((x0 + x1) / 2, -0.02, 0); this.group.add(m);
    }
    // Everything placed: the road, districts, ruins, groves, the keep, its dragon and the cathedral city (`scene.ts`).
    const road = pieceOf('road');
    const clear = (x: number, z: number) => cragHeight(x, z) < 0.05 && !(Math.abs(x - road.x) < road.width / 2 + 1.2 && z < road.z0 && z > road.z1);
    {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(road.width, road.z0 - road.z1), new THREE.MeshLambertMaterial({ color: ramps.soil[3] }));
      strip.rotation.x = -Math.PI / 2; strip.position.set(road.x, 0.005, (road.z0 + road.z1) / 2); strip.receiveShadow = true;
      this.group.add(strip);
    }
    this.group.add(highlandMesh(), highlandPines());
    const keep = hollowKeep(highland);
    this.group.add(keep.mesh, keep.window);
    this.group.add(keepDragon(highland, pieceOf('dragon')));
    this.keepWindow = keep.window;
    const town = new Mason((c, p) => c.multiplyScalar(0.78 + 0.22 * clamp((p.y - highland(p.x, p.z)) / 5))), lit = new Mason();
    for (const d of piecesOf('district')) buildDistrict(town, lit, highland, clear, d);
    for (const r of piecesOf('ruin')) buildRuin(town, highland, r);
    const townMesh = town.build(masonry()); townMesh.name = 'districts';
    this.group.add(cathedralCity(highland, lit), townMesh);
    this.townWindows = lit.build(new THREE.MeshBasicMaterial({ color: ramps.night[2] })); this.townWindows.name = 'town-windows';
    this.group.add(this.townWindows);
    // Groves: round-crowned trees and firs, one instanced mesh each, painted as foliage.
    const spots = { broadleaf: [] as TreeSpot[], fir: [] as TreeSpot[] };
    for (const gr of piecesOf('grove')) { const s2 = groveSpots(highland, clear, gr); spots.broadleaf.push(...s2.broadleaf); spots.fir.push(...s2.fir); }
    const plant = (geo: THREE.BufferGeometry, list: TreeSpot[], tones: string[]) => {
      const mat = foliage(); mat.vertexColors = true;
      const inst = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
      list.forEach((t, i) => { m4.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromAxisAngle(up, t.ry), new THREE.Vector3(t.s, t.s, t.s)); inst.setMatrixAt(i, m4); inst.setColorAt(i, c.set(tones[Math.floor(t.tone * tones.length)])); });
      inst.count = list.length; inst.castShadow = true; this.group.add(inst);
    };
    plant(broadleafGeometry(), spots.broadleaf, [ramps.moss[8], ramps.moss[9], ramps.olive[2], ramps.moss[10]]);
    plant(firGeometry(), spots.fir, [ramps.moss[5], ramps.moss[6], ramps.moss[7]]);
    this.group.add(ridge(-300, W + 360, -335, 60, 30, 2.2, ramps.slate[1], 160));
    const snow = ridge(-420, W + 480, -440, 100, 78, 7.7, ramps.slate[2], 200);
    // Snow on the peaks: lighten vertices above a height.
    const sp = snow.geometry.attributes.position as THREE.BufferAttribute, cols = new Float32Array(sp.count * 3), white = new THREE.Color(ramps.bone[2]), rock = new THREE.Color(ramps.slate[2]);
    for (let i = 0; i < sp.count; i++) { const h = sp.getY(i), c = h > 50 + hash2(i, 9) * 10 ? white : rock.clone().multiplyScalar(0.6 + 0.6 * Math.min(1, h / 60)); cols.set([c.r, c.g, c.b], i * 3); }
    snow.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    (snow.material as THREE.MeshLambertMaterial).color.set('#ffffff'); (snow.material as THREE.MeshLambertMaterial).vertexColors = true;
    this.group.add(snow);
  }
  /** The keep's window is lit from blue hour to dawn. */
  update(night: number) {
    (this.keepWindow.material as THREE.MeshBasicMaterial).color.set(night > 0.5 ? ramps.fire[5] : ramps.stone[0]);
    // The lower town's windows kindle from blue hour on: amber against the blue, as in video-1.
    (this.townWindows.material as THREE.MeshBasicMaterial).color.set(night > 0.5 ? ramps.fire[5] : night > 0.2 ? ramps.fire[3] : ramps.night[2]);
  }
}
