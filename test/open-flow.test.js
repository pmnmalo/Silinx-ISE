// The device description shipped with Silinx (packages/silinx-fpga/devices/) and the whole open flow on it:
// blinky (examples/blinky, Basys2-250) synthesized, placed and routed by nextpnr (#2756) and written as a .bit
// with no Xilinx tool (packages/silinx-fpga/research/s3e-route/open-flow.mjs). That the .bit equals ISE's needs ISE:
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
const { findDeviceGraph, shippedDevicePath, deviceCachePath, loadDeviceCache } = await import('../packages/silinx-fpga/src/fpga/device-node.js');
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
  const { deviceSites } = await import('../packages/silinx-fpga/src/fpga/device-sites.js');
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
// the net a pad's input drives (its IBUF's I), and the switches of general routing in it: nextpnr chooses the clock pads
// and the global buffers and DCMs of the designs that LOC none of them; what ISE requires is their dedicated paths (#2756)
const padNet = (routed, pad) => routed.split(/^net /m).slice(1).find(n => n.includes(`\n  outpin "${pad}" I ,\n`)) ?? '';
const GENERAL = /^ {2}pip \S+ (?:[EWNS][26](?:BEG|MID|END)\d|L[HV]\d+|OMUX\w*|\w*CLKDUB\d) ->/m;
const openFlow = (dir, out, args = []) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, out, ...args],
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
  // --quality (#352): the circuit's size and speed as the design corpus records them, nextpnr's design summary's and the STA's
  const q = JSON.parse(fs.readFileSync(path.join(out, 'quality.json'), 'utf8'));
  assert.deepEqual(Object.keys(q), ['part', 'slices', 'luts', 'ffs', 'period']);
  assert.equal(q.part, 'xc3s250ecp132-4');
  assert.equal(q.slices, +/^place and route \(nextpnr: (\d+) slices, \d+ PIPs\)/m.exec(r.stdout)[1]);
  assert.ok(q.luts > 0 && q.ffs > 0 && q.luts <= 2 * q.slices && q.ffs <= 2 * q.slices, JSON.stringify(q));
  assert.equal(q.period.toFixed(3), /timing: clock \S+: minimum period ([\d.]+) ns/.exec(r.stdout)[1]);
  // no warnings (front end, synthesis, nextpnr: each printed as "  Warning: …" / "  WARNING: …")
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
  assert.deepEqual(r.warnings, BLINKY_WARNINGS);
  const bit = fs.readFileSync(path.join(out, 'top.bit'));
  assert.ok(bit.length > 160000);
  assert.ok(bit.includes(Buffer.from([0xaa, 0x99, 0x55, 0x66])), 'the sync word');
  for (const f of ['top.json', 'routed.xdl', 'timing.txt']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.ok(!fs.existsSync(path.join(out, 'placed.xdl')), 'nextpnr places and routes in one step: no placed design (#2756)');
});

// #2756: the options of Silinx's own placer and router went with it, nextpnr placing and routing: refused, by name
test('the open flow refuses the options of Silinx\'s own placer and router (#2756)', () => {
  const r = openFlow(path.join(ROOT, 'examples/blinky'), path.join(tmp, 'gone'), ['--tries', '2', '--no-replicate']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), 'open-flow.mjs: --tries, --no-replicate: an option of Silinx\'s own placer and router, which nextpnr replaced (#2137)');
  assert.ok(!fs.existsSync(path.join(tmp, 'gone')));
});

// #2502: --chipdb dir, nextpnr's chip database from dir (one built from other device descriptions, the measured ones): the
// package's own database given so routes blinky as the package's does; a folder without the die's database refused, named
test('the open flow with --chipdb: the given chip database, the same route as the package\'s; a missing one said (#2502)', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'chipdb');
  fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e/chipdb/chipdb-xc3s250e.bin.gz');
  fs.writeFileSync(path.join(dir, 'chipdb-xc3s250e.bin'), zlib.gunzipSync(fs.readFileSync(pkg)));
  const out = path.join(tmp, 'blinky-chipdb');
  const r = openFlow(path.join(ROOT, 'examples/blinky'), out, ['--chipdb', dir]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.deepEqual(r.warnings, BLINKY_WARNINGS);
  assert.equal(fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8'), fs.readFileSync(path.join(tmp, 'blinky', 'routed.xdl'), 'utf8'));
  const none = path.join(tmp, 'no-chipdb');
  fs.mkdirSync(none, { recursive: true });
  const m = openFlow(path.join(ROOT, 'examples/blinky'), path.join(tmp, 'blinky-none'), ['--chipdb', none]);
  assert.equal(m.status, 1);
  assert.match(`${m.stdout}\n${m.stderr}`, new RegExp(`--chipdb: no ${path.join(none, 'chipdb-xc3s250e.bin').replace(/[.\\/]/g, '\\$&')}`));
});

