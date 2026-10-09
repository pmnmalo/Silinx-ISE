// Event-driven behavioural simulator with delta cycles.
// Time is in picoseconds (JS numbers). Verilog blocking assignments update immediately;
// Verilog non-blocking and VHDL signal assignments are applied at the end of the delta (NBA).
// VHDL `after` transactions mature at the start of their time step (before any process of that
// step runs), and follow the driver rules: a new assignment deletes the driver's later
// transactions, and inertial delay also rejects pulses shorter than the reject limit.
import * as V from './values.js';
import { exec, evalE, applyWrite, formatDisplay, SimError, formatTime } from './interp.js';

class Heap {
  constructor() { this.a = []; this.seq = 0; }
  get size() { return this.a.length; }
  push(t, item) {
    const n = { t, s: this.seq++, item };
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(a[i], a[p])) { [a[i], a[p]] = [a[p], a[i]]; i = p; } else break;
    }
  }
  peek() { return this.a[0]; }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && less(a[l], a[m])) m = l;
        if (r < a.length && less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]]; i = m;
      }
    }
    return top;
  }
}
// Driver identity of a process: a Verilog module's procedural code shares one driver per signal.
const driverKey = p => (p.lang === 'verilog' && p.kind === 'process' ? 'vproc' : p.id);

// std_logic / Verilog wire resolution of the drivers of sig (4-state: 0 1 X Z).
// Bits no driver has assigned yet keep the signal's current value.
function resolve(sig) {
  const w = sig.t.w, M = V.mask(w);
  let any0 = 0n, any1 = 0n, anyX = 0n, nz = 0n, D = 0n;
  for (const { val: { v, x }, m } of sig.res.values()) {
    D |= m;
    nz |= m & ~(x & v);
    any0 |= m & ~x & ~v;
    any1 |= m & ~x & v;
    anyX |= m & x & ~v;
  }
  const bad = anyX | (any0 & any1), zb = D & ~nz;
  const cur = sig.val, und = M & ~D;
  const v = (((any1 & ~bad) | zb) & D) | (cur.v & und);
  const x = ((bad | zb) & D) | (cur.x & und);
  return V.mk(w, v, x, sig.t.s);
}

const sameVal = (a, b) => (Array.isArray(a) || Array.isArray(b) ? a === b : V.same(a, b) && a.real === b.real);
const less = (x, y) => x.t < y.t || (x.t === y.t && x.s < y.s);

function bitOf(v, pos) {
  const P = BigInt(pos);
  if ((v.x >> P) & 1n) return 2;
  return Number((v.v >> P) & 1n);
}

export class Simulator {
  constructor(design, opts = {}) {
    this.design = design;
    this.opts = opts;
    this.files = opts.files || new Map();
    this.maxWaveEvents = opts.maxWaveEvents ?? 5_000_000;
    this.maxDeltas = opts.maxDeltas ?? 10_000;
    this.onLog = opts.onLog || null;
    this.reset();
  }

  reset() {
    this.now = 0;
    this.stamp = 0;
    this.heap = new Heap();
    this.active = [];
    this.nbaQ = [];
    this.nextDelta = [];        // VHDL `wait for 0 ns`: resume in the next delta
    this.drvTx = new Map();     // VHDL drivers: proc -> Map(target key -> pending heap items)
    this.log = [];
    this.finished = null;
    this.waveEvents = 0;
    this.waveTruncated = false;
    this.monitors = [];
    this.strobes = [];
    this.rngState = 0x12345678;
    this.writeBuf = '';
    this.started = false;
    this.stats = { deltas: 0, events: 0, procRuns: 0 };
    for (const s of this.design.signals) {
      s.val = Array.isArray(s.init) ? s.init.map(x => x) : s.init;
      s.prev = null;
      s.evStamp = -1;
      s.waiters = new Set();
      s.forced = null;
      s.wave = Array.isArray(s.init) || s.t.kind === 'str' ? null : { t: [0], v: [s.val] };
    }
    this.rts = this.design.procs.map(p => ({ p, gen: null, done: false, rec: null, ctx: null }));
    // Resolved signals: a logic signal with several drivers (VHDL processes / concurrent
    // statements, Verilog continuous assignments and port connections; all the procedural code of
    // a Verilog module counts as one driver) keeps one value per driver and resolves them.
    const drivers = new Map();
    for (const p of this.design.procs) {
      for (const sig of p.writes || []) {
        if (!drivers.has(sig)) drivers.set(sig, new Set());
        drivers.get(sig).add(driverKey(p));
      }
    }
    for (const s of this.design.signals) {
      s.res = !Array.isArray(s.init) && s.t.kind === 'logic' && drivers.get(s)?.size > 1 ? new Map() : null;
    }
  }

