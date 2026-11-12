// Silinx elaboration - instances (#405: out of core/elaborate.js): a module's instance elaborated (its parameters,
// ports and their connections, items, processes, tasks, children, generate loops and conditions).
import { SimError, strToVal } from './interp.js';
import * as V from './values.js';
import { bindBlock, bindTrigger, vhdlMech } from './elab-stmt.js';
import { bindExpr } from './elab-expr.js';
import { nativePrimitive } from './native.js';
import { actualProblem } from './vhdl/actual.js';
import {
  ElabError, FrameBuilder, INT, STR, Scope, bindDecl, bindLvalue, checkAssignable, collectRW, constOf, ctxSize,
  defaultValue, diag, elabType, evalRange, exprText, findModule, fitAny, fitVal, isConstNode, isLvalueExpr, rangeCheck,
  readsOf, signedOnly, strVec, triggersOfReads, usesScope, vecT, writesOfL
} from './elaborate.js';

// ---------------------------------------------------------------- instances
export function elabInstance(ctx, mod, name, path, paramOverrides, portConns, parentInst, depth) {
  if (depth > ctx.design.maxDepth) throw new ElabError(`instance hierarchy too deep at ${path} (recursive instantiation?)`);
  const inst = {
    name, path, module: mod.name, lang: mod.lang, file: mod.archFile || mod.file, loc: mod.loc,
    params: [], ports: [], signals: [], children: [], procs: [], parent: parentInst, mod,
  };
  const E = {
    ctx, lang: mod.lang, sc: new Scope(usesScope(ctx, mod, mod.lang)), inst,
    file: inst.file, timeUnit: mod.timescale?.unit ?? (mod.lang === 'vhdl' ? 1 : 1000), fb: null, prefix: '', depth,
    timePrec: mod.lang === 'verilog' ? mod.timescale?.precision : undefined,   // delays round to the precision
    slvArith: mod.slvArith,   // VHDL: std_logic_vector arithmetic of std_logic_unsigned / std_logic_signed
    deferred: [],             // items naming a generate block elaborated later (hierResolve), retried at the end
  };
  E.modSc = E.sc;             // the module's scope (hierarchical names that start with the module's name)
  // Verilog: the typedefs the parameters' types may name (bound again with the other declarations,
  // once the parameters are known; one that needs a parameter fails here, silently)
  if (mod.lang === 'verilog' && mod.params.some(p => p.type?.kind === 'named')) {
    const diags = ctx.design.diags, n0 = diags.length;
    for (const d of mod.decls) if (d.kind === 'type') { try { bindDecl(E, d); } catch { /* needs a parameter */ } }
    diags.length = n0;
  }
  // parameters / generics
  for (const p of mod.params) {
    let entry, given = false;   // given: set by the instance (generic map / #(…)), not the default
    E.at = p.loc?.line ? p.loc : undefined;   // (for diagnostics without a location, #16)
    try {
      const ov = paramOverrides.get(p.name) ?? paramOverrides.get(p.name.toLowerCase());
      // (an unconstrained array type: the actual gives the range, as light8080's OBJ_CODE : obj_code_t)
      const ptype = p.type ? elabType(E, p.type, true) : null;
      if (ov && !p.local) {
        given = true;
        entry = { kind: 'const', val: ov.val, t: ov.t };
        // a VHDL boolean generic set from Verilog: "TRUE" / "FALSE", as Xilinx writes boolean attributes
        if (ptype?.kind === 'bool' && /^(true|false)$/i.test(ov.val?.str ?? '')) entry = { kind: 'const', val: V.fromBool(/^true$/i.test(ov.val.str)), t: ptype };
        // an unconstrained generic (INIT : std_logic_vector) takes the actual's width
        else if (ptype && ptype.unconstrained && ov.t && ov.t.kind === ptype.kind) entry = { kind: 'const', val: ov.val, t: { ...ov.t, s: ptype.s } };
        else if (ptype?.signedOnly) { const n = signedOnly({ k: 'c', val: ov.val, t: ov.t }); entry = { kind: 'const', val: constOf(E, n, mod.loc), t: n.t }; }
        else if (ptype && ptype.kind !== 'str') entry = { kind: 'const', val: fitVal(ov.val?.str !== undefined && E.lang === 'verilog' ? strToVal(ov.val.str) : ov.val, ptype), t: ptype };
        else if (ptype && ov.text !== undefined) entry = { kind: 'const', val: { str: ov.text }, t: STR };   // NAME => "u1"
      } else if (p.default) {
        let n = strVec(E, bindExpr(E, p.default, ptype));
        if (ptype?.signedOnly) n = signedOnly(n);
        const val = constOf(E, n, p.loc);
        entry = { kind: 'const', val: ptype && ptype.kind !== 'str' && !ptype.signedOnly ? fitVal(val, ptype) : val, t: ptype && !ptype.signedOnly ? ptype : n.t };
      } else throw new ElabError(`generic '${p.name}' has no value`, mod.loc);
    } catch (e) {
      if (!(e instanceof ElabError)) throw e;
      diag(E, e.message, e.loc || mod.loc);
      entry = { kind: 'const', val: V.fromInt(0), t: INT };
    }
    E.at = undefined;
    E.sc.def(p.name, entry);
    inst.params.push({ name: p.name, value: entry.val, t: entry.t, given });
  }
  // declarations: types & constants first (they may size ports), then ports, then the rest
  // Functions are only registered here (bodies bind at call time), so constants may call them.
  const funcs = mod.decls.filter(d => d.kind === 'function' || d.kind === 'task');
  const early = mod.decls.filter(d => d.kind === 'type' || d.kind === 'const');
  const late = mod.decls.filter(d => !['type', 'const', 'function', 'task'].includes(d.kind));
  for (const d of funcs) safe(E, d.loc, () => bindDecl(E, d));
  for (const d of early) safe(E, d.loc, () => bindDecl(E, d));
  for (const p of mod.ports) safe(E, p.loc, () => elabPort(E, p, portConns.get(p.name)));
  // Silinx's own netlist primitives (core/unisim.js) run as native processes (core/native.js)
  if (String(mod.file || '').startsWith('<silinx>/')) {
    const nat = nativePrimitive(mod.name, inst.params, inst.ports, { gowin: mod.file === '<silinx>/gowin.vhd' });
    if (nat) {
      // (an output connected to a whole Verilog net is that net: it starts at the primitive's
      // INIT, not at the x of a driven net)
      for (const [sig, v] of nat.init) { sig.init = v; sig.val = v; sig.netZ = false; }
      const proc = addProc(E, { name: mod.name.toUpperCase(), kind: 'native', mode: 'native', native: nat.fn, nativeReset: nat.reset, body: { k: 'null' },
        triggers: nat.inputs.map((sig) => ({ sig, edge: 'any' })), lang: 'vhdl', loc: mod.loc, file: inst.file, inst });
      proc.writes = new Set(nat.outputs);
      // it reads every input pin, not only the ones that trigger it (a flip-flop's D, CE, R: sampled
      // at the clock edge): the design checks see them used (no 'Input <d> is never used.')
      proc.reads = new Set([...nat.inputs, ...inst.ports.filter(pt => pt.dir !== 'out').map(pt => pt.sig)].filter(Boolean));
      return inst;
    }
  }
  for (const d of late) safe(E, d.loc, () => bindDecl(E, d));
  // Verilog defparam: overrides for the parameters of instances below this one (path, value)
  E.defparams = [...(paramOverrides.defparams || [])];
  for (const it of mod.items || []) {
    if (it.kind !== 'defparam') continue;
    safe(E, it.loc, () => {
      const n = bindExpr(E, it.value, null, it.loc);
      E.defparams.push({ path: it.path.split('.'), val: constOf(E, n, it.loc), t: n.t });
    });
  }
  elabItems(E, mod.items);
  // items with a hierarchical name into a generate block that comes after them (a forward
  // reference): elaborated again, now that every generate block exists
  const deferred = E.deferred;
  E.deferred.done = true;
  for (const [GE, it] of deferred) elabItems(GE, [it]);
  return inst;
}