// The rest of the Spartan-3E in the open flow (test/fixtures/open-flow: the board tests and the ISE
// check of instantiated primitives; ISE converts the same routed XDL to the same .bit, with no DRC
// error or warning: npm run check:open-flow on these folders): block RAM, multipliers, shift
// registers in SRL16, distributed RAM, the top-left DCM, each to a complete bitstream with no warning;
// feat_starter: the Spartan-3E Starter Kit's I/O settings on the XC3S500E-FG320 (LVTTL, drive 8 and 4,
// slow and fast slew, pull-ups and pull-downs: the FG320 pads' settings, stage F).
// nextpnr's design summary, as the open flow prints it (#2756)
const SLICES = /^place and route \(nextpnr: \d+ slices, \d+ PIPs\)/m;
const FEATURES = {
  feat_bram: [SLICES, 'RAMB16'],
  // a global clock and a DCM output read as data (#957: the clock tiles' GCLK_MAINk -> TO_OMUXj, the DCMs' DCM_<output> ->
  // OMUXk into general routing, measured)
  feat_clock_data: [SLICES, 'DCM', [/^ {2}pip CLKT_X13Y35 CLKT_GCLK_MAIN\d -> CLKT_TO_OMUX\d ,$/m, /^ {2}pip DCM_TL_CENTER_X13Y34 DCM_CLK0 -> OMUX\d+ ,$/m]],
  // four clocks, each on a block RAM's port B and a multiplier's registers (#2: the clock pins from every global line;
  // before, only line 4 reached a CLKB or a multiplier's CLK, and the placer refused the design)
  feat_bram_clocks: [SLICES, 'RAMB16', [/^ {2}pip BRAM1_SMALL_X\d+Y\d+ GCLK[0-35-7] -> BRAM_CLK3 ,$/m, /^ {2}pip BRAM2_SMALL_X\d+Y\d+ GCLK[0-35-7] -> BRAM_CLK0 ,$/m]],
  feat_mult: [SLICES, 'MULT18X18SIO'],
  // three multipliers cascaded through BCOUT -> BCIN (#2): one above the other in a column, the dedicated switches
  feat_mult_chain: [SLICES, 'MULT18X18SIO', [/B_INPUT::CASCADE /, /^net "[^"]+" , \n {2}outpin "u_m0" BCOUT5 ,\n {2}inpin "u_m1" BCIN5 ,\n {2}pip BRAMSITE2\w* MULT_CCARRY_BCOUT5 -> MULT_CARRYB_BCOUT5 ,$/m,
    /^net "[^"]+" , \n {2}outpin "u_m1" BCOUT17 ,\n {2}inpin "u_m2" BCIN17 ,\n/m]],
  // multiplications by a constant (inputs tied to 1) and a 14-bit memory word (#35)
  feat_constmult: [SLICES, 'MULT18X18SIO'],
  feat_srl: [SLICES, 'SLICEM'],
  // shift registers read at a variable tap (#5): SRL16E / SRL16E_1 addressed by the switches
  feat_srl_var: [SLICES, 'SLICEM', [/^inst "[^"]+" "SLICEM",placed /m]],
  // SRLC16E chained through Q15 (#2): four on the two SLICEMs of a CLB, the upper one's SHIFTOUT into the lower one's
  // SHIFTIN on the CLB's switch, as ISE packs and routes them
  feat_srl_chain: [SLICES, 'SLICEM', [/^net "[^"]+" , \n {2}outpin "la\[1\]_u" SHIFTOUT ,\n {2}inpin "la\[3\]_u" SHIFTIN ,\n {2}pip CLB_X\d+Y\d+ SHIFTOUT2 -> SHIFTIN0 ,$/m,
    /^net "[^"]+" , \n {2}outpin "lb\[1\]_u" SHIFTOUT ,\n {2}inpin "lb\[2\]_u" SHIFTIN ,\n {2}pip CLB_X\d+Y\d+ SHIFTOUT2 -> SHIFTIN0 ,$/m, /DIG_MUX::SHIFTIN /, /SHIFTOUTUSED::0 /]],
  // two clocks on side GCLK pins (#641): each on its own side buffer, through its side clock tile's CKIk, as ISE pairs them
  feat_side_clock: [SLICES, 'BUFGMUX', [/^inst "[^"]+" "BUFGMUX",placed CLKL_X0Y23 BUFGMUX_X0Y6 /m, /^inst "[^"]+" "BUFGMUX",placed CLKR_X35Y23 BUFGMUX_X3Y9 /m,
    /^ {2}pip CLKL_X0Y23 CLKL_CKI4 -> CLKL_GCLK4 ,$/m, /^ {2}pip CLKR_X35Y23 CLKR_CKI7 -> CLKR_GCLK7 ,$/m], [/IOIS_F\d_B3 ,/]],
  // a clock switch (#846): a BUFGMUX choosing between the two clock pins, I1 / S used (SINV not inverted); clka also
  // on a BUFG of its own: the switch on the one buffer clka's pad reaches on its dedicated path (X2Y11: CKI4 -> GCLK0 ->
  // GCLKIN00, the switches first, #2770), the BUFG on another through a CLKDUB, not from a global line through the fabric
  feat_bufgmux: [SLICES, 'BUFGMUX', [/^inst "u_mux" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y11 +,\n {2}cfg " DISABLE_ATTR::LOW I0_USED::0 I1_USED::0 SINV::S GCLKMUX:u_mux.GCLKMUX: "/m,
    /^inst "[^"]+" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X\dY1[01] /m, /^net "[^"]+" , \n {2}outpin "clka" I ,\n(?: {2}inpin "[^"]+" I0 ,\n){0,1} {2}inpin "u_mux" I0 ,$/m,
    /^ {2}pip CLKT_X13Y35 CLKV_\w+ -> CLKT_SELDUB\d ,$/m, /^ {2}pip CLKT_X13Y35 CLKT_CKI4 -> CLKT_GCLK0 ,$/m, /^ {2}pip CLKT_X13Y35 CLKT_GCLK0 -> CLKT_GCLKIN00 ,$/m],
    [/BUFGMUX_X2Y10/, /BUFGMUX_X1Y10/, /CLKT_TO_OMUX/]],
  // BUFGMUX_1 (#846): its output held high while it switches, DISABLE_ATTR HIGH (measured on the 24 buffers)
  feat_bufgmux_1: [SLICES, 'BUFGMUX', [/^inst "u_mux" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X\dY1[01] +,\n {2}cfg " DISABLE_ATTR::HIGH I0_USED::0 I1_USED::0 SINV::S GCLKMUX:u_mux.GCLKMUX: "/m]],
  feat_dcm: [SLICES, 'DCM'],
  // STARTUP_WAIT (its bit and the COR register), CLKFX under 5 MHz, two of the clock outputs (stage F)
  feat_dcm_wait: [SLICES, 'DCM', [/STARTUP_WAIT::STARTUP_WAIT/, /CLKFX_DIVIDE::32 /]],
  // two DCMs, cascaded: the second on the bottom-left DCM, its CLK2X180 on a buffer of the bottom (every DCM output
  // reaches its four on switches of known bits, #2); its CLKIN from the first one's CLK0 buffer (#47)
  feat_dcm2: [SLICES, 'DCM', [/^inst "u_dcma" "DCM",placed /m, /^inst "u_dcmb" "DCM",placed /m,
    // (B's CLKIN from A's CLK0 buffer on the global line, not through general routing, #93; the sites nextpnr's, #2756)
    /^ {2}pip DCM_\w+ GCLK\d -> DCM_CLKIN ,$/m], [/_TO_OMUX/]],
  // the clock pad (B8, LOC'd) into a global buffer that feeds the DCM's CLKIN: B8's buffer, whose line
  // reaches the top-left DCM's CLKIN, kept for it, the DCM's outputs on the others (#94)
  feat_dcm_bufgin: [SLICES, 'DCM', [/^inst "u_dcm" "DCM",placed DCM_TL_CENTER_X13Y34 DCM_X0Y1 /m, /^inst "u_bin" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y11 /m]],
  // twelve global clocks (#95): five of them on side buffers (left, lines 0-4), the top / bottom buffers
  // of lines 0-4 kept out of the left half (none of their GCLKCORE switches in the left centre tile)
  feat_clocks12: [SLICES, 'BUFGMUX', [/^inst "[^"]+" "BUFGMUX",placed CLKL_X0Y17 BUFGMUX_X0Y6 /m, /pip GCLKVML_\S+ GCLKVML_GCLKLR4 -> GCLKVMLR_GCLK_/],
    [/pip GCLKVML_\S+ GCLKVML_GCLKCORE[0-4] -> /, /placed CLKR_/]],
  // CLKIN_DIVIDE_BY_2, SOURCE_SYNCHRONOUS deskew (DESKEW_ADJUST 0), a CLKFX at the edge of its range (as trce
  // checks it, #661); and (on the Nexys2-500) the input period in whole nanoseconds: 20.9 ns is 20 (#46)
  feat_dcm_div2: [SLICES, 'DCM', [/CLKIN_DIVIDE_BY_2::CLKIN_DIVIDE_BY_2 /, /DESKEW_ADJUST::0 /, /CLKFX_DIVIDE::5 /, /CLKFX_MULTIPLY::2 /]],
  feat_dcm_fx: [SLICES, 'DCM', [/X_CLKIN_PERIOD::20\.8999999999999986 /, /CLKFX_DIVIDE::30 /]],
  // paths between a DCM's clocks and the pads of its clocks, as trce times them (#601): CLK0, CLK2X, CLKFX, CLKDV each on
  // a global buffer; a fixed phase shift on CLK0, CLK90 and CLK180
  feat_dcm_cross: [SLICES, 'DCM', [/^net "clk2x_u" , \n {2}outpin "u_dcm" CLK2X ,/m, /^net "clkdv_u" , \n {2}outpin "u_dcm" CLKDV ,/m, /^net "clkfx_u" , \n {2}outpin "u_dcm" CLKFX ,/m]],
  feat_dcm_phase: [SLICES, 'DCM', [/CLKOUT_PHASE_SHIFT::FIXED /, /PHASE_SHIFT::32 /, /^net "clk90_u" , \n {2}outpin "u_dcm" CLK90 ,/m, /^net "clk180_u" , \n {2}outpin "u_dcm" CLK180 ,/m]],
  // two DCMs, each CLKIN on the dedicated path from a clock pad of its own (#92): B8 to the top-left DCM, the clock
  // socket (U9) through the bottom clock tile to the bottom-left one
  feat_dcm_pads: [SLICES, 'DCM', [/^inst "u_dcma" "DCM",placed DCM_TL_CENTER_X23Y60 DCM_X1Y3 /m, /^inst "u_dcmb" "DCM",placed DCM_BL_CENTER_X23Y1 DCM_X1Y0 /m,
    /^ {2}pip CLKB_LL_X23Y0 CLKB_CKI6 -> CLKB_DLL_CLKPAD5 ,$/m, /^ {2}pip DCM_BL_CENTER_X23Y1 DCM_DLL_CLKPAD1 -> DCM_CLKIN ,$/m]],
  hard_prim: [SLICES, 'RAMB16'],
  // control pins tied to 1 / 0 as ISE ties them: block RAMs' EN / WE / SSR and multipliers' CE /
  // RST on VCC / GND, never inverted (MULT18X18S's CE / R on the three enables / resets); a DCM's
  // RST / PSCLK / PSINCDEC tied to 1 on VCC from its tile's VCC site (#190), DSSEN left open (#50)
  feat_const_bram: [SLICES, 'RAMB16', [/ENAINV::ENA /, /SSRBINV::SSRB /, /^net "[^"]+" vcc,[^;]*inpin "b4" ENA ,/m], [/(EN|WE|SSR)[AB]INV::\w+_B /]],
  feat_const_mult: [SLICES, 'MULT18X18SIO', [/CEAINV::CEA /, /RSTPINV::RSTP /, /^net "[^"]+" vcc,[^;]*inpin "m1" RSTB ,/m, /^net "[^"]+" gnd,[^;]*inpin "m1" CEA ,/m], [/(CE|RST)[ABP]INV::\w+_B /]],
  feat_const_dcm: [SLICES, 'DCM', [/RSTINV::RST /, /PSENINV::PSEN /, /PSINCDECINV::PSINCDEC /, /PSCLKINV::PSCLK /,
    /^net "[^"]+" vcc, \n {2}outpin "XDL_DUMMY_DCM_TL_CENTER_X13Y34_VCC_X14Y36" VCCOUT ,\n(?: {2}inpin "u_dcm" (?:PSCLK|PSINCDEC|RST) ,\n){3}/m, /^ {2}pip DCM_TL_CENTER_X13Y34 DCM_VCC_WIRE -> DCM_G1_B3 ,$/m,
    /^ {2}pip DCM_TL_CENTER_X13Y34 DCM_VCC_WIRE -> DCM_PSCLK ,$/m, /^net "[^"]+" gnd, \n {2}outpin "[^"]+" Y ,\n {2}inpin "u_dcm" PSEN ,$/m],
    [/inpin "u_dcm" DSSEN/, /(RST|PSEN|PSINCDEC|PSCLK)INV::\w+_B /]],
  // a manual clock (#347): the button's pad (BTN0, G12) through the general routing into a top BUFGMUX (its
  // CLKDUB input, as ISE routes it: CLOCK_DEDICATED_ROUTE = FALSE), the flip-flop on the global clock it drives
  feat_manual_clock: [SLICES, 'BUFGMUX', [/^inst "clk" "IBUF",placed RIBUFS_PCI_X27Y21 G12 /m, /^inst "[^"]+" "BUFGMUX",placed CLKT_X13Y35 BUFGMUX_X2Y1[01] /m,
    /pip CLKT_X13Y35 CLKT_CLKDUB\d -> CLKT_GCLK\d ,/, /^net "[^"]+" , \n {2}outpin "[^"]+" O ,\n {2}inpin "[^"]+" CLK ,$/m]],
  // registers in the IOBs on request (#96, IOB = TRUE): an input register with a clock enable and a reset, an output
  // register, a tristate output's value and enable registers, on pads where the bit database measured those kinds
  feat_iobreg: [/^place and route \(nextpnr: 1 slices, /m, 'IOB', [/^inst "sw<0>" "IBUF",placed \S+ P11 +,\n {2}cfg "[^"]* IFF1:[^"]* ICEINV::ICE [^"]*IFD_DELAY_VALUE::DLY3 /m,
    /^inst "led<0>" "IOB",placed \S+ M5 +,\n {2}cfg "[^"]* OMUX::OFF1 [^"]* OFF1:/m, /^inst "led<1>" "IOB",placed \S+ P6 +,\n {2}cfg "[^"]* OMUX::OFF1 [^"]* TMUX::TFF1 [^"]* TFF1:/m]],
  // plain registers in the IOBs (no enable, no set / reset), a tristate output's enable from the fabric and from an IOB
  // register (#96: measured on every pad in its second round); on pads of the four sides, every register's clock from
  // the global lines (#671: B4's, on the top, came through general routing, W2END4 -> IOIS_CLK0), the left and right
  // pads' through the I/O columns' clock rows
  feat_iob_plain: [SLICES, 'IOB', [/^inst "sw<0>" "IBUF",placed \S+ P11 +,\n {2}cfg "[^"]* IFF1:/m, /^inst "led<4>" "IOB",placed \S+ N5 +,\n {2}cfg "[^"]* TMUX::T1 /m,
    /^inst "led<5>" "IOB",placed \S+ N4 +,\n {2}cfg "[^"]* TMUX::TFF1 [^"]* O1_DDRMUX::1 /m, /^inst "sw<3>" "IBUF",placed TIOIS_X3Y35 B4 +,\n {2}cfg "[^"]* IFF1:/m,
    /^inst "btn<0>" "IBUF",placed RIBUFS_PCI_X27Y21 G12 +,\n {2}cfg "[^"]* IFF1:/m, /^inst "an<0>" "IOB",placed RIOIS_X27Y24 F12 +,\n {2}cfg "[^"]* OFF1:/m,
    /^ {2}pip TIOIS_X3Y35 GCLK\d -> IOIS_CLK0 ,$/m, /^ {2}pip GCLKH_PCI_CE_S_X0Y5 GCLKH_GCLK\d -> GCLKH_GCLK_DN\d ,$/m, /^ {2}pip GCLKH_PCI_CE_N_X27Y21 GCLKH_GCLK\d -> GCLKH_GCLK_UP\d ,$/m],
    [/^ {2}pip \S+ (?:[EWNS][26]\w+|L[HV]\d+|OMUX\w*) -> IOIS_CLK\d ,$/m]],
  // eight global clocks (the eight top and bottom buffers: lines 0-7), each clocking IOB registers of left and right pads
  // (#671: the side I/O tiles' clock pins were measured from line 4 only)
  feat_iob_lines: [SLICES, 'IOB', [...[0, 1, 2, 3, 4, 5, 6, 7].map(k => new RegExp(`^ {2}pip [LR]I(?:OIS|BUFS)\\w*_X\\d+Y\\d+ GCLK${k} -> IOIS_CLK\\d ,$`, 'm')),
    /^inst "btn<0>" "IBUF",placed RIBUFS_PCI_X27Y21 G12 +,\n {2}cfg "[^"]* IFF1:/m, /^inst "led<7>" "IOB",placed LIOIS_PCI_X0Y19 G1 +,\n {2}cfg "[^"]* OFF1:/m],
    [/^ {2}pip \S+ (?:[EWNS][26]\w+|L[HV]\d+|OMUX\w*) -> IOIS_CLK\d ,$/m]],
  // IOB registers on two global clocks, their pads left to the placer (#749): the two input registers, and the two output
  // registers, never in the two IOBs of one differential pair (which share each clock wire of their I/O tile); every pad
  // in LVCMOS33, as the UCF's NET "sw<*>" / "led<*>" IOSTANDARD ask (#773: they were left in LVCMOS25)
  feat_iob_pair: [SLICES, 'IOB', [/^inst "sw<1>" "IBUF",placed \S+ \S+ +,\n {2}cfg "[^"]* IFF1:/m, /^inst "led<1>" "IOB",placed \S+ \S+ +,\n {2}cfg "[^"]* OFF1:/m,
    ...['sw<0>', 'sw<1>', 'led<0>', 'led<1>'].map(n => new RegExp(`^inst "${n}" "(?:IBUF|IOB)",placed \\S+ \\S+ +,\\n {2}cfg "[^"]* IOATTRBOX::LVCMOS33 `, 'm'))],
    [/[IOT]FF2:/, /IOATTRBOX::LVCMOS25/]],
  // input registers on pads whose neighbouring pad is unused (#751: a bit of the delay ISE's map chooses had gone to
  // both pads of a pair): B3, E17, F14, G13 of the XC3S500E, each alone
  feat_iob_lone: [SLICES, 'IOB', [...['B3', 'E17', 'F14', 'G13'].map(p => new RegExp(`^inst "d<\\d>" "IBUF",placed \\S+ ${p} +,\\n {2}cfg "[^"]* IFF1:[^"]* IFD_DELAY_VALUE::DLY3 `, 'm'))],
    [/placed \S+ (?:A3|C3|D18|F15|G14|E18) /]],
  // IDDR2s (a set / reset each) on pads whose neighbour's features held some of their bits, each alone (#897): A3, C9, B9,
  // C15, D13 of the XC3S500E, their neighbours B3, E9, D9, A16, E12 unused
  feat_iob_owners: [SLICES, 'IOB', [...['A3', 'C9', 'B9', 'C15', 'D13'].map((p, k) => new RegExp(`^inst "d<${k}>" "IBUF",placed \\S+ ${p} +,\\n {2}cfg "[^"]* IFF2:[^"]* ${k % 2 ? 'IREV_USED::0' : 'ISR_USED::0'} `, 'm'))],
    [/placed \S+ (?:B3|E9|D9|A16|E12) /]],
  // the IOBs' DDR registers (#96): two IDDR2 and three ODDR2 on the clock and its inverse (ICLK2 / OTCLK2 inverted, on the
  // clock's net: the inverter left out), with clock enables and synchronous and asynchronous set / reset; in VHDL and Verilog
  ...Object.fromEntries(['feat_iob_ddr', 'feat_iob_ddr_v'].map(n => [n, [SLICES, 'IOB', [/^inst "sw<0>" "IBUF",placed \S+ \S+ +,\n {2}cfg "[^"]* IFF1:u_i0\/FF0:#FF [^"]* IFF2:u_i0\/FF1:#FF [^"]* IFFATTRBOX::SYNC [^"]* ICLK2INV::ICLK2_B /m,
    /^inst "sw<1>" "IBUF",placed \S+ \S+ +,\n {2}cfg "[^"]* IFFATTRBOX::ASYNC /m, /^inst "led<1>" "IOB",placed \S+ \S+ +,\n {2}cfg "[^"]* OMUX::OFFDDR [^"]* OFF1_SR_ATTR::SRHIGH [^"]* OFFATTRBOX::ASYNC [^"]* OTCLK2INV::OTCLK2_B OFFDDRBLACKBOX:u_o1: /m,
    /^inst "led<2>" "IOB",placed \S+ \S+ +,\n {2}cfg "[^"]* OMUX::OFFDDR /m, /^ {2}inpin "led<0>" OTCLK2 ,$/m]]])),
  // bidirectional pads (#96, IOBUF): each driven or released by the design and read (IO:<standard>, the input's settings
  // but its driver's and the output's), one with a drive and a slew of its own; in VHDL and Verilog
  ...Object.fromEntries(['feat_iob_bidir', 'feat_iob_bidir_v'].map(n => [n, [SLICES, 'IOB', [/^inst "io<0>" "IOB",placed \S+ \S+ +,\n {2}cfg "[^"]*IOATTRBOX::LVCMOS33 O1INV::O1 OMUX::O1 SLEW::SLOW T1INV::T1 TMUX::T1 IDELMUX::1 IMUX::1 INBUF:io<0>_IBUF: OUTBUF:io<0>_OBUF: /m,
    /^inst "io<1>" "IOB",placed \S+ \S+ +,\n {2}cfg " DRIVEATTRBOX::4 [^"]* SLEW::FAST [^"]* INBUF:io<1>_IBUF: /m]]])),
  feat_starter: [SLICES, 'IOB', [/IOATTRBOX::LVTTL\b/, /DRIVEATTRBOX::8\b/, /DRIVEATTRBOX::4\b/, /SLEW::FAST\b/, /PULL::PULLUP\b/, /PULL::PULLDOWN\b/]],
};
for (const [name, [packLine, type, settings = [], absent = [], todo]] of Object.entries(FEATURES)) {
  test(`the open flow: ${name} (${type}) to a complete bitstream, no warning`, { timeout: 300000, ...(todo && { todo }) }, () => {
    const out = path.join(tmp, name);
    const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), path.join(ROOT, 'test/fixtures/open-flow', name), out],
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

// #709: paths across the XC3S1200E between IOB registers (feat_ll_splitters), at seed 2: a complete bitstream, no warning
// (ISE: byte-identical, DRC clean, scripts/check-open-flow.mjs). Silinx's router joined a vertical long line of the left
// DCMs' column across the centre row there (CLKLH_DCM_LL); nextpnr's routing is its own (#2756): the splitter's bit is
// packages/silinx-fpga/test/fpga-bitgen.test.js's
test('the open flow: feat_ll_splitters at seed 2 across the XC3S1200E, every register in its IOB, a complete bitstream, no warning (#709)', { timeout: 300000 }, () => {
  const out = path.join(tmp, 'feat_ll_splitters-s2');
  const r = openFlow(path.join(ROOT, 'test/fixtures/open-flow/feat_ll_splitters'), out, ['--seed', '2']);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.deepEqual(r.warnings, []);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  const routed = fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8');
  assert.equal((routed.match(/^inst "[lrtb]<\d>" "(?:IBUF|IOB)",placed \S+ \S+ +,\n {2}cfg "[^"]* [IO]FF1:/gm) || []).length, 24, 'every register in its IOB');
});

// #749: feat_iob_pair with its pads LOC'd on two differential pairs of the Basys2-250 (J12 / K14, N13 / N14), each pair's
// two registers on different clocks: before, "the routing did not converge"; now both clocks routed into each tile, the
// DIFFM's register on its second flip-flop (as ISE does: its DRC clean on this routed XDL), whose settings on a pad alone
// are in the bit database since #759: a complete bitstream, no warning (nextpnr too since #2766)
test('the open flow: two registers of one kind on different clocks in the two IOBs of a LOC\'d pair: routed, the DIFFM\'s on its second flip-flop, a complete bitstream (#749, #759)', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'feat_iob_pair_loc'), out = path.join(tmp, 'feat_iob_pair_loc-out');
  fs.cpSync(path.join(ROOT, 'test/fixtures/open-flow/feat_iob_pair'), dir, { recursive: true });
  fs.appendFileSync(path.join(dir, 'top.ucf'), 'NET "led<0>" LOC = "J12" ;\nNET "led<1>" LOC = "K14" ;\nNET "sw<0>" LOC = "N13" ;\nNET "sw<1>" LOC = "N14" ;\n');
  const r = openFlow(dir, out);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.deepEqual(r.warnings, []);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  const routed = fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8');
  assert.match(routed, /^inst "led<1>" "IOB",placed RIOIS_PCI_X27Y14 K14 +,\n {2}cfg "[^"]* OMUX::OFF2 [^"]* OFF2:/m);
  assert.match(routed, /^inst "led<0>" "IOB",placed RIOIS_PCI_X27Y14 J12 +,\n {2}cfg "[^"]* OFF1:/m);
  assert.match(routed, /^inst "sw<0>" "IBUF",placed RIOIS_X27Y1 N13 +,\n {2}cfg "[^"]* IFF2:/m);
  for (const re of [/^ {2}pip RIOIS_PCI_X27Y14 GCLK\d -> IOIS_CLK5 ,$/m, /^ {2}pip RIOIS_PCI_X27Y14 IOIS_CLK5 -> OTCLK20 ,$/m, /^ {2}pip RIOIS_PCI_X27Y14 IOIS_CLK1 -> OTCLK11 ,$/m,
    /^ {2}pip RIOIS_X27Y1 IOIS_CLK4 -> ICLK20 ,$/m, /^ {2}pip RIOIS_X27Y1 IOIS_CLK0 -> ICLK11 ,$/m]) assert.match(routed, re);
});

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
// written as ISE's bitgen writes it: packages/silinx-fpga/test/fpga-bitgen.test.js). Checked against ISE: the .bit is
// byte-identical to ISE's bitgen of the same routed XDL, DRC 0 errors and 0 warnings.
test('the open flow: inputs that drive nothing (the clock, the buttons) get no pad; complete bitstream, no warning', { timeout: 300000 }, () => {
  const out = path.join(tmp, 'feat_unused_in');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), path.join(ROOT, 'test/fixtures/open-flow/feat_unused_in'), out],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  const pads = [...fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8').matchAll(/^inst "([^"]+)" "(?:IBUF|IOB)",placed/gm)].map(m => m[1]).sort();
  assert.deepEqual(pads, [...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `led<${i}>`), ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => `sw<${i}>`)].sort());
});

