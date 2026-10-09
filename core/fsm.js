// Silinx - FSM (bubble diagram) state machines: model, validation, analysis, tables, HDL
// generation and HDL read-back.
//
// Isomorphic ES module: no DOM and no Node APIs (browser editor, tests, CLI).
//
// Model (saved as <name>.fsm.json):
//
//   {
//     version: 1, kind: 'fsm', name: 'det11', lang: 'vhdl' | 'verilog',
//     type: 'moore' | 'mealy',
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

import {
  parseCondition, parseAction, exprToString, isIdentifier, reservedIn, portExprCoder, parseCaseChoices,
  normalizeModel as normalizeAsm,
} from './asm.js';
import { asmFromHdl, asmLayout } from './asm-from-hdl.js';

export const FSM_VERSION = 1;
export const FSM_ENCODINGS = ['binary', 'gray', 'onehot', 'enum'];
export const FSM_STYLES = ['3process', '2process'];
export const MAX_WIDTH = 32;
export const STATE_R = 34;            // radius of a state circle (drawing units)

const arr = (v) => (Array.isArray(v) ? v : []);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - s.length));
const bitsOf = (v, w) => (BigInt(v) & ((1n << BigInt(w)) - 1n)).toString(2).padStart(w, '0');
const mask = (v, w) => v & ((1n << BigInt(w)) - 1n);

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

/** Parse "z=1, y = 2'b10; w" -> { outputs: { z: '1', y: "2'b10", w: '1' } } or { error }. */
export function parseOutputs(text) {
  const out = {};
  const parts = String(text ?? '').split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:(?:<=|:=|=)\s*(.+))?$/.exec(p);
    if (!m) return { error: `'${p}' is not an output assignment (write output=value, e.g. z=1)` };
    out[m[1]] = m[2] == null ? '1' : m[2].trim();
  }
  return { outputs: out };
}

/** "z=1, y=2'b10" */
export function formatOutputs(o) {
  return Object.entries(o || {}).map(([k, v]) => `${k}=${v}`).join(', ');
}

