// Silinx - combinational logic: Boolean expressions, truth tables, canonical forms, minimisation
// (Quine–McCluskey + exact cover), Karnaugh map layout and the circuits of a truth table (HDL module,
// gate schematic). Isomorphic (no DOM). Used by the Truth Table / Karnaugh Map tool (web/js/truthtable.js).
//
// Conventions
//   * A function of n inputs [x0, x1, …, x(n-1)] is a column of 2^n values, one per row; row r has
//     x0 as its most significant bit (row 5 of a, b, c is a=1 b=0 c=1): the minterm number.
//   * A column is a string of '0', '1' and 'X' (don't care; '-' is read as 'X').
//   * An implicant (cube) is { value, mask }: the bits set in `mask` are eliminated variables,
//     `value` holds the other bits (value & mask === 0). Bit (n-1-j) is variable j.
//
// Truth table documents (<name>.tt.json):
//   { version: 1, name, inputs: ['a', 'b'], outputs: ['f'], table: { f: '0110' }, exprs: { f: 'a^b' },
//     notes: '', form: 'sop'|'pos'|'xor', lang: 'vhdl'|'verilog', generatedFile?: 'src/name.vhd' }
//   form: the logic of the generated HDL module: the minimal SOP, POS, or the XOR form of each output
//   where it is cheaper than both (#435), else its minimal SOP.

import { newDoc, symbolDef, symbolPins, symbolBox, netlist } from './schdoc.js';
import { compile, elaborate, simulate } from './compile.js';
import { clocksOf, latchGates } from './schematic.js';
import { tbPorts, generateTestbench, expectedFromTrace } from './testbench.js';

export const TT_VERSION = 1;
export const MAX_INPUTS = 8;          // truth tables (display, module tables)
export const MAX_EDIT_INPUTS = 6;     // the editor and Karnaugh maps
// Outputs: any number (each is a column of the table and its own Karnaugh map / circuit).

export class LogicError extends Error {
  constructor(message, pos) { super(pos != null ? `${message} (at position ${pos})` : message); this.pos = pos; this.bare = message; }
}

// ===================================================================== expressions
// AST: { t: 'var', name, pos } | { t: 'const', v: 0|1 } | { t: 'not', a } | { t: 'and'|'or'|'xor', args: [..] }
const KW = { not: 'not', and: 'and', or: 'or', xor: 'xor', nand: 'nand', nor: 'nor', xnor: 'xnor' };

function tokenize(src) {
  const toks = [];
  let i = 0;
  const s = String(src ?? '');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    const pos = i + 1;
    let m;
    if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(s.slice(i)))) {
      const w = m[0];
      const kw = KW[w.toLowerCase()];
      toks.push(kw ? { k: kw, pos, text: w } : { k: 'id', v: w, pos, text: w });
      i += w.length; continue;
    }
    if ((m = /^(?:1'b[01]|'[01]'|[01])(?![0-9])/.exec(s.slice(i)))) {
      toks.push({ k: 'const', v: +m[0].replace(/\D*1'b|'/g, '').slice(-1), pos, text: m[0] });
      i += m[0].length; continue;
    }
    if (/[0-9]/.test(c)) throw new LogicError(`'${/^[0-9]+/.exec(s.slice(i))[0]}' is not a constant (only 0 and 1)`, pos);
    if (c === "'" || c === '’' || c === '′') { toks.push({ k: 'post', pos, text: c }); i++; continue; }
    // Verilog's XNOR ~^ and ^~ (a^~b, the same function, reads as XNOR too)
    if ((c === '~' && s[i + 1] === '^') || (c === '^' && s[i + 1] === '~')) { toks.push({ k: 'xnor', pos, text: c + s[i + 1] }); i += 2; continue; }
    if (c === '~' || c === '!' || c === '¬' || c === '/') { toks.push({ k: 'not', pos, text: c }); i++; continue; }
    if (c === '·' || c === '*' || c === '&' || c === '∧' || c === '.' || c === '⋅') { toks.push({ k: 'and', pos, text: c }); i += (c === '&' && s[i + 1] === '&') ? 2 : 1; continue; }
    if (c === '+' || c === '|' || c === '∨') { toks.push({ k: 'or', pos, text: c }); i += (c === '|' && s[i + 1] === '|') ? 2 : 1; continue; }
    if (c === '^' || c === '⊕') { toks.push({ k: 'xor', pos, text: c }); i++; continue; }
    if (c === '(' || c === ')') { toks.push({ k: c, pos, text: c }); i++; continue; }
    throw new LogicError(`unexpected character '${c}'`, pos);
  }
  toks.push({ k: 'eof', pos: s.length + 1, text: 'end of the expression' });
  return toks;
}

/**
 * Parse a Boolean expression. opts.vars: the variable names allowed (case-insensitive match,
 * the declared spelling is kept); when every variable is a single letter, a run of letters such
 * as ab'c is read as a product (a·b'·c). Without opts.vars any identifier is a variable.
 * Operators: NOT postfix ' or prefix ~ ! / not; AND · . * & and (or juxtaposition: a b, a(b+c));
 * XOR ^ ⊕ xor; OR + | or; also nand nor xnor (~^ ^~). Precedence: NOT > AND > XOR > OR.
 * '/' is the bar over one letter ("A barrado", /A): it negates only the next variable, also in a run
 * of letters (/ab = a'·b, //ab = a·b); /(ab) negates the product. ~ab and !ab negate the product.
 * Constants are only 0 and 1 (no decimal point: '.' is always AND).
 * Throws LogicError with a 1-based position.
 */
