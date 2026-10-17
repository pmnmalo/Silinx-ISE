// The device description shipped with Silinx (core/fpga/devices/) and the whole open flow on it:
// blinky (examples/blinky, Basys2-250) synthesized, packed, placed, routed and written as a .bit
// with no Xilinx tool (research/s3e-route/open-flow.mjs). That the .bit equals ISE's needs ISE:
// npm run check:open-flow (see README, For developers).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-open-flow-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');   // no user cache: the shipped graph is used
const { findDeviceGraph, shippedDevicePath, deviceCachePath, loadDeviceCache } = await import('../core/fpga/device-node.js');
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('the routing graph of the XC3S250E-CP132 ships with Silinx; the user\'s own one comes first; any speed grade', () => {
  const shipped = shippedDevicePath('xc3s250ecp132-4');
  assert.ok(fs.existsSync(shipped));
  assert.equal(findDeviceGraph('xc3s250ecp132-4'), shipped);
  assert.equal(findDeviceGraph('xc3s250ecp132-5'), shipped);
  assert.equal(findDeviceGraph('xc3s1600efg320-4'), null);
  assert.throws(() => loadDeviceCache('xc3s1600efg320-4'), /no routing graph of xc3s1600efg320-4: build it from your ISE's device report/);
  const dev = loadDeviceCache('xc3s250ecp132-4');
  assert.equal(dev.part.replace(/-\d+$/, ''), 'xc3s250ecp132');
  assert.ok(dev.nodeCount > 100000);
  // a graph the user built (from their own ISE) takes precedence
  fs.mkdirSync(path.dirname(deviceCachePath('xc3s250ecp132-4')), { recursive: true });
  fs.writeFileSync(deviceCachePath('xc3s250ecp132-4'), zlib.gzipSync('{}'));
  assert.equal(findDeviceGraph('xc3s250ecp132-4'), deviceCachePath('xc3s250ecp132-4'));
  fs.rmSync(deviceCachePath('xc3s250ecp132-4'));
});

test('every shipped device description loads and has the datasheet\'s slices and user I/O pins', async () => {
  const { deviceSites } = await import('../core/fpga/place.js');
  // DS312 (Spartan-3E family data sheet): CLB slices; user I/O of the package
  const want = { 'xc3s100ecp132-4': [960, 83], 'xc3s250ecp132-4': [2448, 92], 'xc3s500efg320-4': [4656, 232], 'xc3s1200efg320-4': [8672, 250] };
  for (const [part, [slices, pads]] of Object.entries(want)) {
    assert.equal(findDeviceGraph(part), shippedDevicePath(part), part);
    const s = deviceSites(loadDeviceCache(part));
    assert.deepEqual([s.slices.size, s.pads.size], [slices, pads], part);
  }
});

// the open flow of a project: its exit status, output and warnings (every line that says "warning")
const openFlow = (dir, out, args = []) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), dir, out, ...args],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  return { ...r, warnings: `${r.stdout}\n${r.stderr}`.split('\n').filter(l => /warning/i.test(l)).map(l => l.trim()) };
};
// the warnings of the open flow on blinky: none, on every device
const BLINKY_WARNINGS = [];

