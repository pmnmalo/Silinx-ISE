// Design checks (lint) for beginners, run by Check Syntax and live in the editor.
//
//   designChecks(lib, design, { lint = true, rules = true }) -> diagnostics
//
// It works on the elaborated design (core/elaborate.js) and reports, with file and line:
//  - rules (errors that ISE reports but the elaborator accepts): an input port assigned / an output
//    port read in VHDL-93, std_logic vs std_logic_vector (and unsigned vs std_logic_vector) type
//    errors, numeric_std / std_logic_1164 functions or types used without their use clause, a
//    procedural assignment to a Verilog wire, a continuous assignment to a Verilog reg;
//  - lint warnings: latch inferred, incomplete sensitivity list, multiple drivers, combinational
//    loop, output never assigned, input never used, signal assigned but never read, signal read but
//    never assigned, clock used as data, logic used as clock, blocking / non-blocking assignments in
//    the wrong kind of Verilog always block, case without others / default, and (info) integers
//    without a range.
// A clocked process without a reset branch is fine and is not reported.
//
// Each diagnostic has { file, line, col, severity, message, tool, check, source: 'lint' }; `check`
// is the id used by the help texts (core/hints.js) and by the suppression comment written on the
// line of the message or on the line above it:
//     -- silinx: ignore latch          // silinx: ignore sensitivity, multi-driver
//     -- silinx: ignore                (every check on that line)
// Testbench files (role 'sim') only get the rules, not the warnings.
import * as V from './values.js';
import { clocksOf } from './schematic.js';
import { readsOf } from './elaborate.js';

export const LINT_CHECKS = ['latch', 'sensitivity', 'multi-driver', 'comb-loop', 'unassigned-output', 'unused-input', 'unused-signal',
  'unassigned-signal', 'clock-as-data', 'data-as-clock', 'blocking', 'nonblocking', 'case-default', 'integer-range'];
export const RULE_CHECKS = ['mode-in', 'mode-out', 'type-mismatch', 'missing-library', 'wire-procedural', 'reg-continuous'];

// ------------------------------------------------------------------------- tree helpers
const SKIP = new Set(['sig', 't', 'fn', 'val', 'loc', 'triggers', 'inst']);
const STMT_KINDS = new Set(['blk', 'if', 'case', 'for', 'forrange', 'while', 'repeat', 'forever', 'event', 'delay', 'fork', 'asg', 'wait', 'call', 'assert', 'report', 'ret', 'exit', 'next', 'null']);

/** Every statement of a bound body: fn(stmt, conds) with the enclosing conditions / selectors. */
function eachStmt(s, fn, conds = []) {
  if (!s || typeof s !== 'object') return;
  if (Array.isArray(s)) { for (const x of s) eachStmt(x, fn, conds); return; }
  switch (s.k) {
    case 'blk': eachStmt(s.stmts, fn, conds); return;
    case 'if': fn(s, conds); eachStmt(s.then, fn, [...conds, s.c]); eachStmt(s.else, fn, [...conds, s.c]); return;
    case 'case': fn(s, conds); for (const it of s.items) eachStmt(it.body, fn, [...conds, s.sel]); eachStmt(s.def, fn, [...conds, s.sel]); return;
    case 'for': fn(s, conds); eachStmt(s.init, fn, conds); eachStmt(s.body, fn, [...conds, s.cond]); eachStmt(s.step, fn, conds); return;
    case 'forrange': case 'while': case 'repeat': case 'forever': fn(s, conds); eachStmt(s.body, fn, [...conds, s.cond || s.count].filter(Boolean)); return;
    case 'event': case 'delay': fn(s, conds); eachStmt(s.stmt, fn, conds); return;
    case 'fork': eachStmt(s.branches, fn, conds); return;
    default: fn(s, conds);
  }
}

/** The expressions of one statement (not its sub-statements). */
function exprsOf(s) {
  switch (s.k) {
    case 'asg': return [s.value, ...targetIndexExprs(s.target)];
    case 'if': return [s.c];
    case 'case': return [s.sel, ...s.items.flatMap(it => it.choices.flatMap(c => (c.range ? [c.range.lo, c.range.hi] : [c])))];
    case 'for': return [s.cond];
    case 'while': return [s.cond];
    case 'repeat': return [s.count];
    case 'forrange': return [s.from, s.to];
    case 'wait': return [s.until, s.forT].filter(Boolean);
    case 'call': return [...(s.args || []), ...(s.sigReads || [])].filter(Boolean);
    case 'assert': return [s.c, s.msg].filter(Boolean);
    case 'report': return [s.msg];
    case 'ret': return s.value ? [s.value] : [];
    case 'exit': case 'next': return s.c ? [s.c] : [];
    default: return [];
  }
}
function targetIndexExprs(L, out = []) {
  if (!L || typeof L !== 'object') return out;
  if (L.k === 'cat') { L.parts.forEach(p => targetIndexExprs(p, out)); return out; }
  for (const key of ['index', 'start', 'left', 'right']) if (L[key] && typeof L[key] === 'object') out.push(L[key]);
  if (L.base) targetIndexExprs(L.base, out);
  return out;
}

