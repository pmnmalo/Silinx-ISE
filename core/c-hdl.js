// Silinx HLS (#1525): a C source to VHDL or Verilog. The top function becomes a module with Vitis HLS's ports (the block
// protocol ap_ctrl_hs, or none with #pragma HLS INTERFACE ap_ctrl_none port=return, #1900; the arguments, named as
// Vitis HLS names them, core/c-names.js; ap_return); a
// combinational function is a combinational module (its graph, core/c-dataflow.js), one signal per operation.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   cToHdl(source, { file, lang: 'vhdl' | 'verilog' }) -> { ok, hdl, top, ports, diagnostics, sequential, report }
//     ports: [{ name, dir, w }] in the module's order (the block protocol's first, as Vitis HLS)
import { checkC } from './c-check.js';
import { dataflow } from './c-dataflow.js';
import { portOf, renamedWhy } from './c-names.js';
import { scheduled } from './c-schedule.js';
import { vhdlSeq, verilogSeq } from './c-hdl-seq.js';
import { aggregate, aggregable, structPragmas, wordGroups } from './c-aggregate.js';
import { cProcesses } from './c-processes.js';
import { dataflowCall, hasStreams } from './c-dataflow-call.js';
import { foldTables } from './c-const-init.js';
import { flattenArrays } from './c-flatten.js';
import { DEFAULT_CLOCK, fitsClock } from './c-timing.js';
import { axiPlan, axiWrap } from './c-axi.js';

export const bits = (k, w) => {
  const m = (1n << BigInt(w)) - 1n;
  return ((BigInt(k) % (m + 1n)) + (m + 1n)) % (m + 1n);
};
export const bin = (k, w) => bits(k, w).toString(2).padStart(w, '0');

