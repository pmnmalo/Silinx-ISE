// Silinx - FSM (bubble diagram) state machines: model, validation, analysis, tables, HDL
// generation and HDL read-back.
//
// Isomorphic ES module: no DOM and no Node APIs (browser editor, tests, CLI).
//
// Model (saved as <name>.fsm.json):
//
//   {
//     version: 1, kind: 'fsm', name: 'det11', lang: 'vhdl' | 'verilog',
//     type: 'moore' | 'mealy',                   (derived from the outputs: fsmKind, #2728)
//     clock: 'clk', reset: { name: 'rst', active: 'high' | 'low', sync: false },
//     encoding: 'binary' | 'gray' | 'onehot' | 'enum',
//     style: '3process' | '2process',            (HDL style: separate or combined logic processes)
//     inputs:  [{ name: 'x', width: 1 }],
//     outputs: [{ name: 'z', width: 1, default: '0' }],
//     states: [{ id, name: 'S0', x, y, outputs: { z: '1' } }],            (Moore outputs)
//     transitions: [{ id, from, to, cond: 'x && !y', outputs: { z: '1' },  (Mealy outputs)
//                     bend?: px, angle?: deg }],                          (drawing of the arc)
//     initial: '<state id>',
//     description?, generatedFile?, base?
//   }
//
// Conditions use the expression syntax of the ASM charts (core/asm.js): inputs, bit selections
// x[1] / x(1), literals (1, 0, 2'b10, "10", 0x3), operators ! ~ && || & | ^ == != < > <= >= + -
// and the words and / or / not / xor; a single = also compares. An empty condition (or 1 / true)
// is always true. A multi-bit input used alone means "not zero".
// Output values are constants (0, 1, 4'b1010, "1010", 5). An output takes its default value
// unless the current state (Moore) or the transition taken (Mealy) gives it another value.
//
// Semantics (also of the generated HDL): in each state the transitions are tried in the order of
// the list (first true condition wins; the validation warns when two can be true at once); when
// none is true the machine stays in its state. Mealy outputs are those of the transition that is
// taken in the current cycle.

import { parseCondition, isIdentifier, reservedIn, reservedWarning, portExprCoder } from './asm.js';
import { asmFromHdl } from './asm-from-hdl.js';
import { asmToFsm, fsmToAsm } from './fsm-asm.js';
import { generateFsm } from './fsm-hdl.js';
import { clone } from './util.js';
export { clone };   // (core/util.js's)
export { generateFsm } from './fsm-hdl.js';
export { asmToFsm, fsmToAsm } from './fsm-asm.js';

export const FSM_VERSION = 1;
export const FSM_ENCODINGS = ['binary', 'gray', 'onehot', 'enum'];
export const FSM_STYLES = ['3process', '2process'];
export const MAX_WIDTH = 32;
export const STATE_R = 34;            // radius of a state circle (drawing units)

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
export const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
const bitsOf = (v, w) => (BigInt(v) & ((1n << BigInt(w)) - 1n)).toString(2).padStart(w, '0');
export const mask = (v, w) => v & ((1n << BigInt(w)) - 1n);

// ---------------------------------------------------------------------------------------
// Output assignments ("z=1, y=2'b10")
// ---------------------------------------------------------------------------------------

/** Normalise an output assignment list: { name: valueText } (also from ['z = 1', 'y']). */
function normOutputs(o) {
  if (Array.isArray(o)) {
    const out = {};
    for (const a of o) {
      const r = parseOutputs(String(a));
      if (r.outputs) Object.assign(out, r.outputs);
    }
    return out;
  }
  if (!o || typeof o !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(o)) if (String(k).trim()) out[String(k).trim()] = String(v ?? '1').trim() || '1';
  return out;
}

/** Parse "z=1, y = 2'b10; w" -> { outputs: { z: '1', y: "2'b10", w: '1' } } or { error }. Given the machine's
 *  `outputs` ([{ name }]), each assignment is checked as Check checks it (outputProblems): an output it has, a
 *  constant value ("z0=1z=1", a comma missing, is not one), #3288. */
export function parseOutputs(text, outputs = null) {
  const out = {};
  const parts = String(text ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:(?:<=|:=|=)\s*(.+))?$/.exec(p);
    if (!m) return { error: `'${p}' is not an output assignment (write output=value, e.g. z=1)` };
    out[m[1]] = m[2] == null ? '1' : m[2].trim();
  }
  const bad = outputs ? outputProblems(out, outputs) : [];
  return bad.length ? { error: bad[0] } : { outputs: out };
}

/** The errors of output assignments ({ name: valueText }) of a machine with these `outputs` ([{ name }]): an output
 *  it does not have, a value that is not a constant. Check's (validateFsm) and the editor's fields' (parseOutputs). */
export function outputProblems(outs, outputs) {
  const names = new Set((outputs || []).map((o) => o.name));
  const out = [];
  for (const [o, val] of Object.entries(outs || {})) {
    if (!names.has(o)) out.push(`'${o}' is not an output`);
    else if (constValue(val) == null) out.push(`the value '${val}' of ${o} must be a constant (e.g. 0, 1, 4'b1010, 5)`);
  }
  return out;
}

/** "z=1, y=2'b10" */
export function formatOutputs(o) {
  return outputLines(o).join(', ');
}

/** ["z=1", "y=2'b10"]: the outputs as they are shown, one per line (the drawing's labels, Properties, #3882). */
export function outputLines(o) {
  return Object.entries(o || {}).map(([k, v]) => `${k}=${v}`);
}

