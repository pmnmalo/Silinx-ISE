// The Spartan-6's Map by nextpnr (#3138, packages/silinx-fpga/src/fpga/s6/nextpnr-pack.js): the netlist's cells by name
// (the order of the fork's packer, so that Silinx's Map names its sites alike), Yosys's netlist for the fork (each I/O
// buffer with its port and constraints), and the check that the fork packed the sites of Silinx's Map; the option
// (s6MapOf) and the flow's netlist sorted only with it (open-flow-backends.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortedNetlistText, packInput, packedSites, samePacking } from '../packages/silinx-fpga/src/fpga/s6/nextpnr-pack.js';
import { s6MapOf } from '../packages/silinx-fpga/src/parts.js';
import { packS6 } from '../packages/silinx-fpga/src/fpga/s6/pack.js';
import { physS6 } from '../packages/silinx-fpga/src/fpga/s6/phys.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { readConstraints, UCF as UCF_FORMAT } from '../packages/silinx-fpga/src/constraints.js';

const T = '00000000000000000000000000000001';
// a little netlist of Yosys's synth_xilinx -family xc6s: a and b into an AND (a LUT2) to y, its cells in no order
function netlist() {
  const cell = (type, conns, dirs, attributes = {}) => ({ hide_name: 0, type, parameters: {}, attributes, port_directions: dirs, connections: conns });
  return { creator: 'Yosys', modules: {
    other: { attributes: {}, ports: {}, cells: { z: cell('LUT1', { I0: [9], O: [10] }, { I0: 'input', O: 'output' }), a: cell('LUT1', { I0: [10], O: [9] }, { I0: 'input', O: 'output' }) }, netnames: {} },
    top: { attributes: { top: T }, ports: { a: { direction: 'input', bits: [2] }, b: { direction: 'input', bits: [3] }, y: { direction: 'output', bits: [4] } },
      cells: {
        y_OBUF_inst: cell('OBUF', { I: [7], O: [4] }, { I: 'input', O: 'output' }),
        b_IBUF_inst: cell('IBUF', { I: [3], O: [6] }, { I: 'input', O: 'output' }),
        y_LUT2: cell('LUT2', { I0: [5], I1: [6], O: [7] }, { I0: 'input', I1: 'input', O: 'output' }, { src: 'top.v:3' }),
        a_IBUF_inst: cell('IBUF', { I: [2], O: [5] }, { I: 'input', O: 'output' }),
      },
      netnames: { a: { bits: [2] }, b: { bits: [3] }, y: { bits: [4] } } },
  } };
}
const UCF = 'NET "a" LOC = "V10" | IOSTANDARD = LVCMOS33;\nNET "y" LOC = "U16" | IOSTANDARD = LVCMOS25 | DRIVE = 12 | SLEW = FAST;\nNET "b" PULLUP;\n';

test('sortedNetlistText: every module\'s cells by name, nothing else changed', () => {
  const j = netlist(), s = JSON.parse(sortedNetlistText(JSON.stringify(j)));
  assert.deepEqual(Object.keys(s.modules.top.cells), ['a_IBUF_inst', 'b_IBUF_inst', 'y_LUT2', 'y_OBUF_inst']);
  assert.deepEqual(Object.keys(s.modules.other.cells), ['a', 'z']);
  for (const m of ['top', 'other']) {
    for (const [k, c] of Object.entries(j.modules[m].cells)) assert.deepEqual(s.modules[m].cells[k], c, k);
    assert.deepEqual({ ...s.modules[m], cells: null }, { ...j.modules[m], cells: null });
  }
  // (sorted already: the same text, the same netlist again)
  const once = sortedNetlistText(JSON.stringify(j));
  assert.equal(sortedNetlistText(once), once);
});

test('packInput: each I/O buffer with its port bit and the port\'s constraints, as Silinx\'s Map read them; the other cells as they were', () => {
  const text = sortedNetlistText(JSON.stringify(netlist()));
  const nl = readYosysJson(text), packed = packS6(nl);
  const phys = physS6(nl, packed, { ucf: readConstraints(UCF_FORMAT, UCF, 'top.ucf') });
  const j = packInput(text, phys), cells = j.modules.top.cells;
  assert.deepEqual(cells.a_IBUF_inst.attributes, { PORT: 'a', LOC: 'V10', IOSTANDARD: 'LVCMOS33' });
  assert.deepEqual(cells.y_OBUF_inst.attributes, { PORT: 'y', LOC: 'U16', IOSTANDARD: 'LVCMOS25', DRIVE: '12', SLEW: 'fast' });
  assert.deepEqual(cells.b_IBUF_inst.attributes, { PORT: 'b', PULL: 'up' });
  assert.deepEqual(cells.y_LUT2, JSON.parse(text).modules.top.cells.y_LUT2);
  assert.deepEqual(j.modules.other, JSON.parse(text).modules.other);
  // (the netlist given is not changed)
  assert.deepEqual(JSON.parse(text).modules.top.cells.a_IBUF_inst.attributes, {});
});

test('samePacking: [] when the fork\'s sites are Silinx\'s Map\'s (an IOB of either of a pair, BUFGMUX for BUFG); each difference named', () => {
  const phys = { insts: [{ name: 'a', type: 'IOB' }, { name: 'y', type: 'IOB' }, { name: 's0', type: 'SLICEX' }, { name: 'clk_BUFG', type: 'BUFG' }] };
  const json = cells => ({ modules: { top: { attributes: { top: T }, cells: Object.fromEntries(Object.entries(cells).map(([n, type]) => [n, { type }])) } } });
  const same = json({ a: 'IOBM', y: 'IOBS', s0: 'SLICEX', clk_BUFG: 'BUFGMUX' });
  assert.deepEqual(packedSites(same), { a: 'IOB', y: 'IOB', s0: 'SLICEX', clk_BUFG: 'BUFG' });
  assert.deepEqual(samePacking(same, phys), []);
  assert.deepEqual(samePacking(json({ a: 'IOB', s0: 'SLICEL', clk_BUFG: 'BUFGMUX', s1: 'SLICEX' }), phys),
    ['y: not packed by nextpnr', 's0: a SLICEL in nextpnr, a SLICEX in Silinx\'s Map', 's1: packed by nextpnr only']);
  assert.deepEqual(samePacking(json({}), { insts: [] }), []);
});

test('s6MapOf: nextpnr\'s Map (the default since #3140) unless the project chose Silinx\'s', () => {
  assert.equal(s6MapOf(undefined), 'nextpnr');
  assert.equal(s6MapOf({}), 'nextpnr');
  assert.equal(s6MapOf({ s6Map: 'silinx' }), 'silinx');
  assert.equal(s6MapOf({ s6Map: 'nextpnr' }), 'nextpnr');
  assert.equal(s6MapOf({ s6Map: 'SILINX' }), 'nextpnr');
});
