// The Gowin primitives' tests' harness (#2299: packages/silinx-hdl/src/gowin-prims.js): cases of a primitive's instance and
// its pins' values step by step, the outputs expected computed in the test (from Yosys's cells_sim.v's semantics and
// Gowin's guides, written again here), made into one test bench in Verilog and one in VHDL (`library gw1n;`), as a user
// instantiates them; each simulated with Silinx's models, its log exactly "done": no check failed, no warning.
import assert from 'node:assert/strict';
import { simulate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';

// a case: { name, cell, params: [[name, value]] (value: { bits: w, v } a vector, { int }, { str }, { bit }), pins: { PIN:
// { dir: 'in' | 'out' | 'inout', w } }, steps: [{ in: { PIN: value (a number, a BigInt, or 'z') }, out: { PIN: '0101' / 'x' …
// its bits, the first the highest } }] }: each step sets its inputs (the others keep theirs), waits 10 ns, checks its outputs
const STEP = 10;
const bitsOf = (v, w) => (typeof v === 'string' ? (v.length === 1 ? v.repeat(w) : v) : BigInt.asUintN(w, BigInt(v)).toString(2).padStart(w, '0'));

const vlogParam = ([k, p]) => `.${k}(${p.bits ? `${p.bits}'b${bitsOf(p.v, p.bits)}` : p.str !== undefined ? `"${p.str}"` : p.bit !== undefined ? `1'b${p.bit}` : p.int})`;
const vhdlParam = ([k, p]) => `${k} => ${p.bits ? `"${bitsOf(p.v, p.bits)}"` : p.str !== undefined ? `"${p.str}"` : p.bit !== undefined ? `'${p.bit}'` : p.int}`;
const vlogVal = (v, w) => `${w}'b${bitsOf(v, w)}`;
const vhdlVal = (v, w) => (w === 1 ? `'${bitsOf(v, 1).toUpperCase()}'` : `"${bitsOf(v, w).toUpperCase()}"`);
const steps = (cases) => Math.max(...cases.map((c) => c.steps.length));

/** The cases' test bench in Verilog (module tb_gowin). */
export function verilogBench(cases) {
  const lines = ['`timescale 1ns / 1ps', 'module tb_gowin;'];
  for (const [k, c] of cases.entries()) {
    for (const [p, { dir, w }] of Object.entries(c.pins)) {
      const r = w > 1 ? `[${w - 1}:0] ` : '';
      if (dir === 'in') lines.push(`  reg ${r}c${k}_${p} = 0;`);
      else if (dir === 'out') lines.push(`  wire ${r}c${k}_${p};`);
      else lines.push(`  wire ${r}c${k}_${p};`, `  reg ${r}c${k}_${p}_d = ${w}'bz;`, `  assign c${k}_${p} = c${k}_${p}_d;`);
    }
    const params = c.params?.length ? ` #(${c.params.map(vlogParam).join(', ')})` : '';
    lines.push(`  ${c.cell}${params} c${k} (${Object.keys(c.pins).map((p) => `.${p}(c${k}_${p})`).join(', ')});`);
    lines.push('  initial begin');
    for (const [j, s] of c.steps.entries()) {
      for (const [p, v] of Object.entries(s.in || {})) lines.push(`    c${k}_${p}${c.pins[p].dir === 'inout' ? '_d' : ''} = ${vlogVal(v, c.pins[p].w)};`);
      lines.push(`    #${STEP};`);
      for (const [p, v] of Object.entries(s.out || {})) {
        lines.push(`    if (c${k}_${p} !== ${vlogVal(v, c.pins[p].w)}) $display("ERROR ${c.name} step ${j}: ${p} = %b, expected ${bitsOf(v, c.pins[p].w)}", c${k}_${p});`);
      }
    }
    lines.push('  end');
  }
  lines.push(`  initial begin #${steps(cases) * STEP + 1}; $display("done"); end`, 'endmodule', '');
  return lines.join('\n');
}

/** The cases' test bench in VHDL (entity tb_gowin), the primitives from Gowin's library. */
export function vhdlBench(cases) {
  const sigs = [], insts = [], procs = [];
  const type = (w) => (w === 1 ? 'std_logic' : `std_logic_vector(${w - 1} downto 0)`);
  for (const [k, c] of cases.entries()) {
    for (const [p, { dir, w }] of Object.entries(c.pins)) sigs.push(`  signal c${k}_${p} : ${type(w)}${dir === 'in' ? ` := ${w === 1 ? "'0'" : '(others => \'0\')'}` : ''};`);
    const gm = c.params?.length ? ` generic map (${c.params.map(vhdlParam).join(', ')})` : '';
    insts.push(`  c${k} : ${c.cell}${gm} port map (${Object.keys(c.pins).map((p) => `${p} => c${k}_${p}`).join(', ')});`);
    const body = [];
    if (Object.values(c.pins).some((x) => x.dir === 'inout')) {
      for (const [p, x] of Object.entries(c.pins)) if (x.dir === 'inout') body.push(`    c${k}_${p} <= ${x.w === 1 ? "'Z'" : "(others => 'Z')"};`);
    }
    for (const [j, s] of c.steps.entries()) {
      for (const [p, v] of Object.entries(s.in || {})) body.push(`    c${k}_${p} <= ${vhdlVal(v, c.pins[p].w)};`);
      body.push(`    wait for ${STEP} ns;`);
      for (const [p, v] of Object.entries(s.out || {})) body.push(`    assert c${k}_${p} = ${vhdlVal(v, c.pins[p].w)} report "ERROR ${c.name} step ${j}: ${p} is not ${bitsOf(v, c.pins[p].w)}" severity error;`);
    }
    procs.push(`  process\n  begin\n${body.join('\n')}\n    wait;\n  end process;`);
  }
  return `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
library gw1n; use gw1n.components.all;
entity tb_gowin is
end tb_gowin;
architecture test of tb_gowin is
${sigs.join('\n')}
begin
${insts.join('\n')}
${procs.join('\n')}
  process
  begin
    wait for ${steps(cases) * STEP + 1} ns;
    report "done";
    wait;
  end process;
end test;
`;
}

/** The cases simulated in both languages (langs): each log exactly "done" (no check failed, no warning), the Gowin library alone. */
export function checkCases(cases, label = '', langs = ['verilog', 'vhdl']) {
  for (const [lang, path, text] of [['verilog', 'tb_gowin.v', verilogBench(cases)], ['vhdl', 'tb_gowin.vhd', vhdlBench(cases)]].filter(([l]) => langs.includes(l))) {
    const srcs = [{ path, lang, text }];
    const prims = primitiveSources(srcs);
    assert.deepEqual(prims.map((s) => s.path), ['<silinx>/gowin.vhd'], `${label} ${lang}`);
    const r = simulate([...prims, ...srcs], 'tb_gowin', { until: (steps(cases) * STEP + 5) * 1e6 });
    assert.deepEqual([...r.lib.errors, ...r.design.diags].map((d) => `${d.file}:${d.line} ${d.message}`), [], `${label} ${lang}`);
    assert.deepEqual(r.sim.log.map((e) => `${e.kind === 'warning' ? 'WARNING: ' : ''}${e.text}`), ['done'], `${label} ${lang}`);
  }
}

/** A pseudo-random generator (seeded): next() an integer below n. */
export function rng(seed) {
  let s = seed >>> 0;
  return (n) => { s = (s * 1664525 + 1013904223) >>> 0; return Math.floor((s / 2 ** 32) * n); };
}
const bit = (x, i) => Number((BigInt(x) >> BigInt(i)) & 1n);
export { bit, bitsOf };
