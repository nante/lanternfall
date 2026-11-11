// PROTOTYPE. Figures tab: feel levels, glide or snap, a line-up, a loupe, a turntable.
import * as THREE from 'three';
import type { TabContext } from '../main.ts';
import { places } from '../harness.ts';
import { bake, frameIndex, palette, DIRS, type Atlas } from '../../../src/render/figures/bake.ts';
import { PX } from '../../../src/render/stops.ts';
import { animOrder, animFrames, type AnimName } from '../../../src/render/figures/poses.ts';
import { creatureFigure, heroFigureOf, identityOf, isCreature, type Figure } from '../../../src/render/figures/kit.ts';
import type { Extra, Motion } from '../../../src/render/actor-layer.ts';
import type { FeelLevel } from '../../../src/render/feel.ts';
import type { Worn } from '../../../../../packages/game/src/model.ts';

/** Six kits, bare to fully armed, so the line-up shows each worn item on the body. */
export const kits: Record<string, Worn> = {
  bare: {},
  starter: { weapon: 'cudgel', head: 'cap', body: 'tunic', feet: 'boots', pack: 'pack' },
  scout: { weapon: 'shortsword', shield: 'buckler', body: 'tunic', feet: 'boots', pack: 'pack' },
  torch: { weapon: 'hatchet', shield: 'torch', head: 'cap', body: 'jerkin', feet: 'boots' },
  knight: { weapon: 'blade', shield: 'banded', head: 'coif', body: 'jerkin', feet: 'boots', pack: 'pack' },
  woodman: { weapon: 'hatchet', head: 'coif', body: 'tunic' },
};
/** The item tiers on the body: rough, iron, steel, blued, gilded, and the rare finds. */
export const tierKits: Record<string, Worn> = {
  rough: { weapon: 'club', shield: 'lid', head: 'cap', body: 'gambeson', feet: 'boots', pack: 'satchel' },
  iron: { weapon: 'mace', shield: 'heater', head: 'kettlehat', body: 'mailshirt', feet: 'shodboots', pack: 'pack' },
  steel: { weapon: 'broadsword', shield: 'kite', head: 'visorhelm', body: 'scalecoat', feet: 'sabatons', pack: 'rucksack' },
  spear: { weapon: 'boarspear', shield: 'tower', head: 'coif', body: 'mailshirt', feet: 'shodboots' },
  blued: { weapon: 'broadaxe', shield: 'banded', head: 'visorhelm', body: 'cuirass', feet: 'sabatons' },
  gilded: { weapon: 'longsword', shield: 'sunshield', head: 'gildedhelm', body: 'cuirass', feet: 'sabatons', pack: 'pack' },
  rare: { weapon: 'dawnblade', head: 'gildedhelm', body: 'scalecoat', feet: 'sabatons' },
  maul: { weapon: 'maul', head: 'kettlehat', body: 'jerkin', feet: 'boots' },
  halberd: { weapon: 'halberd', head: 'visorhelm', body: 'mailshirt', feet: 'sabatons' },
  dagger: { weapon: 'dirk', shield: 'buckler', head: 'cap', body: 'jerkin', feet: 'boots', pack: 'satchel' },
  greataxe: { weapon: 'greataxe', head: 'kettlehat', body: 'scalecoat', feet: 'shodboots' },
  flanged: { weapon: 'flangedmace', shield: 'kite', head: 'coif', body: 'gambeson', feet: 'boots' },
};
type Row = [dx: number, dy: number, look: string, name: string, kind: 'npc' | 'monster', facing: number, worn?: Worn];
const heroRow = (dy: number, facing = 0, set: Record<string, Worn> = kits): Row[] => Object.entries(set).map(([k, w], i) => [set === kits ? i * 1.5 - 7.5 : i * 1.3 - 7.2, dy, 'hero', k, 'npc', facing, w]);
/** The line-up stands near the start tile (north of it, on open ground at the market): hero is live, the rest are display figures. */
const lineups: Record<string, Row[]> = {
  '1': [[-2, 2, 'robe', 'Sister Wren', 'npc', 0], [2, 2, 'guard', 'Warden Corin', 'npc', Math.PI / 4], [0, 3, 'gutterRat', 'Gutter rat', 'monster', Math.PI / 2]],
  all: [
    [-7, -3.5, 'robe', 'Sister Wren', 'npc', 0], [-6, -3.5, 'apron', 'Brann', 'npc', 0], [-5, -3.5, 'dress', 'Mabel', 'npc', 0],
    [-4, -3.5, 'coat', 'Odo', 'npc', 0], [-3, -3.5, 'vest', 'Pell', 'npc', 0], [-2, -3.5, 'guard', 'Warden Corin', 'npc', 0],
    [-0.5, -3.5, 'gutterRat', 'Gutter rat', 'monster', Math.PI / 2], [0.6, -3.5, 'mireGrub', 'Mire grub', 'monster', Math.PI / 2],
    [2, -3.5, 'caveBeetle', 'Cave beetle', 'monster', Math.PI / 2], [3.5, -3.5, 'thornboar', 'Thornboar', 'monster', Math.PI / 2],
    ...heroRow(-1.5), [6, -2, 'barrowTroll', 'Barrow troll', 'monster', -Math.PI / 4],
  ],
  /** Every creature at its size beside a person, side on, then the giant. */
  sizes: [
    [-6, -2.5, 'hero', 'starter', 'npc', Math.PI / 2, kits.starter], [-5, -2.5, 'gutterRat', 'Gutter rat', 'monster', Math.PI / 2], [-3.8, -2.5, 'mireGrub', 'Mire grub', 'monster', Math.PI / 2],
    [-2.3, -2.5, 'caveBeetle', 'Cave beetle', 'monster', Math.PI / 2], [-0.6, -2.5, 'thornboar', 'Thornboar', 'monster', Math.PI / 2], [1.2, -2.5, 'hero', 'knight', 'npc', Math.PI / 2, kits.knight],
    [3.8, -2.5, 'barrowTroll', 'Barrow troll', 'monster', Math.PI / 2],
  ],
  heroes: [...heroRow(-4), ...heroRow(-2, Math.PI)],
  tiers: [...heroRow(-4, 0, tierKits), ...heroRow(-2, Math.PI, tierKits)],
};

