// Every example's test bench on its Post-Place & Route Simulation Model with its timing (SDF), VHDL and Verilog (#122);
// split from test/sim-model-par.test.js, run beside it (#3124). micro80's, the longest after vga's, in
// test/sim-model-par-micro80.test.js.
import { test } from 'node:test';
import { exampleTimesim } from './timesim-lib.mjs';
import { EXAMPLES } from './examples-lib.mjs';

// every example's test bench, on the post-place & route model of the example (its generics the test bench's: the
// the longest, in test/sim-model-par-vga.test.js and test/sim-model-par-vga-verilog.test.js: run beside these)
// the longest, in test/sim-model-par-vga.test.js: run beside these)
for (const name of EXAMPLES.filter(n => n !== 'vga' && n !== 'micro80')) {
  test(`example ${name}: its test bench passes on the post-place & route model with its timing (SDF), VHDL and Verilog (#122)`, { timeout: 1800000 }, () => exampleTimesim(name));
}
