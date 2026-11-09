import { Balance, Icons, RenderStyle, balanceWarnings, type Warning } from '../../../packages/game/src/content-schema.ts';

export type Issue = { path: string; message: string };
type Docs = { balance: Balance; icons: Icons; style: RenderStyle };
export type DocName = keyof Docs;
export type DocState<T> = { saved: T; draft: T; revision: string; issues: Issue[]; warnings: Warning[]; undo: T[]; redo: T[]; changedOnDisk: boolean; saving: boolean; lastEdit: { key: string; at: number } | null };

const validators = { balance: Balance, icons: Icons, style: RenderStyle };
const clone = <T,>(v: T): T => structuredClone(v);

export class Store extends EventTarget {
  docs: { [K in DocName]?: DocState<Docs[K]> } = {};

  async load(name: DocName) {
    const res = await fetch(`/api/content/${name}`);
    const body = await res.json() as { data: unknown; revision: string; issues: Issue[]; message?: string };
    if (!res.ok) throw new Error(body.message ?? `Could not load ${name}`);
    if (body.issues.length) throw new Error(`content/${name}.json has problems:\n${body.issues.map(i => `${i.path}: ${i.message}`).join('\n')}`);
    const data = body.data as Docs[typeof name];
    (this.docs as Record<string, DocState<unknown>>)[name] = { saved: clone(data), draft: clone(data), revision: body.revision, issues: [], warnings: [], undo: [], redo: [], changedOnDisk: false, saving: false, lastEdit: null };
    this.validate(name);
    this.emit(name);
  }
  get<K extends DocName>(name: K) { const d = this.docs[name]; if (!d) throw new Error(`${name} is not loaded`); return d as DocState<Docs[K]>; }
  dirty(name: DocName) { const d = this.docs[name]; return !!d && JSON.stringify(d.saved) !== JSON.stringify(d.draft); }

  /** Apply an edit. Rapid edits to the same field (typing) collapse into one undo step. */
  edit<K extends DocName>(name: K, mutate: (draft: Docs[K]) => void, groupKey?: string) {
    const d = this.get(name), now = performance.now();
    const grouped = groupKey && d.lastEdit?.key === groupKey && now - d.lastEdit.at < 900;
    if (!grouped) { d.undo.push(clone(d.draft)); if (d.undo.length > 200) d.undo.shift(); }
    d.redo = [];
    mutate(d.draft);
    d.lastEdit = groupKey ? { key: groupKey, at: now } : null;
    this.validate(name);
    this.emit(name);
  }
  undo(name: DocName) { const d = this.get(name); const prev = d.undo.pop(); if (!prev) return; d.redo.push(clone(d.draft)); d.draft = prev as never; d.lastEdit = null; this.validate(name); this.emit(name, true); }
  redo(name: DocName) { const d = this.get(name); const next = d.redo.pop(); if (!next) return; d.undo.push(clone(d.draft)); d.draft = next as never; d.lastEdit = null; this.validate(name); this.emit(name, true); }
  revert(name: DocName) { const d = this.get(name); if (!this.dirty(name)) return; d.undo.push(clone(d.draft)); d.draft = clone(d.saved) as never; this.validate(name); this.emit(name, true); }

  validate(name: DocName) {
    const d = this.get(name);
    const r = validators[name].safeParse(d.draft);
    d.issues = r.success ? [] : r.error.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message }));
    d.warnings = name === 'balance' && r.success ? balanceWarnings(r.data as Balance) : [];
  }

  async save(name: DocName): Promise<{ ok: true; unchanged?: boolean } | { ok: false; message: string; issues?: Issue[]; conflict?: boolean }> {
    const d = this.get(name);
    if (d.issues.length) return { ok: false, message: 'Fix the highlighted fields first.', issues: d.issues };
    d.saving = true; this.emit(name);
    try {
      const res = await fetch(`/api/content/${name}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ baseRevision: d.revision, data: d.draft }) });
      const body = await res.json() as { revision?: string; unchanged?: boolean; message?: string; issues?: Issue[] };
      if (res.status === 409) { d.changedOnDisk = true; return { ok: false, conflict: true, message: 'The file changed on disk. Reload it, or download your draft first.' }; }
      if (!res.ok) return { ok: false, message: body.message ?? 'Save failed.', issues: body.issues };
      d.saved = clone(d.draft); d.revision = body.revision!; d.changedOnDisk = false;
      return { ok: true, unchanged: body.unchanged };
    } catch (e) {
      return { ok: false, message: `Save failed: ${(e as Error).message}` };
    } finally { d.saving = false; this.emit(name); }
  }

  /** Called when the dev server reports a content file changed. Our own saves land here too. */
  async noticeDiskChange(name: DocName) {
    const d = this.docs[name]; if (!d) return;
    const res = await fetch(`/api/content/${name}`); const body = await res.json() as { revision: string };
    if (body.revision !== d.revision) { d.changedOnDisk = true; this.emit(name); }
  }
  async reloadFromDisk(name: DocName) { await this.load(name); this.emit(name, true); }

  emit(name: DocName, replaced = false) { this.dispatchEvent(new CustomEvent('change', { detail: { name, replaced } })); }
}

export function downloadJson(name: string, data: unknown) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' }));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