/** Split a transition label "cond / z=1" into { cond, outputs } (a '/' followed by '=' belongs to the condition);
 *  given the machine's `outputs`, its assignments checked (parseOutputs). */
export function parseLabel(text, outputs = null) {
  const s = String(text ?? '');
  let k = -1;
  for (let i = s.length - 1; i >= 0; i--) if (s[i] === '/' && s[i + 1] !== '=') { k = i; break; }
  const cond = (k < 0 ? s : s.slice(0, k)).trim();
  const outs = k < 0 ? '' : s.slice(k + 1);
  const r = parseOutputs(outs, outputs);
  return { cond: /^(1|true|always)$/i.test(cond) ? '' : cond, outputs: r.outputs || {}, error: r.error };
}

/** Value of a constant (literal) text, or null. */
export function constValue(text) {
  const r = parseCondition(String(text ?? ''));
  if (r.error || r.ast.k !== 'lit') return null;
  return r.ast.v;
}

// ---------------------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------------------

/**
 * The machine's kind, from where its outputs are (#2728): Mealy when a transition sets an output, Moore when only the
 * states do (or nothing does). A stored `type` is not read: normalizeFsm writes this one.
 */
export const fsmKind = (m) => (m.transitions.some((t) => Object.keys(t.outputs || {}).length) ? 'mealy' : 'moore');

/** Cleaned deep copy of `m` with every field present (does not validate). */
export function normalizeFsm(m) {
  const src = m && typeof m === 'object' ? m : {};
  const rs = typeof src.reset === 'string' ? { name: src.reset } : (src.reset || {});
  const states = arr(src.states).map((s, i) => {
    const o = { id: String(s?.id ?? `s${i + 1}`), name: String(s?.name ?? ''), x: num(s?.x), y: num(s?.y), outputs: normOutputs(s?.outputs) };
    if (s?.comment) o.comment = String(s.comment);
    return o;
  });
  const transitions = arr(src.transitions).map((t, i) => {
    const o = { id: String(t?.id ?? `t${i + 1}`), from: String(t?.from ?? ''), to: String(t?.to ?? ''),
      cond: String(t?.cond ?? '').trim(), outputs: normOutputs(t?.outputs) };
    if (/^(1|true|always)$/i.test(o.cond)) o.cond = '';
    if (t?.bend != null && Number.isFinite(Number(t.bend))) o.bend = Number(t.bend);
    if (t?.angle != null && Number.isFinite(Number(t.angle))) o.angle = Number(t.angle);
    return o;
  });
  const out = {
    version: FSM_VERSION,
    kind: 'fsm',
    name: String(src.name ?? 'fsm'),
    lang: src.lang === 'verilog' ? 'verilog' : 'vhdl',
    type: fsmKind({ transitions }),
    clock: String(src.clock || 'clk'),
    reset: { name: String(rs.name || 'rst'), active: rs.active === 'low' ? 'low' : 'high', sync: !!rs.sync },
    encoding: FSM_ENCODINGS.includes(src.encoding) ? src.encoding : 'binary',
    style: src.style === '2process' ? '2process' : '3process',
    inputs: arr(src.inputs).map((p) => ({ name: String(p?.name ?? ''), width: num(p?.width, 1) })),
    outputs: arr(src.outputs).map((p) => ({ name: String(p?.name ?? ''), width: num(p?.width, 1),
      default: p?.default == null || String(p.default).trim() === '' ? '0' : String(p.default).trim() })),
    states,
    transitions,
    initial: src.initial == null ? '' : String(src.initial),
  };
  if (!states.some((s) => s.id === out.initial)) out.initial = states[0]?.id ?? '';
  if (src.description) out.description = String(src.description);
  if (src.generatedFile) out.generatedFile = String(src.generatedFile);
  if (src.base === 'hdl') out.base = 'hdl';
  return out;
}

/** A new diagram: Moore machine that sets z after two consecutive 1s on x. */
export function newFsm(name = 'fsm', lang = 'vhdl') {
  return normalizeFsm({
    name, lang, encoding: 'binary', style: '3process',
    inputs: [{ name: 'x', width: 1 }],
    outputs: [{ name: 'z', width: 1, default: '0' }],
    states: [
      { id: 's1', name: 'S0', x: 120, y: 160, outputs: {} },
      { id: 's2', name: 'S1', x: 320, y: 160, outputs: {} },
      { id: 's3', name: 'S2', x: 520, y: 160, outputs: { z: '1' } },
    ],
    transitions: [
      { id: 't1', from: 's1', to: 's2', cond: 'x' },
      { id: 't2', from: 's1', to: 's1', cond: '!x' },
      { id: 't3', from: 's2', to: 's3', cond: 'x' },
      { id: 't4', from: 's2', to: 's1', cond: '!x', bend: 40 },
      { id: 't5', from: 's3', to: 's3', cond: 'x' },
      { id: 't6', from: 's3', to: 's1', cond: '!x', bend: 60 },
    ],
    initial: 's1',
  });
}

export const stateById = (m, id) => m.states.find((s) => s.id === id);
export const nameOf = (m, id) => stateById(m, id)?.name || '?';

/** Transitions leaving state `id`, in priority order. */
export function transitionsFrom(m, id) { return m.transitions.filter((t) => t.from === id); }