test('the open flow on the shipped graph: blinky from VHDL to a complete bitstream, no Xilinx tool', { timeout: 300000 }, async () => {
  const out = path.join(tmp, 'blinky');
  const r = openFlow(path.join(ROOT, 'examples/blinky'), out, ['--quality', path.join(out, 'quality.json')]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  // --quality (#352): the circuit's size and speed as the design corpus records them, the pack's and the STA's
  const q = JSON.parse(fs.readFileSync(path.join(out, 'quality.json'), 'utf8'));
  assert.deepEqual(Object.keys(q), ['part', 'slices', 'luts', 'ffs', 'period']);
  assert.equal(q.part, 'xc3s250ecp132-4');
  assert.equal(q.slices, +/pack \((\d+) slices\)/.exec(r.stdout)[1]);
  assert.ok(q.luts > 0 && q.ffs > 0 && q.luts <= 2 * q.slices && q.ffs <= 2 * q.slices, JSON.stringify(q));
  assert.equal(q.period.toFixed(3), /timing: clock \S+: minimum period ([\d.]+) ns/.exec(r.stdout)[1]);
  // no warnings (front end, synthesis, packer: each printed as "  Warning: …")
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
  assert.deepEqual(r.warnings, BLINKY_WARNINGS);
  const bit = fs.readFileSync(path.join(out, 'top.bit'));
  assert.ok(bit.length > 160000);
  assert.ok(bit.includes(Buffer.from([0xaa, 0x99, 0x55, 0x66])), 'the sync word');
  for (const f of ['top.json', 'placed.xdl', 'routed.xdl', 'timing.txt']) assert.ok(fs.existsSync(path.join(out, f)), f);
  // the router swaps LUT inputs: every LUT of the routed design computes the same function of the
  // same nets as in the placed design (an input not connected reads 1 in both)
  const { parseXdl, evalLut } = await import('../core/xdl.js');
  const [placed, routed] = ['placed.xdl', 'routed.xdl'].map(f => parseXdl(fs.readFileSync(path.join(out, f), 'utf8')));
  const pinNets = d => new Map(d.nets.flatMap(n => n.inpins.map(p => [`${p.inst}.${p.pin}`, n.name])));
  const pa = pinNets(placed), pb = pinNets(routed), byName = new Map(routed.insts.map(i => [i.name, i]));
  let luts = 0, swapped = 0;
  for (const ia of placed.insts.filter(i => /^SLICE/.test(i.type))) {
    for (const L of ['F', 'G']) {
      const ea = ia.cfg.find(c => c.attr === L && /^#LUT:/.test(c.value));
      if (!ea) continue;
      const eb = byName.get(ia.name).cfg.find(c => c.attr === L);
      const na = [1, 2, 3, 4].map(k => pa.get(`${ia.name}.${L}${k}`)), nb = [1, 2, 3, 4].map(k => pb.get(`${ia.name}.${L}${k}`));
      luts++;
      if (na.join() !== nb.join()) swapped++;
      const nets = [...new Set(na.filter(Boolean))];
      assert.deepEqual([...new Set(nb.filter(Boolean))].sort(), [...nets].sort(), `${ia.name} ${L}: the same nets`);
      for (let v = 0; v < 1 << nets.length; v++) {
        const env = ns => Object.fromEntries(ns.map((n, k) => [`A${k + 1}`, n ? (v >> nets.indexOf(n)) & 1 : 1]));
        assert.equal(evalLut(eb.value.slice(5), env(nb)), evalLut(ea.value.slice(5), env(na)), `${ia.name} ${L}: ${ea.value} / ${eb.value}`);
      }
    }
  }
  assert.ok(luts > 50 && swapped > 10, `${swapped} of ${luts} LUTs with their inputs swapped`);
});

test('the open flow with --tries 2: two placements routed, the one with the shorter critical path kept', { timeout: 300000 }, () => {
  const out = path.join(tmp, 'blinky-tries');
  const json = path.join(tmp, 'blinky', 'top.json');   // the netlist of the test above
  const r = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), path.join(ROOT, 'examples/blinky'), out, ...(fs.existsSync(json) ? ['--json', json] : []), '--tries', '2', '--seed', '3', '--no-replicate'],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  const periods = [...r.stdout.matchAll(/^ {2}seed (\d+): ([\d.]+) ns$/gm)].map(m => [+m[1], +m[2]]);
  assert.deepEqual(periods.map(p => p[0]), [3, 4]);
  const kept = +/clock \S+clk: minimum period ([\d.]+) ns/.exec(fs.readFileSync(path.join(out, 'timing.txt'), 'utf8'))[1];
  assert.equal(kept, Math.min(...periods.map(p => p[1])));
  assert.match(r.stdout, /top\.bit: complete/);
});

