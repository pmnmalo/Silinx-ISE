// vga's test bench on its post-place & route model with its timing (#122), apart from the other examples'
// (test/sim-model-par.test.js): its two frames take the longest, and a file of its own runs beside them. The
// VHDL model here, the Verilog one in test/sim-model-par-vga-verilog.test.js (#566).
import { test } from 'node:test';
import { exampleTimesim } from './timesim-lib.mjs';

test('example vga: its test bench passes on the post-place & route model with its timing (SDF), VHDL (#122)', { timeout: 1800000 }, () => exampleTimesim('vga', ['vhdl']));
