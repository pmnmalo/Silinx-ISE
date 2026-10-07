// Xilinx ISE schematic (.sch) <-> XAIlinx schematic document (.sch.json). Isomorphic (no DOM, no Node APIs).
//
//   import { importIseSch, exportIseSch, parseIseSch } from '/core/isesch.js';
//
//   importIseSch(text, { modules, symbols, name, lang }) -> { doc, warnings, unconnected, pinMap }
//   exportIseSch(doc, { modules, family, timestamp, lang }) -> { xml, warnings, files: [{ path, text, kind }] }
//   parseIseSch(text) -> neutral model, parseIseSym(text) -> { name, pins }, decodeXlSymbol(name)
//
// ISE 14.x writes schematics as XML (<drawing version="7">); older ISE versions wrote a text format
// ("VERSION 6 / BEGIN SCHEMATIC") that is read as well. Both are mapped to one neutral model by parseIseSch():
//   <netlist>  : <signal name="d(7:0)"/>, <port polarity="Input|Output|BiDirectional" name=../>,
//                <blockdef name=..> (symbol graphics: line/rect/arc/circle; pins are NOT listed),
//                <block symbolname=.. name=..><blockpin signalname=.. name=../></block>
//   <sheet>    : <instance x y name orien="R0..R270|M0..M270"/>, <branch name=..><wire x1 y1 x2 y2/>..</branch>,
//                <iomarker x y name orien/>, <bustap x1 y1 (on the bus) x2 y2 (bit wire end)/>
// Connectivity in ISE is by net name (a branch named d(3) is bit 3 of bus d(7:0)); the drawing is graphics.
// XAIlinx connectivity is geometric, so the import rebuilds it: ISE coordinates are mapped with an order
// preserving map (ISE unit 64 -> 20 px, minimum spacing one grid step) that keeps the wire topology exact,
// XAIlinx symbols are placed on the ISE pin positions (stub wires where the symbol shapes differ), bus taps
// become slice / bus join symbols, and net names are added wherever a net is joined by name only.
// The result is checked with netlist() against the ISE netlist (warnings list any difference).
import {
  SYMBOLS, defaultParams, normalizeDoc, symbolDef, symbolPins, symbolBox, portBox, netlist, normModules,
  validIdent, generateHdl, constBits, newDoc, xform, modulesFromLibrary,
} from './schdoc.js';
import { compile } from './compile.js';

export function parseXml(text) {
  const src = String(text ?? '');
  const root = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack = [root];
  let i = 0;
  const n = src.length;
  const top = () => stack[stack.length - 1];
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) { top().text += decodeEnt(src.slice(i)); break; }
    if (lt > i) top().text += decodeEnt(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', i)) { const e = src.indexOf('-->', i + 4); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<![CDATA[', i)) { const e = src.indexOf(']]>', i + 9); top().text += src.slice(i + 9, e < 0 ? n : e); i = e < 0 ? n : e + 3; continue; }
    if (src.startsWith('<?', i)) { const e = src.indexOf('?>', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (src.startsWith('<!', i)) { const e = src.indexOf('>', i + 2); i = e < 0 ? n : e + 1; continue; }
    if (src[i + 1] === '/') {
      const e = src.indexOf('>', i + 2);
      const name = src.slice(i + 2, e < 0 ? n : e).trim().toLowerCase();
      i = e < 0 ? n : e + 1;
      // pop to the matching element (tolerate stray / missing close tags)
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].tag === name) { stack.length = k; break; }
      continue;
    }
    // start tag: scan respecting quotes
    let j = i + 1, q = null;
    while (j < n) { const c = src[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
    let body = src.slice(i + 1, j);
    i = j + 1;
    const selfClose = /\/\s*$/.test(body);
    if (selfClose) body = body.replace(/\/\s*$/, '');
    const m = /^\s*([^\s/>]+)/.exec(body);
    if (!m) continue;
    const el = { tag: m[1].toLowerCase(), attrs: {}, children: [], text: '' };
    const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
    let a;
    const rest = body.slice(m[0].length);
    while ((a = re.exec(rest))) el.attrs[a[1]] = decodeEnt(a[2] ?? a[3] ?? a[4] ?? '');
    top().children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}
function decodeEnt(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => {
    const l = e.toLowerCase();
    if (l === 'lt') return '<'; if (l === 'gt') return '>'; if (l === 'amp') return '&'; if (l === 'quot') return '"'; if (l === 'apos') return "'";
    return String.fromCodePoint(l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
  });
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const kids = (el, tag) => (el?.children || []).filter(c => c.tag === tag);
const kid = (el, tag) => (el?.children || []).find(c => c.tag === tag);

// .sch text (version 7 XML or legacy VERSION 6 text) -> neutral model
export function parseIseSch(text) {
  const src = String(text ?? '').replace(/^﻿/, '');
  if (/^\s*VERSION\s+\d/i.test(src) || /^\s*BEGIN\s+SCHEMATIC/im.test(src.slice(0, 400))) return parseV6(src);
  const root = parseXml(src);
  const dr = kid(root, 'drawing');
  if (!dr) throw new Error('not an ISE schematic (no <drawing> element)');
  const m = emptyModel(num(dr.attrs.version) || 7);
  for (const a of kids(dr, 'attr')) m.attrs[a.attrs.name] = a.attrs.value;
  const nl = kid(dr, 'netlist') || { children: [] };
  for (const s of kids(nl, 'signal')) m.signals.push({ name: s.attrs.name, attrs: attrMap(s) });
  for (const p of kids(nl, 'port')) m.ports.push({ name: p.attrs.name, polarity: p.attrs.polarity || 'Input' });
  for (const b of kids(nl, 'blockdef')) {
    const def = { name: b.attrs.name, timestamp: kid(b, 'timestamp')?.text?.trim() || '', shapes: [] };
    for (const c of b.children) {
      const A = c.attrs;
      const bus = /linewidth\s*:\s*W/i.test(A.style || '');
      if (c.tag === 'line') def.shapes.push({ kind: 'line', x1: num(A.x1), y1: num(A.y1), x2: num(A.x2), y2: num(A.y2), bus });
      else if (c.tag === 'rect') def.shapes.push({ kind: 'rect', x: num(A.x), y: num(A.y), w: num(A.width), h: num(A.height) });
      else if (c.tag === 'circle') def.shapes.push({ kind: 'circle', cx: num(A.cx), cy: num(A.cy), r: num(A.r) });
      else if (c.tag === 'arc') def.shapes.push({ kind: 'arc', cx: num(A.cx), cy: num(A.cy), r: num(A.r), sx: num(A.sx), sy: num(A.sy), ex: num(A.ex), ey: num(A.ey) });
      else if (c.tag === 'text' || c.tag === 'attrtext') def.shapes.push({ kind: 'text', x: num(A.x), y: num(A.y), text: c.text?.trim() || A.attrname || '' });
    }
    m.blockdefs.set(def.name.toLowerCase(), def);
  }
  for (const b of kids(nl, 'block')) {
    m.blocks.push({ symbol: b.attrs.symbolname, name: b.attrs.name, attrs: attrMap(b),
      pins: kids(b, 'blockpin').map(p => ({ name: p.attrs.name, signal: p.attrs.signalname ?? null })) });
  }
  for (const sh of kids(dr, 'sheet')) {
    const S = { num: num(sh.attrs.sheetnum) || 1, width: num(sh.attrs.width) || 3520, height: num(sh.attrs.height) || 2720, instances: [], branches: [], iomarkers: [], bustaps: [], texts: [] };
    for (const c of sh.children) {
      const A = c.attrs;
      if (c.tag === 'instance') S.instances.push({ name: A.name, x: num(A.x), y: num(A.y), orien: A.orien || 'R0' });
      else if (c.tag === 'branch') {
        S.branches.push({ name: A.name, wires: kids(c, 'wire').map(w => [num(w.attrs.x1), num(w.attrs.y1), num(w.attrs.x2), num(w.attrs.y2)]),
          labels: kids(c, 'attrtext').filter(t => !t.attrs.attrname || /^name$/i.test(t.attrs.attrname)).map(t => ({ x: num(t.attrs.x), y: num(t.attrs.y), style: t.attrs.style || '' })) });
      } else if (c.tag === 'iomarker') S.iomarkers.push({ name: A.name, x: num(A.x), y: num(A.y), orien: A.orien || 'R0' });
      else if (c.tag === 'bustap') S.bustaps.push({ x1: num(A.x1), y1: num(A.y1), x2: num(A.x2), y2: num(A.y2) });
      else if (c.tag === 'text') S.texts.push({ x: num(A.x), y: num(A.y), text: c.text.trim() });
    }
    m.sheets.push(S);
  }
  return m;
}
// ISE symbol file (.sym): XML (ISE 9+) or VERSION 5 text -> { name, pins: [{ name, dir, x, y }] }
export function parseIseSym(text) {
  const src = String(text ?? '').replace(/^\uFEFF/, '');
  const dirOf = p => (/^out/i.test(p) ? 'out' : /^bi|inout/i.test(p) ? 'inout' : 'in');
  if (/^\s*VERSION\s+\d/i.test(src) || /^\s*BEGIN\s+SYMBOL/im.test(src.slice(0, 200))) {
    const out = { name: (/BEGIN\s+SYMBOL\s+(\S+)/.exec(src) || [])[1] || '', pins: [] };
    for (const m of src.matchAll(/^\s*SYMPIN\s+(-?\d+)\s+(-?\d+)\s+(\w+)\s+(\S+)/gm)) out.pins.push({ name: m[4], dir: dirOf(m[3]), x: +m[1], y: +m[2] });
    return out;
  }
  const root = parseXml(src);
  const sym = kid(root, 'symbol');
  if (!sym) throw new Error('not an ISE symbol (no <symbol> element)');
  return { name: sym.attrs.name || '', pins: kids(sym, 'pin').map(p => ({ name: p.attrs.name, dir: dirOf(p.attrs.polarity || 'Input'), x: num(p.attrs.x), y: num(p.attrs.y) })) };
}
function emptyModel(version) { return { version, attrs: {}, signals: [], ports: [], blockdefs: new Map(), blocks: [], sheets: [] }; }
function attrMap(el) { const o = {}; for (const a of kids(el, 'attr')) if (a.attrs.name) o[a.attrs.name] = a.attrs.value ?? ''; return o; }

function v6tokens(line) {
  const out = [];
  const re = /"((?:[^"]|"")*)"|(\S+)/g;
  let m;
  while ((m = re.exec(line))) out.push(m[1] != null ? m[1].replace(/""/g, '"') : m[2]);
  return out;
}
function parseV6(src) {
  const lines = src.split(/\r?\n/).map(v6tokens).filter(t => t.length);
  const m = emptyModel(6);
  let i = 0;
  const N = lines.length;
  const isBegin = (t, w) => t[0] === 'BEGIN' && t[1] === w;
  const skipBlock = () => { let d = 0; for (; i < N; i++) { const t = lines[i]; if (t[0] === 'BEGIN') d++; else if (t[0] === 'END') { d--; if (d <= 0) { i++; return; } } } };
  // collect ATTR name value at the current block level
  while (i < N) {
    const t = lines[i];
    if (t[0] === 'VERSION') { m.version = num(t[1]) || 6; i++; continue; }
    if (isBegin(t, 'SCHEMATIC') || (t[0] === 'END' && t[1] === 'SCHEMATIC')) { i++; continue; }
    if (isBegin(t, 'ATTR')) { m.attrs[t[2]] = t[3] ?? ''; skipBlock(); continue; }
    if (isBegin(t, 'NETLIST')) { i++; continue; }
    if (t[0] === 'END' && (t[1] === 'NETLIST')) { i++; continue; }
    if (t[0] === 'SIGNAL') { m.signals.push({ name: t[1], attrs: {} }); i++; continue; }
    if (isBegin(t, 'SIGNAL')) {
      const s = { name: t[2], attrs: {} }; i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'SIGNAL')) { const u = lines[i]; if (isBegin(u, 'ATTR')) { s.attrs[u[2]] = u[3] ?? ''; skipBlock(); continue; } if (u[0] === 'BEGIN') { skipBlock(); continue; } i++; }
      i++; m.signals.push(s); continue;
    }
    if (t[0] === 'PORT') { m.ports.push({ polarity: t[1], name: t[2] }); i++; continue; }
    if (isBegin(t, 'BLOCKDEF')) {
      const def = { name: t[2], timestamp: '', shapes: [] }; i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'BLOCKDEF')) {
        const u = lines[i];
        const f = u.slice(2).map(num);
        if (u[0] === 'TIMESTAMP') { const [y, mo, d, h, mi, s] = u.slice(1); def.timestamp = `${y}-${mo}-${d}T${h}:${mi}:${s}`; }
        else if (u[0] === 'LINE') def.shapes.push({ kind: 'line', x1: f[0], y1: f[1], x2: f[2], y2: f[3], bus: u[1] === 'W' });
        else if (isBegin(u, 'LINE')) { const g = u.slice(3).map(num); def.shapes.push({ kind: 'line', x1: g[0], y1: g[1], x2: g[2], y2: g[3], bus: u[2] === 'W' }); skipBlock(); continue; }
        else if (u[0] === 'RECTANGLE') def.shapes.push({ kind: 'rect', x: Math.min(f[0], f[2]), y: Math.min(f[1], f[3]), w: Math.abs(f[2] - f[0]), h: Math.abs(f[3] - f[1]) });
        else if (u[0] === 'CIRCLE') def.shapes.push({ kind: 'circle', cx: (f[0] + f[2]) / 2, cy: (f[1] + f[3]) / 2, r: Math.abs(f[2] - f[0]) / 2 });
        else if (u[0] === 'ARC') { const cx = (f[0] + f[2]) / 2, cy = (f[1] + f[3]) / 2; def.shapes.push({ kind: 'arc', cx, cy, r: Math.abs(f[2] - f[0]) / 2, sx: f[4], sy: f[5], ex: f[6], ey: f[7] }); }
        else if (u[0] === 'BEGIN') { skipBlock(); continue; }
        i++;
      }
      i++; m.blockdefs.set(def.name.toLowerCase(), def); continue;
    }
    if (isBegin(t, 'BLOCK')) {
      const b = { name: t[2], symbol: t[3], attrs: {}, pins: [] }; i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'BLOCK')) {
        const u = lines[i];
        if (u[0] === 'PIN') b.pins.push({ name: u[1], signal: u[2] ?? null });
        else if (isBegin(u, 'ATTR')) { b.attrs[u[2]] = u[3] ?? ''; skipBlock(); continue; }
        else if (u[0] === 'BEGIN') { skipBlock(); continue; }
        i++;
      }
      i++; m.blocks.push(b); continue;
    }
    if (isBegin(t, 'SHEET')) {
      const S = { num: num(t[2]) || 1, width: num(t[3]) || 3520, height: num(t[4]) || 2720, instances: [], branches: [], iomarkers: [], bustaps: [], texts: [] };
      i++;
      while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'SHEET')) {
        const u = lines[i];
        if (u[0] === 'INSTANCE') { S.instances.push({ name: u[1], x: num(u[2]), y: num(u[3]), orien: u[4] || 'R0' }); i++; continue; }
        if (isBegin(u, 'INSTANCE')) { S.instances.push({ name: u[2], x: num(u[3]), y: num(u[4]), orien: u[5] || 'R0' }); skipBlock(); continue; }
        if (isBegin(u, 'BRANCH')) {
          const br = { name: u[2], wires: [], labels: [] }; i++;
          while (i < N && !(lines[i][0] === 'END' && lines[i][1] === 'BRANCH')) {
            const w = lines[i];
            if (w[0] === 'WIRE') { br.wires.push(w.slice(1, 5).map(num)); i++; continue; }
            if (isBegin(w, 'DISPLAY')) { if (w[4] === 'ATTR' && /^name$/i.test(w[5] || '')) br.labels.push({ x: num(w[2]), y: num(w[3]), style: '' }); skipBlock(); continue; }
            if (w[0] === 'BEGIN') { skipBlock(); continue; }
            i++;
          }
          i++; S.branches.push(br); continue;
        }
        if (u[0] === 'IOMARKER') { S.iomarkers.push({ x: num(u[1]), y: num(u[2]), name: u[3], orien: u[4] || 'R0' }); i++; continue; }
        if (u[0] === 'BUSTAP') { S.bustaps.push({ x1: num(u[1]), y1: num(u[2]), x2: num(u[3]), y2: num(u[4]) }); i++; continue; }
        if (isBegin(u, 'DISPLAY') && u[4] === 'TEXT') { S.texts.push({ x: num(u[2]), y: num(u[3]), text: u.slice(5).join(' ') }); skipBlock(); continue; }
        if (u[0] === 'BEGIN') { skipBlock(); continue; }
        i++;
      }
      i++; m.sheets.push(S); continue;
    }
    if (t[0] === 'BEGIN') { skipBlock(); continue; }
    i++;
  }
  return m;
}

// ===================================================================== geometry helpers
// ISE orientation of an instance: local (x, y) -> offset from the instance origin.
// Rk = rotate k degrees clockwise (screen coordinates, y down); Mk = Rk followed by a horizontal mirror.
export function iseXform(orien, x, y) {
  switch (orien) {
    case 'R90': return [-y, x];
    case 'R180': return [-x, -y];
    case 'R270': return [y, -x];
    case 'M0': return [-x, y];
    case 'M90': return [y, x];
    case 'M180': return [x, -y];
    case 'M270': return [-y, -x];
    default: return [x, y];
  }
}
// ISE orien <-> XAIlinx { rot, mirror } (XAIlinx mirrors first, then rotates: Mk == mirror + rot (360-k))
export function iseOrienToXai(orien) {
  const m = /^([RM])(\d+)$/i.exec(String(orien || 'R0'));
  const k = m ? ((+m[2] % 360) + 360) % 360 : 0;
  if (m && m[1].toUpperCase() === 'M') return { rot: (360 - k) % 360, mirror: true };
  return { rot: k, mirror: false };
}
export function xaiToIseOrien(rot = 0, mirror = false) { return mirror ? `M${(360 - rot) % 360}` : `R${rot % 360}`; }

// "A(7:0)" -> { base: 'A', msb: 7, lsb: 0, width: 8 }; "A(3)" -> { base, bit: 3, width: 1 }; "A" -> { base, width: 1 }
export function parseIseName(name) {
  const s = String(name ?? '').trim();
  let m = /^(.*?)\s*[([<]\s*(\d+)\s*:\s*(\d+)\s*[)\]>]$/.exec(s);
  if (m && m[1]) return { base: m[1], msb: +m[2], lsb: +m[3], width: Math.abs(+m[2] - +m[3]) + 1, range: true };
  m = /^(.*?)\s*[([<]\s*(\d+)\s*[)\]>]$/.exec(s);
  if (m && m[1]) return { base: m[1], bit: +m[2], width: 1 };
  return { base: s, width: 1 };
}
const lc = s => String(s ?? '').toLowerCase();
const r10 = v => Math.round(v / 10) * 10;