function contains(n, pred) {
  if (!n || typeof n !== 'object') return false;
  if (Array.isArray(n)) return n.some(x => contains(x, pred));
  if (pred(n)) return true;
  for (const k in n) if (!SKIP.has(k)) { const v = n[k]; if (v && typeof v === 'object' && contains(v, pred)) return true; }
  return false;
}
const hasEdgeOf = (n, sig) => contains(n, x => (x.k === 'edge' || x.k === 'event') && (!sig || x.sig === sig));

const isC = n => n && n.k === 'c' && n.val && typeof n.val === 'object' && 'w' in n.val;
/** Constant selection of a signal -> { sig, bits: Set } (positions; 'e<i>' for array elements). */
function selBits(n) {
  if (!n || !n.base || n.base.k !== 'sig') return null;
  const t = n.base.t || n.base.sig.t;
  if (n.k === 'bit' && isC(n.index)) {
    const i = V.toNum(n.index.val);
    return { sig: n.base.sig, bits: new Set([t.desc ? i - t.right : t.right - i]) };
  }
  if (n.k === 'slice' && typeof n.lo === 'number') {
    const bits = new Set();
    for (let k = 0; k < n.t.w; k++) bits.add(n.lo + k);
    return { sig: n.base.sig, bits };
  }
  if (n.k === 'elem' && isC(n.index)) return { sig: n.base.sig, bits: new Set([`e${V.toNum(n.index.val)}`]) };
  return null;
}
function rootSig(L) {
  let r = L;
  while (r && r.base) r = r.base;
  return r && r.k === 'sig' ? r.sig : null;
}
/** Assignment target -> [{ sig, bits: Set | null (all) }] */
function targetBits(L, out = []) {
  if (!L) return out;
  if (L.k === 'cat') { L.parts.forEach(p => targetBits(p, out)); return out; }
  if (L.k === 'sig') { out.push({ sig: L.sig, bits: null }); return out; }
  const sel = selBits(L);
  if (sel) { out.push(sel); return out; }
  const s = rootSig(L);
  if (s) out.push({ sig: s, bits: null });
  return out;
}
const addBits = (m, sig, bits) => {
  if (!m.has(sig)) { m.set(sig, bits ? new Set(bits) : null); return; }
  const cur = m.get(sig);
  if (cur === null) return;
  if (!bits) { m.set(sig, null); return; }
  for (const b of bits) cur.add(b);
};
/** Signals (and bits) read by an expression. */
function readBits(n, out = new Map()) {
  if (!n || typeof n !== 'object') return out;
  if (Array.isArray(n)) { n.forEach(x => readBits(x, out)); return out; }
  const sel = selBits(n);
  if (sel) { addBits(out, sel.sig, sel.bits); return out; }
  if ((n.k === 'sig' || n.k === 'edge' || n.k === 'event') && n.sig) addBits(out, n.sig, null);
  if (n.k === 'call' && n.fn) { try { for (const s of readsOf({ k: 'call', fn: n.fn, args: [] })) addBits(out, s, null); } catch { /* ignore */ } }
  for (const k in n) if (!SKIP.has(k)) { const v = n[k]; if (v && typeof v === 'object') readBits(v, out); }
  return out;
}
const overlap = (a, b) => a === null || b === null || [...a].some(x => b.has(x));
const sameBits = (a, b) => (a === null && b === null) || (a !== null && b !== null && a.size === b.size && [...a].every(x => b.has(x)));
const short = s => s.name.split('.').pop();

// ------------------------------------------------------------------------- suppression
const IGNORE_RE = /(?:--|\/\/)\s*silinx\s*:\s*ignore\b([^\n]*)/i;
/** Is `check` suppressed on `line` (1-based) of text (comment on that line or the line above)? */
export function suppressed(text, line, check) {
  if (!text || !line) return false;
  const lines = text.split('\n');
  for (const l of [lines[line - 1], lines[line - 2]]) {
    const m = l && IGNORE_RE.exec(l);
    if (!m) continue;
    const ids = m[1].split(/[\s,;]+/).map(x => x.toLowerCase()).filter(x => /^[a-z][\w-]*$/.test(x));
    if (!ids.length || ids.includes(check) || ids.includes('all')) return true;
  }
  return false;
}

