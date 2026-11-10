// micro80's test bench on its Post-Place & Route Simulation Model with its timing (SDF), VHDL and Verilog (#122), apart from
// the other examples' (test/sim-model-par-examples.test.js): the longest after vga's, a file of its own runs beside them
// (#3124).
import { test } from 'node:test';
import { exampleTimesim } from './timesim-lib.mjs';

test('example micro80: its test bench passes on the post-place & route model with its timing (SDF), VHDL and Verilog (#122)', { timeout: 1800000 }, () => exampleTimesim('micro80'));
