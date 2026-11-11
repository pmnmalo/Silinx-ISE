// A top module whose name Yosys's script would read as more words (#3416): a VHDL extended identifier holding a space
// and a ';' is refused, with its message, before the compiled simulator's or the open synthesis's script is written;
// Yosys is never run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designOf } from './compiled-diff.js';
import { compileDesign } from '../core/compiled-sim.js';
import { synthesizeOpen } from '../core/synth-front.js';

const TOP = '\\t; tee -o x.txt help; \\';
const SRC = [{ path: 'a.vhd', lang: 'vhdl', text: String.raw`library ieee; use ieee.std_logic_1164.all;
entity ${TOP} is port (a : in std_logic; y : out std_logic); end;
architecture rtl of ${TOP} is begin y <= not a; end;` }];
// (its name in the Verilog Yosys reads: the extended identifier escaped, \\t; …\)
const MESSAGE = "the top module's name '\\\\t; tee -o x.txt help; \\' holds a space or a control character, which Yosys's script cannot name: rename the module";
const run = async () => { throw new Error('Yosys run'); };

test('#3416 the compiled simulator refuses a top whose name holds a space, before Yosys runs', async () => {
  await assert.rejects(compileDesign(designOf(SRC, TOP), { run }), { message: MESSAGE });
});

test('#3416 the open synthesis refuses a top whose name holds a space, before Yosys runs', async () => {
  await assert.rejects(synthesizeOpen(designOf(SRC, TOP), { run }), { message: MESSAGE });
});