// ------------------------------------------------------------------------- VHDL use clauses
const NUMERIC_FNS = ['to_unsigned', 'to_signed', 'to_integer', 'unsigned', 'signed', 'resize', 'shift_left', 'shift_right', 'rotate_left', 'rotate_right'];
function stripVhdl(text) {
  // comments and string / character literals blanked (positions kept)
  return text.replace(/--[^\n]*/g, m => ' '.repeat(m.length)).replace(/"[^"\n]*"/g, m => ' '.repeat(m.length));
}
function posOf(text, idx) {
  const before = text.slice(0, idx);
  const line = before.split('\n').length;
  return { line, col: idx - before.lastIndexOf('\n') };
}
function libraryChecks(file, text) {
  const out = [];
  const src = stripVhdl(text);
  const has1164 = /\bieee\s*\.\s*std_logic_1164\b/i.test(src);
  const hasNum = /\bieee\s*\.\s*(numeric_std|numeric_bit|std_logic_arith|std_logic_unsigned|std_logic_signed)\b/i.test(src) || /\bieee\s*\.\s*numeric_std_unsigned\b/i.test(src);
  if (!has1164) {
    const m = /\bstd_u?logic(_vector)?\b/i.exec(src);
    if (m) out.push({ file, ...posOf(src, m.index), name: m[0], pkg: 'std_logic_1164' });
  }
  if (!hasNum) {
    const re = new RegExp(`\\b(${NUMERIC_FNS.join('|')})\\b`, 'ig');
    let m;
    while ((m = re.exec(src))) {
      // (a function of that name declared in the file itself is fine)
      if (new RegExp(`\\b(function|type|subtype)\\s+${m[1]}\\b`, 'i').test(src)) continue;
      out.push({ file, ...posOf(src, m.index), name: m[1], pkg: 'numeric_std' });
      break;
    }
  }
  return out;
}

// ------------------------------------------------------------------------- types
function vhdlTypeName(t, n) {
  if (!t) return '?';
  if (t.kind === 'bool') return 'boolean';
  if (t.kind === 'int') return 'integer';
  if (t.kind === 'logic') {
    if (t.scalar) return 'std_logic';
    if (n && n.k === 'c' && n.strText !== undefined) return 'string literal';
    return t.mark || (t.s ? 'signed' : 'unsigned');
  }
  return t.name || t.kind;
}
const CMP = new Set(['==', '!=', '<', '<=', '>', '>=', '=', '/=']);
/** VHDL assignment type error (target type, value) -> [current, expected] or null. */
function vhdlTypeError(target, value) {
  const tt = target.t, vt = value.t;
  if (!tt || !vt || tt.kind !== 'logic') return null;
  if (tt.scalar) {
    if (vt.kind === 'bool' && value.k === 'bin' && CMP.has(value.o)) return ['boolean', 'std_logic'];
    if (vt.kind === 'logic' && !vt.scalar && (value.k === 'sig' || value.k === 'slice' || value.k === 'cat' || (value.k === 'c' && value.strText !== undefined)))
      return [vhdlTypeName(vt, value), 'std_logic'];
    return null;
  }
  const expected = vhdlTypeName(tt);
  if (vt.kind === 'logic' && vt.scalar && (value.k === 'sig' || value.k === 'bit')) return ['std_logic', expected];
  if (vt.kind === 'int' && (value.k === 'sig' || (value.k === 'c' && !value.fillBit))) return ['integer', expected];
  if (target.k === 'sig' && value.k === 'sig' && vt.kind === 'logic' && !vt.scalar && vhdlTypeName(vt) !== expected) return [vhdlTypeName(vt), expected];
  return null;
}

// ------------------------------------------------------------------------- case coverage
function caseComplete(n) {
  const t = n.sel.t;
  if (!t) return false;
  const vals = new Set();
  for (const it of n.items) for (const c of it.choices) {
    if (c.range || !isC(c)) return false;
    if (c.val.x) return false;   // x / z / ? choices (casez / casex): not counted
    vals.add(V.toBig(c.val).toString());
  }
  if (t.kind === 'enum') return vals.size >= t.names.length;
  if (t.kind === 'bool') return vals.size >= 2;
  if (t.kind === 'logic' && t.w <= 16) return vals.size >= 2 ** t.w;
  return false;
}