export function parseExpr(src, opts = {}) {
  const vars = opts.vars ? opts.vars.map(String) : null;
  const byLower = vars ? new Map(vars.map(v => [v.toLowerCase(), v])) : null;
  const single = vars && vars.length > 0 && vars.every(v => v.length === 1);
  const toks = tokenize(src);
  if (toks.length === 1) throw new LogicError('the expression is empty');
  let k = 0;
  const peek = () => toks[k];
  const next = () => toks[k++];
  const startsPrimary = t => t.k === 'id' || t.k === 'const' || t.k === '(' || t.k === 'not';
  const variable = (t) => {
    if (!vars) return { t: 'var', name: t.v, pos: t.pos };
    const v = byLower.get(t.v.toLowerCase());
    if (v) return { t: 'var', name: v, pos: t.pos };
    if (single && [...t.v].every(ch => byLower.has(ch.toLowerCase())))
      return { t: 'and', args: [...t.v].map((ch, i) => ({ t: 'var', name: byLower.get(ch.toLowerCase()), pos: t.pos + i })) };
    const bad = single ? [...t.v].find(ch => !byLower.has(ch.toLowerCase())) : t.v;
    // "ab" with multi-letter input names: say how to write a product
    const split = !single && vars.some(v => t.v.toLowerCase().startsWith(v.toLowerCase()));
    throw new LogicError(`unknown variable '${bad}' (the inputs are ${vars.join(', ')}${split ? '; write a product as a·b, a*b or a b' : ''})`, single ? t.pos + t.v.indexOf(bad) : t.pos);
  };
  const flat = (op, args) => {
    const out = [];
    for (const a of args) if (a.t === op) out.push(...a.args); else out.push(a);
    return out.length === 1 ? out[0] : { t: op, args: out };
  };
  const runs = new WeakSet();   // products read from a run of letters (ab'c)
  function primary() {
    const t = next();
    let e;
    if (t.k === 'id') {
      e = variable(t);
      if (e.t === 'and') {
        // ab'c: a postfix ' complements the last letter only
        const last = e.args.pop();
        let l = last;
        while (peek().k === 'post') { next(); l = { t: 'not', a: l }; }
        e.args.push(l);
        runs.add(e);
        return e;
      }
    }
    else if (t.k === 'const') e = { t: 'const', v: t.v };
    else if (t.k === '(') {
      e = orExpr();
      const c = next();
      if (c.k !== ')') throw new LogicError(c.k === 'eof' ? `missing ')' (opened at position ${t.pos})` : `expected ')' but found '${c.text}'`, c.pos);
    } else if (t.k === 'not' && t.text === '/') {
      // the bar over one letter: in a run of letters (ab, /ab) only the first one
      const a = primary();
      if (!runs.has(a)) return { t: 'not', a };
      const run = { t: 'and', args: [{ t: 'not', a: a.args[0] }, ...a.args.slice(1)] };
      runs.add(run);
      return run;
    } else if (t.k === 'not') return { t: 'not', a: primary() };
    else if (t.k === 'eof') throw new LogicError('the expression ends too early: expected a variable, 0, 1 or (', t.pos);
    else throw new LogicError(`expected a variable, 0, 1 or ( but found '${t.text}'`, t.pos);
    while (peek().k === 'post') { next(); e = { t: 'not', a: e }; }
    return e;
  }
  function andExpr() {
    const args = [primary()];
    for (;;) {
      const t = peek();
      if (t.k === 'and') { next(); args.push(primary()); } else if (t.k === 'nand') { next(); const a = flat('and', args.splice(0)); args.push({ t: 'not', a: flat('and', [a, primary()]) }); } else if (startsPrimary(t)) args.push(primary());
      else break;
    }
    return flat('and', args);
  }
  function xorExpr() {
    let e = andExpr();
    for (;;) {
      const t = peek();
      if (t.k === 'xor') { next(); e = flat('xor', [e, andExpr()]); } else if (t.k === 'xnor') { next(); e = { t: 'not', a: flat('xor', [e, andExpr()]) }; } else break;
    }
    return e;
  }
  function orExpr() {
    let e = xorExpr();
    for (;;) {
      const t = peek();
      if (t.k === 'or') { next(); e = flat('or', [e, xorExpr()]); } else if (t.k === 'nor') { next(); e = { t: 'not', a: flat('or', [e, xorExpr()]) }; } else break;
    }
    return e;
  }
  const e = orExpr();
  const t = peek();
  if (t.k !== 'eof') throw new LogicError(t.k === ')' ? "unexpected ')' (no matching '(')" : `unexpected '${t.text}'`, t.pos);
  return e;
}

/** Variables of an expression, in order of first appearance. */
export function exprVars(ast) {
  const out = [];
  const walk = e => {
    if (e.t === 'var') { if (!out.includes(e.name)) out.push(e.name); } else if (e.t === 'not') walk(e.a); else if (e.args) e.args.forEach(walk);
  };
  walk(ast);
  return out;
}

export function evalExpr(e, env) {
  switch (e.t) {
    case 'const': return e.v;
    case 'var': return env[e.name] ? 1 : 0;
    case 'not': return evalExpr(e.a, env) ? 0 : 1;
    case 'and': return e.args.every(a => evalExpr(a, env)) ? 1 : 0;
    case 'or': return e.args.some(a => evalExpr(a, env)) ? 1 : 0;
    case 'xor': return e.args.reduce((x, a) => x ^ evalExpr(a, env), 0);
    default: throw new Error(`bad expression node ${e.t}`);
  }
}

/** Column ('0'/'1' per row) of an expression over `inputs` (inputs[0] = MSB of the row number). */
export function exprColumn(ast, inputs) {
  const n = inputs.length;
  let out = '';
  for (let r = 0; r < 1 << n; r++) {
    const env = {};
    inputs.forEach((v, j) => { env[v] = (r >> (n - 1 - j)) & 1; });
    out += evalExpr(ast, env) ? '1' : '0';
  }
  return out;
}

/**
 * Text of an expression. notation:
 *   'slash'    /a·b + c (the editor's default: NOT is a prefix /, a negated group /(a + b))
 *   'slash-compact' /ab + c (juxtaposition when every name is one letter; /ab is /a·b, as typed)
 *   'textbook' a·b' + c   'compact' ab' + c (juxtaposition when every name is one letter)
 *   'ascii'    a*b' + c   'vhdl' (a and not b) or c   'verilog' (a & ~b) | c
 * XOR is ⊕ (ascii ^, vhdl xor, verilog ^); the XNOR of two operands is xnor / ~^ in VHDL / Verilog.
 * parseExpr reads the / notations back as the same expression (the editor's expressions: tested),
 * 'textbook', 'compact' and 'ascii' as the same function.
 */
export function formatExpr(e, notation = 'textbook') {
  const N = notation;
  const allSingle = exprVars(e).every(v => v.length === 1);
  const juxt = (N === 'compact' || N === 'slash-compact') && allSingle;
  const sym = {
    slash: { and: '·', or: ' + ', xor: ' ⊕ ', c0: '0', c1: '1' },
    'slash-compact': { and: juxt ? '' : '·', or: ' + ', xor: ' ⊕ ', c0: '0', c1: '1' },
    textbook: { and: '·', or: ' + ', xor: ' ⊕ ', c0: '0', c1: '1' },
    compact: { and: juxt ? '' : '·', or: ' + ', xor: ' ⊕ ', c0: '0', c1: '1' },
    ascii: { and: '*', or: ' + ', xor: ' ^ ', c0: '0', c1: '1' },
    vhdl: { and: ' and ', or: ' or ', xor: ' xor ', c0: "'0'", c1: "'1'" },
    verilog: { and: ' & ', or: ' | ', xor: ' ^ ', c0: "1'b0", c1: "1'b1" },
  }[N];
  if (!sym) throw new Error(`unknown notation '${N}'`);
  const hdl = N === 'vhdl' || N === 'verilog';
  const prec = { or: 1, xor: 2, and: 3 };
  const atom = x => x.t === 'var' || x.t === 'const';
  const f = (x, parentOp) => {
    switch (x.t) {
      case 'const': return x.v ? sym.c1 : sym.c0;
      case 'var': return x.name;
      case 'not': {
        // XNOR of two operands: a xnor b, a ~^ b
        if (hdl && x.a.t === 'xor' && x.a.args.length === 2) {
          const s = x.a.args.map(a => f(a, 'xor')).join(N === 'vhdl' ? ' xnor ' : ' ~^ ');
          return parentOp ? `(${s})` : s;
        }
        if (N === 'vhdl') return atom(x.a) ? `not ${f(x.a)}` : `not (${f(x.a)})`;
        if (N === 'verilog') return atom(x.a) ? `~${f(x.a)}` : `~(${f(x.a)})`;
        // the bar over a letter, /a; over a group, /(a + b)
        if (N === 'slash' || N === 'slash-compact') return atom(x.a) || x.a.t === 'not' ? `/${f(x.a)}` : `/(${f(x.a)})`;
        return atom(x.a) || x.a.t === 'not' ? `${f(x.a)}'` : `(${f(x.a)})'`;
      }
      default: {
        const s = x.args.map(a => f(a, x.t)).join(sym[x.t]);
        // HDL: parentheses around every nested operation (VHDL requires them between different
        // operators); textbook: only when the operator binds less tightly than its parent
        const need = parentOp && (hdl ? true : prec[x.t] < prec[parentOp]);
        return need ? `(${s})` : s;
      }
    }
  };
  return f(e);
}

