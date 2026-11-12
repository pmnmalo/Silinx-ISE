// Silinx - ASM (Algorithmic State Machine) chart model, validation and HDL generators.
//
// Isomorphic ES module: no DOM and no Node APIs, usable from the browser editor and from
// server/CLI code alike.
//
// Model (saved as <name>.asm.json):
//
//   {
//     version: 1, name: 'traffic_fsm', lang: 'vhdl' | 'verilog',
//     clock: 'clk', reset: { name: 'rst', active: 'high' | 'low', sync: false },
//     encoding: 'binary' | 'onehot' | 'gray' | 'enum',
//     generics:  [{ name: 'DEBOUNCE', default: 1000000 }],          (optional)
//     inputs:    [{ name: 'go', width: 1, sync?: true }],
//     outputs:   [{ name: 'busy', width: 1, default: '0', registered: false }],
//     registers: [{ name: 'cnt', width: 8, init: '0' }],              (optional)
//     nodes: [
//       { id, type: 'state',    name: 'IDLE', x, y, actions: ['busy = 1'] },
//       { id, type: 'decision', x, y, cond: 'go', flip?: bool },
//       { id, type: 'case',     x, y, expr: 'opcode' },        (multi-way decision box)
//       { id, type: 'output',   x, y, actions: ['ld = 1'] },
//       { id, type: 'always',   name: 'divider', x, y, actions: ['tc = 0'] },
//     ],
//     edges: [{ id, from, to, port: 'next' | 'true' | 'false' | <case choice>, points?: [{x,y}] }],
//     initial: '<state node id>'
//   }
//
// Node x/y are the CENTRE of the node in chart coordinates.
//
// Expression syntax (conditions and the right-hand side of actions):
//   identifiers, literals: 10, 4'b1010, 8'hFF, 4'd3, "1010", '1', 0x1F, 0b101, true, false
//   operators (C/Verilog precedence): || && | ^ & == != < > <= >= << >> + - ! ~ ( )
//   aliases: and, or, xor, not; in conditions a single '=' and '/=' mean '==' / '!='.
//   Widths follow the Verilog rules (the VHDL is generated to match them): + - & | ^ ~ and the
//   left operand of << >> are evaluated at the width of their context (the assignment target,
//   or the wider side of a comparison); unsized literals and generics are 32 bits wide; the
//   shift amount is self-determined.
// Actions:  `target = expr` (also `<=` / `:=`), or just `target` meaning `target = 1`.
//
// Case (multi-way decision) boxes: `expr` is an input, register or registered output (or a bit
// slice of one); every exit is labelled with the value(s) it is taken for: a binary number with
// as many digits as the expression has bits ("00100"), any literal (4, 5'b00100, 0x4, "00100"),
// several values separated by | or , ("0|1"), or `others` for every remaining value. Without an
// `others` exit the labels must cover every value. Generated as a VHDL case / Verilog case
// statement. Case boxes are allowed in state blocks (not in every-cycle blocks).
//
// Output semantics:
//   registered: false -> combinational output, takes `default` unless assigned in the
//                        current state (Moore) or on the current path (Mealy).
//   registered: true  -> output driven by a register `<name>_reg` (reset value = default).
//                        Assignments compute its next value, which is loaded at the clock
//                        edge (ASMD register-transfer semantics); when not assigned it holds.
//                        Registered outputs may be read in conditions/expressions
//                        (e.g. `cnt = cnt + 1`, decision `cnt == 9`).
//
// Data path (all optional, so that a small controller + data path is a single chart):
//   generics   integer VHDL generics / Verilog parameters (non-negative), usable in any
//              expression (not in widths); they cannot be assigned.
//   registers  internal registers (signal `<name>`, next value `<name>_next`): readable in
//              any condition/expression and assignable in actions with the same ASMD
//              semantics as registered outputs (loaded at the clock edge, hold when not
//              assigned, reset to `init`).
//   inputs[].sync  the input goes through a 2-flip-flop synchroniser (`<name>_meta`,
//              `<name>_sync`, reset to 0); conditions and expressions see the synchronised
//              value (2 clock cycles late).
//   'always' nodes ("every cycle" blocks): header box (name + unconditional actions) whose
//              exit leads to a tree of decision and conditional output boxes that is evaluated
//              on EVERY clock cycle, in parallel with the state machine (like an extra process).
//              Its paths end without a next state: leave the last exits unconnected. Paths of a
//              block may join again (a box with several incoming connections), they may not
//              loop or reach a state, and no connection may enter the header. Several blocks
//              are allowed; they may not assign the same target. Actions may assign registers,
//              registered outputs (next value) and combinational outputs (Mealy-like, this
//              cycle). Priority: the assignments of the current state's block (Moore and path
//              actions) override those of every-cycle blocks for the same target in the same
//              cycle (the generated code assigns the defaults, then the every-cycle blocks, then
//              the state logic, in one combinational process).

export const ASM_VERSION = 1;
export const ENCODINGS = ['binary', 'gray', 'onehot', 'enum'];
import { VHDL93_WORDS, VERILOG_WORDS, reservedError } from './reserved.js';
import {
  vhAssign, vhBool, vhExpr, vhLitW, vhNot, vhTruth, vlAssign, vlExpr, vlLitW, vlNot
} from './asm-emit.js';
import {
  exprToString, parseAction, parseCondition
} from './asm-expr.js';
import { mountGraphChecks } from './asm-graph.js';
export {
  exprToString, parseAction, parseCondition
};
export {
  vhAssign, vhBool, vhExpr, vhLitW, vhNot, vhTruth, vlAssign, vlExpr, vlLitW, vlNot
};

// the generators (#405: asm-gen.js), still exported from here
export { extractAlwaysBlocks, asmJoinPoints, generateVerilog, generateVhdl, generate } from './asm-gen.js';