// ------------------------------------------------------------------------- main
export function designChecks(lib, design, { lint = true, rules = true } = {}) {
  if (!design || !design.top) return [];
  if ([...(lib?.errors || []), ...(design.diags || [])].some(d => d.severity === 'error')) return [];
  const parsed = lib?.parsed || [];
  const texts = new Map(parsed.map(p => [p.file, p.text]));
  const roles = new Map(parsed.map(p => [p.file, p.role]));
  const out = [];
  const seen = new Set();
  const add = (check, severity, file, line, message, tool = 'Lint', col = 1) => {
    if (!file || String(file).startsWith('<')) return;
    const key = `${file}:${line}:${message}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (suppressed(texts.get(file), line, check)) return;
    out.push({ file, line: line || 1, col: col || 1, severity, message, tool, check, source: 'lint' });
  };

  // instances
  const insts = [];
  const visit = (i) => { insts.push(i); for (const c of i.children || []) visit(c); };
  visit(design.top);
  const isPrim = i => !i.procs || !i.mod || String(i.mod.file || '').startsWith('<silinx>/') || i.blackbox;
  const isSimInst = i => roles.get(i.mod?.file) === 'sim' || roles.get(i.file) === 'sim';
  const sub = new Map();   // inst -> Set of the instances below it (itself included)
  const subtree = (i) => {
    if (sub.has(i)) return sub.get(i);
    const s = new Set([i]);
    for (const c of i.children || []) for (const x of subtree(c)) s.add(x);
    sub.set(i, s);
    return s;
  };

  const procs = design.procs.filter(p => p.inst);
  const pinfo = new Map();
  for (const p of procs) {
    const synth = p.kind === 'process' ? ['comb', 'sens', 'wait-first', 'loop'].includes(p.mode) : p.kind === 'assign';
    let ck = { clocks: new Set(), resets: new Set() };
    if (p.kind === 'process' || p.kind === 'assign') { try { ck = clocksOf(p); } catch { /* keep none */ } }
    const sim = isSimInst(p.inst);
    const clocked = ck.clocks.size > 0;
    // a process without sensitivity list and without a clock edge is testbench code
    const logic = !sim && synth && !(p.kind === 'process' && p.mode === 'loop' && !clocked) && p.mode !== 'initial';
    pinfo.set(p, { ...ck, clocked, sim, logic, comb: logic && !clocked });
  }
  const fileOf = p => p.file || p.inst?.file;
  const lineOfStmt = (p, pred) => {
    let line = null;
    eachStmt(p.body, (s) => { if (line == null && pred(s)) line = s.loc?.line ?? null; });
    return line ?? p.loc?.line ?? 1;
  };
  // reads of a statement; `q <= d when g = '1';` is bound with the target as its last else (the
  // value it keeps): that is not a read written by the user
  const holdless = (v, t, r) => {
    if (v && v.k === 'cond') { for (const x of readsOf(v.c)) r.add(x); holdless(v.a, t, r); holdless(v.b, t, r); return r; }
    if (v && v.k === 'sig' && v.sig === t) return r;
    for (const x of readsOf(v)) r.add(x);
    return r;
  };
  const readsStmt = (s) => {
    const r = new Set();
    for (const e of exprsOf(s)) {
      if (s.k === 'asg' && e === s.value) holdless(e, rootSig(s.target), r);
      else for (const x of readsOf(e)) r.add(x);
    }
    return r;
  };
  const readsProc = (p) => { const r = new Set(); eachStmt(p.body, s => { for (const x of readsStmt(s)) r.add(x); }); return r; };

  // readers / writers of every signal
  const readers = new Map(), writers = new Map();
  const push = (m, k, v) => { let a = m.get(k); if (!a) m.set(k, a = []); if (!a.includes(v)) a.push(v); };
  for (const p of procs) {
    for (const s of p.reads || []) push(readers, s, p);
    for (const t of p.triggers || []) if (t.edge !== 'any' || p.kind === 'native') push(readers, t.sig, p);
    for (const s of p.writes || []) push(writers, s, p);
  }

  // ===================================================================== rules (errors)
  if (rules) {
    // VHDL use clauses
    const files = new Set(insts.filter(i => !isPrim(i)).flatMap(i => [i.file, i.mod?.file]).filter(Boolean));
    for (const p of parsed) {
      if (p.lang !== 'vhdl' && !/\.vhdl?$/i.test(p.file || '')) continue;
      if (!files.has(p.file) || !p.text) continue;
      for (const m of libraryChecks(p.file, p.text)) add('missing-library', 'error', m.file, m.line, `<${m.name}> is not declared.`, 'HDLCompiler:69', m.col);
    }
    for (const i of insts) {
      if (isPrim(i)) continue;
      const own = i.procs.filter(p => p.kind === 'process' || p.kind === 'assign');
      if (i.lang === 'vhdl') {
        for (const port of i.ports) {
          if (port.dir === 'in') {
            for (const p of own) if (p.writes.has(port.sig)) {
              add('mode-in', 'error', fileOf(p), lineOfStmt(p, s => s.k === 'asg' && targetBits(s.target).some(x => x.sig === port.sig)), `Object <${port.name}> of mode IN can not be updated.`, 'HDLCompiler');
            }
          } else if (port.dir === 'out') {
            for (const p of own) if (p.reads.has(port.sig) && readsProc(p).has(port.sig)) {
              add('mode-out', 'error', fileOf(p), lineOfStmt(p, s => readsStmt(s).has(port.sig)), `Object <${port.name}> of mode OUT can not be read.`, 'HDLCompiler');
            }
          }
        }
        for (const p of own) eachStmt(p.body, (s) => {
          if (s.k !== 'asg') return;
          const e = vhdlTypeError(s.target, s.value);
          if (!e) return;
          const near = s.value.k === 'sig' ? short(s.value.sig) : s.value.k === 'c' && s.value.strText !== undefined ? `"${s.value.strText}"` : (rootSig(s.value) ? short(rootSig(s.value)) : (rootSig(s.target) ? short(rootSig(s.target)) : '?'));
          add('type-mismatch', 'error', fileOf(p), s.loc?.line ?? p.loc?.line, `Type error near ${near} ; current type ${e[0]}; expected type ${e[1]}`, 'HDLCompiler');
        });
      } else if (i.lang === 'verilog') {
        const portNet = new Map();
        for (const port of i.ports) {
          const ast = (i.mod.ports || []).find(x => x.name === port.name);
          portNet.set(port.sig, ast?.type?.kind === 'integer' ? 'reg' : (ast?.net || 'wire'));
        }
        const netOf = (sig) => (portNet.has(sig) ? portNet.get(sig) : sig.kind === 'var' ? 'reg' : sig.net === 'reg' ? 'reg' : sig.kind === 'signal' ? 'wire' : null);
        const sv = /\.sv$/i.test(i.file || '');
        for (const p of own) {
          if (p.kind === 'process') {
            eachStmt(p.body, (s) => {
              if (s.k !== 'asg') return;
              for (const { sig } of targetBits(s.target)) if (netOf(sig) === 'wire' && (sig.inst === i || portNet.has(sig)))
                add('wire-procedural', 'error', fileOf(p), s.loc?.line ?? p.loc?.line, `Procedural assignment to a non-register <${short(sig)}> is not permitted, left-hand side should be reg/integer/time/genvar`, 'HDLCompiler');
            });
          } else if (!sv) {
            for (const { sig } of targetBits(p.body.target)) if (netOf(sig) === 'reg')
              add('reg-continuous', 'error', fileOf(p), p.loc?.line, `Target <${short(sig)}> of concurrent assignment or output port connection should be a net type.`, 'HDLCompiler');
          }
        }
      }
    }
  }
  if (!lint) return out;

  const dInsts = insts.filter(i => !isPrim(i) && !isSimInst(i));
  const logicProcs = procs.filter(p => pinfo.get(p).logic);

  // ===================================================================== latches / case without default
  const latchSigs = new Map();   // proc -> Set of latched signals
  for (const p of logicProcs) {
    const inf = pinfo.get(p);
    // VHDL: a case on a std_logic(_vector) without others is incomplete (VHDL needs it)
    if (p.kind === 'process') eachStmt(p.body, (s) => {
      if (s.k !== 'case' || s.def) return;
      const vhdlLogic = p.lang === 'vhdl' && s.sel.t?.kind === 'logic';
      if ((inf.comb && !caseComplete(s)) || vhdlLogic)
        add('case-default', 'warning', fileOf(p), s.loc?.line ?? p.loc?.line, p.lang === 'vhdl' ? `Case statement without 'when others' choice` : `Case statement without 'default' in a combinational always block`);
    });
    if (!inf.comb) continue;
    const latched = new Set();
    const report = (sig, stmt) => {
      if (latched.has(sig)) return;
      latched.add(sig);
      add('latch', 'warning', fileOf(p), stmt?.loc?.line ?? p.loc?.line, `Found ${sig.t?.w || 1}-bit latch for signal <${short(sig)}>. Latches may be generated from incomplete case or if statements.`, 'Xst:737');
    };
    if (p.kind === 'assign') {
      // q <= d when g = '1' [else q];   assign q = g ? d : q;
      const t = rootSig(p.body.target);
      let v = p.body.value;
      while (t && v && v.k === 'cond') {
        if (rootSig(v.a) === t && v.a.k === 'sig' || rootSig(v.b) === t && v.b.k === 'sig') { report(t, p.body); break; }
        v = v.b;
      }
    } else {
      const inter = sets => new Set([...sets[0]].filter(x => sets.every(st => st.has(x))));
      const branchFlow = (stmt, branches, done) => {
        const after = branches.map(b => flow(b, new Set(done)));
        const definite = inter(after);
        for (const a of after) for (const x of a) if (!definite.has(x) && !done.has(x)) report(x, stmt);
        return definite;
      };
      const flow = (n, done) => {
        if (!n || typeof n !== 'object') return done;
        if (Array.isArray(n)) { for (const x of n) done = flow(x, done); return done; }
        switch (n.k) {
          case 'blk': return flow(n.stmts, done);
          case 'asg': for (const { sig } of targetBits(n.target)) done.add(sig); return done;
          case 'if': return branchFlow(n, [n.then, n.else], done);
          case 'case': return branchFlow(n, [...n.items.map(it => it.body), ...(n.def ? [n.def] : caseComplete(n) ? [] : [null])], done);
          case 'for': case 'forrange': case 'while': case 'repeat': case 'forever': return flow(n.body, done);
          case 'event': case 'delay': return flow(n.stmt, done);
          default: return done;
        }
      };
      flow(p.body, new Set());
    }
    if (latched.size) latchSigs.set(p, latched);
  }

  // ===================================================================== sensitivity lists
  for (const p of logicProcs) {
    if (p.kind !== 'process' || !Array.isArray(p.sens)) continue;
    const inf = pinfo.get(p);
    const listed = new Set((p.triggers || []).map(t => t.sig));
    if (p.lang === 'verilog') {
      if ((p.triggers || []).some(t => t.edge !== 'any')) continue;
      const missing = [...p.reads].filter(s => !listed.has(s));
      if (missing.length) add('sensitivity', 'warning', fileOf(p), p.loc?.line, `One or more signals are missing in the sensitivity list of always block. The missing signals are: ${missing.map(s => `<${short(s)}>`).join(' ')}`, 'Xst:905');
      continue;
    }
    // VHDL: what is read outside the clock-edge branch must be in the list
    const firstRead = new Map();
    const walk = (s) => {
      if (!s || typeof s !== 'object') return;
      if (Array.isArray(s)) { s.forEach(walk); return; }
      if (s.k === 'blk') { walk(s.stmts); return; }
      if (s.k === 'if' && inf.clocked && hasEdgeOf(s.c)) { walk(s.else); return; }
      if (STMT_KINDS.has(s.k)) for (const e of exprsOf(s)) for (const x of readsOf(e)) if (!firstRead.has(x)) firstRead.set(x, s.loc?.line);
      for (const key of ['then', 'else', 'body', 'stmt', 'def', 'init', 'step']) if (s[key]) walk(s[key]);
      if (s.k === 'case') s.items.forEach(it => walk(it.body));
    };
    walk(p.body);
    for (const [sig, line] of firstRead) if (!listed.has(sig))
      add('sensitivity', 'warning', fileOf(p), line ?? p.loc?.line, `${short(sig)} should be on the sensitivity list of the process`, 'HDLCompiler:92');
  }

  // ===================================================================== multiple drivers
  {
    const drivers = new Map();   // sig -> [{ proc, bits, line }]
    const inoutSigs = new Set(insts.flatMap(i => (i.ports || []).filter(pt => pt.dir === 'inout').map(pt => pt.sig)));
    const tristate = new Set();
    for (const p of procs) {
      const inf = pinfo.get(p);
      if (inf.sim || p.kind === 'native' || p.mode === 'initial' || (p.kind === 'process' && p.mode === 'loop' && !inf.clocked)) continue;
      const per = new Map();
      eachStmt(p.body, (s) => {
        if (s.k !== 'asg') return;
        if (contains(s.value, x => isC(x) && (x.val.x & x.val.v) !== 0n)) for (const tb of targetBits(s.target)) tristate.add(tb.sig);
        for (const tb of targetBits(s.target)) {
          if (!per.has(tb.sig)) per.set(tb.sig, { bits: tb.bits ? new Set(tb.bits) : null, line: s.loc?.line ?? p.loc?.line });
          else { const cur = per.get(tb.sig); if (cur.bits && tb.bits) for (const b of tb.bits) cur.bits.add(b); else cur.bits = null; }
        }
      });
      for (const [sig, d] of per) push(drivers, sig, { proc: p, ...d });
    }
    for (const [sig, ds] of drivers) {
      // (memories written from two clocked processes are dual-port RAMs)
      if (ds.length < 2 || tristate.has(sig) || inoutSigs.has(sig) || sig.wired || sig.t?.kind === 'array') continue;
      let clash = null;
      for (let a = 0; a < ds.length && !clash; a++) for (let b = a + 1; b < ds.length && !clash; b++) if (overlap(ds[a].bits, ds[b].bits)) clash = [ds[a], ds[b]];
      if (!clash) continue;
      const [d1, d2] = clash;
      const unit = sig.inst?.module || d2.proc.inst.module;
      const lines = fileOf(d1.proc) === fileOf(d2.proc) ? `lines ${d1.line} and ${d2.line}` : `${fileOf(d1.proc)} line ${d1.line} and ${fileOf(d2.proc)} line ${d2.line}`;
      add('multi-driver', 'warning', fileOf(d2.proc), d2.line, `Signal <${short(sig)}> in unit <${unit}> is connected to multiple drivers (${lines}).`, 'HDLCompiler:1401');
    }
  }

  // ===================================================================== combinational loops
  {
    const edges = new Map();   // node -> [{ to, file, line, module }]
    const key = (sig, b) => `${sig.id}:${b}`;
    const bitsList = (sig, bits) => (bits ? [...bits] : sig.t?.kind === 'array' ? ['*'] : Array.from({ length: Math.min(sig.t?.w || 1, 256) }, (_, k) => k));
    const names = new Map();
    for (const p of procs) {
      const inf = pinfo.get(p);
      if (inf.sim || inf.clocked || p.kind === 'native') continue;
      if (!(inf.comb || p.kind === 'glue')) continue;
      const blockingWrites = p.lang === 'verilog' && p.kind === 'process' ? new Set([...p.writes]) : new Set();
      eachStmt(p.body, (s, conds) => {
        if (s.k !== 'asg') return;
        const src = new Map();
        readBits([s.value, ...conds, ...targetIndexExprs(s.target)], src);
        for (const tb of targetBits(s.target)) {
          const hold = s.value?.k === 'cond' && [s.value.a, s.value.b].some(x => x?.k === 'sig' && x.sig === tb.sig);
          for (const [rs, rb] of src) {
            if (blockingWrites.has(rs)) continue;    // Verilog: a variable assigned in the same block
            if (rs === tb.sig && (hold || !sameBits(rb, tb.bits))) continue;
            if (rs === tb.sig && latchSigs.get(p)?.has(rs)) continue;
            const tl = bitsList(tb.sig, tb.bits), sl = bitsList(rs, rb);
            const pairs = rs === tb.sig ? tl.map(b => [b, b]) : sl.flatMap(a => tl.map(b => [a, b]));
            for (const [a, b] of pairs) {
              const from = key(rs, a), to = key(tb.sig, b);
              names.set(from, rs); names.set(to, tb.sig);
              push(edges, from, { to, file: fileOf(p), line: s.loc?.line ?? p.loc?.line, module: p.inst.module });
            }
          }
        }
      });
    }
    // Tarjan's strongly connected components (iterative)
    let idx = 0;
    const index = new Map(), low = new Map(), onStack = new Set(), stack = [];
    const sccs = [];
    for (const start of edges.keys()) {
      if (index.has(start)) continue;
      const work = [[start, 0]];
      index.set(start, idx); low.set(start, idx); idx++; stack.push(start); onStack.add(start);
      while (work.length) {
        const top = work[work.length - 1];
        const [v, i] = top;
        const es = edges.get(v) || [];
        if (i < es.length) {
          top[1]++;
          const w = es[i].to;
          if (!index.has(w)) { index.set(w, idx); low.set(w, idx); idx++; stack.push(w); onStack.add(w); work.push([w, 0]); }
          else if (onStack.has(w)) low.set(v, Math.min(low.get(v), index.get(w)));
        } else {
          work.pop();
          if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(low.get(u), low.get(v))); }
          if (low.get(v) === index.get(v)) {
            const comp = [];
            let w;
            do { w = stack.pop(); onStack.delete(w); comp.push(w); } while (w !== v);
            if (comp.length > 1 || (edges.get(v) || []).some(e => e.to === v)) sccs.push(comp);
          }
        }
      }
    }
    const reported = new Set();
    for (const comp of sccs) {
      const inComp = new Set(comp);
      const sigs = [...new Set(comp.map(n => names.get(n)))];
      const id = sigs.map(s => s.id).sort().join(',');
      if (reported.has(id)) continue;
      reported.add(id);
      let at = null;
      for (const n of comp) for (const e of edges.get(n) || []) if (inComp.has(e.to) && (!at || (at.file === e.file ? e.line < at.line : false))) at = e;
      if (at) add('comb-loop', 'warning', at.file, at.line, `Unit <${at.module}> : the following signal(s) form a combinatorial loop: ${sigs.map(s => `<${short(s)}>`).join(', ')}.`, 'Xst:2170');
    }
  }

  // ===================================================================== unused / unassigned
  const anyIn = (list, inst) => { const st = subtree(inst); return (list || []).some(x => st.has(x.inst)); };
  for (const i of dInsts) {
    // an empty architecture / module, or a skeleton still marked TODO (New Source, Module Wizard):
    // its ports are not reported as unused yet
    const empty = !(i.mod.items || []).length || /\bTODO\b/.test(texts.get(i.file) || '');
    for (const port of i.ports) {
      if (empty) break;
      const ast = (i.mod.ports || []).find(x => x.name === port.name);
      const file = i.mod.file || i.file, line = ast?.loc?.line ?? i.mod.loc?.line;
      if (port.dir === 'in' && !anyIn(readers.get(port.sig), i))
        add('unused-input', 'warning', file, line, `Input <${port.name}> is never used.`, 'Xst:647');
      if (port.dir === 'out' && !anyIn(writers.get(port.sig), i))
        add('unassigned-output', 'warning', file, line, `Signal <${port.name}>, unconnected in block <${i.module}>, is tied to its initial value.`, 'Xst:2935');
    }
    for (const s of i.signals) {
      if (s.kind !== 'signal' || !s.loc) continue;
      const r = anyIn(readers.get(s), i), w = anyIn(writers.get(s), i);
      const readAnywhere = (readers.get(s) || []).length > 0;
      if (w && !r && !readAnywhere)
        add('unused-signal', 'warning', s.file || i.file, s.loc.line, `Signal <${short(s)}> is assigned but never used. This unconnected signal will be trimmed during the optimization process.`, 'Xst:646');
      if (r && !w && !s.hasInit && !(writers.get(s) || []).length)
        add('unassigned-signal', 'warning', s.file || i.file, s.loc.line, `Signal <${short(s)}> is used but never assigned. This sourceless signal will be automatically connected to value GND.`, 'Xst:653');
    }
  }

  // ===================================================================== clocks
  {
    const clockUsers = new Map();   // clock sig -> [proc]
    for (const p of logicProcs) for (const c of pinfo.get(p).clocks) push(clockUsers, c, p);
    // where a clock comes from: a primary input, a clock primitive or a port connection is fine
    const logicSource = (sig, depth = 0) => {
      if (depth > 8) return null;
      for (const w of writers.get(sig) || []) {
        const inf = pinfo.get(w);
        if (!inf || inf.sim || w.kind === 'native') continue;
        if (w.kind === 'glue') {
          const v = w.body?.value;
          if (v && v.k === 'sig') { const r = logicSource(v.sig, depth + 1); if (r) return r; continue; }
          if (v && v.k === 'c') continue;
          return w;
        }
        return w;
      }
      return null;
    };
    for (const [c, users] of clockUsers) {
      const src = logicSource(c);
      if (!src) continue;
      const srcLine = lineOfStmt(src, s => s.k === 'asg' && targetBits(s.target).some(x => x.sig === c));
      for (const p of users)
        add('data-as-clock', 'warning', fileOf(p), p.loc?.line, `Signal <${short(c)}> is used as a clock but it is generated by logic (${fileOf(src) === fileOf(p) ? '' : `${fileOf(src)} `}line ${srcLine}), not by a clock input.`);
    }
    const clocks = new Set(clockUsers.keys());
    for (const p of logicProcs) {
      eachStmt(p.body, (s) => {
        for (const e of exprsOf(s)) {
          if (hasEdgeOf(e)) continue;
          for (const x of readsOf(e)) if (clocks.has(x) && !p.writes.has(x))   // (a divider toggling its own output: data-as-clock)
            add('clock-as-data', 'warning', fileOf(p), s.loc?.line ?? p.loc?.line, `Clock signal <${short(x)}> is used as data (in logic), not only as a clock edge.`);
        }
      });
    }
  }

  // ===================================================================== Verilog = / <=
  for (const p of logicProcs) {
    if (p.lang !== 'verilog' || p.kind !== 'process') continue;
    const inf = pinfo.get(p);
    const edged = Array.isArray(p.sens) && (p.triggers || []).some(t => t.edge !== 'any');
    const comb = p.sens === 'all' || (Array.isArray(p.sens) && !edged);
    if (!edged && !comb) continue;
    const done = new Set();
    eachStmt(p.body, (s) => {
      if (s.k !== 'asg') return;
      for (const { sig } of targetBits(s.target)) {
        if (done.has(sig) || sig.t?.kind === 'int') continue;
        if (edged && inf.clocked && !s.nb) { done.add(sig); add('blocking', 'warning', fileOf(p), s.loc?.line ?? p.loc?.line, `Blocking assignment (=) to <${short(sig)}> in a clocked always block; use a non-blocking assignment (<=).`); }
        else if (comb && s.nb) { done.add(sig); add('nonblocking', 'warning', fileOf(p), s.loc?.line ?? p.loc?.line, `Non-blocking assignment (<=) to <${short(sig)}> in a combinational always block; use a blocking assignment (=).`); }
      }
    });
  }

  // ===================================================================== integers without a range (info)
  const wide = t => t && t.kind === 'int' && (t.rlo === undefined || t.rhi === undefined || t.rhi >= 2147483647 || t.rlo <= -2147483648);
  for (const i of dInsts) {
    if (i.lang !== 'vhdl') continue;
    for (const s of i.signals) if ((s.kind === 'signal' || s.kind === 'port') && wide(s.t) && s.loc)
      add('integer-range', 'info', s.file || i.file, s.loc.line, `Signal <${short(s)}> is an integer without a range: synthesis makes it 32 bits wide.`);
    for (const p of i.procs) for (const d of p.item?.decls || []) {
      const r = d.type?.range;
      if (d.kind === 'signal' && d.type?.kind === 'integer' && (!r || (r.right?.op === 'int' && r.right.value === '2147483647' && d.type?.name !== 'natural')))
        if (!r) add('integer-range', 'info', p.file || i.file, d.loc?.line ?? p.loc?.line, `Variable <${d.name}> is an integer without a range: synthesis makes it 32 bits wide.`);
    }
  }
  return out;
}
