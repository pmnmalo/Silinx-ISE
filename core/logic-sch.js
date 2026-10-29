// Silinx logic - the gate schematic of a truth table (#405: out of core/logic.js): each output's minimal form as a
// tree of gates (fan-in split, NAND / NOR only when asked), placed and wired as a schematic document.
import { joinOnWires, netlist, newDoc, symbolBox, symbolDef, symbolPins } from './schdoc.js';
import { normalizeTable, outputForm } from './logic.js';

// ===================================================================== gate schematic of a table
const GAP = 20;            // between sibling subtrees
const GATE_W = 80;

// expression tree of an output: { op: 'and'|'or'|'buf'|'nand'|'nand1', kids } | { leaf: v, neg } | { const: 0|1 }
function outputTree(res) {
  const pos = res.form === 'pos';
  const leaf = l => ({ leaf: l.v, neg: pos ? !l.neg : l.neg });
  if (!res.terms.length) return { const: pos ? 1 : 0 };
  if (res.terms.some(t => !t.literals.length)) return { const: pos ? 0 : 1 };
  const inner = pos ? 'or' : 'and', outer = pos ? 'and' : 'or';
  const terms = res.terms.map(t => (t.literals.length === 1 ? leaf(t.literals[0]) : { op: inner, kids: t.literals.map(leaf) }));
  return terms.length === 1 ? terms[0] : { op: outer, kids: terms };
}
// at most L inputs a gate (L(op) when L is a function); the groups of an XNOR, NAND or NOR are XORs,
// ANDs or ORs: XNOR(a, b, c, d, e) = XNOR(XOR(a, b, c, d), e)
const BASE_OP = { xnor: 'xor', nand: 'and', nor: 'or' };
function splitFanIn(node, L) {
  if (!node.op) return node;
  const max = typeof L === 'function' ? L(node.op) : L;
  let kids = node.kids.map(k => splitFanIn(k, L));
  const base = BASE_OP[node.op] || node.op;
  while (kids.length > max) {
    const bmax = typeof L === 'function' ? L(base) : L;
    const nk = [];
    for (let i = 0; i < kids.length; i += bmax) { const ch = kids.slice(i, i + bmax); nk.push(ch.length === 1 ? ch[0] : splitFanIn({ op: base, kids: ch }, L)); }
    kids = nk;
  }
  return { op: node.op, kids };
}
// NAND-only (or NOR-only) form computing node (inv = false) or its complement (inv = true), by double
// negation: a·b = /(/(a·b)), a + b = /(/a·/b); a + b = /(/(a + b)), a·b = /(/a + /b). A complemented
// input is an inverter (a one-input gate, `nand1`, `nor1`), double inverters cancel.
function gateOnly(node, inv, g) {
  if (node.leaf != null) return { leaf: node.leaf, neg: node.neg !== inv };
  const one = `${g}1`;
  const not = x => (x.op === one ? x.kids[0] : { op: one, kids: [x] });
  if (node.op === 'buf') return gateOnly(node.kids[0], inv, g);
  // the gate's own operation (AND for NAND): its inputs as they are; the other one: complemented
  const own = node.op === (g === 'nand' ? 'and' : 'or');
  if (node.op !== 'and' && node.op !== 'or') throw new Error(`${g} form: ${node.op}`);
  const x = { op: g, kids: node.kids.map(k => gateOnly(k, !own, g)) };
  return own === inv ? x : not(x);
}

/**
 * NAND-only form of a minimal SOP, or NOR-only form of a minimal POS (#694), with at most 4 inputs a
 * gate: { ast, gates (every gate, the inverters of the inputs once each), inverters }; a constant
 * output is its constant (no gate). In the ast a complemented input is a one-input gate (an inverter).
 */
export function gateForm(res, inputs, g = res.form === 'pos' ? 'nor' : 'nand') {
  let t = outputTree(res);
  if (t.const != null) return { ast: { t: 'const', v: t.const }, gates: 0, inverters: 0 };
  t = splitFanIn(t, 4);
  t = t.leaf != null ? { op: `${g}1`, kids: [{ leaf: t.leaf, neg: !t.neg }] } : gateOnly(t, false, g);
  const negs = new Set();
  let gates = 0, inverters = 0;
  const ast = x => {
    const v = { t: 'var', name: inputs[x.leaf] };
    if (x.leaf != null) { if (x.neg) negs.add(x.leaf); return x.neg ? { t: g, args: [v] } : v; }
    gates++; if (x.kids.length === 1) inverters++;
    return { t: g, args: x.kids.map(ast) };
  };
  const a = ast(t);
  return { ast: a, gates: gates + negs.size, inverters: inverters + negs.size };
}

