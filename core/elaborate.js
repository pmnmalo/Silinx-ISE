// Elaboration: builds the instance hierarchy from parsed units, evaluates parameters/generics,
// unrolls generate blocks, resolves names and binds IR expressions/statements into executable
// nodes (see interp.js). Works for Verilog, VHDL and mixed designs.
//
// Bound expression nodes:  { k, t, ... }
//   c(val) sig(sig) loc(i) bit(base,index) elem(base,index) slice(base,lo) dslice(base,left,right)
//   pslice(base,start,dir) un(o,a) bin(o,a,b) cond(c,a,b) cat(parts) repl(count,a) conv(a,ext)
//   call(fn,args) sys(name,args) edge(sig,pos) event(sig) str(value) image(a) strcat(parts) arr(elems) now
// Bound statements: blk asg if case for forrange while repeat forever exit next ret null delay event wait task sys report assert
import * as V from './values.js';
import { evalE, runSync, exec, SimError, strToVal, bitpos } from './interp.js';
import { nativePrimitive } from './native.js';
import { mapBits } from './vhdl/parser.js';

export const INT = { kind: 'int', w: 32, s: true, left: 31, right: 0, desc: true };
export const BOOL = { kind: 'bool', w: 1, s: false, left: 0, right: 0, desc: true, scalar: true };
export const BIT = { kind: 'logic', w: 1, s: false, left: 0, right: 0, desc: true, scalar: true };
export const TIME = { kind: 'time', w: 64, s: true, left: 63, right: 0, desc: true };
export const REAL = { kind: 'real', w: 64, s: true, left: 63, right: 0, desc: true };
export const STR = { kind: 'str', w: 0, s: false };
export const vecT = (w, s = false) => ({ kind: 'logic', w, s, left: w - 1, right: 0, desc: true });

const PHYS = { fs: 0.001, ps: 1, ns: 1e3, us: 1e6, ms: 1e9, sec: 1e12, s: 1e12 };

class ElabError extends Error {
  constructor(msg, loc) { super(msg); this.loc = loc; }
}

class Scope {
  constructor(parent = null) { this.map = new Map(); this.parent = parent; }
  def(name, entry) { this.map.set(name, entry); return entry; }
  lookup(name) {
    for (let s = this; s; s = s.parent) { const e = s.map.get(name); if (e) return e; }
    return null;
  }
  local(name) { return this.map.get(name) || null; }
}

class FrameBuilder {
  constructor() { this.inits = []; this.types = []; }
  alloc(t, init) { this.inits.push(init); this.types.push(t); return this.inits.length - 1; }
  makeInit() {
    const inits = this.inits;
    return () => inits.map(v => (Array.isArray(v) ? v.slice() : v));
  }
  probe() { return this.inits.map(v => (Array.isArray(v) ? v.slice() : v)); }
}

// ---------------------------------------------------------------- library
export function buildLibrary(parsedFiles) {
  const lib = { modules: new Map(), packages: new Map(), errors: [], files: new Map() };
  const archs = [];
  for (const pf of parsedFiles) {
    lib.errors.push(...(pf.errors || []));
    for (const u of pf.units) {
      if (u.kind === 'module') {
        if (lib.modules.has(u.name) && !lib.modules.get(u.name).entityOnly)
          lib.errors.push({ file: u.file, line: u.loc?.line || 1, col: 1, severity: 'warning', message: `module '${u.name}' redefined (previous in ${lib.modules.get(u.name).file})` });
        lib.modules.set(u.name, u);
      } else if (u.kind === 'package') lib.packages.set(u.name, u);
      else if (u.kind === 'architecture') archs.push(u);
    }
  }
  for (const a of archs) {
    const ent = findModule(lib, a.entity);
    if (!ent) { lib.errors.push({ file: a.file, line: a.loc?.line || 1, col: 1, severity: 'error', message: `architecture '${a.name}' of unknown entity '${a.entity}'` }); continue; }
    ent.decls = [...(ent.decls || []), ...a.decls];
    ent.items = a.items;
    ent.uses = [...new Set([...(ent.uses || []), ...(a.uses || [])])];
    ent.archFile = a.file;
    delete ent.entityOnly;
  }
  return lib;
}

export function findModule(lib, name) {
  if (lib.modules.has(name)) return lib.modules.get(name);
  const ln = name.toLowerCase();
  for (const [k, m] of lib.modules) if (k.toLowerCase() === ln) return m;
  return null;
}

// Modules that are never instantiated by another module (top-level candidates).
export function topCandidates(lib) {
  const used = new Set();
  const visit = items => {
    for (const it of items || []) {
      if (it.kind === 'instance') used.add(it.module.toLowerCase());
      if (it.items) visit(it.items);
      if (it.then) visit(it.then);
      if (it.else) visit(it.else);
    }
  };
  for (const m of lib.modules.values()) visit(m.items);
  return [...lib.modules.values()].filter(m => !used.has(m.name.toLowerCase())).map(m => m.name);
}

// ---------------------------------------------------------------- elaboration entry
export function elaborate(lib, topName, opts = {}) {
  const design = {
    top: null, signals: [], procs: [], diags: [], lib,
    maxDepth: opts.maxDepth || 64,
  };
  const top = findModule(lib, topName);
  if (!top) {
    design.diags.push({ file: '', line: 1, col: 1, severity: 'error', message: `top module '${topName}' not found` });
    return design;
  }
  const ctx = { design, lib, pkgScopes: new Map() };
  try {
    // opts.generics: { NAME: integer } overrides the top module's generics / parameters
    const ov = new Map(Object.entries(opts.generics || {}).flatMap(([k, v]) => { const e = { val: V.fromInt(v, 32, true), t: INT }; return [[k, e], [k.toLowerCase(), e]]; }));
    design.top = elabInstance(ctx, top, top.name, top.name, ov, new Map(), null, 0);
  } catch (e) {
    if (!(e instanceof ElabError)) throw e;
    design.diags.push({ file: top.file, line: e.loc?.line || 1, col: e.loc?.col || 1, severity: 'error', message: e.message });
  }
  return design;
}

function diag(E, msg, loc, sev = 'error') {
  E.ctx.design.diags.push({ file: E.file, line: loc?.line || 1, col: loc?.col || 1, severity: sev, message: msg });
}

// ---------------------------------------------------------------- scopes for packages
const BUILTIN_VHDL = new Scope();
BUILTIN_VHDL.def('true', { kind: 'const', val: V.ONE, t: BOOL });
BUILTIN_VHDL.def('false', { kind: 'const', val: V.ZERO, t: BOOL });
for (const [n, sev] of [['note', 0], ['warning', 1], ['error', 2], ['failure', 3]]) BUILTIN_VHDL.def(n, { kind: 'const', val: V.fromInt(sev, 2, false), t: INT });
const BUILTIN_VLOG = new Scope();

function packageScope(ctx, name, file, loc, diagE) {
  if (ctx.pkgScopes.has(name)) return ctx.pkgScopes.get(name);
  const pkg = ctx.lib.packages.get(name) || [...ctx.lib.packages.values()].find(p => p.name.toLowerCase() === name.toLowerCase());
  if (!pkg) {
    if (diagE) diag(diagE, `package '${name}' not found`, loc);
    return null;
  }
  const sc = new Scope(usesScope(ctx, pkg, 'vhdl'));
  ctx.pkgScopes.set(name, sc);
  // package-level signals (e.g. SIMPRIM's GSR / GTS) belong to the package: one per design
  const pinst = { name: pkg.name, path: pkg.name, signals: [], procs: [], children: [], params: [], ports: [] };
  const E = { ctx, lang: 'vhdl', sc, inst: pinst, file: pkg.file, timeUnit: 1, fb: null, prefix: '' };
  for (const d of pkg.decls) {
    try { bindDecl(E, d); } catch (e) { if (!(e instanceof ElabError)) throw e; diag(E, e.message, e.loc || d.loc); }
  }
  return sc;
}

function usesScope(ctx, mod, lang) {
  const base = lang === 'vhdl' ? BUILTIN_VHDL : BUILTIN_VLOG;
  if (!mod.uses || !mod.uses.length) return base;
  const sc = new Scope(base);
  for (const u of mod.uses) {
    const ps = packageScope(ctx, u, mod.file, mod.loc, { ctx, file: mod.file });
    if (ps) for (const [k, v] of ps.map) sc.def(k, v);
  }
  return sc;
}

// ---------------------------------------------------------------- instances
function elabInstance(ctx, mod, name, path, paramOverrides, portConns, parentInst, depth) {
  if (depth > ctx.design.maxDepth) throw new ElabError(`instance hierarchy too deep at ${path} (recursive instantiation?)`);
  const inst = {
    name, path, module: mod.name, lang: mod.lang, file: mod.archFile || mod.file, loc: mod.loc,
    params: [], ports: [], signals: [], children: [], procs: [], parent: parentInst, mod,
  };
  const E = {
    ctx, lang: mod.lang, sc: new Scope(usesScope(ctx, mod, mod.lang)), inst,
    file: inst.file, timeUnit: mod.timescale?.unit ?? (mod.lang === 'vhdl' ? 1 : 1000), fb: null, prefix: '', depth,
  };
  // parameters / generics
  for (const p of mod.params) {
    let entry;
    try {
      const ov = paramOverrides.get(p.name) ?? paramOverrides.get(p.name.toLowerCase());
      const ptype = p.type ? elabType(E, p.type) : null;
      if (ov && !p.local) {
        entry = { kind: 'const', val: ov.val, t: ov.t };
        if (ptype && ptype.kind !== 'str') entry = { kind: 'const', val: fitVal(ov.val, ptype), t: ptype };
        else if (ptype && ov.text !== undefined) entry = { kind: 'const', val: { str: ov.text }, t: STR };   // NAME => "u1"
      } else if (p.default) {
        const n = bindExpr(E, p.default, ptype);
        const val = constOf(E, n, p.loc);
        entry = { kind: 'const', val: ptype && ptype.kind !== 'str' ? fitVal(val, ptype) : val, t: ptype || n.t };
      } else throw new ElabError(`generic '${p.name}' has no value`, mod.loc);
    } catch (e) {
      if (!(e instanceof ElabError)) throw e;
      diag(E, e.message, e.loc || mod.loc);
      entry = { kind: 'const', val: V.fromInt(0), t: INT };
    }
    E.sc.def(p.name, entry);
    inst.params.push({ name: p.name, value: entry.val, t: entry.t });
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
    const nat = nativePrimitive(mod.name, inst.params, inst.ports);
    if (nat) {
      for (const [sig, v] of nat.init) { sig.init = v; sig.val = v; }
      const proc = addProc(E, { name: mod.name.toUpperCase(), kind: 'native', mode: 'native', native: nat.fn, body: { k: 'null' },
        triggers: nat.inputs.map((sig) => ({ sig, edge: 'any' })), lang: 'vhdl', loc: mod.loc, file: inst.file, inst });
      proc.writes = new Set(nat.outputs);
      return inst;
    }
  }
  for (const d of late) safe(E, d.loc, () => bindDecl(E, d));
  elabItems(E, mod.items);
  return inst;
}

