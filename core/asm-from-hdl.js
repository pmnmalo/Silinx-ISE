// Silinx - recover an ASM chart from a VHDL/Verilog finite state machine.
//
// Isomorphic ES module: no DOM and no Node APIs.
//
//   asmFromHdl(source, { path, module, lang, previous }) -> { model, warnings }
//       Parse one HDL file and rebuild the ASM chart (see core/asm.js for the model) of the
//       state machine described by `module` (default: the first module/entity of the file).
//       Throws an Error whose message says, in user terms, why the module is not a pure state
//       machine (e.g. "process at line 40 is not part of the state machine").
//       `previous` (optional) is an existing chart of the same machine: its node ids, positions,
//       edge points, texts (conditions/actions written differently but meaning the same),
//       output defaults, encoding and name are kept wherever the extracted machine matches.
//   asmLayout(model)            -> copy of the model with x/y assigned (top-down layout)
//   sameAsmStructure(a, b)      -> true if both charts describe the same machine (positions,
//                                  ids and the spelling of equivalent expressions ignored)
//
// What is recognised (VHDL and Verilog):
//   * everything generateVhdl/generateVerilog (core/asm.js) produce, for all encodings;
//     regenerating from the extracted chart reproduces the file exactly (the generator header
//     is used to recover the original spelling of conditions/actions, the description and
//     the encoding);
//   * hand-written 1-, 2- and 3-process machines: a clocked process with an asynchronous or
//     synchronous reset (active high or low) that loads the state register (from a next-state
//     signal, or directly from a `case` on the state = 1-process style), combinational
//     processes with `case`/`if` on the state, concurrent `o <= '1' when state = S else '0'`
//     / `assign o = (state == S)` outputs and `with state select` assignments; VHDL enum
//     state types, VHDL constants and Verilog parameter/localparam state codes;
//   * if/elsif/else chains and nested ifs on inputs become decision boxes (one per condition,
//     an elsif chain is a chain of decisions on the false branch); `case` on an input becomes
//     a chain of decisions (`sel == 2'b01`); default assignments before the case become output
//     defaults; outputs assigned in the clocked process (or through `<name>_reg/_next`
//     signals) become registered outputs (ASMD semantics: they hold when not assigned).
//
// Normalisations (the extracted chart is equivalent, not always textually identical):
//   * expressions are rewritten in the ASM syntax (C-like): VHDL `x = '1'` in a condition
//     becomes `x`, `unsigned(cnt) = 9` becomes `cnt == 9`, type conversions are dropped;
//   * state names are the constant names without the `S_` prefix (VHDL enum literals as-is);
//   * unconditional assignments at the start of a state are Moore actions; assignments under
//     a condition are conditional output boxes; output defaults are inferred when the code
//     assigns an output in every state instead of giving it a default;
//   * the `when others`/`default` branch of the state case is ignored (unreachable states).

import { parse as parseVhdl } from './vhdl/parser.js';
import { parse as parseVerilog } from './verilog/parser.js';
import {
  normalizeModel, validate, generate, parseCondition, parseAction, exprToString, extractTransitions,
  extractAlwaysBlocks, asmJoinPoints,
} from './asm.js';

// ---------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------

const clone = (o) => JSON.parse(JSON.stringify(o));
const lineOf = (loc) => (loc && loc.line ? loc.line : null);
const atLine = (loc) => (lineOf(loc) ? ` at line ${loc.line}` : '');

function fail(msg) { throw new Error(msg); }

/** Flatten a statement (block / array / single statement) into a statement list. */
function stmtList(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s.flatMap(stmtList);
  if (s.kind === 'block') {
    if (s.decls && s.decls.length) fail(`block${atLine(s.loc)} declares local variables, which a state machine chart cannot express`);
    return s.stmts.flatMap(stmtList);
  }
  return [s];
}

/** Visit every statement (recursively) of a statement list. */
function walkStmts(list, fn) {
  for (const st of stmtList(list)) {
    fn(st);
    if (st.kind === 'if') { walkStmts(st.then, fn); walkStmts(st.else, fn); }
    else if (st.kind === 'case') { for (const it of st.items) walkStmts(it.body, fn); walkStmts(st.default, fn); }
    else if (st.body) walkStmts(st.body, fn);
  }
}

/** Visit every sub-expression of an IR expression. */
function walkExpr(e, fn) {
  if (!e || typeof e !== 'object') return;
  fn(e);
  for (const k of ['a', 'b', 'cond', 'then', 'else', 'base', 'index', 'left', 'right', 'expr', 'value', 'prefix', 'count']) {
    if (e[k] && typeof e[k] === 'object' && e[k].op) walkExpr(e[k], fn);
  }
  for (const k of ['args', 'parts']) if (Array.isArray(e[k])) for (const x of e[k]) walkExpr(x && x.op ? x : x?.value, fn);
  if (e.op === 'aggregate') for (const it of e.items) walkExpr(it.value, fn);
}

/** Strip VHDL type conversions: std_logic_vector(x), unsigned(x). */
function stripConv(e) {
  while (e && e.op === 'apply' && ['std_logic_vector', 'unsigned'].includes(e.name) && e.args.length === 1 && e.args[0]?.op) e = e.args[0];
  return e;
}

function bitsValue(bits, where) {
  if (/[^01]/.test(bits)) fail(`${where}: literals with x/z/- digits are not supported in a state machine chart`);
  return bits ? BigInt('0b' + bits) : 0n;
}
const lit = (v, w = null, base = 'd') => ({ k: 'lit', v, w, base });

/** Evaluate a constant integer expression (port widths, parameters). */
function evalInt(e, consts) {
  if (!e) return null;
  switch (e.op) {
    case 'int': return BigInt(e.value);
    case 'lit': return /[^01]/.test(e.bits) ? null : bitsValue(e.bits, '');
    case 'ref': { const c = consts.get(e.name); return c ? c.value : null; }
    case 'unary': { const a = evalInt(e.a, consts); return a == null ? null : e.o === '-' ? -a : e.o === '+' ? a : null; }
    case 'binary': {
      const a = evalInt(e.a, consts), b = evalInt(e.b, consts);
      if (a == null || b == null) return null;
      switch (e.o) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b ? a / b : null; case '**': return a ** b;
      }
    }
  }
  return null;
}

/** VHDL identifiers are lower-cased by the parser: map them back to their spelling in the code. */
function vhdlCaseMap(src) {
  const map = new Map();
  const text = src.replace(/--[^\n]*/g, ' ').replace(/[bBoOxX]?"[^"\n]*"/g, ' ').replace(/'.'/g, ' ');
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9_]*/g)) {
    const k = m[0].toLowerCase();
    if (!map.has(k)) map.set(k, m[0]);
  }
  return map;
}

/** Verilog literal bases are not kept in the IR: recover them from the source text, per line. */
function verilogLiteralTable(src) {
  const lines = src.split(/\r?\n/).map((l) => l.replace(/\/\/.*$/, ''));
  const perLine = lines.map((l) => [...l.matchAll(/(\d+)\s*'\s*[sS]?([bBoOdDhH])\s*([0-9a-fA-F_]+)/g)].map((m) => {
    const base = m[2].toLowerCase();
    const digits = m[3].replace(/_/g, '');
    let v = 0n;
    try { for (const ch of digits.toLowerCase()) v = v * BigInt({ b: 2, o: 8, d: 10, h: 16 }[base]) + BigInt(parseInt(ch, 16)); } catch { v = -1n; }
    return { w: parseInt(m[1], 10), base, v };
  }));
  const all = perLine.flat();
  return (line, w, v) => {
    const pick = (list) => list.find((t) => t.w === w && t.v === v);
    const t = (line && perLine[line - 1] && pick(perLine[line - 1])) || pick(all);
    return t ? (t.base === 'o' ? 'd' : t.base) : 'b';
  };
}

// ---------------------------------------------------------------------------------------
// ASM expression helpers (on core/asm.js ASTs: { k: 'id'|'lit'|'un'|'bin' })
// ---------------------------------------------------------------------------------------

const BOOL_OPS = new Set(['&&', '||', '==', '!=', '<', '>', '<=', '>=']);
const NEG_CMP = { '==': '!=', '!=': '==', '<': '>=', '>=': '<', '>': '<=', '<=': '>' };

/** True if core/asm.js types the expression as a boolean (not as a bit/vector). */
function asmIsBool(ast) {
  if (ast.k === 'un') return ast.op === '!';
  if (ast.k === 'bin') return BOOL_OPS.has(ast.op) || (['&', '|', '^'].includes(ast.op) && (asmIsBool(ast.a) || asmIsBool(ast.b)));
  return false;
}

/** VHDL: `x == 1` with a 1-bit x means the same as `x` where a boolean is expected. */
function simpLogical(ast, logical, widthOf) {
  if (ast.k === 'bin') {
    if (logical && ast.op === '==' && ast.a.k === 'id' && widthOf(ast.a.name) === 1 && ast.b.k === 'lit' && ast.b.v === 1n && (ast.b.w == null || ast.b.w === 1)) return ast.a;
    const sub = ast.op === '&&' || ast.op === '||';
    return { ...ast, a: simpLogical(ast.a, sub, widthOf), b: simpLogical(ast.b, sub, widthOf) };
  }
  if (ast.k === 'un') return { ...ast, a: simpLogical(ast.a, ast.op === '!', widthOf) };
  return ast;
}

const valueLits = (ast) => (ast.k === 'lit' ? lit(ast.v) : ast.k === 'un' ? { ...ast, a: valueLits(ast.a) }
  : ast.k === 'bin' ? { ...ast, a: valueLits(ast.a), b: valueLits(ast.b) } : ast);

/** Canonical form used to decide that two conditions are the same (or opposite) decision. */
function canon(ast, widthOf) {
  if (ast.k === 'lit') return lit(ast.v);
  if (ast.k === 'id') return ast;
  if (ast.k === 'un') {
    const a = canon(ast.a, widthOf);
    if (ast.op !== '!') return { ...ast, a };
    if (a.k === 'un' && a.op === '!') return a.a;
    if (a.k === 'bin' && NEG_CMP[a.op]) return { ...a, op: NEG_CMP[a.op] };
    return { k: 'un', op: '!', a };
  }
  let a = canon(ast.a, widthOf), b = canon(ast.b, widthOf);
  if ((ast.op === '==' || ast.op === '!=') && a.k === 'lit' && b.k !== 'lit') [a, b] = [b, a];
  if ((ast.op === '==' || ast.op === '!=') && a.k === 'id' && widthOf(a.name) === 1 && b.k === 'lit' && b.v <= 1n) {
    const positive = (ast.op === '==') === (b.v === 1n);
    return positive ? a : { k: 'un', op: '!', a };
  }
  return { k: 'bin', op: ast.op, a, b };
}
const condKey = (ast, widthOf) => exprToString(canon(ast, widthOf));
const condNegKey = (ast, widthOf) => exprToString(canon({ k: 'un', op: '!', a: ast }, widthOf));

// ---------------------------------------------------------------------------------------
// Header written by core/asm.js (used to recover the original spelling of the chart)
// ---------------------------------------------------------------------------------------

function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    if (s[i] === ')') depth--;
    if (depth === 0 && s.startsWith(sep, i)) { out.push(cur); cur = ''; i += sep.length - 1; continue; }
    cur += s[i];
  }
  out.push(cur);
  return out;
}
function unwrapParens(s) {
  if (!s.startsWith('(') || !s.endsWith(')')) return s;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') { depth--; if (depth === 0 && i < s.length - 1) return s; }
  }
  return s.slice(1, -1);
}

/** Parse the comment header of a generated file. Returns null if the file has none. */
function parseHeader(src, lang) {
  const c = lang === 'vhdl' ? '--' : '//';
  const lines = [];
  for (const raw of src.split(/\r?\n/)) {
    if (!raw.startsWith(c)) break;
    lines.push(raw.slice(c.length));
  }
  if (!lines.some((l) => /^\s*Generator\s*:\s*(?:Silinx|XAIlinx) ASM editor/.test(l))) return null;
  const h = { name: null, description: null, encoding: null, states: new Map(), always: new Map(), regInit: new Map() };
  const blk = (name) => {
    if (!h.always.has(name)) h.always.set(name, { actions: [], conds: [], mealy: [] });
    return h.always.get(name);
  };
  const addConds = (s, cond) => {
    if (cond.trim() === 'always') return;
    for (let piece of splitTopLevel(cond, ' && ')) {
      piece = piece.trim();
      if (piece.startsWith('!') && (/^![A-Za-z_]/.test(piece) || piece.startsWith('!('))) piece = piece.slice(1);
      piece = unwrapParens(piece).trim();
      if (piece && !s.conds.includes(piece)) s.conds.push(piece);
    }
  };
  const st = (name) => {
    if (!h.states.has(name)) h.states.set(name, { moore: null, conds: [], mealy: [] });
    return h.states.get(name);
  };
  let section = null;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    let m;
    if ((m = /^ (?:Entity|Module)\s*: (\S+)/.exec(l))) { h.name = m[1]; continue; }
    if (/^ Description :/.test(l)) {
      if (lines[i + 1] && /^ {15}\S/.test(lines[i + 1])) h.description = lines[i + 1].trim();
      continue;
    }
    if ((m = /^ Encoding\s*: (\w+)/.exec(l))) { h.encoding = m[1]; continue; }
    if (/^ States:/.test(l)) { section = 'states'; continue; }
    if (/^ Transitions/.test(l)) { section = 'trans'; continue; }
    if (/^ Every cycle/.test(l)) { section = 'every'; continue; }
    if (/^ Registers \(internal/.test(l)) { section = 'regs'; continue; }
    if (!/^ {3}\S/.test(l)) { if (!/^ {3}/.test(l)) section = null; continue; }
    if (section === 'states') {
      m = /^ {3}(\S+)(.*)$/.exec(l);
      const mo = /  Moore: (.*)$/.exec(m[2]);
      st(m[1]).moore = mo ? mo[1].split(', ').map((s) => s.trim()).filter(Boolean) : [];
    } else if (section === 'trans') {
      m = /^ {3}(\S+)\s+: (.*)$/.exec(l);
      if (!m) continue;
      let rest = m[2];
      const s = st(m[1]);
      const mealy = /  \[(.*)\]$/.exec(rest);
      if (mealy) { s.mealy.push(...mealy[1].split(', ').map((x) => x.trim()).filter(Boolean)); rest = rest.slice(0, mealy.index); }
      const arrow = rest.lastIndexOf(' -> ');
      addConds(s, arrow >= 0 ? rest.slice(0, arrow) : rest);
    } else if (section === 'regs') {
      if ((m = /^ {3}(\S+)\s*: \d+ bits?, reset (.+)$/.exec(l))) h.regInit.set(m[1], m[2].trim());
    } else if (section === 'every') {
      if ((m = /^ {3}(\S+)\s+Actions: (.*)$/.exec(l))) { blk(m[1]).actions = m[2].split(', ').map((x) => x.trim()).filter(Boolean); continue; }
      m = /^ {3}(\S+)\s+: (.*)$/.exec(l);
      if (!m) continue;
      let rest = m[2];
      const b = blk(m[1]);
      const acts = /  \[(.*)\]$/.exec(rest);
      if (acts) { b.mealy.push(...acts[1].split(', ').map((x) => x.trim()).filter(Boolean)); rest = rest.slice(0, acts.index); }
      addConds(b, rest);
    }
  }
  return h;
}

