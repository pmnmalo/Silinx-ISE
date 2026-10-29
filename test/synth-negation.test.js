// A negation that wraps at its own width, read by a wider one (#743, the Nightly's VlogHammer wideexpr_24040):
// Yosys 0.70's alumacc, after wreduce, merged the inner $neg into the outer at the outer's width, so
// -($signed(-x)) for x = -16 at 5 bits came out -16 (0xfff0) instead of 16 (0x0010). core/synth-verilog.js writes
// -x as 0 - x, a subtraction, which Yosys keeps at its width. The value is checked by hand (IEEE 1364: the operand of $signed is
// self-determined, the outer minus is context-determined, 16 bits here), and the netlist against the RTL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate, simulate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { toVerilog } from '../core/synth-verilog.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { compareNetlist } from './diff-synth.js';

const DUT = `module neg(input signed [4:0] s4, input signed [4:0] a, output [15:0] y4, output [15:0] y5, output [15:0] y6);
  assign y4 = -($signed(-((s4)^~(4'sb1110))));   // wideexpr_24040's expression
  assign y5 = $signed(5'(-a)) + 16'sd0;          // a wrapped negation read by a sum
  assign y6 = -(5'(-a));                         // the same through a size cast (signed: the cast keeps it)
endmodule`;

test('#743 a negation that wraps at 5 bits, read at 16: the value by hand, the simulator, and the netlist at both efforts', { timeout: 300000 }, async () => {
  const TB = `module tb; reg signed [4:0] s4, a; wire [15:0] y4, y5, y6;
    neg u(.s4(s4), .a(a), .y4(y4), .y5(y5), .y6(y6));
    initial begin s4 = 5'b10001; a = -5'sd16; #1 $display("%h %h %h", y4, y5, y6); end
  endmodule`;
  // by hand: s4 ^~ 11110 = 10000; -(10000) at 5 bits = 10000 (-16); $signed: -16; -(-16) at 16 bits = 16;
  // -(-16) at 5 bits wraps to -16: y5 = 0xfff0 (sign-extended); y6: 5'(-a) is -16, signed (a size cast keeps the
  // signedness), -(-16) at 16 bits = 16
  const r = simulate([{ path: 'neg.v', text: DUT }, { path: 'tb.v', text: TB }], 'tb', { until: 1e6 });
  assert.deepEqual(r.errors.map(e => e.message), []);
  assert.deepEqual(r.sim.log.filter(l => l.kind === 'print').map(l => l.text), ['0010 fff0 0010']);
  // the synthesis's text: -x as 0 - x (signed: 'sd0)
  const design = elaborate(compile([{ path: 'neg.v', lang: 'verilog', text: DUT }]), 'neg');
  const v = toVerilog(design).text;
  assert.doesNotMatch(v, /'\(-\(/, 'no unary minus left for Yosys');
  assert.match(v, /5'\(5'sd0 - \(.*\)\)/);
  for (const effort of ['normal', 'high']) {
    const s = await synthesizeOpen(design, { run: yosysNode, effort });
    assert.deepEqual(s.warnings, [], effort);
    const c = compareNetlist(design, s, { name: 'neg', sim: { cycles: 200 } });
    assert.equal(c.status, 'pass', `${effort}: ${c.report || c.reason}`);
  }
});
