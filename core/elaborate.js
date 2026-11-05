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
import { evalE, runSync, exec, strToVal } from './interp.js';
import { purityErrors } from './vhdl/purity.js';
import { declaredNames, interfaceNames, labelErrors } from './vhdl/labels.js';
import {
  BUILTIN_SUBPROGRAMS, bindExpr, defSubAlias, fieldNode, hierResolve, notDeclared, packedElem, positional, sliceNode,
} from './elab-expr.js';
import { bindBlock, cI } from './elab-stmt.js';
import { addProc, elabInstance, newSignal } from './elab-instance.js';
export { bindBlock, cI } from './elab-stmt.js';
export { newSignal } from './elab-instance.js';
// (bindExpr, exported by elaborate.js before #405, still exported from here)
export { bindExpr };

export const INT = { kind: 'int', w: 32, s: true, left: 31, right: 0, desc: true };
export const BOOL = { kind: 'bool', w: 1, s: false, left: 0, right: 0, desc: true, scalar: true };
export const BIT = { kind: 'logic', w: 1, s: false, left: 0, right: 0, desc: true, scalar: true };
export const TIME = { kind: 'time', w: 64, s: true, left: 63, right: 0, desc: true };
export const REAL = { kind: 'real', w: 64, s: true, left: 63, right: 0, desc: true };
export const STR = { kind: 'str', w: 0, s: false };
// VHDL CHARACTER: an enumeration of the 256 ISO 8859-1 characters (values: the character codes)
export const CHAR = { kind: 'enum', name: 'character', char: true, names: Array.from({ length: 256 }, (_, i) => String.fromCharCode(i)), w: 8, s: false, left: 7, right: 0, desc: true };
export const charConst = ch => ({ k: 'c', val: V.fromInt(ch.charCodeAt(0) & 255, 8, false), t: CHAR });
// a character literal of a user enumeration type (type abc is ('A', 'B', 'C'))
export function enumChar(t, ch) {
  const i = t.names.indexOf(`'${ch}'`);
  return i < 0 ? null : { k: 'c', val: V.fromInt(i, t.w, false), t };
}
export const vecT = (w, s = false) => ({ kind: 'logic', w, s, left: w - 1, right: 0, desc: true });

export const PHYS = { fs: 0.001, ps: 1, ns: 1e3, us: 1e6, ms: 1e9, sec: 1e12, s: 1e12 };

export class ElabError extends Error {
  constructor(msg, loc) { super(msg); this.loc = loc; }
}

// VHDL subprograms of one name from several regions (a package's own and one a use clause makes
// visible: light8080's hstr(unsigned) and txt_util's hstr(std_logic_vector)) are overloads of each
// other; the inner ones come first, so one of the same signature hides the outer one
const vhdlFunc = e => e?.kind === 'func' && e.E?.lang === 'vhdl';
function mergeFuncs(a, b) {
  const alts = [...new Set([...(a.alts || [a]), ...(b.alts || [b])])];
  return alts.length === (a.alts || [a]).length ? a : { ...a, alts };
}

export class Scope {
  constructor(parent = null) { this.map = new Map(); this.parent = parent; }
  def(name, entry) { this.map.set(name, entry); return entry; }
  get(name) { return this.map.get(name); }
  lookup(name) {
    let found = null;
    for (let s = this; s; s = s.parent) {
      const e = s.get(name);
      if (!e) continue;
      if (!found) { if (!vhdlFunc(e)) return e; found = e; continue; }
      if (!vhdlFunc(e)) break;
      found = mergeFuncs(found, e);
    }
    return found;
  }
  local(name) { return this.get(name) || null; }
}

// SystemVerilog: the scope of the packages a module (or package) imports and of every package's
// scoped names (p::name), looked up in the package scopes when used (packages that import each
// other are complete by then; a copy made while one was being elaborated would miss its names)
class ImportScope extends Scope {
  constructor(parent, imports, scoped) { super(parent); this.imports = imports; this.scoped = scoped; }
  get(name) {
    const own = this.map.get(name);
    if (own) return own;
    const i = name.indexOf('::');
    if (i > 0) return this.scoped.get(name.slice(0, i))?.map.get(name.slice(i + 2));
    for (const ps of this.imports) { const e = ps.map.get(name); if (e) return e; }
    return undefined;
  }
}

// The slots of a process's or a subprogram's variables. A subprogram declared in a process or in
// another subprogram reads and writes the variables of the enclosing ones in their frames (#182):
// level is the depth of the frame (a process's, or a subprogram's declared outside processes: 0),
// parent the enclosing one.
export class FrameBuilder {
  constructor(parent = null) { this.inits = []; this.types = []; this.parent = parent; this.level = parent ? parent.level + 1 : 0; }
  alloc(t, init) { this.inits.push(init); this.types.push(t); return this.inits.length - 1; }
  makeInit() {
    const inits = this.inits;
    return () => inits.map(v => (Array.isArray(v) ? v.slice() : v));
  }
  probe() { return this.inits.map(v => (Array.isArray(v) ? v.slice() : v)); }
}

