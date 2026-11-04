// Silinx HLS's report and options in core/ (#2674: core/c-report.js out of web/js/c-source.js, moved as they were, so that
// the server reports them too): the clock of a board's oscillator, the device's family delays, the multiplier blocks
// (#2783: null today, a part's name where a record is needed); View C Synthesis Report's lines of the test designs'
// C functions, and its warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cToHdl } from '../core/c-hdl.js';
import { cReportLines, hlsClockOf, hlsFamilyOf, hlsMultsOf } from '../core/c-report.js';
import { resolveBoard } from '../server/devices.js';

test('hlsClockOf / hlsFamilyOf / hlsMultsOf: the board\'s oscillator, the family\'s delays, the multiplier blocks', () => {
  assert.equal(hlsClockOf(resolveBoard('basys2').board), 20);
  assert.equal(hlsClockOf(resolveBoard('nexys3').board), 10);
  assert.equal(hlsClockOf(null), 20);
  assert.equal(hlsFamilyOf({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }), 'spartan3e');
  assert.equal(hlsFamilyOf(null), 'artix7');
  // (#2783: the device's count is meant; today none, the limit not applied)
  assert.equal(hlsMultsOf({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }), null);
  assert.equal(hlsMultsOf(null), null);
});

test('cReportLines: the C Synthesis Report of fir and gcd', () => {
  for (const [d, regs] of [['fir', 418], ['gcd', 130]]) {
    const path = `src/${d}.c`;
    const r = cToHdl(fs.readFileSync(new URL(`../test-designs/${d}/${path}`, import.meta.url), 'utf8'), { file: path, lang: 'vhdl', clock: 20, family: 'spartan3e', mults: null });
    assert.ok(r.ok, d);
    const { lines, warnings } = cReportLines(r, { path, lang: 'vhdl', clock: 20 });
    assert.deepEqual(lines.slice(0, 4), [`C Synthesis Report of '${d}' (${path}, VHDL)`, '',
      `Module: sequential, ap_ctrl_hs (ap_clk, ap_rst, ap_start / ap_done / ap_idle / ap_ready), 4 states, ${regs} register bits`, 'Target clock: 20 ns (the board\'s oscillator)']);
    assert.ok(lines.includes('Ports:'), d);
    assert.ok(lines.some(l => /^ {2}ap_clk +in +1 bit$/.test(l)), d);
    assert.deepEqual(warnings, []);
  }
});

test('cReportLines: a pipelined loop too slow for the clock, its warning', () => {
  const src = 'int f(int a[8], int b[8]) {\n  int s = 0;\n  for (int i = 0; i < 8; i++) {\n#pragma HLS PIPELINE II=1\n    s += a[i] * b[i] * a[i] * b[i];\n  }\n  return s;\n}\n';
  const r = cToHdl(src, { file: 'src/f.c', lang: 'verilog', clock: 2, family: 'spartan3e' });
  assert.ok(r.ok);
  const { lines, warnings } = cReportLines(r, { path: 'src/f.c', lang: 'verilog', clock: 2 });
  assert.equal(lines[0], 'C Synthesis Report of \'f\' (src/f.c, Verilog)');
  assert.ok(warnings.length >= 1 && warnings.every(w => /^WARNING:SilinxC - "src\/f\.c"/.test(w)), warnings.join('\n'));
});
