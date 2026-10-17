// core/fpga/techview.js: View Technology Schematic in the Silinx toolchain (#119): the netlist of the
// open synthesis (Yosys's JSON) as a schematic model (cells, pins, nets) and as netgen-style VHDL
// regrouped by the design's instances, which Silinx's schematic engine draws; a LUT's function from
// its INIT.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { technologyNetlist, lutFunction, initBits, vhdlName } from '../core/fpga/techview.js';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { schematicFromHdl, modulesFromLibrary } from '../core/schdoc.js';
import { example } from './examples-lib.mjs';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';

// a small netlist as Yosys writes it (write_json after synth_xilinx): a register of the instance
// u_r, a LUT whose output Yosys did not name, an adder bit (MUXCY / XORCY on a constant carry in),
// I/O and clock buffers, a block RAM (bus pins, parameters), a cell Silinx has no model of
const OUT = 'output', IN = 'input';
const JSON_NL = {
  creator: 'Yosys',
  modules: {
    LUT2: { attributes: { blackbox: '00000000000000000000000000000001' }, ports: {}, cells: {}, netnames: {} },
    top: {
      attributes: { top: '00000000000000000000000000000001' },
      ports: { clk: { direction: 'input', bits: [2] }, a: { direction: 'input', bits: [3, 4] }, y: { direction: 'output', bits: [5] }, q: { direction: 'output', bits: [6] }, d: { direction: 'output', bits: [20, 21] } },
      cells: {
        '$iopadmap$top.clk': { type: 'IBUF', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [2], O: [7] } },
        '$auto$clkbufmap.cc:1$1': { type: 'BUFG', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [7], O: [8] } },
        '$iopadmap$top.a': { type: 'IBUF', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [3], O: [9] } },
        '$iopadmap$top.a_1': { type: 'IBUF', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [4], O: [10] } },
        '$abc$12$auto$blifparse.cc:557:parse_blif$13': { type: 'LUT2', parameters: { INIT: '0110' }, port_directions: { I0: IN, I1: IN, O: OUT }, connections: { I0: [9], I1: [10], O: [11] } },
        '$auto$ff.cc:337:slice$5': { type: 'FDRE', parameters: { INIT: '0' }, port_directions: { C: IN, CE: IN, D: IN, Q: OUT, R: IN }, connections: { C: [8], CE: ['1'], D: [11], Q: [12], R: ['0'] } },
        '$auto$alumacc.cc:548:replace_alu$7.genblk1.slice[0].muxcy': { type: 'MUXCY', parameters: {}, port_directions: { CI: IN, DI: IN, S: IN, O: OUT }, connections: { CI: ['0'], DI: [9], S: [11], O: [13] } },
        '$auto$alumacc.cc:548:replace_alu$7.genblk1.slice[0].xorcy': { type: 'XORCY', parameters: {}, port_directions: { CI: IN, LI: IN, O: OUT }, connections: { CI: ['0'], LI: [11], O: [14] } },
        'mem.0.0': { type: 'RAMB16_S1', parameters: { INIT: '0', WRITE_MODE: 'READ_FIRST', INIT_00: '0'.repeat(255) + '1', INIT_01: 'x'.repeat(256) },
          port_directions: { ADDR: IN, CLK: IN, DI: IN, DO: OUT, EN: IN, SSR: IN, WE: IN },
          connections: { ADDR: [9, 10, '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0', '0'], CLK: [8], DI: [14], DO: [15], EN: ['1'], SSR: ['0'], WE: [12] } },
        '$auto$custom$9': { type: 'XYZ_CELL', parameters: {}, port_directions: { A: IN, Z: OUT }, connections: { A: [15], Z: [16] } },
        '$iopadmap$top.y': { type: 'OBUF', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [16], O: [5] } },
        '$iopadmap$top.q': { type: 'OBUF', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [12], O: [6] } },
        '$iopadmap$top.d': { type: 'OBUF', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [13], O: [20] } },
        '$iopadmap$top.d_1': { type: 'OBUF', parameters: {}, port_directions: { I: IN, O: OUT }, connections: { I: [14], O: [21] } },
      },
      netnames: {
        clk: { hide_name: 0, bits: [2] }, a: { hide_name: 0, bits: [3, 4] }, y: { hide_name: 0, bits: [5] }, q: { hide_name: 0, bits: [6] }, d: { hide_name: 0, bits: [20, 21] },
        '$abc$12$n11': { hide_name: 1, bits: [11] }, 'u_r.q': { hide_name: 0, bits: [12] }, 'u_r.sum': { hide_name: 0, bits: [13, 14] },
        '$iopadmap$clk': { hide_name: 1, bits: [7] }, '$auto$gclk': { hide_name: 1, bits: [8] }, 'mem_out': { hide_name: 0, bits: [15] }, '$z': { hide_name: 1, bits: [16] },
      },
    },
  },
};

