// Helpers of the HDL to C tests (#1530): a design's C model (core/hdl-c.js) compiled with cc and run on input vectors,
// and the same vectors through Silinx's simulator (a Verilog test bench instancing the design): their outputs, cycle by
// cycle, to be compared. The model is compiled with the undefined-behaviour sanitizer (not on Windows): C that is not
// C's (a shift by a negative amount, #1530) stops the run, whatever the compiler would make of it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { compile, elaborate, simulate } from '../core/compile.js';
import { hdlToC } from '../core/hdl-c.js';
import { CC, lf } from './c-helpers.js';

const mask = (w) => (1n << BigInt(w)) - 1n;

/** The design's C model and its run on vectors (one per cycle: { input: BigInt }): its outputs' lines, in hex. */
export function runModel(sources, top, vectors) {
  const design = elaborate(compile(sources), top);
  const m = hdlToC(design);
  const set = (v) => m.inputs.filter((i) => i.name !== m.clock).map((i) => `s.${i.name} = 0x${(BigInt(v[i.name] ?? 0n) & mask(i.w)).toString(16)}ULL;`).join(' ');
  const show = m.outputs.map(() => '%llx').join(' ');
  const args = m.outputs.map((o) => `(unsigned long long)s.${o.name}`).join(', ');
  const main = `\n#include <stdio.h>\nint main(void) {\n  ${m.top}_t s; ${m.top}_init(&s);\n${vectors.map((v) => `  ${set(v)} ${m.clock ? `${m.top}_step(&s);` : `${m.top}_eval(&s);`} printf("${show}\\n", ${args});`).join('\n')}\n  return 0;\n}\n`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-hc-'));
  try {
    fs.writeFileSync(path.join(dir, 'm.c'), m.text + main);
    const exe = path.join(dir, process.platform === 'win32' ? 'm.exe' : 'm');
    execFileSync(CC, ['-std=c99', '-Wall', '-Werror', '-Wno-unused-function', '-O1', ...(process.platform !== 'win32' ? ['-fsanitize=undefined', '-fno-sanitize-recover=all'] : []), '-o', exe, path.join(dir, 'm.c')], { stdio: ['ignore', 'ignore', 'pipe'] });
    return { model: m, lines: lf(execFileSync(exe, { encoding: 'utf8' })).trim().split('\n') };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** The same vectors through Silinx's simulator: a Verilog test bench (inputs set, the clock's rising edge, the outputs). */
export function runSim(sources, top, model, vectors) {
  const ports = [...model.inputs, ...model.outputs];
  const L = ['module ap_tb;'];
  for (const p of model.inputs) L.push(`  reg ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name} = 0;`);
  for (const p of model.outputs) L.push(`  wire ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name};`);
  L.push(`  ${top} dut(${ports.map((p) => `.${p.name}(${p.name})`).join(', ')});`, '  initial begin');
  for (const v of vectors) {
    L.push(`    ${model.inputs.filter((i) => i.name !== model.clock).map((i) => `${i.name} = ${i.w}'h${(BigInt(v[i.name] ?? 0n) & mask(i.w)).toString(16)};`).join(' ')}`);
    if (model.clock) L.push(`    #5 ${model.clock} = 1; #1;`); else L.push('    #1;');
    L.push(`    $display("${model.outputs.map(() => '%h').join(' ')}", ${model.outputs.map((o) => o.name).join(', ')});`);
    if (model.clock) L.push(`    #4 ${model.clock} = 0;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  const r = simulate([...sources, { path: 'ap_tb.v', text: L.join('\n') }], 'ap_tb', { until: 1e15 });
  if (r.errors.length) throw new Error(r.errors.map((e) => `${e.file}:${e.line} ${e.message}`).join('; '));
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => s && !/finished/.test(s)).map((s) => s.split(/\s+/).map((x) => (/[xz]/i.test(x) ? x : BigInt(`0x${x}`).toString(16))).join(' '));
}
