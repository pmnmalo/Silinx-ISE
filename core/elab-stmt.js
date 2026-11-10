// Silinx elaboration - statements (#405: out of core/elaborate.js): sequential statements bound (assignments, if,
// case, loops, waits, calls of procedures and tasks, their triggers), VHDL's delay mechanisms and dynamic ranges.
import { SimError, bitpos } from './interp.js';
import { TEXTIO_PROCS, bindExpr, bindTextio, boundFunction, hierResolve, notDeclared, pickOverload } from './elab-expr.js';
import * as V from './values.js';
import {
  ElabError, INT, STR, Scope, bindDecl, bindLvalue, checkAssignable, containsKind, ctxSize, diag, evalRange, fitVal,
  lroot, rangeCheck, readsOf, triggersOfReads, walk
} from './elaborate.js';

// ---------------------------------------------------------------- statements
export function bindBlock(E, stmts, loc) {
  return { k: 'blk', stmts: stmts.map(s => bindStmt(E, s, loc)).filter(Boolean), loc };
}

function bindStmt(E, s, ploc) {
  const loc = s.loc || ploc;
  try {
    return bindStmt0(E, s, loc);
  } catch (e) {
    if (!(e instanceof ElabError) && !(e instanceof SimError)) throw e;
    if (e.hier && E.deferred && !E.deferred.done && !E.inFunction) throw e;   // (the whole item is elaborated again later)
    diag(E, e.message, e.loc || loc);
    return { k: 'null', loc };
  }
}