/** Comment lines `-- every cycle: <name>` written by the generator before each every-cycle block. */
function everyCycleMarks(src, lang) {
  const re = lang === 'vhdl' ? /^\s*--\s*every cycle:\s*(\S+)\s*$/ : /^\s*\/\/\s*every cycle:\s*(\S+)\s*$/;
  const out = [];
  src.split(/\r?\n/).forEach((l, i) => { const m = re.exec(l); if (m) out.push({ line: i + 1, name: m[1] }); });
  return out;
}

// ---------------------------------------------------------------------------------------
// Clocked process recognition
// ---------------------------------------------------------------------------------------

function hasClockEdge(stmts) {
  let found = false;
  walkStmts(stmts, (st) => {
    for (const e of [st.cond, st.until]) walkExpr(e, (x) => {
      if (x.op === 'apply' && /^(rising|falling)_edge$/.test(x.name)) found = true;
      if (x.op === 'attr' && x.attr === 'event') found = true;
    });
    if (st.kind === 'wait') found = true;
  });
  return found;
}

/** VHDL rising_edge(clk) / clk'event and clk = '1'. Returns the clock name or null. */
function vhdlClockEdge(e) {
  if (e.op === 'apply' && e.name === 'rising_edge' && e.args.length === 1 && e.args[0].op === 'ref') return e.args[0].name;
  if (e.op === 'apply' && e.name === 'falling_edge') fail('falling-edge clocks are not supported: the chart uses the rising edge');
  if (e.op === 'binary' && e.o === '&') {
    for (const [x, y] of [[e.a, e.b], [e.b, e.a]]) {
      if (x.op === 'attr' && x.attr === 'event' && x.prefix.op === 'ref' && y.op === 'binary' && y.o === '==' &&
          y.a.op === 'ref' && y.a.name === x.prefix.name && y.b.op === 'lit' && y.b.bits === '1') return x.prefix.name;
    }
  }
  return null;
}

/** Reset condition: returns { name, active } or null. */
function resetCond(e, lang) {
  if (!e) return null;
  const lv = (x) => (x.op === 'lit' && /^[01]$/.test(x.bits) ? x.bits : x.op === 'int' && /^[01]$/.test(x.value) ? x.value : null);
  if (e.op === 'binary' && e.o === '==' && e.a.op === 'ref' && lv(e.b) != null) return { name: e.a.name, active: lv(e.b) === '1' ? 'high' : 'low' };
  if (lang === 'verilog') {
    if (e.op === 'ref') return { name: e.name, active: 'high' };
    if (e.op === 'unary' && (e.o === '!' || e.o === '~') && e.a.op === 'ref') return { name: e.a.name, active: 'low' };
  }
  return null;
}

/** Recognise a clocked process. Returns null for combinational processes. */
function clockedShape(proc, lang) {
  const body = stmtList(proc.body);
  const where = `clocked process${atLine(proc.loc)}`;
  const shapeHelp = lang === 'vhdl'
    ? "expected 'if <reset> then ... elsif rising_edge(<clk>) then ... end if' or 'if rising_edge(<clk>) then if <reset> then ... else ... end if; end if'"
    : "expected 'always @(posedge <clk> [or posedge/negedge <reset>]) if (<reset>) ... else ...'";
  if (lang === 'vhdl') {
    if (!hasClockEdge(body)) return null;
    if (body.length === 1 && body[0].kind === 'if') {
      const top = body[0];
      const r = resetCond(top.cond, lang);
      const els = stmtList(top.else);
      if (r && els.length === 1 && els[0].kind === 'if' && !stmtList(els[0].else).length) {
        const clk = vhdlClockEdge(els[0].cond);
        if (clk) return { clock: clk, reset: { ...r, sync: false }, resetStmts: stmtList(top.then), load: stmtList(els[0].then), proc };
      }
      const clk = vhdlClockEdge(top.cond);
      if (clk && !els.length) {
        const inner = stmtList(top.then);
        const ri = inner.length === 1 && inner[0].kind === 'if' ? resetCond(inner[0].cond, lang) : null;
        if (ri) return { clock: clk, reset: { ...ri, sync: true }, resetStmts: stmtList(inner[0].then), load: stmtList(inner[0].else), proc };
        return { clock: clk, noReset: true, load: inner, proc };
      }
    }
    fail(`${where} has an unsupported structure (${shapeHelp})`);
  }
  if (!Array.isArray(proc.sens) || !proc.sens.some((s) => s.edge !== 'any')) return null;
  const edges = proc.sens;
  if (edges.some((s) => s.edge === 'any' || s.expr.op !== 'ref')) fail(`${where} mixes edge and level events`);
  if (body.length === 1 && body[0].kind === 'if') {
    const r = resetCond(body[0].cond, lang);
    if (r) {
      const clockEv = edges.filter((s) => s.expr.name !== r.name);
      const rstEv = edges.find((s) => s.expr.name === r.name);
      if (clockEv.length !== 1) fail(`${where}: expected one clock edge in the event list`);
      if (clockEv[0].edge !== 'pos') fail('falling-edge clocks are not supported: the chart uses the rising edge');
      if (rstEv && (rstEv.edge === 'pos') !== (r.active === 'high')) fail(`${where}: the reset edge does not match the reset polarity`);
      return { clock: clockEv[0].expr.name, reset: { ...r, sync: !rstEv }, resetStmts: stmtList(body[0].then), load: stmtList(body[0].else), proc };
    }
  }
  if (edges.length === 1 && edges[0].edge === 'pos') return { clock: edges[0].expr.name, noReset: true, load: body, proc };
  fail(`${where} has an unsupported structure (${shapeHelp})`);
}

// ---------------------------------------------------------------------------------------
// Module analysis: find the state register, its states, the outputs and the logic bodies
// ---------------------------------------------------------------------------------------