function safe(E, loc, fn) {
  const at = E.at;
  if (loc?.line) E.at = loc;   // the location of what is being bound, for diagnostics without one
  try { return fn(); }
  catch (e) {
    if (e instanceof ElabError || e instanceof SimError) { diag(E, e.message, e.loc || loc); return null; }
    throw e;
  } finally { E.at = at; }
}

export function newSignal(E, name, t, init, kind, loc) {
  const d = E.ctx.design;
  const sig = {
    id: d.signals.length, name, path: `${E.inst.path}.${name}`, t, inst: E.inst, kind,
    init, val: init, prev: null, evStamp: -1, lastT: undefined, waiters: null, wave: null, loc, file: E.file,
  };
  d.signals.push(sig);
  E.inst.signals.push(sig);
  return sig;
}

function elabPort(E, p, conn) {
  const t = elabType(E, p.type);
  if (conn?.arr) conn = arrayConn(E, conn, t.w, p.name);
  if (conn?.aggregate && !conn.node) conn.node = bindExpr(conn.E, conn.aggregate, t, conn.loc);
  let init = defaultValue(t, E.lang);
  // an output variable's initializer that is not constant (output integer q = off + 1;): evaluated
  // once at time 0, as a module variable's (IEEE 1800-2017 10.5)
  let lateInit = null;
  if (p.default) {
    const n = bindExpr(E, p.default, t, p.loc);
    if (E.lang === 'verilog' && p.dir !== 'in' && !isConstNode(n)) { ctxSize(n, t.w); lateInit = n; }
    else init = fitAny(constOf(E, n, p.loc), t);
  }
  const initOnce = sig => {
    const proc = addProc(E, { name: `${E.prefix}${p.name}_init`, kind: 'process', mode: 'initial', body: { k: 'asg', target: { k: 'sig', sig, t, name: p.name }, value: lateInit, nb: false, loc: p.loc },
      triggers: [], lang: E.lang, loc: p.loc, file: E.file });
    proc.declInit = true;
  };
  if (conn && conn.node && conn.node.k === 'sig' && conn.node.t.w === t.w && (t.kind === 'array') === (conn.node.t.kind === 'array') && p.dir !== undefined) {
    const sig = conn.node.sig;
    // VHDL: the driver of an out port starts at the port's default; with the port aliased to its
    // actual that is the actual's initial value (unless the actual was given one itself); Verilog:
    // the initializer of an output variable (output logic [3:0] q = 1)
    if (lateInit) initOnce(sig);
    else if (p.default && p.dir !== 'in' && !sig.portInitSet && !sig.hasInit) {
      sig.init = init; sig.val = init; sig.portInitSet = true;
      if (E.lang === 'verilog') { sig.hasInit = true; sig.netZ = false; }
    }
    if (p.wired && !sig.wired) { sig.wired = p.wired; sig.netZ = false; }   // (input wor x: the net resolves as wired-or)
    E.sc.def(p.name, { kind: 'sig', sig, t });
    E.inst.ports.push({ name: p.name, dir: p.dir, sig, t, alias: true, conn: conn.text, ...(conn.fromArr ? { connNode: conn.node, connLnode: conn.lnode } : {}) });
    return;
  }
  const sig = newSignal(E, p.name, t, init, 'port', p.loc);
  sig.portDir = p.dir;
  if (p.wired) {
    sig.wired = p.wired;
    // (tri0 / tri1: pulled to 0 / 1 while nothing drives it)
    if (!p.default && (p.wired === 'tri0' || p.wired === 'tri1')) sig.init = sig.val = p.wired === 'tri0' ? V.zero(t.w) : V.mk(t.w, V.mask(t.w));
  }
  if (p.default && E.lang === 'verilog' && !lateInit) sig.hasInit = true;   // (input [3:0] d = 10, output logic q = 1)
  if (lateInit) initOnce(sig);
  E.sc.def(p.name, { kind: 'sig', sig, t });
  E.inst.ports.push({ name: p.name, dir: p.dir, sig, t, alias: false, conn: conn?.text ?? null, ...(conn?.fromArr ? { connNode: conn.node, connLnode: conn.lnode } : {}) });
  if (!conn) return;
  const pE = conn.E;
  if (conn.parts) {
    // sub-element associations: one connection per formal part (formal bound in this instance)
    for (const part of conn.parts) {
      const loc = conn.loc;
      if (p.dir === 'in' || (p.dir === 'inout' && !part.lnode)) {
        if (!part.node) continue;
        const target = bindLvalue(E, part.formal, loc);
        const value = part.node;
        if (pE.lang === 'verilog') ctxSize(value, target.t.w);
        const body = { k: 'asg', target, value, nb: false, delay: null, loc };
        addProc(E, { name: `${exprText(part.formal)}<=`, kind: 'glue', mode: 'comb', body, triggers: triggersOfReads(body), lang: 'verilog', loc, file: pE.file, inst: E.inst, glueOf: p.name });
      } else if (part.lnode) {
        const value = bindExpr(E, part.formal, null, loc);
        const body = { k: 'asg', target: part.lnode, value, nb: false, delay: null, loc };
        addProc(pE, { name: `${exprText(part.formal)}=>`, kind: 'glue', mode: 'comb', body, triggers: [{ sig, edge: 'any', pos: null }], lang: 'verilog', loc, file: pE.file, inst: pE.inst, glueOf: `${E.inst.name}.${p.name}` });
      }
    }
    return;
  }
  if (p.dir === 'in' || (p.dir === 'inout' && !conn.lnode)) {
    if (!conn.node) return;
    if (p.dir === 'inout') diag(E, `inout port '${p.name}' connected to an expression is treated as input`, p.loc, 'warning');
    let value = conn.node;
    if (pE.lang === 'verilog') ctxSize(value, t.w);
    const body = { k: 'asg', target: { k: 'sig', sig, t }, value, nb: false, delay: null, loc: conn.loc };
    addProc(E, { name: `${p.name}<=`, kind: 'glue', mode: 'comb', body, triggers: triggersOfReads(body), lang: 'verilog', loc: conn.loc, file: pE.file, inst: E.inst, glueOf: p.name });
  } else if (conn.lnode) {
    const body = { k: 'asg', target: conn.lnode, value: { k: 'sig', sig, t }, nb: false, delay: null, loc: conn.loc };
    addProc(pE, { name: `${p.name}=>`, kind: 'glue', mode: 'comb', body, triggers: [{ sig, edge: 'any' }], lang: 'verilog', loc: conn.loc, file: pE.file, inst: pE.inst, glueOf: `${E.inst.name}.${p.name}` });
  } else if (conn.node) {
    diag(pE, `output port '${p.name}' of '${E.inst.name}' is connected to a non-assignable expression`, conn.loc, 'warning');
  }
}