// ===================================================================== columns, canonical forms
export function normColumn(col, n) {
  const s = String(col ?? '').toUpperCase().replace(/-/g, 'X');
  const len = 1 << n;
  let out = '';
  for (let r = 0; r < len; r++) { const c = s[r]; out += c === '1' || c === '0' || c === 'X' ? c : '0'; }
  return out;
}

const idxOf = (col, ch) => { const o = []; for (let r = 0; r < col.length; r++) if (col[r] === ch) o.push(r); return o; };

/** { ones, zeros, dcs, sigma: 'Σm(1, 3) + d(5)', pi: 'ΠM(0, 2) · D(5)' } of a column. */
export function canonical(col) {
  const ones = idxOf(col, '1'), zeros = idxOf(col, '0'), dcs = idxOf(col, 'X');
  const d = dcs.length ? ` + d(${dcs.join(', ')})` : '';
  const D = dcs.length ? ` · D(${dcs.join(', ')})` : '';
  return { ones, zeros, dcs, sigma: `Σm(${ones.join(', ')})${d}`, pi: `ΠM(${zeros.join(', ')})${D}` };
}

/** Literals of an implicant: [{ v: index, neg: bool }] (for SOP; a POS clause complements them). */
export function cubeLiterals(c, n) {
  const out = [];
  for (let j = 0; j < n; j++) {
    const b = 1 << (n - 1 - j);
    if (!(c.mask & b)) out.push({ v: j, neg: !(c.value & b) });
  }
  return out;
}
export function cubeMinterms(c, n) {
  const out = [];
  for (let m = 0; m < 1 << n; m++) if ((m & ~c.mask) === c.value) out.push(m);
  return out;
}
const popcount = x => { let k = 0; while (x) { x &= x - 1; k++; } return k; };
const covers = (c, m) => (m & ~c.mask) === c.value;

/** Prime implicants of the set `on` ∪ `dc` (Quine–McCluskey). */
export function primeImplicants(on, dc, n) {
  const full = (1 << n) - 1;
  let level = new Map();   // mask -> Set(values)
  const set0 = new Set([...on, ...dc]);
  if (!set0.size) return [];
  level.set(0, set0);
  const primes = [];
  while (level.size) {
    const nextLevel = new Map();
    for (const [mask, vals] of level) {
      const used = new Set();
      for (const v of vals) {
        for (let b = 1; b <= full; b <<= 1) {
          if (mask & b || v & b) continue;
          if (vals.has(v | b)) {
            used.add(v); used.add(v | b);
            const m2 = mask | b;
            let s = nextLevel.get(m2);
            if (!s) nextLevel.set(m2, s = new Set());
            s.add(v);
          }
        }
      }
      for (const v of vals) if (!used.has(v)) primes.push({ value: v, mask });
    }
    level = nextLevel;
  }
  return primes;
}

/**
 * Minimal sum of products ('sop') or product of sums ('pos') of a column, using its don't cares.
 * Cost: fewest terms, then fewest literals. Returns
 *   { form, n, terms: [cube + { literals, minterms, essential }], primes: [cube + { essential }],
 *     essential: [cubes], solutions (number of minimal solutions found, ≤ cap), several, exact,
 *     ast, literals, gates: { and, or, not, inputs } }
 * For 'pos' the cubes are implicants of the zeros; each is the clause (sum) of its complemented literals.
 */
export function minimize(colIn, n, { form = 'sop', maxNodes = 200000, cap = 64 } = {}) {
  const col = normColumn(colIn, n);
  const target = form === 'pos' ? '0' : '1';
  const on = idxOf(col, target), dc = idxOf(col, 'X');
  const primes = primeImplicants(on, dc, n)
    .map(p => ({ ...p, lits: n - popcount(p.mask), lo: cubeMinterms(p, n)[0] }))
    .sort((a, b) => a.lits - b.lits || a.lo - b.lo || a.mask - b.mask);
  // chart: which primes cover each care minterm
  const coverers = new Map(on.map(m => [m, []]));
  primes.forEach((p, i) => { for (const m of on) if (covers(p, m)) coverers.get(m).push(i); });
  const essential = new Set();
  for (const m of on) if (coverers.get(m).length === 1) essential.add(coverers.get(m)[0]);
  const coveredBy = new Map(on.map(m => [m, 0]));
  const addCover = (i, d) => { for (const m of on) if (covers(primes[i], m)) coveredBy.set(m, coveredBy.get(m) + d); };
  for (const i of essential) addCover(i, 1);
  // branch and bound over the remaining (cyclic) part: every minimal solution, up to `cap`
  let best = null; const sols = new Map();
  let nodes = 0, exact = true;
  const chosen = [...essential];
  let lits = chosen.reduce((s, i) => s + primes[i].lits, 0);
  const lowerBound = () => {
    // independent uncovered minterms (no prime covers two of them): each needs its own term
    const blocked = new Set();
    let k = 0;
    for (const m of on) {
      if (coveredBy.get(m)) continue;
      const cs = coverers.get(m);
      if (cs.some(i => blocked.has(i))) continue;
      k++; cs.forEach(i => blocked.add(i));
    }
    return k;
  };
  const search = () => {
    if (++nodes > maxNodes) { exact = false; return; }
    let pick = null;
    for (const m of on) if (!coveredBy.get(m) && (pick == null || coverers.get(m).length < coverers.get(pick).length)) pick = m;
    if (pick == null) {
      const terms = chosen.length;
      if (!best || terms < best.terms || (terms === best.terms && lits < best.lits)) { best = { terms, lits }; sols.clear(); }
      if (terms === best.terms && lits === best.lits && sols.size < cap) { const key = [...chosen].sort((a, b) => a - b); sols.set(key.join(','), key); }
      return;
    }
    const lb = chosen.length + lowerBound();
    if (best && (lb > best.terms || (lb === best.terms && lits > best.lits))) return;
    for (const i of coverers.get(pick)) {
      chosen.push(i); lits += primes[i].lits; addCover(i, 1);
      search();
      addCover(i, -1); lits -= primes[i].lits; chosen.pop();
      if (!exact) return;
    }
  };
  search();
  let solution;
  if (exact || sols.size) {
    const keys = [...sols.values()].sort((a, b) => { for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i]; return a.length - b.length; });
    solution = keys[0] || [];
  }
  if (!solution) {
    // gave up on the exact search (very large charts): greedy cover after the essentials
    exact = false;
    solution = [...essential];
    const cov = new Set(on.filter(m => solution.some(i => covers(primes[i], m))));
    while (cov.size < on.length) {
      let bi = -1, bc = -1;
      primes.forEach((p, i) => { const c = on.filter(m => !cov.has(m) && covers(p, m)).length; if (c > bc || (c === bc && p.lits < primes[bi].lits)) { bc = c; bi = i; } });
      solution.push(bi); on.forEach(m => { if (covers(primes[bi], m)) cov.add(m); });
    }
    solution.sort((a, b) => a - b);
  }
  const mk = i => ({ value: primes[i].value, mask: primes[i].mask, literals: cubeLiterals(primes[i], n), minterms: cubeMinterms(primes[i], n), essential: essential.has(i) });
  const terms = solution.map(mk);
  const res = {
    form, n, terms,
    primes: primes.map((p, i) => ({ value: p.value, mask: p.mask, literals: cubeLiterals(p, n), essential: essential.has(i) })),
    essential: [...essential].sort((a, b) => a - b).map(mk),
    solutions: Math.max(1, sols.size), several: sols.size > 1, exact,
  };
  res.literals = terms.reduce((s, t) => s + t.literals.length, 0);
  return res;
}

