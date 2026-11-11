import { ICON_SIZE as S } from '../../packages/game/src/content-schema.ts';
import { materials, type MatId } from './materials.ts';

/**
 * An icon as a drawing program. Shapes are filled on the 24×24 grid in painter's order (each shape is a part, later
 * parts in front) and carry a surface normal from their form, so the passes in passes.ts can shade, light and outline
 * them the way the tutorials do by hand. Coordinates are in pixels; integers are pixel corners, a pixel is sampled at
 * its centre. The image's y runs down; normals are (x right, y down, z towards the viewer).
 */
export type V2 = readonly [number, number];
export type Form = 'flat' | 'pillow' | 'dome' | 'ridge' | 'round';
export type Cell = { mat: MatId; part: number; n: [number, number, number]; axis: V2 };
export type Mark = { x: number; y: number; dt?: number; tone?: number; mat?: MatId };
export type ShapeOpts = { form?: Form; bevel?: number; ridge?: readonly [V2, V2]; axis?: V2; tilt?: V2; sep?: boolean };

const norm3 = (x: number, y: number, z: number): [number, number, number] => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
const norm2 = (x: number, y: number): V2 => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
/** Nearest point on segment ab to p, and the parameter along it. */
function nearestOnSeg(p: V2, a: V2, b: V2) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return { q: [a[0] + dx * t, a[1] + dy * t] as V2, t };
}
function insidePoly(p: V2, pts: readonly V2[]) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export class Icon {
  readonly cells: (Cell | null)[] = Array(S * S).fill(null);
  readonly marks: Mark[] = [];
  /** Parts drawn with `sep`: the parts behind them take a dark line where they meet. */
  readonly sep = new Set<number>();
  parts = 0;
  constructor(readonly name: string, readonly seed = 1) {}

  private fill(mat: MatId, inside: (p: V2) => boolean, normal: (p: V2) => [number, number, number], axis: (p: V2) => V2, o: ShapeOpts) {
    const part = ++this.parts;
    if (o.sep) this.sep.add(part);
    const tilt = o.tilt ?? [0, 0];
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const p: V2 = [x + 0.5, y + 0.5];
      if (!inside(p)) continue;
      const n = normal(p);
      this.cells[y * S + x] = { mat, part, n: norm3(n[0] + tilt[0], n[1] + tilt[1], n[2]), axis: axis(p) };
    }
    return this;
  }
  /** Normal for a region from its distance to the edge: a bevelled slab ('pillow') or a full dome ('dome'). */
  private edgeNormal(edges: [V2, V2][], form: Form, bevel: number, ridge?: readonly [V2, V2]) {
    return (p: V2): [number, number, number] => {
      if (form === 'flat') return [0, 0, 1];
      let best = Infinity, out: V2 = [0, 0];
      for (const [a, b] of edges) {
        const { q } = nearestOnSeg(p, a, b), d = Math.hypot(p[0] - q[0], p[1] - q[1]);
        if (d < best) { best = d; out = norm2(q[0] - p[0], q[1] - p[1]); }
      }
      const t = Math.max(0, Math.min(1, 1 - best / bevel)) * (form === 'dome' ? 0.95 : 0.8);
      let n: [number, number, number] = [out[0] * t, out[1] * t, Math.sqrt(Math.max(0.05, 1 - t * t))];
      if (form === 'ridge' && ridge) {
        // Two facets either side of the spine, the bevel on top: a blade's edge bevels or a gem's crown.
        const [a, b] = ridge, side = Math.sign((b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])) || 1;
        const perp = norm2(-(b[1] - a[1]) * side, (b[0] - a[0]) * side);
        n = [n[0] * 0.5 + perp[0] * 0.55, n[1] * 0.5 + perp[1] * 0.55, n[2]];
      }
      return n;
    };
  }

  poly(pts: readonly V2[], mat: MatId, o: ShapeOpts = {}) {
    const edges = pts.map((a, i) => [a, pts[(i + 1) % pts.length]] as [V2, V2]);
    let bevel = o.bevel ?? 2;
    if (o.form === 'dome') {
      // A dome's bevel is the shape's own inner radius.
      bevel = 0.5;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const p: V2 = [x + 0.5, y + 0.5];
        if (insidePoly(p, pts)) bevel = Math.max(bevel, Math.min(...edges.map(([a, b]) => { const q = nearestOnSeg(p, a, b).q; return Math.hypot(p[0] - q[0], p[1] - q[1]); })));
      }
      bevel += 0.5;
    }
    const axis = o.axis ? norm2(...o.axis) : ([0, 1] as V2);
    return this.fill(mat, p => insidePoly(p, pts), this.edgeNormal(edges, o.form ?? 'pillow', bevel, o.ridge), () => axis, o);
  }
  rect(x0: number, y0: number, x1: number, y1: number, mat: MatId, o: ShapeOpts = {}) {
    return this.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], mat, o);
  }
  /** An ellipse, domed by default; `rot` turns it (radians). */
  ellipse(cx: number, cy: number, rx: number, ry: number, mat: MatId, o: ShapeOpts & { rot?: number } = {}) {
    const c = Math.cos(o.rot ?? 0), s = Math.sin(o.rot ?? 0), form = o.form ?? 'dome';
    const local = (p: V2) => { const dx = p[0] - cx, dy = p[1] - cy; return [(dx * c + dy * s) / rx, (-dx * s + dy * c) / ry] as V2; };
    const axis = o.axis ? norm2(...o.axis) : norm2(-s, c);
    return this.fill(mat, p => { const [u, v] = local(p); return u * u + v * v <= 1; }, p => {
      const [u, v] = local(p), r2 = Math.min(1, u * u + v * v);
      if (form === 'flat') return [0, 0, 1];
      const k = form === 'dome' ? 0.95 : 0.75, edge = form === 'dome' ? 1 : Math.max(0, (Math.sqrt(r2) - 0.45) / 0.55);
      const gx = u * c - v * s, gy = u * s + v * c, gl = Math.hypot(gx, gy) || 1;
      const t = form === 'dome' ? Math.sqrt(r2) * k : edge * k;
      return [(gx / gl) * t, (gy / gl) * t, Math.sqrt(Math.max(0.05, 1 - t * t))];
    }, () => axis, o);
  }
  /** A thick polyline with round ends; its normal curves across the width like a rod. */
  line(pts: readonly V2[], width: number, mat: MatId, o: ShapeOpts = {}) {
    const r = width / 2, segs = pts.slice(1).map((b, i) => [pts[i], b] as [V2, V2]);
    const near = (p: V2) => {
      let best = Infinity, q: V2 = p, ax: V2 = [0, 1];
      for (const [a, b] of segs) { const n = nearestOnSeg(p, a, b), d = Math.hypot(p[0] - n.q[0], p[1] - n.q[1]); if (d < best) { best = d; q = n.q; ax = norm2(b[0] - a[0], b[1] - a[1]); } }
      return { d: best, q, ax };
    };
    const form = o.form ?? 'round';
    return this.fill(mat, p => near(p).d <= r, p => {
      if (form === 'flat') return [0, 0, 1];
      const { d, q } = near(p), dir = norm2(p[0] - q[0], p[1] - q[1]), t = Math.min(1, d / Math.max(r, 0.5)) * 0.85;
      return [dir[0] * t, dir[1] * t, Math.sqrt(Math.max(0.05, 1 - t * t))];
    }, p => near(p).ax, o);
  }
  /** A ring (torus seen from the front): normals curve across its band. */
  ring(cx: number, cy: number, r: number, width: number, mat: MatId, o: ShapeOpts & { ry?: number } = {}) {
    const ry = o.ry ?? r, half = width / 2;
    const at = (p: V2) => { const dx = (p[0] - cx) / r, dy = (p[1] - cy) / ry, l = Math.hypot(dx, dy) || 1; return { l, dx: dx / l, dy: dy / l, d: (l - 1) * Math.min(r, ry) }; };
    return this.fill(mat, p => Math.abs(at(p).d) <= half, p => {
      const a = at(p), t = Math.max(-1, Math.min(1, a.d / half)) * 0.85;
      return [a.dx * t, a.dy * t, Math.sqrt(Math.max(0.05, 1 - t * t))];
    }, p => { const a = at(p); return [-a.dy, a.dx]; }, o);
  }
  /** Erase everything inside a polygon or ellipse (holes, notches). */
  cutPoly(pts: readonly V2[]) { for (let i = 0; i < S * S; i++) if (insidePoly([(i % S) + 0.5, Math.floor(i / S) + 0.5], pts)) this.cells[i] = null; return this; }
  cutEllipse(cx: number, cy: number, rx: number, ry: number) {
    for (let i = 0; i < S * S; i++) { const dx = ((i % S) + 0.5 - cx) / rx, dy = (Math.floor(i / S) + 0.5 - cy) / ry; if (dx * dx + dy * dy <= 1) this.cells[i] = null; }
    return this;
  }
  /** Painted detail laid over the shading: a tone shift (dt), a fixed tone, or another material at a tone. */
  mark(x: number, y: number, m: Omit<Mark, 'x' | 'y'>) { this.marks.push({ x, y, ...m }); return this; }
  marks1(pts: readonly V2[], m: Omit<Mark, 'x' | 'y'>) { for (const [x, y] of pts) this.mark(x, y, m); return this; }
  /** Every pixel a straight line passes through, for engraved details (a blade's fuller, a seam). */
  markLine(a: V2, b: V2, m: Omit<Mark, 'x' | 'y'>) {
    const n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2 + 1, seen = new Set<number>();
    for (let i = 0; i <= n; i++) { const x = Math.floor(a[0] + ((b[0] - a[0]) * i) / n), y = Math.floor(a[1] + ((b[1] - a[1]) * i) / n), k = y * S + x; if (!seen.has(k)) { seen.add(k); this.mark(x, y, m); } }
    return this;
  }
  get(x: number, y: number) { return x < 0 || y < 0 || x >= S || y >= S ? null : this.cells[y * S + x]; }
}

export const SIZE = S;
export { materials };