export function addProc(E, proc) {
  proc.inst ||= E.inst;
  proc.id = E.ctx.design.procs.length;
  proc.timeUnit ??= E.timeUnit;
  const rw = collectRW(proc.body);
  proc.reads = rw.reads; proc.writes = rw.writes;
  E.ctx.design.procs.push(proc);
  proc.inst.procs.push(proc);
  return proc;
}

function elabItems(E, items) {
  for (const it of items) {
    try {
      switch (it.kind) {
        case 'assign': elabAssignItem(E, it); break;
        case 'process': elabProcess(E, it); break;
        case 'instance': elabChild(E, it); break;
        case 'generate_for': elabGenFor(E, it); break;
        case 'generate_if': elabGenIf(E, it); break;
        case 'decl': bindDecl(E, it.decl); break;
        case 'defparam': break;   // (applied when the instance it names is elaborated)
        case 'elabtask': elabTask(E, it); break;
        default: diag(E, `unsupported item '${it.kind}'`, it.loc, 'warning');
      }
    } catch (e) {
      if (e instanceof ElabError && e.hier && E.deferred && !E.deferred.done) { E.deferred.push([E, it]); continue; }
      if (e instanceof ElabError || e instanceof SimError) { diag(E, e.message, e.loc || it.loc); continue; }
      throw e;
    }
  }
}