/** Expression (AST) of a minimisation result over the input names. */
export function minimalAst(res, inputs) {
  const lit = (l, pos) => {
    const neg = pos ? !l.neg : l.neg;
    const v = { t: 'var', name: inputs[l.v] };
    return neg ? { t: 'not', a: v } : v;
  };
  if (res.form === 'pos') {
    if (!res.terms.length) return { t: 'const', v: 1 };
    const clauses = res.terms.map(c => (c.literals.length === 0 ? { t: 'const', v: 0 } : c.literals.length === 1 ? lit(c.literals[0], true) : { t: 'or', args: c.literals.map(l => lit(l, true)) }));
    if (clauses.some(c => c.t === 'const')) return { t: 'const', v: 0 };
    return clauses.length === 1 ? clauses[0] : { t: 'and', args: clauses };
  }
  if (!res.terms.length) return { t: 'const', v: 0 };
  const prods = res.terms.map(c => (c.literals.length === 0 ? { t: 'const', v: 1 } : c.literals.length === 1 ? lit(c.literals[0], false) : { t: 'and', args: c.literals.map(l => lit(l, false)) }));
  if (prods.some(c => c.t === 'const')) return { t: 'const', v: 1 };
  return prods.length === 1 ? prods[0] : { t: 'or', args: prods };
}

/** Two-level gate count of a minimal form: { and, or, not, inputs (gate inputs), literals }. */
export function gateCount(res) {
  const terms = res.terms.filter(t => t.literals.length >= 1);
  const constant = res.terms.length === 0 || res.terms.some(t => t.literals.length === 0);
  if (constant) return { and: 0, or: 0, not: 0, inputs: 0, literals: 0 };
  const level1 = terms.filter(t => t.literals.length >= 2);
  const inner = res.form === 'pos' ? 'or' : 'and', outer = res.form === 'pos' ? 'and' : 'or';
  const negs = new Set();
  for (const t of terms) for (const l of t.literals) if (res.form === 'pos' ? !l.neg : l.neg) negs.add(l.v);
  const g = { and: 0, or: 0, not: negs.size, literals: res.literals };
  g[inner] += level1.length;
  if (terms.length > 1) g[outer] += 1;
  g.inputs = level1.reduce((s, t) => s + t.literals.length, 0) + (terms.length > 1 ? terms.length : 0);
  return g;
}

// ===================================================================== XOR / XNOR forms (#435)
// Many functions are much simpler with XOR / XNOR (parity, adders, comparators, Gray code). The
// XOR form of a column is the cheapest expression of these two shapes, when it is strictly cheaper
// than both the minimal SOP and the minimal POS:
//   * a sum of XOR products: an OR of terms, each a product (AND) of literals and XOR / XNOR
//     factors of two or more variables, every variable at most once in a term:
//     a ⊕ b ⊕ c,  a·b + c·(a ⊕ b),  /(a1 ⊕ b1)·/(a0 ⊕ b0); a plain SOP is one of them;
//   * a variable XOR such a sum: a ⊕ b·c.
// Cost: the literals (variable occurrences) first, then the two-input operators (an n-input gate is
// n − 1 of them; NOT is free, as in the literal count of the SOP / POS, and XNOR is an XOR).
// The terms of n ≤ MAX_XOR_INPUTS variables are all enumerated (7107 for 6 inputs); for a column the
// terms within its 1s and don't cares are kept (the dominated ones dropped) and the cheapest cover of
// its 1s is found by branch and bound, bounded by a node budget (and 250 ms, a safety net on slow
// machines): when cut short, the result is the best found, `exact` false. The result is checked
// against the whole table. 2–6 inputs: a few ms, at most about 40 ms (random 6-input functions);
// more inputs: no XOR form. (No general XOR of products (ESOP) is searched: only x ⊕ (…).)
export const MAX_XOR_INPUTS = 6;
const XOR_LIT = 1024;     // cost of a term or an expression as one number: literals · 1024 + operators
const xorTermsCache = new Map();
const setHas = (s, r) => (s[r >> 5] >>> (r & 31)) & 1;
const setOf = (n, pred) => { const s = new Uint32Array(Math.max(1, (1 << n) >> 5)); for (let r = 0; r < 1 << n; r++) if (pred(r)) s[r >> 5] |= 1 << (r & 31); return s; };
const setAnd = (a, b) => a.map((x, i) => x & b[i]);
const setEmpty = a => a.every(x => x === 0);
const setSub = (a, b) => a.every((x, i) => (x & ~b[i]) === 0);
const setCount = a => a.reduce((k, x) => k + popcount(x), 0);

// every term of n variables: { lits: [{ v, neg }], groups: [{ vars, odd }], nlits, ops, cost, set }
function xorTerms(n) {
  if (xorTermsCache.has(n)) return xorTermsCache.get(n);
  const out = [];
  const role = new Array(n);     // -1 absent, -2 positive literal, -3 negated literal, k ≥ 0: in group k
  const bit = (r, j) => (r >> (n - 1 - j)) & 1;
  const emit = groups => {
    if (groups.some(g => g.length < 2)) return;
    for (let par = 0; par < 1 << groups.length; par++) {
      const lits = [];
      for (let j = 0; j < n; j++) if (role[j] === -2 || role[j] === -3) lits.push({ v: j, neg: role[j] === -3 });
      const gs = groups.map((vars, k) => ({ vars: [...vars], odd: !!((par >> k) & 1) }));
      const nl = lits.length + gs.reduce((s, g) => s + g.vars.length, 0);
      if (!nl) continue;
      const ops = gs.reduce((s, g) => s + g.vars.length - 1, 0) + lits.length + gs.length - 1;
      const set = setOf(n, r => lits.every(l => bit(r, l.v) === (l.neg ? 0 : 1)) && gs.every(g => g.vars.reduce((x, v) => x ^ bit(r, v), 0) === (g.odd ? 1 : 0)));
      // order of equally cheap terms: by variable, a literal before an XOR factor before nothing (ab before bc)
      const key = Array.from({ length: n }, (_, j) => (role[j] === -2 ? 'a' : role[j] === -3 ? 'b' : role[j] === -1 ? 'z' : `c${role[j]}`)).join('');
      out.push({ lits, groups: gs, nlits: nl, ops, cost: nl * XOR_LIT + ops + 1, set, key });
    }
  };
  const walk = (j, groups) => {
    if (j === n) { emit(groups); return; }
    // (the first variables in XOR factors first: of equal covers, a·b + c·(a ⊕ b) is found)
    for (let k = 0; k <= groups.length; k++) {
      role[j] = k;
      const g = groups.map(x => [...x]);
      if (k === groups.length) g.push([]);
      g[k].push(j);
      walk(j + 1, g);
    }
    for (const r of [-2, -3, -1]) { role[j] = r; walk(j + 1, groups); }
  };
  walk(0, []);
  xorTermsCache.set(n, out);
  return out;
}

const termOrder = (a, b) => a.cost - b.cost || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
const solKey = cs => cs.map(c => c.t).sort(termOrder).map(t => t.key).join('|');

