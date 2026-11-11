// Builds the HUD's pixel typeface from tools/ui/glyphs.ts: a TrueType font whose every outline lies on a grid of
// 100 units, wrapped as WOFF. At font-size 12 × the UI pixel, one font pixel is one UI pixel, so text is as crisp as
// the frames around it. Writes apps/client/src/hud/fonts/lantern{,-bold}.woff and fonts.css.
// Japanese comes from Num Kadoma's k8x12 bitmap font (8×12, the same ascent and descent as ours), read from its BDF and
// written on the same grid, split into chunks the browser fetches only when a page shows those characters.
// Run: npx tsx tools/ui/font.ts --jp <path to k8x12.bdf> [--proof <dir>]
import { writeFileSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PNG } from 'pngjs';
import { base, heavy, marks, composed, apostropheCaron, ROWS_ABOVE } from './glyphs.ts';

const PX = 100, ASCENT = 10, DESCENT = 2, EM = (ASCENT + DESCENT) * PX;
const out = new URL('../../apps/client/src/hud/fonts/', import.meta.url);

/** A glyph as ink cells: rows[y] for y from ASCENT-1 down to -DESCENT, as a set of "x,y". */
type Bitmap = { w: number; cells: Set<string>; adv?: number };
function fromRows(rows: string[]): Bitmap {
  const cells = new Set<string>();
  rows.forEach((r, i) => [...r].forEach((c, x) => { if (c === '#') cells.add(`${x},${ROWS_ABOVE - 1 - i}`); }));
  return { w: Math.max(...rows.map(r => r.length)), cells };
}
const top = (b: Bitmap) => Math.max(-1, ...[...b.cells].map(c => Number(c.split(',')[1])));
function compose(baseCh: string, markName: keyof typeof marks, rows = base[baseCh]): Bitmap {
  const b = fromRows(rows), m = marks[markName], mw = Math.max(...m.rows.map(r => r.length));
  const w = Math.max(b.w, mw), bx = Math.floor((w - b.w) / 2), cells = new Set<string>();
  for (const c of b.cells) { const [x, y] = c.split(',').map(Number); cells.add(`${x + bx},${y}`); }
  const mx = m.right ? bx + b.w - mw : Math.floor((w - mw) / 2);
  // Above: one row of air over the letter's top. Below: the mark's first row is the first descender row.
  const y0 = m.below ? -1 : top(b) + 1 + m.rows.length;
  m.rows.forEach((r, i) => [...r].forEach((c, x) => { if (c === '#') cells.add(`${x + mx},${y0 - i}`); }));
  return { w, cells };
}
function withApostrophe(ch: string): Bitmap {
  const b = fromRows(base[ch]), cells = new Set(b.cells);
  cells.add(`${b.w + 1},6`); cells.add(`${b.w + 1},5`); cells.add(`${b.w},4`);
  return { w: b.w + 2, cells };
}
/** The bold weight: strokes one pixel wider to the right, except where that would close a one-pixel counter (m, w). */
function embolden(b: Bitmap): Bitmap {
  const cells = new Set(b.cells);
  for (const c of b.cells) { const [x, y] = c.split(',').map(Number); if (!b.cells.has(`${x + 2},${y}`)) cells.add(`${x + 1},${y}`); }
  return { w: b.w + (b.cells.size ? 1 : 0), cells };
}

function glyphSet(bold: boolean) {
  const set = new Map<number, Bitmap>();
  const drawn = (ch: string) => bold ? heavy[ch] : undefined;
  const put = (ch: string, b: Bitmap, done = false) => set.set(ch.codePointAt(0)!, bold && !done ? embolden(b) : b);
  for (const ch of Object.keys(base)) put(ch, fromRows(drawn(ch) ?? base[ch]), !!drawn(ch));
  for (const [ch, [b, m]] of Object.entries(composed)) put(ch, compose(b, m, drawn(b) ?? base[b]), !!drawn(b));
  for (const [ch, b] of Object.entries(apostropheCaron)) put(ch, withApostrophe(b));
  set.set(0xa0, set.get(0x20)!);
  return set;
}