// SystemVerilog elaboration system tasks in a generate scope: $info / $warning / $error / $fatal
// (IEEE 1800-2017 20.11), the message formatted like $display's
function elabTask(E, it) {
  const sev = { $info: 'info', $warning: 'warning', $error: 'error', $fatal: 'error' }[it.name];
  const args = it.name === '$fatal' ? it.args.slice(1) : it.args;
  let msg = '';
  if (args.length) {
    const nodes = args.map(a => (a.op === 'str' ? { k: 'str', value: a.value, t: STR } : bindExpr(E, a, null, it.loc)));
    const vals = nodes.map(n => (n.k === 'str' ? { str: n.value } : constOf(E, n, it.loc)));
    let k = 1;
    msg = vals[0].str !== undefined
      ? vals[0].str.replace(/%(0?\d*)([dDbBhHsS%])/g, (m, w, f) => {
        if (f === '%') return '%';
        const v = vals[k++];
        if (!v) return m;
        if (v.str !== undefined) return v.str;
        return f === 'b' || f === 'B' ? V.toBin(v) : f === 'h' || f === 'H' ? V.toHex(v) : V.toDec(v, !!v.s);
      }) + vals.slice(k).map(v => (v.str !== undefined ? v.str : V.toDec(v, !!v.s))).join('')
      : vals.map(v => (v.str !== undefined ? v.str : V.toDec(v, !!v.s))).join('');
  }
  diag(E, `${it.name}${msg ? `: ${msg}` : ''}`, it.loc, sev);
}

