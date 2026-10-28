// Silinx HLS (#1707): #pragma HLS DATAFLOW, task-level parallelism as Vitis HLS makes it (UG1399, Task-level
// parallelism): the top function a region of calls, each callee a process of its own (its module, core/c-hdl.js made
// with it as the top; its own machine, ap_ctrl_hs), all running at once, joined by channels:
//   a local hls::stream a FIFO (its depth hls::stream<T, D>'s or #pragma HLS STREAM depth=, else 2), one writer and one
//   reader;
//   a local array a buffer (PIPO within a call): its readers started once its writer is done;
//   the top's arguments passed to the processes (a stream or an array to one process, scalars to any).
// The top's ap_ctrl_hs starts every process once a call (each when the buffers it reads are written) and is done when
// every one is; with ap_ctrl_none, or every process an hls::task, the top has no ap_start, ap_done, ap_idle, ap_ready
// (as Vitis HLS's), its processes started again once all are done (#1900). A region of other statements than declarations and calls: a warning, made sequential (as Vitis HLS).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   cProcesses(source, checked, { file, lang, headers, cToHdl }) -> cToHdl's result, or { fallback: diagnostic }
import { constValue } from './c-check.js';
import { typeOf } from './c-types.js';
import { hdlName } from './c-graph.js';
import { portOf, ctrlNone } from './c-names.js';

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);
const CTRL = ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready'];
const SAID = /^#pragma HLS (DATAFLOW|STREAM) is accepted and ignored|^#pragma HLS INLINE off is ignored/;

/** Whether name is assigned in body (=, op=, ++, --) or its address taken. */
function changed(body, name) {
  let hit = false;
  const is = (e) => e?.kind === 'id' && e.name === name;
  const walk = (x) => {
    if (hit || !x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if ((x.kind === 'assign' && is(x.l)) || ((x.kind === 'unary' || x.kind === 'postfix') && ['++', '--', '&'].includes(x.op) && is(x.e))) { hit = true; return; }
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v);
  };
  walk(body);
  return hit;
}

/** The region of the top function: { calls: [{ callee, args, loc }], locals: Map name -> { kind, type, depth, loc }, consts:
 *  Map name -> its value (the global constants, #1895, and the const integers of the region) }, or { fallback: why }. */
export function region(fn, globals = new Map()) {
  const calls = [], locals = new Map(), depths = new Map(), consts = new Map(globals);
  let task = null;
  for (const st of fn.body.items) {
    if (st.kind === 'pragma') {
      if (st.pragma.name === 'TASK') task = st.pragma.args.name;   // (the next call an hls::task, #1719)
      if (st.pragma.name === 'STREAM' && st.pragma.args.variable && /^\d+$/.test(String(st.pragma.args.depth))) depths.set(st.pragma.args.variable, Number(st.pragma.args.depth));
      continue;
    }
    if (st.kind === 'decl') {
      for (const v of st.vars) {
        // (a constant: its value, where it is used, #1898; a variable never changed too, as Vitis HLS folds it, #1931)
        const k = (v.const || !changed(fn.body, v.name)) && !v.static && v.init && v.type.kind === 'int' && v.init.kind !== 'init' ? constValue(v.init, consts) : null;
        if (k !== null) { consts.set(v.name, k); continue; }
        // (hls_thread_local: a static, a stream living across calls)
        if (v.init || (v.static && v.type.kind !== 'stream') || !['stream', 'array'].includes(v.type.kind)) return { fallback: `'${v.name}': only streams and arrays are declared in a DATAFLOW region` };
        locals.set(v.name, { kind: v.type.kind, type: v.type, loc: v.loc });
      }
      continue;
    }
    const e = st.kind === 'expr' ? st.e : null;
    if (e?.kind === 'call' && e.callee.kind === 'id' && e.callee.name === 'assert') continue;
    if (e?.kind === 'call' && e.callee.kind === 'id') { calls.push({ callee: e.callee.name, args: e.args, loc: st.loc, task }); task = null; continue; }
    return { fallback: 'its statements other than calls of functions and declarations of streams and arrays' };
  }
  if (!calls.length) return { fallback: 'no function called in it' };
  for (const [n, l] of locals) {
    if (l.kind !== 'stream') continue;
    const d = l.type.depth ? constValue(l.type.depth, consts) : null;
    l.depth = depths.get(n) ?? (d !== null ? Number(d) : 2);
  }
  return { calls, locals, consts };
}

