// Silinx design checks - the later rules (#405: out of designChecks in core/lint.js): combinational loops, signals
// unused or never assigned (inputs bit by bit), names that differ only in case, clocks, Verilog's = and <= in
// clocked and combinational blocks, integers without a range.
import { readsOf } from './elaborate.js';
import { eachStmt, exprsOf, hasEdgeOf, readBits, sameBits, short, targetBits, targetIndexExprs, unusedRanges } from './lint.js';

/** designChecks' later rules, their findings added (nothing returned). */
export function mountDesignRules(ctx) {
  const {
    add, dInsts, fileOf, latchSigs, lineOfStmt, logicProcs, pinfo, procs, push, readers, subtree, texts, writers
  } = ctx;

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
      if (at) add('comb-loop', 'warning', at.file, at.line, `Unit <${at.module}> : the following signal(s) form a combinatorial loop: ${sigs.map(s => `<${short(s)}>`).join(', ')}.`, 'Silinx:2170');
    }
  }

  // ===================================================================== unused / unassigned
  const anyIn = (list, inst) => { const st = subtree(inst); return (list || []).some(x => st.has(x.inst)); };
  // the bit positions of a vector input read in the instance (and below it); null: all of them (or
  // read in a way not known bit by bit: a primitive, a variable index, a whole-vector read)
  const inputBitsRead = (sig, inst) => {
    const t = sig.t;
    if (!t || t.kind !== 'logic' || !(t.w > 1)) return null;
    const st = subtree(inst);
    const bits = new Set();
    for (const p of readers.get(sig) || []) {
      if (!st.has(p.inst)) continue;
      if (p.kind === 'native' || !p.body) return null;
      const r = new Map();
      eachStmt(p.body, (s) => readBits(exprsOf(s), r));
      for (const tr of p.triggers || []) if (tr.sig === sig && tr.edge !== 'any') return null;
      if (!r.has(sig) || r.get(sig) === null) return null;
      for (const b of r.get(sig)) if (typeof b === 'number') bits.add(b); else return null;
    }
    return bits.size < t.w ? bits : null;
  };
  for (const i of dInsts) {
    // an empty architecture / module, or a skeleton still marked TODO (New Source, Module Wizard):
    // its ports are not reported as unused yet
    const empty = !(i.mod.items || []).length || /\bTODO\b/.test(texts.get(i.file) || '');
    for (const port of i.ports) {
      if (empty) break;
      const ast = (i.mod.ports || []).find(x => x.name === port.name);
      const file = i.mod.file || i.file, line = ast?.loc?.line ?? i.mod.loc?.line;
      if (port.dir === 'in' && !anyIn(readers.get(port.sig), i))
        add('unused-input', 'warning', file, line, `Input <${port.name}> is never used.`, 'Silinx:647');
      else if (port.dir === 'in') {
        // a bus of which only some bits are read: the others, as XST does (Input <btn<2:1>> is never used.)
        const bits = inputBitsRead(port.sig, i);
        if (bits) for (const r of unusedRanges(port.sig.t, bits))
          add('unused-input', 'warning', file, line, `Input <${port.name}<${r}>> is never used.`, 'Silinx:647');
      }
      if (port.dir === 'out' && !anyIn(writers.get(port.sig), i))
        add('unassigned-output', 'warning', file, line, `Signal <${port.name}>, unconnected in block <${i.module}>, is tied to its initial value.`, 'Silinx:2935');
      // a bidirectional port neither read nor driven (a bidirectional I/O marker left unconnected, #684):
      // XST's warning, one per bit of a bus from its right index (Inout <iob<0>> is never assigned.)
      if (port.dir === 'inout' && !anyIn(readers.get(port.sig), i) && !anyIn(writers.get(port.sig), i)) {
        const t = port.sig.t;
        const names = t?.kind === 'logic' && t.w > 1 ? Array.from({ length: t.w }, (_, k) => `${port.name}<${t.desc ? t.right + k : t.right - k}>`) : [port.name];
        for (const n of names) add('unused-inout', 'warning', file, line, `Inout <${n}> is never assigned.`, 'Silinx:2565');
      }
    }
    for (const s of i.signals) {
      if (s.kind !== 'signal' || !s.loc) continue;
      const r = anyIn(readers.get(s), i), w = anyIn(writers.get(s), i);
      const readAnywhere = (readers.get(s) || []).length > 0;
      if (w && !r && !readAnywhere)
        add('unused-signal', 'warning', s.file || i.file, s.loc.line, `Signal <${short(s)}> is assigned but never used. This unconnected signal will be trimmed during the optimization process.`, 'Silinx:646');
      if (r && !w && !s.hasInit && !(writers.get(s) || []).length)
        add('unassigned-signal', 'warning', s.file || i.file, s.loc.line, `Signal <${short(s)}> is used but never assigned. This sourceless signal will be automatically connected to value GND.`, 'Silinx:653');
    }
  }

  // ===================================================================== names that differ only in case
  // Verilog is case-sensitive, XST is not: it renames one of them (Xst:863)
  for (const i of dInsts) {
    if (i.lang !== 'verilog') continue;
    const first = new Map();   // scope + lower-case name -> the first signal of that name
    for (const s of i.signals) {
      if (!s.loc || s.inst !== i) continue;
      const cut = s.name.lastIndexOf('.');
      const key = `${s.name.slice(0, cut + 1)}${s.name.slice(cut + 1).toLowerCase()}`;
      const f = first.get(key);
      if (!f) { first.set(key, s); continue; }
      if (f.name === s.name) continue;
      add('name-case', 'warning', s.file || i.file, s.loc.line, `Name conflict (<${short(s)}> and <${short(f)}>, renaming ${short(s)} as ${short(s)}_rnm0)`, 'Silinx:863');
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
        // (a primitive's model, core/unisim.js: a clock primitive's output, a BSCAN's DRCK, #3176)
        if (String(fileOf(w) || '').startsWith('<silinx>/')) continue;
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
}