export const LANGS = ['vhdl', 'verilog'];

// ---------------------------------------------------------------------------------------
// Reserved words
// ---------------------------------------------------------------------------------------

// (the shared lists, core/reserved.js, #679): the words that break the generated HDL (Verilog's as
// written, the SystemVerilog types students meet; VHDL's in any case) are errors, the other reserved
// words (another letter case, SystemVerilog's) warnings (reservedWarning)
const VERILOG_RESERVED = new Set([...VERILOG_WORDS, ...'logic bit byte int shortint longint'.split(' ')]);

const VHDL_RESERVED = new Set([...VHDL93_WORDS,
  // names that would clash with the standard packages we use
  ...('std_logic std_logic_vector std_ulogic unsigned signed integer natural boolean bit ' +
  'rising_edge falling_edge resize to_unsigned ieee std work numeric_std').split(' ')]);

/** True if `s` is a portable identifier (valid in both Verilog and VHDL). */
export function isIdentifier(s) {
  return typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(s) && !s.includes('__') && !s.endsWith('_');
}

export function reservedIn(s) {
  const out = [];
  if (VERILOG_RESERVED.has(s)) out.push('Verilog');
  if (VHDL_RESERVED.has(s.toLowerCase())) out.push('VHDL');
  return out;
}

/** A name the generated HDL accepts but that is a reserved word of VHDL or Verilog in some letter case
 *  (#679; SystemVerilog's own words are only refused for a new name): the warning `'Wire' is a reserved word of Verilog: rename it`, or null. */
export function reservedWarning(s) {
  if (reservedIn(s).length) return null;
  const e = reservedError(s, { sv: false });
  return e && `${e}: rename it`;
}

// ---------------------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------------------

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export function normPort(port, type) {
  if (type === 'case') {
    const t = String(port ?? '').trim();
    return !t || /^(others|default)$/i.test(t) ? 'others' : t;
  }
  const p = String(port ?? '').toLowerCase();
  if (type === 'decision') {
    if (p === 'true' || p === '1' || p === 't' || p === 'yes') return 'true';
    if (p === 'false' || p === '0' || p === 'f' || p === 'no') return 'false';
    return p || 'true';
  }
  return p === '' ? 'next' : p;
}

const NODE_TYPES = ['state', 'decision', 'case', 'output', 'always'];

/** Generic values are integers; keep anything else as text so that validation can report it. */
function genericValue(v) {
  if (typeof v === 'number') return v;
  const t = String(v ?? '').trim().replace(/_/g, '');
  return /^\d+$/.test(t) ? Number(t) : String(v ?? '');
}

function normActions(a) {
  if (typeof a === 'string') a = a.split(/\r?\n/);
  return arr(a).map((s) => String(s).trim()).filter((s) => s !== '');
}

/** Return a cleaned deep copy of `m` with every field present (does not validate). */
export function normalizeModel(m) {
  const src = m && typeof m === 'object' ? m : {};
  const rs = typeof src.reset === 'string' ? { name: src.reset } : (src.reset || {});
  const nodes = arr(src.nodes).map((n, i) => {
    const type = NODE_TYPES.includes(n?.type) ? n.type : 'state';
    const o = { id: String(n?.id ?? `n${i + 1}`), type, x: num(n?.x), y: num(n?.y) };
    if (type === 'state' || type === 'always') { o.name = String(n?.name ?? ''); o.actions = normActions(n?.actions); }
    if (type === 'decision') { o.cond = String(n?.cond ?? ''); if (n?.flip) o.flip = true; }
    if (type === 'case') o.expr = String(n?.expr ?? '');
    if (type === 'output') o.actions = normActions(n?.actions);
    if (n?.comment) o.comment = String(n.comment);
    return o;
  });
  const types = new Map(nodes.map((n) => [n.id, n.type]));
  const edges = arr(src.edges).map((e, i) => {
    const o = { id: String(e?.id ?? `e${i + 1}`), from: String(e?.from ?? ''), to: String(e?.to ?? ''),
      port: normPort(e?.port, types.get(String(e?.from ?? ''))) };
    if (Array.isArray(e?.points) && e.points.length) o.points = e.points.map((p) => ({ x: num(p.x), y: num(p.y) }));
    return o;
  });
  const out = {
    version: ASM_VERSION,
    name: String(src.name ?? 'fsm'),
    lang: src.lang === 'verilog' ? 'verilog' : 'vhdl',
    clock: String(src.clock || 'clk'),
    reset: { name: String(rs.name || 'rst'), active: rs.active === 'low' ? 'low' : 'high', sync: !!rs.sync },
    encoding: ENCODINGS.includes(src.encoding) ? src.encoding : 'binary',
    ...(arr(src.generics).length ? { generics: arr(src.generics).map((g) => ({ name: String(g?.name ?? ''), default: genericValue(g?.default) })) } : {}),
    inputs: arr(src.inputs).map((p) => {
      const o = { name: String(p?.name ?? ''), width: num(p?.width, 1) };
      if (p?.sync) o.sync = true;
      return o;
    }),
    outputs: arr(src.outputs).map((p) => ({
      name: String(p?.name ?? ''), width: num(p?.width, 1),
      default: p?.default == null || p.default === '' ? '0' : String(p.default),
      registered: !!p?.registered,
    })),
    ...(arr(src.registers).length ? { registers: arr(src.registers).map((r) => ({
      name: String(r?.name ?? ''), width: num(r?.width, 1),
      init: r?.init == null || r.init === '' ? '0' : String(r.init),
    })) } : {}),
    nodes,
    edges,
    initial: src.initial == null ? '' : String(src.initial),
  };
  if (src.description) out.description = String(src.description);
  // link to the HDL file kept in sync with the chart (see the app), and which of the two is the base
  if (src.generatedFile) out.generatedFile = String(src.generatedFile);
  if (src.base === 'hdl') out.base = 'hdl';
  if (!out.initial || types.get(out.initial) !== 'state') {
    const first = nodes.find((n) => n.type === 'state');
    if (!src.initial && first) out.initial = first.id;
  }
  return out;
}

