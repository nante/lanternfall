import * as THREE from 'three';
import { type MapData, type GameView, type Pos, type Effect, T, grounds, thingHidesSight } from '../../../../packages/game/src/model.ts';
import { defaultBalance, defaultRules as rules } from '../../../../packages/game/src/default-balance.ts';
import { buildFloor, SUN_DIR, styleUniforms, type FloorScene } from './terrain.ts';
import { setActorPop } from './actors.ts';
import { ActorLayer } from './actor-layer.ts';
import type { RenderStyle } from '../../../../packages/game/src/content-schema.ts';
import { defaultStyle } from '../../../../packages/game/src/style-presets.ts';
import { glowTexture } from './textures.ts';
import { paletteLut, LOW_SUN_GREENS } from './palette.ts';
import { PX, stops, pixelLock, type Stop, type StopId } from './stops.ts';
import { keyAt, type Key } from './clock-style.ts';
import { LightField, patchTree, fieldUniforms } from './lightfield.ts';
import { Ambience, TorchFlame } from './wisps.ts';
import { ShadeLayer, type Shade } from './shades.ts';
import { ACTOR_LAYER } from './figures/sprites.ts';
import { Sky } from './sky.ts';
import { FarLand } from './farland.ts';
import { Spire, cutUniforms } from './spire.ts';
import { MOON_DIR } from './clock-style.ts';
import { ramps } from './palette.ts';
import { clockAt, lightLevel, outdoorAmbient, staticSources, type Clock, type LightSource, type WorldLight } from '../../../../packages/game/src/light.ts';
import { prefersReducedMotion } from './feel.ts';
import { postVertex, postFragment } from './post.ts';
import { Mood, moodUniforms } from './mood.ts';
/** Flame flicker is motion: off when the viewer asks for reduced motion. */
const REDUCED_MOTION = prefersReducedMotion();


