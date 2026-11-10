import * as THREE from 'three';
import { PX } from './stops.ts';
import { ramps } from './palette.ts';

// Hand-drawn 16×12 tufts. Bottom row sits on the ground. '.' is transparent.
const legend: Record<string, string> = {
  a: ramps.olive[4], e: ramps.olive[3], b: ramps.moss[9], c: ramps.moss[7], d: ramps.moss[4],
  f: ramps.bone[1], i: ramps.fire[6], g: ramps.fire[5], h: ramps.dusk[3],
  r: ramps.earth[4], s: ramps.earth[6], k: ramps.olive[2], l: ramps.olive[1],
};
export const tuftArt = {
  tall: [
    '................',
    '.......a........',
    '...a...ab...a...',
    '...ab.abb..ab...',
    '....bbebb.ab....',
    '.a..bbbbbbbb..a.',
    '.ab.cbbcbbbc.ab.',
    '..bbcbcccbcbbb..',
    '..cbccccccccbc..',
    '...cccdccdccc...',
    '....dccdcdccd...',
    '....dddddddd....',
  ],
  short: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '......a...a.....',
    '...a..ba.ab.....',
    '...ba.bbabb..a..',
    '....bbcbbcb.ab..',
    '..a.bcccccbbb...',
    '..bbcccdcccbc...',
    '...dddddddddd...',
  ],
  daisy: [
    '................',
    '....f.......f...',
    '...fif.....fif..',
    '....f...f...f...',
    '....b..fif..b...',
    '....b...f...b...',
    '..a.bb..b..bb.a.',
    '..bb.b..b..b.bb.',
    '...bbcb.bb.cbb..',
    '....cccbbbccc...',
    '....ccdcccdcc...',
    '.....dddddddd...',
  ],
  bloom: [
    '................',
    '................',
    '.....g.....h....',
    '....gig...hfh...',
    '.....g..g..h....',
    '.....b.gig.b....',
    '...a.b..g..b.a..',
    '...bbb..b..bbb..',
    '....bcb.b.bcb...',
    '....cccbbbccc...',
    '....ccdcccdcc...',
    '.....dddddddd...',
  ],
  // Reeds at the water's edge: thin stalks, bulrush heads, leaves bending out.
  reed: [
    '.....s..........',
    '.....r....s.....',
    '..s..r....r.....',
    '..r..r..e.r.....',
    '..r..k..e.r..e..',
    '..k..k.e..k..e..',
    '..k.ek.e..k.e...',
    '.ek.ek.e.ek.e...',
    '.ekeek.eaeke....',
    '..kekkekkekk.a..',
    '..klkkklkkklka..',
    '...lllllllll....',
  ],
};
export type TuftKind = keyof typeof tuftArt;

function tuftTexture(rows: string[]) {
  const w = rows[0].length, h = rows.length, data = new Uint8Array(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    // The texture is sRGB, so store the hex's sRGB bytes as they are (THREE.Color would hand back linear values, and the
    // texture would decode them a second time into near-black).
    const hx = legend[ch], o = ((h - 1 - y) * w + x) * 4;
    data[o] = parseInt(hx.slice(1, 3), 16); data[o + 1] = parseInt(hx.slice(3, 5), 16); data[o + 2] = parseInt(hx.slice(5, 7), 16); data[o + 3] = 255;
  }));
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return t;
}

/** Upright cards facing the camera's south-north axis, stretched so they show at their drawn height at the Play pitch. */
export function tuftMesh(kind: TuftKind, spots: { x: number; z: number }[], time: { value: number }) {
  const rows = tuftArt[kind], w = rows[0].length / PX, h = rows.length / PX / Math.cos(Math.asin(3 / 4));
  const geo = new THREE.PlaneGeometry(w, h); geo.translate(0, h / 2, 0);
  const n = geo.attributes.normal; for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ map: tuftTexture(rows), alphaTest: 0.5, side: THREE.DoubleSide });
  mat.onBeforeCompile = shader => {
    shader.uniforms.uTime = time;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', /* glsl */`
      #include <begin_vertex>
      vec4 root = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      // Sway the top by whole render pixels so the pixel grid holds.
      float sway = floor(sin(uTime * 1.3 + root.x * 0.6 + root.z * 0.4) * 1.4 + 0.5) / ${PX.toFixed(1)};
      transformed.x += sway * step(0.6 * ${h.toFixed(4)}, position.y);
      // Cards turn with the camera's yaw, so a turned view never sees them edge-on.
      transformed.xz = transformed.x * normalize(vec2(viewMatrix[0][0], viewMatrix[2][0]));
    `);
  };
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, spots.length));
  mesh.count = spots.length;
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => { m.makeTranslation(Math.round(p.x * PX) / PX, 0, Math.round(p.z * PX) / PX); mesh.setMatrixAt(i, m); });
  mesh.castShadow = false; mesh.receiveShadow = true;
  return mesh;
}