  // ---------------------------------------------------------- logging
  emit(entry) {
    entry.time = this.now;
    if (this.curProc) { entry.file ??= this.curProc.file; entry.line ??= this.curProc.loc?.line; entry.scope ??= this.curProc.inst?.path; }
    this.log.push(entry);
    if (this.log.length > 20000) this.log.splice(0, 1000);
    this.onLog?.(entry);
  }
  print(text, newline = true) {
    if (!newline) { this.writeBuf += text; return; }
    const full = this.writeBuf + text;
    this.writeBuf = '';
    for (const line of full.split('\n')) this.emit({ kind: 'print', text: line });
  }
  report(sev, msg, loc) {
    this.emit({ kind: sev, text: msg, line: loc?.line, file: this.curProc?.file, proc: this.curProc?.name });
  }
  strobe(fn) { this.strobes.push(fn); }
  monitor(args, ctx) {
    this.monitors = [{ args, ctx: { ...ctx }, last: null }];
  }
  finish(reason = 'finish') {
    if (!this.finished) {
      this.finished = reason;
      this.emit({ kind: 'note', text: `simulation ${reason === 'stop' ? 'stopped' : 'finished'} ($${reason}) at ${formatTime(this.now)}` });
    }
  }
  random() {
    // xorshift32
    let x = this.rngState;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.rngState = x >>> 0;
    return x | 0;
  }

