// Silinx HLS (#1960): a called function that is not inlined, a sub-module as Vitis HLS makes it: a module of its own (the
// function made as a top, core/c-hdl.js) with its block protocol (ap_start, ap_done, ap_idle, ap_ready), instantiated once
// by the caller, its calls sharing the instance: each call a state of the caller's machine (core/c-fsmd.js) that holds
// ap_start at 1 and the arguments, and waits for ap_done. What it writes (ap_return, a pointer's value) is taken when it
// comes; an array argument's or a stream argument's port is the callee's during the call. #pragma HLS INLINE as Vitis HLS
// takes it: INLINE, the function dissolved in its callers (the functions it calls are as they would be); INLINE recursive,
// the functions it calls too; INLINE off, never dissolved, recursive or not. moduleRegistry is the modules of a design, one
// per function and sizes of its arrays, shared with DATAFLOW's processes (core/c-processes.js).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   inlineMode(f) -> 'off' | 'recursive' | 'on' | null
//   hierarchy(fn, funcs, globals, structArgs, all, { large }) -> { sub(f, recursive) -> whether a call of f is a sub-module's, kept: [{ f, why }: the
//     functions off that must be inlined], shared: Map(a sub-module's name -> the globals it shares with its caller) }
//   sharedGlobals(f, names, globals, funcs) -> those globals f's arguments, its calls passing them
//   moduleRegistry({ make }) -> { of(callee, depths) -> { callee, module, gen }, modules(): callees first }
//   latencyOf(machine, callLatency) -> { min, max, loops }
//   subMethods: SeqFlow's subStmt, instPorts, subArrays
import { BOOL, typeOf } from './c-types.js';
import { hdlName } from './c-graph.js';
import { portOf, ctrlNone, ctrlChain } from './c-names.js';
import { hasDataflow } from './c-check.js';
import { hasStreams } from './c-dataflow-call.js';

const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  f(x);
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') walk(v, f);
};
const U = (w) => ({ w, s: false });
const CTRL = new Set(['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready']);

/** The arguments a function's FUNCTION_INSTANTIATE names (variable=a, b), each call's constant one made its own module's
 *  constant (#2244). */
export function instantiated(f) {
  return (f.body?.items || []).filter((s) => s.kind === 'pragma' && s.pragma.name === 'FUNCTION_INSTANTIATE')
    .flatMap((s) => String(s.pragma.args.variable ?? '').split(',').map((x) => x.trim()).filter(Boolean));
}

/** ALLOCATION instances=f limit=N function, in any function's body: f's instances at most N (the least said), #2244. */
export function allocationLimits(funcs) {
  const out = new Map();
  for (const f of funcs.values()) {
    for (const s of f.body?.items || []) {
      const a = s.kind === 'pragma' && s.pragma.name === 'ALLOCATION' ? s.pragma.args : null;
      if (!a || !(a.function !== undefined || String(a.type ?? '').toLowerCase() === 'function') || !/^\d+$/.test(String(a.limit)) || Number(a.limit) < 1) continue;
      out.set(String(a.instances), Math.min(out.get(String(a.instances)) ?? Infinity, Number(a.limit)));
    }
  }
  return out;
}

export function inlineMode(f) {
  const p = (f.body?.items || []).find((s) => s.kind === 'pragma' && s.pragma.name === 'INLINE');
  if (!p) return null;
  return p.pragma.args.off ? 'off' : p.pragma.args.recursive ? 'recursive' : 'on';
}

/** The functions f calls, directly or through others, with f. */
function tree(f, funcs, out = new Set()) {
  if (out.has(f)) return out;
  out.add(f);
  walk(f.body, (n) => { if (n.kind === 'call' && n.callee.kind === 'id' && funcs.get(n.callee.name)?.body) tree(funcs.get(n.callee.name), funcs, out); });
  return out;
}
const globalsOf = (fs, globals) => {
  const used = new Set();
  for (const f of fs) walk(f.body, (n) => { if (n.kind === 'id' && globals.has(n.name)) used.add(n.name); });
  return used;
};

