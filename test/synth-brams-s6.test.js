// Tests: the Spartan-6's inferred block RAMs whole (packages/silinx-fpga/src/synth-brams-s6.js, #2130): synth_xilinx's
// memory step on Yosys's rule without the 9K halves (RAMB8BWER, which ISE's DRC warns of: PhysDesignRules:2410)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowFrontEnd } from '../core/synth-front.js';
import { synthesizeVerilog, outputs, yosysFiles } from '../packages/silinx-fpga/src/synth-open.js';
import { s6SynthCommands, BRAMS_S6, BRAMS_S6_FILE } from '../packages/silinx-fpga/src/synth-brams-s6.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { asText } from '../packages/silinx-fpga/src/synth-open-yosys.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const example = name => {
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples', name, 'silinx.json'), 'utf8'));
  const srcs = p.files.filter(f => (f.role ?? 'design') === 'design' && /vhdl|verilog/.test(f.lang))
    .map(f => ({ path: f.path, lang: f.lang, text: fs.readFileSync(path.join(ROOT, 'examples', name, f.path), 'utf8') }));
  return flowFrontEnd(srcs, p.top).input();
};
const types = (json, top) => {
  const c = {};
  for (const x of Object.values(JSON.parse(asText(json)).modules[top].cells)) c[x.type] = (c[x.type] || 0) + 1;
  return c;
};
const synthJson = async (text, top, cmds, files = {}) =>
  asText((await yosysNode(['-q', '-p', `read_verilog -sv ${top}_syn.v; ${cmds}; ${outputs(top)}`], { [`${top}_syn.v`]: text, ...files }))[`${top}.json`]);

test('the rule: Yosys\'s Spartan-6 block RAM, its whole mode alone (no MODE "HALF", no simple dual-port 9K block)', () => {
  assert.match(BRAMS_S6, /option "MODE" "FULL" \{\n\t\tabits 14;/);
  assert.doesNotMatch(BRAMS_S6, /HALF|abits 13|\$__XILINX_BLOCKRAM_SDP_/);
  assert.equal(yosysFiles('m', '')[BRAMS_S6_FILE], BRAMS_S6);
});

// Regression (#2130): the stopwatch's lap memory (512 x 14) was a RAMB8BWER on the Nexys3 and the Atlys
test('the stopwatch\'s lap memory on the Spartan-6: one RAMB16BWER, no RAMB8BWER, no warning', { timeout: 300000 }, async () => {
  const r = await synthesizeVerilog(example('stopwatch'), { family: 'spartan6', run: yosysNode });
  const c = types(r.files[`${r.top}.json`], r.top);
  assert.equal(c.RAMB16BWER, 1);
  assert.equal(c.RAMB8BWER, undefined);
  assert.deepEqual(r.warnings, []);
});

// The reference: synth_xilinx -family xc6s whole. The same steps on Yosys's own rule give its netlist byte for byte (the
// split changes nothing), and on Silinx's rule too for a design with no memory a 9K half would take
test('the memory step split out of synth_xilinx: the same netlist as synth_xilinx whole (blinky, clock; the stopwatch on Yosys\'s rule)', { timeout: 300000 }, async () => {
  for (const name of ['blinky', 'clock', 'stopwatch']) {
    const { text, top } = example(name);
    const synth = `synth_xilinx -family xc6s -ise -flatten -top ${top}`;
    const whole = await synthJson(text, top, synth);
    const yosysRule = s6SynthCommands(synth).replace(`-lib ${BRAMS_S6_FILE}`, '-lib +/xilinx/brams_xc3sda.txt');
    assert.equal(await synthJson(text, top, yosysRule), whole, name);
    if (name !== 'stopwatch') assert.equal(await synthJson(text, top, s6SynthCommands(synth), { [BRAMS_S6_FILE]: BRAMS_S6 }), whole, name);
    else assert.equal(types(whole, top).RAMB8BWER, 1);
  }
});

test('a RAMB8BWER the design instantiates stays one', { timeout: 120000 }, async () => {
  const text = `module m(input clk, input [12:0] a, output [31:0] q);
  RAMB8BWER #(.DATA_WIDTH_A(36), .DATA_WIDTH_B(36), .RAM_MODE("SDP")) r (.CLKAWRCLK(clk), .CLKBRDCLK(clk), .ENAWREN(1'b1), .ENBRDEN(1'b1),
    .ADDRAWRADDR(a), .ADDRBRDADDR(a), .WEAWEL(2'b0), .WEBWEU(2'b0), .DIADI(16'b0), .DIBDI(16'b0), .DOADO(q[15:0]), .DOBDO(q[31:16]));
endmodule
`;
  const synth = 'synth_xilinx -family xc6s -ise -flatten -top m';
  assert.equal(types(await synthJson(text, 'm', s6SynthCommands(synth), { [BRAMS_S6_FILE]: BRAMS_S6 }), 'm').RAMB8BWER, 1);
});