export class WorldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 120);
  /** The Scenery stop's camera; also used for the dolly between Play and Scenery. */
  readonly persp = new THREE.PerspectiveCamera(40, 1, 0.1, 700);
  readonly skyDome = new Sky();
  readonly mood = new Mood();
  farland!: FarLand;
  spire!: Spire;
  /** 0 = orthographic play, 1 = Scenery; eased over the dolly. */
  scenery = 0;
  lookout = false;
  private sceneryDist = 8.1;
  private sceneryGoal = 0;
  private fromStop: Stop = stops.play;
  private stopEase = 1;
  get eye(): THREE.Camera { return this.scenery > 0 ? this.persp : this.camera; }
  readonly target: THREE.WebGLRenderTarget;
  readonly post: THREE.ShaderMaterial;
  readonly postScene = new THREE.Scene();
  readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly sun = new THREE.DirectionalLight('#ffb06a', 4.4);
  readonly sky = new THREE.HemisphereLight('#7aaab4', '#34443a', 1.9);
  readonly glows: THREE.Sprite[] = [];
  readonly groundItems = new Map<string, THREE.Sprite>();
  private itemMats = new Map<string, THREE.SpriteMaterial>();
  itemIcon: (kind: string) => HTMLCanvasElement | null = () => null;
  /** Return true to take over a press (e.g. start dragging an item off the floor). */
  beforePick: (tile: Pos, e: PointerEvent) => boolean = () => false;
  readonly rays = new THREE.Group();
  readonly dust: THREE.Points;
  readonly marker: THREE.LineSegments;
  readonly targetRing: THREE.LineSegments;
  readonly routeLine: THREE.Line;
  floors: (FloorScene | undefined)[] = [];
  actors!: ActorLayer;
  ambience!: Ambience;
  readonly shades = new ShadeLayer();
  readonly flame = new TorchFlame();
  floor = 0;
  view?: GameView;
  center = new THREE.Vector3(40, 0, 32);
  stop: Stop = stops.play;
  pixel = 3;
  lock = pixelLock(1, 1, 1, stops.play);
  onStop: (s: Stop) => void = () => {};
  style: RenderStyle = defaultStyle;
  minute = 12;
  key: Key = keyAt(12);
  /** Minute of the 40-minute day (see clock-style.ts). Drives sun, sky, grade and atmosphere. */
  setMinute(m: number) { this.minute = m; this.key = keyAt(m); this.applyLights(); }
  readonly fields: (LightField | undefined)[] = [];
  clock: Clock = clockAt(0, { dayMs: 2_400_000, dayOffset: 12 * 60_000 });
  carried: LightSource[] = [];
  private lit = new Set<string>();
  private lastSources: LightSource[] = [];
  /** Drive the day from the rule's clock: sun, sky and the light field all follow `light.ts`. */
  private lastWorld?: WorldLight;
  setWorld(time: number, world: WorldLight) {
    this.lastWorld = world;
    // Under the darkness rule the server sends its own clock settings; the picture must use the rule's clock.
    const servedWorld = (this.view as (GameView & { world?: WorldLight }) | undefined)?.world;
    if (servedWorld) world = { dayMs: servedWorld.dayMs, dayOffset: servedWorld.dayOffset };
    this.clock = clockAt(time, world);
    const m = this.clock.dayT * 40;
    if (Math.abs(m - this.minute) > 0.002) this.setMinute(m);
    // Carried lights: the server's (other players' torches, and ours once darkness is a rule) plus any the lab adds.
    const served = (this.view as (GameView & { lights?: LightSource[] }) | undefined)?.lights ?? [];
    const carried = [...served, ...this.carried.filter(c => !served.some(s => s.id === c.id))];
    const sources = staticSources(this.map, time, world).concat(carried);
    this.lastSources = sources;
    const lit = new Set(sources.filter(s => s.color === 'amber').map(s => `${s.x},${s.y},${s.z}`));
    const changed = lit.size !== this.lit.size || [...lit].some(k => !this.lit.has(k));
    this.lit = lit;
    const fl = this.floors[this.floor]?.lanterns;
    if (fl && changed) {
      fl.tiles.forEach(([x, y], i) => fl.mesh.setColorAt(i, new THREE.Color(lit.has(`${x},${y},${this.floor}`) ? ramps.fire[5] : ramps.night[4])));
      if (fl.mesh.instanceColor) fl.mesh.instanceColor.needsUpdate = true;
    }
    if (this.floor === 0) this.ambience.update(performance.now() / 1000, time, world, sources, this.key);
    this.ambience.group.visible = this.floor === 0;
    const f = (this.fields[this.floor] ??= new LightField(this.map, this.floor));
    f.bind();
    f.update(sources, this.view?.doors ?? {}, this.clock, { x: this.center.x, y: this.center.z });
    // Lamps and the Lantern are drawn faint in full daylight, as the rule says they add nothing then; they bloom as the sky darkens.
    fieldUniforms.uFGain.value = this.fieldGain * (this.floor === 1 ? 1 : 1 - 0.8 * outdoorAmbient(this.clock) / 7);
  }
  field() { return this.fields[this.floor]; }
  setFieldOn(on: boolean) { fieldUniforms.uFOn.value = on ? 1 : 0; }
  /** Debug gain on drawn source light (the lab's `gain`); daylight fades it further. */
  fieldGain = 1;
  /** Where the Scenery eye ends up behind the hero: distance back, height, and the height it looks at. */
  sceneryEye = { back: 30, up: 4.4, look: 7.4, fov: 30 };
  hurt = 0;
  private last = 0;
  private wheel = 0;
  /** Scenery needs open sky: refused underground and under a roof. */
  canScenery() { const v = this.view; if (!v || v.self.z !== 0) return false; return this.map.floors[0].roof[v.self.y * this.map.width + v.self.x] < 0; }
  setStop(id: StopId) {
    if (this.stop.id === id) return;
    if (id === 'scenery' && !this.canScenery()) return;
    this.fromStop = this.stop; this.stop = stops[id]; this.stopEase = 0;
    this.sceneryGoal = id === 'scenery' ? 1 : 0;
    this.resize(); this.onStop(this.stop);
  }
  setLookout(on: boolean) { this.lookout = on; }
  /** One stop out (+1, towards Scenery) or in (−1, towards Close). */
  stepStop(d: 1 | -1) { const order: StopId[] = ['close', 'play', 'scenery'], i = order.indexOf(this.stop.id); this.setStop(order[Math.max(0, Math.min(2, i + d))]); }
  setPalette(on: boolean) { this.post.uniforms.uPalette.value = on ? 1 : 0; }
  private seen = new Set<number>();
  private glowTex = glowTexture();
  private projectiles: { mesh: THREE.Sprite; from: THREE.Vector3; to: THREE.Vector3; start: number }[] = [];
  private bursts: { mesh: THREE.Mesh; start: number; radius: number }[] = [];
  onEffect: (e: Effect, screen: { x: number; y: number }) => void = () => {};
  onPick: (p: Pos, info: { button: number; actor?: string; corpse?: string; drag?: boolean; shift?: boolean }) => void = () => {};
  onHover: (text: string | null, x: number, y: number) => void = () => {};

  constructor(readonly host: HTMLElement, readonly labels: HTMLElement, readonly map: MapData) {
    this.renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const canvas = this.renderer.domElement;
    canvas.className = 'world-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('aria-label', 'Game world. Click to walk, click creatures to attack, click people to talk.');
    host.append(canvas);

    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(4, 4), magFilter: THREE.NearestFilter, minFilter: THREE.NearestFilter });
    this.post = new THREE.ShaderMaterial({
      vertexShader: postVertex, fragmentShader: postFragment,
      uniforms: { ...moodUniforms, uExposure: { value: 1.7 }, uSaturation: { value: 1.18 }, uContrast: { value: 1 }, uWarm: { value: 1 }, uCool: { value: 1 }, uVignette: { value: 0.6 }, uLevels: { value: 48 }, uDither: { value: 0.5 }, uOutline: { value: 0.45 }, uRim: { value: 0.55 }, uLut: { value: this.luts.day }, uPalette: { value: 1 }, uNightEdges: { value: 1 }, uShadowTint: { value: new THREE.Color(1, 1, 1) }, uLightTint: { value: new THREE.Color(1, 1, 1) }, tColor: { value: this.target.texture }, tDepth: { value: this.target.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) }, uCave: { value: 0 }, uTime: { value: 0 }, uHurt: { value: 0 } },
      depthTest: false, depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));

    this.scene.background = new THREE.Color('#05070a');
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.sky);

    this.buildRays();
    const dustGeo = new THREE.BufferGeometry();
    const pts = new Float32Array(110 * 3);
    for (let i = 0; i < 110; i++) { pts[i * 3] = Math.random() * 28 - 14; pts[i * 3 + 1] = Math.random() * 3.5; pts[i * 3 + 2] = Math.random() * 22 - 11; }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    this.dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#ffd29a', size: 1, sizeAttenuation: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.dust);

    const square = (size: number, y: number) => { const s = size / 2; return new THREE.BufferGeometry().setFromPoints([[-s, -s], [s, -s], [s, -s], [s, s], [s, s], [-s, s], [-s, s], [-s, -s]].map(([x, z]) => new THREE.Vector3(x, y, z))); };
    this.marker = new THREE.LineSegments(square(0.94, 0.02), new THREE.LineBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.6 }));
    this.targetRing = new THREE.LineSegments(square(0.98, 0.03), new THREE.LineBasicMaterial({ color: '#ff6a4a' }));
    this.targetRing.visible = false;
    this.routeLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffe2a8', transparent: true, opacity: 0.35 }));
    this.scene.add(this.marker, this.targetRing, this.routeLine);

    this.setFloor(0, {});
    canvas.addEventListener('pointerdown', e => { canvas.focus({ preventScroll: true }); if (e.button === 0 || e.button === 2) this.click(e); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointermove', e => { this.hover(e); if (e.buttons & 1) this.drag(e); });
    canvas.addEventListener('pointerleave', () => this.onHover(null, 0, 0));
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.wheel += e.deltaY; if (Math.abs(this.wheel) < 60) return;
      this.stepStop(this.wheel > 0 ? 1 : -1); this.wheel = 0;
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
    setActorPop(0);
    this.actors = new ActorLayer(this.scene, labels, map, v => this.screen(v));
    this.spire = new Spire(map);
    this.ambience = new Ambience(map, this.spire.lantern); this.scene.add(this.ambience.group);
    this.farland = new FarLand(map); this.scene.add(this.farland.group);
    this.skyDome.mesh.visible = false; this.scene.add(this.skyDome.mesh);
    this.camera.layers.enable(ACTOR_LAYER); this.persp.layers.enable(ACTOR_LAYER);
    this.shades.group.traverse(o => o.layers.set(ACTOR_LAYER)); this.flame.sprite.layers.set(ACTOR_LAYER);
    this.scene.add(this.shades.group, this.flame.sprite);
    const shrineRoof = this.floors[0]?.roofs.find(r => r.building.name.startsWith('Shrine'));
    if (shrineRoof) shrineRoof.mesh.add(this.spire.group); else this.scene.add(this.spire.group);
    patchTree(this.scene);
    this.renderer.setAnimationLoop(t => this.frame(t));
  }

  buildRays() {
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uTime; uniform float uStrength; varying vec2 vUv;
        void main(){ float edge = smoothstep(0.0, 0.5, vUv.x) * smoothstep(1.0, 0.5, vUv.x);
          float along = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.25, vUv.y);
          float pulse = 0.75 + 0.25 * sin(uTime * 0.35 + vUv.y * 2.0);
          gl_FragColor = vec4(vec3(1.0, 0.66, 0.36) * edge * along * pulse * 0.055 * uStrength, 1.0); }`,
    });
    for (let i = 0; i < 4; i++) {
      const width = 1.6 + (i % 2) * 1.6, len = 22;
      const g = new THREE.PlaneGeometry(width, len); g.translate(0, len / 2, 0);
      const m = new THREE.Mesh(g, mat);
      m.userData.offset = new THREE.Vector3((i - 1.5) * 5.5, 0, ((i * 5) % 7) - 3);
      this.rays.add(m);
    }
    this.scene.add(this.rays);
  }
  orientRays() {
    const camDir = new THREE.Vector3(); this.camera.getWorldDirection(camDir);
    for (const m of this.rays.children) {
      const ground = this.center.clone().add(m.userData.offset as THREE.Vector3);
      ground.y = 0;
      m.position.copy(ground);
      const up = SUN_DIR.clone();
      const side = new THREE.Vector3().crossVectors(up, camDir).normalize();
      const normal = new THREE.Vector3().crossVectors(side, up).normalize();
      const basis = new THREE.Matrix4().makeBasis(side, up, normal);
      m.quaternion.setFromRotationMatrix(basis);
    }
  }

  /** Apply a look. Everything here is live: no floor rebuild needed. */
  applyStyle(style: RenderStyle) {
    this.style = style;
    const u = this.post.uniforms;
    u.uLevels.value = style.levels; u.uDither.value = style.dither; u.uOutline.value = style.outline; u.uRim.value = style.rim;
    styleUniforms.uGrid.value = style.grid; styleUniforms.uDapple.value = style.dapple;
    styleUniforms.uGrass.value = style.grass; styleUniforms.uGrassHeight.value = style.grassHeight;
    styleUniforms.uGroundBright.value = style.groundBrightness; styleUniforms.uGroundDetail.value = style.groundDetail;
    setActorPop(0);
    this.labels.classList.toggle('names', style.alwaysNames);
    this.applyLights();
    this.resize();
  }
  private readonly luts = { day: paletteLut(), lowSun: paletteLut(32, LOW_SUN_GREENS) };
  private applyLights() {
    const k = this.key, cave = this.floor === 1;
    // With the sun low (dawn, golden hour) the palette keeps ref-3's field greens; at noon and at night it leaves them out.
    this.post.uniforms.uLut.value = !cave && k.sunElev < 20 && k.sunI > 1.5 ? this.luts.lowSun : this.luts.day;
    const el = THREE.MathUtils.degToRad(Math.max(k.sunElev, 4)), az = THREE.MathUtils.degToRad(k.sunAzim);
    SUN_DIR.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    this.sun.intensity = cave ? 0 : k.sunI;
    this.sun.color.set(k.sun);
    this.sun.castShadow = !cave && k.shadows > 0.5 && this.style.shadows;
    // Low sun throws long shadows over half the field: let some warm light through them so the ground stays lit, as in
    // ref-3's dusk field, instead of reading as dark slabs. Full-strength shadows at noon are short and stay crisp.
    this.sun.shadow.intensity = k.sunElev < 20 ? 0.55 : 0.85;
    this.sky.intensity = cave ? 0.06 : k.ambI;
    this.sky.color.set(cave ? '#3a4a70' : k.sky);
    this.sky.groundColor.set(cave ? '#120e0c' : k.ground);
    const u = this.post.uniforms;
    u.uExposure.value = k.exposure; u.uSaturation.value = k.saturation; u.uContrast.value = k.contrast;
    u.uWarm.value = k.warm; u.uCool.value = k.cool; u.uVignette.value = k.vignette;
    u.uRim.value = this.style.rim * k.warm;
    u.uShadowTint.value.set(cave ? '#ccccdd' : k.shadowTint).multiplyScalar(1 / 0.8); u.uLightTint.value.set(cave ? '#cccccc' : k.lightTint).multiplyScalar(1 / 0.8);
    // The references draw form with value and hue, not ink: depth outlines stay faint.
    u.uOutline.value = Math.min(this.style.outline, 0.15);
    styleUniforms.uDapple.value = 0;
    fieldUniforms.uFCloud.value = cave ? 0 : k.clouds * 0.42 * Math.min(1, k.sunI / 2.5);
    styleUniforms.uSkyTint.value.set(k.zenith).lerp(new THREE.Color(k.horizon), 0.45).convertSRGBToLinear();
    styleUniforms.uGlint.value.set(k.moon > 0.5 ? '#c8d8ff' : k.sun).convertSRGBToLinear().multiplyScalar(k.moon > 0.5 ? 0.7 : Math.min(1.2, 0.3 + k.sunI / 4));
    const rayMat = (this.rays.children[0] as THREE.Mesh | undefined)?.material as THREE.ShaderMaterial | undefined;
    if (rayMat) rayMat.uniforms.uStrength.value = k.shafts;
    this.rays.visible = !cave && k.shafts > 0.01;
    const dm = this.dust.material as THREE.PointsMaterial;
    dm.opacity = 0.35 * k.dust; dm.color.set(cave ? '#9ab0c0' : k.dust_c);
    this.dust.visible = k.dust > 0.01;
  }
  setFloor(z: number, doors: Record<string, boolean>) {
    for (const f of this.floors) if (f) this.scene.remove(f.group);
    const f = (this.floors[z] ??= buildFloor(this.map, z, doors));
    this.scene.add(f.group);
    this.floor = z;
    patchTree(f.group);
    const cave = z === 1;
    this.applyLights();

    this.post.uniforms.uCave.value = cave ? 1 : 0;
    this.actors?.hideAll();
  }

  /** Pixel lock: the buffer is host / k, shown at exactly k physical pixels per buffer pixel; any remainder is cropped. */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const L = (this.lock = pixelLock(this.host.clientWidth, this.host.clientHeight, dpr, this.stop));
    this.pixel = L.k;
    this.renderer.setSize(L.bufW, L.bufH, false);
    const cv = this.renderer.domElement;
    cv.style.width = `${L.cssW}px`; cv.style.height = `${L.cssH}px`;
    this.target.setSize(L.bufW, L.bufH);
    this.post.uniforms.uRes.value.set(L.bufW, L.bufH);
    this.camera.left = -L.viewW / 2; this.camera.right = L.viewW / 2; this.camera.top = L.viewH / 2; this.camera.bottom = -L.viewH / 2;
    this.camera.updateProjectionMatrix();
  }

  private ndc(e: PointerEvent) { const r = this.renderer.domElement.getBoundingClientRect(); return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); }
  tileAtPoint(clientX: number, clientY: number) { return this.tileAt({ clientX, clientY } as PointerEvent); }
  private tileAt(e: PointerEvent): Pos | undefined {
    const ray = new THREE.Raycaster(); ray.setFromCamera(this.ndc(e), this.camera);
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return;
    return { x: Math.round(hit.x), y: Math.round(hit.z), z: this.floor };
  }
  screen(v: THREE.Vector3) {
    const p = v.clone().project(this.eye);
    const r = this.renderer.domElement.getBoundingClientRect();
    // Behind a perspective camera a point projects mirrored into the frame; send it far off screen instead.
    if (p.z > 1 || p.z < -1) return { x: -1e5, y: -1e5 };
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  private actorAt(e: PointerEvent) {
    if (!this.stop.picking) return undefined;
    const a = this.actors.pick(e.clientX, e.clientY);
    if (a) return a;
    // Shades carry no name or kind, only an id and a tile; they are clickable so you can fight back in the dark.
    const id = this.shades.pick(e.clientX, e.clientY, v => this.screen(v)), t = id ? this.shades.tile(id) : undefined;
    return id && t ? { id, kind: 'monster' as const, name: 'Something', target: new THREE.Vector3(t.x, 0, t.y), position: new THREE.Vector3(t.x, 0, t.y), height: 0.6, visible: true } : undefined;
  }
  click(e: PointerEvent) {
    // In Scenery a click only returns to Play; it never walks or attacks.
    if (this.stop.id === 'scenery' || this.scenery > 0) { this.setStop('play'); return; }
    const actor = this.actorAt(e);
    const tile = actor ? { x: Math.round(actor.target.x), y: Math.round(actor.target.z), z: this.floor } : this.tileAt(e);
    if (!tile) return;
    if (!actor && e.button === 0 && !e.shiftKey && this.beforePick(tile, e)) return;
    const corpse = this.view?.corpses.find(c => c.x === tile.x && c.y === tile.y && c.z === tile.z)?.id;
    this.marker.position.set(tile.x, 0, tile.y);
    this.onPick(tile, { button: e.button, actor: actor?.id, corpse, shift: e.shiftKey });
  }
  private lastDrag = { key: '', at: 0 };
  drag(e: PointerEvent) {
    if (this.scenery > 0) return;
    const tile = this.tileAt(e); if (!tile) return;
    const k = `${tile.x},${tile.y}`, now = performance.now();
    if (k === this.lastDrag.key || now - this.lastDrag.at < 140) return;
    this.lastDrag = { key: k, at: now };
    this.onPick(tile, { button: 0, drag: true });
  }
  hover(e: PointerEvent) {
    if (this.scenery > 0) { this.renderer.domElement.style.cursor = 'zoom-in'; this.onHover(null, 0, 0); return; }
    const actor = this.actorAt(e);
    const tile = actor ? { x: Math.round(actor.target.x), y: Math.round(actor.target.z), z: this.floor } : this.tileAt(e);
    if (tile) this.marker.position.set(tile.x, 0, tile.y);
    const t = tile && this.map.floors[this.floor].thing[tile.y * this.map.width + tile.x];
    const use = t === T.door || t === T.hatch || t === T.ladder || t === T.vault || t === T.well;
    const corpse = tile && this.view?.corpses.find(c => c.x === tile.x && c.y === tile.y && c.z === tile.z);
    this.renderer.domElement.style.cursor = actor ? (actor.kind === 'monster' ? 'crosshair' : 'pointer') : use || corpse ? 'pointer' : 'default';
    this.onHover(actor ? actor.name : corpse ? corpse.name : null, e.clientX, e.clientY);
  }

  update(view: GameView) {
    const prev = this.view;
    this.view = view;
    if (view.self.z !== this.floor) this.setFloor(view.self.z, view.doors);
    const f = this.floors[this.floor];
    if (f) for (const [k, pivot] of f.doors) { const open = !!view.doors[k]; pivot.userData.open = open; }
    this.actors.sync(view, this.floor);
    patchTree(this.scene);
    // Loot and shades take the light of this view, not of the last frame.
    const vw = (view as GameView & { world?: WorldLight; lights?: LightSource[] });
    const wl = vw.world ? { dayMs: vw.world.dayMs, dayOffset: vw.world.dayOffset } : this.lastWorld;
    if (wl) { this.clock = clockAt(view.time, wl); this.lastSources = staticSources(this.map, view.time, wl).concat(vw.lights ?? [], this.carried.filter(c => !(vw.lights ?? []).some(s => s.id === c.id))); }
    const shades = (view as GameView & { shades?: Shade[] }).shades ?? [];
    this.shades.sync(shades, this.floor, (x, y) => lightLevel(this.map, { x, y, z: this.floor }, this.lastSources, view.doors, this.clock));

    this.drawGround(view);
    const target = view.self.target ? this.actors.get(view.self.target) : undefined;
    this.targetRing.visible = !!target;
    const route = view.route.map(p => new THREE.Vector3(p.x, 0.03, p.y));
    this.routeLine.geometry.dispose();
    this.routeLine.geometry = new THREE.BufferGeometry().setFromPoints(route.length ? [new THREE.Vector3(view.self.x, 0.03, view.self.y), ...route] : []);

    for (const e of view.effects) {
      if (this.seen.has(e.id)) continue;
      this.seen.add(e.id);
      if (e.at.z !== this.floor) continue;
      const head = new THREE.Vector3(e.at.x, 1.25, e.at.y);
      this.onEffect(e, this.screen(head));
      this.actors.effect(e);
      const mine = (p?: Pos) => !!p && p.x === view.self.x && p.y === view.self.y && p.z === view.self.z;
      if (this.stop.id === 'scenery' && (e.kind === 'hit' || e.kind === 'miss' || e.kind === 'block') && (mine(e.at) || mine(e.from))) this.setStop('play');
      if (e.kind === 'hit' && e.at.x === view.self.x && e.at.y === view.self.y && e.value > 0) this.hurt = Math.min(1, this.hurt + 0.35 + e.value / 60);
      if (e.kind === 'burst') {
        // Cinderburst: a flat ring of fire that sweeps out from the caster.
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 1, 40), new THREE.MeshBasicMaterial({ color: '#ff8a3a', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(e.at.x, 0.08, e.at.y);
        this.scene.add(ring);
        this.bursts.push({ mesh: ring, start: performance.now(), radius: (rules.balance.spells.cinderburst.radius ?? 3) + 0.5 });
      }
      if (e.kind === 'ember' && e.from) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: '#ff8a3a', blending: THREE.AdditiveBlending, depthWrite: false }));
        s.scale.set(0.7, 0.7, 1); this.scene.add(s);
        this.projectiles.push({ mesh: s, from: new THREE.Vector3(e.from.x, 0.8, e.from.y), to: new THREE.Vector3(e.at.x, 0.5, e.at.y), start: performance.now() });
      }
    }
    if (this.seen.size > 500) this.seen = new Set([...this.seen].slice(-200));
    if (prev?.self.z !== view.self.z) this.center.set(view.self.x, 0, view.self.y);
  }

  /** Items lying on tiles: the top three of each pile, drawn as pixel-icon sprites. */
  private drawGround(view: GameView) {
    const piles = new Map<string, GameView['ground']>();
    for (const i of view.ground) { const l = piles.get(i.parent) ?? []; l.push(i); piles.set(i.parent, l); }
    const live = new Set<string>();
    for (const [parent, items] of piles) {
      const [x, y] = parent.slice(7).split(',').map(Number);
      items.sort((a, b) => a.slot - b.slot).slice(-3).forEach((it, k, top) => {
        live.add(it.id);
        let s = this.groundItems.get(it.id);
        if (!s || s.userData.kind !== it.kind) {
          if (s) this.scene.remove(s);
          let shared = this.itemMats.get(it.kind);
          if (!shared) {
            const icon = this.itemIcon(it.kind);
            const tex = icon ? new THREE.CanvasTexture(icon) : null;
            if (tex) { tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; }
            shared = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, color: '#f2ece0' });
            this.itemMats.set(it.kind, shared);
          }
          // Each pile takes the light at its own tile, so the material is per sprite.
          s = new THREE.Sprite(shared.clone()); s.scale.set(0.62, 0.62, 1); s.userData.kind = it.kind;
          this.scene.add(s); this.groundItems.set(it.id, s);
        }
        // Loot takes the rule's light at its tile: hidden where it is dark, dim where it is dim.
        const lv = this.view ? lightLevel(this.map, { x, y, z: this.floor }, this.lastSources, view.doors, this.clock) : 7;
        const near = Math.max(Math.abs(x - view.self.x), Math.abs(y - view.self.y)) <= 1;
        const rule = !!(view as GameView & { world?: { darkness: boolean } }).world?.darkness;
        s.visible = !rule || lv > 0 || near;
        (s.material as THREE.SpriteMaterial).color.set('#f2ece0').multiplyScalar([0.25, 0.4, 0.62, 0.74, 0.84, 0.92, 1, 1][lv]);
        const depth = top.length - 1 - k;
        s.position.set(x - 0.08 * depth, 0.3 + 0.02 * k, y - 0.08 * depth);
        s.renderOrder = k;
      });
    }
    for (const [id, s] of this.groundItems) if (!live.has(id)) { this.scene.remove(s); this.groundItems.delete(id); }
  }
  private nearestLights() {
    const f = this.floors[this.floor]; if (!f) return;
    while (this.glows.length < f.lamps.length) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); this.glows.push(s); this.scene.add(s); }
    this.glows.forEach((g, i) => { const l = f.lamps[i]; const on = !!l && this.lit.has(`${Math.round(l.pos.x)},${Math.round(l.pos.z)},${this.floor}`); g.visible = on; if (l && on) { g.position.copy(l.pos); (g.material as THREE.SpriteMaterial).color.copy(l.color).multiplyScalar(0.35); g.scale.setScalar(0.9 * l.strength); } });
  }

  private placeScenery(k: number, pitch: number) {
    const hero = this.center, W = this.target.width, H = this.target.height;
    const { back, up, look, fov: f1 } = this.sceneryEye, viewH = H / PX, f0 = 1;
    const d0 = viewH / (2 * Math.tan(THREE.MathUtils.degToRad(f0) / 2)), d1 = Math.hypot(back, up);
    const lerpLog = (a: number, b: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k);
    // No pull-in for walls behind the hero: the corridor cut (lightfield `uFCut`) clears whatever stands in the way.
    const fov = lerpLog(f0, f1), d = lerpLog(d0, d1), a = pitch + (Math.atan2(up, back) - pitch) * k;
    this.persp.fov = fov; this.persp.aspect = W / H; this.persp.near = Math.max(0.1, d * 0.05); this.persp.far = d + 700;
    this.persp.updateProjectionMatrix();
    this.sceneryDist = d;
    this.persp.position.set(hero.x, Math.sin(a) * d, hero.z + Math.cos(a) * d);
    this.persp.lookAt(hero.x, look * k, hero.z);
    this.persp.updateMatrixWorld();
  }

  frame(time: number) {
    const dt = Math.min(0.05, this.last ? (time - this.last) / 1000 : 0.016);
    this.last = time;
    const t = time / 1000;
    const f = this.floors[this.floor];
    if (f) f.uniforms.uTime.value = t;
    this.post.uniforms.uTime.value = t;
    fieldUniforms.uFTime.value = t;
    if (!REDUCED_MOTION) this.field()?.flicker(t);
    this.shades.frame();
    const me = this.view ? this.actors.get(this.view.self.id) : undefined;
    const held = this.carried.some(c => c.id === 'torch:self') || this.lastSources.some(c => this.view && c.id === `torch:${this.view.self.id}`);
    this.flame.update(t, me && held ? me.position : null);
    const rayMat = (this.rays.children[0] as THREE.Mesh | undefined)?.material as THREE.ShaderMaterial | undefined;
    if (rayMat) rayMat.uniforms.uTime.value = t;

    const roofs = this.floor === 0 ? this.floors[0]?.roofs : undefined;
    this.actors.frame(dt, t, {
      floor: this.floor, selfTarget: this.view?.self.target ?? null, key: this.key, sunDir: SUN_DIR, time: t, serverTime: this.view?.time ?? 0,
      pitch: this.stop.pitch, wide: this.scenery > 0.5,
      hiddenByRoof: (x, y) => { const id = roofs ? this.map.floors[0].roof[y * this.map.width + x] : -1; return id >= 0 && !!roofs?.find(r => r.building.id === id)?.mesh.visible; },
    });

    const self = this.view ? this.actors.get(this.view.self.id) : undefined;
    if (self) this.center.lerp(self.position, Math.min(1, dt * 8));
    else { this.center.x = 40 + Math.sin(t * 0.05) * 6; this.center.z = 31 + Math.cos(t * 0.04) * 3; }
    const target = this.view?.self.target ? this.actors.get(this.view.self.target) : undefined;
    // The ring marks the server's tile, not the gliding body.
    if (target) this.targetRing.position.copy(target.target);

    // Stop transitions: pitch eases between Close and Play; Play and Scenery dolly between cameras.
    this.stopEase = Math.min(1, this.stopEase + dt / (this.sceneryGoal || this.fromStop.id === 'scenery' ? 0.9 : 0.25));
    const ease = (x: number) => x * x * (3 - 2 * x);
    this.scenery = this.sceneryGoal ? ease(this.stopEase) : this.fromStop.id === 'scenery' ? 1 - ease(this.stopEase) : 0;
    if (this.stop.id === 'scenery' && !this.canScenery()) this.setStop('play');
    const pitch = this.stop.ortho && this.fromStop.ortho ? this.fromStop.pitch + (this.stop.pitch - this.fromStop.pitch) * ease(this.stopEase) : stops.play.pitch;

    // Pixel-snapped orthographic camera (Close and Play).
    const offset = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(19.5);
    this.camera.position.copy(this.center).add(offset);
    this.camera.lookAt(this.center);
    this.camera.updateMatrixWorld();
    const upp = (this.camera.top - this.camera.bottom) / this.target.height;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const sx = this.center.dot(right), sy = this.center.dot(up);
    const snapped = this.center.clone().add(right.multiplyScalar(Math.round(sx / upp) * upp - sx)).add(up.multiplyScalar(Math.round(sy / upp) * upp - sy));
    // Camera kick in whole render pixels, applied after the snap so the grid holds.
    const kick = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).multiplyScalar(Math.round(this.actors.kick.x) * upp)
      .add(new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).multiplyScalar(Math.round(this.actors.kick.y) * upp));
    this.camera.position.copy(snapped).add(offset).add(kick);
    this.camera.updateMatrixWorld();

    // Scenery: start as a 1° lens far away that matches the orthographic view, end low behind the hero looking north.
    if (this.scenery > 0 || this.lookout) this.placeScenery(this.lookout && this.scenery === 0 ? 1 : this.scenery, pitch);
    const wide = this.scenery > 0 || this.lookout;
    this.skyDome.mesh.visible = wide;
    this.scene.fog = wide ? (this.scene.fog as THREE.Fog | null) ?? new THREE.Fog('#000000', 45, 560) : null;
    if (this.scene.fog) {
      const fog = this.scene.fog as THREE.Fog, extra = Math.max(0, this.sceneryDist - 8.1);
      fog.color.set(this.key.horizon).lerp(new THREE.Color(this.key.haze), 0.6);
      // During the dolly the lens starts far away: push the fog out by that distance so the town is not washed out.
      fog.near = 70 + extra; fog.far = 680 + extra;
    }
    // Scenery: no dither (clean bands, as in the references) and flatter ground under painted strokes.
    this.post.uniforms.uDither.value = this.style.dither * (1 - this.scenery);
    styleUniforms.uGroundDetail.value = this.style.groundDetail * (1 - 0.55 * this.scenery);
    fieldUniforms.uFGround.value = this.scenery;
    // Region mood, moonlit vista, shadow softness, motes, shafts and mist (render/mood.ts).
    this.mood.frame(this, this.eye);
    // Walls between the lens and the hero fade out in Scenery, so the vista opens down to the hero's feet (ref-1, ref-2).
    {
      // Clear a corridor down the middle of the view, from the lens to just short of the hero; what stands outside it
      // stays as dark framing at the frame's edges (ref-1's ruined walls, ref-2's dark trees).
      const dx = this.center.x - this.persp.position.x, dz = this.center.z - this.persp.position.z, D = Math.hypot(dx, dz) || 1;
      const on = this.scenery > 0.5;
      fieldUniforms.uFCut.value = on ? Math.max(0, D - 1.2) : 0;
      fieldUniforms.uFAxis.value.set(dx / D, dz / D, this.persp.aspect * Math.tan(THREE.MathUtils.degToRad(this.persp.fov) / 2) * 0.62);
      fieldUniforms.uFNear.value = on ? D * 0.97 : 0;
    }
    this.post.uniforms.uNightEdges.value = 1 - this.scenery;
    this.skyDome.update(this.key, SUN_DIR, MOON_DIR, this.persp, t, THREE.MathUtils.degToRad(this.persp.fov) / Math.max(1, this.target.height));
    this.farland.update(this.key.windows);
    this.spire.update(t, this.key.windows);

    // The Spire opens a dithered window around the hero when it stands between them and the eye.
    const selfH = this.view ? this.actors.get(this.view.self.id) : undefined;
    // Not when a wall right in front of the hero hides them anyway: the window would show only that wall.
    const walled = !!selfH && thingHidesSight(this.map.floors[0].thing[(Math.round(selfH.position.z) + 1) * this.map.width + Math.round(selfH.position.x)]);
    const behind = !!selfH && !walled && this.floor === 0 && selfH.position.z < this.spire.base.z + 0.6 && Math.abs(selfH.position.x - this.spire.base.x) < 4.5 && selfH.position.z > this.spire.base.z - 14;
    if (behind && selfH) {
      const p = selfH.position.clone().add(new THREE.Vector3(0, 0.7, 0)).project(this.eye);
      cutUniforms.uCutCenter.value.set((p.x + 1) / 2 * this.target.width, (p.y + 1) / 2 * this.target.height);
      cutUniforms.uCutR.value = 26;
    } else cutUniforms.uCutR.value = 0;

    // Sun and shadow camera snapped to shadow texels; in Scenery it reaches further ahead of the hero.
    const reach = wide ? 26 : 18, texel = (reach * 2) / 2048;
    const sc0 = wide ? this.center.clone().add(new THREE.Vector3(0, 0, -reach * 0.45)) : this.center;
    const sc = new THREE.Vector3(Math.round(sc0.x / texel) * texel, 0, Math.round(sc0.z / texel) * texel);
    const shadowCam = this.sun.shadow.camera;
    if (shadowCam.right !== reach) { shadowCam.left = -reach; shadowCam.right = reach; shadowCam.top = reach; shadowCam.bottom = -reach; shadowCam.far = 140; shadowCam.updateProjectionMatrix(); }
    this.sun.position.copy(sc).addScaledVector(SUN_DIR, 60);
    this.sun.target.position.copy(sc); this.sun.target.updateMatrixWorld();

    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) this.nearestLights();

    if (f && this.view) {
      const sx2 = this.view.self.x, sy2 = this.view.self.y;
      for (const r of f.roofs) {
        const b = r.building, inside = this.view.self.z === 0 && sx2 >= b.x0 && sx2 <= b.x1 && sy2 >= b.y0 && sy2 <= b.y1;
        r.mesh.visible = !inside;
        const goal = inside ? 0.3 : 1;
        r.walls.scale.y += (goal - r.walls.scale.y) * Math.min(1, dt * 12);
      }
      for (const pivot of f.doors.values()) { const goal = pivot.userData.open ? (pivot.userData.horizontal ? -Math.PI / 2 : Math.PI / 2) : 0; pivot.rotation.y += (goal - pivot.rotation.y) * Math.min(1, dt * 12); }
    }
    this.orientRays();
    const dp = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < dp.count; i++) {
      let x = dp.getX(i) + Math.sin(t * 0.3 + i) * dt * 0.15 + dt * 0.12, y = dp.getY(i) + Math.sin(t * 0.7 + i * 1.3) * dt * 0.08, z = dp.getZ(i) + Math.cos(t * 0.2 + i) * dt * 0.1;
      if (x - this.center.x > 14) x -= 28; if (x - this.center.x < -14) x += 28; if (z - this.center.z > 11) z -= 22; if (z - this.center.z < -11) z += 22; if (y > 3.5) y = 0.2; if (y < 0.1) y = 3.4;
      dp.setXYZ(i, x, y, z);
    }
    dp.needsUpdate = true;

    for (const p of this.projectiles) {
      const k = (performance.now() - p.start) / 260;
      p.mesh.position.lerpVectors(p.from, p.to, Math.min(1, k));
      p.mesh.scale.setScalar(k < 1 ? 0.7 : 0.7 + (k - 1) * 4);
      (p.mesh.material as THREE.SpriteMaterial).opacity = k < 1 ? 1 : Math.max(0, 1 - (k - 1) * 3);
      if (k > 1.4) this.scene.remove(p.mesh);
    }
    this.projectiles = this.projectiles.filter(p => p.mesh.parent);
    for (const b of this.bursts) {
      const k = (performance.now() - b.start) / 450;
      b.mesh.scale.setScalar(0.2 + Math.min(1, k) * b.radius);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k);
      if (k >= 1) { this.scene.remove(b.mesh); b.mesh.geometry.dispose(); (b.mesh.material as THREE.Material).dispose(); }
    }
    this.bursts = this.bursts.filter(b => b.mesh.parent);

    this.hurt = Math.max(0, this.hurt - dt * 1.8);
    this.post.uniforms.uHurt.value = this.hurt;
    this.renderer.setRenderTarget(this.target);
    if (this.lookout && this.scenery === 0) {
      this.skyDome.mesh.visible = false; const fog = this.scene.fog; this.scene.fog = null;
      this.renderer.render(this.scene, this.camera);
      // The lookout: a framed inset of the far view over the live Play view. Figures stay in the play view below it.
      const W = this.target.width, H = this.target.height, w = Math.round(W * 0.56), h = Math.round(H * 0.34), x0 = Math.round((W - w) / 2), y0 = H - h - 6;
      const prevClear = this.renderer.getClearColor(new THREE.Color()), prevAlpha = this.renderer.getClearAlpha();
      this.target.scissorTest = true;
      for (const [grow, col] of [[2, ramps.night[0]], [1, ramps.bone[0]]] as const) {
        this.target.scissor.set(x0 - grow, y0 - grow, w + grow * 2, h + grow * 2);
        this.renderer.setRenderTarget(this.target); this.renderer.setClearColor(col, 1); this.renderer.clear(true, false, false);
      }
      this.renderer.setClearColor(prevClear, prevAlpha);
      this.target.viewport.set(x0, y0, w, h); this.target.scissor.set(x0, y0, w, h);
      this.persp.aspect = w / h; this.persp.updateProjectionMatrix(); this.persp.layers.disable(ACTOR_LAYER);
      this.skyDome.mesh.visible = true; this.scene.fog = fog;
      this.renderer.setRenderTarget(this.target); this.renderer.clear(true, true, false);
      this.renderer.render(this.scene, this.persp);
      this.persp.layers.enable(ACTOR_LAYER);
      this.target.viewport.set(0, 0, W, H); this.target.scissor.set(0, 0, W, H); this.target.scissorTest = false;
    } else this.renderer.render(this.scene, this.eye);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