// (headers, top: a source of several files, its top function named, #1597)
// (depths, module, flat: a DATAFLOW process's, core/c-processes.js, #1707: its pointer arguments' depths, its module's
// name, its struct arguments' members ports of their own; pipelineLoops: Vitis HLS's syn.compile.pipeline_loops, the
// threshold of the loops pipelined automatically, 0 none, #1919)
export function cToHdl(source, { file = 'input.c', lang = 'vhdl', headers = null, top = null, depths = null, module = null, flat = false, pipelineLoops, clock = DEFAULT_CLOCK, family = 'artix7', directives = null, stall = false } = {}) {
  const checked = checkC(source, file, { headers, top, depths, synthesis: true, directives });   // (__SYNTHESIS__ defined, as Vitis HLS's, #1897)
  const diagnostics = [...checked.diagnostics];
  if (!checked.ok || !checked.top) return { ok: false, hdl: '', top: checked.top, ports: [], diagnostics };
  // (#pragma HLS INTERFACE s_axilite: this function's module inside one with the bus, core/c-axi.js, #1893)
  const axi = axiPlan(checked.funcs.get(checked.top), checked.consts);
  if (axi && !module) {
    const name = portOf(checked.top);
    const gen = cToHdl(source, { file, lang, headers, top, depths, module: `${name}_core`, flat, pipelineLoops, clock, family, directives, stall: axi.masters.size > 0 });
    return gen.ok ? axiWrap(gen, axi, { name, src: file.split('/').pop(), lang, file }) : gen;
  }
  // (a table filled from constants: computed at synthesis, a ROM, #1779; arrays of more dimensions one, #1786)
  foldTables(checked);
  const flatErrs = [];
  flattenArrays(checked, (loc, message) => flatErrs.push({ file, line: loc?.line || 1, col: loc?.col || 1, message, severity: 'error' }));
  if (flatErrs.length) return { ok: false, hdl: '', top: checked.top, ports: [], diagnostics: [...diagnostics, ...flatErrs] };
  // (a region in a function the top calls alone: the top's, #1931)
  const callErrs = [];
  dataflowCall(checked, (loc, message) => callErrs.push({ file, line: loc?.line || 1, col: loc?.col || 1, message, severity: 'error' }));
  if (callErrs.length) return { ok: false, hdl: '', top: checked.top, ports: [], diagnostics: [...diagnostics, ...callErrs].sort((a, b) => a.line - b.line || a.col - b.col) };
  // (a top that runs an hls::FIR, its calls only: its processes too, the filter's hardware its own; of other statements,
  // the filter's C model inlined, #1942)
  const firTop = !checked.dataflow && checked.ast.firs?.size && checked.funcs.get(checked.top).body.items.some((st) => st.kind === 'expr' && st.e.kind === 'call' && checked.ast.firs.has(st.e.callee.name));
  if (firTop) {
    const r = cProcesses(source, checked, { file, lang, headers, cToHdl, module, stall });
    if (!r.fallback) return r;
  }
  // #pragma HLS DATAFLOW: the top's calls processes of their own (#1707); a region not of calls, sequential (said); one
  // with streams of its own cannot be (said, #1931)
  if (checked.dataflow) {
    const r = cProcesses(source, checked, { file, lang, headers, cToHdl, pipelineLoops, module, stall });
    if (!r.fallback) return r;
    if (hasStreams(checked.funcs.get(checked.top))) {
      const why = { ...r.fallback, severity: 'error', message: r.fallback.message.replace(/: made sequential \(not as processes\)$/, ': its streams are FIFOs between processes, so it cannot be made sequential') };
      return { ok: false, hdl: '', top: checked.top, ports: [], diagnostics: [...diagnostics.filter((d) => !/^#pragma HLS DATAFLOW is accepted and ignored/.test(d.message)), why].sort((a, b) => a.line - b.line || a.col - b.col) };
    }
    // (said once: why it is made sequential)
    diagnostics.splice(0, diagnostics.length, ...diagnostics.filter((d) => !/^#pragma HLS DATAFLOW is accepted and ignored/.test(d.message)), r.fallback);
  }
  let df = dataflow(checked);
  const fn = checked.funcs.get(checked.top);
  const sargs = checked.ast.structArgs?.get(checked.top) || [];
  // (a stream or an array of structs one of its words, #1668; AGGREGATE / DISAGGREGATE: how, or not)
  const prag = flat ? { how: new Map(), named: [] } : structPragmas(fn);
  const groups = flat ? [] : wordGroups(sargs, fn, prag.how);
  // not combinational (a loop whose count depends on the inputs, a static or global variable): a sequential module,
  // a state machine (core/c-fsmd.js, #1526)
  const seqOnly = df.diagnostics.some((d) => d.severity === 'error') && df.diagnostics.every((d) => d.severity !== 'error' || d.message.includes('#1526'));
  if (seqOnly) df = { ...scheduled(checked, { groups, pipelineLoops }, { clock, family }), seq: true };
  // a combinational top whose longest path does not fit the clock (the project's, syn.clock, else 10 ns): scheduled
  // over cycles, as Vitis HLS does, a sequential module (#1924); kept combinational when it cannot be made so
  else if (!flat && df.ctrl === 'ap_ctrl_hs' && !df.diagnostics.some((d) => d.severity === 'error') && !fitsClock(df.graph, clock, family)) {
    const sq = scheduled(checked, { groups, pipelineLoops }, { clock, family });
    if (!sq.diagnostics.some((d) => d.severity === 'error')) df = { ...sq, seq: true };
  }
  diagnostics.push(...df.diagnostics);
  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  if (df.diagnostics.some((d) => d.severity === 'error')) return { ok: false, hdl: '', top: checked.top, ports: [], diagnostics };
  // a name that is a reserved word of VHDL or Verilog, or one of Vitis HLS's: its port named <name>_r (a warning, #1902)
  const rn = portOf;
  const own = (a) => !prag.how.get(a.name)?.disaggregate && (aggregable(a, fn.params) || groups.some((x) => x.name === a.name));
  // (a struct argument's port its name's, #1628; a stream's or a memory's of structs, #1668)
  for (const n of [checked.top, ...fn.params.map((p) => p.name), ...sargs.filter((a) => a.name !== 'return' && own(a)).map((a) => a.name)]) {
    if (renamedWhy(n)) diagnostics.push({ file, line: fn.loc.line, col: fn.loc.col, message: renamedWhy(n), severity: 'warning' });
  }
  // a struct argument or result (#1590): one port (#1628, core/c-aggregate.js); a stream or an array of structs one of
  // its words (#1668); DISAGGREGATE, or a struct with a stream in it (as Vitis HLS disaggregates it), a port, a stream or a
  // memory per member; else said
  for (const a of sargs.filter((x) => !flat && !own(x) && !prag.how.get(x.name)?.disaggregate)) {
    const kinds = a.members.map((m) => fn.params.find((p) => p.name === m)?.type.kind);
    if (!a.stream && kinds.includes('stream')) continue;
    diagnostics.push({ file, line: a.loc.line, col: a.loc.col, message: a.stream ? `the stream of a struct '${a.name}': its members are streams of their own (${a.members.join(', ')}); Vitis HLS makes one stream of them (not yet: a member not an integer)`
      : a.kind === 'arr' || (a.kind === 'ptr' && kinds.every((k) => k === 'array')) ? `the struct argument '${a.name}': its members are memories of their own (${a.members.join(', ')}); Vitis HLS makes one memory of them (not yet: a member not an integer)`
        : `the struct argument '${a.name}': its members are ports of their own (${a.members.join(', ')}), a member array a memory; Vitis HLS makes one port of them (not yet)`, severity: 'warning' });
  }
  for (const p of prag.named) {
    if (!sargs.some((a) => a.name === p.name && a.name !== 'return')) diagnostics.push({ file, line: p.loc.line, col: p.loc.col, message: `#pragma HLS ${p.pragma} variable=${p.name}: not a struct argument of the top function: ignored`, severity: 'warning' });
  }
  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  for (const node of df.graph.nodes) if (node.op === 'in') node.port.name = node.port.param ? rn(node.port.param) + node.port.suffix : rn(node.port.name);
  // the block protocol's ports, as Vitis HLS's (#1900): ap_ctrl_hs's, a sequential module's clock and reset first (a
  // combinational one its reset, unused, but no clock, as Vitis HLS 2025.2 makes a top of latency 0, #1924); ap_ctrl_none,
  // none of ap_start, ap_done, ap_idle, ap_ready (a sequential module running by itself, core/c-fsmd.js)
  const hs = [{ name: 'ap_start', dir: 'in', w: 1 }, { name: 'ap_done', dir: 'out', w: 1 }, { name: 'ap_idle', dir: 'out', w: 1 }, { name: 'ap_ready', dir: 'out', w: 1 }];
  const clk = { name: 'ap_clk', dir: 'in', w: 1 }, rst = { name: 'ap_rst', dir: 'in', w: 1 };
  const ce = stall && df.seq ? [{ name: 'ap_ce', dir: 'in', w: 1 }] : [];   // (an AXI master's wait, core/c-axi-master.js, #1893)
  const ctrl = df.seq ? (df.ctrl === 'ap_ctrl_none' ? [clk, rst, ...ce] : [clk, rst, ...ce, ...hs]) : df.ctrl === 'ap_ctrl_hs' ? [rst, ...hs] : [];
  const portName = (p) => (p.param ? rn(p.param) + p.name.slice(p.param.length) : p.name);
  const flatPorts = [...ctrl, ...df.ports.map((p) => ({ name: portName(p), dir: p.dir, w: p.w, role: p.role, ...(p.param ? { param: p.param } : {}) }))];
  // (each output by its port's name: an argument named as a reserved word, in, its ports in_r_…: a memory's, a stream's too, #1590)
  const renamed = new Map(df.ports.map((p) => [p.name, portName(p)]));
  df.outputs = new Map([...df.outputs].map(([k, v]) => [renamed.get(k) ?? rn(k), v]));
  // a struct's members' ports signals inside the module, its port theirs (#1628)
  const agg = aggregate(flat ? [] : sargs, fn.params, flatPorts, { seq: !!df.seq, rn, how: prag.how });
  const ports = agg.ports;
  const inner = new Map(agg.groups.flatMap((x) => [...x.renamed])), drop = new Set(agg.groups.flatMap((x) => x.drop));
  for (const node of df.graph.nodes) if (node.op === 'in' && inner.has(node.port.name)) node.port.name = inner.get(node.port.name);
  df.outputs = new Map([...df.outputs].filter(([k]) => !drop.has(k)).map(([k, v]) => [inner.get(k) ?? k, v]));
  const name = module || rn(checked.top);
  const src = file.split('/').pop();
  const hdl = df.seq ? (lang === 'vhdl' ? vhdlSeq : verilogSeq)(name, src, ports, df, agg) : (lang === 'vhdl' ? vhdl : verilog)(name, src, ports, df, agg);
  // the report (#1529): a sequential module's states, registers, memories and loops (each one's II and cycles)
  const report = df.seq
    ? { sequential: true, states: df.states.length + 2, registerBits: df.regs.reduce((a, r) => a + r.w, 0) + df.stateT.w,
      memories: [...df.mems.map((x) => ({ name: x.name, words: x.n, bits: x.t.w, kind: x.rom || (!x.written && x.init) ? 'ROM' : 'RAM' })), ...df.extMems.map((x) => ({ name: x.name, words: x.n, bits: x.w, kind: 'ap_memory' }))],
      loops: df.loops, slowLoops: df.slowLoops || [] }
    : { sequential: false };
  return { ok: true, hdl, top: name, ports, diagnostics, sequential: !!df.seq, states: df.seq ? df.states.length + 2 : 0, memories: df.seq ? df.extMems.map((x) => ({ ...x, port: rn(x.name) })) : [], fifos: df.seq ? df.fifos.map((x) => ({ ...x, port: rn(x.name) })) : [], report };
}

/** The nodes to write: those the outputs need. */
export function nodesOf(df) { return df.graph.needed([...df.outputs.values()]); }
// (the internal names start with ap_, reserved by Vitis HLS for its own: no argument's port meets them)
export const sig = (n) => `ap_t${n.id}`;

// ------------------------------------------------------------------------------------------- VHDL
function vhdl(name, src, ports, df, agg) {
  const nodes = nodesOf(df);
  const g = df.graph;
  const L = [`-- Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): edit the C source`,
    'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '',
    `entity ${name} is`, '  port ('];
  ports.forEach((p, k) => L.push(`    ${p.name} : ${p.dir} ${p.w === 1 ? 'std_logic' : `std_logic_vector(${p.w - 1} downto 0)`}${k < ports.length - 1 ? ';' : ''}`));
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`);
  const ty = (n) => `${n.s ? 'signed' : 'unsigned'}(${n.w - 1} downto 0)`;
  for (const n of nodes) L.push(`  signal ${sig(n)} : ${ty(n)};`);
  innerSignals(agg, 'vhdl', L);
  L.push('begin');
  vhdlNodes(nodes, g, L);
  L.push(...agg.vhdl);
  const hs = ports.some((p) => p.name === 'ap_start');
  if (hs) L.push('  ap_done <= ap_start;', '  ap_ready <= ap_start;', "  ap_idle <= '1';");
  for (const [p, id] of df.outputs) {
    const n = g.get(id), port = [...ports, ...agg.inner].find((x) => x.name === p);
    const v = port.w === 1 ? `${sig(n)}(0)` : `std_logic_vector(${sig(n)})`;
    L.push(`  ${p} <= ${v}${hs && port.role === 'arg_vld' ? ' and ap_start' : ''};`);
  }
  L.push('end behav;', '');
  return L.join('\n');
}

/** The signals of a struct's members' ports (#1628). */
export function innerSignals(agg, lang, L) {
  for (const p of agg?.inner || []) {
    L.push(lang === 'vhdl' ? `  signal ${p.name} : ${p.w === 1 ? 'std_logic' : `std_logic_vector(${p.w - 1} downto 0)`};` : `  wire ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name};`);
  }
}

/** The VHDL concurrent assignments of the nodes (one signal each, n<id>). */
export function vhdlNodes(nodes, g, L) {
  const as = (n, t) => (n.s === t.s ? sig(n) : `${t.s ? 'signed' : 'unsigned'}(${sig(n)})`);
  const amount = (b) => (b.op === 'const' ? `${b.k > 4096n ? 4096 : b.k < 0n ? 0 : b.k}` : `to_integer(${b.s ? 'unsigned' : ''}(${b.w > 31 ? `${sig(b)}(30 downto 0)` : sig(b)}))`);
  for (const n of nodes) {
    const [a, b, c] = n.args.map((id) => g.get(id));
    const X = sig(n);
    switch (n.op) {
      case 'const': L.push(`  ${X} <= "${bin(n.k, n.w)}";`); break;
      case 'reg': L.push(`  ${X} <= ${n.port.name};`); break;
      case 'in': L.push(n.w === 1 ? `  ${X}(0) <= ${n.port.name};` : `  ${X} <= ${n.s ? 'signed' : 'unsigned'}(${n.port.name});`); break;
      case 'ext':
        if (n.w <= a.w) L.push(`  ${X} <= ${n.s ? 'signed' : 'unsigned'}(${sig(a)}(${n.w - 1} downto 0));`);
        else L.push(`  ${X} <= ${n.s ? 'signed' : 'unsigned'}(resize(${sig(a)}, ${n.w}));`);
        break;
      case 'add': L.push(`  ${X} <= ${sig(a)} + ${sig(b)};`); break;
      case 'sub': L.push(`  ${X} <= ${sig(a)} - ${sig(b)};`); break;
      case 'mul': L.push(`  ${X} <= ${sig(a)} * ${sig(b)};`); break;
      case 'and': case 'or': case 'xor': L.push(`  ${X} <= ${sig(a)} ${n.op} ${sig(b)};`); break;
      case 'not': L.push(`  ${X} <= not ${sig(a)};`); break;
      case 'neg': L.push(n.s ? `  ${X} <= -${sig(a)};` : `  ${X} <= unsigned(-signed(${sig(a)}));`); break;
      case 'shl': L.push(`  ${X} <= shift_left(${sig(a)}, ${amount(b)});`); break;
      case 'shr': L.push(`  ${X} <= shift_right(${sig(a)}, ${amount(b)});`); break;
      case 'eq': case 'ne': case 'lt': case 'le': case 'gt': case 'ge':
        L.push(`  ${X} <= "1" when ${sig(a)} ${{ eq: '=', ne: '/=', lt: '<', le: '<=', gt: '>', ge: '>=' }[n.op]} ${sig(b)} else "0";`); break;
      case 'mux': L.push(`  ${X} <= ${as(b, n)} when ${sig(a)} = "1" else ${as(c, n)};`); break;
      case 'slice': L.push(`  ${X} <= unsigned(${sig(a)}(${n.hi} downto ${n.lo}));`); break;
      default: throw new Error(`c-hdl: no VHDL for '${n.op}'`);
    }
  }
}

// ------------------------------------------------------------------------------------------- Verilog
function verilog(name, src, ports, df, agg) {
  const nodes = nodesOf(df);
  const g = df.graph;
  const L = [`// Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): edit the C source`,
    `module ${name} (`];
  ports.forEach((p, k) => L.push(`  ${p.dir === 'in' ? 'input ' : 'output'} wire ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name}${k < ports.length - 1 ? ',' : ''}`));
  L.push(');');
  for (const n of nodes) L.push(`  wire ${n.s ? 'signed ' : ''}[${n.w - 1}:0] ${sig(n)};`);
  innerSignals(agg, 'verilog', L);
  verilogNodes(nodes, g, L);
  L.push(...agg.verilog);
  const hs = ports.some((p) => p.name === 'ap_start');
  if (hs) L.push('  assign ap_done = ap_start;', '  assign ap_ready = ap_start;', "  assign ap_idle = 1'b1;");
  for (const [p, id] of df.outputs) {
    const port = [...ports, ...agg.inner].find((x) => x.name === p);
    L.push(`  assign ${p} = ${sig(g.get(id))}${hs && port.role === 'arg_vld' ? ' & ap_start' : ''};`);
  }
  L.push('endmodule', '');
  return L.join('\n');
}

/** The Verilog continuous assignments of the nodes (one wire each, n<id>; declared before). */
export function verilogNodes(nodes, g, L) {
  for (const n of nodes) {
    const [a, b, c] = n.args.map((id) => g.get(id));
    const X = sig(n);
    let e;
    switch (n.op) {
      case 'const': e = `${n.w}'b${bin(n.k, n.w)}`; break;
      case 'in': case 'reg': e = n.port.name; break;
      case 'ext':
        if (n.w <= a.w) e = n.w === a.w ? sig(a) : `${sig(a)}[${n.w - 1}:0]`;
        else e = `{{${n.w - a.w}{${a.s ? `${sig(a)}[${a.w - 1}]` : "1'b0"}}}, ${sig(a)}}`;
        break;
      case 'add': e = `${sig(a)} + ${sig(b)}`; break;
      case 'sub': e = `${sig(a)} - ${sig(b)}`; break;
      case 'mul': e = `${sig(a)} * ${sig(b)}`; break;
      case 'and': e = `${sig(a)} & ${sig(b)}`; break;
      case 'or': e = `${sig(a)} | ${sig(b)}`; break;
      case 'xor': e = `${sig(a)} ^ ${sig(b)}`; break;
      case 'not': e = `~${sig(a)}`; break;
      case 'neg': e = `-${sig(a)}`; break;
      case 'shl': e = `${sig(a)} << ${sig(b)}`; break;
      case 'shr': e = `${sig(a)} ${n.s ? '>>>' : '>>'} ${sig(b)}`; break;
      case 'eq': case 'ne': case 'lt': case 'le': case 'gt': case 'ge':
        e = `${sig(a)} ${{ eq: '==', ne: '!=', lt: '<', le: '<=', gt: '>', ge: '>=' }[n.op]} ${sig(b)}`; break;
      case 'mux': e = `${sig(a)} ? ${sig(b)} : ${sig(c)}`; break;
      case 'slice': e = n.hi === n.lo ? `${sig(a)}[${n.hi}]` : `${sig(a)}[${n.hi}:${n.lo}]`; break;
      default: throw new Error(`c-hdl: no Verilog for '${n.op}'`);
    }
    L.push(`  assign ${X} = ${e};`);
  }
}
