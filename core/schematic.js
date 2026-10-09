// Schematic extraction: turns an elaborated instance into a graph of symbols and nets.
// Output is layout-independent; the UI lays it out with ELK.
//
//  { id, title, module, lang, file,
//    nodes: [{ id, kind, label, sub, gate?, ports: [{ id, side:'W'|'E', label, w, clock? }], ref }],
//    edges: [{ id, from:{node,port}, to:{node,port}, label, w, net }] }
//
// node kinds: in, out, inout (top-level ports), inst (child instance), gate (operator from an
// expression), reg (clocked process), comb (combinational process/always), const, blackbox
import * as V from './values.js';

const GATE_OF = {
  '&': 'and', '|': 'or', '^': 'xor', '~^': 'xnor', nand: 'nand', nor: 'nor',
  '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '%': 'mod', mod: 'mod', rem: 'mod', '**': 'pow',
  '==': 'eq', '!=': 'ne', '===': 'eq', '!==': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge',
  '<<': 'shl', '>>': 'shr', '<<<': 'shl', '>>>': 'sra', rol: 'rol', ror: 'ror', '&&': 'and', '||': 'or',
};
const GATE_LABEL = {
  add: '+', sub: '−', mul: '×', div: '÷', mod: 'mod', pow: '**', eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥',
  shl: '<<', shr: '>>', sra: '>>>', rol: 'rol', ror: 'ror',
};
const MAX_GATES = 24;

function countOps(n) {
  if (!n || typeof n !== 'object') return 0;
  switch (n.k) {
    case 'c': case 'sig': case 'loc': return 0;
    case 'bit': case 'slice': case 'dslice': case 'pslice': case 'elem':
      return n.base.k === 'sig' && (n.k === 'slice' || (n.index && n.index.k === 'c')) ? 0 : 1 + countOps(n.base) + countOps(n.index || n.start || n.left);
    case 'un': return 1 + countOps(n.a);
    case 'bin': return 1 + countOps(n.a) + countOps(n.b);
    case 'cond': return 1 + countOps(n.c) + countOps(n.a) + countOps(n.b);
    case 'cat': return 1 + n.parts.reduce((s, p) => s + countOps(p), 0);
    case 'conv': return countOps(n.a);
    default: return 1;
  }
}

function sigLabelOf(n) {
  // textual label for simple selections of a signal
  if (n.k === 'sig') return null;
  const nm = n.base?.sig?.name.split('.').pop();
  if (n.k === 'slice') {
    const t = n.base.t, hiPos = n.lo + n.t.w - 1;
    const idx = p => (t.desc ? p + t.right : t.right - p);
    return `${nm}[${idx(hiPos)}:${idx(n.lo)}]`;
  }
  if (n.k === 'bit' && n.index.k === 'c') return `${nm}[${V.toDec(n.index.val, true)}]`;
  return null;
}

function constText(v, t) {
  if (v.str !== undefined) return JSON.stringify(v.str);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (t && t.kind === 'enum') return t.names[Number(v.v)] ?? V.toDec(v);
  if (t && (t.kind === 'int' || t.kind === 'bool')) return t.kind === 'bool' ? (v.v ? 'true' : 'false') : V.toDec(v, true);
  if (v.w <= 4) return `'${V.toBin(v)}'`;
  return `0x${V.toHex(v)}`;
}

export function processTitle(p) {
  const it = p.item;
  if (p.lang === 'vhdl') {
    if (p.sens === 'all') return 'process(all)';
    if (Array.isArray(p.sens)) return `process(${p.triggers.map(t => t.sig.name.split('.').pop()).join(', ')})`;
    return 'process';
  }
  if (p.mode === 'initial') return 'initial';
  if (p.sens === 'all' || (it && it.sens === 'all')) return 'always @*';
  if (Array.isArray(p.sens)) return `always @(${p.sens.map((s, i) => (s.edge === 'pos' ? 'posedge ' : s.edge === 'neg' ? 'negedge ' : '') + (p.triggers[i]?.sig.name.split('.').pop() ?? '?')).join(', ')})`;
  return 'always';
}

// Find clock signals of a process: edge triggers (Verilog) or rising_edge()/'event (VHDL).
/**
 * Signals used as the gate (enable) of inferred latches: in a process with no clock edge, an
 * `if` that assigns a signal in one branch but not in the other keeps its value (a latch) and the
 * signals of its condition are the gate; likewise `q <= d when g = '1' [else q]`. Instances of
 * the LD* primitives give their G input. Synthesis puts such gates on clock resources.
 */