function safe(E, loc, fn) {
  try { return fn(); }
  catch (e) {
    if (e instanceof ElabError || e instanceof SimError) { diag(E, e.message, e.loc || loc); return null; }
    throw e;
  }
}

function newSignal(E, name, t, init, kind, loc) {
  const d = E.ctx.design;
  const sig = {
    id: d.signals.length, name, path: `${E.inst.path}.${name}`, t, inst: E.inst, kind,
    init, val: init, prev: null, evStamp: -1, waiters: null, wave: null, loc, file: E.file,
  };
  d.signals.push(sig);
  E.inst.signals.push(sig);
  return sig;
}

function elabPort(E, p, conn) {
  const t = elabType(E, p.type);
  let init = defaultValue(t, E.lang);
  if (p.default) init = fitAny(constOf(E, bindExpr(E, p.default, t), p.loc), t);
  if (conn && conn.node && conn.node.k === 'sig' && conn.node.t.w === t.w && (t.kind === 'array') === (conn.node.t.kind === 'array') && p.dir !== undefined) {
    const sig = conn.node.sig;
    E.sc.def(p.name, { kind: 'sig', sig, t });
    E.inst.ports.push({ name: p.name, dir: p.dir, sig, t, alias: true, conn: conn.text });
    return;
  }
  const sig = newSignal(E, p.name, t, init, 'port', p.loc);
  sig.portDir = p.dir;
  E.sc.def(p.name, { kind: 'sig', sig, t });
  E.inst.ports.push({ name: p.name, dir: p.dir, sig, t, alias: false, conn: conn?.text ?? null });
  if (!conn) return;
  const pE = conn.E;
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

function addProc(E, proc) {
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
    safe(E, it.loc, () => {
      switch (it.kind) {
        case 'assign': return elabAssignItem(E, it);
        case 'process': return elabProcess(E, it);
        case 'instance': return elabChild(E, it);
        case 'generate_for': return elabGenFor(E, it);
        case 'generate_if': return elabGenIf(E, it);
        case 'decl': return bindDecl(E, it.decl);
        default: diag(E, `unsupported item '${it.kind}'`, it.loc, 'warning');
      }
    });
  }
}

function elabAssignItem(E, it) {
  const target = bindLvalue(E, it.target, it.loc);
  const value = bindExpr(E, it.value, target.t, it.loc);
  if (E.lang === 'verilog') ctxSize(value, target.t.w);
  checkAssignable(E, target, value, it.loc);
  const body = { k: 'asg', target, value, nb: E.lang === 'vhdl', delay: it.delay ? bindExpr(E, it.delay) : null, delayUnit: E.lang === 'vhdl' ? 1 : E.timeUnit, loc: it.loc };
  if (E.lang === 'vhdl') Object.assign(body, vhdlMech(E, it));
  addProc(E, {
    name: `assign_${it.loc?.line ?? ''}`, kind: 'assign', mode: 'comb', body, triggers: triggersOfReads(body),
    lang: E.lang, loc: it.loc, file: E.file, item: it,
  });
}

function elabProcess(E, it) {
  const fb = new FrameBuilder();
  const PE = { ...E, sc: new Scope(E.sc), fb, inProcess: true };
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
  addProc(E, {
    name: E.prefix + label, kind: 'process', mode, body, triggers, lang: E.lang, loc: it.loc, file: E.file,
    frameInit: fb.makeInit(), item: it, sens: it.sens,
  });
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
    conns.push({ port: pname, expr: c.expr });
  });
  const portConns = new Map();
  for (const c of conns) {
    if (!c.expr) continue;
    const pdecl = childPorts.find(p => p.name === c.port);
    let node = null, lnode = null;
    try {
      node = bindExpr({ ...E, implicitNets: true }, c.expr, null, it.loc);
      if (pdecl && pdecl.dir !== 'in' && isLvalueExpr(c.expr)) lnode = bindLvalue({ ...E, implicitNets: true }, c.expr, it.loc);
    } catch (e) {
      if (!(e instanceof ElabError)) throw e;
      diag(E, e.message, e.loc || it.loc);
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
      if (!decl) { diag(E, `module '${mod.name}' has no parameter '${pname}'`, it.loc); return; }
      pname = decl.name;
    }
    const n = bindExpr(E, p.value, null, it.loc);
    ov.set(pname, { val: constOf(E, n, it.loc), t: n.t, text: n.strText });
  });
  const child = elabInstance(E.ctx, mod, name, `${E.inst.path}.${name}`, ov, portConns, E.inst, (E.depth || 0) + 1);
  child.loc = it.loc; child.instFile = E.file;
  child.connInfo = mod.ports.map(p => {
    const c = portConns.get(p.name);
    const port = child.ports.find(x => x.name === p.name);
    return {
      port: p.name, dir: p.dir, t: port?.t, text: c?.text ?? null, node: c?.node ?? null,
      reads: c?.node ? readsOf(c.node) : new Set(),
      writes: c?.lnode ? writesOfL(c.lnode) : new Set(),
    };
  });
  for (const p of mod.ports) {
    if (p.dir === 'in' && !portConns.has(p.name) && !p.default)
      diag(E, `input port '${p.name}' of '${name}' is not connected`, it.loc, 'warning');
  }
  E.inst.children.push(child);
}

function elabGenFor(E, it) {
  const genScope = new Scope(E.sc);
  const GE0 = { ...E, sc: genScope };
  let i = constOf(GE0, bindExpr(GE0, it.init), it.loc);
  let guard = 0;
  for (;;) {
    const sc = new Scope(E.sc);
    sc.def(it.var, { kind: 'const', val: V.resize(V.withSign(i, true), 32), t: INT });
    const GE = { ...E, sc };
    if (!V.isTrue(constOf(GE, bindExpr(GE, it.cond), it.loc))) break;
    if (++guard > 4096) throw new ElabError('generate loop does not terminate', it.loc);
    const idx = V.toDec(i, true);
    GE.prefix = `${E.prefix}${it.label}[${idx}].`;
    for (const d of it.decls || []) safe(GE, d.loc, () => bindDecl(GE, d));
    elabItems(GE, it.items);
    i = constOf(GE, bindExpr(GE, it.step), it.loc);
  }
}

function elabGenIf(E, it) {
  const c = constOf(E, bindExpr(E, it.cond), it.loc);
  const sc = new Scope(E.sc);
  const GE = { ...E, sc, prefix: it.label ? `${E.prefix}${it.label}.` : E.prefix };
  if (V.isTrue(c)) {
    for (const d of it.decls || []) safe(GE, d.loc, () => bindDecl(GE, d));
    elabItems(GE, it.then);
  } else {
    for (const d of it.elseDecls || []) safe(GE, d.loc, () => bindDecl(GE, d));
    elabItems(GE, it.else || []);
  }
}

// ---------------------------------------------------------------- declarations
function bindDecl(E, d) {
  switch (d.kind) {
    case 'type': {
      if (d.type.kind === 'enum') {
        const n = d.type.values.length;
        const w = Math.max(1, Math.ceil(Math.log2(n)));
        const t = { kind: 'enum', name: d.name, names: d.type.values, w, s: false, left: w - 1, right: 0, desc: true };
        E.sc.def(d.name, { kind: 'type', t });
        d.type.values.forEach((nm, i) => E.sc.def(nm, { kind: 'const', val: V.fromInt(i, w, false), t }));
        return;
      }
      if (d.type.kind === 'array' && !d.type.range) {
        E.sc.def(d.name, { kind: 'type', t: null, unconstrained: d.type, name: d.name });
        return;
      }
      const t = { ...elabType(E, d.type), name: d.name };
      E.sc.def(d.name, { kind: 'type', t });
      return;
    }
    case 'const': {
      const t = d.type ? elabType(E, d.type, true) : null;
      const n = bindExpr(E, d.value, t, d.loc);
      if (E.lang === 'verilog' && t) ctxSize(n, t.w);
      let val = constOf(E, n, d.loc);
      let ft = t;
      if (!t || (t.kind === 'logic' && t.unconstrained)) ft = n.t;
      else val = fitAny(val, t);
      E.sc.def(d.name, { kind: 'const', val, t: ft });
      return;
    }
    case 'signal': {
      const t = elabType(E, d.type);
      let init = defaultValue(t, E.lang, d.net);
      if (d.init) {
        const n = bindExpr(E, d.init, t, d.loc);
        if (E.lang === 'verilog') ctxSize(n, t.w);
        init = fitAny(constOf(E, n, d.loc), t);
      }
      if (E.fb && (d.net === 'variable' || E.inProcess)) {
        const i = E.fb.alloc(t, init);
        E.sc.def(d.name, { kind: 'loc', i, t });
        return;
      }
      if (E.sc.local(d.name) && E.sc.local(d.name).kind === 'sig') { diag(E, `'${d.name}' redeclared`, d.loc, 'warning'); return; }
      const sig = newSignal(E, E.prefix + d.name, t, init, d.net === 'variable' ? 'var' : 'signal', d.loc);
      E.sc.def(d.name, { kind: 'sig', sig, t });
      return;
    }
    case 'function': case 'task':
      E.sc.def(d.name, { kind: 'func', decl: d, E: { ...E, fb: null, inProcess: false }, cache: new Map() });
      return;
    case 'alias': {   // VHDL object alias: reads and writes go to the aliased object (or slice)
      const rv = bindExpr(E, d.target, null, d.loc);
      const lv = isLvalueExpr(d.target) && rv.k !== 'c' ? bindLvalue(E, d.target, d.loc) : null;
      if (rv.k === 'c') { E.sc.def(d.name, { kind: 'const', val: rv.val, t: rv.t }); return; }
      E.sc.def(d.name, { kind: 'alias', rv, lv, t: rv.t });
      return;
    }
    default:
      return;
  }
}

