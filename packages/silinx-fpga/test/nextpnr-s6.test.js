// The Spartan-6 through nextpnr (#2138, src/open-flow-nextpnr-s6.js, src/fpga/s6/nextpnr.js): a design of whole sites as
// nextpnr's netlist, and a counter built by nextpnr's WebAssembly package on the Nexys3's and the Atlys's parts, from
// Yosys to the bitstream: its routing checked, its .bit that of the routed XDL, no warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runFlow, loadDeviceCache, loadBitDbS6, yosysNode, nextpnrS6Node } from '../src/node.js';
import { S6_DB_DIR } from '../src/fpga/s6/bitdb-node.js';
import { s6DbNames } from '../src/fpga/s6/bitdb.js';
import { parseXdl } from '../src/xdl.js';
import { checkRoutingS6 } from '../src/fpga/s6/route-check.js';
import { placementOf, siteBel, siteNetlist, timingParam } from '../src/fpga/s6/nextpnr.js';
import { unknownPipsS6, timingExportS6 } from '../src/fpga/s6/nextpnr-export.js';
import { nextpnrIo } from '../src/nextpnr-io.js';
import { S6_HARD_BY_NEXTPNR } from '../src/open-flow-nextpnr-s6.js';
import { wireDelay, pathCounts } from '../src/fpga/s6/timing.js';
import { netTree, treePath } from '../src/fpga/timing.js';
import { S6_SPEED_3 } from '../src/fpga/s6/timing-model.js';

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
  // (#3137) a class per node: those of several wires in the graph's order, a single wire's by its template's wire
  const multi = Array.from({ length: device.nodeCount }, (_, n) => device.nodeStart[n + 1] - device.nodeStart[n] > 1).filter(Boolean).length;
  assert.equal(t.node.length, multi);
  device.templates.forEach((tp, i) => { if (t.tileWire[i]) assert.equal(t.tileWire[i].length, tp.wires.length); });
  assert.ok([...t.node, ...Object.values(t.tileWire).flat()].every(c => Number.isInteger(t.nodeClass[c])));
  assert.ok(t.nodeClass.every(ps => Number.isInteger(ps) && ps >= 0 && ps < 1000));
});

test('#3349: the pads\' PIPs held out until nextpnr\'s chip database had them (spartan6 0.4.1) are in the flow\'s bit database, none left out of the export', () => {
  // #3269's and #3350's slave OLOGIC2 D1 -> OQ, #3169's four pad wire -> IBUF PIPs (no bits), as measured
  const SLAVE = ['26,35', '27,48', '28,14'];
  const pads = { 'TIOI_INNER D1_OLOGIC_SITE_S -> OQ_OLOGIC_SITE_S': SLAVE, 'TIOI_OUTER D1_OLOGIC_SITE_S -> OQ_OLOGIC_SITE_S': SLAVE,
    'TIOB_SINGLE TIOB_IBUF0_PINW -> TIOB_IBUF0': [], 'TIOB_SINGLE TIOB_IBUF1_PINW -> TIOB_IBUF1': [],
    'BIOB_SINGLE BIOB_IBUF0_PINW -> BIOB_IBUF0': [], 'BIOB_SINGLE BIOB_IBUF1_PINW -> BIOB_IBUF1': [] };
  // in the files the flow reads (TIOI_INNER's with the BSCAN designs that measured it, the others with the I/O path's);
  // the held file is gone
  const file = n => JSON.parse(fs.readFileSync(path.join(S6_DB_DIR, `${n}.json`), 'utf8')).pips;
  const bscan = file('s6-pips-bscan'), io = file('s6-pips-io');
  for (const [k, bits] of Object.entries(pads)) assert.deepEqual(k.startsWith('TIOI_INNER ') ? bscan[k] : io[k], bits, k);
  assert.ok(!fs.existsSync(path.join(S6_DB_DIR, 's6-pips-held.json')));
  assert.ok(s6DbNames(PART).includes('s6-pips-bscan') && s6DbNames(PART).includes('s6-pips-io'));
  const flowDb = loadBitDbS6(PART);
  for (const [k, bits] of Object.entries(pads)) assert.deepEqual(flowDb.other.pips[k], bits, k);
  // the export leaves none of them out, in any tile (the 33 TIOI_INNER / TIOI_OUTER tiles, a TIOB_SINGLE, a BIOB_SINGLE)
  const b = unknownPipsS6(device, flowDb);
  let tiles = 0;
  device.tileNames.forEach((name, k) => {
    const type = name.replace(/_X\d+Y\d+$/, ''), mine = Object.keys(pads).filter(p => p.startsWith(`${type} `));
    if (!mine.length) return;
    tiles++;
    const left = (b.pips[name] ?? []).map(i => { const p = device.pip(k, i); return `${type} ${p.from} ${p.dir} ${p.to}`; });
    assert.deepEqual(left.filter(p => mine.includes(p)), [], name);
  });
  assert.equal(tiles, 33 + 1 + 1);
  // (the export script itself: the same)
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-unknown-')), 'unknown.json');
  execFileSync(process.execPath, [fileURLToPath(new URL('../research/nextpnr-s6/export-unknown-pips.mjs', import.meta.url)), PART, out]);
  assert.deepEqual(JSON.parse(fs.readFileSync(out, 'utf8')), b.pips);
});

