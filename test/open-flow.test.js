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
// the switches into the DCMs' CLKIN / CLKFB of the nets that global buffers drive: from the global
// clock lines (GCLKn), never through general routing (#93; before: the cascade's second DCM and a
// feedback through CLKT_TO_OMUX and hex / double lines)
const dcmClockPips = routed => {
  const out = [];
  // (the global buffers by name, read as a list: no regular expression built from a name)
  const bufgs = new Set([...routed.matchAll(/^inst "([^"]+)" "BUFGMUX"/gm)].map(m => m[1]));
  for (const net of routed.split(/^net /m).slice(1)) {
    const src = /^ {2}outpin "([^"]+)" (\S+) ,/m.exec(net);
    if (!src || src[2] !== 'O' || !bufgs.has(src[1])) continue;
    for (const m of net.matchAll(/^ {2}pip (DCM_\S+) (\S+) -> DCM_(CLKIN|CLKFB) ,$/gm)) out.push(`${m[1]} ${m[2]} -> ${m[3]}`);
  }
  return out;
};
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
  let luts = 0, swapped = 0, cyLuts = 0, cySwapped = 0;
  for (const ia of placed.insts.filter(i => /^SLICE/.test(i.type))) {
    for (const L of ['F', 'G']) {
      const ea = ia.cfg.find(c => c.attr === L && /^#LUT:/.test(c.value));
      if (!ea) continue;
      const eb = byName.get(ia.name).cfg.find(c => c.attr === L);
      const na = [1, 2, 3, 4].map(k => pa.get(`${ia.name}.${L}${k}`)), nb = [1, 2, 3, 4].map(k => pb.get(`${ia.name}.${L}${k}`));
      luts++;
      if (na.join() !== nb.join()) swapped++;
      // the carry's data input on pin 1 or 2: the same net before and after (#25: its pin may change)
      const cyA = ia.cfg.find(c => c.attr === `CY0${L}`)?.value, cyB = byName.get(ia.name).cfg.find(c => c.attr === `CY0${L}`)?.value;
      if (/^[FG][12]$/.test(cyA || '')) { assert.equal(pb.get(`${ia.name}.${cyB}`), pa.get(`${ia.name}.${cyA}`), `${ia.name} CY0${L}`); cyLuts++; if (cyA !== cyB) cySwapped++; }
      const nets = [...new Set(na.filter(Boolean))];
      assert.deepEqual([...new Set(nb.filter(Boolean))].sort(), [...nets].sort(), `${ia.name} ${L}: the same nets`);
      for (let v = 0; v < 1 << nets.length; v++) {
        const env = ns => Object.fromEntries(ns.map((n, k) => [`A${k + 1}`, n ? (v >> nets.indexOf(n)) & 1 : 1]));
        assert.equal(evalLut(eb.value.slice(5), env(nb)), evalLut(ea.value.slice(5), env(na)), `${ia.name} ${L}: ${ea.value} / ${eb.value}`);
      }
    }
  }
  assert.ok(luts > 50 && swapped > 10, `${swapped} of ${luts} LUTs with their inputs swapped`);
  assert.ok(cyLuts >= 2 && cySwapped >= 1, `${cySwapped} of ${cyLuts} carry data inputs moved`);
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
  const kept = +/clock \S+: minimum period ([\d.]+) ns/.exec(fs.readFileSync(path.join(out, 'timing.txt'), 'utf8'))[1];
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
  const kept = +/clock \S+: minimum period ([\d.]+) ns/.exec(fs.readFileSync(path.join(dir, 'out', 'timing.txt'), 'utf8'))[1];
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
  // SRLC16E chained through Q15 (#2): four on the two SLICEMs of a CLB, the upper one's SHIFTOUT into the lower one's
  // SHIFTIN on the CLB's switch, as ISE packs and routes them
  feat_srl_chain: [/^pack \(\d+ slices\)/m, 'SLICEM', [/^net "ca<1>" , \n {2}outpin "la\[1\]_u" SHIFTOUT ,\n {2}inpin "la\[3\]_u" SHIFTIN ,\n {2}pip CLB_X\d+Y\d+ SHIFTOUT2 -> SHIFTIN0 ,$/m,
    /^net "cb<1>" , \n {2}outpin "lb\[1\]_u" SHIFTOUT ,\n {2}inpin "lb\[2\]_u" SHIFTIN ,\n {2}pip CLB_X\d+Y\d+ SHIFTOUT2 -> SHIFTIN0 ,$/m, /DIG_MUX::SHIFTIN /, /SHIFTOUTUSED::0 /]],
  feat_dcm: [/^pack \(\d+ slices\)/m, 'DCM'],
  // STARTUP_WAIT (its bit and the COR register), CLKFX under 5 MHz, two of the clock outputs (stage F)
  feat_dcm_wait: [/^pack \(\d+ slices\)/m, 'DCM', [/STARTUP_WAIT::STARTUP_WAIT/, /CLKFX_DIVIDE::32 /]],
  // two DCMs, cascaded: the second on the bottom-left DCM, the one whose CLK2X180 reaches a global
  // buffer on switches of known bits; its CLKIN from the first one's CLK0 buffer (#47)
  feat_dcm2: [/^pack \(\d+ slices\)/m, 'DCM', [/^inst "u_dcma" "DCM",placed DCM_TL_CENTER_X13Y34 DCM_X0Y1 /m, /^inst "u_dcmb" "DCM",placed DCM_BL_CENTER_X13Y1 DCM_X0Y0 /m,
    /^inst "u_ba0" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y11 /m, /^inst "u_bb2x" "BUFGMUX",placed CLKB_X13Y0 BUFGMUX_X1Y1 /m,
    // (B's CLKIN from A's CLK0 buffer on the global line, not through general routing, #93)
    /^ {2}pip DCM_BL_CENTER_X13Y1 GCLK\d -> DCM_CLKIN ,$/m], [/_TO_OMUX/]],
  // the clock pad (B8, LOC'd) into a global buffer that feeds the DCM's CLKIN: B8's buffer, whose line
  // reaches the top-left DCM's CLKIN, kept for it, the DCM's outputs on the others (#94)
  feat_dcm_bufgin: [/^pack \(\d+ slices\)/m, 'DCM', [/^inst "u_dcm" "DCM",placed DCM_TL_CENTER_X13Y34 DCM_X0Y1 /m, /^inst "u_bin" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y11 /m]],
  // twelve global clocks (#95): five of them on side buffers (left, lines 0-4), the top / bottom buffers
  // of lines 0-4 kept out of the left half (none of their GCLKCORE switches in the left centre tile)
  feat_clocks12: [/^pack \(\d+ slices\)/m, 'BUFGMUX', [/^inst "[^"]+" "BUFGMUX",placed CLKL_X0Y17 BUFGMUX_X0Y6 /m, /pip GCLKVML_\S+ GCLKVML_GCLKLR4 -> GCLKVMLR_GCLK_/],
    [/pip GCLKVML_\S+ GCLKVML_GCLKCORE[0-4] -> /, /placed CLKR_/]],
  // CLKIN_DIVIDE_BY_2, SOURCE_SYNCHRONOUS deskew (DESKEW_ADJUST 0), a CLKFX at the edge of its range (as trce
  // checks it, #661); and (on the Nexys2-500) the input period in whole nanoseconds: 20.9 ns is 20 (#46)
  feat_dcm_div2: [/^pack \(\d+ slices\)/m, 'DCM', [/CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 /, /DESKEW_ADJUST::0 /, /CLKFX_DIVIDE::5 /, /CLKFX_MULTIPLY::2 /]],
  feat_dcm_fx: [/^pack \(\d+ slices\)/m, 'DCM', [/X_CLKIN_PERIOD::20\.8999999999999986 /, /CLKFX_DIVIDE::30 /]],
  // paths between a DCM's clocks and the pads of its clocks, as trce times them (#601): CLK0, CLK2X, CLKFX, CLKDV each on
  // a global buffer; a fixed phase shift on CLK0, CLK90 and CLK180
  feat_dcm_cross: [/^pack \(\d+ slices\)/m, 'DCM', [/^net "clk2x_u" , \n {2}outpin "u_dcm" CLK2X ,/m, /^net "clkdv_u" , \n {2}outpin "u_dcm" CLKDV ,/m, /^net "clkfx_u" , \n {2}outpin "u_dcm" CLKFX ,/m]],
  feat_dcm_phase: [/^pack \(\d+ slices\)/m, 'DCM', [/CLKOUT_PHASE_SHIFT::FIXED /, /PHASE_SHIFT::32 /, /^net "clk90_u" , \n {2}outpin "u_dcm" CLK90 ,/m, /^net "clk180_u" , \n {2}outpin "u_dcm" CLK180 ,/m]],
  // two DCMs, each CLKIN on the dedicated path from a clock pad of its own (#92): B8 to the top-left DCM, the clock
  // socket (U9) through the bottom clock tile to the bottom-left one
  feat_dcm_pads: [/^pack \(\d+ slices\)/m, 'DCM', [/^inst "u_dcma" "DCM",placed DCM_TL_CENTER_X23Y60 DCM_X1Y3 /m, /^inst "u_dcmb" "DCM",placed DCM_BL_CENTER_X23Y1 DCM_X1Y0 /m,
    /^ {2}pip CLKB_LL_X23Y0 CLKB_CKI6 -> CLKB_DLL_CLKPAD5 ,$/m, /^ {2}pip DCM_BL_CENTER_X23Y1 DCM_DLL_CLKPAD1 -> DCM_CLKIN ,$/m]],
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
  // registers in the IOBs on request (#96, IOB = TRUE): an input register with a clock enable and a reset, an output
  // register, a tristate output's value and enable registers, on pads where the bit database measured those kinds
  feat_iobreg: [/^pack \(1 slices\)/m, 'IOB', [/^inst "sw<0>" "IBUF",placed \S+ P11 +,\n {2}cfg "[^"]* IFF1:[^"]* ICEINV::ICE [^"]*IFD_DELAY_VALUE::DLY3 /m,
    /^inst "led<0>" "IOB",placed \S+ M5 +,\n {2}cfg "[^"]* OMUX::OFF1 [^"]* OFF1:/m, /^inst "led<1>" "IOB",placed \S+ P6 +,\n {2}cfg "[^"]* OMUX::OFF1 [^"]* TMUX::TFF1 [^"]* TFF1:/m]],
  // plain registers in the IOBs (no enable, no set / reset), a tristate output's enable from the fabric and from an IOB
  // register (#96: measured on every pad in its second round); on pads of the four sides, every register's clock from
  // the global lines (#671: B4's, on the top, came through general routing, W2END4 -> IOIS_CLK0), the left and right
  // pads' through the I/O columns' clock rows
  feat_iob_plain: [/^pack \(\d+ slices\)/m, 'IOB', [/^inst "sw<0>" "IBUF",placed \S+ P11 +,\n {2}cfg "[^"]* IFF1:/m, /^inst "led<4>" "IOB",placed \S+ N5 +,\n {2}cfg "[^"]* TMUX::T1 /m,
    /^inst "led<5>" "IOB",placed \S+ N4 +,\n {2}cfg "[^"]* TMUX::TFF1 [^"]* O1_DDRMUX::1 /m, /^inst "sw<3>" "IBUF",placed TIOIS_X3Y35 B4 +,\n {2}cfg "[^"]* IFF1:/m,
    /^inst "btn<0>" "IBUF",placed RIBUFS_PCI_X27Y21 G12 +,\n {2}cfg "[^"]* IFF1:/m, /^inst "an<0>" "IOB",placed RIOIS_X27Y24 F12 +,\n {2}cfg "[^"]* OFF1:/m,
    /^ {2}pip TIOIS_X3Y35 GCLK\d -> IOIS_CLK0 ,$/m, /^ {2}pip GCLKH_PCI_CE_S_X0Y5 GCLKH_GCLK\d -> GCLKH_GCLK_DN\d ,$/m, /^ {2}pip GCLKH_PCI_CE_N_X27Y21 GCLKH_GCLK\d -> GCLKH_GCLK_UP\d ,$/m],
    [/^ {2}pip \S+ (?:[EWNS][26]\w+|L[HV]\d+|OMUX\w*) -> IOIS_CLK\d ,$/m]],
  // eight global clocks (the eight top and bottom buffers: lines 0-7), each clocking IOB registers of left and right pads
  // (#671: the side I/O tiles' clock pins were measured from line 4 only)
  feat_iob_lines: [/^pack \(\d+ slices\)/m, 'IOB', [...[0, 1, 2, 3, 4, 5, 6, 7].map(k => new RegExp(`^ {2}pip [LR]I(?:OIS|BUFS)\\w*_X\\d+Y\\d+ GCLK${k} -> IOIS_CLK\\d ,$`, 'm')),
    /^inst "btn<0>" "IBUF",placed RIBUFS_PCI_X27Y21 G12 +,\n {2}cfg "[^"]* IFF1:/m, /^inst "led<7>" "IOB",placed LIOIS_PCI_X0Y19 G1 +,\n {2}cfg "[^"]* OFF1:/m],
    [/^ {2}pip \S+ (?:[EWNS][26]\w+|L[HV]\d+|OMUX\w*) -> IOIS_CLK\d ,$/m]],
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