function bindStmt0(E, s, loc) {
  switch (s.kind) {
    case 'block': {
      const sc = new Scope(E.sc);
      const BE = { ...E, sc };
      // a named block is a scope: blk.x names its variable x from outside it (Verilog)
      if (s.label && E.lang === 'verilog') E.sc.def(s.label, { kind: 'gen', sc });
      // (its variables are static: other processes and instances read them by their hierarchical
      // name, dut.blk.x, from the process's frame; #12)
      const path = s.label && E.lang === 'verilog' && E.procRef && E.blockPath ? [...E.blockPath, s.label] : null;
      if (path) BE.blockPath = path;
      for (const d of s.decls || []) {
        if (d.kind === 'signal') d.net = 'variable';
        bindDecl(BE, d);
        const ent = path && d.kind === 'signal' ? sc.local(d.name) : null;
        if (ent?.kind === 'loc' && E.inst) (E.inst.blockVars ??= new Map()).set(`${E.prefix}${path.join('.')}.${d.name}`, { ref: E.procRef, i: ent.i, t: ent.t });
      }
      return { k: 'blk', stmts: s.stmts.map(x => bindStmt(BE, x, loc)).filter(Boolean), loc, ...(s.label ? { label: s.label } : {}) };
    }
    case 'fork': {   // Verilog fork: each statement runs as a child thread of the process
      if (!E.fb) throw new ElabError('fork is only allowed in initial / always blocks and tasks', loc);
      const sc = new Scope(E.sc);
      const BE = { ...E, sc };
      for (const d of s.decls || []) bindDecl(BE, d);
      return { k: 'fork', branches: s.stmts.map(x => bindStmt(BE, x, loc)).filter(Boolean), join: s.join || 'all', loc };
    }
    case 'waitfork': return { k: 'waitfork', loc };
    case 'disablefork': return { k: 'disablefork', loc };
    case 'assign': {
      const target = bindLvalue(E, s.target, loc);
      // (others => v) into a slice of run-time bounds: v into each of its elements (#11)
      const fill = target.k === 'daslice' && s.value.op === 'aggregate' && s.value.items.length === 1
        && s.value.items[0].choices?.length === 1 && s.value.items[0].choices[0] === 'others';
      const value = fill ? { k: 'afill', a: bindExpr(E, s.value.items[0].value, target.t.elem, loc), t: target.t } : bindExpr(E, s.value, target.t, loc);
      if (E.lang === 'verilog') ctxSize(value, target.t.w);
      checkAssignable(E, target, value, loc);
      const root = lroot(target.k === 'cat' ? target.parts[0] : target);
      if (E.lang === 'vhdl' && s.nonblocking && root.k === 'loc' && !E.inFunction) diag(E, `'${root.name}' is a variable: use ':='`, loc, 'warning');
      if (E.inFunction && !E.inTask && root.k === 'sig' && !s.nonblocking) diag(E, `function assigns signal '${root.name}'`, loc, 'warning');
      const asg = {
        k: 'asg', target, value, nb: !!s.nonblocking && root.k !== 'loc',
        delay: s.delay ? bindExpr(E, s.delay, null, loc) : null, delayUnit: E.lang === 'vhdl' ? 1 : E.timeUnit, prec: E.timePrec, loc,
      };
      if (E.lang === 'vhdl' && asg.nb) Object.assign(asg, vhdlMech(E, s));
      if (E.lang === 'vhdl') rangeCheck(asg);
      // Verilog `a = #d b;`: the process waits d, then assigns the value sampled before the wait
      if (E.lang === 'verilog' && !asg.nb && asg.delay) asg.intra = true;
      return asg;
    }
    case 'if': return { k: 'if', c: vsize(E, bindExpr(E, s.cond, null, loc)), then: bindStmt(E, s.then, loc), else: s.else ? bindStmt(E, s.else, loc) : null, loc };
    case 'case': {
      const sel = bindExpr(E, s.expr, null, loc);
      const items = s.items.map(it => ({
        choices: it.choices.map(ch => {
          if (ch.range) {
            const r = ch.range;
            if (r.of) { const er = evalRange(E, r); return { range: { lo: cI(er.left), hi: cI(er.right) } }; }
            return { range: { lo: bindExpr(E, r.left, null, loc), hi: bindExpr(E, r.right, null, loc) } };
          }
          const c = bindExpr(E, ch, sel.t, loc);
          return c;
        }),
        body: bindStmt(E, it.body, loc),
      }));
      if (E.lang === 'verilog') {
        // the case expression and the items are sized with each other, signed only when all are
        // (IEEE 1364-2005 9.5)
        const choices = items.flatMap(it => it.choices.filter(c => !c.range));
        const m = Math.max(sel.t.w, ...choices.map(c => c.t.w));
        const ss = !!sel.t.s && choices.every(c => c.t.s);
        ctxSize(sel, m, ss);
        for (const c of choices) ctxSize(c, m, ss);
        return { k: 'case', sel, items, def: s.default ? bindStmt(E, s.default, loc) : null, variant: s.variant || 'case', loc, cw: m, ss };
      }
      return { k: 'case', sel, items, def: s.default ? bindStmt(E, s.default, loc) : null, variant: s.variant || 'case', loc };
    }
    case 'for': return {
      k: 'for', init: bindStmt(E, s.init, loc), cond: vsize(E, bindExpr(E, s.cond, null, loc)), step: bindStmt(E, s.step, loc),
      body: bindStmt(E, s.body, loc), loc,
    };
    case 'forrange': {
      const r = evalRangeDyn(E, s.range, loc);
      const sc = new Scope(E.sc);
      if (!E.fb) throw new ElabError('loop outside of a process', loc);
      const init = r.from.k === 'c' ? fitVal(r.from.val, INT) : V.fromInt(0);
      const i = E.fb.alloc(INT, init);
      sc.def(s.var, { kind: 'loc', i, t: INT, lvl: E.fb.level });
      const LE = { ...E, sc };
      return { k: 'forrange', var: i, varT: INT, from: r.from, to: r.to, down: r.down, body: bindStmt(LE, s.body, loc), loc, label: s.label };
    }
    case 'while': return { k: 'while', cond: vsize(E, bindExpr(E, s.cond, null, loc)), body: bindStmt(E, s.body, loc), loc, label: s.label };
    case 'repeat': return { k: 'repeat', count: vsize(E, bindExpr(E, s.count, null, loc)), body: bindStmt(E, s.body, loc), loc };
    case 'forever': {
      const body = bindStmt(E, s.body, loc);
      // (a VHDL `loop` may iterate without waiting: it ends with exit; only the iteration count is limited)
      return { k: 'forever', body, hasWait: E.lang === 'vhdl' || containsKind(body, ['delay', 'event', 'wait', 'task', 'fork', 'waitfork']), loc, label: s.label };
    }
    case 'exit': case 'next': return { k: s.kind, c: s.cond ? bindExpr(E, s.cond, null, loc) : null, loc, label: s.label };
    // the return type is the expected type of aggregates and of character / enumeration literals
    case 'return': return { k: 'ret', value: s.value ? bindExpr(E, s.value, E.retT && !E.retT.unconstrained && (s.value.op === 'aggregate' || E.retT.char || E.retT.kind === 'enum') ? E.retT : null, loc) : null, loc };
    case 'null': return { k: 'null', loc };
    case 'delay': return { k: 'delay', amount: bindExpr(E, s.amount, null, loc), unit: E.timeUnit, prec: E.timePrec, stmt: s.stmt ? bindStmt(E, s.stmt, loc) : null, loc };
    case 'disable': return { k: 'disable', label: s.label, loc };
    case 'event': {
      const stmt = s.stmt ? bindStmt(E, s.stmt, loc) : null;
      const triggers = s.events === 'all' ? triggersOfReads(stmt) : s.events.flatMap(ev => bindTrigger(E, ev.expr, ev.edge, loc));
      return { k: 'event', triggers, stmt, loc };
    }
    case 'wait': {
      const until = s.until ? vsize(E, bindExpr(E, s.until, null, loc)) : null;
      let triggers = [];
      if (s.on) triggers = s.on.flatMap(x => bindTrigger(E, x, 'any', loc));
      else if (until) triggers = triggersOfReads(until);
      if (until && !s.on && !triggers.length && !s.for) diag(E, 'wait until condition does not depend on any signal', loc, 'warning');
      return { k: 'wait', until, triggers, forT: s.for ? bindExpr(E, s.for, null, loc) : null, level: !!s.level, loc };
    }
    case 'call': return bindCallStmt(E, s, loc);
    case 'report': return { k: 'report', msg: bindExpr(E, s.message, null, loc), sev: s.severity || 'note', loc };
    case 'assert': return {
      k: 'assert', c: bindExpr(E, s.cond, null, loc), msg: s.message ? bindExpr(E, s.message, null, loc) : null,
      sev: s.severity || 'error', loc, ...(s.form === 'assume' ? { form: 'assume' } : {}), ...(s.quiet ? { quiet: true } : {}),
    };
  }
  throw new ElabError(`unsupported statement '${s.kind}'`, loc);
}