export function latchGates(design) {
  const gates = new Set();
  const sigsIn = (n, out = new Set()) => {
    if (!n || typeof n !== 'object') return out;
    if (Array.isArray(n)) { n.forEach(x => sigsIn(x, out)); return out; }
    if (n.k === 'sig' && n.sig) out.add(n.sig);
    for (const key in n) if (!['sig', 't', 'fn', 'val', 'loc', 'triggers'].includes(key)) { const v = n[key]; if (v && typeof v === 'object') sigsIn(v, out); }
    return out;
  };
  const targetOf = (t) => { while (t && t.k !== 'sig') t = t.a || t.target || t.base; return t?.sig || null; };
  // flow through a combinational body: `done` = targets definitely assigned so far; a target
  // assigned on some paths of an if / case but not all (and not before it) is a latch
  const inter = (sets) => new Set([...sets[0]].filter(x => sets.every(st => st.has(x))));
  const latchIf = (cond, branches, done) => {
    const after = branches.map(b => flow(b, new Set(done)));
    const all = new Set(after.flatMap(a => [...a]));
    const definite = inter(after);
    if ([...all].some(x => !definite.has(x) && !done.has(x))) for (const sg of sigsIn(cond)) gates.add(sg);
    return definite;
  };
  const flow = (n, done) => {
    if (!n || typeof n !== 'object') return done;
    if (Array.isArray(n)) { for (const x of n) done = flow(x, done); return done; }
    switch (n.k) {
      case 'blk': return flow(n.stmts, done);
      case 'asg': {
        const t = targetOf(n.target);
        if (n.value?.k === 'cond') {   // q <= d when g = '1' [else ... q]: the target keeps its value
          let v = n.value;
          while (v?.k === 'cond') { if (!done.has(t) && (targetOf(v.b) === t || targetOf(v.a) === t)) for (const sg of sigsIn(v.c)) gates.add(sg); v = v.b; }
        }
        if (t) done.add(t);
        return done;
      }
      case 'if': return latchIf(n.c, [n.then, n.else], done);
      case 'case': return n.def ? latchIf(n.sel, [...n.items.map(it => it.body), n.def], done) : done;   // without others: coverage unknown, not flagged
      default: return done;
    }
  };
  const walk = (body) => flow(body, new Set());
  const visit = (inst) => {
    if (/^LD/i.test(inst.mod?.name || '')) { const g = inst.ports?.find(p => p.name.toUpperCase() === 'G'); if (g) gates.add(g.sig); }
    for (const pr of inst.procs || []) if (!clocksOf(pr).clocks.size) walk(pr.body);
    (inst.children || []).forEach(visit);
  };
  visit(design.top);
  return gates;
}

export function clocksOf(p) {
  const clocks = new Set();
  for (const t of p.triggers || []) if (t.edge !== 'any') clocks.add(t.sig);
  const visit = n => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(visit); return; }
    if ((n.k === 'edge' || n.k === 'event') && n.sig) clocks.add(n.sig);
    for (const key in n) if (!['sig', 't', 'fn', 'val', 'loc', 'triggers'].includes(key)) { const v = n[key]; if (v && typeof v === 'object') visit(v); }
  };
  if (!clocks.size || p.lang === 'vhdl') visit(p.body);
  // async resets in Verilog sensitivity lists are edge-triggered too: the clock is the edge
  // signal that is not tested as a plain condition at the top of the body.
  if (p.lang === 'verilog' && clocks.size > 1) {
    const tested = new Set();
    let s = p.body;
    while (s && s.k === 'blk' && s.stmts.length === 1) s = s.stmts[0];
    while (s && s.k === 'if') {
      const c = s.c;
      const sig = c.k === 'sig' ? c.sig : (c.k === 'un' && c.a.k === 'sig' ? c.a.sig : (c.k === 'bin' && c.a.k === 'sig' ? c.a.sig : null));
      if (sig) tested.add(sig);
      s = s.else;
      while (s && s.k === 'blk' && s.stmts.length === 1) s = s.stmts[0];
    }
    const remaining = [...clocks].filter(c => !tested.has(c));
    if (remaining.length) return { clocks: new Set(remaining), resets: new Set([...clocks].filter(c => tested.has(c))) };
  }
  if (p.lang === 'vhdl' && clocks.size) {
    // process (clk, rst): if rst = '1' then ... elsif rising_edge(clk) -> rst is an async reset
    let s = p.body;
    while (s && s.k === 'blk' && s.stmts.length === 1) s = s.stmts[0];
    const resets = new Set();
    const sens = new Set((p.triggers || []).map(t => t.sig));
    while (s && s.k === 'if') {
      const c = s.c;
      const sig = c.k === 'sig' ? c.sig : (c.k === 'bin' && c.a.k === 'sig' ? c.a.sig : null);
      if (sig && sens.has(sig) && !clocks.has(sig)) resets.add(sig);
      s = s.else;
      while (s && s.k === 'blk' && s.stmts.length === 1) s = s.stmts[0];
    }
    return { clocks, resets };
  }
  return { clocks, resets: new Set() };
}

