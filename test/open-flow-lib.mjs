// The open flow's tests (test/open-flow.test.js and the files split from it, #3124: open-flow-features, open-flow-io,
// open-flow-clocks, run beside one another): the shipped device descriptions with no user cache, the open flow of a
// project and what its routed design is read for, and the fixtures of the Spartan-3E's features.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-open-flow-'));
process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');   // no user cache: the shipped graph is used
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

// the open flow of a project: its exit status, output and warnings (every line that says "warning")
// the switches into the DCMs' CLKIN / CLKFB of the nets that global buffers drive: from the global
// clock lines (GCLKn), never through general routing (#93; before: the cascade's second DCM and a
// feedback through CLKT_TO_OMUX and hex / double lines)
export const dcmClockPips = routed => {
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
export const padNet = (routed, pad) => routed.split(/^net /m).slice(1).find(n => n.includes(`\n  outpin "${pad}" I ,\n`)) ?? '';
export const GENERAL = /^ {2}pip \S+ (?:[EWNS][26](?:BEG|MID|END)\d|L[HV]\d+|OMUX\w*|\w*CLKDUB\d) ->/m;
export const openFlow = (dir, out, args = []) => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, out, ...args],
    { encoding: 'utf8', env: { ...process.env, SILINX_CONFIG_DIR: path.join(tmp, 'cfg') } });
  return { ...r, warnings: `${r.stdout}\n${r.stderr}`.split('\n').filter(l => /warning/i.test(l)).map(l => l.trim()) };
};
// the warnings of the open flow on blinky: none, on every device
export const BLINKY_WARNINGS = [];

// The rest of the Spartan-3E in the open flow (test/fixtures/open-flow: the board tests and the ISE
// check of instantiated primitives; ISE converts the same routed XDL to the same .bit, with no DRC
// error or warning: npm run check:open-flow on these folders): block RAM, multipliers, shift
// registers in SRL16, distributed RAM, the top-left DCM, each to a complete bitstream with no warning;
// feat_starter: the Spartan-3E Starter Kit's I/O settings on the XC3S500E-FG320 (LVTTL, drive 8 and 4,
// slow and fast slew, pull-ups and pull-downs: the FG320 pads' settings, stage F).
// nextpnr's design summary, as the open flow prints it (#2756)
export const SLICES = /^place and route \(nextpnr: \d+ slices, \d+ PIPs\)/m;
export const FEATURES = {
  feat_bram: [SLICES, 'RAMB16'],
  // a global clock and a DCM output read as data (#957: the clock tiles' GCLK_MAINk -> TO_OMUXj, the DCMs' DCM_<output> ->
  // OMUXk into general routing, measured)
  feat_clock_data: [SLICES, 'DCM', [/^ {2}pip CLKT_X13Y35 CLKT_GCLK_MAIN\d -> CLKT_TO_OMUX\d ,$/m, /^ {2}pip DCM_TL_CENTER_X13Y34 DCM_CLK0 -> OMUX\d+ ,$/m]],
  // four clocks, each on a block RAM's port B and a multiplier's registers (#2: the clock pins from every global line;
  // before, only line 4 reached a CLKB or a multiplier's CLK, and the placer refused the design)
  feat_bram_clocks: [SLICES, 'RAMB16', [/^ {2}pip BRAM1_SMALL_X\d+Y\d+ GCLK[0-35-7] -> BRAM_CLK3 ,$/m, /^ {2}pip BRAM2_SMALL_X\d+Y\d+ GCLK[0-35-7] -> BRAM_CLK0 ,$/m]],
  feat_mult: [SLICES, 'MULT18X18SIO'],
  // the logic analyzer's link (#3176): BSCAN_SPARTAN3 in the corner tile, as ISE's XDL writes it, its pins to the capture
  // core through the corner's switches (nextpnr 1.5.0)
  feat_bscan: [SLICES, 'BSCAN', [/^inst "silinx_bscan" "BSCAN",placed UR_X27Y35 BSCAN +,\n {2}cfg " BSCAN_BLACKBOX:silinx_bscan: "/m, /^ {2}pip UR_X27Y35 UR_DRCK1 -> CNR_D_O_FAN_B0 ,$/m]],
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
/** The tests of the features of these types (FEATURES' second item): each to a complete bitstream, no warning. */
export function testFeatures(types) {
  for (const [name, [packLine, type, settings = [], absent = [], todo]] of Object.entries(FEATURES)) {
    if (!types.includes(type)) continue;
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
}
