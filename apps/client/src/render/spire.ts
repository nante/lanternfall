import * as THREE from 'three';
import type { MapData } from '../../../../packages/game/src/model.ts';
import { ramps } from './palette.ts';
import { Mason, prim, masonry, mix } from './architecture/kit.ts';

/**
 * The Lantern Spire: the town's landmark, a gothic tower rising out of the shrine and far taller than the screen at
 * the Play stop. Octagonal stages step in over stepped buttresses, each crowned with a pinnacle; lancets pierce the
 * stages; the open lantern chamber holds the teal core (the source `light.ts` places at the shrine); a slate spire
 * with lucarnes and crockets ends in a gilt finial. When the hero stands behind it, a dithered window opens in the
 * stone around them so they are never lost.
 */
export const cutUniforms = { uCutCenter: { value: new THREE.Vector2(-999, -999) }, uCutR: { value: 0 } };
function withCut(mat: THREE.Material) {
  const prior = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey();
  mat.customProgramCacheKey = () => key + '|cut';
  mat.onBeforeCompile = (shader, r) => {
    prior(shader, r);
    Object.assign(shader.uniforms, cutUniforms);
    shader.fragmentShader = 'uniform vec2 uCutCenter; uniform float uCutR;\n' + shader.fragmentShader.replace('void main() {', `void main() {
      { float cd = length(gl_FragCoord.xy - uCutCenter);
        int bx = int(mod(gl_FragCoord.x, 4.0)), by = int(mod(gl_FragCoord.y, 4.0));
        float b4[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
        if (cd < uCutR && b4[bx + by * 4] / 16.0 < smoothstep(uCutR, uCutR * 0.55, cd)) discard; }`);
  };
  return mat;
}

const C = {
  stone: ramps.stone[3], light: ramps.stone[4], dark: ramps.stone[2], deep: ramps.stone[1],
  slate: ramps.slate[1], slateLt: ramps.slate[2], void: ramps.night[2], gold: ramps.fire[5],
};
/** Octagons are turned so a flat face looks south (towards the Play camera). */
const OCT = Math.PI / 8;