function elabAssignItem(E, it) {
  // Verilog: an undeclared target of a continuous assignment is an implicit scalar net
  const target = bindLvalue(E.lang === 'verilog' ? { ...E, implicitNets: true } : E, it.target, it.loc);
  // (and so is an undeclared input of a gate primitive: and g(o, a, undeclared))
  const value = bindExpr(it.gate && E.lang === 'verilog' ? { ...E, implicitNets: true } : E, it.value, target.t, it.loc);
  if (E.lang === 'verilog') ctxSize(value, target.t.w);
  checkAssignable(E, target, value, it.loc);
  const body = { k: 'asg', target, value, nb: E.lang === 'vhdl', delay: it.delay ? bindExpr(E, it.delay) : null, delayUnit: E.lang === 'vhdl' ? 1 : E.timeUnit, prec: E.timePrec, loc: it.loc };
  if (E.lang === 'vhdl') { Object.assign(body, vhdlMech(E, it)); rangeCheck(body); }
  else if (body.delay) body.inertial = true;   // Verilog: a change before the delay elapses replaces the pending one
  addProc(E, {
    name: `assign_${it.loc?.line ?? ''}`, kind: 'assign', mode: 'comb', body, triggers: triggersOfReads(body),
    lang: E.lang, loc: it.loc, file: E.file, item: it,
  });
}

function elabProcess(E, it) {
  const fb = new FrameBuilder();
  // procRef: the process, once added (its named blocks' variables are read from its frame by
  // hierarchical names: dut.blk.v, #12)
  const PE = { ...E, sc: new Scope(E.sc), fb, inProcess: true, procRef: {}, blockPath: [] };
  for (const d of it.decls || []) bindDecl(PE, d);
  const body = bindBlock(PE, it.body, it.loc);
  let mode, triggers = [];
  if (it.sens === null) mode = it.initial ? 'initial' : 'loop';
  else if (it.sens === 'all') { mode = 'comb'; triggers = triggersOfReads(body); }
  else {
    triggers = it.sens.flatMap(s => bindTrigger(PE, s.expr, s.edge, it.loc));
    const edged = triggers.some(t => t.edge !== 'any');
    mode = E.lang === 'vhdl' ? 'sens' : (edged ? 'wait-first' : 'comb');
  }
  const label = it.label || (it.initial ? `initial_${it.loc?.line}` : `${E.lang === 'vhdl' ? 'process' : 'always'}_${it.loc?.line}`);
  const proc = addProc(E, {
    name: E.prefix + label, kind: 'process', mode, body, triggers, lang: E.lang, loc: it.loc, file: E.file,
    frameInit: fb.makeInit(), item: it, sens: it.sens,
  });
  // (not enumerable: the expression walkers do not go from a reference into the whole process)
  Object.defineProperty(PE.procRef, 'proc', { value: proc, enumerable: false });
}