/** States in code order (the initial state first) with their codes: [{ id, name, constName, index, width, code, bits }]. */
export function fsmEncoding(model) {
  const m = model.kind === 'fsm' && model.states ? model : normalizeFsm(model);
  const states = [...m.states];
  const init = states.findIndex((s) => s.id === m.initial);
  if (init > 0) states.unshift(states.splice(init, 1)[0]);
  const N = states.length;
  const width = m.encoding === 'onehot' ? Math.max(1, N) : (N <= 1 ? 1 : (N - 1).toString(2).length);
  return states.map((s, i) => {
    const code = m.encoding === 'onehot' ? 1n << BigInt(i) : m.encoding === 'gray' ? BigInt(i ^ (i >> 1)) : BigInt(i);
    return { id: s.id, name: s.name, constName: `S_${s.name}`, index: i, width, code, bits: bitsOf(code, width) };
  });
}

// ---------------------------------------------------------------------------------------
// Condition evaluation (Verilog width rules, as the generated HDL)
// ---------------------------------------------------------------------------------------

const ARITH = new Set(['+', '-', '&', '|', '^']);
const SHIFT = new Set(['<<', '>>']);
const CMP = new Set(['==', '!=', '<', '>', '<=', '>=']);

function selfW(ast, W) {
  switch (ast.k) {
    case 'lit': return ast.w ?? 32;
    case 'id': return W(ast.name);
    case 'sel': return ast.hi - ast.lo + 1;
    case 'un': return ast.op === '!' ? 1 : selfW(ast.a, W);
    case 'bin':
      if (ARITH.has(ast.op)) return Math.max(selfW(ast.a, W), selfW(ast.b, W));
      if (SHIFT.has(ast.op)) return selfW(ast.a, W);
      return 1;
  }
  return 1;
}

function evalAt(ast, w, env, W) {
  switch (ast.k) {
    case 'lit': return mask(ast.v, w);
    case 'id': return mask(env[ast.name] ?? 0n, w);
    case 'sel': return (BigInt(env[ast.name] ?? 0n) >> BigInt(ast.lo)) & ((1n << BigInt(ast.hi - ast.lo + 1)) - 1n);
    case 'un': {
      if (ast.op === '!') return evalAt(ast.a, selfW(ast.a, W), env, W) === 0n ? 1n : 0n;
      const a = evalAt(ast.a, w, env, W);
      return ast.op === '~' ? mask(~a, w) : mask(-a, w);
    }
    case 'bin': {
      const o = ast.op;
      if (o === '&&' || o === '||') {
        const a = evalAt(ast.a, selfW(ast.a, W), env, W) !== 0n, b = evalAt(ast.b, selfW(ast.b, W), env, W) !== 0n;
        return (o === '&&' ? a && b : a || b) ? 1n : 0n;
      }
      if (CMP.has(o)) {
        const cw = Math.max(selfW(ast.a, W), selfW(ast.b, W));
        const a = evalAt(ast.a, cw, env, W), b = evalAt(ast.b, cw, env, W);
        const r = o === '==' ? a === b : o === '!=' ? a !== b : o === '<' ? a < b : o === '>' ? a > b : o === '<=' ? a <= b : a >= b;
        return r ? 1n : 0n;
      }
      if (SHIFT.has(o)) {
        const a = evalAt(ast.a, w, env, W), b = evalAt(ast.b, selfW(ast.b, W), env, W);
        if (b > 4096n) return 0n;
        return mask(o === '<<' ? a << b : a >> b, w);
      }
      const a = evalAt(ast.a, w, env, W), b = evalAt(ast.b, w, env, W);
      const r = o === '+' ? a + b : o === '-' ? a - b : o === '&' ? a & b : o === '|' ? a | b : a ^ b;
      return mask(r, w);
    }
  }
  return 0n;
}

/** Truth value of a condition AST (null = always true) for input values env { name: BigInt }. */
export function evalCond(ast, env, widthOf) {
  if (!ast) return true;
  return evalAt(ast, selfW(ast, widthOf), env, widthOf) !== 0n;
}

/** Names read by a condition AST. */
export function condNames(ast, out = new Set()) {
  if (!ast) return out;
  if (ast.k === 'id' || ast.k === 'sel') out.add(ast.name);
  if (ast.a) condNames(ast.a, out);
  if (ast.b) condNames(ast.b, out);
  return out;
}

/** Parsed condition of a transition: { ast } (null ast = always) or { error }. */
export function parseCond(text) {
  const t = String(text ?? '').trim();
  if (!t || /^(1|true|always)$/i.test(t)) return { ast: null };
  return parseCondition(t);
}

// pseudo-random numbers (repeatable)
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

/**
 * Input combinations to test conditions on: every combination of the inputs `names` when they have
 * at most `maxBits` bits together, else `samples` random ones (plus all-0 / all-1).
 * Returns { envs: [{ name: BigInt }], exhaustive, bits }.
 */
export function inputCombos(m, names, { maxBits = 16, samples = 4096, seed = 12345 } = {}) {
  const ins = m.inputs.filter((i) => names.has(i.name));
  const bits = ins.reduce((a, i) => a + i.width, 0);
  const envs = [];
  if (bits <= maxBits) {
    const n = 1 << bits;
    for (let k = 0; k < n; k++) {
      const env = {};
      let sh = bits;
      for (const i of ins) { sh -= i.width; env[i.name] = BigInt((k >>> sh) & ((1 << i.width) - 1)); }
      envs.push(env);
    }
    return { envs, exhaustive: true, bits };
  }
  const r = rng(seed);
  const rnd = (w) => { let v = 0n; for (let b = 0; b < w; b += 16) v = (v << 16n) | BigInt(r() & 0xffff); return mask(v, w); };
  envs.push(Object.fromEntries(ins.map((i) => [i.name, 0n])), Object.fromEntries(ins.map((i) => [i.name, mask(-1n, i.width)])));
  for (let k = 0; k < samples; k++) envs.push(Object.fromEntries(ins.map((i) => [i.name, rnd(i.width)])));
  return { envs, exhaustive: false, bits };
}

