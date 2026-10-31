// Silinx HLS (#1903): the RTL blackbox (syn.blackbox): the JSON description refused when malformed, naming the feature; the
// C model the C simulation's; the module instantiated in place of each call, compiled, elaborated and co-simulated in VHDL
// and in Verilog, against a Verilog and a VHDL module; the warnings exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBlackboxes, blackboxesIn } from '../core/c-blackbox.js';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { cAsm } from '../core/c-asm.js';
import { viewHdl } from '../core/view-hdl.js';

const UNIT = (body, proto = 'void adder(data_t a, data_t b, data_t &z);') => `#include "ap_int.h"
typedef ap_int<10> data_t;
${proto}
${body}
int main() {
  data_t s = 0;
  for (int i = 0; i < 6; i++) {
    top(i, i - 3, s);
    if (s != 2 * i - 3) return 1;
  }
  return 0;
}
`;
const TOP = 'void top(data_t a, data_t b, data_t &s) { data_t t; adder(a, b, t); s = t; }';
const MODEL = '#include "ap_int.h"\ntypedef ap_int<10> data_t;\nvoid adder(data_t a, data_t b, data_t &z) { z = a + b; }\n';
// (a module of latency 2, its result valid one cycle only, ap_done with it: as AMD's example)
const VERILOG = `module adder_rtl(input ap_clk, ap_rst, ap_ce, ap_start, ap_continue, input [9:0] a, b,
  output ap_idle, ap_done, ap_ready, z_ap_vld, output reg [9:0] z);
  reg [9:0] ra, rb; reg d1, d2;
  always @(posedge ap_clk) if (ap_rst) begin z <= 0; ra <= 0; rb <= 0; d1 <= 0; d2 <= 0; end
    else if (ap_ce) begin z <= ra + rb; ra <= a; rb <= b; d1 <= ap_start; d2 <= d1; end
  assign z_ap_vld = d2; assign ap_done = d2; assign ap_ready = d2; assign ap_idle = ~ap_start;
endmodule
`;
const VHDL = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity adder_rtl is
  port (ap_clk, ap_rst, ap_ce, ap_start, ap_continue : in std_logic;
    a, b : in std_logic_vector(9 downto 0);
    ap_idle, ap_done, ap_ready, z_ap_vld : out std_logic;
    z : out std_logic_vector(9 downto 0));
end adder_rtl;
architecture rtl of adder_rtl is
  signal d : std_logic;
begin
  process (ap_clk) begin
    if rising_edge(ap_clk) then
      if ap_rst = '1' then d <= '0';
      else d <= ap_start; z <= std_logic_vector(unsigned(a) + unsigned(b)); end if;
    end if;
  end process;
  z_ap_vld <= d; ap_done <= d; ap_ready <= d; ap_idle <= not ap_start;