/** Split a transition label "cond / z=1" into { cond, outputs } (a '/' followed by '=' belongs to the condition). */
export function parseLabel(text) {
  const s = String(text ?? '');
  let k = -1;
  for (let i = s.length - 1; i >= 0; i--) if (s[i] === '/' && s[i + 1] !== '=') { k = i; break; }
  const cond = (k < 0 ? s : s.slice(0, k)).trim();
  const outs = k < 0 ? '' : s.slice(k + 1);
  const r = parseOutputs(outs);
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
    type: src.type === 'mealy' ? 'mealy' : 'moore',
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
    name, lang, type: 'moore', encoding: 'binary', style: '3process',
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

const stateById = (m, id) => m.states.find((s) => s.id === id);
const nameOf = (m, id) => stateById(m, id)?.name || '?';

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
function condNames(ast, out = new Set()) {
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
    for (const [o, val] of Object.entries(outs)) {
      const p = outputs.get(o);
      if (!p) { add('error', `${where}: '${o}' is not an output`, ref); continue; }
      const v = constValue(val);
      if (v == null) add('error', `${where}: the value '${val}' of ${o} must be a constant (e.g. 0, 1, 4'b1010, 5)`, ref);
      else if (widthOf.has(o) && v >= 1n << BigInt(p.width)) add('warning', `${where}: the value ${val} of ${o} does not fit in ${p.width} bit(s)`, ref);
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
    if (Object.keys(t.outputs).length && m.type === 'moore') {
      add('error', `${where} has outputs (${formatOutputs(t.outputs)}), but this is a Moore machine: give the outputs to the states, or make it a Mealy machine`, ref);
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

export const TT_MAX_INPUTS = 6, TT_MAX_OUTPUTS = 4;

/**
 * Truth tables (core/logic.js documents) of the next-state bits and of the outputs, from the
 * encoded table: inputs = state bits + input bits (at most 6), at most 4 outputs per table
 * (several tables when there are more). Unused state codes are don't cares (X).
 * Returns { tables: [{ suffix, doc }] } or { error }.
 */
export function truthTablesOf(model) {
  const m = normalizeFsm(model);
  const t = encodedTable(m);
  if (t.error) return t;
  const ins = [...t.stateBits, ...t.inputBits];
  if (ins.length > TT_MAX_INPUTS) return { error: `A truth table has at most ${TT_MAX_INPUTS} inputs; this machine needs ${ins.length} (${t.stateBits.length} state bit(s) + ${t.inputBits.length} input bit(s))` };
  const cols = [...t.nextBits.map((n, i) => ({ name: n, get: (r) => r.d[i] })), ...t.outputBits.map((n, i) => ({ name: n, get: (r) => r.out[i] }))];
  const groups = [];
  const nextCols = cols.slice(0, t.nextBits.length), outCols = cols.slice(t.nextBits.length);
  for (let i = 0; i < nextCols.length; i += TT_MAX_OUTPUTS) groups.push({ suffix: nextCols.length > TT_MAX_OUTPUTS ? `next${i / TT_MAX_OUTPUTS + 1}` : 'next', cols: nextCols.slice(i, i + TT_MAX_OUTPUTS) });
  for (let i = 0; i < outCols.length; i += TT_MAX_OUTPUTS) groups.push({ suffix: outCols.length > TT_MAX_OUTPUTS ? `out${i / TT_MAX_OUTPUTS + 1}` : 'out', cols: outCols.slice(i, i + TT_MAX_OUTPUTS) });
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
// HDL generation
// ---------------------------------------------------------------------------------------

function sortedOutputs(m, outs) { return m.outputs.filter((o) => outs[o.name] != null).map((o) => [o, outs[o.name]]); }
/** Statements (printed later) for one language. */
function printIf(chain, ind, lang, out, elseBody = null) {
  // chain: [{ cond, body: [lines] }]; elseBody: [lines] | null
  const I = '    '.repeat(ind);
  chain.forEach((br, i) => {
    if (lang === 'vhdl') out.push(`${I}${i ? 'elsif' : 'if'} ${br.cond} then`);
    else out.push(`${I}${i ? 'end else if' : 'if'} (${br.cond}) begin`);
    if (br.body.length) for (const l of br.body) out.push(`${I}    ${l}`);
    else if (lang === 'vhdl') out.push(`${I}    null;`);
  });
  if (elseBody) {
    out.push(lang === 'vhdl' ? `${I}else` : `${I}end else begin`);
    for (const l of elseBody) out.push(`${I}    ${l}`);
  }
  out.push(lang === 'vhdl' ? `${I}end if;` : `${I}end`);
}

/**
 * Generate the HDL module of the diagram: { lang, filename, code }. Throws if it has errors.
 * `source`: file name of the diagram, for the header.
 */
export function generateFsm(model, lang, { source } = {}) {
  const m = normalizeFsm(model);
  lang = lang === 'verilog' || (!lang && m.lang === 'verilog') ? 'verilog' : 'vhdl';
  const errs = fsmErrors(m);
  if (errs.length) {
    const e = new Error(`The state diagram '${m.name}' has ${errs.length} error(s):\n${errs.map((d) => `  - ${d.message}`).join('\n')}`);
    e.diagnostics = errs;
    throw e;
  }
  const V = lang === 'vhdl';
  const c = V ? '--' : '//';
  const enc = fsmEncoding(m);
  const W = enc[0].width;
  const encById = new Map(enc.map((e) => [e.id, e]));
  const coderN = portExprCoder(m, lang), coderO = portExprCoder(m, lang);
  const ow = new Map(m.outputs.map((o) => [o.name, o.width]));
  const lit = (text, o) => coderN.lit(mask(constValue(text) ?? 0n, ow.get(o)), ow.get(o), /^\d+$/.test(String(text).trim()) && ow.get(o) > 1 ? 'd' : 'b');
  const asg = (o, text) => (V ? `${o} <= ${lit(text, o)};` : `${o} = ${lit(text, o)};`);
  const setState = (id) => (V ? `state_next <= ${encById.get(id).constName};` : `state_next = ${encById.get(id).constName};`);
  const two = m.style === '2process';
  const states = enc.map((e) => stateById(m, e.id));
  const ts = (id) => transitionsFrom(m, id).filter((t) => stateById(m, t.to));
  const an = analyzeFsm(m);
  const never = an.never;

  // ---- header
  const rule = c + '='.repeat(78);
  const L = [rule];
  const kindText = m.type === 'mealy' ? 'Mealy' : 'Moore';
  L.push(`${c} ${V ? 'Entity' : 'Module'}      : ${m.name}`);
  L.push(`${c} Description : ${kindText} finite state machine generated from the state diagram ${source || `${m.name}.fsm.json`}`);
  if (m.description) for (const line of m.description.split(/\r?\n/)) L.push(`${c}               ${line}`.trimEnd());
  L.push(`${c} Generator   : Silinx FSM editor, kept in sync with the diagram (edit either one).`);
  L.push(`${c} Style       : ${two ? '2 processes: state register + next-state and output logic' : '3 processes: state register, next-state logic, output logic'}`);
  L.push(`${c} Clock       : ${m.clock} (rising edge)`);
  L.push(`${c} Reset       : ${m.reset.name}, active-${m.reset.active}, ${m.reset.sync ? 'synchronous' : 'asynchronous'} (goes to ${nameOf(m, m.initial)})`);
  L.push(`${c} Encoding    : ${m.encoding}${m.encoding === 'enum' ? '' : ` (${W} state bit${W === 1 ? '' : 's'})`}`);
  L.push(c);
  L.push(`${c} States${m.encoding === 'enum' && V ? '' : ' and codes'}${m.type === 'moore' || states.some((s) => Object.keys(s.outputs).length) ? ' (Moore outputs)' : ''}:`);
  const nw = Math.max(4, ...states.map((s) => s.name.length));
  for (const s of states) {
    const e = encById.get(s.id);
    const code = m.encoding === 'enum' && V ? '' : ` = ${e.bits}`;
    const mo = sortedOutputs(m, s.outputs).map(([o, v]) => `${o.name} = ${v}`).join(', ');
    L.push(`${c}   ${pad(s.name, nw)}${code}${s.id === m.initial ? '  (reset)' : '         '}${mo ? `  ${mo}` : ''}`.trimEnd());
  }
  L.push(c);
  L.push(`${c} Transitions (state : condition -> next state${m.type === 'mealy' ? ' / Mealy outputs' : ''}); the first true condition is taken:`);
  for (const s of states) {
    for (const t of ts(s.id)) {
      const mo = sortedOutputs(m, t.outputs).map(([o, v]) => `${o.name} = ${v}`).join(', ');
      L.push(`${c}   ${pad(s.name, nw)} : ${t.cond || '1'} -> ${nameOf(m, t.to)}${mo ? ` / ${mo}` : ''}${never.has(t.id) ? '   (never taken)' : ''}`);
    }
    const st = an.states.find((x) => x.id === s.id);
    if (!ts(s.id).length) L.push(`${c}   ${pad(s.name, nw)} : (no transition: stays in ${s.name})`);
    else if (st.stay.count) L.push(`${c}   ${pad(s.name, nw)} : otherwise -> ${s.name} (stays)`);
  }
  L.push(rule);
  L.push('');

  // ---- per state logic
  // next-state chain: [{ cond, t }], until an always-true transition (the else of the chain)
  const chainOf = (s) => {
    const chain = [];
    let otherwise = null;
    for (const t of ts(s.id)) {
      if (!t.cond) { otherwise = t; break; }
      chain.push({ cond: coderN.cond(t.cond), t });
    }
    return { chain, otherwise };
  };
  const mooreLines = (s) => sortedOutputs(m, s.outputs).map(([o, v]) => asg(o.name, v));
  const mealyLines = (t) => sortedOutputs(m, t.outputs).map(([o, v]) => asg(o.name, v));
  const nextStmts = (s, withMealy) => {
    const { chain, otherwise } = chainOf(s);
    const body = (t) => [setState(t.to), ...(withMealy ? mealyLines(t) : [])];
    if (!chain.length && !otherwise) return [];
    if (!chain.length) return body(otherwise);
    const out = [];
    printIf(chain.map((b) => ({ cond: b.cond, body: body(b.t) })), 0, lang, out, otherwise ? body(otherwise) : null);
    return out;
  };
  // Mealy outputs alone (3-process style): the branches with outputs; earlier branches without
  // outputs are kept (empty) only when their conditions can overlap a later one
  const mealyStmts = (s) => {
    const all = ts(s.id);
    const last = all.map((t) => Object.keys(t.outputs).length > 0).lastIndexOf(true);
    if (last < 0) return [];
    const st = an.states.find((x) => x.id === s.id);
    const ids = new Set(all.slice(0, last + 1).map((t) => t.id));
    const overlapping = st.overlaps.some((o) => ids.has(o.a) && ids.has(o.b));
    const use = all.slice(0, last + 1).filter((t) => overlapping || Object.keys(t.outputs).length);
    const chain = [];
    let otherwise = null;
    for (const t of use) {
      if (!t.cond) { otherwise = t; break; }
      chain.push({ cond: coderO.cond(t.cond), body: mealyLines(t) });
    }
    if (!chain.length) return otherwise ? mealyLines(otherwise) : [];
    const out = [];
    printIf(chain, 0, lang, out, otherwise ? mealyLines(otherwise) : null);
    return out;
  };

  const rstOn = m.reset.active === 'high' ? '1' : '0';
  const sens = (coder) => [...m.inputs.map((i) => i.name).filter((n) => coder.reads.has(n))];
  const emitCase = (I, items, others) => {
    const out = [];
    if (V) {
      out.push(`${I}case state_reg is`);
      for (const [s, body] of items) {
        out.push(`${I}    when ${encById.get(s.id).constName} =>`);
        if (body.length) for (const l of body) out.push(`${I}        ${l}`);
        else out.push(`${I}        null;`);
      }
      out.push(`${I}    when others =>`);
      out.push(`${I}        ${others || 'null;'}`);
      out.push(`${I}end case;`);
    } else {
      out.push(`${I}case (state_reg)`);
      for (const [s, body] of items) {
        const cn = encById.get(s.id).constName;
        if (!body.length) { out.push(`${I}    ${cn}: ;`); continue; }
        if (body.length === 1) { out.push(`${I}    ${cn}: ${body[0]}`); continue; }
        out.push(`${I}    ${cn}: begin`);
        for (const l of body) out.push(`${I}        ${l}`);
        out.push(`${I}    end`);
      }
      out.push(`${I}    default: ${others || ';'}`);
      out.push(`${I}endcase`);
    }
    return out;
  };

  // bodies first (they fill the sensitivity lists)
  const nextItems = states.map((s) => [s, two ? [...mooreLines(s), ...nextStmts(s, true)] : nextStmts(s, false)]);
  const outItems = two ? [] : states.map((s) => [s, [...mooreLines(s), ...mealyStmts(s)]]).filter(([, b]) => b.length);
  const resetState = encById.get(m.initial).constName;
  const defaults = m.outputs.map((o) => asg(o.name, o.default));

  if (V) {
    const typ = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
    L.push('library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '');
    L.push(`entity ${m.name} is`, '    port (');
    const ports = [[m.clock, 'in ', 'std_logic'], [m.reset.name, 'in ', 'std_logic'],
      ...m.inputs.map((p) => [p.name, 'in ', typ(p.width)]), ...m.outputs.map((p) => [p.name, 'out', typ(p.width)])];
    const pw = Math.max(...ports.map((p) => p[0].length));
    ports.forEach((p, i) => L.push(`        ${pad(p[0], pw)} : ${p[1]} ${p[2]}${i < ports.length - 1 ? ';' : ''}`));
    L.push('    );', `end entity ${m.name};`, '', `architecture rtl of ${m.name} is`, '', '    -- state encoding');
    if (m.encoding === 'enum') L.push(`    type state_t is (${enc.map((e) => e.constName).join(', ')});`);
    else {
      L.push(`    subtype state_t is std_logic_vector(${W - 1} downto 0);`);
      const cw = Math.max(...enc.map((e) => e.constName.length));
      for (const e of enc) L.push(`    constant ${pad(e.constName, cw)} : state_t := "${e.bits}";`);
    }
    L.push('', `    signal state_reg  : state_t := ${resetState};   -- present state`, '    signal state_next : state_t;                -- next state');
    if (m.encoding !== 'enum') L.push('', '    attribute fsm_encoding : string;', '    attribute fsm_encoding of state_reg : signal is "user";');
    L.push('', 'begin', '');
    L.push('    -- ------------------------------------------------------------------ state register');
    if (m.reset.sync) {
      L.push(`    state_register : process (${m.clock})`, '    begin', `        if rising_edge(${m.clock}) then`,
        `            if ${m.reset.name} = '${rstOn}' then`, `                state_reg <= ${resetState};`, '            else',
        '                state_reg <= state_next;', '            end if;', '        end if;');
    } else {
      L.push(`    state_register : process (${m.clock}, ${m.reset.name})`, '    begin', `        if ${m.reset.name} = '${rstOn}' then`,
        `            state_reg <= ${resetState};`, `        elsif rising_edge(${m.clock}) then`, '            state_reg <= state_next;', '        end if;');
    }
    L.push('    end process state_register;', '');
    const label = two ? 'fsm_logic' : 'next_state_logic';
    L.push(`    -- ------------------------------------------------------------------ ${two ? 'next-state and output logic' : 'next-state logic'}`);
    L.push(`    ${label} : process (${['state_reg', ...sens(coderN)].join(', ')})`, '    begin');
    L.push('        state_next <= state_reg;   -- no transition taken: stay in the present state');
    if (two && defaults.length) { L.push('        -- default output values (every output is assigned on every path: no latches)'); for (const d of defaults) L.push(`        ${d}`); }
    L.push(...emitCase('        ', nextItems, `state_next <= ${resetState};`));
    L.push(`    end process ${label};`);
    if (!two && m.outputs.length) {
      L.push('', '    -- ------------------------------------------------------------------ output logic');
      L.push(`    output_logic : process (${['state_reg', ...sens(coderO)].join(', ')})`, '    begin');
      L.push('        -- default output values (every output is assigned on every path: no latches)');
      for (const d of defaults) L.push(`        ${d}`);
      L.push(...emitCase('        ', outItems, null));
      L.push('    end process output_logic;');
    }
    L.push('', 'end architecture rtl;', '');
  } else {
    const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
    L.push(`module ${m.name} (`);
    const vw = Math.max(0, ...[...m.inputs, ...m.outputs].map((p) => vec(p.width).length));
    const pl = [`    input  wire ${pad('', vw)}${m.clock}`, `    input  wire ${pad('', vw)}${m.reset.name}`,
      ...m.inputs.map((p) => `    input  wire ${pad(vec(p.width), vw)}${p.name}`),
      ...m.outputs.map((p) => `    output reg  ${pad(vec(p.width), vw)}${p.name}`)];
    L.push(pl.map((l, i) => l + (i < pl.length - 1 ? ',' : '')).join('\n'), ');', '');
    L.push('    // ---------------------------------------------------------------- state encoding');
    const cw = Math.max(...enc.map((e) => e.constName.length));
    for (const e of enc) L.push(`    localparam ${vec(W)}${pad(e.constName, cw)} = ${W}'b${e.bits};`);
    L.push('', `    reg ${vec(W)}state_reg = ${resetState};   // present state`);
    if (m.encoding !== 'enum') L.push('    // synthesis attribute fsm_encoding of state_reg is user');
    L.push(`    reg ${vec(W)}state_next;              // next state`, '');
    L.push('    // ---------------------------------------------------------------- state register');
    const edge = m.reset.sync ? `posedge ${m.clock}` : `posedge ${m.clock} or ${m.reset.active === 'high' ? 'posedge' : 'negedge'} ${m.reset.name}`;
    L.push(`    always @(${edge}) begin`, `        if (${m.reset.active === 'high' ? m.reset.name : `!${m.reset.name}`}) begin`,
      `            state_reg <= ${resetState};`, '        end else begin', '            state_reg <= state_next;', '        end', '    end', '');
    L.push(`    // ---------------------------------------------------------------- ${two ? 'next-state and output logic' : 'next-state logic'}`);
    L.push('    always @(*) begin', '        state_next = state_reg;   // no transition taken: stay in the present state');
    if (two && defaults.length) { L.push('        // default output values (every output is assigned on every path: no latches)'); for (const d of defaults) L.push(`        ${d}`); }
    L.push(...emitCase('        ', nextItems, `state_next = ${resetState};`));
    L.push('    end');
    if (!two && m.outputs.length) {
      L.push('', '    // ---------------------------------------------------------------- output logic');
      L.push('    always @(*) begin', '        // default output values (every output is assigned on every path: no latches)');
      for (const d of defaults) L.push(`        ${d}`);
      L.push(...emitCase('        ', outItems, null));
      L.push('    end');
    }
    L.push('', 'endmodule', '');
  }
  return { lang, filename: `${m.name}.${V ? 'vhd' : 'v'}`, code: L.join('\n') };
}

// ---------------------------------------------------------------------------------------
// FSM <-> ASM chart
// ---------------------------------------------------------------------------------------

const actionsOf = (m, outs) => sortedOutputs(m, outs).map(([o, v]) => `${o.name} = ${v}`);

/** The ASM chart (core/asm.js model) of the diagram: one decision box per condition, in priority order. */
export function fsmToAsm(model) {
  const m = normalizeFsm(model);
  const nodes = [], edges = [];
  let k = 0;
  const id = (p) => `${p}${++k}`;
  for (const s of m.states) nodes.push({ id: s.id, type: 'state', name: s.name, x: 0, y: 0, actions: actionsOf(m, s.outputs) });
  for (const s of m.states) {
    let from = s.id, port = 'next';
    const link = (to) => edges.push({ id: id('e'), from, to, port });
    let ended = false;
    for (const t of transitionsFrom(m, s.id).filter((x) => stateById(m, x.to))) {
      const target = () => {
        const acts = actionsOf(m, t.outputs);
        if (!acts.length) return t.to;
        const o = id('o');
        nodes.push({ id: o, type: 'output', x: 0, y: 0, actions: acts });
        edges.push({ id: id('e'), from: o, to: t.to, port: 'next' });
        return o;
      };
      if (!t.cond) { link(target()); ended = true; break; }
      const d = id('d');
      nodes.push({ id: d, type: 'decision', x: 0, y: 0, cond: t.cond });
      link(d);
      from = d; port = 'true'; link(target());
      port = 'false';
    }
    if (!ended) link(s.id);   // nothing true: stay
  }
  const asm = normalizeAsm({
    version: 1, name: m.name, lang: m.lang, clock: m.clock, reset: m.reset, encoding: m.encoding,
    inputs: m.inputs.map((i) => ({ name: i.name, width: i.width })),
    outputs: m.outputs.map((o) => ({ name: o.name, width: o.width, default: o.default, registered: false })),
    nodes, edges, initial: m.initial, ...(m.description ? { description: m.description } : {}),
  });
  return asmLayout(asm);
}

/** Paths of the ASM block of a state: [{ conds: [{ ast, text, neg }], acts: ['z = 1'], to }] */
function asmPaths(asm, stateId) {
  const nodes = new Map(asm.nodes.map((n) => [n.id, n]));
  const exits = new Map();
  for (const e of asm.edges) { if (!exits.has(e.from)) exits.set(e.from, []); exits.get(e.from).push(e); }
  const widthOf = (name) => asm.inputs.find((i) => i.name === name)?.width ?? 1;
  const out = [];
  const walk = (id, conds, acts, depth) => {
    if (depth > 200) throw new Error('the chart has a loop without a state');
    const n = nodes.get(id);
    if (!n) throw new Error('the chart has an exit that leads nowhere');
    if (n.type === 'state') { out.push({ conds, acts, to: n.id }); return; }
    const ex = exits.get(id) || [];
    if (n.type === 'decision') {
      const p = parseCond(n.cond);
      if (p.error) throw new Error(`the condition '${n.cond}' is not valid (${p.error})`);
      for (const e of ex) {
        const neg = e.port === 'false';
        walk(e.to, [...conds, { ast: p.ast, text: n.cond, neg }], acts, depth + 1);
      }
      return;
    }
    if (n.type === 'case') {
      const p = parseCond(n.expr);
      if (p.error || !p.ast) throw new Error(`the case expression '${n.expr}' is not valid`);
      const w = p.ast.k === 'sel' ? p.ast.hi - p.ast.lo + 1 : widthOf(p.ast.name);
      const lit = (v) => ({ k: 'lit', v, w, base: 'b' });
      const all = ex.map((e) => parseCaseChoices(e.port, w));
      for (let i = 0; i < ex.length; i++) {
        const ch = all[i];
        let ast;
        if (ch.others) {
          const vals = all.filter((x) => x.values).flatMap((x) => x.values);
          ast = vals.length ? vals.map((v) => ({ k: 'bin', op: '!=', a: p.ast, b: lit(v) })).reduce((a, b) => ({ k: 'bin', op: '&&', a, b })) : null;
        } else ast = ch.values.map((v) => ({ k: 'bin', op: '==', a: p.ast, b: lit(v) })).reduce((a, b) => ({ k: 'bin', op: '||', a, b }));
        walk(ex[i].to, ast ? [...conds, { ast, text: exprToString(ast), neg: false }] : conds, acts, depth + 1);
      }
      return;
    }
    if (n.type === 'output') {
      const nx = ex.find((e) => e.port === 'next');
      if (!nx) throw new Error('a conditional output box has no exit');
      walk(nx.to, conds, [...acts, ...n.actions], depth + 1);
      return;
    }
    throw new Error(`a ${n.type} box cannot be part of a state diagram`);
  };
  const first = (exits.get(stateId) || []).find((e) => e.port === 'next');
  if (!first) return [];       // no exit: stays
  walk(first.to, [], [], 0);
  return out;
}

const atomic = (s) => /^!?[A-Za-z_][A-Za-z0-9_]*(\[\d+(:\d+)?\])?$/.test(s.trim());
const wrap = (s) => (atomic(s) ? s.trim() : `(${s.trim()})`);
/** A test of a 1-bit input against 0 / 1 written as x / !x. */
function simpleText(c, W) {
  const a = c.ast;
  let neg = c.neg;
  if (a && a.k === 'bin' && (a.op === '==' || a.op === '!=') && a.a.k === 'id' && W(a.a.name) === 1 && a.b.k === 'lit' && a.b.v <= 1n) {
    if ((a.b.v === 0n) !== (a.op === '!=')) neg = !neg;
    return { text: a.a.name, neg };
  }
  return { text: c.text, neg };
}
const condText = (conds, W = () => 0) => conds.map((c0) => {
  const c = simpleText(c0, W);
  return c.neg ? `!${wrap(c.text)}` : (conds.length > 1 ? wrap(c.text) : c.text.trim());
}).join(' && ');

/** Output assignments of ASM action texts: { name: value } or throws. */
function outputsOfActions(acts, m, prevOuts = {}) {
  const out = {};
  for (const a of acts) {
    const r = parseAction(a);
    if (r.error) throw new Error(`'${a}' is not an output assignment`);
    if (!m.outputs.some((o) => o.name === r.target)) throw new Error(`'${r.target}' is not an output`);
    if (r.ast.k !== 'lit') throw new Error(`the output ${r.target} gets the value ${exprToString(r.ast)}; a state diagram only gives outputs constant values`);
    const pv = prevOuts[r.target];
    out[r.target] = pv != null && constValue(pv) === r.ast.v ? pv : (r.ast.w == null ? r.ast.v.toString() : exprToString(r.ast));
  }
  return out;
}

/**
 * The diagram of an ASM chart (or of a chart read from HDL): conditions of the decision paths of
 * each state, conditional outputs as Mealy outputs. `previous`: an earlier diagram of the same
 * machine (positions, ids, spelling of conditions and the transitions of every state whose
 * behaviour did not change are kept). Throws if the chart is not a plain state machine.
 */
export function asmToFsm(asmModel, { previous = null } = {}) {
  const asm = normalizeAsm(asmModel);
  const why = [];
  if (asm.registers?.length) why.push(`it has internal registers (${asm.registers.map((r) => r.name).join(', ')})`);
  if (asm.generics?.length) why.push(`it has generics/parameters (${asm.generics.map((g) => g.name).join(', ')})`);
  if (asm.outputs.some((o) => o.registered)) why.push(`it has registered outputs (${asm.outputs.filter((o) => o.registered).map((o) => o.name).join(', ')})`);
  if (asm.inputs.some((i) => i.sync)) why.push('it synchronises inputs');
  if (asm.nodes.some((n) => n.type === 'always')) why.push('it has logic that runs on every cycle besides the states');
  if (why.length) throw new Error(`it is not a plain state machine: ${why.join('; ')}`);
  const prev = previous ? normalizeFsm(previous) : null;
  const pState = (name) => prev?.states.find((s) => s.name.toLowerCase() === name.toLowerCase());
  const m = normalizeFsm({
    name: prev && prev.name.toLowerCase() === asm.name.toLowerCase() ? prev.name : asm.name,
    lang: asm.lang, type: prev?.type || 'moore', clock: asm.clock, reset: asm.reset, encoding: asm.encoding,
    style: prev?.style || '3process',
    inputs: asm.inputs.map((i) => ({ name: i.name, width: i.width })),
    outputs: asm.outputs.map((o) => {
      const po = prev?.outputs.find((x) => x.name === o.name);
      return { name: o.name, width: o.width, default: po && constValue(po.default) === constValue(o.default) ? po.default : o.default };
    }),
    states: [], transitions: [], initial: '',
    ...(asm.description || prev?.description ? { description: asm.description || prev.description } : {}),
  });
  const W = (n) => m.inputs.find((i) => i.name === n)?.width ?? 1;
  const asmStates = asm.nodes.filter((n) => n.type === 'state');
  // state ids: the previous diagram's, else the chart's
  const sid = new Map();
  const usedIds = new Set();
  for (const s of asmStates) {
    const ps = pState(s.name);
    let idv = ps && !usedIds.has(ps.id) ? ps.id : s.id;
    while (usedIds.has(idv)) idv = `${idv}_`;
    usedIds.add(idv);
    sid.set(s.id, idv);
  }
  for (const s of asmStates) {
    const ps = pState(s.name);
    m.states.push({ id: sid.get(s.id), name: ps ? ps.name : s.name, x: ps?.x ?? 0, y: ps?.y ?? 0, outputs: outputsOfActions(s.actions, m, ps?.outputs) });
  }
  m.initial = sid.get(asm.initial) || m.states[0]?.id || '';
  let tn = 0;
  const tUsed = new Set(prev ? prev.transitions.map((t) => t.id) : []);
  const newTid = () => { let x; do x = `t${++tn}`; while (tUsed.has(x)); tUsed.add(x); return x; };
  const outKey = (o) => JSON.stringify(Object.entries(o).map(([k, v]) => [k, String(constValue(v))]).sort());

  const order = new Map();
  for (const s of asmStates) {
    const me = sid.get(s.id);
    const ps = pState(s.name);
    const paths = asmPaths(asm, s.id).map((p) => ({ ...p, to: sid.get(p.to), outs: outputsOfActions(p.acts, m) }));
    // input combinations of this state's conditions (also those of the previous diagram)
    const prevTs = ps ? transitionsFrom(prev, ps.id).filter((t) => stateById(prev, t.to)) : [];
    // the list keeps the order of the previous diagram (a rebuilt state where its first transition was)
    const base = prevTs.length ? Math.min(...prevTs.map((t) => prev.transitions.indexOf(t))) : 1e9 + asmStates.indexOf(s);
    let k = 0;
    const push = (tr, key = base + (k++) * 1e-3) => { order.set(tr, key); m.transitions.push(tr); };
    const used = new Set();
    for (const p of paths) for (const c of p.conds) condNames(c.ast, used);
    const prevAsts = prevTs.map((t) => parseCond(t.cond));
    for (const p of prevAsts) if (!p.error) condNames(p.ast, used);
    for (const n of used) if (!m.inputs.some((i) => i.name === n)) used.delete(n);
    const { envs } = inputCombos(m, used, { maxBits: 14, samples: 3000 });
    const pathVal = (p, env) => p.conds.every((c) => evalCond(c.ast, env, W) !== c.neg);
    // behaviour: for each env, the (target, outputs) taken
    const read = envs.map((env) => { const p = paths.find((x) => pathVal(x, env)); return p ? `${p.to}|${outKey(p.outs)}` : `${me}|${outKey({})}`; });
    // 1. same behaviour as the previous diagram: keep its transitions as they are
    if (ps && prevAsts.every((p) => !p.error) && prevTs.every((t) => m.states.some((x) => x.id === t.to) && stateById(prev, t.to)?.name === m.states.find((x) => x.id === t.to)?.name)) {
      const prevBeh = envs.map((env) => {
        const i = prevAsts.findIndex((p) => evalCond(p.ast, env, W));
        return i < 0 ? `${me}|${outKey({})}` : `${prevTs[i].to}|${outKey(prevTs[i].outputs)}`;
      });
      if (prevBeh.every((b, i) => b === read[i])) {
        for (const t of prevTs) push(clone({ ...t, from: me }), prev.transitions.indexOf(t));
        continue;
      }
    }
    // 2. rebuild: one transition per (target, outputs), in the order of the paths; the stay
    //    without outputs is left implicit
    const groups = [];
    for (const p of paths) {
      const key = `${p.to}|${outKey(p.outs)}`;
      let g = groups.find((x) => x.key === key);
      if (!g) groups.push(g = { key, to: p.to, outs: p.outs, paths: [] });
      g.paths.push(p);
    }
    const stayKey = `${me}|${outKey({})}`;
    const kept = groups.filter((g) => g.key !== stayKey);
    const covered = envs.map(() => false);
    for (const g of kept) {
      const fn = envs.map((env) => g.paths.some((p) => pathVal(p, env)));
      const valid = (text) => {
        const q = parseCond(text);
        if (q.error) return false;
        return envs.every((env, i) => covered[i] || (evalCond(q.ast, env, W) === fn[i]));
      };
      const cands = [];
      for (const t of prevTs) if (t.to === g.to && outKey(t.outputs) === outKey(g.outs)) cands.push(t.cond);
      const pos = g.paths.map((p) => p.conds.filter((c) => !c.neg));
      if (g.paths.length === 1) {
        if (pos[0].length) cands.push(condText(pos[0], W));
        cands.push(condText(g.paths[0].conds, W));
      } else {
        cands.push(pos.map((c) => (c.length ? wrap(condText(c, W)) : '1')).join(' || '));
        cands.push(g.paths.map((p) => (p.conds.length ? wrap(condText(p.conds, W)) : '1')).join(' || '));
      }
      let text = cands.find((x) => valid(x));
      if (text == null) text = cands[cands.length - 1];
      const pt = prevTs.find((t) => t.to === g.to);
      const tr = { id: pt && !m.transitions.some((x) => x.id === pt.id) ? pt.id : newTid(), from: me, to: g.to, cond: /^(1|true)$/i.test(text) ? '' : text, outputs: g.outs };
      if (pt?.bend != null) tr.bend = pt.bend;
      if (pt?.angle != null) tr.angle = pt.angle;
      push(tr);
      fn.forEach((v, i) => { if (v) covered[i] = true; });
    }
    // an explicit self-loop without outputs in the previous diagram stays explicit
    const stay = groups.find((g) => g.key === stayKey);
    const prevStay = prevTs.find((t) => t.to === me && !Object.keys(t.outputs).length);
    if (stay && prevStay) {
      const fn = envs.map((env) => stay.paths.some((p) => pathVal(p, env)));
      const q = parseCond(prevStay.cond);
      const ok = !q.error && envs.every((env, i) => covered[i] || evalCond(q.ast, env, W) === fn[i]);
      const pos = stay.paths.length === 1 ? stay.paths[0].conds.filter((c) => !c.neg) : [];
      const text = ok ? prevStay.cond : (pos.length ? condText(pos, W) : condText(stay.paths[0]?.conds || [], W));
      push({ id: m.transitions.some((x) => x.id === prevStay.id) ? newTid() : prevStay.id, from: me, to: me, cond: text, outputs: {}, ...(prevStay.angle != null ? { angle: prevStay.angle } : {}) });
    }
  }
  if (m.transitions.some((t) => Object.keys(t.outputs).length)) m.type = 'mealy';
  m.transitions = m.transitions.map((t, i) => [t, i]).sort((a, b) => order.get(a[0]) - order.get(b[0]) || a[1] - b[1]).map(([t]) => t);
  if (prev) {
    // the order of the previous diagram (new states last)
    const rank = (s) => { const i = prev.states.findIndex((p) => p.id === s.id); return i < 0 ? Infinity : i; };
    m.states = m.states.map((s, i) => [s, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([s]) => s);
  }
  return placeNew(m, prev);
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
function placeNew(m, prev) {
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
