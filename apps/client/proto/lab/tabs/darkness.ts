import { equipSlots } from '../../../../../packages/game/src/model.ts';
import { carriedTorches } from '../../../../../packages/game/src/light.ts';
import type { TabContext } from '../main.ts';

export function mount(ctx: TabContext) {
  // The harness auto-hunts without handling rejected targets; keep the scene under manual control.
  if (ctx.url.searchParams.get('hunt') !== '0' || ctx.url.searchParams.get('torch') === '1') {
    ctx.url.searchParams.set('hunt', '0');
    ctx.url.searchParams.set('torch', '0');
    location.replace(ctx.url.toString());
    return;
  }
  const { engine, balance, hero, players } = ctx.lab;
  const mira = players.find(p => p.name === 'Mira');
  if (!mira) return;
  let rule = ctx.url.searchParams.get('darkness') === '1';
  let torch = ctx.url.searchParams.get('darktorch') === '1';
  let observer = ctx.url.searchParams.get('observer') === 'mira' ? 'mira' : 'wayfarer';

  // The rule-off view intentionally has no lights field, but the same real torches still light the lab picture.
  const setWorld = ctx.view.setWorld.bind(ctx.view);
  ctx.view.setWorld = (time, world) => {
    // With the rule on, the server decides which torches the observer may know about (view.lights); add none here.
    ctx.view.carried = rule ? [] : carriedTorches(players.filter(p => engine.present(p)), Object.values(engine.state.items), balance);
    setWorld(time, world);
  };

  const equipTorch = (on: boolean) => {
    let item = engine.carried(hero).find(i => i.kind === 'torch');
    if (on && !item) {
      engine.give(hero, 'torch', 1);
      item = engine.carried(hero).find(i => i.kind === 'torch');
    }
    if (!item) return;
    const equipped = item.parent === `equip:${hero.id}`;
    if (on === equipped) return;
    const pack = engine.equipped(hero, 'pack');
    if (!pack) return;
    engine.action(hero, { kind: 'moveItem', id: item.id, parent: on ? `equip:${hero.id}` : pack.id,
      slot: on ? equipSlots.indexOf('shield') : engine.freeSlot(pack.id), count: 1, version: item.version });
  };
  const group = document.createElement('div');
  group.className = 'lab-group';
  ctx.picks.after(group);
  // The Light tab's visual-only torch would disagree with the server rule here.
  const hideVisualTorch = () => {
    for (const button of document.querySelectorAll<HTMLButtonElement>('.lab-group button')) {
      if (button.textContent === 'Torch' && button.parentElement !== group) button.hidden = true;
    }
  };
  hideVisualTorch();
  new MutationObserver(hideVisualTorch).observe(ctx.picks.parentElement!, { childList: true, subtree: true });
  const apply = () => {
    balance.world.darkness = rule;
    equipTorch(torch);
    ctx.lab.observe(observer === 'mira' ? mira : hero);
  };
  const draw = () => {
    group.innerHTML = '<span class="lab-label">Darkness</span>';
    const button = (label: string, active: boolean, pick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label; b.setAttribute('aria-pressed', String(active));
      b.onclick = () => { pick(); apply(); ctx.write(false); draw(); };
      group.append(b);
    };
    button('Rule off', !rule, () => { rule = false; ctx.url.searchParams.set('darkness', '0'); });
    button('Rule on', rule, () => { rule = true; ctx.url.searchParams.set('darkness', '1'); });
    button('Torch', torch, () => { torch = !torch; ctx.url.searchParams.set('darktorch', torch ? '1' : '0'); });
    button('Wayfarer', observer === 'wayfarer', () => { observer = 'wayfarer'; ctx.url.searchParams.set('observer', observer); });
    button('Mira', observer === 'mira', () => { observer = 'mira'; ctx.url.searchParams.set('observer', observer); });
  };
  ctx.url.searchParams.set('darkness', rule ? '1' : '0');
  ctx.url.searchParams.set('darktorch', torch ? '1' : '0');
  ctx.url.searchParams.set('observer', observer);
  apply(); draw(); ctx.write(false);
}
