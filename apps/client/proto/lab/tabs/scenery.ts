// PROTOTYPE. Scenery tab: the zoom continuum's far end against the lookout panel fallback.
import type { TabContext } from '../main.ts';

export function mount(ctx: TabContext) {
  const mode = ctx.url.searchParams.get('scenery') ?? 'continuum';
  const group = document.createElement('div'); group.className = 'lab-group';
  ctx.picks.after(group);
  const apply = (m: string) => { ctx.view.setLookout(m === 'lookout'); if (m !== 'continuum' && ctx.view.stop.id === 'scenery') ctx.view.setStop('play'); };
  const draw = (current: string) => {
    group.innerHTML = '<span class="lab-label">Grandeur</span>';
    for (const [id, label] of [['continuum', 'Continuum'], ['lookout', 'Lookout panel'], ['neither', 'Neither']]) {
      const b = document.createElement('button'); b.textContent = label; b.setAttribute('aria-pressed', String(id === current));
      b.onclick = () => { ctx.url.searchParams.set('scenery', id); ctx.write(false); apply(id); draw(id); };
      group.append(b);
    }
  };
  apply(mode); draw(mode);
  const allow = ctx.view.canScenery.bind(ctx.view);
  ctx.view.canScenery = () => (ctx.url.searchParams.get('scenery') ?? 'continuum') === 'continuum' && allow();
}