/** Outline of the ink as closed loops, clockwise around ink (y up), traced along pixel edges. */
function outline(b: Bitmap): [number, number][][] {
  const edges = new Map<string, [number, number][]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const back = `${x1},${y1}>${x0},${y0}`;
    if (edges.has(back)) { edges.delete(back); return; }
    edges.set(`${x0},${y0}>${x1},${y1}`, [[x0, y0], [x1, y1]]);
  };
  for (const c of b.cells) {
    const [x, y] = c.split(',').map(Number);
    add(x, y + 1, x + 1, y + 1); add(x + 1, y + 1, x + 1, y); add(x + 1, y, x, y); add(x, y, x, y + 1);
  }
  const from = new Map<string, string[]>();
  for (const [k, [[x0, y0]]] of edges) { const s = `${x0},${y0}`; from.set(s, [...(from.get(s) ?? []), k]); }
  const loops: [number, number][][] = [];
  const used = new Set<string>();
  for (const k of edges.keys()) {
    if (used.has(k)) continue;
    const loop: [number, number][] = [];
    let cur = k;
    while (!used.has(cur)) {
      used.add(cur);
      const [[x0, y0], [x1, y1]] = edges.get(cur)!;
      loop.push([x0, y0]);
      const next = (from.get(`${x1},${y1}`) ?? []).filter(n => !used.has(n));
      if (!next.length) break;
      cur = next[0];
    }
    // Drop points in the middle of straight runs.
    const pts = loop.filter((p, i) => { const a = loop[(i + loop.length - 1) % loop.length], c = loop[(i + 1) % loop.length]; return !((a[0] === p[0] && p[0] === c[0]) || (a[1] === p[1] && p[1] === c[1])); });
    loops.push(pts);
  }
  return loops;
}

// ---------------------------------------------------------------- binary helpers
class Buf {
  bytes: number[] = [];
  u8(v: number) { this.bytes.push(v & 255); return this; }
  u16(v: number) { this.bytes.push((v >> 8) & 255, v & 255); return this; }
  i16(v: number) { return this.u16(v < 0 ? v + 65536 : v); }
  u32(v: number) { this.bytes.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; }
  put(d: ArrayLike<number>) { for (let i = 0; i < d.length; i++) this.bytes.push(d[i]); return this; }
  tag(s: string) { for (const c of s) this.u8(c.charCodeAt(0)); return this; }
  pad4() { while (this.bytes.length % 4) this.u8(0); return this; }
  get data() { return Uint8Array.from(this.bytes); }
}
const checksum = (d: Uint8Array) => { let s = 0; for (let i = 0; i < d.length; i += 4) s = (s + ((d[i] << 24) | ((d[i + 1] ?? 0) << 16) | ((d[i + 2] ?? 0) << 8) | (d[i + 3] ?? 0))) >>> 0; return s; };