end rtl;
`;
const DESC = (over = {}) => ({
  c_function_name: 'adder', rtl_top_module_name: 'adder_rtl', c_files: [{ c_file: 'adder.cpp', cflag: '' }], rtl_files: ['adder.v'],
  c_parameters: [
    { c_name: 'a', c_port_direction: 'in', rtl_ports: { data_read_in: 'a' } },
    { c_name: 'b', c_port_direction: 'in', rtl_ports: { data_read_in: 'b' } },
    { c_name: 'z', c_port_direction: 'out', rtl_ports: { data_write_out: 'z', data_write_valid: 'z_ap_vld' } }],
  rtl_common_signal: { module_clock: 'ap_clk', module_reset: 'ap_rst', module_clock_enable: 'ap_ce', ap_ctrl_chain_protocol_idle: 'ap_idle', ap_ctrl_chain_protocol_start: 'ap_start', ap_ctrl_chain_protocol_ready: 'ap_ready', ap_ctrl_chain_protocol_done: 'ap_done', ap_ctrl_chain_protocol_continue: 'ap_continue' },
  rtl_performance: { latency: '2', II: '1' }, rtl_resource_usage: { FF: '0' }, ...over,
});
const FILES = { 'adder.cpp': MODEL, 'adder.v': VERILOG, 'adder.vhd': VHDL };
const OPTS = (desc = DESC(), files = FILES) => ({ file: 'u.cpp', top: 'top', headers: files, blackboxes: [{ file: 'adder.json', text: typeof desc === 'string' ? desc : JSON.stringify(desc) }] });
const warns = (r) => r.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
const errs = (r) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

for (const lang of ['vhdl', 'verilog']) {
  for (const [rtl, desc] of [['Verilog', DESC()], ['VHDL', DESC({ rtl_files: ['adder.vhd'], rtl_performance: { latency: '1' } })]]) {
    test(`#1903 a ${lang} machine with a ${rtl} module: the C model in the C simulation, the module in the co-simulation; no warnings`, () => {
      const sim = simulateC(UNIT(TOP), OPTS(desc));
      assert.equal(sim.ok, true); assert.equal(sim.exitCode, 0); assert.deepEqual(warns(sim), []);
      const g = cToHdl(UNIT(TOP), { ...OPTS(desc), lang });
      assert.deepEqual(errs(g), []); assert.deepEqual(warns(g), []);
      assert.equal(g.sequential, true);
      assert.match(g.hdl, lang === 'vhdl' ? /ap_bb0 : adder_rtl port map/ : /adder_rtl ap_bb0 \(/);
      assert.deepEqual(g.ports.map((p) => p.name), ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a', 'b', 's', 's_ap_vld']);
      const c = cosimulate(UNIT(TOP), { ...OPTS(desc), lang });
      assert.deepEqual(c.errors, []);
      assert.deepEqual(c.mismatches, []);
      assert.equal(c.pass, true);
      assert.equal(c.calls, 6);
    });
  }
}

test('#1903 the co-simulation sees the module, not the C model: a module that differs mismatches', () => {
  const files = { ...FILES, 'adder.v': VERILOG.replace('z <= ra + rb', 'z <= ra - rb') };
  const c = cosimulate(UNIT(TOP), { ...OPTS(DESC(), files), lang: 'verilog' });
  assert.equal(c.pass, false);
  assert.ok(c.mismatches.length > 0);
  // (the C simulation still passes: the model's)
  assert.equal(c.sim.exitCode, 0);
});

test('#1903 no ap_done: the description\'s latency, 0 a combinational module; c_return; no valid', () => {
  const v = (L) => `module adder_rtl(${L ? 'input clk, ' : ''}input [9:0] a, b, output ${L ? 'reg ' : ''}[9:0] r);
  ${L ? 'always @(posedge clk) r <= a + b;' : 'assign r = a + b;'}
endmodule
`;
  const proto = 'data_t adder(data_t a, data_t b);';
  const body = 'void top(data_t a, data_t b, data_t &s) { s = adder(a, b); }';
  const model = '#include "ap_int.h"\ntypedef ap_int<10> data_t;\ndata_t adder(data_t a, data_t b) { return a + b; }\n';
  for (const L of [0, 1, 3]) {
    const desc = DESC({ c_parameters: DESC().c_parameters.slice(0, 2), c_return: { c_port_direction: 'out', rtl_ports: { data_write_out: 'r' } }, rtl_common_signal: L ? { module_clock: 'clk' } : {}, rtl_performance: { latency: String(L) } });
    // (latency 3 of a module of 1: the inputs held, the result still there)
    const files = { 'adder.cpp': model, 'adder.v': v(L) };
    for (const lang of ['vhdl', 'verilog']) {
      const c = cosimulate(UNIT(body, proto), { ...OPTS(desc, files), lang });
      assert.deepEqual(c.errors, [], `latency ${L}, ${lang}`);
      assert.deepEqual(c.mismatches, []);
      assert.equal(c.pass, true);
      assert.deepEqual(warns(c.gen), []);
    }
  }
});