// ===================================================================== Xilinx library knowledge
// Pin positions (ISE units, symbol-local, y up = negative) checked against real ISE 14.x schematics.
// Library graphics (blockdef shapes) of the Spartan-3E library symbols written by export.
const LIB_GFX = {
  and2: 'L 0 -64 64 -64|L 0 -128 64 -128|L 256 -96 192 -96|A 144 -96 48 144 -48 144 -144|L 144 -48 64 -48|L 64 -144 144 -144|L 64 -48 64 -144',
  and3: 'L 0 -64 64 -64|L 0 -128 64 -128|L 0 -192 64 -192|L 256 -128 192 -128|L 64 -176 144 -176|L 144 -80 64 -80|A 144 -128 48 144 -80 144 -176|L 64 -64 64 -192',
  and4: 'L 144 -112 64 -112|A 144 -160 48 144 -112 144 -208|L 64 -208 144 -208|L 64 -64 64 -256|L 256 -160 192 -160|L 0 -256 64 -256|L 0 -192 64 -192|L 0 -128 64 -128|L 0 -64 64 -64',
  and5: 'A 144 -192 48 144 -144 144 -240|L 144 -144 64 -144|L 64 -240 144 -240|L 64 -64 64 -320|L 256 -192 192 -192|L 0 -320 64 -320|L 0 -256 64 -256|L 0 -192 64 -192|L 0 -128 64 -128|L 0 -64 64 -64',
  or2: 'L 0 -64 64 -64|L 0 -128 64 -128|L 256 -96 192 -96|A 116 -136 88 112 -48 192 -96|A 16 -96 56 48 -48 48 -144|L 112 -144 48 -144|A 116 -56 88 192 -96 112 -144|L 112 -48 48 -48',
  or3: 'L 0 -64 48 -64|L 0 -128 72 -128|L 0 -192 48 -192|L 256 -128 192 -128|A 116 -168 88 112 -80 192 -128|A 16 -128 56 48 -80 48 -176|L 48 -64 48 -80|L 48 -192 48 -176|L 112 -80 48 -80|A 116 -88 88 192 -128 112 -176|L 112 -176 48 -176',
  or4: 'L 0 -64 48 -64|L 0 -128 64 -128|L 0 -192 64 -192|L 0 -256 48 -256|L 256 -160 192 -160|A 116 -120 88 192 -160 112 -208|L 112 -208 48 -208|L 112 -112 48 -112|L 48 -256 48 -208|L 48 -64 48 -112|A 16 -160 56 48 -112 48 -208|A 116 -200 88 112 -112 192 -160',
  or5: 'L 0 -64 48 -64|L 0 -128 48 -128|L 0 -192 72 -192|L 0 -256 48 -256|L 0 -320 48 -320|L 256 -192 192 -192|A 116 -232 88 112 -144 192 -192|L 112 -240 48 -240|L 112 -144 48 -144|L 48 -64 48 -144|L 48 -320 48 -240|A 116 -152 88 192 -192 112 -240|A 16 -192 56 48 -144 48 -240',
  nand2: 'L 0 -64 64 -64|L 0 -128 64 -128|L 256 -96 216 -96|C 204 -96 12|L 64 -48 64 -144|L 64 -144 144 -144|L 144 -48 64 -48|A 144 -96 48 144 -48 144 -144',
  nand3: 'L 0 -64 64 -64|L 0 -128 64 -128|L 0 -192 64 -192|L 256 -128 216 -128|C 204 -128 12|L 64 -176 144 -176|L 144 -80 64 -80|A 144 -128 48 144 -80 144 -176|L 64 -64 64 -192',
  nor2: 'L 0 -64 64 -64|L 0 -128 64 -128|L 256 -96 216 -96|C 204 -96 12|A 116 -136 88 112 -48 192 -96|A 116 -56 88 192 -96 112 -144|A 16 -96 56 48 -48 48 -144|L 112 -48 48 -48|L 112 -144 48 -144',
  nor3: 'L 0 -64 48 -64|L 0 -128 72 -128|L 0 -192 48 -192|L 256 -128 216 -128|C 204 -128 12|L 48 -64 48 -80|L 48 -192 48 -176|L 112 -80 48 -80|L 112 -176 48 -176|A 16 -128 56 48 -80 48 -176|A 116 -168 88 112 -80 192 -128|A 116 -88 88 192 -128 112 -176',
  nor4: 'L 0 -64 48 -64|L 0 -128 64 -128|L 0 -192 64 -192|L 0 -256 48 -256|L 256 -160 216 -160|C 204 -160 12|L 112 -208 48 -208|A 116 -120 88 192 -160 112 -208|L 112 -112 48 -112|L 48 -256 48 -208|L 48 -64 48 -112|A 16 -160 56 48 -112 48 -208|A 116 -200 88 112 -112 192 -160',
  xor2: 'L 0 -64 64 -64|L 0 -128 60 -128|L 256 -96 208 -96|A 16 -96 56 48 -48 44 -144|A 32 -96 56 64 -48 64 -144|L 128 -144 64 -144|L 128 -48 64 -48|A 132 -56 88 208 -96 128 -144|A 132 -136 88 128 -48 208 -96',
  xnor2: 'L 0 -64 64 -64|L 0 -128 60 -128|A 16 -96 56 48 -48 44 -144|A 32 -96 56 64 -48 64 -144|L 128 -144 64 -144|L 128 -48 64 -48|A 132 -56 88 208 -96 128 -144|A 132 -136 88 128 -48 208 -96|C 220 -96 8|L 228 -96 256 -96|L 60 -28 60 -28',
  inv: 'L 0 -32 64 -32|L 224 -32 160 -32|L 64 -64 128 -32|L 128 -32 64 0|L 64 0 64 -64|C 144 -32 16',
  buf: 'L 0 -32 64 -32|L 224 -32 128 -32|L 64 0 128 -32|L 128 -32 64 -64|L 64 -64 64 0',
  fd: 'R 64 -320 256 256|L 0 -128 64 -128|L 0 -256 64 -256|L 384 -256 320 -256|L 80 -128 64 -144|L 64 -112 80 -128',
  fdc: 'L 0 -128 64 -128|L 0 -32 64 -32|L 0 -256 64 -256|L 384 -256 320 -256|R 64 -320 256 256|L 64 -112 80 -128|L 80 -128 64 -144|L 192 -64 192 -32|L 192 -32 64 -32',
  fdce: 'L 0 -128 64 -128|L 0 -192 64 -192|L 0 -32 64 -32|L 0 -256 64 -256|L 384 -256 320 -256|L 64 -112 80 -128|L 80 -128 64 -144|L 192 -64 192 -32|L 192 -32 64 -32|R 64 -320 256 256',
  fdre: 'L 0 -128 64 -128|L 0 -192 64 -192|L 0 -256 64 -256|L 384 -256 320 -256|L 0 -32 64 -32|R 64 -320 256 256|L 192 -64 192 -32|L 192 -32 64 -32|L 64 -112 80 -128|L 80 -128 64 -144',
  fdr: 'L 0 -128 64 -128|L 0 -256 64 -256|L 384 -256 320 -256|L 0 -32 64 -32|R 64 -320 256 256|L 192 -64 192 -32|L 192 -32 64 -32|L 64 -112 80 -128|L 80 -128 64 -144',
  m2_1: 'L 96 -64 96 -192|L 256 -96 96 -64|L 256 -160 256 -96|L 96 -192 256 -160|L 176 -32 96 -32|L 176 -80 176 -32|L 0 -32 96 -32|L 320 -128 256 -128|L 0 -96 96 -96|L 0 -160 96 -160',
  vcc: 'L 64 -32 64 -64|L 64 0 64 -32|L 96 -64 32 -64',
  gnd: 'L 64 -64 64 -96|L 76 -48 52 -48|L 68 -32 60 -32|L 88 -64 40 -64|L 64 -64 64 -80|L 64 -128 64 -96',
  fd8ce: 'L 0 -128 64 -128|L 0 -192 64 -192|L 0 -32 64 -32|L 0 -256 64 -256|L 384 -256 320 -256|L 192 -32 64 -32|L 192 -64 192 -32|L 80 -128 64 -144|L 64 -112 80 -128|R 320 -268 64 24|R 0 -268 64 24|R 64 -320 256 256',
  fd16ce: 'L 0 -128 64 -128|L 0 -192 64 -192|L 0 -32 64 -32|L 0 -256 64 -256|L 384 -256 320 -256|L 80 -128 64 -144|L 64 -112 80 -128|R 320 -268 64 24|R 0 -268 64 24|L 192 -32 64 -32|L 192 -64 192 -32|R 64 -320 256 256',
  fd8re: 'L 0 -128 64 -128|L 0 -192 64 -192|L 0 -256 64 -256|L 384 -256 320 -256|L 0 -32 64 -32|R 0 -268 64 24|R 320 -268 64 24|L 80 -128 64 -144|L 64 -112 80 -128|L 192 -32 64 -32|L 192 -64 192 -32|R 64 -320 256 256',
  fd16re: 'L 0 -128 64 -128|L 0 -192 64 -192|L 0 -256 64 -256|L 384 -256 320 -256|L 0 -32 64 -32|L 192 -32 64 -32|L 192 -64 192 -32|R 64 -320 256 256|R 0 -268 64 24|R 320 -268 64 24|L 80 -128 64 -144|L 64 -112 80 -128',
  cb8ce: 'L 384 -128 320 -128|R 320 -268 64 24|L 384 -256 320 -256|L 0 -192 64 -192|L 192 -32 64 -32|L 192 -64 192 -32|L 80 -128 64 -144|L 64 -112 80 -128|L 0 -128 64 -128|L 0 -32 64 -32|L 384 -192 320 -192|R 64 -320 256 256',
  cb16ce: 'L 384 -192 320 -192|R 320 -268 64 24|L 384 -256 320 -256|L 0 -192 64 -192|L 192 -32 64 -32|L 192 -64 192 -32|L 80 -128 64 -144|L 64 -112 80 -128|L 0 -128 64 -128|L 0 -32 64 -32|L 384 -128 320 -128|R 64 -320 256 256',
  cb8re: 'L 384 -192 320 -192|L 0 -192 64 -192|L 192 -32 64 -32|L 192 -64 192 -32|L 0 -32 64 -32|L 80 -128 64 -144|L 64 -112 80 -128|L 0 -128 64 -128|L 384 -256 320 -256|R 320 -268 64 24|L 384 -128 320 -128|R 64 -320 256 256',
  comp8: 'R 64 -384 256 320|L 384 -224 320 -224|R 0 -332 64 24|L 0 -320 64 -320|R 0 -140 64 24|L 0 -128 64 -128',
};
// inverted-input gates (and2b1...): the plain gate with the first k input stubs shortened to 0..40 and a bubble at 52
// (radius 12), as in the ISE library (checked against and2b2 / and3b1 / and3b2 of real ISE schematics)
for (const base of Object.keys(LIB_GFX)) {
  const m = /^(and|or|nand|nor)(\d)$/.exec(base);
  if (!m) continue;
  const n = +m[2];
  for (let k = 1; k <= n; k++) {
    LIB_GFX[`${base}b${k}`] = LIB_GFX[base].split('|').map(sh => {
      const v = sh.split(' ');
      for (let i = 0; i < k; i++) {
        const y = -64 * (i + 1);
        if (v[0] === 'L' && +v[1] === 0 && +v[2] === y && +v[4] === y) return `L 0 ${y} 40 ${y}|C 52 ${y} 12`;
      }
      return sh;
    }).join('|');
  }
}
const LIB_TS = { fdr: '2000-1-1T10:10:10', m2_1: '2001-5-4T10:10:51', cb8re: '2001-2-2T12:36:39' };
function gfxShapes(code) {
  return code.split('|').map(t => {
    const [k, ...v] = t.split(' ');
    const n = v.map(Number);
    if (k[0] === 'L') return { kind: 'line', x1: n[0], y1: n[1], x2: n[2], y2: n[3], bus: k === 'LW' };
    if (k === 'R') return { kind: 'rect', x: n[0], y: n[1], w: n[2], h: n[3] };
    if (k === 'C') return { kind: 'circle', cx: n[0], cy: n[1], r: n[2] };
    return { kind: 'arc', cx: n[0], cy: n[1], r: n[2], sx: n[3], sy: n[4], ex: n[5], ey: n[6] };
  });
}

const GATE_RE = /^(and|or|nand|nor|xor|xnor)(\d+)(?:b(\d+))?$/;
const BUF1 = new Set(['inv', 'buf', 'ibuf', 'obuf', 'ibufg', 'bufg', 'bufgp', 'bufgce_1', 'ibuf_lvcmos33', 'obuf_lvcmos33', 'ibufg_lvcmos33']);
// library pins: { name: [dir, x, y] } (x/y null when the position is not known; inferred from the wires on import)
export function libPins(sym) {
  const s = lc(sym);
  let m = GATE_RE.exec(s);
  if (m) {
    const n = +m[2];
    const p = {};
    for (let k = 0; k < n; k++) p[`I${k}`] = ['in', 0, -64 * (k + 1)];
    p.O = ['out', 256, -32 * (n + 1)];
    return p;
  }
  if (BUF1.has(s)) return { I: ['in', 0, -32], O: ['out', 224, -32] };
  if ((m = /^(inv|buf|ibuf|obuf)(8|16|32)$/.exec(s))) { const w = +m[2]; return { [`I(${w - 1}:0)`]: ['in', 0, -32], [`O(${w - 1}:0)`]: ['out', 224, -32] }; }
  if (s === 'inv4' || s === 'buf4') { const p = {}; for (let k = 0; k < 4; k++) { p[`I${k}`] = ['in', 0, s === 'inv4' ? -32 - 64 * k : -224 + 64 * k]; p[`O${k}`] = ['out', 224, s === 'inv4' ? -32 - 64 * k : -224 + 64 * k]; } return p; }
  if (s === 'obufe' || s === 'bufe') return { E: ['in', 0, -96], I: ['in', 0, -32], O: ['out', 224, -32] };
  if (s === 'obuft' || s === 'buft') return { T: ['in', null, null], I: ['in', 0, -32], O: ['out', 224, -32] };
  if (s === 'vcc') return { P: ['out', 64, 0] };
  if (s === 'gnd') return { G: ['out', 64, -128] };
  m = /^(fd|ld)(c|ce|e|p|pe|r|re|s|se|cp|cpe|rs|rse)?(_1)?$/.exec(s);
  if (m) {
    const ck = m[1] === 'ld' ? 'G' : 'C', f = m[2] || '';
    const p = { D: ['in', 0, -256], [ck]: ['in', 0, -128], Q: ['out', 384, -256] };
    if (f.includes('e')) p[m[1] === 'ld' ? 'GE' : 'CE'] = ['in', 0, -192];
    if (/^c/.test(f)) p.CLR = ['in', 0, -32];
    if (/^r/.test(f)) p.R = ['in', 0, -32];
    if (/p/.test(f)) p.PRE = ['in', 0, -352];
    if (/s/.test(f)) p.S = ['in', null, null];
    return p;
  }
  m = /^fd(4|8|16|32)(ce|re)$/.exec(s);
  if (m) {
    const w = +m[1];
    const p = { CE: ['in', 0, -192], C: ['in', 0, -128], [m[2] === 'ce' ? 'CLR' : 'R']: ['in', 0, -32] };
    if (w === 4) for (let k = 0; k < 4; k++) { p[`D${k}`] = ['in', 0, -448 + 64 * k]; p[`Q${k}`] = ['out', 384, -448 + 64 * k]; }
    else { p[`D(${w - 1}:0)`] = ['in', 0, -256]; p[`Q(${w - 1}:0)`] = ['out', 384, -256]; }
    return p;
  }
  m = /^cb(2|4|8|16)(ce|re)$/.exec(s);
  if (m) {
    const w = +m[1];
    const p = { CE: ['in', 0, -192], C: ['in', 0, -128], [m[2] === 'ce' ? 'CLR' : 'R']: ['in', 0, -32], CEO: ['out', 384, -192], TC: ['out', 384, -128] };
    if (w <= 4) for (let k = 0; k < w; k++) p[`Q${k}`] = ['out', 384, w === 4 ? -448 + 64 * k : null];
    else p[`Q(${w - 1}:0)`] = ['out', 384, -256];
    return p;
  }
  if (s === 'm2_1') return { D0: ['in', 0, -160], D1: ['in', 0, -96], S0: ['in', 0, -32], O: ['out', 320, -128] };
  if (s === 'm2_1b1' || s === 'm2_1b2') return { D0: ['in', null, null], D1: ['in', null, null], S0: ['in', null, null], O: ['out', null, null] };
  if (s === 'm2_1e') return { D0: ['in', 0, -224], D1: ['in', 0, -160], S0: ['in', 0, -96], E: ['in', 0, -32], O: ['out', 320, -192] };
  if (s === 'm4_1e') return { D0: ['in', 0, -416], D1: ['in', 0, -352], D2: ['in', 0, -288], D3: ['in', 0, -224], S0: ['in', 0, -160], S1: ['in', 0, -96], E: ['in', 0, -32], O: ['out', 320, -320] };
  if (s === 'm8_1e') { const p = {}; for (let k = 0; k < 8; k++) p[`D${k}`] = ['in', 0, -736 + 64 * k]; Object.assign(p, { S0: ['in', 0, -224], S1: ['in', 0, -160], S2: ['in', 0, -96], E: ['in', 0, -32], O: ['out', 320, -512] }); return p; }
  m = /^d(2|3|4)_(4|8|16)e$/.exec(s);
  if (m) {
    const n = +m[1], o = 1 << n, p = {};
    const top = n === 2 ? -320 : n === 3 ? -576 : null;
    for (let k = 0; k < n; k++) p[`A${k}`] = ['in', 0, top == null ? null : top + 64 * k];
    p.E = ['in', 0, top == null ? null : -128];
    for (let k = 0; k < o; k++) p[`D${k}`] = ['out', 384, top == null ? null : top + 64 * k];
    return p;
  }
  m = /^comp(m)?(2|4|8|16)$/.exec(s);
  if (m) {
    const w = +m[2], p = {};
    if (w <= 4) for (let k = 0; k < w; k++) { p[`A${k}`] = ['in', null, null]; p[`B${k}`] = ['in', null, null]; }
    else { p[`A(${w - 1}:0)`] = ['in', 0, -320]; p[`B(${w - 1}:0)`] = ['in', 0, -128]; }
    if (m[1]) { p.GT = ['out', 384, null]; p.LT = ['out', 384, w > 4 ? -192 : null]; } else p.EQ = ['out', 384, w > 4 ? -224 : null];
    return p;
  }
  m = /^(add|adsu)(4|8|16)$/.exec(s);
  if (m) {
    const w = +m[2], p = { CI: ['in', 0, w === 4 ? -832 : -448] };
    if (w === 4) for (let k = 0; k < 4; k++) { p[`A${k}`] = ['in', 0, -704 + 64 * k]; p[`B${k}`] = ['in', 0, -384 + 64 * k]; p[`S${k}`] = ['out', 448, -544 + 64 * k]; }
    else { p[`A(${w - 1}:0)`] = ['in', 0, -320]; p[`B(${w - 1}:0)`] = ['in', 0, -192]; p[`S(${w - 1}:0)`] = ['out', 448, -256]; }
    if (m[1] === 'adsu') p.ADD = ['in', null, null];
    p.CO = ['out', 448, -64]; p.OFL = ['out', 448, -128];
    return p;
  }
  m = /^ft(c|ce|cp|cpe|p|pe|rse|sre)$/.exec(s);
  if (m) {
    const f = m[1];
    const p = { T: ['in', 0, -256], C: ['in', 0, -128], Q: ['out', 384, -256] };
    if (f.endsWith('e')) p.CE = ['in', 0, -192];
    if (f[0] === 'c') p.CLR = ['in', 0, -32];
    if (/^c?p/.test(f)) p.PRE = ['in', 0, -352];
    if (/^(rs|sr)/.test(f)) { p.R = ['in', 0, -32]; p.S = ['in', null, null]; }
    return p;
  }
  // J-K flip-flops (pin positions inferred from the wires on import)
  m = /^fjk(c|ce|cp|cpe|p|pe|rse|sre)$/.exec(s);
  if (m) {
    const f = m[1];
    const p = { J: ['in', null, null], K: ['in', null, null], C: ['in', null, null], Q: ['out', null, null] };
    if (f.endsWith('e')) p.CE = ['in', null, null];
    if (f[0] === 'c') p.CLR = ['in', null, null];
    if (/^c?p/.test(f)) p.PRE = ['in', null, null];
    if (/^(rs|sr)/.test(f)) { p.R = ['in', null, null]; p.S = ['in', null, null]; }
    return p;
  }
  // carry logic / wide-function multiplexer primitives (positions inferred from the wires)
  if ((m = /^muxcy(_l|_d)?$/.exec(s))) return { CI: ['in', null, null], DI: ['in', null, null], S: ['in', null, null], ...(m[1] !== '_l' ? { O: ['out', null, null] } : {}), ...(m[1] ? { LO: ['out', null, null] } : {}) };
  if ((m = /^xorcy(_l|_d)?$/.exec(s))) return { CI: ['in', null, null], LI: ['in', null, null], ...(m[1] !== '_l' ? { O: ['out', null, null] } : {}), ...(m[1] ? { LO: ['out', null, null] } : {}) };
  if (s === 'mult_and') return { I0: ['in', 0, -64], I1: ['in', 0, -128], LO: ['out', 256, -96] };
  if ((m = /^muxf[5-8](_l|_d)?$/.exec(s))) return { I0: ['in', null, null], I1: ['in', null, null], S: ['in', null, null], ...(m[1] !== '_l' ? { O: ['out', null, null] } : {}), ...(m[1] ? { LO: ['out', null, null] } : {}) };
  return null;
}

