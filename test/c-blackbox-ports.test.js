// Silinx HLS (#2339): an RTL blackbox's memory and stream ports (syn.blackbox, #1903): an array argument with RAM_type
// RAM_1P, its address, enable, write enable and data the caller's memory's during the call (the top's ap_memory, or its
// own), an hls::stream argument a FIFO port; the C model the C simulation's, the module the co-simulation's, in VHDL and
// in Verilog, against a Verilog and a VHDL module; the HDL as Check Syntax reads it; the warnings exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { cAsm } from '../core/c-asm.js';
import { compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { MSUM_V, INC_V, RAM, MDESC, FIN, FOUT, IDESC, EXT, LOCAL, STREAM, FILES } from './hls-blackbox-ports-lib.mjs';

const OPTS = (desc, files = FILES) => ({ file: 'u.cpp', top: 'top', headers: files, blackboxes: [{ file: 'bb.json', text: JSON.stringify(desc) }] });
const warns = (r) => r.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
const errs = (r) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
// (the stream's loop: pipelined automatically, a state that waits for the module, as a scalar blackbox's, #1903)
const LOOP = 'this loop is pipelined automatically, as Vitis HLS does (II=1): II=4 made (it calls an RTL blackbox, a state that waits for the module); #pragma HLS PIPELINE off in it turns that off';

/** The HDL made, the module with it, as Check Syntax reads them: no error, no warning, no design-check message. */
function checked(g, lang, checks = []) {
  const lib = compile([{ path: `top.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.hdl }, ...g.blackboxes.flatMap((d) => d.rtl)]);
  const design = elaborate(lib, 'top');
  assert.deepEqual([...lib.errors, ...design.diags].map((d) => `${d.severity}: ${d.message}`), []);
  assert.deepEqual(designChecks(lib, design).map((d) => `${d.file}:${d.line} ${d.message}`), checks);
}

const CASES = [
  ['the top\'s memory, inout', EXT, MDESC, 2, ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a_address0', 'a_ce0', 'a_we0', 'a_d0', 'a_q0', 's', 's_ap_vld'], [], () => []],
  ['a memory of its own, inout', LOCAL, MDESC, 6, ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'base', 's', 's_ap_vld'], [], () => []],
  ['the top\'s streams, in and out', STREAM, IDESC, 1, ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a_dout', 'a_empty_n', 'a_read', 'b_din', 'b_full_n', 'b_write'], [LOOP], () => []],
];
for (const [what, unit, desc, calls, ports, w, checks] of CASES) {
  for (const lang of ['vhdl', 'verilog']) {
    for (const rtl of ['Verilog', 'VHDL']) {
      test(`#2339 ${what}: a ${lang} machine with a ${rtl} module, the C model in the C simulation, the module in the co-simulation; the warnings exact`, () => {
        const d = desc(rtl === 'VHDL' ? { rtl_files: [desc().rtl_files[0].replace('.v', '.vhd')] } : {});
        const sim = simulateC(unit, OPTS(d));
        assert.equal(sim.ok, true); assert.equal(sim.exitCode, 0); assert.deepEqual(warns(sim), []);
        const g = cToHdl(unit, { ...OPTS(d), lang });
        assert.deepEqual(errs(g), []); assert.deepEqual(warns(g), w);
        assert.deepEqual(g.ports.map((p) => p.name), ports);
        checked(g, lang, checks(lang));
        const c = cosimulate(unit, { ...OPTS(d), lang });
        assert.deepEqual(c.errors, []);
        assert.deepEqual(c.mismatches, []);
        assert.equal(c.pass, true);
        assert.equal(c.calls, calls);
      });
    }
  }
}