/** A node's delay in the chip database (ps): its class's (timingExportS6). */
const nodePs = (t, dv, n) => t.nodeClass[dv.nodeStart[n + 1] - dv.nodeStart[n] > 1 ? t.node[n]
  : t.tileWire[dv.tileTemplate[dv.wireTile[dv.nodeWires[dv.nodeStart[n]]]]][dv.nodeWires[dv.nodeStart[n]] - dv.tileWireBase[dv.wireTile[dv.nodeWires[dv.nodeStart[n]]]]]];

/**
 * (#3137) Each routed connection's delay in nextpnr's chip database (the nodes' after the driver's, as nextpnr adds a
 * node's delay to the PIP driving it) against Silinx's timing analysis (wireDelay): the same but for the fanout's term,
 * 2 ps a load beyond one, and the rounding to ps; and above it by at most the load's terms where the model's sum is
 * below 0 there (the chip database's node delays are not below 0). Returns the connections compared.
 */
function checkNodeDelays(routed, dv) {
  const t = timingExportS6(dv), inst = new Map(routed.insts.map(i => [i.name, i]));
  let compared = 0;
  for (const n of routed.nets) {
    const src = n.outpins[0], si = src && inst.get(src.inst), s = si ? dv.sitePinNode(si.site, src.pin) : -1;
    if (s < 0 || !n.pips?.length) continue;
    const tree = netTree(n.pips, [s], dv);
    for (const p of n.inpins) {
      const k = dv.sitePinNode(inst.get(p.inst).site, p.pin), nodes = k >= 0 ? treePath(tree, k) : null;
      if (!nodes || nodes.length < 2) continue;
      const model = wireDelay(S6_SPEED_3.wires, { ...pathCounts(dv, nodes), fanout: 1 }), db = nodes.slice(1).reduce((a, x) => a + nodePs(t, dv, x), 0) / 1000;
      assert.ok(db >= model - 0.0005 * nodes.length, `${n.name} -> ${p.inst}.${p.pin}: ${db} ns, the model's ${model}`);
      assert.ok(db <= model + 0.0005 * nodes.length + Math.max(0, -S6_SPEED_3.wires.base), `${n.name} -> ${p.inst}.${p.pin}: ${db} ns, the model's ${model}`);
      if (db <= model + 0.0005 * nodes.length) compared++;
    }
  }
  return compared;
}

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
    // (no engine named: nextpnr, the one engine, #2824)
    const r = await runFlow({ top: 'top', part, device: dev, pkg, family: 'spartan6', steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], seed: 1, effort: 1,
      synthEffort: 'normal', replicate: false, startupClk: 'JtagClk' }, io);
    assert.ok(r.ok, r.error);
    assert.deepEqual(lines.filter(l => /^WARNING/.test(l)), []);
    assert.equal(lines.filter(l => /^nextpnr, seed \d: minimum period/.test(l)).length, 3);
    const routed = parseXdl(files['open/routed.xdl']);
    assert.ok(checkRoutingS6(routed, dv).ok);
    assert.equal(r.report.par.engine, 'nextpnr');
    assert.ok(r.report.par.routed);
    assert.ok(Object.keys(files).some(n => /\.bit$/.test(n)));
    // (#3137) the chip database's node delays add up to Silinx's on its routed connections
    if (dev === 'xc6slx16') assert.ok(checkNodeDelays(routed, dv) > 20);
  });
}