// Register replication (#4): a flip-flop (s) that selects 64 registers spread over the chip is on
// the critical path (every path is one LUT; its net is the slowest): copied, each copy near a group
// of its loads, the design placed and routed again; the faster kept. No warning.
const FAN64 = `module fan(input clk, input sel, input din, output reg y);
  reg s;
  reg [63:0] a, q;
  reg [15:0] r1;
  reg [3:0] r2;
  integer i;
  always @(posedge clk) begin
    s <= sel;
    a <= {a[62:0], din};
    for (i = 0; i < 64; i = i + 1) q[i] <= s ? a[i] : a[63 - i];
    for (i = 0; i < 16; i = i + 1) r1[i] <= ^q[4*i +: 4];
    for (i = 0; i < 4; i = i + 1) r2[i] <= ^r1[4*i +: 4];
    y <= ^r2;
  end
endmodule
`;
test('the open flow replicates a flip-flop of many loads on the critical path, and keeps the faster routing (#4)', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'fan64');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'fan.v'), FAN64);
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: 'fan64', version: 1, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, top: 'fan',
    files: [{ path: 'fan.v', lang: 'verilog', role: 'design' }] }));
  const r = openFlow(dir, path.join(dir, 'out'));
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.deepEqual(r.warnings, []);
  const m = /^replication: 1 flip-flop\(s\), (\d+) copies: ([\d.]+) ns against ([\d.]+) ns: (kept|not kept)$/m.exec(r.stdout);
  assert.ok(m, r.stdout);
  assert.ok(+m[1] >= 2, 'its 64 loads in groups of up to 16');
  const kept = +/clock \S+clk: minimum period ([\d.]+) ns/.exec(fs.readFileSync(path.join(dir, 'out', 'timing.txt'), 'utf8'))[1];
  assert.equal(kept, Math.min(+m[2], +m[3]));
  assert.equal(m[4], +m[2] < +m[3] ? 'kept' : 'not kept');
  assert.match(r.stdout, /fan\.bit: complete/);
  // the routed design has the copies when kept
  const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
  assert.equal((routed.match(/_rep\d+"/g) || []).length > 0, m[4] === 'kept');
  // --no-replicate: none tried
  const r0 = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), dir, path.join(dir, 'out0'), '--no-replicate', '--json', path.join(dir, 'out', 'fan.json')],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r0.status, 0, r0.stderr);
  assert.doesNotMatch(r0.stdout, /replication|place \(/);
  assert.match(r0.stdout, new RegExp(`minimum period ${m[3].replace('.', '\\.')} ns`), 'the same first placement and routing');
});