/** A small example machine: a start/acknowledge controller with Moore and Mealy outputs. */
export function newModel(name = 'fsm', lang = 'vhdl') {
  return normalizeModel({
    version: 1, name, lang,
    clock: 'clk', reset: { name: 'rst', active: 'high', sync: false },
    encoding: 'binary',
    inputs: [{ name: 'start', width: 1 }, { name: 'done', width: 1 }],
    outputs: [
      { name: 'busy', width: 1, default: '0', registered: false },
      { name: 'load', width: 1, default: '0', registered: false },
      { name: 'ready', width: 1, default: '0', registered: false },
    ],
    nodes: [
      { id: 's1', type: 'state', name: 'IDLE', x: 200, y: 80, actions: ['ready = 1'] },
      { id: 'd1', type: 'decision', x: 200, y: 190, cond: 'start' },
      { id: 'o1', type: 'output', x: 200, y: 290, actions: ['load = 1'] },
      { id: 's2', type: 'state', name: 'RUN', x: 200, y: 390, actions: ['busy = 1'] },
      { id: 'd2', type: 'decision', x: 200, y: 500, cond: 'done' },
      { id: 's3', type: 'state', name: 'FINISH', x: 200, y: 610, actions: ['busy = 1', 'ready = 1'] },
    ],
    edges: [
      { id: 'e1', from: 's1', to: 'd1', port: 'next' },
      { id: 'e2', from: 'd1', to: 'o1', port: 'true' },
      { id: 'e3', from: 'd1', to: 's1', port: 'false' },
      { id: 'e4', from: 'o1', to: 's2', port: 'next' },
      { id: 'e5', from: 's2', to: 'd2', port: 'next' },
      { id: 'e6', from: 'd2', to: 's3', port: 'true' },
      { id: 'e7', from: 'd2', to: 's2', port: 'false' },
      { id: 'e8', from: 's3', to: 's1', port: 'next' },
    ],
    initial: 's1',
  });
}

// ---------------------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------------------

export function bits(v, w) {
  const mask = (1n << BigInt(w)) - 1n;
  return (v & mask).toString(2).padStart(w, '0');
}
export const bitlen = (v) => (v <= 0n ? 1 : v.toString(2).length);
export const isAtom = (s) => /^[A-Za-z_][A-Za-z0-9_]*$|^[0-9]+$|^'[01]'$|^"[01]*"$|^\d+'[bdho][0-9a-fA-F]+$/.test(s);

export function stripParens(s) {
  while (s.startsWith('(') && s.endsWith(')')) {
    let depth = 0, ok = true;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === '(') depth++;
      else if (s[i] === ')') { depth--; if (depth === 0 && i < s.length - 1) { ok = false; break; } }
    }
    if (!ok) break;
    s = s.slice(1, -1);
  }
  return s;
}

export const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

// ---------------------------------------------------------------------------------------
// Analysis: symbol table, graph index, ASM blocks
// ---------------------------------------------------------------------------------------

