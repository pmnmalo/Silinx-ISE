// XAIlinx - ASM (Algorithmic State Machine) chart model, validation and HDL generators.
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
//     inputs:  [{ name: 'go', width: 1 }],
//     outputs: [{ name: 'busy', width: 1, default: '0', registered: false }],
//     nodes: [
//       { id, type: 'state',    name: 'IDLE', x, y, actions: ['busy = 1'] },
//       { id, type: 'decision', x, y, cond: 'go', flip?: bool },
//       { id, type: 'output',   x, y, actions: ['ld = 1'] },
//     ],
//     edges: [{ id, from, to, port: 'next' | 'true' | 'false', points?: [{x,y}] }],
//     initial: '<state node id>'
//   }
//
// Node x/y are the CENTRE of the node in chart coordinates.
//
// Expression syntax (conditions and the right-hand side of actions):
//   identifiers, literals: 10, 4'b1010, 8'hFF, 4'd3, "1010", '1', 0x1F, 0b101, true, false
//   operators (C/Verilog precedence): || && | ^ & == != < > <= >= + - ! ~ ( )
//   aliases: and, or, xor, not; in conditions a single '=' and '/=' mean '==' / '!='.
// Actions:  `out = expr` (also `<=` / `:=`), or just `out` meaning `out = 1`.
//
// Output semantics:
//   registered: false -> combinational output, takes `default` unless assigned in the
//                        current state (Moore) or on the current path (Mealy).
//   registered: true  -> output driven by a register `<name>_reg` (reset value = default).
//                        Assignments compute its next value, which is loaded at the clock
//                        edge (ASMD register-transfer semantics); when not assigned it holds.
//                        Registered outputs may be read in conditions/expressions
//                        (e.g. `cnt = cnt + 1`, decision `cnt == 9`).

export const ASM_VERSION = 1;
export const ENCODINGS = ['binary', 'gray', 'onehot', 'enum'];
export const LANGS = ['vhdl', 'verilog'];

// ---------------------------------------------------------------------------------------
// Reserved words
// ---------------------------------------------------------------------------------------

const VERILOG_RESERVED = new Set((
  'always and assign automatic begin buf bufif0 bufif1 case casex casez cell cmos config ' +
  'deassign default defparam design disable edge else end endcase endconfig endfunction ' +
  'endgenerate endmodule endprimitive endspecify endtable endtask event for force forever ' +
  'fork function generate genvar highz0 highz1 if ifnone incdir include initial inout input ' +
  'instance integer join large liblist library localparam macromodule medium module nand ' +
  'negedge nmos nor noshowcancelled not notif0 notif1 or output parameter pmos posedge ' +
  'primitive pull0 pull1 pulldown pullup pulsestyle_onevent pulsestyle_ondetect rcmos real ' +
  'realtime reg release repeat rnmos rpmos rtran rtranif0 rtranif1 scalared showcancelled ' +
  'signed small specify specparam strong0 strong1 supply0 supply1 table task time tran ' +
  'tranif0 tranif1 tri tri0 tri1 triand trior trireg unsigned use uwire vectored wait wand ' +
  'weak0 weak1 while wire wor xnor xor logic bit byte int shortint longint').split(/\s+/));

const VHDL_RESERVED = new Set((
  'abs access after alias all and architecture array assert attribute begin block body ' +
  'buffer bus case component configuration constant disconnect downto else elsif end entity ' +
  'exit file for function generate generic group guarded if impure in inertial inout is ' +
  'label library linkage literal loop map mod nand new next nor not null of on open or ' +
  'others out package port postponed procedure process pure range record register reject ' +
  'rem report return rol ror select severity signal shared sla sll sra srl subtype then to ' +
  'transport type unaffected units until use variable wait when while with xnor xor ' +
  // names that would clash with the standard packages we use
  'std_logic std_logic_vector std_ulogic unsigned signed integer natural boolean bit ' +
  'rising_edge falling_edge resize to_unsigned ieee std work numeric_std').split(/\s+/));

/** True if `s` is a portable identifier (valid in both Verilog and VHDL). */
export function isIdentifier(s) {
  return typeof s === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(s) && !s.includes('__') && !s.endsWith('_');
}

function reservedIn(s) {
  const out = [];
  if (VERILOG_RESERVED.has(s)) out.push('Verilog');
  if (VHDL_RESERVED.has(s.toLowerCase())) out.push('VHDL');
  return out;
}

// ---------------------------------------------------------------------------------------
// Model helpers
// ---------------------------------------------------------------------------------------

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

function normPort(port, type) {
  const p = String(port ?? '').toLowerCase();
  if (type === 'decision') {
    if (p === 'true' || p === '1' || p === 't' || p === 'yes') return 'true';
    if (p === 'false' || p === '0' || p === 'f' || p === 'no') return 'false';
    return p || 'true';
  }
  return p === '' ? 'next' : p;
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
    const type = ['state', 'decision', 'output'].includes(n?.type) ? n.type : 'state';
    const o = { id: String(n?.id ?? `n${i + 1}`), type, x: num(n?.x), y: num(n?.y) };
    if (type === 'state') { o.name = String(n?.name ?? ''); o.actions = normActions(n?.actions); }
    if (type === 'decision') { o.cond = String(n?.cond ?? ''); if (n?.flip) o.flip = true; }
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
    inputs: arr(src.inputs).map((p) => ({ name: String(p?.name ?? ''), width: num(p?.width, 1) })),
    outputs: arr(src.outputs).map((p) => ({
      name: String(p?.name ?? ''), width: num(p?.width, 1),
      default: p?.default == null || p.default === '' ? '0' : String(p.default),
      registered: !!p?.registered,
    })),
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
// Expression language: tokenizer + parser
// ---------------------------------------------------------------------------------------

const OPS = ['&&', '||', '==', '!=', '/=', '<=', '>=', ':=', '<', '>', '!', '~', '&', '|', '^', '+', '-', '(', ')', '='];
const WORD_OPS = { and: '&&', or: '||', not: '!', xor: '^' };

class ExprError extends Error {}

function parseBased(widthStr, base, digits, src) {
  const clean = digits.replace(/_/g, '');
  const b = base.toLowerCase();
  if (/[xz?]/i.test(clean)) throw new ExprError(`x/z digits are not supported in literal ${src}`);
  const radix = { b: 2, o: 8, d: 10, h: 16 }[b];
  const valid = { b: /^[01]+$/, o: /^[0-7]+$/, d: /^[0-9]+$/, h: /^[0-9a-f]+$/i }[b];
  if (!valid.test(clean)) throw new ExprError(`invalid digits in literal ${src}`);
  let v = 0n;
  for (const ch of clean.toLowerCase()) v = v * BigInt(radix) + BigInt(parseInt(ch, 16));
  let w = widthStr ? parseInt(widthStr, 10) : (b === 'd' ? null : clean.length * { b: 1, o: 3, h: 4 }[b]);
  if (w === 0) throw new ExprError(`zero-width literal ${src}`);
  return { k: 'lit', v, w, base: b };
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const rest = src.slice(i);
    let m;
    if ((m = /^'([01])'/.exec(rest))) {
      toks.push({ t: 'lit', v: { k: 'lit', v: BigInt(m[1]), w: 1, base: 'b' }, pos: i });
    } else if ((m = /^(\d+)?\s*'[sS]?([bBoOdDhH])\s*([0-9a-fA-F_xXzZ?]+)/.exec(rest))) {
      toks.push({ t: 'lit', v: parseBased(m[1], m[2], m[3], m[0]), pos: i });
    } else if ((m = /^0[xX]([0-9a-fA-F_]+)/.exec(rest))) {
      toks.push({ t: 'lit', v: parseBased(null, 'h', m[1], m[0]), pos: i });
    } else if ((m = /^0[bB]([01_]+)/.exec(rest))) {
      toks.push({ t: 'lit', v: parseBased(null, 'b', m[1], m[0]), pos: i });
    } else if ((m = /^\d[\d_]*/.exec(rest))) {
      toks.push({ t: 'lit', v: { k: 'lit', v: BigInt(m[0].replace(/_/g, '')), w: null, base: 'd' }, pos: i });
    } else if ((m = /^"([01_]*)"/.exec(rest))) {
      const bits = m[1].replace(/_/g, '');
      if (!bits) throw new ExprError('empty bit-string literal ""');
      toks.push({ t: 'lit', v: { k: 'lit', v: BigInt('0b' + bits), w: bits.length, base: 'b' }, pos: i });
    } else if ((m = /^"[^"]*"?/.exec(rest))) {
      throw new ExprError(`bit-string literal ${m[0]} may only contain 0, 1 and _`);
    } else if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest))) {
      const low = m[0].toLowerCase();
      if (WORD_OPS[low]) toks.push({ t: 'op', v: WORD_OPS[low], pos: i });
      else if (low === 'true' || low === 'false') toks.push({ t: 'lit', v: { k: 'lit', v: low === 'true' ? 1n : 0n, w: 1, base: 'b' }, pos: i });
      else toks.push({ t: 'id', v: m[0], pos: i });
    } else {
      const op = OPS.find((o) => rest.startsWith(o));
      if (!op) throw new ExprError(`unexpected character '${c}'`);
      toks.push({ t: 'op', v: op, pos: i });
      m = [op];
    }
    i += m[0].length;
  }
  toks.push({ t: 'eof', v: '', pos: src.length });
  return toks;
}