// A context to evaluate an expression at elaboration: the variables (loop variables, those of the
// enclosing frames) at their initial values, no run-time checks
export function probeCtx(E) {
  const outer = [];
  for (let f = E.fb?.parent; f; f = f.parent) outer.unshift(f.probe());
  return { frame: E.fb ? E.fb.probe() : [], outer, sim: null, depth: 0, probe: true };
}

// A variable: a slot of its frame; one of an enclosing process or subprogram (a procedure declared
// in a process using the process's variables, #182) names that frame's level (up)
export const locNode = (E, entry, name) => ({ k: 'loc', i: entry.i, t: entry.t, name, ...(E.fb && entry.lvl != null && entry.lvl !== E.fb.level ? { up: entry.lvl } : {}) });

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
  // pure functions (#185) using what another file declares: a package's signals and impure
  // functions, the ports of an entity (each file's parse reported what it declares itself; this
  // one, with all the files, replaces it: the first thing a function uses may be of another file)
  const at = e => `${e.file}:${e.line}:${e.check}`;
  for (const pf of parsedFiles) {
    if (pf.lang !== 'vhdl' || (pf.errors || []).some(e => e.severity === 'error')) continue;
    for (const e of purityErrors(pf.units, { file: pf.file, text: pf.text, packages: n => lib.packages.get(n), entityOf: a => findModule(lib, a.entity) })) {
      const k = lib.errors.findIndex(x => at(x) === at(e));
      if (k >= 0) lib.errors[k] = e; else lib.errors.push(e);
    }
  }
  for (const a of archs) {
    const ent = findModule(lib, a.entity);
    if (!ent) { lib.errors.push({ file: a.file, line: a.loc?.line || 1, col: 1, severity: 'error', message: `architecture '${a.name}' of unknown entity '${a.entity}'` }); continue; }
    // the labels of an architecture of an entity of another file: not the names of its ports,
    // generics, declarations (#192; those of the architecture itself were checked by the parser)
    if (a.labels) {
      const names = [...interfaceNames(ent), ...(ent.entityOnly ? declaredNames(ent.decls) : [])].map(n => ({ ...n, file: ent.file }));
      lib.errors.push(...labelErrors(a.labels, names, a.file, { labels: false }));
    }
    ent.decls = [...(ent.decls || []), ...a.decls];
    if (a.components) ent.components = a.components;
    ent.items = a.items;
    ent.uses = [...new Set([...(ent.uses || []), ...(a.uses || [])])];
    ent.archFile = a.file;
    if (a.slvArith) ent.slvArith = a.slvArith;
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

// The roots of the Implementation view's hierarchy (#2877), as ISE's: the top module first, always a root (its
// sub-tree under it) even when another module instantiates it, then the `visible` modules no visible module
// instantiates (a module instantiated only from a test bench is a root too; the top's former parent one of them).
export function implRoots(lib, { top = '', visible = () => true } = {}) {
  const used = new Set();
  const visit = items => {
    for (const it of items || []) {
      if (it.kind === 'instance') used.add(it.module.toLowerCase());
      if (it.items) visit(it.items);
      if (it.then) visit(it.then);
      if (it.else) visit(it.else);
    }
  };
  for (const m of lib.modules.values()) if (visible(m.name)) visit(m.items);
  const topMod = top ? findModule(lib, top) : null;
  const first = topMod && visible(topMod.name) ? [topMod.name] : [];
  return first.concat([...lib.modules.values()].filter(m => m !== topMod && visible(m.name) && !used.has(m.name.toLowerCase())).map(m => m.name));
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

export function diag(E, msg, loc, sev = 'error', tool) {
  // (an expression without a location, as a call in a declaration's range: the declaration's, #16)
  if (!loc?.line) loc = E.at || loc;
  E.ctx.design.diags.push({ file: E.file, line: loc?.line || 1, col: loc?.col || 1, severity: sev, message: msg, ...(tool ? { tool } : {}) });
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
  const lang = pkg.lang || 'vhdl';
  // (cached before its parent scope is made: packages that refer to each other)
  const sc = new Scope(null);
  ctx.pkgScopes.set(name, sc);
  sc.parent = usesScope(ctx, pkg, lang);
  // package-level signals (e.g. SIMPRIM's GSR / GTS) belong to the package: one per design
  const pinst = { name: pkg.name, path: pkg.name, signals: [], procs: [], children: [], params: [], ports: [] };
  const E = { ctx, lang, sc, inst: pinst, file: pkg.file, timeUnit: lang === 'verilog' ? (pkg.timescale?.unit ?? 1000) : 1, fb: null, prefix: '', slvArith: pkg.slvArith };
  for (const d of pkg.decls) {
    try { bindDecl(E, d); } catch (e) { if (!(e instanceof ElabError)) throw e; diag(E, e.message, e.loc || d.loc); }
  }
  return sc;
}

export function usesScope(ctx, mod, lang) {
  const base = lang === 'vhdl' ? BUILTIN_VHDL : BUILTIN_VLOG;
  // SystemVerilog: every package's names by their scoped names (p::W, p::w_t, p::f(x))
  const vpkgs = lang === 'verilog' ? [...ctx.lib.packages.values()].filter(p => p.lang === 'verilog' && p !== mod) : [];
  if ((!mod.uses || !mod.uses.length) && !vpkgs.length) return base;
  if (lang === 'verilog') {
    const scoped = new Map(), imports = [];
    for (const p of vpkgs) { const ps = packageScope(ctx, p.name, mod.file, mod.loc, null); if (ps) scoped.set(p.name, ps); }
    for (const u of mod.uses || []) { const ps = packageScope(ctx, u, mod.file, mod.loc, { ctx, file: mod.file }); if (ps) imports.push(ps); }
    return new ImportScope(base, imports, scoped);
  }
  const sc = new Scope(base);
  for (const u of mod.uses || []) {
    const ps = packageScope(ctx, u, mod.file, mod.loc, { ctx, file: mod.file });
    if (ps) for (const [k, v] of ps.map) { const prev = sc.local(k); sc.def(k, vhdlFunc(prev) && vhdlFunc(v) ? mergeFuncs(prev, v) : v); }
  }
  return sc;
}

// ---------------------------------------------------------------- declarations
export function bindDecl(E, d) {
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
      let n = bindExpr(E, d.value, t, d.loc);
      if (t?.signedOnly) n = signedOnly(n);
      else if (E.lang === 'verilog' && t) { n = strVec(E, n); ctxSize(n, t.w); }
      let val = constOf(E, n, d.loc);
      let ft = t;
      // (an unconstrained type: the value's bounds, #2548; a bit-string literal's or an aggregate's are those of the
      // index subtype, natural: 0 to n - 1)
      if (!t || (t.kind === 'logic' && t.unconstrained) || t.signedOnly) ft = n.t;
      else if (t.kind === 'array' && t.unconstrained && !n.t.unconstrained) ft = n.t;
      else val = fitAny(val, t);
      if (t?.kind === 'logic' && t.unconstrained && E.lang === 'vhdl' && ft.kind === 'logic' && ft.w > 1
        && ((d.value.op === 'lit' && !d.value.scalar) || d.value.op === 'aggregate')) ft = { ...ft, left: 0, right: ft.w - 1, desc: false };
      E.sc.def(d.name, { kind: 'const', val, t: ft });
      return;
    }
    case 'signal': {
      const t = elabType(E, d.type);
      let init = defaultValue(t, E.lang, d.net);
      let lateInit = null;
      if (d.init) {
        const n = bindExpr(E, d.init, t, d.loc);
        if (E.lang === 'verilog') ctxSize(n, t.w);
        // a module variable's initializer that is not constant (integer b = a + 1;, IEEE 1800-2017
        // 10.5): evaluated once at time 0, before the initial and always procedures start
        if (E.lang === 'verilog' && !E.fb && !isConstNode(n)) lateInit = n;
        else if (E.lang === 'verilog' && E.fb && !isConstNode(n)) {
          // (an automatic one's initializer is an assignment at each entry: the parser made it so)
          throw new ElabError(`'${d.name}': a static variable of a block or a subprogram is initialized once, before time 0: its initializer must be constant; declare it automatic to initialize it at each entry (IEEE 1800-2017 6.21)`, d.loc);
        } else init = fitAny(constOf(E, n, d.loc), t);
      }
      if (E.fb && (d.net === 'variable' || E.inProcess)) {
        const i = E.fb.alloc(t, init);
        E.sc.def(d.name, { kind: 'loc', i, t, lvl: E.fb.level });
        return;
      }
      if (E.sc.local(d.name) && E.sc.local(d.name).kind === 'sig') { diag(E, `'${d.name}' redeclared`, d.loc, 'warning'); return; }
      // Verilog: a net without drivers is z (tri0 / tri1: pulled to 0 / 1)
      if (E.lang === 'verilog' && d.net === 'wire' && !d.init && t.kind === 'logic') init = d.wired === 'tri0' ? V.zero(t.w) : d.wired === 'tri1' ? V.mk(t.w, V.mask(t.w)) : V.mk(t.w, V.mask(t.w), V.mask(t.w), t.s);
      const sig = newSignal(E, E.prefix + d.name, t, init, d.net === 'variable' ? 'var' : 'signal', d.loc);
      if (d.init && !lateInit) sig.hasInit = true;
      if (lateInit) {
        const proc = addProc(E, { name: `${E.prefix}${d.name}_init`, kind: 'process', mode: 'initial', body: { k: 'asg', target: { k: 'sig', sig, t, name: d.name }, value: lateInit, nb: false, loc: d.loc },
          triggers: [], lang: E.lang, loc: d.loc, file: E.file });
        proc.declInit = true;   // (runs before the procedures: the simulator starts it first)
      }
      if (d.net === 'reg') sig.net = 'reg';   // (Verilog reg: a variable in VCD files)
      if (d.wired) sig.wired = d.wired;
      if (E.lang === 'verilog' && d.net === 'wire' && !d.init && t.kind === 'logic' && !d.wired) sig.netZ = true;   // (x once it has drivers)
      E.sc.def(d.name, { kind: 'sig', sig, t });
      return;
    }
    case 'function': case 'task': {
      // (outerFb: the frame of the process or subprogram it is declared in, whose variables it uses)
      const ent = { kind: 'func', decl: d, E: { ...E, fb: null, outerFb: E.fb, inProcess: false }, cache: new Map() };
      // VHDL overloading: subprograms of one name in one region (chosen per call: pickOverload)
      const prev = E.lang === 'vhdl' ? E.sc.local(d.name) : null;
      if (prev && prev.kind === 'func') ent.alts = [...(prev.alts || [prev]), ent];
      E.sc.def(d.name, ent);
      return;
    }
    // a VHDL file object: a name (procedures take it as a file parameter; textio writes are ignored)
    // (its value: the external file's name, with its open mode, for textio's readline / writeline)
    case 'file': E.sc.def(d.name, { kind: 'const', val: { str: d.ext ?? d.name, mode: d.mode || 'read_mode' }, t: STR, file: true }); return;
    case 'subalias': defSubAlias(E, d.name, d.target); return;
    case 'alias': {   // VHDL object alias: reads and writes go to the aliased object (or slice)
      // `alias f is g;` without a signature: an alias of subprogram g when g is one
      if (d.target.op === 'ref' && !d.type) {
        const te = E.sc.lookup(d.target.name);
        if (te ? te.kind === 'func' || te.kind === 'subalias' : BUILTIN_SUBPROGRAMS.has(d.target.name)) { defSubAlias(E, d.name, d.target.name); return; }
      }
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

// A packed array of elements of type elem (SystemVerilog logic [0:3][7:0], my_t [3:0]): a vector
// [n * w - 1 : 0] whose packed.left / right / desc are the declared range of its elements
function packedOf(E, range, elem, signed = false) {
  const { left, right, desc } = evalRange(E, range);
  const n = Math.abs(left - right) + 1, w = n * elem.w;
  return { kind: 'logic', w, s: !!signed, left: w - 1, right: 0, desc: true, packed: { left, right, desc, n, elem } };
}

export function elabType(E, ts, allowUnconstrained = false) {
  // SystemVerilog packed dimensions after the first one (logic [0:3][7:0]): the outer dimensions
  // are arrays of the inner ones
  if (ts.kind === 'logic' && ts.inner?.length) {
    const elem = elabType(E, { ...ts, range: ts.inner[0], inner: ts.inner.slice(1), signed: false });
    return packedOf(E, ts.range, elem, ts.signed);
  }
  if ((ts.kind === 'named' || ts.kind === 'struct' || ts.kind === 'svenum') && ts.dims?.length) {
    const elem = elabType(E, { ...ts, dims: ts.dims.slice(1) });
    return packedOf(E, ts.dims[0], elem);
  }
  switch (ts.kind) {
    case 'struct': {
      // packed structure: the first member is the most significant
      const fields = ts.fields.map(f => ({ name: f.name, t: elabType(E, f.type) }));
      // (a packed union: every member from bit 0, the union as wide as its widest member)
      if (ts.union) {
        const w = Math.max(0, ...fields.map(f => f.t.w));
        return { kind: 'logic', w, s: !!ts.signed, left: w - 1, right: 0, desc: true, members: fields.map(f => ({ name: f.name, t: f.t, lo: 0 })) };
      }
      let lo = fields.reduce((a, f) => a + f.t.w, 0);
      const w = lo;
      const members = fields.map(f => { lo -= f.t.w; return { name: f.name, t: f.t, lo }; });
      return { kind: 'logic', w, s: !!ts.signed, left: w - 1, right: 0, desc: true, members };
    }
    case 'svenum': {
      // the names are constants of the base type (int by default): each one more than the one
      // before it, unless it is given a value (IEEE 1800-2017 6.19)
      const base = ts.base ? elabType(E, ts.base) : INT;
      let next = V.fromInt(0, base.w, !!base.s);
      for (const it of ts.items) {
        if (it.value) {
          const n = bindExpr(E, it.value, base, it.loc);
          ctxSize(n, base.w);
          next = fitAny(constOf(E, n, it.loc), base);
        }
        E.sc.def(it.name, { kind: 'const', val: next, t: base });
        next = V.withSign(V.add(next, V.fromInt(1, base.w, false), base.w, !!base.s), !!base.s);
      }
      return base;
    }
    case 'logic': {
      // mark: std_logic_vector / bit_vector (not the numeric_std unsigned / signed types)
      const mk = ts.mark ? { mark: ts.mark } : null;
      // a Verilog parameter declared `signed` without a range: the range of its value (signedOnly)
      if (!ts.range && ts.signedOnly) return { ...BIT, s: true, signedOnly: true };
      if (!ts.range) {
        if (ts.unconstrained) return { ...vecT(1, ts.signed), unconstrained: true, ...mk };
        return { ...BIT, s: !!ts.signed };
      }
      const r = evalRange(E, ts.range), { left, right, desc } = r;
      const w = rangeLen(r);
      return { kind: 'logic', w, s: !!ts.signed, left, right, desc, ...mk };
    }
    case 'integer': {
      const t = { ...INT };
      if (ts.range) {
        const r = evalRange(E, ts.range);
        t.rlo = Math.min(r.left, r.right); t.rhi = Math.max(r.left, r.right);
        // its bounds and direction as written (#61): `range 10 downto 0` ('left is the high bound),
        // and a null range (`range 5 to 3`: no value, 'low = 'left) kept null
        t.rleft = r.left; t.rright = r.right;
        if (r.desc) t.rdown = true;
        if (r.isNull) t.rnull = true;
      }
      return t;
    }
    case 'boolean': return BOOL;
    case 'time': return TIME;
    case 'real': return REAL;
    // string(1 to n): its length, for its default value (n times character'left: a variable that is
    // then written character by character, neorv32's to_hexstring_f)
    case 'string': {
      if (!ts.range) return STR;
      const r = evalRange(E, ts.range);
      return { ...STR, slen: rangeLen(r) };
    }
    case 'character': return CHAR;
    case 'array': {
      const elem = elabType(E, ts.elem);
      if (!ts.range) return { kind: 'array', unconstrained: true, elem, w: 0, ...indexStart(E, ts.index) };
      const r = evalRange(E, ts.range), { left, right, desc } = r;
      const lo = Math.min(left, right), len = rangeLen(r);
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
          if (allowUnconstrained) return { kind: 'array', unconstrained: true, elem: elabType(E, e.unconstrained.elem), w: 0, name: e.name, ...indexStart(E, e.unconstrained.index) };
          throw new ElabError(`unconstrained type '${ts.name}' needs an index range`);
        }
        return { ...elabType(E, { ...e.unconstrained, range: ts.range }), name: e.name };
      }
      if (ts.range && e.t.kind === 'logic') return elabType(E, { kind: 'logic', range: ts.range, signed: e.t.s, mark: e.t.mark });
      if (E.lang === 'verilog' && e.t?.name) { const { name, ...t } = e.t; return t; }   // (a Verilog typedef: the type itself)
      return e.t;
    }
    case 'enum': throw new ElabError('anonymous enum types are not supported');
    case 'record': {
      // a record is an array of its fields (values: JS arrays), with one type per field
      const fields = ts.fields.map(f => ({ name: f.name, t: elabType(E, f.type) }));
      const n = fields.length;
      return { kind: 'array', fields, left: 0, right: n - 1, desc: false, lo: 0, len: n, elem: fields[0]?.t || INT, w: fields.reduce((a, f) => a + (f.t.w || 0), 0) };
    }
  }
  throw new ElabError(`unsupported type '${ts.kind}'`);
}

// The left bound and the direction of an unconstrained array's index subtype (`natural range <>`: 0, ascending;
// `positive range <>`: 1): those of a positional aggregate of the type (IEEE 1076-2008 9.3.3.3, #2548)
function indexStart(E, name) {
  const std = name && !E.sc.lookup(name) && stdTypeName(name);
  const it = !name ? null : std ? elabType(E, std) : elabType(E, { kind: 'named', name });
  return it?.kind === 'int' ? { ileft: scalarBounds(it)[0], idesc: !!it.rdown } : { ileft: 0, idesc: false };
}

export function stdTypeName(n) {
  switch (n.toLowerCase()) {
    case 'std_logic': case 'std_ulogic': case 'bit': return { kind: 'logic', range: null, signed: false };
    case 'std_logic_vector': case 'std_ulogic_vector': return { kind: 'logic', range: null, signed: false, unconstrained: true, mark: 'std_logic_vector' };
    // std.textio's TEXT (a file of lines) and LINE: names only (reading / writing files is not
    // modelled: textio calls are ignored with a warning)
    case 'text': case 'line': return { kind: 'string' };
    case 'bit_vector': return { kind: 'logic', range: null, signed: false, unconstrained: true, mark: 'bit_vector' };
    case 'unsigned': return { kind: 'logic', range: null, signed: false, unconstrained: true };
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
    case 'character': return { kind: 'character' };
  }
  return null;
}

export function evalRange(E, r) {
  const er = evalRange0(E, r);
  // VHDL null range (`-1 downto 0`, `0 to -1`, IEEE 1076-2008 5.2.1): no element (a Verilog range
  // takes its direction from its bounds, so it is never null)
  if (er.desc ? er.left < er.right : er.left > er.right) er.isNull = true;
  return er;
}

function evalRange0(E, r) {
  if (r.of && r.of.op === 'ref' && (E.sc.lookup(r.of.name)?.kind === 'type' || (!E.sc.lookup(r.of.name) && stdTypeName(r.of.name)))) {
    // the range of a (sub)type: integer subtypes, enumerations, constrained vectors
    const te = E.sc.lookup(r.of.name);
    const t = te ? te.t : elabType(E, stdTypeName(r.of.name));
    if (!t) throw new ElabError(`'${r.of.name}' has no range`, r.of.loc);
    let lr;
    if (t.kind === 'int') lr = scalarBounds(t);
    else if (t.kind === 'enum') lr = [0, t.names.length - 1];
    else if (t.kind === 'bool') lr = [0, 1];
    else lr = [t.left, t.right];
    const desc = t.kind === 'int' ? !!t.rdown : t.kind === 'enum' || t.kind === 'bool' ? false : t.desc;
    if (r.reverse) return { left: lr[1], right: lr[0], desc: !desc };
    return { left: lr[0], right: lr[1], desc };
  }
  if (r.of) {
    const n = bindExpr(E, r.of, null);
    const t = n.t;
    // a string of a known length (a constant's, string(1 to n)): 1 to its length (#2548)
    const slen = t.kind !== 'str' ? null : t.slen ?? (n.k === 'c' && typeof n.val?.str === 'string' ? n.val.str.length : null);
    if (slen !== null) return r.reverse ? { left: slen, right: 1, desc: true } : { left: 1, right: slen, desc: false };
    if (t.kind === 'str') throw new ElabError("'range of a string is not supported (use std_logic_vector)", r.of.loc);
    if (r.reverse) return { left: t.right, right: t.left, desc: !t.desc };
    return { left: t.left, right: t.right, desc: t.desc };
  }
  const left = V.toNum(constOf(E, bindExpr(E, r.left), r.left.loc));
  const right = V.toNum(constOf(E, bindExpr(E, r.right), r.right.loc));
  const desc = r.dir ? r.dir === 'downto' : left >= right;
  return { left, right, desc };
}

// The number of elements of an evaluated range (0 for a VHDL null range)
const rangeLen = r => (r.isNull ? 0 : Math.abs(r.left - r.right) + 1);

// [left, right] of an integer (sub)type, as declared (integer: -2**31 to 2**31 - 1)
export const scalarBounds = t => (t.rleft !== undefined ? [t.rleft, t.rright]
  : t.rlo !== undefined ? (t.rdown ? [t.rhi, t.rlo] : [t.rlo, t.rhi]) : [-2147483648, 2147483647]);

export function defaultValue(t, lang, net) {
  switch (t.kind) {
    case 'logic': return V.allX(t.w, t.s);
    case 'int': {
      if (lang === 'verilog') return V.allX(32, true);
      return V.fromInt(scalarBounds(t)[0], 32, true);   // T'left
    }
    case 'bool': return V.ZERO;
    case 'enum': return V.mk(t.w, 0n);
    case 'time': return V.fromInt(0, 64, true);
    case 'real': return V.fromInt(0, 64, true);
    case 'str': return { str: t.slen ? '\u0000'.repeat(t.slen) : '' };
    case 'array':
      if (t.fields) return t.fields.map(f => defaultValue(f.t, lang, net));
      return t.unconstrained ? [] : Array.from({ length: t.len }, () => defaultValue(t.elem, lang, net));
  }
  return V.allX(t.w || 1);
}

// The dimensions of a type, { left, right } each: the unpacked ones (arrays), then the packed ones
export function dimsOf(t) {
  if (t.kind === 'array' && !t.fields) return [{ left: t.left, right: t.right }, ...dimsOf(t.elem)];
  if (t.packed) return [{ left: t.packed.left, right: t.packed.right }, ...dimsOf(t.packed.elem)];
  if (t.kind === 'logic' || t.kind === 'int' || t.kind === 'enum') return [{ left: t.left, right: t.right }];
  return [];
}

// A Verilog string used as a value: a vector of 8 bits per character (IEEE 1364-2005 3.6)
export function strVec(E, n) {
  if (E.lang !== 'verilog' || n.t.kind !== 'str') return n;
  const str = n.k === 'str' ? n.value : n.k === 'c' && n.val?.str !== undefined ? n.val.str : null;
  if (str === null) return n;
  const val = strToVal(str);
  return { k: 'c', val, t: vecT(val.w) };
}

// the value of a parameter declared `signed` without a range: its own width, signed; a real value
// converted to an integer
export function signedOnly(n) {
  if (n.t.kind === 'real') return fold({ k: 'conv', a: n, ext: true, rtoi: true, round: true, t: INT });
  if (n.t.kind === 'str') return n;
  return fold({ k: 'conv', a: n, ext: !!n.t.s, t: n.t.kind === 'int' ? INT : vecT(n.t.w, true) });
}

export function fitVal(v, t) {
  if (v.str !== undefined || Array.isArray(v)) return v;
  return V.withSign(V.resize(v, t.w), t.s);
}
export function fitAny(v, t) {
  if (t.kind === 'str') return v.str !== undefined ? v : { str: String(V.toDec(v)) };
  if (t.kind === 'array') {
    if (!Array.isArray(v)) throw new ElabError('array value expected');
    return v.map((e, k) => fitAny(e, t.fields ? t.fields[k].t : t.elem));
  }
  if (v.str !== undefined) return fitVal(strToVal(v.str), t);
  return fitVal(v, t);
}

// ---------------------------------------------------------------- constant evaluation
function constCtx() { return { frame: [], sim: null, depth: 0 }; }

export function constOf(E, n, loc) {
  if (n.k === 'c') return n.val;
  if (!isConstNode(n)) throw new ElabError('expression is not constant', loc);
  try { return evalE(n, constCtx()); }
  catch (e) { throw new ElabError(e.message, loc); }
}

export function isConstNode(n) {
  switch (n.k) {
    case 'c': case 'str': return true;
    case 'sig': case 'loc': case 'edge': case 'event': case 'sys': case 'now': case 'sigattr': case 'textio_eof': return false;
    case 'chr': return isConstNode(n.base) && isConstNode(n.index);
    case 'strlen': return isConstNode(n.a);
    case 'call': return !n.fn.impure && n.args.every(isConstNode);
    default:
      for (const key of ['a', 'b', 'c', 'base', 'index', 'left', 'right', 'start', 'count']) if (n[key] && typeof n[key] === 'object' && n[key].k && !isConstNode(n[key])) return false;
      for (const key of ['parts', 'elems', 'args']) if (n[key] && !n[key].every(isConstNode)) return false;
      return true;
  }
}

export function fold(n) {
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
// (self-determined operands are sized with their own width), and the signedness of the expression:
// the operands of a context-determined operator take the sign of the whole expression before they
// are extended (IEEE 1364-2005 5.5.4: in `u + (s1 + s2)` with an unsigned u, s1 and s2 are
// zero-extended). n.es is that evaluation sign (n.t.s stays the operator's own type).
export function ctxSize(n, w, s = n?.t?.s) {
  if (!n || !n.t) return;
  const self = x => { if (x && x.t) ctxSize(x, x.t.w, x.t.s); };
  s = !!s;
  switch (n.k) {
    case 'bin': {
      const o = n.o;
      if (['==', '!=', '===', '!==', '<', '<=', '>', '>='].includes(o)) {
        // the operands are sized (and signed) with each other, not with the context
        const m = Math.max(n.a.t.w, n.b.t.w), os = !!(n.a.t.s && n.b.t.s);
        n.cw = m; ctxSize(n.a, m, os); ctxSize(n.b, m, os);
        return;
      }
      if (o === '&&' || o === '||') { self(n.a); self(n.b); return; }
      n.ew = Math.max(n.t.w, w);
      n.es = s;
      ctxSize(n.a, n.ew, s);
      if (!['<<', '>>', '<<<', '>>>', '**', 'rol', 'ror'].includes(o)) ctxSize(n.b, n.ew, s);
      else self(n.b);
      return;
    }
    case 'un':
      if (n.o === '~' || n.o === '-') { n.ew = Math.max(n.t.w, w); n.es = s; ctxSize(n.a, n.ew, s); }
      else self(n.a);
      return;
    case 'cond':
      n.ew = Math.max(n.t.w, w); n.es = s; self(n.c); ctxSize(n.a, n.ew, s); ctxSize(n.b, n.ew, s);
      return;
    case 'cat': for (const p of n.parts) self(p); return;
    case 'repl': self(n.a); return;
    case 'conv': self(n.a); return;
    case 'bit': case 'elem': self(n.index); return;
    case 'c':
      if (n.src) {
        // folded constant: size the original expression and evaluate it again
        ctxSize(n.src, w, s);
        try { n.val = evalE(n.src, constCtx()); } catch { /* keep the self-determined value */ }
      } else if (n.fillBit && w > n.val.w) {
        n.val = V.fromBits(n.fillBit.repeat(w));
      } else if (n.xext && w > n.val.w) {
        // unsized 'bx / 'bz: the x / z fills the context width
        const ext = V.mask(w) ^ V.mask(n.val.w);
        n.val = V.mk(w, n.val.v | (n.xext === 'z' ? ext : 0n), n.val.x | ext, n.val.s);
      }
      return;
  }
}

// ---------------------------------------------------------------- lvalues
export function isLvalueExpr(e) {
  switch (e.op) {
    case 'ref': return true;
    case 'index': case 'slice': case 'pslice': case 'field': return isLvalueExpr(e.base);
    case 'apply': return e.args.length >= 1;
    case 'concat': return e.parts.every(isLvalueExpr);
  }
  return false;
}

export function bindLvalue(E, e, loc) {
  switch (e.op) {
    case 'ref': {
      let entry = E.sc.lookup(e.name);
      if (!entry && E.lang === 'verilog' && (e.path || e.name.includes('.'))) {
        const r = hierResolve(E, e.name, e.path, loc);
        if (r?.node) return r.node;
        entry = r?.entry || null;
      }
      if (!entry) {
        if (E.implicitNets) return bindExpr(E, e, null, loc);
        throw notDeclared(e.name, loc);
      }
      if (entry.kind === 'sig') return { k: 'sig', sig: entry.sig, t: entry.t || entry.sig.t, name: e.name };
      if (entry.kind === 'loc') return locNode(E, entry, e.name);
      if (entry.kind === 'alias' && entry.lv) return entry.lv;
      throw new ElabError(`cannot assign to '${e.name}'`, loc);
    }
    case 'index': {
      const base = bindLvalue(E, e.base, loc);
      const index = bindExpr(E, e.index, null, loc);
      const chk = E.lang === 'vhdl' ? { chk: true } : {};
      if (base.t.packed) return packedElem(base, index);
      if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem, ...chk };
      if (base.t.kind === 'str') return { k: 'chr', base, index, t: CHAR };
      return { k: 'bit', base, index, t: BIT, ...chk };
    }
    case 'slice': {
      const base = bindLvalue(E, e.base, loc);
      const n = sliceNode(E, base, e.left, e.right, loc, e.dir);
      return n;
    }
    case 'pslice': {
      const base = bindLvalue(E, e.base, loc);
      const w = V.toNum(constOf(E, bindExpr(E, e.width), loc));
      return { k: 'pslice', base, start: bindExpr(E, e.start, null, loc), dir: e.dir, t: vecT(w) };
    }
    case 'field': return fieldNode(E, bindLvalue(E, e.base, loc), e.name, loc);
    case 'apply': {
      let base = bindLvalue(E, { op: 'ref', name: e.name }, loc);
      const args = positional(e.args);
      // m(i, j) of a multi-dimensional array (an array of arrays): one index per dimension
      for (const a of args.slice(0, -1)) {
        if (base.t.kind !== 'array') throw new ElabError(`'${e.name}' indexed with ${args.length} indices`, loc);
        base = { k: 'elem', base, index: bindExpr(E, a, null, loc), t: base.t.elem };
      }
      const a = args[args.length - 1];
      if (a.op === 'slice' && a.base == null) return sliceNode(E, base, a.left, a.right, loc, a.dir);
      const index = bindExpr(E, a, null, loc);
      const chk = E.lang === 'vhdl' ? { chk: true } : {};
      if (base.t.kind === 'array') return { k: 'elem', base, index, t: base.t.elem, ...chk };
      if (base.t.kind === 'str') return { k: 'chr', base, index, t: CHAR };
      return { k: 'bit', base, index, t: BIT, ...chk };
    }
    case 'concat': {
      const parts = e.parts.map(p => bindLvalue(E, p, loc));
      return { k: 'cat', parts, t: vecT(parts.reduce((a, p) => a + p.t.w, 0)) };
    }
  }
  throw new ElabError('invalid assignment target', loc);
}

// VHDL: an assignment to an object of an integer subtype checks the value against its range
export function rangeCheck(asg) {
  const t = asg.target.t;
  if (t && t.kind === 'int' && t.rlo !== undefined && (t.rlo > -2147483648 || t.rhi < 2147483647)) asg.rng = [t.rlo, t.rhi];
}

export function lroot(L) {
  while (L.base) L = L.base;
  return L;
}

export function checkAssignable(E, target, value, loc) {
  if (E.lang !== 'vhdl') return;
  const tw = target.t.w, vw = value.t.w;
  if (target.t.kind === 'logic' && value.t.kind === 'logic' && tw !== vw && !value.t.scalar && !target.t.scalar && value.k !== 'c')
    diag(E, `width mismatch: target is ${tw} bits, value is ${vw} bits`, loc, 'warning');
}

// ---------------------------------------------------------------- read/write analysis
export function walk(n, f) {
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

export function writesOfL(L) {
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
      x.sigReads?.forEach(a => { for (const s of readsOf(a)) reads.add(s); });
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

export function triggersOfReads(n) {
  if (!n) return [];
  return [...collectRW(n).reads].map(sig => ({ sig, edge: 'any', pos: null }));
}

export function containsKind(n, kinds) {
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
