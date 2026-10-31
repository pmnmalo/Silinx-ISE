// Silinx HLS (#1894): `axis` ports as Vitis HLS makes them. A top's stream with #pragma HLS INTERFACE axis, or of an
// ap_axis / ap_axiu / hls::axis_user whatever its pragma, is one AXI4-Stream port: X_TVALID, X_TREADY and X_TDATA, or
// its side channels (X_TKEEP, X_TSTRB, X_TUSER, X_TLAST, X_TID, X_TDEST) for those structs; the design's reset is then
// ap_rst_n, active low. An array with the pragma is a stream too, when read or written in order, once per element.
// The state machine stays as it is, its ap_fifo ports (a first-word fall-through FIFO is AXI4-Stream's handshake) in a
// module <top>_core, under a module of the top's name with Vitis HLS's ports. Isomorphic ES module.
//
//   axisArgs(checked, file) -> Map of the streams made so (a word group's name or its own) to an array's length, or 0
//   axisTop(gen, names, lang, side) -> gen with the module and the ports of Vitis HLS (side: the structs of ap_axi_sdata.h)
//   fifoPort(f, 'dout' | 'empty_n' | 'read' | 'din' | 'full_n' | 'write') -> a stream's signal, for the test bench
import { structPragmas } from './c-aggregate.js';

const SIDE = { data: 'TDATA', keep: 'TKEEP', strb: 'TSTRB', user: 'TUSER', last: 'TLAST', id: 'TID', dest: 'TDEST' };
const modeOf = (a) => String(a.mode || Object.keys(a).find((k) => /^(ap_|s_axi|m_axi|axis|bram)/.test(k)) || '').toLowerCase();
const isAxis = (st) => st.kind === 'pragma' && st.pragma.name === 'INTERFACE' && st.pragma.args.port && modeOf(st.pragma.args) === 'axis';

/** The accesses of the arrays' elements in fn's body: name -> [{ read, node, stmt, loops, cond }]; `bad` the arrays with
 *  one a stream cannot make (the array named alone, a compound assignment, an assignment inside an expression). */
function accesses(fn, names) {
  const found = new Map([...names].map((n) => [n, []]));
  const bad = new Set();
  const walk = (x, loops, cond, stmt) => {
    if (Array.isArray(x)) { for (const y of x) walk(y, loops, cond, null); return; }
    if (!x || typeof x !== 'object' || x.kind === 'pragma') return;
    if (x.kind === 'id' && names.has(x.name)) { bad.add(x.name); return; }
    if (x.kind === 'index' && x.e.kind === 'id' && names.has(x.e.name)) {
      found.get(x.e.name).push({ read: true, node: x, loops, cond });
      walk(x.i, loops, cond, null);
      return;
    }
    if (x.kind === 'assign' && x.l.kind === 'index' && x.l.e.kind === 'id' && names.has(x.l.e.name)) {
      const n = x.l.e.name;
      if (x.op !== '=' || !stmt) bad.add(n);
      else found.get(n).push({ read: false, node: x.l, stmt, loops, cond });
      walk(x.l.i, loops, cond, null);
      walk(x.r, loops, cond, null);
      return;
    }
    const inner = ['for', 'while', 'do'].includes(x.kind) ? [...loops, x] : loops;
    const under = cond || ['if', 'switch', 'cond', 'ternary'].includes(x.kind);
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') walk(v, inner, under, x.kind === 'expr' && k === 'e' ? x : null);
  };
  walk(fn.body.items, [], false, null);
  return { found, bad };
}

/** Whether an access is the loop's over all of an array of n elements: for (i = 0; i < n; i++) a[i], the only loop. */
function inOrder(a, n) {
  const [l] = a.loops;
  if (a.loops.length !== 1 || a.cond || l.kind !== 'for' || a.node.i.kind !== 'id') return false;
  const i = a.node.i.name;
  const isI = (e) => e?.kind === 'id' && e.name === i;
  const num = (e, v) => e?.kind === 'num' && Number(e.value) === v;
  const init = l.init?.kind === 'decl' ? l.init.vars.length === 1 && l.init.vars[0].name === i && l.init.vars[0].init
    : l.init?.kind === 'expr' && l.init.e.kind === 'assign' && l.init.e.op === '=' && isI(l.init.e.l) && l.init.e.r;
  return num(init, 0) && l.cond?.kind === 'binary' && l.cond.op === '<' && isI(l.cond.l) && num(l.cond.r, n)
    && ['postfix', 'prefix'].includes(l.step?.kind) && l.step.op === '++' && isI(l.step.e);
}

