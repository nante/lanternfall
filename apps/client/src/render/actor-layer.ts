import * as THREE from 'three';
import { ACTOR_LAYER } from './figures/sprites.ts';
import { type MapData, type GameView, type Pos, type Effect, grounds } from '../../../../packages/game/src/model.ts';
import { defaultBalance, defaultRules as rules } from '../../../../packages/game/src/default-balance.ts';
import { human, creature, corpseMesh, type Rig } from './actors.ts';
import type { Key } from './clock-style.ts';
import { stops } from './stops.ts';
import { bake, frameIndex, type Atlas } from './figures/bake.ts';
import { SpriteSheet, SpriteBody, setSpriteLight, spriteLight } from './figures/sprites.ts';
import { STRIKE, type AnimName } from './figures/poses.ts';
import type { FigureId } from './figures/kit.ts';
import { Particles } from './particles.ts';
import { stepSwing, strike, swingFrame, tuning, prefersReducedMotion, knockOffset, kickPixels, type Swing, type FeelLevel } from './feel.ts';

const mobDefs = defaultBalance.creatures;
const STEP_MS = defaultBalance.progression.stepMs;
const PLAY_PITCH = stops.play.pitch;
/** Bakes are cached by pitch to a tenth of a degree; every stop names the pitch its figures are seen at. */
const bakeKey = (pitch: number) => Math.round((pitch * 1800) / Math.PI);

export type ActorKind = 'self' | 'player' | 'npc' | 'monster';
/** What the view needs from an actor: the server's tile, where the feet are drawn, and how tall it is. */
export type ActorHandle = { id: string; kind: ActorKind; name: string; target: THREE.Vector3; position: THREE.Vector3; height: number; visible: boolean };
/** Per-frame inputs. `key` is the current lighting keyframe (sun, sky, grade); `sunDir` points from the ground to the sun or moon. */
export type FrameContext = {
  floor: number; selfTarget: string | null; hiddenByRoof: (x: number, y: number) => boolean; key: Key; sunDir: THREE.Vector3; time: number; serverTime: number; pitch: number; wide: boolean;
  /** Camera yaw (radians, positive turns the view left): picks each figure's drawn direction and turns its normals. */
  yaw: number;
  /** The lens is in the hero's head: their own figure is not drawn. */
  hideSelf: boolean;
  /** The camera of the last frame: names and pick boxes follow the sprite planes, which face it. */
  camera: THREE.Camera;
  /** A name over a head on this tile would float over a wall that hides its actor. */
  occluded: (x: number, y: number) => boolean;
};

/** Baked sprites, or the old box rigs for comparison. */
export type Variant = 'baked' | 'boxes';
/** Glide each step over the server's step time, or snap to each new tile. */
export type Motion = 'glide' | 'snap';
/** A display-only figure (the lab's line-up). Drawn like any actor; never part of a GameView. */
export type Extra = { id: string; name: string; kind: 'npc' | 'monster'; look: string; x: number; y: number; z: number; facing: number };

const baked: Record<string, FigureId> = { hero: 'hero', other: 'other', robe: 'robe', apron: 'apron', dress: 'dress', coat: 'coat', vest: 'vest', guard: 'guard', thornboar: 'thornboar', gutterRat: 'gutterRat' };
const blobs: Partial<Record<FigureId, [number, number]>> = { thornboar: [0.42, 0.25], gutterRat: [0.2, 0.11] };

