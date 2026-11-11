// gowin_pack's rPLL and oscillator (#2303): Silinx's port (packages/silinx-fpga/src/fpga/gowin/pll-osc.js) against Apicula 0.32's
// own gowin_pack, run offline on the designs below routed by the flow on the Tang Nano 9K (test/fixtures/gowin-pack/apicula-0.32.json,
// designs: the SHA-256 of their routed designs and of Apicula's .fs): the rPLL on each side of the GW1N-9C (its three RPLLB cells),
// its outputs CLKOUT, CLKOUTP, CLKOUTD and CLKOUTD3, its phase and duty fixed or dynamic, its bypasses, its dividers static or
// dynamic, another input frequency; the oscillator with two dividers; each clock checked at its own frequency (#3488). Their limits refused as Apicula refuses them; the charge
// pump against Apicula's calc_pll_pump's values.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { runFlow, nextpnrGowinNode, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { pllPump, pllAttrs, pllAuxCols, oscAttrs } from '../packages/silinx-fpga/src/fpga/gowin/pll-osc.js';
import { loadChipdb } from '../packages/silinx-fpga/src/fpga/gowin/chipdb.js';
import { gowinPack } from '../packages/silinx-fpga/src/fpga/gowin/pack.js';
import { installedPackageFile } from '../packages/silinx-fpga/src/nextpnr-gowin-node.js';
import { apyculaDatabase } from '../packages/silinx-fpga/src/fpga/gowin/gowin-files.js';
import { gowinResourcePart } from '../packages/silinx-fpga/src/nextpnr-gowin-io.js';

const REF = JSON.parse(fs.readFileSync(new URL('./fixtures/gowin-pack/apicula-0.32.json', import.meta.url), 'utf8')).designs;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const database = async () => loadChipdb(await apyculaDatabase(i => installedPackageFile('@yowasp/nextpnr-himbaechel-gowin', gowinResourcePart(i)), 'GW1N-9C'));