// cheapest OR of XOR products covering `on`, within `allowed` (1s and don't cares), of cost < bound
function xorCover(n, on, allowed, bound, budget) {
  const cand = xorTerms(n).filter(t => setSub(t.set, allowed) && !setEmpty(setAnd(t.set, on)))
    .map((t, i) => ({ t, i, cov: setAnd(t.set, on) }));
  cand.forEach(c => { c.k = setCount(c.cov); });
  // drop a term when another as cheap covers all its 1s (of equal ones, the larger, then the first, kept)
  cand.sort((a, b) => b.k - a.k || a.t.cost - b.t.cost || a.i - b.i);
  const keep = [];
  for (const c of cand) if (!keep.some(d => d.t.cost <= c.t.cost && setSub(c.cov, d.cov))) keep.push(c);
  keep.sort((a, b) => a.t.cost - b.t.cost || b.k - a.k || a.i - b.i);
  // the 1s numbered 0..R-1; each term: the 1s it covers
  const rows = []; for (let r = 0; r < 1 << n; r++) if (setHas(on, r)) rows.push(r);
  keep.forEach((c, i) => { c.id = i; c.rows = []; rows.forEach((r, k) => { if (setHas(c.cov, r)) c.rows.push(k); }); });
  const coverers = rows.map((_, k) => keep.filter(c => c.rows.includes(k)));
  const covered = new Int32Array(rows.length);
  const blocked = new Int32Array(keep.length);
  let best = bound, bestSol = null, bestKey = '', nodes = 0, exact = true, stamp = 0;
  const chosen = [];
  const lowerBound = () => {
    // uncovered 1s no term covers two of: each needs a term of its own
    stamp++;
    let lb = 0;
    for (let k = 0; k < rows.length; k++) {
      if (covered[k]) continue;
      const cs = coverers[k];
      if (cs.some(c => blocked[c.id] === stamp)) continue;
      lb += cs[0].t.cost; for (const c of cs) blocked[c.id] = stamp;
    }
    return lb;
  };
  const search = cost => {
    if (++nodes > budget.nodes || ((nodes & 255) === 0 && Date.now() > budget.until)) { exact = false; return; }
    let pick = -1;
    for (let k = 0; k < rows.length; k++) if (!covered[k] && (pick < 0 || coverers[k].length < coverers[pick].length)) pick = k;
    if (pick < 0) {
      // of the cheapest covers, the first in the order of their terms
      const key = solKey(chosen);
      if (cost - 1 < best || (bestSol && cost - 1 === best && key < bestKey)) { best = cost - 1; bestSol = [...chosen]; bestKey = key; }
      return;
    }
    const over = x => (bestSol ? x > best : x >= best);
    if (over(cost - 1 + lowerBound())) return;
    for (const c of coverers[pick]) {
      if (over(cost + c.t.cost - 1)) continue;
      chosen.push(c);
      for (const k of c.rows) covered[k]++;
      search(cost + c.t.cost);
      for (const k of c.rows) covered[k]--;
      chosen.pop();
      if (!exact) return;
    }
  };
  search(0);
  budget.nodes -= Math.min(nodes, budget.nodes);
  if (!exact) budget.cut = true;
  if (!bestSol) return null;
  return { terms: bestSol.map(c => c.t), cost: best, exact };
}

// expression of an OR of XOR products: literals first, then the XOR / XNOR factors
function xorTermsAst(terms, inputs) {
  const v = j => ({ t: 'var', name: inputs[j] });
  const prods = [...terms].sort(termOrder).map(t => {
    const fs = [...t.lits.map(l => (l.neg ? { t: 'not', a: v(l.v) } : v(l.v))),
      ...t.groups.map(g => { const x = { t: 'xor', args: g.vars.map(v) }; return g.odd ? x : { t: 'not', a: x }; })];
    return fs.length === 1 ? fs[0] : { t: 'and', args: fs };
  });
  return prods.length === 1 ? prods[0] : { t: 'or', args: prods };
}

/** Literals and two-input operators of an expression: { literals, xor, and, or, ops } (NOT free). */
export function exprCost(e) {
  const c = { literals: 0, xor: 0, and: 0, or: 0 };
  const walk = x => {
    if (x.t === 'var') c.literals++;
    else if (x.t === 'not') walk(x.a);
    else if (x.args) { c[x.t] += x.args.length - 1; x.args.forEach(walk); }
  };
  walk(e);
  c.ops = c.xor + c.and + c.or;
  return c;
}

/**
 * XOR form of a column (see above), or null when there is none strictly cheaper than `than` (the
 * minimal SOP and POS asts, computed when not given), the column is constant, or it has more than
 * MAX_XOR_INPUTS inputs. Returns { ast, literals, ops, xor, and, or, exact }.
 */
export function minimizeXor(colIn, inputs, { than, maxNodes = 30000, timeMs = 250 } = {}) {
  const n = inputs.length;
  if (n < 2 || n > MAX_XOR_INPUTS) return null;
  const col = normColumn(colIn, n);
  if (!col.includes('1') || !col.includes('0')) return null;
  if (!than) than = ['sop', 'pos'].map(form => minimalAst(minimize(col, n, { form }), inputs));
  const costOf = e => { const c = exprCost(e); return c.literals * XOR_LIT + c.ops; };
  const bound0 = Math.min(...than.map(costOf));
  const budget = { nodes: maxNodes, until: Date.now() + timeMs, cut: false };
  const bit = (r, j) => (r >> (n - 1 - j)) & 1;
  let best = null;
  // a sum of XOR products
  const s0 = xorCover(n, setOf(n, r => col[r] === '1'), setOf(n, r => col[r] !== '0'), bound0, budget);
  if (s0) best = { ast: xorTermsAst(s0.terms, inputs), cost: s0.cost };
  // x ⊕ (a sum of XOR products of f ⊕ x)
  for (let j = 0; j < n && !budget.cut; j++) {
    const g = r => (col[r] === 'X' ? 'X' : String(+col[r] ^ bit(r, j)));
    const gc = Array.from({ length: 1 << n }, (_, r) => g(r)).join('');
    if (!gc.includes('1') || !gc.includes('0')) continue;
    const s = xorCover(n, setOf(n, r => gc[r] === '1'), setOf(n, r => gc[r] !== '0'), (best ? best.cost : bound0) - XOR_LIT - 1, budget);
    if (s) {
      const rest = xorTermsAst(s.terms, inputs);
      best = { ast: { t: 'xor', args: [{ t: 'var', name: inputs[j] }, ...(rest.t === 'xor' ? rest.args : [rest])] }, cost: s.cost + XOR_LIT + 1 };
    }
  }
  if (!best) return null;
  // equivalent to the table on every row that is not a don't care
  const got = exprColumn(best.ast, inputs);
  for (let r = 0; r < col.length; r++) if (col[r] !== 'X' && col[r] !== got[r]) throw new Error(`XOR form of ${col} wrong at row ${r}`);
  return { ast: best.ast, ...exprCost(best.ast), exact: !budget.cut };
}

/** A student's expression against a column: { equal, diffs: [{ row, expected, got }] } (X rows never differ). */
export function compareExpr(text, inputs, colIn) {
  const ast = parseExpr(text, { vars: inputs });
  const col = normColumn(colIn, inputs.length);
  const got = exprColumn(ast, inputs);
  const diffs = [];
  for (let r = 0; r < col.length; r++) if (col[r] !== 'X' && col[r] !== got[r]) diffs.push({ row: r, expected: col[r], got: got[r] });
  return { equal: diffs.length === 0, diffs, ast, column: got };
}