export function hierarchy(fn, funcs, globals, structArgs = null, all = null, { large = false } = {}) {
  const kept = [], shared = new Map();
  // (a variable kept between calls that the callee shares with its caller: a sub-module would have its own copy)
  const written = new Set([...globals.values()].filter((g) => !g.const).map((g) => g.name));
  const why = (f) => {
    if (all) return all;
    if (ctrlNone(f)) return 'it has no block protocol (ap_ctrl_none)';
    if (ctrlChain(f)) return 'its ap_continue has no caller yet (ap_ctrl_chain)';
    // (A[]: a module's memory needs its depth, #1706)
    const open = f.params.find((pa) => pa.type.kind === 'array' && !pa.type.length && !pa.type.size);
    if (open) return `its array argument '${open.name}' has no size (${open.name}[N])`;
    if (structArgs?.get(f.name)?.length) return `its argument '${structArgs.get(f.name)[0].name}' is a struct (not yet as a sub-module's)`;
    const mine = tree(f, funcs);
    const others = new Set([...tree(fn, funcs)].filter((g) => !mine.has(g)));
    const own = globalsOf(mine, written), theirs = globalsOf(others, written);
    const both = [...own].filter((n) => theirs.has(n));
    // (a global it shares with its caller: an argument of its own, a port of the sub-module as Vitis HLS makes it, the
    // caller's variable passed at each call, #2244; but where a function it calls uses it too, or it is not an integer or
    // an array of integers of a known size)
    const inner = globalsOf([...mine].filter((g) => g !== f), written);
    const bad = both.find((n) => inner.has(n) || !portable(globals.get(n).type) || shadowed(n, tree(fn, funcs)));
    if (bad) return `the global variable '${bad}' is used by its caller too${inner.has(bad) ? ' and by a function it calls' : ''}`;
    if (both.length) shared.set(f.name, both);
    return null;
  };
  const memo = new Map();
  const able = (f) => { if (!memo.has(f.name)) memo.set(f.name, why(f)); return memo.get(f.name) === null; };
  // (a DATAFLOW region of streams the top calls among other statements: a module of its own, called each time, #1706)
  const region = (f) => f.body && hasDataflow(f) && hasStreams(f) && !all;
  for (const f of tree(fn, funcs)) if (f !== fn && inlineMode(f) === 'off' && !able(f)) kept.push({ f, why: memo.get(f.name) });
  // (large: a function with no INLINE pragma that holds a loop of its own, called outside any loop, a module of its own, as
  // Vitis HLS keeps a large function, #2244; where it cannot be, or a loop or a pipelined function calls it, inlined, said
  // nowhere. Not by default until Vitis HLS's modules of the corpus are recorded, scripts/hls-vitis.mjs)
  const looped = new Set();
  for (const g of tree(fn, funcs)) {
    const piped = (g.body?.items || []).some((s) => s.kind === 'pragma' && s.pragma.name === 'PIPELINE' && !s.pragma.args.off);
    const mark = (x) => walk(x, (c) => { if (c.kind === 'call' && c.callee?.kind === 'id') looped.add(c.callee.name); });
    if (piped) mark(g.body);
    else walk(g.body, (n) => { if (isLoop(n)) mark(n.body); });
  }
  // (what a function called in a loop calls: in that loop too, once it is inlined)
  for (let more = true; more;) {
    more = false;
    for (const g of tree(fn, funcs)) if (looped.has(g.name)) walk(g.body, (c) => { if (c.kind === 'call' && c.callee?.kind === 'id' && !looped.has(c.callee.name)) { looped.add(c.callee.name); more = true; } });
  }
  const big = (f) => large && !!f.body && !f.library && !f.blackbox && inlineMode(f) === null && !/^ap_unit_/.test(f.name) && ownLoop(f.body) && !looped.has(f.name) && able(f);
  // (off wins over a caller's recursive, as Vitis HLS's; recursive inlines one kept by default)
  const sub = (f, recursive = false) => f !== fn && ((inlineMode(f) === 'off' && able(f)) || region(f) || (!recursive && big(f)));
  // (shared: the globals each sub-module shares with its caller, its arguments, sharedGlobals)
  return { kept, sub, shared: new Map([...shared].filter(([n]) => sub(funcs.get(n)) && !region(funcs.get(n)))) };
}

