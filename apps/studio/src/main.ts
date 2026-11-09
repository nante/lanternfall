import '@fontsource-variable/inter';
import '@fontsource/silkscreen/400.css';
import './style.css';
import { Store, downloadJson, type DocName } from './store.ts';
import { h, toast, fill } from './ui.ts';
import { itemsView, creaturesView, spellsView, progressionView, merchantsView, type View } from './balance.ts';
import { iconsView } from './icons.ts';
import { texturesView } from './textures.ts';
import { simulateView } from './simulate.ts';
import { lookView } from './look.ts';
import { accountsView, accountsDirty } from './accounts.ts';

type Route = { id: string; label: string; group: string; doc: DocName | null; make: (ctx: Ctx) => View };
type Ctx = { store: Store; selected: string | null; select: (id: string) => void; go: (route: string) => void; params: URLSearchParams };

const routes: Route[] = [
  { id: 'items', label: 'Items', group: 'Balance', doc: 'balance', make: itemsView },
  { id: 'creatures', label: 'Creatures', group: 'Balance', doc: 'balance', make: creaturesView },
  { id: 'spells', label: 'Spells', group: 'Balance', doc: 'balance', make: spellsView },
  { id: 'progression', label: 'Progression', group: 'Balance', doc: 'balance', make: progressionView },
  { id: 'merchants', label: 'Merchants', group: 'Balance', doc: 'balance', make: merchantsView },
  { id: 'accounts', label: 'Accounts', group: 'World', doc: null, make: accountsView },
  { id: 'simulate', label: 'Fight lab', group: 'Simulate', doc: null, make: simulateView },
  { id: 'look', label: 'Look', group: 'Art', doc: 'style', make: lookView },
  { id: 'icons', label: 'Icons', group: 'Art', doc: 'icons', make: iconsView },
  { id: 'textures', label: 'Textures', group: 'Art', doc: null, make: texturesView },
  // PROTO:chrome — temporary tab for the game chrome prototype; delete with apps/client/proto/chrome
  { id: 'proto-chrome', label: 'Chrome (prototype)', group: 'Prototypes', doc: null, make: () => ({ el: h('div', { style: 'height:calc(100vh - 57px)' }, h('iframe', { class: 'game-frame', title: 'Game chrome prototype', src: 'http://127.0.0.1:4173/proto/chrome/' })) }) },
  // /PROTO:chrome
];

const store = new Store();
const app = document.getElementById('studio')!;
const nav = h('nav', { class: 'rail', 'aria-label': 'Sections' });
const head = h('header', { class: 'bar' });
const body = h('main', { class: 'body' });
const banner = h('div', { class: 'banner', role: 'status', hidden: true });
app.append(nav, h('div', { class: 'main' }, head, banner, body));

let view: View | undefined;
let current: Route = routes[0];
const selection = new Map<string, string>();

function parse() {
  const [path, query] = location.hash.slice(1).split('?');
  const [id, sel] = (path || 'items').split('/');
  return { route: routes.find(r => r.id === id) ?? routes[0], sel: sel ? decodeURIComponent(sel) : null, params: new URLSearchParams(query ?? '') };
}
const go = (target: string) => { location.hash = target; };

function render() {
  const { route, sel, params } = parse();
  if (sel) selection.set(route.id, sel);
  current = route;
  view?.destroy?.();
  const ctx: Ctx = { store, params, selected: selection.get(route.id) ?? null, select: id => go(`${route.id}/${encodeURIComponent(id)}`), go };
  try { view = route.make(ctx); }
  catch (e) { view = { el: h('div', { class: 'page' }, h('p', { class: 'warn' }, (e as Error).message)) }; }
  body.replaceChildren(view.el);
  drawNav(); drawHead(); drawBanner();
}

function drawNav() {
  let group = '';
  nav.replaceChildren(h('div', { class: 'brand' }, h('span', { class: 'mark', 'aria-hidden': 'true' }), h('div', {}, h('b', {}, 'Lanternfall'), h('small', {}, 'Studio'))));
  const ul = h('ul', {});
  for (const r of routes) {
    if (r.group !== group) { group = r.group; ul.append(h('li', { class: 'group' }, group)); }
    const dirty = r.doc && store.dirty(r.doc);
    ul.append(h('li', {}, h('a', { href: `#${r.id}`, 'aria-current': r === current ? 'page' : null }, r.label, dirty ? h('span', { class: 'dot', 'aria-label': 'unsaved changes' }) : null)));
  }
  nav.append(ul, h('div', { class: 'rail-foot' }, h('p', {}, 'Saving balance restarts the game server. Reload the game and press Continue to play with the new numbers.')));
}

