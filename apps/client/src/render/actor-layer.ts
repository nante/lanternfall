import * as THREE from 'three';
import { ACTOR_LAYER, SELF_LAYER } from './figures/sprites.ts';
import { type MapData, type GameView, type Pos, type Effect, type Worn, grounds } from '../../../../packages/game/src/model.ts';
import { defaultBalance, defaultRules as rules } from '../../../../packages/game/src/default-balance.ts';
import { corpseMesh } from './actors.ts';
import type { Key } from './clock-style.ts';
import { stops, PX } from './stops.ts';
import { bake, BakeJob, frameIndex, type Atlas, type Sheet } from './figures/bake.ts';
import { SpriteSheet, SpriteBody, setSpriteLight, spriteLight } from './figures/sprites.ts';
import { STRIKE, type AnimName } from './figures/poses.ts';
import { creatures, creatureFigure, heldFigure, heroFigureOf, identityOf, isCreature, isTownsfolk, plainHero, selfIdentity, starterWorn, townsfolkFigure, type Figure } from './figures/kit.ts';
import { Particles } from './particles.ts';
import { stepSwing, strike, swingFrame, tuning, prefersReducedMotion, knockOffset, kickPixels, type Swing, type FeelLevel } from './feel.ts';

const mobDefs = defaultBalance.creatures;
const STEP_MS = defaultBalance.progression.stepMs;
const PLAY_PITCH = stops.play.pitch;
/** Bakes are told apart by pitch to a tenth of a degree; every stop names the pitch its figures are seen at. */
const pitchKey = (pitch: number) => Math.round((pitch * 1800) / Math.PI);
/**
 * Texels per tile a figure can be baked at. The orthographic stops draw PX render px per tile; through a lens a figure
 * is drawn at whatever its distance gives, and takes the nearest of these so its texels stay one render pixel wide.
 * Steps of about 1.4× keep the mismatch within ±20%. Past what SHEET_CAP_BYTES allows a figure is magnified; only
 * small ones, like the hands seen in first person, reach the last levels.
 */
const DENSITIES = [16, 24, 32, 44, 64, 88, 128, 176, 256, 352];
/** A figure keeps its density until another is nearer by this much (log2), so one standing at a boundary never flickers between bakes. */
const DENSITY_HOLD = 0.12;
function densityFor(want: number, held: number) {
  const off = (d: number) => Math.abs(Math.log2(d / want));
  const best = DENSITIES.reduce((b, d) => (off(d) < off(b) ? d : b));
  return off(held) <= off(best) + DENSITY_HOLD ? held : best;
}

export type ActorKind = 'self' | 'player' | 'npc' | 'monster';
/** What the view needs from an actor: the server's tile, where the feet are drawn, how tall it is and how wide it stands (tiles). */
export type ActorHandle = { id: string; kind: ActorKind; name: string; target: THREE.Vector3; position: THREE.Vector3; height: number; size: number; visible: boolean };
/** Per-frame inputs. `key` is the current lighting keyframe (sun, sky, grade); `sunDir` points from the ground to the sun or moon. */
export type FrameContext = {
  floor: number; selfTarget: string | null; hiddenByRoof: (x: number, y: number) => boolean; key: Key; sunDir: THREE.Vector3; time: number; serverTime: number; pitch: number; wide: boolean;
  /** Camera yaw (radians, positive turns the view left): picks each figure's drawn direction and turns its normals. */
  yaw: number;
  /** Our hero's body is drawn in its own pass (the orthographic stops). */
  selfApart: boolean;
  /** The lens is in the hero's head: their own figure is not drawn. */
  hideSelf: boolean;
  /** The camera of the last frame: names and pick boxes follow the sprite planes, which face it. */
  camera: THREE.Camera;
  /** Render buffer height in pixels: with the camera, how many pixels a tile covers where a figure stands. */
  bufH: number;
  /** A name over a head on this tile would float over a wall that hides its actor. */
  occluded: (x: number, y: number) => boolean;
};

/** Glide each step over the server's step time, or snap to each new tile. */
export type Motion = 'glide' | 'snap';
/** A display-only figure (the lab's line-up). Drawn like any actor; never part of a GameView. `worn` dresses a hero look. */
export type Extra = { id: string; name: string; kind: 'npc' | 'monster'; look: string; worn?: Worn; x: number; y: number; z: number; facing: number };

/**
 * What an actor is drawn as: the figure it should be, and the one in the base bake that stands in until that figure's
 * own bake is ready. Walk cycles per step come from the creature table; people take two.
 */
type Look = { figure: Figure; stand?: string; cadence: number };
function lookOf(kind: ActorKind, id: string, look: string, worn?: Worn): Look {
  if (kind === 'self') return { figure: heroFigureOf(worn ?? {}, selfIdentity), stand: heroFigureOf(starterWorn, selfIdentity).id, cadence: 2 };
  if (kind === 'player' || look === 'hero') return { figure: heroFigureOf(worn ?? {}, identityOf(id)), stand: plainHero().id, cadence: 2 };
  if (isCreature(look)) return { figure: creatureFigure(look), stand: look in defaultBalance.creatures ? look : undefined, cadence: creatures[look].cadence };
  return { figure: townsfolkFigure(isTownsfolk(look) ? look : 'vest'), stand: isTownsfolk(look) ? look : 'vest', cadence: 2 };
}