const PORTS = '.RESET(1\'b0), .RESET_P(1\'b0), .CLKFB(1\'b0), .FBDSEL(6\'b0), .IDSEL(6\'b0), .ODSEL(6\'b0), .PSDA(4\'b0), .DUTYDA(4\'b0), .FDLY(4\'b0)';
const LEDS = n => [10, 11, 13].slice(0, n).map((p, i) => `IO_LOC "led[${i}]" ${p};\n`).join('');
const CLK = 'IO_LOC "clk" 52;\n';
const counter = (clk, bits, out) => `  reg [${bits - 1}:0] c_${clk} = 0;\n  always @(posedge ${clk}) begin c_${clk} <= c_${clk} + 1; ${out}; end\n`;
const DESIGNS = {
  // 27 MHz to 54 MHz (VCO 432 MHz), placed on the right side
  pll: { cst: `${CLK}${LEDS(2)}// create_clock -name clk -period 37.037 [get_ports {clk}]\n`, clocks: ['fast'], asked: [54],
    text: `module pll(input clk, output reg [1:0] led);\n  wire fast, lock;\n  rPLL #(.FCLKIN("27"), .IDIV_SEL(0), .FBDIV_SEL(1), .ODIV_SEL(8), .DEVICE("GW1NR-9C")) u (.CLKIN(clk), .CLKOUT(fast), .LOCK(lock), ${PORTS});\n${counter('fast', 25, 'led <= {lock, c_fast[24]}')}endmodule\n` },
  // 90 MHz, CLKOUTP's phase and duty, CLKOUTD by 6: on the left side
  pll2: { cst: `${CLK}${LEDS(3)}// create_clock -name clk -period 37.037 [get_ports {clk}]\n`, clocks: ['d', 'o', 'p'], asked: [15, 90, 90],
    text: `module pll2(input clk, output reg [2:0] led);\n  wire o, p, d, lock;\n  rPLL #(.FCLKIN("27"), .IDIV_SEL(2), .FBDIV_SEL(9), .ODIV_SEL(8), .PSDA_SEL("0100"), .DUTYDA_SEL("1000"), .CLKOUTD_SRC("CLKOUT"), .DYN_SDIV_SEL(6), .DEVICE("GW1NR-9C"))\n    u (.CLKIN(clk), .CLKOUT(o), .CLKOUTP(p), .CLKOUTD(d), .LOCK(lock), ${PORTS});\n${counter('o', 25, 'led[0] <= c_o[24]')}${counter('p', 25, 'led[1] <= c_p[24] & lock')}${counter('d', 23, 'led[2] <= c_d[22]')}endmodule\n` },
  // the phase and duty dynamic (the outputs' delays), CLKOUTD and CLKOUTD3 from CLKOUTP, CLKOUTP bypassed
  pll3: { cst: `${CLK}${LEDS(3)}`, clocks: ['d', 'd3', 'o'], asked: [6.75, 9, 108],
    text: `module pll3(input clk, output reg [2:0] led);\n  wire o, p, d, d3, lock;\n  rPLL #(.FCLKIN("27"), .IDIV_SEL(0), .FBDIV_SEL(3), .ODIV_SEL(4), .DYN_DA_EN("true"), .CLKOUT_DLY_STEP(2), .CLKOUTP_DLY_STEP(1), .CLKOUTD_SRC("CLKOUTP"), .CLKOUTD3_SRC("CLKOUTP"), .CLKOUTP_BYPASS("true"), .DYN_SDIV_SEL(4), .DEVICE("GW1NR-9C"))\n    u (.CLKIN(clk), .CLKOUT(o), .CLKOUTP(p), .CLKOUTD(d), .CLKOUTD3(d3), .LOCK(lock), ${PORTS});\n${counter('o', 25, 'led[0] <= c_o[24]')}${counter('d', 25, 'led[1] <= c_d[24] & lock')}${counter('d3', 23, 'led[2] <= c_d3[22]')}endmodule\n` },
  // a 100 MHz input (another range of the charge pump: VCO 600 MHz), CLKOUT and CLKOUTD bypassed
  pll4: { cst: `${CLK}${LEDS(2)}`, clocks: ['o'], asked: [100],
    text: `module pll4(input clk, output reg [1:0] led);\n  wire o, lock;\n  rPLL #(.FCLKIN("100"), .IDIV_SEL(3), .FBDIV_SEL(11), .ODIV_SEL(2), .CLKOUT_BYPASS("true"), .CLKOUTD_BYPASS("true"), .DEVICE("GW1NR-9C"))\n    u (.CLKIN(clk), .CLKOUT(o), .LOCK(lock), ${PORTS});\n${counter('o', 25, 'led <= {lock, c_o[24]}')}endmodule\n` },
  // the dividers dynamic (their ports), so not checked by gowin_pack
  pll5: { cst: `${CLK}${LEDS(2)}`, clocks: ['o'], asked: [null],
    text: `module pll5(input clk, output reg [1:0] led);\n  wire o, lock;\n  rPLL #(.FCLKIN("27"), .DYN_IDIV_SEL("true"), .DYN_FBDIV_SEL("true"), .DYN_ODIV_SEL("true"), .DEVICE("GW1NR-9C"))\n    u (.CLKIN(clk), .CLKOUT(o), .LOCK(lock), .RESET(1'b0), .RESET_P(1'b0), .CLKFB(1'b0), .FBDSEL(6'b111110), .IDSEL(6'b111111), .ODSEL(6'b111000), .PSDA(4'b0), .DUTYDA(4'b0), .FDLY(4'b0));\n${counter('o', 25, 'led <= {lock, c_o[24]}')}endmodule\n` },
  // the oscillator by 10 and by 128
  osc: { cst: LEDS(2), clocks: ['clk'], asked: [25], fallback: 26,
    text: `module osc(output reg [1:0] led);\n  wire clk;\n  OSC #(.FREQ_DIV(10), .DEVICE("GW1NR-9C")) u (.OSCOUT(clk));\n${counter('clk', 24, 'led <= c_clk[23:22]')}endmodule\n` },
  osc2: { cst: LEDS(2), clocks: ['clk'], asked: [1.95], fallback: 22,
    text: `module osc2(output reg [1:0] led);\n  wire clk;\n  OSC #(.FREQ_DIV(128), .DEVICE("GW1NR-9C")) u (.OSCOUT(clk));\n${counter('clk', 20, 'led <= c_clk[19:18]')}endmodule\n` },
};
// nextpnr's warnings: the oscillator's clock routed through the general routing where its dedicated routing did not reach
const FALLBACK = /^WARNING:Place - Failed to route net 'clk' from X0Y28\/Q4 to X\d+Y\d+\/CLK\d using dedicated routing\.$/;