export function mount(ctx: TabContext) {
  const { url, view } = ctx, layer = view.actors;
  const q = (k: string, d: string) => url.searchParams.get(k) ?? d;
  const set = (k: string, v: string) => { url.searchParams.set(k, v); ctx.write(false); };
  layer.feel = q('feel', 'heavy') as FeelLevel;
  layer.motion = q('move', 'glide') as Motion;
  const at = (places[q('at', 'meadow')] ?? places.meadow).at;
  const placeLineup = (id: string) => layer.setExtras((lineups[id] ?? []).map(([dx, dy, look, name, kind, facing, worn], i): Extra => ({ id: `lineup:${i}`, name, kind, look, worn, x: at.x + dx, y: at.y + dy, z: at.z, facing })));
  placeLineup(q('cast', '1'));

  const group = (label: string, items: [string, string][], key: string, fallback: string, apply: (v: string) => void) => {
    const g = document.createElement('div'); g.className = 'lab-group';
    const draw = () => {
      g.innerHTML = `<span class="lab-label">${label}</span>`;
      for (const [id, text] of items) {
        const b = document.createElement('button'); b.textContent = text; b.setAttribute('aria-pressed', String(q(key, fallback) === id));
        b.onclick = () => { set(key, id); apply(id); draw(); };
        g.append(b);
      }
    };
    draw(); ctx.picks.after(g);
  };
  group('Slow', [['100', '1×'], ['400', '¼×']], 'tick', '100', () => ctx.write(true));
  group('View', [['0', 'Scene'], ['1', 'Turntable']], 'turn', '0', () => ctx.write(true));
  group('Line-up', [['0', 'Off'], ['1', 'Three'], ['all', 'All'], ['sizes', 'Sizes'], ['heroes', 'Heroes'], ['tiers', 'Tiers']], 'cast', '1', placeLineup);
  group('Move', [['glide', 'Glide'], ['snap', 'Snap']], 'move', 'glide', v => { layer.motion = v as Motion; });
  group('Feel', [['off', 'Off'], ['subtle', 'Subtle'], ['heavy', 'Heavy']], 'feel', 'heavy', v => { layer.feel = v as FeelLevel; });

  // `who` may name figures outside the base bake (kits, creatures), comma-separated. The turntable bakes on the spot
  // (the layer's atlases keep no CPU copy), at `tpitch` and `tpx` texels per tile.
  const who = q('who', ''), extra = who.split(',').map(lookup).filter((f): f is Figure => !!f);
  const atlas = q('turn', '0') === '1' ? bake(Number(q('tpitch', String(layer.atlas.pitch))), extra.length ? extra : undefined, Number(q('tpx', String(PX)))) : layer.atlas;
  if (q('turn', '0') === '1') turntable(atlas, q('anim', 'all') as AnimName | 'all', extra.length === 1 ? extra[0].id : extra.length ? '' : who, q('chan', 'color'), q('frame', ''), Number(q('tz', '0')));
  if (q('loupe', '0') !== '0') loupe(ctx, Number(q('loupe', '6')), q('lid', ''));
  watch(ctx, Number(q('log', '0')));
}