// A DCM with more outputs on global buffers than its output multiplexer reaches (four; feat_dcm's CLK0, CLKDV, CLKFX,
// CLK2X and CLK90 too, on the XC3S100E): Silinx's placer refused it ("no free global clock buffer reachable"); nextpnr
// takes the fifth to a buffer of its own through general routing, into the buffer's CLKDUB input (#2756). The Basys2's
// clock on B8, which reaches no CLKIN of the XC3S100E on a dedicated path: said (#2768).
test('the open flow: a DCM with five outputs on global buffers, one past its output multiplexer\'s four, the fifth through general routing, the CLKIN from B8 said', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'dcm5');
  fs.mkdirSync(dir, { recursive: true });
  const src = fs.readFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_dcm/top.vhd'), 'utf8').replace('CLK90 => open', 'CLK90 => clk90_u')
    .replace('clk2x_u, clk2x_b, locked : std_logic;', 'clk2x_u, clk2x_b, clk90_u, clk90_b, h90, locked : std_logic;')
    .replace('  u_b2x : BUFG port map (I => clk2x_u, O => clk2x_b);', '  u_b2x : BUFG port map (I => clk2x_u, O => clk2x_b);\n  u_b90 : BUFG port map (I => clk90_u, O => clk90_b);\n  process (clk90_b) begin if rising_edge(clk90_b) then h90 <= sw(0); end if; end process;')
    .replace('led <= locked & "000"', 'led <= locked & h90 & "00"');
  assert.match(src, /u_b90 : BUFG/);
  fs.writeFileSync(path.join(dir, 'top.vhd'), src);
  fs.writeFileSync(path.join(dir, 'silinx.json'), JSON.stringify({ name: 'dcm5', version: 1, device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' }, top: 'top',
    // the constraints by an absolute path (on Windows a relative one across drives is absolute too: it was
    // joined onto the project folder, CI b898d8e)
    files: [{ path: 'top.vhd', lang: 'vhdl', role: 'design' }], constraints: path.join(ROOT, 'test/fixtures/open-flow/basys2.ucf') }));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, path.join(dir, 'out')], { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.deepEqual(`${r.stdout}\n${r.stderr}`.split('\n').filter(l => /warning/i.test(l)).map(l => l.trim()),
    ['WARNING:nextpnr - DCM u_dcm: its CLKIN comes from the pad B8 through general routing: only B9, A9, A10, C9 reach its CLKIN on a dedicated path.']);
  const routed = fs.readFileSync(path.join(dir, 'out', 'routed.xdl'), 'utf8');
  assert.equal((routed.match(/^inst "u_b\w+" "BUFGMUX",placed /gm) || []).length, 5);
  // each output's net into its buffer: the dedicated path (DLL_OUT…), but one through general routing into a CLKDUB
  // (#2770: nextpnr took two)
  const nets = routed.split(/^net /m).slice(1).filter(n => /\n {2}outpin "u_dcm" CLK\w+ ,\n/.test(n));
  assert.equal(nets.length, 5);
  assert.equal(nets.filter(n => /_CLKDUB\d -> \w+_GCLK\d ,/.test(n)).length, 1);
});