function analyzeModule(mod, src, lang) {
  const warnings = [];
  const cmap = lang === 'vhdl' ? vhdlCaseMap(src) : null;
  const orig = (n) => (cmap ? cmap.get(n) || n : n);
  const litBase = lang === 'verilog' ? verilogLiteralTable(src) : () => 'b';

  // ---- constants (VHDL constants, Verilog parameters/localparams) ----------------------
  const consts = new Map(); // name -> { value: BigInt, width, typeName, order, loc }
  let order = 0;
  const addConst = (name, type, value, loc) => {
    let width = null;
    if (value?.op === 'lit') width = value.bits.length;
    if (type?.kind === 'logic') width = type.range ? null : 1;
    const v = evalInt(value, consts);
    consts.set(name, { value: v, width, typeName: type?.kind === 'named' ? type.name : null, order: order++, loc, expr: value });
  };
  for (const p of mod.params || []) {
    if (!p.local && p.default == null) fail(`generic/parameter '${orig(p.name)}' has no value: parameterised modules are not supported`);
    addConst(p.name, p.type, p.default, p.loc || mod.loc);
  }
  const types = new Map();
  const signals = new Map(); // name -> decl
  for (const d of mod.decls || []) {
    if (d.kind === 'const') addConst(d.name, d.type, d.value, d.loc);
    else if (d.kind === 'type') types.set(d.name, d.type);
    else if (d.kind === 'signal') signals.set(d.name, d);
    else if (d.kind === 'function' || d.kind === 'task') fail(`${d.kind} '${orig(d.name)}'${atLine(d.loc)} is not part of the state machine`);
  }
  const widthOfType = (t, what, loc) => {
    if (t?.kind === 'named' && types.get(t.name)?.kind === 'logic') t = types.get(t.name);
    if (t?.kind !== 'logic') return null;
    if (t.signed) fail(`${what}${atLine(loc)} is signed: signed values are not supported`);
    if (!t.range) return 1;
    if (t.range.of) fail(`${what}${atLine(loc)}: 'range attributes are not supported`);
    const l = evalInt(t.range.left, consts), r = evalInt(t.range.right, consts);
    if (l == null || r == null) fail(`${what}${atLine(loc)}: cannot evaluate its width`);
    return Number(l > r ? l - r : r - l) + 1;
  };

  // ---- ports ---------------------------------------------------------------------------
  const ports = new Map();
  for (const p of mod.ports) {
    if (p.dir === 'inout') fail(`port '${orig(p.name)}'${atLine(p.loc)} is bidirectional (inout): not supported in a state machine chart`);
    const width = widthOfType(p.type, `port '${orig(p.name)}'`, p.loc);
    if (width == null) fail(`port '${orig(p.name)}'${atLine(p.loc)} must be ${lang === 'vhdl' ? 'std_logic or std_logic_vector' : 'a wire/reg (vector)'}`);
    ports.set(p.name, { name: p.name, dir: p.dir, width, loc: p.loc });
  }

  // ---- items ---------------------------------------------------------------------------
  const clocked = [], comb = [], concs = [], noReset = [];
  for (const it of mod.items) {
    if (it.kind === 'process') {
      if (it.initial) fail(`initial block${atLine(it.loc)} is not part of the state machine`);
      if (it.decls && it.decls.length) fail(`process${atLine(it.loc)} declares variables, which a state machine chart cannot express`);
      const ck = clockedShape(it, lang);
      if (ck && ck.noReset) noReset.push(ck);
      else if (ck) clocked.push(ck);
      else if (it.sens === 'all' || (Array.isArray(it.sens) && it.sens.length)) comb.push(it);
      else fail(`process${atLine(it.loc)} is not part of the state machine (it has no sensitivity list)`);
    } else if (it.kind === 'assign') {
      if (it.delay) fail(`assignment${atLine(it.loc)} has a delay, which a state machine chart cannot express`);
      concs.push(it);
    } else if (it.kind === 'instance') {
      fail(`instance '${it.name || it.module}' of '${orig(it.module)}'${atLine(it.loc)} is not part of the state machine`);
    } else if (it.kind === 'generate_for' || it.kind === 'generate_if') {
      fail(`generate statement${atLine(it.loc)} is not part of the state machine`);
    } else {
      fail(`${it.kind}${atLine(it.loc)} is not part of the state machine`);
    }
  }
  const noResetError = (c) => fail(`clocked process${atLine(c.proc.loc)} has no reset: the state register must be reset to the initial state`);
  if (!clocked.length && noReset.length) noResetError(noReset[0]);
  if (!clocked.length) fail('no clocked process found: the module has no state register, so it is not a state machine');
  const clock = clocked[0].clock, reset = clocked[0].reset;
  for (const c of clocked) {
    if (c.clock !== clock || c.reset.name !== reset.name || c.reset.active !== reset.active || c.reset.sync !== reset.sync) {
      fail(`clocked process${atLine(c.proc.loc)} uses a different clock or reset than the process${atLine(clocked[0].proc.loc)}`);
    }
  }
  for (const n of [clock, reset.name]) {
    const p = ports.get(n);
    if (!p || p.dir !== 'in' || p.width !== 1) fail(`'${orig(n)}' must be a 1-bit input port (it is used as ${n === clock ? 'clock' : 'reset'})`);
  }

  // ---- drivers -------------------------------------------------------------------------
  const drivers = new Map(); // name -> { where: 'clocked'|'comb'|'conc', loc }
  const addDriver = (target, where, loc) => {
    if (target.op !== 'ref') fail(`assignment${atLine(loc)} writes part of a signal (bit/slice/concatenation): not supported in a state machine chart`);
    const prev = drivers.get(target.name);
    if (prev && prev.unit !== where.unit) fail(`'${orig(target.name)}' is assigned in more than one process (lines ${lineOf(prev.loc)} and ${lineOf(loc)})`);
    if (!prev) drivers.set(target.name, { ...where, loc });
  };
  for (const c of clocked) {
    walkStmts(c.load, (st) => { if (st.kind === 'assign') addDriver(st.target, { kind: 'clocked', unit: c }, st.loc || c.proc.loc); });
    walkStmts(c.resetStmts, (st) => { if (st.kind === 'assign') addDriver(st.target, { kind: 'clocked', unit: c }, st.loc || c.proc.loc); });
  }
  for (const p of comb) walkStmts(p.body, (st) => { if (st.kind === 'assign') addDriver(st.target, { kind: 'comb', unit: p }, st.loc || p.loc); });
  for (const a of concs) addDriver(a.target, { kind: 'conc', unit: a }, a.loc);
  for (const [name, d] of drivers) {
    const p = ports.get(name);
    if (p && p.dir === 'in') fail(`input '${orig(name)}' is assigned${atLine(d.loc)}`);
  }

  // ---- state register ------------------------------------------------------------------
  const regs = [...drivers].filter(([, d]) => d.kind === 'clocked').map(([n]) => n);
  const resetVals = new Map();
  for (const c of clocked) {
    for (const st of c.resetStmts) {
      if (st.kind !== 'assign' || st.target.op !== 'ref') fail(`reset branch${atLine(st.loc || c.proc.loc)} may only assign reset values to registers`);
      resetVals.set(st.target.name, st);
    }
  }
  const selectorCount = new Map();
  const bump = (n, k = 1) => selectorCount.set(n, (selectorCount.get(n) || 0) + k);
  const allBodies = [...clocked.map((c) => c.load), ...comb.map((p) => p.body)];
  for (const b of allBodies) {
    walkStmts(b, (st) => {
      if (st.kind === 'case' && st.expr.op === 'ref') bump(st.expr.name, 2);
      for (const e of [st.cond, st.value]) walkExpr(e, (x) => {
        if (x.op === 'binary' && (x.o === '==' || x.o === '!=')) {
          if (x.a.op === 'ref' && x.b.op === 'ref' && (consts.has(x.b.name) || isEnumLit(x.b.name))) bump(x.a.name);
        }
      });
    });
  }
  for (const a of concs) walkExpr(a.value, (x) => {
    if (x.op === 'binary' && (x.o === '==' || x.o === '!=') && x.a.op === 'ref' && x.b.op === 'ref' && (consts.has(x.b.name) || isEnumLit(x.b.name))) bump(x.a.name);
  });
  function isEnumLit(n) { for (const t of types.values()) if (t.kind === 'enum' && t.values.includes(n)) return true; return false; }
  let cands = regs.filter((r) => selectorCount.has(r));
  if (cands.length > 1) {
    const named = cands.filter((r) => { const v = resetVals.get(r)?.value; return v && v.op === 'ref' && (consts.has(v.name) || isEnumLit(v.name)); });
    if (named.length) cands = named;
  }
  if (cands.length > 1) {
    const best = Math.max(...cands.map((r) => selectorCount.get(r)));
    const top = cands.filter((r) => selectorCount.get(r) === best);
    if (top.length > 1) fail(`more than one state register found (${top.map(orig).join(', ')}): only one state machine per module is supported`);
    cands = top;
  }
  if (!cands.length) fail('state signal not found: no clocked process loads a register that is used in a case statement or compared with state constants');
  const S = cands[0];
  for (const c of noReset) {
    const targets = new Set();
    walkStmts(c.load, (st) => { if (st.kind === 'assign' && st.target.op === 'ref') targets.add(st.target.name); });
    if (targets.has(S)) noResetError(c);
    fail(`process${atLine(c.proc.loc)} is not part of the state machine (it drives ${[...targets].map((t) => `'${orig(t)}'`).join(', ') || 'nothing'})`);
  }
  const sDecl = signals.get(S);
  const sPort = ports.get(S);
  if (sPort) fail(`the state register '${orig(S)}' is a port: the state must be an internal signal`);
  if (!sDecl) fail(`state signal '${orig(S)}' is not declared`);
  const sReset = resetVals.get(S);
  if (!sReset) fail(`the state register '${orig(S)}' is not assigned in the reset branch: there is no initial state`);

  // ---- next-state signal ---------------------------------------------------------------
  let N = null;
  for (const c of clocked) {
    for (const st of c.load) {
      if (st.kind === 'assign' && st.target.op === 'ref' && st.target.name === S && st.value.op === 'ref' &&
          !consts.has(st.value.name) && !isEnumLit(st.value.name)) N = st.value.name;
    }
  }
  if (N && drivers.get(N)?.kind !== 'comb' && drivers.get(N)?.kind !== 'conc') {
    fail(`next-state signal '${orig(N)}' must be assigned in a combinational process`);
  }

  // ---- states --------------------------------------------------------------------------
  let states; // [{ key, name, code, index }]
  let enumType = false;
  let sWidth = null;
  const sType = sDecl.type;
  if (sType.kind === 'named' && types.get(sType.name)?.kind === 'enum') {
    enumType = true;
    states = types.get(sType.name).values.map((v, i) => ({ key: v, name: orig(v).replace(/^S_/i, '') || orig(v), code: BigInt(i) }));
  } else {
    sWidth = widthOfType(sType, `state signal '${orig(S)}'`, sDecl.loc);
    if (sWidth == null) fail(`state signal '${orig(S)}' must be an enumeration or a bit vector`);
    // constants related to the state: of the state subtype, or used with the state register
    const related = new Set();
    if (sType.kind === 'named') for (const [n, c] of consts) if (c.typeName === sType.name) related.add(n);
    const refOf = (e) => (e && e.op === 'ref' && consts.has(e.name) ? e.name : null);
    const visit = (st) => {
      if (st.kind === 'case' && st.expr.op === 'ref' && st.expr.name === S) for (const it of st.items) for (const ch of it.choices) { const r = refOf(ch); if (r) related.add(r); }
      if (st.kind === 'assign' && st.target.op === 'ref' && (st.target.name === S || st.target.name === N)) {
        walkExpr(st.value, (x) => { const r = refOf(x); if (r) related.add(r); });
      }
      for (const e of [st.cond, st.value]) walkExpr(e, (x) => {
        if (x.op === 'binary' && (x.o === '==' || x.o === '!=') && x.a.op === 'ref' && x.a.name === S) { const r = refOf(x.b); if (r) related.add(r); }
      });
    };
    for (const b of allBodies) walkStmts(b, visit);
    for (const c of clocked) walkStmts(c.resetStmts, visit);
    for (const a of concs) visit({ kind: 'assign', target: a.target, value: a.value });
    if (!related.size) fail(`the states of '${orig(S)}' must be named constants (${lang === 'vhdl' ? 'constant S_X : state_t := ...' : 'localparam S_X = ...'}) or an enumeration type`);
    states = [...related].sort((a, b) => consts.get(a).order - consts.get(b).order).map((n) => {
      const c = consts.get(n);
      if (c.value == null) fail(`state constant '${orig(n)}'${atLine(c.loc)} has no constant value`);
      return { key: n, name: orig(n).replace(/^S_/i, '') || orig(n), code: c.value };
    });
    const codes = new Set();
    for (const s of states) {
      if (codes.has(s.code)) fail(`state constants share the code ${s.code}: each state needs a distinct code`);
      codes.add(s.code);
    }
  }
  const stateByKey = new Map(states.map((s) => [s.key, s]));
  const stateOfExpr = (e) => {
    if (e.op === 'ref' && stateByKey.has(e.name)) return stateByKey.get(e.name);
    if (!enumType && (e.op === 'lit' || e.op === 'int')) {
      const v = e.op === 'lit' ? bitsValue(e.bits, 'state code') : BigInt(e.value);
      return states.find((s) => s.code === v) || null;
    }
    return null;
  };
  const initial = stateOfExpr(sReset.value);
  if (!initial) fail(`the reset value of '${orig(S)}'${atLine(sReset.loc)} is not one of its states`);

  // ---- generics: integer VHDL generics / Verilog parameters that are not state codes -----
  const generics = [];
  const genericSet = new Set();
  for (const p of mod.params || []) {
    if (p.local || stateByKey.has(p.name)) continue;
    const integer = lang === 'vhdl' ? p.type?.kind === 'integer' : (p.type == null || p.type.kind === 'integer');
    const v = consts.get(p.name)?.value;
    if (!integer || v == null || v < 0n || v > 2147483647n) continue;
    generics.push({ name: p.name, default: Number(v) });
    genericSet.add(p.name);
  }

  // ---- input synchronisers: `m <= in; s <= m;` (2 flip-flops, reset to 0) ----------------
  const refCount = new Map();
  const countRefs = (e) => walkExpr(e, (x) => { if (x.op === 'ref') refCount.set(x.name, (refCount.get(x.name) || 0) + 1); });
  const countStmts = (list) => walkStmts(list, (st) => {
    for (const e of [st.cond, st.value, st.expr]) countRefs(e);
    if (st.kind === 'case') for (const it of st.items) for (const ch of it.choices) if (ch && ch.op) countRefs(ch);
  });
  for (const c of clocked) countStmts(c.load);
  for (const p of comb) countStmts(p.body);
  for (const a of concs) countRefs(a.value);
  const loadOf = new Map(); // register -> value of its unconditional load
  for (const c of clocked) for (const st of c.load) if (st.kind === 'assign' && st.target.op === 'ref') loadOf.set(st.target.name, stripConv(st.value));
  const zeroReset = (r) => { const rv = resetVals.get(r); return !!rv && constValue(rv.value, 1) === 0n; };
  const syncOf = new Map(); // input -> { meta, sync }
  const syncRegs = new Map(); // register -> { kind: 'syncmeta'|'syncout', input }
  for (const [M, v] of loadOf) {
    if (v.op !== 'ref' || ports.get(v.name)?.dir !== 'in' || v.name === clock || v.name === reset.name) continue;
    const P = v.name;
    if (ports.has(M) || syncOf.has(P) || refCount.get(P) !== 1 || refCount.get(M) !== 1 || drivers.get(M)?.kind !== 'clocked') continue;
    const Y = [...loadOf].find(([, x]) => x.op === 'ref' && x.name === M)?.[0];
    if (!Y || ports.has(Y) || !zeroReset(M) || !zeroReset(Y)) continue;
    const w = ports.get(P).width;
    if ([M, Y].some((r) => !signals.has(r) || widthOfType(signals.get(r).type, `signal '${orig(r)}'`, signals.get(r).loc) !== w)) continue;
    syncOf.set(P, { meta: M, sync: Y });
    syncRegs.set(M, { kind: 'syncmeta', input: P });
    syncRegs.set(Y, { kind: 'syncout', input: P });
  }

  // ---- registers and outputs -----------------------------------------------------------
  const roles = new Map();    // name -> { kind, out? }
  roles.set(S, { kind: 'state' });
  if (N) roles.set(N, { kind: 'next' });
  for (const [r, info] of syncRegs) roles.set(r, info);
  const outputs = [];         // ordered like the ports
  const outInfo = new Map();  // output/register name -> { registered, internal?, default(BigInt|null), width, reg, next }
  const registers = [];       // internal registers (in declaration order)
  const consumed = new Set(); // concurrent assignments used as register -> output links
  const nextOfReg = new Map();
  for (const c of clocked) {
    for (const st of c.load) {
      const v = st.kind === 'assign' ? stripConv(st.value) : null;
      if (v && st.target.op === 'ref' && st.target.name !== S && v.op === 'ref') {
        const d = drivers.get(v.name);
        if (d && (d.kind === 'comb' || d.kind === 'conc') && !ports.has(v.name)) nextOfReg.set(st.target.name, v.name);
      }
    }
  }
  for (const R of regs) {
    if (R === S || syncRegs.has(R)) continue;
    let O = null;
    if (ports.get(R)?.dir === 'out') O = R;
    else {
      for (const a of concs) {
        const v = stripConv(a.value);
        if (a.target.op === 'ref' && ports.get(a.target.name)?.dir === 'out' && v.op === 'ref' && v.name === R) { O = a.target.name; consumed.add(a); }
      }
    }
    let width, internal = false;
    if (O) {
      if (outInfo.has(O)) fail(`output '${orig(O)}' is driven by more than one register`);
      width = ports.get(O).width;
    } else {
      // internal register (data path): readable in conditions, assigned like a registered output
      const decl = signals.get(R);
      if (!decl) fail(`register '${orig(R)}'${atLine(drivers.get(R).loc)} is not declared`);
      width = widthOfType(decl.type, `register '${orig(R)}'`, decl.loc);
      if (width == null) fail(`register '${orig(R)}'${atLine(decl.loc)} must be ${lang === 'vhdl' ? 'a std_logic, std_logic_vector or unsigned' : 'a reg (vector)'} to be a register of the chart`);
      O = R;
      internal = true;
    }
    const rv = resetVals.get(R);
    let def = 0n;
    if (!rv) warnings.push(`register '${orig(R)}' has no reset value; the chart resets it to 0`);
    else {
      def = constValue(rv.value, width);
      if (def == null) fail(`the reset value of '${orig(R)}'${atLine(rv.loc)} must be a constant`);
    }
    const nx = nextOfReg.get(R) || null;
    outInfo.set(O, { registered: true, internal, default: def, width, reg: R, next: nx });
    if (internal) registers.push(R);
    roles.set(R, { kind: 'regcur', out: O });
    if (O !== R) roles.set(O, { kind: 'regport', out: O });
    if (nx) roles.set(nx, { kind: 'reg', out: O });
  }
  registers.sort((a, b) => [...signals.keys()].indexOf(a) - [...signals.keys()].indexOf(b));
  for (const [name, p] of ports) {
    if (p.dir !== 'out' || outInfo.has(name)) continue;
    const d = drivers.get(name);
    if (!d) fail(`output '${orig(name)}' is never assigned`);
    outInfo.set(name, { registered: false, default: null, width: p.width });
    roles.set(name, { kind: 'out', out: name });
  }
  for (const p of mod.ports) if (outInfo.has(p.name)) outputs.push(p.name);
  for (const [name] of ports) if (ports.get(name).dir === 'in' && name !== clock && name !== reset.name) roles.set(name, { kind: 'in' });
  for (const [name, d] of drivers) {
    if (!roles.has(name)) fail(`signal '${orig(name)}'${atLine(d.loc)} is not part of the state machine (it is neither the state, the next state, a register nor an output)`);
  }
  for (const [name, d] of signals) if (!roles.has(name)) warnings.push(`signal '${orig(name)}'${atLine(d.loc)} is not used by the state machine`);
  for (const c of clocked) {
    for (const [name] of resetVals) {
      const r = roles.get(name);
      if (!r || !['state', 'regcur', 'syncmeta', 'syncout'].includes(r.kind)) fail(`'${orig(name)}' is reset in the clocked process but is not a register of the state machine`);
    }
  }

  function constValue(e, width) {
    if (!e) return null;
    if (e.op === 'lit') return bitsValue(e.bits, 'reset value');
    if (e.op === 'int') return BigInt(e.value);
    if (e.op === 'ref' && consts.has(e.name)) return consts.get(e.name).value;
    if (e.op === 'aggregate' && e.items.length === 1 && e.items[0].choices?.[0] === 'others' && e.items[0].value.op === 'lit') {
      return e.items[0].value.bits === '1' ? (1n << BigInt(width)) - 1n : 0n;
    }
    if (e.op === 'apply' && (e.name === 'std_logic_vector' || e.name === 'unsigned') && e.args.length === 1) return constValue(e.args[0], width);
    if (e.op === 'apply' && e.name === 'to_unsigned' && e.args.length === 2) return evalInt(e.args[0], consts);
    if (e.op === 'qualified') return constValue(e.expr, width);
    return null;
  }

  // ---- logic bodies --------------------------------------------------------------------
  const bodies = []; // { stmts, ctx: 'comb'|'clocked', loc }
  const alwaysGroups = []; // every-cycle blocks: { name, stmts, ctx }
  const marks = everyCycleMarks(src, lang);
  const stateFree = (st) => {
    let ok = true;
    const noS = (e) => walkExpr(e, (x) => { if (x.op === 'ref' && x.name === S) ok = false; });
    walkStmts([st], (x) => {
      if (!['assign', 'if', 'case', 'null'].includes(x.kind)) ok = false;
      if (x.kind === 'assign' && (x.target.op !== 'ref' || x.target.name === S || x.target.name === N)) ok = false;
      for (const e of [x.cond, x.value, x.expr]) noS(e);
      if (x.kind === 'case') for (const it of x.items) for (const ch of it.choices) if (ch && ch.op) noS(ch);
    });
    return ok;
  };
  const addGroups = (stmts, ctx, procLine, nextLine) => {
    const mine = marks.filter((mk) => mk.line > procLine && mk.line < nextLine);
    let cur = null;
    for (const st of stmts) {
      const line = lineOf(st.loc) || 0;
      const mk = [...mine].reverse().find((x) => x.line < line);
      const name = mk ? mk.name : null;
      if (!cur || (mk && cur.mark !== mk)) {
        cur = { name, mark: mk || null, stmts: [], ctx, line: mk ? mk.line : line };
        alwaysGroups.push(cur);
      }
      cur.stmts.push(st);
    }
    // marks without statements: empty blocks
    for (const mk of mine) if (!alwaysGroups.some((g) => g.mark === mk)) alwaysGroups.push({ name: mk.name, mark: mk, stmts: [], ctx, line: mk.line });
  };
  const units = [...comb, ...clocked.map((c) => c.proc), ...concs].sort((a, b) => (lineOf(a.loc) || 0) - (lineOf(b.loc) || 0));
  const nextUnitLine = (it) => { const k = units.indexOf(it); return k >= 0 && k + 1 < units.length ? (lineOf(units[k + 1].loc) || Infinity) : Infinity; };
  for (const it of [...comb, ...clocked.map((c) => c.proc), ...concs].sort((a, b) => (lineOf(a.loc) || 0) - (lineOf(b.loc) || 0))) {
    if (it.kind === 'assign') {
      if (consumed.has(it)) continue;
      bodies.push({ stmts: [{ kind: 'assign', target: it.target, value: it.value, loc: it.loc }], ctx: 'comb', loc: it.loc });
      continue;
    }
    const ck = clocked.find((c) => c.proc === it);
    if (ck) {
      const rest = ck.load.filter((st) => !(st.kind === 'assign' && st.target.op === 'ref' &&
        ((st.target.name === S && N && st.value.op === 'ref' && st.value.name === N) ||
         (syncRegs.has(st.target.name) && stripConv(st.value).op === 'ref') ||
         (nextOfReg.has(st.target.name) && stripConv(st.value).op === 'ref' && stripConv(st.value).name === nextOfReg.get(st.target.name)))));
      // a clocked process that does not involve the state at all: an every-cycle block
      if (rest.length && rest.every(stateFree) && !ck.resetStmts.some((st) => st.target?.name === S)) {
        addGroups(rest, 'clocked', lineOf(it.loc) || 0, nextUnitLine(it));
        continue;
      }
      bodies.push({ stmts: rest, ctx: 'clocked', loc: it.loc });
      continue;
    }
    // combinational process: leading default assignments (up to the first every-cycle block)
    const list = stmtList(it.body);
    const procLine = lineOf(it.loc) || 0;
    const firstMark = marks.find((mk) => mk.line > procLine && mk.line < nextUnitLine(it))?.line ?? Infinity;
    const defaulted = new Set();
    let i = 0;
    for (; i < list.length; i++) {
      const st = list[i];
      if (st.kind !== 'assign' || st.target.op !== 'ref') break;
      if ((lineOf(st.loc) || 0) > firstMark || defaulted.has(st.target.name)) break;
      defaulted.add(st.target.name);
      const r = roles.get(st.target.name);
      if (r?.kind === 'next' && st.value.op === 'ref' && st.value.name === S) continue;
      if (r?.kind === 'reg' && stripConv(st.value).op === 'ref' && stripConv(st.value).name === outInfo.get(r.out).reg) continue;
      if (r?.kind === 'out') {
        const v = constValue(st.value, outInfo.get(r.out).width);
        if (v != null) { outInfo.get(r.out).default = v; continue; }
      }
      break;
    }
    // statements that do not depend on the state, before the state logic: every-cycle blocks
    // (the state logic after them takes priority, as in the chart)
    let j = i;
    while (j < list.length && stateFree(list[j])) j++;
    if (j > i || firstMark < Infinity) addGroups(list.slice(i, j), 'comb', procLine, nextUnitLine(it));
    bodies.push({ stmts: list.slice(j), ctx: 'comb', loc: it.loc });
  }
  alwaysGroups.sort((a, b) => a.line - b.line);
  // names of the blocks (the generator's comments, else every_cycle, every_cycle2, ...)
  const usedNames = new Set(alwaysGroups.filter((g) => g.name).map((g) => g.name.toLowerCase()));
  let anon = 0;
  for (const g of alwaysGroups) {
    if (g.name) continue;
    let nm;
    do { anon++; nm = anon === 1 ? 'every_cycle' : `every_cycle${anon}`; } while (usedNames.has(nm));
    usedNames.add(nm);
    g.name = nm;
  }

  const widthOf = (name) => {
    const p = ports.get(name);
    return p ? p.width : outInfo.get(name)?.width ?? 1;
  };
  return {
    warnings, orig, litBase, consts, ports, S, N, states, stateByKey, stateOfExpr, initial, enumType, sWidth,
    clock, reset, roles, outputs, outInfo, bodies, widthOf, alwaysGroups, registers, generics, genericSet, syncOf,
    inputs: mod.ports.filter((p) => roles.get(p.name)?.kind === 'in').map((p) => p.name),
  };
}