export function buildIndex(m) {
  const nodes = new Map();
  for (const n of m.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
  const exits = new Map(); // nodeId -> { next|true|false|<case choice>: edge }
  const cases = new Map(); // case nodeId -> [edge] in chart order
  const dupExits = [];
  const badEdges = [];
  for (const e of m.edges) {
    const from = nodes.get(e.from);
    if (!from || !nodes.has(e.to)) { badEdges.push(e); continue; }
    const port = normPort(e.port, from.type);
    const allowed = from.type === 'decision' ? ['true', 'false'] : ['next'];
    if (from.type !== 'case' && !allowed.includes(port)) { badEdges.push(e); continue; }
    const ex = exits.get(e.from) || {};
    if (Object.prototype.hasOwnProperty.call(ex, port)) dupExits.push(e);
    else {
      ex[port] = e;
      if (from.type === 'case') { if (!cases.has(e.from)) cases.set(e.from, []); cases.get(e.from).push({ ...e, port }); }
    }
    exits.set(e.from, ex);
  }
  return { nodes, exits, cases, dupExits, badEdges };
}

// A box's subtree is the same whatever the path that reaches it, unless it loops back onto that path: it is walked
// once and shared (the tree is a graph), so that a chain of decisions whose branches meet again is walked in linear
// time, not once per path (#3554). A subtree with a loop is walked again on each path, as its loop may not be on
// another, for WALK_LIMIT boxes of a block: past them (only a chart that loops gets there, and its loop is an error) it
// is shared too, its loops where the first path found them. The walk keeps its own stack, not the language's: a chain
// of a thousand decisions is as deep.
//   leaf(id, from, port): the leaf an exit leads to (no box, a state…), or null for a box;
//   exits(n): the box's exits in order, [{ to, port }]; build(n, subs): its tree node of its exits' subtrees.
const WALK_LIMIT = 20000;
function sharedWalk(idx, { leaf, exits, build }, startId, fromNode, port) {
  const memo = new Map(), loopy = new WeakSet(), path = [], onPath = new Set();
  let budget = WALK_LIMIT;
  const loop = (id) => { const t = { k: 'loop', id, path: [...path] }; loopy.add(t); return t; };
  // the subtree at an exit, or null when its box is to be walked
  const at = (id, from, p) => {
    const l = leaf(id, from, p);
    if (l) return l;
    if (onPath.has(id)) return loop(id);
    if (memo.has(id)) return memo.get(id);
    return null;
  };
  const first = at(startId, fromNode, port);
  if (first) return first;
  const open = (n) => { budget--; path.push(n.id); onPath.add(n.id); return { n, ex: exits(n), subs: [] }; };
  const stack = [open(idx.nodes.get(startId))];
  for (;;) {
    const top = stack[stack.length - 1];
    if (top.subs.length < top.ex.length) {
      const e = top.ex[top.subs.length];
      const t = at(e.to, top.n, e.port);
      if (t) top.subs.push(t); else stack.push(open(idx.nodes.get(e.to)));
      continue;
    }
    stack.pop();
    onPath.delete(path.pop());
    const t = build(top.n, top.subs);
    if (budget > 0 && top.subs.some((x) => loopy.has(x))) loopy.add(t);
    else memo.set(top.n.id, t);
    if (!stack.length) return t;
    stack[stack.length - 1].subs.push(t);
  }
}
/** The subtrees of a tree's node. */
export function treeSubs(t) {
  return t.k === 'if' ? [t.t, t.f] : t.k === 'case' ? t.branches.map((b) => b.sub) : t.k === 'act' ? [t.next] : [];
}

/** Walk one ASM block. Returns a tree of { k:'goto'|'if'|'act'|'missing'|'loop' }, its subtrees shared (sharedWalk). */
function walkBlock(idx, startId, fromNode, port) {
  return sharedWalk(idx, {
    leaf(id, from, p) {
      const n = id == null ? null : idx.nodes.get(id);
      if (!n) return { k: 'missing', from, port: p };
      if (n.type === 'state') return { k: 'goto', id: n.id, name: n.name };
      if (n.type === 'always') return { k: 'missing', from, port: p, enter: n.id };
      return null;
    },
    exits(n) {
      const ex = idx.exits.get(n.id) || {};
      if (n.type === 'decision') return [{ to: ex.true?.to, port: 'true' }, { to: ex.false?.to, port: 'false' }];
      if (n.type === 'case') return (idx.cases.get(n.id) || []).map((e) => ({ to: e.to, port: e.port }));
      return [{ to: ex.next?.to, port: 'next' }];
    },
    build(n, subs) {
      if (n.type === 'decision') return { k: 'if', node: n, t: subs[0], f: subs[1] };
      if (n.type === 'case') return { k: 'case', node: n, branches: (idx.cases.get(n.id) || []).map((e, i) => ({ label: e.port, sub: subs[i] })) };
      return { k: 'act', node: n, next: subs[0] };
    },
  }, startId, fromNode, port);
}

export function blockTrees(m, idx) {
  const out = new Map();
  for (const n of m.nodes) {
    if (n.type !== 'state' || out.has(n.id)) continue;
    const ex = idx.exits.get(n.id) || {};
    out.set(n.id, walkBlock(idx, ex.next?.to, n, 'next'));
  }
  return out;
}

/**
 * Walk an every-cycle block from its header. Leaves: { k: 'end' } (unconnected exit),
 * { k: 'state' } (error: reaches a state), { k: 'enter' } (error: enters a header), { k: 'loop' }.
 */
export function walkAlways(idx, header) {
  const ex = idx.exits.get(header.id) || {};
  return sharedWalk(idx, {
    leaf(id, from) {
      const n = id == null ? null : idx.nodes.get(id);
      if (!n) return { k: 'end' };
      if (n.type === 'state') return { k: 'state', id: n.id, name: n.name, from: from.id };
      if (n.type === 'always') return { k: 'enter', id: n.id, from: from.id };
      return null;
    },
    exits(n) {
      const x = idx.exits.get(n.id) || {};
      if (n.type === 'decision') return [{ to: x.true?.to }, { to: x.false?.to }];
      return n.type === 'case' ? [] : [{ to: x.next?.to }];
    },
    build(n, subs) {
      if (n.type === 'decision') return { k: 'if', node: n, t: subs[0], f: subs[1] };
      if (n.type === 'case') return { k: 'badcase', id: n.id };
      return { k: 'act', node: n, next: subs[0] };
    },
  }, ex.next?.to, header, 'next');
}

/**
 * Join points of the every-cycle blocks: for each decision, the box where its two branches
 * meet again (immediate post-dominator), or null when they only meet at the end of the block.
 * The blocks must be loop-free (validated). The immediate post-dominators are found by intersecting the exits' (the
 * walk keeps its own stack: a chain of a thousand decisions is as deep, #3554); a chart that loops (an error) has them
 * from the sets of post-dominators, as before.
 */
export function joinPoints(idx) {
  const succ = (id) => {
    const n = idx.nodes.get(id);
    const ex = idx.exits.get(id) || {};
    const ok = (e) => (e && idx.nodes.has(e.to) && !['state', 'always'].includes(idx.nodes.get(e.to).type) ? e.to : null);
    if (n.type === 'case') return (idx.cases.get(id) || []).map(ok);
    return n.type === 'decision' ? [ok(ex.true), ok(ex.false)] : [ok(ex.next)];
  };
  const END = '#end', ip = new Map(), depth = new Map([[END, 0]]);
  let loops = false;
  const meet = (a, b) => {
    while (a !== b) {
      while (depth.get(a) > depth.get(b)) a = ip.get(a);
      while (depth.get(b) > depth.get(a)) b = ip.get(b);
      if (a !== b) { a = ip.get(a); b = ip.get(b); }
    }
    return a;
  };
  const solve = (start) => {   // the ip of start and of the boxes after it; false when they loop
    if (ip.has(start)) return true;
    const onPath = new Set([start]), stack = [{ id: start, next: succ(start), i: 0 }];
    while (stack.length) {
      const top = stack[stack.length - 1];
      if (top.i < top.next.length) {
        const x = top.next[top.i++];
        if (x == null || ip.has(x)) continue;
        if (onPath.has(x)) return false;
        onPath.add(x);
        stack.push({ id: x, next: succ(x), i: 0 });
        continue;
      }
      stack.pop();
      onPath.delete(top.id);
      const d = top.next.length ? top.next.map((x) => x ?? END).reduce(meet) : END;
      ip.set(top.id, d);
      depth.set(top.id, depth.get(d) + 1);
    }
    return true;
  };
  const sets = setJoinPoints(succ);
  return (id) => {
    if (!loops && !(loops = !solve(id))) { const d = ip.get(id); return d === END ? null : d; }
    return sets(id);
  };
}
// joinPoints of a chart that loops: from the sets of post-dominators of each box
function setJoinPoints(succ) {
  const memo = new Map();
  const END = new Set(['#end']);
  const pdom = (start) => { // post-dominators of id (including itself and '#end')
    if (start == null) return END;
    if (memo.has(start)) return memo.get(start);
    const open = (id) => { memo.set(id, END); return { id, next: succ(id), sets: [] }; }; // provisional (cycles are validation errors)
    const stack = [open(start)];
    for (;;) {
      const top = stack[stack.length - 1];
      if (top.sets.length < top.next.length) {
        const x = top.next[top.sets.length];
        if (x == null) top.sets.push(END);
        else if (memo.has(x)) top.sets.push(memo.get(x));
        else stack.push(open(x));
        continue;
      }
      stack.pop();
      const out = new Set([...top.sets[0]].filter((x) => top.sets.every((S) => S.has(x))));
      out.add(top.id);
      memo.set(top.id, out);
      if (!stack.length) return out;
      stack[stack.length - 1].sets.push(out);
    }
  };
  return (id) => {
    let best = null, size = -1;
    for (const d of pdom(id)) {
      if (d === id || d === '#end') continue;
      const k = pdom(d).size;
      if (k > size) { size = k; best = d; }
    }
    return best;
  };
}

/** Every distinct subtree of a tree, once each (its leaves too), in the order of a walk: the boxes' time, not the paths'. */
export function treeParts(tree) {
  const out = [], seen = new WeakSet(), stack = [tree];
  while (stack.length) {
    const t = stack.pop();
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    stack.push(...treeSubs(t).reverse());
  }
  return out;
}

/** The boxes of a tree, in the order of a walk (a shared subtree walked once). */
export function treeNodes(tree, acc = new Set()) {
  for (const t of treeParts(tree)) if (t.k === 'if' || t.k === 'case' || t.k === 'act') acc.add(t.node.id);
  return acc;
}

/** A sum over a tree's paths, counted in the boxes' time: leaf(t) a leaf's, box(t) what a box adds to its subtrees'. */
function treeSum(tree, leaf, box) {
  const memo = new Map(), stack = [{ t: tree, subs: treeSubs(tree), i: 0 }];
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.i < top.subs.length) {
      const x = top.subs[top.i++];
      if (!memo.has(x)) stack.push({ t: x, subs: treeSubs(x), i: 0 });
      continue;
    }
    stack.pop();
    memo.set(top.t, top.subs.length ? top.subs.reduce((n, x) => n + memo.get(x), box(top.t)) : leaf(top.t));
  }
  return memo.get(tree);
}
/** The number of paths of a tree (a BigInt: a chain of n decisions has 2^n). */
export const pathCount = (tree) => treeSum(tree, () => 1n, () => 0n);
/** The number of boxes and leaves of a tree written out in full, every path's apart (a Number). */
export const treeSize = (tree) => treeSum(tree, () => 1, () => 1);
/** The paths listed one by one (flatten, the generated header's list of transitions) at most. */
export const MAX_PATHS = 4096;