/** "a=1, y=10" (inputs in declaration order; buses in binary). */
export function formatEnv(m, env) {
  return m.inputs.filter((i) => env[i.name] != null).map((i) => `${i.name}=${bitsOf(env[i.name], i.width)}`).join(', ');
}

// ---------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------

const INTERNAL = ['state_reg', 'state_next', 'state_t', 'state_register', 'next_state_logic', 'output_logic', 'fsm_logic'];

/**
 * Problems of a diagram, in plain language: [{ severity: 'error'|'warning'|'info', message,
 * state?, transition? }]. Errors stop the HDL generation; warnings and infos are advice.
 */
export function validateFsm(model) {
  const m = normalizeFsm(model);
  const out = [];
  const add = (severity, message, ref = {}) => out.push({ severity, message, ...ref });
  const badName = (name, what, ref) => {
    if (!name) { add('error', `${what} has no name`, ref); return true; }
    if (!isIdentifier(name)) { add('error', `${what} '${name}' is not a valid name: use a letter, then letters, digits and single _ (not at the end)`, ref); return true; }
    return false;
  };
  const reserved = (name, what, ref) => {
    const r = reservedIn(name);
    if (r.length) { add('error', `${what} '${name}' is a reserved word in ${r.join(' and ')}`, ref); return true; }
    const w = reservedWarning(name);
    if (w) add('warning', w, ref);
    return false;
  };
  if (!badName(m.name, 'The module name')) reserved(m.name, 'The module name');
  const used = new Map();       // lower-case name -> true
  for (const n of INTERNAL) used.set(n, true);
  const claim = (name, ref) => {
    const k = name.toLowerCase();
    if (used.has(k)) { add('error', `The name '${name}' is used twice (letter case does not count; state_reg, state_next and state_t are used by the generated HDL)`, ref); return; }
    used.set(k, true);
  };
  if (m.name) used.set(m.name.toLowerCase(), true);
  for (const [n, what] of [[m.clock, 'The clock'], [m.reset.name, 'The reset']]) if (!badName(n, what) && !reserved(n, what)) claim(n);
  const widthOf = new Map();
  for (const [list, what] of [[m.inputs, 'Input'], [m.outputs, 'Output']]) {
    for (const p of list) {
      if (badName(p.name, what) || reserved(p.name, what)) continue;
      claim(p.name);
      if (!Number.isInteger(p.width) || p.width < 1 || p.width > MAX_WIDTH) { add('error', `${what} '${p.name}': the width must be a whole number from 1 to ${MAX_WIDTH}`); continue; }
      widthOf.set(p.name, p.width);
    }
  }
  const inputs = new Set(m.inputs.map((i) => i.name));
  const outputs = new Map(m.outputs.map((o) => [o.name, o]));
  for (const o of m.outputs) {
    if (!widthOf.has(o.name)) continue;
    const v = constValue(o.default);
    if (v == null) add('error', `Output '${o.name}': the default value '${o.default}' must be a constant (e.g. 0, 1, 4'b1010, 5)`);
    else if (v >= 1n << BigInt(o.width)) add('warning', `Output '${o.name}': the default value ${o.default} does not fit in ${o.width} bit(s)`);
  }

  // states
  if (!m.states.length) add('error', 'The diagram has no states: double-click the drawing to add one');
  const names = new Map();
  for (const s of m.states) {
    if (badName(s.name, 'State', { state: s.id })) continue;
    const k = s.name.toLowerCase();
    if (names.has(k)) add('error', `Two states are named '${s.name}' (letter case does not count)`, { state: s.id });
    names.set(k, s.id);
  }
  if (m.states.length && !stateById(m, m.initial)) add('error', 'The initial (reset) state is not set', {});

  const checkOutputs = (outs, where, ref) => {
    for (const e of outputProblems(outs, m.outputs)) add('error', `${where}: ${e}`, ref);
    for (const [o, val] of Object.entries(outs)) {
      const p = outputs.get(o), v = constValue(val);
      if (p && v != null && widthOf.has(o) && v >= 1n << BigInt(p.width)) add('warning', `${where}: the value ${val} of ${o} does not fit in ${p.width} bit(s)`, ref);
    }
  };
  for (const s of m.states) checkOutputs(s.outputs, `State ${s.name || '?'}`, { state: s.id });

  // transitions
  const parsed = new Map();   // transition id -> ast | undefined (error)
  for (const t of m.transitions) {
    const ref = { transition: t.id };
    const a = stateById(m, t.from), b = stateById(m, t.to);
    if (!a || !b) { add('error', 'A transition starts or ends at a state that does not exist', ref); continue; }
    const where = `Transition ${a.name || '?'} → ${b.name || '?'}`;
    const p = parseCond(t.cond);
    if (p.error) { add('error', `${where}: the condition '${t.cond}' is not valid (${p.error})`, ref); }
    else {
      let ok = true;
      for (const n of condNames(p.ast)) {
        if (inputs.has(n)) continue;
        ok = false;
        if (outputs.has(n)) add('error', `${where}: '${n}' is an output; conditions can only test inputs`, ref);
        else add('error', `${where}: '${n}' in the condition '${t.cond}' is not an input`, ref);
      }
      if (ok && p.ast) {
        try { for (const lang of ['vhdl', 'verilog']) portExprCoder(m, lang).cond(t.cond); } catch (e) { ok = false; add('error', `${where}: ${e.message}`, ref); }
      }
      if (ok) parsed.set(t.id, p.ast);
    }
    checkOutputs(t.outputs, where, ref);
  }
  const hasErrors = out.some((d) => d.severity === 'error');

  // reachability (only transitions whose condition can be true)
  const W = (n) => widthOf.get(n) ?? 1;
  const analysis = hasErrors ? null : analyzeFsm(m, { parsed, widthOf: W });
  if (stateById(m, m.initial)) {
    const seen = new Set([m.initial]);
    const stack = [m.initial];
    while (stack.length) {
      const id = stack.pop();
      for (const t of transitionsFrom(m, id)) {
        if (analysis && analysis.never.has(t.id)) continue;
        if (stateById(m, t.to) && !seen.has(t.to)) { seen.add(t.to); stack.push(t.to); }
      }
    }
    for (const s of m.states) if (!seen.has(s.id)) add('warning', `State ${s.name || '?'} cannot be reached from the initial state ${nameOf(m, m.initial)}`, { state: s.id });
  }
  for (const s of m.states) {
    if (!transitionsFrom(m, s.id).some((t) => t.to !== s.id && stateById(m, t.to))) {
      add('warning', `State ${s.name || '?'} has no exit: once there, the machine stays in it until a reset`, { state: s.id });
    }
  }
  if (analysis) {
    for (const st of analysis.states) {
      const s = stateById(m, st.id);
      for (const n of st.never) {
        const t = m.transitions.find((x) => x.id === n.id);
        const where = `Transition ${s.name || '?'} → ${nameOf(m, t.to)}`;
        if (n.why === 'false') add('warning', `${where} is never taken: its condition '${t.cond}' is never true`, { transition: t.id });
        else add('warning', `${where} is never taken: the transitions listed before it are always taken first`, { transition: t.id });
      }
      for (const o of st.overlaps) {
        const t1 = m.transitions.find((x) => x.id === o.a), t2 = m.transitions.find((x) => x.id === o.b);
        add('warning', `State ${s.name || '?'}: the transitions to ${nameOf(m, t1.to)} ('${t1.cond || '1'}') and to ${nameOf(m, t2.to)} ('${t2.cond || '1'}') are both true when ${formatEnv(m, o.env)}; the one listed first (to ${nameOf(m, t1.to)}) is taken`, { transition: t2.id, state: s.id });
      }
      if (st.stay.count && transitionsFrom(m, s.id).some((t) => t.to !== s.id)) {
        const more = st.stay.count > 1 ? ` (and ${st.stay.count - 1} other combination(s))` : '';
        add('info', `State ${s.name || '?'}: no transition is true when ${formatEnv(m, st.stay.env)}${more}; the machine stays in ${s.name || '?'}`, { state: s.id });
      }
      if (!st.exhaustive) add('info', `State ${s.name || '?'}: the conditions use ${st.bits} input bits; they were checked on ${st.tested} random combinations, not on all of them`, { state: s.id });
    }
  }
  // outputs that never change
  for (const o of m.outputs) {
    if (!widthOf.has(o.name)) continue;
    const dv = constValue(o.default);
    const vals = [...m.states.map((s) => s.outputs[o.name]), ...m.transitions.map((t) => t.outputs[o.name])].filter((v) => v != null);
    if (dv != null && !vals.some((v) => constValue(v) != null && mask(constValue(v), o.width) !== mask(dv, o.width))) {
      add('warning', `Output '${o.name}' is never set: it always keeps its default value ${o.default}`);
    }
  }
  return out;
}