// The rest of the Spartan-3E in the open flow (test/fixtures/open-flow: the board tests and the ISE
// check of instantiated primitives; ISE converts the same routed XDL to the same .bit, with no DRC
// error or warning: npm run check:open-flow on these folders): block RAM, multipliers, shift
// registers in SRL16, distributed RAM, the top-left DCM, each to a complete bitstream with no warning;
// feat_starter: the Spartan-3E Starter Kit's I/O settings on the XC3S500E-FG320 (LVTTL, drive 8 and 4,
// slow and fast slew, pull-ups and pull-downs: the FG320 pads' settings, stage F).
const FEATURES = {
  feat_bram: [/^pack \(\d+ slices\)/m, 'RAMB16'],
  feat_mult: [/^pack \(\d+ slices\)/m, 'MULT18X18SIO'],
  // multiplications by a constant (inputs tied to 1) and a 14-bit memory word (#35)
  feat_constmult: [/^pack \(\d+ slices\)/m, 'MULT18X18SIO'],
  feat_srl: [/^pack \(\d+ slices\)/m, 'SLICEM'],
  // shift registers read at a variable tap (#5): SRL16E / SRL16E_1 addressed by the switches
  feat_srl_var: [/^pack \(\d+ slices\)/m, 'SLICEM', [/^inst "[^"]+" "SLICEM",placed /m]],
  feat_dcm: [/^pack \(\d+ slices\)/m, 'DCM'],
  // STARTUP_WAIT (its bit and the COR register), CLKFX under 5 MHz, two of the clock outputs (stage F)
  feat_dcm_wait: [/^pack \(\d+ slices\)/m, 'DCM', [/STARTUP_WAIT::STARTUP_WAIT/, /CLKFX_DIVIDE::32 /]],
  // two DCMs, cascaded: the second on the bottom-left DCM, the one whose CLK2X180 reaches a global
  // buffer on switches of known bits; its CLKIN from the first one's CLK0 buffer (#47)
  feat_dcm2: [/^pack \(\d+ slices\)/m, 'DCM', [/^inst "u_dcma" "DCM",placed DCM_TL_CENTER_X13Y34 DCM_X0Y1 /m, /^inst "u_dcmb" "DCM",placed DCM_BL_CENTER_X13Y1 DCM_X0Y0 /m,
    /^inst "u_ba0" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y11 /m, /^inst "u_bb2x" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX_X1Y1 /m]],
  // CLKIN_DIVIDE_BY_2, SOURCE_SYNCHRONOUS deskew (DESKEW_ADJUST 0), a CLKFX at the edge of its range;
  // and (on the Nexys2-500) the input period in whole nanoseconds: 20.9 ns is 20 (#46)
  feat_dcm_div2: [/^pack \(\d+ slices\)/m, 'DCM', [/CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 /, /DESKEW_ADJUST::0 /, /CLKFX_DIVIDE::15 /]],
  feat_dcm_fx: [/^pack \(\d+ slices\)/m, 'DCM', [/X_CLKIN_PERIOD::20\.8999999999999986 /, /CLKFX_DIVIDE::30 /]],
  hard_prim: [/^pack \(\d+ slices\)/m, 'RAMB16'],
  // control pins tied to 1 / 0 as ISE ties them: block RAMs' EN / WE / SSR and multipliers' CE /
  // RST on VCC / GND, never inverted (MULT18X18S's CE / R on the three enables / resets); a DCM's
  // RST / PSCLK / PSINCDEC tied to 1 on VCC from its tile's VCC site (#190), DSSEN left open (#50)
  feat_const_bram: [/^pack \(\d+ slices\)/m, 'RAMB16', [/ENAINV::ENA /, /SSRBINV::SSRB /, /^net "[^"]+" vcc,[^;]*inpin "b4" ENA ,/m], [/(EN|WE|SSR)[AB]INV::\w+_B /]],
  feat_const_mult: [/^pack \(\d+ slices\)/m, 'MULT18X18SIO', [/CEAINV::CEA /, /RSTPINV::RSTP /, /^net "[^"]+" vcc,[^;]*inpin "m1" RSTB ,/m, /^net "[^"]+" gnd,[^;]*inpin "m1" CEA ,/m], [/(CE|RST)[ABP]INV::\w+_B /]],
  feat_const_dcm: [/^pack \(\d+ slices\)/m, 'DCM', [/RSTINV::RST /, /PSENINV::PSEN /, /PSINCDECINV::PSINCDEC /, /PSCLKINV::PSCLK /,
    /^net "[^"]+" vcc, \n {2}outpin "XDL_DUMMY_DCM_TL_CENTER_X13Y34_VCC_X14Y36" VCCOUT ,\n(?: {2}inpin "u_dcm" (?:PSCLK|PSINCDEC|RST) ,\n){3}/m, /^ {2}pip DCM_TL_CENTER_X13Y34 DCM_VCC_WIRE -> DCM_G1_B3 ,$/m,
    /^ {2}pip DCM_TL_CENTER_X13Y34 DCM_VCC_WIRE -> DCM_PSCLK ,$/m, /^net "[^"]+" gnd, \n {2}outpin "[^"]+" Y ,\n {2}inpin "u_dcm" PSEN ,$/m],
    [/inpin "u_dcm" DSSEN/, /(RST|PSEN|PSINCDEC|PSCLK)INV::\w+_B /]],
  // a manual clock (#347): the button's pad (BTN0, G12) through the general routing into a top BUFGMUX (its
  // CLKDUB input, as ISE routes it: CLOCK_DEDICATED_ROUTE = FALSE), the flip-flop on the global clock it drives
  feat_manual_clock: [/^pack \(\d+ slices\)/m, 'BUFGMUX', [/^inst "clk" "IBUF",placed RIBUFS_PCI_X27Y21 G12 /m, /^inst "[^"]+" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y1[01] /m,
    /pip CLKT_X13Y35 CLKT_CLKDUB\d -> CLKT_GCLK\d ,/, /^net "[^"]+" , \n {2}outpin "[^"]+" O ,\n {2}inpin "[^"]+" CLK ,$/m]],
  feat_starter: [/^pack \(\d+ slices\)/m, 'IOB', [/IOATTRBOX::LVTTL\b/, /DRIVEATTRBOX::8\b/, /DRIVEATTRBOX::4\b/, /SLEW::FAST\b/, /PULL::PULLUP\b/, /PULL::PULLDOWN\b/]],
};
for (const [name, [packLine, type, settings = [], absent = []]] of Object.entries(FEATURES)) {
  test(`the open flow: ${name} (${type}) to a complete bitstream, no warning`, { timeout: 300000 }, () => {
    const out = path.join(tmp, name);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), path.join(ROOT, 'test/fixtures/open-flow', name), out],
      { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, packLine);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
    const routed = fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8');
    assert.match(routed, new RegExp(`^inst "[^"]+" "${type}",placed `, 'm'));
    for (const re of settings) assert.match(routed, re);
    for (const re of absent) assert.doesNotMatch(routed, re);
  });
}