// blinky on the other boards (stage F of packages/silinx-fpga/research/s3e-bitstream): the Basys2-100 with the Basys2's
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
// of known bits reaches a global buffer (nextpnr's choice of the pad and the buffer, #2756: Silinx's placer took
// B8 -> BUFGMUX_X2Y11), and every net routes on known switches (#49:
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
    assert.equal(placedOf('IBUF').filter(s => s.startsWith('clk ')).length, 1);
    assert.equal(placedOf('BUFGMUX').length, 1);
    // the pad into the buffer on its dedicated path: the clock tile's CKIk -> GCLKk
    const clk = padNet(routed, 'clk');
    assert.match(clk, /^ {2}inpin "[^"]+" I0 ,$/m);
    assert.match(clk, /^ {2}pip CLK[TB]\w*_X\d+Y\d+ CLK[TB]_CKI\d -> CLK[TB]_GCLK\d ,$/m);
    assert.doesNotMatch(clk, GENERAL);
    for (const type of ['RAMB16', 'MULT18X18SIO']) assert.ok(placedOf(type).length > 0, type);
  });
}

// The clocks of #56, #57, #58 through the whole open flow (checked against ISE: npm run
// check:open-flow on the same projects gives DRC 0 errors / 0 warnings and a byte-identical .bit):
// feat_constmult's clock LOC'd on the bottom GCLK pin (its buffer's lines reach no block RAM /
// multiplier clock on known switches: BUFGMUX_X2Y11 through general routing, a warning), feat_dcm
// with no constraints (the clock on the pad ISE gives the DCM's CLKIN, on its dedicated path, #92), and
// feat_constmult's clock LOC'd on a side GCLK pin (on its own side buffer, through the side clock tile's CKIk, as
// ISE pairs them, #641).
const CLOCK_CASES = [
  // (M4's own buffer, BUFGMUX_X2Y1, on its dedicated path: since #2 its line reaches the block RAMs' and multipliers'
  // clock pins; before, BUFGMUX_X2Y11 through general routing, with a warning)
  ['#56', 'feat_constmult', 'xc3s250e', 'cp132', 'M4', { clk: 'M4', bufg: 'BUFGMUX_X2Y1' }, []],
  // (with no LOC, the pad and the DCM nextpnr's: the DCM's CLKIN on its dedicated path from the pad, #92, #2756;
  // Silinx's placer took ISE's pads, B9 / A9)
  ['#57', 'feat_dcm', 'xc3s500e', 'fg320', null, { padInto: 'u_dcm CLKIN' }, []],
  ['#47', 'feat_dcm', 'xc3s1200e', 'fg320', null, { padInto: 'u_dcm CLKIN' }, []],
  ['#47', 'feat_dcm', 'xc3s100e', 'cp132', null, { padInto: 'u_dcm CLKIN' }, []],
  // (#641: K3's own side buffer, BUFGMUX_X0Y6, the one ISE gives it; the path ISE routes, I0_PINWIRE -> LIOIS_IBUF1 of its
  // I/O tile, CLKL_CKI4 -> CLKL_GCLK4 of the side clock tile)
  ['#641', 'feat_constmult', 'xc3s500e', 'fg320', 'K3', { clk: 'K3', bufg: 'BUFGMUX_X0Y6', pips: [/^ {2}pip LIOIS_CLK_PCI_X0Y23 I0_PINWIRE -> LIOIS_IBUF1 ,$/m, /^ {2}pip CLKL_X0Y23 CLKL_CKI4 -> CLKL_GCLK4 ,$/m] }, []],
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
    for (const re of want.pips || []) assert.match(routed, re);
    if (want.padInto) {
      assert.equal(placedOf('DCM').length, 1);
      const net = padNet(routed, 'clk');
      assert.ok(net.includes(`\n  inpin "${want.padInto.replace(' ', '" ')} ,\n`), net);
      assert.match(net, /^ {2}pip DCM_\w+ DCM_DLL_CLKPAD\d -> DCM_CLKIN ,$/m);
      assert.doesNotMatch(net, GENERAL);
    }
  });
}