// ===================================================================== Karnaugh maps
export const gray = k => Array.from({ length: 1 << k }, (_, i) => i ^ (i >> 1));

/**
 * Layout of the Karnaugh map(s) of n (1–6) variables:
 *   { n, mapVars, rowVars, colVars, rowCodes, colCodes, maps: [{ code, fixed: [{ v, bit }] }],
 *     minterm(map, r, c) }
 * 1: one row, x0 on the columns; 2: x0 rows, x1 columns; 3: x0 rows, x1x2 columns (Gray);
 * 4: x0x1 rows, x2x3 columns; 5: two 4×4 maps (x0 = 0, 1); 6: four 4×4 maps (x0x1 = 00, 01, 11, 10).
 */
export function kmapLayout(n) {
  if (!(n >= 1 && n <= MAX_EDIT_INPUTS)) throw new Error(`Karnaugh maps need 1 to ${MAX_EDIT_INPUTS} variables`);
  const spec = { 1: [0, 0, 1], 2: [0, 1, 1], 3: [0, 1, 2], 4: [0, 2, 2], 5: [1, 2, 2], 6: [2, 2, 2] }[n];
  const [mv, rv, cv] = spec;
  const mapVars = Array.from({ length: mv }, (_, i) => i);
  const rowVars = Array.from({ length: rv }, (_, i) => mv + i);
  const colVars = Array.from({ length: cv }, (_, i) => mv + rv + i);
  const rowCodes = gray(rv), colCodes = gray(cv);
  const maps = gray(mv).map(code => ({ code, fixed: mapVars.map((v, i) => ({ v, bit: (code >> (mv - 1 - i)) & 1 })) }));
  const put = (vars, code) => vars.reduce((m, v, i) => m | (((code >> (vars.length - 1 - i)) & 1) << (n - 1 - v)), 0);
  const minterm = (map, r, c) => put(mapVars, maps[map].code) | put(rowVars, rowCodes[r]) | put(colVars, colCodes[c]);
  return { n, mapVars, rowVars, colVars, rowCodes, colCodes, maps, minterm };
}

// indices of a Gray-ordered axis that match the cube on `vars`, as runs [lo, hi] with open ends
// where the group wraps around the edge of the map
function axisRuns(codes, vars, cube, n) {
  const k = vars.length;
  const idx = [];
  codes.forEach((code, i) => {
    const ok = vars.every((v, j) => { const b = 1 << (n - 1 - v); return (cube.mask & b) || (((code >> (k - 1 - j)) & 1) === ((cube.value & b) ? 1 : 0)); });
    if (ok) idx.push(i);
  });
  const runs = [];
  for (const i of idx) { const r = runs[runs.length - 1]; if (r && r.hi === i - 1) r.hi = i; else runs.push({ lo: i, hi: i, openLo: false, openHi: false }); }
  if (runs.length === 2) { runs[0].openLo = true; runs[1].openHi = true; }   // wraps around the edges
  return runs;
}

/**
 * Rectangles to draw for an implicant: [{ map, r0, r1, c0, c1, open: { top, bottom, left, right } }].
 * A group that wraps around an edge (or the corners) is split into parts whose open sides continue
 * across the edge of the map.
 */
export function kmapRects(layout, cube) {
  const { n } = layout;
  const out = [];
  const rows = axisRuns(layout.rowCodes, layout.rowVars, cube, n);
  const cols = axisRuns(layout.colCodes, layout.colVars, cube, n);
  layout.maps.forEach((m, mi) => {
    const ok = m.fixed.every(f => { const b = 1 << (n - 1 - f.v); return (cube.mask & b) || (((cube.value & b) ? 1 : 0) === f.bit); });
    if (!ok) return;
    for (const r of rows) for (const c of cols) out.push({ map: mi, r0: r.lo, r1: r.hi, c0: c.lo, c1: c.hi, open: { top: r.openLo, bottom: r.openHi, left: c.openLo, right: c.openHi } });
  });
  return out;
}

// ===================================================================== truth table documents
const IDENT = /^[A-Za-z][A-Za-z0-9_]*$/;
const RESERVED = new Set(('abs access after alias all and architecture array assert attribute begin block body buffer bus case component configuration constant disconnect downto else elsif end entity exit file for function generate generic group guarded if impure in inertial inout is label library linkage literal loop map mod nand new next nor not null of on open or others out package port postponed procedure process pure range record register reject rem report return rol ror select severity signal shared sla sll sra srl subtype then to transport type unaffected units until use variable wait when while with xnor xor ' +
  'always assign begin buf case casex casez default defparam else end endcase endfunction endmodule endtask for forever function if initial inout input integer module nand negedge nor not or output parameter posedge reg repeat signed task while wire xnor xor localparam genvar generate endgenerate logic std_logic ieee').split(' '));

export function newTable(name = 'truth_table', inputs = ['a', 'b', 'c'], outputs = ['f']) {
  const n = inputs.length;
  return { version: TT_VERSION, name, inputs: [...inputs], outputs: [...outputs], table: Object.fromEntries(outputs.map(o => [o, '0'.repeat(1 << n)])), exprs: {}, notes: '', form: 'sop', lang: 'vhdl' };
}

export function normalizeTable(d) {
  const doc = d && typeof d === 'object' ? JSON.parse(JSON.stringify(d)) : newTable();
  doc.version = TT_VERSION;
  doc.name = String(doc.name || 'truth_table');
  doc.inputs = (Array.isArray(doc.inputs) ? doc.inputs : []).map(String).slice(0, MAX_INPUTS);
  doc.outputs = (Array.isArray(doc.outputs) ? doc.outputs : []).map(String);
  const n = doc.inputs.length;
  const t = doc.table && typeof doc.table === 'object' ? doc.table : {};
  doc.table = Object.fromEntries(doc.outputs.map(o => [o, normColumn(t[o], n)]));
  const ex = doc.exprs && typeof doc.exprs === 'object' ? doc.exprs : {};
  doc.exprs = Object.fromEntries(doc.outputs.filter(o => typeof ex[o] === 'string' && ex[o].trim()).map(o => [o, ex[o]]));
  doc.notes = String(doc.notes ?? '');
  doc.form = doc.form === 'pos' || doc.form === 'xor' ? doc.form : 'sop';
  doc.lang = doc.lang === 'verilog' ? 'verilog' : 'vhdl';
  return doc;
}

/** Problems of a table document: [{ severity: 'error', message }] (names, sizes). */
export function validateTable(doc, { maxInputs = MAX_INPUTS } = {}) {
  const errs = [];
  const e = m => errs.push({ severity: 'error', message: m });
  if (!IDENT.test(doc.name) || RESERVED.has(doc.name.toLowerCase())) e(`'${doc.name}' is not a valid module name`);
  if (doc.inputs.length < 1 || doc.inputs.length > maxInputs) e(`a truth table has 1 to ${maxInputs} inputs`);
  if (doc.outputs.length < 1) e('a truth table has at least 1 output');
  const seen = new Set([doc.name.toLowerCase()]);
  for (const v of [...doc.inputs, ...doc.outputs]) {
    if (!IDENT.test(v) || /__|_$/.test(v) || RESERVED.has(v.toLowerCase())) e(`'${v}' is not a valid name (a letter, then letters, digits and single _; not a VHDL/Verilog keyword)`);
    else if (seen.has(v.toLowerCase())) e(`the name '${v}' is used twice`);
    seen.add(v.toLowerCase());
  }
  return errs;
}