test('vhdlName: VHDL identifiers of the netlist\'s names', () => {
  assert.equal(vhdlName('u_pre.cnt<3>'), 'u_pre_cnt_3');
  assert.equal(vhdlName('laps_ram.0.0'), 'laps_ram_0_0');
  assert.equal(vhdlName('_opcode[0]_'), 'opcode_0');
  assert.equal(vhdlName('3state'), 'N_3state');
  assert.equal(vhdlName('signal'), 'signal_s');
  assert.equal(vhdlName('a__b'), 'a_b');
});

test('technologyNetlist: the cells, their pins and the nets of the netlist; cells named after what they drive, grouped by instance', () => {
  const r = technologyNetlist(JSON.stringify(JSON_NL));
  assert.equal(r.name, 'top');
  assert.equal(r.cells, 14);
  assert.deepEqual(r.model.ports, [{ name: 'clk', ident: 'clk', dir: 'in', msb: null, lsb: null }, { name: 'a', ident: 'a', dir: 'in', msb: 1, lsb: 0 },
    { name: 'y', ident: 'y', dir: 'out', msb: null, lsb: null }, { name: 'q', ident: 'q', dir: 'out', msb: null, lsb: null }, { name: 'd', ident: 'd', dir: 'out', msb: 1, lsb: 0 }]);
  assert.deepEqual(r.model.cells.map(c => [c.name, c.type, c.group]), [
    ['clk_IBUF', 'IBUF', null], ['BUFG_1', 'BUFG', null], ['a_0_IBUF', 'IBUF', null], ['a_1_IBUF', 'IBUF', null],
    ['LUT2_1', 'LUT2', 'u_r'],                   // drives no named net: the instance of its neighbours
    ['u_r_q_FDRE', 'FDRE', 'u_r'], ['u_r_sum_0_MUXCY', 'MUXCY', 'u_r'], ['u_r_sum_1_XORCY', 'XORCY', 'u_r'],
    ['mem_0_0', 'RAMB16_S1', null],              // Yosys's own name kept
    ['XYZ_CELL_1', 'XYZ_CELL', null],
    ['y_OBUF', 'OBUF', null], ['q_OBUF', 'OBUF', null], ['d_0_OBUF', 'OBUF', null], ['d_1_OBUF', 'OBUF', null]]);
  const cell = n => r.model.cells.find(c => c.name === n);
  assert.deepEqual(cell('LUT2_1'), { name: 'LUT2_1', yosysName: '$abc$12$auto$blifparse.cc:557:parse_blif$13', type: 'LUT2', group: 'u_r', generics: { INIT: 'X"6"' }, pins: { I0: 'N11', I1: 'N12', O: 'N13' } });
  assert.deepEqual(cell('u_r_q_FDRE').pins, { C: 'N10', CE: "'1'", D: 'N13', Q: 'u_r_q', R: "'0'" });
  assert.deepEqual(cell('u_r_q_FDRE').generics, { INIT: "'0'" });
  assert.deepEqual(cell('clk_IBUF').pins, { I: 'clk', O: 'N9' });
  assert.deepEqual(cell('d_1_OBUF').pins, { I: 'u_r_sum_1', O: 'd_1' });   // an output bus: its bits, then d <= d_1 & d_0
  // a block RAM: bus pins bit by bit, its parameters by the types of the primitive (empty contents left out)
  assert.deepEqual(cell('mem_0_0').generics, { INIT: 'X"0"', WRITE_MODE: '"READ_FIRST"', INIT_00: `X"${'0'.repeat(63)}1"` });
  assert.equal(cell('mem_0_0').pins['ADDR<1>'], 'N12');
  // the nets: driver and loads
  const net = n => r.model.nets.find(x => x.name === n);
  assert.deepEqual(net('N13'), { name: 'N13', driver: { cell: 'LUT2_1', pin: 'O' },
    loads: [{ cell: 'u_r_q_FDRE', pin: 'D' }, { cell: 'u_r_sum_0_MUXCY', pin: 'S' }, { cell: 'u_r_sum_1_XORCY', pin: 'LI' }] });
  assert.deepEqual(net('u_r_q'), { name: 'u_r_q', driver: { cell: 'u_r_q_FDRE', pin: 'Q' }, loads: [{ cell: 'mem_0_0', pin: 'WE' }, { cell: 'q_OBUF', pin: 'I' }] });
  assert.deepEqual(r.groups, { u_r: 4 });
  // the flat VHDL: netgen's layout
  assert.match(r.flat, /\n {2}LUT2_1 : LUT2\n {4}generic map \(\n {6}INIT => X"6"\n {4}\)\n {4}port map \(\n {6}I0 => N11,\n {6}I1 => N12,\n {6}O => N13\n {4}\);/);
  assert.match(r.flat, /RAMB16_S1\n[\s\S]*?ADDR\(0\) => N11,\n {6}ADDR\(1\) => N12,\n {6}ADDR\(2\) => '0',/);
  assert.match(r.flat, /entity XYZ_CELL is\n {2}port \(\n {4}A : in STD_LOGIC;\n {4}Z : out STD_LOGIC\n {2}\);/);
  // by instance: an entity u_r, the top instantiates it; constants stay constants inside
  assert.match(r.text, /entity u_r is/);
  assert.match(r.text, /\n {2}d <= d_1 & d_0;\n/);
  assert.match(r.text, /\n {2}u_r : entity work\.u_r\n/);
  assert.match(r.text, /u_r_sum_0_MUXCY : MUXCY\n {4}port map \(\n {6}CI => '0',/);
  // it compiles with Silinx's UNISIM models, and the schematic engine draws it
  const net0 = { path: 'build/open/top_tech.vhd', lang: 'vhdl', text: r.text, role: 'design' };
  const lib = compile([...primitiveSources([net0]), net0]);
  assert.deepEqual(lib.errors.filter(e => e.severity === 'error'), []);
  const d = elaborate(lib, 'top');
  assert.deepEqual(d.diags.filter(e => e.severity === 'error'), []);
  assert.deepEqual(d.top.children.map(c => c.name).sort(), ['BUFG_1', 'XYZ_CELL_1', 'a_0_IBUF', 'a_1_IBUF', 'clk_IBUF', 'd_0_OBUF', 'd_1_OBUF', 'mem_0_0', 'q_OBUF', 'u_r', 'y_OBUF'].map(s => s.toLowerCase()).sort());
});

test('technologyNetlist: the instances to group by can be given (the elaborated top\'s); a cell of none stays on the top', () => {
  const r = technologyNetlist(JSON_NL, { groups: ['other'] });
  assert.deepEqual(r.groups, {});
  assert.ok(r.model.cells.every(c => c.group === null));
  assert.equal(r.text, r.flat);
});

test('lutFunction: a LUT\'s INIT as an equation (ISE\'s notation) and a truth table', () => {
  assert.deepEqual(lutFunction('X"AC"', 3), {
    inputs: ['I2', 'I1', 'I0'], equation: 'O = I0*I2 + I1*!I2',
    rows: [[0, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 1], [0, 1, 1, 1], [1, 0, 0, 0], [1, 0, 1, 1], [1, 1, 0, 0], [1, 1, 1, 1]].map(([a, b, c, o]) => ({ in: [a, b, c], out: o })),
  });
  const eq = (init, k) => lutFunction(init, k).equation;
  assert.equal(eq('"0100"', 2), 'O = !I0*I1');               // the schematic shows a VHDL bit string
  assert.equal(eq('X"8"', 2), 'O = I0*I1');
  assert.equal(eq('X"E"', 2), 'O = I0 + I1');
  assert.equal(eq('X"6"', 2), 'O = I0 @ I1');
  assert.equal(eq('X"9"', 2), 'O = !(I0 @ I1)');
  assert.equal(eq('X"6996"', 4), 'O = I0 @ I1 @ I2 @ I3');
  assert.equal(eq('X"0000"', 4), 'O = 0');
  assert.equal(eq('X"FFFF"', 4), 'O = 1');
  assert.equal(eq('X"1"', 1), 'O = !I0');
  assert.equal(eq('X"2"', 1), 'O = I0');
  assert.equal(eq('X"8000"', 4), 'O = I0*I1*I2*I3');
  assert.equal(eq("16'hFFFE", 4), 'O = I0 + I1 + I2 + I3');
  assert.equal(eq('0000100000000111', 4), 'O = I0*I1*!I2*I3 + !I0*!I2*!I3 + !I1*!I2*!I3');   // Yosys's binary string: the shortest sum of products
  assert.equal(eq('X"CACA"', 4), 'O = I0*!I2 + I1*I2');      // an input it does not depend on (I3) is left out
  assert.equal(lutFunction('X"ZZ"', 2), null);
  assert.deepEqual(initBits('X"A"', 4), [0, 1, 0, 1]);
  assert.deepEqual(initBits('"10"', 4), [0, 1, 0, 0]);
});

test('the examples blinky and pong, synthesized by Yosys: technology netlists by instance that compile and are drawn', { timeout: 300000 }, async () => {
  const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
  const elk = new ELK();
  for (const [name, want] of [['blinky', { u_pre: 70, u_speed: 213, u_knight: 50 }], ['pong', null]]) {
    const ex = example(name);
    const design = elaborate(compile([...primitiveSources(ex.design), ...ex.design]), ex.project.top);
    const syn = await synthesizeOpen(design, { run: yosysNode });
    const r = technologyNetlist(syn.files[`${syn.top}.json`], { groups: design.top.children.map(c => c.name) });
    assert.equal(r.cells, syn.util.cells, name);
    if (want) assert.deepEqual(r.groups, want);
    else {
      // pong: the instances of the design, and the top module's own logic by signal (more than 100 cells)
      for (const g of ['display', 'dbL', 'dbR', 'db1', 'db2']) assert.ok(r.groups[g] > 50, `${g}: ${r.groups[g]}`);
      assert.ok(Object.keys(r.groups).some(g => /_logic$/.test(g)), Object.keys(r.groups).join(' '));
    }
    const net = { path: 'build/open/tech.vhd', lang: 'vhdl', text: r.text, role: 'design' };
    const srcs = [...primitiveSources([net]), net];
    const lib = compile(srcs);
    assert.deepEqual(lib.errors.filter(e => e.severity === 'error'), [], name);
    const d = elaborate(lib, r.name);
    assert.deepEqual(d.diags.filter(e => e.severity === 'error'), [], name);
    const sources = Object.fromEntries(srcs.map(x => [x.path, x.text]));
    const modules = modulesFromLibrary(lib, { sources });
    const doc = await schematicFromHdl(d.top, { sources, modules, layout: g => elk.layout(g), lang: 'vhdl' });
    const mods = doc.symbols.map(s => s.params?.module);
    for (const t of ['ibuf', 'obuf', 'bufg']) assert.ok(mods.includes(t), `${name}: ${t} on the top level`);
    for (const g of Object.keys(r.groups)) assert.ok(mods.includes(g.toLowerCase()), `${name}: block ${g}`);
    // inside an instance: LUTs (with their INIT), flip-flops, carry chains
    const inst = d.top.children.find(c => c.name.toLowerCase() === (name === 'blinky' ? 'u_pre' : 'dbl'));
    const sub = await schematicFromHdl(inst, { sources, modules, layout: g => elk.layout(g), lang: 'vhdl' });
    const types = new Set(sub.symbols.map(s => s.params?.module));
    for (const t of ['fdre', 'muxcy', 'xorcy']) assert.ok(types.has(t), `${name}/${inst.name}: ${t} (${[...types].join(' ')})`);
    const lut = sub.symbols.find(s => /^lut[1-4]$/.test(s.params?.module));
    assert.ok(lutFunction(lut.params.generics.init, +lut.params.module.slice(3)), JSON.stringify(lut.params));
    // as View Technology Schematic draws it: the names as the netlist writes them, like ISE's (#131):
    // the primitives (IBUF, LUT4), the instances (dbL), the cells (LUT4_119) and the nets (pressL, N566)
    const shown = modulesFromLibrary(lib, { sources, asWritten: true });
    const top2 = await schematicFromHdl(d.top, { sources, modules: shown, layout: g => elk.layout(g), lang: 'vhdl' });
    const mods2 = new Set(top2.symbols.map(s => s.params?.module));
    for (const t of ['IBUF', 'OBUF', 'BUFG', ...Object.keys(r.groups)]) assert.ok(mods2.has(t), `${name}: ${t} as written (${[...mods2].join(' ')})`);
    assert.deepEqual(top2.ports.map(p => p.name), d.top.ports.map(p => p.name));   // (lower case in both examples)
    const names = top2.symbols.map(s => s.name);
    assert.ok(names.includes(name === 'blinky' ? 'u_pre' : 'dbL'), names.join(' '));
    assert.ok(names.some(n => /^(IBUF|OBUF|BUFG)_|_(IBUF|OBUF)$/.test(n)), names.join(' '));
    if (name === 'pong') assert.ok(top2.labels.some(l => l.net === 'pressL'), top2.labels.map(l => l.net).join(' '));
    assert.ok(!top2.labels.some(l => /^n\d+$/.test(l.net)), 'no lower-case nNNN nets');
    const sub2 = await schematicFromHdl(inst, { sources, modules: shown, layout: g => elk.layout(g), lang: 'vhdl' });
    const lut2 = sub2.symbols.find(s => /^LUT[1-4]$/.test(s.params?.module));
    assert.match(lut2.name, /^LUT[1-4]_\d+$/);
    assert.ok(lutFunction(lut2.params.generics.INIT, +lut2.params.module.slice(3)), JSON.stringify(lut2.params));
  }
});
