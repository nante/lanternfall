import { type MapData, type Pos, type State, G, T, key, distance, thingBlocks } from './model.ts';
import { lightPasses } from './light.ts';
import { GameError } from './errors.ts';

export class Geography {
  private readonly npcTiles: Set<string>;
  constructor(readonly data: MapData) { this.npcTiles = new Set(data.npcs.map(n => key(n))); }
  index(p: Pos) { return p.x >= 0 && p.y >= 0 && p.x < this.data.width && p.y < this.data.height && this.data.floors[p.z] ? p.y * this.data.width + p.x : -1; }
  ground(p: Pos) { const i = this.index(p); return i < 0 ? G.void : this.data.floors[p.z].ground[i]; }
  thing(p: Pos) { const i = this.index(p); return i < 0 ? T.cavewall : this.data.floors[p.z].thing[i]; }
  roof(p: Pos) { const i = this.index(p); return i < 0 ? -1 : this.data.floors[p.z].roof[i]; }
  door(p: Pos) { return this.thing(p) === T.door; }
  /** Protection zone: inside a building flagged pz (the shrine, the vault). */
  pz(p: Pos) { const r = this.roof(p); return p.z === 0 && r >= 0 && !!this.data.buildings[r]?.pz; }
  blocked(p: Pos, state?: State, allowDoors = false) {
    const g = this.ground(p);
    if (g === G.void || g === G.water || this.npcTiles.has(key(p))) return true;
    const t = this.thing(p);
    if (t === T.door) return !allowDoors && !state?.doors[key(p)];
    return thingBlocks(t);
  }
  stepAllowed(a: Pos, b: Pos, state?: State, allowDoors = false) {
    if (a.z !== b.z || distance(a, b) !== 1 || this.blocked(b, state, allowDoors)) return false;
    if (a.x !== b.x && a.y !== b.y) return !this.blocked({ ...a, x: b.x }, state, allowDoors) && !this.blocked({ ...a, y: b.y }, state, allowDoors);
    return true;
  }
  path(from: Pos, to: Pos, state?: State, limit = 4000, avoid?: (p: Pos) => boolean): Pos[] {
    if (from.z !== to.z || this.blocked(to, state, true)) return [];
    const start = key(from), goal = key(to);
    const open: { p: Pos; g: number; f: number }[] = [{ p: from, g: 0, f: distance(from, to) }];
    const scores = new Map([[start, 0]]), parents = new Map<string, Pos>();
    let count = 0;
    while (open.length && count++ < limit) {
      let best = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[best].f) best = i;
      const current = open.splice(best, 1)[0];
      if (key(current.p) === goal) {
        const path: Pos[] = [];
        let p = to;
        while (key(p) !== start) { path.push(p); const prev = parents.get(key(p)); if (!prev) return []; p = prev; }
        return path.reverse();
      }
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        const next = { x: current.p.x + dx, y: current.p.y + dy, z: from.z };
        if (!this.stepAllowed(current.p, next, state, true)) continue;
        const k = key(next);
        if (k !== goal && avoid?.(next)) continue;
        const g = current.g + (dx && dy ? 3 : 1); // diagonal steps take three times as long
        if (g >= (scores.get(k) ?? Infinity)) continue;
        scores.set(k, g); parents.set(k, current.p);
        open.push({ p: next, g, f: g + distance(next, to) });
      }
    }
    return [];
  }
  near(p: Pos, taken: (q: Pos) => boolean = () => false) {
    for (let r = 0; r < 8; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const q = { x: p.x + dx, y: p.y + dy, z: p.z };
      if (!this.blocked(q) && !taken(q)) return q;
    }
    throw new GameError('There is no free tile nearby.');
  }
  /** Line of sight on one floor: walls, trees and closed doors between the two tiles block it, the same rays light takes. */
  sight(a: Pos, b: Pos, doors: Record<string, boolean>) { return lightPasses(this.data, a, b, doors); }
}