// pins of a blockdef that look like pin stubs: a line with one end on the outside of the body
function blockdefPinPoints(def) {
  if (!def) return [];
  const pts = new Map();
  const rects = def.shapes.filter(s => s.kind === 'rect' && s.w > 32 && s.h > 32);
  const inside = (x, y) => rects.some(r => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of def.shapes) if (s.kind === 'line') { x0 = Math.min(x0, s.x1, s.x2); x1 = Math.max(x1, s.x1, s.x2); y0 = Math.min(y0, s.y1, s.y2); y1 = Math.max(y1, s.y1, s.y2); }
  for (const s of def.shapes) {
    if (s.kind !== 'line') continue;
    for (const [x, y, ox, oy] of [[s.x1, s.y1, s.x2, s.y2], [s.x2, s.y2, s.x1, s.y1]]) {
      if (rects.length ? (!inside(x, y) && inside(ox, oy)) : (x === x0 || x === x1 || y === y0 || y === y1)) pts.set(`${x},${y}`, [x, y]);
    }
  }
  return [...pts.values()];
}

// ===================================================================== exact HDL for library symbols without a XAIlinx twin
// Each template gets (lang, P, T, W): P(isePin) -> pin identifier, T(suffix) -> fresh temp identifier,
// W(isePin) -> pin width. Returns { code, decls } (decls go to doc.hdl.decls).
function vecV(P, names) { return `{${names.map(P).join(', ')}}`; }
function vecVh(P, names) { return names.map(P).join(' & '); }
const bitV = (x, i) => `${x}[${i}]`;
const bitVh = (x, i) => `${x}(${i})`;

function gateTpl(op, n, b) {
  const bop = op === 'nand' ? 'and' : op === 'nor' ? 'or' : op === 'xnor' ? 'xor' : op;
  const inv = op === 'nand' || op === 'nor' || op === 'xnor';
  return (lang, P) => {
    const ins = [];
    for (let k = 0; k < n; k++) ins.push(k < b ? (lang === 'vhdl' ? `(not ${P(`I${k}`)})` : `~${P(`I${k}`)}`) : P(`I${k}`));
    if (lang === 'vhdl') { const e = ins.join(` ${bop} `); return { code: `${P('O')} <= ${inv ? `not (${e})` : e};` }; }
    const o = { and: '&', or: '|', xor: '^' }[bop];
    const e = ins.join(` ${o} `);
    return { code: `assign ${P('O')} = ${inv ? `~(${e})` : e};` };
  };
}
// n:1 multiplexer with select bits S0..S(k-1), optional enable E, optional inverted data inputs
function muxTpl(n, { en = false, invert = 0 } = {}) {
  const k = Math.log2(n);
  return (lang, P) => {
    const d = i => (i < invert ? (lang === 'vhdl' ? `(not ${P(`D${i}`)})` : `~${P(`D${i}`)}`) : P(`D${i}`));
    if (lang === 'vhdl') {
      const val = i => (en ? `(${P('E')} and ${d(i).replace(/^\((.*)\)$/, '$1')})` : d(i));
      const parts = [];
      for (let i = 0; i < n - 1; i++) {
        const cond = [];
        for (let j = k - 1; j >= 0; j--) cond.push(`${P(`S${j}`)} = '${(i >> j) & 1}'`);
        parts.push(`${val(i)} when ${cond.join(' and ')} else`);
      }
      return { code: `${P('O')} <=\n  ${[...parts, `${val(n - 1)};`].join('\n  ')}` };
    }
    const tree = (lo, hi, j) => (j < 0 ? d(lo) : `(${P(`S${j}`)} ? ${tree(lo + ((hi - lo + 1) >> 1), hi, j - 1)} : ${tree(lo, lo + ((hi - lo + 1) >> 1) - 1, j - 1)})`);
    const e = tree(0, n - 1, k - 1);
    return { code: `assign ${P('O')} = ${en ? `${P('E')} & ${e}` : e};` };
  };
}
function decoderTpl(n) {
  return (lang, P) => {
    const L = [];
    for (let i = 0; i < 1 << n; i++) {
      const t = [P('E')];
      for (let j = n - 1; j >= 0; j--) t.push((i >> j) & 1 ? P(`A${j}`) : (lang === 'vhdl' ? `(not ${P(`A${j}`)})` : `~${P(`A${j}`)}`));
      L.push(lang === 'vhdl' ? `${P(`D${i}`)} <= ${t.join(' and ')};` : `assign ${P(`D${i}`)} = ${t.join(' & ')};`);
    }
    return { code: L.join('\n') };
  };
}
// comparators with separate bit pins (COMP2/4, COMPM2/4) or buses (COMPM8/16 with both outputs)
function compTpl(w, bits, outs) {
  return (lang, P) => {
    const vh = lang === 'vhdl';
    const A = i => (bits ? P(`A${i}`) : (vh ? bitVh(P(`A(${w - 1}:0)`), i) : bitV(P(`A(${w - 1}:0)`), i)));
    const B = i => (bits ? P(`B${i}`) : (vh ? bitVh(P(`B(${w - 1}:0)`), i) : bitV(P(`B(${w - 1}:0)`), i)));
    const L = [];
    const not = x => (vh ? `(not ${x})` : `~${x}`);
    const and = (...x) => x.join(vh ? ' and ' : ' & ');
    const or = (...x) => x.join(vh ? ' or ' : ' | ');
    const xnor = (a, b) => (vh ? `(${a} xnor ${b})` : `(${a} ~^ ${b})`);
    const gt = (i, swap) => { const a = swap ? B(i) : A(i), b = swap ? A(i) : B(i); const here = `(${and(a, not(b))})`; return i === 0 ? here : `(${or(here, `(${and(xnor(A(i), B(i)), gt(i - 1, swap))})`)})`; };
    const asg = (o, e) => L.push(vh ? `${P(o)} <= ${e};` : `assign ${P(o)} = ${e};`);
    if (!bits && outs.some(o => o !== 'EQ')) {
      const a = P(`A(${w - 1}:0)`), b = P(`B(${w - 1}:0)`);
      if (outs.includes('GT')) L.push(vh ? `${P('GT')} <= '1' when unsigned(${a}) > unsigned(${b}) else '0';` : `assign ${P('GT')} = ${a} > ${b};`);
      if (outs.includes('LT')) L.push(vh ? `${P('LT')} <= '1' when unsigned(${a}) < unsigned(${b}) else '0';` : `assign ${P('LT')} = ${a} < ${b};`);
      return { code: L.join('\n') };
    }
    for (const o of outs) {
      if (o === 'EQ') asg(o, [...Array(w).keys()].map(i => xnor(A(i), B(i))).join(vh ? ' and ' : ' & '));
      else asg(o, gt(w - 1, o === 'LT'));
    }
    return { code: L.join('\n') };
  };
}
// ADD4/8/16 and ADSU4/8/16: S = A + B + CI (ADD = 1) or A + not B + CI (ADD = 0), CO carry out, OFL two's complement overflow
function adderTpl(w, bits, adsu) {
  return (lang, P, T) => {
    const vh = lang === 'vhdl';
    const an = [...Array(w).keys()].reverse().map(i => `A${i}`), bn = an.map(x => 'B' + x.slice(1)), sn = an.map(x => 'S' + x.slice(1));
    const a = T('a'), b = T('b'), s = T('s');
    const L = [];
    const msb = w - 1;
    if (vh) {
      const decls = [`signal ${a}, ${b} : std_logic_vector(${msb} downto 0);`, `signal ${s} : unsigned(${w} downto 0);`];
      L.push(`${a} <= ${bits ? vecVh(P, an) : P(`A(${msb}:0)`)};`);
      const bv = bits ? vecVh(P, bn) : P(`B(${msb}:0)`);
      L.push(adsu ? `${b} <= ${bv} when ${P('ADD')} = '1' else not (${bv});` : `${b} <= ${bv};`);
      const sum = `resize(unsigned(${a}), ${w + 1}) + resize(unsigned(${b}), ${w + 1})`;
      L.push(`${s} <= ${sum} + 1 when ${P('CI')} = '1' else ${sum};`);
      if (bits) sn.forEach((x, i) => L.push(`${P(x)} <= ${s}(${msb - i});`)); else L.push(`${P(`S(${msb}:0)`)} <= std_logic_vector(${s}(${msb} downto 0));`);
      L.push(`${P('CO')} <= ${s}(${w});`);
      L.push(`${P('OFL')} <= (${a}(${msb}) xnor ${b}(${msb})) and (${a}(${msb}) xor ${s}(${msb}));`);
      return { code: L.join('\n'), decls };
    }
    const decls = [`wire [${msb}:0] ${a}, ${b};`, `wire [${w}:0] ${s};`];
    L.push(`assign ${a} = ${bits ? vecV(P, an) : P(`A(${msb}:0)`)};`);
    const bv = bits ? vecV(P, bn) : P(`B(${msb}:0)`);
    L.push(`assign ${b} = ${adsu ? `${P('ADD')} ? ${bv} : ~${bv}` : bv};`);
    L.push(`assign ${s} = ${a} + ${b} + ${P('CI')};`);
    if (bits) sn.forEach((x, i) => L.push(`assign ${P(x)} = ${s}[${msb - i}];`)); else L.push(`assign ${P(`S(${msb}:0)`)} = ${s}[${msb}:0];`);
    L.push(`assign ${P('CO')} = ${s}[${w}];`);
    L.push(`assign ${P('OFL')} = (${a}[${msb}] ~^ ${b}[${msb}]) & (${a}[${msb}] ^ ${s}[${msb}]);`);
    return { code: L.join('\n'), decls };
  };
}
// CB2CE..CB16CE / CB..RE counters with all outputs (Q bits or bus, CEO, TC)
function counterTpl(w, bits, sync) {
  return (lang, P, T, has) => {
    const vh = lang === 'vhdl';
    const q = T('q'), msb = w - 1, rst = sync ? P('R') : P('CLR');
    const L = [];
    const outs = bits ? [...Array(w).keys()].map(i => [`Q${i}`, i]) : [[`Q(${msb}:0)`, null]];
    if (vh) {
      const decls = [`signal ${q} : unsigned(${msb} downto 0) := (others => '0');`];
      if (sync) L.push(`process (${P('C')})`, 'begin', `  if rising_edge(${P('C')}) then`, `    if ${rst} = '1' then`, `      ${q} <= (others => '0');`, `    elsif ${P('CE')} = '1' then`, `      ${q} <= ${q} + 1;`, '    end if;', '  end if;', 'end process;');
      else L.push(`process (${P('C')}, ${rst})`, 'begin', `  if ${rst} = '1' then`, `    ${q} <= (others => '0');`, `  elsif rising_edge(${P('C')}) then`, `    if ${P('CE')} = '1' then`, `      ${q} <= ${q} + 1;`, '    end if;', '  end if;', 'end process;');
      for (const [o, i] of outs) if (has(o)) L.push(i == null ? `${P(o)} <= std_logic_vector(${q});` : `${P(o)} <= ${q}(${i});`);
      const all = `${q} = to_unsigned(${2 ** w - 1}, ${w})`;
      if (has('TC')) L.push(`${P('TC')} <= '1' when ${all} else '0';`);
      if (has('CEO')) L.push(`${P('CEO')} <= '1' when ${all} and ${P('CE')} = '1' else '0';`);
      return { code: L.join('\n'), decls };
    }
    const decls = [`reg [${msb}:0] ${q} = ${w}'b0;`];
    L.push(sync ? `always @(posedge ${P('C')})` : `always @(posedge ${P('C')} or posedge ${rst})`, `  if (${rst}) ${q} <= ${w}'b0;`, `  else if (${P('CE')}) ${q} <= ${q} + 1'b1;`);
    for (const [o, i] of outs) if (has(o)) L.push(i == null ? `assign ${P(o)} = ${q};` : `assign ${P(o)} = ${q}[${i}];`);
    if (has('TC')) L.push(`assign ${P('TC')} = &${q};`);
    if (has('CEO')) L.push(`assign ${P('CEO')} = ${P('CE')} & (&${q});`);
    return { code: L.join('\n'), decls };
  };
}
// generic flip-flop / toggle flip-flop: { w, bits, ce, clr, pre, r, s, neg, toggle, init }
function ffTpl(o) {
  return (lang, P, T, has) => {
    const vh = lang === 'vhdl';
    const q = T('q'), w = o.w || 1, msb = w - 1;
    const din = o.bits ? [...Array(w).keys()].reverse().map(i => `D${i}`) : null;
    const C = P(o.clk || 'C');
    const dv = o.toggle ? null : (din ? (vh ? vecVh(P, din) : vecV(P, din)) : P('D'));
    const ones = vh ? (w > 1 ? "(others => '1')" : "'1'") : `${w}'b${'1'.repeat(w)}`;
    const zeros = vh ? (w > 1 ? "(others => '0')" : "'0'") : `${w}'b0`;
    const iv = o.init === '1' ? ones : zeros;
    const L = [];
    let next = o.toggle ? (vh ? `not ${q}` : `~${q}`) : dv;
    const en = [o.ce && P('CE'), o.toggle && P('T')].filter(Boolean);
    if (vh) {
      const decls = [`signal ${q} : ${w > 1 ? `std_logic_vector(${msb} downto 0)` : 'std_logic'} := ${iv};`];
      const sens = [C, o.clr && P('CLR'), o.pre && P('PRE')].filter(Boolean);
      L.push(`process (${sens.join(', ')})`, 'begin');
      const asyn = [];
      if (o.clr) asyn.push([P('CLR'), zeros]);
      if (o.pre) asyn.push([P('PRE'), ones]);
      let first = true;
      for (const [sig, v] of asyn) { L.push(`  ${first ? 'if' : 'elsif'} ${sig} = '1' then`, `    ${q} <= ${v};`); first = false; }
      L.push(`  ${first ? 'if' : 'elsif'} ${o.neg ? 'falling_edge' : 'rising_edge'}(${C}) then`);
      const body = [];
      const syn = [];
      if (o.r) syn.push([P('R'), zeros]);
      if (o.s) syn.push([P('S'), ones]);
      let f2 = true;
      for (const [sig, v] of syn) { body.push(`${f2 ? 'if' : 'elsif'} ${sig} = '1' then`, `  ${q} <= ${v};`); f2 = false; }
      if (en.length) body.push(`${f2 ? 'if' : 'elsif'} ${en.map(e => `${e} = '1'`).join(' and ')} then`, `  ${q} <= ${next};`, 'end if;');
      else if (!f2) body.push('else', `  ${q} <= ${next};`, 'end if;');
      else body.push(`${q} <= ${next};`);
      L.push(...body.map(l => '    ' + l), '  end if;', 'end process;');
      if (o.bits) for (let i = 0; i < w; i++) L.push(`${P(`Q${i}`)} <= ${q}(${i});`); else L.push(`${P(o.qName || 'Q')} <= ${q};`);
      return { code: L.join('\n'), decls };
    }
    const decls = [`reg ${w > 1 ? `[${msb}:0] ` : ''}${q} = ${iv};`];
    const ev = [`${o.neg ? 'negedge' : 'posedge'} ${C}`, o.clr && `posedge ${P('CLR')}`, o.pre && `posedge ${P('PRE')}`].filter(Boolean);
    L.push(`always @(${ev.join(' or ')})`);
    const ch = [];
    if (o.clr) ch.push([P('CLR'), zeros]);
    if (o.pre) ch.push([P('PRE'), ones]);
    if (o.r) ch.push([P('R'), zeros]);
    if (o.s) ch.push([P('S'), ones]);
    ch.forEach(([sig, v], i) => L.push(`  ${i ? 'else if' : 'if'} (${sig}) ${q} <= ${v};`));
    const upd = `${en.length ? `if (${en.join(' && ')}) ` : ''}${q} <= ${next};`;
    L.push(ch.length ? `  else ${upd}` : `  ${upd}`);
    if (o.bits) for (let i = 0; i < w; i++) L.push(`assign ${P(`Q${i}`)} = ${q}[${i}];`); else L.push(`assign ${P(o.qName || 'Q')} = ${q};`);
    return { code: L.join('\n'), decls };
  };
}
function triTpl(kind) {
  return (lang, P) => {
    const vh = lang === 'vhdl';
    if (kind === 'e') return { code: vh ? `${P('O')} <= ${P('I')} when ${P('E')} = '1' else 'Z';` : `assign ${P('O')} = ${P('E')} ? ${P('I')} : 1'bz;` };
    return { code: vh ? `${P('O')} <= 'Z' when ${P('T')} = '1' else ${P('I')};` : `assign ${P('O')} = ${P('T')} ? 1'bz : ${P('I')};` };
  };
}
function multiTpl(n, inv) {
  return (lang, P) => {
    const L = [];
    for (let k = 0; k < n; k++) {
      const i = P(`I${k}`), o = P(`O${k}`);
      L.push(lang === 'vhdl' ? `${o} <= ${inv ? 'not ' : ''}${i};` : `assign ${o} = ${inv ? '~' : ''}${i};`);
    }
    return { code: L.join('\n') };
  };
}
// template for a library symbol (lower-case name), or null
function libTemplate(s, conn) {
  let m = GATE_RE.exec(s);
  if (m) return gateTpl(m[1], +m[2], +(m[3] || 0));
  if (s === 'm2_1b1' || s === 'm2_1b2') return muxTpl(2, { invert: s === 'm2_1b1' ? 1 : 2 });
  if (s === 'm2_1e') return muxTpl(2, { en: true });
  if (s === 'm4_1e') return muxTpl(4, { en: true });
  if (s === 'm8_1e') return muxTpl(8, { en: true });
  if ((m = /^d(2|3|4)_(4|8|16)e$/.exec(s))) return decoderTpl(+m[1]);
  if ((m = /^comp(m)?(2|4|8|16)$/.exec(s))) { const w = +m[2]; return compTpl(w, w <= 4, m[1] ? ['GT', 'LT'].filter(conn) : ['EQ']); }
  if ((m = /^(add|adsu)(4|8|16)$/.exec(s))) return adderTpl(+m[2], m[2] === '4', m[1] === 'adsu');
  if ((m = /^cb(2|4|8|16)(ce|re)$/.exec(s))) return counterTpl(+m[1], +m[1] <= 4, m[2] === 're');
  if ((m = /^fd(4)(ce|re)$/.exec(s))) return ffTpl({ w: 4, bits: true, ce: true, clr: m[2] === 'ce', r: m[2] === 're' });
  if ((m = /^fd(c|ce|e|p|pe|r|re|s|se|cp|cpe|rs|rse)?(_1)?$/.exec(s))) {
    const f = m[1] || '';
    return ffTpl({ ce: f.includes('e'), clr: /^c/.test(f), pre: /p/.test(f), r: /^r/.test(f), s: /s/.test(f), neg: !!m[2], init: /p|^s|rs/.test(f) ? '1' : '0' });
  }
  if ((m = /^ft(c|ce|p|pe)$/.exec(s))) return ffTpl({ toggle: true, ce: m[1].includes('e'), clr: m[1][0] === 'c', pre: m[1][0] === 'p', init: m[1][0] === 'p' ? '1' : '0' });
  if (s === 'obufe' || s === 'bufe') return triTpl('e');
  if (s === 'obuft' || s === 'buft') return triTpl('t');
  if (s === 'inv4' || s === 'buf4') return multiTpl(4, s === 'inv4');
  if ((m = /^(muxcy|xorcy|mult_and|muxf[5-8])(_l|_d)?$/.exec(s))) {
    const outs = m[1] === 'mult_and' ? ['LO'] : [...(m[2] !== '_l' ? ['O'] : []), ...(m[2] ? ['LO'] : [])];
    return (lang, P) => {
      const vh = lang === 'vhdl';
      const e = m[1] === 'muxcy' ? (vh ? `${P('CI')} when ${P('S')} = '1' else ${P('DI')}` : `${P('S')} ? ${P('CI')} : ${P('DI')}`)
        : m[1] === 'xorcy' ? (vh ? `${P('CI')} xor ${P('LI')}` : `${P('CI')} ^ ${P('LI')}`)
          : m[1] === 'mult_and' ? (vh ? `${P('I0')} and ${P('I1')}` : `${P('I0')} & ${P('I1')}`)
            : (vh ? `${P('I1')} when ${P('S')} = '1' else ${P('I0')}` : `${P('S')} ? ${P('I1')} : ${P('I0')}`);
      return { code: outs.map(o => (vh ? `${P(o)} <= ${e};` : `assign ${P(o)} = ${e};`)).join('\n') };
    };
  }
  return null;
}