  readmem(file, L, radix, ctx) {
    let text = this.files.get(file);
    if (text === undefined) {
      const base = file.split('/').pop();
      for (const [k, v] of this.files) if (k.split('/').pop() === base) { text = v; break; }
    }
    if (text === undefined) { this.report('error', `$readmem: file '${file}' not found in project`); return; }
    let root = L; while (root.base) root = root.base;
    const t = root.t;
    if (t.kind !== 'array') { this.report('error', '$readmem target must be a memory'); return; }
    let arr = root.k === 'sig' ? root.sig.val.slice() : ctx.frame[root.i].slice();
    let idx = t.left;
    const step = t.left <= t.right ? 1 : -1;
    const clean = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const tok of clean.split(/\s+/).filter(Boolean)) {
      if (tok[0] === '@') { idx = parseInt(tok.slice(1), 16); continue; }
      const k = idx - t.lo;
      if (k < 0 || k >= arr.length) break;
      const digits = tok.replace(/_/g, '').toLowerCase();
      let bits = '';
      for (const d of digits) {
        if (d === 'x' || d === 'z') bits += d.repeat(radix === 16 ? 4 : 1);
        else bits += parseInt(d, radix).toString(2).padStart(radix === 16 ? 4 : 1, '0');
      }
      arr[k] = V.resize(V.fromBits(bits), t.elem.w);
      idx += step;
    }
    if (root.k === 'sig') this.setSignal(root.sig, arr);
    else ctx.frame[root.i] = arr;
  }

  // ---------------------------------------------------------- signal updates
  write(wr, val, drv = this.curProc) {
    const sig = wr.sig;
    if (sig.res) { this.writeResolved(sig, wr, val, drv); return; }
    this.setSignal(sig, applyWrite(sig.val, wr, val));
  }
  writeResolved(sig, wr, val, drv) {
    const key = drv ? driverKey(drv) : 'ext', w = sig.t.w;
    let d = sig.res.get(key);
    if (!d) { d = { val: V.allX(w, sig.t.s), m: 0n }; sig.res.set(key, d); }
    d.val = applyWrite(d.val, wr, val);
    d.m |= wr.whole ? V.mask(w) : (V.mask(Math.min(wr.lo + wr.w, w)) & ~V.mask(Math.max(wr.lo, 0)));
    this.setSignal(sig, resolve(sig));
  }
  nba(wr, val) { this.nbaQ.push({ wr, val, drv: this.curProc }); }
  // mech (VHDL only): { mech: 'inertial' | 'transport', reject: ps | null, cont: waveform element > 1 }
  after(wr, val, delay, nb, mech = null) {
    const t = this.now + delay;
    const item = { upd: true, wr, val, nb, vh: !!mech, t, drv: this.curProc };
    if (mech) this.preempt(wr, val, t, mech, item);
    this.heap.push(t, item);
  }
  // VHDL driver update for a new transaction (val at time t) on the current process' driver of
  // `wr`: delete the pending transactions at or after t; for inertial delay, also those inside
  // the reject window [t - reject, t) except the run of equal values right before t.
  preempt(wr, val, t, mech, item) {
    const p = this.curProc;
    if (!p) return;
    let m = this.drvTx.get(p);
    if (!m) { if (!item) return; m = new Map(); this.drvTx.set(p, m); }
    const key = `${wr.sig.id}:${wr.elem}:${wr.lo}:${wr.w}`;
    const old = m.get(key);
    if (!old && !item) return;
    const keep = [];
    for (const it of old || []) {
      if (it.cancelled || it.t <= this.now) continue;
      if (it.t >= t) it.cancelled = true; else keep.push(it);
    }
    if (mech.mech !== 'transport' && !mech.cont) {
      const win = t - (mech.reject ?? (t - this.now));
      let i = keep.length - 1;
      while (i >= 0 && keep[i].t >= win && sameVal(keep[i].val, val)) i--;
      for (; i >= 0 && keep[i].t >= win; i--) keep[i].cancelled = true;
    }
    const live = keep.filter(it => !it.cancelled);
    if (item) live.push(item);
    if (live.length) m.set(key, live); else m.delete(key);
  }

  setSignal(sig, nv) {
    if (sig.forced) return;
    const old = sig.val;
    if (Array.isArray(nv)) {
      if (Array.isArray(old) && nv.length === old.length && nv.every((e, i) => V.same(e, old[i]))) return;
    } else if (!Array.isArray(old) && V.same(old, nv) && old.w === nv.w) return;
    sig.prev = old;
    sig.val = nv;
    sig.evStamp = this.stamp;
    this.stats.events++;
    if (sig.wave && !this.waveTruncated) {
      const w = sig.wave, n = w.t.length;
      if (w.t[n - 1] === this.now) {
        w.v[n - 1] = nv;
        if (n >= 2 && V.same(w.v[n - 2], nv)) { w.t.pop(); w.v.pop(); }
      } else { w.t.push(this.now); w.v.push(nv); }
      if (++this.waveEvents > this.maxWaveEvents) {
        this.waveTruncated = true;
        this.emit({ kind: 'warning', text: 'waveform recording limit reached; further changes are not recorded' });
      }
    }
    if (sig.waiters.size) {
      for (const rec of [...sig.waiters]) {
        if (rec.fired) continue;
        for (const tr of rec.triggers) {
          if (tr.sig !== sig) continue;
          if (tr.edge !== 'any' || tr.pos != null) {   // pos null: whole signal (an edge is on its LSB)
            if (Array.isArray(nv)) { if (tr.edge !== 'any') continue; }
            else {
              const pos = tr.pos ?? 0;
              const o = old && !Array.isArray(old) ? bitOf(old, pos) : 2, n = bitOf(nv, pos);
              if (o === n) continue;
              if (tr.edge === 'pos' && !((o === 0) || (o === 2 && n === 1))) continue;
              if (tr.edge === 'neg' && !((o === 1) || (o === 2 && n === 0))) continue;
            }
          }
          this.fire(rec, 'event');
          break;
        }
      }
    }
  }

  // Force a signal from the UI / stimulus (overrides drivers until released).
  force(sig, val) {
    sig.forced = null;
    this.setSignal(sig, Array.isArray(val) ? val : V.withSign(V.resize(val, sig.t.w), sig.t.s));
    sig.forced = sig.val;
  }
  release(sig) {
    sig.forced = null;
    // let drivers re-evaluate: wake every process that drives this signal
    for (const rt of this.rts) if (!rt.done && rt.rec && rt.p.writes?.has(sig)) this.fire(rt.rec, 'event');
  }

  // Schedule stimulus: list of { t(ps), val } writes; optional repeating clock.
  addStimulus(sig, events) {
    for (const ev of events) this.heap.push(ev.t, { stim: true, sig, val: ev.val });
  }
  addClock(sig, { period, duty = 0.5, offset = 0, startHigh = false, until = Infinity }) {
    const hi = Math.round(period * duty), lo = period - hi;
    const first = startHigh ? V.ONE : V.ZERO;
    this.heap.push(offset, { clock: true, sig, val: first, hi, lo, until });
  }

  // ---------------------------------------------------------- processes
  fire(rec, why) {
    if (rec.fired) return;
    rec.fired = true;
    for (const tr of rec.triggers) tr.sig.waiters.delete(rec);
    this.active.push({ rt: rec.rt, val: why });
  }

  makeGen(rt) {
    const p = rt.p;
    const ctx = { frame: p.frameInit ? p.frameInit() : [], sim: this, depth: 0, timeUnit: p.timeUnit, scopeName: p.inst.path };
    rt.ctx = ctx;
    const body = p.body, triggers = p.triggers;
    const sim = this;
    switch (p.mode) {
      case 'initial': return (function* () { yield* exec(body, ctx); })();
      case 'native': return (function* () {   // netlist primitive evaluated in JavaScript (core/native.js)
        const fn = p.native;
        for (;;) { fn(sim); yield triggers.length ? { triggers } : { forever: true }; }
      })();
      case 'loop': return (function* () {
        for (;;) {
          const t0 = sim.now, s0 = sim.stamp;
          yield* exec(body, ctx);
          if (sim.now === t0 && sim.stamp === s0) throw new SimError(`process '${p.name}' loops forever without waiting (missing wait/delay?)`, p.loc);
        }
      })();
      case 'wait-first': return (function* () {
        for (;;) { yield { triggers }; yield* exec(body, ctx); }
      })();
      default: // comb / sens / assign / glue: run once then wait on triggers
        return (function* () {
          for (;;) {
            yield* exec(body, ctx);
            if (!triggers.length) { yield { forever: true }; }
            yield { triggers };
          }
        })();
    }
  }

  resume(rt, val) {
    if (rt.done) return;
    this.curProc = rt.p;
    this.stats.procRuns++;
    let r;
    try {
      r = rt.gen.next(val);
    } catch (e) {
      rt.done = true;
      const msg = e instanceof SimError ? e.message : `internal error: ${e.message}`;
      this.emit({ kind: 'error', text: `${msg} (in ${rt.p.inst.path}/${rt.p.name})`, file: rt.p.file, line: e.loc?.line || rt.ctx?.loc?.line || rt.p.loc?.line });
      if (!(e instanceof SimError)) console.error(e);
      this.finish('error');
      return;
    }
    if (r.done) { rt.done = true; return; }
    const req = r.value;
    if (req.delay !== undefined) {
      // VHDL `wait for 0 ns` resumes after the pending signal updates (next delta);
      // Verilog `#0` stays in the current one
      if (req.delay <= 0) (rt.p.lang === 'vhdl' ? this.nextDelta : this.active).push({ rt, val: 'delay' });
      else this.heap.push(this.now + req.delay, { wake: rt });
    } else if (req.triggers) {
      const rec = { rt, triggers: req.triggers, fired: false };
      for (const tr of req.triggers) tr.sig.waiters.add(rec);
      if (req.deadline != null) this.heap.push(req.deadline, { timeout: rec });
      rt.rec = rec;
    } else if (req.forever) {
      rt.done = true;
    }
  }

  start() {
    if (this.started) return;
    this.started = true;
    for (const rt of this.rts) {
      rt.gen = this.makeGen(rt);
      this.active.push({ rt, val: undefined });
    }
  }

  // Process one simulation time step (all deltas at this.now).
  deltaLoop() {
    let deltas = 0;
    for (;;) {
      while (this.active.length) {
        const q = this.active;
        this.active = [];
        for (const { rt, val } of q) {
          this.resume(rt, val);
          if (this.finished) return;     // $finish / error / failure: nothing else runs
        }
      }
      if (!this.nbaQ.length && !this.nextDelta.length) break;
      const q = this.nbaQ;
      this.nbaQ = [];
      this.stamp++;
      this.stats.deltas++;
      for (const { wr, val, drv } of q) this.write(wr, val, drv);
      if (this.nextDelta.length) { this.active.push(...this.nextDelta); this.nextDelta = []; }
      if (++deltas > this.maxDeltas) {
        this.emit({ kind: 'error', text: `delta cycle limit (${this.maxDeltas}) exceeded at ${formatTime(this.now)}: combinational loop?` });
        this.finish('error');
        return;
      }
    }
    // end of time step: strobes / monitors
    if (this.strobes.length) { const s = this.strobes; this.strobes = []; for (const f of s) this.print(f()); }
    for (const m of this.monitors) {
      const vals = m.args.map(a => (a.k === 'str' ? '' : JSON.stringify(evalE(a, m.ctx), (k, v) => (typeof v === 'bigint' ? v.toString() : v))));
      const key = vals.join('|');
      if (key !== m.last) { m.last = key; this.print(formatDisplay(m.args, m.ctx)); }
    }
  }

  // Run until absolute time `until` (ps) or $finish. Returns a status object.
  run(until = Infinity, { maxSteps = Infinity } = {}) {
    this.start();
    let steps = 0, brokeEarly = false;
    if (this.active.length || this.nbaQ.length || this.nextDelta.length) this.deltaLoop();
    while (!this.finished) {
      const top = this.heap.peek();
      if (!top || top.t > until) break;
      if (++steps > maxSteps) { brokeEarly = true; break; }
      this.now = top.t;
      this.stamp++;
      while (this.heap.size && this.heap.peek().t === this.now) {
        const { item } = this.heap.pop();
        if (item.cancelled) continue;
        if (item.wake) this.active.push({ rt: item.wake, val: 'delay' });
        else if (item.timeout) { if (!item.timeout.fired) this.fire(item.timeout, 'timeout'); }
        else if (item.upd) {
          // Verilog `<= #d`: NBA region of that step; VHDL `after`: updated before the step's processes run
          if (item.nb && !item.vh) this.nbaQ.push({ wr: item.wr, val: item.val, drv: item.drv });
          else this.write(item.wr, item.val, item.drv);
        }
        else if (item.stim) this.forceOrSet(item.sig, item.val);
        else if (item.fn) item.fn(this);
        else if (item.clock) {
          this.forceOrSet(item.sig, item.val);
          const nxt = item.val.v ? V.ZERO : V.ONE;
          const t = this.now + (item.val.v ? item.hi : item.lo);
          if (t <= item.until) this.heap.push(t, { ...item, val: nxt });
        }
      }
      this.deltaLoop();
    }
    if (!this.finished && !brokeEarly && until !== Infinity && until > this.now) this.now = until;
    if (this.writeBuf) this.print('');
    return { now: this.now, finished: this.finished, pending: this.heap.size > 0, stats: this.stats };
  }

  // Run fn(sim) at absolute time t (ps), inside that time step (before its delta cycles).
  at(t, fn) { this.heap.push(Math.max(t, this.now), { fn }); }
  nextEventTime() { return this.heap.size ? this.heap.peek().t : null; }

  forceOrSet(sig, val) {
    this.setSignal(sig, V.withSign(V.resize(val, sig.t.w), sig.t.s));
  }

  // value of a signal at time t (from the recorded waveform)
  valueAt(sig, t) {
    const w = sig.wave;
    if (!w) return sig.val;
    let lo = 0, hi = w.t.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (w.t[m] <= t) lo = m; else hi = m - 1; }
    return w.v[lo];
  }
}

