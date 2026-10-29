// Front-end driver: parse a set of sources and build the library; elaborate a top.
import { parse as parseVerilog } from './verilog/parser.js';
import { parse as parseVhdl } from './vhdl/parser.js';
import { buildLibrary, elaborate, topCandidates } from './elaborate.js';
import { Simulator } from './simulator.js';
import { MATH_REAL_SOURCE, usesMathReal } from './vhdl/math-real.js';

export function langOfPath(p) {
  return /\.(vhd|vhdl)$/i.test(p) ? 'vhdl' : /\.(v|vh|sv)$/i.test(p) ? 'verilog' : null;
}

// sources: [{ path, text, lang?, role? }]
// A parser that throws (a bug of Silinx's, not of the design) is the file's error: the project still
// opens, and the message names the file instead of failing the whole compile (#395).
function parseOne(lang, s, parse) {
  try { return parse(); } catch (e) {
    return { lang, file: s.path, units: [], errors: [{ file: s.path, line: 1, col: 1, message: `internal error reading this file: ${e.message}`, severity: 'error' }] };
  }
}

export function compile(sources) {
  // ieee.math_real: its VHDL part (constants, UNIFORM) compiled with the design that uses it
  if (sources.some(s => (s.lang || langOfPath(s.path)) === 'vhdl' && s !== MATH_REAL_SOURCE && usesMathReal(s.text)) && !sources.includes(MATH_REAL_SOURCE)) sources = [MATH_REAL_SOURCE, ...sources];
  const parsed = [];
  // Verilog `include "name": a project file of that path (or base name)
  const include = name => {
    const base = name.split(/[\\/]/).pop();
    const f = sources.find(x => x.path === name) || sources.find(x => String(x.path).split(/[\\/]/).pop() === base);
    return f ? f.text : null;
  };
  for (const s of sources) {
    const lang = s.lang || langOfPath(s.path);
    if (lang !== 'vhdl' && lang !== 'verilog') continue;
    const r = parseOne(lang, s, () => (lang === 'vhdl' ? parseVhdl(s.text, s.path) : parseVerilog(s.text, s.path, { include })));
    r.role = s.role || 'design';
    r.text = s.text;   // (design checks: suppression comments, use clauses)
    r.src = s;
    parsed.push(r);
  }
  // SystemVerilog packages' type names, for the files that use them (`w_t x;` after `import p::*;`
  // reads as a declaration only when w_t is known to be a type): those files are read again
  // (again while new names appear: a package that uses another package's types is read whole only
  // once those are known)
  const typeNames = new Set();
  for (let round = 0; round < 8; round++) {
    const n0 = typeNames.size;
    for (const r of parsed) if (r.lang === 'verilog') for (const u of r.units) if (u.kind === 'package') for (const d of u.decls) if (d.kind === 'type') typeNames.add(d.name);
    if (typeNames.size === n0) break;
    for (let k = 0; k < parsed.length; k++) {
      const r = parsed[k];
      if (r.lang !== 'verilog' || !r.errors.some(e => e.severity === 'error')) continue;
      const again = parseOne('verilog', r.src, () => parseVerilog(r.src.text, r.src.path, { include, typeNames }));
      Object.assign(again, { role: r.role, text: r.text, src: r.src });
      parsed[k] = again;
    }
  }
  for (const r of parsed) delete r.src;
  const lib = buildLibrary(parsed);
  lib.parsed = parsed;
  return lib;
}

export { elaborate, topCandidates };

// Convenience: compile + elaborate + simulate (used by tests and the CLI).
export function simulate(sources, top, { until = Infinity, files, maxDeltas } = {}) {
  const lib = compile(sources);
  const design = elaborate(lib, top);
  const errors = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errors.length) return { lib, design, errors, sim: null };
  const fileMap = new Map(files || sources.map(s => [s.path, s.text]));
  const sim = new Simulator(design, { files: fileMap, maxDeltas });
  const status = sim.run(until);
  return { lib, design, errors, sim, status };
}
