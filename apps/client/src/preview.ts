// Offline preview: runs a local engine so the Studio's Look tab can show real fights, and the real HUD, without a server.
import { Engine } from '../../../packages/game/src/engine.ts';
import { defaultBalance } from '../../../packages/game/src/default-balance.ts';
import { distance, type Action, type GameView, type MapData, type MobKind, type Notice, type Pos, type Hero } from '../../../packages/game/src/model.ts';

export const previewScenes: Record<string, { at: Pos; prey?: MobKind; label: string }> = {
  meadow: { at: { x: 40, y: 59, z: 0 }, prey: 'thornboar', label: 'Meadow fight' },
  square: { at: { x: 40, y: 34, z: 0 }, label: 'Market square' },
  undercroft: { at: { x: 57, y: 46, z: 1 }, prey: 'gutterRat', label: 'Undercroft' },
  shrine: { at: { x: 22, y: 22, z: 0 }, label: 'Inside the shrine' },
};

let timer = 0;
/** `dark` turns the darkness rule on, so creatures out of the light come through as shades (for checking input on them). */
export function startPreview(map: MapData, sceneId: string, out: { view: (v: GameView) => void; notice: (n: Notice) => void }, dark = false) {
  clearInterval(timer);
  const scene = previewScenes[sceneId] ?? previewScenes.meadow;
  const e = new Engine(map, dark ? { ...defaultBalance, world: { ...defaultBalance.world, darkness: true } } : defaultBalance);
  e.state.rng = 4242;
  const place = (p: Hero, dx: number, dy: number) => Object.assign(p, e.geo.near({ ...scene.at, x: scene.at.x + dx, y: scene.at.y + dy }, q => e.occupied(q, p.id)));
  const hero = e.createPlayer('Wayfarer of the Long Road'), friends = [e.createPlayer('Ash'), e.createPlayer('Mira')];
  place(hero, 0, 0); place(friends[0], -2, 1); place(friends[1], 2, -1);
  for (const p of [hero, ...friends]) { p.xp = 900; p.hp = e.stats(p).maxHp; }
  hero.xp = e.rules.xpAt(14) + 900; hero.melee = e.rules.meleeAt(31) + 40; hero.shielding = e.rules.shieldingAt(24) + 30; hero.magic = e.rules.magicAt(3) + 500;
  hero.hp = e.stats(hero).maxHp; hero.mana = e.stats(hero).maxMana;
  const pack = e.equipped(hero, 'pack');
  if (pack) for (const [k, n] of [['tail', 23], ['tonic', 4], ['tincture', 2], ['cheese', 3], ['tusk', 9]] as const) e.add(k, pack.id, e.freeSlot(pack.id), n);
  const hunt = (p: Hero) => {
    if (!scene.prey || (p.target && e.state.monsters[p.target]?.hp)) return;
    const m = Object.values(e.state.monsters).filter(m => m.hp > 0 && m.kind === scene.prey && m.z === p.z).sort((a, b) => distance(a, p) - distance(b, p))[0];
    if (m && distance(m, p) < 14) e.action(p, { kind: 'target', id: m.id });
  };
  timer = window.setInterval(() => {
    for (const p of [hero, ...friends]) { hunt(p); const s = e.stats(p); if (p.hp < s.maxHp * 0.4) p.hp = s.maxHp; p.fed = 60_000; }
    e.tick();
    for (const n of e.notices.splice(0)) if (n.player === hero.id) out.notice(n);
    out.view(e.view(hero));
  }, 100);
  return {
    /** Same shape as the network: actions apply to the local hero; refusals come back as notices. */
    send(a: Action) { try { e.action(hero, a); } catch (err) { out.notice({ player: hero.id, text: (err as Error).message, kind: 'error', at: e.state.time }); } return ''; },
  };
}
