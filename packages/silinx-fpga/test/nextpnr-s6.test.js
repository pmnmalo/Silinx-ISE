// The Spartan-6 through nextpnr (#2138, src/open-flow-nextpnr-s6.js, src/fpga/s6/nextpnr.js): a design of whole sites as
// nextpnr's netlist, and a counter built by nextpnr's WebAssembly package on the Nexys3's and the Atlys's parts, from
// Yosys to the bitstream: its routing checked, its .bit that of the routed XDL, no warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlow, loadDeviceCache, loadBitDbS6, yosysNode, nextpnrS6Node } from '../src/node.js';
import { parseXdl } from '../src/xdl.js';
import { checkRoutingS6 } from '../src/fpga/s6/route-check.js';
import { placementOf, siteBel, siteNetlist, timingParam } from '../src/fpga/s6/nextpnr.js';
import { unknownPipsS6, timingExportS6 } from '../src/fpga/s6/nextpnr-export.js';
import { nextpnrIo } from '../src/nextpnr-io.js';

const PART = 'xc6slx16csg324-3';
const device = loadDeviceCache(PART);
const slice = (name, cfg = []) => ({ name, type: 'SLICEX', placed: true, cfg });
const pin = (inst, p) => ({ inst, pin: p });

test('nextpnrIo: the package\'s runner by its name (the Spartan-6\'s), its lines, the last without its newline', async () => {
  const seen = [];
  const pkg = { Exit: class {}, runNextpnrHimbaechelSpartan6: async (args, files, { stdout }) => {
    stdout(new TextEncoder().encode('Info: one\nInfo: tw')); stdout(new TextEncoder().encode('o\nlast')); return { out: args.join(' ') }; } };
  const io = nextpnrIo(async () => pkg, 'runNextpnrHimbaechelSpartan6');
  assert.deepEqual(await io.run(['--a'], {}, l => seen.push(l)), { out: '--a' });
  assert.deepEqual(seen, ['Info: one', 'Info: two', 'last']);
  // (the Spartan-3E's by default)
  await assert.rejects(nextpnrIo(async () => pkg).run([], {}), /not a function/);
});

test('siteBel: a site\'s BEL is its tile\'s position, its index in the tile and its type (an IOBM / IOBS: IOB)', () => {
  const [k, sites] = [...device.tileSites.entries()].find(([, s]) => s.some(([n]) => /^SLICE_X/.test(n)));
  const i = sites.findIndex(([n]) => /^SLICE_X/.test(n));
  assert.equal(siteBel(device, sites[i][0]), `X${device.tileCol[k]}Y${device.tileRow[k]}/S${i}_${device.site(sites[i][0]).type}`);
  const pad = device.sites('IOBM')[0];
  assert.match(siteBel(device, pad.name), /_IOB$/);
});

test('timingParam: comb, setup and clock-to-out arcs in ps; the clock\'s edge; no clock, no clocked arcs', () => {
  const arcs = () => ({ comb: [['A1', 'A', 0.259]], setup: [['A1', 0.322], ['CE', 0.331], ['A1', 0.1]], clkToOut: [['AQ', 0.408]] });
  assert.equal(timingParam(slice('s'), arcs, ['A1', 'CE', 'CLK']), 'c A1 A 259;k CLK r;s A1 CLK 322;s CE CLK 331;q AQ CLK 408');
  assert.match(timingParam(slice('s', [{ attr: 'CLKINV', value: 'CLK_B' }]), arcs, ['A1', 'CLK']), /k CLK f/);
  assert.equal(timingParam(slice('s'), arcs, ['A1']), 'c A1 A 259');
  // a block RAM's pins by their port's clock
  const ram = () => ({ comb: [], setup: [['ADDRA0', 0.3], ['ADDRB0', 0.3]], clkToOut: [['DOB0', 1.85]] });
  assert.equal(timingParam({ name: 'r', type: 'RAMB16BWER', cfg: [] }, ram, ['ADDRA0', 'ADDRB0', 'CLKA', 'CLKB']),
    'k CLKA r;k CLKB r;s ADDRA0 CLKA 300;s ADDRB0 CLKB 300;q DOB0 CLKB 1850');
});