// ---------------------------------------------------------- VCD export
export function toVCD(design, sim, { signals = design.signals, timescale = '1ps' } = {}) {
  const ids = new Map();
  let n = 0;
  const idOf = () => { let k = n++, s = ''; do { s += String.fromCharCode(33 + (k % 94)); k = Math.floor(k / 94); } while (k); return s; };
  const lines = [`$date ${new Date().toISOString()} $end`, '$version Silinx $end', `$timescale ${timescale} $end`];
  const emitScope = inst => {
    lines.push(`$scope module ${inst.name} $end`);
    const seen = new Set();
    for (const p of inst.ports) { if (signals.includes(p.sig) && p.sig.wave) { decl(p.name, p.sig); seen.add(p.sig); } }
    for (const s of inst.signals) if (!seen.has(s) && signals.includes(s) && s.wave) decl(s.name, s);
    for (const c of inst.children) emitScope(c);
    lines.push('$upscope $end');
  };
  const decl = (name, s) => {
    if (!ids.has(s)) ids.set(s, idOf());
    const ty = s.t.kind === 'int' ? 'integer' : s.kind === 'var' ? 'reg' : 'wire';
    lines.push(`$var ${ty} ${s.t.w} ${ids.get(s)} ${name.replace(/\s/g, '_')} $end`);
  };
  emitScope(design.top);
  lines.push('$enddefinitions $end');
  const evs = [];
  for (const [s, id] of ids) s.wave.t.forEach((t, i) => evs.push([t, id, s.wave.v[i], s.t.w]));
  evs.sort((a, b) => a[0] - b[0]);
  let cur = -1;
  for (const [t, id, v, w] of evs) {
    if (t !== cur) { lines.push(`#${t}`); cur = t; }
    lines.push(w === 1 ? `${V.toBin(v)}${id}` : `b${V.toBin(v).replace(/^0+(?=.)/, '')} ${id}`);
  }
  return lines.join('\n') + '\n';
}
