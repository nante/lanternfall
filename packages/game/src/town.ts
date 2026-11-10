import { type Building, type Floor, type MapData, type NpcSpawn, type Place, type Pos, type Spawn, G, T, key } from './model.ts';

/** The original town is 84 wide; the east reach (x ≥ 84) holds example areas for the look and is generated from its own
 * random stream, so everything west of it is laid out exactly as before. */
const OLD_W = 84;
export const W = 104, H = 68;

function rng(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; }; }
export function hash2(x: number, y: number) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }
function smooth(x: number, y: number, scale: number) {
  const fx = x / scale, fy = y / scale, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
  return a + (b - a) * s(tx) + (c - a) * s(ty) + (a - b - c + d) * s(tx) * s(ty);
}

class Layer {
  readonly f: Floor;
  constructor(ground: number, thing: number) {
    this.f = { ground: new Uint8Array(W * H).fill(ground), thing: new Uint8Array(W * H).fill(thing), roof: new Int16Array(W * H).fill(-1) };
  }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < W && y < H; }
  g(x: number, y: number, v?: number) { if (!this.in(x, y)) return G.void; if (v !== undefined) this.f.ground[y * W + x] = v; return this.f.ground[y * W + x]; }
  t(x: number, y: number, v?: number) { if (!this.in(x, y)) return T.cavewall; if (v !== undefined) this.f.thing[y * W + x] = v; return this.f.thing[y * W + x]; }
  rect(x0: number, y0: number, x1: number, y1: number, fn: (x: number, y: number) => void) { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.in(x, y)) fn(x, y); }
}