// Assignment target -> { sig, label } for whole signals and constant bit/slice selections.
function targetOf(L) {
  if (L.k === 'sig') return { sig: L.sig, label: null };
  if ((L.k === 'bit' || L.k === 'slice') && L.base.k === 'sig') {
    const lbl = sigLabelOf(L);
    if (lbl) return { sig: L.base.sig, label: lbl };
  }
  return null;
}

export function buildSchematic(inst) {
  const nodes = [], edges = [];
  const nets = new Map(); // sig -> { drivers: [ep], sinks: [{ep,label}] }
  const net = sig => { let n = nets.get(sig); if (!n) nets.set(sig, n = { drivers: [], sinks: [] }); return n; };
  let uid = 0;
  const nid = p => `${p}${uid++}`;

  // ---- ports
  const portNode = new Map();
  for (const p of inst.ports) {
    const id = nid('port');
    const kind = p.dir === 'in' ? 'in' : p.dir === 'out' ? 'out' : 'inout';
    nodes.push({ id, kind, label: p.name, sub: p.t.w > 1 ? `[${p.t.w}]` : '', w: p.t.w,
      ports: [{ id: 'p', side: kind === 'in' ? 'E' : 'W', label: '', w: p.t.w }], ref: { sig: p.sig.path } });
    portNode.set(p.name, id);
    if (kind === 'in') net(p.sig).drivers.push({ node: id, port: 'p' });
    else if (kind === 'out') net(p.sig).sinks.push({ ep: { node: id, port: 'p' } });
    else { net(p.sig).drivers.push({ node: id, port: 'p' }); }
  }

  // ---- expression -> gates
  const consts = new Map();
  function source(n) {
    switch (n.k) {
      case 'sig': return { sig: n.sig };
      case 'bit': case 'slice': {
        const lbl = sigLabelOf(n);
        if (lbl && n.base.k === 'sig') return { sig: n.base.sig, label: lbl, w: n.t.w };
        break;
      }
      case 'conv': return source(n.a);
      case 'c': {
        const txt = constText(n.val, n.t);
        const id = nid('const');
        nodes.push({ id, kind: 'const', label: txt, ports: [{ id: 'o', side: 'E', label: '', w: n.t.w }] });
        return { ep: { node: id, port: 'o' }, w: n.t.w };
      }
    }
    let gate, ins = [], label = '';
    if (n.k === 'bin') { gate = GATE_OF[n.o] || 'op'; ins = [n.a, n.b]; label = GATE_LABEL[gate] || n.o; }
    else if (n.k === 'un') {
      if (n.o === '~' || n.o === '!') gate = 'not';
      else if (n.o === '-') { gate = 'neg'; label = '−'; }
      else { gate = { '&': 'and', '|': 'or', '^': 'xor', '~&': 'nand', '~|': 'nor', '~^': 'xnor' }[n.o] || 'op'; label = 'reduce'; }
      ins = [n.a];
    } else if (n.k === 'cond') { gate = 'mux'; ins = [n.b, n.a, n.c]; }
    else if (n.k === 'cat') { gate = 'concat'; ins = n.parts; label = '{ }'; }
    else if (n.k === 'repl') { gate = 'concat'; ins = [n.a]; label = `{${V.toDec(n.count.val)}{}}`; }
    else if (n.k === 'bit' || n.k === 'slice' || n.k === 'dslice' || n.k === 'pslice' || n.k === 'elem') {
      gate = 'select'; ins = [n.base, n.index || n.start || n.left].filter(Boolean); label = n.k === 'elem' ? 'mem[ ]' : '[ ]';
    } else if (n.k === 'call') { gate = 'fn'; ins = n.args; label = `${n.fn.name}()`; }
    else if (n.k === 'edge') { gate = 'fn'; ins = [{ k: 'sig', sig: n.sig, t: n.sig.t }]; label = n.pos ? 'rising_edge' : 'falling_edge'; }
    else { gate = 'fn'; ins = []; label = n.k; }
    const id = nid('g');
    const ports = ins.map((x, i) => ({ id: `i${i}`, side: 'W', label: gate === 'mux' ? (i === 2 ? 'S' : String(i)) : '', w: x.t?.w || 1, sel: gate === 'mux' && i === 2 }));
    ports.push({ id: 'o', side: 'E', label: '', w: n.t.w });
    nodes.push({ id, kind: 'gate', gate, label, ports, w: n.t.w });
    ins.forEach((x, i) => connect(source(x), { node: id, port: `i${i}` }));
    return { ep: { node: id, port: 'o' }, w: n.t.w };
  }
  function connect(src, dst) {
    if (src.sig) net(src.sig).sinks.push({ ep: dst, label: src.label, w: src.w });
    else edges.push({ id: nid('e'), from: src.ep, to: dst, w: src.w || 1, label: '' });
  }

  // ---- processes
  for (const p of inst.procs) {
    if (p.kind === 'glue') continue;
    const ref = { proc: p.id, file: p.file, line: p.loc?.line };
    const tgt = p.kind === 'assign' ? targetOf(p.body.target) : null;
    if (tgt && countOps(p.body.value) <= MAX_GATES) {
      const tsig = tgt.sig, tw = p.body.target.t.w;
      const src = source(p.body.value);
      if (src.sig) {
        // plain wire assignment: draw a buffer so both names stay visible
        const id = nid('g');
        nodes.push({ id, kind: 'gate', gate: 'buf', label: '', ports: [{ id: 'i0', side: 'W', w: tw }, { id: 'o', side: 'E', w: tw }], ref, w: tw });
        connect(src, { node: id, port: 'i0' });
        net(tsig).drivers.push({ node: id, port: 'o', label: tgt.label, w: tw });
      } else {
        const g = nodes.find(n => n.id === src.ep.node);
        if (g) g.ref = ref;
        net(tsig).drivers.push({ ...src.ep, label: tgt.label, w: tw });
      }
      continue;
    }
    // block symbol for processes and complex assigns
    const { clocks, resets } = p.kind === 'process' ? clocksOf(p) : { clocks: new Set(), resets: new Set() };
    const clocked = clocks.size > 0;
    const inputs = [...p.reads].filter(s => !clocks.has(s) && !resets.has(s));
    const outputs = [...p.writes];
    const id = nid(clocked ? 'reg' : 'comb');
    const ports = [];
    [...clocks].forEach((s, i) => ports.push({ id: `c${i}`, side: 'W', label: s.name.split('.').pop(), w: 1, clock: true }));
    [...resets].forEach((s, i) => ports.push({ id: `r${i}`, side: 'W', label: s.name.split('.').pop(), w: 1, reset: true }));
    inputs.forEach((s, i) => ports.push({ id: `i${i}`, side: 'W', label: s.name.split('.').pop(), w: s.t.w }));
    outputs.forEach((s, i) => ports.push({ id: `o${i}`, side: 'E', label: s.name.split('.').pop(), w: s.t.w }));
    const title = p.kind === 'assign' ? 'assign' : (p.item?.label || processTitle(p));
    nodes.push({ id, kind: p.mode === 'initial' || p.mode === 'loop' ? 'tb' : (clocked ? 'reg' : 'comb'), label: title, sub: p.kind === 'assign' ? 'logic' : processTitle(p), ports, ref });
    [...clocks].forEach((s, i) => net(s).sinks.push({ ep: { node: id, port: `c${i}` } }));
    [...resets].forEach((s, i) => net(s).sinks.push({ ep: { node: id, port: `r${i}` } }));
    inputs.forEach((s, i) => net(s).sinks.push({ ep: { node: id, port: `i${i}` } }));
    outputs.forEach((s, i) => net(s).drivers.push({ node: id, port: `o${i}` }));
  }

  // ---- child instances
  for (const c of inst.children) {
    const id = nid('inst');
    const ports = [];
    const info = c.connInfo || [];
    info.forEach((ci, i) => {
      const side = ci.dir === 'out' ? 'E' : 'W';
      ports.push({ id: `p${i}`, side, label: ci.port, w: ci.t?.w || 1, conn: ci.text });
    });
    nodes.push({
      id, kind: c.blackbox ? 'blackbox' : 'inst', label: c.name, sub: c.module, ports,
      ref: { inst: c.path, file: c.instFile || c.file, line: c.loc?.line },
      params: (c.params || []).map(p => `${p.name}=${constText(p.value, p.t)}`),
    });
    info.forEach((ci, i) => {
      const ep = { node: id, port: `p${i}` };
      if (ci.dir === 'out' || ci.dir === 'inout') {
        for (const s of ci.writes || []) net(s).drivers.push(ep);
        if (ci.dir === 'inout') for (const s of ci.reads || []) net(s).sinks.push({ ep });
      } else if (ci.node) {
        if (ci.node.k === 'c') connect(source(ci.node), ep);
        else if (ci.reads.size === 1 && (ci.node.k === 'sig' || sigLabelOf(ci.node))) net([...ci.reads][0]).sinks.push({ ep, label: sigLabelOf(ci.node) });
        else if (countOps(ci.node) <= MAX_GATES) connect(source(ci.node), ep);
        else for (const s of ci.reads) net(s).sinks.push({ ep });
      }
    });
  }

  // ---- nets -> edges
  for (const [sig, n] of nets) {
    // inout pads also receive the value when something inside drives the net
    const pads = n.drivers.filter(d => nodes.find(x => x.id === d.node)?.kind === 'inout');
    if (pads.length && n.drivers.length > pads.length) {
      n.drivers = n.drivers.filter(d => !pads.includes(d));
      for (const p of pads) n.sinks.push({ ep: { node: p.node, port: p.port } });
    }
    if (!n.sinks.length) continue;
    const name = sig.name.split('.').pop();
    let drivers = n.drivers;
    if (!drivers.length) {
      // undriven (or driven from outside the current view): draw a net label stub
      const id = nid('net');
      nodes.push({ id, kind: 'netlabel', label: name, ports: [{ id: 'o', side: 'E', w: sig.t.w }], ref: { sig: sig.path } });
      drivers = [{ node: id, port: 'o' }];
    }
    let drv = drivers[0];
    if (drivers.length > 1 || (drivers[0].label && drivers[0].w < sig.t.w)) {
      // several partial drivers: merge them with a bus joiner
      const id = nid('join');
      const ports = drivers.map((d, i) => ({ id: `i${i}`, side: 'W', label: d.label ? d.label.replace(/^[^[]*/, '') : '', w: d.w || sig.t.w }));
      ports.push({ id: 'o', side: 'E', label: '', w: sig.t.w });
      nodes.push({ id, kind: 'gate', gate: 'concat', label: name, ports, w: sig.t.w, ref: { sig: sig.path } });
      drivers.forEach((d, i) => edges.push({ id: nid('e'), from: { node: d.node, port: d.port }, to: { node: id, port: `i${i}` }, w: d.w || sig.t.w, label: d.label || name, net: sig.path }));
      drv = { node: id, port: 'o' };
    }
    for (const s of n.sinks) {
      edges.push({ id: nid('e'), from: { node: drv.node, port: drv.port }, to: s.ep, w: s.w || sig.t.w, label: s.label || name, net: sig.path });
    }
  }
  return {
    id: inst.path, title: `${inst.name} : ${inst.module}`, module: inst.module, lang: inst.lang, file: inst.file,
    nodes, edges,
  };
}

// The black-box symbol of a module (for the "symbol" view and hierarchy previews).
export function buildSymbol(inst) {
  return {
    module: inst.module,
    inputs: inst.ports.filter(p => p.dir !== 'out').map(p => ({ name: p.name, w: p.t.w, dir: p.dir })),
    outputs: inst.ports.filter(p => p.dir === 'out').map(p => ({ name: p.name, w: p.t.w, dir: p.dir })),
    params: inst.params.map(p => `${p.name}=${constText(p.value, p.t)}`),
  };
}
