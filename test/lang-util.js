// Shared helpers for the language conformance suites (test/lang-*.test.js).
// Not a test file itself (the runner only picks up *.test.js).
import assert from 'node:assert/strict';
import { simulate, compile } from '../core/compile.js';

// Simulate a set of sources ({ path: text } or a single text) and return the log.
//   out:    the texts of prints and reports, in order
//   lines:  "<time ps> <kind> <text>" for every log entry (kind: print/note/warning/error/failure)
//   r:      the raw simulate() result (lib, design, sim, status)
// Fails the test on any compile/elaboration error and on runtime errors whose text does not
// start with EXP (reports with severity error that the test expects).
export function sim(src, top = 'tb', { until = 1e9, lang, allowErrors = false, files } = {}) {
  const sources = typeof src === 'string'
    ? [{ path: (lang || (/\bentity\b/i.test(src) ? 'vhdl' : 'verilog')) === 'verilog' ? 't.v' : 't.vhd', text: src }]
    : Object.entries(src).map(([path, text]) => ({ path, text }));
  const r = simulate(sources, top, { until, files });
  assert.deepEqual(r.errors.map(e => `${e.file || ''}:${e.line}: ${e.message}`), [], 'compile errors');
  const log = r.sim.log;
  if (!allowErrors) {
    const bad = log.filter(l => (l.kind === 'error' || l.kind === 'failure') && !/^EXP/.test(l.text));
    assert.deepEqual(bad.map(e => e.text), [], 'runtime errors');
  }
  return {
    out: log.filter(l => l.kind !== 'note' || !/^simulation (finished|stopped)/.test(l.text)).map(l => l.text),
    lines: log.map(l => `${l.time} ${l.kind} ${l.text}`),
    log, r, sim: r.sim, design: r.design,
  };
}

// Output lines only (prints and reports).
export const out = (src, top, opts) => sim(src, top, opts).out;

// Compile + elaborate only; return all diagnostics (errors and warnings) as
// { severity, line, col, message, file }.
export function diags(src, top = 'tb', { lang } = {}) {
  const sources = typeof src === 'string'
    ? [{ path: (lang || (/\bentity\b/i.test(src) ? 'vhdl' : 'verilog')) === 'verilog' ? 't.v' : 't.vhd', text: src }]
    : Object.entries(src).map(([path, text]) => ({ path, text }));
  const lib = compile(sources);
  const all = [...lib.errors];
  if (!lib.errors.some(e => e.severity === 'error') && top) {
    const r = simulate(sources, top, { until: 0 });
    all.push(...r.design.diags);
  }
  return all.map(d => ({ severity: d.severity, line: d.line, col: d.col, message: d.message, file: d.file }));
}

// VHDL testbench skeleton: `decls` go in the architecture declarative part, `body` is the
// concurrent part, `ctx` extra context clauses, `pre` extra design units before the testbench.
export const vhd = (body, decls = '', { ctx = '', pre = '' } = {}) => `${pre}
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all; ${ctx}
entity tb is end;
architecture sim of tb is
${decls}
begin
${body}
end;`;

// VHDL: a single process with the given variable declarations and statements (ends with wait).
export const vproc = (stmts, decls = '', adecls = '', opts) => vhd(`
  process
${decls}
  begin
${stmts}
    wait;
  end process;`, adecls, opts);

// Verilog: module tb with the given body.
export const vlog = (body) => `module tb;\n${body}\nendmodule\n`;
// Verilog: an initial block with the given statements (ends with $finish).
export const vinit = (stmts, decls = '') => vlog(`${decls}\ninitial begin\n${stmts}\n$finish;\nend`);