export const cI = n => ({ k: 'c', val: V.fromInt(n), t: INT });
// Verilog: a self-determined expression (condition, count) is sized with its own width
const vsize = (E, n) => { if (E.lang === 'verilog') ctxSize(n, n.t.w); return n; };

// VHDL signal assignment: driver semantics (inertial / transport / reject, waveform elements).
export function vhdlMech(E, s) {
  const m = { vh: true, mech: s.mech === 'transport' ? 'transport' : 'inertial' };
  if (s.mech && s.mech.reject) m.reject = bindExpr(E, s.mech.reject, null, s.loc);
  if (s.waveCont) m.cont = true;
  return m;
}

function evalRangeDyn(E, r, loc) {
  if (r.of) {
    const er = evalRange(E, r);
    return { from: cI(er.left), to: cI(er.right), down: er.desc };
  }
  const from = bindExpr(E, r.left, null, loc), to = bindExpr(E, r.right, null, loc);
  let down = r.dir === 'downto';
  if (!r.dir && from.k === 'c' && to.k === 'c') down = V.toNum(from.val) > V.toNum(to.val);
  return { from, to, down };
}

// True if a Verilog name (dotted or not) starts with a scope: the module itself or a module above
// it, an instance in this module, or a named / generate block of it ($dumpvars arguments)
function isScopeName(E, name) {
  const first = String(name).split('.')[0].replace(/\[.*\]$/, '');
  for (let i = E.inst; i; i = i.parent) if (i.module === first || i.name === first) return true;
  if (E.sc.lookup(first)?.kind === 'gen' || E.sc.lookup(first)?.kind === 'genarr') return true;
  const insts = new Set();
  const visit = items => { for (const it of items || []) { if (it.kind === 'instance') insts.add(it.name); visit(it.items); visit(it.then); visit(it.else); } };
  visit(E.inst?.mod?.items);
  return insts.has(first);
}

