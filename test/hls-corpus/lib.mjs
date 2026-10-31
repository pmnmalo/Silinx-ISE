// The HLS corpus's runner (#1597, run.mjs), its pure parts: a design's unit (its design files and its test bench's
// sources included in one, the others headers), each stage's result (the C simulation, the C synthesis in VHDL and in
// Verilog, the co-simulation) as a status and its first reason, and the comparison with the expectations.
import { simulateC } from '../../core/c-interp.js';
import { cToHdl } from '../../core/c-hdl.js';
import { cosimulate } from '../../core/c-cosim.js';

export const STAGES = ['csim', 'synth', 'cosim'];

/** The unit of a design: { unit: '#include "…"' lines, headers: { path: text } } from its files' texts. */
export function unitOf(design, texts) {
  const srcs = [...design.files, ...design.tb].filter((f) => /\.(c|cc|cpp)$/.test(f));
  return { unit: srcs.map((f) => `#include "${f}"`).join('\n') + '\n', headers: texts };
}

const first = (diags) => diags.find((d) => d.severity === 'error');
const why = (d) => (d ? `${d.file && !/^unit\.c(pp)?$/.test(d.file) ? `${d.file.split('/').pop()}:` : ''}${d.line}: ${d.message}` : null);

/** A design through the stages: { csim, synth, cosim, latency, reason } (each 'pass', 'fail' or 'skip'). */
export function runDesign(design, texts, { maxCycles = 100000 } = {}) {
  const r = { csim: 'skip', synth: 'skip', cosim: 'skip', latency: null, reason: null };
  const { unit, headers } = unitOf(design, texts);
  // (a C++ design's unit is C++, #1590)
  const opts = { file: design.language === 'c' ? 'unit.c' : 'unit.cpp', headers, top: design.top, ...(design.blackbox ? { blackboxes: design.blackbox.descriptions.map((f) => ({ file: f, text: texts[f] })) } : {}), ...(design.directives ? { directives: design.directives } : {}) };
  const sim = simulateC(unit, { ...opts, files: texts });
  r.csim = sim.ok && sim.exitCode === 0 ? 'pass' : 'fail';
  if (r.csim === 'fail') r.reason ||= `C simulation: ${sim.error ? `${sim.error.line}: ${sim.error.message}` : sim.ok ? `main() returned ${sim.exitCode}` : why(first(sim.diagnostics))}`;
  const gens = ['vhdl', 'verilog'].map((lang) => cToHdl(unit, { ...opts, lang }));
  r.synth = gens.every((g) => g.ok) ? 'pass' : 'fail';
  if (r.synth === 'fail') r.reason ||= `C synthesis: ${why(first(gens.find((g) => !g.ok).diagnostics))}`;
  if (r.csim === 'pass' && r.synth === 'pass') {
    const c = cosimulate(unit, { ...opts, lang: 'vhdl', maxCycles });
    r.cosim = c.ok && c.pass ? 'pass' : 'fail';
    r.latency = c.latency;
    if (r.cosim === 'fail') r.reason ||= `co-simulation: ${c.errors[0] || `${c.mismatches.length} mismatch(es)`}`;
  }
  return r;
}

/** The differences between the results and the expectations: [{ name, stage, expected, got }]. */
export function compareExpectations(results, expected) {
  const out = [];
  for (const [name, r] of Object.entries(results)) {
    const e = expected[name];
    if (!e) { out.push({ name, stage: '*', expected: 'none', got: 'new design' }); continue; }
    for (const s of STAGES) if (e[s] !== r[s]) out.push({ name, stage: s, expected: e[s], got: r[s] });
  }
  return out;
}

/** The README's table of the results. */
export function table(manifest, results) {
  const L = ['| Design | Language | C simulation | C synthesis | Co-simulation | Latency | Why not |', '|---|---|---|---|---|---|---|'];
  for (const d of manifest.designs) {
    const r = results[d.name];
    if (!r) continue;
    const lat = r.latency ? (r.latency.min === r.latency.max ? `${r.latency.min}` : `${r.latency.min}-${r.latency.max}`) : '-';
    L.push(`| ${d.name} | ${d.language === 'c' ? 'C' : 'C++'} | ${r.csim} | ${r.synth} | ${r.cosim} | ${lat} | ${(r.reason || '').replace(/\|/g, '\\|')} |`);
  }
  const n = (s) => Object.values(results).filter((r) => r.cosim === s).length;
  L.push('', `${Object.keys(results).length} designs: ${n('pass')} through co-simulation.`);
  return L.join('\n');
}