// ===================================================================== import: .sch -> .sch.json
const S_IN = 5 / 16;                       // ISE units -> XAIlinx px (ISE pin pitch 64 -> grid 20)
const AUTO_RE = /^XLXN_\d+$/i;
const SIDE_VEC = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
const INWARD_ROT = { W: 0, N: 90, E: 180, S: 270 };   // inverter rotation so that it points into a pin on that side

function findModule(modules, name) {
  if (!name) return null;
  const l = lc(name);
  for (const k in modules) if (lc(k) === l) return modules[k];
  return null;
}

// Order preserving coordinate map with minimum spacing (keeps the topology of orthogonal wiring exact).
class AxisMap {
  constructor(scale) { this.s = scale; this.vals = new Set(); this.cons = new Map(); }
  add(v) { if (Number.isFinite(v)) this.vals.add(v); }
  need(a, b, d) {
    if (!(d > 0) || a === b) return;
    if (a > b) [a, b] = [b, a];
    this.add(a); this.add(b);
    let l = this.cons.get(b); if (!l) this.cons.set(b, l = []);
    l.push([a, d]);
  }
  build(offset = 0) {
    this.sorted = [...this.vals].sort((x, y) => x - y);
    this.map = new Map();
    let prev = -Infinity;
    for (const v of this.sorted) {
      let f = r10(v * this.s);
      if (prev > -Infinity) f = Math.max(f, prev + 10);
      for (const [a, d] of this.cons.get(v) || []) f = Math.max(f, this.map.get(a) + d);
      this.map.set(v, f);
      prev = f;
    }
    this.off = offset;
    this.min = this.sorted.length ? this.map.get(this.sorted[0]) : 0;
    this.max = this.sorted.length ? this.map.get(this.sorted[this.sorted.length - 1]) : 0;
  }
  f(v) {
    if (this.map.has(v)) return this.map.get(v) + this.off;
    const S = this.sorted;
    if (!S.length) return r10(v * this.s) + this.off;
    if (v < S[0]) return this.map.get(S[0]) - r10((S[0] - v) * this.s) + this.off;
    if (v > S[S.length - 1]) return this.map.get(S[S.length - 1]) + r10((v - S[S.length - 1]) * this.s) + this.off;
    let lo = 0, hi = S.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (S[m] <= v) lo = m; else hi = m; }
    const a = S[lo], b = S[hi], fa = this.map.get(a), fb = this.map.get(b);
    return r10(fa + (v - a) / (b - a) * (fb - fa)) + this.off;
  }
}

function onSegment(px, py, [x1, y1, x2, y2]) {
  if (x1 === x2) return px === x1 && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
  if (y1 === y2) return py === y1 && px >= Math.min(x1, x2) && px <= Math.max(x1, x2);
  const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  return Math.abs(cross) < 1e-6 && px >= Math.min(x1, x2) && px <= Math.max(x1, x2) && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
}

/**
 * Convert an ISE schematic (.sch, version 7 XML or legacy VERSION 6 text) into a XAIlinx document.
 * @param {string} xmlText
 * @param {{ modules?: object|object[], symbols?: object, name?: string, lang?: 'vhdl'|'verilog' }} opts
 *   modules: project modules ({ name, ports: [{ name, dir, width }] }, e.g. from modulesFromLibrary) — ISE
 *            symbols with these names become `module` symbols.
 *   symbols: project symbol files { 'name.sym': text } — pin names / directions / positions of symbols that are
 *            neither library symbols nor modules (their HDL blocks get the right pins).
 *   name:    document (module) name; lang: language of the HDL written into HDL blocks (default 'vhdl').
 * @returns {{ doc: object, warnings: string[], unconnected: string[], pinMap: object }}  pinMap: 'block.pin' -> 'symbol.pin'
 */
