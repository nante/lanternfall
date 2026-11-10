import * as THREE from 'three';

/**
 * The mason's kit: shaped primitives baked into one merged, vertex-coloured mesh per material, so a whole castle
 * costs one draw call. Pieces are chunky on purpose: far away a render pixel is a third of a world unit or more,
 * and anything thinner than that shimmers.
 */
export type Place = { ry?: number; rx?: number; rz?: number; sx?: number; sy?: number; sz?: number };
/** Adjust a piece's colour per vertex from its world position (grounding, depth haze). */
export type Shade = (c: THREE.Color, p: THREE.Vector3) => void;

const cache = new Map<string, THREE.BufferGeometry>();
const shape = (key: string, make: () => THREE.BufferGeometry) => {
  let g = cache.get(key);
  if (!g) { g = make(); g.deleteAttribute('uv'); if (g.index) g = g.toNonIndexed(); cache.set(key, g); }
  return g;
};
/** Unit primitives; scale them with `Place`. Cylinders, cones and domes are radius 1, height 1, centred. */
export const prim = {
  box: () => shape('box', () => new THREE.BoxGeometry(1, 1, 1)),
  /** A flat unit square facing +z: windows, at two triangles each. */
  pane: () => shape('pane', () => new THREE.PlaneGeometry(1, 1)),
  cyl: (n = 10, top = 1) => shape(`cyl${n}:${top}`, () => new THREE.CylinderGeometry(top, 1, 1, n)),
  cone: (n = 8) => shape(`cone${n}`, () => new THREE.ConeGeometry(1, 1, n)),
  /** Half sphere sitting on y = 0. */
  dome: (n = 10, rows = 4) => shape(`dome${n}:${rows}`, () => new THREE.SphereGeometry(1, n, rows, 0, Math.PI * 2, 0, Math.PI / 2)),
  rock: (detail = 0) => shape(`rock${detail}`, () => new THREE.DodecahedronGeometry(1, detail)),
  /** A gable: triangular prism, ridge along x, eaves at y = 0, apex at y = 1, depth 1 along z. */
  gable: () => shape('gable', () => {
    const s = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
    const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5); g.rotateY(Math.PI / 2);
    return g;
  }),
  /** A lancet: a flat pointed-arch panel 1 wide and 3 tall, 1 deep, base at y = 0. */
  lancet: () => shape('lancet', () => new THREE.ExtrudeGeometry(lancetShape(1, 3) as THREE.Shape, { depth: 1, bevelEnabled: false, curveSegments: 2 }).translate(0, 0, -0.5)),
};

/** A pointed arch outline, base at y = 0. */
export function lancetShape(w: number, h: number, x = 0, y = 0, path: THREE.Shape | THREE.Path = new THREE.Shape()) {
  const r = w * 0.8, spring = h - Math.sqrt(r * r - (r - w / 2) ** 2);
  path.moveTo(x - w / 2, y); path.lineTo(x + w / 2, y); path.lineTo(x + w / 2, y + spring);
  path.absarc(x + w / 2 - r, y + spring, r, 0, Math.acos((r - w / 2) / r), false);
  path.absarc(x - w / 2 + r, y + spring, r, Math.PI - Math.acos((r - w / 2) / r), Math.PI, false);
  path.lineTo(x - w / 2, y);
  return path;
}
/** A round arch outline (semicircle on posts), base at y = 0, drawn clockwise for use as a hole. */
export function roundArch(w: number, spring: number, x = 0, y = 0, path: THREE.Path = new THREE.Path()) {
  path.moveTo(x - w / 2, y); path.lineTo(x - w / 2, y + spring);
  path.absarc(x, y + spring, w / 2, Math.PI, 0, true);
  path.lineTo(x + w / 2, y); path.lineTo(x - w / 2, y);
  return path;
}

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
const col = new THREE.Color(), nm = new THREE.Matrix3();