test('#2339 the co-simulation sees the module\'s memory and stream accesses: a module that writes another value, or writes none, mismatches', () => {
  for (const [unit, desc, files] of [
    [EXT, MDESC(), { ...FILES, 'msum.v': MSUM_V.replace('m_d0 <= m_q0 + 1', 'm_d0 <= m_q0 + 2') }],
    [EXT, MDESC(), { ...FILES, 'msum.v': MSUM_V.replace('m_we0 <= 1;', '') }],
    [LOCAL, MDESC(), { ...FILES, 'msum.v': MSUM_V.replace('m_d0 <= m_q0 + 1', 'm_d0 <= m_q0 + 2') }],
    [STREAM, IDESC(), { ...FILES, 'inc.v': INC_V.replace('o_din = v + 1', 'o_din = v + 2') }]]) {
    for (const lang of ['vhdl', 'verilog']) {
      const c = cosimulate(unit, { ...OPTS(desc, files), lang });
      assert.equal(c.pass, false, lang);
      assert.ok(c.mismatches.length > 0, lang);
      assert.equal(c.sim.exitCode, 0);
    }
  }
});

test('#2339 a memory only read (in): no write enable nor data, the module\'s left open; the memory as it was', () => {
  const unit = EXT.replace('if (s != 44) return 1;\n  for (int i = 0; i < 8; i++) if (a[i] != i * 3 - 4) return 2;\n  top(a, s); if (s != 52) return 3;', 'if (s != 44) return 1;\n  top(a, s); if (s != 44) return 3;');
  const d = MDESC({ c_files: ['rsum.cpp'] }, { c_port_direction: 'in', rtl_ports: { RAM_address: 'm_address0', RAM_clock_enable: 'm_ce0', RAM_data_read_in: 'm_q0' } });
  assert.equal(simulateC(unit, OPTS(d)).exitCode, 0);
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(unit, { ...OPTS(d), lang });
    assert.deepEqual(errs(g), []); assert.deepEqual(warns(g), []);
    // (a memory only read: no _we0 nor _d0)
    assert.deepEqual(g.ports.map((p) => p.name).filter((n) => n.startsWith('a_')), ['a_address0', 'a_ce0', 'a_q0']);
    checked(g, lang);
    const c = cosimulate(unit, { ...OPTS(d), lang });
    assert.deepEqual([c.pass, c.mismatches, c.calls], [true, [], 2]);
  }
});

test('#2339 the state machine\'s chart and the synthesis report are made with a memory and a stream blackbox', () => {
  for (const [unit, d] of [[EXT, MDESC()], [STREAM, IDESC()]]) {
    const a = cAsm(unit, { ...OPTS(d), lang: 'vhdl' });
    assert.equal(a.ok, true, JSON.stringify(a.diagnostics));
    const text = JSON.stringify(a.model);
    assert.match(text, new RegExp(`ap_bb0 \\(${d.rtl_top_module_name}\\): ap_start = 1`));
    assert.match(text, /ap_bb0_done/);
    const g = cToHdl(unit, { ...OPTS(d), lang: 'vhdl' });
    assert.equal(g.blackboxes[0].module, d.rtl_top_module_name);
  }
});