/** The paths of a block: [{ conditions, mealyActions, next, nextName, error? }]. Throws past MAX_PATHS of them. */
export function flatten(tree) {
  const n = pathCount(tree);
  if (n > MAX_PATHS) throw new Error(`${n} paths through the decisions, more than ${MAX_PATHS} to list`);
  return flattenInto(tree);
}
function flattenInto(tree, conds = [], acts = [], out = []) {
  switch (tree.k) {
    case 'goto': out.push({ conditions: conds, mealyActions: acts, next: tree.id, nextName: tree.name }); break;
    case 'if':
      flattenInto(tree.t, [...conds, { nodeId: tree.node.id, cond: tree.node.cond, value: true }], acts, out);
      flattenInto(tree.f, [...conds, { nodeId: tree.node.id, cond: tree.node.cond, value: false }], acts, out);
      break;
    case 'case':
      for (const b of tree.branches) flattenInto(b.sub, [...conds, { nodeId: tree.node.id, cond: caseCondText(tree.node.expr, b.label), value: true }], acts, out);
      break;
    case 'act':
      flattenInto(tree.next, conds, [...acts, ...tree.node.actions.map((a) => ({ nodeId: tree.node.id, action: a }))], out);
      break;
    default:
      out.push({ conditions: conds, mealyActions: acts, next: null, nextName: null,
        error: tree.k === 'loop' ? 'loop without a state' : 'missing exit' });
  }
  return out;
}

const caseCondText = (expr, label) => (label === 'others' ? `${expr.trim()} = others` : `${expr.trim()} = ${label.split(/\s*[|,]\s*/).join(' | ')}`);

/**
 * Values selected by the label of a case exit, for an expression of `width` bits:
 * { others: true } | { values: [BigInt] } | { error }.
 */
