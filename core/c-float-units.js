// Silinx HLS (#2273): the floating-point operations shared as units, when #pragma HLS ALLOCATION asks it (UG1399's
// `ALLOCATION operation instances=dmul limit=1`): each operation of that kind in the pragma's scope (the function's body,
// or the loop's, the block's it is in) a call of one function of the soft-float's operation, a sub-module (#1960's: one
// instance, its calls sharing it, each a state that starts it and waits for it), its path scheduled over the clock's
// cycles as the top's is (#1924). The alignment, the normalization and the rounding made once, not once per operation;
// each operation then a few cycles of its own, nothing chained across it. Without the pragma, nothing changes: each
// operation inlined where it is (core/c-dataflow-float.js). Isomorphic ES module: no DOM and no Node APIs.
//
// The units are functions of C appended to the source (unitSource), so the sub-module is made as any other (core/c-hdl.js
// makes a sub-module from the source, its function the top). An operation stays inlined where a call cannot be: in a
// loop's header, after && or ||, in a branch of ?:, of constants only.
//
//   FLOAT_OPS                   Vitis HLS's names: fadd fsub fmul fdiv fsqrt (float), dadd dsub dmul ddiv dsqrt (double)
//   unitName(op)                the unit's function: ap_unit_<op>
//   isUnit(name)                whether a function is one
//   asked(checked)              the operations ALLOCATION shares: [{ op, scope (a block), loc }]
//   shareUnits(checked)         each asked operation in its scope a call of its unit; -> { used: Set(op), warnings }
//   unitSource(ops, have)       the C of the units of ops not in have (a Map of the functions)

import { floatType } from './c-float.js';

const OPS = { add: '+', sub: '-', mul: '*', div: '/' };
export const FLOAT_OPS = new Set(['fadd', 'fsub', 'fmul', 'fdiv', 'fsqrt', 'dadd', 'dsub', 'dmul', 'ddiv', 'dsqrt']);
export const unitName = (op) => `ap_unit_${op}`;
export const isUnit = (name) => /^ap_unit_[fd](add|sub|mul|div|sqrt)$/.test(String(name));
const lower = (v) => String(v ?? '').toLowerCase();
const NUM = /^\d+$/;
const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  if (f(x) === false) return;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walk(v, f);
};

/** The C type's precision: 32 a float, 64 a double, 0 neither (core/c-float.js's floatType's). */
const flOf = (t) => (t?.kind === 'float' ? floatType(t).fl : 0);

export function asked(checked) {
  const out = [];
  for (const f of checked.funcs.values()) {
    if (!f.body || isUnit(f.name)) continue;
    const scan = (block) => {
      for (const s of block.items || []) {
        if (s.kind === 'pragma' && s.pragma.name === 'ALLOCATION') {
          const a = s.pragma.args, op = lower(a.instances);
          if (FLOAT_OPS.has(op) && a.function === undefined && lower(a.type) !== 'function' && NUM.test(String(a.limit)) && Number(a.limit) >= 1) out.push({ op, scope: block, fn: f, loc: s.loc });
        }
      }
      // (each block inside scanned once, by its own scan: not again from every block around it, 2^depth times, #3558)
      walk(block.items, (n) => { if (n !== block && n.kind === 'block') { scan(n); return false; } return undefined; });
    };
    scan(f.body);
  }
  // (a block in a block: its own pragmas once; the inner scopes first, their blocks then the outer's)
  const seen = new Set();
  return out.filter((x) => { const k = `${x.op} ${x.loc.line} ${x.loc.col}`; if (seen.has(k)) return false; seen.add(k); return true; }).reverse();
}

/** The types of a function's names: its parameters, its locals (every declaration of its body), the globals. */
function namesOf(fn, checked) {
  const env = new Map();
  for (const it of checked.ast.items) if (it.kind === 'var') env.set(it.name, it.type);
  for (const pa of fn.params) env.set(pa.name, pa.type);
  walk(fn.body, (n) => { if (n.kind === 'decl') for (const v of n.vars) env.set(v.name, v.type); });
  return env;
}

/** An expression's C type, where it is known: a name's, an element's, a cast's, a call's, an operation's (C's usual
 *  conversions); else null. */