/** Change the inputs/outputs of a table: kept columns follow their names, new ones are 0. */
export function reshapeTable(doc, inputs, outputs) {
  const old = doc.inputs, n0 = old.length, n = inputs.length;
  const pos = inputs.map(v => old.findIndex(o => o.toLowerCase() === v.toLowerCase()));
  const table = {};
  for (const o of outputs) {
    const prev = Object.keys(doc.table).find(k => k.toLowerCase() === o.toLowerCase());
    let col = '';
    for (let r = 0; r < 1 << n; r++) {
      if (prev == null) { col += '0'; continue; }
      // the old row with the same values of the kept inputs (dropped inputs at 0)
      let r0 = 0, ok = true;
      inputs.forEach((v, j) => { const b = (r >> (n - 1 - j)) & 1; if (pos[j] >= 0) r0 |= b << (n0 - 1 - pos[j]); else if (b) ok = ok && true; });
      col += doc.table[prev][r0] ?? '0';
    }
    table[o] = col;
  }
  const exprs = {};
  for (const o of outputs) { const k = Object.keys(doc.exprs || {}).find(x => x.toLowerCase() === o.toLowerCase()); if (k && inputs.length === n0 && inputs.every((v, j) => v === old[j])) exprs[o] = doc.exprs[k]; }
  return { ...doc, inputs: [...inputs], outputs: [...outputs], table, exprs };
}

/**
 * All the results shown for one output: canonical forms, minimal SOP and POS, gate counts, and the
 * XOR form when it is cheaper than both (else null; none above MAX_XOR_INPUTS inputs).
 */
export function analyzeOutput(doc, out, opts = {}) {
  const n = doc.inputs.length;
  const col = normColumn(doc.table[out], n);
  const can = canonical(col);
  const sop = minimize(col, n, { form: 'sop', ...opts }), pos = minimize(col, n, { form: 'pos', ...opts });
  sop.ast = minimalAst(sop, doc.inputs); pos.ast = minimalAst(pos, doc.inputs);
  sop.gates = gateCount(sop); pos.gates = gateCount(pos);
  const xor = minimizeXor(col, doc.inputs, { than: [sop.ast, pos.ast] });
  return { col, ...can, sop, pos, xor };
}

// ===================================================================== HDL module of a table
const DC_RE = /don't cares?:\s*([A-Za-z][A-Za-z0-9_]*)\s*=\s*d\(([^)]*)\)/gi;

/**
 * HDL module (VHDL or Verilog) of a table: one assignment per output, its minimal SOP or POS; with
 * form 'xor', its XOR form where there is one (xor / xnor, ^ / ~^), else its minimal SOP.
 */
export function generateTableHdl(docIn, lang = docIn.lang || 'vhdl', { form = docIn.form || 'sop', source } = {}) {
  const doc = normalizeTable(docIn);
  const errs = validateTable(doc);
  if (errs.length) throw new Error(errs.map(x => x.message).join('; '));
  const c = lang === 'verilog' ? '//' : '--';
  const n = doc.inputs.length;
  const res = doc.outputs.map(o => {
    const m = minimize(doc.table[o], n, { form: form === 'pos' ? 'pos' : 'sop', ...(n > MAX_EDIT_INPUTS ? { maxNodes: 50000 } : {}) });
    m.ast = minimalAst(m, doc.inputs);
    m.what = `minimal ${m.form === 'pos' ? 'POS' : 'SOP'}, ${m.literals} literal(s)`;
    if (form === 'xor') {
      // the XOR form against both minimal forms; a fixed node budget only, no time limit: the
      // same table always gives the same module
      const x = minimizeXor(doc.table[o], doc.inputs, { timeMs: Infinity });
      if (x) Object.assign(m, { ast: x.ast, what: `XOR form, ${x.literals} literal(s)` });
    }
    return { o, a: canonical(doc.table[o]), m };
  });
  const head = [
    `${c} ${doc.name}: combinational module generated from the truth table ${source || `${doc.name}.tt.json`} (Silinx Truth Table / Karnaugh Map).`,
    `${c} It stays synchronized with the table: editing the table rewrites this file, and editing this file (and`,
    `${c} saving it) updates the table. Inputs: ${doc.inputs.join(', ')} (${doc.inputs[0]} is the most significant bit of a row).`,
    `${c}`,
  ];
  for (const { o, a, m } of res) {
    head.push(`${c} ${o} = ${a.sigma}`);
    head.push(`${c} ${o} = ${formatExpr(m.ast, 'textbook')}   (${m.what})`);
    if (a.dcs.length) head.push(`${c} don't care: ${o} = d(${a.dcs.join(', ')})`);
  }
  const L = [...head, ''];
  if (lang === 'verilog') {
    L.push(`module ${doc.name} (`, `    input  wire ${doc.inputs.join(', ')},`, `    output wire ${doc.outputs.join(', ')}`, ');', '');
    for (const { o, m } of res) L.push(`    assign ${o} = ${formatExpr(m.ast, 'verilog')};`);
    L.push('', 'endmodule', '');
    return { code: L.join('\n'), filename: `${doc.name}.v`, lang };
  }
  L.push('library ieee;', 'use ieee.std_logic_1164.all;', '', `entity ${doc.name} is`, '    port (',
    `        ${doc.inputs.join(', ')} : in  std_logic;`, `        ${doc.outputs.join(', ')} : out std_logic`, '    );', `end ${doc.name};`, '',
    `architecture truth_table of ${doc.name} is`, 'begin');
  for (const { o, m } of res) L.push(`    ${o} <= ${formatExpr(m.ast, 'vhdl')};`);
  L.push('end truth_table;', '');
  return { code: L.join('\n'), filename: `${doc.name}.vhd`, lang };
}

/** Don't cares declared in an HDL text ("don't care: f = d(3, 5)" comments): { f: [3, 5] }. */
export function dontCaresInHdl(text) {
  const out = {};
  for (const m of String(text || '').matchAll(DC_RE)) {
    const list = m[2].split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(Number.isInteger);
    out[m[1].toLowerCase()] = list;
  }
  return out;
}

// ===================================================================== truth table of a module
/**
 * Truth table of a combinational module of the project, by exhaustive simulation of the elaborated
 * module. sources: [{ path, text, lang? }]. Vector ports give one input/output per bit (a(1) -> a_1).
 * Throws when the module is sequential (clocked processes or latches), has more than `maxInputs`
 * input bits, or ports of other types. Any number of output bits.
 * Returns { name, inputs, outputs, table, lang, warnings }.
 */