export function axisArgs(checked, file) {
  const fn = checked.funcs.get(checked.top);
  const names = new Map();
  const say = (loc, port, why) => checked.diagnostics.push({ file, line: loc?.line || 1, col: loc?.col || 1, message: `#pragma HLS INTERFACE axis port=${port} is not made yet: ${why}`, severity: 'warning' });
  const ignored = (st) => { if (!st.pragma.dup) say(st.loc, st.pragma.of ?? st.pragma.args.port, 'ignored (its default interface made)'); };
  const pragmas = (fn.body?.items || []).filter(isAxis);
  const param = (n) => fn.params.find((p) => p.name === n);
  // (DATAFLOW's processes and an hls::FIR's own hardware: their FIFO ports as they are)
  if (checked.dataflow || checked.ast.firs?.size) {
    for (const st of pragmas) if (['stream', 'array'].includes(param(st.pragma.args.port)?.type.kind)) ignored(st);
    return names;
  }
  // (the structs of ap_axi_sdata.h: an axis port with no pragma too)
  for (const a of checked.ast.structArgs?.get(checked.top) || []) if (a.stream && a.axis) names.set(a.name, 0);
  const arrays = new Map();
  const { how } = structPragmas(fn);
  for (const st of pragmas) {
    const { port } = st.pragma.args, { of } = st.pragma, t = param(port)?.type;
    if (t?.kind === 'stream') names.set(port, 0).set(of ?? port, 0);   // (a word group's by its struct's name, an array's stream by its own)
    else if (t?.kind === 'array' && t.of.kind !== 'array' && t.size?.kind === 'num' && (!of || how.get(of)?.disaggregate)) arrays.set(port, { n: Number(t.size.value), st });
    else if (t?.kind === 'array') ignored(st);
  }
  const { found, bad } = accesses(fn, new Set(arrays.keys()));
  for (const [name, { n, st }] of arrays) {
    const acc = found.get(name);
    if (bad.has(name) || acc.length !== 1 || !inOrder(acc[0], n)) { say(st.loc, name, `a stream only when read or written once in a loop for (i = 0; i < ${n}; i++) (its default interface made)`); continue; }
    const [a] = acc;
    const { loc } = a.node;
    const call = (method, args) => ({ kind: 'call', callee: { kind: 'member', e: { kind: 'id', name, loc }, name: method, loc }, args, loc });
    if (a.read) { for (const k of Object.keys(a.node)) delete a.node[k]; Object.assign(a.node, call('read', [])); }
    else a.stmt.e = call('write', [a.stmt.e.r]);
    const pa = param(name);
    pa.type = { kind: 'stream', of: pa.type.of, name: 'hls::stream', depth: null };
    names.set(name, n);
  }
  return names;
}

/** A stream's word as its parts: [{ name, w, off }], first at the LSB (a struct's of ap_axi_sdata.h its side channels). */
function parts(f, side) {
  const P = f.port ?? f.name;
  const m = f.fields?.map((x) => SIDE[x.param.slice(f.name.length + 1)]);
  if (!side || !f.fields || m.includes(undefined)) return [{ name: `${P}_TDATA`, w: f.w, off: 0 }];
  return f.fields.map((x, k) => ({ name: `${P}_${m[k]}`, w: x.w, off: x.off }));
}

/** The signal of a stream in the test bench: a word of side channels a concatenation, also as a target. */
export function fifoPort(f, sig) {
  if (!f.axis) return `${f.port ?? f.name}_${sig}`;
  if (sig === 'dout' || sig === 'din') return f.axis.parts.length === 1 ? f.axis.parts[0].name : `{${[...f.axis.parts].reverse().map((p) => p.name).join(', ')}}`;
  return sig === 'empty_n' || sig === 'write' ? f.axis.valid : f.axis.ready;
}