const BIN_LEVELS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-']];

function makeParser(toks, condMode) {
  let p = 0;
  const peek = () => toks[p];
  const opv = (tk) => {
    if (tk.t !== 'op') return null;
    if (condMode && tk.v === '=') return '==';
    if (tk.v === '/=') return '!=';
    return tk.v;
  };
  const expect = (v) => {
    const tk = toks[p];
    if (opv(tk) !== v) throw new ExprError(`expected '${v}' ${tk.t === 'eof' ? 'at end' : `near '${tk.v}'`}`);
    p++;
  };
  function primary() {
    const tk = toks[p];
    if (tk.t === 'lit') { p++; return tk.v; }
    if (tk.t === 'id') { p++; return { k: 'id', name: tk.v }; }
    const o = opv(tk);
    if (o === '(') { p++; const e = binary(0); expect(')'); return e; }
    if (o === '!' || o === '~' || o === '-') { p++; return { k: 'un', op: o, a: primary() }; }
    if (tk.t === 'eof') throw new ExprError('unexpected end of expression');
    throw new ExprError(`unexpected '${tk.v}'`);
  }
  function binary(level) {
    if (level >= BIN_LEVELS.length) return primary();
    let a = binary(level + 1);
    for (;;) {
      const o = opv(peek());
      if (!o || !BIN_LEVELS[level].includes(o)) return a;
      p++;
      a = { k: 'bin', op: o, a, b: binary(level + 1) };
    }
  }
  return {
    expr() { const e = binary(0); if (peek().t !== 'eof') throw new ExprError(`unexpected '${peek().v}'`); return e; },
    toks, get pos() { return p; }, set pos(v) { p = v; },
  };
}

/** Parse a condition. Returns { ast } or { error }. */
export function parseCondition(src) {
  try {
    if (!String(src ?? '').trim()) return { error: 'empty condition' };
    return { ast: makeParser(tokenize(String(src)), true).expr() };
  } catch (e) {
    if (e instanceof ExprError) return { error: e.message };
    throw e;
  }
}

/** Parse an action `target = expr` or `target`. Returns { target, ast } or { error }. */
export function parseAction(src) {
  try {
    const toks = tokenize(String(src ?? ''));
    if (toks[0].t !== 'id') return { error: 'an action must start with an output name' };
    const target = toks[0].v;
    if (toks[1].t === 'eof') return { target, ast: { k: 'lit', v: 1n, w: null, base: 'd' }, implicit: true };
    if (!(toks[1].t === 'op' && ['=', '<=', ':='].includes(toks[1].v))) {
      return { error: `expected '=' after '${target}'` };
    }
    const ps = makeParser(toks.slice(2), false);
    return { target, ast: ps.expr() };
  } catch (e) {
    if (e instanceof ExprError) return { error: e.message };
    throw e;
  }
}

/** Neutral-syntax text of an AST (used in comments). */
export function exprToString(ast) {
  switch (ast.k) {
    case 'id': return ast.name;
    case 'lit': return litNeutral(ast);
    case 'un': return `${ast.op}${ast.a.k === 'bin' ? `(${exprToString(ast.a)})` : exprToString(ast.a)}`;
    case 'bin': {
      const s = (x) => (x.k === 'bin' ? `(${exprToString(x)})` : exprToString(x));
      return `${s(ast.a)} ${ast.op} ${s(ast.b)}`;
    }
  }
  return '?';
}
function litNeutral(l) {
  if (l.w == null) return l.v.toString();
  if (l.base === 'h') return `${l.w}'h${l.v.toString(16).toUpperCase()}`;
  if (l.base === 'd' || l.base === 'o') return `${l.w}'d${l.v}`;
  return `${l.w}'b${bits(l.v, l.w)}`;
}

// ---------------------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------------------

function bits(v, w) {
  const mask = (1n << BigInt(w)) - 1n;
  return (v & mask).toString(2).padStart(w, '0');
}
const bitlen = (v) => (v <= 0n ? 1 : v.toString(2).length);
const isAtom = (s) => /^[A-Za-z_][A-Za-z0-9_]*$|^[0-9]+$|^'[01]'$|^"[01]*"$|^\d+'[bdho][0-9a-fA-F]+$/.test(s);

function stripParens(s) {
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

const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));

// ---------------------------------------------------------------------------------------
// Analysis: symbol table, graph index, ASM blocks
// ---------------------------------------------------------------------------------------