export function importIseSch(xmlText, opts = {}) {
  const warnings = [];
  const warn = m => { if (!warnings.includes(m)) warnings.push(m); };
  const model = parseIseSch(xmlText);
  const lang = opts.lang === 'verilog' ? 'verilog' : 'vhdl';
  const modules = normModules(opts.modules);
  const docName = String(opts.name || 'schematic');
  // project symbol files (.sym): pin names, directions and positions of non-library symbols
  const symDefs = new Map();
  for (const [k, t] of Object.entries(opts.symbols || {})) {
    try { const d = typeof t === 'string' ? parseIseSym(t) : t; symDefs.set(lc(d.name || String(k).replace(/^.*\//, '').replace(/\.sym$/i, '')), d); } catch (e) { warn(`${k}: ${e.message}`); }
  }

  // ------------------------------------------------------------- signals (keys = lower-case ISE names)
  const sigs = new Map();
  const sig = name => {
    if (name == null) return null;
    const n = String(name).trim();
    if (!n) return null;
    const k = lc(n);
    if (!sigs.has(k)) sigs.set(k, { key: k, name: n, p: parseIseName(n) });
    return k;
  };
  for (const s of model.signals) sig(s.name);
  for (const p of model.ports) sig(p.name);
  for (const b of model.blocks) for (const p of b.pins) if (p.signal) sig(p.signal);
  for (const sh of model.sheets) { for (const b of sh.branches) sig(b.name); for (const io of sh.iomarkers) sig(io.name); }
  const keyWidth = k => sigs.get(k)?.p.width || 1;

  // ------------------------------------------------------------- blocks -> XAIlinx specs
  const instOf = new Map();
  model.sheets.forEach((sh, si) => sh.instances.forEach(i => instOf.set(lc(i.name), { ...i, sheet: si })));
  // ISE pin positions (sheet units) of a block, from the library tables and the wires that end on the symbol
  const sheetGeo = model.sheets.map(sh => {
    const ends = new Map();  // 'x,y' -> Set(keys)
    const segs = [];
    const add = (x, y, k) => { const q = `${x},${y}`; let s = ends.get(q); if (!s) ends.set(q, s = new Set()); s.add(k); };
    for (const br of sh.branches) { const k = lc(br.name.trim()); for (const w of br.wires) { add(w[0], w[1], k); add(w[2], w[3], k); segs.push({ w, k }); } }
    for (const io of sh.iomarkers) add(io.x, io.y, lc(io.name.trim()));
    return { ends, segs, touches: (x, y, k) => ends.get(`${x},${y}`)?.has(k) || segs.some(s => s.k === k && onSegment(x, y, s.w)) };
  });

  const sheetPt = (inst, x, y) => { const [dx, dy] = iseXform(inst.orien, x, y); return [inst.x + dx, inst.y + dy]; };
  const blocks = [];
  for (const b of model.blocks) {
    const inst = instOf.get(lc(b.name)) || null;
    const def = model.blockdefs.get(lc(b.symbol)) || null;
    // ISE pin positions: library table when the wires confirm it, else the blockdef pin stub the wires end on
    const sd = symDefs.get(lc(b.symbol));
    const lib = libPins(b.symbol) || (sd ? Object.fromEntries(sd.pins.map(q => [q.name, [q.dir, q.x, q.y]])) : null);
    const libAt = n => { const L = lib?.[n] || (lib ? lib[Object.keys(lib).find(k => lc(k) === lc(n))] : null); return L && L[1] != null && L[2] != null ? [L[1], L[2]] : null; };
    const cand = blockdefPinPoints(def);
    const local = new Map(), pt = new Map();
    const claimed = new Set();
    if (inst) {
      const geo = sheetGeo[inst.sheet];
      const touch = (l, key) => { const q = sheetPt(inst, l[0], l[1]); return geo.touches(q[0], q[1], key) ? q : null; };
      const pend = [];
      for (const p of b.pins) {
        const key = p.signal ? lc(p.signal.trim()) : null;
        const L = libAt(p.name);
        if (key && L && touch(L, key)) { local.set(p.name, L); claimed.add(`${L[0]},${L[1]}`); } else pend.push([p, key, L]);
      }
      for (const [p, key, L] of pend) {
        if (key) for (const c of cand) { if (claimed.has(`${c[0]},${c[1]}`)) continue; if (touch(c, key)) { local.set(p.name, c); claimed.add(`${c[0]},${c[1]}`); break; } }
        if (!local.has(p.name) && L) local.set(p.name, L);
      }
      for (const [n, l] of local) pt.set(n, sheetPt(inst, l[0], l[1]));
    }
    const spec = mapSymbol(b, modules, warn, { local, def, sym: sd });
    blocks.push({ blk: b, name: b.name, spec, inst, def, pt });
  }

  // pin directions / drivers
  const driven = new Map();
  const portPol = new Map(model.ports.map(p => [lc(p.name), p.polarity]));
  for (const B of blocks) {
    for (const p of B.blk.pins) {
      const k = p.signal ? lc(p.signal.trim()) : null;
      const pm = B.spec.pins[p.name];
      if (!k || !pm) continue;
      if (pm.dir === 'out' || pm.dir === 'inout') driven.set(k, (driven.get(k) || 0) + 1);
    }
  }
  for (const [k, pol] of portPol) if (/input|bidir/i.test(pol)) driven.set(k, (driven.get(k) || 0) + 1);

  // ------------------------------------------------------------- buses: bit / sub-range signals of a bus
  const groups = new Map();
  for (const s of sigs.values()) if (s.p.range || s.p.bit != null) { const g = lc(s.p.base); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(s); }
  const helpers = [];          // virtual blocks: slices / bus joins
  const memberOf = new Map();  // member key -> { main, msb, lsb }
  const mainInfo = new Map();  // main key -> { width }
  for (const list of groups.values()) {
    const ranged = list.filter(s => s.p.range).sort((a, b) => b.p.width - a.p.width);
    if (!ranged.length) continue;
    const main = ranged[0];
    const lo = Math.min(main.p.msb, main.p.lsb), hi = Math.max(main.p.msb, main.p.lsb);
    const desc = main.p.msb >= main.p.lsb;
    const pos = i => (desc ? i - main.p.lsb : main.p.lsb - i);
    const members = [];
    for (const s of list) {
      if (s === main) continue;
      const a = s.p.range ? s.p.msb : s.p.bit, b = s.p.range ? s.p.lsb : s.p.bit;
      if (Math.min(a, b) < lo || Math.max(a, b) > hi) { if (s.p.range) warn(`bus '${s.name}' is not part of '${main.name}': kept as a separate net`); continue; }
      const pa = pos(a), pb = pos(b);
      if (s.p.range && (a >= b) !== desc && a !== b) warn(`bus '${s.name}' has the opposite bit order of '${main.name}': bits are taken in '${main.name}' order`);
      members.push({ s, msb: Math.max(pa, pb), lsb: Math.min(pa, pb) });
    }
    mainInfo.set(main.key, { width: main.p.width });
    if (!members.length) continue;
    const mainDriven = driven.has(main.key);
    const drivenMembers = members.filter(m => driven.has(m.s.key));
    let joined = new Set();
    if (!mainDriven && drivenMembers.length) {
      // the bus is assembled from separately driven parts: one bus join
      const chosen = [];
      for (const m of drivenMembers.sort((x, y) => (y.msb - y.lsb) - (x.msb - x.lsb))) {
        if (chosen.some(c => !(m.msb < c.lsb || m.lsb > c.msb))) { warn(`'${m.s.name}' overlaps another driven part of bus '${main.name}' (multiple drivers)`); continue; }
        chosen.push(m);
      }
      chosen.sort((x, y) => y.msb - x.msb);
      const segs = [];
      let at = main.p.width - 1;
      for (const c of chosen) {
        if (c.msb < at) segs.push({ key: null, width: at - c.msb });
        segs.push({ key: c.s.key, width: c.msb - c.lsb + 1 });
        at = c.lsb - 1;
      }
      if (at >= 0) segs.push({ key: null, width: at + 1 });
      if (segs.some(s => !s.key)) warn(`bus '${main.name}': bits not driven by any part are tied to 0`);
      helpers.push({ kind: 'join', main: main.key, segs });
      joined = new Set(chosen.map(c => c.s.key));
    } else if (mainDriven && drivenMembers.length) warn(`bus '${main.name}' and its part${drivenMembers.length > 1 ? 's' : ''} ${drivenMembers.map(m => `'${m.s.name}'`).join(', ')} are both driven`);
    for (const m of members) {
      memberOf.set(m.s.key, { main: main.key, msb: m.msb, lsb: m.lsb });
      if (!joined.has(m.s.key)) helpers.push({ kind: 'slice', main: main.key, member: m.s.key, msb: m.msb, lsb: m.lsb, width: main.p.width });
    }
  }

  // ------------------------------------------------------------- names (XAIlinx identifiers)
  const owner = new Map();     // lower-case identifier -> owner tag
  const claim = (want, tag) => {
    let b = String(want || 'n').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '') || 'n';
    if (!/^[A-Za-z]/.test(b)) b = 'n' + b;
    let nm = b, k = 0;
    while ((owner.has(lc(nm)) && owner.get(lc(nm)) !== tag) || !validIdent(nm, 'vhdl') || !validIdent(nm, 'verilog')) nm = `${b}_${++k}`;
    owner.set(lc(nm), tag);
    return nm;
  };
  owner.set(lc(docName), '#doc');
  const keyName = new Map();
  const portNames = new Set();
  // ports first (keep their names), then named signals, bus parts, ISE auto names
  const portKeys = [...new Set([...model.ports.map(p => lc(p.name.trim())), ...model.sheets.flatMap(s => s.iomarkers.map(i => lc(i.name.trim())))])];
  for (const k of portKeys) {
    const s = sigs.get(k);
    const nm = claim(s.p.base, k);
    if (nm !== s.p.base) warn(`I/O marker '${s.name}' renamed '${nm}' (not a valid HDL identifier or name clash)`);
    keyName.set(k, nm); portNames.add(k);
  }
  const order = [...sigs.values()].sort((a, b) => (AUTO_RE.test(a.name) - AUTO_RE.test(b.name)) || ((memberOf.has(a.key) ? 1 : 0) - (memberOf.has(b.key) ? 1 : 0)));
  for (const s of order) {
    if (keyName.has(s.key)) continue;
    const mo = memberOf.get(s.key);
    let want = s.p.base;
    if (mo) want = `${keyName.get(mo.main) || sigs.get(mo.main).p.base}_${mo.msb === mo.lsb ? mo.msb : `${mo.msb}_${mo.lsb}`}`;
    else if (s.p.bit != null) want = `${s.p.base}_${s.p.bit}`;
    else if (s.p.range && !mainInfo.has(s.key)) want = `${s.p.base}_${s.p.msb}_${s.p.lsb}`;
    keyName.set(s.key, claim(want, s.key));
  }
  for (const B of blocks) B.xname = claim(B.name, `#inst:${B.name}`);

  // ------------------------------------------------------------- finalize specs (hdl block pin names, code)
  const declLines = [];
  for (const B of blocks) {
    const sp = B.spec;
    if (sp.type !== 'hdlblock') continue;
    const pinNet = new Map(B.blk.pins.map(p => [p.name, p.signal ? lc(p.signal.trim()) : null]));
    const fin = {};
    const inputs = [], outputs = [];
    for (const [ise, pm] of Object.entries(sp.pins)) {
      const k = pinNet.get(ise);
      // a pin may reuse the name of the net it is wired to; otherwise it needs its own identifier
      const base = parseIseName(ise).base;
      let nm;
      // clock pins take the name of their net: no aliasing assignment, so no delta-cycle skew on the clock
      if (k && (lc(keyName.get(k)) === lc(base) || pm.clock) && !Object.values(fin).some(v => lc(v) === lc(keyName.get(k)))) nm = keyName.get(k);
      else nm = claim(base, `#pin:${B.name}/${ise}`);
      fin[ise] = nm;
      pm.xai = nm;
      const d = { name: nm, width: pm.width || 1 };
      if (pm.clock) d.clock = true;
      if (pm.dir === 'out') outputs.push(d); else inputs.push({ ...d, ...(pm.dir === 'inout' ? { dir: 'inout' } : {}) });
    }
    // remember the ISE symbol so that the export writes it back (library symbol or the project's own symbol)
    sp.params = { title: sp.title || B.blk.symbol, inputs, outputs, iseSymbol: B.blk.symbol, isePins: Object.fromEntries(Object.entries(fin).map(([ise, nm]) => [nm, ise])) };
    if (sp.tpl) {
      const T = suf => claim(`${B.xname}_${suf}`, `#tmp:${B.name}/${suf}`);
      const has = ise => !!pinNet.get(ise);
      const r = sp.tpl(lang, ise => fin[ise] ?? ise, T, has);
      sp.hdl = r.code;
      if (r.decls) declLines.push(...r.decls);
    } else {
      sp.hdl = lang === 'vhdl' ? `-- TODO: ISE symbol '${B.blk.symbol}' has no XAIlinx equivalent: describe its function here` : `// TODO: ISE symbol '${B.blk.symbol}' has no XAIlinx equivalent: describe its function here`;
    }
  }

  // ------------------------------------------------------------- local geometry of every block (macro)
  let sid = 0, wid = 0, lid = 0, pid = 0;
  const pinKey = new Map();         // 'symId/pin' -> key
  const macros = [];
  const mkSym = (type, name, params, rot = 0, mirror = false, hdl) => {
    const s = { id: `S${++sid}`, type, x: 0, y: 0, rot, mirror, name, params: { ...defaultParams(type), ...params } };
    if (hdl != null) s.hdl = hdl;
    return s;
  };
  const pinsOf = s => symbolPins(s, modules);

  for (const B of blocks) {
    const sp = B.spec;
    const o = B.inst ? iseOrienToXai(B.inst.orien) : { rot: 0, mirror: false };
    const main = mkSym(sp.type, B.xname, sp.params, o.rot, o.mirror, sp.hdl);
    const syms = [main];
    const pins = new Map(pinsOf(main).map(p => [p.name, p]));
    const ext = [];   // { ise, key, E:[x,y], side, sym, pin, invSym? }
    for (const p of B.blk.pins) {
      const pm = sp.pins[p.name];
      const key = p.signal ? lc(p.signal.trim()) : null;
      if (!pm) { if (key) warn(`${B.name} (${B.blk.symbol}): pin ${p.name} has no XAIlinx equivalent and is left unconnected`); continue; }
      const xp = pins.get(pm.xai);
      if (!xp) { if (key) warn(`${B.name} (${B.blk.symbol}): pin ${p.name} not found on the XAIlinx symbol`); continue; }
      let E = [xp.x, xp.y], inv = null;
      if (pm.invert) {
        const [vx, vy] = SIDE_VEC[xp.side];
        inv = mkSym('inv', `${B.xname}_inv${p.name.replace(/\W/g, '')}`, {}, INWARD_ROT[xp.side]);
        inv.name = claim(inv.name, `#inst:${inv.name}`);
        const ip = pinsOf(inv);
        const O = ip.find(q => q.name === 'O');
        inv.x = xp.x - O.x; inv.y = xp.y - O.y;
        E = [xp.x + 60 * vx, xp.y + 60 * vy];
        syms.push(inv);
        pinKey.set(`${inv.id}/O`, `#int:${B.name}/${p.name}`);
        pinKey.set(`${main.id}/${pm.xai}`, `#int:${B.name}/${p.name}`);
      } else pinKey.set(`${main.id}/${pm.xai}`, key || `#nc:${main.id}/${pm.xai}`);
      if (inv) pinKey.set(`${inv.id}/I`, key || `#nc:${inv.id}/I`);
      const pt = key && B.pt.get(p.name) || null;
      ext.push({ ise: p.name, key, E, side: xp.side, sym: inv || main, pin: inv ? 'I' : pm.xai, pt });
    }
    for (const p of pinsOf(main)) if (!pinKey.has(`${main.id}/${p.name}`)) pinKey.set(`${main.id}/${p.name}`, `#nc:${main.id}/${p.name}`);
    macros.push({ B, syms, ext, inst: B.inst, sheet: B.inst ? B.inst.sheet : -1 });
  }
  // virtual blocks for buses
  let hk = 0;
  for (const H of helpers) {
    const mn = keyName.get(H.main);
    if (H.kind === 'slice') {
      const s = mkSym('slice', claim(`${mn}_tap${++hk}`, `#inst:tap${hk}`), { msb: H.msb, lsb: H.lsb, inWidth: H.width });
      pinKey.set(`${s.id}/I`, H.main); pinKey.set(`${s.id}/O`, H.member);
      macros.push({ helper: H, syms: [s], ext: [], sheet: -1 });
    } else {
      const s = mkSym('busjoin', claim(`${mn}_join`, `#inst:join${++hk}`), { widths: H.segs.map(x => x.width).join(',') });
      H.segs.forEach((g, i) => pinKey.set(`${s.id}/I${i}`, g.key || `#nc:${s.id}/I${i}`));
      pinKey.set(`${s.id}/O`, H.main);
      macros.push({ helper: H, syms: [s], ext: [], sheet: -1 });
    }
  }
  // bus taps -> slices drawn where ISE drew the tap
  model.sheets.forEach((sh, si) => {
    const geo = sheetGeo[si];
    for (const t of sh.bustaps) {
      const at2 = [...(geo.ends.get(`${t.x2},${t.y2}`) || [])];
      const member = at2.find(k => memberOf.has(k));
      if (!member) continue;
      const M = macros.find(m => m.helper?.kind === 'slice' && m.helper.member === member && m.sheet < 0);
      if (!M || !geo.touches(t.x1, t.y1, M.helper.main)) continue;
      const s = M.syms[0];
      const dx = Math.sign(t.x2 - t.x1), dy = Math.sign(t.y2 - t.y1);
      if (dx > 0) { s.rot = 0; s.mirror = false; } else if (dx < 0) { s.rot = 0; s.mirror = true; } else if (dy > 0) { s.rot = 90; s.mirror = false; } else { s.rot = 270; s.mirror = false; }
      const pp = new Map(pinsOf(s).map(p => [p.name, p]));
      M.ext = [
        { ise: 'I', key: M.helper.main, E: [pp.get('I').x, pp.get('I').y], side: pp.get('I').side, sym: s, pin: 'I', pt: [t.x1, t.y1] },
        { ise: 'O', key: member, E: [pp.get('O').x, pp.get('O').y], side: pp.get('O').side, sym: s, pin: 'O', pt: [t.x2, t.y2] },
      ];
      M.sheet = si; M.tap = true;
    }
  });

  // ------------------------------------------------------------- coordinate maps (one per sheet)
  const maps = model.sheets.map(() => ({ X: new AxisMap(S_IN), Y: new AxisMap(S_IN) }));
  model.sheets.forEach((sh, si) => {
    const { X, Y } = maps[si];
    X.add(0); Y.add(0); X.add(sh.width); Y.add(sh.height);
    for (const br of sh.branches) for (const w of br.wires) { X.add(w[0]); X.add(w[2]); Y.add(w[1]); Y.add(w[3]); }
    for (const io of sh.iomarkers) { X.add(io.x); Y.add(io.y); }
    for (const t of sh.bustaps) { X.add(t.x1); X.add(t.x2); Y.add(t.y1); Y.add(t.y2); }
  });
  for (const M of macros) {
    if (M.sheet < 0) continue;
    const { X, Y } = maps[M.sheet];
    const pts = M.ext.filter(e => e.pt);
    for (const e of pts) { X.add(e.pt[0]); Y.add(e.pt[1]); }
    if (M.inst) X.add(M.inst.x), Y.add(M.inst.y);
    // spacing constraints so the XAIlinx symbol fits between its ISE pin positions
    for (const [ax, A] of [[0, X], [1, Y]]) {
      const byC = new Map();
      for (const e of pts) { const c = e.pt[ax]; let g = byC.get(c); if (!g) byC.set(c, g = []); g.push(e.E[ax]); }
      const cs = [...byC.keys()].sort((a, b) => a - b);
      for (let i = 0; i + 1 < cs.length; i++) {
        const lo = byC.get(cs[i]), hi = byC.get(cs[i + 1]);
        const d = Math.max(...hi) - Math.min(...lo);
        if (Math.min(...hi) > Math.max(...lo) - 1) A.need(cs[i], cs[i + 1], d);
      }
    }
  }
  let xoff = 0;
  maps.forEach(m => { m.X.build(0); m.Y.build(0); m.X.off = xoff - m.X.min + 40; m.Y.off = -m.Y.min + 40; xoff = m.X.off + m.X.max + 200; });
  const MX = (si, x) => maps[si].X.f(x), MY = (si, y) => maps[si].Y.f(y);

  // ------------------------------------------------------------- place
  const syms = [], wires = [], labels = [], ports = [];
  const wireKey = new Map(), labelKey = new Map(), portKey = new Map(), stubOf = new Map();
  const addWire = (pts, key, extra = {}) => {
    const P = []; for (const p of pts) { const l = P[P.length - 1]; if (!l || l.x !== p.x || l.y !== p.y) P.push({ x: p.x, y: p.y }); }
    if (P.length < 2) return null;
    const w = { id: `W${++wid}`, points: P };
    if (keyWidth(key) > 1 || (mainInfo.has(key))) w.bus = true;
    wires.push(w); wireKey.set(w.id, key);
    Object.assign(w, extra.bus ? { bus: true } : {});
    return w;
  };
  const shiftMacro = (M, dx, dy) => { for (const s of M.syms) { s.x += dx; s.y += dy; } for (const e of M.ext) { e.E = [e.E[0] + dx, e.E[1] + dy]; } };
  const macroBox = M => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of M.syms) { const b = symbolBox(s, modules); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); }
    return { x0, y0, x1, y1 };
  };
  // ISE wires, I/O markers, net names
  model.sheets.forEach((sh, si) => {
    for (const br of sh.branches) {
      const k = lc(br.name.trim());
      for (const w of br.wires) addWire([{ x: MX(si, w[0]), y: MY(si, w[1]) }, { x: MX(si, w[2]), y: MY(si, w[3]) }], k);
      if (AUTO_RE.test(br.name.trim()) && !br.labels.length) continue;
      for (const L of br.labels) {
        // the label goes on the nearest wire of the branch
        let bestD = Infinity, at = null;
        for (const w of br.wires) {
          const [x1, y1, x2, y2] = w;
          let px = L.x, py = L.y;
          if (y1 === y2) { px = Math.max(Math.min(x1, x2), Math.min(Math.max(x1, x2), L.x)); py = y1; } else if (x1 === x2) { py = Math.max(Math.min(y1, y2), Math.min(Math.max(y1, y2), L.y)); px = x1; } else { px = x1; py = y1; }
          const d = Math.hypot(px - L.x, py - L.y);
          if (d < bestD) { bestD = d; at = { w, px, py }; }
        }
        if (!at) continue;
        const [x1, y1, x2, y2] = at.w;
        let X = MX(si, at.px), Y = MY(si, at.py);
        if (y1 === y2) { Y = MY(si, y1); X = Math.max(Math.min(MX(si, x1), MX(si, x2)), Math.min(Math.max(MX(si, x1), MX(si, x2)), X)); }
        else if (x1 === x2) { X = MX(si, x1); Y = Math.max(Math.min(MY(si, y1), MY(si, y2)), Math.min(Math.max(MY(si, y1), MY(si, y2)), Y)); }
        const l = { id: `L${++lid}`, x: X, y: Y, net: null };
        labels.push(l); labelKey.set(l.id, k);
      }
    }
    for (const io of sh.iomarkers) {
      const k = lc(io.name.trim());
      if ([...portKey.values()].includes(k)) {
        // the same port drawn twice: the other markers become net names
        const l = { id: `L${++lid}`, x: MX(si, io.x), y: MY(si, io.y), net: null };
        labels.push(l); labelKey.set(l.id, k);
        continue;
      }
      const pol = portPol.get(k) || (/R180|M0/.test(io.orien) ? 'Input' : 'Output');
      const p = { id: `P${++pid}`, name: keyName.get(k), dir: /bidir/i.test(pol) ? 'inout' : /output/i.test(pol) ? 'out' : 'in', width: keyWidth(k), x: MX(si, io.x), y: MY(si, io.y) };
      ports.push(p); portKey.set(p.id, k);
    }
  });
  // ISE does not connect different branches that merely touch (a wire end on another net's wire);
  // XAIlinx does: open a one-grid gap in the other wire (its two halves are re-joined by name below)
  for (let pass = 0; pass < 40; pass++) {
    const H = new Map(), V = new Map();
    for (const w of wires) {
      if (w.points.length !== 2) continue;
      const [a, b] = w.points;
      if (a.y === b.y) { let l = H.get(a.y); if (!l) H.set(a.y, l = []); l.push(w); }
      else if (a.x === b.x) { let l = V.get(a.x); if (!l) V.set(a.x, l = []); l.push(w); }
    }
    const ends = [];
    for (const w of wires) { const k = wireKey.get(w.id); ends.push([w.points[0], k, w]); ends.push([w.points[w.points.length - 1], k, w]); }
    for (const p of ports) ends.push([p, portKey.get(p.id), null]);
    const done = new Set();
    let changed = 0;
    for (const [P, k, own] of ends) {
      if (own && done.has(own)) continue;
      for (const w of [...(H.get(P.y) || []), ...(V.get(P.x) || [])]) {
        if (w === own || done.has(w) || wireKey.get(w.id) === k) continue;
        const [a, b] = w.points;
        if (!onSegment(P.x, P.y, [a.x, a.y, b.x, b.y])) continue;
        const atEnd = (P.x === a.x && P.y === a.y) || (P.x === b.x && P.y === b.y);
        if (atEnd) {
          // two different nets end on the same point: pull one end back by one grid step
          const tgt = own && own.points.length === 2 ? own : w;
          const [q0, q1] = tgt.points;
          const moveFirst = q0.x === P.x && q0.y === P.y;
          const from = moveFirst ? q0 : q1, to = moveFirst ? q1 : q0;
          const len = Math.abs(to.x - from.x) + Math.abs(to.y - from.y);
          if (len <= 10) wires.splice(wires.indexOf(tgt), 1);
          else { from.x += Math.sign(to.x - from.x) * 10; from.y += Math.sign(to.y - from.y) * 10; }
          done.add(tgt); changed++;
          break;
        }
        // end point on the middle of another net's wire: cut a gap around it
        const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y);
        const k2 = wireKey.get(w.id);
        wires.splice(wires.indexOf(w), 1);
        const p1 = { x: P.x - ux * 10, y: P.y - uy * 10 }, p2 = { x: P.x + ux * 10, y: P.y + uy * 10 };
        const w1 = (p1.x - a.x) * ux + (p1.y - a.y) * uy > 0 ? addWire([{ ...a }, p1], k2) : null;
        const w2 = (b.x - p2.x) * ux + (b.y - p2.y) * uy > 0 ? addWire([p2, { ...b }], k2) : null;
        done.add(w); if (w1) done.add(w1); if (w2) done.add(w2); changed++;
        if (own) done.add(own);
        break;
      }
    }
    if (!changed) break;
  }
  // ports of the netlist without an I/O marker
  const placedPorts = new Set(ports.map(p => portKey.get(p.id)));
  const unplacedPorts = model.ports.filter(p => !placedPorts.has(lc(p.name.trim())));
  // stubs from the XAIlinx pins to the ISE pin positions
  // occupancy of grid points (wire vertices, pins, I/O markers) with the ISE net they belong to
  const occ = new Map();          // 'x,y' -> Set(keys)
  const occX = new Map(), occY = new Map();
  const occAdd = (x, y, k) => {
    const q = `${x},${y}`;
    let s = occ.get(q);
    if (!s) { occ.set(q, s = new Set()); let a = occX.get(x); if (!a) occX.set(x, a = []); a.push(y); let b = occY.get(y); if (!b) occY.set(y, b = []); b.push(x); }
    s.add(k);
  };
  const occReset = () => {
    occ.clear(); occX.clear(); occY.clear();
    for (const w of wires) for (const p of w.points) occAdd(p.x, p.y, wireKey.get(w.id));
    for (const p of ports) occAdd(p.x, p.y, portKey.get(p.id));
    for (const s of syms) for (const p of pinsOf(s)) occAdd(p.x, p.y, pinKey.get(`${s.id}/${p.name}`));
    for (const l of labels) occAdd(l.x, l.y, labelKey.get(l.id));
  };
  const foreignAt = (x, y, key) => { const s = occ.get(`${x},${y}`); return !!s && [...s].some(k => k !== key); };
  // does the segment a-b pass over a point of another net (other than its end points listed in skip)?
  const passes = (a, b, skip, key) => {
    const pts = a[1] === b[1] ? (occY.get(a[1]) || []).filter(x => x >= Math.min(a[0], b[0]) && x <= Math.max(a[0], b[0])).map(x => [x, a[1]])
      : a[0] === b[0] ? (occX.get(a[0]) || []).filter(y => y >= Math.min(a[1], b[1]) && y <= Math.max(a[1], b[1])).map(y => [a[0], y])
        : [...occ.keys()].map(q => q.split(',').map(Number)).filter(([x, y]) => onSegment(x, y, [a[0], a[1], b[0], b[1]]));
    return pts.some(([x, y]) => !skip.has(`${x},${y}`) && foreignAt(x, y, key));
  };
  const route = (E, T, side, key) => {
    const skip = new Set([`${E[0]},${E[1]}`, `${T[0]},${T[1]}`]);
    const clear = pts => {
      for (let i = 0; i + 1 < pts.length; i++) if (passes(pts[i], pts[i + 1], skip, key) || overlapsForeign(pts[i], pts[i + 1], key)) return false;
      for (let i = 1; i + 1 < pts.length; i++) if (onForeignWire(pts[i][0], pts[i][1], key)) return false;
      return true;
    };
    const horiz = side === 'W' || side === 'E';
    const [ox, oy] = SIDE_VEC[side] || [0, 0];
    const cands = [];
    if (E[0] === T[0] || E[1] === T[1]) cands.push([E, T]);
    cands.push(horiz ? [E, [T[0], E[1]], T] : [E, [E[0], T[1]], T]);
    cands.push(horiz ? [E, [E[0], T[1]], T] : [E, [T[0], E[1]], T]);
    for (let d = 10; d <= 80; d += 10) {
      // leave the pin outwards, then run in a free lane
      const a = [E[0] + ox * d, E[1] + oy * d];
      cands.push(horiz ? [E, a, [a[0], T[1]], T] : [E, a, [T[0], a[1]], T]);
      for (const sg of [1, -1]) {
        const off = sg * d;
        cands.push(horiz ? [E, [E[0], E[1] + off], [T[0], E[1] + off], T] : [E, [E[0] + off, E[1]], [E[0] + off, T[1]], T]);
        cands.push(horiz ? [E, a, [a[0], T[1] + off], [T[0], T[1] + off], T] : [E, a, [T[0] + off, a[1]], [T[0] + off, T[1]], T]);
      }
    }
    for (const c of cands) if (clear(c)) return c;
    return null;
  };
  occReset();
  // segments of the wires, for "point lies on a wire of another net" checks
  const segH = new Map(), segV = new Map();
  for (const w of wires) for (let i = 0; i + 1 < w.points.length; i++) {
    const a = w.points[i], b = w.points[i + 1], k = wireKey.get(w.id);
    if (a.y === b.y) { let l = segH.get(a.y); if (!l) segH.set(a.y, l = []); l.push([Math.min(a.x, b.x), Math.max(a.x, b.x), k]); }
    else if (a.x === b.x) { let l = segV.get(a.x); if (!l) segV.set(a.x, l = []); l.push([Math.min(a.y, b.y), Math.max(a.y, b.y), k]); }
  }
  const segAdd = w => {
    const k = wireKey.get(w.id);
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      if (a.y === b.y) { let l = segH.get(a.y); if (!l) segH.set(a.y, l = []); l.push([Math.min(a.x, b.x), Math.max(a.x, b.x), k]); }
      else if (a.x === b.x) { let l = segV.get(a.x); if (!l) segV.set(a.x, l = []); l.push([Math.min(a.y, b.y), Math.max(a.y, b.y), k]); }
    }
  };
  // a horizontal / vertical piece running along a wire of another net
  const overlapsForeign = (a, b, key) => {
    if (a[1] === b[1]) { const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]); return (segH.get(a[1]) || []).some(([l, h, k]) => k !== key && Math.min(h, hi) - Math.max(l, lo) > 0); }
    if (a[0] === b[0]) { const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]); return (segV.get(a[0]) || []).some(([l, h, k]) => k !== key && Math.min(h, hi) - Math.max(l, lo) > 0); }
    return false;
  };
  const onForeignWire = (x, y, key) => (segH.get(y) || []).some(([lo, hi, k]) => k !== key && x >= lo && x <= hi) || (segV.get(x) || []).some(([lo, hi, k]) => k !== key && y >= lo && y <= hi);
  const pinFree = (x, y, key) => !onForeignWire(x, y, key) && !foreignAt(x, y, key);
  const parked = [];
  for (const M of macros) {
    if (M.sheet < 0 || (!M.inst && !M.tap)) { parked.push(M); continue; }
    const si = M.sheet;
    const tgt = M.ext.filter(e => e.pt && e.key).map(e => ({ e, T: [MX(si, e.pt[0]), MY(si, e.pt[1])] }));
    const allPins = M.syms.flatMap(s => pinsOf(s).map(p => ({ x: p.x, y: p.y, key: pinKey.get(`${s.id}/${p.name}`) })));
    const valid = (dx, dy) => allPins.every(p => pinFree(p.x + dx, p.y + dy, p.key));
    const score = (dx, dy) => tgt.reduce((n, q) => n + (q.e.E[0] + dx === q.T[0] && q.e.E[1] + dy === q.T[1] ? 1 : 0), 0);
    let base = null;
    if (tgt.length) {
      const cands = [];
      for (const { e, T } of tgt) cands.push([T[0] - e.E[0], T[1] - e.E[1]]);
      const ranked = cands.map(([dx, dy]) => ({ dx, dy, sc: score(dx, dy) })).sort((x, y) => y.sc - x.sc);
      base = ranked.find(c => valid(c.dx, c.dy)) || null;
      if (!base) {
        const c0 = ranked[0];
        const offs = [];
        for (let r = 1; r <= 4; r++) for (let i = -r; i <= r; i++) for (let j = -r; j <= r; j++) if (Math.max(Math.abs(i), Math.abs(j)) === r) offs.push([i * 10, j * 10]);
        for (const [ox, oy] of offs) if (valid(c0.dx + ox, c0.dy + oy)) { base = { dx: c0.dx + ox, dy: c0.dy + oy }; break; }
        if (!base) base = c0;
      }
    } else if (M.inst) {
      // nothing connected: center the symbol on the ISE footprint
      const fp = (M.B.def?.shapes || []).flatMap(s => s.kind === 'line' ? [[s.x1, s.y1], [s.x2, s.y2]] : s.kind === 'rect' ? [[s.x, s.y], [s.x + s.w, s.y + s.h]] : []).map(([x, y]) => sheetPt(M.inst, x, y));
      if (!fp.length) fp.push([M.inst.x, M.inst.y]);
      const cx = r10((Math.min(...fp.map(p => MX(si, p[0]))) + Math.max(...fp.map(p => MX(si, p[0])))) / 2);
      const cy = r10((Math.min(...fp.map(p => MY(si, p[1]))) + Math.max(...fp.map(p => MY(si, p[1])))) / 2);
      const b = macroBox(M);
      base = { dx: r10(cx - (b.x0 + b.x1) / 2), dy: r10(cy - (b.y0 + b.y1) / 2) };
      if (!valid(base.dx, base.dy)) for (let r = 1; r <= 6 && !valid(base.dx, base.dy); r++) for (const [ox, oy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (valid(base.dx + ox * 10, base.dy + oy * 10)) { base = { dx: base.dx + ox * 10, dy: base.dy + oy * 10 }; break; }
    }
    shiftMacro(M, base.dx, base.dy);
    for (const { e, T } of tgt) e.T = T;
    for (const s of M.syms) { syms.push(s); for (const p of pinsOf(s)) occAdd(p.x, p.y, pinKey.get(`${s.id}/${p.name}`)); }
  }
  for (const M of parked) syms.push(...M.syms);
  // ISE net names that ended up on a crossing with another net: slide them along their wire (or drop them)
  for (let i = labels.length - 1; i >= 0; i--) {
    const l = labels[i], k = labelKey.get(l.id);
    const bad = (x, y) => onForeignWire(x, y, k) || foreignAt(x, y, k);
    if (!bad(l.x, l.y)) continue;
    let spot = null;
    for (const w of wires) {
      if (wireKey.get(w.id) !== k) continue;
      for (let j = 0; j + 1 < w.points.length && !spot; j++) {
        const a = w.points[j], b = w.points[j + 1];
        if (!onSegment(l.x, l.y, [a.x, a.y, b.x, b.y])) continue;
        const ux = Math.sign(b.x - a.x), uy = Math.sign(b.y - a.y), n = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 10;
        const cands = [];
        for (let t = 0; t <= n; t++) cands.push([a.x + ux * 10 * t, a.y + uy * 10 * t]);
        cands.sort((p, q) => Math.hypot(p[0] - l.x, p[1] - l.y) - Math.hypot(q[0] - l.x, q[1] - l.y));
        spot = cands.find(([x, y]) => !bad(x, y)) || null;
      }
      if (spot) break;
    }
    if (spot) { l.x = spot[0]; l.y = spot[1]; } else { labels.splice(i, 1); }
  }
  occReset();
  for (const M of macros) {
    for (const e of M.ext) {
      if (!e.T || !e.key) continue;
      if (e.E[0] === e.T[0] && e.E[1] === e.T[1]) continue;
      const pts = route(e.E, e.T, e.side, e.key);
      if (!pts) continue;       // joined by name below
      const w = addWire(pts.map(([x, y]) => ({ x, y })), e.key);
      if (w) { stubOf.set(w.id, M); segAdd(w); for (const p of w.points) occAdd(p.x, p.y, e.key); }
    }
  }

  // ------------------------------------------------------------- parking area (no position in the ISE drawing)
  const content = () => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const acc = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const w of wires) for (const p of w.points) acc(p.x, p.y);
    for (const p of ports) { const b = portBox(p); acc(b.x, b.y); acc(b.x + b.w, b.y + b.h); }
    for (const s of syms) { const b = symbolBox(s, modules); acc(b.x, b.y); acc(b.x + b.w, b.y + b.h); }
    for (const l of labels) acc(l.x, l.y);
    if (x0 === Infinity) return { x0: 40, y0: 40, x1: 40, y1: 40 };
    return { x0, y0, x1, y1 };
  };
  const park = list => {
    if (!list.length) return;
    const c = content();
    const maxW = Math.max(1200, c.x1 - c.x0);
    let x = Math.max(80, c.x0 + 40), y = c.y1 + 100, rowH = 0;
    for (const M of list) {
      const b = macroBox(M);
      const w = b.x1 - b.x0, h = b.y1 - b.y0;
      if (x + w + 80 > c.x0 + maxW && x > c.x0 + 40) { x = Math.max(80, c.x0 + 40); y += rowH + 80; rowH = 0; }
      shiftMacro(M, r10(x + 40 - b.x0), r10(y - b.y0));
      x += w + 120; rowH = Math.max(rowH, h);
      M.parked = true;
    }
  };
  park(parked);
  if (unplacedPorts.length) {
    const c = content();
    let y = c.y1 + 80;
    for (const up of unplacedPorts) {
      const k = lc(up.name.trim());
      const p = { id: `P${++pid}`, name: keyName.get(k), dir: /bidir/i.test(up.polarity) ? 'inout' : /output/i.test(up.polarity) ? 'out' : 'in', width: keyWidth(k), x: c.x0 + 120, y };
      ports.push(p); portKey.set(p.id, k); y += 40;
    }
  }

  // ------------------------------------------------------------- assemble, check connectivity, repair
  const labelText = k => (mainInfo.has(k) || keyWidth(k) > 1 ? `${keyName.get(k)}(${keyWidth(k) - 1}:0)` : keyName.get(k));
  const build = () => {
    for (const l of labels) l.net = labelText(labelKey.get(l.id));
    return normalizeDoc({ version: 1, name: docName, lang, sheet: { w: 1700, h: 1100 }, symbols: syms, wires, labels, ports });
  };
  const elemKeys = net => {
    const ks = new Set();
    for (const e of net.endpoints) ks.add(e.kind === 'pin' ? pinKey.get(`${e.sym}/${e.pin}`) : portKey.get(e.port));
    for (const w of net.wires) ks.add(wireKey.get(w));
    for (const l of net.labels) ks.add(labelKey.get(l));
    ks.delete(undefined);
    return ks;
  };
  const relocated = new Set();
  for (let round = 0; round < 4; round++) {
    const nl = netlist(build(), { modules });
    const bad = nl.nets.filter(n => elemKeys(n).size > 1);
    if (!bad.length) break;
    if (round === 0) {
      // 1. drop the stubs that run into foreign nets (the pins get a net name instead)
      const drop = new Set(bad.flatMap(n => n.wires.filter(w => stubOf.has(w))));
      for (let i = wires.length - 1; i >= 0; i--) if (drop.has(wires[i].id)) wires.splice(i, 1);
      continue;
    }
    // 2. move the symbols whose pins touch foreign nets to the parking area
    const symM = new Map(); for (const M of macros) for (const s of M.syms) symM.set(s.id, M);
    const move = [];
    for (const n of bad) for (const e of n.endpoints) if (e.kind === 'pin') { const M = symM.get(e.sym); if (M && !relocated.has(M)) { relocated.add(M); move.push(M); } }
    if (!move.length) break;
    for (let i = wires.length - 1; i >= 0; i--) if (move.includes(stubOf.get(wires[i].id))) wires.splice(i, 1);
    for (const M of move) warn(`${M.syms[0].name}: placed apart from the drawing (its pins overlapped other nets)`);
    park(move);
  }
  // nets of one ISE signal that are not connected geometrically (connection by name in ISE): add net names
  const addNames = () => {
    const nl = netlist(build(), { modules });
    const segOwner = [];
    for (const w of wires) for (let i = 0; i + 1 < w.points.length; i++) segOwner.push({ a: w.points[i], b: w.points[i + 1], net: nl.wireNet.get(w.id) });
    const freeAt = (x, y, net) => !segOwner.some(s => s.net !== net && onSegment(x, y, [s.a.x, s.a.y, s.b.x, s.b.y])) && !ports.some(p => p.x === x && p.y === y && nl.portNet.get(p.id) !== net);
    const pieces = new Map();   // key -> Set(net)
    for (const n of nl.nets) for (const k of elemKeys(n)) { if (k.startsWith('#')) continue; let s = pieces.get(k); if (!s) pieces.set(k, s = new Set()); s.add(n); }
    let added = 0;
    for (const [k, nets] of pieces) {
      const needName = nets.size > 1 || (!AUTO_RE.test(sigs.get(k)?.name || '') && ![...nets].some(n => n.labels.length || n.ports.length)) || ((mainInfo.has(k) || keyWidth(k) > 1) && ![...nets].some(n => n.labels.length || n.ports.length));
      if (!needName) continue;
      for (const n of nets) {
        if (n.labels.some(l => labelKey.get(l) === k) || n.ports.some(p => portKey.get(p) === k)) continue;
        if (nets.size === 1 && (n.labels.length || n.ports.length)) continue;
        let spot = null;
        for (const wId of n.wires) {
          const w = wires.find(q => q.id === wId);
          for (const p of w.points) if (freeAt(p.x, p.y, n)) { spot = [p.x, p.y]; break; }
          if (spot) break;
        }
        if (!spot) {
          // a pin without wires: short stub + name
          const e = n.endpoints.find(q => q.kind === 'pin');
          if (e) {
            const s = syms.find(q => q.id === e.sym);
            const pp = pinsOf(s).find(q => q.name === e.pin);
            const out = SIDE_VEC[pp.side];
            const dirs = [out, [out[1], out[0]], [-out[1], -out[0]], [-out[0], -out[1]]];
            occReset();
            search: for (const [vx, vy] of dirs) for (const len of [20, 30, 40, 50, 60]) {
              const ex = pp.x + vx * len, ey = pp.y + vy * len;
              if (!freeAt(ex, ey, n) || occ.has(`${ex},${ey}`) || passes([pp.x, pp.y], [ex, ey], new Set([`${pp.x},${pp.y}`]), k) || overlapsForeign([pp.x, pp.y], [ex, ey], k)) continue;
              const w = addWire([{ x: pp.x, y: pp.y }, { x: ex, y: ey }], k);
              if (w) { occAdd(ex, ey, k); segAdd(w); spot = [ex, ey]; }
              break search;
            }
            if (!spot && freeAt(pp.x, pp.y, n)) spot = [pp.x, pp.y];
          } else {
            const pe = n.endpoints.find(q => q.kind === 'port');
            if (pe) { const p = ports.find(q => q.id === pe.port); if (freeAt(p.x, p.y, n)) spot = [p.x, p.y]; }
          }
        }
        if (!spot) { warn(`could not attach the net name '${keyName.get(k)}'`); continue; }
        const l = { id: `L${++lid}`, x: spot[0], y: spot[1], net: null };
        labels.push(l); labelKey.set(l.id, k); added++;
      }
    }
    return added;
  };
  addNames();
  addNames();

  // ------------------------------------------------------------- final check against the ISE connectivity
  const doc = build();
  const c = content();
  doc.sheet = { w: Math.max(1700, r10(c.x1 + 120)), h: Math.max(1100, r10(c.y1 + 120)) };
  if (declLines.length) doc.hdl = { lang, decls: declLines.join('\n') };
  const nl = netlist(doc, { modules });
  const unconnected = [];
  const where = new Map();
  for (const n of nl.nets) {
    const ks = elemKeys(n);
    const real = [...ks].filter(k => !k.startsWith('#nc'));
    if (real.length > 1) warn(`connectivity: net '${n.name}' joins ISE nets ${real.filter(k => !k.startsWith('#')).map(k => `'${sigs.get(k)?.name || k}'`).join(', ')}`);
    for (const k of ks) { if (k.startsWith('#')) continue; let s = where.get(k); if (!s) where.set(k, s = new Set()); s.add(n.id); }
  }
  for (const [k, s] of where) if (s.size > 1) { warn(`connectivity: ISE net '${sigs.get(k)?.name || k}' is split in ${s.size} parts`); unconnected.push(sigs.get(k)?.name || k); }
  for (const d of nl.diagnostics) if (d.severity === 'error') warn(`schematic check: ${d.message}`);
  if (model.sheets.some(s => s.texts.length)) warn(`${model.sheets.reduce((a, s) => a + s.texts.length, 0)} text annotation(s) of the ISE sheet were not imported`);
  if (model.sheets.length > 1) warn(`the ${model.sheets.length} ISE sheets are placed side by side on one XAIlinx sheet`);
  doc.importedFrom = { format: 'ise-sch', version: model.version, family: model.attrs.DeviceFamilyName || null };
  // where each ISE block pin ended up ('XLXI_1.I0' -> 'XLXI_1_invI0.I')
  const pinMap = {};
  for (const M of macros) if (M.B) for (const e of M.ext) pinMap[`${M.B.name}.${e.ise}`] = `${e.sym.name}.${e.pin}`;
  return { doc, warnings, unconnected, pinMap };
}