type Body = { kind: 'sprite'; sprite: SpriteBody; figure: FigureId } | { kind: 'rig'; rig: Rig };
type Actor = ActorHandle & {
  look: string; body: Body; label?: HTMLDivElement; bar?: HTMLDivElement;
  from?: THREE.Vector3; startedAt?: number; stepMs: number; floorZ?: number; movingUntil: number;
  facing: number; hp: number; max: number; attackAt: number; foe: string | null;
  /** Animation clock (ms). Hit-stop holds it; nothing positional reads it. */
  clock: number; stopUntil: number; swing: Swing; walk: number; walkFrame: number; hurtAt: number; castAt: number;
  knockAt: number; knockDir: THREE.Vector2; flash: boolean; seed: number; striking: boolean; rigSwing: number;
  /** From the feet to where the drawn plane stands: sprites step towards the camera (see SpriteBody.set). */
  lift: THREE.Vector3;
};
type Corpse = { id: string; stage: number; x: number; y: number; z: number; figure?: FigureId; dir: number; born: number; collapse: boolean; landed: boolean; sprite?: SpriteBody; mesh?: THREE.Group };

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
  readonly atlas?: Atlas;
  private readonly sheet?: SpriteSheet;
  private readonly bakes = new Map<number, { atlas: Atlas; sheet: SpriteSheet }>();
  private readonly particles = new Particles();
  variant: Variant = 'baked';
  feel: FeelLevel = 'heavy';
  motion: Motion = 'glide';
  reduced = prefersReducedMotion();
  /** Counts for the lab: every strike frame drawn is checked against the moment its effect arrived. */
  readonly log = { effects: 0, rigEffects: 0, restrikes: 0, strikes: 0, early: 0, windups: 0, relaxed: 0, collapses: 0 };
  private extras: Extra[] = [];
  private clock = 0;
  private server = { time: 0, at: 0, rate: 1, seen: false };
  private kickAt = -1e9; private kickDir = new THREE.Vector2(); private kickAmount = 0;
  private gone: { x: number; y: number; z: number; figure?: FigureId; facing: number; at: number }[] = [];
  private lastView?: GameView;

  constructor(readonly scene: THREE.Scene, readonly labels: HTMLElement, readonly map: MapData, readonly screen: (v: THREE.Vector3) => { x: number; y: number }) {
    try {
      this.atlas = bake(PLAY_PITCH);
      this.sheet = new SpriteSheet(this.atlas);
      this.bakes.set(bakeKey(PLAY_PITCH), { atlas: this.atlas, sheet: this.sheet });
      // The other stops' bakes are made in idle time after the first paint, so the first change of view never stalls.
      const idle = (globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
      idle(() => { for (const st of Object.values(stops)) this.bakeFor(st.figures); }, { timeout: 4000 });
      console.info(`figures: baked ${this.atlas.cells} frames (${this.atlas.width}×${this.atlas.height}) in ${this.atlas.ms.toFixed(0)} ms`);
    } catch (e) {
      console.error('figures: bake failed, drawing box rigs', e);
      this.variant = 'boxes';
    }
    this.particles.points.layers.set(ACTOR_LAYER); scene.add(this.particles.points);
  }

  get(id: string): ActorHandle | undefined { return this.actors.get(id); }
  hideAll() { for (const a of this.actors.values()) this.show(a, false); }
  setVariant(v: Variant) { if (v === this.variant || (v === 'baked' && !this.sheet)) return; this.variant = v; this.clear(); if (this.lastView) this.sync(this.lastView, this.lastView.self.z); }
  setExtras(list: Extra[]) { this.extras = list; }

  /** Screen-space pick around each actor's drawn body. Returns the actor; callers act on its server tile. */
  pick(clientX: number, clientY: number): ActorHandle | undefined {
    let best: Actor | undefined, bestD = 26;
    for (const a of this.actors.values()) {
      if (a.kind === 'self' || !a.visible) continue;
      const base = a.position.clone().add(a.lift), foot = this.screen(base), head = this.screen(base.add(new THREE.Vector3(0, a.height, 0)));
      const cx = foot.x, cy = (foot.y + head.y) / 2, half = Math.abs(foot.y - head.y) / 2 + 8;
      const dx = Math.abs(clientX - cx), dy = Math.abs(clientY - cy);
      // Through a lens a near figure is drawn larger: its box grows with its drawn height.
      if (dy < half + 6 && dx < Math.max(22, half * 0.55)) { const d = dx + dy * 0.3; if (d < bestD) { bestD = d; best = a; } }
    }
    return best;
  }

  /** On the ground, `p` stands between the lens and the hero: nearer the lens, and inside a narrow lane towards them. */
  private between(lens: THREE.Vector3, hero: THREE.Vector3, p: THREE.Vector3) {
    const hx = hero.x - lens.x, hz = hero.z - lens.z, len = Math.hypot(hx, hz) || 1, px = p.x - lens.x, pz = p.z - lens.z;
    const along = (px * hx + pz * hz) / len, side = Math.abs(px * hz - pz * hx) / len;
    return along > 0 && along < len - 0.5 && side < 0.8;
  }
  /** The bake for a pitch, made the first time a stop needs it, then kept. */
  private bakeFor(pitch: number) {
    const key = bakeKey(pitch);
    let b = this.bakes.get(key);
    if (!b) { const atlas = bake(pitch); b = { atlas, sheet: new SpriteSheet(atlas) }; this.bakes.set(key, b); console.info(`figures: bake at ${(key / 10).toFixed(1)}° ${atlas.cells} frames in ${atlas.ms.toFixed(0)} ms`); }
    return b;
  }
  private serverNow() { const s = this.server; return s.time + Math.min(performance.now() - s.at, 250) * s.rate; }
  private figureFor(look: string) { return this.variant === 'baked' && this.sheet ? baked[look] : undefined; }
  private makeBody(kind: ActorKind, look: string): Body {
    const figure = this.figureFor(look);
    if (figure) { const sprite = this.sheet!.body(); sprite.addTo(this.scene); return { kind: 'sprite', sprite, figure }; }
    const rig = kind === 'monster' ? creature(look) : human(look);
    const s = kind === 'monster' ? 1.15 : 1.25;
    rig.root.scale.setScalar(s); rig.height *= s;
    rig.root.traverse(o => o.layers.set(ACTOR_LAYER)); this.scene.add(rig.root);
    return { kind: 'rig', rig };
  }
  private dropBody(b: Body) { if (b.kind === 'sprite') b.sprite.dispose(); else this.scene.remove(b.rig.root); }
  private show(a: Actor, on: boolean) { if (a.body.kind === 'sprite') a.body.sprite.visible = on; else a.body.rig.root.visible = on; }
  private clear() {
    for (const a of this.actors.values()) { this.dropBody(a.body); a.label?.remove(); }
    for (const c of this.corpses.values()) this.dropCorpse(c);
    this.actors.clear(); this.corpses.clear();
  }

  sync(view: GameView, floor: number) {
    this.lastView = view;
    const now = performance.now(), sv = this.server;
    // How fast server time runs against ours (1 live, 0.25 with the lab's tick=400): animation follows it.
    if (sv.seen && view.time > sv.time) sv.rate = Math.min(4, Math.max(0.05, sv.rate * 0.8 + ((view.time - sv.time) / Math.max(1, now - sv.at)) * 0.2));
    if (view.time !== sv.time || !sv.seen) { sv.time = view.time; sv.at = now; sv.seen = true; }
    const sNow = this.serverNow();
    const live = new Set<string>();
    const put = (id: string, kind: ActorKind, name: string, look: string, p: Pos & { facing?: number }, hp: number, max: number, level = 1, attackAt = 0, foe: string | null = null) => {
      live.add(id);
      let a = this.actors.get(id);
      if (!a) {
        const body = this.makeBody(kind, look), target = new THREE.Vector3(p.x, 0, p.y);
        const figure = body.kind === 'sprite' ? body.figure : undefined;
        const height = figure ? this.atlas!.sheets.get(figure)!.height : body.kind === 'rig' ? body.rig.height : 1;
        a = {
          id, kind, name, look, body, target, position: target.clone(), height, visible: true, stepMs: STEP_MS, movingUntil: 0,
          facing: p.facing ?? 0, hp, max, attackAt, foe, clock: 0, stopUntil: 0, swing: { phase: 'rest' }, walk: 0, walkFrame: -1,
          hurtAt: -1e9, castAt: -1e9, knockAt: -1e9, knockDir: new THREE.Vector2(), lift: new THREE.Vector3(), flash: false, seed: (id.length * 977 + id.charCodeAt(0) * 131) % 1300, striking: false, rigSwing: 0,
        };
        if (body.kind === 'rig') { body.rig.root.position.copy(target); body.rig.root.rotation.y = a.facing; }
        if (kind !== 'self') {
          a.label = document.createElement('div'); a.label.className = `world-label ${kind}`;
          a.label.innerHTML = `<span class="name"></span><span class="hp"><i></i></span>`;
          (a.label.querySelector('.name') as HTMLElement).textContent = name;
          a.bar = a.label.querySelector('.hp i') as HTMLDivElement;
          this.labels.append(a.label);
        }
        this.actors.set(id, a);
      }
      a.hp = hp; a.max = max; a.attackAt = attackAt; a.foe = foe;
      if (p.facing !== undefined) a.facing = p.facing;
      if (p.z !== floor) { this.show(a, false); a.visible = false; return; }
      a.visible = true;
      const next = new THREE.Vector3(p.x, 0, p.y);
      const adjacent = Math.max(Math.abs(next.x - a.target.x), Math.abs(next.z - a.target.z)) <= 1;
      // A floor change, or a jump the server made in one update (late or merged snapshots), snaps instead of gliding.
      if ((a.floorZ !== undefined && a.floorZ !== p.z) || !adjacent) { a.position.copy(next); a.target.copy(next); a.from = undefined; a.startedAt = undefined; }
      a.floorZ = p.z;
      if (next.x !== a.target.x || next.z !== a.target.z) {
        // Glide each step over the time the server takes for it: terrain, level speed and diagonals all matter.
        const ground = grounds[this.map.floors[p.z]?.ground[p.y * this.map.width + p.x] ?? 0];
        const diagonal = next.x !== a.target.x && next.z !== a.target.z;
        a.from = a.position.clone(); a.startedAt = sNow;
        a.stepMs = kind === 'monster' ? rules.creatureStepMs(mobDefs[look as keyof typeof mobDefs]?.step ?? 600, ground, diagonal) : rules.stepMs(rules.heroSpeed(level), ground, diagonal);
        a.movingUntil = sNow + a.stepMs + 140;
      }
      a.target.copy(next);
    };
    const self = view.self, lvl = (xp: number) => rules.level(xp);
    put(self.id, 'self', self.name, 'hero', self, self.hp, rules.maxHP(lvl(self.xp)), lvl(self.xp), self.attackAt, self.target);
    for (const p of view.players) put(p.id, 'player', p.name, 'other', p, p.hp, rules.maxHP(lvl(p.xp)), lvl(p.xp), p.attackAt, p.target);
    for (const n of this.map.npcs) put(n.id, 'npc', n.name, n.look, { ...n, facing: 0 }, 1, 1);
    for (const m of view.monsters) put(m.id, 'monster', mobDefs[m.kind].name, m.kind, m, m.hp, mobDefs[m.kind].hp, 1, m.attackAt, m.target);
    for (const x of this.extras) put(x.id, x.kind, x.name, x.look, x, 1, 1);
    for (const [id, a] of this.actors) if (!live.has(id)) {
      this.gone.push({ x: Math.round(a.target.x), y: Math.round(a.target.z), z: a.floorZ ?? floor, figure: a.body.kind === 'sprite' ? a.body.figure : undefined, facing: a.facing, at: this.clock });
      this.dropBody(a.body); a.label?.remove(); this.actors.delete(id);
    }
    this.gone = this.gone.filter(g => this.clock - g.at < 1500);

    const liveC = new Set(view.corpses.map(c => c.id));
    for (const c of view.corpses) {
      const old = this.corpses.get(c.id);
      if (old && old.stage === c.stage) continue;
      if (old) this.dropCorpse(old);
      const who = this.gone.find(g => g.x === c.x && g.y === c.y && g.z === c.z);
      const figure = this.variant === 'baked' && this.sheet && c.stage < 2 ? (c.kind === 'hero' ? (c.owner === self.id ? 'hero' : 'other') : baked[c.kind]) : undefined;
      const fresh = !old && view.time - (c.born ?? 0) < 600;
      const k: Corpse = { id: c.id, stage: c.stage, x: c.x, y: c.y, z: c.z, figure, dir: who ? dirIndex(who.facing) : (c.x * 7 + c.y) % 8, born: this.clock, collapse: fresh && tuning(this.feel, this.reduced).collapse, landed: !fresh };
      if (k.collapse) this.log.collapses++;
      if (figure) { k.sprite = this.sheet!.body(); k.sprite.addTo(this.scene); }
      else { k.mesh = corpseMesh(c.kind, c.stage); k.mesh.position.set(c.x, 0, c.y); k.mesh.rotation.y = (c.x * 7 + c.y) % 6; k.mesh.traverse(o => o.layers.set(ACTOR_LAYER)); this.scene.add(k.mesh); }
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
      if (attacker.body.kind === 'rig') this.log.rigEffects++;
      if (attacker.striking) this.log.restrikes++;
      attacker.swing = strike(attacker.clock, e.id);
      if (e.kind !== 'miss') attacker.stopUntil = this.clock + tun.hitStop;
      if (attacker.body.kind === 'rig') attacker.rigSwing = 1;
    }
    if (victim && (e.kind === 'hit' || e.kind === 'block')) {
      const chest = new THREE.Vector3(victim.target.x - push.x * 0.25, 0.55, victim.target.z - push.y * 0.25);
      if (!this.reduced) this.particles.sparks(chest, push, e.kind === 'block');
    }
    if (e.kind === 'hit' && victim) {
      victim.hurtAt = victim.clock; victim.flash = tun.flash;
      victim.knockAt = victim.clock; victim.knockDir.copy(push);
      victim.stopUntil = this.clock + tun.hitStop;
      if (victim.body.kind === 'rig') victim.rigSwing = -1;
      if (victim.kind === 'self' && e.value > 0) {
        this.kickAt = this.clock; this.kickDir.copy(push);
        this.kickAmount = e.value >= victim.max * 0.25 ? tun.kickBig : tun.kickHit;
      }
    }
    if ((e.kind === 'ember' || e.kind === 'burst') && e.from) { const caster = at(e.from); if (caster) caster.castAt = caster.clock; }
  }

  frame(dt: number, t: number, ctx: FrameContext) {
    const tun = tuning(this.feel, this.reduced), dms = dt * 1000 * this.server.rate, sNow = this.serverNow();
    const { atlas, sheet } = this.bakeFor(ctx.pitch), pitch = atlas.pitch;
    const turn = Math.round(ctx.yaw / (Math.PI / 4));
    spriteLight.uYaw.value = ctx.yaw;
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
      if (this.motion === 'snap' || !a.from || a.startedAt === undefined) pos.copy(a.target);
      else { const k = Math.min(1, (sNow - a.startedAt) / a.stepMs); pos.lerpVectors(a.from, a.target, k); if (k >= 1) a.from = undefined; }
      if (this.clock >= a.stopUntil) a.clock += dms;
      const foe = a.foe ? this.actors.get(a.foe) : undefined;
      const engaged = !!foe && foe.visible && Math.max(Math.abs(foe.target.x - a.target.x), Math.abs(foe.target.z - a.target.z)) <= 1;
      const was: Swing = a.swing, next = stepSwing(was, engaged, a.attackAt, sNow, a.clock);
      if (was.phase !== 'windup' && next.phase === 'windup') this.log.windups++;
      if (was.phase === 'windup' && next.phase === 'recover') this.log.relaxed++;
      a.swing = next;
      const shown = a.visible && !(a.kind === 'self' ? ctx.hideSelf : ctx.hiddenByRoof(Math.round(a.target.x), Math.round(a.target.z)));
      const moving = sNow < a.movingUntil;

      if (a.body.kind === 'sprite') {
        let anim: AnimName = 'idle', frame = 0;
        const sf = swingFrame(a.swing, a.clock);
        if (sf !== null) { anim = 'attack'; frame = sf; }
        else if (a.clock - a.hurtAt < 170) anim = 'hurt';
        else if (a.clock - a.castAt < 380) { anim = 'cast'; frame = a.clock - a.castAt < 160 ? 0 : 1; }
        else if (moving) {
          anim = 'walk'; a.walk += dms / (a.stepMs / 2); frame = Math.floor(a.walk) % 4;
          if (frame !== a.walkFrame && frame % 2 === 0 && tun.dust && shown) this.particles.dust(pos, new THREE.Vector2(-Math.sin(a.facing), -Math.cos(a.facing)), 3);
        } else { a.walk = 0; frame = Math.floor((a.clock + a.seed) / 650) % 2; }
        a.walkFrame = anim === 'walk' ? frame : -1;
        const striking = anim === 'attack' && frame === STRIKE;
        if (striking && !a.striking) {
          this.log.strikes++;
          if (a.swing.phase !== 'strike' || a.swing.effectAt > performance.now()) this.log.early++;
        }
        a.striking = striking;
        a.body.sprite.use(sheet);
        const rect = atlas.sheets.get(a.body.figure)!.frames[frameIndex(anim, frame, dirIndex(a.facing - ctx.yaw))];
        const kb = knockOffset(a.clock - a.knockAt, tun.knock);
        const ghost = a.kind !== 'self' && !!me && this.between(ctx.camera.position, me.position, pos);
        const foot = new THREE.Vector3(pos.x + a.knockDir.x * kb, 0, pos.z + a.knockDir.y * kb);
        a.body.sprite.set(rect, foot, { flat: false, flash: a.flash, dim: 0, sun: ctx.sunDir, sunStrength, blob: blobs[a.body.figure] ?? [0.26, 0.15], self: a.kind === 'self' ? 0.35 : 0, ghost }, pitch);
        a.flash = false;
        a.body.sprite.visible = shown;
        // Where the shader puts the plane: stepped `front` towards the camera, rising to keep the feet on the tile, and
        // top rows over 1/c of a tile, c being the camera's level share.
        const e = ctx.camera.matrixWorldInverse.elements, c = Math.hypot(e[2], e[10]) || 1, front = a.body.sprite.front;
        a.lift.set((e[2] / c) * front, (front * e[6]) / c, (e[10] / c) * front);
        a.height = (atlas.sheets.get(a.body.figure)!.height * Math.cos(pitch)) / c;
      } else this.animateRig(a, a.body.rig, dt, t, moving, shown);

      if (a.label) {
        const head = pos.clone().add(a.lift).add(new THREE.Vector3(0, a.height, 0)), s = this.screen(head);
        // A fifth of a tile over the head, but never more than a few pixels: through a lens a near tile is tall.
        s.y -= Math.min(10, s.y - this.screen(head.add(new THREE.Vector3(0, 0.2, 0))).y);
        // Scenery has no picking, and labels there would float over walls that hide their actors.
        const onScreen = shown && !ctx.wide && !ctx.occluded(Math.round(a.target.x), Math.round(a.target.z)) && s.x > -50 && s.y > -50 && s.x < innerWidth + 50 && s.y < innerHeight + 50;
        a.label.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y)}px, 0) translate(-50%, -100%)`;
        a.label.style.visibility = onScreen ? 'visible' : 'hidden';
        a.label.classList.toggle('targeted', ctx.selfTarget === a.id);
        a.label.classList.toggle('hurt', a.hp < a.max);
        if (a.bar) a.bar.style.transform = `scaleX(${Math.max(0, a.hp / a.max)})`;
      }
    }

    for (const k of this.corpses.values()) {
      if (!k.sprite || !k.figure) continue;
      // The collapse plays the die frames once; the body lies flat from the third frame on.
      const frame = k.collapse ? Math.min(3, Math.floor((this.clock - k.born) / 110)) : 3;
      if (frame === 3 && !k.landed) { k.landed = true; if (!this.reduced) this.particles.collapse(new THREE.Vector3(k.x, 0, k.y), 0.8); }
      k.sprite.use(sheet);
      const rect = atlas.sheets.get(k.figure)!.frames[frameIndex('die', frame, (((k.dir - turn) % 8) + 8) % 8)];
      k.sprite.set(rect, new THREE.Vector3(k.x, 0, k.y), { flat: frame >= 2, flash: false, dim: k.stage ? 0.55 : 0, sun: ctx.sunDir, sunStrength, blob: blobs[k.figure] ?? [0.3, 0.16] }, pitch);
    }
  }

  /** The box rigs of the Boxes variant, animated as before: swinging limbs, a lunge on attack, a shake when hit. */
  private animateRig(a: Actor, rig: Rig, dt: number, t: number, moving: boolean, shown: boolean) {
    rig.root.position.copy(a.position);
    const walk = moving ? (a.walk += dt * 11) : (a.walk = 0);
    let dr = a.facing - rig.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    rig.root.rotation.y += dr * Math.min(1, dt * 14);
    const swing = Math.sin(walk) * (moving ? 0.7 : 0);
    rig.legs.forEach((l, i) => { l.rotation.x = rig.kind === 'human' ? (i % 2 ? swing : -swing) : Math.sin(walk * 1.6 + i) * (moving ? 0.6 : 0); });
    rig.arms.forEach((l, i) => { l.rotation.x = (i % 2 ? -swing : swing) * 0.8; });
    if (a.rigSwing > 0) { if (rig.arms[1]) rig.arms[1].rotation.x = -2.2 * a.rigSwing; rig.body.position.z = 0.12 * a.rigSwing; a.rigSwing = Math.max(0, a.rigSwing - dt * 4); }
    else if (a.rigSwing < 0) { rig.body.position.x = Math.sin(a.rigSwing * 30) * 0.04; a.rigSwing = Math.min(0, a.rigSwing + dt * 4); } else rig.body.position.set(0, 0, 0);
    rig.body.position.y = moving ? Math.abs(Math.sin(walk)) * 0.05 : a.kind === 'npc' ? Math.sin(t * 1.5 + a.position.x) * 0.008 : 0;
    rig.root.visible = shown;
  }
}