function build(family: string, bold: boolean, set: Map<number, Bitmap>) {
  const codes = [...set.keys()].sort((a, b) => a - b);
  const notdef: Bitmap = { w: 4, cells: new Set(['0,0', '1,0', '2,0', '3,0', '0,1', '3,1', '0,2', '3,2', '0,3', '3,3', '0,4', '3,4', '0,5', '1,5', '2,5', '3,5']) };
  const glyphs = [notdef, ...codes.map(c => set.get(c)!)];
  const adv = (b: Bitmap) => (b.adv ?? b.w + 1) * PX;

  const glyf = new Buf(), loca: number[] = [];
  let maxPoints = 0, maxContours = 0, xMin = 0, yMin = 0, xMax = 0, yMax = 0;
  const lsb: number[] = [];
  for (const b of glyphs) {
    loca.push(glyf.bytes.length);
    const loops = outline(b);
    if (!loops.length) { lsb.push(0); continue; }
    const pts = loops.flat();
    const bx0 = Math.min(...pts.map(p => p[0])) * PX, by0 = Math.min(...pts.map(p => p[1])) * PX, bx1 = Math.max(...pts.map(p => p[0])) * PX, by1 = Math.max(...pts.map(p => p[1])) * PX;
    xMin = Math.min(xMin, bx0); yMin = Math.min(yMin, by0); xMax = Math.max(xMax, bx1); yMax = Math.max(yMax, by1);
    lsb.push(bx0);
    maxPoints = Math.max(maxPoints, pts.length); maxContours = Math.max(maxContours, loops.length);
    glyf.i16(loops.length).i16(bx0).i16(by0).i16(bx1).i16(by1);
    let end = -1; for (const l of loops) { end += l.length; glyf.u16(end); }
    glyf.u16(0);
    for (let i = 0; i < pts.length; i++) glyf.u8(1);
    let px = 0; for (const [x] of pts) { glyf.i16(x * PX - px); px = x * PX; }
    let py = 0; for (const [, y] of pts) { glyf.i16(y * PX - py); py = y * PX; }
    glyf.pad4();
  }
  loca.push(glyf.bytes.length);

  const head = new Buf().u32(0x10000).u32(0x10000).u32(0).u32(0x5f0f3cf5).u16(0b1011).u16(EM)
    .u32(0).u32(0xe2a1b000).u32(0).u32(0xe2a1b000).i16(xMin).i16(yMin).i16(xMax).i16(yMax).u16(bold ? 1 : 0).u16(8).i16(2).i16(1).i16(0);
  const advMax = Math.max(...glyphs.map(adv));
  const hhea = new Buf().u32(0x10000).i16(ASCENT * PX).i16(-DESCENT * PX).i16(0).u16(advMax).i16(0).i16(0).i16(xMax).i16(1).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).i16(0).u16(glyphs.length);
  const maxp = new Buf().u32(0x10000).u16(glyphs.length).u16(maxPoints).u16(maxContours).u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);
  const hmtx = new Buf(); glyphs.forEach((b, i) => hmtx.u16(adv(b)).i16(lsb[i]));
  const locaT = new Buf(); for (const o of loca) locaT.u32(o);
  const avg = Math.round(glyphs.reduce((n, b) => n + adv(b), 0) / glyphs.length);
  const os2 = new Buf().u16(4).i16(avg).u16(bold ? 700 : 400).u16(5).u16(0)
    .i16(650).i16(600).i16(0).i16(150).i16(650).i16(600).i16(0).i16(350).i16(PX).i16(3 * PX).i16(0);
  for (let i = 0; i < 10; i++) os2.u8(0);
  os2.u32(0b111).u32(0).u32(0).u32(0).tag('LNTF').u16((bold ? 0x20 : 0x40) | 0x80).u16(Math.min(codes[0], 0xffff)).u16(Math.min(codes.at(-1)!, 0xffff))
    .i16(ASCENT * PX).i16(-DESCENT * PX).i16(0).u16(ASCENT * PX).u16(DESCENT * PX).u32(0b11).u32(0).i16(5 * PX).i16(7 * PX).u16(0).u16(32).u16(1);
  const post = new Buf().u32(0x30000).u32(0).i16(-PX).i16(PX).u32(0).u32(0).u32(0).u32(0).u32(0);

  const names: [number, string][] = [[0, 'Original glyphs drawn for Lanternfall.'], [1, family], [2, bold ? 'Bold' : 'Regular'], [3, `${family} ${bold ? 'Bold' : 'Regular'} 1.0`], [4, `${family}${bold ? ' Bold' : ''}`], [5, 'Version 1.0'], [6, `${family.replace(/ /g, '')}-${bold ? 'Bold' : 'Regular'}`]];
  const strs = names.map(([, s]) => { const b = new Buf(); for (const c of s) b.u16(c.charCodeAt(0)); return b.data; });
  const name = new Buf().u16(0).u16(names.length).u16(6 + names.length * 12);
  let off = 0; names.forEach(([id], i) => { name.u16(3).u16(1).u16(0x409).u16(id).u16(strs[i].length).u16(off); off += strs[i].length; });
  for (const s of strs) name.put(s);

  // cmap format 4: runs of consecutive codes with consecutive glyph ids share a segment.
  const bmp = codes.filter(c => c <= 0xffff).map(c => [c, codes.indexOf(c) + 1] as const);
  const segs: { start: number; end: number; delta: number }[] = [];
  for (const [c, gid] of bmp) {
    const s = segs.at(-1);
    if (s && c === s.end + 1 && gid - c === s.delta) s.end = c; else segs.push({ start: c, end: c, delta: gid - c });
  }
  segs.push({ start: 0xffff, end: 0xffff, delta: 1 });
  const n = segs.length, sr = 2 ** Math.floor(Math.log2(n)) * 2;
  const sub = new Buf().u16(4).u16(16 + n * 8).u16(0).u16(n * 2).u16(sr).u16(Math.log2(sr / 2)).u16(n * 2 - sr);
  segs.forEach(s => sub.u16(s.end)); sub.u16(0); segs.forEach(s => sub.u16(s.start)); segs.forEach(s => sub.u16((s.delta + 65536) % 65536)); segs.forEach(() => sub.u16(0));
  const cmap = new Buf().u16(0).u16(1).u16(3).u16(1).u32(12); cmap.put(sub.bytes);

  const tables: [string, Uint8Array][] = ([['OS/2', os2], ['cmap', cmap], ['glyf', glyf], ['head', head], ['hhea', hhea], ['hmtx', hmtx], ['loca', locaT], ['maxp', maxp], ['name', name], ['post', post]] as [string, Buf][]).map(([t, b]) => [t, b.data]);
  // head.checkSumAdjustment covers the whole sfnt as it would be laid out.
  const sfnt = new Buf().u32(0x10000).u16(tables.length).u16(128).u16(3).u16(tables.length * 16 - 128);
  let at = 12 + tables.length * 16;
  for (const [t, d] of tables) { sfnt.tag(t).u32(checksum(d)).u32(at).u32(d.length); at += Math.ceil(d.length / 4) * 4; }
  for (const [, d] of tables) { sfnt.put(d); sfnt.pad4(); }
  const adj = (0xb1b0afba - checksum(sfnt.data)) >>> 0;
  const headData = tables.find(t => t[0] === 'head')![1]; new DataView(headData.buffer).setUint32(8, adj);

  const woff = new Buf(), entries = tables.map(([t, d]) => { const z = deflateSync(d); return { t, d, z: z.length < d.length ? new Uint8Array(z) : d }; });
  const total = 12 + tables.length * 16 + tables.reduce((s, [, d]) => s + Math.ceil(d.length / 4) * 4, 0);
  let dataAt = 44 + entries.length * 20;
  const dir = new Buf();
  for (const e of entries) { dir.tag(e.t).u32(dataAt).u32(e.z.length).u32(e.d.length).u32(checksum(e.d)); dataAt += Math.ceil(e.z.length / 4) * 4; }
  woff.tag('wOFF').u32(0x10000).u32(dataAt).u16(entries.length).u16(0).u32(total).u16(1).u16(0).u32(0).u32(0).u32(0).u32(0).u32(0);
  woff.put(dir.bytes);
  for (const e of entries) { woff.put(e.z); woff.pad4(); }
  return { woff: woff.data };
}