/** `held` is what first person shows of the look: its hands and what they hold. */
type Body = { sprite: SpriteBody; look: Look; held?: Look };
type Actor = ActorHandle & {
  look: string; worn: string; body: Body; label?: HTMLDivElement; bar?: HTMLDivElement;
  /** Where the name label sits on screen (over the head), for every actor including our hero; kept for speech bubbles. */
  over?: { x: number; y: number; shown: boolean };
  from?: THREE.Vector3; startedAt?: number; stepMs: number; glideMs: number;
  /** Where the figure is drawn walking to. The server's tile is `target`; they differ only while our hero walks a step ahead. */
  goal: THREE.Vector3;
  /** Our hero has started the next step of its route at the moment it fell due, before the server's update says so. */
  lead?: { x: number; z: number; until: number };
  stepTime?: (to: THREE.Vector3, from: THREE.Vector3) => number; floorZ?: number; movingUntil: number;
  facing: number; hp: number; max: number; attackAt: number; foe: string | null;
  /** Animation clock (ms). Hit-stop holds it; nothing positional reads it. */
  clock: number; stopUntil: number; swing: Swing; walk: number; walkFrame: number; hurtAt: number; castAt: number;
  knockAt: number; knockDir: THREE.Vector2; flash: boolean; seed: number; striking: boolean;
  /** From the feet to where the drawn plane stands: sprites step towards the camera (see SpriteBody.set). */
  lift: THREE.Vector3;
  /** The density this figure asks for, and the one its drawn bake has. */
  px: number; shownPx: number;
};
type Corpse = { id: string; stage: number; x: number; y: number; z: number; look?: Look; dir: number; born: number; collapse: boolean; landed: boolean; px: number; sprite?: SpriteBody; mesh?: THREE.Group };
/**
 * One figure baked on its own at one pitch and density: an outfit, a creature the base leaves out, or any figure at
 * another stop's pitch or a lens's density. Baked a few ms per frame; `asked` is when a frame last wanted it, `used`
 * when one last drew it. `bytes` is its GPU texture; the CPU copy is dropped once uploaded.
 */
type Lazy = { key: string; figure: Figure; pitch: number; px: number; job?: BakeJob; started: boolean; atlas?: Atlas; sheet?: SpriteSheet; bytes: number; steps: number; worst: number; asked: number; used: number };
type Drawn = { atlas: Atlas; sheet: SpriteSheet; s: Sheet };
/** Bake work per frame for lazy figures, so a new outfit spreads over several frames; a stand-in shows meanwhile. */
const BAKE_BUDGET_MS = 5;
/** A queued bake no frame has asked for this long is dropped before it starts: the figure walked through that density. */
const ASK_KEEP_MS = 500;
/** A lazy bake nobody has drawn for this long is dropped. */
const LAZY_KEEP_MS = 30_000;
/** GPU memory for lazy bakes; past it the least recently drawn are dropped, and densities are capped while it holds. */
const LAZY_CAP_BYTES = 192 * 2 ** 20;
/**
 * The largest one figure's bake may be. A person stops at 128 texels per tile (17 MB, about 9 ms to upload), a boar at
 * 176 (30 MB), the troll at 64 (29 MB); nearer than that they are magnified.
 */
const SHEET_CAP_BYTES = 32 * 2 ** 20;

const mid = new THREE.Vector3(), probe = new THREE.Vector3();
/** The contact shadow under a body `span` tiles wide: as wide as it stands, flattened by the view. */
const blob = (span: number): [number, number] => [Math.max(0.18, span * 0.5), Math.max(0.1, span * 0.29)];
const dirIndex = (facing: number) => ((Math.round(facing / (Math.PI / 4)) % 8) + 8) % 8;

/**
 * Characters, creatures and corpses. The view owns the camera, picking rays and the world; this layer owns how
 * actors are drawn and animated. Everything here reacts to server state; nothing predicts an outcome.
 */
export class ActorLayer {
  private readonly actors = new Map<string, Actor>();
  private readonly corpses = new Map<string, Corpse>();
  /** Camera kick in render pixels; the view adds it after pixel snapping and this layer decays it. */
  readonly kick = new THREE.Vector2();
  /** The one eager bake: every base figure as Tilt sees it. Every other pitch and density is baked per figure, lazily. */
  readonly atlas: Atlas;
  private readonly sheet: SpriteSheet;
  private readonly lazy = new Map<string, Lazy>();
  /** Finished lazy bakes by figure id, for stand-ins. */
  private readonly ready = new Map<string, Lazy[]>();
  private lazyBytes = 0;
  /** Texture bytes per texel-per-tile squared, by figure id: how big a bake of it will be at any density. */
  private readonly weight = new Map<string, number>();
  /** Lazy bakes as they finish, for the lab: which figure, at which pitch and density, ms of work, over how many frames, GPU bytes. */
  readonly bakes: { id: string; pitch: number; px: number; ms: number; steps: number; worst: number; bytes: number; phases: Atlas['phases'] }[] = [];
  private readonly particles = new Particles();
  feel: FeelLevel = 'heavy';
  motion: Motion = 'glide';
  reduced = prefersReducedMotion();
  /** Counts for the lab: every strike frame drawn is checked against the moment its effect arrived. */
  readonly log = { effects: 0, restrikes: 0, strikes: 0, early: 0, windups: 0, relaxed: 0, collapses: 0 };
  private extras: Extra[] = [];
  private clock = 0;
  /**
   * The server's clock as this client reads it: `base` at local time `at`, running at `rate`. Each update nudges it; none
   * resets it. Positions are a function of this clock, so a clock that jumped to every update (they arrive up to tens of
   * ms early or late) moved every walking figure back or forward by that much.
   */
  private server = { base: 0, at: 0, rate: 1, last: 0, lastAt: 0, samples: 0, seen: [] as [time: number, at: number][] };
  private kickAt = -1e9; private kickDir = new THREE.Vector2(); private kickAmount = 0;
  private gone: { x: number; y: number; z: number; facing: number; at: number }[] = [];
  private lastView?: GameView;

