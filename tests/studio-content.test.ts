import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';
import { PNG } from 'pngjs';
import { contentApi } from '../apps/studio/server/content-api.ts';

let nextPort = 4231;
async function harness() {
  const PORT = nextPort++;
  const root = mkdtempSync(join(tmpdir(), 'studio-'));
  const content = join(root, 'content'), backups = join(root, 'backups');
  mkdirSync(content);
  writeFileSync(join(content, 'balance.json'), readFileSync('content/balance.json'));
  writeFileSync(join(content, 'icons.json'), readFileSync('content/icons.json'));
  const api = contentApi({ contentRoot: content, backupRoot: backups, port: PORT });
  const server: Server = createServer((req, res) => api(req, res, () => { res.statusCode = 404; res.end(); }));
  await new Promise<void>(r => server.listen(PORT, '127.0.0.1', r));
  const call = (path: string, init: RequestInit = {}) => fetch(`http://127.0.0.1:${PORT}${path}`, init);
  return { content, backups, call, close: () => new Promise(r => server.close(r)) };
}
const png = (w: number, h: number, alpha = 255) => { const p = new PNG({ width: w, height: h }); for (let i = 0; i < p.data.length; i += 4) p.data.set([90, 120, 80, alpha], i); return new Blob([new Uint8Array(PNG.sync.write(p))], { type: 'image/png' }); };

test('saving balance: validation, conflicts, backup and atomic replace', async () => {
  const t = await harness();
  try {
    const { data, revision } = await (await t.call('/api/content/balance')).json();
    const put = (body: unknown) => t.call('/api/content/balance', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const bad = structuredClone(data); bad.items.cudgel.buy = -5;
    assert.equal((await put({ baseRevision: revision, data: bad })).status, 422);
    assert.deepEqual(JSON.parse(readFileSync(join(t.content, 'balance.json'), 'utf8')), data, 'invalid data leaves the file untouched');
    const good = structuredClone(data); good.items.cudgel.buy = 9;
    const [a, b] = await Promise.all([put({ baseRevision: revision, data: good }), put({ baseRevision: revision, data: { ...good, items: { ...good.items, cap: { ...good.items.cap, buy: 7 } } } })]);
    assert.deepEqual([a.status, b.status].sort(), [200, 409], 'two saves of the same revision: one wins, one conflicts');
    assert.equal(JSON.parse(readFileSync(join(t.backups, 'balance.previous'), 'utf8')).items.cudgel.buy, 8, 'backup holds the previous bytes');
    const missingIcon = structuredClone(data); missingIcon.items.cudgel.icon = 'nope';
    const fresh = (await (await t.call('/api/content/balance')).json()).revision;
    const r = await put({ baseRevision: fresh, data: missingIcon });
    assert.equal(r.status, 422);
    assert.match(JSON.stringify(await r.json()), /nope/);
  } finally { await t.close(); }
});

test('textures: exact size, opaque, revision checked, removable', async () => {
  const t = await harness();
  try {
    const put = (bytes: Blob, expected: string) => t.call('/api/art/ground.cobble', { method: 'PUT', headers: { 'content-type': 'image/png', 'x-expected-revision': expected }, body: bytes });
    assert.equal((await put(png(48, 48), 'none')).status, 422, 'wrong size');
    assert.equal((await put(png(64, 64, 128), 'none')).status, 422, 'partial alpha');
    assert.equal((await put(new Blob(['not a png at all, just text padding....'], { type: 'image/png' }), 'none')).status, 422, 'garbage');
    const ok = await put(png(64, 64), 'none');
    assert.equal(ok.status, 200);
    const { revision } = await ok.json();
    assert.ok(existsSync(join(t.content, 'art/ground/cobble.png')));
    assert.equal((await put(png(64, 64), 'none')).status, 409, 'stale expectation');
    assert.equal((await t.call('/api/art/ground.lava', { method: 'PUT', headers: { 'content-type': 'image/png', 'x-expected-revision': 'none' }, body: png(64, 64) })).status, 404);
    assert.equal((await t.call('/api/art/ground.cobble', { method: 'DELETE', headers: { 'x-expected-revision': revision } })).status, 200);
    assert.ok(!existsSync(join(t.content, 'art/ground/cobble.png')));
    assert.ok(existsSync(join(t.backups, 'ground.cobble.previous')));
  } finally { await t.close(); }
});

test('writes from another origin or host are refused', async () => {
  const t = await harness();
  try {
    const r = await t.call('/api/content/balance', { method: 'PUT', headers: { 'content-type': 'application/json', origin: 'http://evil.example' }, body: '{}' });
    assert.equal(r.status, 403);
  } finally { await t.close(); }
});