const gowin = nextpnrGowinNode();
async function build(name) {
  const d = DESIGNS[name], log = [], files = {};
  const io = { log: l => log.push(l), sources: () => [{ path: `${name}.v`, lang: 'verilog', text: d.text }], ucf: d.cst, ucfName: `${name}.cst`,
    yosys: yosysNode, nextpnr: { gowin }, write: (n, x) => { files[n] = x; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {} };
  const r = await runFlow({ top: name, family: 'gowin', device: 'gw1nr-9c', pkg: 'qn88', speed: '-6', steps: ['synth', 'translate', 'par', 'bitgen'] }, io);
  return { r, log, files };
}

describe('the rPLL and the oscillator from HDL to the .fs: Apicula\'s byte for byte', { concurrency: 2 }, () => {
  for (const name of Object.keys(DESIGNS)) {
    test(name, { timeout: 300000 }, async () => {
      const { r, log, files } = await build(name);
      assert.ok(r.ok, r.error);
      const prim = name.startsWith('pll') ? ['rPLL', 2] : ['OSC', 1];
      const map = Object.fromEntries(r.report.map.utilization.map(u => [u.name, [u.used, u.total]]));
      assert.deepEqual(map[prim[0]], [1, prim[1]], JSON.stringify(map));
      assert.deepEqual(r.report.par.fmax.map(f => f.clock), DESIGNS[name].clocks);
      // each clock checked at its own frequency (#3488: the PLL's outputs were at the CST's 27 MHz, the oscillator's at nextpnr's 12 MHz)
      assert.deepEqual(r.report.par.fmax.map(f => f.constraint), DESIGNS[name].asked);
      assert.deepEqual(log.filter(l => /^Clock /.test(l)).map(l => l.replace(/: [\d.]+ MHz/, ': N MHz')),
        DESIGNS[name].clocks.map((c, i) => `Clock ${c}: N MHz (${DESIGNS[name].asked[i] == null ? 'no constraint' : `met, ${DESIGNS[name].asked[i]} MHz asked`})`));
      assert.equal(sha(files['open/routed.json']), REF[name].routed, `${name}: the routed design is not the reference's`);
      const fsText = files[`${name}.fs`];
      assert.equal(fsText.length, REF[name].fsBytes);
      assert.equal(sha(fsText), REF[name].fs, `${name}: the .fs is not Apicula's`);
      // its warnings: none, but the oscillator's clock's fallbacks, as many as listed
      const warnings = log.filter(l => /warning/i.test(l));
      assert.deepEqual(warnings.filter(l => !FALLBACK.test(l)), []);
      assert.equal(warnings.length, DESIGNS[name].fallback || 0, warnings.join('\n'));
    });
  }
});

test('the charge pump: Apicula\'s calc_pll_pump\'s (input range, current, resistor) on the GW1N-9C and the GW2A-18', () => {
  // (calc_pll_pump(fref, fvco) run in Apicula 0.32 with device GW1N-9C)
  const want = [[27, 432, [16, 40, 4]], [9, 720, [16, 60, 5]], [25, 600, [16, 60, 4]], [27, 864, [16, 100, 4]], [3.2, 400, [16, 10, 7]],
    [100, 1200, [64, 170, 3]], [390, 1170, [208, 170, 2]]];
  for (const [fref, fvco, w] of want) assert.deepEqual(pllPump('GW1N-9C', fref, fvco), w, `${fref} ${fvco}`);
  assert.deepEqual(pllPump('GW2A-18', 27, 864), [16, 230, 3]);
  assert.throws(() => pllPump('GW1N-9C', 2, 400), /no charge pump for the PLL's reference 2 MHz and VCO 400 MHz/);
});

test('the rPLL\'s cells: three beside it on the GW1N-9C (towards the middle), one on the small GW1Ns', () => {
  assert.deepEqual(pllAuxCols('GW1N-9C', 1), [2, 3, 4]);
  assert.deepEqual(pllAuxCols('GW1N-9C', 47), [46, 45, 44]);
  assert.deepEqual(pllAuxCols('GW1N-1', 18), [19]);
  assert.deepEqual(pllAuxCols('GW1NS-4', 18), []);
});

test('the rPLL\'s and the oscillator\'s limits, refused as Apicula refuses them; a primitive not ported, by name', async () => {
  const db = await database();
  const parms = { FCLKIN: '27', IDIV_SEL: '0', FBDIV_SEL: '1', ODIV_SEL: '1000' };
  assert.ok(pllAttrs(db, 'GW1N-9C', parms).size > 10);
  // (Apicula's messages, its floats aside: 108.0MHz there)
  assert.throws(() => pllAttrs(db, 'GW1N-9C', { ...parms, ODIV_SEL: '10' }), /^Error: gowin_pack: VCO = FCLKIN\*\(FBDIV_SEL\+1\)\*ODIV_SEL\/\(IDIV_SEL\+1\) = 108MHz not in range 400 - 1200MHz$/);
  assert.throws(() => pllAttrs(db, 'GW1N-9C', { ...parms, FBDIV_SEL: '111111' }), /CLKOUT = FCLKIN\*\(FBDIV_SEL\+1\)\/\(IDIV_SEL\+1\) = 1728MHz not in range 3.125 - 600MHz$/);
  assert.throws(() => pllAttrs(db, 'GW1N-9C', { ...parms, IDIV_SEL: '111111' }), /CLKOUT = .* = 0.84375MHz not in range 3.125 - 600MHz$/);
  assert.throws(() => pllAttrs(db, 'GW1N-9C', { ...parms, IDIV_SEL: '1001' }), /PFD = FCLKIN\/\(IDIV_SEL\+1\) = 2.7MHz not in range 3.0 - 400MHz$/);
  // (an input frequency out of its range: 100 MHz, as gowin_pack takes it)
  assert.deepEqual([...pllAttrs(db, 'GW1N-9C', { ...parms, FCLKIN: '2', ODIV_SEL: '100' })], [...pllAttrs(db, 'GW1N-9C', { ...parms, FCLKIN: '100', ODIV_SEL: '100' })]);
  assert.throws(() => pllAttrs(db, 'GW5A-25A', parms), /^Error: gowin_pack: the rPLL of the GW5A-25A is not supported$/);
  // (the dividers dynamic: not checked)
  assert.ok(pllAttrs(db, 'GW1N-9C', { ...parms, ODIV_SEL: '10', DYN_ODIV_SEL: 'true' }).size > 10);
  assert.ok(oscAttrs(db, 'OSC', { FREQ_DIV: '1010' }).size > 0);
  assert.throws(() => oscAttrs(db, 'OSC', { FREQ_DIV: '11' }), /^Error: gowin_pack: Divisor of OSC must be even$/);
  // through gowin_pack: the oscillator of the GW1NZ-1 not ported, a primitive not ported refused by name
  const routed = JSON.parse((await build('osc2')).files['open/routed.json']);
  assert.throws(() => gowinPack(routed, db, 'GW1NZ-1'), /^Error: gowin_pack: the oscillator of the GW1NZ-1 is not supported yet \(u\)$/);
  routed.modules.top.cells.u.type = 'CLKDIV';
  assert.throws(() => gowinPack(routed, db), /^Error: gowin_pack: the primitive CLKDIV \(u\) is not supported yet$/);
});