/**
 * Per state, over the input combinations its conditions read: transitions never taken,
 * overlapping pairs (first example), combinations where no transition is true (the machine stays).
 */
export function analyzeFsm(model, { parsed = null, widthOf = null } = {}) {
  const m = normalizeFsm(model);
  const W = widthOf || ((n) => m.inputs.find((i) => i.name === n)?.width ?? 1);
  const astOf = (t) => (parsed ? parsed.get(t.id) : parseCond(t.cond).ast);
  const never = new Set();
  const states = [];
  for (const s of m.states) {
    const ts = transitionsFrom(m, s.id).filter((t) => stateById(m, t.to));
    const asts = ts.map(astOf);
    const used = new Set();
    for (const a of asts) condNames(a, used);
    const { envs, exhaustive, bits } = inputCombos(m, used);
    const taken = ts.map(() => 0);
    const trueCount = ts.map(() => 0);
    const overlaps = new Map();
    let stayCount = 0, stayEnv = null;
    for (const env of envs) {
      const vals = asts.map((a) => evalCond(a, env, W));
      const first = vals.indexOf(true);
      vals.forEach((v, i) => { if (v) trueCount[i]++; });
      if (first < 0) { stayCount++; stayEnv ||= env; continue; }
      taken[first]++;
      for (let j = first + 1; j < vals.length; j++) {
        const differs = ts[j].to !== ts[first].to || JSON.stringify(ts[j].outputs) !== JSON.stringify(ts[first].outputs);
        if (vals[j] && differs) {
          const key = `${ts[first].id}|${ts[j].id}`;
          if (!overlaps.has(key)) overlaps.set(key, { a: ts[first].id, b: ts[j].id, env });
        }
      }
    }
    const nv = [];
    ts.forEach((t, i) => {
      if (taken[i]) return;
      if (!exhaustive && trueCount[i]) return;
      nv.push({ id: t.id, why: trueCount[i] ? 'shadowed' : 'false' });
      never.add(t.id);
    });
    // overlaps of a transition that is never taken are reported as "never taken" only
    const ovl = [...overlaps.values()].filter((o) => !never.has(o.b));
    states.push({ id: s.id, never: nv, overlaps: ovl, stay: { count: stayCount, env: stayEnv }, exhaustive, bits, tested: envs.length });
  }
  return { states, never };
}

