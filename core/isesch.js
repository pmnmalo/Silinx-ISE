// Xilinx ISE schematic (.sch) <-> Silinx schematic document (.sch.json). Isomorphic (no DOM, no Node APIs).
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
// Silinx connectivity is geometric, so the import rebuilds it: ISE coordinates are mapped with an order
// preserving map (ISE unit 64 -> 20 px, minimum spacing one grid step) that keeps the wire topology exact,
// Silinx symbols are placed on the ISE pin positions (stub wires where the symbol shapes differ), bus taps
// become slice / bus join symbols, and net names are added wherever a net is joined by name only.
// The result is checked with netlist() against the ISE netlist (warnings list any difference).
import {
  SYMBOLS, DOC_VERSION, defaultParams, normalizeDoc, symbolDef, symbolPins, symbolBox, portBox, portSide, netlist, normModules,
  validIdent, generateHdl, modulesFromLibrary, joinWires,
} from './schdoc.js';
import { compile } from './compile.js';

// the export (#405: isesch-export.js), still exported from here
import { exportIseSch, decodeXlSymbol, iseTimestamp } from './isesch-export.js';
import { readIseNets } from './isesch-nets.js';
import { blockGeometry } from './isesch-geometry.js';
import { assembleIseImport } from './isesch-assemble.js';
import { ISE_GRAPHIC_TAGS, graphicsFromIse, iseGraphic } from './isesch-graphics.js';
import { libTemplate } from './isesch-hdl.js';
import { primFromIse, primLibPins } from './isesch-prims.js';
import { attrPairs } from './xml-attrs.js';
export { exportIseSch, decodeXlSymbol, iseTimestamp };

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
    for (const [k, v] of attrPairs(body.slice(m[0].length))) el.attrs[k] = decodeEnt(v);   // (in one pass, #3557)
    top().children.push(el);
    if (!selfClose) stack.push(el);
  }
  return root;
}
function decodeEnt(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (_, e) => {
    const l = e.toLowerCase();
    if (l === 'lt') return '<'; if (l === 'gt') return '>'; if (l === 'amp') return '&'; if (l === 'quot') return '"'; if (l === 'apos') return "'";
    const cp = l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10);
    return cp <= 0x10ffff ? String.fromCodePoint(cp) : '\uFFFD';   // (past Unicode, &#x110000; on: U+FFFD, #3557)
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
    const S = { num: num(sh.attrs.sheetnum) || 1, width: num(sh.attrs.width) || 3520, height: num(sh.attrs.height) || 2720, instances: [], branches: [], iomarkers: [], bustaps: [], graphics: [] };
    for (const c of sh.children) {
      const A = c.attrs;
      if (c.tag === 'instance') S.instances.push({ name: A.name, x: num(A.x), y: num(A.y), orien: A.orien || 'R0' });
      else if (c.tag === 'branch') {
        S.branches.push({ name: A.name, wires: kids(c, 'wire').map(w => [num(w.attrs.x1), num(w.attrs.y1), num(w.attrs.x2), num(w.attrs.y2)]),
          labels: kids(c, 'attrtext').filter(t => !t.attrs.attrname || /^name$/i.test(t.attrs.attrname)).map(t => ({ x: num(t.attrs.x), y: num(t.attrs.y), style: t.attrs.style || '' })) });
      } else if (c.tag === 'iomarker') S.iomarkers.push({ name: A.name, x: num(A.x), y: num(A.y), orien: A.orien || 'R0' });
      else if (c.tag === 'bustap') S.bustaps.push({ x1: num(A.x1), y1: num(A.y1), x2: num(A.x2), y2: num(A.y2) });
      else if (ISE_GRAPHIC_TAGS.has(c.tag)) S.graphics.push(iseGraphic(c.tag, A, c.text));
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
    // (no line end before SYMPIN: \s* went over the blank lines after each line's start, #3557)
    for (const m of src.matchAll(/^[^\S\n\r\u2028\u2029]*SYMPIN\s+(-?\d+)\s+(-?\d+)\s+(\w+)\s+(\S+)/gm)) out.pins.push({ name: m[4], dir: dirOf(m[3]), x: +m[1], y: +m[2] });
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
      const S = { num: num(t[2]) || 1, width: num(t[3]) || 3520, height: num(t[4]) || 2720, instances: [], branches: [], iomarkers: [], bustaps: [], graphics: [] };
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
        if (isBegin(u, 'DISPLAY') && u[4] === 'TEXT') { S.graphics.push({ kind: 'text', x: num(u[2]), y: num(u[3]), text: u.slice(5).join(' ') }); skipBlock(); continue; }
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
// ISE orien <-> Silinx { rot, mirror } (Silinx mirrors first, then rotates: Mk == mirror + rot (360-k))
export function iseOrienToXai(orien) {
  const m = /^([RM])(\d+)$/i.exec(String(orien || 'R0'));
  const k = m ? ((+m[2] % 360) + 360) % 360 : 0;
  if (m && m[1].toUpperCase() === 'M') return { rot: (360 - k) % 360, mirror: true };
  return { rot: k, mirror: false };
}
export function xaiToIseOrien(rot = 0, mirror = false) { return mirror ? `M${(360 - rot) % 360}` : `R${rot % 360}`; }
// an I/O marker's orien <-> the side of its body (core/schdoc.js portSide, #296): R0 puts it to the right
// of the connection point (E), R90 below (S), R180 to the left (W), R270 above (N); Mk as iseXform
export function iomarkerSide(orien) {
  const [dx, dy] = iseXform(String(orien || 'R0').toUpperCase(), 1, 0);
  return dx > 0 ? 'E' : dx < 0 ? 'W' : dy > 0 ? 'S' : 'N';
}
export const iomarkerOrien = side => ({ E: 'R0', S: 'R90', W: 'R180', N: 'R270' })[side] || 'R0';

// "A(7:0)" -> { base: 'A', msb: 7, lsb: 0, width: 8 }; "A(3)" -> { base, bit: 3, width: 1 }; "A" -> { base, width: 1 }
export function parseIseName(name) {
  const s = String(name ?? '').trim();
  let m = /^(.*?)\s*[([<]\s*(\d+)\s*:\s*(\d+)\s*[)\]>]$/.exec(s);
  if (m && m[1]) return { base: m[1], msb: +m[2], lsb: +m[3], width: Math.abs(+m[2] - +m[3]) + 1, range: true };
  m = /^(.*?)\s*[([<]\s*(\d+)\s*[)\]>]$/.exec(s);
  if (m && m[1]) return { base: m[1], bit: +m[2], width: 1 };
  return { base: s, width: 1 };
}
export const lc = s => String(s ?? '').toLowerCase();
export const r10 = v => Math.round(v / 10) * 10;

// ===================================================================== Xilinx library knowledge
// Pin positions (ISE units, symbol-local, y up = negative) checked against real ISE 14.x schematics.
// Library graphics (blockdef shapes) of the Spartan-3E library symbols written by export.
export const LIB_GFX = {
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
  // tri-state buffers: the buffer triangle, the enable from the left one row above the data, down to the
  // top edge of the triangle (a bubble on it for the active-low T)
  bufe: 'L 0 -32 64 -32|L 224 -32 128 -32|L 64 0 128 -32|L 128 -32 64 -64|L 64 -64 64 0|L 0 -96 96 -96|L 96 -96 96 -48',
  buft: 'L 0 -32 64 -32|L 224 -32 128 -32|L 64 0 128 -32|L 128 -32 64 -64|L 64 -64 64 0|L 0 -96 96 -96|L 96 -96 96 -72|C 96 -60 12',
  bufe8: 'LW 0 -32 64 -32|LW 224 -32 128 -32|L 64 0 128 -32|L 128 -32 64 -64|L 64 -64 64 0|L 0 -96 96 -96|L 96 -96 96 -48',
  buft8: 'LW 0 -32 64 -32|LW 224 -32 128 -32|L 64 0 128 -32|L 128 -32 64 -64|L 64 -64 64 0|L 0 -96 96 -96|L 96 -96 96 -72|C 96 -60 12',
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
LIB_GFX.bufe16 = LIB_GFX.bufe8;
LIB_GFX.buft16 = LIB_GFX.buft8;
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
export const LIB_TS = { fdr: '2000-1-1T10:10:10', m2_1: '2001-5-4T10:10:51', cb8re: '2001-2-2T12:36:39' };
export function gfxShapes(code) {
  return code.split('|').map(t => {
    const [k, ...v] = t.split(' ');
    const n = v.map(Number);
    if (k[0] === 'L') return { kind: 'line', x1: n[0], y1: n[1], x2: n[2], y2: n[3], bus: k === 'LW' };
    if (k === 'R') return { kind: 'rect', x: n[0], y: n[1], w: n[2], h: n[3] };
    if (k === 'C') return { kind: 'circle', cx: n[0], cy: n[1], r: n[2] };
    return { kind: 'arc', cx: n[0], cy: n[1], r: n[2], sx: n[3], sy: n[4], ex: n[5], ey: n[6] };
  });
}

export const GATE_RE = /^(and|or|nand|nor|xor|xnor)(\d+)(?:b(\d+))?$/;
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
  if (s === 'obuft') return { T: ['in', null, null], I: ['in', 0, -32], O: ['out', 224, -32] };
  // BUFT: T at the place of the E of BUFE (import only: positions come from the wires)
  if (s === 'buft') return { T: ['in', 0, -96], I: ['in', 0, -32], O: ['out', 224, -32] };
  if ((m = /^buf([et])(8|16)$/.exec(s))) { const w = +m[2]; return { [m[1].toUpperCase()]: ['in', 0, -96], [`I(${w - 1}:0)`]: ['in', 0, -32], [`O(${w - 1}:0)`]: ['out', 224, -32] }; }
  if ((m = /^buf([et])4$/.exec(s))) { const p = { [m[1].toUpperCase()]: ['in', null, null] }; for (let k = 0; k < 4; k++) { p[`I${k}`] = ['in', null, null]; p[`O${k}`] = ['out', null, null]; } return p; }
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
  return primLibPins(s);              // a device primitive's symbol (#1694), or null
}

// pins of a blockdef that look like pin stubs: a line with one end on the outside of the body
export function blockdefPinPoints(def) {
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

// ===================================================================== import: .sch -> .sch.json
export const S_IN = 5 / 16;                       // ISE units -> Silinx px (ISE pin pitch 64 -> grid 20)
export const AUTO_RE = /^XLXN_\d+$/i;
export const SIDE_VEC = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
export const INWARD_ROT = { W: 0, N: 90, E: 180, S: 270 };   // inverter rotation so that it points into a pin on that side

export function findModule(modules, name) {
  if (!name) return null;
  const l = lc(name);
  for (const k in modules) if (lc(k) === l) return modules[k];
  return null;
}

// Order preserving coordinate map with minimum spacing (keeps the topology of orthogonal wiring exact).
export class AxisMap {
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

export function onSegment(px, py, [x1, y1, x2, y2]) {
  if (x1 === x2) return px === x1 && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
  if (y1 === y2) return py === y1 && px >= Math.min(x1, x2) && px <= Math.max(x1, x2);
  const cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
  return Math.abs(cross) < 1e-6 && px >= Math.min(x1, x2) && px <= Math.max(x1, x2) && py >= Math.min(y1, y2) && py <= Math.max(y1, y2);
}

/**
 * Convert an ISE schematic (.sch, version 7 XML or legacy VERSION 6 text) into a Silinx document.
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
  // the ISE netlist read: signals, blocks, buses, names, the HDL blocks' specs (isesch-nets.js)
  const { sigs, keyWidth, blocks, portPol, helpers, memberOf, mainInfo, claim, keyName, declLines, sheetGeo, sheetPt } =
    readIseNets(model, opts, { lang, modules, docName, warn });

  // ------------------------------------------------------------- local geometry of every block, coordinate maps (isesch-geometry.js)
  let wid = 0, lid = 0, pid = 0;
  const { MX, MY, macros, pinKey, pinsOf } = blockGeometry({ blocks, claim, helpers, keyName, memberOf, model, modules, sheetGeo, warn });

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
      // its side: where its orien puts the body (R0 to the right of the connection point, #296); kept
      // when it is not the default one of its direction
      const side = iomarkerSide(io.orien);
      if (side !== portSide(p)) p.side = side;
      ports.push(p); portKey.set(p.id, k);
    }
  });
  // ISE does not connect different branches that merely touch (a wire end on another net's wire);
  // Silinx does: open a one-grid gap in the other wire (its two halves are re-joined by name below)
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
  // stubs from the Silinx pins to the ISE pin positions
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
  const onOwnWire = (x, y, key) => (segH.get(y) || []).some(([lo, hi, k]) => k === key && x >= lo && x <= hi) || (segV.get(x) || []).some(([lo, hi, k]) => k === key && y >= lo && y <= hi);
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
    // a bus tap (#1726: its input a grid step across from its output's line): its output on ISE's bit wire, its input
    // then on its bus a step along it, where the bus runs on
    const tapIn = M.tap ? tgt.find(q => q.e.pin === 'I') : null, tapOut = M.tap ? tgt.find(q => q.e.pin === 'O') : null;
    if (tapIn && tapOut) {
      const dx = tapOut.T[0] - tapOut.e.E[0], dy = tapOut.T[1] - tapOut.e.E[1];
      if (valid(dx, dy) && onOwnWire(tapIn.e.E[0] + dx, tapIn.e.E[1] + dy, tapIn.e.key)) base = { dx, dy };
    }
    if (base) { /* placed */ } else if (tgt.length) {
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
    // (a tap's input on its own bus: no wire to the bus's point, the bus joined there)
    for (const { e, T } of tgt) e.T = M.tap && e.pin === 'I' && onOwnWire(e.E[0], e.E[1], e.key) ? [...e.E] : T;
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

  // ------------------------------------------------------------- park, assemble, check (isesch-assemble.js)
  return assembleIseImport({
    addWire, declLines, docName, keyName, keyWidth, labelKey, labels, lang, macroBox, macros, mainInfo, model, modules,
    occ, occAdd, occReset, overlapsForeign, parked, passes, pinKey, pinsOf, portKey, ports, segAdd, shiftMacro, sigs,
    stubOf, syms, unplacedPorts, warn, warnings, wireKey, wires, lid, pid, graphics: graphicsFromIse(model, MX, MY, S_IN)
  });
}

// ISE block -> Silinx symbol spec: { type, params, pins: { isePin: { xai, dir, width, invert?, clock? } }, tpl?, title? }
export function mapSymbol(blk, modules, warn, geo = {}) {
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
    // ANDnBk...: native Silinx symbol with the same pins (I0 at the bottom, I0..I(k-1) inverted)
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
  // a device primitive's library symbol (BUFG, DCM_SP, RAMB16_S9 …): the Silinx primitive, its attributes its parameters (#1694)
  const prim = primFromIse(sym, blk.attrs);
  if (prim) return direct(prim.type, prim.params);
  if (BUF1.has(sym)) return direct(sym === 'inv' ? 'inv' : 'buf', { width: 1 });
  // tri-state buffers BUFE / BUFT (1 bit), BUFE4 / BUFT4 (one pin per bit), BUFE8/16 / BUFT8/16 (bus pins)
  if ((m = /^buf([et])(4|8|16)?$/.exec(sym))) { const w = m[2] ? +m[2] : 1; return direct('tbuf', { width: w, enable: m[1].toUpperCase(), bits: w === 4 }); }
  if ((m = /^(inv|buf|ibuf|obuf)(8|16|32)$/.exec(sym))) return direct(m[1] === 'inv' ? 'inv' : 'buf', { width: +m[2] });
  // FD*, FT*, FJK*: native flip-flop symbols with the library pin names (INIT: the block attribute, else the Xilinx default)
  if (SYMBOLS[sym]?.ff) return direct(sym, { init: blk.attrs.INIT != null ? init : SYMBOLS[sym].params[0].default });
  if ((m = /^fd(8|16|32)(ce|re)$/.exec(sym))) return direct('register', { width: +m[1], en: true, reset: m[2] === 'ce' ? 'async' : 'sync', init: '0' });
  if (sym === 'm2_1') return direct('mux2', { width: 1 });
  // the Xilinx M2_1E / M4_1E: the native multiplexers with their enable E (#301)
  if (sym === 'm2_1e') return direct('mux2', { width: 1, en: true });
  if (sym === 'm4_1e') return direct('mux4', { width: 1, en: true, selBus: false });
  if (sym === 'm8_1e') return direct('mux8', { width: 1, en: true, selBus: false });
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
  if (!tpl) warn(`${blk.name}: ISE symbol '${blk.symbol}' ${/^xl_hdl_/i.test(blk.symbol) ? 'is an HDL block exported by Silinx: imported as an empty HDL block (paste the code of its HDL file, or import that file as a project module)' : 'has no Silinx equivalent: imported as an empty HDL block (write its HDL or add the module to the project)'}`);
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

// ===================================================================== project-level helpers
/**
 * Convert the ISE schematics of a project (e.g. the FILE_SCHEMATIC entries of an imported .xise) into Silinx
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