function drawHead() {
  const doc = current.doc;
  const d = doc ? store.docs[doc] : undefined;
  const dirty = doc ? store.dirty(doc) : false;
  const issues = d?.issues.length ?? 0, warnings = d?.warnings.length ?? 0;
  fill(head,
    h('div', { class: 'title' }, h('h1', {}, current.label), doc ? h('span', { class: 'file' }, `content/${doc === 'style' ? 'render-style' : doc}.json`) : null),
    doc && d ? h('div', { class: 'status' },
      issues ? h('span', { class: 'pill bad' }, `${issues} problem${issues > 1 ? 's' : ''}`) : null,
      !issues && warnings ? h('button', { class: 'pill warnpill', onclick: () => toast(d.warnings.map(w => w.message).join('\n'), 'info') }, `${warnings} warning${warnings > 1 ? 's' : ''}`) : null,
      h('span', { class: `pill${dirty ? ' dirty' : ''}` }, d.saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Saved')) : null,
    doc && d ? h('div', { class: 'actions' },
      h('button', { class: 'ghost', disabled: !d.undo.length, onclick: () => store.undo(doc), title: 'Undo (⌘Z)' }, 'Undo'),
      h('button', { class: 'ghost', disabled: !d.redo.length, onclick: () => store.redo(doc), title: 'Redo (⇧⌘Z)' }, 'Redo'),
      h('button', { class: 'ghost', disabled: !dirty, onclick: () => store.revert(doc) }, 'Revert'),
      h('button', { class: 'primary', disabled: !dirty || !!issues || d.saving, onclick: () => save(doc), title: 'Save (⌘S)' }, 'Save')) : null);
}

function drawBanner() {
  const doc = current.doc, d = doc ? store.docs[doc] : undefined;
  banner.hidden = !d?.changedOnDisk;
  if (!d?.changedOnDisk || !doc) return;
  banner.replaceChildren(h('span', {}, `content/${doc === 'style' ? 'render-style' : doc}.json changed on disk outside this tab.`),
    h('button', { class: 'ghost', onclick: () => downloadJson(`${doc}-draft.json`, d.draft) }, 'Download my draft'),
    h('button', { class: 'primary', onclick: async () => { if (store.dirty(doc) && !confirm('Replace your unsaved changes with the file on disk?')) return; await store.reloadFromDisk(doc); toast('Reloaded from disk.', 'ok'); } }, 'Reload from disk'));
}

async function save(doc: DocName) {
  const r = await store.save(doc);
  if (r.ok) toast(r.unchanged ? 'Nothing changed.' : doc === 'balance' ? 'Saved. The game server restarts; reload the game and press Continue.' : doc === 'style' ? 'Saved. The game reloads with the new look.' : 'Saved. Reload the game to see the new icons.', 'ok');
  else toast(r.issues?.length ? `${r.message} ${r.issues.slice(0, 3).map(i => `${i.path}: ${i.message}`).join('; ')}` : r.message, 'error');
}

store.addEventListener('change', e => {
  const { name, replaced } = (e as CustomEvent<{ name: DocName; replaced: boolean }>).detail;
  if (replaced && current.doc === name) render();
  else { view?.update?.(); drawNav(); drawHead(); drawBanner(); }
});

addEventListener('keydown', e => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const k = e.key.toLowerCase();
  if (k === 's') { e.preventDefault(); if (current.doc && store.dirty(current.doc)) save(current.doc); return; }
  if (k === 'z' && current.doc && !(e.target as HTMLElement).closest('input[type=text], input[type=search], textarea')) { e.preventDefault(); e.shiftKey ? store.redo(current.doc) : store.undo(current.doc); }
});
addEventListener('beforeunload', e => { if (accountsDirty() || store.dirty('balance') || (store.docs.icons && store.dirty('icons')) || (store.docs.style && store.dirty('style'))) e.preventDefault(); });
addEventListener('hashchange', render);

if (import.meta.hot) import.meta.hot.on('studio:content-changed', ({ file }: { file: string }) => {
  if (file === 'balance.json') store.noticeDiskChange('balance');
  else if (file === 'icons.json') store.noticeDiskChange('icons');
  else if (file === 'render-style.json') store.noticeDiskChange('style');
  else window.dispatchEvent(new CustomEvent('studio:art-changed', { detail: file }));
});

Promise.all([store.load('balance'), store.load('icons'), store.load('style')]).then(render).catch(e => {
  app.replaceChildren(h('div', { class: 'fatal' }, h('h1', {}, 'Could not open the game content'), h('pre', {}, (e as Error).message)));
});
