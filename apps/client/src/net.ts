import { Client, type Room } from '@colyseus/sdk';
import type { Action, GameView, Notice } from '../../../packages/game/src/model.ts';

type Result = { ok: boolean; text: string; resync?: boolean; requestId?: string };
export type NetEvents = { view: (v: GameView) => void; notice: (n: Notice) => void; error: (text: string) => void; closed: (reason: string) => void };

export class Net {
  room?: Room;
  epoch = 0;
  seq = 0;
  id = '';
  private waiting = new Map<string, (r: Result) => void>();
  constructor(readonly on: NetEvents) {}
  get url() { const host = location.hostname || '127.0.0.1'; const proto = location.protocol === 'https:' ? 'wss' : 'ws'; return `${proto}://${host}:2567`; }
  async join(name: string, token?: string) {
    const client = new Client(this.url);
    const room = await client.joinOrCreate('lanternfall', token ? { token, name } : { name });
    this.room = room;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The town did not answer.')), 6000);
      room.onMessage('welcome', (w: { id: string; token: string; epoch: number }) => {
        clearTimeout(timer);
        this.id = w.id; this.epoch = w.epoch; this.seq = 0;
        localStorage.setItem('lanternfall.token', w.token);
        localStorage.setItem('lanternfall.name', name);
        resolve();
      });
    });
    room.onMessage('view', (v: GameView) => this.on.view(v));
    room.onMessage('notice', (n: Notice) => this.on.notice(n));
    room.onMessage('result', (r: Result) => {
      const wait = r.requestId ? this.waiting.get(r.requestId) : undefined;
      if (wait) { this.waiting.delete(r.requestId!); wait(r); return; }
      if (!r.ok && r.text) this.on.error(r.text); if (r.resync) this.on.closed(r.text);
    });
    room.onMessage('fenced', () => this.on.closed('This wayfarer was opened in another window.'));
    room.onLeave(code => { if (code !== 1000) this.on.closed('Lost the connection to the town.'); });
  }
  send(action: Action) {
    if (!this.room) return '';
    this.seq++;
    const requestId = crypto.randomUUID();
    this.room.send('action', { requestId, epoch: this.epoch, seq: this.seq, action });
    return requestId;
  }
  /** Ask to log out and only disconnect if the server agrees (it refuses during a fight). */
  leave(): Promise<Result> {
    return new Promise(resolve => {
      const id = this.send({ kind: 'logout' });
      if (!id) return resolve({ ok: false, text: 'Not connected.' });
      const timer = setTimeout(() => { this.waiting.delete(id); resolve({ ok: false, text: 'The town did not answer. Try again.' }); }, 4000);
      this.waiting.set(id, r => { clearTimeout(timer); if (r.ok) this.room?.leave(true); resolve(r); });
    });
  }
}
