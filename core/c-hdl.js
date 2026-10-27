// Silinx HLS (#1525): a C source to VHDL or Verilog. The top function becomes a module with Vitis HLS's ports (the block
// protocol ap_ctrl_hs, or none with #pragma HLS INTERFACE ap_ctrl_none port=return; the arguments; ap_return); a
// combinational function is a combinational module (its graph, core/c-dataflow.js), one signal per operation.
// Isomorphic ES module: no DOM and no Node APIs.
//
//   cToHdl(source, { file, lang: 'vhdl' | 'verilog' }) -> { ok, hdl, top, ports, diagnostics, sequential, report }
//     ports: [{ name, dir, w }] in the module's order (the block protocol's first, as Vitis HLS)
import { checkC } from './c-check.js';
import { dataflow } from './c-dataflow.js';
import { isReservedWord } from './reserved.js';
import { fsmd } from './c-fsmd.js';
import { vhdlSeq, verilogSeq } from './c-hdl-seq.js';

export const bits = (k, w) => {
  const m = (1n << BigInt(w)) - 1n;
  return ((BigInt(k) % (m + 1n)) + (m + 1n)) % (m + 1n);
};
export const bin = (k, w) => bits(k, w).toString(2).padStart(w, '0');

// (headers, top: a source of several files, its top function named, #1597)
export function cToHdl(source, { file = 'input.c', lang = 'vhdl', headers = null, top = null } = {}) {
  const checked = checkC(source, file, { headers, top });
  const diagnostics = [...checked.diagnostics];
  if (!checked.ok || !checked.top) return { ok: false, hdl: '', top: checked.top, ports: [], diagnostics };
  let df = dataflow(checked);
  // not combinational (a loop whose count depends on the inputs, a static or global variable): a sequential module,
  // a state machine (core/c-fsmd.js, #1526)
  const seqOnly = df.diagnostics.some((d) => d.severity === 'error') && df.diagnostics.every((d) => d.severity !== 'error' || d.message.includes('#1526'));
  if (seqOnly) df = { ...fsmd(checked), seq: true };
  diagnostics.push(...df.diagnostics);
  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  if (df.diagnostics.some((d) => d.severity === 'error')) return { ok: false, hdl: '', top: checked.top, ports: [], diagnostics };
  // a name that is a reserved word of VHDL or Verilog: its port named <name>_r (a warning)
  const rn = (n) => (isReservedWord(n) ? `${n}_r` : n);
  const fn = checked.funcs.get(checked.top);
  for (const n of [checked.top, ...fn.params.map((p) => p.name)]) {
    if (isReservedWord(n)) diagnostics.push({ file, line: fn.loc.line, col: fn.loc.col, message: `'${n}' is a reserved word of VHDL or Verilog: it is named ${n}_r in the module`, severity: 'warning' });
  }
  // a struct argument (#1590): its members ports of their own (Vitis HLS aggregates them into one port: #1628)
  for (const a of checked.ast.structArgs?.get(checked.top) || []) {
    diagnostics.push({ file, line: a.loc.line, col: a.loc.col, message: a.name === 'return' ? `the struct returned by '${checked.top}': its members are outputs of their own (${a.members.join(', ')}); Vitis HLS makes one port of them (not yet, #1628)`
      : a.stream ? `the stream of a struct '${a.name}': its members are streams of their own (${a.members.join(', ')}); Vitis HLS makes one stream of them (not yet, #1628)`
      : `the struct argument '${a.name}': its members are ports of their own (${a.members.join(', ')}); Vitis HLS makes one port of them (not yet, #1628)`, severity: 'warning' });
  }
  diagnostics.sort((a, b) => a.line - b.line || a.col - b.col);
  for (const node of df.graph.nodes) if (node.op === 'in') node.port.name = node.port.param ? rn(node.port.param) + node.port.suffix : rn(node.port.name);
  const ctrl = df.seq
    ? [{ name: 'ap_clk', dir: 'in', w: 1 }, { name: 'ap_rst', dir: 'in', w: 1 }, { name: 'ap_start', dir: 'in', w: 1 }, { name: 'ap_done', dir: 'out', w: 1 }, { name: 'ap_idle', dir: 'out', w: 1 }, { name: 'ap_ready', dir: 'out', w: 1 }]
    : df.ctrl === 'ap_ctrl_hs'
    ? [{ name: 'ap_start', dir: 'in', w: 1 }, { name: 'ap_done', dir: 'out', w: 1 }, { name: 'ap_idle', dir: 'out', w: 1 }, { name: 'ap_ready', dir: 'out', w: 1 }]
    : [];
  const portName = (p) => (p.param ? rn(p.param) + p.name.slice(p.param.length) : p.name);
  const ports = [...ctrl, ...df.ports.map((p) => ({ name: portName(p), dir: p.dir, w: p.w, role: p.role, ...(p.param ? { param: p.param } : {}) }))];
  // (each output by its port's name: an argument named as a reserved word, in, its ports in_r_…: a memory's, a stream's too, #1590)
  const renamed = new Map(df.ports.map((p) => [p.name, portName(p)]));
  df.outputs = new Map([...df.outputs].map(([k, v]) => [renamed.get(k) ?? rn(k), v]));
  const name = rn(checked.top);
  const src = file.split('/').pop();
  const hdl = df.seq ? (lang === 'vhdl' ? vhdlSeq : verilogSeq)(name, src, ports, df) : (lang === 'vhdl' ? vhdl : verilog)(name, src, ports, df);
  // the report (#1529): a sequential module's states, registers, memories and loops (each one's II and cycles)
  const report = df.seq
    ? { sequential: true, states: df.states.length + 2, registerBits: df.regs.reduce((a, r) => a + r.w, 0) + df.stateT.w,
      memories: [...df.mems.map((x) => ({ name: x.name, words: x.n, bits: x.t.w, kind: x.rom || (!x.written && x.init) ? 'ROM' : 'RAM' })), ...df.extMems.map((x) => ({ name: x.name, words: x.n, bits: x.w, kind: 'ap_memory' }))],
      loops: df.loops }
    : { sequential: false };
  return { ok: true, hdl, top: name, ports, diagnostics, sequential: !!df.seq, states: df.seq ? df.states.length + 2 : 0, memories: df.seq ? df.extMems.map((x) => ({ ...x, port: rn(x.name) })) : [], fifos: df.seq ? df.fifos.map((x) => ({ ...x, port: rn(x.name) })) : [], report };
}