  constructor(readonly scene: THREE.Scene, readonly labels: HTMLElement, readonly map: MapData, readonly screen: (v: THREE.Vector3) => { x: number; y: number }) {
    this.atlas = bake(PLAY_PITCH);
    this.sheet = new SpriteSheet(this.atlas);
    console.info(`figures: baked ${this.atlas.cells} frames (${this.atlas.width}×${this.atlas.height}) in ${this.atlas.ms.toFixed(0)} ms`);
    this.particles.points.layers.set(ACTOR_LAYER); scene.add(this.particles.points);
  }

  get(id: string): ActorHandle | undefined { return this.actors.get(id); }
  /** The screen point over an actor's head, where its name label goes, as of the last frame. */
  overHead(id: string) { return this.actors.get(id)?.over; }
  hideAll() { for (const a of this.actors.values()) this.show(a, false); }
  setExtras(list: Extra[]) { this.extras = list; }

  /** Screen-space pick around each actor's drawn body. Returns the actor; callers act on its server tile. */
  pick(clientX: number, clientY: number): ActorHandle | undefined {
    let best: Actor | undefined, bestD = 26;
    for (const a of this.actors.values()) {
      if (a.kind === 'self' || !a.visible) continue;
      const base = a.position.clone().add(a.lift), foot = this.screen(base), side = this.screen(base.clone().add(new THREE.Vector3(a.size / 2, 0, 0))), head = this.screen(base.add(new THREE.Vector3(0, a.height, 0)));
      // Through a lens a near figure is drawn larger: its box grows with its drawn height, and with how wide it stands.
      const cx = foot.x, cy = (foot.y + head.y) / 2, half = Math.abs(foot.y - head.y) / 2 + 8, halfW = Math.max(22, half * 0.55, Math.abs(side.x - foot.x) + 6);
      const dx = Math.abs(clientX - cx), dy = Math.abs(clientY - cy);
      if (dy < half + 6 && dx < halfW) { const d = dx * (22 / halfW) + dy * 0.3; if (d < bestD) { bestD = d; best = a; } }
    }
    return best;
  }