function buildIndex(m) {
  const nodes = new Map();
  for (const n of m.nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
  const exits = new Map(); // nodeId -> { next|true|false: edge }
  const dupExits = [];
  const badEdges = [];
  for (const e of m.edges) {
    const from = nodes.get(e.from);
    if (!from || !nodes.has(e.to)) { badEdges.push(e); continue; }
    const port = normPort(e.port, from.type);
    const allowed = from.type === 'decision' ? ['true', 'false'] : ['next'];
    if (!allowed.includes(port)) { badEdges.push(e); continue; }
    const ex = exits.get(e.from) || {};
    if (ex[port]) dupExits.push(e);
    else ex[port] = e;
    exits.set(e.from, ex);
  }
  return { nodes, exits, dupExits, badEdges };
}

/** Walk one ASM block. Returns a tree of { k:'goto'|'if'|'act'|'missing'|'loop' }. */
function walkBlock(idx, startId, fromNode, port) {
  const visit = (id, path, from, fport) => {
    const n = id == null ? null : idx.nodes.get(id);
    if (!n) return { k: 'missing', from, port: fport };
    if (n.type === 'state') return { k: 'goto', id: n.id, name: n.name };
    if (path.includes(n.id)) return { k: 'loop', id: n.id, path };
    const p2 = [...path, n.id];
    const ex = idx.exits.get(n.id) || {};
    if (n.type === 'decision') {
      return { k: 'if', node: n, t: visit(ex.true?.to, p2, n, 'true'), f: visit(ex.false?.to, p2, n, 'false') };
    }
    return { k: 'act', node: n, next: visit(ex.next?.to, p2, n, 'next') };
  };
  return visit(startId, [], fromNode, port);
}

function blockTrees(m, idx) {
  const out = new Map();
  for (const n of m.nodes) {
    if (n.type !== 'state' || out.has(n.id)) continue;
    const ex = idx.exits.get(n.id) || {};
    out.set(n.id, walkBlock(idx, ex.next?.to, n, 'next'));
  }
  return out;
}

function treeNodes(tree, acc = new Set()) {
  if (tree.k === 'if') { acc.add(tree.node.id); treeNodes(tree.t, acc); treeNodes(tree.f, acc); }
  else if (tree.k === 'act') { acc.add(tree.node.id); treeNodes(tree.next, acc); }
  return acc;
}

function flatten(tree, conds = [], acts = [], out = []) {
  switch (tree.k) {
    case 'goto': out.push({ conditions: conds, mealyActions: acts, next: tree.id, nextName: tree.name }); break;
    case 'if':
      flatten(tree.t, [...conds, { nodeId: tree.node.id, cond: tree.node.cond, value: true }], acts, out);
      flatten(tree.f, [...conds, { nodeId: tree.node.id, cond: tree.node.cond, value: false }], acts, out);
      break;
    case 'act':
      flatten(tree.next, conds, [...acts, ...tree.node.actions.map((a) => ({ nodeId: tree.node.id, action: a }))], out);
      break;
    default:
      out.push({ conditions: conds, mealyActions: acts, next: null, nextName: null,
        error: tree.k === 'loop' ? 'loop without a state' : 'missing exit' });
  }
  return out;
}

/** Per state: { state, name, mooreActions, transitions: [{ conditions, mealyActions, next, nextName }] } */
export function extractTransitions(model) {
  const m = normalizeModel(model);
  const idx = buildIndex(m);
  const trees = blockTrees(m, idx);
  return m.nodes.filter((n) => n.type === 'state').map((s) => ({
    state: s.id, name: s.name, mooreActions: [...s.actions], transitions: flatten(trees.get(s.id)),
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
// VHDL expression typing / emission (also used as the strict semantic checker)
// ---------------------------------------------------------------------------------------
// Typed fragment: { t: 'bool'|'sl'|'slv'|'uns'|'lit', c?: code, w?: width, v?: BigInt }

function vhSlLit(x, ctx) {
  if (x.v > 1n) ctx.error(`literal ${x.v} does not fit in 1 bit`);
  return x.v === 0n ? "'0'" : "'1'";
}
function vhNat(v, w) {
  if (v < 2n ** 31n) return v.toString();
  return `unsigned'("${bits(v, Math.max(w || 1, bitlen(v)))}")`;
}
function vhBool(x) {
  switch (x.t) {
    case 'bool': return x.c;
    case 'sl': return `(${x.c} = '1')`;
    case 'slv': return `(unsigned(${x.c}) /= 0)`;
    case 'uns': return `(${x.c} /= 0)`;
    case 'lit': return x.v !== 0n ? 'true' : 'false';
  }
  return 'false';
}
function vhUns(x, W, ctx) {
  switch (x.t) {
    case 'slv': return `unsigned(${x.c})`;
    case 'uns': return x.c;
    case 'sl': return `unsigned'(0 => ${x.c})`;
    case 'lit': return vhNat(x.v, W);
    default: ctx.error('a boolean (comparison) cannot be used as a number; use it as a condition instead'); return '0';
  }
}
function vhUnsW(x, W, ctx) { // unsigned of exactly W bits
  if (x.t === 'lit') return x.v < 2n ** 31n ? `to_unsigned(${x.v}, ${W})` : `unsigned'("${bits(x.v, W)}")`;
  const u = vhUns(x, W, ctx);
  return x.w === W ? u : `resize(${u}, ${W})`;
}

function vhExpr(ast, ctx) {
  switch (ast.k) {
    case 'lit': return { t: 'lit', v: ast.v, w: ast.w };
    case 'id': {
      const s = ctx.lookup(ast.name);
      if (!s) return { t: 'sl', c: ast.name, w: 1 };
      const c = s.registered ? `${s.name}_reg` : s.name;
      ctx.reads.add(c);
      return s.width === 1 ? { t: 'sl', c, w: 1 } : { t: 'slv', c, w: s.width };
    }
    case 'un': {
      const a = vhExpr(ast.a, ctx);
      if (ast.op === '!') return { t: 'bool', c: `(not ${vhBool(a)})` };
      if (ast.op === '~') {
        if (a.t === 'lit') {
          if (a.w == null) { ctx.error('~ needs a sized literal (e.g. ~4\'b0011)'); return a; }
          return { t: 'lit', v: (~a.v) & ((1n << BigInt(a.w)) - 1n), w: a.w };
        }
        return { ...a, c: `(not ${a.c})` };
      }
      // unary minus
      if (a.t === 'lit') { ctx.error('negative literals are not supported'); return a; }
      if (a.t === 'bool') { ctx.error('cannot negate a boolean'); return a; }
      return { t: 'uns', c: `(0 - ${vhUns(a, a.w, ctx)})`, w: a.w };
    }
    case 'bin': {
      const a = vhExpr(ast.a, ctx), b = vhExpr(ast.b, ctx);
      const op = ast.op;
      if (op === '&&' || op === '||') {
        return { t: 'bool', c: `(${vhBool(a)} ${op === '&&' ? 'and' : 'or'} ${vhBool(b)})` };
      }
      if (op === '&' || op === '|' || op === '^') {
        const vop = { '&': 'and', '|': 'or', '^': 'xor' }[op];
        if (a.t === 'bool' || b.t === 'bool') return { t: 'bool', c: `(${vhBool(a)} ${vop} ${vhBool(b)})` };
        if (a.t === 'lit' && b.t === 'lit') {
          const v = op === '&' ? a.v & b.v : op === '|' ? a.v | b.v : a.v ^ b.v;
          return { t: 'lit', v, w: a.w != null && b.w != null ? Math.max(a.w, b.w) : (a.w ?? b.w) };
        }
        const ws = [a, b].filter((x) => x.t !== 'lit').map((x) => x.w);
        const lw = [a, b].filter((x) => x.t === 'lit').map((x) => x.w ?? bitlen(x.v));
        const W = Math.max(...ws, ...lw);
        if (W === 1) {
          const s = (x) => (x.t === 'lit' ? vhSlLit(x, ctx) : x.c);
          return { t: 'sl', c: `(${s(a)} ${vop} ${s(b)})`, w: 1 };
        }
        if (a.t === 'slv' && b.t === 'slv' && a.w === b.w) return { t: 'slv', c: `(${a.c} ${vop} ${b.c})`, w: W };
        return { t: 'uns', c: `(${vhUnsW(a, W, ctx)} ${vop} ${vhUnsW(b, W, ctx)})`, w: W };
      }
      if (op === '+' || op === '-') {
        if (a.t === 'bool' || b.t === 'bool') { ctx.error(`'${op}' cannot be applied to a boolean`); return { t: 'uns', c: '0', w: 1 }; }
        if (a.t === 'lit' && b.t === 'lit') {
          const v = op === '+' ? a.v + b.v : a.v - b.v;
          if (v < 0n) ctx.error('negative constant result');
          return { t: 'lit', v: v < 0n ? 0n : v, w: null };
        }
        const W = Math.max(...[a, b].filter((x) => x.t !== 'lit').map((x) => x.w));
        return { t: 'uns', c: `(${vhUns(a, W, ctx)} ${op} ${vhUns(b, W, ctx)})`, w: W };
      }
      // comparisons
      const vop = { '==': '=', '!=': '/=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' }[op];
      if (a.t === 'bool' || b.t === 'bool') {
        if (op !== '==' && op !== '!=') ctx.error(`'${op}' cannot compare booleans`);
        return { t: 'bool', c: `(${vhBool(a)} ${vop} ${vhBool(b)})` };
      }
      if (a.t === 'lit' && b.t === 'lit') {
        const r = { '==': a.v === b.v, '!=': a.v !== b.v, '<': a.v < b.v, '>': a.v > b.v, '<=': a.v <= b.v, '>=': a.v >= b.v }[op];
        return { t: 'bool', c: r ? 'true' : 'false' };
      }
      const oneBit = (x) => x.t === 'sl' || (x.t === 'lit' && x.v <= 1n && (x.w == null || x.w === 1));
      if (oneBit(a) && oneBit(b)) {
        const s = (x) => (x.t === 'lit' ? vhSlLit(x, ctx) : x.c);
        return { t: 'bool', c: `(${s(a)} ${vop} ${s(b)})` };
      }
      const W = Math.max(...[a, b].filter((x) => x.t !== 'lit').map((x) => x.w));
      for (const x of [a, b]) if (x.t === 'lit' && bitlen(x.v) > W) ctx.warn(`literal ${x.v} is wider than the ${W}-bit operand it is compared with`);
      return { t: 'bool', c: `(${vhUns(a, W, ctx)} ${vop} ${vhUns(b, W, ctx)})` };
    }
  }
  return { t: 'lit', v: 0n, w: null };
}

function vhOne(w) { return w === 1 ? "'1'" : `"${bits(1n, w)}"`; }
function vhZero(w) { return w === 1 ? "'0'" : `"${'0'.repeat(w)}"`; }
function vhLitW(v, w) { return w === 1 ? (v & 1n ? "'1'" : "'0'") : `"${bits(v, w)}"`; }

/** VHDL statements assigning `ast` to signal `sig` of width `w`. */
function vhAssign(sig, w, ast, ctx) {
  const x = vhExpr(ast, ctx);
  switch (x.t) {
    case 'lit':
      if (bitlen(x.v) > w) ctx.warn(`value ${x.v} is truncated to ${w} bit(s)`);
      return [{ s: 'raw', text: `${sig} <= ${vhLitW(x.v, w)};` }];
    case 'sl':
      return [{ s: 'raw', text: `${sig} <= ${w === 1 ? stripParens(x.c) : `(0 => ${x.c}, others => '0')`};` }];
    case 'slv':
      if (w === 1) { ctx.error(`cannot assign a ${x.w}-bit value to a 1-bit output; compare it instead (e.g. x /= 0)`); return []; }
      if (x.w > w) ctx.warn(`${x.w}-bit value is truncated to ${w} bits`);
      return [{ s: 'raw', text: `${sig} <= ${x.w === w ? stripParens(x.c) : `std_logic_vector(resize(unsigned(${x.c}), ${w}))`};` }];
    case 'uns':
      if (w === 1) { ctx.error(`cannot assign a ${x.w}-bit arithmetic result to a 1-bit output; compare it instead`); return []; }
      if (x.w > w) ctx.warn(`${x.w}-bit value is truncated to ${w} bits`);
      return [{ s: 'raw', text: `${sig} <= std_logic_vector(${x.w === w ? stripParens(x.c) : `resize(${x.c}, ${w})`});` }];
    case 'bool':
      return [{ s: 'if', cond: stripParens(x.c), then: [{ s: 'raw', text: `${sig} <= ${vhOne(w)};` }],
        else: [{ s: 'raw', text: `${sig} <= ${vhZero(w)};` }] }];
  }
  return [];
}

function vhNot(c) {
  let m;
  if ((m = /^([A-Za-z_][A-Za-z0-9_]*) = '([01])'$/.exec(c))) return `${m[1]} = '${m[2] === '1' ? '0' : '1'}'`;
  if ((m = /^not \((.*)\)$/.exec(c)) && stripParens(`(${m[1]})`) === m[1]) return m[1];
  return `not (${c})`;
}

// ---------------------------------------------------------------------------------------
// Verilog expression emission
// ---------------------------------------------------------------------------------------

function vlLit(l) {
  if (l.w == null) return l.v.toString();
  if (l.base === 'h') return `${l.w}'h${l.v.toString(16).toUpperCase()}`;
  if (l.base === 'd' || l.base === 'o') return `${l.w}'d${l.v}`;
  return `${l.w}'b${bits(l.v, l.w)}`;
}
function vlLitW(v, w, base) {
  if (w === 1) return `1'b${v & 1n}`;
  const mv = v & ((1n << BigInt(w)) - 1n);
  if (base === 'b') return `${w}'b${bits(mv, w)}`;
  if (base === 'h') return `${w}'h${mv.toString(16).toUpperCase()}`;
  return `${w}'d${mv}`;
}
function vlExpr(ast, ctx) {
  switch (ast.k) {
    case 'lit': return vlLit(ast);
    case 'id': {
      const s = ctx.lookup(ast.name);
      const c = s?.registered ? `${s.name}_reg` : ast.name;
      ctx.reads.add(c);
      return c;
    }
    case 'un': {
      const a = vlExpr(ast.a, ctx);
      return `${ast.op}${isAtom(a) || a.startsWith('(') ? a : `(${a})`}`;
    }
    case 'bin': return `(${vlExpr(ast.a, ctx)} ${ast.op} ${vlExpr(ast.b, ctx)})`;
  }
  return '0';
}
function vlNot(c) {
  if (isAtom(c)) return `!${c}`;
  let m;
  if ((m = /^!(.*)$/.exec(c)) && (isAtom(m[1]) || stripParens(m[1]) !== m[1])) return stripParens(m[1]);
  return `!(${c})`;
}
function vlAssign(sig, w, ast, ctx) {
  if (ast.k === 'lit') return [{ s: 'raw', text: `${sig} = ${vlLitW(ast.v, w, ast.base)};` }];
  return [{ s: 'raw', text: `${sig} = ${stripParens(vlExpr(ast, ctx))};` }];
}

// ---------------------------------------------------------------------------------------
// Analysis (shared by validate and the generators)
// ---------------------------------------------------------------------------------------

function analyze(model) {
  const m = normalizeModel(model);
  const diags = [];
  const add = (severity, message, nodeId) => diags.push(nodeId ? { severity, message, nodeId } : { severity, message });
  const err = (msg, id) => add('error', msg, id);
  const warn = (msg, id) => add('warning', msg, id);

  // ---- names --------------------------------------------------------------------------
  const checkName = (name, what, nodeId) => {
    if (!name) { err(`${what} has no name`, nodeId); return false; }
    if (!isIdentifier(name)) { err(`${what} '${name}' is not a valid identifier (letters, digits, single '_', must start with a letter)`, nodeId); return false; }
    const r = reservedIn(name);
    if (r.length) { err(`${what} '${name}' is a reserved word in ${r.join(' and ')}`, nodeId); return false; }
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

  const syms = new Map();
  const ports = [...m.inputs.map((p) => ({ ...p, dir: 'in' })), ...m.outputs.map((p) => ({ ...p, dir: 'out' }))];
  for (const p of ports) {
    const what = p.dir === 'in' ? 'Input' : 'Output';
    if (!checkName(p.name, what)) continue;
    if (!Number.isInteger(p.width) || p.width < 1 || p.width > 256) { err(`${what} '${p.name}' has invalid width ${p.width} (1..256)`); continue; }
    claim(p.name, what);
    if (p.dir === 'out' && p.registered) { claim(`${p.name}_reg`, 'Internal register'); claim(`${p.name}_next`, 'Internal signal'); }
    syms.set(p.name, { name: p.name, width: p.width, kind: p.dir === 'in' ? 'input' : 'output', registered: p.dir === 'out' && p.registered });
  }
  // output defaults
  const defaults = new Map();
  for (const o of m.outputs) {
    if (!syms.has(o.name)) continue;
    const r = parseCondition(o.default);
    if (r.error || r.ast.k !== 'lit') { err(`Output '${o.name}': default value '${o.default}' must be a literal (e.g. 0, 1, 4'b1010, "1010")`); defaults.set(o.name, 0n); continue; }
    if (bitlen(r.ast.v) > o.width) warn(`Output '${o.name}': default value '${o.default}' is truncated to ${o.width} bit(s)`);
    defaults.set(o.name, r.ast.v);
  }

  // ---- graph --------------------------------------------------------------------------
  const idx = buildIndex(m);
  const seenIds = new Set();
  for (const n of m.nodes) {
    if (seenIds.has(n.id)) err(`Duplicate node id '${n.id}'`, n.id);
    seenIds.add(n.id);
  }
  const states = m.nodes.filter((n) => n.type === 'state');
  if (!states.length) err('The chart has no states');
  const stateNames = new Map();
  for (const s of states) {
    if (!checkName(s.name, 'State', s.id)) continue;
    const k = s.name.toLowerCase();
    if (stateNames.has(k)) { err(`Duplicate state name '${s.name}'`, s.id); continue; }
    stateNames.set(k, s.id);
    claim(`S_${s.name}`, `State constant`, s.id);
  }
  if (!m.initial) err('No initial (reset) state selected');
  else if (!idx.nodes.has(m.initial) || idx.nodes.get(m.initial).type !== 'state') err(`Initial state '${m.initial}' is not a state of the chart`);

  for (const e of idx.badEdges) {
    const from = idx.nodes.get(e.from);
    if (!from || !idx.nodes.has(e.to)) err(`Edge '${e.id}' refers to a missing node`, from ? from.id : undefined);
    else err(`Edge '${e.id}' uses port '${e.port}' which a ${from.type} box does not have`, from.id);
  }
  for (const e of idx.dupExits) {
    const from = idx.nodes.get(e.from);
    err(`${describe(from)} has more than one '${normPort(e.port, from.type)}' exit`, from.id);
  }

  // exits per node
  for (const n of m.nodes) {
    const ex = idx.exits.get(n.id) || {};
    if (n.type === 'decision') {
      if (!ex.true && !ex.false) err(`${describe(n)} has no exits (needs a 1 and a 0 branch)`, n.id);
      else if (!ex.true) err(`${describe(n)} has no 1 (true) branch`, n.id);
      else if (!ex.false) err(`${describe(n)} has no 0 (false) branch`, n.id);
      if (ex.true && ex.false && ex.true.to === ex.false.to) warn(`${describe(n)}: both branches go to the same box (the decision has no effect)`, n.id);
    } else if (!ex.next) {
      err(`${describe(n)} has no exit${n.type === 'state' ? ' (next state path)' : ''}`, n.id);
    }
  }

  const trees = blockTrees(m, idx);
  const inBlock = new Map(); // node id -> [state ids]
  for (const [sid, tree] of trees) {
    for (const id of treeNodes(tree)) { if (!inBlock.has(id)) inBlock.set(id, []); inBlock.get(id).push(sid); }
    const loops = new Set();
    (function findLoops(t) {
      if (t.k === 'loop' && !loops.has(t.id)) { loops.add(t.id); err(`Loop through decision/output boxes without a state (in the block of state '${idx.nodes.get(sid).name}')`, t.id); }
      if (t.k === 'if') { findLoops(t.t); findLoops(t.f); }
      if (t.k === 'act') findLoops(t.next);
    })(tree);
  }
  for (const n of m.nodes) {
    if (n.type === 'state') continue;
    const owners = inBlock.get(n.id);
    if (!owners) warn(`${describe(n)} cannot be reached from any state`, n.id);
    else if (owners.length > 1) {
      add('info', `${describe(n)} is shared by the blocks of ${owners.map((id) => idx.nodes.get(id).name).join(', ')} (logic will be duplicated per state)`, n.id);
    }
  }

  // reachability of states from the initial state
  if (idx.nodes.get(m.initial)?.type === 'state') {
    const seen = new Set([m.initial]);
    const q = [m.initial];
    while (q.length) {
      const s = q.shift();
      for (const t of flatten(trees.get(s))) if (t.next && !seen.has(t.next)) { seen.add(t.next); q.push(t.next); }
    }
    for (const s of states) if (!seen.has(s.id)) warn(`State '${s.name}' is unreachable from the initial state`, s.id);
  }

  // ---- expressions --------------------------------------------------------------------
  const makeCtx = (nodeId, where) => ({
    reads: new Set(),
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
      err(`${where}: '${name}' is not a declared input${ci ? ` (did you mean '${ci}'?)` : ''}`, nodeId);
      return null;
    },
    error(msg) { err(`${where}: ${msg}`, nodeId); },
    warn(msg) { warn(`${where}: ${msg}`, nodeId); },
  });

  const parsedConds = new Map();
  const parsedActions = new Map(); // nodeId -> [{target, ast, text}]
  for (const n of m.nodes) {
    if (n.type === 'decision') {
      const where = `Decision '${n.cond || '?'}'`;
      if (!n.cond.trim()) { err('Decision box has no condition', n.id); continue; }
      const r = parseCondition(n.cond);
      if (r.error) { err(`${where}: ${r.error}`, n.id); continue; }
      parsedConds.set(n.id, r.ast);
      vhExpr(r.ast, makeCtx(n.id, where));
    } else {
      const list = [];
      const assigned = new Map();
      for (const a of n.actions) {
        const where = `${n.type === 'state' ? `State '${n.name}'` : 'Conditional output'} action '${a}'`;
        const r = parseAction(a);
        if (r.error) { err(`${where}: ${r.error}`, n.id); continue; }
        const s = syms.get(r.target);
        if (!s || s.kind !== 'output') {
          const isIn = s && s.kind === 'input';
          err(`${where}: '${r.target}' is ${isIn ? 'an input and cannot be assigned' : 'not a declared output'}`, n.id);
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

  return { m, diags, idx, trees, syms, defaults, parsedConds, parsedActions };
}

function describe(n) {
  if (!n) return 'Box';
  if (n.type === 'state') return `State '${n.name || n.id}'`;
  if (n.type === 'decision') return `Decision '${n.cond || n.id}'`;
  return `Conditional output box${n.actions?.length ? ` '${n.actions[0]}${n.actions.length > 1 ? ', ...' : ''}'` : ''}`;
}

/** Validate a model. Returns [{ severity: 'error'|'warning'|'info', message, nodeId? }]. */
export function validate(model) {
  const { diags } = analyze(model);
  const rank = { error: 0, warning: 1, info: 2 };
  return diags.map((d, i) => [d, i]).sort((a, b) => rank[a[0].severity] - rank[b[0].severity] || a[1] - b[1]).map(([d]) => d);
}

// ---------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------

function prepare(model) {
  const a = analyze(model);
  const errors = a.diags.filter((d) => d.severity === 'error');
  if (errors.length) {
    const e = new Error(`ASM chart '${a.m.name}' has ${errors.length} error(s):\n` + errors.map((d) => `  - ${d.message}`).join('\n'));
    e.diagnostics = a.diags;
    throw e;
  }
  a.enc = stateEncoding(a.m);
  a.encById = new Map(a.enc.map((s) => [s.id, s]));
  return a;
}

// Statement trees -> language-neutral statement lists
function nextStmts(tree, B) {
  switch (tree.k) {
    case 'goto': return [{ s: 'raw', text: B.setState(`S_${tree.name}`) }];
    case 'act': return nextStmts(tree.next, B);
    case 'if': {
      const t = nextStmts(tree.t, B), f = nextStmts(tree.f, B);
      if (JSON.stringify(t) === JSON.stringify(f)) return t;
      return [{ s: 'if', cond: B.cond(tree.node.id), then: t, else: f }];
    }
  }
  return [];
}
function outStmts(tree, B) {
  switch (tree.k) {
    case 'act': return [...B.actions(tree.node.id), ...outStmts(tree.next, B)];
    case 'if': {
      const t = outStmts(tree.t, B), f = outStmts(tree.f, B);
      if (!t.length && !f.length) return [];
      if (JSON.stringify(t) === JSON.stringify(f)) return t;
      if (!t.length) return [{ s: 'if', cond: B.not(B.cond(tree.node.id)), then: f, else: [] }];
      return [{ s: 'if', cond: B.cond(tree.node.id), then: t, else: f }];
    }
  }
  return [];
}

function printStmts(stmts, ind, lang, out) {
  const I = '    '.repeat(ind);
  for (const st of stmts) {
    if (st.s === 'raw') { out.push(I + st.text); continue; }
    if (lang === 'vhdl') {
      out.push(`${I}if ${st.cond} then`);
      printStmts(st.then, ind + 1, lang, out);
      let els = st.else;
      while (els.length === 1 && els[0].s === 'if') {
        out.push(`${I}elsif ${els[0].cond} then`);
        printStmts(els[0].then, ind + 1, lang, out);
        els = els[0].else;
      }
      if (els.length) { out.push(`${I}else`); printStmts(els, ind + 1, lang, out); }
      out.push(`${I}end if;`);
    } else {
      out.push(`${I}if (${st.cond}) begin`);
      printStmts(st.then, ind + 1, lang, out);
      let els = st.else;
      while (els.length === 1 && els[0].s === 'if') {
        out.push(`${I}end else if (${els[0].cond}) begin`);
        printStmts(els[0].then, ind + 1, lang, out);
        els = els[0].else;
      }
      if (els.length) { out.push(`${I}end else begin`); printStmts(els, ind + 1, lang, out); }
      out.push(`${I}end`);
    }
  }
  return out;
}

function headerLines(a, lang) {
  const { m, enc } = a;
  const c = lang === 'vhdl' ? '--' : '//';
  const rule = c + '='.repeat(78);
  const L = [];
  L.push(rule);
  L.push(`${c} ${lang === 'vhdl' ? 'Entity' : 'Module'}      : ${m.name}`);
  L.push(`${c} Description : finite state machine generated from the ASM chart ${m.name}.asm.json`);
  if (m.description) L.push(`${c}               ${m.description}`);
  L.push(`${c} Generator   : XAIlinx ASM editor, kept in sync with the chart (edit either one).`);
  L.push(`${c} Style       : state register + next-state logic + output logic (latch-free)`);
  L.push(`${c} Clock       : ${m.clock} (rising edge)`);
  L.push(`${c} Reset       : ${m.reset.name}, active-${m.reset.active}, ${m.reset.sync ? 'synchronous' : 'asynchronous'}`);
  L.push(`${c} Encoding    : ${m.encoding}${m.encoding === 'enum' ? '' : ` (${enc[0]?.width ?? 0} state bit${enc[0]?.width === 1 ? '' : 's'})`}`);
  L.push(c);
  L.push(`${c} States:`);
  const nw = Math.max(...enc.map((s) => s.name.length), 4);
  for (const s of enc) {
    const node = a.idx.nodes.get(s.id);
    const code = m.encoding === 'enum' && lang === 'vhdl' ? '' : ` = ${s.bits}`;
    const moore = node.actions.length ? `  Moore: ${node.actions.join(', ')}` : '';
    L.push(`${c}   ${pad(s.name, nw)}${code}${s.id === m.initial ? '  (reset)' : '         '}${moore}`.trimEnd());
  }
  L.push(c);
  L.push(`${c} Transitions (condition -> next state [Mealy outputs]):`);
  for (const s of enc) {
    const ts = flatten(a.trees.get(s.id));
    for (const t of ts) {
      const simple = (x) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(x.cond.trim());
      const cond = t.conditions.length
        ? t.conditions.map((x) => (simple(x) ? `${x.value ? '' : '!'}${x.cond.trim()}` : `${x.value ? '' : '!'}(${x.cond.trim()})`)).join(' && ')
        : 'always';
      const mealy = t.mealyActions.length ? `  [${t.mealyActions.map((x) => x.action).join(', ')}]` : '';
      L.push(`${c}   ${pad(s.name, nw)} : ${cond} -> ${t.nextName}${mealy}`);
    }
  }
  const regs = m.outputs.filter((o) => o.registered);
  if (regs.length) {
    L.push(c);
    L.push(`${c} Registered outputs (${regs.map((o) => o.name).join(', ')}) load the value assigned in the`);
    L.push(`${c} current state/path at the clock edge and hold it otherwise.`);
  }
  L.push(rule);
  return L;
}

function makeBackend(a, lang) {
  const condCache = new Map();
  const reads = new Set();
  const ctxFor = () => ({
    reads,
    lookup: (name) => a.syms.get(name) || null,
    error() {}, warn() {},
  });
  const sigOf = (name) => (a.syms.get(name).registered ? `${name}_next` : name);
  return {
    reads,
    setState: (cn) => (lang === 'vhdl' ? `state_next <= ${cn};` : `state_next = ${cn};`),
    cond(id) {
      if (!condCache.has(id)) {
        const ast = a.parsedConds.get(id);
        const code = lang === 'vhdl' ? stripParens(vhBool(vhExpr(ast, ctxFor()))) : stripParens(vlExpr(ast, ctxFor()));
        condCache.set(id, code);
      }
      // re-register reads for this use (cache shares the same reads set anyway)
      return condCache.get(id);
    },
    not: (c) => (lang === 'vhdl' ? vhNot(c) : vlNot(c)),
    actions(id) {
      const out = [];
      for (const act of a.parsedActions.get(id) || []) {
        const s = a.syms.get(act.target);
        out.push(...(lang === 'vhdl' ? vhAssign(sigOf(act.target), s.width, act.ast, ctxFor()) : vlAssign(sigOf(act.target), s.width, act.ast, ctxFor())));
      }
      return out;
    },
  };
}

function orderedReads(a, set) {
  const order = [];
  for (const i of a.m.inputs) if (set.has(i.name)) order.push(i.name);
  for (const o of a.m.outputs) if (o.registered && set.has(`${o.name}_reg`)) order.push(`${o.name}_reg`);
  return order;
}

/** Generate a synthesizable Verilog-2001 module. Throws if the chart has errors. */
export function generateVerilog(model) {
  const a = prepare(model);
  const { m, enc } = a;
  const W = enc[0].width;
  const rst = m.reset.name;
  const rstActive = m.reset.active === 'high' ? rst : `!${rst}`;
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const L = headerLines(a, 'verilog');
  L.push('');
  L.push(`module ${m.name} (`);
  const portLines = [];
  const vw = Math.max(0, ...[...m.inputs, ...m.outputs].map((p) => vec(p.width).length));
  portLines.push(`    input  wire ${pad('', vw)}${m.clock}`);
  portLines.push(`    input  wire ${pad('', vw)}${rst}`);
  for (const p of m.inputs) portLines.push(`    input  wire ${pad(vec(p.width), vw)}${p.name}`);
  for (const p of m.outputs) portLines.push(`    output ${p.registered ? 'wire' : 'reg '} ${pad(vec(p.width), vw)}${p.name}`);
  L.push(portLines.map((l, i) => l + (i < portLines.length - 1 ? ',' : '')).join('\n'));
  L.push(');');
  L.push('');
  L.push('    // ---------------------------------------------------------------- state encoding');
  const cw = Math.max(...enc.map((s) => s.constName.length));
  for (const s of enc) L.push(`    localparam ${vec(W)}${pad(s.constName, cw)} = ${W}'b${s.bits};`);
  L.push('');
  L.push(`    reg ${vec(W)}state_reg;`);
  if (m.encoding !== 'enum') L.push('    // synthesis attribute fsm_encoding of state_reg is user');
  L.push(`    reg ${vec(W)}state_next;`);
  const regs = m.outputs.filter((o) => o.registered);
  if (regs.length) {
    L.push('');
    L.push('    // ---------------------------------------------------------------- output registers');
    for (const o of regs) L.push(`    reg ${vec(o.width)}${o.name}_reg, ${o.name}_next;`);
    for (const o of regs) L.push(`    assign ${o.name} = ${o.name}_reg;`);
  }
  // state register
  L.push('');
  L.push('    // ---------------------------------------------------------------- state register');
  const edge = m.reset.sync ? `posedge ${m.clock}` : `posedge ${m.clock} or ${m.reset.active === 'high' ? 'posedge' : 'negedge'} ${rst}`;
  L.push(`    always @(${edge}) begin`);
  L.push(`        if (${rstActive}) begin`);
  L.push(`            state_reg <= ${enc[0].constName};`);
  for (const o of regs) L.push(`            ${o.name}_reg <= ${vlLitW(a.defaults.get(o.name), o.width, 'd')};`);
  L.push('        end else begin');
  L.push('            state_reg <= state_next;');
  for (const o of regs) L.push(`            ${o.name}_reg <= ${o.name}_next;`);
  L.push('        end');
  L.push('    end');

  // next-state logic
  const B = makeBackend(a, 'verilog');
  L.push('');
  L.push('    // ---------------------------------------------------------------- next-state logic');
  L.push('    always @(*) begin');
  L.push('        state_next = state_reg;');
  L.push('        case (state_reg)');
  for (const s of enc) {
    const st = nextStmts(a.trees.get(s.id), B);
    if (st.length === 1 && st[0].s === 'raw') { L.push(`            ${s.constName}: ${st[0].text}`); continue; }
    L.push(`            ${s.constName}: begin`);
    printStmts(st, 4, 'verilog', L);
    L.push('            end');
  }
  L.push(`            default: state_next = ${enc[0].constName};`);
  L.push('        endcase');
  L.push('    end');

  // output logic
  if (m.outputs.length) {
    L.push('');
    L.push('    // ---------------------------------------------------------------- output logic');
    L.push('    always @(*) begin');
    L.push('        // default values (every output is assigned on every path: no latches)');
    for (const o of m.outputs) {
      if (o.registered) L.push(`        ${o.name}_next = ${o.name}_reg;`);
      else L.push(`        ${o.name} = ${vlLitW(a.defaults.get(o.name), o.width, 'd')};`);
    }
    const items = [];
    for (const s of enc) {
      const st = [...B.actions(s.id), ...outStmts(a.trees.get(s.id), B)];
      if (st.length) items.push([s, st]);
    }
    if (items.length) {
      L.push('        case (state_reg)');
      for (const [s, st] of items) {
        L.push(`            ${s.constName}: begin`);
        printStmts(st, 4, 'verilog', L);
        L.push('            end');
      }
      L.push('            default: ;');
      L.push('        endcase');
    }
    L.push('    end');
  }
  L.push('');
  L.push('endmodule');
  L.push('');
  return L.join('\n');
}

/** Generate a synthesizable VHDL-93 entity/architecture. Throws if the chart has errors. */
export function generateVhdl(model) {
  const a = prepare(model);
  const { m, enc } = a;
  const W = enc[0].width;
  const rst = m.reset.name;
  const typ = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const L = headerLines(a, 'vhdl');
  L.push('');
  L.push('library ieee;');
  L.push('use ieee.std_logic_1164.all;');
  L.push('use ieee.numeric_std.all;');
  L.push('');
  L.push(`entity ${m.name} is`);
  L.push('    port (');
  const ports = [[m.clock, 'in ', 'std_logic'], [rst, 'in ', 'std_logic'],
    ...m.inputs.map((p) => [p.name, 'in ', typ(p.width)]), ...m.outputs.map((p) => [p.name, 'out', typ(p.width)])];
  const pw = Math.max(...ports.map((p) => p[0].length));
  ports.forEach((p, i) => L.push(`        ${pad(p[0], pw)} : ${p[1]} ${p[2]}${i < ports.length - 1 ? ';' : ''}`));
  L.push('    );');
  L.push(`end entity ${m.name};`);
  L.push('');
  L.push(`architecture rtl of ${m.name} is`);
  L.push('');
  L.push('    -- state encoding');
  if (m.encoding === 'enum') {
    L.push(`    type state_t is (${enc.map((s) => s.constName).join(', ')});`);
  } else {
    L.push(`    subtype state_t is std_logic_vector(${W - 1} downto 0);`);
    const cw = Math.max(...enc.map((s) => s.constName.length));
    for (const s of enc) L.push(`    constant ${pad(s.constName, cw)} : state_t := "${s.bits}";`);
  }
  L.push('');
  L.push('    signal state_reg  : state_t;');
  L.push('    signal state_next : state_t;');
  if (m.encoding !== 'enum') {
    L.push('');
    L.push('    attribute fsm_encoding : string;');
    L.push('    attribute fsm_encoding of state_reg : signal is "user";');
  }
  const regs = m.outputs.filter((o) => o.registered);
  if (regs.length) {
    L.push('');
    L.push('    -- output registers');
    for (const o of regs) L.push(`    signal ${o.name}_reg, ${o.name}_next : ${typ(o.width)};`);
  }
  L.push('');
  L.push('begin');
  L.push('');
  // state register
  const rstCond = `${rst} = '${m.reset.active === 'high' ? 1 : 0}'`;
  L.push('    -- ------------------------------------------------------------------ state register');
  const resetBody = [`state_reg <= ${enc[0].constName};`, ...regs.map((o) => `${o.name}_reg <= ${vhLitW(a.defaults.get(o.name), o.width)};`)];
  const loadBody = ['state_reg <= state_next;', ...regs.map((o) => `${o.name}_reg <= ${o.name}_next;`)];
  if (m.reset.sync) {
    L.push(`    state_register : process (${m.clock})`);
    L.push('    begin');
    L.push(`        if rising_edge(${m.clock}) then`);
    L.push(`            if ${rstCond} then`);
    for (const l of resetBody) L.push(`                ${l}`);
    L.push('            else');
    for (const l of loadBody) L.push(`                ${l}`);
    L.push('            end if;');
    L.push('        end if;');
  } else {
    L.push(`    state_register : process (${m.clock}, ${rst})`);
    L.push('    begin');
    L.push(`        if ${rstCond} then`);
    for (const l of resetBody) L.push(`            ${l}`);
    L.push(`        elsif rising_edge(${m.clock}) then`);
    for (const l of loadBody) L.push(`            ${l}`);
    L.push('        end if;');
  }
  L.push('    end process state_register;');

  // next-state logic
  const Bn = makeBackend(a, 'vhdl');
  const body = [];
  for (const s of enc) {
    body.push(`            when ${s.constName} =>`);
    printStmts(nextStmts(a.trees.get(s.id), Bn), 4, 'vhdl', body);
  }
  body.push('            when others =>');
  body.push(`                state_next <= ${enc[0].constName};`);
  L.push('');
  L.push('    -- ------------------------------------------------------------------ next-state logic');
  L.push(`    next_state_logic : process (${['state_reg', ...orderedReads(a, Bn.reads)].join(', ')})`);
  L.push('    begin');
  L.push('        state_next <= state_reg;');
  L.push('        case state_reg is');
  L.push(...body);
  L.push('        end case;');
  L.push('    end process next_state_logic;');

  // output logic
  if (m.outputs.length) {
    const Bo = makeBackend(a, 'vhdl');
    const items = [];
    for (const s of enc) {
      const st = [...Bo.actions(s.id), ...outStmts(a.trees.get(s.id), Bo)];
      if (st.length) items.push([s, st]);
    }
    for (const o of regs) Bo.reads.add(`${o.name}_reg`);
    L.push('');
    L.push('    -- ------------------------------------------------------------------ output logic');
    L.push(`    output_logic : process (${['state_reg', ...orderedReads(a, Bo.reads)].join(', ')})`);
    L.push('    begin');
    L.push('        -- default values (every output is assigned on every path: no latches)');
    for (const o of m.outputs) {
      if (o.registered) L.push(`        ${o.name}_next <= ${o.name}_reg;`);
      else L.push(`        ${o.name} <= ${vhLitW(a.defaults.get(o.name), o.width)};`);
    }
    if (items.length) {
      L.push('        case state_reg is');
      for (const [s, st] of items) {
        L.push(`            when ${s.constName} =>`);
        printStmts(st, 4, 'vhdl', L);
      }
      L.push('            when others =>');
      L.push('                null;');
      L.push('        end case;');
    }
    L.push('    end process output_logic;');
  }
  if (regs.length) {
    L.push('');
    for (const o of regs) L.push(`    ${o.name} <= ${o.name}_reg;`);
  }
  L.push('');
  L.push('end architecture rtl;');
  L.push('');
  return L.join('\n');
}

/** Convenience: generate code for model.lang (or `lang`). Returns { lang, filename, code }. */
export function generate(model, lang) {
  const l = lang || (model && model.lang) || 'vhdl';
  const name = (model && model.name) || 'fsm';
  return l === 'verilog'
    ? { lang: 'verilog', filename: `${name}.v`, code: generateVerilog(model) }
    : { lang: 'vhdl', filename: `${name}.vhd`, code: generateVhdl(model) };
}