function bindCallStmt(E, s, loc) {
  if (E.lang === 'verilog' && (s.path || s.name.includes('.')) && !E.sc.lookup(s.name)) {
    // a task of another scope: top.t(x), blk.t(x)
    const r = hierResolve(E, s.name, s.path, loc);
    if (r?.entry?.kind === 'func') {
      const alias = `\u0000${s.name}`;
      const sc = new Scope(E.sc);
      sc.def(alias, r.entry);
      return bindCallStmt({ ...E, sc }, { ...s, name: alias, path: null }, loc);
    }
    throw notDeclared(s.name, loc);
  }
  const sub = E.sc.lookup(s.name);
  if (sub?.kind === 'subalias') return bindCallStmt(E, { ...s, name: sub.target }, loc);
  const name = s.name;
  const sysName = name[0] === '$' ? name : (['finish', 'stop'].includes(name.toLowerCase()) ? name.toLowerCase() : null);
  if (sysName && !(name[0] !== '$' && E.sc.lookup(name))) {
    // $dumpvars(levels, tb_top, dut, …): an argument may name a scope (the module, an instance, a
    // named or generate block) rather than a value (#12); the VCD tasks only note it
    const scopeArgs = /^\$(dumpvars|dumpports|printtimescale)$/.test(sysName);
    const args = s.args.map(a => {
      if (a.op === 'str') return { k: 'str', value: a.value, t: STR };
      if (scopeArgs && a.op === 'ref') {
        try { return bindExpr(E, a, null, loc); } catch (e) {
          if (!(e instanceof ElabError) || !isScopeName(E, a.name)) throw e;
          return { k: 'str', value: a.name, t: STR, scope: true };
        }
      }
      return bindExpr(E, a, null, loc);
    });
    if (/^\$(monitor|display[bho]?|write[bho]?|strobe|fdisplay|fwrite|fstrobe|sformat|swrite)$/.test(sysName)) args.forEach(a => { if (a.k !== 'str' && E.lang === 'verilog') ctxSize(a, a.t.w); });
    if ((sysName === '$readmemh' || sysName === '$readmemb') && args[1]) {
      const L = bindLvalue(E, s.args[1], loc);
      return { k: 'sys', name: sysName, args: [args[0], L], loc };
    }
    return { k: 'sys', name: sysName, args, loc };
  }
  let entry = E.sc.lookup(name);
  if (entry && entry.kind === 'func') entry = pickOverload(E, entry, s.args, loc);
  if (!entry || entry.kind !== 'func') {
    if (E.lang === 'vhdl' && TEXTIO_PROCS.has(name)) return bindTextio(E, name, s.args, loc);
    if (E.lang === 'vhdl' && ['file_open', 'file_close'].includes(name)) {
      diag(E, `procedure '${name}' (textio) is not supported`, loc, 'warning');
      return { k: 'null', loc };
    }
    throw new ElabError(`task/procedure '${name}' is not declared`, loc);
  }
  const decl = entry.decl;
  // one actual per formal, in order: named association (f => a) and default values (VHDL)
  const acts = new Array(Math.max(decl.params.length, s.args.length)).fill(null);
  s.args.forEach((a, k) => {
    if (a && a.named !== undefined) {
      const i = decl.params.findIndex(p => p.name === a.named);
      if (i < 0) throw new ElabError(`'${name}' has no parameter '${a.named}'`, loc);
      acts[i] = a.value;
    } else acts[k] = a;
  });
  decl.params.forEach((p, k) => {
    if (!acts[k] && p.default && p.dir !== 'out') acts[k] = p.default;
    if (!acts[k]) throw new ElabError(`missing argument '${p.name}' in call to '${name}'`, loc);
  });
  s = { ...s, args: acts };
  const args = s.args.map((a, k) => {
    const p = decl.params[k];
    if (!p) throw new ElabError(`too many arguments for '${name}'`, loc);
    if (p.dir === 'out') return null;
    return bindExpr(E, a, null, loc);
  });
  // VHDL `signal` parameters refer to the actual signal (assignments inside the procedure drive
  // it at once, across waits), instead of being copied in and out
  const hasLoc = n => { let found = false; walk(n, x => { if (x.k === 'loc') found = true; }); return found; };
  let sigActuals = null;
  if (E.lang === 'vhdl') {
    s.args.forEach((a, k) => {
      const p = decl.params[k];
      if (!p || String(p.class || '').toLowerCase() !== 'signal') return;
      const actual = a;
      const rv = bindExpr(E, actual, null, loc);
      const lv = p.dir !== 'in' ? bindLvalue(E, actual, loc) : null;
      if (hasLoc(rv) || (lv && hasLoc(lv))) return;     // actual uses process variables: copy semantics
      (sigActuals ||= [])[k] = { rv, lv };
    });
  }
  const fn = boundFunction(entry, s.args.map((a, k) => args[k] || bindLvalue(E, a, loc)), loc, sigActuals);
  const outTargets = s.args.map((a, k) => (decl.params[k] && decl.params[k].dir !== 'in' && !sigActuals?.[k] ? bindLvalue(E, a, loc) : null));
  if (sigActuals) args.forEach((_, k) => { if (sigActuals[k]) args[k] = null; });
  const node = { k: 'task', fn, args, outTargets, loc };
  // signals passed to `signal` parameters of mode in / inout are read by the call
  if (sigActuals) node.sigReads = sigActuals.flatMap((a, k) => (a && decl.params[k].dir !== 'out' ? [a.rv] : []));
  return node;
}

export function bindTrigger(E, expr, edge, loc) {
  const n = bindExpr(E, expr, null, loc);
  if (n.k === 'sig') return [{ sig: n.sig, edge, pos: null }];   // pos null: the whole signal
  if (n.k === 'bit' && n.base.k === 'sig' && n.index.k === 'c') return [{ sig: n.base.sig, edge, pos: bitpos(n.base.t, V.toNum(n.index.val)) }];
  const reads = readsOf(n);
  if (edge !== 'any') diag(E, 'edge on a complex expression: treated as any change', loc, 'warning');
  return [...reads].map(sig => ({ sig, edge: 'any', pos: null }));
}