// gate tree of an expression (the schematic of outputForm): the tree of outputTree, a complemented
// input (NOT, or a one-input NAND / NOR) a leaf `neg`; XNOR, NAND, NOR of two or more inputs their gates
function astTree(e, index) {
  const leaf = x => (x.t === 'var' ? { leaf: index.get(x.name), neg: false } : null);
  if (e.t === 'var') return leaf(e);
  if ((e.t === 'not' || ((e.t === 'nand' || e.t === 'nor') && e.args.length === 1)) && (e.a || e.args[0]).t === 'var') return { leaf: index.get((e.a || e.args[0]).name), neg: true };
  if (e.t === 'not') {
    const op = { xor: 'xnor', and: 'nand', or: 'nor' }[e.a.t];
    if (!op) throw new Error(`schematic of a table: NOT of ${e.a.t}`);
    return { op, kids: e.a.args.map(k => astTree(k, index)) };
  }
  if (e.t === 'nand' || e.t === 'nor') return e.args.length === 1 ? { op: `${e.t}1`, kids: [astTree(e.args[0], index)] } : { op: e.t, kids: e.args.map(k => astTree(k, index)) };
  if (e.args) return { op: e.t, kids: e.args.map(k => astTree(k, index)) };
  throw new Error(`schematic of a table: ${e.t}`);
}

/**
 * Gate schematic (core/schdoc.js document) of a table: input markers on the left, one vertical
 * rail per used input literal (inverters at the top), the circuit of each output's expression in the
 * form, the one of its HDL module (outputForm, #694: minimal SOP: AND gates then an OR gate; POS: OR
 * then AND; the XOR form with XOR / XNOR gates; NAND or NOR gates only, the inverters too) and the
 * output markers on the right. A gate has at most 5 inputs (AND, OR), 4 (NAND, NOR, XOR, XNOR).
 * opts: { form: one of FORMS (default: the table's), lang, name }.
 */
