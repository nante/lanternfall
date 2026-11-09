import * as THREE from 'three';
import { type MapData, type GameView, type Pos, type Effect, T, grounds } from '../../../../packages/game/src/model.ts';
import { defaultBalance, defaultRules as rules } from '../../../../packages/game/src/default-balance.ts';
const mobDefs = defaultBalance.creatures;
import { buildFloor, SUN_DIR, styleUniforms, type FloorScene } from './terrain.ts';
import { human, creature, corpseMesh, setActorPop, type Rig } from './actors.ts';
import type { RenderStyle } from '../../../../packages/game/src/content-schema.ts';
import { defaultStyle } from '../../../../packages/game/src/style-presets.ts';
import { glowTexture } from './textures.ts';

const STEP_MS = defaultBalance.progression.stepMs;
const LIGHTS = 8;
type Actor = { stepMs?: number; from?: THREE.Vector3; startedAt?: number; floorZ?: number; id: string; rig: Rig; target: THREE.Vector3; facing: number; label?: HTMLDivElement; bar?: HTMLDivElement; walk: number; swing: number; hp: number; max: number; kind: 'self' | 'player' | 'npc' | 'monster'; name: string };

const postVertex = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const postFragment = /* glsl */`
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes; uniform float uCave; uniform float uTime; uniform float uHurt;
uniform float uExposure; uniform float uSaturation; uniform float uContrast; uniform float uWarm; uniform float uCool; uniform float uVignette;
uniform float uLevels; uniform float uDither; uniform float uOutline; uniform float uRim;
varying vec2 vUv;
float bayer(vec2 p){ int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0)); int i = x + y * 4;
  float m[16]; m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0; return 0.0; }
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }
void main(){
  vec2 px = 1.0 / uRes;
  vec3 c = texture2D(tColor, vUv).rgb;
  float d = texture2D(tDepth, vUv).r;
  float dl = texture2D(tDepth, vUv - vec2(px.x, 0.0)).r, dr = texture2D(tDepth, vUv + vec2(px.x, 0.0)).r;
  float du = texture2D(tDepth, vUv + vec2(0.0, px.y)).r, dd = texture2D(tDepth, vUv - vec2(0.0, px.y)).r;
  c = aces(c * uExposure);
  float l = luma(c);
  // Edge light: silhouettes whose upper/left neighbour is farther catch the low sun.
  float edgeTop = step(0.002, du - d), edgeLeft = step(0.002, dl - d);
  float lit = smoothstep(0.18, 0.55, l);
  c += max(edgeTop, edgeLeft) * lit * vec3(1.0, 0.5, 0.16) * uRim * (1.0 - uCave);
  // Dark outline where something nearer sits below/right (shadow side).
  float edgeDark = step(0.002, d - min(dd, dr));
  // Strong outline styles ink every silhouette edge, not only the shadow side.
  float edgeAny = step(0.002, max(max(dl, dr), max(du, dd)) - d) * step(0.6, uOutline);
  c *= 1.0 - max(edgeDark, edgeAny * 0.8) * uOutline;
  // Split tone: teal shadows, orange highlights.
  l = luma(c);
  vec3 cool = mix(vec3(0.70, 0.93, 1.02), vec3(0.72, 0.8, 1.15), uCave);
  c = mix(c, mix(c * cool + vec3(0.0, 0.012, 0.016), c, smoothstep(0.08, 0.5, l)), max(uCool, uCave));
  c = mix(c, c * vec3(1.14, 0.97, 0.74), smoothstep(0.32, 0.9, l) * (1.0 - uCave) * uWarm);
  c = mix(vec3(luma(c)), c, uSaturation);
  vec2 q = vUv - 0.5;
  c += vec3(1.0, 0.5, 0.18) * 0.06 * uWarm * (1.0 - uCave) * smoothstep(1.0, 0.0, length(vUv - vec2(0.0, 1.0)));
  c *= 1.0 - dot(q, q) * (uCave > 0.5 ? max(1.1, uVignette) : uVignette);
  c = mix(c, c * vec3(1.25, 0.45, 0.4), uHurt * smoothstep(0.15, 0.6, length(q)));
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  // Contrast pivots on display mid-grey, after gamma, so dark ground keeps its detail.
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  c = floor(c * uLevels + 0.5 + (bayer(gl_FragCoord.xy) - 0.5) * uDither) / uLevels;
  gl_FragColor = vec4(c, 1.0);
}`;