// (#2824) Place & Route with no Map before it packs first (Silinx's Map), then nextpnr places and routes
test('Place & Route with no Map step: the design packed first, placed and routed by nextpnr, no warnings', { timeout: 600000 }, async () => {
  const part = 'xc6slx16csg324-3', dv = loadDeviceCache(part), files = {}, lines = [];
  const io = {
    log: l => lines.push(String(l)), sources: () => [{ path: 'top.v', lang: 'verilog', text: COUNTER }], ucf: UCF.xc6slx16csg324, ucfName: 't.ucf',
    device: () => dv, bitDb: () => loadBitDbS6(part), yosys: yosysNode, nextpnr: { spartan6: nextpnrS6Node() },
    write: (n, d) => { files[n] = d; return n; }, read: n => files[n] ?? null, save: () => {},
  };
  const r = await runFlow({ top: 'top', part, device: 'xc6slx16', pkg: 'csg324', family: 'spartan6', steps: ['synth', 'translate', 'par'], seed: 1, effort: 1,
    synthEffort: 'normal', startupClk: 'JtagClk' }, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(lines.filter(l => /^WARNING/.test(l)), []);
  assert.ok(lines.some(l => /^Packed in /.test(l)), lines.join('\n'));
  assert.equal(r.report.par.engine, 'nextpnr');
  assert.ok(checkRoutingS6(parseXdl(files['open/routed.xdl']), dv).ok);
});

// (#3137) who places the block RAMs and DSP48A1s with Silinx's Map (spec.s6Map 'silinx'; nextpnr's packer places them all,
// the default since #3140): nextpnr (S6_HARD_BY_NEXTPNR, since its spartan6 0.2.0), or Silinx with spec.hardByNextpnr
// false (their sites fixed for nextpnr, attribute BEL); the pads and global buffers are Silinx's either way
const RAM_MUL = `module top(input clk, input we, output reg [3:0] led);
  reg [7:0] mem [0:1023];
  reg [9:0] a = 0; reg [17:0] x = 0, y = 0; reg [7:0] q; reg [35:0] p;
  always @(posedge clk) begin
    a <= a + 1; x <= {x[16:0], we}; y <= {y[16:0], x[17]};
    if (we) mem[a] <= a[7:0] ^ p[7:0];
    q <= mem[a]; p <= x * y; led <= q[3:0] ^ p[35:32];
  end
endmodule
`;
for (const option of [undefined, false]) {
  const byNextpnr = option ?? true;
  test(`a block RAM and a DSP48A1 placed by ${byNextpnr ? 'nextpnr (the default)' : 'Silinx, fixed for nextpnr (hardByNextpnr false)'}; the pads by Silinx; routed, no warnings`, { timeout: 600000 }, async () => {
    const part = 'xc6slx16csg324-3', dv = loadDeviceCache(part), files = {}, lines = [], inputs = [];
    const np = nextpnrS6Node();
    const io = {
      log: l => lines.push(String(l)), sources: () => [{ path: 'top.v', lang: 'verilog', text: RAM_MUL }], ucf: UCF.xc6slx16csg324.replace('"rst"', '"we"'), ucfName: 't.ucf',
      device: () => dv, bitDb: () => loadBitDbS6(part), yosys: yosysNode,
      nextpnr: { spartan6: { ...np, run: (args, f, onLine) => { if (args.includes('--no-route')) inputs.push(JSON.parse(f['design.json'])); return np.run(args, f, onLine); } } },
      write: (n, d) => { files[n] = d; return n; }, read: n => files[n] ?? null, save: () => {},
    };
    assert.equal(S6_HARD_BY_NEXTPNR, true);
    const r = await runFlow({ top: 'top', part, device: 'xc6slx16', pkg: 'csg324', family: 'spartan6', steps: ['synth', 'translate', 'map', 'par'], seed: 1, effort: 1,
      synthEffort: 'normal', startupClk: 'JtagClk', s6Map: 'silinx', hardByNextpnr: option }, io);
    assert.ok(r.ok, `${r.error}\n${lines.filter(l => /ERROR|nextpnr, seed/.test(l)).join('\n')}`);
    assert.deepEqual(lines.filter(l => /^WARNING/.test(l)), []);
    assert.equal(inputs.length, 3);
    for (const input of inputs) {
      const cells = Object.values(Object.values(input.modules)[0].cells);
      const fixed = type => cells.filter(c => c.type === type).map(c => !!c.attributes?.BEL);
      assert.deepEqual(fixed('RAMB16BWER').concat(fixed('RAMB8BWER')), [!byNextpnr]);
      assert.deepEqual(fixed('DSP48A1'), Array(3).fill(!byNextpnr));   // (Yosys's unsigned 18 x 18 product in three)
      assert.deepEqual(fixed('IOB'), Array(6).fill(true));
      assert.deepEqual(fixed('BUFGMUX'), [true]);
    }
    assert.ok(checkRoutingS6(parseXdl(files['open/routed.xdl']), dv).ok);
  });
}

// (#2131) a seed nextpnr cannot route: the next one, the step failing only when none routes; nextpnr's WebAssembly
// exception has no message, so its own ERROR line says why
const ROUTE_ERROR = "ERROR: Failed to route arc 0.0 of net 'led_OBUF[0]', from X0Y0/A to X1Y1/B.";
const failingRoutes = (inner, seeds) => ({
  ...inner,
  async run(args, files, onLine) {
    const seed = args[args.indexOf('--seed') + 1];
    if (args.includes('--no-place') && seeds.includes(seed)) { onLine('Info: Routing..'); onLine(ROUTE_ERROR); throw new WebAssembly.Exception(new WebAssembly.Tag({ parameters: [] }), []); }
    return inner.run(args, files, onLine);
  },
});
const counterFlow = async seeds => {
  const part = 'xc6slx16csg324-3', dv = loadDeviceCache(part), db = loadBitDbS6(part);
  const files = {}, lines = [];
  const io = {
    log: l => lines.push(String(l)), sources: () => [{ path: 'top.v', lang: 'verilog', text: COUNTER }], ucf: UCF.xc6slx16csg324, ucfName: 't.ucf',
    device: () => dv, bitDb: () => db, yosys: yosysNode, nextpnr: { spartan6: failingRoutes(nextpnrS6Node(), seeds) },
    write: (n, d) => { files[n] = d; return n; }, read: n => files[n] ?? null, save: () => {},
  };
  const r = await runFlow({ top: 'top', part, device: 'xc6slx16', pkg: 'csg324', family: 'spartan6', steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], seed: 1, effort: 1,
    synthEffort: 'normal', replicate: false, startupClk: 'JtagClk', engine: 'nextpnr' }, io);
  return { r, lines, files };
};