// ISE block -> XAIlinx symbol spec: { type, params, pins: { isePin: { xai, dir, width, invert?, clock? } }, tpl?, title? }
function mapSymbol(blk, modules, warn, geo = {}) {
  const sym = lc(blk.symbol);
  const conn = n => blk.pins.some(p => lc(p.name) === lc(n) && p.signal);
  const blkPins = blk.pins.map(p => p.name);
  const W = n => parseIseName(n).width;
  const base = n => parseIseName(n).base;
  const direct = (type, params, map = {}) => {
    const s = { type, params, pins: {} };
    const tmp = { type, params: { ...defaultParams(type), ...params } };
    const def = symbolDef(tmp, modules);
    for (const n of blkPins) {
      const xn = map[n] ?? map[base(n)] ?? def.pins.find(q => lc(q.name) === lc(base(n)))?.name;
      const dp = def.pins.find(q => q.name === xn);
      if (dp) s.pins[n] = { xai: xn, dir: dp.dir, width: W(n) };
    }
    return s;
  };
  const init = /^1$|^'1'$|^1'b1$/i.test(String(blk.attrs.INIT ?? '').trim()) ? '1' : '0';
  // symbols written by exportIseSch (parameters encoded in the name)
  const xl = decodeXlSymbol(sym);
  if (xl) return direct(xl.type, xl.params);
  // project modules (ISE symbols generated from HDL sources)
  const mod = findModule(modules, blk.symbol);
  if (mod) {
    const s = { type: 'module', params: { module: mod.name, generics: {} }, pins: {} };
    for (const n of blkPins) {
      const q = mod.ports.find(p => lc(p.name) === lc(base(n)));
      if (q) s.pins[n] = { xai: q.name, dir: q.dir || 'in', width: q.width || 1 };
      else warn(`${blk.name}: pin ${n} of '${blk.symbol}' is not a port of module '${mod.name}'`);
    }
    return s;
  }
  let m = GATE_RE.exec(sym);
  if (m) {
    const op = m[1], n = +m[2], b = +(m[3] || 0);
    const t = `${op}${n}`;
    // ANDnBk...: native XAIlinx symbol with the same pins (I0 at the bottom, I0..I(k-1) inverted)
    if (b && b <= n && SYMBOLS[`${t}b${b}`]) {
      const s = { type: `${t}b${b}`, params: { width: 1 }, pins: {} };
      for (let k = 0; k < n; k++) s.pins[`I${k}`] = { xai: `I${k}`, dir: 'in', width: 1 };
      s.pins.O = { xai: 'O', dir: 'out', width: 1 };
      return s;
    }
    if (SYMBOLS[t] && b <= n) {
      const s = { type: t, params: { width: 1 }, pins: {} };
      for (let k = 0; k < n; k++) s.pins[`I${k}`] = { xai: `I${n - 1 - k}`, dir: 'in', width: 1, invert: k < b };
      s.pins.O = { xai: 'O', dir: 'out', width: 1 };
      return s;
    }
  }
  if (BUF1.has(sym)) return direct(sym === 'inv' ? 'inv' : 'buf', { width: 1 });
  if ((m = /^(inv|buf|ibuf|obuf)(8|16|32)$/.exec(sym))) return direct(m[1] === 'inv' ? 'inv' : 'buf', { width: +m[2] });
  // FD*, FT*, FJK*: native flip-flop symbols with the library pin names (INIT: the block attribute, else the Xilinx default)
  if (SYMBOLS[sym]?.ff) return direct(sym, { init: blk.attrs.INIT != null ? init : SYMBOLS[sym].params[0].default });
  if ((m = /^fd(8|16|32)(ce|re)$/.exec(sym))) return direct('register', { width: +m[1], en: true, reset: m[2] === 'ce' ? 'async' : 'sync', init: '0' });
  if (sym === 'm2_1') return direct('mux2', { width: 1 });
  if ((m = /^d(2|3|4)_(4|8|16)e$/.exec(sym)) && (1 << +m[1]) === +m[2]) return direct('decoder', { n: +m[1], en: true, bus: false });
  if (sym === 'vcc' || sym === 'gnd') return direct(sym, {});
  if ((m = /^cb(8|16)(ce|re)$/.exec(sym)) && !conn('CEO') && !conn('TC')) return direct('counter', { width: +m[1], en: true, reset: m[2] === 'ce' ? 'async' : 'sync', dir: 'up' });
  if ((m = /^comp(8|16)$/.exec(sym))) return direct('compare', { width: +m[1], op: 'eq', signed: false }, { EQ: 'O' });
  if ((m = /^compm(8|16)$/.exec(sym)) && conn('GT') !== conn('LT')) return direct('compare', { width: +m[1], op: conn('GT') ? 'gt' : 'lt', signed: false }, { GT: 'O', LT: 'O' });
  if ((m = /^add(8|16)$/.exec(sym)) && !conn('OFL')) return direct('add', { width: +m[1], cin: true, cout: conn('CO') });
  // exact HDL block, or a placeholder
  const lib = libPins(sym);
  const tpl = lib ? libTemplate(sym, conn) : null;
  const s = { type: 'hdlblock', title: blk.symbol, pins: {}, tpl };
  if (!tpl) warn(`${blk.name}: ISE symbol '${blk.symbol}' ${/^xl_hdl_/i.test(blk.symbol) ? 'is an HDL block exported by XAIlinx: imported as an empty HDL block (paste the code of its HDL file, or import that file as a project module)' : 'has no XAIlinx equivalent: imported as an empty HDL block (write its HDL or add the module to the project)'}`);
  // pin sides from the symbol drawing: left/top = inputs, right/bottom = outputs (generated ISE symbols)
  let bx0 = Infinity, bx1 = -Infinity;
  for (const sh of geo.def?.shapes || []) if (sh.kind === 'line') { bx0 = Math.min(bx0, sh.x1, sh.x2); bx1 = Math.max(bx1, sh.x1, sh.x2); } else if (sh.kind === 'rect') { bx0 = Math.min(bx0, sh.x); bx1 = Math.max(bx1, sh.x + sh.w); }
  const at = n => geo.local?.get(n) || null;
  const outName = n => /^(O|Q|CO|CEO|TC|EQ|GT|LT|OFL|.*_?OUT.*|DOUT.*|RES.*|Y\d*)$/i.test(base(n));
  const list = blkPins.map((n, i) => {
    const sp = geo.sym?.pins.find(q => lc(q.name) === lc(n));
    const L = lib?.[n] || (lib ? lib[Object.keys(lib).find(k => lc(k) === lc(n))] : null) || (sp ? [sp.dir, sp.x, sp.y] : null);
    const l = at(n) || (sp ? [sp.x, sp.y] : null);
    let dir = L ? L[0] : null;
    if (!dir && l && bx1 > bx0) dir = l[0] >= (bx0 + bx1) / 2 + 1 ? 'out' : 'in';
    if (!dir) dir = outName(n) ? 'out' : 'in';
    return { n, i, dir, y: l ? l[1] : null };
  });
  list.sort((a, b) => (a.y == null || b.y == null ? a.i - b.i : a.y - b.y || a.i - b.i));
  for (const { n, dir } of list) s.pins[n] = { xai: null, dir, width: W(n), clock: /^(C|CLK|G)$/i.test(base(n)) && dir === 'in' };
  if (tpl && lib) for (const n of Object.keys(lib)) if (!blkPins.some(b => lc(b) === lc(n))) {
    // template pins missing from the block (unlisted inputs): add them so the code compiles
    s.pins[n] = { xai: null, dir: lib[n][0], width: W(n) };
  }
  return s;
}

