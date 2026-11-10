// PROTOTYPE. Figures tab: feel levels, glide or snap, a line-up, a loupe, a turntable.
import * as THREE from 'three';
import type { TabContext } from '../main.ts';
import { places } from '../harness.ts';
import { bake, frameIndex, DIRS, type Atlas } from '../../../src/render/figures/bake.ts';
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
type Row = [dx: number, dy: number, look: string, name: string, kind: 'npc' | 'monster', facing: number, worn?: Worn];
const heroRow = (dy: number): Row[] => Object.entries(kits).map(([k, w], i) => [i * 1.5 - 4, dy, 'hero', k, 'npc', 0, w]);
/** The line-up stands near the start tile: hero is live, the rest are display figures. */
const lineups: Record<string, Row[]> = {
  '1': [[-2, 2, 'robe', 'Sister Wren', 'npc', 0], [2, 2, 'guard', 'Warden Corin', 'npc', Math.PI / 4], [0, 3, 'gutterRat', 'Gutter rat', 'monster', Math.PI / 2]],
  all: [
    [-5, 3, 'robe', 'Sister Wren', 'npc', 0], [-4, 3, 'apron', 'Brann', 'npc', 0], [-3, 3, 'dress', 'Mabel', 'npc', 0],
    [-2, 3, 'coat', 'Odo', 'npc', 0], [-1, 3, 'vest', 'Pell', 'npc', 0], [0, 3, 'guard', 'Warden Corin', 'npc', 0],
    [1.5, 3, 'gutterRat', 'Gutter rat', 'monster', Math.PI / 2], [2.5, 3, 'mireGrub', 'Mire grub', 'monster', Math.PI / 2],
    [3.7, 3, 'caveBeetle', 'Cave beetle', 'monster', Math.PI / 2], [5, 3, 'thornboar', 'Thornboar', 'monster', Math.PI / 2],
    ...heroRow(5), [5, 6, 'barrowTroll', 'Barrow troll', 'monster', -Math.PI / 4],
  ],
  /** Every creature at its size beside a person, side on, then the giant. */
  sizes: [
    [-3, 3, 'hero', 'starter', 'npc', Math.PI / 2, kits.starter], [-2, 3, 'gutterRat', 'Gutter rat', 'monster', Math.PI / 2], [-1, 3, 'mireGrub', 'Mire grub', 'monster', Math.PI / 2],
    [0.3, 3, 'caveBeetle', 'Cave beetle', 'monster', Math.PI / 2], [1.7, 3, 'thornboar', 'Thornboar', 'monster', Math.PI / 2], [3.5, 3, 'hero', 'knight', 'npc', Math.PI / 2, kits.knight],
    [5.5, 3.5, 'barrowTroll', 'Barrow troll', 'monster', Math.PI / 2],
  ],
  heroes: [...heroRow(3), ...heroRow(5).map((r): Row => [r[0], r[1], r[2], r[3], r[4], Math.PI, r[6]])],
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
  group('Line-up', [['0', 'Off'], ['1', 'Three'], ['all', 'All'], ['sizes', 'Sizes'], ['heroes', 'Heroes']], 'cast', '1', placeLineup);
  group('Move', [['glide', 'Glide'], ['snap', 'Snap']], 'move', 'glide', v => { layer.motion = v as Motion; });
  group('Feel', [['off', 'Off'], ['subtle', 'Subtle'], ['heavy', 'Heavy']], 'feel', 'heavy', v => { layer.feel = v as FeelLevel; });

  // `who` may name figures outside the base bake (kits, creatures), comma-separated; the turntable bakes them on the spot.
  const who = q('who', ''), extra = who.split(',').map(lookup).filter((f): f is Figure => !!f);
  const atlas = extra.length ? bake(Number(q('tpitch', String(layer.atlas.pitch))), extra) : layer.atlas;
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
    const lazy = layer.bakes.map(b => `${b.id.split('@')[0].replace(/^hero:[^:]+:[^:]+:\d:/, '')} ${b.ms.toFixed(0)} ms in ${b.steps}`).join(' · ');
    const text = `figures · feel ${layer.feel} · ${layer.motion}${layer.reduced ? ' · reduced motion' : ''}\nbake ${layer.atlas ? `${layer.atlas.cells} frames ${layer.atlas.ms.toFixed(0)} ms (setup ${layer.atlas.phases.setup.toFixed(0)}, render ${layer.atlas.phases.render.toFixed(0)}, clean ${layer.atlas.phases.clean.toFixed(0)})` : "none"}\n` +
      `lazy bakes ${layer.bakes.length}${lazy ? `: ${lazy}` : ''}\ntime ${secs.toFixed(0)} s · frames ${frames}\neffects ${L.effects} (${L.restrikes} during a strike) · strikes drawn ${L.strikes}\nstrikes before effect ${L.early}\nwind-ups ${L.windups} · relaxed ${L.relaxed} · collapses ${L.collapses}\n` +
      `ring checks ${ring.checks} · off tile ${ring.off}${ring.first ? `\nfirst: ${ring.first}` : ''}`;
    if (frames % 15 === 0 || frames < 30) panel.textContent = text;
    if (seconds > 0 && !done && secs >= seconds) { done = true; panel.textContent = text; document.title = text.replace(/\n/g, ' | '); console.info(text); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** Render pixels around the hero (or actor `id`), enlarged with no smoothing, read straight from the canvas the frame was drawn to. */
function loupe(ctx: TabContext, scale: number, id: string) {
  const w = ctx.view, src = w.renderer.domElement;
  const cv = document.createElement('canvas'); cv.className = 'lab-overlay';
  const cw = 80, ch = 60;
  cv.width = cw * scale; cv.height = ch * scale;
  Object.assign(cv.style, { right: '12px', bottom: '64px', width: `${(cw * scale) / devicePixelRatio}px`, height: `${(ch * scale) / devicePixelRatio}px`, boxShadow: '0 0 0 2px #ece2c8' });
  document.body.append(cv);
  const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false;
  const draw = () => {
    const self = w.view && w.actors.get(id || w.view.self.id);
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

function atlasCanvas(atlas: Atlas, chan: string) {
  const c = document.createElement('canvas'); c.width = atlas.width; c.height = atlas.height;
  const img = new ImageData(atlas.width, atlas.height), src = chan === 'normal' ? atlas.normal : atlas.color;
  for (let y = 0; y < atlas.height; y++) {
    const from = y * atlas.width * 4, to = (atlas.height - 1 - y) * atlas.width * 4;
    for (let i = 0; i < atlas.width * 4; i += 4) {
      img.data[to + i] = src[from + i]; img.data[to + i + 1] = src[from + i + 1]; img.data[to + i + 2] = src[from + i + 2]; img.data[to + i + 3] = atlas.color[from + i + 3];
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
  const rows: { label: string; id: string; anim: AnimName }[] = who && atlas.sheets.has(who as never)
    ? animOrder.map(a => ({ label: a, id: who, anim: a }))
    : ids.map(id => ({ label: atlas.sheets.get(id)!.figure.label, id, anim: anim === 'all' ? 'walk' : anim }));
  // Rows are cropped to what their frames use, so the scale can be as large as the window allows.
  const span = rows.map(r => { const s = atlas.sheets.get(r.id as never)!, fr = s.frames.slice(frameIndex(r.anim, 0, 0), frameIndex(r.anim, animFrames[r.anim] - 1, DIRS - 1) + 1); return { s, top: Math.max(...fr.map(f => f.top)) + 1, below: Math.max(...fr.map(f => f.below)) + 1 }; });
  const draw = (t: number) => {
    const W = Math.round(innerWidth * devicePixelRatio), H = Math.round(innerHeight * devicePixelRatio);
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d')!; g.imageSmoothingEnabled = false; g.clearRect(0, 0, W, H);
    const total = span.reduce((n, x) => n + x.top + x.below, 0), colW = Math.max(...span.map(x => x.s.cell.w));
    const S = zoom || Math.max(1, Math.floor(Math.min((H - 140) / total, (W - 220) / (colW * DIRS))));
    let y = 80;
    g.font = `600 ${13 * devicePixelRatio}px Inter Variable, sans-serif`; g.fillStyle = '#ece2c8'; g.textBaseline = 'middle';
    rows.forEach((r, ri) => {
      const { s, top, below } = span[ri], frames = animFrames[r.anim];
      const f = frame !== '' ? Math.min(frames - 1, Number(frame)) : Math.floor(t / (r.anim === 'idle' ? 600 : 200)) % frames;
      g.fillText(r.label, 16, y + (top * S) / 2);
      for (let d = 0; d < DIRS; d++) {
        const c = s.frames[frameIndex(r.anim, f, d)];
        const sy = atlas.height - (c.y + c.ay + top);
        g.drawImage(sheet, c.x, sy, c.w, top + below, 200 + d * colW * S + ((colW - c.w) * S) / 2, y, c.w * S, (top + below) * S);
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