function elabType(E, ts, allowUnconstrained = false) {
  switch (ts.kind) {
    case 'logic': {
      if (!ts.range) {
        if (ts.unconstrained) return { ...vecT(1, ts.signed), unconstrained: true };
        return { ...BIT, s: !!ts.signed };
      }
      const { left, right, desc } = evalRange(E, ts.range);
      const w = Math.abs(left - right) + 1;
      return { kind: 'logic', w, s: !!ts.signed, left, right, desc };
    }
    case 'integer': {
      const t = { ...INT };
      if (ts.range) {
        const r = evalRange(E, ts.range);
        t.rlo = Math.min(r.left, r.right); t.rhi = Math.max(r.left, r.right);
      }
      return t;
    }
    case 'boolean': return BOOL;
    case 'time': return TIME;
    case 'real': return REAL;
    case 'string': return STR;
    case 'array': {
      const elem = elabType(E, ts.elem);
      if (!ts.range) return { kind: 'array', unconstrained: true, elem, w: 0 };
      const { left, right, desc } = evalRange(E, ts.range);
      const lo = Math.min(left, right), len = Math.abs(left - right) + 1;
      if (len > 1 << 22) throw new ElabError(`array too large (${len} elements)`);
      return { kind: 'array', left, right, desc, lo, len, elem, w: elem.w };
    }
    case 'named': {
      const e = E.sc.lookup(ts.name);
      if (!e || e.kind !== 'type') {
        const std = stdTypeName(ts.name);
        if (std) return elabType(E, { ...std, range: ts.range || null });
        throw new ElabError(`unknown type '${ts.name}'`);
      }
      if (e.unconstrained) {
        if (!ts.range) {
          if (allowUnconstrained) return { kind: 'array', unconstrained: true, elem: elabType(E, e.unconstrained.elem), w: 0, name: e.name };
          throw new ElabError(`unconstrained type '${ts.name}' needs an index range`);
        }
        return { ...elabType(E, { ...e.unconstrained, range: ts.range }), name: e.name };
      }
      if (ts.range && e.t.kind === 'logic') return elabType(E, { kind: 'logic', range: ts.range, signed: e.t.s });
      return e.t;
    }
    case 'enum': throw new ElabError('anonymous enum types are not supported');
  }
  throw new ElabError(`unsupported type '${ts.kind}'`);
}

function stdTypeName(n) {
  switch (n.toLowerCase()) {
    case 'std_logic': case 'std_ulogic': case 'bit': return { kind: 'logic', range: null, signed: false };
    case 'std_logic_vector': case 'std_ulogic_vector': case 'bit_vector': case 'unsigned': return { kind: 'logic', range: null, signed: false, unconstrained: true };
    case 'signed': return { kind: 'logic', range: null, signed: true, unconstrained: true };
    case 'integer': return { kind: 'integer', range: null };
    case 'natural': case 'positive': {
      const lit = v => ({ op: 'int', value: String(v) });
      return { kind: 'integer', range: { left: lit(n.toLowerCase() === 'natural' ? 0 : 1), right: lit(2147483647), dir: 'to' } };
    }
    case 'boolean': return { kind: 'boolean' };
    case 'time': return { kind: 'time' };
    case 'real': return { kind: 'real' };
    case 'string': return { kind: 'string' };
  }
  return null;
}

function evalRange(E, r) {
  if (r.of) {
    const n = bindExpr(E, r.of, null);
    const t = n.t;
    if (t.kind === 'str') throw new ElabError("'range of a string is not supported (use std_logic_vector)", r.of.loc);
    if (r.reverse) return { left: t.right, right: t.left, desc: !t.desc };
    return { left: t.left, right: t.right, desc: t.desc };
  }
  const left = V.toNum(constOf(E, bindExpr(E, r.left), r.left.loc));
  const right = V.toNum(constOf(E, bindExpr(E, r.right), r.right.loc));
  const desc = r.dir ? r.dir === 'downto' : left >= right;
  return { left, right, desc };
}

export function defaultValue(t, lang, net) {
  switch (t.kind) {
    case 'logic': return V.allX(t.w, t.s);
    case 'int': {
      if (lang === 'verilog') return V.allX(32, true);
      return V.fromInt(t.rlo !== undefined ? t.rlo : -2147483648, 32, true);
    }
    case 'bool': return V.ZERO;
    case 'enum': return V.mk(t.w, 0n);
    case 'time': return V.fromInt(0, 64, true);
    case 'real': return V.fromInt(0, 64, true);
    case 'str': return { str: '' };
    case 'array': return t.unconstrained ? [] : Array.from({ length: t.len }, () => defaultValue(t.elem, lang, net));
  }
  return V.allX(t.w || 1);
}

function fitVal(v, t) {
  if (v.str !== undefined || Array.isArray(v)) return v;
  return V.withSign(V.resize(v, t.w), t.s);
}
function fitAny(v, t) {
  if (t.kind === 'str') return v.str !== undefined ? v : { str: String(V.toDec(v)) };
  if (t.kind === 'array') {
    if (!Array.isArray(v)) throw new ElabError('array value expected');
    return v.map(e => fitAny(e, t.elem));
  }
  if (v.str !== undefined) return fitVal(strToVal(v.str), t);
  return fitVal(v, t);
}

// ---------------------------------------------------------------- constant evaluation
function constCtx() { return { frame: [], sim: null, depth: 0 }; }

function constOf(E, n, loc) {
  if (n.k === 'c') return n.val;
  if (!isConstNode(n)) throw new ElabError('expression is not constant', loc);
  try { return evalE(n, constCtx()); }
  catch (e) { throw new ElabError(e.message, loc); }
}

function isConstNode(n) {
  switch (n.k) {
    case 'c': case 'str': return true;
    case 'sig': case 'loc': case 'edge': case 'event': case 'sys': case 'now': return false;
    case 'call': return !n.fn.impure && n.args.every(isConstNode);
    default:
      for (const key of ['a', 'b', 'c', 'base', 'index', 'left', 'right', 'start', 'count']) if (n[key] && typeof n[key] === 'object' && n[key].k && !isConstNode(n[key])) return false;
      for (const key of ['parts', 'elems', 'args']) if (n[key] && !n[key].every(isConstNode)) return false;
      return true;
  }
}

function fold(n) {
  if (n.k !== 'c' && isConstNode(n) && n.k !== 'str') {
    try {
      const v = evalE(n, constCtx());
      // src: the expression, re-evaluated if Verilog context sizing widens it (ctxSize)
      return { k: 'c', val: v, t: n.t, src: n };
    } catch { return n; }
  }
  return n;
}

// Verilog context-determined sizing: propagate an evaluation width into the expression
// (self-determined operands are sized with their own width).
export function ctxSize(n, w) {
  if (!n || !n.t) return;
  const self = x => { if (x && x.t) ctxSize(x, x.t.w); };
  switch (n.k) {
    case 'bin': {
      const o = n.o;
      if (['==', '!=', '===', '!==', '<', '<=', '>', '>='].includes(o)) {
        const m = Math.max(n.a.t.w, n.b.t.w);
        n.cw = m; ctxSize(n.a, m); ctxSize(n.b, m);
        return;
      }
      if (o === '&&' || o === '||') { self(n.a); self(n.b); return; }
      n.ew = Math.max(n.t.w, w);
      ctxSize(n.a, n.ew);
      if (!['<<', '>>', '<<<', '>>>', '**', 'rol', 'ror'].includes(o)) ctxSize(n.b, n.ew);
      else self(n.b);
      return;
    }
    case 'un':
      if (n.o === '~' || n.o === '-') { n.ew = Math.max(n.t.w, w); ctxSize(n.a, n.ew); }
      else self(n.a);
      return;
    case 'cond':
      n.ew = Math.max(n.t.w, w); self(n.c); ctxSize(n.a, n.ew); ctxSize(n.b, n.ew);
      return;
    case 'cat': for (const p of n.parts) self(p); return;
    case 'repl': self(n.a); return;
    case 'conv': self(n.a); return;
    case 'bit': case 'elem': self(n.index); return;
    case 'c':
      if (n.src) {
        // folded constant: size the original expression and evaluate it again
        ctxSize(n.src, w);
        try { n.val = evalE(n.src, constCtx()); } catch { /* keep the self-determined value */ }
      } else if (n.xext && w > n.val.w) {
        // unsized 'bx / 'bz: the x / z fills the context width
        const ext = V.mask(w) ^ V.mask(n.val.w);
        n.val = V.mk(w, n.val.v | (n.xext === 'z' ? ext : 0n), n.val.x | ext, n.val.s);
      }
      return;
  }
}

// ---------------------------------------------------------------- expressions
const ARITH = new Set(['+', '-', '*', '/', '%', 'mod', 'rem', '**']);
const BITWISE = new Set(['&', '|', '^', '~^', 'nand', 'nor']);
const CMP = new Set(['==', '!=', '===', '!==', '<', '<=', '>', '>=']);
const SHIFT = new Set(['<<', '>>', '<<<', '>>>', 'rol', 'ror']);

function lookupOrErr(E, name, loc) {
  const e = E.sc.lookup(name);
  if (e) return e;
  return null;
}

// x'event / rising_edge(x) operand: a signal, or one bit of a vector signal (constant index)
function edgeOperand(node) {
  if (node && node.k === 'sig') return { sig: node.sig };
  if (node && node.k === 'bit' && node.base.k === 'sig' && node.index.k === 'c') return { sig: node.base.sig, bit: bitpos(node.base.t, V.toNum(node.index.val)) };
  return null;
}