// IOB registers of every kind on every pad (#96, its second round; before, a kind was measured on a quarter of the pads
// only): feat_iobreg's tristate output on M11 (LED1), an output-enable register with a clock enable and a reset, which
// the bitstream writer refused there before (R:TCEINV:TCE…), now complete
test('the open flow: an IOB register of every kind on every pad: feat_iobreg\'s tristate on M11, refused before #96\'s second round, complete', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'iobreg-m11');
  fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iobreg'), dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'top.ucf'), fs.readFileSync(path.join(dir, 'top.ucf'), 'utf8').replace('LOC = "P6"', 'LOC = "M11"'));
  const r = openFlow(dir, path.join(dir, 'out'));
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.match(fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8'), /^inst "led<1>" "IOB",placed \S+ M11 +,\n {2}cfg "[^"]* TMUX::TFF1 [^"]* TCEINV::TCE /m);
  assert.deepEqual(r.warnings, []);
});

// IOB registers on ports with no LOC (#96): the placer keeps them on pads where the bit database measured their kinds,
// on every device (the tristate output's registers are measured on about half the pads)
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow: IOB registers with no LOC on the ${part.toUpperCase()}-${pkg.toUpperCase()}: on pads where they are measured, complete bitstream (#96)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `iobreg-${part}`);
    fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iobreg'), dir, { recursive: true });
    const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
    Object.assign(pj.device, { part, package: pkg });
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify(pj));
    fs.writeFileSync(path.join(dir, 'top.ucf'), 'NET "sw<0>" IOB = TRUE ;\nNET "led<*>" IOB = TRUE ;\n');
    for (const seed of ['1', '2']) {
      const r = openFlow(dir, path.join(dir, `out${seed}`), ['--seed', seed]);
      assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
      assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
      assert.deepEqual(r.warnings, []);
      const routed = fs.readFileSync(path.join(dir, `out${seed}`, 'routed.xdl'), 'utf8');
      for (const re of [/^inst "sw<0>" "IBUF",placed [^\n]*\n {2}cfg "[^"]* IFF1:/m, /^inst "led<0>" "IOB",placed [^\n]*\n {2}cfg "[^"]* OFF1:/m, /^inst "led<1>" "IOB",placed [^\n]*\n {2}cfg "[^"]* TFF1:/m]) assert.match(routed, re);
    }
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
// with no constraints (the clock on the pad ISE gives the DCM's CLKIN, on its dedicated path, #92), and
// feat_constmult's clock LOC'd on a side GCLK pin (its pad's path into the side buffers is not known
// yet, #641: a top buffer through general routing, a warning).
const CLOCK_CASES = [
  ['#56', 'feat_constmult', 'xc3s250e', 'cp132', 'M4', { clk: 'M4', bufg: 'BUFGMUX_X2Y11' },
    ['Warning: place: clk: the global buffer BUFGMUX_X2Y1 that its pad M4 reaches on a dedicated path does not reach every clock pin of its loads on switches of known bits: BUFGMUX_X2Y11 instead, through general routing']],
  ['#57', 'feat_dcm', 'xc3s500e', 'fg320', null, { clk: 'B9', dcm: 'DCM_X0Y1' }, []],
  // the XC3S1200E's top-left DCM is DCM_X1Y3 (its DCM_X0Y1 is a side DCM); on the XC3S100E the
  // bottom DCM (CLKDV of the top one reaches no global buffer on known switches), its CLKIN on its
  // dedicated path from M6 (#47, #92)
  ['#47', 'feat_dcm', 'xc3s1200e', 'fg320', null, { clk: 'B9', dcm: 'DCM_X1Y3' }, []],
  ['#47', 'feat_dcm', 'xc3s100e', 'cp132', null, { clk: 'M6', dcm: 'DCM_X0Y0' }, []],
  // (#95 / #641: not the side buffers K3 reaches, whose path from the pad has database bits ISE does
  // not set: BUFGMUX_X2Y11 through general routing, a warning)
  ['#58', 'feat_constmult', 'xc3s500e', 'fg320', 'K3', { clk: 'K3', bufg: 'BUFGMUX_X2Y11' },
    ['Warning: place: clk: its pad K3 reaches on a dedicated path only side global buffers (BUFGMUX_X0Y6, BUFGMUX_X0Y8, BUFGMUX_X0Y7), whose path from the pad is not in the bit database yet (#641): BUFGMUX_X2Y11 instead, through general routing']],
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
// the first DCM on the top-left site, the second on the bottom-left one (CLK2X180); the XC3S100E (whose
// DCMs reach no global buffer from CLK2X180: CLK2X in its place): the first DCM on the top one, the
// second on the bottom one. The clock on the pad ISE gives the first DCM's CLKIN, its dedicated path (#92).
const DCM2 = [
  ['xc3s100e', 'cp132', ['DCM_X0Y1', 'DCM_X0Y0'], 'A9'],
  ['xc3s500e', 'fg320', ['DCM_X0Y1', 'DCM_X0Y0'], 'B9'],
  ['xc3s1200e', 'fg320', ['DCM_X1Y3', 'DCM_X1Y0'], 'B9'],
];
for (const [part, pkg, dcms, clk] of DCM2) {
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
    assert.deepEqual(r.warnings, []);
    assert.deepEqual([placedOf('DCM').u_dcma, placedOf('DCM').u_dcmb, placedOf('IBUF').clk], [...dcms, clk]);
    // B's CLKIN and both feedbacks on the global lines (#93)
    const pips = dcmClockPips(routed);
    assert.equal(pips.length, 3, pips.join('; '));
    for (const p of pips) assert.match(p, / GCLK\d -> CLK(IN|FB)$/);
    assert.doesNotMatch(routed, /_TO_OMUX/);
  });
}