/** Errors only. */
export const fsmErrors = (m) => validateFsm(m).filter((d) => d.severity === 'error');

// ---------------------------------------------------------------------------------------
// Reference behaviour (one clock cycle) and simulation
// ---------------------------------------------------------------------------------------

function compiled(model) {
  const m = normalizeFsm(model);
  const W = (n) => m.inputs.find((i) => i.name === n)?.width ?? 1;
  const asts = new Map(m.transitions.map((t) => [t.id, parseCond(t.cond).ast]));
  const ow = new Map(m.outputs.map((o) => [o.name, o.width]));
  const val = (text, o) => mask(constValue(text) ?? 0n, ow.get(o) ?? 1);
  return { m, W, asts, val };
}

/**
 * One cycle of the machine in state `stateId` with inputs `env` ({ name: number|BigInt }):
 * { transition (taken, or null), next (state id), outputs: { name: BigInt } }.
 */
export function stepFsm(model, stateId, env, C = compiled(model)) {
  const { m, W, asts, val } = C;
  const e = Object.fromEntries(Object.entries(env || {}).map(([k, v]) => [k, BigInt(v)]));
  const outs = Object.fromEntries(m.outputs.map((o) => [o.name, val(o.default, o.name)]));
  const s = stateById(m, stateId);
  if (s) for (const [o, v] of Object.entries(s.outputs)) if (o in outs) outs[o] = val(v, o);
  let taken = null;
  for (const t of transitionsFrom(m, stateId)) {
    if (!stateById(m, t.to)) continue;
    if (evalCond(asts.get(t.id), e, W)) { taken = t; break; }
  }
  if (taken) for (const [o, v] of Object.entries(taken.outputs)) if (o in outs) outs[o] = val(v, o);
  return { transition: taken ? taken.id : null, next: taken ? taken.to : stateId, outputs: outs };
}

/** Run from reset over a list of input vectors: [{ state, outputs, next }] (outputs before each clock edge). */
export function simulateFsm(model, vectors) {
  const C = compiled(model);
  let st = C.m.initial;
  return vectors.map((v) => {
    const r = stepFsm(model, st, v, C);
    const row = { state: st, outputs: r.outputs, next: r.next, transition: r.transition };
    st = r.next;
    return row;
  });
}

// ---------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------

const outText = (m, o, v) => (o.width === 1 ? String(v) : bitsOf(v, o.width));

/**
 * Transition table: one row per transition (in priority order) plus, per state, a row "otherwise"
 * when the conditions do not cover every input combination:
 * { columns: [...], rows: [{ state, code, cond, next, outputs: 'z=1', stays?, transition? }] }.
 */
export function transitionTable(model) {
  const m = normalizeFsm(model);
  const enc = new Map(fsmEncoding(m).map((e) => [e.id, e]));
  const an = fsmErrors(m).length ? null : analyzeFsm(m);
  const rows = [];
  for (const s of fsmEncoding(m).map((e) => stateById(m, e.id))) {
    const code = m.encoding === 'enum' ? '' : enc.get(s.id).bits;
    const moore = m.outputs.filter((o) => s.outputs[o.name] != null).map((o) => `${o.name}=${s.outputs[o.name]}`);
    const merged = (t) => { const all = { ...s.outputs, ...t.outputs }; return m.outputs.filter((o) => all[o.name] != null).map((o) => `${o.name}=${all[o.name]}`).join(', '); };
    const ts = transitionsFrom(m, s.id).filter((t) => stateById(m, t.to));
    for (const t of ts) {
      rows.push({ state: s.name, code, cond: t.cond || '1', next: nameOf(m, t.to), nextCode: m.encoding === 'enum' ? '' : enc.get(t.to).bits, outputs: merged(t), transition: t.id });
    }
    const st = an?.states.find((x) => x.id === s.id);
    if (!ts.length || (st && st.stay.count)) {
      rows.push({ state: s.name, code, cond: ts.length ? 'otherwise' : '1', next: s.name, nextCode: code, outputs: moore.join(', '), stays: true });
    }
  }
  return { columns: ['Present state', 'Code', 'Input condition', 'Next state', 'Next code', 'Outputs'], rows };
}

/** Input bits in order (MSB first): [{ input, bit, name }] ('x', or 'y_1', 'y_0' for buses). */
export function inputBits(m) {
  const out = [];
  for (const i of m.inputs) {
    if (i.width === 1) out.push({ input: i.name, bit: 0, name: i.name });
    else for (let b = i.width - 1; b >= 0; b--) out.push({ input: i.name, bit: b, name: `${i.name}_${b}` });
  }
  return out;
}
function outputBits(m) {
  const out = [];
  for (const o of m.outputs) {
    if (o.width === 1) out.push({ output: o.name, bit: 0, name: o.name });
    else for (let b = o.width - 1; b >= 0; b--) out.push({ output: o.name, bit: b, name: `${o.name}_${b}` });
  }
  return out;
}
const envOfBits = (bits, k) => {
  const env = {};
  bits.forEach((b, i) => {
    const v = BigInt((k >> (bits.length - 1 - i)) & 1);
    env[b.input] = (env[b.input] ?? 0n) | (v << BigInt(b.bit));
  });
  return env;
};

