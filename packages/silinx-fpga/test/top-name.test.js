// The top module's name in a Yosys script (src/top-name.js, #3416): a name with a space or a control character is
// refused, with its message, by the synthesis and a script's synthesis before Yosys runs; a plain or an escaped
// Verilog name (no space) passes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scriptTopError, synthesizeVerilog } from '../src/index.js';
import { scriptSynthesis } from '../src/synth-script.js';

const run = async () => { throw new Error('Yosys run'); };

test('#3416 scriptTopError: a space, a tab, a new line or a control character refused; a plain or escaped name passes', () => {
  assert.equal(scriptTopError('blinky'), null);
  assert.equal(scriptTopError(String.raw`\t;x`), null);
  assert.equal(scriptTopError('\\a; b\\'), "the top module's name '\\a; b\\' holds a space or a control character, which Yosys's script cannot name: rename the module");
  assert.equal(scriptTopError('a\tb'), "the top module's name 'a?b' holds a space or a control character, which Yosys's script cannot name: rename the module");
  assert.equal(scriptTopError('a\nhelp'), "the top module's name 'a?help' holds a space or a control character, which Yosys's script cannot name: rename the module");
  assert.equal(scriptTopError(''), "the top module's name '' holds a space or a control character, which Yosys's script cannot name: rename the module");
});

test('#3416 synthesizeVerilog and a script\'s synthesis refuse such a top before Yosys runs', async () => {
  const input = { text: 'module \\a; b (); endmodule', top: 'a; tee -o x help' };
  const message = "the top module's name 'a; tee -o x help' holds a space or a control character, which Yosys's script cannot name: rename the module";
  await assert.rejects(synthesizeVerilog(input, { run }), { message });
  await assert.rejects(scriptSynthesis({ script: top => `synth -top ${top}` })(input, { run }), { message });
});