// (a global a sub-module's port can be: an integer, or an array of them of a known size; a name no function of the top's
// declares again, its caller's id at the call the global)
const portable = (t) => (t.kind === 'array' ? !!(t.size || t.length) && t.of.kind !== 'array' && !!typeOf(t.of) : !!typeOf(t));
function shadowed(name, fs) {
  let hit = false;
  for (const f of fs) {
    if (f.params.some((pa) => pa.name === name)) hit = true;
    walk(f.body, (n) => { if ((n.kind === 'decl' && n.vars.some((v) => v.name === name)) || (n.kind === 'var' && n.name === name)) hit = true; });
  }
  return hit;
}

/** A sub-module's globals shared with its caller made its arguments (#2244): f's parameters (a scalar a pointer, *g its
 *  uses, as a C++ reference is made, core/cpp-tree.js; an array as it is: its ports a pointer's, g_i, g_o and g_o_ap_vld,
 *  and a memory's), each call of f in funcs given the global (&g, g). As the caller's (funcs: its functions) and as the
 *  sub-module's own (its top f, the globals then none of its). */
export function sharedGlobals(f, names, globals, funcs = null) {
  const scalars = new Set();
  for (const n of names) {
    const v = globals.get(n), arr = v.type.kind === 'array';
    if (!arr) scalars.add(n);
    f.params.push({ name: n, type: arr ? v.type : { kind: 'ptr', to: v.type }, loc: v.loc });
  }
  const deref = (x) => {
    if (!x || typeof x !== 'object') return x;
    if (Array.isArray(x)) { x.forEach((y, k) => { x[k] = deref(y); }); return x; }
    if (x.kind === 'id' && scalars.has(x.name)) return { kind: 'unary', op: '*', e: { ...x }, loc: x.loc };
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') x[k] = deref(v);
    return x;
  };
  deref(f.body);
  const arg = (n, loc) => (scalars.has(n) ? { kind: 'unary', op: '&', e: { kind: 'id', name: n, loc }, loc } : { kind: 'id', name: n, loc });
  if (funcs) for (const g of funcs.values()) walk(g.body, (c) => { if (c.kind === 'call' && c.callee?.kind === 'id' && c.callee.name === f.name) c.args.push(...names.map((n) => arg(n, c.loc))); });
}

const isLoop = (n) => n.kind === 'for' || n.kind === 'while' || n.kind === 'do';
/** A loop in a body that is not unrolled whole (#pragma HLS UNROLL with no factor in it). */
function ownLoop(body) {
  let hit = false;
  walk(body, (n) => {
    if (hit || !isLoop(n)) return;
    const items = n.body?.kind === 'block' ? n.body.items : [];
    if (!items.some((s) => s.kind === 'pragma' && s.pragma.name === 'UNROLL' && s.pragma.args.factor === undefined)) hit = true;
  });
  return hit;
}

/** The modules of a design: one per function and sizes of its arrays. make(callee, depths, module) -> cToHdl's result. */
export function moduleRegistry({ make }) {
  const mods = new Map(), made = [];
  return {
    // (binds: FUNCTION_INSTANTIATE's arguments a constant at the call, { name: BigInt }, a module of their own, #2244)
    of(callee, depths = {}, binds = null) {
      const key = `${callee} ${JSON.stringify(depths)}${binds ? ` ${JSON.stringify(Object.entries(binds).map(([k, v]) => [k, `${v}`]))}` : ''}`;
      if (!mods.has(key)) {
        const same = [...mods.values()].filter((m) => m.callee === callee).length;
        const m = { callee, depths, binds, module: `${portOf(hdlName(callee))}${same ? `_${same}` : ''}`, gen: null };
        mods.set(key, m);
        m.gen = make(callee, depths, m.module, binds);
        if (m.gen?.module) m.module = m.gen.module;   // (a module of its own name: an RTL blackbox's process, #2340)
        made.push(m);
      }
      return mods.get(key);
    },
    modules: () => made,
  };
}

