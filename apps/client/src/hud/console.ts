// The console under the view: channels as tabs (Local speech, Server log, Combat, NPC), colours by kind matching the
// text over the world, a "new messages" marker when scrolled up, and the say box with its history on the arrow keys.
import type { Notice } from '../../../../packages/game/src/model.ts';
import { core, npcAt } from './core.ts';
import { $, esc, glyph, patch } from './kit.ts';
import { floatText, lookLine, speak, statusLine } from './overlay.ts';
import { heardInfo } from './items.ts';

const tabs = [['local', 'Local'], ['server', 'Server log'], ['combat', 'Combat'], ['npc', 'NPC']] as const;
type Tab = (typeof tabs)[number][0];
let active: Tab = 'local';
const unread = new Set<Tab>();
/** Every notice this session, newest last, for the dialogue's recent lines. */
export const log: Notice[] = [];
const MAX = 300;

export function mountConsole(footer: HTMLElement) {
  footer.innerHTML = `<div class="con-top"><div class="con-tabs" role="tablist" aria-label="Channels" id="con-tabs"></div><nav class="hotbar" id="hotbar" aria-label="Actions"></nav></div>
    <div class="con-body"><div class="con-scroll"><ol class="con-lines" id="con-lines" aria-live="polite" data-tab="local"></ol><button type="button" class="btn small con-new" id="con-new" hidden>${glyph('arrow-down')}New messages</button></div><section class="talk" id="talk" aria-label="Conversation" hidden></section></div>
    <form class="con-say" id="chat" autocomplete="off"><input class="field" id="chat-input" maxlength="180" placeholder="Press Enter to speak" aria-label="Say something" spellcheck="false"><button type="submit" class="btn">Say</button></form>`;
  drawTabs();
  $('#con-tabs').addEventListener('click', e => { const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]')?.dataset.tab as Tab | undefined; if (t) show(t); });
  $('#con-tabs').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const i = tabs.findIndex(t => t[0] === active), n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length][0];
    show(n); $<HTMLElement>(`[data-tab="${n}"]`, $('#con-tabs')).focus(); e.preventDefault(); e.stopPropagation();
  });
  $('#con-lines').addEventListener('scroll', () => { if (atBottom()) $('#con-new').hidden = true; });
  $('#con-new').addEventListener('click', () => scrollDown());
  const input = $<HTMLInputElement>('#chat-input');
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault(); e.stopPropagation();
      if (!history.length) return;
      if (e.key === 'ArrowUp') recall = recall < 0 ? history.length - 1 : Math.max(0, recall - 1);
      else recall = recall < 0 ? -1 : recall + 1 >= history.length ? -1 : recall + 1;
      input.value = recall < 0 ? '' : history[recall];
    }
  });
}
const history: string[] = [];
let recall = -1;
/** A sent line goes to the end of the history; the same line twice is kept once. */
export function remember(text: string) { const i = history.indexOf(text); if (i >= 0) history.splice(i, 1); history.push(text); if (history.length > 50) history.shift(); recall = -1; }

function drawTabs() {
  patch($('#con-tabs'), tabs.map(([id, label]) => `<button type="button" role="tab" class="con-tab" data-tab="${id}" aria-selected="${active === id}" tabindex="${active === id ? 0 : -1}"${unread.has(id) ? ' data-unread="true"' : ''}>${label}</button>`).join(''));
}
/** Shows a channel (a conversation brings up the NPC channel). */
export function showChannel(t: Tab) { show(t); }
function show(t: Tab) { active = t; unread.delete(t); $('#con-lines').dataset.tab = t; drawTabs(); scrollDown(); }
const atBottom = () => { const ol = $('#con-lines'); return ol.scrollHeight - ol.scrollTop - ol.clientHeight < 8; };
function scrollDown() { const ol = $('#con-lines'); ol.scrollTop = ol.scrollHeight; $('#con-new').hidden = true; }
export function clearConsole() { log.length = 0; $('#con-lines').innerHTML = ''; unread.clear(); drawTabs(); }

/** "<Name>: <words>" as the server sends speech, split so the console can set the name apart and the bubble show the words. */
function speech(n: Notice) {
  const v = core.view;
  const name = n.from ? (v?.self.id === n.from ? v.self.name : v?.players.find(p => p.id === n.from)?.name) : n.npc ? npcAt(n.npc)?.name : undefined;
  if (name && n.text.startsWith(`${name}: `)) return { name, words: n.text.slice(name.length + 2) };
  if (n.kind === 'npc' && name) return { name, words: n.text };
  const i = n.text.indexOf(': ');
  return i > 0 ? { name: n.text.slice(0, i), words: n.text.slice(i + 2) } : { name: '', words: n.text };
}
function tabsOf(n: Notice): Tab[] {
  if (n.kind === 'say') return core.view?.self.talking && n.from === core.view.self.id ? ['local', 'npc'] : ['local'];
  if (n.kind === 'npc') return ['npc'];
  if (n.kind === 'combat') return ['combat'];
  return ['server'];
}

export function addNotice(n: Notice) {
  log.push(n); if (log.length > MAX) log.shift();
  const ol = $('#con-lines'), stick = atBottom();
  const li = document.createElement('li'), at = tabsOf(n), said = n.kind === 'say' || n.kind === 'npc' ? speech(n) : undefined;
  li.className = `m-${n.kind}`;
  li.dataset.tabs = at.join(' ');
  const time = new Date().toTimeString().slice(0, 5);
  li.innerHTML = `<time>${time}</time> ${said?.name ? `<b>${esc(said.name)}:</b> ${esc(said.words)}` : esc(n.text)}`;
  ol.append(li);
  while (ol.children.length > MAX) ol.firstElementChild!.remove();
  let mark = false;
  for (const t of at) if (t !== active && !unread.has(t)) { unread.add(t); mark = true; }
  if (mark) drawTabs();
  if (at.includes(active)) { if (stick) scrollDown(); else $('#con-new').hidden = false; }
  // Over the world, in the same colours.
  if (n.kind === 'level') floatText(innerWidth / 2, innerHeight * 0.42, n.text, 'level');
  if (n.kind === 'error') statusLine(n.text, 'warn');
  if (n.kind === 'combat') statusLine(n.text);
  if (n.kind === 'info') { lookLine(n.text); heardInfo(n.text); }
  if (said && (n.from || n.npc)) speak(n.from ?? n.npc!, said.name, said.words, n.kind);
}