function refNode(E, entry, name) {
  switch (entry.kind) {
    case 'sig': return { k: 'sig', sig: entry.sig, t: entry.t || entry.sig.t, name };
    case 'const': return { k: 'c', val: entry.val, t: entry.t, name };
    case 'loc': return { k: 'loc', i: entry.i, t: entry.t, name };
    case 'alias': return entry.rv;   // VHDL signal parameter: the actual signal itself
  }
  return null;
}

export function bindExpr(E, e, expect = null, loc) {
  const n = bindExpr0(E, e, expect, loc);
  return n;
}

function bindExpr0(E, e, expect, loc) {
  loc = e.loc || loc;
  switch (e.op) {
    case 'lit': {
      if (E.lang === 'vhdl' && expect && expect.kind === 'str' && e.text !== undefined) return { k: 'str', value: e.text, t: STR };
      if (E.lang === 'vhdl' && expect && expect.kind === 'str' && !e.scalar && /^[01]+$/.test(e.bits)) return { k: 'str', value: e.bits, t: STR };
      const val = V.fromBits(e.bits, !!e.signed);
      const t = e.scalar ? BIT : vecT(val.w, !!e.signed);
      if (E.lang === 'verilog' && e.sized === false && /^[xz]/.test(e.bits)) return { k: 'c', val, t, xext: e.bits[0] };
      if (E.lang === 'vhdl' && e.scalar && expect && expect.kind === 'logic' && expect.w > 1 && !expect.unconstrained) {
        // e.g. assigning '0' where a vector is expected is an error in VHDL; be lenient and extend
        return { k: 'c', val: V.resize(val, expect.w), t: expect };
      }
      if (E.lang === 'vhdl' && !e.scalar && e.sized) return { k: 'c', val, t, strText: e.text ?? e.bits };
      return { k: 'c', val, t };
    }
    case 'int': {
      const b = BigInt(e.value);
      if (E.lang === 'vhdl') return { k: 'c', val: V.mk(32, BigInt.asUintN(32, b), 0n, true), t: INT };
      let w = 32;
      while ((b >= 0n ? b >= 1n << BigInt(w - 1) : -b > 1n << BigInt(w - 1))) w += 32;
      return { k: 'c', val: V.mk(w, BigInt.asUintN(w, b), 0n, true), t: w === 32 ? INT : vecT(w, true) };
    }
    case 'real': return { k: 'c', val: V.real(e.value), t: REAL };
    case 'phys': {
      const ps = Math.round(e.value * (PHYS[e.unit] ?? 1));
      return { k: 'c', val: V.fromInt(ps, 64, true), t: TIME };
    }
    case 'str': {
      if (E.lang === 'verilog' && expect && expect.kind === 'logic') return { k: 'c', val: strToVal(e.value), t: vecT(Math.max(8, e.value.length * 8)) };
      return { k: 'str', value: e.value, t: STR };
    }
    case 'fill': {
      const w = expect ? expect.w : 1;
      const bit = e.bit;
      return { k: 'c', val: V.fromBits(bit.repeat(w)), t: expect || BIT };
    }
    case 'ref': {
      const entry = lookupOrErr(E, e.name, loc);
      if (entry) {
        const n = refNode(E, entry, e.name);
        if (n) return n;
        if (entry.kind === 'func') return bindCall(E, entry, [], e.name, loc);
        if (entry.kind === 'type') throw new ElabError(`type '${e.name}' used as a value`, loc);
      }
      if (E.lang === 'vhdl' && e.name === 'now') return { k: 'now', t: TIME, unit: 1 };
      if (E.implicitNets && E.lang === 'verilog' && E.inst && !e.name.includes('.')) {
        diag(E, `implicit net '${e.name}' (declare it with 'wire')`, loc, 'warning');
        const sig = newSignal(E, E.prefix + e.name, BIT, V.allX(1), 'signal', loc);
        E.sc.def(e.name, { kind: 'sig', sig, t: BIT });
        return { k: 'sig', sig, t: BIT, name: e.name };
      }
      if (e.name.includes('.')) {
        const hs = hierLookup(E, e.name);
        if (hs) return { k: 'sig', sig: hs, t: hs.t, name: e.name };
      }
      throw new ElabError(`'${e.name}' is not declared`, loc);
    }
    case 'index': {
      const base = bindExpr(E, e.base, null, loc);
      return fold(indexNode(E, base, e.index, loc));
    }
    case 'slice': {
      const base = bindExpr(E, e.base, null, loc);
      return fold(sliceNode(E, base, e.left, e.right, loc));
    }
    case 'pslice': {
      const base = bindExpr(E, e.base, null, loc);
      const w = V.toNum(constOf(E, bindExpr(E, e.width), loc));
      const start = bindExpr(E, e.start, null, loc);
      return fold({ k: 'pslice', base, start, dir: e.dir, t: vecT(w) });
    }
    case 'apply': return bindApply(E, e, expect, loc);
    case 'call': return bindVlogCall(E, e, expect, loc);
    case 'concat': {
      const parts = e.parts.map(p => bindExpr(E, p, null, loc));
      if (parts.some(p => p.t.kind === 'str')) return { k: 'strcat', parts, t: STR };
      if (parts.length === 1 && E.lang === 'verilog') return { k: 'conv', a: parts[0], ext: false, t: vecT(parts[0].t.w) };
      const w = parts.reduce((a, p) => a + p.t.w, 0);
      return fold({ k: 'cat', parts, t: vecT(w) });
    }
    case 'repl': {
      const count = bindExpr(E, e.count, null, loc);
      const n = V.toNum(constOf(E, count, loc));
      const a = bindExpr(E, e.value, null, loc);
      return fold({ k: 'repl', count: { k: 'c', val: V.fromInt(n), t: INT }, a, t: vecT(n * a.t.w) });
    }
    case 'unary': {
      const a = bindExpr(E, e.a, expect, loc);
      let t;
      if (a.t.kind === 'real' && (e.o === '-' || e.o === 'abs')) return fold({ k: 'un', o: e.o, a, t: REAL, fp: true });
      if (e.o === '~' || e.o === '-' || e.o === 'abs') t = a.t.kind === 'bool' ? BOOL : (a.t.kind === 'int' ? a.t : vecT(a.t.w, a.t.s));
      else t = E.lang === 'vhdl' && e.o === '!' ? BOOL : BIT;
      if (e.o === '~' && a.t.kind === 'logic' && a.t.scalar) t = BIT;
      return fold({ k: 'un', o: e.o, a, t });
    }
    case 'binary': return fold(bindBinary(E, e, expect, loc));
    case 'cond': {
      const c = bindExpr(E, e.cond, null, loc);
      const a = bindExpr(E, e.then, expect, loc), b = bindExpr(E, e.else, expect, loc);
      const w = Math.max(a.t.w, b.t.w);
      let t = a.t.kind === b.t.kind && a.t.w === b.t.w ? a.t : vecT(w, a.t.s && b.t.s);
      if (a.t.kind === 'array' || a.t.kind === 'str') t = a.t;
      // VHDL `x when c else y`: a condition that is not true selects the else value
      return fold({ k: 'cond', c, a, b, t, vh: E.lang === 'vhdl' });
    }
    case 'attr': return bindAttr(E, e, loc);
    case 'aggregate': return bindAggregate(E, e, expect, loc);
    case 'qualified': {
      const te = E.sc.lookup(e.type);
      const sn = stdTypeName(e.type);
      let t = te && te.kind === 'type' ? te.t : null;
      // unsigned'(0 => x) / std_logic_vector'(a, b): the aggregate's own length gives the width
      if (!t && sn && e.expr.op === 'aggregate' && e.expr.items.length && e.expr.items.every(i => !i.choices || i.choices.every(c => c && c.op === 'int'))) {
        const n = Math.max(e.expr.items.length, ...e.expr.items.flatMap(i => (i.choices || []).map(c => Number(c.value) + 1)));
        t = vecT(n, !!sn.signed);
      }
      const inner = bindExpr(E, e.expr, t || expect, loc);
      if (sn && inner.t.kind === 'logic') return fold({ k: 'conv', a: inner, ext: inner.t.s, t: { ...inner.t, s: !!sn.signed } });
      return inner;
    }
  }
  throw new ElabError(`unsupported expression '${e.op}'`, loc);
}

function hierLookup(E, name) {
  // Verilog hierarchical reference relative to current instance or from the top.
  const parts = name.split('.');
  let inst = E.inst;
  const findChild = (i, n) => i.children.find(c => c.name === n);
  // walk up to find the first component
  let start = inst;
  while (start && !findChild(start, parts[0]) && start.name !== parts[0]) start = start.parent;
  if (!start) return null;
  let cur = start.name === parts[0] && !findChild(start, parts[0]) ? start : findChild(start, parts[0]);
  for (let k = 1; k < parts.length - 1 && cur; k++) cur = findChild(cur, parts[k]);
  if (!cur) return null;
  const sn = parts[parts.length - 1];
  return cur.signals.find(s => s.name === sn) || cur.ports.find(p => p.name === sn)?.sig || null;
}

function indexNode(E, base, idxExpr, loc) {
  const index = bindExpr(E, idxExpr, null, loc);
  if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem };
  if (base.t.kind === 'str') throw new ElabError('string indexing not supported', loc);
  if (index.k === 'c' && !index.val.x) {
    const p = bitpos(base.t, V.toNum(index.val));
    if (p < 0 || p >= base.t.w) diag(E, `index ${V.toDec(index.val, true)} out of range for '${base.name || 'expression'}'`, loc, 'warning');
  }
  return { k: 'bit', base, index, t: BIT };
}

function sliceNode(E, base, leftE, rightE, loc) {
  if (base.t.kind === 'array') throw new ElabError('array slices are not supported', loc);
  const left = bindExpr(E, leftE, null, loc), right = bindExpr(E, rightE, null, loc);
  if (left.k === 'c' && right.k === 'c') {
    const p1 = bitpos(base.t, V.toNum(left.val)), p2 = bitpos(base.t, V.toNum(right.val));
    const lo = Math.min(p1, p2), w = Math.abs(p1 - p2) + 1;
    if (lo < 0 || lo + w > base.t.w) diag(E, `slice out of range for '${base.name || 'expression'}'`, loc, 'warning');
    return { k: 'slice', base, lo, t: vecT(w, base.t.kind === 'logic' ? base.t.s : false) };
  }
  // dynamic slice: width from a probe evaluation (loop variables at their initial values)
  let w;
  try {
    const ctx = { frame: E.fb ? E.fb.probe() : [], sim: null, depth: 0 };
    w = Math.abs(V.toNum(evalE(left, ctx)) - V.toNum(evalE(right, ctx))) + 1;
  } catch {
    throw new ElabError('slice bounds must be constant (or depend only on loop variables)', loc);
  }
  return { k: 'dslice', base, left, right, t: vecT(w) };
}

