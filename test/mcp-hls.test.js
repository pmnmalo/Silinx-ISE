// The MCP server's tools of a C or C++ source (#2674, server/mcp-hls.js), as the C module's processes: C Simulation and
// C/RTL Co-simulation of the test designs (fir, gcd, sort, popcount; stream_sum in C++), the co-simulation in VHDL and
// in Verilog; View C Synthesis Report (#2783: scheduled within the device's multiplier blocks; #2273: a floating-point operation's unit); the HDL and the ASM chart made from the C; a C with an error; the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { scratchEnv } from './server-helpers.js';
import { MSUM_C, MSUM_V, MDESC, EXT, INC_C, INC_V, IDESC, CHAIN } from './hls-blackbox-ports-lib.mjs';

let tmp;
const { handle } = await import('../server/mcp.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const DESIGNS = [['fir', 'src/fir.c', 12], ['gcd', 'src/gcd.c', 6], ['sort', 'src/sort.c', 3], ['popcount', 'src/popcount.c', 257], ['stream_sum', 'src/stream_sum.cpp', 1]];

before(async () => {
  tmp = await scratchEnv('silinx-mcp-hls-');
  for (const [d] of DESIGNS) await ok('new_project_from_example', { name: d, example: d });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('c_simulation and c_cosimulation: the test designs\' C, PASS in VHDL and in Verilog', async () => {
  for (const [d, path, calls] of DESIGNS) {
    const s = await ok('c_simulation', { project: d, path });
    assert.deepEqual([s.data.exitCode, s.data.calls, s.data.top], [0, calls, d], d);
    assert.ok(s.text.endsWith(`main() returned 0; ${calls} call(s) of '${d}'.\nProcess "C Simulation" completed successfully`), d);
    for (const [language, L] of [['vhdl', 'VHDL'], ['verilog', 'Verilog']]) {
      const c = await ok('c_cosimulation', { project: d, path, language });
      assert.deepEqual([c.data.pass, c.data.calls, c.data.mismatches], [true, calls, []], `${d} ${language}`);
      assert.match(c.text, new RegExp(`^C simulation: ${calls} call\\(s\\) of '${d}' replayed on its ${L}\\.\\n`));
      assert.ok(c.text.endsWith(`C/RTL co-simulation PASS: ${calls} call(s), the same results\nProcess "C/RTL Co-simulation" completed successfully`), `${d} ${language}`);
    }
  }
  // fir's output, line by line
  const f = await ok('c_simulation', { project: 'fir', path: 'src/fir.c' });
  assert.deepEqual(f.data.output.slice(0, 2), ['x[0] = 1  y[0] = 1', 'x[1] = 0  y[1] = 3']);
  assert.equal(f.data.output.at(-1), 'PASS');
  // (its latency in cycles)
  assert.deepEqual((await ok('c_cosimulation', { project: 'fir', path: 'src/fir.c' })).data.latency, { min: 2, max: 2, avg: 2 });
});

test('c_synthesis_report: fir\'s module, clock, ports and loop', async () => {
  const r = await ok('c_synthesis_report', { project: 'fir', path: 'src/fir.c' });
  assert.equal(r.text, ['C Synthesis Report of \'fir\' (src/fir.c, VHDL)', '',
    'Module: sequential, ap_ctrl_hs (ap_clk, ap_rst, ap_start / ap_done / ap_idle / ap_ready), 4 states, 386 register bits',   // (its sum a tree, #2613: was 418)
    'Target clock: 20 ns (the board\'s oscillator)', '', 'Ports:',
    '  ap_clk           in    1 bit', '  ap_rst           in    1 bit', '  ap_start         in    1 bit', '  ap_done          out   1 bit',
    '  ap_idle          out   1 bit', '  ap_ready         out   1 bit', '  x                in   32 bits', '  ap_return        out  32 bits',
    '', 'Loops:', '  line 12   3 iterations; in the state it is in, 0 cycles; unrolled', '  line 17   4 iterations; in the state it is in, 0 cycles; unrolled',
    'Process "View C Synthesis Report" completed successfully'].join('\n'));
  assert.deepEqual(r.data.warnings, []);
});

// #2783: six multiplications in one state on the Basys2-100 (an XC3S100E, 4 MULT18X18s): 4 blocks, the device's limit
test('#2783 c_synthesis_report and c_cosimulation: within the device\'s multiplier blocks, PASS in VHDL and in Verilog', async () => {
  const six = 'int six(short a, short b, short c, short d, short e, short g) {\n  return a * b + c * d + e * g + a * c + b * d + e * a;\n}\n';
  await ok('write_file', { project: 'gcd', path: 'src/six.c', text: `${six}int main() {\n  return six(3, -4, 5, 6, -7, 8) == 3 * -4 + 5 * 6 + -7 * 8 + 3 * 5 + -4 * 6 + -7 * 3 ? 0 : 1;\n}\n` });
  for (const [variant, units, blocks] of [['100', 4, 4], ['250', 6, 6]]) {
    await ok('set_design_properties', { project: 'gcd', board: 'basys2', variant });
    const r = await ok('c_synthesis_report', { project: 'gcd', path: 'src/six.c' });
    assert.ok(r.text.includes(`\nMultipliers: ${units} units, ${blocks} multiplier blocks\n`), `${variant}: ${r.text}`);
    assert.deepEqual(r.data.warnings, []);
    for (const language of ['vhdl', 'verilog']) {
      const c = await ok('c_cosimulation', { project: 'gcd', path: 'src/six.c', language });
      assert.deepEqual([c.data.pass, c.data.mismatches], [true, []], `${variant} ${language}`);
    }
  }
  await ok('delete_file', { project: 'gcd', path: 'src/six.c' });
});

// #2273: ALLOCATION of fmul: the three multiplications one unit, a sub-module called three times
test('#2273 c_synthesis_report and c_cosimulation: ALLOCATION of fmul, one unit and its calls, PASS in VHDL and in Verilog', async () => {
  const fm = 'float fm(float x, float y, float z) {\n#pragma HLS ALLOCATION operation instances=fmul limit=1\n  float p = x * y;\n  float q = p * z;\n  return q * x;\n}\n';
  await ok('write_file', { project: 'gcd', path: 'src/fm.c', text: `${fm}int main() {\n  return fm(1.5f, -2.0f, 0.25f) == 1.5f * -2.0f * 0.25f * 1.5f ? 0 : 1;\n}\n` });
  await ok('set_design_properties', { project: 'gcd', board: 'basys2', variant: '250' });
  const r = await ok('c_synthesis_report', { project: 'gcd', path: 'src/fm.c' });
  assert.ok(r.text.includes('\nFunctions (the module\'s latency: 61 cycles):\n  ap_unit_fmul_U0  ap_unit_fmul: 3 calls; latency 17 cycles, 19 states, 2876 register bits\n'), r.text);
  assert.ok(!r.text.includes('\nMultipliers:'), r.text);
  assert.deepEqual(r.data.warnings, []);
  for (const language of ['vhdl', 'verilog']) {
    const c = await ok('c_cosimulation', { project: 'gcd', path: 'src/fm.c', language });
    assert.deepEqual([c.data.pass, c.data.mismatches, c.data.latency.max], [true, [], 61], language);
  }
  await ok('delete_file', { project: 'gcd', path: 'src/fm.c' });
});

test('c_generated: the HDL and the ASM chart made from fir.c', async () => {
  const h = await ok('c_generated', { project: 'fir', path: 'src/fir.c' });
  assert.match(h.text, /^-- Generated by Silinx from fir\.c \(Silinx HLS, compatible with Vitis HLS\): edit the C source\n/);
  assert.match(h.text, /\nentity fir is\n/);
  assert.deepEqual([h.data.module, h.data.language, h.data.sequential], ['fir', 'vhdl', true]);
  const a = await ok('c_generated', { project: 'fir', path: 'src/fir.c', what: 'asm' });
  const m = JSON.parse(a.text);
  assert.deepEqual([m.name, m.clock, m.reset.name], ['fir', 'ap_clk', 'ap_rst']);
  assert.equal(m.nodes.length, 6);
});

test('the C tools: a C with an error, the errors', async () => {
  await ok('write_file', { project: 'fir', path: 'src/bad.c', text: 'int bad(int a) {\n  return a +;\n}\nint main(void) { return bad(1); }\n' });
  const s = await call('c_simulation', { project: 'fir', path: 'src/bad.c' });
  assert.equal(s.isError, true);
  assert.match(s.text, /^ERROR:SilinxC - "src\/bad\.c" line 2: .+\nProcess "C Simulation" failed$/);
  const r = await call('c_synthesis_report', { project: 'fir', path: 'src/bad.c' });
  assert.equal(r.isError, true);
  assert.match(r.text, /^ERROR:SilinxC - "src\/bad\.c" line 2: .+\nProcess "View C Synthesis Report" failed$/);
  for (const [name, args, message] of [
    ['c_simulation', { path: 'src/fir.vhd' }, 'path: a C or C++ source of the project (.c, .cpp), not \'src/fir.vhd\''],
    ['c_cosimulation', { path: 'src/none.c' }, 'no file \'src/none.c\' in the project \'fir\''],
    ['c_generated', { path: 'src/fir.c', what: 'netlist' }, 'what: hdl or asm'],
  ]) {
    const e = await call(name, { project: 'fir', ...args });
    assert.equal(e.isError, true);
    assert.equal(e.text, `${name}: ${message}`);
  }
});

test('#2339 an RTL blackbox with a memory port: the project\'s description, module and C model; C Simulation and C/RTL Co-simulation PASS in VHDL and in Verilog; the report names it', async () => {
  await ok('new_project', { name: 'bbmem' });
  for (const [path, text] of [['src/msum.json', JSON.stringify(MDESC(), null, 2)], ['src/msum.cpp', MSUM_C], ['src/msum.v', MSUM_V], ['src/top.cpp', EXT]]) await ok('write_file', { project: 'bbmem', path, text });
  const s = await ok('c_simulation', { project: 'bbmem', path: 'src/top.cpp' });
  assert.deepEqual([s.data.exitCode, s.data.calls, s.data.top], [0, 2, 'top']);
  for (const language of ['vhdl', 'verilog']) {
    const c = await ok('c_cosimulation', { project: 'bbmem', path: 'src/top.cpp', language });
    assert.deepEqual([c.data.pass, c.data.calls, c.data.mismatches], [true, 2, []], language);
  }
  const r = await ok('c_synthesis_report', { project: 'bbmem', path: 'src/top.cpp' });
  assert.match(r.text, /RTL blackbox: msum is the module msum \(msum\.v\)/);
  assert.match(r.text, /a_address0 +out +3 bits/);
});

test('#2340 an RTL blackbox in a DATAFLOW region: two processes of its module, a stream between them; C Simulation and C/RTL Co-simulation PASS in VHDL and in Verilog; the report\'s processes', async () => {
  await ok('new_project', { name: 'bbdf' });
  for (const [path, text] of [['src/inc.json', JSON.stringify(IDESC(), null, 2)], ['src/inc.cpp', INC_C], ['src/inc.v', INC_V], ['src/top.cpp', CHAIN]]) await ok('write_file', { project: 'bbdf', path, text });
  const s = await ok('c_simulation', { project: 'bbdf', path: 'src/top.cpp' });
  assert.deepEqual([s.data.exitCode, s.data.calls, s.data.top], [0, 5, 'top']);
  for (const language of ['vhdl', 'verilog']) {
    const c = await ok('c_cosimulation', { project: 'bbdf', path: 'src/top.cpp', language });
    assert.deepEqual([c.data.pass, c.data.calls, c.data.mismatches], [true, 5, []], language);
  }
  const r = await ok('c_synthesis_report', { project: 'bbdf', path: 'src/top.cpp' });
  assert.match(r.text, /\nRTL blackbox: inc is the module inc \(inc\.v\)\n/);
  assert.match(r.text, /\n {2}inc_bb_U0 {8}inc: the RTL blackbox inc, ended by its ap_done\n {2}inc_bb_U1 {8}inc: the RTL blackbox inc, ended by its ap_done\n\nFIFOs:\n {2}t {16}2 words\n/);
});

test('#2342 an RTL blackbox\'s files written while the project is open: the next tool reads them (the module, the description, the C model)', async () => {
  await ok('new_project', { name: 'bbedit' });
  for (const [path, text] of [['src/msum.json', JSON.stringify(MDESC(), null, 2)], ['src/msum.cpp', MSUM_C], ['src/msum.v', MSUM_V], ['src/top.cpp', EXT]]) await ok('write_file', { project: 'bbedit', path, text });
  assert.equal((await ok('c_cosimulation', { project: 'bbedit', path: 'src/top.cpp' })).data.pass, true);
  // the module's port renamed: refused, said
  await ok('write_file', { project: 'bbedit', path: 'src/msum.v', text: MSUM_V.split('m_q0').join('m_qq') });
  const r = await call('c_synthesis_report', { project: 'bbedit', path: 'src/top.cpp' });
  assert.equal(r.isError, true);
  assert.match(r.text, /syn\.blackbox: msum\.json: the argument 'm': the module 'msum' has no port 'm_q0'/);
  // the description corrected: made again
  await ok('write_file', { project: 'bbedit', path: 'src/msum.json', text: JSON.stringify(MDESC({}, { rtl_ports: { RAM_address: 'm_address0', RAM_clock_enable: 'm_ce0', RAM_write_enable: 'm_we0', RAM_data_write_out: 'm_d0', RAM_data_read_in: 'm_qq' } }), null, 2) });
  assert.equal((await ok('c_cosimulation', { project: 'bbedit', path: 'src/top.cpp' })).data.pass, true);
  // the C model changed: the C simulation runs it
  await ok('write_file', { project: 'bbedit', path: 'src/msum.cpp', text: MSUM_C.replace('m[i] = m[i] + 1', 'm[i] = m[i] + 2') });
  assert.equal((await ok('c_simulation', { project: 'bbedit', path: 'src/top.cpp' })).data.exitCode, 2);
});
