import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile, lstat, open } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { PNG } from 'pngjs';
import { Balance, Icons, RenderStyle, missingIcons, balanceWarnings } from '../../../packages/game/src/content-schema.ts';
import { artSlot, artSlots } from '../../../packages/game/src/art-slots.ts';

type Next = (err?: unknown) => void;
const JSON_LIMIT = 1 << 20, PNG_LIMIT = 256 << 10;
const docs = { balance: 'balance.json', icons: 'icons.json', style: 'render-style.json' } as const;
const schemas = { balance: Balance, icons: Icons, style: RenderStyle };
type Doc = keyof typeof docs;
export type Issue = { path: string; message: string };

export const revisionOf = (bytes: Buffer | null) => (bytes ? createHash('sha256').update(bytes).digest('hex').slice(0, 16) : null);
const zodIssues = (e: { issues: { path: PropertyKey[]; message: string }[] }): Issue[] => e.issues.map(i => ({ path: i.path.map(String).join('.'), message: i.message }));

export function contentApi(opts: { contentRoot: string; backupRoot: string; port: number }) {
  const contentRoot = resolve(opts.contentRoot), backupRoot = resolve(opts.backupRoot);
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>) => { const run = queue.then(fn, fn); queue = run.catch(() => undefined); return run; };

  async function safePath(root: string, rel: string) {
    const full = resolve(root, rel);
    if (!full.startsWith(root + sep)) throw new HttpError(400, 'Path escapes the content folder');
    for (let p = full; p.startsWith(root + sep); p = dirname(p)) {
      try { if ((await lstat(p)).isSymbolicLink()) throw new HttpError(400, `Refusing to write through a symlink: ${p}`); } catch (e) { if (e instanceof HttpError) throw e; }
    }
    return full;
  }
  const readOrNull = async (path: string) => { try { return await readFile(path); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } };

  async function replace(rel: string, bytes: Buffer | null, backupName: string) {
    const target = await safePath(contentRoot, rel);
    const previous = await readOrNull(target);
    if (previous) {
      await mkdir(backupRoot, { recursive: true });
      const backup = join(backupRoot, `${backupName}.previous`), tmp = `${backup}.${randomBytes(4).toString('hex')}.tmp`;
      await writeFile(tmp, previous); await rename(tmp, backup);
    }
    if (bytes === null) { if (previous) await rm(target); return null; }
    await mkdir(dirname(target), { recursive: true });
    const tmp = `${target}.${randomBytes(4).toString('hex')}.tmp`;
    const fh = await open(tmp, 'wx');
    try { await fh.writeFile(bytes); await fh.sync(); } finally { await fh.close(); }
    try { await rename(tmp, target); } catch (e) { await rm(tmp, { force: true }); throw e; }
    return revisionOf(bytes);
  }

  async function readDoc(doc: Doc) {
    const bytes = await readOrNull(join(contentRoot, docs[doc]));
    if (!bytes) throw new HttpError(500, `content/${docs[doc]} is missing`);
    let data: unknown;
    try { data = JSON.parse(bytes.toString('utf8')); } catch (e) { return { data: null, revision: revisionOf(bytes), issues: [{ path: '', message: `Not valid JSON: ${(e as Error).message}` }] }; }
    const parsed = schemas[doc].safeParse(data);
    return { data, revision: revisionOf(bytes), issues: parsed.success ? [] : zodIssues(parsed.error), warnings: doc === 'balance' && parsed.success ? balanceWarnings(parsed.data as Balance) : [] };
  }

  async function validateDoc(doc: Doc, data: unknown) {
    const parsed = schemas[doc].safeParse(data);
    if (!parsed.success) return zodIssues(parsed.error);
    if (doc === 'style') return [];
    const other = await readDoc(doc === 'balance' ? 'icons' : 'balance');
    if (other.issues.length) return [];
    const balance = (doc === 'balance' ? parsed.data : other.data) as Balance, icons = (doc === 'icons' ? parsed.data : other.data) as Icons;
    return missingIcons(balance, icons).map(name => ({ path: doc === 'icons' ? name : 'items', message: `Icon "${name}" is needed by the game but missing from icons.json` }));
  }

  function decodePng(bytes: Buffer, w: number, h: number, mode: 'opaque' | 'binary') {
    if (bytes.length < 33 || bytes.readUInt32BE(0) !== 0x89504e47) throw new HttpError(422, 'Not a PNG file');
    const iw = bytes.readUInt32BE(16), ih = bytes.readUInt32BE(20);
    if (iw !== w || ih !== h) throw new HttpError(422, `Image is ${iw}×${ih}; this slot needs exactly ${w}×${h}`);
    let png: PNG;
    try { png = PNG.sync.read(bytes); } catch (e) { throw new HttpError(422, `PNG could not be decoded: ${(e as Error).message}`); }
    if (png.width !== w || png.height !== h) throw new HttpError(422, `Image is ${png.width}×${png.height}; this slot needs exactly ${w}×${h}`);
    for (let i = 3; i < png.data.length; i += 4) {
      const a = png.data[i];
      if (mode === 'opaque' && a !== 255) throw new HttpError(422, 'Textures must be fully opaque');
      if (mode === 'binary' && a !== 0 && a !== 255) throw new HttpError(422, 'Partial transparency is not supported');
    }
    return PNG.sync.write(png, { colorType: 6 });
  }

  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (!url.pathname.startsWith('/api/')) return next();
    const send = (status: number, payload: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(JSON.stringify(payload)); };
    try {
      checkOrigin(req, opts.port);
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[1] === 'content' && parts[2] in docs && parts.length === 3) {
        const doc = parts[2] as Doc;
        if (req.method === 'GET') return send(200, await readDoc(doc));
        if (req.method === 'PUT') {
          const input = JSON.parse((await body(req, JSON_LIMIT, 'application/json')).toString('utf8')) as { baseRevision?: string; data?: unknown };
          { const [status, payload] = await serial(async (): Promise<[number, unknown]> => {
            const current = await readOrNull(join(contentRoot, docs[doc]));
            if (revisionOf(current) !== input.baseRevision) return [409, { error: 'conflict', message: 'The file changed on disk since you loaded it.', revision: revisionOf(current) }];
            const issues = await validateDoc(doc, input.data);
            if (issues.length) return [422, { error: 'invalid', issues }];
            const bytes = Buffer.from(JSON.stringify(input.data, null, doc === 'icons' ? 1 : 2) + '\n');
            if (current && bytes.equals(current)) return [200, { revision: revisionOf(current), unchanged: true }];
            if (revisionOf(await readOrNull(join(contentRoot, docs[doc]))) !== input.baseRevision) return [409, { error: 'conflict', message: 'The file changed while saving.' }];
            return [200, { revision: await replace(docs[doc], bytes, doc) }];
          }); return send(status, payload); }
        }
      }
      if (parts[1] === 'art' && parts.length === 2 && req.method === 'GET') {
        return send(200, await Promise.all(artSlots.map(async s => ({ ...s, revision: revisionOf(await readOrNull(join(contentRoot, s.path))) }))));
      }
      if (parts[1] === 'art' && parts.length === 3) {
        const slot = artSlot(parts[2]);
        if (!slot) throw new HttpError(404, 'Unknown texture slot');
        const path = join(contentRoot, slot.path);
        if (req.method === 'GET') {
          const bytes = await readOrNull(path);
          if (!bytes) return send(404, { error: 'This slot uses the generated texture' });
          res.setHeader('content-type', 'image/png'); res.setHeader('cache-control', 'no-store'); return res.end(bytes);
        }
        const expected = req.headers['x-expected-revision'];
        if (typeof expected !== 'string') throw new HttpError(428, 'Missing x-expected-revision');
        const bytes = req.method === 'PUT' ? decodePng(await body(req, PNG_LIMIT, 'image/png'), slot.width, slot.height, 'opaque') : req.method === 'DELETE' ? null : undefined;
        if (bytes === undefined) throw new HttpError(405, 'Method not allowed');
        { const [status, payload] = await serial(async (): Promise<[number, unknown]> => {
          const current = revisionOf(await readOrNull(path)) ?? 'none';
          if (current !== expected) return [409, { error: 'conflict', message: 'The texture changed on disk since you loaded it.', revision: current }];
          return [200, { revision: await replace(slot.path, bytes, slot.id) ?? 'none' }];
        }); return send(status, payload); }
      }
      if (parts[1] === 'png-check' && req.method === 'POST') {
        // Lets the browser confirm an icon PNG decodes the same way the server would.
        const w = Number(url.searchParams.get('w')), h = Number(url.searchParams.get('h'));
        decodePng(await body(req, PNG_LIMIT, 'image/png'), w, h, 'binary');
        return send(200, { ok: true });
      }
      throw new HttpError(404, 'Not found');
    } catch (e) {
      // Drain any unread upload so the client sees the error instead of a reset connection.
      if (!req.readableEnded) { req.resume(); await new Promise(r => { req.once('end', r); req.once('error', r); setTimeout(r, 2000); }); }
      if (e instanceof HttpError) return send(e.status, { error: 'request', message: e.message });
      if (e instanceof SyntaxError) return send(400, { error: 'request', message: 'Body is not valid JSON' });
      console.error(e);
      return send(500, { error: 'io', message: (e as Error).message });
    }
  };
}

/** Only the Studio page itself may call the API: right Host (no DNS rebinding) and, for writes, same origin. */
export function checkOrigin(req: IncomingMessage, port: number) {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(req.headers.host ?? '')) throw new HttpError(403, 'Unexpected Host header');
  const origin = req.headers.origin;
  if (req.method !== 'GET' && origin !== undefined && !allowed.some(a => origin === `http://${a}`)) throw new HttpError(403, 'Cross-origin writes are not allowed');
}
export async function body(req: IncomingMessage, limit: number, type: string) {
  if (!(req.headers['content-type'] ?? '').startsWith(type)) throw new HttpError(415, `Expected ${type}`);
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > limit) throw new HttpError(413, 'Upload is too large'); chunks.push(c as Buffer); }
  return Buffer.concat(chunks);
}

export class HttpError extends Error { constructor(readonly status: number, message: string) { super(message); } }
