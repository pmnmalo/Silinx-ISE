// Silinx HLS (#1721): hls::task in the C simulation. `hls_thread_local hls::task t(f, a…);` (core/cpp-lex.js: #pragma
// HLS TASK, then the call f(a…)) starts a task, once (hls_thread_local), that runs f again and again while its inputs have
// values, as Vitis HLS's C simulation runs each task as a thread. Here the tasks run whenever the test bench or the top
// would wait: a read of an empty stream, the end of a call of the top. Each invocation of f is atomic: one that would
// read an empty stream is undone (its streams' reads and writes, its output, its persistent values) and tried again
// later. f of the form `init; while (1) body` keeps its init's variables across its iterations, each iteration an
// invocation; its other variables are each invocation's. The interpreter's methods (core/c-interp.js).
import { constValue } from './c-check.js';

/** A task's invocation that would read an empty stream: undone. */
export class Block extends Error {}

/** f's last statement a loop that never ends (while (1), for (;;)): f = init; forever body. */
function forever(fn) {
  const last = fn.body.items.at(-1);
  if (!last || !['while', 'for'].includes(last.kind) || (last.kind === 'for' && (last.init || last.step))) return null;
  const c = last.cond ? constValue(last.cond) : 1n;
  return c !== null && c !== 0n ? last : null;
}

export const taskMethods = {
  /** The statement after #pragma HLS TASK name=…: its call a task, started once (by its name: an array's at one place, #1898). */
  spawn(s, name) {
    const e = s.e, f = this.frames.at(-1);
    if (e.kind !== 'call' || e.callee.kind !== 'id') this.fail(s, 'hls::task: a function and its arguments');
    const key = `${f.fn.name}:${s.loc.line}:${s.loc.col}:${name}`;
    (this.tasks ||= []);
    if (this.tasks.some((t) => t.key === key)) return;
    const fn = this.c.funcs.get(e.callee.name);
    if (!fn?.body) this.fail(s, `hls::task: '${e.callee.name}' is not a function defined here`);
    const loop = forever(fn);
    this.tasks.push({ key, fn, args: this.callArgs(fn, e), loop, init: loop ? fn.body.items.slice(0, -1) : null, frame: null, done: false, at: s });
  },
  /** The tasks run until none can. */
  runTasks() {
    if (!this.tasks?.length || this.inTasks) return;
    this.inTasks = true;
    try {
      for (let progress = true; progress;) {
        progress = false;
        for (const t of this.tasks) while (!t.done && this.invocation(t)) progress = true;
      }
    } finally { this.inTasks = false; }
  },
  /** One invocation of a task (an iteration of its loop): whether it read or wrote a stream (else it waits). */
  invocation(t) {
    const snap = this.snapshot(t), io = this.io || 0;
    try {
      if (t.loop) {
        if (!t.frame) {
          // (its init, once: its variables the task's)
          t.frame = { fn: t.fn, scopes: [new Map()] };
          this.bind(t.frame.scopes[0], t.fn, t.args, t.at);
          this.frames.push(t.frame);
          try { if (this.items(t.init) !== undefined) t.done = true; } finally { this.frames.pop(); }
          if (t.done) return true;
        }
        this.frames.push(t.frame);
        try { const r = this.stmt(t.loop.body); if (r !== undefined && r !== this.CONTINUE) t.done = true; } finally { this.frames.pop(); }
      } else this.invoke(t.fn, t.args, t.at);
      return (this.io || 0) !== io;
    } catch (x) {
      if (!(x instanceof Block)) throw x;
      this.restore(t, snap);
      return false;
    }
  },
  /** What an invocation may change: the streams, the output, the task's variables, the statics. */
  snapshot(t) {
    const cells = [];
    const keep = (c) => { if (c.arr) cells.push([c.arr, c.arr.map((x) => x.v)]); else if ('v' in c) cells.push([c, c.v]); };
    for (const sc of t.frame?.scopes || []) for (const c of sc.values()) keep(c);
    for (const c of this.statics?.values() || []) keep(c);
    return {
      fifos: (this.fifos || []).map((f) => [f, f.q.slice(), f.log ? f.log.reads : null, f.log ? f.log.writes.length : null]),
      out: this.out.length, frame: t.frame, done: t.done, cells,
    };
  },
  restore(t, s) {
    for (const [f, q, reads, writes] of s.fifos) { f.q = q; if (f.log && reads !== null) { f.log.reads = reads; f.log.writes.length = writes; } }
    this.out.length = s.out;
    t.frame = s.frame;
    t.done = s.done;
    for (const [c, v] of s.cells) { if (Array.isArray(c)) c.forEach((x, k) => { x.v = v[k]; }); else c.v = v; }
  },
};
