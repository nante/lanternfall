// PROTOTYPE. A local Engine like src/preview.ts, but the Engine is exposed so the lab can drive time and scenes.
import { Engine } from '../../../../packages/game/src/engine.ts';
import { defaultBalance } from '../../../../packages/game/src/default-balance.ts';
import { distance, type Action, type GameView, type MapData, type MobKind, type Notice, type Pos, type Hero } from '../../../../packages/game/src/model.ts';

export type Place = { at: Pos; prey?: MobKind; label: string };
export const places: Record<string, Place> = {
  meadow: { at: { x: 40, y: 59, z: 0 }, prey: 'thornboar', label: 'Meadow' },
  gate: { at: { x: 40, y: 52, z: 0 }, label: 'South gate' },
  market: { at: { x: 40, y: 34, z: 0 }, label: 'Market' },
  bridge: { at: { x: 40, y: 9, z: 0 }, label: 'North bridge' },
  shrine: { at: { x: 22, y: 24, z: 0 }, label: 'Shrine' },
  steps: { at: { x: 23, y: 29, z: 0 }, label: 'Shrine steps' },
  spire: { at: { x: 23, y: 12, z: 0 }, label: 'North of the Spire' },
  wood: { at: { x: 91, y: 44, z: 0 }, label: 'Whisperwood' },
  chapel: { at: { x: 93, y: 27, z: 0 }, label: 'Fallen chapel' },
  woodedge: { at: { x: 82, y: 57, z: 0 }, label: 'Meadow by the wood' },
  undercroft: { at: { x: 57, y: 46, z: 1 }, prey: 'gutterRat', label: 'Undercroft' },
};

export function startLab(map: MapData, placeId: string, opts: { hunt: boolean; tickMs?: number }, out: (v: GameView, e: Engine, hero: Hero) => void) {
  const place = places[placeId] ?? places.meadow;
  // A private copy, so the lab can change world settings (darkness, day offset) on a live engine.
  const balance = structuredClone(defaultBalance);
  const e = new Engine(map, balance);
  e.state.rng = 4242;
  const put = (p: Hero, dx: number, dy: number) => Object.assign(p, e.geo.near({ ...place.at, x: place.at.x + dx, y: place.at.y + dy }, q => e.occupied(q, p.id)));
  const hero = e.createPlayer('Wayfarer'), friends = [e.createPlayer('Ash'), e.createPlayer('Mira')];
  put(hero, 0, 0); put(friends[0], -2, 1); put(friends[1], 2, -1);
  for (const p of [hero, ...friends]) { p.xp = 900; p.hp = e.stats(p).maxHp; }
  hero.xp = e.rules.xpAt(14) + 900; hero.melee = e.rules.meleeAt(31) + 40; hero.shielding = e.rules.shieldingAt(24) + 30; hero.magic = e.rules.magicAt(3) + 500;
  hero.hp = e.stats(hero).maxHp; hero.mana = e.stats(hero).maxMana;
  const hunt = (p: Hero) => {
    if (!opts.hunt || !place.prey || (p.target && e.state.monsters[p.target]?.hp)) return;
    const m = Object.values(e.state.monsters).filter(m => m.hp > 0 && m.kind === place.prey && m.z === p.z).sort((a, b) => distance(a, p) - distance(b, p))[0];
    // Under darkness the rule may refuse a target the hunter cannot see; that must not stall the tick.
    if (m && distance(m, p) < 14) try { e.action(p, { kind: 'target', id: m.id }); } catch { /* refused: unseen */ }
  };
  const notices: Notice[] = [];
  const players = [hero, ...friends];
  let observer = hero;
  const timer = window.setInterval(() => {
    for (const p of [hero, ...friends]) { hunt(p); const s = e.stats(p); if (p.hp < s.maxHp * 0.4) p.hp = s.maxHp; p.fed = 60_000; }
    e.tick();
    for (const n of e.notices.splice(0)) if (n.player === observer.id) notices.push(n);
    out(e.view(observer), e, observer);
  }, opts.tickMs ?? 100);
  /** Same shape as the network: actions apply to the observed hero; refusals come back as notices. */
  const send = (a: Action) => { try { e.action(observer, a); } catch (err) { notices.push({ player: observer.id, text: (err as Error).message, kind: 'error', at: e.state.time }); } };
  const look = (at: Pos, actor?: string) => notices.push({ player: observer.id, text: e.describe(observer, at, actor), kind: 'info', at: e.state.time });
  return { engine: e, balance, hero, players, notices, send, look, observe: (p: Hero) => { observer = p; }, stop: () => clearInterval(timer) };
}
