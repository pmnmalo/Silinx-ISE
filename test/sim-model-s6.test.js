// Every example's test bench passes on its Post-Synthesis Simulation Model synthesized for the Spartan-6 (#720: the
// XC6SLX16 of the Nexys3; its netlist of LUT6, CARRY4, MUXF7 / MUXF8, DSP48A1, RAMB8BWER…), in VHDL and in Verilog,
// with no warnings, and the Board Emulator's compiled engine runs the model as the event-driven simulator does; the
// vga example in a file of its own, test/sim-model-s6-vga.test.js (#566); micro80 not yet: its processor's distributed
// RAM (RAM32M), not written whole by the Spartan-6's synthesis (#1153).
import { S6_EXAMPLES } from './examples-lib.mjs';
import { examplePostSynthTests } from './sim-model-lib.mjs';

examplePostSynthTests(S6_EXAMPLES.filter(name => name !== 'vga'), { part: 'xc6slx16csg324-3', family: 'spartan6' });