  /** On the ground, `p` stands between the lens and the hero: nearer the lens, and inside a narrow lane towards them. */
  private between(lens: THREE.Vector3, hero: THREE.Vector3, p: THREE.Vector3) {
    const hx = hero.x - lens.x, hz = hero.z - lens.z, len = Math.hypot(hx, hz) || 1, px = p.x - lens.x, pz = p.z - lens.z;
    const along = (px * hx + pz * hz) / len, side = Math.abs(px * hz - pz * hx) / len;
    return along > 0 && along < len - 0.5 && side < 0.8;
  }
  /** Runs on for at most 400 ms past the last update, so a stalled connection does not walk figures on. */
  private serverNow(now = performance.now()) { const s = this.server; return s.base + (Math.min(now, s.lastAt + 400) - s.at) * s.rate; }
  private makeBody(look: Look): Body { const sprite = this.sheet.body(); sprite.addTo(this.scene); return { sprite, look }; }
  private dropBody(b: Body) { b.sprite.dispose(); }
  private show(a: Actor, on: boolean) { a.body.sprite.visible = on; }
  /**
   * The bake to draw `look` from at `pitch` and `px` texels per tile: the base if that is what it asks for, else the
   * figure's own bake once it is done. Until then the nearest stand-in: the figure at the same pitch and the nearest
   * density, then the figure in the base, then at any pitch, then the base's plain look. With `ask`, queues the bake,
   * and while nothing stands in at this pitch a quick one at PX too, so a new stop fills with the right view first.
   */
  private sheetFor(look: Look, pitch: number, px: number, now: number, ask: boolean): Drawn | undefined {
    const { figure } = look, inBase = this.atlas.sheets.get(figure.id);
    const base = (s: Sheet): Drawn => ({ atlas: this.atlas, sheet: this.sheet, s });
    if (inBase && px === PX && pitchKey(pitch) === pitchKey(PLAY_PITCH)) return base(inBase);
    const l = this.lazy.get(`${figure.id}@${pitchKey(pitch)}@${px}`) ?? (ask ? this.queue(figure, pitch, px, now) : undefined);
    if (l && ask) l.asked = now;
    const own = (r: Lazy): Drawn => { r.used = now; return { atlas: r.atlas!, sheet: r.sheet!, s: r.atlas!.sheets.get(figure.id)! }; };
    if (l?.sheet) return own(l);
    const done = this.ready.get(figure.id);
    let same: Lazy | undefined;
    if (done) for (const r of done) if (pitchKey(r.pitch) === pitchKey(pitch) && (!same || Math.abs(Math.log2(r.px / px)) < Math.abs(Math.log2(same.px / px)))) same = r;
    if (same) return own(same);
    if (ask && px > PX) (this.lazy.get(`${figure.id}@${pitchKey(pitch)}@${PX}`) ?? this.queue(figure, pitch, PX, now)).asked = now;
    if (inBase) return base(inBase);
    if (done) return own(done[0]);
    const stand = look.stand && this.atlas.sheets.get(look.stand);
    return stand ? base(stand) : undefined;
  }
  private queue(figure: Figure, pitch: number, px: number, now: number) {
    const key = `${figure.id}@${pitchKey(pitch)}@${px}`, l: Lazy = { key, figure, pitch, px, job: new BakeJob([figure], pitch, px), started: false, bytes: 0, steps: 0, worst: 0, asked: now, used: 0 };
    this.lazy.set(key, l);
    return l;
  }
  /**
   * The densest bake of `look` that fits SHEET_CAP_BYTES, judged from any bake of it (or its stand-in) already made.
   * A figure never seen bakes at PX first, which tells.
   */
  private densest(look: Look) {
    const w = this.weightOf(look.figure.id) ?? (look.stand ? this.weightOf(look.stand) : undefined);
    if (w === undefined) return PX;
    let best = DENSITIES[0];
    for (const d of DENSITIES) if (d * d * w <= SHEET_CAP_BYTES) best = d;
    return best;
  }
  private weightOf(id: string) {
    let w = this.weight.get(id);
    if (w !== undefined) return w;
    const inBase = this.atlas.sheets.get(id), r = this.ready.get(id)?.[0];
    const s = inBase ? { s: inBase, px: PX } : r ? { s: r.atlas!.sheets.get(id)!, px: r.px } : undefined;
    if (!s) return undefined;
    w = s.s.frames.reduce((n, f) => n + f.w * f.h * 4, 0) / s.px ** 2;
    this.weight.set(id, w);
    return w;
  }
  /**
   * The densest bake memory allows: while lazy bakes drawn this second fill the cap, no figure asks for more than it
   * already has, so a crowd at the lens keeps what is baked instead of evicting itself.
   */
  private densityCap(now: number) {
    let live = 0;
    for (const l of this.lazy.values()) if (l.sheet && now - l.used < 1000) live += l.bytes;
    return live > LAZY_CAP_BYTES * 0.8 ? PX * 2 : Infinity;
  }
  /**
   * Advance one lazy bake by a frame's budget: the one already started, else the one a frame asked for that is worst
   * served. A figure with nothing at its pitch comes first, cheapest first, so a new stop fills with the right view
   * quickly; then the figure whose nearest stand-in is furthest from the density it wants. Drop queued bakes no one
   * asks for, and finished ones past the keep time or the cap.
   */
  private bakeStep(now: number) {
    const rank = (l: Lazy) => {
      let off = Infinity;
      for (const r of this.ready.get(l.figure.id) ?? []) if (pitchKey(r.pitch) === pitchKey(l.pitch)) off = Math.min(off, Math.abs(Math.log2(r.px / l.px)));
      if (off === Infinity && pitchKey(l.pitch) === pitchKey(PLAY_PITCH) && this.atlas.sheets.has(l.figure.id)) off = Math.abs(Math.log2(PX / l.px));
      return off === Infinity ? l.px : 1000 - off * 100;
    };
    let started: Lazy | undefined, next: Lazy | undefined, best = Infinity;
    for (const l of this.lazy.values()) {
      if (l.sheet) { if (now - l.used > LAZY_KEEP_MS) this.drop(l); }
      else if (l.started) started = l;
      else if (now - l.asked > ASK_KEEP_MS) this.lazy.delete(l.key);
      else { const r = rank(l); if (r < best) { best = r; next = l; } }
    }
    next = started ?? next;
    if (!next?.job) return;
    next.started = true; next.steps++;
    const t0 = performance.now(), atlas = next.job.step(BAKE_BUDGET_MS);
    next.worst = Math.max(next.worst, performance.now() - t0);
    if (!atlas) return;
    next.atlas = atlas; next.sheet = new SpriteSheet(atlas); next.job = undefined; next.used = now;
    next.bytes = next.sheet.bytes;
    this.lazyBytes += next.bytes;
    const list = this.ready.get(next.figure.id) ?? []; list.push(next); this.ready.set(next.figure.id, list);
    const work = atlas.phases.setup + atlas.phases.render + atlas.phases.clean;
    this.bakes.push({ id: next.key, pitch: atlas.pitch, px: atlas.px, ms: work, steps: next.steps, worst: next.worst, bytes: next.bytes, phases: atlas.phases });
    console.info(`figures: baked ${next.key} (${atlas.width}×${atlas.height}, ${(next.bytes / 2 ** 20).toFixed(1)} MB) in ${work.toFixed(1)} ms of work over ${next.steps} frames, longest frame ${next.worst.toFixed(1)} ms`);
    // Past the cap the least recently drawn go, but never one drawn this last second: densityCap stops growth instead.
    while (this.lazyBytes > LAZY_CAP_BYTES) {
      let old: Lazy | undefined;
      for (const l of this.lazy.values()) if (l.sheet && now - l.used > 1000 && (!old || l.used < old.used)) old = l;
      if (!old) break;
      this.drop(old);
    }
  }
  private drop(l: Lazy) {
    l.sheet?.dispose(); this.lazy.delete(l.key); this.lazyBytes -= l.bytes;
    const list = this.ready.get(l.figure.id);
    if (list) { list.splice(list.indexOf(l), 1); if (!list.length) this.ready.delete(l.figure.id); }
  }
  /** Whether `p` is in front of the camera and near enough the frame to be drawn soon. */
  private inView(p: THREE.Vector3, ctx: FrameContext) {
    const v = probe.copy(p).project(ctx.camera);
    return v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.3 && Math.abs(v.y) < 1.3;
  }
  /** Texels per tile `p` is drawn at this frame: PX in the orthographic stops, falling with distance through a lens. */
  private drawnPx(p: THREE.Vector3, ctx: FrameContext) {
    const cam = ctx.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera, scale = (cam.projectionMatrix.elements[5] * ctx.bufH) / 2;
    if (!(cam instanceof THREE.PerspectiveCamera)) return scale;
    const e = cam.matrixWorldInverse.elements, depth = -(e[2] * p.x + e[6] * p.y + e[10] * p.z + e[14]);
    return scale / Math.max(0.05, depth);
  }
  /**
   * Our hero's route and step times are known here, so its next step starts the moment the last one ends, not when
   * the server's update arrives up to two ticks later. Without this the hero stood still for that long on every tile
   * and the camera, which follows it, stopped and started with it. The server still decides: if it does not take the
   * step, the hero walks back.
   */
  private leadStep(a: Actor, sNow: number) {
    const v = this.lastView, r = v?.route[0];
    if (!v || !r || !a.stepTime || r.z !== v.self.z || sNow < v.self.moveAt || sNow - v.self.moveAt > 400) return;
    if (v.self.x !== a.target.x || v.self.y !== a.target.z || Math.max(Math.abs(r.x - a.target.x), Math.abs(r.y - a.target.z)) !== 1) return;
    const to = new THREE.Vector3(r.x, 0, r.y);
    a.stepMs = a.glideMs = a.stepTime(to, a.target);
    a.from = a.position.clone(); a.goal.copy(to); a.startedAt = v.self.moveAt;
    a.lead = { x: r.x, z: r.y, until: v.self.moveAt + a.glideMs + 400 };
    a.facing = Math.atan2(r.x - a.target.x, r.y - a.target.z);
    a.movingUntil = v.self.moveAt + a.glideMs + 140;
    a.position.lerpVectors(a.from, a.goal, Math.min(1, (sNow - a.startedAt) / a.glideMs));
  }
  private clear() {
    for (const a of this.actors.values()) { this.dropBody(a.body); a.label?.remove(); }
    for (const c of this.corpses.values()) this.dropCorpse(c);
    this.actors.clear(); this.corpses.clear();
  }

