// Silinx HLS (#2241): a pointer or reference argument of a sequential module (core/c-fsmd.js) written before it is
// read, on every path, is an output only (<p>, <p>_ap_vld), as in a combinational one (#1603) and in Vitis HLS: its
// value read is the one written, not the caller's. Each state's reads of it are noted with the condition they run
// under (its guard), and its writes with theirs: a read under a condition that implies a write's, in the same state,
// reads that write. Across the states, an argument written whatever the inputs in a state is written for every
// state that only that one reaches (the states' must-write sets). A read that a path reaches with no write is the
// caller's value: the input <p>_i stays (a write under a condition, #1604). Isomorphic ES module: no DOM and no Node
// APIs.

export const outFirstMethods = {
  /** A state's notes start empty (runBlocks, before its statements). */
  outFirstBlock(b) {
    this.outWrites = new Map();
    b.outExposed = new Set();
    this.outBlock = b;
  },
  /** The conjuncts of a guard: a set of node ids (an `and`'s operands, through its `and`s), empty for true. */
  conjuncts(g) {
    const out = new Set(), todo = [g];
    while (todo.length) {
      const x = todo.pop(), n = this.g.get(x);
      if (this.g.isConst(x) && this.g.k(x)) continue;
      if (n.op === 'and') todo.push(...n.args); else out.add(x);
    }
    return out;
  },
  /** A write of the argument o under the guard g. */
  noteOutWrite(o, g) {
    if (!this.outWrites) return;
    if (!this.outWrites.has(o.name)) this.outWrites.set(o.name, []);
    this.resolveIn(this.outWrites.get(o.name), this.conjuncts(g));
  },
  /** A guard added to the writes of an argument, and what it resolves with: c and X, not c and X: X (an if's two
   *  branches). */
  resolveIn(ws, w) {
    const sub = (a, b) => [...a].every((x) => b.has(x));
    const todo = [w];
    while (todo.length && ws.length < 64) {
      const x = todo.pop();
      if (ws.some((y) => sub(y, x))) continue;
      ws.push(x);
      for (const y of [...ws]) {
        for (const c of x) {
          const n = this.g.get(c);
          const neg = n.op === 'not' ? n.args[0] : null;
          const pair = [...y].find((d) => d === neg || this.g.get(d).op === 'not' && this.g.get(d).args[0] === c);
          if (pair === undefined) continue;
          const r = new Set([...x, ...y]);
          r.delete(c); r.delete(pair);
          todo.push(r);
        }
      }
    }
  },
  /** A read of the argument o, in the state's current statement: the caller's value unless a write of it reaches it. */
  noteOutRead(o) {
    if (!this.outBlock) return;
    const ws = this.outWrites.get(o.name) || [];
    const r = this.conjuncts(this.guard(this.outBase ?? this.T));
    if (!ws.some((w) => [...w].every((x) => r.has(x)))) this.outBlock.outExposed.add(o.name);
  },
  /** Once every state is run: the arguments no path reads before writing them lose their input (its latch). */
  outFirstDone() {
    const blocks = this.reached || [];
    const must = new Map(blocks.map((b) => [b, b.outMust || new Set()]));
    const preds = new Map(blocks.map((b) => [b, []]));
    for (const b of blocks) {
      const t = b.term || {};
      for (const s of [t.goto, t.t, t.f, b.loop?.exit, b.loop?.cont]) if (s && preds.has(s)) preds.get(s).push(b);
    }
    const all = new Set(this.outs.keys());
    const inOf = new Map(blocks.map((b) => [b, b === this.entry ? new Set() : new Set(all)]));
    for (let changed = true; changed;) {
      changed = false;
      for (const b of blocks) {
        if (b === this.entry) continue;
        const ps = preds.get(b);
        const next = new Set([...all].filter((n) => ps.every((p) => inOf.get(p).has(n) || must.get(p).has(n))));
        if (next.size !== inOf.get(b).size) { inOf.set(b, next); changed = true; }
      }
    }
    for (const o of this.outs.values()) {
      if (!o.latched) continue;
      if (blocks.some((b) => b.outExposed?.has(o.name) && !inOf.get(b).has(o.name))) continue;
      this.inputs.delete(`${o.name}#in`);
      o.reg.latch = null;
      o.latched = false;
      o.read = false;
    }
    this.outBlock = null;
  },
  /** A state's arguments written whatever the inputs (a write under no condition, or its conditions' resolution). */
  outFirstEnd(b) {
    b.outMust = new Set([...this.outWrites].filter(([, ws]) => ws.some((w) => !w.size)).map(([n]) => n));
  },
};
