import * as THREE from 'three';
import { PX, stops } from './stops.ts';
import { ramps } from './palette.ts';
import { ACTOR_LAYER } from './figures/sprites.ts';

/** What the server sends for a creature you can sense but not see (BUILD-PLAN decision 10). */
export type Shade = { id: string; x: number; y: number; z: number; facing: number; size: number };

// Silhouettes by size, drawn as character grids; 's' is body, 'e' marks where the eyes sit. '.' is transparent.
const shapes: Record<number, string[]> = {
  1: ['..........', '..........', '...sss....', '.sssssse..', 'ssssssss..', '.s.s..s...'],
  2: ['....ssss......', '..sssssssss...', '.ssssssssssse.', 'ssssssssssssss', 'sssssssssssss.', '.ss.ss..ss.ss.', '.s...s...s..s.'],
  3: ['.....sssss.....', '...sssssssss...', '..sssssssssss..', '.ssssesssessss.', '.sssssssssssss.', 'sssssssssssssss', 'sssssssssssssss', '.sss.sssss.sss.', '.ss...sss...ss.', '.s.....s.....s.'],
};

function shapeTexture(rows: string[]) {
  const w = rows[0].length, h = rows.length, data = new Uint8Array(w * h * 4), body = new THREE.Color(ramps.night[1]);
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const o = ((h - 1 - y) * w + x) * 4;
    data[o] = Math.round(body.r * 255); data[o + 1] = Math.round(body.g * 255); data[o + 2] = Math.round(body.b * 255); data[o + 3] = 255;
  }));
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
  return { tex: t, w, h };
}

type Drawn = { root: THREE.Group; body: THREE.Mesh; eyes: THREE.Mesh[]; blinkAt: number; x: number; z: number; glideX: number; glideZ: number };

/**
 * Draws shades: a dark silhouette with two eye pixels in dim light, eyes alone in the dark. Eyes stay in the warm
 * part of the palette and ignore the night grade, so they read even when nothing else does.
 */
export class ShadeLayer {
  readonly group = new THREE.Group();
  private readonly drawn = new Map<string, Drawn>();
  private readonly eyeMat = new THREE.MeshBasicMaterial({ color: ramps.fire[5], fog: false, depthTest: true });
  private readonly eyeGeo = new THREE.PlaneGeometry(1 / PX, 1 / PX);

  sync(shades: Shade[], floor: number, levelAt: (x: number, y: number) => number) {
    const live = new Set<string>();
    for (const s of shades) {
      if (s.z !== floor) continue;
      live.add(s.id);
      let d = this.drawn.get(s.id);
      if (!d) {
        const { tex, w, h } = shapeTexture(shapes[s.size] ?? shapes[2]);
        const stretch = 1 / Math.cos(stops.play.pitch);
        const geo = new THREE.PlaneGeometry(w / PX, (h / PX) * stretch); geo.translate(0, (h / PX) * stretch / 2, 0);
        const body = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, transparent: false, fog: false }));
        const root = new THREE.Group(); root.add(body);
        const eyes = [0, 1].map(i => { const e = new THREE.Mesh(this.eyeGeo, this.eyeMat); e.position.set((i ? 1 : -1) * (1.5 / PX), (h - 2.5) / PX * stretch, 0.01); root.add(e); return e; });
        d = { root, body, eyes, blinkAt: performance.now() + 1500 + Math.random() * 3000, x: s.x, z: s.y, glideX: s.x, glideZ: s.y };
        root.position.set(s.x, 0, s.y);
        root.traverse(o => o.layers.set(ACTOR_LAYER));
        this.group.add(root); this.drawn.set(s.id, d);
      }
      // A jump the server made in one update (late or merged snapshots) snaps; a single step glides.
      if (Math.max(Math.abs(s.x - d.x), Math.abs(s.y - d.z)) > 1) { d.glideX = s.x; d.glideZ = s.y; }
      d.x = s.x; d.z = s.y;
      // Dim tiles show the shape; dark tiles show only the eyes.
      d.body.visible = levelAt(s.x, s.y) >= 1;
      // Eyes look along the creature's facing: shift by a pixel towards it.
      const fx = Math.round(Math.sin(s.facing)) / PX;
      d.eyes.forEach((e, i) => { e.position.x = (i ? 1 : -1) * (1.5 / PX) + fx; });
    }
    for (const [id, d] of this.drawn) if (!live.has(id)) { this.group.remove(d.root); this.drawn.delete(id); }
  }

  /** A click near a drawn shade resolves to its id; the server decides whether it may be targeted. */
  pick(clientX: number, clientY: number, screen: (v: THREE.Vector3) => { x: number; y: number }): string | undefined {
    let best: string | undefined, bestD = 24;
    for (const [id, d] of this.drawn) {
      const p = screen(new THREE.Vector3(d.x, 0.3, d.z)), dist = Math.hypot(clientX - p.x, clientY - p.y);
      if (dist < bestD) { bestD = dist; best = id; }
    }
    return best;
  }
  /** Where a shade is on the server: its tile. */
  tile(id: string) { const d = this.drawn.get(id); return d ? { x: d.x, y: d.z } : undefined; }

  private last = performance.now();
  frame() {
    const now = performance.now(), step = Math.min(1, (now - this.last) / 300) * 1.0; this.last = now;
    for (const d of this.drawn.values()) {
      // Move at about one tile per 300 ms towards the server tile, never past it.
      const dx = d.x - d.glideX, dz = d.z - d.glideZ, dist = Math.hypot(dx, dz);
      if (dist <= step) { d.glideX = d.x; d.glideZ = d.z; } else { d.glideX += (dx / dist) * step; d.glideZ += (dz / dist) * step; }
      d.root.position.set(Math.round(d.glideX * PX) / PX, 0, Math.round(d.glideZ * PX) / PX);
      // A blink every few seconds, 120 ms long.
      const blinking = now > d.blinkAt && now < d.blinkAt + 120;
      if (now > d.blinkAt + 120) d.blinkAt = now + 2500 + Math.random() * 3500;
      d.eyes.forEach(e => { e.visible = !blinking; });
    }
  }
}
