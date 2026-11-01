// The iCE40's devices: each part's packages and I/O against nextpnr-ice40's own chip database, and a bitstream on each part
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNextpnrIce40, Exit } from '@yowasp/nextpnr-ice40';
import { PARTS, PACKAGES, findPart, findFamily, partsOfFamily, validateDevice, familyOf, getDeviceDb } from '../server/devices.js';
import { resourcesOf, resourceCount } from '../packages/silinx-fpga/src/resources.js';
import { constraintsFile, runFlow, nextpnrIce40Node, yosysNode, ICE40_PARTS } from '../packages/silinx-fpga/src/node.js';
import { emptyProjectJson } from '../web/js/project-store.js';

const parts = partsOfFamily('ice40');
const quiet = { stdout: () => {}, stderr: () => {}, fetchProgress: () => {} };
const NETLIST = JSON.stringify({ modules: { t: { attributes: { top: '00000000000000000000000000000001' },
  ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [3] } },
  cells: { i: { type: 'SB_LUT4', parameters: { LUT_INIT: '0000000000000010' }, port_directions: { I0: 'input', I1: 'input', I2: 'input', I3: 'input', O: 'output' }, connections: { I0: [2], I1: ['0'], I2: ['0'], I3: ['0'], O: [3] } } },
  netnames: { a: { bits: [2] }, y: { bits: [3] } } } } });

test('the iCE40\'s parts in the device data: the family, the parts, their resources', () => {
  assert.deepEqual(parts.map(p => p.part), ['ice40lp384', 'ice40lp1k', 'ice40lp4k', 'ice40lp8k', 'ice40hx1k', 'ice40hx4k', 'ice40hx8k', 'ice40up3k', 'ice40up5k']);
  const f = findFamily('ice40');
  assert.equal(f.displayName, 'iCE40');
  assert.equal(f.webpack, false);
  assert.equal(findFamily('iCE40'), f);
  assert.equal(findFamily('Spartan6').id, 'spartan6', 'the family with no ISE name does not stop the search');
  assert.ok(getDeviceDb().families.find(x => x.id === 'ice40').parts.includes('ice40up5k'));
  for (const p of parts) {
    assert.equal(familyOf(p.part), 'ice40');
    assert.ok(ICE40_PARTS.includes(p.part.replace('ice40', '')), p.part);
    for (const k of Object.keys(p.packages)) assert.ok(PACKAGES[k], k);
  }
  const up5k = findPart('ice40up5k');
  assert.deepEqual(resourcesOf(up5k, 'sg48').map(r => [r.id, r.count]),
    [['ffs', 5280], ['luts', 5280], ['iob', 39], ['ramb16', 30], ['mult18x18', 8], ['bufgmux', 8], ['dcm', 1]]);
  assert.equal(resourcesOf(up5k, 'sg48').find(r => r.id === 'ramb16').report, 'Number of RAM4Ks');
  assert.equal(resourceCount(findPart('ice40lp384'), 'ramb16'), 0);
  assert.equal(resourceCount(findPart('ice40hx8k'), 'iob', 'ct256'), 206);
  assert.ok(PARTS.includes(up5k));
});

test('validateDevice: an iCE40 part has no speed grade to check; a wrong package is still refused', () => {
  assert.deepEqual(validateDevice({ part: 'ice40up5k', package: 'sg48', speed: '' }), []);
  assert.deepEqual(validateDevice({ part: 'ice40up5k', package: 'tq144', speed: '' }), ["ice40up5k is not available in package 'tq144' (valid: sg48, uwg30)"]);
  assert.match(validateDevice({ part: 'xc3s100e', package: 'tq144', speed: '-9' })[0], /speed grade '-9' not available/);
});

test('a new project\'s constraints: a PCF on the iCE40, a UCF elsewhere', () => {
  assert.equal(constraintsFile({ part: 'ice40up5k' }), 'constraints/top.pcf');
  assert.equal(constraintsFile({ part: 'xc3s100e' }), 'constraints/top.ucf');
  assert.equal(constraintsFile({ part: 'xc6slx16' }), 'constraints/top.ucf');
  assert.equal(emptyProjectJson('a', { device: { family: 'ice40', part: 'ice40hx8k', package: 'ct256', speed: '' } }).constraints, 'constraints/top.pcf');
  assert.equal(emptyProjectJson('a').constraints, 'constraints/top.ucf');
});

for (const p of parts) {
  test(`${p.part}: its packages and their I/O are nextpnr-ice40's`, async () => {
    for (const [pkg, { userIo }] of Object.entries(p.packages)) {
      const out = await runNextpnrIce40([`--${p.part.replace('ice40', '')}`, '--package', pkg, '--json', 'n.json', '--report', 'r.json', '--pcf-allow-unconstrained'], { 'n.json': NETLIST }, quiet);
      assert.equal(JSON.parse(out['r.json']).utilization.SB_IO.available, userIo, pkg);
    }
    await assert.rejects(runNextpnrIce40([`--${p.part.replace('ice40', '')}`, '--package', 'nope', '--json', 'n.json'], { 'n.json': NETLIST }, quiet), Exit);
  });
}

const ice40 = nextpnrIce40Node();
for (const p of parts) {
  test(`${p.part}: a design to its bitstream in its first package, the only warnings its free ports'`, async () => {
    const pkg = Object.keys(p.packages)[0], log = [], files = {};
    const io = { log: l => log.push(l), sources: () => [{ path: 'gate.v', lang: 'verilog', text: 'module gate(input a, output y);\n  assign y = ~a;\nendmodule\n' }], ucf: null, ucfName: null,
      yosys: yosysNode, nextpnr: { ice40 }, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {} };
    const r = await runFlow({ top: 'gate', family: 'ice40', device: p.part, pkg, steps: ['synth', 'translate', 'par', 'bitgen'] }, io);
    assert.ok(r.ok, r.error);
    assert.deepEqual(log.filter(l => /^WARNING/.test(l)), [
      'WARNING:Place - the port a has no pin (set_io in the PCF): nextpnr places it anywhere.',
      'WARNING:Place - the port y has no pin (set_io in the PCF): nextpnr places it anywhere.',
      'WARNING:Place - No PCF file specified; IO pins will be placed automatically',
    ]);
    assert.ok(files['gate.bin'].length > 1000);
  });
}
