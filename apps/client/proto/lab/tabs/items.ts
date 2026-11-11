// PROTOTYPE. Items tab: items lying on the floor around the hero, lit by the scene.
// `pile=show` (a sword, a gem, a potion and a loaf, and a three-item pile) or `pile=all` (every kind in rows).
import type { TabContext } from '../main.ts';
import { itemKinds, type ItemKind } from '../../../../../packages/game/src/ids.ts';
import { groundKey } from '../../../../../packages/game/src/engine.ts';

export function mount(ctx: TabContext) {
  const { lab, url } = ctx, e = lab.engine, at = lab.hero;
  const lay = (kind: ItemKind, dx: number, dy: number) => { const p = { x: at.x + dx, y: at.y + dy, z: at.z }; e.add(kind, groundKey(p), e.children(groundKey(p)).length); };
  if ((url.searchParams.get('pile') ?? 'show') === 'all') itemKinds.forEach((k, i) => lay(k, (i % 15) - 7, -2 - Math.floor(i / 15)));
  else {
    lay('shortsword', -2, -2); lay('sapphire', -1, -2); lay('tonic', 0, -2); lay('loaf', 1, -2);
    for (const k of ['gold', 'mace', 'greattincture'] as const) lay(k, 3, -3);
  }
}
