import * as THREE from 'three';
import moodsJson from '../../../../content/moods.json' with { type: 'json' };
import { RegionMoods, MAX_MOODS, type RegionMood } from '../../../../packages/game/src/content-schema.ts';
import { G, type MapData } from '../../../../packages/game/src/model.ts';
import { placeAt } from '../../../../packages/game/src/town.ts';
import { moonAt, MOON_DIR } from './clock-style.ts';
import { canopyAt, fieldUniforms } from './lightfield.ts';
import type { WorldView } from './view.ts';

/**
 * Region moods: the same hour feels different in the meadow, under the wood, by the river or underground. Each tile
 * belongs to one mood (content/moods.json, by map place, water and canopy); the per-tile weights are blurred over a
 * few tiles and drawn as two textures, so the post pass blends moods per pixel from the world position under it and a
 * view that straddles two regions shows both. What cannot vary per pixel (vignette, motes, shafts, fog) follows the
 * blend at the hero, which moves smoothly as they walk.
 */
const parsed = RegionMoods.safeParse(moodsJson);
if (!parsed.success) console.error('content/moods.json is invalid; every region follows the clock alone.', parsed.error);
const neutral: RegionMood = { label: 'Neutral', places: [], ambient: 1, shadowTint: '#cccccc', lightTint: '#cccccc', saturation: 1, haze: '#cccccc', hazeDensity: 0, vignette: 1, particles: 1, shafts: 0 };
const table: RegionMoods = parsed.success ? parsed.data : { fallback: 'neutral', underground: 'neutral', moods: { neutral } };
const ids = Object.keys(table.moods);
const rows = ids.map(id => table.moods[id]);
const slot = (id: string | undefined) => (id === undefined ? -1 : ids.indexOf(id));

export const moodUniforms = {
  uMoodA: { value: null as THREE.DataTexture | null }, uMoodB: { value: null as THREE.DataTexture | null },
  uMoodSize: { value: new THREE.Vector2(1, 1) }, uInvVP: { value: new THREE.Matrix4() },
  uHeroW: { value: [new THREE.Vector4(), new THREE.Vector4()] }, uHeroXZ: { value: new THREE.Vector2() },
  /** Per mood: ambient, saturation, mist density, unused. */
  uMoodGrade: { value: Array.from({ length: MAX_MOODS }, () => new THREE.Vector4(1, 1, 0, 0)) },
  uMoodShadow: { value: Array.from({ length: MAX_MOODS }, () => new THREE.Color(1, 1, 1)) },
  uMoodLight: { value: Array.from({ length: MAX_MOODS }, () => new THREE.Color(1, 1, 1)) },
  uMoodHaze: { value: Array.from({ length: MAX_MOODS }, () => new THREE.Color()) },
};

/** Blurred per-tile mood weights for one floor, packed four moods to a texture. */
class Regions {
  readonly w: Float32Array;
  readonly tex: THREE.DataTexture[];
  constructor(readonly map: MapData, z: number) {
    const { width: W, height: H } = map, K = MAX_MOODS;
    let w = new Float32Array(W * H * K);
    const canopy = z === 0 ? canopyAt(map, z) : undefined, under = slot(table.underground), fall = Math.max(0, slot(table.fallback));
    const water = slot(table.water), wood = slot(table.canopy), floor = map.floors[z];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * K;
      let m = z === 1 ? under : slot(ids.find(id => table.moods[id].places.includes(placeAt(map, { x, y, z }))));
      if (m < 0) m = fall;
      if (z === 0 && water >= 0 && floor.ground[i] === G.water) m = water;
      const c = canopy && wood >= 0 && m !== wood ? canopy[i] * 0.8 : 0;
      w[o + m] += 1 - c;
      if (c > 0) w[o + wood] += c;
    }
    // Two box passes of radius three: a border blends over about six tiles, so walking across it never pops.
    for (let pass = 0; pass < 4; pass++) {
      const out = new Float32Array(w.length), horizontal = pass % 2 === 0, R = 3;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) for (let k = 0; k < K; k++) {
        let s = 0;
        for (let d = -R; d <= R; d++) {
          const tx = horizontal ? Math.min(W - 1, Math.max(0, x + d)) : x, ty = horizontal ? y : Math.min(H - 1, Math.max(0, y + d));
          s += w[(ty * W + tx) * K + k];
        }
        out[(y * W + x) * K + k] = s / (2 * R + 1);
      }
      w = out;
    }
    this.w = w;
    this.tex = [0, 1].map(half => {
      const data = new Uint8Array(W * H * 4);
      for (let i = 0; i < W * H; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(w[i * K + half * 4 + c] * 255);
      const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
      t.magFilter = t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
      return t;
    });
  }
  /** Bilinear weights at a world point, the same as the texture lookup. */
  at(x: number, z: number, out: Float32Array) {
    const { width: W, height: H } = this.map, K = MAX_MOODS;
    const fx = Math.min(W - 1, Math.max(0, x)), fz = Math.min(H - 1, Math.max(0, z));
    const x0 = Math.floor(fx), z0 = Math.floor(fz), x1 = Math.min(W - 1, x0 + 1), z1 = Math.min(H - 1, z0 + 1), tx = fx - x0, tz = fz - z0;
    for (let k = 0; k < K; k++) {
      const a = this.w[(z0 * W + x0) * K + k], b = this.w[(z0 * W + x1) * K + k], c = this.w[(z1 * W + x0) * K + k], d = this.w[(z1 * W + x1) * K + k];
      out[k] = (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
    }
    return out;
  }
}