/** A proof sheet: every glyph at 4× on the HUD's slate, for looking at. */
function proof(set: Map<number, Bitmap>, file: URL) {
  const lines = ['Lanternfall: The lamps never go out.', 'Kuba, Mira, Ash. Zażółć gęślą jaźń! ŻÓŁW Łódź', 'Gold 1,234  HP 345/345  Cap 87.5 oz  Lv 14', 'Müller, François, Šťastný, Ærø, Ñandú, Őrült', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ abcdefghijklmnopqrstuvwxyz', '0123456789 !?.,:;\'"()[]{}<>+-=*/\\|@#$%&_~ · × – — … → ←'];
  const S = 4, lh = 13, W = 700;
  const png = new PNG({ width: W * S, height: lines.length * lh * S + 2 * S });
  const fill = (x: number, y: number, c: number[]) => { for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const i = ((y * S + dy) * png.width + x * S + dx) * 4; if (i >= 0 && i < png.data.length) png.data.set(c, i); } };
  for (let y = 0; y < png.height / S; y++) for (let x = 0; x < W; x++) fill(x, y, [0x14, 0x1a, 0x31, 255]);
  lines.forEach((t, li) => {
    let x = 2; const base = li * lh + 1 + ASCENT;
    for (const ch of t) {
      const b = set.get(ch.codePointAt(0)!) ?? set.get(63)!;
      for (const c of b.cells) { const [cx, cy] = c.split(',').map(Number); fill(x + cx, base - 1 - cy, [0xec, 0xe2, 0xc8, 255]); }
      x += b.w + 1;
    }
  });
  writeFileSync(file, PNG.sync.write(png));
}