export class Mason {
  private pos: number[] = [];
  private nrm: number[] = [];
  private rgb: number[] = [];
  private frame = new THREE.Matrix4();
  constructor(private readonly shade?: Shade) {}
  /** Build `fn`'s pieces in a local frame: moved to x, y, z, turned ry about Y, and scaled about that point. */
  within(x: number, y: number, z: number, ry: number, fn: () => void, scale = 1) {
    const prior = this.frame;
    this.frame = prior.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(scale, scale, scale)));
    fn();
    this.frame = prior;
  }
  /** A local point in world space (for asking the ground how high it is under a piece). */
  world(x: number, y: number, z: number) { return new THREE.Vector3(x, y, z).applyMatrix4(this.frame); }
  get triangles() { return this.pos.length / 9; }

  /** Bake a piece: unit geometry `geo`, coloured `color`, scaled then rotated (Y, then X/Z), then moved to x, y, z. */
  put(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, x: number, y: number, z: number, p: Place = {}) {
    e.set(p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, 'YXZ');
    m4.compose(v.set(x, y, z), q.setFromEuler(e), s.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1));
    return this.putMatrix(geo, color, m4);
  }
  putMatrix(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, local: THREE.Matrix4) {
    const m = this.frame.clone().multiply(local);
    const P = geo.attributes.position as THREE.BufferAttribute, N = geo.attributes.normal as THREE.BufferAttribute;
    nm.getNormalMatrix(m);
    const base = new THREE.Color(color), n = new THREE.Vector3();
    // A negative scale flips winding: swap two corners of each triangle so faces still point out.
    const flip = m.determinant() < 0;
    for (let i = 0; i < P.count; i++) {
      const j = flip ? (i % 3 === 1 ? i + 1 : i % 3 === 2 ? i - 1 : i) : i;
      v.fromBufferAttribute(P, j).applyMatrix4(m);
      n.fromBufferAttribute(N, j).applyMatrix3(nm).normalize();
      col.copy(base); this.shade?.(col, v);
      this.pos.push(v.x, v.y, v.z); this.nrm.push(n.x, n.y, n.z); this.rgb.push(col.r, col.g, col.b);
    }
    return this;
  }
  /** One triangle in the current frame, coloured per corner, with its face normal. */
  face(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, ca: THREE.Color, cb = ca, cc = ca) {
    const pa = a.clone().applyMatrix4(this.frame), pb = b.clone().applyMatrix4(this.frame), pc = c.clone().applyMatrix4(this.frame);
    const n = pb.clone().sub(pa).cross(pc.clone().sub(pa)).normalize();
    for (const [p, k] of [[pa, ca], [pb, cb], [pc, cc]] as const) {
      col.copy(k); this.shade?.(col, p);
      this.pos.push(p.x, p.y, p.z); this.nrm.push(n.x, n.y, n.z); this.rgb.push(col.r, col.g, col.b);
    }
    return this;
  }
  /**
   * A tube swept along `spine`, its cross-section an ellipse `r(t)` = [half-width, half-height] in a frame that keeps
   * `up` as its top. `paint(t, a)` colours each vertex by position along the tube and angle round it (0 = top).
   */
  loft(spine: THREE.Vector3[], r: (t: number) => [number, number], paint: (t: number, a: number) => THREE.Color, n = 10, up = new THREE.Vector3(0, 1, 0), caps = true) {
    const rings: THREE.Vector3[][] = [], cols: THREE.Color[][] = [];
    // The side vector is carried along the spine (parallel transport), so a tube that turns through vertical never twists.
    let side = new THREE.Vector3();
    spine.forEach((p, i) => {
      const t = i / (spine.length - 1);
      const tan = spine[Math.min(i + 1, spine.length - 1)].clone().sub(spine[Math.max(i - 1, 0)]).normalize();
      if (i === 0) { side = tan.clone().cross(up).normalize(); if (side.lengthSq() < 1e-6) side.set(1, 0, 0); }
      else side.addScaledVector(tan, -side.dot(tan)).normalize();
      const top = side.clone().cross(tan).normalize();
      const [rw, rh] = r(t), ring: THREE.Vector3[] = [], rc: THREE.Color[] = [];
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        ring.push(p.clone().addScaledVector(top, Math.cos(a) * rh).addScaledVector(side, Math.sin(a) * rw));
        rc.push(paint(t, a));
      }
      rings.push(ring); cols.push(rc);
    });
    for (let i = 0; i < rings.length - 1; i++) for (let k = 0; k < n; k++) {
      const k2 = (k + 1) % n, a = rings[i][k], b = rings[i][k2], c = rings[i + 1][k2], d = rings[i + 1][k];
      this.face(a, b, c, cols[i][k], cols[i][k2], cols[i + 1][k2]).face(a, c, d, cols[i][k], cols[i + 1][k2], cols[i + 1][k]);
    }
    if (caps) for (const [i, dir] of [[0, 1], [rings.length - 1, -1]] as const) {
      const c = spine[i];
      for (let k = 0; k < n; k++) { const k2 = (k + 1) % n; if (dir > 0) this.face(c, rings[i][k2], rings[i][k], cols[i][k]); else this.face(c, rings[i][k], rings[i][k2], cols[i][k]); }
    }
    return this;
  }
  /** A square beam of width `w` from point a to point b. */
  beam(color: THREE.ColorRepresentation, a: THREE.Vector3, b: THREE.Vector3, w: number, d = w) {
    const dir = b.clone().sub(a), len = dir.length();
    m4.compose(a.clone().add(b).multiplyScalar(0.5), q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()), s.set(w, len, d));
    return this.putMatrix(prim.box(), color, m4);
  }
  /** Box spanning y0..y1 (handy for walls standing on uneven ground). */
  block(color: THREE.ColorRepresentation, x: number, y0: number, y1: number, z: number, w: number, d: number, ry = 0) {
    return this.put(prim.box(), color, x, (y0 + y1) / 2, z, { sx: w, sy: y1 - y0, sz: d, ry });
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.rgb, 3));
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  }
  build(material: THREE.Material) { return new THREE.Mesh(this.geometry(), material); }
}

/** The one lit material every building shares: flat-shaded Lambert, coloured per vertex. */
export const masonry = (extra: THREE.MeshLambertMaterialParameters = {}) => new THREE.MeshLambertMaterial({ color: '#ffffff', vertexColors: true, flatShading: true, ...extra });

/** Deterministic 0..1 hash. */
export const rnd = (a: number, b = 0) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
/** Mix two colours. */
export const mix = (a: THREE.ColorRepresentation, b: THREE.ColorRepresentation, t: number) => '#' + new THREE.Color(a).lerp(new THREE.Color(b), t).getHexString();