export function buildTown(): MapData {
  const r = rng(7741);
  const s = new Layer(G.grass, T.none);
  const u = new Layer(G.stone, T.cavewall);
  const buildings: Building[] = [];
  const npcs: NpcSpawn[] = [];
  const spawns: Spawn[] = [];
  const links: Record<string, Pos> = {};

  // Meadow and dirt texture across the countryside.
  s.rect(0, 0, W - 1, H - 1, (x, y) => {
    const n = smooth(x, y, 7), m = smooth(x + 40, y + 9, 4);
    if (n > 0.62) s.g(x, y, G.meadow);
    else if (m > 0.8) s.g(x, y, G.dirt);
  });

  // River along the north with sandy banks.
  for (let x = 0; x < W; x++) {
    const c = 5 + Math.round(Math.sin(x / 9) * 1.6 + Math.sin(x / 3.7) * 0.6);
    for (let y = c - 2; y <= c + 2; y++) s.g(x, y, G.water);
    s.g(x, c - 3, G.sand); s.g(x, c + 3, G.sand);
    if (hash2(x, 3) > 0.5) s.g(x, c + 4, G.sand);
  }

  // Town walls.
  const wx0 = 12, wy0 = 13, wx1 = 71, wy1 = 54;
  s.rect(wx0, wy0, wx1, wy1, (x, y) => { if (x === wx0 || x === wx1 || y === wy0 || y === wy1) { s.t(x, y, T.rampart); s.g(x, y, G.flagstone); } else if (s.g(x, y) === G.meadow && hash2(x, y) > 0.3) s.g(x, y, G.grass); });

  // Roads.
  for (let y = 0; y < H; y++) for (let x = 39; x <= 42; x++) {
    if (s.g(x, y) === G.water) { s.g(x, y, G.plank); continue; }
    const inside = y > wy0 - 1 && y < wy1 + 1;
    const edge = x === 39 || x === 42;
    s.g(x, y, inside ? (edge ? (hash2(x, y) > 0.7 ? G.grass : G.dirt) : G.cobble) : edge && hash2(x, y) > 0.55 ? G.grass : G.dirt);
    if (y === wy0 || y === wy1) s.t(x, y, T.none);
  }
  for (const yy of [wy0, wy1]) for (const x of [38, 43]) s.t(x, yy, T.rampart);
  // Bridge rails.
  for (let y = 0; y < 13; y++) if (s.g(39, y) === G.plank) { s.t(38, y, T.fence); s.t(43, y, T.fence); s.g(38, y, G.plank); s.g(43, y, G.plank); }
  s.rect(wx0 + 1, 31, wx1 - 1, 33, (x, y) => { if (x >= 39 && x <= 42) return; s.g(x, y, y === 32 ? G.cobble : hash2(x, y) > 0.75 ? G.grass : G.dirt); });
  // Market green: a flagstone ring around the well, dirt worn into the grass around it.
  s.rect(32, 24, 49, 40, (x, y) => {
    const d = Math.hypot(x - 40.5, (y - 30) * 1.1);
    if (d < 4.6) s.g(x, y, G.flagstone);
    else if (d < 6.2 + hash2(x, y) * 1.2) s.g(x, y, hash2(x * 3, y) > 0.3 ? G.dirt : G.grass);
    else if (x < 39 || x > 42) s.g(x, y, smooth(x, y, 3) > 0.55 ? G.meadow : G.grass);
  });
  // Dirt lanes.
  s.rect(58, 33, 60, wy1 - 1, (x, y) => s.g(x, y, hash2(x, y) > 0.2 ? G.dirt : G.grass));
  s.rect(22, 33, 24, 37, (x, y) => s.g(x, y, G.dirt));
  s.rect(22, 24, 24, 30, (x, y) => s.g(x, y, G.dirt));
  s.rect(33, 21, 35, 24, (x, y) => s.g(x, y, G.dirt));
  s.rect(54, 23, 56, 30, (x, y) => s.g(x, y, G.dirt));
  s.rect(48, 40, 50, 46, (x, y) => s.g(x, y, G.dirt));

  const house = (name: string, x0: number, y0: number, x1: number, y1: number, door: [number, number], roof: Building['roof'], wall: Building['wall'], pz = false) => {
    const id = buildings.length;
    buildings.push({ id, name, x0, y0, x1, y1, roof, wall, pz });
    s.rect(x0, y0, x1, y1, (x, y) => {
      s.f.roof[y * W + x] = id;
      s.g(x, y, wall === 'stone' ? G.flagstone : G.plank);
      s.t(x, y, x === x0 || x === x1 || y === y0 || y === y1 ? T.wall : T.none);
    });
    s.t(door[0], door[1], T.door);
    return id;
  };

  house('Shrine of the Lantern', 17, 16, 28, 25, [22, 25], 'teal', 'stone', true);
  s.t(22, 18, T.altar); s.t(19, 18, T.brazier); s.t(26, 18, T.brazier);
  for (const y of [21, 23]) { s.t(19, y, T.pillar); s.t(26, y, T.pillar); }
  npcs.push({ id: 'wren', name: 'Sister Wren', role: 'shrine', look: 'robe', x: 22, y: 19, z: 0 });

  house('Vault', 30, 16, 36, 21, [34, 21], 'slate', 'stone', true);
  for (let x = 31; x <= 35; x++) s.t(x, 17, T.vault);

  house('Emberforge', 50, 15, 60, 23, [55, 23], 'slate', 'timber');
  s.t(57, 18, T.anvil); s.t(52, 17, T.shelf); s.t(53, 17, T.shelf); s.t(58, 17, T.brazier);
  for (let x = 51; x <= 54; x++) s.t(x, 20, T.counter);
  npcs.push({ id: 'brann', name: 'Brann', role: 'smith', look: 'apron', x: 53, y: 19, z: 0 });
  s.t(61, 20, T.crate); s.t(61, 21, T.barrel); s.t(49, 22, T.barrel);

  house('The Copper Kettle', 15, 38, 27, 47, [23, 38], 'clay', 'timber');
  for (const [x, y] of [[18, 42], [18, 45], [23, 43], [23, 46]]) s.t(x, y, T.table);
  for (let x = 16; x <= 20; x++) s.t(x, 40, T.counter);
  s.t(26, 39, T.barrel); s.t(26, 40, T.barrel);
  npcs.push({ id: 'mabel', name: 'Mabel', role: 'inn', look: 'dress', x: 18, y: 39, z: 0 });

  house("Odo's Apothecary", 50, 36, 57, 43, [54, 36], 'teal', 'plaster');
  for (let x = 51; x <= 56; x++) s.t(x, 42, T.shelf);
  for (let x = 51; x <= 54; x++) s.t(x, 39, T.counter);
  npcs.push({ id: 'odo', name: 'Odo', role: 'apothecary', look: 'coat', x: 53, y: 40, z: 0 });

  house("Pell's Provisions", 44, 47, 52, 52, [49, 47], 'thatch', 'timber');
  for (let x = 45; x <= 48; x++) s.t(x, 50, T.counter);
  s.t(51, 51, T.crate); s.t(51, 50, T.crate); s.t(45, 51, T.barrel);
  npcs.push({ id: 'pell', name: 'Pell', role: 'store', look: 'vest', x: 46, y: 49, z: 0 });

  house('Weaver cottage', 27, 41, 33, 46, [30, 41], 'thatch', 'plaster');
  s.t(28, 45, T.bed); s.t(32, 43, T.table);
  house('Lamplighter house', 61, 25, 68, 30, [64, 30], 'clay', 'plaster');
  s.t(62, 26, T.bed); s.t(67, 28, T.shelf);
  house('Old granary', 14, 26, 20, 30, [17, 30], 'thatch', 'timber');
  for (const [x, y] of [[15, 27], [16, 27], [15, 28], [19, 27]]) s.t(x, y, T.crate);

  // Gatehouse towers.
  for (const tx of [35, 44]) {
    const id = house('Gate tower', tx, wy1 - 2, tx + 2, wy1 + 1, [tx + 1, wy1 - 2], 'slate', 'stone');
    s.t(tx + 1, wy1 - 2, T.wall);
    s.rect(tx, wy1 - 2, tx + 2, wy1 + 1, (x, y) => s.t(x, y, T.wall));
    buildings[id].name = 'South gate';
  }
  npcs.push({ id: 'corin', name: 'Warden Corin', role: 'warden', look: 'guard', x: 38, y: wy1 - 2, z: 0 });

  // Market square details.
  s.t(40, 29, T.well);
  for (const [x, y] of [[33, 25], [48, 25], [33, 39], [48, 39], [38, 20], [43, 20], [38, 45], [43, 45], [38, 50], [43, 50], [28, 32], [53, 32], [18, 32], [63, 32], [43, 15], [38, 15]]) s.t(x, y, T.lamp);
  for (const [x, y] of [[45, 27], [46, 27], [45, 28], [35, 37], [36, 37]]) s.t(x, y, T.crate);
  for (const [x, y] of [[47, 28], [34, 36]]) s.t(x, y, T.barrel);

  // Gardens with fences inside walls.
  const garden = (x0: number, y0: number, x1: number, y1: number, gate: [number, number]) => {
    s.rect(x0, y0, x1, y1, (x, y) => {
      if (x === x0 || x === x1 || y === y0 || y === y1) s.t(x, y, T.fence);
      else { s.g(x, y, (y - y0) % 2 ? G.dirt : G.meadow); if ((y - y0) % 2 === 0 && hash2(x, y) > 0.4) s.t(x, y, T.flowers); }
    });
    s.t(gate[0], gate[1], T.none);
  };
  garden(62, 36, 69, 43, [62, 39]);
  garden(29, 48, 34, 52, [31, 48]);

  // Undercroft hatch in the east lane.
  s.rect(63, 46, 68, 51, (x, y) => { s.g(x, y, G.dirt); if (x === 63 || x === 68 || y === 51) s.t(x, y, T.fence); });
  s.t(63, 48, T.none);
  s.t(65, 48, T.hatch);
  s.t(67, 46, T.lamp);

  // Trees, bushes and flowers.
  // x ≥ OLD_W counts as occupied, as it did when the map ended there, so the original scatter is unchanged.
  const occupied = (x: number, y: number) => x >= OLD_W || s.t(x, y) !== T.none || [G.water, G.cobble, G.plank, G.flagstone, G.sand].includes(s.g(x, y)) || (x >= 38 && x <= 43);
  const clear = (x: number, y: number, rad: number) => { for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) if (occupied(x + dx, y + dy) && !(dx === 0 && dy === 0 && !occupied(x, y))) return false; return !occupied(x, y); };
  for (let y = 0; y < H; y++) for (let x = 0; x < OLD_W; x++) {
    const inside = x >= wx0 && x <= wx1 && y >= wy0 && y <= wy1;
    const forest = smooth(x + 100, y + 30, 6);
    const p = r();
    if (!inside) {
      const nearWall = x > wx0 - 3 && x < wx1 + 3 && y > wy0 - 3 && y < wy1 + 3;
      if (nearWall) { if (p < 0.03 && clear(x, y, 0)) s.t(x, y, T.bush); continue; }
      if (forest > 0.55 && p < 0.42 && clear(x, y, 1)) s.t(x, y, y < 12 || forest > 0.72 ? T.pine : T.tree);
      else if (p < 0.05 && clear(x, y, 0)) s.t(x, y, T.bush);
      else if (p < 0.08 && clear(x, y, 0)) s.t(x, y, T.rock);
      else if (p < 0.2 && !occupied(x, y) && s.g(x, y) !== G.dirt) s.t(x, y, T.flowers);
    } else if (s.f.roof[y * W + x] === -1) {
      if (s.g(x, y) === G.grass || s.g(x, y) === G.meadow) {
        if (p < 0.035 && clear(x, y, 1)) s.t(x, y, T.tree);
        else if (p < 0.06 && clear(x, y, 0)) s.t(x, y, T.bush);
        else if (p < 0.13 && !occupied(x, y)) s.t(x, y, T.flowers);
      }
    }
  }
  // The meadow south of the gate: open hunting ground with stumps.
  s.rect(26, 57, 58, 67, (x, y) => { if (s.t(x, y) === T.tree || s.t(x, y) === T.pine) s.t(x, y, r() < 0.3 ? T.stump : T.none); });
  for (const [x, y] of [[30, 60], [36, 63], [47, 59], [53, 64], [44, 65], [33, 66]]) spawns.push({ kind: 'thornboar', x, y, z: 0 });

  // --- East reach ----------------------------------------------------------
  // Two small example areas for the look, kept small on purpose (the map gets its own pass later):
  // Whisperwood, an old wood with a winding path under the canopy, and the Fallen chapel, a ruin on the rise above it.
  const re = rng(9133);
  const path = new Set<string>();
  {
    // The path enters from the meadow at the south edge and winds north to the chapel door.
    let px = 92;
    for (let y = 63; y >= 26; y--) {
      // The last stretch bends to the chapel door (x 93–94).
      px = y <= 34 ? px + Math.sign(93 - px) : Math.max(86, Math.min(100, px + Math.round(Math.sin(y / 4.3) * 1.2)));
      for (const dx of [0, 1]) { path.add(`${px + dx},${y}`); s.g(px + dx, y, G.dirt); }
    }
  }
  // The chapel: flagstone floor, a broken outline of walls with gaps, two rows of pillars (some fallen), and fallen stone where an altar stood.
  const cx0 = 87, cy0 = 14, cx1 = 99, cy1 = 25;
  s.rect(cx0, cy0, cx1, cy1, (x, y) => {
    s.g(x, y, hash2(x * 3, y * 7) > 0.25 ? G.flagstone : G.grass);
    const edge = x === cx0 || x === cx1 || y === cy0 || y === cy1;
    const door = y === cy1 && (x === 93 || x === 94);
    if (edge && !door && hash2(x * 5, y * 11) > 0.3) s.t(x, y, T.wall);
  });
  for (const y of [17, 20, 23]) for (const x of [90, 96]) s.t(x, y, re() < 0.7 ? T.pillar : T.rock);
  // No altar: altars are permanent lights in the rule, and this reach must not change play. A fallen stone in its place.
  s.t(93, 15, T.rock);
  for (let i = 0; i < 14; i++) {
    const x = cx0 - 2 + Math.floor(re() * (cx1 - cx0 + 5)), y = cy0 - 2 + Math.floor(re() * (cy1 - cy0 + 6));
    if (s.in(x, y) && s.t(x, y) === T.none && !path.has(`${x},${y}`) && !(x > cx0 && x < cx1 && y > cy0 && y < cy1 && (x === 93 || x === 94))) s.t(x, y, T.rock);
  }
  // Whisperwood: dense old trees with pines among them, the path kept clear, flowers in the small clearings.
  for (let y = 0; y < H; y++) for (let x = OLD_W; x < W; x++) {
    const p = re();
    if (s.g(x, y) === G.water || s.g(x, y) === G.sand || s.t(x, y) !== T.none || path.has(`${x},${y}`)) continue;
    if (x >= cx0 - 1 && x <= cx1 + 1 && y >= cy0 - 1 && y <= cy1 + 1) continue;
    const nearPath = path.has(`${x - 1},${y}`) || path.has(`${x + 1},${y}`);
    const wood = y >= 28 && y <= 62;
    if (wood && !nearPath && p < 0.5) s.t(x, y, re() < 0.25 ? T.pine : T.tree);
    else if (wood && p < 0.58) s.t(x, y, T.bush);
    else if (!wood && p < 0.12) s.t(x, y, y < 12 ? T.pine : T.tree);
    else if (p < 0.7 && s.g(x, y) !== G.dirt) { if (re() < 0.25) s.t(x, y, T.flowers); }
  }

  // --- Undercroft ---------------------------------------------------------
  const carve = (x: number, y: number) => { if (x > 0 && y > 0 && x < W - 1 && y < H - 1) { u.t(x, y, T.none); u.g(x, y, smooth(x, y, 3) > 0.62 ? G.moss : G.stone); } };
  const room = (cx: number, cy: number, rx: number, ry: number) => {
    for (let y = cy - ry - 1; y <= cy + ry + 1; y++) for (let x = cx - rx - 1; x <= cx + rx + 1; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d < 1 + (hash2(x * 3, y * 5) - 0.5) * 0.5) carve(x, y);
    }
  };
  const tunnel = (ax: number, ay: number, bx: number, by: number, width = 1) => {
    let x = ax, y = ay, guard = 0;
    while ((x !== bx || y !== by) && guard++ < 400) {
      for (let dy = -width; dy <= width; dy++) for (let dx = -width; dx <= width; dx++) if (Math.abs(dx) + Math.abs(dy) <= width + (hash2(x + dx, y + dy) > 0.6 ? 1 : 0)) carve(x + dx, y + dy);
      if (r() < 0.62) x += Math.sign(bx - x) || 0; else y += Math.sign(by - y) || 0;
      if (r() < 0.15) y += r() < 0.5 ? -1 : 1;
      x = Math.max(2, Math.min(W - 3, x)); y = Math.max(2, Math.min(H - 3, y));
    }
  };
  room(65, 48, 3, 2);
  room(55, 46, 5, 3);
  tunnel(65, 48, 55, 46);
  room(44, 50, 4, 3);
  tunnel(55, 46, 44, 50);
  room(34, 44, 7, 5);
  tunnel(44, 50, 34, 44);
  room(22, 50, 5, 4);
  tunnel(34, 44, 22, 50);
  room(30, 30, 5, 4);
  tunnel(34, 44, 30, 30);
  room(18, 24, 6, 5);
  tunnel(30, 30, 18, 24, 1);
  room(42, 26, 4, 3);
  tunnel(30, 30, 42, 26);
  room(54, 30, 4, 3);
  tunnel(42, 26, 54, 30);
  // Underground pools and features.
  for (const [cx, cy] of [[34, 45], [18, 25]]) u.rect(cx - 1, cy - 1, cx + 1, cy, (x, y) => { if (u.t(x, y) === T.none && hash2(x, y) > 0.25) u.g(x, y, G.water); });
  u.rect(1, 1, W - 2, H - 2, (x, y) => { if (u.t(x, y) === T.none && u.g(x, y) !== G.water && hash2(x * 7, y * 3) > 0.94) u.t(x, y, T.rock); });
  u.t(65, 48, T.ladder);
  for (const [x, y] of [[57, 44], [41, 50], [37, 41], [21, 47], [29, 28], [16, 22], [53, 29]]) if (u.t(x, y) === T.none) u.t(x, y, T.brazier);
  links[key({ x: 65, y: 48, z: 0 })] = { x: 64, y: 48, z: 1 };
  links[key({ x: 65, y: 48, z: 1 })] = { x: 64, y: 48, z: 0 };
  for (const [kind, pts] of [
    ['gutterRat', [[55, 45], [57, 47], [53, 46], [45, 50], [43, 49], [60, 46]]],
    ['caveBeetle', [[32, 43], [36, 46], [30, 45], [38, 43], [21, 49], [24, 51]]],
    ['mireGrub', [[18, 23], [21, 26], [15, 25], [30, 30], [42, 26], [54, 30]]],
  ] as const) for (const [x, y] of pts) spawns.push({ kind, x, y, z: 1 });

  for (const sp of spawns) { const l = sp.z ? u : s; if (l.t(sp.x, sp.y) !== T.ladder) l.t(sp.x, sp.y, T.none); if (l.g(sp.x, sp.y) === G.water) l.g(sp.x, sp.y, G.stone); }

  const places: Place[] = [
    { name: 'Shrine of the Lantern', x0: 17, y0: 16, x1: 28, y1: 25, z: 0 },
    { name: 'Market square', x0: 33, y0: 25, x1: 48, y1: 39, z: 0 },
    { name: 'Emberforge', x0: 50, y0: 15, x1: 60, y1: 23, z: 0 },
    { name: 'The Copper Kettle', x0: 15, y0: 38, x1: 27, y1: 47, z: 0 },
    { name: "Odo's Apothecary", x0: 50, y0: 36, x1: 57, y1: 43, z: 0 },
    { name: "Pell's Provisions", x0: 44, y0: 47, x1: 52, y1: 52, z: 0 },
    { name: 'Vault', x0: 30, y0: 16, x1: 36, y1: 21, z: 0 },
    { name: 'Thornboar meadow', x0: 0, y0: 55, x1: W - 1, y1: H - 1, z: 0 },
    { name: 'North bridge', x0: 30, y0: 0, x1: 52, y1: 12, z: 0 },
    { name: 'Fallen chapel', x0: 85, y0: 12, x1: 101, y1: 27, z: 0 },
    { name: 'Whisperwood', x0: OLD_W, y0: 28, x1: W - 1, y1: 62, z: 0 },
    { name: 'Lanternfall', x0: wx0, y0: wy0, x1: wx1, y1: wy1, z: 0 },
    { name: 'Wildwood', x0: 0, y0: 0, x1: W - 1, y1: H - 1, z: 0 },
    { name: 'Rat warrens', x0: 48, y0: 40, x1: 70, y1: 54, z: 1 },
    { name: 'Beetle hall', x0: 18, y0: 38, x1: 47, y1: 56, z: 1 },
    { name: 'Grub pits', x0: 8, y0: 14, x1: 60, y1: 36, z: 1 },
    { name: 'Undercroft', x0: 0, y0: 0, x1: W - 1, y1: H - 1, z: 1 },
  ];

  return { name: 'Lanternfall', width: W, height: H, floors: [s.f, u.f], buildings, links, npcs, spawns, places, shrine: { x: 22, y: 22, z: 0 }, vault: { x: 33, y: 18, z: 0 } };
}

export function placeAt(map: MapData, p: Pos) { return map.places.find(pl => pl.z === p.z && p.x >= pl.x0 && p.x <= pl.x1 && p.y >= pl.y0 && p.y <= pl.y1)?.name ?? map.name; }