// a malformed description, or one that does not match the C or the module: refused, naming what to correct
const REFUSED = [
  ['RAM_T2P', EXT, MDESC({}, { RAM_type: 'RAM_T2P' }), /the argument 'm': 'RAM_type' RAM_T2P \(a memory of two ports\) is not supported yet: RAM_1P/],
  ['a RAM_type not known', EXT, MDESC({}, { RAM_type: 'RAM_S2P' }), /the argument 'm': 'RAM_type' must be RAM_1P \(or RAM_T2P\)/],
  ['a memory\'s port with no RAM_type', EXT, MDESC({}, { RAM_type: undefined }), /the argument 'm': 'RAM_address' is a memory's port: the argument needs 'RAM_type' \(RAM_1P\)/],
  ['a memory\'s port kind not known', EXT, MDESC({}, { rtl_ports: { ...RAM, RAM_address_snd: 'x' } }), /the argument 'm': the port kind 'RAM_address_snd' is not one of RAM_address, RAM_clock_enable, RAM_write_enable, RAM_data_write_out, RAM_data_read_in/],
  ['an inout memory not read', EXT, MDESC({}, { rtl_ports: { ...RAM, RAM_data_read_in: undefined } }), /the argument 'm': a memory 'inout' needs 'RAM_data_read_in'/],
  ['an out memory not written', EXT, MDESC({}, { c_port_direction: 'out', rtl_ports: { ...RAM, RAM_write_enable: undefined } }), /the argument 'm': a memory 'out' needs 'RAM_write_enable'/],
  ['an in memory written', EXT, MDESC({}, { c_port_direction: 'in' }), /the argument 'm': a memory 'in' is only read: no 'RAM_write_enable' nor 'RAM_data_write_out'/],
  ['a stream inout', STREAM, IDESC({}, { c_port_direction: 'inout' }), /the argument 'i': a stream is read or written: 'c_port_direction' in or out/],
  ['a stream in with a write\'s port', STREAM, IDESC({}, { rtl_ports: { ...FIN, FIFO_full_flag: 'o_full_n' } }), /the argument 'i': a stream 'in' has no 'FIFO_full_flag' \(FIFO_empty_flag, FIFO_read_enable, FIFO_data_read_in\)/],
  ['a stream out without its full flag', STREAM, IDESC({}, {}, { rtl_ports: { ...FOUT, FIFO_full_flag: undefined } }), /the argument 'o': a stream 'out' needs 'FIFO_full_flag'/],
  ['an array described as a scalar', EXT, MDESC({}, { RAM_type: undefined, c_port_direction: 'in', rtl_ports: { data_read_in: 'm_q0' } }), /the argument 'm' is an array: its description needs 'RAM_type' RAM_1P and a memory's ports \(RAM_…\)/],
  ['a stream described as a scalar', STREAM, IDESC({}, { rtl_ports: { data_read_in: 'i_dout' } }), /the argument 'i' is an hls::stream: its description needs a stream's ports \(FIFO_…\)/],
  ['a stream described as a memory', STREAM, IDESC({}, { RAM_type: 'RAM_1P', rtl_ports: { RAM_address: 'i_read', RAM_clock_enable: 'i_read', RAM_data_read_in: 'i_dout' } }), /the argument 'i' is an hls::stream: its description needs a stream's ports/],
  ['a memory port of the module that is not there', EXT, MDESC({}, { rtl_ports: { ...RAM, RAM_data_read_in: 'm_q' } }), /the argument 'm': the module 'msum' has no port 'm_q'/],
  ['a memory port of another width', EXT, MDESC({}, {}), /the argument 'm': the port 'm_d0' has 10 bit\(s\), the C type 12/, (u) => u.replace('typedef ap_int<10>', 'typedef ap_int<12>')],
  ['an address too narrow', EXT, MDESC({}, {}), /the argument 'm': the port 'm_address0' has 3 bit\(s\), the 16 words of 'm' need 4/, (u) => u.replace('void msum(data_t m[8]', 'void msum(data_t m[16]').replace('void top(data_t a[8]', 'void top(data_t a[16]')],
  ['a stream port the wrong way', STREAM, IDESC({}, { rtl_ports: { ...FIN, FIFO_read_enable: 'i_empty_n' } }), /the argument 'i': the port 'i_empty_n' is an input of 'inc'/],
  ['a memory partitioned', EXT, MDESC(), /the argument of 'm' in the call of the RTL blackbox 'msum': an array that is a memory of one port, by its name \(not partitioned, not a BRAM interface, not ram_2p\)/, (u) => u.replace('{ data_t t; msum(a, t);', '{\n#pragma HLS ARRAY_PARTITION variable=a cyclic factor=2\n  data_t t; msum(a, t);')],
  ['a constant memory written', LOCAL, MDESC(), /'m' is constant: the RTL blackbox 'msum' writes it/, (u) => u.replace('  data_t m[8];\n  for (int i = 0; i < 8; i++) m[i] = base + i;', '  const data_t m[8] = {1, 2, 3, 4, 5, 6, 7, 8};')],
];
for (const [name, unit, desc, re, alter] of REFUSED) {
  test(`#2339 refused: ${name}`, () => {
    const u = alter ? alter(unit) : unit;
    const g = cToHdl(u, { ...OPTS(desc), lang: 'vhdl' });
    assert.equal(g.ok, false);
    assert.ok(errs(g).some((m) => re.test(m)), errs(g).join('\n'));
  });
}
