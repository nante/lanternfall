import * as THREE from 'three';
import { type MapData, T } from '../../../../packages/game/src/model.ts';
import { BLUE_MINUTE, CYCLE_MINUTES, RIPPLE_MS_PER_TILE, lampDistance, lamps, type LightSource, type WorldLight } from '../../../../packages/game/src/light.ts';
import { hash2 } from '../../../../packages/game/src/town.ts';
import { PX } from './stops.ts';
import { ramps } from './palette.ts';
import type { Key } from './clock-style.ts';

// Pixel art for the small lights, drawn as character grids. '.' is transparent.
const art = {
  wisp: ['..c..', '.bab.', 'cabac', '.bab.', '..c..'],
  wispDim: ['.....', '..b..', '.bab.', '..b..', '.....'],
  ember: ['..d..', '.dfd.', 'dfgfd', '.dfd.', '..d..'],
  glow: ['...cc...', '..cbbc..', '.cbaabc.', 'cbaaaabc', 'cbaaaabc', '.cbaabc.', '..cbbc..', '...cc...'],
};
const legend: Record<string, string> = { a: ramps.lantern[4], b: ramps.lantern[3], c: ramps.lantern[2], d: ramps.fire[3], f: ramps.fire[5], g: ramps.fire[6] };
function pixelTexture(rows: string[]) {
  const w = rows[0].length, h = rows.length, data = new Uint8Array(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    // sRGB texture: store the hex's sRGB bytes as they are (THREE.Color returns linear values, decoded twice otherwise).
    const hx = legend[ch], o = ((h - 1 - y) * w + x) * 4;
    data[o] = parseInt(hx.slice(1, 3), 16); data[o + 1] = parseInt(hx.slice(3, 5), 16); data[o + 2] = parseInt(hx.slice(5, 7), 16); data[o + 3] = 255;
  }));
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return { tex: t, w, h };
}
/** A sprite whose texels land 1:1 on render pixels. */
function pixelSprite(rows: string[], opacity = 1) {
  const { tex, w, h } = pixelTexture(rows);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, alphaTest: 0.5, opacity, depthWrite: false, fog: false }));
  s.scale.set(w / PX, h / PX, 1);
  return s;
}
const snap = (v: number) => Math.round(v * PX) / PX;

/**
 * The fable layer on the surface: wisps that carry fire from the Lantern to the lamps at blue hour and fly home at
 * dawn, the Lantern's breath, wild wisps where the rule puts them, lit windows, fireflies and moths.
 * Decoration only: the light itself comes from light.ts through the field.
 */
export class Ambience {
  readonly group = new THREE.Group();
  private readonly lampPos: { x: number; y: number; d: number }[];
  private readonly lampWisps: THREE.Sprite[];
  private readonly wild: THREE.Sprite[] = [];
  private readonly lantern: THREE.Sprite;
  private readonly keeper: THREE.Sprite;
  private readonly windows: THREE.InstancedMesh;
  private readonly windowGate: number[] = [];
  private readonly flies: THREE.Points;
  private readonly fliesHome: THREE.Vector3[] = [];
  private readonly moths: THREE.Points;
  private readonly shrine: THREE.Vector3;
  private litWindows = -1;