export const MAX_TABLE_INPUT_BITS = 6;

/**
 * State table (classic form): one row per present state, one column per input combination
 * (at most MAX_TABLE_INPUT_BITS input bits): next state and, for Mealy outputs, outputs.
 * { combos: ['00', '01', …], inputs: 'x y', rows: [{ state, code, next: [name], outputs: [text], moore: text }] } or null.
 */
export function stateTable(model) {
  const m = normalizeFsm(model);
  if (fsmErrors(m).length) return null;
  const ib = inputBits(m);
  if (ib.length > MAX_TABLE_INPUT_BITS) return null;
  const C = compiled(m);
  const enc = fsmEncoding(m);
  const combos = Array.from({ length: 1 << ib.length }, (_, k) => (ib.length ? k.toString(2).padStart(ib.length, '0') : '—'));
  const rows = enc.map((e) => {
    const s = stateById(m, e.id);
    const next = [], outs = [];
    for (let k = 0; k < combos.length; k++) {
      const r = stepFsm(m, s.id, envOfBits(ib, k), C);
      next.push(nameOf(m, r.next));
      outs.push(m.outputs.map((o) => outText(m, o, r.outputs[o.name])).join(' '));
    }
    const moore = m.outputs.map((o) => outText(m, o, mask(constValue(s.outputs[o.name] ?? o.default) ?? 0n, o.width))).join(' ');
    return { state: s.name, code: m.encoding === 'enum' ? '' : e.bits, next, outputs: outs, moore };
  });
  return { inputs: ib.map((b) => b.name).join(' '), outputs: m.outputs.map((o) => o.name).join(' '), combos, rows, mealy: m.type === 'mealy' };
}

/**
 * Encoded transition table (binary / gray encodings): every present-state code (unused codes:
 * don't care) and input combination -> next-state bits and output bits.
 * { stateBits: ['q1','q0'], nextBits: ['d1','d0'], inputBits: [...], outputBits: [...],
 *   rows: [{ q: '01', in: '1', d: '10', out: '0', unused?: true, state?: name, next?: name }] } or { error }.
 */
export function encodedTable(model) {
  const m = normalizeFsm(model);
  if (m.encoding !== 'binary' && m.encoding !== 'gray') return { error: 'The encoded table is made for the binary and gray encodings (choose one of them)' };
  if (fsmErrors(m).length) return { error: 'Correct the errors of the diagram first' };
  const enc = fsmEncoding(m);
  const w = enc[0]?.width ?? 1;
  const ib = inputBits(m), ob = outputBits(m);
  if (ib.length + w > 10) return { error: `Too many bits for a table: ${w} state bit(s) + ${ib.length} input bit(s) (at most 10)` };
  const taken = new Set(ib.map((b) => b.name.toLowerCase()).concat(ob.map((b) => b.name.toLowerCase())));
  const pick = (base) => { let p = base; while (Array.from({ length: w }, (_, i) => `${p}${i}`).some((n) => taken.has(n.toLowerCase()))) p = `${p}${base}`; return p; };
  const qp = pick('q'), dp = pick('d');
  const stateBits = Array.from({ length: w }, (_, i) => `${qp}${w - 1 - i}`);
  const nextBits = Array.from({ length: w }, (_, i) => `${dp}${w - 1 - i}`);
  const C = compiled(m);
  const byCode = new Map(enc.map((e) => [e.bits, e]));
  const rows = [];
  for (let c = 0; c < 1 << w; c++) {
    const q = c.toString(2).padStart(w, '0');
    const e = byCode.get(q);
    for (let k = 0; k < 1 << ib.length; k++) {
      const inb = ib.length ? k.toString(2).padStart(ib.length, '0') : '';
      if (!e) { rows.push({ q, in: inb, d: 'X'.repeat(w), out: 'X'.repeat(ob.length), unused: true }); continue; }
      const r = stepFsm(m, e.id, envOfBits(ib, k), C);
      const out = ob.map((b) => String((r.outputs[b.output] >> BigInt(b.bit)) & 1n)).join('');
      rows.push({ q, in: inb, d: enc.find((x) => x.id === r.next).bits, out, state: e.name, next: nameOf(m, r.next) });
    }
  }
  return { stateBits, nextBits, inputBits: ib.map((b) => b.name), outputBits: ob.map((b) => b.name), rows };
}

export const TT_MAX_INPUTS = 6;

/**
 * Truth tables (core/logic.js documents) of the next-state bits and of the outputs, from the
 * encoded table: inputs = state bits + input bits (at most 6); one table of the next-state bits,
 * one of the output bits (any number of each). Unused state codes are don't cares (X).
 * Returns { tables: [{ suffix, doc }] } or { error }.
 */