function elabChild(E, it) {
  const mod = findModule(E.ctx.lib, it.module);
  const name = E.prefix + it.name;
  // bind connection expressions in the parent scope
  const conns = [];
  const childPorts = mod ? mod.ports : [];
  const ci = !mod || mod.lang === 'vhdl' || E.lang === 'vhdl';
  it.conns.forEach((c, k) => {
    if (c.port === '*') {
      for (const p of childPorts) {
        if (conns.some(x => x.port === p.name)) continue;
        if (E.sc.lookup(p.name)) conns.push({ port: p.name, expr: { op: 'ref', name: p.name } });
      }
      return;
    }
    let pname = c.port;
    if (pname == null) {
      if (!mod) pname = `p${k}`;
      else if (k >= childPorts.length) { diag(E, `too many port connections for '${it.module}'`, it.loc); return; }
      else pname = childPorts[k].name;
    } else if (mod) {
      const p = childPorts.find(p => p.name === pname) || (ci && childPorts.find(p => p.name.toLowerCase() === pname.toLowerCase()));
      if (!p) { diag(E, `module '${mod.name}' has no port '${pname}'`, it.loc); return; }
      pname = p.name;
    }
    conns.push({ port: pname, expr: c.expr, formal: c.formal || null });
  });
  const portConns = new Map();
  // (the ports connected to nothing on purpose: Verilog `.P()`, VHDL `P => open`)
  const openPorts = new Set(conns.filter(c => !c.expr).map(c => c.port));
  for (const c of conns) {
    if (!c.expr) continue;
    const pdecl = childPorts.find(p => p.name === c.port);
    let node = null, lnode = null;
    try {
      // VHDL `P => (others => '0')`: an aggregate takes the type of the port, known once the instance's
      // generics are (bound in elabPort)
      if (E.lang === 'vhdl' && c.expr.op === 'aggregate' && !c.formal && pdecl && pdecl.dir === 'in' && c.expr.items.some(i => i.choices)) {
        portConns.set(c.port, { node: null, aggregate: c.expr, E, loc: it.loc, text: exprText(c.expr) });
        continue;
      }
      node = bindExpr({ ...E, implicitNets: true }, c.expr, null, it.loc);
      if (E.lang === 'vhdl') vhdlActual(E, c, it);
      if (pdecl && pdecl.dir !== 'in' && isLvalueExpr(c.expr)) lnode = bindLvalue({ ...E, implicitNets: true }, c.expr, it.loc);
    } catch (e) {
      if (!(e instanceof ElabError)) throw e;
      diag(E, e.message, e.loc || it.loc);
      continue;
    }
    if (c.formal) {
      // VHDL `P(3) => a, P(2) => b` / `P(7 downto 4) => x`: each sub-element formal connects its own bits
      let pc = portConns.get(c.port);
      if (!pc || !pc.parts) { pc = { parts: [], node: null, lnode: null, E, loc: it.loc, text: '' }; portConns.set(c.port, pc); }
      pc.parts.push({ formal: c.formal, node, lnode, text: exprText(c.expr) });
      pc.text = pc.parts.map(x => `${exprText(x.formal)} => ${x.text}`).join(', ');
      continue;
    }
    portConns.set(c.port, { node, lnode, E, loc: it.loc, text: exprText(c.expr) });
  }
  if (!mod) {
    diag(E, `module/entity '${it.module}' not found (instance '${it.name}')`, it.loc);
    const bb = { name, path: `${E.inst.path}.${name}`, module: it.module, lang: null, blackbox: true, ports: [], signals: [], children: [], procs: [], params: [], parent: E.inst, loc: it.loc, file: E.file };
    bb.connInfo = [...portConns].map(([port, c]) => ({ port, dir: 'inout', node: c.node, text: c.text, reads: readsOf(c.node) }));
    E.inst.children.push(bb);
    return;
  }
  // parameter overrides
  const ov = new Map();
  it.params.forEach((p, k) => {
    if (!p.value) return;
    let pname = p.name;
    if (pname == null) {
      const nonLocal = mod.params.filter(x => !x.local);
      if (k >= nonLocal.length) { diag(E, `too many parameter overrides for '${mod.name}'`, it.loc); return; }
      pname = nonLocal[k].name;
    } else {
      const decl = mod.params.find(x => x.name === pname || (ci && x.name.toLowerCase() === pname.toLowerCase()));
      if (!decl) {
        // Silinx's own primitive models (UNISIM / SIMPRIM) ignore attributes they do not model
        const prim = String(mod.file || '').startsWith('<silinx>/');
        diag(E, prim ? `primitive '${mod.name}': generic '${pname}' is not modelled, ignored` : `module '${mod.name}' has no parameter '${pname}'`, it.loc, prim ? 'warning' : undefined);
        return;
      }
      pname = decl.name;
    }
    // VHDL `G => (others => '0')`: an aggregate takes the generic's declared type (when it does not
    // depend on the instance's other generics)
    let expect = null;
    if (E.lang === 'vhdl' && p.value.op === 'aggregate') {
      const pd = mod.params.find(x => x.name === pname);
      try { if (pd?.type) expect = elabType(E, pd.type); } catch (e) { if (!(e instanceof ElabError)) throw e; }
    }
    const n = bindExpr(E, p.value, expect, it.loc);
    ov.set(pname, { val: constOf(E, n, it.loc), t: n.t, text: n.strText });
  });
  // defparams naming this instance: its own parameters, and the ones further down (passed on)
  // (an instance in generate blocks is named by them: foo.mod_a, bar[0].mod_b)
  const segs = name.split('.');
  for (const dp of E.defparams || []) {
    if (dp.path.length <= segs.length || segs.some((s, i) => s !== dp.path[i])) continue;
    const rest = dp.path.slice(segs.length);
    if (rest.length > 1) { (ov.defparams ||= []).push({ ...dp, path: rest }); continue; }
    const decl = mod.params.find(x => x.name === rest[0] || (ci && x.name.toLowerCase() === rest[0].toLowerCase()));
    if (!decl) { diag(E, `defparam: module '${mod.name}' has no parameter '${rest[0]}'`, it.loc); continue; }
    ov.set(decl.name, { val: dp.val, t: dp.t });
  }
  // an array of instances (u [3:0] (…), IEEE 1364-2005 12.1.2): one instance per index, u[3] … u[0];
  // an actual as wide as the port goes to every instance, one n times as wide is split, its most
  // significant part to the leftmost index (arrayConn, when the port's width is known)
  let idxs = [null];
  if (it.array) {
    const r = evalRange(E, it.array);
    idxs = [];
    for (let k = r.left; ; k += r.left > r.right ? -1 : 1) { idxs.push(k); if (k === r.right) break; }
  }
  idxs.forEach((idx, j) => {
    const iname = idx === null ? name : `${name}[${idx}]`;
    let pc = portConns;
    if (idx !== null) pc = new Map([...portConns].map(([k, c]) => [k, c.parts ? c : { ...c, arr: { n: idxs.length, j } }]));
    const child = elabInstance(E.ctx, mod, iname, `${E.inst.path}.${iname}`, ov, pc, E.inst, (E.depth || 0) + 1);
    child.loc = it.loc; child.instFile = E.file;
    child.connInfo = mod.ports.map(p => {
      const c = pc.get(p.name);
      const port = child.ports.find(x => x.name === p.name);
      const parts = c?.parts || [];
      const node = port?.connNode ?? c?.node ?? null, lnode = port?.connLnode ?? c?.lnode;
      return {
        port: p.name, dir: p.dir, t: port?.t, text: c?.text ?? null, node,
        reads: node ? readsOf(node) : new Set(parts.flatMap(x => (x.node ? [...readsOf(x.node)] : []))),
        writes: lnode ? writesOfL(lnode) : new Set(parts.flatMap(x => (x.lnode ? [...writesOfL(x.lnode)] : []))),
      };
    });
    for (const p of mod.ports) {
      // (a primitive's input left open on purpose in Verilog, `.B()` of a cascaded MULT18X18SIO: as XST, no warning, #893)
      if (E.lang === 'verilog' && String(mod.file || '').startsWith('<silinx>/') && openPorts.has(p.name)) continue;
      // (VHDL: an input open whose component, declared in the architecture, gives it a default, #963)
      if (E.lang === 'vhdl' && openPorts.has(p.name) && compDefault(E, it.module, p.name)) continue;
      if (p.dir === 'in' && !portConns.has(p.name) && !p.default)
        diag(E, `input port '${p.name}' of '${iname}' is not connected`, it.loc, 'warning');
    }
    E.inst.children.push(child);
  });
}