function typeIn(e, env, funcs) {
  if (!e) return null;
  switch (e.kind) {
    case 'float': return { kind: 'float', name: /f$/i.test(e.text) ? 'float' : 'double' };
    case 'num': return { kind: 'int' };
    case 'id': return env.get(e.name) ?? null;
    case 'cast': return e.type;
    case 'index': { const t = typeIn(e.e, env, funcs); return t?.kind === 'array' ? t.of : t?.kind === 'ptr' ? t.to : null; }
    case 'unary': {
      if (e.op === '*') { const t = typeIn(e.e, env, funcs); return t?.kind === 'ptr' ? t.to : t?.kind === 'array' ? t.of : null; }
      return e.op === '-' || e.op === '+' ? typeIn(e.e, env, funcs) : null;
    }
    case 'call': {
      const name = e.callee?.kind === 'id' ? e.callee.name : null;
      if (funcs.get(name)?.ret) return funcs.get(name).ret;
      return name === 'sqrt' ? { kind: 'float', name: 'double' } : name === 'sqrtf' ? { kind: 'float', name: 'float' } : null;
    }
    case 'binary': {
      if (!Object.values(OPS).includes(e.op)) return null;
      const a = typeIn(e.l, env, funcs), b = typeIn(e.r, env, funcs);
      const fl = Math.max(flOf(a), flOf(b));
      return fl ? { kind: 'float', name: fl === 32 ? 'float' : 'double' } : null;
    }
    case 'assign': return typeIn(e.l, env, funcs);
    case 'cond': { const a = typeIn(e.a, env, funcs), b = typeIn(e.b, env, funcs); const fl = Math.max(flOf(a), flOf(b)); return fl ? { kind: 'float', name: fl === 32 ? 'float' : 'double' } : a; }
    default: return null;
  }
}

const hasName = (x) => { let hit = false; walk(x, (n) => { if (n.kind === 'id' || n.kind === 'call') hit = true; }); return hit; };
// (a place written again where it is read: its index of no side effect)
const plain = (l) => { let ok = l.kind === 'id' || l.kind === 'index'; walk(l, (n) => { if (n.kind === 'call' || n.kind === 'assign' || (n.kind === 'unary' && /\+\+|--/.test(n.op)) || n.kind === 'postfix') ok = false; }); return ok; };
const call = (op, args, loc) => ({ kind: 'call', callee: { kind: 'id', name: unitName(op), loc }, args, loc });

export function shareUnits(checked) {
  const used = new Set(), warnings = [];
  for (const { op, scope, fn, loc } of asked(checked)) {
    const env = namesOf(fn, checked);
    const prec = op[0] === 'f' ? 32 : 64, kind = op.slice(1);
    let hits = 0;
    /** x with the operations made calls of the unit, where a call may be (`safe`). */
    const map = (x, safe) => {
      if (!x || typeof x !== 'object') return x;
      if (Array.isArray(x)) return x.map((y) => map(y, safe));
      if (x.kind === 'pragma' || x.kind === 'func') return x;
      const out = {};
      for (const [k, v] of Object.entries(x)) {
        if (k === 'loc' || k === 'type' || !v || typeof v !== 'object') { out[k] = v; continue; }
        // (a loop's header, the operands after && || and the branches of ?:: where a call may not be, core/c-inline.js)
        const inner = safe && !(['for', 'while', 'do'].includes(x.kind) && ['init', 'cond', 'step'].includes(k))
          && !(x.kind === 'binary' && (x.op === '&&' || x.op === '||') && k === 'r') && !(x.kind === 'cond' && (k === 'a' || k === 'b'));
        out[k] = map(v, inner);
      }
      if (!safe) return out;
      if (kind === 'sqrt') {
        const name = out.kind === 'call' && out.callee?.kind === 'id' ? out.callee.name : null;
        if ((name === (prec === 32 ? 'sqrtf' : 'sqrt')) && out.args.length === 1 && hasName(out.args)) { hits++; return call(op, out.args, out.loc); }
        return out;
      }
      if (out.kind === 'binary' && out.op === OPS[kind] && flOf(typeIn(x, env, checked.funcs)) === prec && hasName([out.l, out.r])) { hits++; return call(op, [out.l, out.r], out.loc); }
      if (out.kind === 'assign' && out.op === `${OPS[kind]}=` && flOf(typeIn(x.l, env, checked.funcs)) === prec && plain(out.l)) {
        // (x op= y: x = unit(x, y), x of a precision of its own: its operation's that precision's)
        if (flOf(typeIn(x.r, env, checked.funcs)) <= prec) { hits++; return { ...out, op: '=', r: call(op, [out.l, out.r], out.loc) }; }
      }
      return out;
    };
    scope.items = scope.items.map((s) => map(s, true));
    if (hits) used.add(op);
    else warnings.push({ loc, message: `#pragma HLS ALLOCATION of ${op}: no ${prec === 32 ? 'float' : 'double'} operation of it here that a unit can make: ignored` });
  }
  return { used, warnings };
}

const DECL = {
  add: (T) => `${T} a, ${T} b`, sub: (T) => `${T} a, ${T} b`, mul: (T) => `${T} a, ${T} b`, div: (T) => `${T} a, ${T} b`, sqrt: (T) => `${T} a`,
};
const BODY = { add: 'a + b', sub: 'a - b', mul: 'a * b', div: 'a / b', sqrt: null };

export function unitSource(ops, have = new Map()) {
  return [...ops].filter((op) => !have.has(unitName(op))).map((op) => {
    const T = op[0] === 'f' ? 'float' : 'double', kind = op.slice(1);
    const body = BODY[kind] ?? (T === 'float' ? 'sqrtf(a)' : 'sqrt(a)');
    return `\nstatic ${T} ${unitName(op)}(${DECL[kind](T)}) {\n#pragma HLS INLINE off\n  return ${body};\n}\n`;
  }).join('');
}