// A VHDL string literal of std_logic characters (kept as a string inside report / assert
// messages) compared with a vector is a vector literal.
function strAsLogic(n, other) {
  if (n.k !== 'str' || other.t.kind !== 'logic' || !/^[01uxzwlh-]+$/i.test(n.value)) return n;
  const val = V.fromBits(mapBits(n.value));
  return { k: 'c', val, t: vecT(val.w) };
}

// std_logic_arith mixes unsigned and signed operands as signed: the unsigned one is extended
// with a 0 sign bit (numeric_std does not allow the mix, so this never changes its results)
function mixedSign(a, b) {
  if (a.t.kind !== 'logic' || b.t.kind !== 'logic' || !!a.t.s === !!b.t.s) return [a, b];
  const widen = n => fold({ k: 'conv', a: n, ext: false, t: vecT(n.t.w + 1, true) });
  return a.t.s ? [a, widen(b)] : [widen(a), b];
}

function harmonizeVhdl(a, b) {
  // numeric_std: vector op integer -> integer converted to the vector's width
  if (a.t.kind === 'logic' && (b.t.kind === 'int')) b = fold({ k: 'conv', a: b, ext: true, t: vecT(a.t.w, a.t.s) });
  else if (b.t.kind === 'logic' && (a.t.kind === 'int')) a = fold({ k: 'conv', a, ext: true, t: vecT(b.t.w, b.t.s) });
  return [a, b];
}

function bindBinary(E, e, expect, loc) {
  const o = e.o;
  let a, b;
  if (e.a.op === 'aggregate' && e.b.op !== 'aggregate') { b = bindExpr(E, e.b, null, loc); a = bindExpr(E, e.a, b.t, loc); }
  else { a = bindExpr(E, e.a, ARITH.has(o) || BITWISE.has(o) ? expect : null, loc); b = bindExpr(E, e.b, a.t.kind === 'logic' || a.t.kind === 'enum' ? a.t : null, loc); }
  // REAL operands: floating point (time * real, real / real, comparisons...)
  const fp = a.t.kind === 'real' || b.t.kind === 'real';
  if (fp && CMP.has(o)) return { k: 'bin', o, a, b, t: E.lang === 'vhdl' ? BOOL : BIT, fp };
  if (fp && (ARITH.has(o))) return { k: 'bin', o, a, b, t: a.t.kind === 'time' || b.t.kind === 'time' ? TIME : REAL, fp };
  if (CMP.has(o)) {
    if (E.lang === 'vhdl' && a.t.kind === 'enum' && b.k === 'c') b = { ...b, t: a.t };
    if (E.lang === 'vhdl') { a = strAsLogic(a, b); b = strAsLogic(b, a); [a, b] = mixedSign(a, b); }
    // VHDL '=' / '/=' compare the enumeration values exactly ('X' = 'X' is true, 'U' /= '1' too)
    if (E.lang === 'vhdl') return { k: 'bin', o, a, b, t: BOOL, vh: o === '==' || o === '!=' };
    return { k: 'bin', o, a, b, t: BIT };
  }
  if (o === '&&' || o === '||') return { k: 'bin', o, a, b, t: BIT };
  if (SHIFT.has(o)) return { k: 'bin', o, a, b, t: a.t.kind === 'int' ? a.t : vecT(a.t.w, a.t.s) };
  if (E.lang === 'vhdl' && (ARITH.has(o) && o !== '**')) [a, b] = harmonizeVhdl(a, b);
  if (E.lang === 'vhdl' && ARITH.has(o) && o !== '**') [a, b] = mixedSign(a, b);
  const s = a.t.s && b.t.s;
  if (a.t.kind === 'int' && b.t.kind === 'int') return { k: 'bin', o, a, b, t: INT };
  if (a.t.kind === 'time' || b.t.kind === 'time') return { k: 'bin', o, a, b, t: TIME };
  if (o === '**') return { k: 'bin', o, a, b, t: a.t.kind === 'int' ? INT : vecT(a.t.w, a.t.s) };
  let w = Math.max(a.t.w, b.t.w);
  if (o === '*' && E.lang === 'vhdl') w = a.t.w + b.t.w;
  if (BITWISE.has(o) && a.t.kind === 'bool' && b.t.kind === 'bool') return { k: 'bin', o, a, b, t: BOOL };
  const t = BITWISE.has(o) && w === 1 && (a.t.scalar || b.t.scalar) ? BIT : vecT(w, s);
  return { k: 'bin', o, a, b, t };
}

function bindAttr(E, e, loc) {
  const at = e.attr.toLowerCase();
  if (at === 'image' || at === 'to_string') {
    const a = bindExpr(E, e.args[0], null, loc);
    return { k: 'image', a, t: STR };
  }
  // prefix could be a type name
  let t, node = null;
  if (e.prefix.op === 'ref') {
    const ent = E.sc.lookup(e.prefix.name);
    if (ent && ent.kind === 'type') t = ent.t;
    else if (!ent && stdTypeName(e.prefix.name)) t = elabType(E, stdTypeName(e.prefix.name));
  }
  if (!t) { node = bindExpr(E, e.prefix, null, loc); t = node.t; }
  const cint = n => ({ k: 'c', val: V.fromInt(n, 32, true), t: INT });
  if (t.kind === 'str' && at !== 'event') throw new ElabError(`'${at} of a string is not supported (use std_logic_vector)`, loc);
  if ((t.kind === 'int' || t.kind === 'enum') && ['left', 'right', 'high', 'low'].includes(at)) {
    // scalar types: bounds of the range (integer ranges are ascending here)
    const lo = t.kind === 'int' ? (t.rlo ?? -2147483648) : 0;
    const hi = t.kind === 'int' ? (t.rhi ?? 2147483647) : t.names.length - 1;
    const v = at === 'left' || at === 'low' ? lo : hi;
    return t.kind === 'int' ? cint(v) : { k: 'c', val: V.fromInt(v, t.w, false), t };
  }
  switch (at) {
    case 'event':
      if (!edgeOperand(node)) throw new ElabError("'event requires a signal", loc);
      return { k: 'event', ...edgeOperand(node), t: BOOL };
    case 'length': return cint(t.kind === 'array' ? t.len : t.w);
    case 'left': return cint(t.left);
    case 'right': return cint(t.right);
    case 'high': return cint(Math.max(t.left, t.right));
    case 'low': return cint(Math.min(t.left, t.right));
    case 'pos': return fold({ k: 'conv', a: bindExpr(E, e.args[0], null, loc), ext: false, t: INT });
    case 'val': return fold({ k: 'conv', a: bindExpr(E, e.args[0], null, loc), ext: true, t });
    case 'succ': case 'pred': {
      const a = bindExpr(E, e.args[0], null, loc);
      return fold({ k: 'bin', o: at === 'succ' ? '+' : '-', a, b: { k: 'c', val: V.fromInt(1, a.t.w, false), t: vecT(a.t.w) }, t });
    }
    case 'stable':
      if (!edgeOperand(node)) throw new ElabError("'stable requires a signal", loc);
      return { k: 'un', o: '!', a: { k: 'event', ...edgeOperand(node), t: BOOL }, t: BOOL };
  }
  throw new ElabError(`attribute '${e.attr} is not supported`, loc);
}

function bindAggregate(E, e, expect, loc) {
  if (!expect) {
    // positional aggregate without context: concatenation
    if (e.items.every(i => !i.choices)) {
      const parts = e.items.map(i => bindExpr(E, i.value, BIT, loc));
      return fold({ k: 'cat', parts, t: vecT(parts.reduce((a, p) => a + p.t.w, 0)) });
    }
    throw new ElabError('cannot determine the type of the aggregate', loc);
  }
  if (expect.kind === 'array') {
    if (expect.unconstrained) {
      const elems = e.items.map(i => bindExpr(E, i.value, expect.elem, loc));
      const t = { ...expect, unconstrained: false, left: 0, right: elems.length - 1, desc: false, lo: 0, len: elems.length };
      return fold({ k: 'arr', elems, t });
    }
    const slots = new Array(expect.len).fill(null);
    let pos = 0;
    for (const it of e.items) {
      const val = bindExpr(E, it.value, expect.elem, loc);
      if (!it.choices) {
        const idx = expect.desc ? expect.left - pos : expect.left + pos;
        pos++;
        if (idx - expect.lo >= 0 && idx - expect.lo < expect.len) slots[idx - expect.lo] = val;
        continue;
      }
      for (const ch of it.choices) {
        if (ch === 'others') { for (let k = 0; k < slots.length; k++) if (!slots[k]) slots[k] = val; }
        else if (ch.range) {
          const r = evalRange(E, ch.range);
          for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) slots[i - expect.lo] = val;
        } else slots[V.toNum(constOf(E, bindExpr(E, ch, null, loc), loc)) - expect.lo] = val;
      }
    }
    const def = { k: 'c', val: defaultValue(expect.elem, E.lang), t: expect.elem };
    return fold({ k: 'arr', elems: slots.map(s => s || def), t: expect });
  }
  // vector aggregate
  const t = expect.unconstrained ? null : expect;
  if (!t) {
    if (e.items.every(i => !i.choices)) {
      const parts = e.items.map(i => bindExpr(E, i.value, BIT, loc));
      return fold({ k: 'cat', parts, t: vecT(parts.length) });
    }
    throw new ElabError('aggregate with others needs a constrained target', loc);
  }
  const w = t.w;
  const bits = new Array(w).fill(null); // indexed by bit position
  let pos = 0;
  for (const it of e.items) {
    const val = bindExpr(E, it.value, BIT, loc);
    if (!it.choices) {
      const idx = t.desc ? t.left - pos : t.left + pos;
      pos++;
      bits[bitpos(t, idx)] = val;
      continue;
    }
    for (const ch of it.choices) {
      if (ch === 'others') { for (let k = 0; k < w; k++) if (!bits[k]) bits[k] = val; }
      else if (ch.range) {
        const r = evalRange(E, ch.range);
        for (let i = Math.min(r.left, r.right); i <= Math.max(r.left, r.right); i++) bits[bitpos(t, i)] = val;
      } else bits[bitpos(t, V.toNum(constOf(E, bindExpr(E, ch, null, loc), loc)))] = val;
    }
  }
  const zero = { k: 'c', val: V.ZERO, t: BIT };
  const parts = [];
  for (let p = w - 1; p >= 0; p--) parts.push(bits[p] || zero);
  if (parts.every(p => p === parts[0])) return fold({ k: 'repl', count: { k: 'c', val: V.fromInt(w), t: INT }, a: parts[0], t: vecT(w, t.s) });
  return fold({ k: 'cat', parts, t: { ...vecT(w, t.s) } });
}