  constructor(readonly map: MapData, anchor?: THREE.Vector3) {
    this.shrine = anchor?.clone() ?? new THREE.Vector3(map.shrine.x, 2.6, map.shrine.y);
    const ls = lamps(map).filter(p => p.z === 0);
    this.lampPos = ls.map(p => ({ x: p.x + 0.3, y: p.y, d: lampDistance(map, p) }));
    this.lampWisps = this.lampPos.map(() => { const s = pixelSprite(art.wisp); s.visible = false; this.group.add(s); return s; });
    for (let i = 0; i < 3; i++) { const s = pixelSprite(art.wisp); s.visible = false; this.wild.push(s); this.group.add(s); }
    this.lantern = pixelSprite(art.glow, 0.9); this.lantern.position.copy(this.shrine); this.group.add(this.lantern);
    this.keeper = pixelSprite(art.wispDim); this.group.add(this.keeper);

    // Windows on south walls, the side the camera sees. Each has its own dusk threshold so a street lights unevenly.
    const spots: THREE.Matrix4[] = [];
    for (const b of map.buildings) {
      if (b.name === 'South gate') continue;
      for (let x = b.x0 + 1; x < b.x1; x += 2) {
        if (map.floors[0].thing[b.y1 * map.width + x] !== T.wall) continue;
        spots.push(new THREE.Matrix4().makeTranslation(x, 1.15, b.y1 + 0.505));
        this.windowGate.push(0.15 + hash2(x * 3, b.y1 * 5) * 0.8);
      }
    }
    const win = new THREE.PlaneGeometry(8 / PX, 10 / PX);
    this.windows = new THREE.InstancedMesh(win, new THREE.MeshBasicMaterial({ color: '#ffffff', fog: false }), Math.max(1, spots.length));
    this.windows.count = spots.length;
    spots.forEach((m, i) => { this.windows.setMatrixAt(i, m); this.windows.setColorAt(i, new THREE.Color(ramps.night[2])); });
    this.group.add(this.windows);

    // Fireflies over the meadow at dusk, moths around lit lamps.
    const pts = (n: number, color: string) => {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      return new THREE.Points(g, new THREE.PointsMaterial({ color, size: 1, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    };
    this.flies = pts(48, ramps.olive[5]);
    for (let i = 0; i < 48; i++) this.fliesHome.push(new THREE.Vector3(14 + hash2(i, 7) * 56, 0.3 + hash2(i, 3) * 0.7, 56 + hash2(i, 11) * 11));
    this.moths = pts(this.lampPos.length * 2, ramps.bone[1]);
    this.group.add(this.flies, this.moths);
  }

  /** Called each frame with the rule's clock state and the sources it produced. */
  update(t: number, time: number, world: WorldLight, sources: LightSource[], key: Key) {
    const day = ((time + world.dayOffset) % world.dayMs + world.dayMs) % world.dayMs;
    const blue = world.dayMs * BLUE_MINUTE / CYCLE_MINUTES, ripple = RIPPLE_MS_PER_TILE, maxD = Math.max(0, ...this.lampPos.map(l => l.d));
    const lift = (k: number) => Math.sin(Math.PI * k) * 1.6;
    // Outbound at blue hour: every wisp leaves the Lantern together and lands on its lamp at the rule's ignite time.
    // Homebound at dawn: each leaves its lamp at the rule's extinguish time.
    this.lampPos.forEach((l, i) => {
      const s = this.lampWisps[i], flight = ripple * Math.max(1, l.d);
      const out = (day - blue) / flight, home = (day - (maxD - l.d) * ripple) / flight;
      const lampHead = new THREE.Vector3(l.x, 1.75, l.y);
      let k = -1, from = this.shrine, to = lampHead;
      if (out >= 0 && out < 1) k = out;
      else if (home >= 0 && home < 1 && day < blue) { k = home; from = lampHead; to = this.shrine; }
      s.visible = k >= 0;
      if (k >= 0) { const p = from.clone().lerp(to, k); p.y += lift(k); s.position.set(snap(p.x), snap(p.y), snap(p.z)); }
    });
    // Wild wisps glide towards the tile the rule gives them and bob by whole pixels.
    const wild = sources.filter(s => s.id.startsWith('wisp:'));
    this.wild.forEach((s, i) => {
      const src = wild[i]; s.visible = !!src; if (!src) return;
      const goal = new THREE.Vector3(src.x, 0.7 + Math.round(Math.sin(t * 2.1 + i) * 2) / PX, src.y);
      if (s.position.distanceTo(goal) > 3) s.position.copy(goal); else s.position.lerp(goal, 0.06);
      s.position.set(snap(s.position.x), snap(s.position.y), snap(s.position.z));
    });
    // The Lantern breathes on a 6 s cycle in two palette steps; one wisp keeps it company all night.
    const night = key.windows;
    this.lantern.visible = night > 0.05;
    (this.lantern.material as THREE.SpriteMaterial).opacity = 0.55 + 0.35 * (Math.sin(t * Math.PI / 3) > 0 ? 1 : 0.4);
    this.keeper.visible = night > 0.6;
    this.keeper.position.set(snap(this.shrine.x + Math.cos(t * 0.7) * 1.3), snap(this.shrine.y + 0.4 + Math.sin(t * 1.3) * 0.15), snap(this.shrine.z + Math.sin(t * 0.7) * 0.8));
    // Windows: a lit window is warm amber; the share of lit windows follows the keyframe.
    const lit = Math.round(night * 20);
    if (lit !== this.litWindows) {
      this.litWindows = lit;
      this.windowGate.forEach((g, i) => this.windows.setColorAt(i, new THREE.Color(night > g ? (g > 0.7 ? ramps.fire[4] : ramps.fire[5]) : ramps.night[3])));
      if (this.windows.instanceColor) this.windows.instanceColor.needsUpdate = true;
    }
    // Fireflies: dusk and early night only.
    const dusk = Math.max(0, 1 - Math.abs(day / world.dayMs * 40 - 27) / 2.2);
    (this.flies.material as THREE.PointsMaterial).opacity = dusk;
    this.flies.visible = dusk > 0.02;
    if (this.flies.visible) {
      const a = this.flies.geometry.attributes.position as THREE.BufferAttribute;
      this.fliesHome.forEach((h, i) => { const on = Math.sin(t * (1.7 + hash2(i, 1)) + i) > 0.2; a.setXYZ(i, snap(h.x + Math.sin(t * 0.4 + i) * 0.8), on ? snap(h.y + Math.sin(t * 0.9 + i * 2) * 0.2) : -9, snap(h.z + Math.cos(t * 0.33 + i) * 0.6)); });
      a.needsUpdate = true;
    }
    // Moths circle the lamps that are lit.
    const litLamps = new Set(sources.filter(s => s.id.startsWith('lamp:')).map(s => `${s.x},${s.y}`));
    const m = this.moths.geometry.attributes.position as THREE.BufferAttribute;
    this.lampPos.forEach((l, i) => { for (let k = 0; k < 2; k++) { const on = litLamps.has(`${Math.round(l.x - 0.3)},${l.y}`); const a = t * (2.3 + k) + i; m.setXYZ(i * 2 + k, snap(l.x + Math.cos(a) * 0.3), on ? snap(1.8 + Math.sin(a * 1.7) * 0.12) : -9, snap(l.y + Math.sin(a) * 0.22)); } });
    m.needsUpdate = true;
    (this.moths.material as THREE.PointsMaterial).opacity = night > 0.3 ? 1 : 0;
  }
}

// A carried torch: three flame frames swapped at ~9 fps, drawn at the hero's hand.
const flameFrames = [
  ['..g..', '.gfg.', '.ffd.', '.dfd.', '..d..'],
  ['.g...', '.gg..', '.fff.', '.dfd.', '..d..'],
  ['...g.', '..gg.', '.fgf.', '.dfd.', '..d..'],
];
export class TorchFlame {
  readonly sprite: THREE.Sprite;
  private readonly frames = flameFrames.map(f => pixelTexture(f).tex);
  constructor() { this.sprite = pixelSprite(flameFrames[0]); this.sprite.visible = false; }
  update(t: number, at: THREE.Vector3 | null) {
    this.sprite.visible = !!at; if (!at) return;
    (this.sprite.material as THREE.SpriteMaterial).map = this.frames[Math.floor(t * 9) % 3];
    this.sprite.position.set(snap(at.x + 0.28), snap(1.05), snap(at.z + 0.02));
  }
}