// #18: inputs that drive nothing get no pad, as ISE's map trims them (an XDL that has such a pad is
// written as ISE's bitgen writes it: test/fpga-bitgen.test.js). Checked against ISE: the .bit is
// byte-identical to ISE's bitgen of the same routed XDL, DRC 0 errors and 0 warnings.
test('the open flow: inputs that drive nothing (the clock, the buttons) get no pad; complete bitstream, no warning', { timeout: 300000 }, () => {
  const out = path.join(tmp, 'feat_unused_in');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), path.join(ROOT, 'test/fixtures/open-flow/feat_unused_in'), out],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  const pads = [...fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8').matchAll(/^inst "([^"]+)" "(?:IBUF|IOB)",placed/gm)].map(m => m[1]).sort();
  assert.deepEqual(pads, [...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `led<${i}>`), ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `sw<${i}>`)].sort());
});

test('the open flow fails clearly for what the bit database does not have: a DCM output with no known path to a global buffer', { timeout: 300000 }, () => {
  // (CLK2X180 of either DCM of the XC3S100E: no measured path; on the XC3S250E the bottom-left DCM's
  // reaches one, #47: feat_dcm2)
  const dir = path.join(tmp, 'dcm2x180');
  fs.mkdirSync(dir, { recursive: true });
  const src = fs.readFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_dcm/top.vhd'), 'utf8').replace('CLK2X180 => open', 'CLK2X180 => clk2x_u').replace('CLK2X => clk2x_u', 'CLK2X => open');
  fs.writeFileSync(path.join(dir, 'top.vhd'), src);
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: 'dcm2x180', version: 1, device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' }, top: 'top',
    // the constraints by an absolute path (on Windows a relative one across drives is absolute too: it was
    // joined onto the project folder, CI b898d8e)
    files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], constraints: path.join(ROOT, 'test/fixtures/open-flow/basys2.ucf') }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'research/s3e-route/open-flow.mjs'), dir, path.join(dir, 'out')], { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /u_b2x: no free global clock buffer reachable from u_dcm\.CLK2X180 through switches of known bits/);
});

// blinky on the other boards (stage F of research/s3e-bitstream): the Basys2-100 with the Basys2's
// pins, the Nexys2-500 / -1200 with the Nexys2's (LD4-LD7 differ by die)
const NEXYS2 = led => [['clk', 'B8'], ['sw<0>', 'G18'], ['sw<1>', 'H18'], ['sw<2>', 'K18'], ['sw<3>', 'K17'], ['btn<0>', 'B18'], ['btn<1>', 'D18'],
  ...led.map((p, i) => [`led<${i}>`, p])].map(([n, p]) => `NET "${n}" LOC = "${p}" | IOSTANDARD = LVCMOS33 ;`).join('\n') + '\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n';