// VHDL name(args): index, call, or conversion
function bindApply(E, e, expect, loc) {
  const name = e.name;
  const args = e.args.map(a => (a && a.named !== undefined ? a : a));
  const entry = E.sc.lookup(name);
  if (entry && (entry.kind === 'sig' || entry.kind === 'const' || entry.kind === 'loc' || entry.kind === 'alias')) {
    const base = refNode(E, entry, name);
    if (args.length !== 1) throw new ElabError(`'${name}' indexed with ${args.length} indices`, loc);
    const a = args[0].named !== undefined ? args[0].value : args[0];
    if (a.op === 'slice' && a.base == null) return fold(sliceNode(E, base, a.left, a.right, loc));
    return fold(indexNode(E, base, a, loc));
  }
  if (entry && entry.kind === 'func') return bindCall(E, entry, args, name, loc);
  if (entry && entry.kind === 'type') {
    const a = bindExpr(E, positional(args)[0], null, loc);
    const t = entry.t;
    return fold({ k: 'conv', a, ext: a.t.s, t: t.unconstrained ? { ...a.t } : t });
  }
  return bindBuiltin(E, name, args, expect, loc);
}

function positional(args) { return args.map(a => (a && a.named !== undefined ? a.value : a)); }

function bindBuiltin(E, name, rawArgs, expect, loc) {
  const args = positional(rawArgs);
  const A = i => bindExpr(E, args[i], null, loc);
  const C = i => V.toNum(constOf(E, A(i), loc));
  const conv = (a, w, s, ext = a.t.s, kind) => fold({ k: 'conv', a, ext, t: kind === 'int' ? INT : vecT(w, s) });
  switch (name) {
    case 'rising_edge': case 'falling_edge': {
      const a = A(0);
      if (!edgeOperand(a)) throw new ElabError(`${name} requires a signal`, loc);
      return { k: 'edge', ...edgeOperand(a), pos: name === 'rising_edge', t: BOOL };
    }
    case 'to_unsigned': case 'conv_unsigned': return conv(A(0), C(1), false, true);
    case 'to_signed': case 'conv_signed': return conv(A(0), C(1), true, true);
    case 'conv_std_logic_vector': return conv(A(0), C(1), false);
    case 'to_integer': case 'conv_integer': case 'integer': case 'natural': case 'positive': return conv(A(0), 32, true, A(0).t.s, 'int');
    case 'real': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: REAL }); }
    case 'resize': {
      const a = A(0), w = C(1);
      if (a.t.s && a.t.kind === 'logic' && w < a.t.w) return fold({ k: 'conv', a, ext: true, sres: true, t: vecT(w, true) });
      return conv(a, w, a.t.s);
    }
    case 'ext': return conv(A(0), C(1), false, false);
    case 'sxt': return conv(A(0), C(1), true, true);
    case 'unsigned': case 'std_logic_vector': case 'std_ulogic_vector': case 'to_stdlogicvector': case 'to_bitvector': case 'to_stdulogicvector': case 'bit_vector': {
      const a = A(0);
      if (a.t.kind === 'int') throw new ElabError(`cannot convert an integer with ${name}(); use to_unsigned(x, n)`, loc);
      return conv(a, a.t.w, false);
    }
    case 'signed': { const a = A(0); return conv(a, a.t.w, true); }
    case 'to_01': case 'to_x01': case 'std_logic': case 'to_stdulogic': case 'to_bit': return A(0);
    case 'shift_left': case 'shift_right': case 'rotate_left': case 'rotate_right': {
      const a = A(0), b = A(1);
      const o = name === 'shift_left' ? '<<' : name === 'shift_right' ? (a.t.s ? '>>>' : '>>') : name === 'rotate_left' ? 'rol' : 'ror';
      return fold({ k: 'bin', o, a, b, t: a.t });
    }
    case 'and_reduce': case 'or_reduce': case 'xor_reduce': case 'nand_reduce': case 'nor_reduce': case 'xnor_reduce': {
      const o = { and_reduce: '&', or_reduce: '|', xor_reduce: '^', nand_reduce: '~&', nor_reduce: '~|', xnor_reduce: '~^' }[name];
      return fold({ k: 'un', o, a: A(0), t: BIT });
    }
    case 'to_string': case 'to_hstring': case 'to_bstring': return { k: 'image', a: A(0), t: STR };
    case 'minimum': case 'maximum': {
      const a = A(0), b = A(1);
      const c = { k: 'bin', o: name === 'minimum' ? '<' : '>', a, b, t: BOOL };
      return fold({ k: 'cond', c, a, b, t: a.t });
    }
    case 'now': return { k: 'now', t: TIME, unit: 1 };
    // '-' in a constant operand is a don't care ('-' and 'X' share one encoding)
    case 'std_match': { const a = A(0), b = A(1); return fold({ k: 'bin', o: '==', a: strAsLogic(a, b), b: strAsLogic(b, a), t: BOOL, vh: true, match: true }); }
  }
  throw new ElabError(`'${name}' is not declared`, loc);
}

function bindVlogCall(E, e, expect, loc) {
  const name = e.name;
  if (name[0] === '$') {
    const A = i => bindExpr(E, e.args[i], null, loc);
    switch (name) {
      case '$signed': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, true) }); }
      case '$unsigned': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, false) }); }
      case '$clog2': {
        diag(E, '$clog2 is not supported by XST (ISE 14.7); use a constant function instead', loc, 'warning');
        const v = V.toBig(constOf(E, A(0), loc));
        let r = 0; while ((1n << BigInt(r)) < v) r++;
        return { k: 'c', val: V.fromInt(r), t: INT };
      }
      case '$bits': return { k: 'c', val: V.fromInt(A(0).t.w), t: INT };
      case '$time': case '$stime': case '$realtime': return { k: 'sys', name, args: [], t: vecT(64) };
      case '$random': return { k: 'sys', name, args: [], t: INT };
      case '$urandom': return { k: 'sys', name, args: [], t: vecT(32) };
      case '$urandom_range': return { k: 'sys', name, args: e.args.map((_, i) => A(i)), t: vecT(32) };
      case '$countones': {
        const a = A(0);
        let sum = { k: 'c', val: V.fromInt(0), t: INT };
        for (let i = 0; i < a.t.w; i++) sum = { k: 'bin', o: '+', a: sum, b: { k: 'conv', a: { k: 'bit', base: a, index: { k: 'c', val: V.fromInt(a.t.desc ? a.t.right + i : a.t.right - i), t: INT }, t: BIT }, ext: false, t: INT }, t: INT };
        return fold(sum);
      }
      case '$rtoi': case '$itor': case '$realtobits': case '$bitstoreal': return A(0);
    }
    throw new ElabError(`system function ${name} is not supported`, loc);
  }
  let entry = E.sc.lookup(name);
  // a recursive call: inside the function its name is the return variable; find the function
  for (let sc = E.sc; entry && entry.kind !== 'func' && sc; sc = sc.parent) { const x = sc.local(name); if (x && x.kind === 'func') entry = x; }
  if (!entry || entry.kind !== 'func') throw new ElabError(`function '${name}' is not declared`, loc);
  return bindCall(E, entry, e.args, name, loc);
}

function bindCall(E, entry, rawArgs, name, loc) {
  const decl = entry.decl;
  // named association
  let argExprs = new Array(decl.params.length).fill(null);
  rawArgs.forEach((a, k) => {
    if (a && a.named !== undefined) {
      const idx = decl.params.findIndex(p => p.name === a.named);
      if (idx < 0) throw new ElabError(`'${name}' has no parameter '${a.named}'`, loc);
      argExprs[idx] = a.value;
    } else argExprs[k] = a;
  });
  const args = argExprs.map((a, k) => {
    if (!a) throw new ElabError(`missing argument '${decl.params[k].name}' in call to '${name}'`, loc);
    const n = bindExpr(E, a, null, loc);
    // a std_logic string literal (kept as a string in report messages) for a vector parameter
    const pt = decl.params[k].type;
    if (E.lang === 'vhdl' && n.k === 'str' && pt && (pt.kind === 'logic' || (pt.kind === 'named' && stdTypeName(pt.name)?.kind === 'logic'))) return strAsLogic(n, { t: { kind: 'logic' } });
    return n;
  });
  const fn = boundFunction(entry, args, loc);
  if (decl.kind === 'task' || !fn.retT) throw new ElabError(`'${name}' is a procedure/task, not a function`, loc);
  args.forEach((a, k) => { if (E.lang === 'verilog') ctxSize(a, fn.params[k].t.w); });
  return fold({ k: 'call', fn, args, t: fn.retT });
}