/** A machine's latency in cycles, from ap_start to ap_done, as the co-simulation counts it: its states' paths, each loop
 *  its iterations; a call the cycles it waits (callLatency(block) -> { min, max } | null). A loop whose count is not
 *  known: null for its max. */
export function latencyOf(m, callLatency) {
  const num = new Map(m.blocks.map((b) => [b.num, b]));
  const loops = m.loops.map((l, k) => ({ l, set: new Set(m.loopStates?.[k] || []) })).filter((x) => x.set.size);
  const succ = (b) => [b.term?.goto, b.term?.t, b.term?.f, b.loop?.exit, b.loop?.cont].filter(Boolean).filter((x) => x.num);
  const cost = (b, which) => { const c = callLatency(b); return 1 + (m.subStates?.get(b.num)?.length || 0) + (c ? c[which] ?? NaN : 0); };
  const count = (l, which) => { const n = which === 'min' ? (l.trip ?? 0) : (l.trip ?? l.max); return n === null ? NaN : Math.ceil(n / (typeof l.unroll === 'number' ? l.unroll : 1)); };
  // (the longest or the shortest path through a region of states from its entry, a loop in it taken as a whole)
  const region = (set, entry, which) => {
    const inner = loops.filter((x) => x.set !== set && [...x.set].every((s) => set.has(s)) && x.set.size < set.size);
    const top = inner.filter((x) => !inner.some((y) => y !== x && [...x.set].every((s) => y.set.has(s)) && y.set.size > x.set.size));
    const pick = which === 'min' ? Math.min : Math.max;
    const seen = new Set();
    const memo = new Map();
    const go = (b) => {
      if (!set.has(b.num) || seen.has(b.num)) return 0;
      if (memo.has(b.num)) return memo.get(b.num);
      const c = top.find((x) => x.set.has(b.num));
      const members = c ? [...c.set].map((s) => num.get(s)) : [b];
      members.forEach((x) => seen.add(x.num));
      // (out of the region: its end, not a shorter path through it)
      const next = members.flatMap(succ).filter((x) => !members.includes(x) && set.has(x.num)).map(go);
      members.forEach((x) => seen.delete(x.num));
      const r = (c ? loopTotal(c, b, which) : cost(b, which)) + (next.length ? pick(...next) : 0);
      memo.set(b.num, r);
      return r;
    };
    return go(entry);
  };
  const loopTotal = (c, entry, which) => {
    if (c.l.pipeline && c.l.ii) return count(c.l, which) * c.l.ii + 1;
    return count(c.l, which) * region(c.set, entry, which) + 1;
  };
  const all = new Set(m.blocks.map((b) => b.num));
  const entry = num.get(m.entry);
  const known = (r) => (Number.isNaN(r) ? null : r);
  if (!entry) return { min: 0, max: 0, loops: m.loops.map(() => null) };
  // (a loop's cycles: where it is entered, its first state)
  const loopsOf = m.loops.map((l, k) => { const x = loops.find((y) => y.l === l), first = Math.min(...(m.loopStates?.[k] || [])); return x && num.has(first) ? known(loopTotal(x, num.get(first), 'max')) : null; });
  return { min: known(region(all, entry, 'min')), max: known(region(all, entry, 'max')), loops: loopsOf };
}

