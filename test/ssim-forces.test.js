// SSim's times, values and forces in core/ (#2674: core/ssim-values.js out of web/js/isim.js, core/ssim-forces.js out of
// web/js/isim-forces.js, moved as they were, so that the server forces signals too): the times and values typed, in
// every radix and literal; a signal and an instance by their path; a forced value and a forced clock run in the
// simulator, released at their end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { UNITS, parseTime, parseValue } from '../core/ssim-values.js';
import { findInstIn, findSignalIn, injectForceIn, normPath } from '../core/ssim-forces.js';

test('parseTime: a time with its unit, ns by default', () => {
  assert.deepEqual(UNITS, { fs: 1e-3, ps: 1, ns: 1e3, us: 1e6, ms: 1e9 });
  assert.equal(parseTime('10 ns'), 10000);
  assert.equal(parseTime('1.5us'), 1500000);
  assert.equal(parseTime('20'), 20000);
  assert.equal(parseTime('3', 'ps'), 3);
  assert.equal(parseTime('2 s'), 2e12);
  assert.ok(Number.isNaN(parseTime('soon')));
});

test('parseValue: binary, hex, decimal, VHDL and Verilog literals, x and z, an enumeration, a boolean', () => {
  const bits = (text, t, radix) => V.toBin(parseValue(text, t, radix));
  const w8 = { kind: 'logic', w: 8 }, w4 = { kind: 'logic', w: 4 };
  assert.equal(bits('1010', w4), '1010');
  assert.equal(bits('0x1F', w8), '00011111');
  assert.equal(bits('x"0F"', w8), '00001111');
  assert.equal(bits("8'hA5", w8), '10100101');
  assert.equal(bits('12', w8, 'dec'), '00001100');
  assert.equal(bits('-1', w4, 'dec'), '1111');
  assert.equal(bits('z', w4), 'zzzz');
  assert.equal(bits('X', w4), 'xxxx');
  assert.equal(V.toDec(parseValue('RUN', { kind: 'enum', w: 2, names: ['IDLE', 'RUN', 'DONE'] }), false), '1');
  assert.equal(V.toBin(parseValue('true', { kind: 'bool', w: 1 })), '1');
  assert.throws(() => parseValue('', w4), /empty value/);
  assert.throws(() => parseValue('12', w4, 'bin'), /invalid bin digit '2'/);
});

const SRC = [{ path: 'a.v', lang: 'verilog', text: 'module inner(input a, output y);\n  assign y = ~a;\nendmodule\nmodule top;\n  reg clk = 0, d = 0;\n  wire q;\n  inner u(.a(d), .y(q));\nendmodule\n' }];

test('findSignalIn / findInstIn: by an absolute or a relative path, a port its parent\'s signal', () => {
  const design = elaborate(compile(SRC), 'top');
  assert.equal(normPath('/top/u/a'), 'top.u.a');
  assert.equal(findSignalIn(design, 'clk')?.name, 'clk');
  assert.equal(findSignalIn(design, '/top/d')?.name, 'd');
  const u = findInstIn(design, 'top.u');
  assert.equal(u?.name, 'u');
  // u's port a is d; relative to the selected instance u
  assert.equal(findSignalIn(design, 'top.u.a'), findSignalIn(design, 'd'));
  assert.equal(findSignalIn(design, 'a', u), findSignalIn(design, 'd'));
  assert.equal(findSignalIn(design, 'nosuch'), null);
});

test('injectForceIn: a constant from 10 ns (released at 50 ns: a reg nothing drives keeps it), a clock every 20 ns until 100 ns', () => {
  const design = elaborate(compile(SRC), 'top');
  const sim = new Simulator(design);
  const d = findSignalIn(design, 'd'), clk = findSignalIn(design, 'clk'), q = findSignalIn(design, 'q');
  injectForceIn(sim, design, { sig: d, pattern: [{ off: 0, val: V.ONE }], start: 10000, repeat: 0, end: 50000, endRelease: true });
  injectForceIn(sim, design, { sig: clk, pattern: [{ off: 0, val: V.ONE }, { off: 10000, val: V.ZERO }], start: 0, repeat: 20000, end: 100000, endRelease: true });
  sim.run(200000);
  const edges = w => w.t.map((t, i) => `${t / 1000}:${V.toBin(w.v[i])}`);
  // (released at 50 ns, d keeps its value: a reg nothing drives)
  assert.deepEqual(edges(d.wave), ['0:0', '10:1']);
  assert.deepEqual(edges(q.wave), ['0:1', '10:0']);
  assert.equal(d.forced, null);
  assert.equal(clk.wave.t.filter((t, i) => V.toBin(clk.wave.v[i]) === '1' && t < 100000).length, 5);
});