/** A BDF font's glyphs as ink cells on our grid (BDF rows run top down from the box's top). */
function parseBdf(text: string) {
  const set = new Map<number, Bitmap>();
  for (const block of text.split('STARTCHAR').slice(1)) {
    const code = Number(/^ENCODING (\d+)/m.exec(block)?.[1] ?? -1), dw = Number(/^DWIDTH (\d+)/m.exec(block)?.[1] ?? 0);
    const bbx = /^BBX (-?\d+) (-?\d+) (-?\d+) (-?\d+)/m.exec(block);
    if (code < 0 || !bbx) continue;
    const [w, h, xo, yo] = bbx.slice(1).map(Number);
    const rows = block.split(/^BITMAP\s*$/m)[1].split(/^ENDCHAR/m)[0].trim().split(/\s+/).filter(Boolean);
    const cells = new Set<string>();
    rows.forEach((hex, r) => { const bits = parseInt(hex, 16), n = hex.length * 4; for (let x = 0; x < w; x++) if (bits & (1 << (n - 1 - x))) cells.add(`${x + xo},${yo + h - 1 - r}`); });
    set.set(code, { w: Math.max(0, dw - 1), cells, adv: dw });
  }
  return set;
}

const args = process.argv.slice(2), arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
mkdirSync(out, { recursive: true });
for (const f of readdirSync(out)) if (/\.woff2?$/.test(f)) rmSync(new URL(f, out));
const faces: string[] = [];
let shipped = 0;
for (const bold of [false, true]) {
  const set = glyphSet(bold), file = `lantern${bold ? '-bold' : ''}.woff`;
  const { woff } = build('Lantern', bold, set);
  writeFileSync(new URL(file, out), woff);
  shipped += woff.length;
  faces.push(`@font-face { font-family: 'Lantern'; src: url('./fonts/${file}') format('woff'); font-weight: ${bold ? 700 : 400}; font-display: block; }`);
  if (arg('--proof')) proof(set, new URL(`${arg('--proof')}/proof${bold ? '-bold' : ''}.png`, `file://${process.cwd()}/`));
  console.log(`${file}: ${set.size} glyphs, ${woff.length} bytes`);
}
const jp = arg('--jp');
if (jp) {
  const latin = glyphSet(false), all = parseBdf(readFileSync(jp, 'utf8'));
  // Everything past Latin that our own face does not draw: Greek and Cyrillic, symbols, kana, kanji, full-width forms.
  const codes = [...all.keys()].filter(c => c >= 0x370 && !latin.has(c)).sort((a, b) => a - b);
  const kanji = codes.filter(c => c >= 0x4e00 && c <= 0x9fff), rest = codes.filter(c => !(c >= 0x4e00 && c <= 0x9fff));
  const chunks = [rest];
  for (let i = 0; i < kanji.length; i += 800) chunks.push(kanji.slice(i, i + 800));
  chunks.forEach((cs, i) => {
    const set = new Map(cs.map(c => [c, all.get(c)!])), file = `lantern-jp-${i}.woff`;
    const { woff } = build('Lantern JP', false, set);
    writeFileSync(new URL(file, out), woff);
    shipped += woff.length;
    // One chunk per contiguous range of code points; the browser loads a chunk only when a page shows one of them.
    const ranges = i === 0 ? runs(cs) : [[cs[0], cs.at(-1)!]];
    faces.push(`@font-face { font-family: 'Lantern JP'; src: url('./fonts/${file}') format('woff'); unicode-range: ${ranges.map(([a, b]) => (a === b ? `U+${hex(a)}` : `U+${hex(a)}-${hex(b)}`)).join(', ')}; font-display: swap; }`);
    console.log(`${file}: ${set.size} glyphs, ${woff.length} bytes`);
  });
}
function runs(cs: number[]) { const r: [number, number][] = []; for (const c of cs) { const l = r.at(-1); if (l && c - l[1] <= 16) l[1] = c; else r.push([c, c]); } return r; }
function hex(n: number) { return n.toString(16).toUpperCase(); }
writeFileSync(new URL('../fonts.css', out), `/* Generated by tools/ui/font.ts. */\n${faces.join('\n')}\n`);
console.log(`fonts: ${shipped} bytes in all`);