// VHDL-93's actual of a port (#2565): an operator on a signal, or a signal's index, is an error (as in XST)
function vhdlActual(E, c, it) {
  const reads = (e) => { try { return readsOf(bindExpr(E, e, null, it.loc)).size > 0; } catch { return false; } };
  const bad = actualProblem(c.expr, reads);
  if (!bad) return;
  const what = bad.kind === 'operator' ? 'the result of an operator on a signal' : 'indexed by a signal';
  diag(E, `port '${c.port}' of '${it.name}': the actual is ${what}, not a static signal name`, it.loc);
}

// Whether the component `comp` declared in the module being elaborated (VHDL) gives its port `port` a default
function compDefault(E, comp, port) {
  const c = (E.inst.mod?.components || []).find(d => d.name.toLowerCase() === String(comp).toLowerCase());
  return !!c?.ports.find(q => q.name.toLowerCase() === port.toLowerCase())?.default;
}

// The bits of lvalue L from bit lo, w bits (a concatenation: the parts these bits fall in)
function sliceL(L, lo, w) {
  if (lo === 0 && w === L.t.w) return L;
  if (L.k !== 'cat') return { k: 'slice', base: L, lo, t: vecT(w) };
  const pieces = [];
  let off = 0;
  for (let k = L.parts.length - 1; k >= 0; k--) {
    const P = L.parts[k], pw = P.t.w;
    const a = Math.max(lo, off), b = Math.min(lo + w, off + pw);
    if (a < b) pieces.unshift(sliceL(P, a - off, b - a));
    off += pw;
  }
  return pieces.length === 1 ? pieces[0] : { k: 'cat', parts: pieces, t: vecT(w) };
}