export function cProcesses(source, checked, { file, lang, headers, cToHdl }) {
  const fn = checked.funcs.get(checked.top);
  const rg = region(fn, checked.consts);
  const loc = fn.body.items.find((s) => s.kind === 'pragma' && (s.pragma.name === 'DATAFLOW' || s.pragma.name === 'TASK')).loc;
  const diag = (l, message, severity = 'error') => ({ file, line: l.line, col: l.col, message, severity });
  if (rg.fallback) return { fallback: diag(loc, `#pragma HLS DATAFLOW: the region has ${rg.fallback}: made sequential (not as processes)`, 'warning') };
  const rn = portOf;
  const params = new Map(fn.params.map((p) => [p.name, p]));
  const errors = [];
  const fail = (l, m) => errors.push(diag(l, `DATAFLOW: ${m}`));
  if (fn.ret.kind !== 'void') fail(fn.loc, `the top function '${fn.name}' returns a value: not supported in a DATAFLOW region yet (give it back through a stream or an array)`);
  // each call a process: its module (one per callee and its arrays' sizes)
  const mods = new Map(), procs = [];
  const sizeOf = (a) => {
    if (a?.kind !== 'id') return null;
    const t = locals(a.name)?.type ?? params.get(a.name)?.type;
    return t?.kind === 'array' && t.length ? Number(t.length) : null;
  };
  const locals = (n) => rg.locals.get(n);
  rg.calls.forEach((c, k) => {
    const f = checked.funcs.get(c.callee);
    if (!f?.body) { fail(c.loc, `'${c.callee}' is not defined`); return; }
    const depths = {};
    f.params.forEach((pa, i) => { const n = sizeOf(c.args[i]); if (n && pa.name) depths[pa.name] = n; });
    const key = `${c.callee} ${JSON.stringify(depths)}`;
    if (!mods.has(key)) {
      const same = [...mods.values()].filter((m) => m.callee === c.callee).length;
      const module = `${rn(hdlName(c.callee))}${same ? `_${same}` : ''}`;
      mods.set(key, { callee: c.callee, module, gen: cToHdl(source, { file, lang, headers, top: c.callee, depths, module, flat: true }) });
    }
    const m = mods.get(key);
    procs.push({ k, call: c, f, mod: m, inst: `${m.module}_U${k}`, deps: new Set(), task: !!c.task });
  });
  const diagnostics = [];
  const seen = new Set();
  const add = (d) => { const s = `${d.line}:${d.col}:${d.severity}:${d.message}`; if (!seen.has(s) && !SAID.test(d.message)) { seen.add(s); diagnostics.push(d); } };
  checked.diagnostics.forEach(add);
  // (a process's own names as VHDL or Verilog's reserved words: inside the module, the top's ports their own)
  for (const m of mods.values()) m.gen.diagnostics.filter((d) => !/is a reserved word of VHDL or Verilog|is a name Vitis HLS reserves/.test(d.message)).forEach(add);
  if ([...mods.values()].some((m) => !m.gen.ok)) return { ok: false, hdl: '', top: rn(checked.top), ports: [], diagnostics: diagnostics.sort(byLine) };
  // the channels and the top's arguments: who writes and who reads each
  const use = new Map();   // name -> { writers: [{ p, port }], readers, scalar: [{ p, port }] }
  const of = (n) => { if (!use.has(n)) use.set(n, { writers: [], readers: [], ports: [] }); return use.get(n); };
  for (const p of procs) {
    p.wires = [];
    for (const port of p.mod.gen.ports) {
      if (CTRL.includes(port.name)) continue;
      const i = p.f.params.findIndex((pa) => pa.name === port.param);
      // (*s: a reference to a stream, an argument of a function declared before its definition)
      const a0 = p.call.args[i], a = a0?.kind === 'unary' && a0.op === '*' && a0.e.kind === 'id' ? a0.e : a0;
      if (port.role === 'arg_vld') continue;
      if (port.role === 'return' || (port.role === 'arg' && port.dir === 'out')) { fail(p.call.loc, `'${p.call.callee}' gives back a value (${port.name}): not supported in a DATAFLOW region yet (a stream or an array)`); continue; }
      if (port.role === 'arg') {
        const v = a?.kind === 'id' && params.get(a.name) && params.get(a.name).type.kind !== 'ptr' ? { top: a.name } : constValue(a, rg.consts) !== null ? { k: constValue(a, rg.consts) } : null;
        if (!v) { fail(p.call.loc, `the argument of '${port.param}' of '${p.call.callee}': an argument of '${fn.name}' or a constant (not an expression, yet)`); continue; }
        p.wires.push({ port, ...v });
        continue;
      }
      if (a?.kind !== 'id' || !(locals(a.name) || params.get(a.name))) { fail(p.call.loc, `the argument of '${port.param}' of '${p.call.callee}': a stream or an array of the region or of '${fn.name}'`); continue; }
      const u = of(a.name);
      u.ports.push({ p, port });
      const w = port.role === 'fifo' ? /_din$|_write$|_full_n$/.test(port.name) : /_we0$|_d0$/.test(port.name);
      const list = w ? u.writers : u.readers;
      if (!list.includes(p)) list.push(p);
    }
  }
  for (const [n, u] of use) {
    const l = locals(n);
    if (l?.kind === 'stream' && (u.writers.length !== 1 || u.readers.length !== 1)) fail(l.loc, `the stream '${n}': one process writes it and one reads it (${u.writers.length} write, ${u.readers.length} read)`);
    if (l?.kind === 'array') {
      if (u.writers.length !== 1) fail(l.loc, `the array '${n}': one process writes it (${u.writers.length} do)`);
      const readers = u.readers.filter((p) => !u.writers.includes(p));
      if (readers.length > 1) fail(l.loc, `the array '${n}': read by ${readers.length} processes, one at a time not made yet`);
      for (const p of readers) for (const w of u.writers) p.deps.add(w);
    }
    if (!l) {
      const ps = new Set(u.ports.map((x) => x.p));
      if (ps.size > 1) fail(params.get(n).loc, `the argument '${n}' is used by ${ps.size} processes: one process each (not yet shared)`);
    }
  }
  for (const p of procs) if (p.task && p.deps.size) fail(p.call.loc, `the task '${p.call.task}' reads an array a process writes: a task's channels are streams`);
  // (a process waits for the buffers it reads: no cycle)
  const order = [], state = new Map();
  const visit = (p) => { if (state.get(p) === 2) return true; if (state.get(p) === 1) return false; state.set(p, 1); for (const d of p.deps) if (!visit(d)) return false; state.set(p, 2); order.push(p); return true; };
  if (!procs.every(visit)) fail(loc, 'the processes read each other\'s arrays in a cycle');
  // (a stream to a process that waits for its writer to be done, through a buffer: all a call writes must fit in it;
  // the co-simulation says so when a call does not end)
  const after = (p, q) => p.deps.has(q) || [...p.deps].some((d) => after(d, q));
  const waits = [];
  for (const [n, u] of use) {
    const l = locals(n);
    if (l?.kind === 'stream' && u.readers.length === 1 && u.writers.length === 1 && after(u.readers[0], u.writers[0])) waits.push({ stream: n, from: u.writers[0].call.callee, to: u.readers[0].call.callee, depth: l.depth });
  }
  errors.forEach(add);
  if (errors.length) return { ok: false, hdl: '', top: rn(checked.top), ports: [], diagnostics: diagnostics.sort(byLine) };
  // the top's ports: the block protocol, then each argument's (as its process's); with ap_ctrl_none, or every process an
  // hls::task (data-driven), only the clock and the reset, as Vitis HLS's (#1900)
  // (ap_ctrl_none: a stream argument to feed it through, as Vitis HLS co-simulates it; else its block protocol made)
  const none = ctrlNone(fn), streamed = fn.params.some((pa) => pa.type.kind === 'stream');
  if (none && !streamed) add(diag(fn.body.items.find((st) => st.kind === 'pragma' && st.pragma.name === 'INTERFACE' && st.pragma.args.port === 'return').loc, 'ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made', 'warning'));
  const free = (none && streamed) || procs.every((p) => p.task);
  const ports = CTRL.slice(0, free ? 2 : CTRL.length).map((name) => ({ name, dir: ['ap_clk', 'ap_rst', 'ap_start'].includes(name) ? 'in' : 'out', w: 1 }));
  const memories = [], fifos = [];
  for (const pa of fn.params) {
    const u = use.get(pa.name);
    if (u) {
      for (const { port } of u.ports) ports.push({ name: rn(pa.name) + port.name.slice(rn(port.param).length), dir: port.dir, w: port.role === 'mem' && /_address0$/.test(port.name) ? clog2(Number(pa.type.length)) : port.w, role: port.role, param: pa.name });
      const pm = u.ports[0].p.mod.gen;
      const callee = u.ports[0].port.param;
      const m = pm.memories.find((x) => x.name === callee), f = pm.fifos.find((x) => x.name === callee);
      if (m) memories.push({ ...m, name: pa.name, n: Number(pa.type.length), aw: clog2(Number(pa.type.length)), port: rn(pa.name) });
      if (f) fifos.push({ ...f, name: pa.name, port: rn(pa.name) });
      continue;
    }
    const t = typeOf(pa.type);
    if (t && pa.type.kind !== 'ptr' && pa.type.kind !== 'array' && procs.some((p) => p.wires.some((x) => x.top === pa.name))) ports.push({ name: rn(pa.name), dir: 'in', w: t.w, role: 'arg', param: pa.name, s: t.s });
  }
  const name = rn(checked.top);
  const src = file.split('/').pop();
  const net = { name, src, procs, use, locals: rg.locals, params, ports, rn, fn, free };
  const top = lang === 'vhdl' ? vhdlTop(net) : verilogTop(net);
  const hdl = [...[...mods.values()].map((m) => m.gen.hdl), ...top].join('\n');
  const report = { sequential: true, dataflow: true, tasks: procs.some((p) => p.task), processes: procs.map((p) => ({ name: p.call.callee, module: p.mod.module, instance: p.inst, states: p.mod.gen.report.states, registerBits: p.mod.gen.report.registerBits, after: [...p.deps].map((d) => d.call.callee), ...(p.task ? { task: p.call.task } : {}) })),
    memories: [...memories.map((x) => ({ name: x.name, words: x.n, bits: x.w, kind: 'ap_memory' })), ...[...rg.locals].filter(([, l]) => l.kind === 'array').map(([n, l]) => ({ name: n, words: Number(l.type.length), bits: typeOf(l.type.of)?.w ?? 0, kind: 'RAM (PIPO)' }))],
    fifos: [...rg.locals].filter(([, l]) => l.kind === 'stream').map(([n, l]) => ({ name: n, depth: l.depth })), waits, loops: [] };
  return { ok: true, hdl, top: name, ports, diagnostics: diagnostics.sort(byLine), sequential: true, states: 0, memories, fifos, report, dataflow: true };
}