// Twelve global clocks on every device (#95; checked against ISE: npm run check:open-flow gives DRC 0
// errors / 0 warnings and a byte-identical .bit): feat_clocks12 with no constraints: the eight top /
// bottom buffers and five side buffers of the left (lines 0-4); in the left centre tile lines 0-4 come
// from the side buffers only (before: no free global clock buffer past the eighth).
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
  test(`the open flow: twelve global clocks (feat_clocks12) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: the side buffers, each line from one buffer per half, no warning (#95)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `clocks12-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_clocks12/top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `clocks12-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.deepEqual(r.warnings, []);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const bufs = [...routed.matchAll(/^inst "[^"]+" "BUFGMUX",placed \S+ (\S+) /gm)].map(m => m[1]).sort();
    assert.deepEqual(bufs, ['BUFGMUX_X0Y2', 'BUFGMUX_X0Y3', 'BUFGMUX_X0Y4', 'BUFGMUX_X0Y5', 'BUFGMUX_X0Y6', 'BUFGMUX_X1Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y0', 'BUFGMUX_X2Y1', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']);
    // each quadrant line of each half driven from one buffer: the side one or the top / bottom one
    const drivers = new Map();
    for (const m of routed.matchAll(/pip (GCLKVM[LR])_\S+ GCLKVM[LR]_GCLK(CORE|LR)(\d) -> GCLKVMLR_GCLK_(UP|DN)\d /g)) {
      const k = `${m[1]} ${m[4]}${m[3]}`;
      drivers.set(k, new Set([...(drivers.get(k) || []), m[2]]));
    }
    for (const [k, d] of drivers) assert.equal(d.size, 1, k);
    for (const k of [0, 1, 2, 3, 4]) assert.ok(drivers.has(`GCLKVML DN${k}`) || drivers.has(`GCLKVML UP${k}`), `left line ${k}`);
    assert.ok(![...drivers].some(([k, d]) => /^GCLKVML .[NP][0-4]$/.test(k) && d.has('CORE')));
  });
}

// A clock pad driving a global buffer that feeds a DCM's CLKIN (#94; checked against ISE: npm run
// check:open-flow gives DRC 0 errors / 0 warnings and a byte-identical .bit): feat_dcm_bufgin with no
// constraints. The DCM's site and the buffer are chosen together: the clock on the GCLK pin whose
// buffer's line reaches the DCM's CLKIN (B8 -> BUFGMUX_X2Y11; on the XC3S100E C8 -> BUFGMUX_X2Y10),
// the DCM's outputs on the other buffers, no warning (before: the DCM's outputs took the buffers
// first, and the pad's buffer, not reaching the CLKIN, was said and reached through general routing).
const DCM_BUFGIN = [
  ['xc3s100e', 'cp132', { clk: 'C8', u_bin: 'BUFGMUX_X2Y10', dcm: 'DCM_X0Y1' }],
  ['xc3s250e', 'cp132', { clk: 'B8', u_bin: 'BUFGMUX_X2Y11', dcm: 'DCM_X0Y1' }],
  ['xc3s500e', 'fg320', { clk: 'B8', u_bin: 'BUFGMUX_X2Y11', dcm: 'DCM_X0Y1' }],
  ['xc3s1200e', 'fg320', { clk: 'B8', u_bin: 'BUFGMUX_X2Y11', dcm: 'DCM_X1Y3' }],
];
for (const [part, pkg, want] of DCM_BUFGIN) {
  test(`the open flow: a pad's global buffer into a DCM's CLKIN (feat_dcm_bufgin) on the ${part.toUpperCase()}-${pkg.toUpperCase()}: the DCM and the buffer together, no warning (#94)`, { timeout: 300000 }, () => {
    const dir = path.join(tmp, `dcm-bufgin-${part}`);
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_dcm_bufgin/top.vhd'), path.join(dir, 'top.vhd'));
    fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: `dcm-bufgin-${part}`, version: 1, device: { family: 'spartan3e', part, package: pkg, speed: '-4' }, top: 'top',
      files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }] }));
    const r = openFlow(dir, path.join(dir, 'out'));
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
    assert.deepEqual(r.warnings, []);
    const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
    const placedOf = type => Object.fromEntries([...routed.matchAll(new RegExp(`^inst "([^"]+)" "${type}",placed \\S+ (\\S+) `, 'gm'))].map(m => [m[1], m[2]]));
    assert.deepEqual([placedOf('IBUF').clk, placedOf('BUFGMUX').u_bin, placedOf('DCM').u_dcm], [want.clk, want.u_bin, want.dcm]);
    // the CLKIN and the feedback on the global lines (#93)
    const pips = dcmClockPips(routed);
    assert.equal(pips.length, 2, pips.join('; '));
    for (const p of pips) assert.match(p, / GCLK\d -> CLK(IN|FB)$/);
    assert.doesNotMatch(routed, /_TO_OMUX/);
  });
}