export function truthTableFromModule(sources, moduleName, { maxInputs = MAX_INPUTS } = {}) {
  const lib = compile(sources);
  const design = elaborate(lib, moduleName);
  const errors = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (!design.top || errors.length) throw new Error(`'${moduleName}' cannot be compiled: ${errors.slice(0, 3).map(d => `${d.file ? `${d.file.split('/').pop()}:${d.line} ` : ''}${d.message}`).join('; ') || 'not found'}`);
  const unit = (lib.parsed || []).find(p => p.units.some(u => u.kind === 'module' && u.name.toLowerCase() === moduleName.toLowerCase()));
  const lang = unit && /\.v$/i.test(unit.file || unit.path || '') ? 'verilog' : (sources.find(s => s.path === (unit?.file || unit?.path))?.lang || (unit?.lang) || 'vhdl');
  const clocks = new Set();
  const visit = inst => { for (const pr of inst.procs || []) for (const c of clocksOf(pr).clocks) clocks.add(c); (inst.children || []).forEach(visit); };
  visit(design.top);
  const top = design.top;
  if (clocks.size) {
    const names = [...clocks].map(s => String(s.name || '').split('.').pop()).filter(Boolean);
    throw new Error(`'${top.mod?.name || moduleName}' is sequential (it has clocked logic${names.length ? `: ${[...new Set(names)].join(', ')}` : ''}); a truth table needs a combinational module`);
  }
  if (latchGates(design).size) throw new Error(`'${moduleName}' has latches (outputs that keep their value); a truth table needs a combinational module`);
  const ports = tbPorts(design);
  const bad = ports.filter(p => p.kind === 'other' || p.kind === 'int' || p.dir === 'inout');
  if (bad.length) throw new Error(`port(s) ${bad.map(p => p.name).join(', ')} are not std_logic / std_logic_vector inputs or outputs`);
  const ins = ports.filter(p => p.dir === 'in'), outs = ports.filter(p => p.dir === 'out');
  const nIn = ins.reduce((s, p) => s + p.width, 0), nOut = outs.reduce((s, p) => s + p.width, 0);
  if (!nIn) throw new Error(`'${moduleName}' has no inputs`);
  if (nIn > maxInputs) throw new Error(`'${moduleName}' has ${nIn} input bits: a truth table takes at most ${maxInputs}`);
  if (!nOut) throw new Error(`'${moduleName}' has no outputs`);
  const bitNames = p => {
    if (!p.bus) return [p.name];
    const idx = p.desc ? Array.from({ length: p.width }, (_, i) => p.left - i) : Array.from({ length: p.width }, (_, i) => p.left + i);
    return idx.map(i => `${p.name}_${i}`);
  };
  const inputs = ins.flatMap(bitNames), outputs = outs.flatMap(bitNames);
  const vectors = [];
  for (let r = 0; r < 1 << nIn; r++) {
    const bits = r.toString(2).padStart(nIn, '0');
    const v = { in: {}, exp: {} };
    let at = 0;
    for (const p of ins) { v.in[p.name] = bits.slice(at, at + p.width); at += p.width; }
    vectors.push(v);
  }
  const tbName = `silinx_tt_${moduleName}`.slice(0, 60);
  const tbLang = lang === 'verilog' ? 'verilog' : 'vhdl';
  const text = generateTestbench({ name: tbName, lang: tbLang, uut: { name: top.mod?.name || moduleName, params: [] }, ports, vectors, settleNs: 10, trace: true });
  const tb = { path: `${tbName}.${tbLang === 'vhdl' ? 'vhd' : 'v'}`, lang: tbLang, text };
  const r = simulate([...sources, tb], tbName, { until: 1e15 });
  if (r.errors.length) throw new Error(`cannot simulate '${moduleName}': ${r.errors.slice(0, 3).map(e => e.message).join('; ')}`);
  const exp = expectedFromTrace(r.sim.log.map(l => l.text), outs, vectors.length);
  if (exp.some(e => !e)) throw new Error(`the simulation of '${moduleName}' did not reach every input combination`);
  const table = Object.fromEntries(outputs.map(o => [o, '']));
  let unknown = 0;
  for (let k = 0; k < vectors.length; k++) {
    let at = 0;
    for (const p of outs) {
      const bits = exp[k][p.name];
      for (const [i, nm] of bitNames(p).entries()) { const b = bits[i]; if (b !== '0' && b !== '1') unknown++; table[nm] += b === '0' || b === '1' ? b : 'X'; }
      at += p.width;
    }
  }
  const warnings = unknown ? [`${unknown} output value(s) are not 0/1 (X, U or Z) in the simulation: shown as don't cares (X)`] : [];
  return { name: top.mod?.name || moduleName, inputs, outputs, table, lang, warnings };
}

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
function splitFanIn(node, L) {
  if (!node.op) return node;
  let kids = node.kids.map(k => splitFanIn(k, L));
  while (kids.length > L) {
    const nk = [];
    for (let i = 0; i < kids.length; i += L) { const ch = kids.slice(i, i + L); nk.push(ch.length === 1 ? ch[0] : { op: node.op, kids: ch }); }
    kids = nk;
  }
  return { op: node.op, kids };
}
// NAND-only form computing node (inv = false) or its complement (inv = true)
function nandify(node, inv) {
  if (node.leaf != null) return { leaf: node.leaf, neg: node.neg !== inv };
  const not = x => (x.op === 'nand1' ? x.kids[0] : { op: 'nand1', kids: [x] });
  if (node.op === 'buf') return nandify(node.kids[0], inv);
  if (node.op === 'and') { const g = { op: 'nand', kids: node.kids.map(k => nandify(k, false)) }; return inv ? g : not(g); }
  if (node.op === 'or') { const g = { op: 'nand', kids: node.kids.map(k => nandify(k, true)) }; return inv ? not(g) : g; }
  throw new Error(`nandify: ${node.op}`);
}

/**
 * Gate schematic (core/schdoc.js document) of a table: input markers on the left, one vertical
 * rail per used input literal (inverters at the top), the two-level circuit of each output
 * (minimal SOP: AND gates then an OR gate; POS: OR then AND) and the output markers on the right.
 * opts: { form: 'sop'|'pos', nand: NAND gates only, lang, name }.
 */
export function schematicFromTable(docIn, { form = 'sop', nand = false, lang, name } = {}) {
  const tt = normalizeTable(docIn);
  const n = tt.inputs.length;
  const doc = newDoc(name || tt.name, lang || tt.lang);
  let sid = 0, wid = 0, pid = 0, lid = 0;
  const L = nand ? 4 : 5;
  // ---- trees
  const trees = tt.outputs.map(o => {
    const m = minimize(tt.table[o], n, { form });
    let t = outputTree(m);
    if (t.const != null) return { o, t };
    t = splitFanIn(t, L);
    if (nand) t = t.leaf != null ? { op: 'nand1', kids: [{ leaf: t.leaf, neg: !t.neg }] } : nandify(t, false);
    else if (t.leaf != null) t = { op: 'buf', kids: [t] };
    return { o, t };
  });
  // ---- sizes and columns
  const gateType = g => {
    const k = g.kids.length;
    if (g.op === 'nand1') return 'nand2';
    if (g.op === 'buf') return 'buf';
    return `${g.op}${k}`;
  };
  const gateH = g => (g.op === 'buf' ? 20 : g.op === 'nand1' ? 40 : Math.max(40, g.kids.length * 20));
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
  const invH = nand ? 80 : 60;
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
      const xin = nand ? xC(j) - 10 : xC(j);
      addWire([{ x: PX, y: yj }, { x: xin, y: yj }, { x: xin, y: yInv }], net);
      const inv = nand ? addSym('nand2', xC(j) - 20, yInv, 90) : addSym('inv', xC(j) - 10, yInv, 90);
      inv.pins.forEach(p => { p.net = p.dir === 'out' ? railNet(j, true) : net; });
      if (nand) addWire([{ x: xC(j) - 10, y: yInv }, { x: xC(j) + 10, y: yInv }], net);
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
    if (g.op === 'nand1') { const [a, b] = ins; addWire([{ x: a.x, y: a.y }, { x: b.x, y: b.y }], g.kids[0].leaf != null ? railNet(g.kids[0].leaf, g.kids[0].neg) : g.kids[0].net); }
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
  return doc;
}

/** netlist() errors of a document (for tests and the UI). */
export function schematicErrors(doc) {
  return netlist(doc).diagnostics.filter(d => d.severity === 'error');
}
