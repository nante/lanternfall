// Open a lab URL in headless Chrome (real time), wait, evaluate an expression, print the result.
// Usage: node eval.mjs '<query>' '<expression>|shot:<png path>' [waitMs] [width] [height]
// Example: node eval.mjs 'at=market&t=0.5' 'labBench()' 4000 1920 1080
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [query = '', expr = 'document.title', wait = '4000', width = '1920', height = '1080'] = process.argv.slice(2);
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const port = 9300 + Math.floor(Math.random() * 500);
const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'lab-'))}`, '--use-angle=metal', `--window-size=${width},${height}`, `--force-device-scale-factor=${process.env.DPR ?? 1}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
try {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
  const send = (method, params = {}) => new Promise(r => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor: Number(process.env.DPR ?? 1), mobile: false });
  await send('Page.navigate', { url: `http://127.0.0.1:4173/proto/lab/?${query}` });
  await sleep(Number(wait));
  if (expr.startsWith('shot:')) {
    await send('Runtime.evaluate', { expression: "document.body.classList.add('lab-shot')" });
    await sleep(150);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(expr.slice(5), Buffer.from(shot.result.data, 'base64'));
    console.log(expr.slice(5));
  } else {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    console.log(res.result?.result?.value ?? JSON.stringify(res.result?.exceptionDetails ?? res));
  }
  ws.close();
} finally { proc.kill(); }
