import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, body, checkOrigin } from './content-api.ts';

type Next = (err?: unknown) => void;
const offline = 'The game server is not running. Start it with npm run dev to view and edit characters.';

/** Forwards /api/accounts to the game server, which owns the live world and saves it. */
export function accountsApi(opts: { gameUrl: string; tokenFile: string; port: number }) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname !== '/api/accounts' && !url.pathname.startsWith('/api/accounts/')) return next();
    const send = (status: number, payload: unknown) => { res.statusCode = status; res.setHeader('content-type', 'application/json'); res.setHeader('cache-control', 'no-store'); res.end(typeof payload === 'string' ? payload : JSON.stringify(payload)); };
    try {
      checkOrigin(req, opts.port);
      const rest = url.pathname.slice('/api/accounts'.length);
      if (!(req.method === 'GET' && rest === '') && !(req.method === 'PUT' && /^\/[\w-]+$/.test(rest))) throw new HttpError(404, 'Not found');
      const payload = req.method === 'PUT' ? await body(req, 256 << 10, 'application/json') : undefined;
      let token: string;
      try { token = (await readFile(opts.tokenFile, 'utf8')).trim(); } catch { throw new HttpError(503, offline); }
      let upstream: Response;
      try { upstream = await fetch(`${opts.gameUrl}/admin/accounts${rest}`, { method: req.method, headers: { 'x-admin-token': token, ...(payload ? { 'content-type': 'application/json' } : {}) }, body: payload }); }
      catch { throw new HttpError(503, offline); }
      if (upstream.status === 403) throw new HttpError(503, 'The game server refused the Studio. Restart the game server so it writes a fresh .local/admin-token.');
      return send(upstream.status, await upstream.text());
    } catch (e) {
      if (!req.readableEnded) req.resume();
      if (e instanceof HttpError) return send(e.status, { message: e.message });
      console.error(e);
      return send(500, { message: (e as Error).message });
    }
  };
}
