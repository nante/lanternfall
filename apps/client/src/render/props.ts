import * as THREE from 'three';
import { T } from '../../../../packages/game/src/model.ts';
import { Mason, prim } from './architecture/kit.ts';
import { ramps } from './palette.ts';

/**
 * Furniture and fixtures at 32 render pixels per tile: each thing kind is a small model baked from shaped pieces, split
 * by what it is made of so each part takes its own material (wood takes the plank texture, stone the wall stone, iron
 * and cloth are painted). Built once per kind and variant, then instanced per tile, so a whole market costs a few draw
 * calls. Lamp and altar flames are not part of the models: `terrain.ts` keeps them one instance per tile so each can be
 * lit or dark on its own. Every model has real sides, tops and undersides: it is seen from straight above and from head height.
 */
export type PropPart = 'wood' | 'darkWood' | 'stone' | 'paint' | 'fire';
export type PropModel = Partial<Record<PropPart, THREE.BufferGeometry>>;

const lathe = (profile: [number, number][], n = 12) => {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), n).toNonIndexed();
  g.computeVertexNormals(); return g;
};
const BARREL = lathe([[0, 0], [0.25, 0], [0.29, 0.18], [0.3, 0.36], [0.29, 0.54], [0.25, 0.72], [0, 0.72]]);
const BOWL = lathe([[0, 0], [0.12, 0], [0.3, 0.1], [0.34, 0.16], [0.3, 0.17], [0.13, 0.07], [0, 0.07]], 10);
const ROCK = new THREE.DodecahedronGeometry(1, 0).toNonIndexed();

const IRON = '#45403e', IRON_LT = '#6c6560', GOLD = '#d0a84a', CLOTH = ramps.roof[2], LINEN = '#e2d6bc';
/** Wood parts are tinted over the plank texture: white keeps it, darker tints read as end grain and frames. */
const FRAME = '#9a8a80', END = '#c8b8a8';

type Kit = Record<PropPart, Mason>;
type Build = (k: Kit, v: number) => void;