export function axisTop(gen, names, lang, side) {
  const core = gen.top, name = core.replace(/_core$/, '');
  const fifos = gen.fifos.map((f) => {
    if (!names.has(f.name)) return f;
    const P = f.port ?? f.name;
    return { ...f, ...(names.get(f.name) ? { array: names.get(f.name) } : {}), axis: { valid: `${P}_TVALID`, ready: `${P}_TREADY`, parts: parts(f, side.has(f.name)) } };
  });
  const by = new Map();
  for (const f of fifos) if (f.axis) for (const s of f.dir === 'in' ? ['dout', 'empty_n', 'read'] : ['din', 'full_n', 'write']) by.set(`${f.port ?? f.name}_${s}`, { f, s });
  const ports = [], map = [], word = [];
  for (const p of gen.ports) {
    if (p.name === 'ap_rst') { ports.push({ ...p, name: 'ap_rst_n' }); map.push(['ap_rst', 'ap_rst_i']); continue; }
    const at = by.get(p.name);
    if (!at) { ports.push(p); map.push([p.name, p.name]); continue; }
    const { f, s } = at;
    if (s === 'dout' || s === 'din') {
      for (const x of f.axis.parts) ports.push({ ...p, name: x.name, w: x.w });
      const whole = f.axis.parts.length === 1;
      map.push([p.name, whole ? f.axis.parts[0].name : `ap_${p.name}`]);
      if (!whole) word.push({ sig: `ap_${p.name}`, w: p.w, dir: p.dir, parts: f.axis.parts });
    } else {
      const n = s === 'empty_n' || s === 'write' ? f.axis.valid : f.axis.ready;
      ports.push({ ...p, name: n });
      map.push([p.name, n]);
    }
  }
  const hdl = (lang === 'vhdl' ? vhdlTop : verilogTop)(name, core, ports, map, word);
  return { ...gen, hdl: `${gen.hdl}\n${hdl}`, top: name, ports, fifos };
}

function vhdlTop(name, core, ports, map, word) {
  const T = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  const L = [`-- ${name}: Vitis HLS's AXI4-Stream ports (axis) and active-low reset, around ${core}`,
    'library ieee;', 'use ieee.std_logic_1164.all;', '', `entity ${name} is`, '  port ('];
  ports.forEach((p, k) => L.push(`    ${p.name} : ${p.dir} ${T(p.w)}${k < ports.length - 1 ? ';' : ''}`));
  L.push('  );', `end ${name};`, '', `architecture behav of ${name} is`, '  signal ap_rst_i : std_logic;');
  for (const x of word) L.push(`  signal ${x.sig} : ${T(x.w)};`);
  L.push('begin', '  ap_rst_i <= not ap_rst_n;');
  for (const x of word) {
    if (x.dir === 'in') L.push(`  ${x.sig} <= ${[...x.parts].reverse().map((p) => p.name).join(' & ')};`);
    else for (const p of x.parts) L.push(`  ${p.name} <= ${x.sig}(${p.w === 1 ? p.off : `${p.off + p.w - 1} downto ${p.off}`});`);
  }
  L.push(`  ap_core : entity work.${core} port map (${map.map(([a, b]) => `${a} => ${b}`).join(', ')});`, 'end behav;', '');
  return L.join('\n');
}

function verilogTop(name, core, ports, map, word) {
  const R = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const L = [`// ${name}: Vitis HLS's AXI4-Stream ports (axis) and active-low reset, around ${core}`, `module ${name} (`];
  ports.forEach((p, k) => L.push(`  ${p.dir === 'in' ? 'input ' : 'output'} wire ${R(p.w)}${p.name}${k < ports.length - 1 ? ',' : ''}`));
  L.push(');', '  wire ap_rst_i = ~ap_rst_n;');
  for (const x of word) {
    if (x.dir === 'in') L.push(`  wire ${R(x.w)}${x.sig} = {${[...x.parts].reverse().map((p) => p.name).join(', ')}};`);
    else {
      L.push(`  wire ${R(x.w)}${x.sig};`);
      for (const p of x.parts) L.push(`  assign ${p.name} = ${x.sig}[${p.w === 1 ? p.off : `${p.off + p.w - 1}:${p.off}`}];`);
    }
  }
  L.push(`  ${core} ap_core (${map.map(([a, b]) => `.${a}(${b})`).join(', ')});`, 'endmodule', '');
  return L.join('\n');
}