// Bound function / procedure for these argument types (cached per argument types).
// VHDL: when the generic binding fails (e.g. a width depends on an integer parameter:
// `variable r : std_logic_vector(n-1 downto 0)`, `to_unsigned(i, w)`), the subprogram is bound
// again with its constant integer arguments known as constants (cached per argument value).
function boundFunction(entry, args, loc, sigActuals = null) {
  const decl = entry.decl;
  const key = args.map(a => `${a.t.kind}${a.t.w}${a.t.s ? 's' : ''}`).join(',');
  const consts = new Map();
  if (entry.E.lang === 'vhdl') {
    decl.params.forEach((p, k) => {
      const a = args[k];
      if (!sigActuals?.[k] && a && a.k === 'c' && a.t.kind === 'int' && p.dir !== 'out' && p.dir !== 'inout' && String(p.class || '').toLowerCase() !== 'variable') consts.set(k, a.val);
    });
  }
  if (!sigActuals && entry.cache.has(key)) {
    const fn = entry.cache.get(key);
    if (!fn.needsConsts) return fn;
  } else if (consts.size) {
    // try the generic binding; on errors, fall back to the per-constant one
    const diags = entry.E.ctx.design.diags, n0 = diags.length;
    let fn = null;
    try { fn = bindSubprogram(entry, args, key, sigActuals, null); } catch (e) { if (!(e instanceof ElabError) && !(e instanceof SimError)) throw e; }
    if (fn && !diags.slice(n0).some(d => d.severity === 'error')) return fn;
    diags.length = n0;
    if (!sigActuals) entry.cache.set(key, { needsConsts: true });
  } else {
    return bindSubprogram(entry, args, key, sigActuals, null);
  }
  if (!consts.size) return entry.cache.get(key);
  const ckey = key + '|' + [...consts].map(([k, v]) => `${k}=${V.toDec(v, true)}`).join(',');
  if (!sigActuals && entry.cache.has(ckey)) return entry.cache.get(ckey);
  return bindSubprogram(entry, args, ckey, sigActuals, consts);
}

function bindSubprogram(entry, args, key, sigActuals, consts) {
  const decl = entry.decl;
  const DE = entry.E;
  const fb = new FrameBuilder();
  const sc = new Scope(DE.sc);
  const FE = { ...DE, sc, fb, inProcess: true, inFunction: true };
  const fn = { name: decl.name, params: [], body: null, retSlot: null, retT: null, impure: false };
  if (!sigActuals) entry.cache.set(key, fn);
  try {
    decl.params.forEach((p, k) => {
      if (sigActuals?.[k]) {
        const a = sigActuals[k];
        sc.def(p.name, { kind: 'alias', rv: a.rv, lv: a.lv, t: a.rv.t });
        fn.params.push({ alias: true, dir: p.dir, name: p.name });
        return;
      }
      let t = elabType(FE, p.type, true);
      if ((t.unconstrained || (t.kind === 'logic' && t.w === 1 && p.type.kind === 'logic' && !p.type.range && args[k] && args[k].t.w > 1 && DE.lang === 'vhdl')) && args[k]) {
        t = { ...args[k].t };
        delete t.unconstrained;
      }
      const i = fb.alloc(t, defaultValue(t, DE.lang));
      if (consts?.has(k)) sc.def(p.name, { kind: 'const', val: fitVal(consts.get(k), t), t });
      else sc.def(p.name, { kind: 'loc', i, t });
      fn.params.push({ i, t, dir: p.dir, name: p.name });
    });
    let retOpen = false;
    if (decl.returnType) {
      let rt = elabType(FE, decl.returnType, true);
      if (rt.unconstrained) {
        // provisional (recursive calls): refined from the return statements below
        retOpen = rt.kind === 'logic';
        rt = args[0] ? { ...args[0].t } : vecT(1);
        delete rt.unconstrained;
        if (decl.returnType.signed !== undefined && rt.kind === 'logic') rt.s = !!decl.returnType.signed;
      }
      fn.retT = rt;
      if (decl.retVar) {
        fn.retSlot = fb.alloc(rt, defaultValue(rt, DE.lang));
        sc.def(decl.retVar, { kind: 'loc', i: fn.retSlot, t: rt });
      }
    }
    for (const d of decl.decls) bindDecl(FE, d);
    fn.body = bindBlock(FE, decl.body, decl.loc);
    if (retOpen) {
      // unconstrained return type (VHDL): the width of the returned values, when they agree
      const ws = new Set();
      walk(fn.body, x => { if (x.k === 'ret' && x.value && x.value.t) ws.add(x.value.t.kind === 'logic' ? x.value.t.w : -1); });
      if (ws.size === 1 && !ws.has(-1)) fn.retT = vecT([...ws][0], !!fn.retT.s);
    }
  } catch (e) {
    if (!sigActuals && entry.cache.get(key) === fn) entry.cache.delete(key);
    throw e;
  }
  fn.frameInit = fb.makeInit();
  const rw = collectRW(fn.body);
  fn.impure = rw.reads.size > 0 || rw.writes.size > 0 || containsKind(fn.body, ['delay', 'event', 'wait', 'sys']);
  return fn;
}

// ---------------------------------------------------------------- lvalues
function isLvalueExpr(e) {
  switch (e.op) {
    case 'ref': return true;
    case 'index': case 'slice': case 'pslice': return isLvalueExpr(e.base);
    case 'apply': return e.args.length === 1;
    case 'concat': return e.parts.every(isLvalueExpr);
  }
  return false;
}

function bindLvalue(E, e, loc) {
  switch (e.op) {
    case 'ref': {
      const entry = E.sc.lookup(e.name);
      if (!entry) {
        if (E.implicitNets) return bindExpr(E, e, null, loc);
        throw new ElabError(`'${e.name}' is not declared`, loc);
      }
      if (entry.kind === 'sig') return { k: 'sig', sig: entry.sig, t: entry.t || entry.sig.t, name: e.name };
      if (entry.kind === 'loc') return { k: 'loc', i: entry.i, t: entry.t, name: e.name };
      if (entry.kind === 'alias' && entry.lv) return entry.lv;
      throw new ElabError(`cannot assign to '${e.name}'`, loc);
    }
    case 'index': {
      const base = bindLvalue(E, e.base, loc);
      const index = bindExpr(E, e.index, null, loc);
      if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem };
      return { k: 'bit', base, index, t: BIT };
    }
    case 'slice': {
      const base = bindLvalue(E, e.base, loc);
      const n = sliceNode(E, base, e.left, e.right, loc);
      return n;
    }
    case 'pslice': {
      const base = bindLvalue(E, e.base, loc);
      const w = V.toNum(constOf(E, bindExpr(E, e.width), loc));
      return { k: 'pslice', base, start: bindExpr(E, e.start, null, loc), dir: e.dir, t: vecT(w) };
    }
    case 'apply': {
      const base = bindLvalue(E, { op: 'ref', name: e.name }, loc);
      const a = positional(e.args)[0];
      if (a.op === 'slice' && a.base == null) return sliceNode(E, base, a.left, a.right, loc);
      const index = bindExpr(E, a, null, loc);
      if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem };
      return { k: 'bit', base, index, t: BIT };
    }
    case 'concat': {
      const parts = e.parts.map(p => bindLvalue(E, p, loc));
      return { k: 'cat', parts, t: vecT(parts.reduce((a, p) => a + p.t.w, 0)) };
    }
  }
  throw new ElabError('invalid assignment target', loc);
}

function lroot(L) {
  while (L.base) L = L.base;
  return L;
}

function checkAssignable(E, target, value, loc) {
  if (E.lang !== 'vhdl') return;
  const tw = target.t.w, vw = value.t.w;
  if (target.t.kind === 'logic' && value.t.kind === 'logic' && tw !== vw && !value.t.scalar && !target.t.scalar && value.k !== 'c')
    diag(E, `width mismatch: target is ${tw} bits, value is ${vw} bits`, loc, 'warning');
}

// ---------------------------------------------------------------- statements
function bindBlock(E, stmts, loc) {
  return { k: 'blk', stmts: stmts.map(s => bindStmt(E, s, loc)).filter(Boolean), loc };
}

function bindStmt(E, s, ploc) {
  const loc = s.loc || ploc;
  try {
    return bindStmt0(E, s, loc);
  } catch (e) {
    if (!(e instanceof ElabError) && !(e instanceof SimError)) throw e;
    diag(E, e.message, e.loc || loc);
    return { k: 'null', loc };
  }
}

function bindStmt0(E, s, loc) {
  switch (s.kind) {
    case 'block': {
      const sc = new Scope(E.sc);
      const BE = { ...E, sc };
      for (const d of s.decls || []) {
        if (d.kind === 'signal') d.net = 'variable';
        bindDecl(BE, d);
      }
      return { k: 'blk', stmts: s.stmts.map(x => bindStmt(BE, x, loc)).filter(Boolean), loc };
    }
    case 'assign': {
      const target = bindLvalue(E, s.target, loc);
      const value = bindExpr(E, s.value, target.t, loc);
      if (E.lang === 'verilog') ctxSize(value, target.t.w);
      checkAssignable(E, target, value, loc);
      const root = lroot(target.k === 'cat' ? target.parts[0] : target);
      if (E.lang === 'vhdl' && s.nonblocking && root.k === 'loc' && !E.inFunction) diag(E, `'${root.name}' is a variable: use ':='`, loc, 'warning');
      if (E.inFunction && root.k === 'sig' && !s.nonblocking) diag(E, `function assigns signal '${root.name}'`, loc, 'warning');
      const asg = {
        k: 'asg', target, value, nb: !!s.nonblocking && root.k !== 'loc',
        delay: s.delay ? bindExpr(E, s.delay, null, loc) : null, delayUnit: E.lang === 'vhdl' ? 1 : E.timeUnit, loc,
      };
      if (E.lang === 'vhdl' && asg.nb) Object.assign(asg, vhdlMech(E, s));
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
        const m = Math.max(sel.t.w, ...items.flatMap(it => it.choices.filter(c => !c.range).map(c => c.t.w)));
        ctxSize(sel, m);
        for (const it of items) for (const c of it.choices) if (!c.range) ctxSize(c, m);
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
      sc.def(s.var, { kind: 'loc', i, t: INT });
      const LE = { ...E, sc };
      return { k: 'forrange', var: i, varT: INT, from: r.from, to: r.to, down: r.down, body: bindStmt(LE, s.body, loc), loc };
    }
    case 'while': return { k: 'while', cond: vsize(E, bindExpr(E, s.cond, null, loc)), body: bindStmt(E, s.body, loc), loc };
    case 'repeat': return { k: 'repeat', count: vsize(E, bindExpr(E, s.count, null, loc)), body: bindStmt(E, s.body, loc), loc };
    case 'forever': {
      const body = bindStmt(E, s.body, loc);
      return { k: 'forever', body, hasWait: containsKind(body, ['delay', 'event', 'wait', 'task']), loc };
    }
    case 'exit': case 'next': return { k: s.kind, c: s.cond ? bindExpr(E, s.cond, null, loc) : null, loc };
    case 'return': return { k: 'ret', value: s.value ? bindExpr(E, s.value, null, loc) : null, loc };
    case 'null': return { k: 'null', loc };
    case 'delay': return { k: 'delay', amount: bindExpr(E, s.amount, null, loc), unit: E.timeUnit, stmt: s.stmt ? bindStmt(E, s.stmt, loc) : null, loc };
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
      sev: s.severity || 'error', loc,
    };
  }
  throw new ElabError(`unsupported statement '${s.kind}'`, loc);
}