// ===================================================================== export: .sch.json -> .sch (ISE 14.7, version 7)
const S_OUT = 16 / 5;                     // XAIlinx px -> ISE units (grid 10 -> 32, pin pitch 20 -> 64)
const SHEET_SIZES = [[1760, 1360], [2720, 1760], [3520, 2720], [5440, 3520], [7040, 5440]];
const xesc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hexOf = bits => (bits ? BigInt('0b' + bits.replace(/[^01]/g, '0')).toString(16) : '0');

// Name of the ISE symbol a XAIlinx symbol is exported as. Library symbols: { lib: true, name, pins: {xaiPin: isePin} };
// XAIlinx-only symbols: { lib: false, name: 'xl_…' (parameters encoded in the name, decoded again on import) }.
function iseSymbolFor(s, def, netW, modules) {
  const t = s.type, p = s.params || {};
  const S = SYMBOLS[t];
  const W = Math.max(1, parseInt(p.width, 10) || 1);
  const pinW = n => def.pins.find(q => q.name === n)?.width ?? netW(n) ?? 1;
  if (t === 'module') {
    const m = findModule(modules, p.module);
    return { lib: false, module: true, name: p.module || m?.name || 'module' };
  }
  if (S?.gate) {
    if (S.invIn && W === 1) {
      // ANDnBk...: same pin names and positions as the Xilinx library symbol
      const pins = { O: 'O' };
      for (let k = 0; k < S.inputs; k++) pins[`I${k}`] = `I${k}`;
      return { lib: true, name: t, pins };
    }
    if (W === 1) {
      if (t === 'inv' || t === 'buf') return { lib: true, name: t, pins: { I: 'I', O: 'O' } };
      const n = S.inputs;
      const pins = { O: 'O' };
      for (let k = 0; k < n; k++) pins[`I${k}`] = `I${n - 1 - k}`;
      return { lib: true, name: t, pins };
    }
    if ((t === 'inv' || t === 'buf') && (W === 8 || W === 16) && t === 'inv') return { lib: true, name: `inv${W}`, pins: { I: `I(${W - 1}:0)`, O: `O(${W - 1}:0)` } };
    return { lib: false, name: `xl_${t}_w${W}` };
  }
  if (S?.ff) {
    // FD*/FT*/FJK*: the library flip-flop when the INIT value is the library default and all its pin positions are
    // known, else an XAIlinx symbol carrying the INIT value in its name
    const d0 = S.params[0].default, iv = String(p.init ?? d0) === '1' ? '1' : '0';
    const lp = libPins(t);
    if (iv === d0 && lp && def.pins.every(q => lp[q.name] && lp[q.name][1] != null)) return { lib: true, name: t, pins: Object.fromEntries(def.pins.map(q => [q.name, q.name])) };
    return { lib: false, name: `xl_${t}_i${iv}` };
  }
  switch (t) {
    case 'mux2': return W === 1 ? { lib: true, name: 'm2_1', pins: { D0: 'D0', D1: 'D1', S0: 'S0', O: 'O' } } : { lib: false, name: `xl_mux2_w${W}` };
    case 'mux4': return { lib: false, name: `xl_mux4_w${W}` };
    case 'demux': return { lib: false, name: `xl_demux${Math.max(1, Math.min(4, parseInt(p.sel, 10) || 1))}_w${W}` };
    case 'decoder': {
      const n = Math.max(1, Math.min(5, parseInt(p.n, 10) || 2));
      // D2_4E / D3_8E (pin positions known); D4_16E is written as an XAIlinx symbol with the same pins
      if (p.en && !p.bus && (n === 2 || n === 3)) {
        const pins = { E: 'E' };
        for (let k = 0; k < n; k++) pins[`A${k}`] = `A${k}`;
        for (let k = 0; k < 1 << n; k++) pins[`D${k}`] = `D${k}`;
        return { lib: true, name: `d${n}_${1 << n}e`, pins };
      }
      return { lib: false, name: `xl_dec${n}${p.en ? '_e' : ''}${p.bus ? '_bus' : ''}` };
    }
    case 'encoder': {
      const n = Math.max(2, Math.min(5, parseInt(p.n, 10) || 2));
      return { lib: false, name: `xl_${p.mode === 'one-hot' ? 'enc' : 'penc'}${n}${p.bus ? '_bus' : ''}` };
    }
    case 'register': {
      const bits = constBits(p.init ?? '0', W) || '0'.repeat(W);
      const zero = /^0+$/.test(bits);
      const rs = p.reset === 'async' ? '_ar' : p.reset === 'sync' ? '_sr' : '';
      if (zero && W === 1) {
        const nm = p.en ? (p.reset === 'async' ? 'fdce' : p.reset === 'sync' ? 'fdre' : null) : (p.reset === 'async' ? 'fdc' : p.reset === 'sync' ? 'fdr' : 'fd');
        if (nm) return { lib: true, name: nm, pins: { D: 'D', C: 'C', CE: 'CE', CLR: 'CLR', R: 'R', Q: 'Q' } };
      }
      if (zero && p.en && (W === 8 || W === 16) && p.reset !== 'none') return { lib: true, name: `fd${W}${p.reset === 'async' ? 'ce' : 're'}`, pins: { D: `D(${W - 1}:0)`, Q: `Q(${W - 1}:0)`, C: 'C', CE: 'CE', CLR: 'CLR', R: 'R' } };
      return { lib: false, name: `xl_reg${W}${p.en ? '_ce' : ''}${rs}_h${hexOf(bits)}` };
    }
    case 'counter': {
      const rs = p.reset === 'async' ? '_ar' : p.reset === 'sync' ? '_sr' : '';
      if (p.en && p.dir !== 'down' && p.reset === 'async' && (W === 8 || W === 16)) return { lib: true, name: `cb${W}ce`, pins: { C: 'C', CE: 'CE', CLR: 'CLR', Q: `Q(${W - 1}:0)` } };
      return { lib: false, name: `xl_cnt${W}${p.en ? '_ce' : ''}${rs}${p.dir === 'down' ? '_dn' : ''}` };
    }
    case 'add': return { lib: false, name: `xl_add${W}${p.cin ? '_ci' : ''}${p.cout ? '_co' : ''}` };
    case 'sub': return { lib: false, name: `xl_sub${W}` };
    case 'compare':
      if (W === 8 && (p.op || 'eq') === 'eq' && !p.signed) return { lib: true, name: 'comp8', pins: { A: 'A(7:0)', B: 'B(7:0)', O: 'EQ' } };
      return { lib: false, name: `xl_cmp${W}_${p.op || 'eq'}${p.signed ? '_s' : ''}` };
    case 'vcc': case 'gnd': {
      const w = pinW(t === 'vcc' ? 'P' : 'G');
      if (w === 1) return { lib: true, name: t, pins: { P: 'P', G: 'G' } };
      return { lib: false, name: `xl_const${w}_h${hexOf((t === 'vcc' ? '1' : '0').repeat(w))}`, constant: true };
    }
    case 'constant': {
      const w = pinW('O');
      const bits = constBits(p.value, w) || '0'.repeat(w);
      if (w === 1 && /^[01]$/.test(bits)) return { lib: true, name: bits === '1' ? 'vcc' : 'gnd', pins: { O: bits === '1' ? 'P' : 'G' } };
      return { lib: false, name: `xl_const${w}_h${hexOf(bits)}` };
    }
    case 'slice': {
      const iw = pinW('I');
      return { lib: false, name: `xl_slice${iw}_${parseInt(p.msb, 10) || 0}_${parseInt(p.lsb, 10) || 0}` };
    }
    case 'busjoin': return { lib: false, name: `xl_join_${String(p.widths || '').split(/[,\s]+/).filter(Boolean).join('_')}` };
    case 'hdlblock': {
      // imported from ISE: write the original symbol back when the pins still match
      const iseSym = p.iseSymbol, map = p.isePins || {};
      if (iseSym && def.pins.every(q => map[q.name])) {
        const lp = libPins(iseSym);
        if (lp && def.pins.every(q => lp[map[q.name]] && lp[map[q.name]][1] != null)) return { lib: true, name: lc(iseSym), pins: { ...map } };
        if (!lp && !decodeXlSymbol(iseSym)) return { lib: false, name: iseSym, project: true, pins: { ...map } };
      }
      return { lib: false, name: null, hdl: true };
    }
    default: return { lib: false, name: `xl_${t}` };
  }
}

// xl_* symbol name -> XAIlinx { type, params } (import of schematics exported by XAIlinx)
export function decodeXlSymbol(name) {
  const s = lc(name);
  let m;
  if ((m = /^xl_(and|or|nand|nor|xor|xnor)(\d(?:b\d)?)_w(\d+)$/.exec(s)) && SYMBOLS[m[1] + m[2]]) return { type: m[1] + m[2], params: { width: +m[3] } };
  if ((m = /^xl_(f(?:d|t|jk)[a-z]*)_i([01])$/.exec(s)) && SYMBOLS[m[1]]?.ff) return { type: m[1], params: { init: m[2] } };
  if ((m = /^xl_demux([1-4])_w(\d+)$/.exec(s))) return { type: 'demux', params: { sel: +m[1], width: +m[2] } };
  if ((m = /^xl_dec([1-5])(_e)?(_bus)?$/.exec(s))) return { type: 'decoder', params: { n: +m[1], en: !!m[2], bus: !!m[3] } };
  if ((m = /^xl_(p?enc)([2-5])(_bus)?$/.exec(s))) return { type: 'encoder', params: { n: +m[2], mode: m[1] === 'enc' ? 'one-hot' : 'priority', bus: !!m[3] } };
  if ((m = /^xl_(inv|buf|mux2|mux4)_w(\d+)$/.exec(s))) return { type: m[1], params: { width: +m[2] } };
  if ((m = /^xl_reg(\d+)(_ce)?(_ar|_sr)?_h([0-9a-f]+)$/.exec(s))) return { type: 'register', params: { width: +m[1], en: !!m[2], reset: m[3] === '_ar' ? 'async' : m[3] === '_sr' ? 'sync' : 'none', init: m[4] === '0' ? '0' : `0x${m[4]}` } };
  if ((m = /^xl_cnt(\d+)(_ce)?(_ar|_sr)?(_dn)?$/.exec(s))) return { type: 'counter', params: { width: +m[1], en: !!m[2], reset: m[3] === '_ar' ? 'async' : m[3] === '_sr' ? 'sync' : 'none', dir: m[4] ? 'down' : 'up' } };
  if ((m = /^xl_add(\d+)(_ci)?(_co)?$/.exec(s))) return { type: 'add', params: { width: +m[1], cin: !!m[2], cout: !!m[3] } };
  if ((m = /^xl_sub(\d+)$/.exec(s))) return { type: 'sub', params: { width: +m[1] } };
  if ((m = /^xl_cmp(\d+)_(eq|ne|lt|le|gt|ge)(_s)?$/.exec(s))) return { type: 'compare', params: { width: +m[1], op: m[2], signed: !!m[3] } };
  if ((m = /^xl_const(\d+)_h([0-9a-f]+)$/.exec(s))) return { type: 'constant', params: { width: +m[1], value: `0x${m[2]}` } };
  if ((m = /^xl_slice(\d+)_(\d+)_(\d+)$/.exec(s))) return { type: 'slice', params: { inWidth: +m[1], msb: +m[2], lsb: +m[3] } };
  if ((m = /^xl_join_([\d_]+)$/.exec(s))) return { type: 'busjoin', params: { widths: m[1].split('_').join(',') } };
  return null;
}

function iseTimestamp(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}T${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
}
function shapeXml(sh, ind) {
  const r = v => Math.round(v);
  if (sh.kind === 'line') return `${ind}<line x2="${r(sh.x2)}" y1="${r(sh.y1)}" y2="${r(sh.y2)}"${sh.bus ? ' style="linewidth:W"' : ''} x1="${r(sh.x1)}" />`;
  if (sh.kind === 'rect') return `${ind}<rect width="${r(sh.w)}" x="${r(sh.x)}" y="${r(sh.y)}" height="${r(sh.h)}" />`;
  if (sh.kind === 'circle') return `${ind}<circle r="${r(sh.r)}" cx="${r(sh.cx)}" cy="${r(sh.cy)}" />`;
  if (sh.kind === 'arc') return `${ind}<arc ex="${r(sh.ex)}" ey="${r(sh.ey)}" sx="${r(sh.sx)}" sy="${r(sh.sy)}" r="${r(sh.r)}" cx="${r(sh.cx)}" cy="${r(sh.cy)}" />`;
  return '';
}

/**
 * Write a XAIlinx schematic as an ISE 14.7 schematic (.sch, <drawing version="7">).
 * @param {object} docIn  XAIlinx document (.sch.json)
 * @param {{ modules?: object|object[], family?: string, timestamp?: string, lang?: 'vhdl'|'verilog' }} opts
 * @returns {{ xml: string, warnings: string[], files: { path: string, text: string, kind: 'hdl'|'sym' }[] }}
 *   files: HDL modules + ISE symbols (.sym) for the XAIlinx-only symbols (xl_*) and .sym files for project modules;
 *   add them to the ISE project next to the .sch.
 */