  sync(view: GameView, floor: number) {
    this.lastView = view;
    const now = performance.now(), sv = this.server;
    // How fast server time runs against ours (1 live, 0.25 with the lab's tick=400): animation follows it.
    if (!sv.samples || Math.abs(view.time - this.serverNow(now)) > 500) { sv.base = view.time; sv.at = now; sv.last = view.time; sv.lastAt = now; sv.samples = Math.max(1, sv.samples); sv.seen = [[view.time, now]]; }
    else if (view.time > sv.last) {
      // The rate is read across the last few seconds of updates, so one early or late update barely moves it. A server
      // whose ticks run a little slow (100 ms of game time per 102 ms here) is followed without a correction each update.
      sv.seen.push([view.time, now]); if (sv.seen.length > 40) sv.seen.shift();
      const [t0, a0] = sv.seen[0];
      const rate = now - a0 > 150 ? Math.min(4, Math.max(0.05, (view.time - t0) / (now - a0))) : sv.rate;
      // An update that comes sooner than expected is the truer reading (less delay on the way), so it counts for more.
      const err = view.time - this.serverNow(now), base = this.serverNow(now) + err * (err > 0 ? 0.12 : 0.04);
      sv.base = base; sv.at = now; sv.rate = rate; sv.last = view.time; sv.lastAt = now; sv.samples++;
    }
    const sNow = this.serverNow(now);
    const live = new Set<string>();
    const put = (id: string, kind: ActorKind, name: string, look: string, p: Pos & { facing?: number; moveAt?: number }, hp: number, max: number, level = 1, attackAt = 0, foe: string | null = null, worn?: Worn) => {
      live.add(id);
      let a = this.actors.get(id);
      const wornKey = worn ? JSON.stringify(worn) : '';
      if (a && a.worn !== wornKey) { a.body.look = lookOf(kind, id, look, worn); a.body.held = undefined; }
      if (!a) {
        const body = this.makeBody(lookOf(kind, id, look, worn)), target = new THREE.Vector3(p.x, 0, p.y);
        a = {
          id, kind, name, look, worn: wornKey, body, target, goal: target.clone(), position: target.clone(), height: 1, size: 1, visible: true, stepMs: STEP_MS, glideMs: STEP_MS, movingUntil: 0,
          facing: p.facing ?? 0, hp, max, attackAt, foe, clock: 0, stopUntil: 0, swing: { phase: 'rest' }, walk: 0, walkFrame: -1,
          hurtAt: -1e9, castAt: -1e9, knockAt: -1e9, knockDir: new THREE.Vector2(), lift: new THREE.Vector3(), px: PX, shownPx: PX, flash: false, seed: (id.length * 977 + id.charCodeAt(0) * 131) % 1300, striking: false,
        };
        if (kind !== 'self') {
          a.label = document.createElement('div'); a.label.className = `world-label ${kind}`;
          a.label.innerHTML = `<span class="name"></span><span class="hp"><i></i></span>`;
          (a.label.querySelector('.name') as HTMLElement).textContent = name;
          a.bar = a.label.querySelector('.hp i') as HTMLDivElement;
          this.labels.append(a.label);
        }
        this.actors.set(id, a);
      }
      a.hp = hp; a.max = max; a.attackAt = attackAt; a.foe = foe; a.worn = wornKey;
      if (p.facing !== undefined) a.facing = p.facing;
      if (p.z !== floor) { this.show(a, false); a.visible = false; return; }
      a.visible = true;
      const next = new THREE.Vector3(p.x, 0, p.y);
      const adjacent = Math.max(Math.abs(next.x - a.target.x), Math.abs(next.z - a.target.z)) <= 1;
      // A floor change, or a jump the server made in one update (late or merged snapshots), snaps instead of gliding.
      if ((a.floorZ !== undefined && a.floorZ !== p.z) || !adjacent) { a.position.copy(next); a.target.copy(next); a.goal.copy(next); a.from = undefined; a.startedAt = undefined; a.lead = undefined; }
      a.floorZ = p.z;
      const stepTime = (to: THREE.Vector3, from: THREE.Vector3) => {
        const ground = grounds[this.map.floors[p.z]?.ground[to.z * this.map.width + to.x] ?? 0], diagonal = to.x !== from.x && to.z !== from.z;
        return kind === 'monster' ? rules.creatureStepMs(mobDefs[look as keyof typeof mobDefs]?.step ?? 600, ground, diagonal) : rules.stepMs(rules.heroSpeed(level), ground, diagonal);
      };
      if (next.x !== a.target.x || next.z !== a.target.z) {
        if (a.lead && a.lead.x === next.x && a.lead.z === next.z) {
          // The server took the step this figure was already walking. It may have taken it a tick after it fell due, so
          // stretch the glide to end when the server says the step ends; the next one then follows without a pause.
          a.lead = undefined;
          if (p.moveAt !== undefined && a.startedAt !== undefined) a.glideMs = Math.min(a.stepMs * 1.5, Math.max(a.stepMs, p.moveAt - a.startedAt));
          a.movingUntil = (a.startedAt ?? sNow) + a.glideMs + 140;
        } else {
          // Glide each step over the time the server takes for it: terrain, level speed and diagonals all matter.
          const since = a.startedAt === undefined ? Infinity : sNow - a.startedAt;
          a.from = a.position.clone(); a.startedAt = sNow; a.lead = undefined;
          a.stepMs = stepTime(next, a.target);
          // Our own hero knows when the step ends (moveAt), so it arrives exactly then and the next step can take over
          // without a pause. Others arrive a tick late at most: glide over the gap just seen between their steps.
          a.glideMs = kind === 'self' && p.moveAt !== undefined ? Math.min(a.stepMs, Math.max(a.stepMs * 0.5, p.moveAt - sNow))
            : since < a.stepMs * 1.7 ? Math.max(a.stepMs, since) : a.stepMs;
          a.movingUntil = sNow + a.glideMs + 140;
        }
        a.goal.copy(next);
      } else if (a.lead && kind === 'self') {
        // Walking ahead of the server, and the route no longer goes that way (stopped, turned, blocked): walk back.
        const r = view.route[0];
        if (!r || r.x !== a.lead.x || r.y !== a.lead.z || sNow > a.lead.until) { a.lead = undefined; a.from = a.position.clone(); a.startedAt = sNow; a.glideMs = 140; a.goal.copy(next); }
      }
      if (kind === 'self') a.stepTime = stepTime;
      a.target.copy(next);
    };
    const self = view.self, lvl = (xp: number) => rules.level(xp);
    put(self.id, 'self', self.name, 'hero', self, self.hp, rules.maxHP(lvl(self.xp)), lvl(self.xp), self.attackAt, self.target, self.worn);
    for (const p of view.players) put(p.id, 'player', p.name, 'hero', p, p.hp, rules.maxHP(lvl(p.xp)), lvl(p.xp), p.attackAt, p.target, p.worn);
    for (const n of this.map.npcs) put(n.id, 'npc', n.name, n.look, { ...n, facing: 0 }, 1, 1);
    for (const m of view.monsters) put(m.id, 'monster', mobDefs[m.kind].name, m.kind, m, m.hp, mobDefs[m.kind].hp, 1, m.attackAt, m.target);
    for (const x of this.extras) put(x.id, x.kind, x.name, x.look, x, 1, 1, 1, 0, null, x.worn);
    for (const [id, a] of this.actors) if (!live.has(id)) {
      this.gone.push({ x: Math.round(a.target.x), y: Math.round(a.target.z), z: a.floorZ ?? floor, facing: a.facing, at: this.clock });
      this.dropBody(a.body); a.label?.remove(); this.actors.delete(id);
    }
    this.gone = this.gone.filter(g => this.clock - g.at < 1500);

    const liveC = new Set(view.corpses.map(c => c.id));
    for (const c of view.corpses) {
      const old = this.corpses.get(c.id);
      if (old && old.stage === c.stage) continue;
      if (old) this.dropCorpse(old);
      const who = this.gone.find(g => g.x === c.x && g.y === c.y && g.z === c.z);
      const figure = c.stage >= 2 ? undefined : c.kind === 'hero' ? (c.owner === self.id ? heroFigureOf(starterWorn, selfIdentity) : plainHero()) : isCreature(c.kind) ? creatureFigure(c.kind) : undefined;
      const fresh = !old && view.time - (c.born ?? 0) < 600;
      const k: Corpse = { id: c.id, stage: c.stage, x: c.x, y: c.y, z: c.z, look: figure && { figure, cadence: 2 }, dir: who ? dirIndex(who.facing) : (c.x * 7 + c.y) % 8, born: this.clock, collapse: fresh && tuning(this.feel, this.reduced).collapse, landed: !fresh, px: PX };
      if (k.collapse) this.log.collapses++;
      if (figure) { k.sprite = this.sheet.body(); k.sprite.addTo(this.scene); }
      else { k.mesh = corpseMesh(c.kind); k.mesh.position.set(c.x, 0, c.y); k.mesh.rotation.y = (c.x * 7 + c.y) % 6; k.mesh.traverse(o => o.layers.set(ACTOR_LAYER)); this.scene.add(k.mesh); }
      this.corpses.set(c.id, k);
    }
    for (const [id, k] of this.corpses) {
      const on = view.corpses.find(c => c.id === id)?.z === floor;
      if (k.sprite) k.sprite.visible = on; if (k.mesh) k.mesh.visible = on;
      if (!liveC.has(id)) { this.dropCorpse(k); this.corpses.delete(id); }
    }
  }
  private dropCorpse(k: Corpse) { k.sprite?.dispose(); if (k.mesh) this.scene.remove(k.mesh); }

