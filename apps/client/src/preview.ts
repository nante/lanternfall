// Offline preview: runs a local engine so the Studio's Look tab can show real fights without a server.
import { Engine } from '../../../packages/game/src/engine.ts';
import { defaultBalance } from '../../../packages/game/src/default-balance.ts';
import { distance, type MapData, type MobKind, type Pos, type Hero } from '../../../packages/game/src/model.ts';
import type { WorldView } from './render/view.ts';

export const previewScenes: Record<string, { at: Pos; prey?: MobKind; label: string }> = {
  meadow: { at: { x: 40, y: 59, z: 0 }, prey: 'thornboar', label: 'Meadow fight' },
  square: { at: { x: 40, y: 34, z: 0 }, label: 'Market square' },
  undercroft: { at: { x: 57, y: 46, z: 1 }, prey: 'gutterRat', label: 'Undercroft' },
  shrine: { at: { x: 22, y: 22, z: 0 }, label: 'Inside the shrine' },
};

let timer = 0;
export function startPreview(world: WorldView, map: MapData, sceneId: string) {
  clearInterval(timer);
  const scene = previewScenes[sceneId] ?? previewScenes.meadow;
  const e = new Engine(map, defaultBalance);
  e.state.rng = 4242;
  const place = (p: Hero, dx: number, dy: number) => Object.assign(p, e.geo.near({ ...scene.at, x: scene.at.x + dx, y: scene.at.y + dy }, q => e.occupied(q, p.id)));
  const hero = e.createPlayer('Wayfarer'), friends = [e.createPlayer('Ash'), e.createPlayer('Mira')];
  place(hero, 0, 0); place(friends[0], -2, 1); place(friends[1], 2, -1);
  for (const p of [hero, ...friends]) { p.xp = 900; p.hp = e.stats(p).maxHp; }
  const hunt = (p: Hero) => {
    if (!scene.prey || (p.target && e.state.monsters[p.target]?.hp)) return;
    const m = Object.values(e.state.monsters).filter(m => m.hp > 0 && m.kind === scene.prey && m.z === p.z).sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (m && distance(m, p) < 14) e.action(p, { kind: 'target', id: m.id });
  };
  timer = window.setInterval(() => {
    for (const p of [hero, ...friends]) { hunt(p); const s = e.stats(p); if (p.hp < s.maxHp * 0.4) p.hp = s.maxHp; p.fed = 60_000; }
    e.tick();
    e.notices.length = 0;
    world.update(e.view(hero));
  }, 100);
}