const byLine = (a, b) => a.line - b.line || a.col - b.col;

// ------------------------------------------------------------------ the top's nets, shared by VHDL and Verilog
/** The top's pieces: each process's signals, its connections (dst <- src, widths), the FIFOs and buffers. */
function pieces(net) {
  const { procs, use, locals, params, rn } = net;
  const sig = (p, port) => `${p.inst}_${port.name}`;
  const sigs = [], links = [], fifos = [], bufs = [];
  for (const p of procs) for (const port of p.mod.gen.ports) if (!['ap_clk', 'ap_rst'].includes(port.name)) sigs.push({ name: sig(p, port), w: port.w });
  for (const p of procs) {
    for (const x of p.wires) {
      if (x.top !== undefined) { const tp = net.ports.find((q) => q.param === x.top); links.push({ dst: sig(p, x.port), dw: x.port.w, src: tp.name, sw: tp.w, s: tp.s }); }
      else links.push({ dst: sig(p, x.port), dw: x.port.w, k: x.k });
    }
  }
  for (const [n, u] of use) {
    const l = locals.get(n);
    if (!l) {
      // (an argument of the top: its process's ports are its)
      for (const { p, port } of u.ports) {
        const tp = `${rn(n)}${port.name.slice(rn(port.param).length)}`, w = net.ports.find((q) => q.name === tp).w;
        if (port.dir === 'in') links.push({ dst: sig(p, port), dw: port.w, src: tp, sw: w });
        else links.push({ dst: tp, dw: w, src: sig(p, port), sw: port.w });
      }
      continue;
    }
    const bn = `ap_ch_${hdlName(n)}`;
    if (l.kind === 'stream') {
      const wr = u.ports.filter((x) => u.writers.includes(x.p)), rd = u.ports.filter((x) => !u.writers.includes(x.p));
      const at = (list, sfx) => { const x = list.find((y) => y.port.name.endsWith(sfx)); return sig(x.p, x.port); };
      const w = wr.find((x) => x.port.name.endsWith('_din')).port.w;
      fifos.push({ name: bn, w, depth: l.depth, din: at(wr, '_din'), wr: at(wr, '_write'), full: at(wr, '_full_n'), dout: at(rd, '_dout'), rd: at(rd, '_read'), empty: at(rd, '_empty_n') });
      continue;
    }
    const n2 = Number(l.type.length), w = typeOf(l.type.of)?.w ?? params.get(n)?.w;
    const aw = clog2(n2);
    const portsOf = (sfx) => u.ports.filter((x) => x.port.name.endsWith(sfx)).map((x) => ({ s: sig(x.p, x.port), w: x.port.w }));
    bufs.push({ name: bn, n: n2, w, aw, addr: portsOf('_address0'), ce: portsOf('_ce0'), we: portsOf('_we0'), d: portsOf('_d0'), q: portsOf('_q0') });
  }
  return { sigs, links, fifos, bufs, sig };
}