test('#1903 a valid before ap_done is kept; a valid never 1 leaves the variable as it was; an inout', () => {
  const v = `module adder_rtl(input ap_clk, ap_rst, ap_start, input [9:0] a, b, zi, output ap_done, output reg [9:0] z, output reg z_vld);
  reg [2:0] n;
  always @(posedge ap_clk) if (ap_rst) begin n <= 0; z_vld <= 0; end else begin
    n <= {n[1:0], ap_start}; z_vld <= n[0] && a != 0; z <= n[0] ? zi + a + b : 10'd999;
  end
  assign ap_done = n[2];
endmodule
`;
  const unit = `#include "ap_int.h"
typedef ap_int<10> data_t;
void adder(data_t a, data_t b, data_t &z);
void top(data_t a, data_t b, data_t &s) { data_t t = 7; adder(a, b, t); s = t; }
int main() { data_t s = 0; top(0, 1, s); if (s != 7) return 1; top(2, 3, s); if (s != 12) return 2; return 0; }
`;
  const model = '#include "ap_int.h"\ntypedef ap_int<10> data_t;\nvoid adder(data_t a, data_t b, data_t &z) { if (a != 0) z = z + a + b; }\n';
  const desc = DESC({ c_parameters: [...DESC().c_parameters.slice(0, 2), { c_name: 'z', c_port_direction: 'inout', rtl_ports: { data_read_in: 'zi', data_write_out: 'z', data_write_valid: 'z_vld' } }],
    rtl_common_signal: { module_clock: 'ap_clk', module_reset: 'ap_rst', ap_ctrl_chain_protocol_start: 'ap_start', ap_ctrl_chain_protocol_done: 'ap_done' } });
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(unit, { ...OPTS(desc, { 'adder.cpp': model, 'adder.v': v }), lang });
    assert.deepEqual(c.errors, []);
    assert.deepEqual(c.mismatches, []);
    assert.equal(c.pass, true);
  }
});