const BOARDS = [
  ['Basys2-100', 'xc3s100e', 'cp132', null, 72738],
  ['Nexys2-500', 'xc3s500e', 'fg320', NEXYS2(['J14', 'J15', 'K15', 'K14', 'E17', 'P15', 'F4', 'R4']), 283846],
  ['Nexys2-1200', 'xc3s1200e', 'fg320', NEXYS2(['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4']), 480219],
];
for (const [board, part, pkg, ucf, size] of BOARDS) {
  test(`the open flow for the ${board} (${part.toUpperCase()}-${pkg.toUpperCase()}): blinky to a complete bitstream, the exact warnings`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `proj-${board}`);
    fs.cpSync(path.join(ROOT, 'examples/blinky'), dir, { recursive: true });
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
    Object.assign(pj.device, { part, package: pkg });
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(pj, null, 2));
    if (ucf) fs.writeFileSync(path.join(dir, pj.constraints), ucf);
    const out = path.join(tmp, `out-${board}`);
    const r = openFlow(dir, out);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
    assert.deepEqual(r.warnings, BLINKY_WARNINGS);
    const bit = fs.readFileSync(path.join(out, 'top.bit'));
    assert.equal(bit.length, size, 'the .bit of the device');
    assert.ok(bit.includes(Buffer.from(`${part.slice(2)}${pkg}\0`)), 'the part in the header');
  });
}

// A clock with no LOC (no UCF at all): the placer puts it on a GCLK pin, a pad whose dedicated path
// of known bits reaches a global buffer (B8 -> BUFGMUX_X2Y11, the buffer whose lines reach every
// slice, block RAM and multiplier on known switches), and every net routes on known switches (#49:
// feat_constmult's clock on another pad could not reach its block RAM's CLKA / CLKB). No warning.
const NO_UCF_WARNINGS = [];
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow with no constraints on the ${part.toUpperCase()}-${pkg.toUpperCase()}: the clock on a GCLK pin, every net routed (#49)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `noucf-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_constmult/top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `noucf-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.doesNotMatch(r.stdout, /cannot be routed/);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.deepEqual(r.warnings, NO_UCF_WARNINGS);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => [...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => `${m[1]} ${m[2]}`);
    assert.deepEqual(placedOf('IBUF').filter(s => s.startsWith('clk ')), ['clk B8']);
    assert.deepEqual(placedOf('BUFGMUX').map(s => s.split(' ')[1]), ['BUFGMUX_X2Y11']);
    for (const type of ['RAMB16', 'MULT18X18SIO']) assert.ok(placedOf(type).length > 0, type);
  });
}