  /** React to a server effect the moment it arrives. */
  effect(e: Effect) {
    const at = (p: Pos) => [...this.actors.values()].find(a => a.visible && Math.round(a.target.x) === p.x && Math.round(a.target.z) === p.y);
    const victim = at(e.at), attacker = e.from ? at(e.from) : undefined;
    const tun = tuning(this.feel, this.reduced);
    const push = new THREE.Vector2(e.at.x - (e.from?.x ?? e.at.x), e.at.y - (e.from?.y ?? e.at.y));
    if (push.lengthSq() > 0) push.normalize();
    if ((e.kind === 'hit' || e.kind === 'miss' || e.kind === 'block') && attacker && attacker !== victim) {
      this.log.effects++;
      if (attacker.striking) this.log.restrikes++;
      attacker.swing = strike(attacker.clock, e.id);
      if (e.kind !== 'miss') attacker.stopUntil = this.clock + tun.hitStop;
    }
    if (victim && (e.kind === 'hit' || e.kind === 'block')) {
      const chest = new THREE.Vector3(victim.target.x - push.x * 0.25, 0.55, victim.target.z - push.y * 0.25);
      if (!this.reduced) this.particles.sparks(chest, push, e.kind === 'block');
    }
    if (e.kind === 'hit' && victim) {
      victim.hurtAt = victim.clock; victim.flash = tun.flash;
      victim.knockAt = victim.clock; victim.knockDir.copy(push);
      victim.stopUntil = this.clock + tun.hitStop;
      if (victim.kind === 'self' && e.value > 0) {
        this.kickAt = this.clock; this.kickDir.copy(push);
        this.kickAmount = e.value >= victim.max * 0.25 ? tun.kickBig : tun.kickHit;
      }
    }
    if ((e.kind === 'ember' || e.kind === 'burst') && e.from) { const caster = at(e.from); if (caster) caster.castAt = caster.clock; }
  }