export function parseCaseChoices(label, width) {
  const t = String(label ?? '').trim();
  if (!t || /^(others|default)$/i.test(t)) return { others: true };
  const values = [];
  for (const part of t.split(/\s*[|,]\s*/)) {
    if (!part) return { error: `empty value in '${t}'` };
    let v;
    const bin = part.replace(/_/g, '');
    if (/^[01]+$/.test(bin) && bin.length === width) v = BigInt('0b' + bin);
    else {
      const r = parseCondition(part);
      if (r.error || r.ast.k !== 'lit') return { error: `'${part}' is not a number (write ${width} binary digits, e.g. ${'0'.repeat(Math.max(0, width - 1))}1, or a literal such as 4 or ${width}'b${'0'.repeat(Math.max(0, width - 1))}1)` };
      v = r.ast.v;
    }
    if (v >= 1n << BigInt(width)) return { error: `'${part}' does not fit in ${width} bit${width === 1 ? '' : 's'}` };
    values.push(v);
  }
  return { values };
}

/**
 * Label for a new exit of a case box whose exits have the labels `labels`, for an expression of
 * `width` bits: the lowest value no exit selects (as `width` binary digits), else 'others' when
 * there is no others exit yet, else null (every value already has an exit).
 */
export function nextCaseLabel(labels, width) {
  const used = new Set();
  let others = false;
  for (const l of labels) {
    const c = parseCaseChoices(l, width);
    if (c.others) others = true;
    else if (c.values) for (const v of c.values) used.add(v);
  }
  const lim = 1n << BigInt(Math.min(width, 12));
  for (let v = 0n; v < lim; v++) if (!used.has(v)) return v.toString(2).padStart(width, '0');
  return others ? null : 'others';
}

/** Per state: { state, name, mooreActions, transitions: [{ conditions, mealyActions, next, nextName }] } */
export function extractTransitions(model) {
  const m = normalizeModel(model);
  const idx = buildIndex(m);
  const trees = blockTrees(m, idx);
  const paths = (s) => {
    try { return flatten(trees.get(s.id)); } catch (e) { throw new Error(`State '${s.name}': ${e.message}`); }
  };
  return m.nodes.filter((n) => n.type === 'state').map((s) => ({
    state: s.id, name: s.name, mooreActions: [...s.actions], transitions: paths(s),
  }));
}

/** States in code order (initial first) with their encodings. */
export function stateEncoding(model) {
  const m = normalizeModel(model);
  const states = m.nodes.filter((n) => n.type === 'state');
  const init = states.findIndex((s) => s.id === m.initial);
  if (init > 0) states.unshift(states.splice(init, 1)[0]);
  const N = states.length;
  let width;
  if (m.encoding === 'onehot') width = Math.max(1, N);
  else width = N <= 1 ? 1 : (N - 1).toString(2).length;
  return states.map((s, i) => {
    let code;
    if (m.encoding === 'onehot') code = 1n << BigInt(i);
    else if (m.encoding === 'gray') code = BigInt(i ^ (i >> 1));
    else code = BigInt(i);
    return { id: s.id, name: s.name, constName: `S_${s.name}`, index: i, width, code, bits: bits(code, width) };
  });
}

// ---------------------------------------------------------------------------------------
// Analysis (shared by validate and the generators)
// ---------------------------------------------------------------------------------------