export const subMethods = {
  /** The arrays passed to a sub-module: memories whatever their size (its port is a memory's). */
  subArrays(body) {
    const out = new Set();
    walk(body, (n) => { if (n.kind === 'subcall') for (const a of n.args) if (a.kind === 'id') out.add(a.name); });
    return out;
  },
  /** A call in its state: ap_start and the arguments driven, the state again until ap_done. */
  subStmt(s, base) {
    const f = this.c.funcs.get(s.callee);
    const g = this.guard(base);
    const named = (a) => (a.kind === 'unary' && a.op === '*' && a.e.kind === 'id' ? a.e : a);
    const slotOf = (a) => { const x = named(a); return x.kind === 'id' ? this.slots.get(x.name) : null; };
    const depths = {};
    f.params.forEach((pa, i) => { const sl = slotOf(s.args[i]); if (sl?.kind === 'mem') depths[pa.name] = sl.n; });
    // (FUNCTION_INSTANTIATE: an argument it names, a constant at this call, a constant of a module of its own, #2244)
    const binds = {};
    for (const v of instantiated(f)) {
      const i = f.params.findIndex((pa) => pa.name === v), a = s.args[i];
      if (i < 0 || !a || ['ptr', 'array', 'stream', 'struct'].includes(f.params[i].type.kind) || this.hasMem(a) || this.hasSide(a)) continue;
      const k = this.expr(a, this.T);
      if (this.g.isConst(k.id)) binds[v] = this.g.k(k.id);
    }
    const m = this.subs.of(s.callee, depths, Object.keys(binds).length ? binds : null);
    if (!m.gen.ok) this.error(s.loc, `'${s.callee}' could not be made a module of its own (#pragma HLS INLINE off)`);
    if (!m.gen.ports.some((p) => p.name === 'ap_done')) this.error(s.loc, `'${s.callee}' has no block protocol: it cannot be called as a sub-module`);
    const inst = this.instanceOf(m, s);
    inst.calls++;
    const I = (p, t) => this.g.add('in', [], t, { port: { key: `inst:${inst.name}_${p}`, name: `${inst.name}_${p}` } });
    const drive = new Map([['ap_start', g]]);
    const done = I('ap_done', BOOL);
    const byName = new Map(m.gen.ports.map((p) => [p.name, p]));
    const mems = new Map(), fifos = new Map();
    for (const p of m.gen.ports) {
      if (CTRL.has(p.name) || p.role === 'arg_vld') continue;
      if (p.role === 'return') {
        const rt = typeOf(f.ret);
        if (s.into) this.store(s.into, this.v(I(p.name, rt), rt), done);
        continue;
      }
      const i = f.params.findIndex((pa) => pa.name === p.param), pa = f.params[i], a = s.args[i];
      const sfx = p.name.slice(portOf(p.param).length);
      if (p.role === 'arg') {
        const ptr = pa.type.kind === 'ptr';
        const et = typeOf(ptr ? pa.type.to : pa.type);
        const target = ptr ? (a.kind === 'unary' && a.op === '&' ? a.e : { kind: 'unary', op: '*', e: a, loc: a.loc }) : a;
        if (p.dir === 'in') { drive.set(p.name, this.conv(this.expr(target, g), et.fl ? et : { w: p.w, s: et.s }).id); continue; }   // (a float's: its bits, #2273)
        // (written: taken each time it comes, its _ap_vld; without one, at the end of the call)
        const vld = byName.get(`${p.name}_ap_vld`);
        this.store(target, this.v(I(p.name, et), et), vld ? I(vld.name, BOOL) : done);
        continue;
      }
      const sl = slotOf(a);
      if (p.role === 'mem') {
        if (sl?.kind !== 'mem' || sl.group || sl.bram) this.error(a.loc, `the argument of '${pa.name}' in the call of '${f.name}', a sub-module: an array that is a memory of ap_memory's (its name)`);
        if (!mems.has(sl)) mems.set(sl, { addr: this.g.const(0, U(sl.aw)), ce: this.F, we: this.F, d: null, free: true });
        const acc = mems.get(sl);
        if (sfx === '_address0') acc.addr = this.conv(this.v(I(p.name, U(p.w)), U(p.w)), U(sl.aw)).id;
        else if (sfx === '_ce0') acc.ce = I(p.name, BOOL);
        else if (sfx === '_we0') { acc.we = I(p.name, BOOL); sl.written = true; if (sl.rom) this.error(a.loc, `'${sl.name}' is constant: '${f.name}' writes it`); }
        else if (sfx === '_d0') acc.d = this.conv(this.v(I(p.name, U(p.w)), U(p.w)), sl.t).id;
        else if (sfx === '_q0') { sl.read = true; drive.set(p.name, this.conv(this.v(this.memQ(sl), sl.t), U(p.w)).id); }
        continue;
      }
      if (p.role === 'fifo') {
        if (sl?.kind !== 'fifo' || sl.group) this.error(a.loc, `the argument of '${pa.name}' in the call of '${f.name}', a sub-module: a stream argument of its caller`);
        if (!fifos.has(sl)) fifos.set(sl, { g: this.F, ok: this.T, free: true });
        const acc = fifos.get(sl);
        if (sfx === '_dout') { sl.read = true; drive.set(p.name, this.conv(this.v(this.fifoIn(sl, 'dout'), sl.t), U(p.w)).id); }
        else if (sfx === '_empty_n') drive.set(p.name, this.fifoIn(sl, 'empty_n'));
        else if (sfx === '_full_n') { sl.written = true; drive.set(p.name, this.fifoIn(sl, 'full_n')); }
        else if (sfx === '_read' || sfx === '_write') acc.g = I(p.name, BOOL);
        else if (sfx === '_din') acc.d = this.conv(this.v(I(p.name, U(p.w)), U(p.w)), sl.t).id;
        continue;
      }
      this.error(a.loc, `the port '${p.name}' of '${f.name}', a sub-module, is not made yet`);
    }
    for (const [sl, acc] of mems) this.access.set(sl.name, acc);
    for (const [sl, acc] of fifos) this.fifoAcc.set(sl.name, acc);
    this.stall = this.or(this.stall, this.and(g, this.not(done)));
    this.callNow = { inst, drive };
  },
  /** A call's instance: one a call, as Vitis HLS makes them (#2244); ALLOCATION limit=N of the function N, the calls on
   *  them in turn; a floating-point operation's unit (ap_unit_*, #2273), or a function with a static variable, one. */
  instanceOf(m, s) {
    this.limits ??= allocationLimits(this.c.funcs);
    this.sites ??= new Map();
    if (!this.sites.has(s)) this.sites.set(s, { m, k: [...this.sites.values()].filter((x) => x.m === m).length });
    // (a static variable in it, or in what it calls, is one variable for all the calls: one instance, as the C's)
    const f = this.c.funcs.get(m.callee);
    const kept = f && [...tree(f, this.c.funcs)].some((x) => { let st = false; walk(x.body, (n) => { if (n.kind === 'decl' && n.vars.some((v) => v.static)) st = true; }); return st; });
    const lim = /^ap_unit_/.test(m.callee) || kept ? 1 : this.limits.get(m.callee) ?? Infinity;
    const k = this.sites.get(s).k % lim, key = `${m.module}#${k}`;
    if (!this.insts.has(key)) this.insts.set(key, { name: `${m.module}_U${k}`, m, calls: 0 });
    return this.insts.get(key);
  },
  /** The instances' inputs, driven by the states that call them. */
  instPorts(states) {
    const cs = this.g.add('reg', [], this.stateT, { port: { key: 'reg:ap_CS_fsm', name: 'ap_CS_fsm' } });
    return [...this.insts.values()].map((inst) => {
      const ports = inst.m.gen.ports.map((p) => {
        if (p.dir !== 'in' || p.name === 'ap_clk' || p.name === 'ap_rst') return { ...p, node: null };
        let node = null;
        for (const st of states) {
          if (st.call?.inst !== inst) continue;
          const here = this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL);
          const v = st.call.drive.get(p.name);
          if (v === undefined) continue;
          if (p.name === 'ap_start') node = node === null ? this.and(here, v) : this.or(node, this.and(here, v));
          else node = node === null ? v : this.mux(here, v, node, U(p.w));
        }
        return { ...p, node: node ?? this.g.const(0, U(p.w)) };
      });
      return { name: inst.name, module: inst.m.module, callee: inst.m.callee, calls: inst.calls, gen: inst.m.gen, ports };
    });
  },
};