/** The processes' start: each once a call, after the buffers it reads are written; the top done when all are. (An
 *  hls::task runs by itself: its ap_start 1, the top not waiting for it, #1719.) */
function control(procs) {
  return procs.filter((p) => !p.task).map((p) => ({ inst: p.inst, deps: [...p.deps].map((d) => d.inst) }));
}

// ------------------------------------------------------------------ VHDL
function vhdlTop(net) {
  const { name, src, procs } = net;
  const { sigs, links, fifos, bufs, sig } = pieces(net);
  const T = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const out = [];
  fifos.forEach((f, i) => out.push(...vhdlFifo(`${name}_ap_fifo${i}`, f.w, f.depth)));
  const L = [`-- Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): edit the C source`, '-- (#pragma HLS DATAFLOW: each process a module, its channels FIFOs and buffers)',
    'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '', `entity ${name} is`, '  port ('];
  net.ports.forEach((p, k) => L.push(`    ${p.name} : ${p.dir} ${T(p.w)}${k < net.ports.length - 1 ? ';' : ''}`));
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`, "  signal ap_busy : std_logic := '0';");
  for (const s of sigs) L.push(`  signal ${s.name} : ${T(s.w)};`);
  for (const p of procs) if (!p.task) L.push(`  signal ${p.inst}_pend, ${p.inst}_fin : std_logic := '0';`);
  L.push('  signal ap_all_done : std_logic;');
  // (ap_ctrl_none: the block protocol's signals inside the module, ap_start 1: the processes started again once all are
  // done, #1900)
  if (net.free) L.push("  signal ap_start : std_logic := '1';", '  signal ap_done, ap_idle, ap_ready : std_logic;');
  for (const b of bufs) L.push(`  type ${b.name}_t is array (0 to ${b.n - 1}) of std_logic_vector(${b.w - 1} downto 0);`, `  signal ${b.name} : ${b.name}_t;`,
    `  signal ${b.name}_addr : unsigned(${b.aw - 1} downto 0);`, `  signal ${b.name}_ce, ${b.name}_we : std_logic;`, `  signal ${b.name}_d, ${b.name}_q : std_logic_vector(${b.w - 1} downto 0);`);
  L.push('begin');
  for (const p of procs) {
    const m = p.mod.gen.ports.map((port) => `${port.name} => ${['ap_clk', 'ap_rst'].includes(port.name) ? port.name : sig(p, port)}`);
    L.push(`  ${p.inst} : entity work.${p.mod.module} port map (${m.join(', ')});`);
  }
  const conv = (src0, sw, dw, s = false) => {
    if (sw === dw) return src0;
    if (dw === 1) return `${src0}(0)`;
    if (sw === 1) return `(0 => ${src0}, others => '0')`;
    return dw < sw ? `${src0}(${dw - 1} downto 0)` : `std_logic_vector(resize(${s ? 'signed' : 'unsigned'}(${src0}), ${dw}))`;
  };
  for (const l of links) L.push(`  ${l.dst} <= ${l.k !== undefined ? (l.dw === 1 ? `'${l.k & 1n}'` : `std_logic_vector(to_${l.k < 0n ? 'signed' : 'unsigned'}(${l.k}, ${l.dw}))`) : conv(l.src, l.sw, l.dw, l.s)};`);
  fifos.forEach((f, i) => L.push(`  ${f.name} : entity work.${name}_ap_fifo${i} port map (ap_clk => ap_clk, ap_rst => ap_rst, din => ${f.din}, wr => ${f.wr}, full_n => ${f.full}, dout => ${f.dout}, rd => ${f.rd}, empty_n => ${f.empty});`));
  for (const b of bufs) {
    // (a buffer: its writer's port while it writes, its readers' after; read the cycle after the address)
    const ce = b.ce.map((x) => x.s).join(' or ');
    const wce = b.we.length ? b.ce.find((x) => b.we.some((y) => y.s.replace(/_we0$/, '') === x.s.replace(/_ce0$/, ''))) : null;
    const addrOf = (x) => (x.w === 1 ? `(0 => ${x.s}, others => '0')` : `resize(unsigned(${x.s}), ${b.aw})`);
    const others = b.addr.filter((x) => !wce || x.s.replace(/_address0$/, '') !== wce.s.replace(/_ce0$/, ''));
    const waddr = wce ? b.addr.find((x) => x.s.replace(/_address0$/, '') === wce.s.replace(/_ce0$/, '')) : null;
    let a = others.length ? addrOf(others.at(-1)) : `to_unsigned(0, ${b.aw})`;
    for (const x of others.slice(0, -1).reverse()) a = `${addrOf(x)} when ${x.s.replace(/_address0$/, '_ce0')} = '1' else ${a}`;
    if (waddr) a = `${addrOf(waddr)} when ${wce.s} = '1' else ${a}`;
    L.push(`  ${b.name}_ce <= ${ce || "'0'"};`, `  ${b.name}_addr <= ${a};`, `  ${b.name}_we <= ${b.we.map((x) => x.s).join(' or ') || "'0'"};`,
      `  ${b.name}_d <= ${b.d.length ? conv(b.d[0].s, b.d[0].w, b.w) : '(others => \'0\')'};`);
    for (const q of b.q) L.push(`  ${q.s} <= ${conv(`${b.name}_q`, b.w, q.w)};`);
    L.push('  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', `      if ${b.name}_ce = '1' then`, `        if ${b.name}_we = '1' then`, `          ${b.name}(to_integer(${b.name}_addr)) <= ${b.name}_d;`, '        end if;',
      `        ${b.name}_q <= ${b.name}(to_integer(${b.name}_addr));`, '      end if;', '    end if;', '  end process;');
  }
  const ctl = control(procs);
  for (const c of ctl) L.push(`  ${c.inst}_ap_start <= ${[`${c.inst}_pend`, ...c.deps.map((d) => `${d}_fin`)].join(' and ')};`);
  for (const p of procs) if (p.task) L.push(`  ${p.inst}_ap_start <= '1';`);
  L.push(`  ap_all_done <= ${ctl.map((c) => `${c.inst}_fin`).join(' and ') || "'1'"};`, '  ap_done <= ap_busy and ap_all_done;', '  ap_ready <= ap_busy and ap_all_done;', '  ap_idle <= not ap_busy;');
  L.push('  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_rst = '1' then", "        ap_busy <= '0';", ...ctl.flatMap((c) => [`        ${c.inst}_pend <= '0';`, `        ${c.inst}_fin <= '0';`]),
    "      elsif ap_busy = '0' then", "        if ap_start = '1' then", "          ap_busy <= '1';", ...ctl.flatMap((c) => [`          ${c.inst}_pend <= '1';`, `          ${c.inst}_fin <= '0';`]), '        end if;', '      else');
  for (const c of ctl) L.push(`        if ${c.inst}_ap_start = '1' and ${c.inst}_ap_idle = '1' then`, `          ${c.inst}_pend <= '0';`, '        end if;', `        if ${c.inst}_ap_done = '1' then`, `          ${c.inst}_fin <= '1';`, '        end if;');
  L.push("        if ap_all_done = '1' then", "          ap_busy <= '0';", '        end if;', '      end if;', '    end if;', '  end process;', 'end behav;', '');
  return [...out, ...L];
}

function vhdlFifo(name, w, depth) {
  const T = (x) => (x === 1 ? 'std_logic' : `std_logic_vector(${x - 1} downto 0)`);
  const aw = clog2(depth), cw = clog2(depth + 1);
  return [`-- a FIFO of ${depth} words of ${w} bits (#pragma HLS DATAFLOW's channel): its first word on dout while empty_n`,
    'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '', `entity ${name} is`,
    `  port (ap_clk : in std_logic; ap_rst : in std_logic; din : in ${T(w)}; wr : in std_logic; full_n : out std_logic; dout : out ${T(w)}; rd : in std_logic; empty_n : out std_logic);`,
    `end ${name};`, '', `architecture behav of ${name} is`, `  type mem_t is array (0 to ${depth - 1}) of ${T(w)};`, '  signal mem : mem_t;',
    `  signal head, tail : unsigned(${aw - 1} downto 0);`, `  signal cnt : unsigned(${cw - 1} downto 0);`, '  signal put, take : std_logic;', 'begin',
    `  put <= '1' when wr = '1' and cnt /= ${depth} else '0';`, "  take <= '1' when rd = '1' and cnt /= 0 else '0';",
    `  full_n <= '1' when cnt /= ${depth} else '0';`, "  empty_n <= '1' when cnt /= 0 else '0';", '  dout <= mem(to_integer(head));',
    '  process (ap_clk)', '  begin', '    if rising_edge(ap_clk) then', "      if ap_rst = '1' then", '        head <= (others => \'0\');', '        tail <= (others => \'0\');', '        cnt <= (others => \'0\');', '      else',
    "        if put = '1' then", '          mem(to_integer(tail)) <= din;', `          if tail = ${depth - 1} then tail <= (others => '0'); else tail <= tail + 1; end if;`, '        end if;',
    "        if take = '1' then", `          if head = ${depth - 1} then head <= (others => '0'); else head <= head + 1; end if;`, '        end if;',
    "        if put = '1' and take = '0' then cnt <= cnt + 1; elsif put = '0' and take = '1' then cnt <= cnt - 1; end if;", '      end if;', '    end if;', '  end process;', 'end behav;', ''];
}

// ------------------------------------------------------------------ Verilog
function verilogTop(net) {
  const { name, src, procs } = net;
  const { sigs, links, fifos, bufs, sig } = pieces(net);
  const W = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const out = [];
  fifos.forEach((f, i) => out.push(...verilogFifo(`${name}_ap_fifo${i}`, f.w, f.depth)));
  const L = [`// Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): edit the C source`, '// (#pragma HLS DATAFLOW: each process a module, its channels FIFOs and buffers)', `module ${name} (`];
  net.ports.forEach((p, k) => L.push(`  ${p.dir === 'in' ? 'input ' : 'output'} wire ${W(p.w)}${p.name}${k < net.ports.length - 1 ? ',' : ''}`));
  L.push(');', '  reg ap_busy;');
  for (const s of sigs) L.push(`  wire ${W(s.w)}${s.name};`);
  for (const p of procs) if (!p.task) L.push(`  reg ${p.inst}_pend, ${p.inst}_fin;`);
  L.push('  wire ap_all_done;');
  if (net.free) L.push("  wire ap_start = 1'b1;", '  wire ap_done, ap_idle, ap_ready;');
  for (const b of bufs) L.push(`  reg [${b.w - 1}:0] ${b.name} [0:${b.n - 1}];`, `  reg [${b.w - 1}:0] ${b.name}_q;`, `  wire [${b.aw - 1}:0] ${b.name}_addr;`, `  wire ${b.name}_ce, ${b.name}_we;`, `  wire [${b.w - 1}:0] ${b.name}_d;`);
  for (const p of procs) L.push(`  ${p.mod.module} ${p.inst} (${p.mod.gen.ports.map((port) => `.${port.name}(${['ap_clk', 'ap_rst'].includes(port.name) ? port.name : sig(p, port)})`).join(', ')});`);
  const conv = (s0, sw, dw, sg = false) => (dw > sw && sg && sw > 1 ? `{{${dw - sw}{${s0}[${sw - 1}]}}, ${s0}}` : dw < sw ? (dw === 1 ? `${s0}[0]` : `${s0}[${dw - 1}:0]`) : s0);
  for (const l of links) L.push(`  assign ${l.dst} = ${l.k !== undefined ? `${l.dw}'d${BigInt.asUintN(l.dw, l.k)}` : conv(l.src, l.sw, l.dw, l.s)};`);
  fifos.forEach((f, i) => L.push(`  ${name}_ap_fifo${i} ${f.name} (.ap_clk(ap_clk), .ap_rst(ap_rst), .din(${f.din}), .wr(${f.wr}), .full_n(${f.full}), .dout(${f.dout}), .rd(${f.rd}), .empty_n(${f.empty}));`));
  for (const b of bufs) {
    const wce = b.we.length ? b.ce.find((x) => b.we.some((y) => y.s.replace(/_we0$/, '') === x.s.replace(/_ce0$/, ''))) : null;
    const waddr = wce ? b.addr.find((x) => x.s.replace(/_address0$/, '') === wce.s.replace(/_ce0$/, '')) : null;
    const others = b.addr.filter((x) => x !== waddr);
    let a = others.length ? others.at(-1).s : `${b.aw}'d0`;
    for (const x of others.slice(0, -1).reverse()) a = `${x.s.replace(/_address0$/, '_ce0')} ? ${x.s} : ${a}`;
    if (waddr) a = `${wce.s} ? ${waddr.s} : ${a}`;
    L.push(`  assign ${b.name}_ce = ${b.ce.map((x) => x.s).join(' | ') || "1'b0"};`, `  assign ${b.name}_addr = ${a};`, `  assign ${b.name}_we = ${b.we.map((x) => x.s).join(' | ') || "1'b0"};`,
      `  assign ${b.name}_d = ${b.d.length ? b.d[0].s : `${b.w}'d0`};`);
    for (const q of b.q) L.push(`  assign ${q.s} = ${conv(`${b.name}_q`, b.w, q.w)};`);
    L.push(`  always @(posedge ap_clk) if (${b.name}_ce) begin`, `    if (${b.name}_we) ${b.name}[${b.name}_addr] <= ${b.name}_d;`, `    ${b.name}_q <= ${b.name}[${b.name}_addr];`, '  end');
  }
  const ctl = control(procs);
  for (const c of ctl) L.push(`  assign ${c.inst}_ap_start = ${[`${c.inst}_pend`, ...c.deps.map((d) => `${d}_fin`)].join(' & ')};`);
  for (const p of procs) if (p.task) L.push(`  assign ${p.inst}_ap_start = 1'b1;`);
  L.push(`  assign ap_all_done = ${ctl.map((c) => `${c.inst}_fin`).join(' & ') || "1'b1"};`, '  assign ap_done = ap_busy & ap_all_done;', '  assign ap_ready = ap_busy & ap_all_done;', '  assign ap_idle = ~ap_busy;');
  L.push('  always @(posedge ap_clk) begin', '    if (ap_rst) begin', "      ap_busy <= 1'b0;", ...ctl.flatMap((c) => [`      ${c.inst}_pend <= 1'b0;`, `      ${c.inst}_fin <= 1'b0;`]),
    '    end else if (!ap_busy) begin', '      if (ap_start) begin', "        ap_busy <= 1'b1;", ...ctl.flatMap((c) => [`        ${c.inst}_pend <= 1'b1;`, `        ${c.inst}_fin <= 1'b0;`]), '      end', '    end else begin');
  for (const c of ctl) L.push(`      if (${c.inst}_ap_start && ${c.inst}_ap_idle) ${c.inst}_pend <= 1'b0;`, `      if (${c.inst}_ap_done) ${c.inst}_fin <= 1'b1;`);
  L.push("      if (ap_all_done) ap_busy <= 1'b0;", '    end', '  end', 'endmodule', '');
  return [...out, ...L];
}

function verilogFifo(name, w, depth) {
  const aw = clog2(depth), cw = clog2(depth + 1);
  const W = w > 1 ? `[${w - 1}:0] ` : '';
  return [`// a FIFO of ${depth} words of ${w} bits (#pragma HLS DATAFLOW's channel): its first word on dout while empty_n`,
    `module ${name} (input wire ap_clk, input wire ap_rst, input wire ${W}din, input wire wr, output wire full_n, output wire ${W}dout, input wire rd, output wire empty_n);`,
    `  reg ${W}mem [0:${depth - 1}];`, `  reg [${aw - 1}:0] head, tail;`, `  reg [${cw - 1}:0] cnt;`,
    `  wire put = wr && cnt != ${depth};`, '  wire take = rd && cnt != 0;', `  assign full_n = cnt != ${depth};`, '  assign empty_n = cnt != 0;', '  assign dout = mem[head];',
    '  always @(posedge ap_clk) begin', '    if (ap_rst) begin', '      head <= 0; tail <= 0; cnt <= 0;', '    end else begin',
    `      if (put) begin mem[tail] <= din; tail <= tail == ${depth - 1} ? 0 : tail + 1; end`, `      if (take) head <= head == ${depth - 1} ? 0 : head + 1;`,
    '      if (put && !take) cnt <= cnt + 1; else if (!put && take) cnt <= cnt - 1;', '    end', '  end', 'endmodule', ''];
}
