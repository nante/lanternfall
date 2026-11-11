// The gate: the first thing a player sees, over the town behind it. The name on a plank, a line of welcome, and the
// way in: continue as the wayfarer saved in this browser, or start a new one.
import { $ } from './kit.ts';

export function mountGate(enter: (name: string, token?: string) => void) {
  document.body.insertAdjacentHTML('beforeend', `
<div class="gate" id="gate">
  <div class="gate-shade" aria-hidden="true"></div>
  <div class="gate-card">
    <div class="plank big"><h1>Lanternfall</h1></div>
    <p class="gate-kicker banner"><span>An evening at the edge of the wildwood</span></p>
    <p class="lede">A walled town under a lantern that never goes out. Rats in the cellars, beetles below them, and something soft and hungry below that.</p>
    <form id="join" class="frame gate-form">
      <div id="continue-wrap" hidden><button type="button" class="btn primary" id="continue">Continue as <span id="continue-name"></span></button><button type="button" class="btn link" id="new">New wayfarer</button></div>
      <div id="new-wrap"><label for="name">Your name</label><div class="row"><input class="field" id="name" name="name" minlength="2" maxlength="20" required autocomplete="nickname" spellcheck="false" placeholder="Wayfarer"><button class="btn primary" type="submit">Enter town</button></div></div>
      <p class="error" id="join-error" role="alert"></p>
    </form>
    <p class="keys"><kbd>Click</kbd> walk <kbd>Right-click</kbd> look, talk, open <kbd>WASD</kbd> step <kbd>1–7</kbd> actions <kbd>Enter</kbd> speak</p>
  </div>
</div>`);
  $('#join').addEventListener('submit', e => { e.preventDefault(); enter($<HTMLInputElement>('#name').value.trim() || 'Wayfarer'); });
  $('#continue').addEventListener('click', () => enter(localStorage.getItem('lanternfall.name') ?? 'Wayfarer', localStorage.getItem('lanternfall.token') ?? undefined));
  $('#new').addEventListener('click', () => { localStorage.removeItem('lanternfall.token'); showGate(); });
}
export function showGate(error = '') {
  $('#gate').hidden = false;
  const token = localStorage.getItem('lanternfall.token'), name = localStorage.getItem('lanternfall.name');
  $('#continue-wrap').hidden = !token;
  $('#new-wrap').hidden = !!token;
  $('#continue-name').textContent = name ?? 'wayfarer';
  $('#join-error').textContent = error;
  if (!token) $<HTMLInputElement>('#name').focus();
}
export const gateOpen = () => !$('#gate').hidden;
export function gateBusy(busy: boolean) { if (busy) $('#gate').dataset.busy = 'true'; else delete $('#gate').dataset.busy; }