// ---------------------------------------------------------------------------------------
// Specialisation of the logic for one state (partial evaluation of state comparisons)
// ---------------------------------------------------------------------------------------

const BOOL_T = { op: 'bool', v: true }, BOOL_F = { op: 'bool', v: false };

function specExpr(e, A, s, loc) {
  if (!e || typeof e !== 'object' || !e.op) return e;
  const isS = (x) => x.op === 'ref' && x.name === A.S;
  switch (e.op) {
    case 'ref':
      if (e.name === A.S) fail(`the state register '${A.orig(A.S)}' is used${atLine(loc)} in a way a chart cannot express (only comparisons with state constants and case statements are supported)`);
      return e;
    case 'binary': {
      if ((e.o === '==' || e.o === '!=') && (isS(e.a) || isS(e.b))) {
        const other = isS(e.a) ? e.b : e.a;
        const st = A.stateOfExpr(other);
        if (!st) fail(`the state register is compared${atLine(loc)} with something that is not a state`);
        return (st === s) === (e.o === '==') ? BOOL_T : BOOL_F;
      }
      const a = specExpr(e.a, A, s, loc), b = specExpr(e.b, A, s, loc);
      const isAnd = e.o === '&&' || e.o === '&', isOr = e.o === '||' || e.o === '|';
      if ((isAnd || isOr) && (a.op === 'bool' || b.op === 'bool')) {
        const [k, o] = a.op === 'bool' ? [a, b] : [b, a];
        if (isAnd) return k.v ? o : BOOL_F;
        return k.v ? BOOL_T : o;
      }
      if ((e.o === '==' || e.o === '!=') && a.op === 'bool' && b.op === 'bool') return (a.v === b.v) === (e.o === '==') ? BOOL_T : BOOL_F;
      return { ...e, a, b };
    }
    case 'unary': {
      const a = specExpr(e.a, A, s, loc);
      if (a.op === 'bool' && (e.o === '!' || e.o === '~')) return a.v ? BOOL_F : BOOL_T;
      return { ...e, a };
    }
    case 'cond': {
      const c = specExpr(e.cond, A, s, loc);
      if (c.op === 'bool') return specExpr(c.v ? e.then : e.else, A, s, loc);
      return { ...e, cond: c, then: specExpr(e.then, A, s, loc), else: specExpr(e.else, A, s, loc) };
    }
    default: {
      let bad = false;
      walkExpr(e, (x) => { if (isS(x)) bad = true; });
      if (bad) fail(`the state register '${A.orig(A.S)}' is used${atLine(loc)} in a way a chart cannot express`);
      return e;
    }
  }
}