const cI = n => ({ k: 'c', val: V.fromInt(n), t: INT });
// Verilog: a self-determined expression (condition, count) is sized with its own width
const vsize = (E, n) => { if (E.lang === 'verilog') ctxSize(n, n.t.w); return n; };

// VHDL signal assignment: driver semantics (inertial / transport / reject, waveform elements).
function vhdlMech(E, s) {
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

function bindCallStmt(E, s, loc) {
  const name = s.name;
  const sysName = name[0] === '$' ? name : (['finish', 'stop'].includes(name.toLowerCase()) ? name.toLowerCase() : null);
  if (sysName && !(name[0] !== '$' && E.sc.lookup(name))) {
    const args = s.args.map(a => (a.op === 'str' ? { k: 'str', value: a.value, t: STR } : bindExpr(E, a, null, loc)));
    if (sysName === '$monitor' || sysName === '$display' || sysName === '$write' || sysName === '$strobe') args.forEach(a => { if (a.k !== 'str' && E.lang === 'verilog') ctxSize(a, a.t.w); });
    if ((sysName === '$readmemh' || sysName === '$readmemb') && args[1]) {
      const L = bindLvalue(E, s.args[1], loc);
      return { k: 'sys', name: sysName, args: [args[0], L], loc };
    }
    return { k: 'sys', name: sysName, args, loc };
  }
  const entry = E.sc.lookup(name);
  if (!entry || entry.kind !== 'func') {
    if (E.lang === 'vhdl' && ['deallocate', 'write', 'writeline', 'read', 'readline'].includes(name)) {
      diag(E, `procedure '${name}' (textio) is not supported`, loc, 'warning');
      return { k: 'null', loc };
    }
    throw new ElabError(`task/procedure '${name}' is not declared`, loc);
  }
  const decl = entry.decl;
  const args = s.args.map((a, k) => {
    const p = decl.params[k];
    if (!p) throw new ElabError(`too many arguments for '${name}'`, loc);
    if (p.dir === 'out') return null;
    return bindExpr(E, a.named !== undefined ? a.value : a, null, loc);
  });
  // VHDL `signal` parameters refer to the actual signal (assignments inside the procedure drive
  // it at once, across waits), instead of being copied in and out
  const hasLoc = n => { let found = false; walk(n, x => { if (x.k === 'loc') found = true; }); return found; };
  let sigActuals = null;
  if (E.lang === 'vhdl') {
    s.args.forEach((a, k) => {
      const p = decl.params[k];
      if (!p || String(p.class || '').toLowerCase() !== 'signal') return;
      const actual = a.named !== undefined ? a.value : a;
      const rv = bindExpr(E, actual, null, loc);
      const lv = p.dir !== 'in' ? bindLvalue(E, actual, loc) : null;
      if (hasLoc(rv) || (lv && hasLoc(lv))) return;     // actual uses process variables: copy semantics
      (sigActuals ||= [])[k] = { rv, lv };
    });
  }
  const fn = boundFunction(entry, s.args.map((a, k) => args[k] || bindLvalue(E, a.named !== undefined ? a.value : a, loc)), loc, sigActuals);
  const outTargets = s.args.map((a, k) => (decl.params[k] && decl.params[k].dir !== 'in' && !sigActuals?.[k] ? bindLvalue(E, a.named !== undefined ? a.value : a, loc) : null));
  if (sigActuals) args.forEach((_, k) => { if (sigActuals[k]) args[k] = null; });
  return { k: 'task', fn, args, outTargets, loc };
}

function bindTrigger(E, expr, edge, loc) {
  const n = bindExpr(E, expr, null, loc);
  if (n.k === 'sig') return [{ sig: n.sig, edge, pos: null }];   // pos null: the whole signal
  if (n.k === 'bit' && n.base.k === 'sig' && n.index.k === 'c') return [{ sig: n.base.sig, edge, pos: bitpos(n.base.t, V.toNum(n.index.val)) }];
  const reads = readsOf(n);
  if (edge !== 'any') diag(E, 'edge on a complex expression: treated as any change', loc, 'warning');
  return [...reads].map(sig => ({ sig, edge: 'any', pos: null }));
}

// ---------------------------------------------------------------- read/write analysis
function walk(n, f) {
  if (!n || typeof n !== 'object') return;
  if (Array.isArray(n)) { for (const x of n) walk(x, f); return; }
  if (f(n) === false) return;
  for (const key in n) {
    if (key === 'sig' || key === 't' || key === 'fn' || key === 'val' || key === 'loc' || key === 'triggers') continue;
    const v = n[key];
    if (v && typeof v === 'object') walk(v, f);
  }
}

export function readsOf(n) {
  const reads = new Set();
  walk(n, x => {
    if ((x.k === 'sig' || x.k === 'edge' || x.k === 'event') && x.sig) reads.add(x.sig);
    if (x.k === 'call' && x.fn && !x.fn._visiting) {   // (guard: recursive functions)
      x.fn._visiting = true;
      try { for (const s of x.fn.reads || collectRW(x.fn.body || { k: 'null' }).reads) reads.add(s); } finally { x.fn._visiting = false; }
    }
  });
  return reads;
}

function writesOfL(L) {
  const w = new Set();
  const root = L => {
    if (L.k === 'cat') { L.parts.forEach(root); return; }
    while (L.base) L = L.base;
    if (L.k === 'sig') w.add(L.sig);
  };
  root(L);
  return w;
}

export function collectRW(body) {
  const reads = new Set(), writes = new Set();
  const visitL = L => {
    if (L.k === 'cat') { L.parts.forEach(visitL); return; }
    let x = L;
    while (x.base) {
      for (const key of ['index', 'left', 'right', 'start']) if (x[key]) for (const s of readsOf(x[key])) reads.add(s);
      x = x.base;
    }
    if (x.k === 'sig') writes.add(x.sig);
  };
  walk(body, x => {
    if (x.k === 'asg') {
      visitL(x.target);
      for (const s of readsOf(x.value)) reads.add(s);
      if (x.delay) for (const s of readsOf(x.delay)) reads.add(s);
      return false;
    }
    if (x.k === 'task') {
      x.args.forEach(a => { if (a) for (const s of readsOf(a)) reads.add(s); });
      x.outTargets.forEach(L => { if (L) visitL(L); });
      // signals the procedure assigns itself (signal parameters, outer signals)
      if (x.fn && x.fn.body && !x.fn._visiting) {
        x.fn._visiting = true;
        for (const s of collectRW(x.fn.body).writes) writes.add(s);
        x.fn._visiting = false;
      }
      return false;
    }
    if (x.k === 'sys' && (x.name === '$readmemh' || x.name === '$readmemb') && x.args[1]) { visitL(x.args[1]); return false; }
    if ((x.k === 'sig' || x.k === 'edge' || x.k === 'event') && x.sig) reads.add(x.sig);
    if (x.k === 'call' && x.fn && x.fn.body && !x.fn._visiting) {
      x.fn._visiting = true;
      const rw = collectRW(x.fn.body);
      x.fn._visiting = false;
      for (const s of rw.reads) reads.add(s);
    }
  });
  return { reads, writes };
}

function triggersOfReads(n) {
  if (!n) return [];
  return [...collectRW(n).reads].map(sig => ({ sig, edge: 'any', pos: null }));
}

function containsKind(n, kinds) {
  let found = false;
  walk(n, x => { if (kinds.includes(x.k)) found = true; return !found; });
  return found;
}

// ---------------------------------------------------------------- misc
export function exprText(e) {
  if (!e) return '';
  switch (e.op) {
    case 'lit': return e.scalar ? `'${e.bits}'` : (e.bits.length <= 8 ? `"${e.bits}"` : `0x${BigInt('0b' + e.bits.replace(/[xz]/g, '0')).toString(16)}`);
    case 'int': return e.value;
    case 'real': return String(e.value);
    case 'phys': return `${e.value} ${e.unit}`;
    case 'str': return JSON.stringify(e.value);
    case 'ref': return e.name;
    case 'index': return `${exprText(e.base)}[${exprText(e.index)}]`;
    case 'slice': return `${exprText(e.base)}[${exprText(e.left)}:${exprText(e.right)}]`;
    case 'pslice': return `${exprText(e.base)}[${exprText(e.start)}${e.dir}:${exprText(e.width)}]`;
    case 'apply': return `${e.name}(${e.args.map(a => exprText(a.named !== undefined ? a.value : a)).join(', ')})`;
    case 'call': return `${e.name}(${e.args.map(exprText).join(', ')})`;
    case 'concat': return `{${e.parts.map(exprText).join(', ')}}`;
    case 'repl': return `{${exprText(e.count)}{${exprText(e.value)}}}`;
    case 'unary': return `${e.o}${exprText(e.a)}`;
    case 'binary': return `${exprText(e.a)} ${e.o} ${exprText(e.b)}`;
    case 'cond': return `${exprText(e.cond)} ? ${exprText(e.then)} : ${exprText(e.else)}`;
    case 'attr': return `${exprText(e.prefix)}'${e.attr}`;
    case 'aggregate': return `(${e.items.map(i => (i.choices ? i.choices.map(c => (c === 'others' ? 'others' : c.range ? '..' : exprText(c))).join('|') + ' => ' : '') + exprText(i.value)).join(', ')})`;
    case 'qualified': return `${e.type}'(${exprText(e.expr)})`;
    case 'fill': return `'${e.bit}`;
  }
  return '?';
}