/**
 * The lab's honesty log. Every animation frame it checks that the target ring sits on the server's tile for the
 * target; the layer counts strike frames drawn before their effect. With `log=<seconds>` it reports in the title.
 */
function watch(ctx: TabContext, seconds: number) {
  const w = ctx.view, layer = w.actors, start = performance.now();
  const ring = { checks: 0, off: 0, first: '' };
  const panel = document.createElement('pre'); panel.className = 'lab-read num'; panel.id = 'fig-log';
  Object.assign(panel.style, { top: 'auto', bottom: '64px', right: 'auto', left: '12px', margin: '0' });
  document.body.append(panel);
  let done = false, frames = 0;
  const tick = () => {
    frames++;
    const v = w.view, id = v?.self.target;
    if (v && id && w.targetRing.visible) {
      const m = v.monsters.find(m => m.id === id) ?? v.players.find(p => p.id === id);
      if (m) {
        ring.checks++;
        const p = w.targetRing.position;
        if (p.x !== m.x || p.z !== m.y) { ring.off++; if (!ring.first) ring.first = `ring ${p.x.toFixed(2)},${p.z.toFixed(2)} server ${m.x},${m.y}`; }
      }
    }
    const L = layer.log, secs = (performance.now() - start) / 1000;
    const lazy = layer.bakes.map(b => `${b.id.split('@')[0].replace(/^hero:[^:]+:[^:]+:\d:/, '')} ${(b.pitch * 180 / Math.PI).toFixed(0)}° ${b.px} px ${(b.bytes / 2 ** 20).toFixed(1)} MB ${b.ms.toFixed(0)} ms in ${b.steps} (max ${b.worst.toFixed(1)}; layout ${b.phases.setup.toFixed(1)}, render ${b.phases.render.toFixed(1)}, clean ${b.phases.clean.toFixed(1)})`).join(' · ');
    const text = `figures · feel ${layer.feel} · ${layer.motion}${layer.reduced ? ' · reduced motion' : ''}\nbake ${layer.atlas ? `${layer.atlas.cells} frames ${layer.atlas.ms.toFixed(0)} ms (setup ${layer.atlas.phases.setup.toFixed(0)}, render ${layer.atlas.phases.render.toFixed(0)}, clean ${layer.atlas.phases.clean.toFixed(0)})` : "none"}\n` +
      `lazy bakes ${layer.bakes.length}${lazy ? `: ${lazy}` : ''}\ntime ${secs.toFixed(0)} s · frames ${frames}\neffects ${L.effects} (${L.restrikes} during a strike) · strikes drawn ${L.strikes}\nstrikes before effect ${L.early}\nwind-ups ${L.windups} · relaxed ${L.relaxed} · collapses ${L.collapses}\n` +
      `ring checks ${ring.checks} · off tile ${ring.off}${ring.first ? `\nfirst: ${ring.first}` : ''}`;
    if (frames % 15 === 0 || frames < 30) panel.textContent = text;
    if (seconds > 0 && !done && secs >= seconds) { done = true; panel.textContent = text; document.title = text.replace(/\n/g, ' | '); console.info(text); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Render pixels around the hero (or actor `id`, or `target` for the hero's target), enlarged with no smoothing, read straight from the canvas the frame was drawn to. */
function loupe(ctx: TabContext, scale: number, id: string) {
  const w = ctx.view, src = w.renderer.domElement;
  const cv = document.createElement('canvas'); cv.className = 'lab-overlay';
  const cw = 80, ch = 60;
  cv.width = cw * scale; cv.height = ch * scale;
  Object.assign(cv.style, { right: '12px', bottom: '64px', width: `${(cw * scale) / devicePixelRatio}px`, height: `${(ch * scale) / devicePixelRatio}px`, boxShadow: '0 0 0 2px #ece2c8' });
  document.body.append(cv);
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
  const draw = () => {
    const self = w.view && w.actors.get(id === 'target' ? w.view.self.target ?? w.view.self.id : id || w.view.self.id);
    if (self) {
      const r = src.getBoundingClientRect(), s = w.screen(self.position.clone().add(new THREE.Vector3(0, 0.9, 0)));
      const px = Math.round(((s.x - r.left) / r.width) * src.width - cw / 2), py = Math.round(((s.y - r.top) / r.height) * src.height - ch / 2);
      g.drawImage(src, px, py, cw, ch, 0, 0, cw * scale, ch * scale);
      g.fillStyle = 'rgba(255,255,255,0.07)';
      for (let x = 1; x < cw; x++) g.fillRect(x * scale, 0, 1, ch * scale);
      for (let y = 1; y < ch; y++) g.fillRect(0, y * scale, cw * scale, 1);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

/** The atlas as pixels: palette colours, or with `chan=normal` the folded normal. */
function atlasCanvas(atlas: Atlas, chan: string) {
  const c = document.createElement('canvas'); c.width = atlas.width; c.height = atlas.height;
  const img = new ImageData(atlas.width, atlas.height), src = atlas.data;
  for (let y = 0; y < atlas.height; y++) {
    const from = y * atlas.width * 4, to = (atlas.height - 1 - y) * atlas.width * 4;
    for (let i = 0; i < atlas.width * 4; i += 4) {
      if (!src[from + i + 3]) continue;
      const e = (src[from + i + 2] + 256 * (src[from + i + 3] - 1)) * 4;
      const rgb = chan === 'normal' ? [src[from + i], src[from + i + 1], 128] : [palette[e], palette[e + 1], palette[e + 2]];
      img.data[to + i] = rgb[0]; img.data[to + i + 1] = rgb[1]; img.data[to + i + 2] = rgb[2]; img.data[to + i + 3] = 255;
    }
  }
  c.getContext('2d')!.putImageData(img, 0, 0);
  return c;
}

/** Every figure in 8 directions; or one figure (`who`) with every animation. Frames advance at their own pace. */
function turntable(atlas: Atlas, anim: AnimName | 'all', who: string, chan: string, frame: string, zoom: number) {
  const sheet = atlasCanvas(atlas, chan);
  const cv = document.createElement('canvas'); cv.className = 'lab-overlay';
  Object.assign(cv.style, { left: '0', top: '0', width: '100vw', height: '100vh', zIndex: '4', background: '#233d27' });
  document.body.append(cv);
  const ids = [...atlas.sheets.keys()];
  // One figure: a row per animation, or with `anim` a row per frame of it. Otherwise a row per figure.
  const rows: { label: string; id: string; anim: AnimName; at?: number }[] = who && atlas.sheets.has(who as never)
    ? anim === 'all' ? animOrder.map(a => ({ label: a, id: who, anim: a })) : Array.from({ length: animFrames[anim] }, (_, i) => ({ label: `${anim} ${i}`, id: who, anim, at: i }))
    : ids.map(id => ({ label: atlas.sheets.get(id)!.figure.label, id, anim: anim === 'all' ? 'walk' : anim }));
  // Rows are cropped to what their frames use, so the scale can be as large as the window allows.
  // Frames are cropped to what they draw, so each is placed by its feet: `left` and `right` are the widest reach either side.
  const span = rows.map(r => {
    const s = atlas.sheets.get(r.id as never)!, fr = s.frames.slice(frameIndex(r.anim, 0, 0), frameIndex(r.anim, animFrames[r.anim] - 1, DIRS - 1) + 1);
    return { s, top: Math.max(...fr.map(f => f.h - f.ay)) + 1, below: Math.max(...fr.map(f => f.ay)) + 1, left: Math.max(...fr.map(f => f.ax)), right: Math.max(...fr.map(f => f.w - f.ax)) };
  });
  const draw = (t: number) => {
    const W = Math.round(innerWidth * devicePixelRatio), H = Math.round(innerHeight * devicePixelRatio);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
    const total = span.reduce((n, x) => n + x.top + x.below, 0), left = Math.max(...span.map(x => x.left)), colW = left + Math.max(...span.map(x => x.right)) + 2;
    const S = zoom || Math.max(1, Math.floor(Math.min((H - 140) / total, (W - 220) / (colW * DIRS))));
    let y = 80;
    g.font = `600 ${13 * devicePixelRatio}px Inter Variable, sans-serif`; g.fillStyle = '#ece2c8'; g.textBaseline = 'middle';
    rows.forEach((r, ri) => {
      const { s, top, below } = span[ri], frames = animFrames[r.anim];
      const f = r.at ?? (frame !== '' ? Math.min(frames - 1, Number(frame)) : Math.floor(t / (r.anim === 'idle' ? 600 : 200)) % frames);
      g.fillText(r.label, 16, y + (top * S) / 2);
      for (let d = 0; d < DIRS; d++) {
        const c = s.frames[frameIndex(r.anim, f, d)];
        if (c.w) g.drawImage(sheet, c.x, atlas.height - (c.y + c.h), c.w, c.h, 200 + (d * colW + left - c.ax) * S, y + (top - (c.h - c.ay)) * S, c.w * S, c.h * S);
      }
      y += (top + below) * S;
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

/** A figure by turntable name: a kit (`kit:knight`) or a creature kind. */
function lookup(who: string): Figure | undefined {
  if (who.startsWith('kit:') && kits[who.slice(4)]) return heroFigureOf(kits[who.slice(4)], identityOf(who));
  return isCreature(who) ? creatureFigure(who) : undefined;
}