  frame(dt: number, t: number, ctx: FrameContext) {
    const tun = tuning(this.feel, this.reduced), dms = dt * 1000 * this.server.rate, sNow = this.serverNow();
    const pitch = ctx.pitch, now = performance.now(), cap = this.densityCap(now);
    const turn = Math.round(ctx.yaw / (Math.PI / 4));
    spriteLight.uYaw.value = ctx.yaw;
    this.bakeStep(now);
    this.clock += dms;
    setSpriteLight(ctx.key, ctx.sunDir, ctx.floor === 1, ctx.wide);
    const sunStrength = ctx.floor === 1 ? 0 : ctx.key.shadows * Math.min(1, ctx.key.sunI / 2.5);
    const age = this.clock - this.kickAt, kp = kickPixels(age, this.kickAmount);
    this.kick.set(-this.kickDir.x * kp, this.kickDir.y * kp);
    this.particles.update(dms);

    // Through a lens standing behind the hero, the hero is the point of interest; orthographic views look straight down.
    const me = ctx.camera instanceof THREE.PerspectiveCamera && !ctx.hideSelf ? this.actors.get(this.lastView?.self.id ?? '') : undefined;
    for (const a of this.actors.values()) {
      const pos = a.position;
      if (this.motion === 'snap' || !a.from || a.startedAt === undefined) pos.copy(a.goal);
      else { const k = Math.min(1, (sNow - a.startedAt) / a.glideMs); pos.lerpVectors(a.from, a.goal, k); if (k >= 1) a.from = undefined; }
      if (a.kind === 'self' && !a.from && !a.lead && this.motion !== 'snap') this.leadStep(a, sNow);
      if (a.kind === 'self') a.body.sprite.setLayer(ctx.selfApart ? SELF_LAYER : ACTOR_LAYER);
      if (this.clock >= a.stopUntil) a.clock += dms;
      const foe = a.foe ? this.actors.get(a.foe) : undefined;
      const engaged = !!foe && foe.visible && Math.max(Math.abs(foe.target.x - a.target.x), Math.abs(foe.target.z - a.target.z)) <= 1;
      const was: Swing = a.swing, next = stepSwing(was, engaged, a.attackAt, sNow, a.clock);
      if (was.phase !== 'windup' && next.phase === 'windup') this.log.windups++;
      if (was.phase === 'windup' && next.phase === 'recover') this.log.relaxed++;
      a.swing = next;
      // With the lens in the head the hero is drawn as their hands alone: the eye sees a raised torch, a swing.
      const held = a.kind === 'self' && ctx.hideSelf;
      const shown = a.visible && (held || !ctx.hiddenByRoof(Math.round(a.target.x), Math.round(a.target.z)));
      const look = held ? (a.body.held ??= { figure: heldFigure(a.body.look.figure), cadence: a.body.look.cadence }) : a.body.look;
      const moving = sNow < a.movingUntil;

      // Only a figure on screen asks for a bake; one out of view keeps whatever it last drew.
      mid.copy(pos).setY(a.height / 2);
      const seen = shown && this.inView(mid, ctx);
      if (seen) a.px = Math.min(densityFor(this.drawnPx(mid, ctx), a.px), Math.max(cap, a.shownPx), this.densest(look));
      const drawn = this.sheetFor(look, pitch, a.px, now, seen);
      if (drawn) {
        a.shownPx = drawn.atlas.px;
        if (!held) a.size = drawn.s.span;
        let anim: AnimName = 'idle', frame = 0;
        const sf = swingFrame(a.swing, a.clock);
        if (sf !== null) { anim = 'attack'; frame = sf; }
        else if (a.clock - a.hurtAt < 170) anim = 'hurt';
        else if (a.clock - a.castAt < 380) { anim = 'cast'; frame = a.clock - a.castAt < 160 ? 0 : 1; }
        else if (moving) {
          anim = 'walk'; a.walk += dms / (a.stepMs / a.body.look.cadence); frame = Math.floor(a.walk) % 4;
          if (frame !== a.walkFrame && frame % 2 === 0 && tun.dust && shown) this.particles.dust(pos, new THREE.Vector2(-Math.sin(a.facing), -Math.cos(a.facing)), 3);
        } else { a.walk = 0; frame = Math.floor((a.clock + a.seed) / 650) % 2; }
        a.walkFrame = anim === 'walk' ? frame : -1;
        const striking = anim === 'attack' && frame === STRIKE;
        if (striking && !a.striking) {
          this.log.strikes++;
          if (a.swing.phase !== 'strike' || a.swing.effectAt > performance.now()) this.log.early++;
        }
        a.striking = striking;
        a.body.sprite.use(drawn.sheet);
        const rect = drawn.s.frames[frameIndex(anim, frame, dirIndex(a.facing - ctx.yaw))];
        const kb = knockOffset(a.clock - a.knockAt, tun.knock);
        // In the head, whoever stands beside or behind the lens would fill the frame, so they are not drawn. A foe on the
        // tile ahead is 1.6 from the lens and stays.
        const crowding = ctx.hideSelf && a.kind !== 'self' && Math.hypot(pos.x - ctx.camera.position.x, pos.z - ctx.camera.position.z) < 1.25;
        const ghost = a.kind !== 'self' && !!me && this.between(ctx.camera.position, me.position, pos);
        const foot = new THREE.Vector3(pos.x + a.knockDir.x * kb, 0, pos.z + a.knockDir.y * kb);
        a.body.sprite.set(rect, foot, { flat: false, flash: a.flash, dim: 0, sun: ctx.sunDir, sunStrength, blob: blob(a.size), self: a.kind === 'self' ? 0.35 : 0, ghost });
        a.flash = false;
        a.body.sprite.visible = shown && !crowding;
        if (held) a.body.sprite.shadow.visible = false;
        // Where the shader puts the plane: stepped `front` towards the camera, rising to keep the feet on the tile, and
        // top rows over 1/c of a tile, c being the camera's level share.
        const e = ctx.camera.matrixWorldInverse.elements, c = Math.hypot(e[2], e[10]) || 1, front = a.body.sprite.front;
        a.lift.set((e[2] / c) * front, (front * e[6]) / c, (e[10] / c) * front);
        if (!held) a.height = (drawn.s.height * Math.cos(drawn.atlas.pitch)) / c;
      } else a.body.sprite.visible = false;

      {
        const head = pos.clone().add(a.lift).add(new THREE.Vector3(0, a.height, 0)), s = this.screen(head);
        // A fifth of a tile over the head, but never more than a few pixels: through a lens a near tile is tall.
        s.y -= Math.min(10, s.y - this.screen(head.add(new THREE.Vector3(0, 0.2, 0))).y);
        // Scenery has no picking, and labels there would float over walls that hide their actors.
        const onScreen = shown && !ctx.wide && !(held && a.kind === 'self') && !ctx.occluded(Math.round(a.target.x), Math.round(a.target.z)) && s.x > -50 && s.y > -50 && s.x < innerWidth + 50 && s.y < innerHeight + 50;
        a.over = { x: Math.round(s.x), y: Math.round(s.y), shown: onScreen };
        if (!a.label) continue;
        a.label.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y)}px, 0) translate(-50%, -100%)`;
        a.label.style.visibility = onScreen ? 'visible' : 'hidden';
        a.label.classList.toggle('targeted', ctx.selfTarget === a.id);
        a.label.classList.toggle('hurt', a.hp < a.max);
        if (a.bar) {
          a.bar.style.transform = `scaleX(${Math.max(0, a.hp / a.max)})`;
          // The bar spans the body: a rat's is short, a troll's long.
          const w = `${Math.round(Math.min(64, Math.max(18, a.size * 34)))}px`;
          if (a.bar.parentElement!.style.width !== w) a.bar.parentElement!.style.width = w;
        }
      }
    }

    for (const k of this.corpses.values()) {
      if (!k.sprite || !k.look || !k.sprite.visible) continue;
      const seen = this.inView(mid.set(k.x, 0.2, k.y), ctx);
      if (seen) k.px = Math.min(densityFor(this.drawnPx(mid, ctx), k.px), Math.max(cap, PX), this.densest(k.look));
      const drawn = this.sheetFor(k.look, pitch, k.px, now, seen);
      if (!drawn) continue;
      // The collapse plays the die frames once; the body lies flat from the third frame on.
      const frame = k.collapse ? Math.min(3, Math.floor((this.clock - k.born) / 110)) : 3;
      if (frame === 3 && !k.landed) { k.landed = true; if (!this.reduced) this.particles.collapse(new THREE.Vector3(k.x, 0, k.y), 0.8); }
      k.sprite.use(drawn.sheet);
      const rect = drawn.s.frames[frameIndex('die', frame, (((k.dir - turn) % 8) + 8) % 8)];
      k.sprite.set(rect, new THREE.Vector3(k.x, 0, k.y), { flat: frame >= 2, flash: false, dim: k.stage ? 0.55 : 0, sun: ctx.sunDir, sunStrength, blob: blob(drawn.s.span * 1.1) });
    }
  }
}

