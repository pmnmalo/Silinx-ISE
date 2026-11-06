// Silinx HLS's report and options in core/ (#2674: core/c-report.js out of web/js/c-source.js, moved as they were, so that
// the server reports them too): the clock of a board's oscillator, the device's family delays, the multiplier blocks
// (#2783: the device's, from its part record; a C function with more multiplications than the device has blocks
// scheduled within them, co-simulated in VHDL and in Verilog); View C Synthesis Report's lines of the test designs'
// C functions, and its warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cToHdl } from '../core/c-hdl.js';
import { cReportLines, hlsClockOf, hlsFamilyOf, hlsMultsOf } from '../core/c-report.js';
import { cosimulate } from '../core/c-cosim.js';
import { resolveBoard, findPart } from '../server/devices.js';

test('hlsClockOf / hlsFamilyOf / hlsMultsOf: the board\'s oscillator, the family\'s delays, the multiplier blocks', () => {
  assert.equal(hlsClockOf(resolveBoard('basys2').board), 20);
  assert.equal(hlsClockOf(resolveBoard('nexys3').board), 10);
  assert.equal(hlsClockOf(null), 20);
  assert.equal(hlsFamilyOf({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }), 'spartan3e');
  assert.equal(hlsFamilyOf(null), 'artix7');
  assert.equal(hlsMultsOf(null), null);
});

// #2783: the device's multiplier blocks from its part record (resourceCount threw on the part's name: no limit)
const DEV = (part, family = 'spartan3e') => ({ family, part });
test('#2783 hlsMultsOf: the device\'s MULT18X18s or DSP48A1s, from its part record', () => {
  for (const [part, n] of [['xc3s100e', 4], ['xc3s250e', 12], ['xc3s500e', 20], ['xc3s1200e', 28]]) assert.equal(hlsMultsOf(DEV(part), findPart(part)), n, part);
  for (const [part, n] of [['xc6slx16', 32], ['xc6slx45', 58]]) assert.equal(hlsMultsOf(DEV(part, 'spartan6'), findPart(part)), n, part);
  // (no record, no device: no limit)
  assert.equal(hlsMultsOf(DEV('xc3s250e')), null);
  assert.equal(hlsMultsOf(DEV('xc3s250e'), null), null);
  assert.equal(hlsMultsOf(null, findPart('xc3s250e')), null);
});

// (six multiplications in one state: six blocks with no limit)
const SIX = 'int six(short a, short b, short c, short d, short e, short g) {\n  return a * b + c * d + e * g + a * c + b * d + e * a;\n}\n';
const SIX_TB = `${SIX}int main() {\n  int e = 0;\n  for (int i = -3; i < 4; i++) if (six(i * 1000, 7 - i, i - 20000, 300, -i, 12345) != (i * 1000) * (7 - i) + (i - 20000) * 300 + (-i) * 12345 + (i * 1000) * (i - 20000) + (7 - i) * 300 + (-i) * (i * 1000)) e++;\n  return e;\n}\n`;
test('#2783 a C function with more multiplications than the Basys2-100\'s 4 MULT18X18s: within them, co-simulated, no warnings', () => {
  const opts = { file: 't.c', top: 'six', clock: 20, family: 'spartan3e' };
  assert.equal(cToHdl(SIX, { ...opts, mults: null }).report.blocks, 6);
  const mults = hlsMultsOf(DEV('xc3s100e'), findPart('xc3s100e'));
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(SIX, { ...opts, lang, mults });
    assert.deepEqual(g.diagnostics, [], lang);
    assert.equal(g.report.blocks, 4, lang);
    assert.deepEqual(g.report.units.map((u) => u.uses), [2, 2, 1, 1], lang);
    const c = cosimulate(SIX_TB, { ...opts, lang, mults });
    assert.deepEqual([c.ok, c.pass, c.gen.diagnostics], [true, true, []], lang);
  }
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