export function analyze(model) {
  const m = normalizeModel(model);
  const diags = [];
  const add = (severity, message, nodeId) => diags.push(nodeId ? { severity, message, nodeId } : { severity, message });
  const err = (msg, id) => add('error', msg, id);
  const warn = (msg, id) => add('warning', msg, id);
  const generics = m.generics || [];
  const registers = m.registers || [];

  // ---- names --------------------------------------------------------------------------
  // `bare`: the name never appears in the code on its own (state names only appear as
  // S_<name>, every-cycle block names only in comments), so reserved words are fine
  const checkName = (name, what, nodeId, bare = true) => {
    if (!name) { err(`${what} has no name`, nodeId); return false; }
    if (!isIdentifier(name)) { err(`${what} '${name}' is not a valid identifier (letters, digits, single '_', must start with a letter)`, nodeId); return false; }
    if (!bare) return true;
    const r = reservedIn(name);
    if (r.length) { err(`${what} '${name}' is a reserved word in ${r.join(' and ')}`, nodeId); return false; }
    const w = reservedWarning(name);
    if (w) warn(w, nodeId);
    return true;
  };
  checkName(m.name, 'Module/entity name');

  const names = new Map(); // lower-case -> description (VHDL is case-insensitive)
  const claim = (name, what, nodeId) => {
    if (!name) return;
    const k = name.toLowerCase();
    if (names.has(k)) err(`${what} '${name}' clashes with ${names.get(k)}`, nodeId);
    else names.set(k, `${what.toLowerCase()} '${name}'`);
  };
  if (checkName(m.clock, 'Clock')) claim(m.clock, 'Clock');
  if (checkName(m.reset.name, 'Reset')) claim(m.reset.name, 'Reset');
  for (const internal of ['state_reg', 'state_next', 'state_t']) names.set(internal, `internal signal '${internal}'`);
  // VHDL process labels share the architecture's declarative region with ports and signals
  for (const label of ['state_register', 'next_state_logic', 'output_logic']) names.set(label, `VHDL process label '${label}'`);

  const syms = new Map();
  for (const g of generics) {
    if (!checkName(g.name, 'Generic')) continue;
    if (typeof g.default !== 'number' || !Number.isInteger(g.default) || g.default < 0 || g.default > 2147483647) {
      err(`Generic '${g.name}': default value '${g.default}' must be a non-negative integer`);
      continue;
    }
    claim(g.name, 'Generic');
    syms.set(g.name, { name: g.name, width: 32, kind: 'generic', sig: g.name });
  }
  const ports = [...m.inputs.map((p) => ({ ...p, dir: 'in' })), ...m.outputs.map((p) => ({ ...p, dir: 'out' }))];
  for (const p of ports) {
    const what = p.dir === 'in' ? 'Input' : 'Output';
    if (!checkName(p.name, what)) continue;
    if (!Number.isInteger(p.width) || p.width < 1 || p.width > 256) { err(`${what} '${p.name}' has invalid width ${p.width} (1..256)`); continue; }
    claim(p.name, what);
    if (p.dir === 'out' && p.registered) { claim(`${p.name}_reg`, 'Internal register'); claim(`${p.name}_next`, 'Internal signal'); }
    if (p.dir === 'in' && p.sync) { claim(`${p.name}_meta`, 'Synchroniser flip-flop'); claim(`${p.name}_sync`, 'Synchroniser flip-flop'); }
    const registered = p.dir === 'out' && p.registered;
    syms.set(p.name, {
      name: p.name, width: p.width, kind: p.dir === 'in' ? 'input' : 'output', registered,
      sig: registered ? `${p.name}_reg` : p.dir === 'in' && p.sync ? `${p.name}_sync` : p.name,
      next: registered ? `${p.name}_next` : p.name,
    });
  }
  for (const r of registers) {
    if (!checkName(r.name, 'Register')) continue;
    if (!Number.isInteger(r.width) || r.width < 1 || r.width > 256) { err(`Register '${r.name}' has invalid width ${r.width} (1..256)`); continue; }
    claim(r.name, 'Register');
    claim(`${r.name}_next`, 'Internal signal');
    syms.set(r.name, { name: r.name, width: r.width, kind: 'register', registered: true, sig: r.name, next: `${r.name}_next` });
  }
  // output defaults and register reset values
  const defaults = new Map();
  const literalValue = (text, width, what, name) => {
    const r = parseCondition(text);
    if (r.error || r.ast.k !== 'lit') { err(`${what} '${name}': ${what === 'Output' ? 'default' : 'reset'} value '${text}' must be a literal (e.g. 0, 1, 4'b1010, "1010")`); return 0n; }
    if (bitlen(r.ast.v) > width) warn(`${what} '${name}': ${what === 'Output' ? 'default' : 'reset'} value '${text}' is truncated to ${width} bit(s)`);
    return r.ast.v;
  };
  for (const o of m.outputs) if (syms.has(o.name)) defaults.set(o.name, literalValue(o.default, o.width, 'Output', o.name));
  for (const r of registers) if (syms.get(r.name)?.kind === 'register') defaults.set(r.name, literalValue(r.init, r.width, 'Register', r.name));

  // ---- graph -------------------------------------------------------------------------- (asm-graph.js)
  const { alwaysNodes, alwaysTrees, idx, trees } = mountGraphChecks({
    add, checkName, claim, err, m, warn
  });

  // ---- expressions --------------------------------------------------------------------
  const makeCtx = (nodeId, where) => ({
    reads: new Set(),
    peek: (name) => syms.get(name) || null,
    lookup(name) {
      const s = syms.get(name);
      if (s) {
        if (s.kind === 'output' && !s.registered) {
          err(`${where}: output '${name}' is combinational and cannot be read (mark it 'registered' to use its value)`, nodeId);
          return null;
        }
        return s;
      }
      const ci = [...syms.keys()].find((k) => k.toLowerCase() === name.toLowerCase());
      err(`${where}: '${name}' is not a declared input, register or generic${ci ? ` (did you mean '${ci}'?)` : ''}`, nodeId);
      return null;
    },
    error(msg) { err(`${where}: ${msg}`, nodeId); },
    warn(msg) { warn(`${where}: ${msg}`, nodeId); },
  });

  const parsedConds = new Map();
  const parsedCases = new Map();   // nodeId -> { ast, width, branches: [{ label, others?, values? }] }
  const parsedActions = new Map(); // nodeId -> [{target, ast, text}]
  for (const n of m.nodes) {
    if (n.type === 'case') {
      const where = `Case '${n.expr || '?'}'`;
      if (!n.expr.trim()) { err('Case box has no expression (the value to test, e.g. opcode)', n.id); continue; }
      const r = parseCondition(n.expr);
      if (r.error) { err(`${where}: ${r.error}`, n.id); continue; }
      if (r.ast.k !== 'id' && r.ast.k !== 'sel') { err(`${where}: the expression must be a signal name or a bit slice (e.g. opcode or opcode[4:3])`, n.id); continue; }
      const ctx = makeCtx(n.id, where);
      const x = vhExpr(r.ast, ctx);
      if (x.t === 'int') { err(`${where}: a generic is a constant and cannot be tested`, n.id); continue; }
      const width = x.w || 1;
      const branches = [];
      const seen = new Map();
      let others = false;
      for (const e of idx.cases.get(n.id) || []) {
        const c = parseCaseChoices(e.port, width);
        if (c.error) { err(`${where}: exit '${e.port}': ${c.error}`, n.id); continue; }
        if (c.others) { others = true; branches.push({ label: 'others', others: true }); continue; }
        for (const v of c.values) {
          const k = v.toString();
          if (seen.has(k)) err(`${where}: value ${bits(v, width)} is used by the exits '${seen.get(k)}' and '${e.port}'`, n.id);
          else seen.set(k, e.port);
        }
        branches.push({ label: e.port, values: c.values });
      }
      if (!others && branches.length) {
        if (width > 16) err(`${where}: add an 'others' exit (the values of a ${width}-bit expression cannot all be listed)`, n.id);
        else if (seen.size < 2 ** width) {
          let miss = 0n;
          while (seen.has(miss.toString())) miss++;
          err(`${where}: ${2 ** width - seen.size} value(s) have no exit (e.g. ${bits(miss, width)}): add them or an 'others' exit`, n.id);
        }
      } else if (others && seen.size >= 2 ** width && width <= 16) warn(`${where}: every value has its own exit, the 'others' exit is never taken`, n.id);
      parsedCases.set(n.id, { ast: r.ast, width, branches });
    } else if (n.type === 'decision') {
      const where = `Decision '${n.cond || '?'}'`;
      if (!n.cond.trim()) { err('Decision box has no condition', n.id); continue; }
      const r = parseCondition(n.cond);
      if (r.error) { err(`${where}: ${r.error}`, n.id); continue; }
      parsedConds.set(n.id, r.ast);
      vhTruth(r.ast, makeCtx(n.id, where));
    } else {
      const list = [];
      const assigned = new Map();
      for (const a of n.actions) {
        const kind = n.type === 'state' ? `State '${n.name}'` : n.type === 'always' ? `Every-cycle block '${n.name}'` : 'Conditional output';
        const where = `${kind} action '${a}'`;
        const r = parseAction(a);
        if (r.error) { err(`${where}: ${r.error}`, n.id); continue; }
        const s = syms.get(r.target);
        if (!s || (s.kind !== 'output' && s.kind !== 'register')) {
          const why = !s ? 'not a declared output or register'
            : s.kind === 'input' ? 'an input and cannot be assigned' : 'a generic (a constant) and cannot be assigned';
          err(`${where}: '${r.target}' is ${why}`, n.id);
          continue;
        }
        if (assigned.has(r.target)) warn(`${where}: '${r.target}' is assigned more than once in the same box (the last assignment wins)`, n.id);
        assigned.set(r.target, true);
        vhAssign('x', s.width, r.ast, makeCtx(n.id, where));
        list.push({ target: r.target, ast: r.ast, text: a });
      }
      parsedActions.set(n.id, list);
    }
  }

  // targets of the every-cycle blocks: two blocks may not assign the same target
  const targetOwner = new Map();
  for (const a of alwaysNodes) {
    const ids = [a.id, ...treeNodes(alwaysTrees.get(a.id))];
    const mine = new Set();
    for (const id of ids) for (const act of parsedActions.get(id) || []) mine.add(act.target);
    for (const t of mine) {
      const other = targetOwner.get(t);
      if (other) err(`'${t}' is assigned by the every-cycle blocks '${idx.nodes.get(other).name}' and '${a.name}' (each target may be assigned by one block only)`, a.id);
      else targetOwner.set(t, a.id);
    }
  }

  return { m, diags, idx, trees, syms, defaults, parsedConds, parsedCases, parsedActions, alwaysNodes, alwaysTrees, registers, generics };
}