export class WorldView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 8, -8, 0.1, 120);
  readonly target: THREE.WebGLRenderTarget;
  readonly post: THREE.ShaderMaterial;
  readonly postScene = new THREE.Scene();
  readonly postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  readonly sun = new THREE.DirectionalLight('#ffb06a', 4.4);
  readonly sky = new THREE.HemisphereLight('#7aaab4', '#34443a', 1.9);
  readonly torch = new THREE.PointLight('#ffb066', 0, 12, 1.3);
  readonly lampLights: THREE.PointLight[] = [];
  readonly glows: THREE.Sprite[] = [];
  readonly actors = new Map<string, Actor>();
  readonly corpses = new Map<string, THREE.Group>();
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
  floor = 0;
  view?: GameView;
  center = new THREE.Vector3(40, 0, 32);
  zoom = 1;
  pixel = 3;
  style: RenderStyle = defaultStyle;
  hurt = 0;
  private last = 0;
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
      uniforms: { uExposure: { value: 1.7 }, uSaturation: { value: 1.18 }, uContrast: { value: 1 }, uWarm: { value: 1 }, uCool: { value: 1 }, uVignette: { value: 0.6 }, uLevels: { value: 48 }, uDither: { value: 0.5 }, uOutline: { value: 0.45 }, uRim: { value: 0.55 }, tColor: { value: this.target.texture }, tDepth: { value: this.target.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) }, uCave: { value: 0 }, uTime: { value: 0 }, uHurt: { value: 0 } },
      depthTest: false, depthWrite: false,
    });
    this.postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post));

    this.scene.background = new THREE.Color('#05070a');
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 90;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.sky, this.torch);
    for (let i = 0; i < LIGHTS; i++) { const l = new THREE.PointLight('#ffb066', 0, 8, 1.5); this.lampLights.push(l); this.scene.add(l); }

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
    canvas.addEventListener('wheel', e => { e.preventDefault(); this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 0.1, 0.75, 1.6); this.resize(); }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(host);
    this.resize();
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
    u.uExposure.value = style.exposure; u.uSaturation.value = style.saturation; u.uContrast.value = style.contrast;
    u.uWarm.value = style.warmHighlights; u.uCool.value = style.coolShadows; u.uVignette.value = style.vignette;
    u.uLevels.value = style.levels; u.uDither.value = style.dither; u.uOutline.value = style.outline; u.uRim.value = style.rim;
    styleUniforms.uGrid.value = style.grid; styleUniforms.uDapple.value = style.dapple;
    styleUniforms.uGrass.value = style.grass; styleUniforms.uGrassHeight.value = style.grassHeight;
    styleUniforms.uGroundBright.value = style.groundBrightness; styleUniforms.uGroundDetail.value = style.groundDetail;
    const el = THREE.MathUtils.degToRad(style.sunElevation), az = THREE.MathUtils.degToRad(style.sunAzimuth);
    SUN_DIR.set(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)).normalize();
    setActorPop(style.actorPop);
    (this.dust.material as THREE.PointsMaterial).opacity = 0.35 * style.dust;
    const rayMat = (this.rays.children[0] as THREE.Mesh | undefined)?.material as THREE.ShaderMaterial | undefined;
    if (rayMat) rayMat.uniforms.uStrength.value = style.shafts;
    this.labels.classList.toggle('names', style.alwaysNames);
    this.applyLights();
    this.resize();
  }
  private applyLights() {
    const s = this.style, cave = this.floor === 1;
    this.sun.intensity = cave ? 0 : s.sunIntensity;
    this.sun.color.set('#ffffff').lerp(new THREE.Color('#ffb06a'), s.sunWarmth);
    this.sun.castShadow = !cave && s.shadows;
    this.sky.intensity = cave ? 1.6 : s.ambient;
    this.sky.color.set(cave ? '#5a6e94' : new THREE.Color('#ffffff').lerp(new THREE.Color('#7aaab4'), s.ambientTint));
    this.sky.groundColor.set(cave ? '#2a2420' : new THREE.Color('#ffffff').lerp(new THREE.Color('#34443a'), s.ambientTint));
    this.rays.visible = !cave && s.shafts > 0;
    this.dust.visible = s.dust > 0;
  }
  setFloor(z: number, doors: Record<string, boolean>) {
    for (const f of this.floors) if (f) this.scene.remove(f.group);
    const f = (this.floors[z] ??= buildFloor(this.map, z, doors));
    this.scene.add(f.group);
    this.floor = z;
    const cave = z === 1;
    this.applyLights();
    this.torch.intensity = cave ? 3.2 : 0;
    this.rays.visible = !cave && this.style.shafts > 0; this.dust.visible = this.style.dust > 0;
    (this.dust.material as THREE.PointsMaterial).color.set(cave ? '#9ab0c0' : '#ffd29a');
    this.post.uniforms.uCave.value = cave ? 1 : 0;
    for (const [, a] of this.actors) a.rig.root.visible = false;
  }

  resize() {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    this.pixel = Math.max(2, Math.round(h / this.style.pixelHeight));
    const rw = Math.ceil(w / this.pixel), rh = Math.ceil(h / this.pixel);
    this.renderer.setSize(rw, rh, false);
    this.target.setSize(rw, rh);
    this.post.uniforms.uRes.value.set(rw, rh);
    const half = (this.style.viewHeight / 2) * this.zoom;
    this.camera.left = -half * w / h; this.camera.right = half * w / h; this.camera.top = half; this.camera.bottom = -half;
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
    const p = v.clone().project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
  }
  private actorAt(e: PointerEvent) {
    let best: Actor | undefined, bestD = 26;
    for (const a of this.actors.values()) {
      if (a.kind === 'self' || !a.rig.root.visible) continue;
      const foot = this.screen(a.rig.root.position), head = this.screen(a.rig.root.position.clone().add(new THREE.Vector3(0, a.rig.height, 0)));
      const cx = foot.x, cy = (foot.y + head.y) / 2, half = Math.abs(foot.y - head.y) / 2 + 8;
      const dx = Math.abs(e.clientX - cx), dy = Math.abs(e.clientY - cy);
      if (dy < half + 6 && dx < 22) { const d = dx + dy * 0.3; if (d < bestD) { bestD = d; best = a; } }
    }
    return best;
  }
  click(e: PointerEvent) {
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
    const tile = this.tileAt(e); if (!tile) return;
    const k = `${tile.x},${tile.y}`, now = performance.now();
    if (k === this.lastDrag.key || now - this.lastDrag.at < 140) return;
    this.lastDrag = { key: k, at: now };
    this.onPick(tile, { button: 0, drag: true });
  }
  hover(e: PointerEvent) {
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
    const live = new Set<string>();
    const put = (id: string, kind: Actor['kind'], name: string, look: string, p: Pos & { facing?: number }, hp: number, max: number, level = 1) => {
      live.add(id);
      let a = this.actors.get(id);
      if (!a) {
        const rig = kind === 'monster' ? creature(look) : human(look);
        a = { id, rig, target: new THREE.Vector3(p.x, 0, p.y), facing: p.facing ?? 0, walk: 0, swing: 0, hp, max, kind, name };
        rig.root.position.copy(a.target); rig.root.rotation.y = a.facing;
        rig.root.scale.setScalar(kind === 'monster' ? 1.15 : 1.25); rig.height *= kind === 'monster' ? 1.15 : 1.25;
        this.scene.add(rig.root);
        if (kind !== 'self') {
          a.label = document.createElement('div'); a.label.className = `world-label ${kind}`;
          a.label.innerHTML = `<span class="name"></span><span class="hp"><i></i></span>`;
          (a.label.querySelector('.name') as HTMLElement).textContent = name;
          a.bar = a.label.querySelector('.hp i') as HTMLDivElement;
          this.labels.append(a.label);
        }
        this.actors.set(id, a);
      }
      if (p.z !== this.floor) { a.rig.root.visible = false; return; }
      a.rig.root.visible = true;
      const next = new THREE.Vector3(p.x, 0, p.y);
      // Changing floors is a jump, not a walk: snap instead of animating.
      if (a.floorZ !== undefined && a.floorZ !== p.z) { a.rig.root.position.copy(next); a.target.copy(next); a.from = undefined; a.startedAt = undefined; }
      a.floorZ = p.z;
      if (next.x !== a.target.x || next.z !== a.target.z) {
        // Animate each step over the same time the server takes for it: terrain, level speed and diagonals all matter.
        const ground = grounds[this.map.floors[p.z]?.ground[p.y * this.map.width + p.x] ?? 0];
        const diagonal = next.x !== a.target.x && next.z !== a.target.z;
        a.from = a.rig.root.position.clone(); a.startedAt = performance.now();
        a.stepMs = kind === 'monster' ? rules.creatureStepMs(mobDefs[look as keyof typeof mobDefs]?.step ?? 600, ground, diagonal)
          : rules.stepMs(rules.heroSpeed(level), ground, diagonal);
      }
      if (next.distanceTo(a.rig.root.position) > 3) a.rig.root.position.copy(next);
      a.target.copy(next);
      if (p.facing !== undefined) a.facing = p.facing;
      a.hp = hp; a.max = max;
    };
    put(view.self.id, 'self', view.self.name, 'hero', view.self, view.self.hp, rules.maxHP(rules.level(view.self.xp)), rules.level(view.self.xp));
    for (const p of view.players) put(p.id, 'player', p.name, 'other', p, p.hp, rules.maxHP(rules.level(p.xp)), rules.level(p.xp));
    for (const n of this.map.npcs) put(n.id, 'npc', n.name, n.look, { ...n, facing: 0 }, 1, 1);
    for (const m of view.monsters) put(m.id, 'monster', mobDefs[m.kind].name, m.kind, m, m.hp, mobDefs[m.kind].hp);
    for (const [id, a] of this.actors) if (!live.has(id)) { this.scene.remove(a.rig.root); a.label?.remove(); this.actors.delete(id); }

    const liveC = new Set(view.corpses.map(c => c.id));
    for (const c of view.corpses) {
      const old = this.corpses.get(c.id);
      if (old && old.userData.stage === c.stage) continue;
      if (old) this.scene.remove(old);
      const g = corpseMesh(c.kind, c.stage); g.userData.stage = c.stage;
      g.position.set(c.x, 0, c.y); g.rotation.y = (c.x * 7 + c.y) % 6; this.scene.add(g); this.corpses.set(c.id, g);
    }
    for (const [id, g] of this.corpses) { g.visible = view.corpses.find(c => c.id === id)?.z === this.floor; if (!liveC.has(id)) { this.scene.remove(g); this.corpses.delete(id); } }

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
      const victim = [...this.actors.values()].find(a => Math.round(a.target.x) === e.at.x && Math.round(a.target.z) === e.at.y);
      if (e.kind === 'hit' && victim) victim.swing = -1;
      if (e.from) { const att = [...this.actors.values()].find(a => Math.round(a.target.x) === e.from!.x && Math.round(a.target.z) === e.from!.y); if (att && e.kind !== 'ember') att.swing = 1; }
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
          let mat = this.itemMats.get(it.kind);
          if (!mat) {
            const icon = this.itemIcon(it.kind);
            const tex = icon ? new THREE.CanvasTexture(icon) : null;
            if (tex) { tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; }
            mat = new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, color: '#f2ece0' });
            this.itemMats.set(it.kind, mat);
          }
          s = new THREE.Sprite(mat); s.scale.set(0.62, 0.62, 1); s.userData.kind = it.kind;
          this.scene.add(s); this.groundItems.set(it.id, s);
        }
        const depth = top.length - 1 - k;
        s.position.set(x - 0.08 * depth, 0.3 + 0.02 * k, y - 0.08 * depth);
        s.renderOrder = k;
      });
    }
    for (const [id, s] of this.groundItems) if (!live.has(id)) { this.scene.remove(s); this.groundItems.delete(id); }
  }
  private nearestLights() {
    const f = this.floors[this.floor]; if (!f) return;
    const sorted = f.lamps.map(l => ({ l, d: l.pos.distanceToSquared(this.center) })).sort((a, b) => a.d - b.d).slice(0, LIGHTS);
    while (this.glows.length < f.lamps.length) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); this.glows.push(s); this.scene.add(s); }
    this.glows.forEach((g, i) => { const l = f.lamps[i]; g.visible = !!l; if (l) { g.position.copy(l.pos); (g.material as THREE.SpriteMaterial).color.copy(l.color).multiplyScalar(this.floor === 1 ? 0.5 : 0.22); g.scale.setScalar((this.floor === 1 ? 1.6 : 0.8) * l.strength); } });
    this.lampLights.forEach((light, i) => { const s = sorted[i]; if (!s) { light.intensity = 0; return; } light.position.copy(s.l.pos); light.color.copy(s.l.color); light.userData.lamp = s.l; });
  }

  frame(time: number) {
    const dt = Math.min(0.05, this.last ? (time - this.last) / 1000 : 0.016);
    this.last = time;
    const t = time / 1000;
    const f = this.floors[this.floor];
    if (f) f.uniforms.uTime.value = t;
    this.post.uniforms.uTime.value = t;
    const rayMat = (this.rays.children[0] as THREE.Mesh | undefined)?.material as THREE.ShaderMaterial | undefined;
    if (rayMat) rayMat.uniforms.uTime.value = t;

    for (const a of this.actors.values()) {
      const pos = a.rig.root.position;
      const delta = a.target.clone().sub(pos);
      const d = delta.length();
      const moving = d > 0.01;
      // Interpolate the whole step (diagonals included) from where it started to the new tile over exactly its duration.
      if (moving && a.from && a.startedAt !== undefined) { const k = Math.min(1, (performance.now() - a.startedAt) / (a.stepMs ?? STEP_MS)); pos.lerpVectors(a.from, a.target, k); }
      else if (moving) pos.copy(a.target);
      if (moving) { a.walk += dt * 11; a.facing = Math.atan2(a.target.x - pos.x, a.target.z - pos.z) || a.facing; }
      else a.walk = 0;
      let dr = a.facing - a.rig.root.rotation.y; dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      a.rig.root.rotation.y += dr * Math.min(1, dt * 14);
      const swing = Math.sin(a.walk) * (moving ? 0.7 : 0);
      a.rig.legs.forEach((l, i) => { l.rotation.x = a.rig.kind === 'human' ? (i % 2 ? swing : -swing) : Math.sin(a.walk * 1.6 + i) * (moving ? 0.6 : 0); });
      a.rig.arms.forEach((l, i) => { l.rotation.x = (i % 2 ? -swing : swing) * 0.8; });
      if (a.swing > 0) { a.rig.arms[1] && (a.rig.arms[1].rotation.x = -2.2 * a.swing); a.rig.body.position.z = 0.12 * a.swing; a.swing = Math.max(0, a.swing - dt * 4); }
      else if (a.swing < 0) { a.rig.body.position.x = Math.sin(a.swing * 30) * 0.04; a.swing = Math.min(0, a.swing + dt * 4); } else { a.rig.body.position.set(0, 0, 0); }
      a.rig.body.position.y = moving ? Math.abs(Math.sin(a.walk)) * 0.05 : a.kind === 'npc' ? Math.sin(t * 1.5 + pos.x) * 0.008 : 0;
      if (a.label) {
        const s = this.screen(pos.clone().add(new THREE.Vector3(0, a.rig.height + 0.2, 0)));
        const roofId = this.floor === 0 ? this.map.floors[0].roof[Math.round(a.target.z) * this.map.width + Math.round(a.target.x)] : -1;
        const underRoof = roofId >= 0 && !!this.floors[0]?.roofs.find(r => r.building.id === roofId)?.mesh.visible;
        a.rig.root.visible = a.rig.root.visible && !(underRoof && a.kind !== 'self');
        const visible = a.rig.root.visible && s.x > -50 && s.y > -50 && s.x < innerWidth + 50 && s.y < innerHeight + 50;
        a.label.style.transform = `translate3d(${Math.round(s.x)}px, ${Math.round(s.y)}px, 0) translate(-50%, -100%)`;
        a.label.style.visibility = visible ? 'visible' : 'hidden';
        const targeted = this.view?.self.target === a.id;
        a.label.classList.toggle('targeted', targeted);
        a.label.classList.toggle('hurt', a.hp < a.max);
        if (a.bar) a.bar.style.transform = `scaleX(${Math.max(0, a.hp / a.max)})`;
      }
    }

    const self = this.view ? this.actors.get(this.view.self.id) : undefined;
    if (self) this.center.lerp(self.rig.root.position, Math.min(1, dt * 8));
    else { this.center.x = 40 + Math.sin(t * 0.05) * 6; this.center.z = 31 + Math.cos(t * 0.04) * 3; }
    const target = this.view?.self.target ? this.actors.get(this.view.self.target) : undefined;
    if (target) this.targetRing.position.copy(target.rig.root.position);

    // Pixel-snapped camera.
    const pitch = THREE.MathUtils.degToRad(this.style.pitch);
    const offset = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch)).multiplyScalar(19.5);
    this.camera.position.copy(this.center).add(offset);
    this.camera.lookAt(this.center);
    this.camera.updateMatrixWorld();
    const upp = (this.camera.top - this.camera.bottom) / this.target.height;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const sx = this.center.dot(right), sy = this.center.dot(up);
    const snapped = this.center.clone().add(right.multiplyScalar(Math.round(sx / upp) * upp - sx)).add(up.multiplyScalar(Math.round(sy / upp) * upp - sy));
    this.camera.position.copy(snapped).add(offset);
    this.camera.updateMatrixWorld();

    // Sun and shadow camera snapped to shadow texels.
    const texel = 36 / 2048;
    const sc = new THREE.Vector3(Math.round(this.center.x / texel) * texel, 0, Math.round(this.center.z / texel) * texel);
    this.sun.position.copy(sc).addScaledVector(SUN_DIR, 40);
    this.sun.target.position.copy(sc); this.sun.target.updateMatrixWorld();
    if (self) { this.torch.position.copy(self.rig.root.position).add(new THREE.Vector3(-0.6, 2.8, -0.4)); this.torch.intensity = this.floor === 1 ? 30 + Math.sin(t * 9) * 1.8 + Math.sin(t * 23) * 1.0 : 0; }

    if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) this.nearestLights();
    for (const l of this.lampLights) { const lamp = l.userData.lamp as { strength: number; flicker: number } | undefined; if (lamp) l.intensity = (this.floor === 1 ? 14 : 1.4) * lamp.strength * (0.9 + Math.sin(t * 7 + lamp.flicker) * 0.06 + Math.sin(t * 17 + lamp.flicker * 3) * 0.04); }

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
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.postScene, this.postCam);
  }
}