export class Spire {
  readonly group = new THREE.Group();
  readonly lantern: THREE.Vector3;
  private readonly core: THREE.Mesh;
  private readonly glow: THREE.Mesh;
  readonly base: THREE.Vector3;
  constructor(map: MapData) {
    const shrine = map.buildings.find(b => b.name.startsWith('Shrine'))!;
    const cx = (shrine.x0 + shrine.x1) / 2, cz = (shrine.y0 + shrine.y1) / 2 - 1.5;
    this.base = new THREE.Vector3(cx, 0, cz);
    const m = new Mason(), glow = new Mason();
    const oct = (color: string, r: number, y0: number, y1: number) => m.put(prim.cyl(8), color, 0, (y0 + y1) / 2, 0, { sx: r, sy: y1 - y0, sz: r, ry: OCT });
    /** A coursed octagonal stage: courses of dressed stone in three tones, a hair apart so dark mortar lines show between them. */
    const coursed = (r: number, y0: number, y1: number, tone: string = C.stone) => {
      const tones = [tone, mix(tone, C.light, 0.35), mix(tone, C.dark, 0.3)], n = Math.max(1, Math.round((y1 - y0) / 0.4)), hh = (y1 - y0) / n;
      oct(C.deep, r - 0.03, y0, y1);
      for (let i = 0; i < n; i++) m.put(prim.cyl(8), tones[(i * 2 + (i >> 1)) % 3], 0, y0 + (i + 0.5) * hh, 0, { sx: r - (i % 2) * 0.012, sy: hh - 0.035, sz: r - (i % 2) * 0.012, ry: OCT });
    };
    /** A gablet over a lancet: a steep stone gable facing out, with crockets on its rakes and a finial. */
    const gablet = (a: number, r: number, y: number, w: number, h: number) => {
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      m.put(prim.gable(), C.light, x, y, z, { ry: a + Math.PI / 2, sx: 0.14, sy: h, sz: w });
      for (const f of [-1, 1]) m.put(prim.box(), C.light, x + Math.cos(a) * f * w * 0.25, y + h * 0.5, z - Math.sin(a) * f * w * 0.25, { ry: a, sx: 0.09, sy: 0.09, sz: 0.2 });
      m.put(prim.cone(4), C.slateLt, x, y + h + 0.18, z, { sx: 0.07, sy: 0.36, sz: 0.07, ry: Math.PI / 4 });
    };
    /** Pieces around the octagon: `fn(angle)` for each of `n` directions starting at `from` (0 = south). */
    const around = (n: number, from: number, fn: (a: number, sx: number, sz: number) => void) => { for (let i = 0; i < n; i++) { const a = from + (i / n) * Math.PI * 2; fn(a, Math.sin(a), Math.cos(a)); } };
    const pinnacle = (x: number, y: number, z: number, s: number) => {
      m.put(prim.box(), C.light, x, y + s * 0.9, z, { sx: s * 1.2, sy: s * 1.8, sz: s * 1.2 });
      m.put(prim.cone(4), C.slateLt, x, y + s * 1.8 + s * 1.6, z, { sx: s * 0.95, sy: s * 3.2, sz: s * 0.95, ry: Math.PI / 4 });
    };
    const lancet = (a: number, r: number, y: number, w: number, h: number) => m.put(prim.lancet(), C.void, Math.sin(a) * r, y, Math.cos(a) * r, { ry: a, sx: w, sy: h / 3, sz: 0.24 });

    // Plinth rising through the shrine roof from where its lowest slope meets it, so it hangs as little as it can
    // below the hall's ceiling.
    coursed(2.25, 2.55, 4.7, C.dark);
    oct(C.light, 2.38, 4.7, 5.05);
    coursed(1.85, 5.05, 8.7);
    around(4, 0, a => { lancet(a, 1.72, 5.7, 0.5, 2.0); gablet(a, 1.9, 7.55, 0.86, 0.75); });
    // Four stepped buttresses on the diagonals, each crowned with a pinnacle.
    around(4, Math.PI / 4, (a, sx, sz) => {
      m.put(prim.box(), C.stone, sx * 2.05, 4.4, sz * 2.05, { ry: a, sx: 0.62, sy: 5.2, sz: 1.3 });
      m.put(prim.box(), C.light, sx * 2.25, 7.05, sz * 2.25, { ry: a, sx: 0.66, sy: 0.3, sz: 0.95, rx: 0.5 });
      m.put(prim.box(), C.stone, sx * 1.92, 8.25, sz * 1.92, { ry: a, sx: 0.5, sy: 2.4, sz: 0.75 });
      pinnacle(sx * 1.98, 9.45, sz * 1.98, 0.32);
    });
    // Second stage: narrower, lancets on every face.
    oct(C.light, 1.98, 8.7, 9.0);
    coursed(1.5, 9.0, 10.65);
    around(8, 0, a => lancet(a, 1.42, 9.25, 0.36, 1.15));
    // Gallery and a low parapet, then the open lantern chamber: eight colonnettes round the teal core.
    oct(C.light, 1.72, 10.65, 10.9);
    around(16, 0, (a, sx, sz) => m.put(prim.box(), C.deep, sx * 1.6, 10.55, sz * 1.6, { ry: a, sx: 0.14, sy: 0.2, sz: 0.2 }));
    // Gargoyles at the gallery's corners, leaning out over the town.
    around(4, Math.PI / 4, (a, sx, sz) => {
      m.put(prim.box(), C.dark, sx * 1.95, 10.62, sz * 1.95, { ry: a, sx: 0.18, sy: 0.16, sz: 0.6, rx: -0.25 });
      m.put(prim.box(), C.dark, sx * 2.25, 10.72, sz * 2.25, { ry: a, sx: 0.22, sy: 0.2, sz: 0.22 });
    });
    around(8, OCT, (a, sx, sz) => m.put(prim.box(), C.stone, sx * 1.6, 11.05, sz * 1.6, { ry: a, sx: 0.36, sy: 0.3, sz: 0.24 }));
    // Tall enough that the Play camera's 48.6° sightline reaches the core's centre under the ring above.
    const roofY = 13.7;
    around(8, OCT, (a, sx, sz) => m.put(prim.box(), C.deep, sx * 1.2, (10.9 + roofY) / 2, sz * 1.2, { ry: a, sx: 0.2, sy: roofY - 10.9, sz: 0.2 }));
    // Each opening of the chamber is divided by a mullion and a transom under a pointed head of tracery, so the core
    // reads as a light behind a window, not a lamp in a cage.
    around(8, 0, (a, sx, sz) => {
      const rr = 1.12, y0 = 10.9, y1 = roofY, cA = a - Math.PI / 8, cB = a + Math.PI / 8, ro = 1.2;
      m.put(prim.box(), C.light, sx * rr, (y0 + y1) / 2 - 0.3, sz * rr, { ry: a, sx: 0.06, sy: y1 - y0 - 0.6, sz: 0.06 });
      m.put(prim.box(), C.light, sx * rr, 12.0, sz * rr, { ry: a, sx: 0.85, sy: 0.05, sz: 0.05 });
      const head = new THREE.Vector3(sx * rr, y1 - 0.12, sz * rr);
      m.beam(C.light, new THREE.Vector3(Math.sin(cA) * ro, y1 - 0.7, Math.cos(cA) * ro), head, 0.07);
      m.beam(C.light, new THREE.Vector3(Math.sin(cB) * ro, y1 - 0.7, Math.cos(cB) * ro), head, 0.07);
    });
    glow.put(prim.cyl(8), ramps.lantern[1], 0, 10.93, 0, { sx: 1.15, sy: 0.06, sz: 1.15, ry: OCT });
    glow.put(prim.cyl(8), ramps.lantern[1], 0, roofY - 0.04, 0, { sx: 1.15, sy: 0.06, sz: 1.15, ry: OCT });
    oct(C.light, 1.55, roofY, roofY + 0.36);
    around(8, OCT, (_a, sx, sz) => pinnacle(sx * 1.45, roofY + 0.36, sz * 1.45, 0.17));
    // The spire: eight slate faces, lucarnes at its foot, crockets climbing the arrises, a gilt finial.
    const capY = roofY + 0.36, capH = 7.4, capR = 1.32;
    m.put(prim.cone(8), C.slate, 0, capY + capH / 2, 0, { sx: capR, sy: capH, sz: capR, ry: OCT });
    around(4, 0, (a, sx, sz) => {
      m.put(prim.box(), C.light, sx * 1.02, capY + 0.45, sz * 1.02, { ry: a, sx: 0.5, sy: 0.9, sz: 0.5 });
      m.put(prim.gable(), C.slateLt, sx * 1.02, capY + 0.9, sz * 1.02, { ry: a + Math.PI / 2, sx: 0.6, sy: 0.45, sz: 0.62 });
      m.put(prim.lancet(), C.void, sx * 1.27, capY + 0.12, sz * 1.27, { ry: a, sx: 0.24, sy: 0.2, sz: 0.06 });
    });
    // Ribs up the eight arrises, and a band two thirds up.
    around(8, OCT, (_a, sx, sz) => {
      m.beam(C.slateLt, new THREE.Vector3(sx * capR, capY, sz * capR), new THREE.Vector3(0, capY + capH, 0), 0.13);
      // Crockets climbing each arris.
      for (const t of [0.22, 0.4, 0.58, 0.76]) m.put(prim.cone(4), C.light, sx * capR * (1 - t) * 1.08, capY + capH * t, sz * capR * (1 - t) * 1.08, { sx: 0.08, sy: 0.22, sz: 0.08, rz: -sx * 0.5, rx: sz * 0.5 });
    });
    const bandT = 0.58;
    m.put(prim.cyl(8), C.light, 0, capY + capH * bandT, 0, { sx: capR * (1 - bandT) + 0.08, sy: 0.22, sz: capR * (1 - bandT) + 0.08, ry: OCT });
    const tip = capY + capH;
    m.put(prim.box(), C.gold, 0, tip + 0.45, 0, { sx: 0.13, sy: 1.1, sz: 0.13 });
    m.put(prim.box(), C.gold, 0, tip + 0.55, 0, { sx: 0.5, sy: 0.1, sz: 0.1 });
    m.put(new THREE.OctahedronGeometry(1, 0), C.gold, 0, tip + 1.2, 0, { sx: 0.22, sy: 0.3, sz: 0.22 });

    const stone = m.build(withCut(masonry()));
    stone.position.set(cx, 0, cz); stone.castShadow = true; stone.receiveShadow = true; stone.name = 'lantern-spire';
    this.glow = glow.build(new THREE.MeshBasicMaterial({ color: ramps.lantern[1], fog: false }));
    this.glow.position.set(cx, 0, cz);
    this.core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 1), new THREE.MeshBasicMaterial({ color: ramps.lantern[3], fog: false }));
    this.core.position.set(cx, 11.65, cz);
    this.group.add(stone, this.glow, this.core);
    this.lantern = new THREE.Vector3(cx, 11.65, cz);
  }
  /** Breathe on a 6 s cycle in two palette steps; brighter at night. */
  update(t: number, night: number) {
    const hi = Math.sin(t * Math.PI / 3) > 0;
    (this.core.material as THREE.MeshBasicMaterial).color.set(night > 0.3 ? (hi ? ramps.lantern[4] : ramps.lantern[3]) : hi ? ramps.lantern[3] : ramps.lantern[2]);
    (this.glow.material as THREE.MeshBasicMaterial).color.set(night > 0.3 ? (hi ? ramps.lantern[2] : ramps.lantern[1]) : ramps.lantern[1]);
  }
}