test('siteNetlist: a cell per instance with the pins in use; a power net with no source left out; fixed sites, chains', () => {
  const site = device.sites('SLICEX')[0].name;
  const design = { name: 'top', insts: [slice('a'), slice('b'), { name: 'g', type: 'BUFG', placed: true, cfg: [] }],
    nets: [{ name: 'n', outpins: [pin('a', 'A')], inpins: [pin('b', 'B1')], pips: [] }, { name: 'gnd', outpins: [], inpins: [pin('b', 'AX')], pips: [] }] };
  const json = siteNetlist(design, { top: 't', device, fixed: new Map([['a', site]]), chains: [['a', 'b']], generalOk: new Set(['g']) });
  const mod = json.modules.t;
  assert.deepEqual(Object.keys(mod.netnames), ['n']);
  assert.equal(mod.cells.g.type, 'BUFGMUX');
  assert.equal(mod.cells.g.parameters.GENERAL_OK, '1 ');
  assert.deepEqual(mod.cells.a.connections, { A: [2] });
  assert.equal(mod.cells.a.port_directions.A, 'output');
  assert.deepEqual(mod.cells.b.connections, { B1: [2] });
  assert.equal(mod.cells.a.attributes.BEL, siteBel(device, site));
  assert.equal(mod.cells.b.attributes.BEL, undefined);
  assert.equal(mod.cells.a.parameters.CHAIN_NEXT, 'b ');
});

test('placementOf: nextpnr\'s BEL back to the site; a cell not placed is an error', () => {
  const s = device.sites('SLICEX')[0], json = { modules: { t: { attributes: { top: 1 }, cells: { a: { attributes: { NEXTPNR_BEL: siteBel(device, s.name) } } } } } };
  const p = placementOf(json, { insts: [{ name: 'a' }] }, device);
  assert.deepEqual(p.site, [s.name]);
  assert.deepEqual(p.tile, [s.tileName]);
  assert.throws(() => placementOf(json, { insts: [{ name: 'b' }] }, device), /b: not placed/);
});

test('the chip database\'s exports: the unknown PIPs are real PIPs of their tiles; a class per PIP', () => {
  const { pips, total, unknown } = unknownPipsS6(device, loadBitDbS6(PART));
  assert.ok(unknown > 0 && unknown < total);
  for (const [tile, list] of Object.entries(pips).slice(0, 20)) {
    const tp = device.templates[device.tileTemplate[device.tile(tile)]];
    assert.ok(list.every(i => i >= 0 && i < tp.from.length));
  }
  const t = timingExportS6(device);
  assert.equal(t.wire.length, 9);
  device.templates.forEach((tp, i) => assert.equal(t.pipClass[i].length, tp.from.length));
});

const COUNTER = `module top(input clk, input rst, output reg [3:0] led);
  reg [23:0] c = 0;
  always @(posedge clk) if (rst) c <= 0; else c <= c + 1;
  always @(posedge clk) led <= c[23:20];
endmodule
`;
const UCF = {
  xc6slx16csg324: 'NET "clk" LOC = "V10";\nNET "rst" LOC = "B8";\nNET "led<0>" LOC = "U16";\nNET "led<1>" LOC = "V16";\nNET "led<2>" LOC = "U15";\nNET "led<3>" LOC = "V15";\nNET "clk" PERIOD = 20 ns;\n',
  xc6slx45csg324: 'NET "clk" LOC = "L15";\nNET "rst" LOC = "N4";\nNET "led<0>" LOC = "U18";\nNET "led<1>" LOC = "M14";\nNET "led<2>" LOC = "N14";\nNET "led<3>" LOC = "L14";\nNET "clk" PERIOD = 20 ns;\n',
};

for (const [dev, pkg] of [['xc6slx16', 'csg324'], ['xc6slx45', 'csg324']]) {
  test(`a counter on ${dev} by nextpnr's WebAssembly package: routed, checked, a bitstream, no warnings`, { timeout: 600000 }, async () => {
    const part = `${dev}${pkg}-3`, dv = loadDeviceCache(part), db = loadBitDbS6(part);
    const files = {}, lines = [];
    const io = {
      log: l => lines.push(String(l)), sources: () => [{ path: 'top.v', lang: 'verilog', text: COUNTER }], ucf: UCF[`${dev}${pkg}`], ucfName: 't.ucf',
      device: () => dv, bitDb: () => db, yosys: yosysNode, nextpnr: { spartan6: nextpnrS6Node() },
      write: (n, d) => { files[n] = d; return n; }, read: n => files[n] ?? null, save: () => {},
    };
    const r = await runFlow({ top: 'top', part, device: dev, pkg, family: 'spartan6', steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], seed: 1, effort: 1,
      synthEffort: 'normal', replicate: false, startupClk: 'JtagClk', engine: 'nextpnr' }, io);
    assert.ok(r.ok, r.error);
    assert.deepEqual(lines.filter(l => /^WARNING/.test(l)), []);
    assert.equal(lines.filter(l => /^nextpnr, seed \d: minimum period/.test(l)).length, 3);
    const routed = parseXdl(files['open/routed.xdl']);
    assert.ok(checkRoutingS6(routed, dv).ok);
    assert.equal(r.report.par.engine, 'nextpnr');
    assert.ok(r.report.par.routed);
    assert.ok(Object.keys(files).some(n => /\.bit$/.test(n)));
  });
}
