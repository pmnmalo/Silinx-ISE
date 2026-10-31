// Silinx HLS (#1528): C/RTL co-simulation, as Vitis HLS's: the test bench's calls of the top function (the C simulation,
// core/c-interp.js) replayed on the generated HDL (core/c-hdl.js) in Silinx's simulator, a combinational module's
// inputs set one call at a time, a sequential one's through its block protocol (ap_start, then ap_done); each
// result compared with the C's: ap_return, a pointer output (taken when its _ap_vld is 1), a read-write pointer, an
// array argument's memory (ap_memory: a memory in the test bench, its values before each call the C's, after it
// compared, #1527).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   cosimulate(source, { file, lang, maxCycles }) ->
//     { ok, pass, calls, mismatches: [{ call, port, expected, got }], latency: { min, max, avg } | null,
//       output, sim: the C simulation's result, gen: cToHdl's result, errors: [message] }
import { simulateC } from './c-interp.js';
import { cToHdl } from './c-hdl.js';
import { simulate } from './compile.js';
import { f32Bits, f64Bits } from './c-dataflow-float.js';

export const MAX_CYCLES = 100000;
/** A call's limit of cycles (#1899): maxCycles, or more, as many as the steps of its C simulation: a design that does
 *  much work in a call (a matrix product's 65536 multiplications) ends it, a call that never ends stops there. */
export const callCycles = (call, maxCycles = MAX_CYCLES) => Math.max(maxCycles, call?.steps ?? 0);
const mask = (w) => (1n << BigInt(w)) - 1n;
// (a float's value: its IEEE bits, as its port holds them, #1768)
const B = (v, w) => (typeof v === 'number' ? (w > 32 ? f64Bits(v) : f32Bits(v)) : BigInt(v)) & mask(w);
const hex = (v, w) => `${w}'h${B(v, w).toString(16)}`;
/** A struct's port's value (#1628): its members' (value(member)) at their fields, the padding 0. */
export const pack = (fields, value) => fields.reduce((acc, f) => acc | (B(value(f.param) ?? 0n, f.w) << BigInt(f.off)), 0n);
/** A word of a stream or a memory of structs (#1668): its members' (value(member, j): a member array's element j) at
 *  their fields, the padding 0. */
export const packWord = (fields, value) => fields.reduce((acc, f) => {
  for (let j = 0; j < (f.k ?? 1); j++) acc |= B(value(f.param, j) ?? 0n, f.w) << BigInt(f.off + j * f.size);
  return acc;
}, 0n);

/** The calls with the values of each stream and memory of structs, its words, from its members' (#1668). */
export function wordCalls(gen, calls) {
  const gs = [...(gen.memories || []), ...(gen.fifos || [])].filter((x) => x.fields);
  if (!gs.length) return calls;
  const words = (src, fields) => {
    const f0 = fields[0];
    if (!src[f0.param]) return undefined;
    return Array.from({ length: Math.floor(src[f0.param].length / f0.k) }, (_, i) => packWord(fields, (m, j) => src[m]?.[i * (fields.find((f) => f.param === m).k) + j]));
  };
  return calls.map((c) => {
    const r = { ...c };
    for (const key of ['memIn', 'memOut', 'streamIn', 'streamOut', 'streamRead']) r[key] = { ...(c[key] || {}) };
    for (const x of gs) {
      const keys = gen.memories?.includes(x) ? ['memIn', 'memOut'] : ['streamIn', 'streamOut'];
      for (const key of keys) { const v = words(c[key] || {}, x.fields); if (v !== undefined) r[key][x.name] = v; }
      if (!keys.includes('memIn') && c.streamRead?.[x.fields[0].param] !== undefined) r.streamRead[x.name] = c.streamRead[x.fields[0].param];
    }
    return r;
  });
}

