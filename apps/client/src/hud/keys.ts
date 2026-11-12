// Keys: steps (held keys follow the real step time), 1 to 7, targeting, the view, windows, and Escape in order. Keys
// are ignored while typing or with Cmd, Ctrl or Alt; Space, Enter and Tab belong to the world only when it has focus.
import { core, serverNow } from './core.ts';
import { $ } from './kit.ts';
import { closeMenu, menuOpen } from './menu.ts';
import { runSlot } from './hotbar.ts';
import { cycleTarget, clearPending } from './world-input.ts';
import { closeNewest, togglePack } from './containers.ts';
import { menuIsOpen, openMenu } from './options.ts';
import { gateOpen } from './gate.ts';
import { countOpen } from './drag.ts';

const held = new Set<string>();
const dirs: Record<string, [number, number]> = {
  arrowup: [0, -1], w: [0, -1], arrowdown: [0, 1], s: [0, 1], arrowleft: [-1, 0], a: [-1, 0], arrowright: [1, 0], d: [1, 0],
  // The numpad's corner keys step diagonally (with Num Lock off they arrive as Home, Page Up, End, Page Down).
  numpad7: [-1, -1], numpad9: [1, -1], numpad1: [-1, 1], numpad3: [1, 1], numpad8: [0, -1], numpad2: [0, 1], numpad4: [-1, 0], numpad6: [1, 0],
};
/** The key name for steps: numpad keys by their position, the rest by what they type. */
const stepKey = (e: KeyboardEvent) => (e.code.startsWith('Numpad') && /\d$/.test(e.code) ? e.code.toLowerCase() : e.key.toLowerCase());
let lastStep = 0;
const typing = () => { const a = document.activeElement; return !!a && a.matches('input, textarea'); };
/** Something modal is up: the gate, the pause menu, a context menu or the count dialog. Held keys never walk behind it. */
const blocked = () => gateOpen() || menuIsOpen() || menuOpen() || countOpen();
function heldStep() {
  let dx = 0, dy = 0;
  for (const k of held) { const d = dirs[k]; if (d) { dx += d[0]; dy += d[1]; } }
  return core.world.walkStep(Math.sign(dx), Math.sign(dy));
}
function step(dx: number, dy: number) { if (!dx && !dy) return; lastStep = performance.now(); clearPending(); core.send({ kind: 'walk', dx, dy }); }
/** Focus is on the world (or nowhere): Space, Enter and Tab are the game's. On a button or a field they are the page's. */
const worldFocus = () => { const f = document.activeElement; return !f || f === document.body || f === core.world.renderer.domElement; };

export function wireKeys(o: { saveView: () => void; toggleVista: () => void; toggleWindow: (id: string) => void }) {
  setInterval(() => {
    const v = core.view;
    if (!v || !held.size || typing()) return;
    if (blocked()) { held.clear(); return; }
    const [dx, dy] = heldStep();
    // Send the next step as the current one is finishing, so held keys follow the real step time.
    if (serverNow() >= v.self.moveAt - 90 && performance.now() - lastStep > 120) step(dx, dy);
  }, 30);
  addEventListener('keydown', e => {
    // Cmd, Ctrl or Alt mean a browser or system shortcut; on macOS the key-up of a key pressed with Cmd never arrives.
    if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt') { held.clear(); return; }
    if (e.key === 'Escape' && menuOpen()) { closeMenu(); return; }
    if (blocked()) return;
    const input = $<HTMLInputElement>('#chat-input');
    if (document.activeElement === input) { if (e.key === 'Escape') { input.value = ''; input.blur(); core.world.renderer.domElement.focus(); } return; }
    if (typing()) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = stepKey(e), w = core.world, v = core.view;
    if (dirs[k]) {
      e.preventDefault();
      if (held.has(k)) return;
      held.add(k);
      // A tap steps at once: the poll alone can miss a key that is down for less than its interval.
      if (v) step(...heldStep());
      return;
    }
    const own = worldFocus();
    if (e.key === 'Enter') { if (!own) return; e.preventDefault(); input.focus(); return; }
    if (/^[1-7]$/.test(e.key)) { if (!e.repeat) runSlot(Number(e.key) - 1); return; }
    if (k === ' ' || k === 'tab') { if (!own) return; e.preventDefault(); if (!e.repeat) cycleTarget(); return; }
    if (k === 'i') { togglePack(); return; }
    if (k === 'c') { o.toggleWindow('skills'); return; }
    if (k === 'm') { o.toggleWindow('map'); return; }
    if (k === 'g') { o.toggleWindow('gear'); return; }
    if (k === 'b') { o.toggleWindow('battle'); return; }
    if (k === 'j') { o.toggleWindow('journal'); return; }
    if (e.key === '-') { w.stepStop(1); return; }
    if (e.key === '=' || e.key === '+') { w.stepStop(-1); return; }
    if (k === 'q' || k === 'e') { w.turn(k === 'q' ? 1 : -1); o.saveView(); return; }
    if (k === 'v') { o.toggleVista(); return; }
    if (e.key === 'Escape') {
      // First stop walking, then close the newest window, then end a conversation, then drop the target, then pause.
      if (v?.route.length) core.send({ kind: 'stop' });
      else if (closeNewest()) { /* closed */ }
      else if (v?.self.talking) core.send({ kind: 'talk', npc: null });
      else if (v?.self.target) core.send({ kind: 'target', id: null });
      else { held.clear(); openMenu('pause'); }
      core.redraw();
    }
  });
  addEventListener('keyup', e => { held.delete(stepKey(e)); held.delete(e.key.toLowerCase()); if (e.key === 'Meta') held.clear(); });
  addEventListener('blur', () => held.clear());
}
