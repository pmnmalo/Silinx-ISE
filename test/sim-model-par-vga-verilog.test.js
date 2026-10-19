// vga's test bench on its post-place & route model with its timing (#122), the Verilog model: the VHDL one is
// in test/sim-model-par-vga.test.js, each two frames of simulation, in files that run alongside each other (#566).
import { test } from 'node:test';
import { exampleTimesim } from './timesim-lib.mjs';

test('example vga: its test bench passes on the post-place & route model with its timing (SDF), Verilog (#122)', { timeout: 1800000 }, () => exampleTimesim('vga', ['verilog']));