const models: Partial<Record<number, { variants: number; build: Build }>> = {
  [T.crate]: { variants: 2, build: ({ wood, darkWood }, v) => {
    const s = 0.62, h = s / 2;
    wood.put(prim.box(), '#ffffff', 0, h, 0, { sx: s - 0.04, sy: s - 0.04, sz: s - 0.04 });
    // A frame on every edge and a brace across two faces.
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) darkWood.block(FRAME, x * (h - 0.03), 0, s, z * (h - 0.03), 0.07, 0.07);
    for (const y of [0.035, s - 0.035]) for (const z of [-1, 1]) { darkWood.block(FRAME, 0, y - 0.035, y + 0.035, z * (h - 0.03), s, 0.07); darkWood.block(FRAME, z * (h - 0.03), y - 0.035, y + 0.035, 0, 0.07, s); }
    darkWood.beam(FRAME, new THREE.Vector3(-h + 0.05, 0.06, h), new THREE.Vector3(h - 0.05, s - 0.06, h), 0.07, 0.04);
    darkWood.beam(FRAME, new THREE.Vector3(h, 0.06, -h + 0.05), new THREE.Vector3(h, s - 0.06, h - 0.05), 0.04, 0.07);
    if (v === 1) { wood.put(prim.box(), END, 0.05, s + 0.12, -0.02, { sx: 0.4, sy: 0.24, sz: 0.36, ry: 0.5 }); darkWood.block(FRAME, 0.05, s + 0.11, s + 0.13, -0.02, 0.42, 0.38, 0.5); }
  } },
  [T.barrel]: { variants: 2, build: ({ darkWood, paint }, v) => {
    darkWood.putMatrix(BARREL, '#ffffff', new THREE.Matrix4());
    for (const [y, r] of [[0.08, 0.275], [0.26, 0.298], [0.46, 0.298], [0.64, 0.275]] as const) paint.put(prim.cyl(12), IRON, 0, y, 0, { sx: r + 0.012, sy: 0.04, sz: r + 0.012 });
    darkWood.put(prim.cyl(12), END, 0, 0.715, 0, { sx: 0.235, sy: 0.02, sz: 0.235 });
    paint.put(prim.box(), IRON_LT, 0.0, 0.73, 0, { sx: 0.3, sy: 0.015, sz: 0.04 });
    if (v === 1) paint.put(prim.cyl(8), ramps.ochre[4], 0.05, 0.78, 0.04, { sx: 0.1, sy: 0.1, sz: 0.1 });
  } },
  [T.counter]: { variants: 2, build: ({ wood, darkWood, paint }, v) => {
    darkWood.block('#ffffff', 0, 0, 0.78, 0, 0.96, 0.58);
    // Framed panels on the front, a plinth, and a top that overhangs.
    for (const x of [-0.24, 0.24]) { darkWood.block(FRAME, x, 0.14, 0.66, 0.3, 0.38, 0.03); darkWood.block(END, x, 0.2, 0.6, 0.31, 0.28, 0.02); }
    darkWood.block(FRAME, 0, 0, 0.08, 0, 1.0, 0.62);
    wood.block('#ffffff', 0, 0.78, 0.85, 0, 1.06, 0.7);
    if (v === 1) { paint.put(prim.cyl(8), '#7c8f9a', -0.25, 0.92, 0, { sx: 0.07, sy: 0.14, sz: 0.07 }); paint.put(prim.cyl(10), ramps.ochre[3], 0.22, 0.88, 0.05, { sx: 0.14, sy: 0.06, sz: 0.14 }); paint.put(prim.box(), GOLD, 0.22, 0.92, 0.05, { sx: 0.06, sy: 0.03, sz: 0.06 }); }
  } },
  [T.table]: { variants: 3, build: ({ wood, darkWood, paint }, v) => {
    wood.block('#ffffff', 0, 0.58, 0.65, 0, 0.9, 0.78);
    darkWood.block(FRAME, 0, 0.5, 0.58, 0, 0.76, 0.64);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { darkWood.block('#ffffff', x * 0.36, 0, 0.5, z * 0.3, 0.08, 0.08); darkWood.block(FRAME, x * 0.36, 0.0, 0.05, z * 0.3, 0.1, 0.1); }
    if (v === 1) { paint.put(prim.cyl(8), '#d9cfb8', -0.18, 0.7, 0.05, { sx: 0.06, sy: 0.1, sz: 0.06 }); paint.put(prim.cyl(10), ramps.ochre[3], 0.14, 0.67, -0.06, { sx: 0.16, sy: 0.04, sz: 0.16 }); paint.put(prim.dome(8, 2), ramps.ochre[5], 0.14, 0.69, -0.06, { sx: 0.11, sy: 0.06, sz: 0.11 }); }
    if (v === 2) { paint.put(prim.cyl(8), LINEN, 0.05, 0.72, 0, { sx: 0.04, sy: 0.14, sz: 0.04 }); paint.put(prim.cyl(8), IRON, 0.05, 0.66, 0, { sx: 0.08, sy: 0.02, sz: 0.08 }); paint.put(prim.box(), '#5a4a6a', -0.22, 0.67, 0.12, { sx: 0.2, sy: 0.04, sz: 0.15, ry: 0.3 }); }
  } },
  [T.well]: { variants: 1, build: ({ stone, wood, darkWood, paint }) => {
    stone.put(prim.cyl(14), '#ffffff', 0, 0.28, 0, { sx: 0.46, sy: 0.56, sz: 0.46 });
    stone.put(prim.cyl(14), END, 0, 0.6, 0, { sx: 0.5, sy: 0.08, sz: 0.5 });
    paint.put(prim.cyl(14), '#0f2328', 0, 0.62, 0, { sx: 0.36, sy: 0.04, sz: 0.36 });
    paint.put(prim.cyl(14), ramps.water[1], 0, 0.45, 0, { sx: 0.35, sy: 0.02, sz: 0.35 });
    for (const x of [-0.4, 0.4]) darkWood.block('#ffffff', x, 0.3, 1.45, 0, 0.09, 0.09);
    darkWood.put(prim.cyl(8), FRAME, 0, 1.2, 0, { sx: 0.06, sy: 0.84, sz: 0.06, rz: Math.PI / 2 });
    paint.put(prim.box(), IRON, 0.46, 1.12, 0, { sx: 0.03, sy: 0.16, sz: 0.03 });
    // A shingled pitched roof over the winch, a rope and a bucket.
    wood.put(prim.gable(), '#ffffff', 0, 1.42, 0, { sx: 1.0, sy: 0.32, sz: 0.62 });
    darkWood.block(FRAME, 0, 1.4, 1.44, 0, 1.04, 0.66);
    paint.put(prim.box(), '#b49a6a', 0, 0.98, 0, { sx: 0.02, sy: 0.42, sz: 0.02 });
    darkWood.put(prim.cyl(8, 1.2), '#ffffff', 0, 0.72, 0, { sx: 0.08, sy: 0.12, sz: 0.08 });
    paint.put(prim.cyl(8), IRON, 0, 0.77, 0, { sx: 0.1, sy: 0.02, sz: 0.1 });
  } },
  [T.rock]: { variants: 3, build: ({ stone, paint }, v) => {
    const sets = [[[0, 0.17, 0, 0.36, 0.26], [0.26, 0.09, 0.14, 0.17, 0.13], [-0.22, 0.07, 0.18, 0.12, 0.09]], [[0, 0.21, 0, 0.32, 0.3], [-0.24, 0.08, -0.1, 0.16, 0.11]], [[0.05, 0.13, 0, 0.42, 0.2], [-0.25, 0.08, 0.2, 0.13, 0.1], [0.3, 0.06, -0.18, 0.11, 0.08], [0.1, 0.05, 0.3, 0.08, 0.06]]];
    const lumps = sets[v];
    lumps.forEach(([x, y, z, r, h], i) => stone.put(ROCK, i ? '#8c857a' : '#a49c90', x, y, z, { sx: r, sy: h, sz: r * 0.85, ry: i * 1.7 + v, rx: 0.2 * i }));
    // Moss on the top of the biggest stone.
    const [x, y, z, r, h] = lumps[0];
    paint.put(prim.dome(8, 2), ramps.moss[8], x - r * 0.15, y + h * 0.72, z + 0.02, { sx: r * 0.55, sy: h * 0.22, sz: r * 0.45 });
  } },
  [T.vault]: { variants: 1, build: ({ darkWood, paint }) => {
    // An iron-bound strongbox: a chest with an arched lid, bands, corner plates and a gold lock.
    darkWood.block('#ffffff', 0, 0, 0.44, 0, 0.8, 0.56);
    darkWood.put(prim.cyl(12, 1), '#ffffff', 0, 0.44, 0, { sx: 0.28, sy: 0.8, sz: 0.28, rz: Math.PI / 2 });
    for (const x of [-0.3, 0, 0.3]) { paint.put(prim.cyl(12), IRON, x, 0.44, 0, { sx: 0.295, sy: 0.05, sz: 0.295, rz: Math.PI / 2 }); paint.block(IRON, x, 0, 0.44, 0, 0.05, 0.58); }
    paint.block(IRON, 0, 0.0, 0.05, 0, 0.84, 0.6);
    paint.put(prim.box(), GOLD, 0, 0.42, 0.29, { sx: 0.12, sy: 0.16, sz: 0.04 });
    paint.put(prim.box(), '#2a2420', 0, 0.39, 0.31, { sx: 0.03, sy: 0.05, sz: 0.01 });
  } },
  [T.altar]: { variants: 1, build: ({ stone, paint }) => {
    stone.block(FRAME, 0, 0, 0.14, 0, 1.46, 0.8);
    stone.block('#ffffff', 0, 0.14, 0.76, 0, 1.3, 0.64);
    stone.block(END, 0, 0.76, 0.86, 0, 1.44, 0.76);
    // A carved panel on the front and a cloth runner over the top.
    stone.block('#a8a09a', 0, 0.26, 0.64, 0.325, 0.62, 0.02);
    paint.block(CLOTH, 0, 0.86, 0.875, 0, 0.3, 0.78);
    paint.block(CLOTH, 0, 0.58, 0.875, 0.39, 0.3, 0.02);
    paint.block(GOLD, 0, 0.58, 0.61, 0.4, 0.3, 0.02);
    for (const x of [-0.55, 0.55]) { paint.put(prim.cyl(8), LINEN, x, 0.97, 0.05, { sx: 0.05, sy: 0.2, sz: 0.05 }); paint.put(prim.cyl(8), GOLD, x, 0.875, 0.05, { sx: 0.09, sy: 0.03, sz: 0.09 }); }
    paint.put(prim.cyl(8), GOLD, 0, 0.9, -0.1, { sx: 0.14, sy: 0.08, sz: 0.14 });
  } },
  [T.shelf]: { variants: 2, build: ({ darkWood, paint }, v) => {
    const z = -0.25;
    darkWood.block('#ffffff', 0, 0, 1.72, z - 0.17, 0.96, 0.06);
    for (const x of [-0.46, 0.46]) darkWood.block(FRAME, x, 0, 1.76, z, 0.06, 0.4);
    for (const y of [0.04, 0.6, 1.14, 1.7]) darkWood.block(END, 0, y - 0.03, y + 0.03, z, 0.92, 0.38);
    const books = ['#b5523e', '#4b7ab0', '#6aa05a', '#d4b04a', '#8b5aa0', '#7a4a3a', '#c8b48a'];
    for (const [row, y] of [[0, 0.07], [1, 0.63], [2, 1.17]] as const) {
      let x = -0.42;
      for (let i = 0; x < 0.4; i++) {
        const w = 0.05 + ((i * 7 + row * 3 + v) % 4) * 0.015, h = 0.26 + ((i * 5 + row + v * 2) % 5) * 0.035;
        if ((i + row + v) % 6 === 5) { paint.put(prim.cyl(8), '#7c8f9a', x + 0.04, y + 0.08, z + 0.02, { sx: 0.05, sy: 0.16, sz: 0.05 }); x += 0.1; continue; }
        paint.block(books[(i * 3 + row * 2 + v) % books.length], x + w / 2, y, y + h, z + 0.03, w - 0.008, 0.26);
        x += w;
      }
    }
  } },
  [T.pillar]: { variants: 1, build: ({ stone }) => {
    stone.block(FRAME, 0, 0, 0.14, 0, 0.66, 0.66);
    stone.put(prim.cyl(12, 0.85), END, 0, 0.2, 0, { sx: 0.3, sy: 0.12, sz: 0.3 });
    stone.put(prim.cyl(12, 0.92), '#ffffff', 0, 1.05, 0, { sx: 0.24, sy: 1.6, sz: 0.24 });
    stone.put(prim.cyl(12, 1.3), END, 0, 1.9, 0, { sx: 0.24, sy: 0.12, sz: 0.24 });
    stone.block(FRAME, 0, 1.96, 2.06, 0, 0.62, 0.62);
  } },
  [T.bed]: { variants: 1, build: ({ wood, darkWood, paint }) => {
    darkWood.block('#ffffff', 0, 0.08, 0.3, 0, 0.82, 0.98);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) darkWood.block(FRAME, x * 0.38, 0, z < 0 ? 0.78 : 0.48, z * 0.46, 0.08, 0.08);
    wood.block('#ffffff', 0, 0.3, 0.7, -0.47, 0.76, 0.05);
    wood.block('#ffffff', 0, 0.3, 0.44, 0.47, 0.76, 0.05);
    paint.block(LINEN, 0, 0.3, 0.4, 0, 0.74, 0.9);
    paint.block(CLOTH, 0, 0.36, 0.44, 0.12, 0.78, 0.66);
    paint.block(ramps.roof[1], 0, 0.25, 0.44, 0.45, 0.78, 0.02);
    paint.block(ramps.bone[1], 0, 0.44, 0.45, -0.2, 0.78, 0.1);
    paint.put(prim.box(), LINEN, 0, 0.45, -0.34, { sx: 0.5, sy: 0.1, sz: 0.2 });
  } },
  [T.anvil]: { variants: 1, build: ({ darkWood, paint }) => {
    darkWood.put(prim.cyl(10, 0.9), '#ffffff', 0, 0.17, 0, { sx: 0.26, sy: 0.34, sz: 0.26 });
    darkWood.put(prim.cyl(10), END, 0, 0.345, 0, { sx: 0.24, sy: 0.01, sz: 0.24 });
    paint.block(IRON, 0, 0.35, 0.42, 0, 0.36, 0.3);
    paint.block(IRON, 0, 0.42, 0.52, 0, 0.18, 0.18);
    paint.block(IRON_LT, -0.02, 0.52, 0.64, 0, 0.52, 0.24);
    paint.put(prim.cone(8), IRON_LT, 0.38, 0.6, 0, { sx: 0.1, sy: 0.3, sz: 0.1, rz: -Math.PI / 2 });
    paint.block(IRON, -0.32, 0.52, 0.64, 0, 0.12, 0.2);
    // A hammer left on the face.
    darkWood.beam(FRAME, new THREE.Vector3(-0.1, 0.66, 0.02), new THREE.Vector3(0.12, 0.66, 0.2), 0.03);
    paint.block(IRON, -0.12, 0.64, 0.7, 0.0, 0.1, 0.06, 0.7);
  } },
  [T.brazier]: { variants: 1, build: ({ paint, fire }) => {
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; paint.beam(IRON, new THREE.Vector3(Math.sin(a) * 0.28, 0, Math.cos(a) * 0.28), new THREE.Vector3(Math.sin(a) * 0.1, 0.62, Math.cos(a) * 0.1), 0.05); }
    paint.put(prim.cyl(10), IRON, 0, 0.3, 0, { sx: 0.16, sy: 0.03, sz: 0.16 });
    paint.putMatrix(BOWL, IRON_LT, new THREE.Matrix4().makeTranslation(0, 0.6, 0));
    paint.put(prim.cyl(10), '#3a1a10', 0, 0.71, 0, { sx: 0.27, sy: 0.04, sz: 0.27 });
    for (let i = 0; i < 5; i++) { const a = i * 1.3; paint.put(ROCK, i % 2 ? '#c95a24' : '#5c2410', Math.sin(a) * 0.14, 0.74, Math.cos(a) * 0.14, { sx: 0.06, sy: 0.04, sz: 0.06, ry: a }); }
    fire.put(prim.cone(5), '#ffffff', 0, 0.9, 0, { sx: 0.14, sy: 0.36, sz: 0.14 });
    fire.put(prim.cone(5), '#ffffff', 0.08, 0.84, 0.05, { sx: 0.08, sy: 0.22, sz: 0.08 });
    fire.put(prim.cone(5), '#ffffff', -0.08, 0.83, -0.04, { sx: 0.08, sy: 0.2, sz: 0.08 });
  } },
  [T.stump]: { variants: 2, build: ({ darkWood, wood, paint }, v) => {
    // Bark sides flaring into roots, a pale sawn top with rings, now and then an axe left in it.
    const h = v ? 0.3 : 0.22;
    darkWood.put(prim.cyl(9, 0.86), '#ffffff', 0, h / 2, 0, { sx: 0.3, sy: h, sz: 0.3 });
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + v; darkWood.beam('#ffffff', new THREE.Vector3(Math.sin(a) * 0.16, h * 0.55, Math.cos(a) * 0.16), new THREE.Vector3(Math.sin(a) * 0.42, 0.01, Math.cos(a) * 0.42), 0.09, 0.07); }
    wood.put(prim.cyl(9), END, 0, h + 0.01, 0, { sx: 0.25, sy: 0.02, sz: 0.25 });
    wood.put(prim.cyl(9), '#a48868', 0, h + 0.022, 0, { sx: 0.15, sy: 0.005, sz: 0.15 });
    wood.put(prim.cyl(9), END, 0, h + 0.026, 0, { sx: 0.09, sy: 0.005, sz: 0.09 });
    paint.put(prim.dome(8, 2), ramps.moss[7], -0.2, 0.02, 0.18, { sx: 0.14, sy: 0.07, sz: 0.1 });
    if (v === 1) { darkWood.beam(FRAME, new THREE.Vector3(0.02, h, 0.02), new THREE.Vector3(0.26, h + 0.28, 0.12), 0.035); paint.block(IRON_LT, 0.04, h - 0.04, h + 0.06, 0.03, 0.14, 0.02, -0.4); }
  } },
  [T.lamp]: { variants: 1, build: ({ stone, paint }) => {
    // A street lamp: stone footing, an iron post with collars, a scrolled arm and a caged lantern hung from it.
    stone.block('#ffffff', 0, 0, 0.16, 0, 0.32, 0.32);
    stone.block(END, 0, 0.16, 0.22, 0, 0.24, 0.24);
    paint.put(prim.cyl(8, 0.7), IRON, 0, 1.07, 0, { sx: 0.075, sy: 1.7, sz: 0.075 });
    for (const y of [0.3, 1.0, 1.86]) paint.put(prim.cyl(8), IRON_LT, 0, y, 0, { sx: 0.09, sy: 0.05, sz: 0.09 });
    paint.put(prim.cone(8), IRON, 0, 2.0, 0, { sx: 0.07, sy: 0.18, sz: 0.07 });
    paint.block(IRON, 0.18, 1.86, 1.91, 0, 0.42, 0.045);
    paint.beam(IRON, new THREE.Vector3(0.02, 1.62, 0), new THREE.Vector3(0.3, 1.87, 0), 0.03);
    paint.block(IRON, 0.32, 1.78, 1.86, 0, 0.02, 0.02);
    // The cage: a cap, a floor and four bars round the glass.
    paint.put(prim.cone(4), IRON, 0.32, 1.83, 0, { sx: 0.17, sy: 0.1, sz: 0.17, ry: Math.PI / 4 });
    paint.block(IRON, 0.32, 1.47, 1.51, 0, 0.2, 0.2);
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) paint.block(IRON, 0.32 + x * 0.09, 1.5, 1.78, z * 0.09, 0.025, 0.025);
  } },
};

const cache = new Map<string, PropModel>();
/** The model for a thing kind, or undefined when the kind is drawn elsewhere (walls, trees, doors). */
export function propModel(kind: number, variant: number): PropModel | undefined {
  const def = models[kind]; if (!def) return undefined;
  const v = variant % def.variants, key = `${kind}:${v}`;
  let out = cache.get(key);
  if (!out) {
    const kit = { wood: new Mason(), darkWood: new Mason(), stone: new Mason(), paint: new Mason(), fire: new Mason() } satisfies Kit;
    def.build(kit, v);
    out = {};
    for (const [part, m] of Object.entries(kit) as [PropPart, Mason][]) if (m.triangles) out[part] = m.geometry();
    cache.set(key, out);
  }
  return out;
}