export function exportIseSch(docIn, opts = {}) {
  const warnings = [];
  const warn = m => { if (!warnings.includes(m)) warnings.push(m); };
  const doc = normalizeDoc(docIn);
  const modules = normModules(opts.modules);
  const lang = opts.lang === 'verilog' || opts.lang === 'vhdl' ? opts.lang : doc.lang;
  const family = String(opts.family || 'spartan3e').toLowerCase();
  const stamp = opts.timestamp || iseTimestamp();
  const nl = netlist(doc, { modules });
  for (const d of nl.diagnostics) if (d.severity === 'error') warn(`schematic check: ${d.message}`);
  const X = v => Math.round(v * S_OUT);

  // ------------------------------------------------------------- signal names
  const taken = new Map();
  const claimName = (want, net) => {
    let b = String(want).replace(/[^A-Za-z0-9_]/g, '_') || 'n', nm = b, k = 0;
    while (taken.has(lc(nm)) && taken.get(lc(nm)) !== net) nm = `${b}_${++k}`;
    taken.set(lc(nm), net);
    return nm;
  };
  const sigOf = new Map();        // net -> ISE signal name (with bus range)
  const portOwner = new Map();    // net -> first port on it
  for (const p of doc.ports) { const n = nl.portNet.get(p.id); if (n && !portOwner.has(n)) portOwner.set(n, p); }
  // slices and bus joins become ISE bus taps: their part nets are renamed 'bus(7:4)' / 'bus(3)'
  const pinNetOf = (s, n) => nl.pinNet.get(`${s.id}/${n}`) || null;
  const member = new Map();       // net -> { main, msb, lsb }
  const tapSyms = new Map();      // symbol id -> 'slice' | 'join'
  const mains = new Set();
  const free = n => n && !portOwner.has(n) && !member.has(n) && !mains.has(n);
  for (const s of doc.symbols) {
    if (s.type !== 'slice') continue;
    const I = pinNetOf(s, 'I'), O = pinNetOf(s, 'O');
    const msb = parseInt(s.params.msb, 10) || 0, lsb = parseInt(s.params.lsb, 10) || 0;
    if (!I || !O || I === O || member.has(I) || !free(O) || msb < lsb || msb >= I.width || O.width !== msb - lsb + 1) continue;
    if (doc.symbols.some(q => q !== s && ((q.type === 'slice' && pinNetOf(q, 'I') === O) || (q.type === 'busjoin' && pinNetOf(q, 'O') === O)))) continue;
    member.set(O, { main: I, msb, lsb }); mains.add(I); tapSyms.set(s.id, 'slice');
  }
  for (const s of doc.symbols) {
    if (s.type !== 'busjoin') continue;
    const def = symbolDef(s, modules);
    const O = pinNetOf(s, 'O');
    const ins = def.pins.filter(q => q.dir === 'in').map(q => ({ q, n: pinNetOf(s, q.name) }));
    if (!O || member.has(O)) continue;
    if (!ins.every(({ q, n }) => free(n) && n !== O && n.width === q.width) || new Set(ins.map(i => i.n)).size !== ins.length) continue;
    if (ins.reduce((a, i) => a + i.q.width, 0) !== O.width) continue;
    let hi = O.width - 1;
    for (const { q, n } of ins) { member.set(n, { main: O, msb: hi, lsb: hi - q.width + 1 }); hi -= q.width; }
    mains.add(O); tapSyms.set(s.id, 'join');
  }
  let auto = 0;
  const used = nl.nets.filter(n => n.endpoints.length || n.wires.length);
  const order = [...used].sort((a, b) => (portOwner.has(b) - portOwner.has(a)) || (a.auto - b.auto));
  for (const n of order) {
    if (member.has(n)) continue;
    let base;
    if (portOwner.has(n)) base = claimName(portOwner.get(n).name, n);
    else if (!n.auto) base = claimName(n.name, n);
    else { do auto++; while (taken.has(lc(`XLXN_${auto}`))); base = claimName(`XLXN_${auto}`, n); }
    sigOf.set(n, n.width > 1 ? `${base}(${n.width - 1}:0)` : base);
  }
  for (const [n, m] of member) {
    const base = sigOf.get(m.main).replace(/\(.*$/, '');
    sigOf.set(n, m.msb === m.lsb ? `${base}(${m.msb})` : `${base}(${m.msb}:${m.lsb})`);
  }
  const bustaps = [];

  // ------------------------------------------------------------- symbols -> blocks
  const blockdefs = new Map();    // lower name -> { name, shapes, timestamp, pins (custom) }
  const files = [];
  const blocks = [], instances = [];
  const extraWires = new Map();   // net -> [[x1,y1,x2,y2]]
  const addExtra = (net, seg) => { let l = extraWires.get(net); if (!l) extraWires.set(net, l = []); l.push(seg); };
  const customs = new Map();      // lower name -> { name, sym, def, hdl }
  const hdlNames = new Set();
  for (const s of doc.symbols) {
    const def = symbolDef(s, modules);
    const netOfPin = n => nl.pinNet.get(`${s.id}/${n}`) || null;
    if (tapSyms.has(s.id)) {
      const pp = new Map(symbolPins(s, modules, def).map(q => [q.name, q]));
      if (tapSyms.get(s.id) === 'slice') {
        const I = pp.get('I'), O = pp.get('O');
        bustaps.push(`        <bustap x2="${X(O.x)}" y1="${X(I.y)}" y2="${X(O.y)}" x1="${X(I.x)}" />`);
      } else {
        // bus spine through the output pin, one tap per input
        const ins = def.pins.filter(q => q.dir === 'in');
        const O = def.pins.find(q => q.name === 'O');
        const spine = ins.map(q => xform(s, def, O.x, q.y));
        const ys = def.pins.map(q => q.y);
        const a = xform(s, def, O.x, Math.min(...ys)), b = xform(s, def, O.x, Math.max(...ys));
        if (a.x !== b.x || a.y !== b.y) addExtra(netOfPin('O'), [X(a.x), X(a.y), X(b.x), X(b.y)]);
        ins.forEach((q, i) => { const P = pp.get(q.name); bustaps.push(`        <bustap x2="${X(P.x)}" y1="${X(spine[i].y)}" y2="${X(P.y)}" x1="${X(spine[i].x)}" />`); });
      }
      continue;
    }
    const netW = n => netOfPin(n)?.width ?? null;
    let info = iseSymbolFor(s, def, netW, modules);
    if (info.lib) {
      const lp = libPins(info.name);
      if (!lp || Object.entries(info.pins).some(([xp, ip]) => def.pins.some(q => q.name === xp) && (!lp[ip] || lp[ip][1] == null || lp[ip][2] == null))) info = { lib: false, name: `xl_${s.type}${s.params?.width > 1 ? `_w${s.params.width}` : ''}` };
    }
    if (info.hdl) {
      let base = String(s.params?.title || s.name || 'block').replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'block';
      let nm = `xl_hdl_${base}`;
      if (hdlNames.has(lc(nm))) nm = `xl_hdl_${base}_${String(s.name).replace(/[^A-Za-z0-9_]/g, '_')}`;
      hdlNames.add(lc(nm));
      info.name = nm.replace(/_+/g, '_');
    }
    const orien = xaiToIseOrien(s.rot, s.mirror);
    const pinsSheet = symbolPins(s, modules, def);
    const iseName = info.name;
    let pinMap, localOf;
    if (info.lib) {
      const lp = libPins(iseName);
      pinMap = info.pins;
      localOf = xp => { const ip = pinMap[xp]; return ip && lp[ip] ? [lp[ip][1], lp[ip][2]] : null; };
      if (!blockdefs.has(lc(iseName))) blockdefs.set(lc(iseName), { name: iseName, timestamp: LIB_TS[iseName] || '2000-1-1T10:10:10', shapes: LIB_GFX[iseName] ? gfxShapes(LIB_GFX[iseName]) : boxShapes(lp) });
    } else {
      // custom symbol: the XAIlinx geometry, scaled (origin = bottom left corner of the unrotated symbol)
      pinMap = Object.fromEntries(def.pins.map(q => [q.name, info.pins?.[q.name] ?? ((q.width ?? netW(q.name) ?? 1) > 1 ? `${q.name}(${(q.width ?? netW(q.name)) - 1}:0)` : q.name)]));
      localOf = xp => { const q = def.pins.find(r => r.name === xp); return q ? [X(q.x), X(q.y - def.h)] : null; };
      const key = lc(iseName);
      const prev = customs.get(key);
      if (!prev) {
        const cdef = customDef(iseName, def, pinMap, stamp);
        customs.set(key, { name: iseName, sym: s, def, cdef, info, pinMap });
        blockdefs.set(key, cdef);
      } else if (info.hdl && (prev.sym.hdl || '') !== (s.hdl || '')) warn(`${s.name}: HDL block '${iseName}' differs from another block with the same name`);
    }
    // instance origin: lines the ISE pins up with the XAIlinx pins (library symbols: most pins; stubs for the others)
    const cands = new Map();
    for (const q of pinsSheet) {
      const l = localOf(q.name);
      if (!l) continue;
      const [dx, dy] = iseXform(orien, l[0], l[1]);
      const o = `${X(q.x) - dx},${X(q.y) - dy}`;
      cands.set(o, (cands.get(o) || 0) + (netOfPin(q.name) ? 10 : 1));
    }
    let origin;
    if (cands.size) origin = [...cands].sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
    else { const p0 = xform(s, def, 0, def.h); origin = [X(p0.x), X(p0.y)]; }
    instances.push(`        <instance x="${origin[0]}" y="${origin[1]}" name="${xesc(s.name)}" orien="${orien}" />`);
    const bp = [];
    for (const q of pinsSheet) {
      const ip = pinMap[q.name];
      if (!ip) { if (netOfPin(q.name)) warn(`${s.name}: pin ${q.name} has no pin on ISE symbol '${iseName}'`); continue; }
      const net = netOfPin(q.name);
      const connected = net && (net.endpoints.length > 1 || net.wires.length || net.labels.length || net.ports.length);
      bp.push(connected ? `            <blockpin signalname="${xesc(sigOf.get(net))}" name="${xesc(ip)}" />` : `            <blockpin name="${xesc(ip)}" />`);
      if (connected) {
        const l = localOf(q.name);
        const [dx, dy] = iseXform(orien, l[0], l[1]);
        const P = [origin[0] + dx, origin[1] + dy], T = [X(q.x), X(q.y)];
        if (P[0] !== T[0] || P[1] !== T[1]) {
          if (P[0] !== T[0] && P[1] !== T[1]) { addExtra(net, [P[0], P[1], T[0], P[1]]); addExtra(net, [T[0], P[1], T[0], T[1]]); }
          else addExtra(net, [P[0], P[1], T[0], T[1]]);
        }
      }
    }
    // library pins the XAIlinx symbol does not have (CEO/TC of counters...) stay unconnected
    if (info.lib) for (const ip of Object.keys(libPins(iseName))) if (!Object.values(pinMap).includes(ip) || !pinsSheet.some(q => pinMap[q.name] === ip)) { if (!bp.some(l => l.includes(`name="${ip}"`))) bp.push(`            <blockpin name="${xesc(ip)}" />`); }
    blocks.push([`        <block symbolname="${xesc(iseName)}" name="${xesc(s.name)}">`, ...bp, '        </block>'].join('\n'));
  }

  // ------------------------------------------------------------- HDL modules and symbols for the custom blockdefs
  for (const c of customs.values()) {
    const { name, sym, def, info, pinMap } = c;
    files.push({ path: `${name}.sym`, text: symFile(name, def, pinMap, stamp), kind: 'sym' });
    if (info.module) { warn(`'${name}': project module — ISE uses its HDL source and the ${name}.sym symbol (or regenerate it with Create Schematic Symbol)`); continue; }
    if (info.project) { warn(`'${name}': symbol of the ISE project (imported as an HDL block) — keep the project's own ${name}.sym and HDL source; ${name}.sym returned here only matches the XAIlinx drawing`); continue; }
    const mini = newDoc(name, lang);
    const s2 = { ...JSON.parse(JSON.stringify(sym)), id: 'S1', x: 200, y: 200, rot: 0, mirror: false, name: 'U1' };
    mini.symbols.push(s2);
    if (sym.type === 'hdlblock' && doc.hdl?.decls) {
      // keep the declarations the block uses (temporaries of imported ISE library functions)
      const code = String(sym.hdl || '');
      const keep = String(doc.hdl.decls).split('\n').filter(l => { const m = /^\s*(?:signal|reg|wire)\s+(?:\[[^\]]*\]\s*)?([A-Za-z_][\w]*)/.exec(l); return m && new RegExp(`\\b${m[1]}\\b`).test(code); });
      if (keep.length) mini.hdl = { lang: doc.hdl.lang || lang, decls: keep.join('\n') };
    }
    for (const q of symbolPins(s2, modules)) {
      const net = nl.pinNet.get(`${sym.id}/${q.name}`);
      const w = q.width ?? net?.width ?? 1;
      mini.ports.push({ id: `P${mini.ports.length + 1}`, name: q.name, dir: q.dir === 'out' ? 'out' : q.dir === 'inout' ? 'inout' : 'in', width: w, x: q.x, y: q.y });
    }
    const g = generateHdl(mini, { lang, modules });
    const errs = g.diagnostics.filter(d => d.severity === 'error');
    if (errs.length) warn(`${name}: HDL module has errors: ${errs.map(d => d.message).join('; ')}`);
    files.push({ path: `${name}.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.code.replace(/Generated by XAIlinx from .*$/m, `Generated by XAIlinx for the ISE schematic symbol ${name}`), kind: 'hdl' });
  }
  if (customs.size) {
    const xs = [...customs.values()].filter(c => !c.info.module).map(c => c.name);
    if (xs.length) warn(`ISE symbols not in the Xilinx library: ${xs.join(', ')} — add the returned HDL (${lang === 'vhdl' ? '.vhd' : '.v'}) and .sym files to the ISE project`);
  }

  // ------------------------------------------------------------- sheet: wires, net names, I/O markers
  const branches = [];
  for (const n of used) {
    const L = [];
    const segs = [];
    for (const wId of n.wires) {
      const w = doc.wires.find(q => q.id === wId);
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i], b = w.points[i + 1];
        if (a.x !== b.x && a.y !== b.y) { segs.push([X(a.x), X(a.y), X(b.x), X(a.y)], [X(b.x), X(a.y), X(b.x), X(b.y)]); } else segs.push([X(a.x), X(a.y), X(b.x), X(b.y)]);
      }
    }
    segs.push(...(extraWires.get(n) || []));
    if (!segs.length) continue;
    for (const lId of n.labels) {
      const l = doc.labels.find(q => q.id === lId);
      L.push(`            <attrtext style="alignment:SOFT-BCENTER;fontsize:28;fontname:Arial" attrname="Name" x="${X(l.x)}" y="${X(l.y)}" type="branch" />`);
    }
    for (const [x1, y1, x2, y2] of segs) if (x1 !== x2 || y1 !== y2) L.push(`            <wire x2="${x2}" y1="${y1}" y2="${y2}" x1="${x1}" />`);
    branches.push([`        <branch name="${xesc(sigOf.get(n))}">`, ...L, '        </branch>'].join('\n'));
  }
  const iomarkers = [], portDecl = [];
  for (const p of doc.ports) {
    const n = nl.portNet.get(p.id);
    const owner = n && portOwner.get(n);
    if (owner && owner.id !== p.id) { warn(`I/O marker '${p.name}' shares the net of '${owner.name}': not exported (ISE needs a buffer between two ports)`); continue; }
    const sn = n ? sigOf.get(n) : (p.width > 1 ? `${p.name}(${p.width - 1}:0)` : p.name);
    if (!n) { sigOf.set(p, sn); }
    portDecl.push(`        <port polarity="${p.dir === 'in' ? 'Input' : p.dir === 'out' ? 'Output' : 'BiDirectional'}" name="${xesc(sn)}" />`);
    iomarkers.push(`        <iomarker fontsize="28" x="${X(p.x)}" y="${X(p.y)}" name="${xesc(sn)}" orien="${p.dir === 'in' ? 'R180' : 'R0'}" />`);
  }

  // ------------------------------------------------------------- sheet size
  let mx = 0, my = 0;
  const acc = (x, y) => { mx = Math.max(mx, x); my = Math.max(my, y); };
  for (const s of doc.symbols) { const b = symbolBox(s, modules); acc(X(b.x + b.w), X(b.y + b.h)); }
  for (const w of doc.wires) for (const p of w.points) acc(X(p.x), X(p.y));
  for (const p of doc.ports) { const b = portBox(p); acc(X(b.x + b.w), X(b.y + b.h)); }
  const size = SHEET_SIZES.find(([w, h]) => mx + 64 <= w && my + 64 <= h) || [Math.ceil((mx + 128) / 32) * 32, Math.ceil((my + 128) / 32) * 32];

  // ------------------------------------------------------------- XML
  const out = [];
  out.push('<?xml version="1.0" encoding="UTF-8"?>', '<drawing version="7">');
  out.push(`    <attr value="${xesc(family)}" name="DeviceFamilyName">`, '        <trait delete="all:0" />', '        <trait editname="all:0" />', '        <trait edittrait="all:0" />', '    </attr>');
  out.push('    <netlist>');
  for (const n of used) out.push(`        <signal name="${xesc(sigOf.get(n))}" />`);
  for (const p of doc.ports) if (!nl.portNet.get(p.id) && sigOf.has(p)) out.push(`        <signal name="${xesc(sigOf.get(p))}" />`);
  out.push(...portDecl);
  for (const d of blockdefs.values()) {
    out.push(`        <blockdef name="${xesc(d.name)}">`, `            <timestamp>${d.timestamp}</timestamp>`);
    for (const sh of d.shapes) out.push(shapeXml(sh, '            '));
    out.push('        </blockdef>');
  }
  out.push(...blocks);
  out.push('    </netlist>');
  out.push(`    <sheet sheetnum="1" width="${size[0]}" height="${size[1]}">`);
  out.push(...instances, ...branches, ...bustaps, ...iomarkers);
  out.push('    </sheet>', '</drawing>', '');
  return { xml: out.join('\n'), warnings, files };
}

// generic box graphics for a library symbol without recorded graphics
function boxShapes(lp) {
  const pts = Object.values(lp).filter(p => p[1] != null);
  const xs = pts.map(p => p[1]), ys = pts.map(p => p[2]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys) - 32, y1 = Math.max(...ys) + 32;
  const shapes = [{ kind: 'rect', x: x0 + 64, y: y0, w: Math.max(64, x1 - x0 - 128), h: y1 - y0 }];
  for (const [, x, y] of pts) shapes.push(x <= x0 ? { kind: 'line', x1: x, y1: y, x2: x + 64, y2: y } : { kind: 'line', x1: x, y1: y, x2: x - 64, y2: y });
  return shapes;
}
// blockdef of a XAIlinx-only symbol: its body rectangle and pin stubs, scaled
function customDef(name, def, pinMap, stamp) {
  const X = v => Math.round(v * S_OUT);
  const oy = def.h;
  const b = def.body || { x: 20, y: 0, w: def.w - 40, h: def.h };
  const shapes = [{ kind: 'rect', x: X(b.x), y: X(b.y - oy), w: Math.max(32, X(b.w)), h: Math.max(32, X(b.h)) }];
  for (const q of def.pins) {
    const bus = /\(/.test(pinMap[q.name] || '');
    const px = X(q.x), py = X(q.y - oy);
    const end = q.side === 'W' ? [X(b.x), py] : q.side === 'E' ? [X(b.x + b.w), py] : q.side === 'N' ? [px, X(b.y - oy)] : [px, X(b.y + b.h - oy)];
    if (end[0] !== px || end[1] !== py) shapes.push({ kind: 'line', x1: px, y1: py, x2: end[0], y2: end[1], bus });
  }
  return { name, timestamp: stamp, shapes, custom: true };
}
// ISE 14.x symbol file (.sym, XML) for a custom blockdef
function symFile(name, def, pinMap, stamp) {
  const X = v => Math.round(v * S_OUT);
  const oy = def.h;
  const cd = customDef(name, def, pinMap, stamp);
  const L = ['<?xml version="1.0" encoding="UTF-8"?>', `<symbol version="7" name="${xesc(name)}">`, '    <symboltype>BLOCK</symboltype>', `    <timestamp>${stamp}</timestamp>`];
  for (const q of def.pins) L.push(`    <pin polarity="${q.dir === 'out' ? 'Output' : q.dir === 'inout' ? 'BiDirectional' : 'Input'}" x="${X(q.x)}" y="${X(q.y - oy)}" name="${xesc(pinMap[q.name])}" />`);
  L.push('    <graph>');
  const r = cd.shapes[0];
  L.push(shapeXml(r, '        '));
  L.push(`        <attrtext style="alignment:BCENTER;fontsize:56;fontname:Arial" attrname="SymbolName" x="${Math.round(r.x + r.w / 2)}" y="${r.y - 8}" type="symbol" />`);
  for (const q of def.pins) {
    const sh = cd.shapes.find(s => s.kind === 'line' && s.x1 === X(q.x) && s.y1 === X(q.y - oy));
    if (sh) L.push(shapeXml(sh, '        '));
    const tx = q.side === 'E' ? X(q.x) - 72 : X(q.x) + 72;
    L.push(`        <text style="${q.side === 'E' ? 'alignment:RIGHT;' : ''}fontsize:24;fontname:Arial" x="${tx}" y="${X(q.y - oy)}">${xesc(pinMap[q.name])}</text>`);
  }
  L.push('    </graph>', '</symbol>', '');
  return L.join('\n');
}

// ===================================================================== project-level helpers
/**
 * Convert the ISE schematics of a project (e.g. the FILE_SCHEMATIC entries of an imported .xise) into XAIlinx
 * schematics + their generated HDL. Hierarchical schematics (a schematic used as a symbol in another one) are
 * converted bottom-up so the parent sees the child's ports as a project module.
 * @param {{ [path: string]: string }} schFiles  'src/top.sch' -> .sch text
 * @param {{ sources?: object, symbols?: object, lang?: 'vhdl'|'verilog' }} opts
 *   sources: HDL sources of the project { path: text } (modules the schematics instantiate)
 *   symbols: .sym files of the project { path: text }
 * @returns {{ sch, json, hdl, name, doc, code, warnings }[]}  json = path of the .sch.json to write, hdl = path of the
 *   generated HDL file (doc.generatedFile; add it to the project files as a design source)
 */
export function convertIseSchematics(schFiles, { sources = {}, symbols = {}, lang = 'vhdl' } = {}) {
  const items = Object.entries(schFiles).map(([path, text]) => {
    const name = path.replace(/^.*\//, '').replace(/\.sch$/i, '');
    let model = null;
    try { model = parseIseSch(text); } catch { /* reported below */ }
    return { path, text, name, uses: new Set((model?.blocks || []).map(b => lc(b.symbol))) };
  });
  const byName = new Map(items.map(i => [lc(i.name), i]));
  const order = [], state = new Map();
  const visit = it => {
    if (state.get(it) === 2) return;
    if (state.get(it) === 1) return;          // cycle: keep the order found so far
    state.set(it, 1);
    for (const u of it.uses) { const c = byName.get(u); if (c && c !== it) visit(c); }
    state.set(it, 2); order.push(it);
  };
  items.forEach(visit);
  const ext = lang === 'vhdl' ? 'vhd' : 'v';
  const generated = {};
  const out = [];
  for (const it of order) {
    const all = { ...sources, ...generated };
    let modules = {};
    try { const lib = compile(Object.entries(all).map(([path, text]) => ({ path, text }))); modules = modulesFromLibrary(lib, { sources: all }); } catch { /* no modules */ }
    const hdl = it.path.replace(/\.sch$/i, `.${ext}`);
    const json = it.path.replace(/\.sch$/i, '.sch.json');
    try {
      const r = importIseSch(it.text, { name: it.name, lang, modules, symbols });
      r.doc.generatedFile = hdl;
      const g = generateHdl(r.doc, { lang, modules });
      generated[hdl] = g.code;
      out.push({ sch: it.path, json, hdl, name: it.name, doc: r.doc, code: g.code, warnings: [...r.warnings, ...g.diagnostics.filter(d => d.severity === 'error').map(d => `HDL generation: ${d.message}`)] });
    } catch (e) {
      out.push({ sch: it.path, json, hdl, name: it.name, doc: null, code: null, warnings: [`${it.path}: ${e.message}`] });
    }
  }
  return out;
}