export function truthTablesOf(model) {
  const m = normalizeFsm(model);
  const t = encodedTable(m);
  if (t.error) return t;
  const ins = [...t.stateBits, ...t.inputBits];
  if (ins.length > TT_MAX_INPUTS) return { error: `A truth table has at most ${TT_MAX_INPUTS} inputs; this machine needs ${ins.length} (${t.stateBits.length} state bit(s) + ${t.inputBits.length} input bit(s))` };
  const cols = [...t.nextBits.map((n, i) => ({ name: n, get: (r) => r.d[i] })), ...t.outputBits.map((n, i) => ({ name: n, get: (r) => r.out[i] }))];
  const groups = [{ suffix: 'next', cols: cols.slice(0, t.nextBits.length) }, { suffix: 'out', cols: cols.slice(t.nextBits.length) }].filter((g) => g.cols.length);
  const tables = groups.map((g) => {
    const table = {};
    for (const c of g.cols) table[c.name] = t.rows.map((r) => c.get(r)).join('');
    return {
      suffix: g.suffix,
      doc: {
        version: 1, name: `${m.name}_${g.suffix}`, inputs: ins, outputs: g.cols.map((c) => c.name), table, exprs: {}, form: 'sop', lang: m.lang,
        notes: `${g.suffix.startsWith('next') ? 'Next-state' : 'Output'} logic of the state machine ${m.name} (${m.encoding} encoding): ` +
          `state bits ${t.stateBits.join(', ')} (present state), ${t.nextBits.join(', ')} = next state (D inputs of the flip-flops). Unused state codes are don't cares (X).`,
      },
    };
  });
  return { tables };
}

/** Rows of a table as CSV text. */
export function toCsv(rows) {
  const q = (v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
}

// ---------------------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------------------

/** Positions for every state (breadth-first order from the initial state, on a circle or a grid). */
export function autoLayout(model) {
  const m = normalizeFsm(model);
  const order = [];
  const seen = new Set();
  const visit = (start) => {
    const q = [start];
    seen.add(start);
    while (q.length) {
      const id = q.shift();
      order.push(id);
      for (const t of transitionsFrom(m, id)) if (stateById(m, t.to) && !seen.has(t.to)) { seen.add(t.to); q.push(t.to); }
    }
  };
  if (stateById(m, m.initial)) visit(m.initial);
  for (const s of m.states) if (!seen.has(s.id)) visit(s.id);
  const n = order.length;
  if (n <= 3) {
    order.forEach((id, i) => { const s = stateById(m, id); s.x = 120 + i * 200; s.y = 160; });
  } else if (n <= 10) {
    const R = Math.max(170, n * 44);
    order.forEach((id, i) => {
      const a = Math.PI + (2 * Math.PI * i) / n;         // the initial state on the left
      const s = stateById(m, id);
      s.x = Math.round(R + 80 + R * Math.cos(a));
      s.y = Math.round(R + 80 + R * Math.sin(a));
    });
  } else {
    const cols = Math.ceil(Math.sqrt(n));
    order.forEach((id, i) => { const s = stateById(m, id); s.x = 120 + (i % cols) * 190; s.y = 120 + Math.floor(i / cols) * 170; });
  }
  for (const t of m.transitions) { delete t.bend; delete t.angle; }
  return m;
}

/** Keep the previous positions; place the new states (no previous position) by the layout. */
export function placeNew(m, prev) {
  const known = new Set(prev ? prev.states.filter((s) => m.states.some((x) => x.id === s.id && x.name === s.name)).map((s) => s.id) : []);
  if (!known.size) {
    const L = autoLayout(m);
    for (const s of m.states) { const p = L.states.find((x) => x.id === s.id); s.x = p.x; s.y = p.y; }
    return m;
  }
  let maxX = Math.max(...m.states.filter((s) => known.has(s.id)).map((s) => s.x));
  const y0 = Math.min(...m.states.filter((s) => known.has(s.id)).map((s) => s.y));
  let k = 0;
  for (const s of m.states) if (!known.has(s.id)) { s.x = maxX + 200; s.y = y0 + (k++) * 150; }
  return m;
}

// ---------------------------------------------------------------------------------------
// HDL -> diagram
// ---------------------------------------------------------------------------------------

/**
 * Read a VHDL / Verilog state machine back into a diagram (through the ASM reader of
 * core/asm-from-hdl.js): { model, warnings }. Throws an Error (in plain language) when the module
 * is not a plain state machine. `previous`: the diagram the HDL was generated from.
 */
export function fsmFromHdl(source, { path = '', module = null, lang = null, previous = null } = {}) {
  const prev = previous ? normalizeFsm(previous) : null;
  let prevAsm = null;
  if (prev && !fsmErrors(prev).length) { try { prevAsm = fsmToAsm(prev); } catch { prevAsm = null; } }
  const r = asmFromHdl(source, { path, module, lang, previous: prevAsm });
  const model = asmToFsm(r.model, { previous: prev });
  model.lang = r.model.lang;
  if (prev?.generatedFile) model.generatedFile = prev.generatedFile;
  if (prev?.base) model.base = prev.base;
  const warnings = r.warnings.filter((w) => !/regenerating it from the chart/.test(w));
  return { model, warnings };
}

/** True if both diagrams describe the same machine (positions, ids and arc shapes ignored). */
export function sameFsm(a, b) {
  const strip = (x) => {
    const m = normalizeFsm(x);
    const nm = new Map(m.states.map((s) => [s.id, s.name]));
    return JSON.stringify({
      ...m, generatedFile: undefined, base: undefined,
      states: m.states.map((s) => ({ name: s.name, outputs: s.outputs })),
      transitions: m.transitions.map((t) => ({ from: nm.get(t.from), to: nm.get(t.to), cond: t.cond, outputs: t.outputs })),
      initial: nm.get(m.initial),
    });
  };
  return strip(a) === strip(b);
}
