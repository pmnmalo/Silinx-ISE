// Front-end driver: parse a set of sources and build the library; elaborate a top.
import { parse as parseVerilog } from './verilog/parser.js';
import { parse as parseVhdl } from './vhdl/parser.js';
import { buildLibrary, elaborate, topCandidates } from './elaborate.js';
import { Simulator } from './simulator.js';

export function langOfPath(p) {
  return /\.(vhd|vhdl)$/i.test(p) ? 'vhdl' : /\.(v|vh|sv)$/i.test(p) ? 'verilog' : null;
}

// sources: [{ path, text, lang?, role? }]
export function compile(sources) {
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
    const r = lang === 'vhdl' ? parseVhdl(s.text, s.path) : parseVerilog(s.text, s.path, { include });
    r.role = s.role || 'design';
    r.text = s.text;   // (design checks: suppression comments, use clauses)
    parsed.push(r);
  }
  const lib = buildLibrary(parsed);
  lib.parsed = parsed;
  return lib;
}

export function moduleRoles(lib) {
  const roles = new Map();
  for (const p of lib.parsed || []) for (const u of p.units) if (u.kind === 'module') roles.set(u.name, p.role);
  return roles;
}

export { elaborate, topCandidates };

// Convenience: compile + elaborate + simulate (used by tests and the CLI).
export function simulate(sources, top, { until = Infinity, files } = {}) {
  const lib = compile(sources);
  const design = elaborate(lib, top);
  const errors = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errors.length) return { lib, design, errors, sim: null };
  const fileMap = new Map(files || sources.map(s => [s.path, s.text]));
  const sim = new Simulator(design, { files: fileMap });
  const status = sim.run(until);
  return { lib, design, errors, sim, status };
}