/** The nodes to write: those the outputs need. */
export function nodesOf(df) { return df.graph.needed([...df.outputs.values()]); }
// (the internal names start with ap_, reserved by Vitis HLS for its own: no argument's port meets them)
export const sig = (n) => `ap_t${n.id}`;

// ------------------------------------------------------------------------------------------- VHDL
function vhdl(name, src, ports, df) {
  const nodes = nodesOf(df);
  const g = df.graph;
  const L = [`-- Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): edit the C source`,
    'library ieee;', 'use ieee.std_logic_1164.all;', 'use ieee.numeric_std.all;', '',
    `entity ${name} is`, '  port ('];
  ports.forEach((p, k) => L.push(`    ${p.name} : ${p.dir} ${p.w === 1 ? 'std_logic' : `std_logic_vector(${p.w - 1} downto 0)`}${k < ports.length - 1 ? ';' : ''}`));
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`);
  const ty = (n) => `${n.s ? 'signed' : 'unsigned'}(${n.w - 1} downto 0)`;
  for (const n of nodes) L.push(`  signal ${sig(n)} : ${ty(n)};`);
  L.push('begin');
  vhdlNodes(nodes, g, L);
  const hs = ports.some((p) => p.name === 'ap_start');
  if (hs) L.push('  ap_done <= ap_start;', '  ap_ready <= ap_start;', "  ap_idle <= '1';");
  for (const [p, id] of df.outputs) {
    const n = g.get(id), port = ports.find((x) => x.name === p);
    const v = port.w === 1 ? `${sig(n)}(0)` : `std_logic_vector(${sig(n)})`;
    L.push(`  ${p} <= ${v}${hs && port.role === 'arg_vld' ? ' and ap_start' : ''};`);
  }
  L.push('end behav;', '');
  return L.join('\n');
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
function verilog(name, src, ports, df) {
  const nodes = nodesOf(df);
  const g = df.graph;
  const L = [`// Generated by Silinx from ${src} (Silinx HLS, compatible with Vitis HLS): edit the C source`,
    `module ${name} (`];
  ports.forEach((p, k) => L.push(`  ${p.dir === 'in' ? 'input ' : 'output'} wire ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name}${k < ports.length - 1 ? ',' : ''}`));
  L.push(');');
  for (const n of nodes) L.push(`  wire ${n.s ? 'signed ' : ''}[${n.w - 1}:0] ${sig(n)};`);
  verilogNodes(nodes, g, L);
  const hs = ports.some((p) => p.name === 'ap_start');
  if (hs) L.push('  assign ap_done = ap_start;', '  assign ap_ready = ap_start;', "  assign ap_idle = 1'b1;");
  for (const [p, id] of df.outputs) {
    const port = ports.find((x) => x.name === p);
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