test('the nextpnr engine on the Spartan-6: a seed whose routing fails is left, the next ones kept, no warning (#2131)', { timeout: 600000 }, async () => {
  const { r, lines, files } = await counterFlow(['1']);
  assert.ok(r.ok, r.error);
  assert.deepEqual(lines.filter(l => /^nextpnr, seed/.test(l)).map(l => l.replace(/[\d.]+ ns/, 'N ns')), [
    "nextpnr, seed 1: nextpnr's routing failed: it stopped on an error (Failed to route arc 0.0 of net 'led_OBUF[0]', from X0Y0/A to X1Y1/B).",
    'nextpnr, seed 2: minimum period N ns.', 'nextpnr, seed 3: minimum period N ns.']);
  assert.deepEqual(lines.filter(l => /WARNING|ERROR/.test(l)), []);
  assert.ok(Object.keys(files).some(n => /\.bit$/.test(n)));
});

test('the nextpnr engine on the Spartan-6: no seed routes, Place & Route fails with nextpnr\'s reason, not "undefined" (#2131)', { timeout: 600000 }, async () => {
  const { r, lines } = await counterFlow(['1', '2', '3']);
  assert.equal(r.ok, false);
  assert.equal(r.error, "nextpnr's routing failed: it stopped on an error");
  const at = lines.indexOf("ERROR:Silinx - nextpnr's routing failed: it stopped on an error");
  assert.ok(at > 0, lines.join('\n'));
  assert.equal(lines[at + 1], `  ${ROUTE_ERROR}`);
  assert.equal(lines.filter(l => /^nextpnr, seed \d: nextpnr's routing failed/.test(l)).length, 3);
  assert.deepEqual(lines.filter(l => /WARNING/.test(l)), []);
});