// Two DCMs on the other devices (#47; checked against ISE: npm run check:open-flow gives DRC 0 errors /
// 0 warnings and a byte-identical .bit): feat_dcm2 with no constraints, on the XC3S100E CLK2X in CLK2X180's place
// (whose DCMs reach no global buffer from CLK2X180). The two DCMs on two sites, the first DCM's CLKIN on its dedicated
// path from the clock's pad (#92); the sites and the pad nextpnr's (#2756: Silinx's placer took the top-left and
// bottom-left DCMs and ISE's pad).
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
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
    const dcms = placedOf('DCM');
    assert.deepEqual(Object.keys(dcms).sort(), ['u_dcma', 'u_dcmb']);
    assert.notEqual(dcms.u_dcma, dcms.u_dcmb);
    const clk = padNet(routed, 'clk');
    assert.match(clk, /^ {2}inpin "u_dcma" CLKIN ,\n/m);
    assert.match(clk, /^ {2}pip DCM_\w+ DCM_DLL_CLKPAD\d -> DCM_CLKIN ,$/m);
    assert.doesNotMatch(clk, GENERAL);
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
// buffer's line reaches the DCM's CLKIN (the pad, the buffer and the DCM nextpnr's, #2756: Silinx's placer took B7 ->
// BUFGMUX_X1Y10, D9 on the FG320), the pad into its buffer on the dedicated path, the DCM's outputs on the other
// buffers, no warning (before #94: the DCM's outputs took the buffers first, and the pad's buffer, not reaching the
// CLKIN, was said and reached through general routing).
for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s250e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
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
    assert.ok(placedOf('IBUF').clk && placedOf('BUFGMUX').u_bin && placedOf('DCM').u_dcm);
    const clk = padNet(routed, 'clk');
    assert.match(clk, /^ {2}inpin "u_bin" I0 ,$/m);
    assert.match(clk, /^ {2}pip CLK[TB]\w*_X\d+Y\d+ CLK[TB]_CKI\d -> CLK[TB]_GCLK\d ,$/m);
    assert.doesNotMatch(clk, GENERAL);
    // the CLKIN and the feedback on the global lines (#93)
    const pips = dcmClockPips(routed);
    assert.equal(pips.length, 2, pips.join('; '));
    for (const p of pips) assert.match(p, / GCLK\d -> CLK(IN|FB)$/);
    assert.doesNotMatch(routed, /_TO_OMUX/);
  });
}