// The clocks of #56, #57, #58 through the whole open flow (checked against ISE: npm run
// check:open-flow on the same projects gives DRC 0 errors / 0 warnings and a byte-identical .bit):
// feat_constmult's clock LOC'd on the bottom GCLK pin (its buffer's lines reach no block RAM /
// multiplier clock on known switches: BUFGMUX_X2Y11 through general routing, a warning), feat_dcm
// with no constraints (the clock on B8, the pad whose dedicated path reaches the DCM's CLKIN), and
// feat_constmult's clock LOC'd on a side GCLK pin (its buffers' settings are not known yet, #45: a
// warning).
const CLOCK_CASES = [
  ['#56', 'feat_constmult', 'xc3s250e', 'cp132', 'M4', { clk: 'M4', bufg: 'BUFGMUX_X2Y11' },
    ['Warning: place: clk: the global buffer BUFGMUX_X2Y1 that its pad M4 reaches on a dedicated path does not reach every clock pin of its loads on switches of known bits: BUFGMUX_X2Y11 instead, through general routing']],
  ['#57', 'feat_dcm', 'xc3s500e', 'fg320', null, { clk: 'B8', dcm: 'DCM_X0Y1' }, []],
  // the XC3S1200E's top-left DCM is DCM_X1Y3 (its DCM_X0Y1 is a side DCM); on the XC3S100E the
  // bottom DCM (CLKDV of the top one reaches no global buffer on known switches), its CLKIN through
  // general routing (no pad reaches a DCM's CLKIN on known switches), said (#47)
  ['#47', 'feat_dcm', 'xc3s1200e', 'fg320', null, { clk: 'B8', dcm: 'DCM_X1Y3' }, []],
  ['#47', 'feat_dcm', 'xc3s100e', 'cp132', null, { dcm: 'DCM_X0Y0' },
    clk => [`Warning: place: u_dcm: its CLKIN comes from the pad ${clk} through general routing: no pad reaches the CLKIN of DCM_X0Y0 on a dedicated path of known bits`]],
  ['#58', 'feat_constmult', 'xc3s500e', 'fg320', 'K3', { clk: 'K3', bufg: 'BUFGMUX_X2Y11' },
    ['Warning: place: clk: its pad K3 reaches on a dedicated path only side global buffers, which the placer does not use yet (#95) (BUFGMUX_X0Y6, BUFGMUX_X0Y8, BUFGMUX_X0Y7): BUFGMUX_X2Y11 instead, through general routing']],
];
for (const [issue, fixture, part, pkg, loc, want, warnings] of CLOCK_CASES) {
  test(`the open flow: ${fixture} on the ${part.toUpperCase()}-${pkg.toUpperCase()}, the clock ${loc ? `LOC'd on ${loc}` : 'with no LOC'}: complete bitstream, the exact warnings (${issue})`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `clock-${issue.slice(1)}-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow', fixture, 'top.vhd'), path.join(dir, 'top.vhd'));
    if (loc) fs.writeFileSync(path.join(dir, 'top.ucf'), `NET "clk" LOC = "${loc}";\n`);
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `clock-${issue.slice(1)}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], ...(loc && { constraints: 'top.ucf' }) }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => [...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => [m[1], m[2]]);
    const clk = placedOf('IBUF').find(([n]) => n === 'clk')?.[1];
    assert.deepEqual(r.warnings, typeof warnings === 'function' ? warnings(clk) : warnings);
    if (want.clk) assert.equal(clk, want.clk);
    if (want.bufg) assert.deepEqual(placedOf('BUFGMUX').map(([, s]) => s), [want.bufg]);
    if (want.dcm) assert.deepEqual(placedOf('DCM').map(([, s]) => s), [want.dcm]);
  });
}

// Two DCMs on the other devices (#47; checked against ISE: npm run check:open-flow gives DRC 0 errors /
// 0 warnings and a byte-identical .bit): feat_dcm2 with no constraints. The XC3S500E and XC3S1200E:
// the clock on B8, the first DCM on the top-left site, the second on the bottom-left one (CLK2X180);
// the XC3S100E (whose DCMs reach no global buffer from CLK2X180: CLK2X in its place): the first DCM
// on the top one, the second on the bottom one, the clock's CLKIN through general routing, said.
const DCM2 = [
  ['xc3s100e', 'cp132', ['DCM_X0Y1', 'DCM_X0Y0'], clk => [`Warning: place: u_dcma: its CLKIN comes from the pad ${clk} through general routing: no pad reaches the CLKIN of DCM_X0Y1 on a dedicated path of known bits`]],
  ['xc3s500e', 'fg320', ['DCM_X0Y1', 'DCM_X0Y0'], () => []],
  ['xc3s1200e', 'fg320', ['DCM_X1Y3', 'DCM_X1Y0'], () => []],
];
for (const [part, pkg, dcms, warnings] of DCM2) {
  test(`the open flow: two DCMs (feat_dcm2) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: complete bitstream, the exact warnings (#47)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `dcm2-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    let src = fs.readFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_dcm2/top.vhd'), 'utf8');
    if (part === 'xc3s100e') src = src.replace('CLK2X => open, CLK2X180 => b2x_u', 'CLK2X => b2x_u, CLK2X180 => open');
    fs.writeFileSync(path.join(dir, 'top.vhd'), src);
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `dcm2-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => Object.fromEntries([...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => [m[1], m[2]]));
    assert.deepEqual(r.warnings, warnings(placedOf('IBUF').clk));
    assert.deepEqual([placedOf('DCM').u_dcma, placedOf('DCM').u_dcmb], dcms);
    if (part !== 'xc3s100e') assert.equal(placedOf('IBUF').clk, 'B8');
  });
}