// The connection of one instance of an array of instances to a port of w bits
function arrayConn(E, conn, w, pname) {
  const { n, j } = conn.arr;
  const c = { ...conn };
  delete c.arr;
  const aw = (conn.node || conn.lnode)?.t?.w;
  if (aw === undefined || aw === w) return c;
  if (aw !== n * w) {
    diag(conn.E, `port '${pname}': the actual has ${aw} bits, neither ${w} nor ${n} x ${w}`, conn.loc, 'warning');
    return c;
  }
  const lo = (n - 1 - j) * w;
  c.fromArr = true;
  if (c.node) c.node = { k: 'slice', base: c.node, lo, t: vecT(w) };
  if (c.lnode) c.lnode = sliceL(c.lnode, lo, w);
  return c;
}

// Generate blocks are scopes of their own: a named one (or an unnamed one, genblk<n>) is entered
// in the enclosing scope as { kind: 'gen', sc }, a generate loop as { kind: 'genarr', elems: index ->
// { kind: 'gen', sc } }, so that hierarchical names reach into them (hierResolve).
function elabGenFor(E, it) {
  const genScope = new Scope(E.sc);
  const GE0 = { ...E, sc: genScope };
  let i = constOf(GE0, bindExpr(GE0, it.init), it.loc);
  let guard = 0;
  const arr = { kind: 'genarr', elems: new Map() };
  if (it.label) E.sc.def(it.label, arr);
  for (;;) {
    const sc = new Scope(E.sc);
    sc.def(it.var, { kind: 'const', val: V.resize(V.withSign(i, true), 32), t: INT });
    const GE = { ...E, sc };
    if (!V.isTrue(constOf(GE, bindExpr(GE, it.cond), it.loc))) break;
    if (++guard > 4096) throw new ElabError('generate loop does not terminate', it.loc);
    const idx = V.toDec(i, true);
    GE.prefix = `${E.prefix}${it.label}[${idx}].`;
    arr.elems.set(Number(idx), { kind: 'gen', sc });
    for (const d of it.decls || []) safe(GE, d.loc, () => bindDecl(GE, d));
    elabItems(GE, it.items);
    i = constOf(GE, bindExpr(GE, it.step), it.loc);
  }
}

function elabGenIf(E, it) {
  // else if / the next case alternative: the same construct, in the same scope; the chain walked in a loop (#3500)
  let c;
  for (;;) {
    c = V.isTrue(constOf(E, bindExpr(E, it.cond), it.loc));
    if (c || !it.elseChain) break;
    it = it.else[0];
  }
  if (!c && !it.else?.length && !it.elseDecls?.length) return;
  const label = c ? it.label : it.elseLabel ?? it.label;
  const sc = new Scope(E.sc);
  const GE = { ...E, sc, prefix: label ? `${E.prefix}${label}.` : E.prefix };
  if (label) E.sc.def(label, { kind: 'gen', sc });
  for (const d of (c ? it.decls : it.elseDecls) || []) safe(GE, d.loc, () => bindDecl(GE, d));
  elabItems(GE, (c ? it.then : it.else) || []);
}