test('#1903 in a loop, in an if, in a function the top calls, an argument read from a memory: an instance per call', () => {
  const unit = `#include "ap_int.h"
typedef ap_int<10> data_t;
void adder(data_t a, data_t b, data_t &z);
static data_t twice(data_t x) { data_t y; adder(x, x, y); return y; }
void top(data_t m[4], data_t c, data_t &s) {
  data_t acc = 0, t;
  for (int i = 0; i < 4; i++) { adder(m[i], acc, t); acc = t; }
  if (c > 0) acc = twice(acc);
  s = acc;
}
int main() { data_t m[4] = {1, 2, 3, 4}, s; top(m, 0, s); if (s != 10) return 1; top(m, 1, s); if (s != 20) return 2; return 0; }
`;
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(unit, { ...OPTS(), lang });
    assert.deepEqual(c.errors, []);
    assert.deepEqual(c.mismatches, []);
    assert.equal(c.pass, true);
    assert.equal(c.gen.blackboxes.length, 1);
    assert.equal((c.gen.hdl.match(/ap_bb\d+ (: adder_rtl|\()|adder_rtl ap_bb\d+ \(/g) || []).length, 2);
    assert.deepEqual(warns(c.gen), ['this loop is pipelined automatically, as Vitis HLS does (II=1): II=6 made (it calls an RTL blackbox, a state that waits for the module); #pragma HLS PIPELINE off in it turns that off']);
  }
});

test('#1903 the state machine\'s chart is made with a blackbox in it', () => {
  const r = cAsm(UNIT(TOP), { ...OPTS(), lang: 'vhdl' });
  assert.equal(r.ok, true);
  const text = JSON.stringify(r.model);
  assert.match(text, /ap_bb0 \(adder_rtl\): ap_start = 1/);
  assert.match(text, /ap_bb0_done/);
});

// the refusals: each names syn.blackbox and what to correct; C simulation and synthesis alike
const BAD = [
  ['not JSON', '{ nope', /syn\.blackbox: adder\.json: not valid JSON/],
  ['an array', '[]', /the description is a JSON object/],
  ['no function', DESC({ c_function_name: undefined }), /'c_function_name' must name an identifier/],
  ['no module', DESC({ rtl_top_module_name: 'a b' }), /'rtl_top_module_name' must name an identifier/],
  ['no RTL files', DESC({ rtl_files: [] }), /'rtl_files' must list/],
  ['no C files', DESC({ c_files: 'x' }), /'c_files' must list/],
  ['no parameters', DESC({ c_parameters: {} }), /'c_parameters' must list/],
  ['an RTL file missing', DESC({ rtl_files: ['gone.v'] }), /the RTL file 'gone\.v' is not in the project/],
  ['a C model missing', DESC({ c_files: [{ c_file: 'gone.cpp' }] }), /the C model 'gone\.cpp' is not in the project/],
  ['a direction', DESC({ c_parameters: [{ c_name: 'a', c_port_direction: 'up', rtl_ports: {} }] }), /'c_port_direction' must be in, out or inout/],
  ['a memory', DESC({ c_parameters: [{ c_name: 'a', c_port_direction: 'in', RAM_type: 'RAM_1P', rtl_ports: {} }] }), /'RAM_type' \(a memory\) is not supported yet/],
  ['a stream', DESC({ c_parameters: [{ c_name: 'a', c_port_direction: 'in', rtl_ports: { FIFO_data_read_in: 'a' } }] }), /'FIFO_data_read_in' \(a memory or a stream\) is not supported yet/],
  ['an in with no port', DESC({ c_parameters: [{ c_name: 'a', c_port_direction: 'in', rtl_ports: {} }] }), /needs 'data_read_in'/],
  ['twice', DESC({ c_parameters: [DESC().c_parameters[0], DESC().c_parameters[0]] }), /is described twice/],
  ['a signal unknown', DESC({ rtl_common_signal: { clock: 'x' } }), /'clock' is not one of/],
  ['when it ends', DESC({ rtl_common_signal: { module_clock: 'ap_clk' }, rtl_performance: {} }), /when a call ends/],
  ['a latency', DESC({ rtl_performance: { latency: 'soon' } }), /the latency 'soon' must be a number/],
  ['done, no start', DESC({ rtl_common_signal: { module_clock: 'ap_clk', ap_ctrl_chain_protocol_done: 'ap_done' } }), /needs 'ap_ctrl_chain_protocol_start'/],
];
for (const [name, desc, re] of BAD) {
  test(`#1903 a malformed description refused: ${name}`, () => {
    const g = cToHdl(UNIT(TOP), { ...OPTS(desc), lang: 'vhdl' });
    assert.equal(g.ok, false);
    assert.ok(errs(g).some((m) => re.test(m) && /^syn\.blackbox: /.test(m)), errs(g).join('\n'));
    const s = simulateC(UNIT(TOP), OPTS(desc));
    assert.equal(s.ok, false);
    assert.ok(errs(s).some((m) => re.test(m)));
  });
}

// against the C function and the module: the synthesis
const P = (n, dir, ports) => ({ c_name: n, c_port_direction: dir, rtl_ports: ports });
const [A, B, Z] = DESC().c_parameters;
const MISMATCH = [
  ['the function not declared', UNIT(TOP).replace('void adder(data_t a, data_t b, data_t &z);', 'void adder2(data_t a, data_t b, data_t &z);').replace('adder(a, b, t)', 'adder2(a, b, t)'), DESC(), /the function 'adder' is not declared/],
  ['the top', UNIT('void adder(data_t a, data_t b, data_t &z) { z = a + b; }').replace(/int main[\s\S]*/, ''), DESC({ c_function_name: 'adder', top: undefined }), /is the top function/, 'adder'],
  ['an argument not described', UNIT(TOP), DESC({ c_parameters: [A, Z] }), /the argument 'b' of 'adder' is not described/],
  ['an argument unknown', UNIT(TOP), DESC({ c_parameters: [A, B, Z, P('w', 'in', { data_read_in: 'a' })] }), /'adder' has no argument 'w'/],
  ['out by value', UNIT(TOP), DESC({ c_parameters: [A, P('b', 'out', { data_write_out: 'z' }), Z] }), /'b' is passed by value: it can only be 'in'/],
  ['a port missing', UNIT(TOP), DESC({ c_parameters: [P('a', 'in', { data_read_in: 'gone' }), B, Z] }), /the module 'adder_rtl' has no port 'gone'/],
  ['a port the other way', UNIT(TOP), DESC({ c_parameters: [P('a', 'in', { data_read_in: 'z' }), B, Z] }), /the port 'z' is an output of 'adder_rtl'/],
  ['a width', UNIT(TOP), DESC({ c_parameters: [P('a', 'in', { data_read_in: 'ap_start' }), B, Z] }), /the port 'ap_start' has 1 bit\(s\), the C type 10/],
  ['no module', UNIT(TOP), DESC({ rtl_top_module_name: 'other' }), /the RTL files do not define the module 'other'/],
  ['a result not described', UNIT('void top(data_t a, data_t b, data_t &s) { s = adder(a, b); }', 'data_t adder(data_t a, data_t b);'), DESC({ c_parameters: [A, B] }), /'adder' returns a value: 'c_return' is missing/],
];
for (const [name, unit, desc, re, top] of MISMATCH) {
  test(`#1903 refused against the C or the module: ${name}`, () => {
    const g = cToHdl(unit, { ...OPTS(desc), lang: 'vhdl', top: top || 'top' });
    assert.equal(g.ok, false);
    assert.ok(errs(g).some((m) => re.test(m)), errs(g).join('\n'));
  });
}

test('#1903 what is not supported yet: a memory or a stream argument, a DATAFLOW region, each said', () => {
  const mem = UNIT('void top(data_t a, data_t b, data_t &s) { data_t m[2], t; adder(a, m, t); s = t; }', 'void adder(data_t a, data_t b[2], data_t &z);');
  assert.match(errs(cToHdl(mem, { ...OPTS(), lang: 'vhdl' })).join(), /the argument 'b': a memory, a stream or a struct is not supported yet/);
  const df = UNIT('void top(data_t a, data_t b, data_t &s) {\n#pragma HLS DATAFLOW\n  adder(a, b, s);\n}');
  assert.match(errs(cToHdl(df, { ...OPTS(), lang: 'vhdl' })).join(), /an RTL blackbox in a DATAFLOW region is not supported yet/);
});

test('#1903 the warnings: a cflag, a key not known, an input not described', () => {
  const g = cToHdl(UNIT(TOP), { ...OPTS(DESC({ c_files: [{ c_file: 'adder.cpp', cflag: '-DX' }], extra: 1, rtl_common_signal: { ...DESC().rtl_common_signal, module_clock_enable: undefined } })), lang: 'verilog' });
  assert.equal(g.ok, true);
  assert.deepEqual(warns(g), ["syn.blackbox: adder.json: the key 'extra' is not one Silinx HLS knows: ignored", "syn.blackbox: adder.json: the cflag of 'adder.cpp' is ignored", "syn.blackbox: adder.json: the input 'ap_ce' of 'adder_rtl' is not in the description: left unconnected"]);
});

test('#1903 no description: as before, the prototype said', () => {
  assert.match(simulateC(UNIT(TOP), { file: 'u.cpp', top: 'top' }).error.message, /'adder' is declared but not defined/);
  assert.deepEqual(loadBlackboxes(null, null), { list: [], diagnostics: [] });
});

test('#1903 a project\'s descriptions: its JSON files that are ones, beside their files; a drawing or other JSON left out', async () => {
  const f = { 'src/a.json': JSON.stringify(DESC()), 'src/adder.cpp': MODEL, 'src/adder.v': VERILOG, 'src/x.h': '// h', 'src/m.sch.json': '{"c_function_name":1,"rtl_top_module_name":2}', 'o.json': '{"a":1}', 'bad.json': '{', 'build/b.json': JSON.stringify(DESC()) };
  const r = await blackboxesIn(Object.keys(f), (p) => f[p]);
  assert.deepEqual(r.blackboxes.map((b) => b.file), ['src/a.json']);
  assert.deepEqual(Object.keys(r.headers).sort(), ['src/adder.cpp', 'src/adder.v', 'src/x.h']);
  assert.equal(await blackboxesIn(['o.json'], (p) => f[p]), null);
  // (viewHdl: the module the project's C source makes)
  const v = viewHdl('src/t.cpp', UNIT(TOP), { lang: 'verilog', hls: { ...r, headers: r.headers } });
  assert.deepEqual(v.errors.filter((e) => !/main|top/.test(e)), []);
});