export function schematicFromTable(docIn, { form, lang, name } = {}) {
  const tt = normalizeTable(docIn);
  form ||= tt.form;
  const n = tt.inputs.length;
  const doc = newDoc(name || tt.name, lang || tt.lang);
  let sid = 0, wid = 0, pid = 0, lid = 0;
  const fanIn = op => (op === 'and' || op === 'or' ? 5 : 4);
  const index = new Map(tt.inputs.map((v, j) => [v, j]));
  // (each output's form: the one asked, or the one of least gates or delay, #1427; the inverters' gate NAND / NOR when
  // every output is in that form)
  const forms = tt.outputs.map(o => outputForm(tt, o, form));
  const only = ['nand', 'nor'].find(g => forms.every(f => f.form === g || f.ast.t === 'const')) || null;
  // ---- trees
  const trees = tt.outputs.map((o, i) => {
    const { ast } = forms[i];
    if (ast.t === 'const') return { o, t: { const: ast.v } };
    // (f = /a in NAND or NOR gates only: an inverter gate, not the inverted rail)
    let t = only && ast.args?.length === 1 && ast.args[0].t === 'var' ? { op: `${only}1`, kids: [{ leaf: index.get(ast.args[0].name), neg: false }] } : astTree(ast, index);
    t = splitFanIn(t, fanIn);
    if (t.leaf != null) t = { op: 'buf', kids: [t] };
    return { o, t };
  });
  // ---- sizes and columns
  const one = g => g.op === 'nand1' || g.op === 'nor1';
  const gateType = g => {
    const k = g.kids.length;
    if (one(g)) return `${g.op.slice(0, -1)}2`;
    if (g.op === 'buf') return 'buf';
    return `${g.op}${k}`;
  };
  const gateH = g => (g.op === 'buf' ? 20 : one(g) ? 40 : Math.max(40, g.kids.length * 20));
  const size = g => {
    if (g.leaf != null) { g.h = 20; g.level = 0; return; }
    g.kids.forEach(size);
    g.level = 1 + Math.max(...g.kids.map(k => k.level));
    g.allLeaf = g.kids.every(k => k.leaf != null);
    const content = g.allLeaf ? g.kids.length * 20 : g.kids.reduce((s, k) => s + k.h, 0) + GAP * (g.kids.length - 1);
    g.h = Math.max(content, gateH(g));
  };
  const place = (g, top) => {
    g.top = top;
    if (g.leaf != null) { g.y = top + 10; return; }
    let y = top;
    for (const k of g.kids) { place(k, y); y += k.h + (g.allLeaf ? 0 : GAP); }
    g.gy = g.allLeaf ? top : top + Math.round((g.h - gateH(g)) / 20) * 10;
  };
  let maxLevel = 1;
  for (const tr of trees) if (tr.t.const == null) { size(tr.t); maxLevel = Math.max(maxLevel, tr.t.level); }
  // literal rails needed
  const used = new Map();   // v -> { pos, neg }
  const walkLeaves = (g, f) => { if (g.leaf != null) f(g); else if (g.kids) g.kids.forEach(k => walkLeaves(k, f)); };
  for (const tr of trees) if (tr.t.const == null) walkLeaves(tr.t, l => { const u = used.get(l.leaf) || { pos: false, neg: false }; if (l.neg) u.neg = true; else u.pos = true; used.set(l.leaf, u); });
  // ---- geometry: input markers, rails, inverters
  const PX = 20 + 10 * Math.ceil(Math.max(...tt.inputs.map(v => v.length), 1) * 0.75 + 4);
  const portY = j => 40 + 30 * j;
  const yInv = portY(n - 1) + 30;
  const invH = 80;   // (an inverter as long as a 2-input gate, #1988)
  const xT = j => PX + 60 + 60 * j, xC = j => xT(j) + 30;
  const railsEnd = xT(n - 1) + 40;
  const bandTop0 = yInv + invH + 40;
  // per-gap channel counts (connections into gates of column c)
  const into = new Array(maxLevel + 2).fill(0);
  const countInto = g => { if (g.leaf != null) return; into[g.level] += g.kids.length; g.kids.forEach(countInto); };
  for (const tr of trees) if (tr.t.const == null) countInto(tr.t);
  const colX = [0, railsEnd + 40];
  for (let c = 2; c <= maxLevel; c++) colX[c] = colX[c - 1] + GATE_W + Math.max(40, 20 * (into[c] + 2));
  const xOut = colX[maxLevel] + GATE_W + 60;
  // bands
  let y = bandTop0;
  for (const tr of trees) { tr.top = y; const h = tr.t.const == null ? tr.t.h : 20; if (tr.t.const == null) place(tr.t, y); y += h + 40; }
  const yBottom = y - 20;
  // ---- symbols
  const syms = [];
  const addSym = (type, x, yy, rot = 0, params = {}) => {
    const s = { id: `S${++sid}`, type, x, y: yy, rot, mirror: false, name: `U${sid}`, params: { width: 1, ...params } };
    doc.symbols.push(s);
    const def = symbolDef(s);
    syms.push({ s, box: symbolBox(s, {}, def), pins: symbolPins(s, {}, def) });
    return syms[syms.length - 1];
  };
  const pinOf = (S, name) => S.pins.find(p => p.name === name);
  // geometry already drawn: segments with their net, for collision-free routing
  const segs = [];   // { a, b, net }
  const addWire = (pts, net) => {
    doc.wires.push({ id: `W${++wid}`, points: pts.map(p => ({ x: p.x, y: p.y })) });
    for (let i = 0; i + 1 < pts.length; i++) segs.push({ a: pts[i], b: pts[i + 1], net });
  };
  const onSegment = (p, a, b) => (a.x === b.x ? p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y) : p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x));
  const segClash = (s, t) => {
    const sv = s.a.x === s.b.x, tv = t.a.x === t.b.x;
    if (sv === tv) {
      if (sv ? s.a.x !== t.a.x : s.a.y !== t.a.y) return false;
      const [s0, s1] = sv ? [Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y)] : [Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x)];
      const [t0, t1] = sv ? [Math.min(t.a.y, t.b.y), Math.max(t.a.y, t.b.y)] : [Math.min(t.a.x, t.b.x), Math.max(t.a.x, t.b.x)];
      return s0 <= t1 && t0 <= s1;
    }
    // perpendicular: only a crossing of interiors is allowed
    return [s.a, s.b].some(p => onSegment(p, t.a, t.b)) || [t.a, t.b].some(p => onSegment(p, s.a, s.b));
  };
  const routeOk = (pts, net, target) => {
    const mine = [];
    for (let i = 0; i + 1 < pts.length; i++) if (pts[i].x !== pts[i + 1].x || pts[i].y !== pts[i + 1].y) mine.push({ a: pts[i], b: pts[i + 1] });
    for (const s of mine) {
      for (const t of segs) if (t.net !== net && segClash(s, t)) return false;
      for (const S of syms) {
        const bx = S.box;
        // through a symbol body
        const x0 = Math.min(s.a.x, s.b.x), x1 = Math.max(s.a.x, s.b.x), y0 = Math.min(s.a.y, s.b.y), y1 = Math.max(s.a.y, s.b.y);
        if (x0 < bx.x + bx.w && x1 > bx.x && y0 < bx.y + bx.h && y1 > bx.y && !(y0 === y1 && (y0 === bx.y || y0 === bx.y + bx.h)) && !(x0 === x1 && (x0 === bx.x || x0 === bx.x + bx.w))) return false;
        for (const p of S.pins) if (!(p.x === target.x && p.y === target.y) && p.net !== net && onSegment(p, s.a, s.b)) return false;
      }
    }
    return true;
  };
  // ---- ports and rails
  const railNet = (v, neg) => `${neg ? '~' : ''}${v}`;
  const usedNames = new Set([...tt.inputs, ...tt.outputs].map(s => s.toLowerCase()));
  const uniqueName = base => { let nm = base, k = 1; while (usedNames.has(nm.toLowerCase())) nm = `${base}_${++k}`; usedNames.add(nm.toLowerCase()); return nm; };
  const railX = (v, neg) => (neg ? xC(v) : xT(v));
  const railTop = (v, neg) => (neg ? yInv + invH : portY(v));
  tt.inputs.forEach((name, j) => {
    const yj = portY(j);
    doc.ports.push({ id: `P${++pid}`, name, dir: 'in', width: 1, x: PX, y: yj });
    const u = used.get(j) || { pos: false, neg: false };
    const net = railNet(j, false);
    if (u.neg) {
      const xin = only ? xC(j) - 10 : xC(j);
      addWire([{ x: PX, y: yj }, { x: xin, y: yj }, { x: xin, y: yInv }], net);
      const inv = only ? addSym(`${only}2`, xC(j) - 20, yInv, 90) : addSym('inv', xC(j) - 10, yInv, 90);
      inv.pins.forEach(p => { p.net = p.dir === 'out' ? railNet(j, true) : net; });
      if (only) addWire([{ x: xC(j) - 10, y: yInv }, { x: xC(j) + 10, y: yInv }], net);
      addWire([{ x: xC(j), y: yInv + invH }, { x: xC(j), y: yBottom }], railNet(j, true));
      if (u.pos) addWire([{ x: xT(j), y: yj }, { x: xT(j), y: yBottom }], net);
    } else if (u.pos) addWire([{ x: PX, y: yj }, { x: xT(j), y: yj }, { x: xT(j), y: yBottom }], net);
    else addWire([{ x: PX, y: yj }, { x: PX + 20, y: yj }], net);
  });
  // ---- gates (all placed before routing so that wires avoid them)
  const placeGates = g => {
    if (g.leaf != null) return;
    g.sym = addSym(gateType(g), colX[g.level], g.gy);
    g.net = `g${g.sym.s.id}`;
    g.sym.pins.forEach(p => { p.net = p.dir === 'out' ? g.net : `in:${g.sym.s.id}/${p.name}`; });
    g.kids.forEach(placeGates);
  };
  for (const tr of trees) if (tr.t.const == null) placeGates(tr.t);
  // ---- connections
  let fallbacks = 0;
  const connect = (from, net, to, col) => {
    // straight, else a dogleg through a free channel of the gap before column `col`
    const tgt = { x: to.x, y: to.y };
    const tries = [];
    if (from.y === to.y) tries.push([from, to]);
    const gx0 = col === 1 ? Math.max(from.x, railsEnd - 40) : colX[col - 1] + GATE_W;
    const lo = Math.max(from.x, gx0) + 20, hi = to.x - 20;
    const xs = [];
    for (let x = hi; x >= lo; x -= 10) xs.push(x);
    // channels for wires going down: far ones first, up: near ones first (fewer crossings)
    if (from.y > to.y) xs.reverse();
    for (const x of xs) tries.push([from, { x, y: from.y }, { x, y: to.y }, to]);
    for (const pts of tries) {
      if (routeOk(pts, net, tgt)) { addWire(pts, net); return; }
    }
    // no free route: net name labels at both ends
    fallbacks++;
    let lname = labelNames.get(net);
    if (!lname) { lname = uniqueName(net.startsWith('~') ? `${tt.inputs[+net.slice(1)]}_n` : /^\d/.test(net) ? tt.inputs[+net] : `n_${net.slice(1)}`); labelNames.set(net, lname); }
    if (!labelled.has(net)) {
      labelled.add(net);
      if (from.leafRail) doc.labels.push({ id: `L${++lid}`, x: from.x, y: from.leafRail, net: lname });
      else { addWire([from, { x: from.x + 20, y: from.y }], net); doc.labels.push({ id: `L${++lid}`, x: from.x + 20, y: from.y, net: lname }); }
    }
    addWire([{ x: to.x - 20, y: to.y }, to], net);
    doc.labels.push({ id: `L${++lid}`, x: to.x - 20, y: to.y, net: lname });
  };
  const labelNames = new Map(), labelled = new Set();
  const wireGate = g => {
    if (g.leaf != null) return;
    const ins = g.sym.pins.filter(p => p.dir === 'in').sort((a, b) => a.y - b.y);
    g.kids.forEach((k, i) => {
      const pin = ins[i];
      if (k.leaf != null) {
        const from = { x: railX(k.leaf, k.neg), y: k.y, leafRail: railTop(k.leaf, k.neg) + 10 };
        connect(from, railNet(k.leaf, k.neg), pin, g.level);
      } else {
        wireGate(k);
        const out = pinOf(k.sym, 'O');
        connect({ x: out.x, y: out.y }, k.net, pin, g.level);
      }
    });
    if (one(g)) { const [a, b] = ins; addWire([{ x: a.x, y: a.y }, { x: b.x, y: b.y }], g.kids[0].leaf != null ? railNet(g.kids[0].leaf, g.kids[0].neg) : g.kids[0].net); }
  };
  for (const tr of trees) {
    if (tr.t.const != null) {
      const yy = tr.top + 10;
      const c = addSym('constant', xOut - 100, tr.top, 0, { value: String(tr.t.const) });
      const p = pinOf(c, 'O');
      addWire([{ x: p.x, y: p.y }, { x: xOut, y: p.y }], `c${tr.o}`);
      doc.ports.push({ id: `P${++pid}`, name: tr.o, dir: 'out', width: 1, x: xOut, y: yy });
      continue;
    }
    wireGate(tr.t);
    const out = pinOf(tr.t.sym, 'O');
    addWire([{ x: out.x, y: out.y }, { x: xOut, y: out.y }], tr.t.net);
    doc.ports.push({ id: `P${++pid}`, name: tr.o, dir: 'out', width: 1, x: xOut, y: out.y });
  }
  const maxX = Math.max(xOut + 140, ...syms.map(S => S.box.x + S.box.w + 40));
  doc.sheet = { w: Math.max(1100, Math.ceil(maxX / 100) * 100), h: Math.max(800, Math.ceil((yBottom + 60) / 100) * 100) };
  doc.fallbacks = fallbacks;
  // the branches of the nets as wire ends, where they connect (#678)
  joinOnWires(doc);
  return doc;
}

/** netlist() errors of a document (for tests and the UI). */
export function schematicErrors(doc) {
  return netlist(doc).diagnostics.filter(d => d.severity === 'error');
}