/** The Verilog test bench replaying the calls: one line of hex values per call (and the protocol's faults last). */
export function cosimBench(gen, calls0, { maxCycles = MAX_CYCLES } = {}) {
  const calls = wordCalls(gen, calls0);
  const port = (n) => gen.ports.find((p) => p.name === n);
  const seq = !!port('ap_clk'), hs = !!port('ap_start');
  const L = ['module silinx_cosim_tb;', '  integer cyc, bad = 0;'];
  // (ap_ctrl_none: no ap_start, the module running by itself, #1900)
  if (seq) L.push(`  reg ap_clk = 0, ap_rst = 1${hs ? ', ap_start = 0' : ''};`);
  // (a combinational module's reset: an input it does not use, held low, #1924)
  else if (port('ap_rst')) L.push('  reg ap_rst = 0;');
  for (const p of gen.ports) if (!['ap_clk', 'ap_rst', 'ap_start'].includes(p.name)) L.push((p.role === 'mem' || p.role === 'fifo') && p.dir === 'in' ? `  wire [${p.w - 1}:0] ${p.name};` : `  ${p.dir === 'in' ? 'reg' : 'wire'} ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name};`);
  const outs = gen.ports.filter((p) => p.dir === 'out' && p.role === 'arg');
  for (const o of outs) L.push(`  reg [${o.w - 1}:0] cap_${o.name}; reg got_${o.name};`);
  const mems = gen.memories || [];
  const P = (x) => x.port ?? x.name;
  // (a memory's port: ap_memory's, or a BRAM's, its address in bytes, a write enable a byte, #1668)
  const M = (x) => (x.bram ? { a: `(${P(x)}_Addr_A >> ${x.bram.shift})`, ce: `${P(x)}_EN_A`, we: `(|${P(x)}_WEN_A)`, d: `${P(x)}_Din_A`, q: `${P(x)}_Dout_A` }
    : { a: `${P(x)}_address0`, ce: `${P(x)}_ce0`, we: `${P(x)}_we0`, d: `${P(x)}_d0`, q: `${P(x)}_q0` });
  for (const x of mems) {
    L.push(`  reg [${x.w - 1}:0] mem_${x.name} [0:${x.n - 1}];`);
    if (x.read || x.bram) L.push(`  reg [${x.w - 1}:0] q_${x.name};`, `  assign ${M(x).q} = q_${x.name};`);
  }
  // (a stream: a FIFO in the test bench, its values the C's before each call; empty and full now and then, the
  // module's waits exercised, #1590; one the design polls, s.empty() / s.full(), only when it is, #1823)
  const fifos = gen.fifos || [];
  // (hls::task's run by themselves, #1719, and a module with ap_ctrl_none, #1900: an input stream's values kept across
  // calls, each call adding the test bench's new ones; the values read counted from the start, at least the C's: a task
  // may read ahead)
  const free = !!gen.report?.tasks || (seq && !hs);
  const fresh = new Map(), reads = new Map();
  if (free) for (const f of fifos.filter((x) => x.dir === 'in')) {
    let left = 0, total = 0;
    fresh.set(f.name, calls.map((c) => { const q = c.streamIn[f.name] || []; const nw = q.slice(left); left = q.length - (c.streamRead[f.name] ?? 0); return nw; }));
    reads.set(f.name, calls.map((c) => (total += c.streamRead[f.name] ?? 0)));
  }
  const depth = (f, key) => (free && key === 'streamIn' ? Math.max(1, fresh.get(f.name).flat().length) : Math.max(1, ...calls.map((c) => (c[key][f.name] || []).length)) + (key === 'streamOut' ? 4 : 0));
  if (fifos.length) L.push('  reg [31:0] ap_tick = 0;');
  for (const f of fifos) {
    if (f.dir === 'in') {
      const N = depth(f, 'streamIn');
      L.push(`  reg [${f.w - 1}:0] fin_${f.name} [0:${N - 1}]; integer fi_${f.name} = 0, fn_${f.name} = 0;`,
        `  assign ${P(f)}_dout = fin_${f.name}[fi_${f.name} < ${N} ? fi_${f.name} : 0];`, `  assign ${P(f)}_empty_n = fi_${f.name} < fn_${f.name}${f.polled ? '' : ' && ap_tick % 3 != 1'};`);
    } else {
      L.push(`  reg [${f.w - 1}:0] fout_${f.name} [0:${depth(f, 'streamOut') - 1}]; integer fo_${f.name} = 0;`, `  assign ${P(f)}_full_n = ${f.polled ? "1'b1" : 'ap_tick % 4 != 2'};`);
    }
  }
  L.push(`  ${gen.top} dut(${gen.ports.map((p) => `.${p.name}(${p.name})`).join(', ')});`);
  if (seq) {
    L.push('  always #5 ap_clk = ~ap_clk;', '  always @(posedge ap_clk) begin');
    for (const o of outs) if (port(`${o.name}_ap_vld`)) L.push(`    if (${o.name}_ap_vld) begin cap_${o.name} <= ${o.name}; got_${o.name} <= 1; end`);
    // (a memory: one port, the value read on _q0 the cycle after its address; an address outside it: x)
    for (const x of mems) { const m = M(x); L.push(`    if (${m.ce}) begin${x.written ? ` if (${m.we} && ${m.a} < ${x.n}) mem_${x.name}[${m.a}] <= ${m.d};` : ''}${x.read ? ` q_${x.name} <= ${m.a} < ${x.n} ? mem_${x.name}[${m.a}] : ${x.w}'bx;` : ''} end`); }
    if (fifos.length) L.push('    ap_tick <= ap_tick + 1;');
    for (const f of fifos) {
      if (f.dir === 'in') L.push(`    if (${P(f)}_read && ${P(f)}_empty_n) fi_${f.name} <= fi_${f.name} + 1;`);
      else L.push(`    if (${P(f)}_write && ${P(f)}_full_n) begin if (fo_${f.name} < ${depth(f, 'streamOut')}) fout_${f.name}[fo_${f.name}] <= ${P(f)}_din; fo_${f.name} <= fo_${f.name} + 1; end`);
    }
    L.push('  end');
  }
  L.push('  initial begin');
  if (seq) L.push('    #12 ap_rst = 0;');
  else if (port('ap_start')) L.push('    ap_start = 1;');
  const shown = [port('ap_return') ? 'ap_return' : null, ...outs.flatMap((o) => (seq || port(`${o.name}_ap_vld`) ? [seq ? `cap_${o.name}` : o.name, seq ? `got_${o.name}` : `${o.name}_ap_vld`] : [o.name, "1'b1"])),
    ...mems.filter((x) => x.written).flatMap((x) => Array.from({ length: x.n }, (_, k) => `mem_${x.name}[${k}]`))].filter(Boolean);
  calls.forEach((c, ci) => {
    const asg = gen.ports.filter((p) => p.dir === 'in' && p.param && p.role !== 'mem' && p.role !== 'fifo').map((p) => {
      if (p.fields) return `${p.name} = ${hex(pack(p.fields, (m) => c.ptrIn[m] ?? c.args[m]), p.w)};`;
      const v = p.name.endsWith('_i') && c.ptrIn[p.param] !== undefined ? c.ptrIn[p.param] : (c.args[p.param] ?? c.ptrIn[p.param] ?? 0n);
      return `${p.name} = ${hex(v, p.w)};`;
    }).concat(mems.flatMap((x) => (c.memIn[x.name] || []).map((v, k) => `mem_${x.name}[${k}] = ${hex(v, x.w)};`)))
      .concat(fifos.flatMap((f) => {
        if (f.dir !== 'in') return [`fo_${f.name} = 0;`];
        if (free) { const at = fresh.get(f.name).slice(0, ci).flat().length, nw = fresh.get(f.name)[ci]; return [...nw.map((v, k) => `fin_${f.name}[${at + k}] = ${hex(v, f.w)};`), `fn_${f.name} = ${at + nw.length};`]; }
        return [...(c.streamIn[f.name] || []).map((v, k) => `fin_${f.name}[${k}] = ${hex(v, f.w)};`), `fi_${f.name} = 0; fn_${f.name} = ${(c.streamIn[f.name] || []).length};`];
      })).join(' ');
    // (per call: the values each stream gives back, as many as the C's)
    const each = [...shown, ...fifos.flatMap((f) => (f.dir === 'in' ? [`fi_${f.name}`] : [`fo_${f.name}`, ...(c.streamOut[f.name] || []).map((_, k) => `fout_${f.name}[${k}]`)])), ...(seq ? ['cyc'] : [])];
    if (seq && !hs) L.push(`    ${asg} ${outs.map((o) => `got_${o.name} = 0;`).join(' ')} cyc = 0;`);
    else if (seq) {
      L.push('    if (!ap_idle) bad = bad + 1;', `    ${asg} ${outs.map((o) => `got_${o.name} = 0;`).join(' ')} ap_start = 1; cyc = 0;`, '    @(posedge ap_clk); #1 ap_start = 0;');
      L.push(`    while (!ap_done && cyc < ${callCycles(c, maxCycles)}) begin @(posedge ap_clk); #1 cyc = cyc + 1; end`, ...(gen.freeRun ? [] : ['    if (!ap_ready) bad = bad + 1;']), '    @(posedge ap_clk); #1;');
    }
    if (seq) {
      // (hls::task's run by themselves: the call's values, read and written, waited for, #1719)
      const want = free ? fifos.map((f) => (f.dir === 'in' ? `fi_${f.name} < ${reads.get(f.name)[ci]}` : `fo_${f.name} < ${(c.streamOut[f.name] || []).length}`)) : [];
      if (want.length) L.push(`    while ((${want.join(' || ')}) && cyc < ${callCycles(c, maxCycles)}) begin @(posedge ap_clk); #1 cyc = cyc + 1; end`);
    } else L.push(`    ${asg} #1;`);
    L.push(`    $display("${each.map(() => '%h').join(' ')}", ${each.join(', ')});`);
  });
  L.push('    $display("bad %0d", bad);', '    $finish;', '  end', 'endmodule');
  return { text: L.join('\n'), shown, seq, reads: free ? reads : null };
}

// (files: the test bench's, core/c-interp.js's, #1897)
export function cosimulate(source, { file = 'input.c', lang = 'vhdl', maxCycles = MAX_CYCLES, alter = null, headers = null, top = null, files = null, pipelineLoops, clock, family } = {}) {
  const sim = simulateC(source, { file, headers, top, files });
  const gen = cToHdl(source, { file, lang, headers, top, pipelineLoops, clock, family });
  if (alter && gen.ok) gen.hdl = alter(gen.hdl);   // (the tests: an HDL that differs, its mismatches reported)
  const base = { ok: false, pass: false, calls: 0, mismatches: [], latency: null, output: sim.output, sim, gen, errors: [] };
  if (!sim.ok) return { ...base, errors: [sim.error ? `the C simulation failed: line ${sim.error.line}: ${sim.error.message}` : 'the C simulation cannot run: the source has errors'] };
  if (!gen.ok) return { ...base, errors: gen.diagnostics.filter((d) => d.severity === 'error').map((d) => `line ${d.line}: ${d.message}`) };
  if (!sim.calls.length) return { ...base, ok: true, pass: false, errors: [`the test bench (main) does not call the top function '${gen.top}': nothing to compare`] };
  const tb = cosimBench(gen, sim.calls, { maxCycles });
  // (a deep combinational path, math.h's pow in soft-float, #1761, settles in more delta cycles than the simulator's
  // default allows: up to a million)
  const r = simulate([{ path: `${gen.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: gen.hdl }, { path: 'silinx_cosim_tb.v', text: tb.text }], 'silinx_cosim_tb', { until: 1e15, maxDeltas: 1e6 });
  if (r.errors.length) return { ...base, errors: r.errors.map((d) => `${d.file || ''}: ${d.message}`) };
  // (the test bench's lines only: the simulator's own, as its waveform recording's limit, left out, #1734)
  const lines = r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^(bad \d+|[0-9a-fxz]+( [0-9a-fxz]+)*)$/i.test(s));
  const bad = Number(/^bad (\d+)/.exec(lines.at(-1) || '')?.[1] ?? 0);
  const rows = lines.filter((s) => !/^bad /.test(s)).map((s) => s.split(/\s+/).map((x) => (/[xz]/i.test(x) ? null : BigInt(`0x${x}`))));
  const port = (n) => gen.ports.find((p) => p.name === n);
  const mismatches = [];
  const cycles = [];
  wordCalls(gen, sim.calls).forEach((c, k) => {
    const row = rows[k] || [];
    let q = 0;
    const say = (p, expected, got) => mismatches.push({ call: k + 1, port: p, expected, got });
    if (port('ap_return')) { const { w, fields } = port('ap_return'); const exp = fields ? pack(fields, (m) => c.ptrOut[m]) : c.ret === null ? null : B(c.ret, w); const got = row[q++]; if (exp !== null && got !== exp) say('ap_return', exp, got); }
    for (const o of gen.ports.filter((p) => p.dir === 'out' && p.role === 'arg')) {
      const val = row[q++], vld = row[q++];
      // (a struct's: its members', those not written as they were, #1628)
      const exp = o.fields ? pack(o.fields, (m) => c.ptrOut[m] ?? c.ptrIn[m]) : B(c.ptrOut[o.param] ?? 0n, o.w);
      const before = o.fields ? pack(o.fields, (m) => c.ptrIn[m]) : c.ptrIn[o.param] === undefined ? null : B(c.ptrIn[o.param], o.w);
      if (vld === 1n) { if (val !== exp) say(o.name, exp, val); }
      else if (o.name.endsWith('_o') ? exp !== before : before !== null && exp !== before) say(`${o.name}_ap_vld`, 1n, vld);
    }
    for (const x of gen.memories || []) {
      if (!x.written) continue;
      const exp = c.memOut[x.name] || [];
      // (the elements the C's array has: a pointer argument's memory may be deeper than it, #1599)
      const n = c.memOut[x.name] && exp.length < x.n ? exp.length : x.n;
      for (let k = 0; k < x.n; k++) { const got = row[q++], e = B(exp[k] ?? 0n, x.w); if (k < n && got !== e) say(`${x.name}[${k}]`, e, got); }
    }
    for (const f of gen.fifos || []) {
      if (f.dir === 'in') {
        // (tasks: the values read from the start, at least the C's; a task may read ahead, #1719)
        const got = row[q++], e = BigInt(tb.reads ? tb.reads.get(f.name)[k] : c.streamRead[f.name] ?? 0);
        if (tb.reads ? got === null || got < e : got !== e) say(`${f.name} (values read)`, e, got);
        continue;
      }
      const exp = c.streamOut[f.name] || [];
      const n = row[q++];
      if (n !== BigInt(exp.length)) say(`${f.name} (values written)`, BigInt(exp.length), n);
      exp.forEach((v, k) => { const got = row[q++], e = B(v, f.w); if (got !== e) say(`${f.name}[${k}]`, e, got); });
    }
    if (tb.seq) cycles.push(Number(row[q] ?? 0n));
  });
  const over = tb.seq ? cycles.findIndex((x, k) => x >= callCycles(sim.calls[k], maxCycles)) : -1;
  if (over >= 0) {
    // (DATAFLOW's processes waiting for each other: a stream too shallow for a call's values, core/c-processes.js, #1707)
    const w = gen.report?.waits || [];
    const why = w.length ? `: DATAFLOW's processes may wait for each other: ${[...new Set(w.map((x) => `${x.to}|${x.from}`))].map((k) => { const [to, from] = k.split('|'); return `'${to}' starts once '${from}' is done, and ${w.filter((x) => x.to === to && x.from === from).map((x) => `the stream '${x.stream}' from '${from}' to it holds ${x.depth} values`).join('; ')} (a call may write more)`; }).join('; ')}` : '';
    return { ...base, ok: true, errors: [`a call did not end in ${callCycles(sim.calls[over], maxCycles)} cycles${why}`], calls: sim.calls.length, mismatches };
  }
  if (bad) mismatches.push({ call: null, port: 'ap_ctrl_hs', expected: 'ap_idle between calls, ap_done with ap_ready', got: `${bad} fault(s)` });
  const latency = tb.seq ? { min: Math.min(...cycles), max: Math.max(...cycles), avg: cycles.reduce((a, b) => a + b, 0) / cycles.length } : null;
  return { ...base, ok: true, pass: !mismatches.length, calls: sim.calls.length, mismatches, latency };
}