function specStmts(list, A, s) {
  const out = [];
  for (const st of stmtList(list)) {
    switch (st.kind) {
      case 'null': break;
      case 'assign': {
        if (st.delay) fail(`assignment${atLine(st.loc)} has a delay, which a state machine chart cannot express`);
        const v = specExpr(st.value, A, s, st.loc);
        // `o <= a when c else b` / `o = c ? a : b` -> if c then o <= a else o <= b
        if (v.op === 'cond') {
          out.push(...specStmts([{ kind: 'if', cond: v.cond, fromCond: true, loc: st.loc,
            then: [{ ...st, value: v.then }], else: [{ ...st, value: v.else }] }], A, s));
        } else out.push({ ...st, value: v });
        break;
      }
      case 'if': {
        const c = specExpr(st.cond, A, s, st.loc);
        if (c.op === 'bool') out.push(...specStmts(c.v ? st.then : st.else, A, s));
        else out.push({ ...st, cond: c, then: specStmts(st.then, A, s), else: specStmts(st.else, A, s) });
        break;
      }
      case 'case': {
        if (st.variant && st.variant !== 'case') fail(`${st.variant} statement${atLine(st.loc)} is not supported (use case)`);
        if (st.expr.op === 'ref' && st.expr.name === A.S) {
          const item = st.items.find((it) => it.choices.some((ch) => !ch.range && A.stateOfExpr(ch) === s));
          for (const it of st.items) for (const ch of it.choices) {
            if (ch.range || !A.stateOfExpr(ch)) fail(`case choice${atLine(st.loc)} on the state register is not a state`);
          }
          out.push(...specStmts(item ? item.body : st.default, A, s));
        } else {
          out.push({ ...st, expr: specExpr(st.expr, A, s, st.loc),
            items: st.items.map((it) => ({ ...it, body: specStmts(it.body, A, s) })),
            default: st.default ? specStmts(st.default, A, s) : null });
        }
        break;
      }
      default:
        fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------
// IR expression -> ASM expression
// ---------------------------------------------------------------------------------------

const ASM_BIN = new Set(['&&', '||', '|', '^', '&', '==', '!=', '<', '>', '<=', '>=', '+', '-', '<<', '>>']);

/** Convert an IR expression. Returns { ast, ty: 'bool'|'bit'|'vec'|'num', w }. */
function conv(e, A, X) {
  const where = `expression${atLine(X.loc)}`;
  switch (e.op) {
    case 'bool': return { ast: lit(e.v ? 1n : 0n), ty: 'bool' };
    case 'int': return { ast: lit(BigInt(e.value)), ty: 'num' };
    case 'lit': {
      const v = bitsValue(e.bits, where);
      if (A.lang === 'vhdl') {
        if (e.scalar) return { ast: lit(v), ty: 'bit', w: 1 };
        return { ast: lit(v, e.bits.length, 'b'), ty: 'vec', w: e.bits.length };
      }
      if (!e.sized) return { ast: lit(v), ty: 'num' };
      const w = e.bits.length;
      return { ast: lit(v, w, A.litBase(lineOf(X.loc), w, v)), ty: w === 1 ? 'bit' : 'vec', w };
    }
    case 'ref': {
      const n = e.name;
      if (A.lang === 'vhdl' && (n === 'true' || n === 'false')) return { ast: lit(n === 'true' ? 1n : 0n), ty: 'bool' };
      const r = A.roles.get(n);
      if (r?.kind === 'syncout') { const w = A.widthOf(r.input); return { ast: { k: 'id', name: A.orig(r.input) }, ty: w === 1 ? 'bit' : 'vec', w }; }
      if (A.genericSet.has(n)) return { ast: { k: 'id', name: A.orig(n) }, ty: 'num' };
      if (r?.kind === 'in') { const w = A.widthOf(n); return { ast: { k: 'id', name: A.orig(n) }, ty: w === 1 ? 'bit' : 'vec', w }; }
      if (r?.kind === 'regcur' || r?.kind === 'regport') { const w = A.outInfo.get(r.out).width; return { ast: { k: 'id', name: A.orig(r.out) }, ty: w === 1 ? 'bit' : 'vec', w }; }
      if (A.consts.has(n) && !A.stateByKey.has(n)) {
        const c = A.consts.get(n);
        if (c.value == null) fail(`constant '${A.orig(n)}' used${atLine(X.loc)} has no constant value`);
        return { ast: lit(c.value), ty: 'num' };
      }
      if (n === A.clock || n === A.reset.name) fail(`${where} reads the ${n === A.clock ? 'clock' : 'reset'} '${A.orig(n)}', which a chart cannot express`);
      if (r) fail(`${where} reads '${A.orig(n)}', which is written by the state machine (only inputs and registered outputs can be read)`);
      fail(`${where} reads '${A.orig(n)}', which is not an input of the state machine`);
    }
    case 'apply': {
      const name = e.name;
      const args = e.args.map((x) => (x && x.op ? x : x?.value));
      if (['unsigned', 'std_logic_vector', 'to_integer', 'std_logic', 'to_stdlogicvector', 'conv_integer'].includes(name) && args.length === 1) return conv(args[0], A, X);
      if (name === 'resize' && args.length === 2) {
        const r = conv(args[0], A, X);
        const n = evalInt(args[1], A.consts);
        if (n == null || n < 1n) return r;
        // the width at which VHDL evaluates the operand (see vhdlSized)
        if (r.ast.k === 'id' || (r.ast.k !== 'lit' && !A.vw.has(r.ast))) A.vw.set(r.ast, Number(n));
        return { ...r, ty: r.ty === 'bool' ? r.ty : 'vec', w: Number(n) };
      }
      if ((name === 'shift_left' || name === 'shift_right') && args.length === 2) {
        const a = conv(args[0], A, X), b = conv(args[1], A, X);
        const ast = { k: 'bin', op: name === 'shift_left' ? '<<' : '>>', a: a.ast, b: b.ast };
        A.vw.set(ast, a.w || 32);
        return { ast, ty: 'vec', w: a.w };
      }
      if ((name === 'to_unsigned' || name === 'conv_std_logic_vector') && args.length === 2) {
        let usesGeneric = false;
        walkExpr(args[0], (x) => { if (x.op === 'ref' && A.genericSet.has(x.name)) usesGeneric = true; });
        if (usesGeneric) return conv(args[0], A, X);
        const v = evalInt(args[0], A.consts);
        const n = evalInt(args[1], A.consts);
        if (v != null && n != null && n >= 1n && n <= 256n) return { ast: lit(v, Number(n), 'd'), ty: 'vec', w: Number(n) };
        if (v != null) return { ast: lit(v), ty: 'num' };
        return conv(args[0], A, X);
      }
      if (name === 'signed' || name === 'to_signed') fail(`${where} uses signed arithmetic, which is not supported`);
      if (A.roles.has(name) || A.ports.has(name)) fail(`${where} selects bits of '${A.orig(name)}': bit/slice selections are not supported in a chart`);
      fail(`${where} calls '${A.orig(name)}', which a chart cannot express`);
    }
    case 'qualified': return conv(e.expr, A, X);
    case 'aggregate': {
      const others = e.items.find((it) => it.choices?.includes('others'));
      const zero = e.items.find((it) => it.choices?.length === 1 && it.choices[0]?.op === 'int' && it.choices[0].value === '0');
      if (e.items.length === 2 && zero && others && others.value.op === 'lit' && others.value.bits === '0') return conv(zero.value, A, X);
      if (e.items.length === 1 && others && others.value.op === 'lit') {
        if (others.value.bits === '0') return { ast: lit(0n), ty: 'num' };
        if (X.width) return { ast: lit((1n << BigInt(X.width)) - 1n), ty: 'num' };
      }
      if (e.items.length === 1 && zero) return conv(zero.value, A, X);
      fail(`${where} uses an aggregate that a chart cannot express`);
    }
    case 'unary': {
      const a = conv(e.a, A, X);
      if (e.o === '~') {
        if (a.ty === 'bool') return { ast: { k: 'un', op: '!', a: a.ast }, ty: 'bool' };
        const ast = { k: 'un', op: '~', a: a.ast };
        if (a.w) A.vw.set(ast, a.w);
        return { ast, ty: a.ty, w: a.w };
      }
      if (e.o === '!') return { ast: { k: 'un', op: '!', a: a.ast }, ty: 'bool' };
      if (e.o === '-') { const ast = { k: 'un', op: '-', a: a.ast }; if (a.w) A.vw.set(ast, a.w); return { ast, ty: 'vec', w: a.w }; }
      if (e.o === '+') return a;
      fail(`${where} uses the reduction operator '${e.o}', which a chart cannot express`);
    }
    case 'binary': {
      const a = conv(e.a, A, X), b = conv(e.b, A, X);
      let op = e.o;
      if (A.lang === 'vhdl' && (op === '&' || op === '|') && (a.ty === 'bool' || b.ty === 'bool')) op = op === '&' ? '&&' : '||';
      if (!ASM_BIN.has(op)) fail(`${where} uses the operator '${e.o}', which a chart cannot express (supported: == != < > <= >= && || ! & | ^ ~ + - << >>)`);
      const ast = { k: 'bin', op, a: a.ast, b: b.ast };
      if (BOOL_OPS.has(op)) return { ast, ty: 'bool' };
      if (op === '<<' || op === '>>') { A.vw.set(ast, a.w || 32); return { ast, ty: 'vec', w: a.w }; }
      if (op === '&' || op === '|' || op === '^') {
        if (a.ty === 'bool' || b.ty === 'bool') return { ast, ty: 'bool' };
        const w = Math.max(a.w || 1, b.w || 1);
        A.vw.set(ast, w);
        return { ast, ty: w === 1 && a.ty !== 'num' ? 'bit' : 'vec', w };
      }
      const w = Math.max(a.w || 1, b.w || 1);
      A.vw.set(ast, w);
      return { ast, ty: 'vec', w };
    }
    case 'cond': fail(`${where} uses a conditional value (when/else, ?:) inside a state, which a chart cannot express; use if/else`);
    case 'concat': fail(`${where} uses concatenation, which a chart cannot express`);
    case 'index': case 'slice': case 'pslice': fail(`${where} selects bits of a signal, which a chart cannot express`);
    case 'call': fail(`${where} calls '${e.name}', which a chart cannot express`);
  }
  fail(`${where} cannot be expressed in a chart (${e.op})`);
}

// ---------------------------------------------------------------------------------------
// Statements -> per-state decision trees
// ---------------------------------------------------------------------------------------
// Tree: { k: 'act', acts, next } | { k: 'if', cond, t, f } | { k: 'leaf' }
// act item: { goto: stateKey | '@self' } or { target, ast, prefix? }

// VHDL evaluates `unsigned + natural`, shifts and `not` at the width of their vector operands,
// while the chart (like Verilog) evaluates them at the width of their context, and unsized
// literals count as 32 bits. Where the context matters (operands of a comparison that hold
// arithmetic, shifts or ~; the right-hand side of an assignment with >>) the unsized literals
// of a VHDL expression are given the width VHDL used, so that the chart means the same.
const SIZE_SENSITIVE = new Set(['+', '-', '<<', '>>', '~', 'neg']);
const ARITH = new Set(['+', '-', '&', '|', '^']);
const CMPS = new Set(['==', '!=', '<', '>', '<=', '>=']);
function ctxSens(ast, ops = SIZE_SENSITIVE) {
  if (ast.k === 'un') return ast.op !== '!' && (ops.has(ast.op === '-' ? 'neg' : ast.op) || ctxSens(ast.a, ops));
  if (ast.k !== 'bin') return false;
  if (ops.has(ast.op)) return true;
  if (ARITH.has(ast.op)) return ctxSens(ast.a, ops) || ctxSens(ast.b, ops);
  if (ast.op === '<<' || ast.op === '>>') return ctxSens(ast.a, ops);
  return false;
}
function hasSignal(ast, A) {
  if (ast.k === 'id') return !A.generics.some((g) => A.orig(g.name) === ast.name);
  if (ast.k === 'un') return hasSignal(ast.a, A);
  if (ast.k === 'bin') return hasSignal(ast.a, A) || hasSignal(ast.b, A);
  return false;
}
function vhdlSized(ast, A, inSens = false, W = 0) {
  const vw = (x) => A.vw.get(x) ?? (x.k === 'lit' ? x.w ?? 0 : x.k === 'id' && hasSignal(x, A) ? A.asmWidth(x.name) : 0);
  switch (ast.k) {
    case 'lit': return inSens && ast.w == null ? lit(ast.v, Math.max(W || 32, ast.v.toString(2).length), 'd') : ast;
    case 'un':
      if (ast.op === '!') return { ...ast, a: vhdlSized(ast.a, A) };
      return { ...ast, a: vhdlSized(ast.a, A, inSens, A.vw.get(ast) ?? W) };
    case 'bin': {
      if (CMPS.has(ast.op)) {
        const s = ctxSens(ast.a) || ctxSens(ast.b);
        const Wc = Math.max(vw(ast.a), vw(ast.b));
        return { ...ast, a: vhdlSized(ast.a, A, s, Wc), b: vhdlSized(ast.b, A, s, Wc) };
      }
      if (ast.op === '&&' || ast.op === '||') return { ...ast, a: vhdlSized(ast.a, A), b: vhdlSized(ast.b, A) };
      if (!inSens || !hasSignal(ast, A)) return ast;
      const Wn = A.vw.get(ast) ?? W;
      if (ast.op === '<<' || ast.op === '>>') return { ...ast, a: vhdlSized(ast.a, A, true, Wn), b: vhdlSized(ast.b, A, ctxSens(ast.b), vw(ast.b)) };
      return { ...ast, a: vhdlSized(ast.a, A, true, Wn), b: vhdlSized(ast.b, A, true, Wn) };
    }
  }
  return ast;
}

/** Verilog self-determined width (unsized literals and generics: 32 bits). */
function selfWidth(ast, wOf) {
  switch (ast.k) {
    case 'lit': return ast.w ?? 32;
    case 'id': return wOf(ast.name);
    case 'un': return ast.op === '!' ? 1 : selfWidth(ast.a, wOf);
    case 'bin':
      if (ARITH.has(ast.op)) return Math.max(selfWidth(ast.a, wOf), selfWidth(ast.b, wOf));
      if (ast.op === '<<' || ast.op === '>>') return selfWidth(ast.a, wOf);
      return 1;
  }
  return 1;
}

/**
 * Key of the meaning of an expression where literal widths are concerned: they only matter
 * through the width a comparison (or an assignment with >>) is evaluated at, which is part of
 * the key; the widths of the literals themselves are dropped.
 */
function widthKey(ast, wOf) {
  switch (ast.k) {
    case 'lit': return lit(ast.v);
    case 'un': return { ...ast, a: widthKey(ast.a, wOf) };
    case 'bin': {
      const k = { ...ast, a: widthKey(ast.a, wOf), b: widthKey(ast.b, wOf) };
      if (CMPS.has(ast.op) && (ctxSens(ast.a) || ctxSens(ast.b))) k.op = `${ast.op}@${Math.max(selfWidth(ast.a, wOf), selfWidth(ast.b, wOf))}`;
      if ((ast.op === '<<' || ast.op === '>>') && ctxSens(ast.b)) k.b = { k: 'un', op: `@${selfWidth(ast.b, wOf)}`, a: k.b };
      return k;
    }
  }
  return ast;
}

function makeTreeBuilder(A) {
  const condOf = (e, loc) => {
    const r = conv(e, A, { loc });
    return A.lang === 'vhdl' ? simpLogical(vhdlSized(r.ast, A), true, A.asmWidth) : r.ast;
  };
  const rhsOf = (e, width, loc) => {
    const r = conv(e, A, { loc, width });
    let ast = A.lang === 'vhdl' ? simpLogical(vhdlSized(r.ast, A, ctxSens(r.ast, new Set(['>>'])), A.vw.get(r.ast) ?? r.w ?? 0), false, A.asmWidth) : r.ast;
    if (ast.k === 'lit') {
      if (width === 1 || A.lang === 'vhdl') ast = lit(ast.v);
      else if (ast.w == null) ast = lit(ast.v);
    }
    if (width === 1 && r.ty === 'vec') fail(`assignment${atLine(loc)} gives a ${r.w}-bit value to a 1-bit output`);
    return ast;
  };
  const action = (st, ctx) => {
    if (st.target.op !== 'ref') fail(`assignment${atLine(st.loc)} writes part of a signal: not supported in a chart`);
    const n = st.target.name;
    const r = A.roles.get(n);
    if (!r) fail(`assignment${atLine(st.loc)} to '${A.orig(n)}', which is not part of the state machine`);
    if ((r.kind === 'state' && ctx === 'clocked') || (r.kind === 'next' && ctx === 'comb')) {
      if (st.value.op === 'ref' && st.value.name === A.S) return { goto: '@self' };
      const s = A.stateOfExpr(st.value);
      if (!s) fail(`next-state assignment${atLine(st.loc)} is not a state constant`);
      return { goto: s.key };
    }
    if ((r.kind === 'out' || r.kind === 'reg') && ctx === 'comb') return { target: r.out, ast: rhsOf(st.value, A.outInfo.get(r.out).width, st.loc), loc: st.loc };
    if (r.kind === 'regcur' && ctx === 'clocked') return { target: r.out, ast: rhsOf(st.value, A.outInfo.get(r.out).width, st.loc), loc: st.loc };
    fail(`'${A.orig(n)}' is assigned${atLine(st.loc)} in a ${ctx === 'clocked' ? 'clocked' : 'combinational'} process, which does not match its role in the state machine`);
  };
  // VHDL boolean action: `if C then o <= '1'; else o <= '0'; end if;` == `o = C`
  // (also `o <= '1' when C else '0'` and `o = C ? 1 : 0` in both languages)
  const boolAssign = (st, ctx) => {
    if (A.lang !== 'vhdl' && !st.fromCond) return null;
    const t = stmtList(st.then), f = stmtList(st.else);
    if (t.length !== 1 || f.length !== 1 || t[0].kind !== 'assign' || f[0].kind !== 'assign') return null;
    if (t[0].target.op !== 'ref' || f[0].target.op !== 'ref' || t[0].target.name !== f[0].target.name) return null;
    const r = A.roles.get(t[0].target.name);
    if (!r || !r.out || r.kind === 'next' || r.kind === 'state') return null;
    const w = A.outInfo.get(r.out).width;
    const one = rhsOf(t[0].value, w, t[0].loc), zero = rhsOf(f[0].value, w, f[0].loc);
    if (one.k !== 'lit' || zero.k !== 'lit' || one.v !== 1n || zero.v !== 0n) return null;
    let c = conv(st.cond, A, { loc: st.loc }).ast;
    if (A.lang === 'vhdl') c = vhdlSized(c, A);
    if (st.fromCond) {
      c = A.lang === 'vhdl' ? simpLogical(c, true, A.asmWidth) : c;
      if (w !== 1 && !asmIsBool(c)) return null;
    } else {
      c = simpLogical(c, false, A.asmWidth);
      if (!asmIsBool(c)) return null;
    }
    const a = action(t[0], ctx);
    return { ...a, ast: c };
  };
  const caseChain = (st) => {
    let chain = st.default ? stmtList(st.default) : [];
    for (let i = st.items.length - 1; i >= 0; i--) {
      const it = st.items[i];
      const bodyList = stmtList(it.body);
      const loc = it.body?.loc || bodyList[0]?.loc || st.loc;
      const conds = it.choices.map((ch) => (ch.range
        ? { op: 'binary', o: '&&', a: { op: 'binary', o: '>=', a: st.expr, b: ch.range.right }, b: { op: 'binary', o: '<=', a: st.expr, b: ch.range.left } }
        : { op: 'binary', o: '==', a: st.expr, b: ch }));
      const cond = conds.reduce((x, y) => ({ op: 'binary', o: '||', a: x, b: y }));
      chain = [{ kind: 'if', cond, then: bodyList, else: chain, loc }];
    }
    return chain;
  };
  const toTree = (list, ctx) => {
    list = stmtList(list);
    const acts = [];
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.kind === 'assign') { acts.push(action(st, ctx)); continue; }
      if (st.kind === 'case') { list = [...list.slice(0, i), ...caseChain(st), ...list.slice(i + 1)]; i--; continue; }
      if (st.kind === 'if') {
        const ba = boolAssign(st, ctx);
        if (ba) { acts.push(ba); continue; }
        const rest = list.slice(i + 1);
        const node = { k: 'if', cond: condOf(st.cond, st.loc),
          t: toTree([...stmtList(st.then), ...rest], ctx), f: toTree([...stmtList(st.else), ...rest], ctx) };
        return acts.length ? { k: 'act', acts, next: node } : node;
      }
      fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
    return acts.length ? { k: 'act', acts, next: { k: 'leaf' } } : { k: 'leaf' };
  };
  // Every-cycle blocks: sequential items { k: 'acts', acts } | { k: 'if', cond, t, f }; the
  // statement after an `if` is where both branches join again.
  const toSeq = (list, ctx) => {
    list = stmtList(list);
    const out = [];
    const push = (a) => {
      if (a.goto) fail(`assignment${atLine(a.loc)} changes the state in logic that does not depend on the state`);
      if (out.length && out[out.length - 1].k === 'acts') out[out.length - 1].acts.push(a);
      else out.push({ k: 'acts', acts: [a] });
    };
    for (let i = 0; i < list.length; i++) {
      const st = list[i];
      if (st.kind === 'null') continue;
      if (st.kind === 'assign') {
        if (st.delay) fail(`assignment${atLine(st.loc)} has a delay, which a state machine chart cannot express`);
        if (st.value.op === 'cond') {
          list = [...list.slice(0, i), { kind: 'if', cond: st.value.cond, fromCond: true, loc: st.loc,
            then: [{ ...st, value: st.value.then }], else: [{ ...st, value: st.value.else }] }, ...list.slice(i + 1)];
          i--; continue;
        }
        push({ ...action(st, ctx), loc: st.loc });
        continue;
      }
      if (st.kind === 'case') { list = [...list.slice(0, i), ...caseChain(st), ...list.slice(i + 1)]; i--; continue; }
      if (st.kind === 'if') {
        const ba = boolAssign(st, ctx);
        if (ba) { push(ba); continue; }
        out.push({ k: 'if', cond: condOf(st.cond, st.loc), t: toSeq(st.then, ctx), f: toSeq(st.else, ctx) });
        continue;
      }
      fail(`${st.kind} statement${atLine(st.loc)} is not supported in a state machine chart`);
    }
    return out;
  };
  return { toTree, toSeq };
}

function restrict(t, key, neg, value, W) {
  if (t.k === 'act') return { ...t, next: restrict(t.next, key, neg, value, W) };
  if (t.k === 'if') {
    const k = condKey(t.cond, W);
    if (k === key) return restrict(value ? t.t : t.f, key, neg, value, W);
    if (k === neg) return restrict(value ? t.f : t.t, key, neg, value, W);
    return { ...t, t: restrict(t.t, key, neg, value, W), f: restrict(t.f, key, neg, value, W) };
  }
  return t;
}

/**
 * Merge the trees of two processes into one decision tree. When both start with different
 * decisions, the one ranked first (order of the decisions in the header / previous chart)
 * goes on top; by default the first process (usually the next-state logic) wins.
 */
function mergeTrees(a, b, W, rank = () => Infinity) {
  if (a.k === 'act') return { k: 'act', acts: a.acts, next: mergeTrees(a.next, b, W, rank) };
  if (b.k === 'act') return { k: 'act', acts: b.acts, next: mergeTrees(a, b.next, W, rank) };
  if (a.k === 'leaf') return b;
  if (b.k === 'leaf') return a;
  if (rank(b.cond) < rank(a.cond)) {
    const key = condKey(b.cond, W), neg = condNegKey(b.cond, W);
    if (condKey(a.cond, W) !== key && condKey(a.cond, W) !== neg) {
      return { k: 'if', cond: b.cond, t: mergeTrees(restrict(a, key, neg, true, W), b.t, W, rank),
        f: mergeTrees(restrict(a, key, neg, false, W), b.f, W, rank) };
    }
  }
  const key = condKey(a.cond, W), neg = condNegKey(a.cond, W);
  const bt = restrict(b, key, neg, true, W), bf = restrict(b, key, neg, false, W);
  return { k: 'if', cond: a.cond, t: mergeTrees(a.t, bt, W, rank), f: mergeTrees(a.f, bf, W, rank) };
}

/** Resolve next-state assignments: leaves become { k: 'goto', state }. */
function resolveTree(t, cur, self) {
  if (t.k === 'act') {
    let c = cur;
    const acts = [];
    for (const x of t.acts) { if (x.goto) c = x.goto === '@self' ? self : x.goto; else acts.push(x); }
    const next = resolveTree(t.next, c, self);
    if (!acts.length) return next;
    if (next.k === 'act') return { k: 'act', acts: lastWins([...acts, ...next.acts]), next: next.next };
    return { k: 'act', acts: lastWins(acts), next };
  }
  if (t.k === 'if') {
    const T = resolveTree(t.t, cur, self), F = resolveTree(t.f, cur, self);
    if (treeSig(T) === treeSig(F)) return T;
    return { k: 'if', cond: t.cond, t: T, f: F };
  }
  return { k: 'goto', state: cur || self };
}

/** Drop assignments overridden later in the same box (e.g. a default before the case). */
function lastWins(acts) {
  return acts.filter((a, i) => !acts.slice(i + 1).some((b) => b.target === a.target));
}

const treeSig = (t) => JSON.stringify(t, (k, v) => (typeof v === 'bigint' ? `${v}n` : k === 'loc' ? undefined : v));

function assignsOnEveryPath(t, target) {
  if (t.k === 'act') return t.acts.some((x) => x.target === target) || assignsOnEveryPath(t.next, target);
  if (t.k === 'if') return assignsOnEveryPath(t.t, target) && assignsOnEveryPath(t.f, target);
  return false;
}

// ---------------------------------------------------------------------------------------
// Text of conditions and actions (prefer the spelling of the header / previous chart)
// ---------------------------------------------------------------------------------------

function makeTexts(A, lang) {
  const W = A.asmWidth;
  const wOf = (n) => (A.genericSet.has(n) || A.generics.some((g) => A.orig(g.name) === n) ? 32 : W(n));
  const strictCond = (ast) => (lang === 'vhdl' ? exprToString(widthKey(simpLogical(ast, true, W), wOf)) : exprToString(ast));
  const negCond = (ast) => {
    if (lang === 'vhdl') {
      if (ast.k === 'id' && W(ast.name) === 1) return { k: 'bin', op: '==', a: ast, b: lit(0n) };
      if (ast.k === 'bin' && ast.op === '==' && ast.a.k === 'id' && W(ast.a.name) === 1 && ast.b.k === 'lit' && ast.b.v <= 1n) {
        return ast.b.v === 1n ? { ...ast, b: lit(0n) } : ast.a;
      }
    }
    if (ast.k === 'un' && ast.op === '!') return ast.a;
    return { k: 'un', op: '!', a: ast };
  };
  const strictAction = (target, ast) => {
    const w = A.outWidth(target);
    if (ast.k === 'lit') {
      if (lang === 'vhdl' || w === 1) return `${target}:#${ast.v}`;
      return `${target}:#${ast.base === 'b' ? 'b' : ast.base === 'h' ? 'h' : 'd'}${ast.v}`;
    }
    const wide = ctxSens(ast, new Set(['>>'])) ? `@${Math.max(w, selfWidth(ast, wOf))}` : '';
    return `${target}${wide}:${lang === 'vhdl' ? exprToString(widthKey(simpLogical(ast, false, W), wOf)) : exprToString(ast)}`;
  };
  const condText = (ast, cands) => {
    const key = strictCond(ast);
    for (const c of cands) {
      const p = parseCondition(c);
      if (p.error) continue;
      if (strictCond(p.ast) === key) return { text: c, swap: false };
    }
    for (const c of cands) {
      const p = parseCondition(c);
      if (p.error) continue;
      if (strictCond(negCond(p.ast)) === key) return { text: c, swap: true };
    }
    return { text: exprToString(ast), swap: false };
  };
  const actionMatches = (act, text) => {
    const p = parseAction(text);
    return !p.error && p.target === act.target && strictAction(p.target, p.ast) === strictAction(act.target, act.ast);
  };
  const actionText = (act, cands) => cands.find((c) => actionMatches(act, c)) || `${act.target} = ${exprToString(act.ast)}`;
  return { condText, actionText, actionMatches };
}

// ---------------------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------------------

function encodingsMatching(states, initial, width) {
  const ord = [initial, ...states.filter((s) => s !== initial)];
  const N = ord.length;
  const binW = N <= 1 ? 1 : (N - 1).toString(2).length;
  const out = [];
  if (width === binW && ord.every((s, i) => s.code === BigInt(i))) out.push('binary');
  if (width === binW && ord.every((s, i) => s.code === BigInt(i ^ (i >> 1)))) out.push('gray');
  if (width === Math.max(1, N) && ord.every((s, i) => s.code === 1n << BigInt(i))) out.push('onehot');
  return out;
}

// ---------------------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------------------

function langOf(path, source) {
  if (/\.(vhd|vhdl)$/i.test(path || '')) return 'vhdl';
  if (/\.(v|vh|sv)$/i.test(path || '')) return 'verilog';
  return /\bentity\s+\w+\s+is\b/i.test(source) ? 'vhdl' : 'verilog';
}

/**
 * Extract the ASM chart of the state machine in `source`.
 * Returns { model, warnings }; throws an Error explaining why the module is not a pure FSM.
 */
export function asmFromHdl(source, { path = '', module = null, lang = null, previous = null } = {}) {
  source = String(source ?? '');
  lang = lang || langOf(path, source);
  if (lang !== 'vhdl' && lang !== 'verilog') fail(`unsupported language '${lang}'`);
  const parsed = lang === 'vhdl' ? parseVhdl(source, path || 'input.vhd') : parseVerilog(source, path || 'input.v');
  const perr = parsed.errors.filter((d) => d.severity !== 'warning');
  if (perr.length) fail(`syntax error at line ${perr[0].line}: ${perr[0].message}`);
  const mods = parsed.units.filter((u) => u.kind === 'module');
  if (!mods.length) fail(lang === 'vhdl' ? 'no entity with an architecture found in the file' : 'no module found in the file');
  let mod = mods[0];
  if (module) {
    mod = mods.find((u) => u.name === module || u.name === String(module).toLowerCase());
    if (!mod) fail(`${lang === 'vhdl' ? 'entity' : 'module'} '${module}' not found in the file`);
  }
  if (mod.entityOnly) fail(`entity '${mod.name}' has no architecture`);

  const A = analyzeModule(mod, source, lang);
  A.lang = lang;
  A.vw = new WeakMap(); // VHDL width of expression nodes (see vhdlSized)
  const warnings = A.warnings;
  const header = parseHeader(source, lang);
  const prev = previous ? normalizeModel(previous) : null;

  // names used in the chart
  const outName = (o) => A.orig(o);
  const asmWidths = new Map();
  for (const i of A.inputs) asmWidths.set(A.orig(i), A.widthOf(i));
  for (const o of A.outputs) asmWidths.set(outName(o), A.outInfo.get(o).width);
  for (const r of A.registers) asmWidths.set(A.orig(r), A.outInfo.get(r).width);
  for (const g of A.generics) asmWidths.set(A.orig(g.name), 32);
  A.asmWidth = (name) => asmWidths.get(name) ?? 1;
  A.outWidth = (name) => asmWidths.get(name) ?? 1;

  // ---- text candidates (generator header, previous chart) -------------------------------
  const cands = new Map(); // state name (lower) -> { moore: [[...]], conds: [], mealy: [] }
  const candOf = (name) => {
    const k = name.toLowerCase();
    if (!cands.has(k)) cands.set(k, { moore: [], conds: [], mealy: [] });
    return cands.get(k);
  };
  if (header) {
    for (const [name, h] of header.states) {
      const c = candOf(name);
      if (h.moore) c.moore.push(h.moore);
      c.conds.push(...h.conds);
      c.mealy.push(...h.mealy);
    }
    for (const [name, h] of header.always) {
      const c = candOf(`@${name}`);
      c.moore.push(h.actions);
      c.conds.push(...h.conds);
      c.mealy.push(...h.mealy);
    }
  }
  if (prev) {
    try {
      for (const st of extractTransitions(prev)) {
        const c = candOf(st.name);
        c.moore.push(st.mooreActions);
        for (const t of st.transitions) {
          for (const x of t.conditions) c.conds.push(x.cond.trim());
          for (const x of t.mealyActions) c.mealy.push(x.action);
        }
      }
    } catch { /* an invalid previous chart only loses its texts */ }
    try {
      for (const b of extractAlwaysBlocks(prev)) {
        const c = candOf(`@${b.name}`);
        c.moore.push(b.actions);
        for (const p of b.paths) {
          for (const x of p.conditions) c.conds.push(x.cond.trim());
          for (const x of p.actions) c.mealy.push(x.action);
        }
      }
    } catch { /* idem */ }
  }
  // decision order per state (header / previous chart): used to stack merged decisions
  const rankOf = (stateName) => {
    const r = new Map();
    for (const t of candOf(stateName).conds) {
      const p = parseCondition(t);
      if (p.error) continue;
      for (const k of [condKey(p.ast, A.asmWidth), condNegKey(p.ast, A.asmWidth)]) if (!r.has(k)) r.set(k, r.size);
    }
    return (ast) => r.get(condKey(ast, A.asmWidth)) ?? Infinity;
  };

  // ---- per-state trees -----------------------------------------------------------------
  const TB = makeTreeBuilder(A);
  const trees = new Map();
  for (const s of A.states) {
    const rank = rankOf(s.name);
    let merged = { k: 'leaf' };
    for (const b of A.bodies) merged = mergeTrees(merged, TB.toTree(specStmts(b.stmts, A, s), b.ctx), A.asmWidth, rank);
    let t = resolveTree(merged, null, s.key);
    t = renameTargets(t, (o) => outName(o));
    trees.set(s.key, t);
  }

  // ---- every-cycle blocks ----------------------------------------------------------------
  const renameSeq = (items) => items.map((it) => (it.k === 'acts'
    ? { ...it, acts: it.acts.map((a) => ({ ...a, target: outName(a.target) })) }
    : { ...it, t: renameSeq(it.t), f: renameSeq(it.f) }));
  const alwaysBlocks = A.alwaysGroups.map((g) => ({ name: g.name, items: renameSeq(TB.toSeq(g.stmts, g.ctx)) }));

  // ---- outputs: defaults ---------------------------------------------------------------
  const outputs = [];
  for (const o of A.outputs) {
    const info = A.outInfo.get(o);
    const name = outName(o);
    let def = info.default;
    if (!info.registered && def == null) {
      for (const s of A.states) {
        if (!assignsOnEveryPath(trees.get(s.key), name)) {
          fail(`output '${name}' has no default value and is not assigned on every path of state '${s.name}' (it would infer a latch)`);
        }
      }
      // most frequent constant Moore value becomes the default
      const counts = new Map();
      for (const s of A.states) {
        const t = trees.get(s.key);
        if (t.k !== 'act') continue;
        const a = [...t.acts].reverse().find((x) => x.target === name);
        if (a && a.ast.k === 'lit') counts.set(a.ast.v, (counts.get(a.ast.v) || 0) + 1);
      }
      def = 0n;
      let best = -1;
      for (const [v, n] of counts) if (n > best || (n === best && v === 0n)) { best = n; def = v; }
      for (const s of A.states) {
        const t = trees.get(s.key);
        if (t.k !== 'act') continue;
        const last = [...t.acts].reverse().find((x) => x.target === name);
        if (last && last.ast.k === 'lit' && last.ast.v === def && !assignsDeeper(t.next, name)) {
          const acts = t.acts.filter((x) => x.target !== name);
          trees.set(s.key, acts.length ? { ...t, acts } : t.next);
        }
      }
    }
    let defText = String(def ?? 0n);
    const p = prev?.outputs.find((x) => x.name === name);
    if (p) { const r = parseCondition(p.default); if (!r.error && r.ast.k === 'lit' && r.ast.v === (def ?? 0n)) defText = p.default; }
    outputs.push({ name, width: info.width, default: defText, registered: info.registered });
  }

  const TX = makeTexts(A, lang);

  // ---- nodes and edges -----------------------------------------------------------------
  const nodes = [], edges = [];
  const stateId = new Map();
  let nS = 0, nD = 0, nO = 0, nE = 0;
  for (const s of A.states) stateId.set(s.key, `s${++nS}`);
  const addEdge = (from, port) => { const e = { id: `e${++nE}`, from, to: '', port }; edges.push(e); return e; };
  for (const s of A.states) {
    const c = candOf(s.name);
    let t = trees.get(s.key);
    const stateNode = { id: stateId.get(s.key), type: 'state', name: s.name, x: 0, y: 0, actions: [] };
    nodes.push(stateNode);
    if (t.k === 'act') {
      // Moore actions: the leading unconditional actions (as many as the header/previous chart
      // lists; any further leading actions become an output box right below the state)
      let k = t.acts.length;
      const lists = c.moore;
      if (lists.length) {
        k = 0;
        const ref = lists[0];
        while (k < t.acts.length && k < ref.length && TX.actionMatches(t.acts[k], ref[k])) k++;
      }
      stateNode.actions = t.acts.slice(0, k).map((a) => TX.actionText(a, lists[0] || []));
      t = k < t.acts.length ? { ...t, acts: t.acts.slice(k) } : t.next;
    }
    const build = (tr) => {
      if (tr.k === 'goto') return stateId.get(tr.state);
      if (tr.k === 'act') {
        const id = `o${++nO}`;
        nodes.push({ id, type: 'output', x: 0, y: 0, actions: tr.acts.map((a) => TX.actionText(a, c.mealy)) });
        addEdge(id, 'next').to = build(tr.next);
        return id;
      }
      const id = `d${++nD}`;
      const { text, swap } = TX.condText(tr.cond, c.conds);
      nodes.push({ id, type: 'decision', x: 0, y: 0, cond: text });
      const eT = addEdge(id, 'true'), eF = addEdge(id, 'false');
      eT.to = build(swap ? tr.f : tr.t);
      eF.to = build(swap ? tr.t : tr.f);
      return id;
    };
    const e0 = addEdge(stateNode.id, 'next');
    e0.to = build(t);
  }
  let nA = 0;
  for (const b of alwaysBlocks) {
    const c = candOf(`@${b.name}`);
    const header = { id: `a${++nA}`, type: 'always', name: b.name, x: 0, y: 0, actions: [] };
    nodes.push(header);
    let items = b.items;
    if (items[0]?.k === 'acts') {
      // leading unconditional actions: in the header box (as many as the header/previous chart lists)
      const acts = items[0].acts;
      let k = acts.length;
      if (c.moore.length) {
        k = 0;
        const ref = c.moore[0];
        while (k < acts.length && k < ref.length && TX.actionMatches(acts[k], ref[k])) k++;
      }
      header.actions = acts.slice(0, k).map((a) => TX.actionText(a, c.moore[0] || []));
      items = k < acts.length ? [{ k: 'acts', acts: acts.slice(k) }, ...items.slice(1)] : items.slice(1);
    }
    // boxes, built from the end so that each `if` knows the box where its branches join;
    // then numbered and listed top-down (header, 1 branch, 0 branch)
    const bn = new Map(), be = [];
    let tmp = 0;
    const emit = (list, cont) => {
      let next = cont;
      for (let i = list.length - 1; i >= 0; i--) {
        const it = list[i];
        const id = `#${++tmp}`;
        if (it.k === 'acts') {
          bn.set(id, { id, type: 'output', x: 0, y: 0, actions: it.acts.map((a) => TX.actionText(a, c.mealy)) });
          if (next) be.push({ from: id, to: next, port: 'next' });
        } else {
          const { text, swap } = TX.condText(it.cond, c.conds);
          bn.set(id, { id, type: 'decision', x: 0, y: 0, cond: text });
          const T = emit(it.t, next), F = emit(it.f, next);
          const [tt, ff] = swap ? [F, T] : [T, F];
          if (tt) be.push({ from: id, to: tt, port: 'true' });
          if (ff) be.push({ from: id, to: ff, port: 'false' });
        }
        next = id;
      }
      return next;
    };
    const first = emit(items, null);
    if (first) be.push({ from: header.id, to: first, port: 'next' });
    const order = [header.id];
    const visit = (id) => {
      if (!id || order.includes(id)) return;
      order.push(id);
      for (const port of ['true', 'false', 'next']) visit(be.find((e) => e.from === id && e.port === port)?.to);
    };
    visit(first);
    const fin = new Map([[header.id, header.id]]);
    for (const id of order.slice(1)) {
      const n = bn.get(id);
      n.id = n.type === 'decision' ? `d${++nD}` : `o${++nO}`;
      fin.set(id, n.id);
      nodes.push(n);
    }
    const rank = (e) => order.indexOf(e.from) * 3 + ['true', 'false', 'next'].indexOf(e.port);
    for (const e of be.sort((x, y) => rank(x) - rank(y))) addEdge(fin.get(e.from), e.port).to = fin.get(e.to);
  }

  // ---- encoding ------------------------------------------------------------------------
  let encoding;
  if (A.enumType) encoding = 'enum';
  else {
    const matches = encodingsMatching(A.states, A.initial, A.sWidth);
    const hasAttr = new RegExp(lang === 'vhdl' ? 'attribute\\s+fsm_encoding\\s+of\\s+' : 'synthesis\\s+attribute\\s+fsm_encoding\\s+of\\s+', 'i').test(source);
    const ok = (e) => (e === 'enum' ? matches.includes('binary') && !hasAttr && lang === 'verilog' : matches.includes(e));
    if (header?.encoding && ok(header.encoding)) encoding = header.encoding;
    else if (prev && ok(prev.encoding)) encoding = prev.encoding;
    else if (lang === 'verilog' && !hasAttr && matches.includes('binary')) encoding = 'enum';
    else if (matches.length) encoding = matches[0];
    else {
      encoding = 'binary';
      warnings.push(`the state codes of '${A.orig(A.S)}' follow no standard encoding; the chart re-encodes the states in binary`);
    }
  }

  // ---- model ---------------------------------------------------------------------------
  let name = A.orig(mod.name);
  if (header?.name && header.name.toLowerCase() === name.toLowerCase()) name = header.name;
  if (prev && prev.name.toLowerCase() === name.toLowerCase()) name = prev.name;
  let model = {
    version: 1, name, lang,
    clock: A.orig(A.clock),
    reset: { name: A.orig(A.reset.name), active: A.reset.active, sync: A.reset.sync },
    encoding,
    ...(A.generics.length ? { generics: A.generics.map((g) => ({ name: A.orig(g.name), default: g.default })) } : {}),
    inputs: A.inputs.map((i) => (A.syncOf.has(i) ? { name: A.orig(i), width: A.widthOf(i), sync: true } : { name: A.orig(i), width: A.widthOf(i) })),
    outputs,
    ...(A.registers.length ? { registers: A.registers.map((r) => {
      const info = A.outInfo.get(r);
      const nm = A.orig(r);
      let init = String(info.default ?? 0n);
      for (const text of [header?.regInit.get(nm), prev?.registers?.find((x) => x.name === nm)?.init]) {
        if (text == null) continue;
        const q = parseCondition(text);
        if (!q.error && q.ast.k === 'lit' && q.ast.v === (info.default ?? 0n)) init = text;
      }
      return { name: nm, width: info.width, init };
    }) } : {}),
    nodes, edges,
    initial: stateId.get(A.initial.key),
  };
  const description = header?.description || prev?.description;
  if (description) model.description = description;
  if (prev?.generatedFile) model.generatedFile = prev.generatedFile;
  if (prev?.base) model.base = prev.base;

  const errors = validate(model).filter((d) => d.severity === 'error');
  if (errors.length) {
    fail(`the state machine cannot be represented as an ASM chart:\n${errors.map((d) => `  - ${d.message}`).join('\n')}`);
  }

  model = prev ? reusePrevious(model, prev) : asmLayout(model);

  if (header) {
    try {
      const again = generate(model, lang).code;
      if (again.replace(/\r\n/g, '\n').trimEnd() !== source.replace(/\r\n/g, '\n').trimEnd()) {
        warnings.push('the file was changed by hand after it was generated: regenerating it from the chart will rewrite it in the generator style');
      }
    } catch { /* validated above */ }
  }
  return { model, warnings };
}

function renameTargets(t, f) {
  if (t.k === 'act') return { ...t, acts: t.acts.map((a) => (a.target ? { ...a, target: f(a.target) } : a)), next: renameTargets(t.next, f) };
  if (t.k === 'if') return { ...t, t: renameTargets(t.t, f), f: renameTargets(t.f, f) };
  return t;
}

function assignsDeeper(t, target) {
  if (t.k === 'act') return t.acts.some((x) => x.target === target) || assignsDeeper(t.next, target);
  if (t.k === 'if') return assignsDeeper(t.t, target) || assignsDeeper(t.f, target);
  return false;
}

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------
// Node sizes follow web/js/asm-editor.js (centre coordinates, 20-unit grid).

const GRID = 20;
const CHW = 7.25;
const ceilTo = (v, g) => Math.ceil(v / g) * g;

export function nodeSize(n) {
  if (n.type === 'state' || n.type === 'always') {
    const lines = n.actions && n.actions.length ? n.actions : [''];
    const tw = Math.max(...lines.map((l) => l.length)) * CHW;
    return { w: Math.max(140, ceilTo(tw + 32, 2 * GRID)), h: Math.max(60, ceilTo(lines.length * 17 + 26, GRID)) };
  }
  if (n.type === 'decision') {
    const tw = Math.max(3, (n.cond || '').length) * CHW;
    const w = Math.max(140, ceilTo(tw * 1.25 + 56, 2 * GRID));
    return { w, h: w > 260 ? 100 : 80 };
  }
  const lines = n.actions && n.actions.length ? n.actions : [''];
  const tw = Math.max(...lines.map((l) => l.length)) * CHW;
  return { w: Math.max(120, ceilTo(tw + 44, 2 * GRID)), h: Math.max(40, ceilTo(lines.length * 17 + 16, GRID)) };
}

const VGAP = 40;       // vertical gap between boxes of a block
const HGAP = 60;       // horizontal gap between the true and false branches
const BLOCK_GAP = 50;  // vertical gap between state blocks
const X0 = 200, Y0 = 80;
const snap = (v) => Math.round(v / 10) * 10;

/** Exits of every node: id -> { next|true|false: targetId }. */
function exitsOf(m) {
  const ex = new Map();
  for (const e of m.edges) {
    if (!ex.has(e.from)) ex.set(e.from, {});
    const o = ex.get(e.from);
    if (!o[e.port]) o[e.port] = e.to;
  }
  return ex;
}

/** States in breadth-first order from the initial state (unreachable ones last). */
function stateOrder(m, byId, ex) {
  const states = m.nodes.filter((n) => n.type === 'state');
  const order = [];
  const seen = new Set();
  const q = [];
  const push = (id) => { if (byId.get(id)?.type === 'state' && !seen.has(id)) { seen.add(id); q.push(id); } };
  push(m.initial);
  while (q.length) {
    const s = q.shift();
    order.push(s);
    const visit = (id, path) => {
      const n = byId.get(id);
      if (!n || path.has(id)) return;
      if (n.type === 'state') { push(id); return; }
      path.add(id);
      const e = ex.get(id) || {};
      if (n.type === 'decision') { visit(e.true, path); visit(e.false, path); } else visit(e.next, path);
      path.delete(id);
    };
    visit((ex.get(s) || {}).next, new Set());
  }
  for (const s of states) if (!seen.has(s.id)) order.push(s.id);
  return order;
}

/** Assign x/y to every node: state blocks top-down in BFS order, true branches below, false to the right. */
export function asmLayout(model) {
  const m = clone(model);
  m.nodes = m.nodes || [];
  m.edges = m.edges || [];
  const norm = normalizeModel(m);
  const byId = new Map(norm.nodes.map((n) => [n.id, n]));
  const ex = exitsOf(norm);
  const pos = new Map();
  const placed = new Set();
  let y = Y0 - 30;
  const place = (id, x, top) => { // returns { bottom, right }
    const n = byId.get(id);
    const { w, h } = nodeSize(n);
    const cy = snap(top + h / 2);
    pos.set(id, { x: snap(x), y: cy });
    placed.add(id);
    let bottom = cy + h / 2, right = x + w / 2;
    const e = ex.get(id) || {};
    const child = (cid) => cid != null && byId.has(cid) && byId.get(cid).type !== 'state' && !placed.has(cid);
    const below = cy + h / 2 + VGAP;
    if (n.type === 'decision') {
      let tRight = x + w / 2;
      if (child(e.true)) {
        const r = place(e.true, x, below);
        bottom = Math.max(bottom, r.bottom); tRight = Math.max(tRight, r.right);
      }
      if (child(e.false)) {
        const fn = byId.get(e.false);
        const fw = nodeSize(fn).w;
        const r = place(e.false, tRight + HGAP + fw / 2, below);
        bottom = Math.max(bottom, r.bottom); right = Math.max(right, r.right);
      }
      right = Math.max(right, tRight);
    } else if (child(e.next)) {
      const r = place(e.next, x, below);
      bottom = Math.max(bottom, r.bottom); right = Math.max(right, r.right);
    }
    return { bottom, right };
  };
  for (const sid of stateOrder(norm, byId, ex)) {
    const r = place(sid, X0, y);
    y = ceilTo(r.bottom + BLOCK_GAP, 10);
  }
  // every-cycle blocks: one column each, to the right of the state blocks; a decision's 1
  // branch goes below it, its 0 branch to the right, and the box where both branches join
  // again below both
  const join = asmJoinPoints(norm);
  const inBlock = (id) => id != null && byId.has(id) && !['state', 'always'].includes(byId.get(id).type) && !placed.has(id);
  const placeSeq = (id, x, top, stop) => { // returns { bottom, right, left, ids }
    const ids = [];
    let bottom = top - VGAP, right = x, left = x;
    const at = (nid, cx, t) => {
      const { w, h } = nodeSize(byId.get(nid));
      const cy = snap(t + h / 2);
      pos.set(nid, { x: cx, y: cy }); placed.add(nid); ids.push(nid);
      right = Math.max(right, cx + w / 2); left = Math.min(left, cx - w / 2);
      return cy + h / 2;
    };
    for (let guard = 0; inBlock(id) && id !== stop && guard < 10000; guard++) {
      const n = byId.get(id);
      bottom = at(id, x, top);
      const e = ex.get(id) || {};
      if (n.type === 'decision') {
        const j = join(id);
        const below = bottom + VGAP;
        let tRight = right, tBottom = bottom;
        if (e.true !== j && inBlock(e.true)) {
          const r = placeSeq(e.true, x, below, j);
          ids.push(...r.ids); tRight = Math.max(tRight, r.right); tBottom = Math.max(tBottom, r.bottom); left = Math.min(left, r.left);
        }
        let fBottom = bottom, fRight = tRight;
        if (e.false !== j && inBlock(e.false)) {
          const r = placeSeq(e.false, 0, below, j);
          const dx = snap(tRight + HGAP - r.left);
          for (const fid of r.ids) pos.get(fid).x += dx;
          ids.push(...r.ids); fRight = r.right + dx; fBottom = r.bottom;
        }
        right = Math.max(right, tRight, fRight);
        bottom = Math.max(tBottom, fBottom);
        id = j;
      } else id = e.next;
      top = bottom + VGAP;
    }
    return { bottom, right, left, ids };
  };
  let colLeft = X0;
  for (const [id, p] of pos) colLeft = Math.max(colLeft, p.x + nodeSize(byId.get(id)).w / 2);
  colLeft += 2 * HGAP;
  let aTop = Y0 - 30;
  const aBlocks = [];
  for (const a of norm.nodes.filter((n) => n.type === 'always')) {
    const { w, h } = nodeSize(a);
    const ids = [a.id];
    const cy = snap(aTop + h / 2);
    pos.set(a.id, { x: 0, y: cy }); placed.add(a.id);
    let left = -w / 2, right = w / 2;
    const first = (ex.get(a.id) || {}).next;
    if (inBlock(first)) {
      const r = placeSeq(first, 0, cy + h / 2 + VGAP, null);
      ids.push(...r.ids); left = Math.min(left, r.left); right = Math.max(right, r.right);
      aTop = r.bottom;
    } else aTop = cy + h / 2;
    aTop = ceilTo(aTop + BLOCK_GAP, 10);
    aBlocks.push({ ids, left });
  }
  // all headers on one vertical line, no box left of the column
  const cx = snap(colLeft - Math.min(0, ...aBlocks.map((b) => b.left)));
  for (const b of aBlocks) for (const id of b.ids) pos.get(id).x += cx;

  // boxes not reachable from any state: in a column on the right
  let maxRight = X0;
  for (const [id, p] of pos) maxRight = Math.max(maxRight, p.x + nodeSize(byId.get(id)).w / 2);
  let y2 = Y0 - 30;
  for (const n of norm.nodes) {
    if (placed.has(n.id)) continue;
    const r = place(n.id, maxRight + HGAP + nodeSize(n).w / 2, y2);
    y2 = r.bottom + VGAP;
  }
  for (const n of m.nodes) {
    const p = pos.get(String(n.id));
    if (p) { n.x = p.x; n.y = p.y; }
  }
  for (const e of m.edges) delete e.points;
  return m;
}

// ---------------------------------------------------------------------------------------
// Reuse of a previous chart (ids, positions, edge points)
// ---------------------------------------------------------------------------------------

/** Signature of each non-state node: state name + path from the state + node content. */
function nodeSignatures(m) {
  const byId = new Map(m.nodes.map((n) => [n.id, n]));
  const ex = exitsOf(m);
  const W = new Map([...m.inputs, ...m.outputs, ...(m.registers || [])].map((p) => [p.name, p.width]));
  const wOf = (n) => W.get(n) ?? 1;
  const keyOf = (n) => {
    if (n.type === 'decision') { const p = parseCondition(n.cond); return 'D:' + (p.error ? n.cond : condKey(p.ast, wOf)); }
    return 'O:' + n.actions.map((a) => { const p = parseAction(a); return p.error ? a : `${p.target}=${exprToString(valueLits(p.ast))}`; }).join(';');
  };
  const sigs = new Map(); // id -> { full, loose }
  for (const s of m.nodes.filter((n) => n.type === 'state' || n.type === 'always')) {
    const root = s.type === 'always' ? `@${s.name}` : s.name;
    const visit = (id, path, seen) => {
      const n = byId.get(id);
      if (!n || n.type === 'state' || n.type === 'always' || seen.has(id)) return;
      seen.add(id);
      const k = keyOf(n);
      if (!sigs.has(id)) sigs.set(id, { full: `${root}|${path}|${k}`, loose: `${root}|${k}`, state: s.id });
      const e = ex.get(id) || {};
      if (n.type === 'decision') { visit(e.true, `${path}/${k}=1`, seen); visit(e.false, `${path}/${k}=0`, seen); }
      else visit(e.next, `${path}/${k}`, seen);
      seen.delete(id);
    };
    visit((ex.get(s.id) || {}).next, '', new Set());
  }
  return sigs;
}

function boxesOverlap(a, b, margin = 20) {
  const A = nodeSize(a), B = nodeSize(b);
  return Math.abs(a.x - b.x) * 2 < A.w + B.w + 2 * margin && Math.abs(a.y - b.y) * 2 < A.h + B.h + 2 * margin;
}

function reusePrevious(model, prev) {
  const auto = asmLayout(model);
  const autoPos = new Map(auto.nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
  const idMap = new Map(); // new id -> previous node
  // states by name
  const headKey = (n) => `${n.type}:${n.name.toLowerCase()}`;
  const prevStates = new Map(prev.nodes.filter((n) => n.type === 'state' || n.type === 'always').map((n) => [headKey(n), n]));
  for (const n of model.nodes) if ((n.type === 'state' || n.type === 'always') && prevStates.has(headKey(n))) idMap.set(n.id, prevStates.get(headKey(n)));
  // decisions / output boxes by path signature, then loosely by state + content
  const sNew = nodeSignatures(normalizeModel(model)), sOld = nodeSignatures(prev);
  const prevById = new Map(prev.nodes.map((n) => [n.id, n]));
  const used = new Set([...idMap.values()].map((n) => n.id));
  for (const pass of ['full', 'loose']) {
    for (const [id, sig] of sNew) {
      if (idMap.has(id)) continue;
      for (const [oid, osig] of sOld) {
        if (used.has(oid) || osig[pass] !== sig[pass]) continue;
        idMap.set(id, prevById.get(oid)); used.add(oid); break;
      }
    }
  }
  // final ids: previous ids for matched nodes, fresh ids (not clashing) for new ones
  const taken = new Set(prev.nodes.map((n) => n.id));
  const fresh = (prefix) => { let i = 1; while (taken.has(`${prefix}${i}`)) i++; taken.add(`${prefix}${i}`); return `${prefix}${i}`; };
  const finalId = new Map();
  for (const n of model.nodes) {
    const p = idMap.get(n.id);
    finalId.set(n.id, p ? p.id : fresh({ state: 's', decision: 'd', always: 'a' }[n.type] || 'o'));
  }
  // positions
  const out = clone(model);
  const parent = new Map();
  for (const e of model.edges) if (!parent.has(e.to) && model.nodes.find((n) => n.id === e.to)?.type !== 'state') parent.set(e.to, e.from);
  const placedNodes = [];
  for (const n of out.nodes) {
    const p = idMap.get(n.id);
    if (p) { n.x = p.x; n.y = p.y; if (p.flip && n.type === 'decision') n.flip = true; if (p.comment) n.comment = p.comment; placedNodes.push(n); }
  }
  let prevRight = 0, prevTop = Infinity;
  for (const n of prev.nodes) { prevRight = Math.max(prevRight, n.x + nodeSize(n).w / 2); prevTop = Math.min(prevTop, n.y); }
  if (!Number.isFinite(prevTop)) prevTop = Y0;
  const outById = new Map(out.nodes.map((n) => [n.id, n]));
  const pending = out.nodes.filter((n) => !idMap.has(n.id));
  // place new nodes relative to an already placed parent when possible (repeat until stable)
  for (let guard = 0; pending.length && guard < 1000; guard++) {
    const i = pending.findIndex((n) => { const pid = parent.get(n.id); return pid && placedNodes.includes(outById.get(pid)); });
    let n, x, y;
    if (i >= 0) {
      n = pending.splice(i, 1)[0];
      const pr = outById.get(parent.get(n.id));
      const a = autoPos.get(n.id), ap = autoPos.get(pr.id);
      x = pr.x + (a.x - ap.x); y = pr.y + (a.y - ap.y);
    } else {
      n = pending.shift();
      const a = autoPos.get(n.id);
      x = a.x + (prev.nodes.length ? prevRight + HGAP + 100 - X0 : 0); y = a.y - Y0 + prevTop;
    }
    n.x = x; n.y = y;
    for (let k = 0; k < 200 && placedNodes.some((o) => boxesOverlap(n, o)); k++) n.x += 2 * GRID;
    placedNodes.push(n);
  }
  // ids and edges
  for (const n of out.nodes) n.id = finalId.get(n.id);
  out.initial = finalId.get(model.initial);
  const prevEdges = prev.edges;
  const takenE = new Set(prevEdges.map((e) => e.id));
  const usedE = new Set();
  out.edges = model.edges.map((e) => {
    const from = finalId.get(e.from), to = finalId.get(e.to);
    const pe = prevEdges.find((x) => !usedE.has(x.id) && x.from === from && x.port === e.port);
    const o = { id: '', from, to, port: e.port };
    if (pe) {
      usedE.add(pe.id); o.id = pe.id;
      if (pe.to === to && pe.points && idMap.has(e.from) && idMap.has(e.to)) o.points = clone(pe.points);
    } else {
      let i = 1; while (takenE.has(`e${i}`)) i++; takenE.add(`e${i}`); o.id = `e${i}`;
    }
    return o;
  });
  return out;
}

// ---------------------------------------------------------------------------------------
// Structural comparison
// ---------------------------------------------------------------------------------------

/** True if both charts describe the same machine (ids, positions and spelling ignored). */
export function sameAsmStructure(a, b) {
  const A = normalizeModel(a), B = normalizeModel(b);
  if (A.name !== B.name || A.clock !== B.clock || A.encoding !== B.encoding) return false;
  if (A.reset.name !== B.reset.name || A.reset.active !== B.reset.active || A.reset.sync !== B.reset.sync) return false;
  const ports = (m) => JSON.stringify([
    m.inputs.map((p) => [p.name, p.width]),
    m.outputs.map((p) => { const r = parseCondition(p.default); return [p.name, p.width, p.registered, r.error ? p.default : String(r.ast.v)]; }),
  ]);
  if (ports(A) !== ports(B)) return false;
  const extras = (m) => JSON.stringify([
    (m.generics || []).map((g) => [g.name, g.default]),
    m.inputs.map((p) => !!p.sync),
    (m.registers || []).map((r) => { const q = parseCondition(r.init); return [r.name, r.width, q.error ? r.init : String(q.ast.v)]; }),
  ]);
  if (extras(A) !== extras(B)) return false;
  const W = new Map([...A.inputs, ...A.outputs, ...(A.registers || [])].map((p) => [p.name, p.width]));
  const wOf = (n) => W.get(n) ?? 1;
  const sum = (m) => {
    const byId = new Map(m.nodes.map((n) => [n.id, n]));
    const ex = exitsOf(m);
    const states = new Map();
    for (const s of m.nodes.filter((n) => n.type === 'state')) {
      states.set(s.name, { moore: s.actions.map((x) => actKey(x, wOf)), root: (ex.get(s.id) || {}).next });
    }
    return { byId, ex, states, initial: byId.get(m.initial)?.name };
  };
  const SA = sum(A), SB = sum(B);
  if (SA.initial !== SB.initial || SA.states.size !== SB.states.size) return false;
  for (const [name, sa] of SA.states) {
    const sb = SB.states.get(name);
    if (!sb || JSON.stringify(sa.moore) !== JSON.stringify(sb.moore)) return false;
    // compare behaviour of the two blocks on every combination of their decisions
    const atoms = new Map();
    const collect = (S, id, seen) => {
      const n = S.byId.get(id);
      if (!n || n.type === 'state' || seen.has(id)) return;
      seen.add(id);
      const e = S.ex.get(id) || {};
      if (n.type === 'decision') {
        const k = atomOf(n.cond, wOf).key;
        if (!atoms.has(k)) atoms.set(k, atoms.size);
        collect(S, e.true, seen); collect(S, e.false, seen);
      } else collect(S, e.next, seen);
    };
    collect(SA, sa.root, new Set());
    collect(SB, sb.root, new Set());
    if (atoms.size > 16) return false;
    const run = (S, root, bitsv) => {
      const acts = new Map();
      let id = root;
      for (let guard = 0; guard < 1000; guard++) {
        const n = S.byId.get(id);
        if (!n) return null;
        if (n.type === 'state') return JSON.stringify([n.name, [...acts].sort()]);
        const e = S.ex.get(id) || {};
        if (n.type === 'decision') {
          const at = atomOf(n.cond, wOf);
          const v = ((bitsv >> atoms.get(at.key)) & 1) === 1;
          id = (v !== at.neg) ? e.true : e.false;
        } else {
          for (const x of n.actions) { const [t, val] = actKey(x, wOf).split('\u0000'); acts.set(t, val); }
          id = e.next;
        }
      }
      return null;
    };
    for (let v = 0; v < 1 << atoms.size; v++) {
      if (run(SA, sa.root, v) !== run(SB, sb.root, v)) return false;
    }
  }
  // every-cycle blocks: same names in the same order, same final assignments on every path
  const blocksOf = (m) => m.nodes.filter((n) => n.type === 'always');
  const BA = blocksOf(A), BB = blocksOf(B);
  if (BA.length !== BB.length) return false;
  for (let i = 0; i < BA.length; i++) {
    if (BA[i].name !== BB[i].name) return false;
    const atoms = new Map();
    const collect = (S, id, seen) => {
      const n = S.byId.get(id);
      if (!n || n.type === 'state' || n.type === 'always' || seen.has(id)) return;
      seen.add(id);
      const e = S.ex.get(id) || {};
      if (n.type === 'decision') {
        const k = atomOf(n.cond, wOf).key;
        if (!atoms.has(k)) atoms.set(k, atoms.size);
        collect(S, e.true, seen); collect(S, e.false, seen);
      } else collect(S, e.next, seen);
    };
    collect(SA, (SA.ex.get(BA[i].id) || {}).next, new Set());
    collect(SB, (SB.ex.get(BB[i].id) || {}).next, new Set());
    if (atoms.size > 16) return false;
    const run = (S, head, bitsv) => {
      const acts = new Map();
      const apply = (list) => { for (const x of list) { const [t, val] = actKey(x, wOf).split('\u0000'); acts.set(t, val); } };
      apply(head.actions);
      let id = (S.ex.get(head.id) || {}).next;
      for (let guard = 0; guard < 1000; guard++) {
        const n = S.byId.get(id);
        if (!n) return JSON.stringify([...acts].sort());
        if (n.type === 'state' || n.type === 'always') return null;
        const e = S.ex.get(id) || {};
        if (n.type === 'decision') {
          const at = atomOf(n.cond, wOf);
          const v = ((bitsv >> atoms.get(at.key)) & 1) === 1;
          id = (v !== at.neg) ? e.true : e.false;
        } else { apply(n.actions); id = e.next; }
      }
      return null;
    };
    for (let v = 0; v < 1 << atoms.size; v++) if (run(SA, BA[i], v) !== run(SB, BB[i], v)) return false;
  }
  return true;
}

function atomOf(cond, wOf) {
  const p = parseCondition(cond);
  if (p.error) return { key: cond, neg: false };
  const c = canon(p.ast, wOf);
  if (c.k === 'un' && c.op === '!') return { key: exprToString(c.a), neg: true };
  if (c.k === 'bin' && c.op === '!=') return { key: exprToString({ ...c, op: '==' }), neg: true };
  return { key: exprToString(c), neg: false };
}

function actKey(text, wOf) {
  const p = parseAction(text);
  if (p.error) return `${text}\u0000`;
  return `${p.target}\u0000${exprToString(canon(p.ast, wOf))}`;
}

export default asmFromHdl;