export function describe(n) {
  if (!n) return 'Box';
  if (n.type === 'state') return `State '${n.name || n.id}'`;
  if (n.type === 'decision') return `Decision '${n.cond || n.id}'`;
  if (n.type === 'case') return `Case '${n.expr || n.id}'`;
  if (n.type === 'always') return `Every-cycle block '${n.name || n.id}'`;
  return `Conditional output box${n.actions?.length ? ` '${n.actions[0]}${n.actions.length > 1 ? ', ...' : ''}'` : ''}`;
}

/** Validate a model. Returns [{ severity: 'error'|'warning'|'info', message, nodeId? }]. */
export function validate(model) {
  const { diags } = analyze(model);
  const rank = { error: 0, warning: 1, info: 2 };
  return diags.map((d, i) => [d, i]).sort((a, b) => rank[a[0].severity] - rank[b[0].severity] || a[1] - b[1]).map(([d]) => d);
}

// ---------------------------------------------------------------------------------------
// Expression code for other generators (FSM bubble diagrams, core/fsm.js)
// ---------------------------------------------------------------------------------------

/**
 * Code of conditions and literals over plain ports, with the same typing rules as the charts:
 *   const c = portExprCoder({ inputs, outputs }, 'vhdl' | 'verilog');
 *   c.cond('a && x == 2') -> "a = '1' and unsigned(x) = 2" (throws an Error on a bad expression)
 *   c.not(code)           -> negated condition code
 *   c.lit(value, width)   -> literal code ('1', "0101", 4'd5…)
 *   c.reads               -> Set of the signals the conditions read
 */
export function portExprCoder({ inputs = [], outputs = [] } = {}, lang = 'vhdl') {
  const syms = new Map();
  for (const p of inputs) syms.set(p.name, { name: p.name, width: p.width || 1, kind: 'input', sig: p.name, next: p.name });
  for (const p of outputs) syms.set(p.name, { name: p.name, width: p.width || 1, kind: 'output', sig: p.name, next: p.name });
  const reads = new Set();
  const errs = [];
  const ctx = () => ({ reads, lookup: (n) => syms.get(n) || null, peek: (n) => syms.get(n) || null, error: (m) => errs.push(m), warn() {} });
  const done = (code) => {
    if (errs.length) { const e = new Error(errs.join('; ')); errs.length = 0; throw e; }
    return code;
  };
  return {
    reads,
    cond(text) {
      const r = parseCondition(text);
      if (r.error) throw new Error(r.error);
      const c = ctx();
      if (lang !== 'vhdl') return done(stripParens(vlExpr(r.ast, c)));
      // not (x = '1') reads better as x = '0'
      const code = stripParens(vhBool(vhTruth(r.ast, c)))
        .replace(/not \(([A-Za-z][A-Za-z0-9_]*(?:\(\d+\))?) = '([01])'\)/g, (m, x, b) => `${x} = '${b === '1' ? '0' : '1'}'`);
      return done(stripParens(code));
    },
    not: (c) => (lang === 'vhdl' ? vhNot(c) : vlNot(c)),
    lit: (v, w, base = 'b') => (lang === 'vhdl' ? vhLitW(BigInt(v), w) : vlLitW(BigInt(v), w, w === 1 ? 'b' : base)),
  };
}
