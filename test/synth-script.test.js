// A family's synthesis by a Yosys script of its own (#2386): synth-script.js, and a fake family synthesized through runFlow
// with its script, its report's names, into Yosys's generic cells
import test from 'node:test';
import assert from 'node:assert/strict';
import { genericUtilization, scriptSynthesis } from '../packages/silinx-fpga/src/synth-script.js';
import { runFlow, registerBackend } from '../packages/silinx-fpga/src/index.js';
import { yosysNode } from '../packages/silinx-fpga/src/node.js';
import { FAMILY_INFO, familyFromXise, familyName } from '../packages/silinx-fpga/src/family.js';

const COUNTER = 'module top(input clk, input rst, output reg [3:0] q);\n  always @(posedge clk) if (rst) q <= 0; else q <= q + 1;\nendmodule\n';

test('genericUtilization counts Yosys\'s generic cells', () => {
  assert.deepEqual(genericUtilization({ $lut: 5, $_DFF_P_: 3, $_SDFFE_PP0P_: 1, $_DLATCH_P_: 2, $_AND_: 4 }), { luts: 5, flipFlops: 4, latches: 2, ios: 0, cells: 15 });
  assert.deepEqual(genericUtilization({}), { luts: 0, flipFlops: 0, latches: 0, ios: 0, cells: 0 });
});

test('scriptSynthesis: the script between the flat module read and the netlist written; Yosys\'s warnings and its errors', async () => {
  assert.throws(() => scriptSynthesis({}), /script\(top\)/);
  let args = null, given = null;
  const run = async (a, files) => { args = a; given = files; return { 'top.json': '{"modules":{"top":{"cells":{"a":{"type":"$lut"}}}}}', 'top_stat.txt': 'stat' }; };
  const lines = [];
  const r = await scriptSynthesis({ script: t => `synth -top ${t}`, files: { 'lib.v': 'x' } })({ text: 'module top; endmodule', top: 'top', warnings: ['before'] }, { run, onLine: l => lines.push(l) });
  assert.match(args[2], /^read_verilog -sv top_syn\.v; synth -top top; .*write_json -selected top\.json/);
  assert.deepEqual(Object.keys(given).sort(), ['lib.v', 'top_syn.v']);
  assert.deepEqual(r.util, { luts: 1, flipFlops: 0, latches: 0, ios: 0, cells: 1 });
  assert.deepEqual(r.warnings, ['before']);
  assert.deepEqual(Object.keys(r.files).sort(), ['top.json', 'top_stat.txt', 'top_syn.v', 'top_yosys.v']);
  // Yosys's messages: a warning kept, a quiet one left out of the log and the warnings
  const warn = async (a, f, onLine) => { onLine('Warning: something'); onLine('Warning: nothing'); return run(a, f); };
  const r2 = await scriptSynthesis({ script: t => `synth -top ${t}`, quiet: [/nothing/] })({ text: '', top: 'top' }, { run: warn });
  assert.deepEqual(r2.warnings, ['Warning: something']);
  await assert.rejects(scriptSynthesis({ script: () => 'x' })({ text: '', top: 'top' }, { run: async () => { throw new Error('ERROR: x'); } }), /ERROR: x/);
});

function memoryIo() {
  const log = [], files = {};
  return { log, files, io: { log: l => log.push(l), sources: () => [{ path: 'top.v', lang: 'verilog', text: COUNTER }], ucf: null, save: () => {}, yosys: yosysNode,
    write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null } };
}

test('#2386 a fake family synthesized with its own script (4-input LUTs of Yosys\'s generic cells), its report names its lines', { timeout: 120000 }, async () => {
  let netlist = null;
  const remove = registerBackend({
    id: 'fake', synth: scriptSynthesis({ script: top => `synth -flatten -top ${top} -lut 4` }),
    synthName: id => ({ luts: 'LUT4s', ffs: 'DFFs' }[id] || id), mount: ctx => ({ runMap: () => { netlist = ctx.netlist(); } }),
  });
  try {
    const { io, log, files } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['synth', 'translate', 'map'], resources: [{ id: 'luts', count: 100 }, { id: 'ffs', count: 100 }] }, io);
    assert.equal(r.ok, true, r.error);
    const u = Object.fromEntries(r.report.synthesis.utilization.map(i => [i.name, i.used]));
    assert.ok(u.LUT4s > 0 && u.DFFs === 4, JSON.stringify(u));
    assert.ok(!/synth_xilinx|LUT4\b|FD/.test(files['open/top.json']), 'generic cells only');
    assert.match(files['open/top.json'], /"\$lut"/);
    assert.equal(netlist.ports.length, 3);
    assert.deepEqual(log.filter(l => /^(WARNING|ERROR)/.test(l)), []);
  } finally { remove(); }
});

test('#2386 a registered family with no synthesis of its own: Yosys\'s generic synth, its lines named by its resources', { timeout: 120000 }, async () => {
  const remove = registerBackend({ id: 'fake', mount: () => ({}) });
  try {
    const { io, log } = memoryIo();
    const r = await runFlow({ top: 'top', family: 'fake', steps: ['synth'], resources: [{ id: 'ffs', count: 50, report: 'Number of registers' }] }, io);
    assert.equal(r.ok, true, r.error);
    assert.deepEqual(r.report.synthesis.utilization.find(i => i.id === 'ffs'), { id: 'ffs', name: 'Number of registers', used: 4, total: 50, percent: 8 });
    assert.deepEqual(log.filter(l => /^(WARNING|ERROR)/.test(l)), []);
  } finally { remove(); }
});

test('#2386 a family needs only the name: FAMILY_INFO\'s ISE fields optional', () => {
  FAMILY_INFO.fake = { name: 'Fake-1' };
  try {
    assert.equal(familyName('fake'), 'Fake-1');
    assert.equal(familyFromXise('Spartan3E'), 'spartan3e');
    assert.equal(familyFromXise('fake'), null);
  } finally { delete FAMILY_INFO.fake; }
});