type Look = { ambient: number; saturation: number; hazeDensity: number; vignette: number; particles: number; shafts: number; shadowTint: THREE.Color; lightTint: THREE.Color; haze: THREE.Color };
const newLook = (): Look => ({ ambient: 1, saturation: 1, hazeDensity: 0, vignette: 1, particles: 1, shafts: 0, shadowTint: new THREE.Color(), lightTint: new THREE.Color(), haze: new THREE.Color() });
const nums = ['ambient', 'saturation', 'hazeDensity', 'vignette', 'particles', 'shafts'] as const;
const tints = ['shadowTint', 'lightTint', 'haze'] as const;
const scratch = new THREE.Color();
/** A row at this hour: its own values, then its twilight and night values blended over them. */
function evaluate(row: RegionMood, twilight: number, night: number, out: Look) {
  for (const k of nums) out[k] = row[k];
  for (const k of tints) out[k].set(row[k]);
  for (const [part, t] of [[row.twilight, twilight], [row.night, night]] as const) {
    if (!part || t <= 0) continue;
    for (const k of nums) { const v = part[k]; if (v !== undefined) out[k] += (v - out[k]) * t; }
    for (const k of tints) { const v = part[k]; if (v !== undefined) out[k].lerp(scratch.set(v), t); }
  }
  return out;
}

export class Mood {
  private readonly regions: (Regions | undefined)[] = [];
  private readonly looks = rows.map(newLook);
  private readonly heroW = new Float32Array(MAX_MOODS);
  /** The blended mood where the hero stands. */
  readonly here = newLook();
  private readonly fogTint = new THREE.Color();

  /** Once per frame, after the cameras and fog are placed and before the scene renders. */
  frame(v: WorldView, camera: THREE.Camera) {
    const k = v.key, cave = v.floor === 1, u = moodUniforms;
    const r = (this.regions[v.floor] ??= new Regions(v.map, v.floor));
    u.uMoodA.value = r.tex[0]; u.uMoodB.value = r.tex[1]; u.uMoodSize.value.set(v.map.width, v.map.height);
    u.uInvVP.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    u.uHeroXZ.value.set(v.center.x, v.center.z);
    const hw = r.at(v.center.x, v.center.z, this.heroW);
    u.uHeroW.value[0].set(hw[0], hw[1], hw[2], hw[3]); u.uHeroW.value[1].set(hw[4], hw[5], hw[6], hw[7]);

    const m = ((v.minute % 40) + 40) % 40;
    const twilight = Math.max(0, 1 - Math.abs(m - 1.4) / 1.8, 1 - Math.abs(m - 25.6) / 1.8);
    const night = Math.min(1, k.moon);
    let sum = 0;
    const here = this.here;
    for (const key of nums) here[key] = 0;
    for (const key of tints) here[key].setRGB(0, 0, 0);
    rows.forEach((row, i) => {
      const l = evaluate(row, twilight, night, this.looks[i]);
      u.uMoodGrade.value[i].set(l.ambient, l.saturation, l.hazeDensity, 0);
      u.uMoodShadow.value[i].copy(l.shadowTint).multiplyScalar(1 / 0.6038); // #cccccc is 0.6038 linear: a tint of 1
      u.uMoodLight.value[i].copy(l.lightTint).multiplyScalar(1 / 0.6038);
      u.uMoodHaze.value[i].set(k.haze).multiply(l.haze).multiplyScalar(1 / 0.6038);
      const wt = hw[i]; sum += wt;
      for (const key of nums) here[key] += l[key] * wt;
      for (const key of tints) { here[key].r += l[key].r * wt; here[key].g += l[key].g * wt; here[key].b += l[key].b * wt; }
    });
    if (sum > 0) { for (const key of nums) here[key] /= sum; for (const key of tints) here[key].multiplyScalar(1 / sum); }

    // The moon disc's path, and the light it lends a Scenery vista (Play is already moonlit by the keyframe).
    moonAt(v.minute, MOON_DIR);
    const vista = cave ? 0 : k.moon * v.scenery;
    if (!cave) {
      v.sun.intensity = k.sunI + 0.9 * vista;
      v.sky.intensity = k.ambI * (1 + 1.2 * vista);
    }
    v.sun.shadow.intensity = k.shadowI;
    v.post.uniforms.uVignette.value = k.vignette * here.vignette * (1 - 0.5 * vista);
    const dm = v.dust.material as THREE.PointsMaterial;
    dm.opacity = Math.min(0.6, 0.35 * k.dust * here.particles);
    v.dust.visible = dm.opacity > 0.01;
    // Shafts by day where the mood has them (the wood's sun through leaves), and golden hour's everywhere.
    const daylight = cave ? 0 : THREE.MathUtils.smoothstep(k.sunI, 1.5, 4) * THREE.MathUtils.smoothstep(k.sunElev, 4, 14);
    const shafts = cave ? 0 : Math.max(k.shafts, here.shafts * daylight);
    // Cloud shadows and sun flecks under the canopy belong to the sun: under the moon the flecks read as stray marks.
    fieldUniforms.uFCloud.value = cave ? 0 : k.clouds * 0.42 * daylight;
    const rayMat = (v.rays.children[0] as THREE.Mesh | undefined)?.material as THREE.ShaderMaterial | undefined;
    if (rayMat) rayMat.uniforms.uStrength.value = shafts;
    v.rays.visible = shafts > 0.01;
    // Scenery fog leans towards the mood's mist where the hero stands.
    const fog = v.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.color.lerp(this.fogTint.set(k.haze).multiply(here.haze).multiplyScalar(1 / 0.6038), Math.min(0.6, here.hazeDensity * 2));
      fog.far *= 1 - 0.6 * here.hazeDensity;
    }
  }
}
