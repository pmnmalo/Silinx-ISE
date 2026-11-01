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
//   hierarchy(fn, funcs, globals, structArgs, all) -> { sub(f, recursive) -> whether a call of f is a sub-module's, kept: [{ f, why }: the
//     functions off that must be inlined] }
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

export function hierarchy(fn, funcs, globals, structArgs = null, all = null) {
  const kept = [];
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
    const both = [...own].find((n) => theirs.has(n));
    return both ? `the global variable '${both}' is used by its caller too` : null;
  };
  const memo = new Map();
  const able = (f) => { if (!memo.has(f.name)) memo.set(f.name, why(f)); return memo.get(f.name) === null; };
  // (a DATAFLOW region of streams the top calls among other statements: a module of its own, called each time, #1706)
  const region = (f) => f.body && hasDataflow(f) && hasStreams(f) && !all;
  for (const f of tree(fn, funcs)) if (f !== fn && inlineMode(f) === 'off' && !able(f)) kept.push({ f, why: memo.get(f.name) });
  // (off wins over a caller's recursive, as Vitis HLS's)
  return { kept, sub: (f) => f !== fn && ((inlineMode(f) === 'off' && able(f)) || region(f)) };
}

/** The modules of a design: one per function and sizes of its arrays. make(callee, depths, module) -> cToHdl's result. */
export function moduleRegistry({ make }) {
  const mods = new Map(), made = [];
  return {
    of(callee, depths = {}) {
      const key = `${callee} ${JSON.stringify(depths)}`;
      if (!mods.has(key)) {
        const same = [...mods.values()].filter((m) => m.callee === callee).length;
        const m = { callee, depths, module: `${portOf(hdlName(callee))}${same ? `_${same}` : ''}`, gen: null };
        mods.set(key, m);
        m.gen = make(callee, depths, m.module);
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
    const m = this.subs.of(s.callee, depths);
    if (!m.gen.ok) this.error(s.loc, `'${s.callee}' could not be made a module of its own (#pragma HLS INLINE off)`);
    if (!m.gen.ports.some((p) => p.name === 'ap_done')) this.error(s.loc, `'${s.callee}' has no block protocol: it cannot be called as a sub-module`);
    if (!this.insts.has(m.module)) this.insts.set(m.module, { name: `${m.module}_U0`, m, calls: 0 });
    const inst = this.insts.get(m.module);
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
        if (p.dir === 'in') { drive.set(p.name, this.conv(this.expr(target, g), { w: p.w, s: et.s }).id); continue; }
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
