// Automatic grading (#3192): a submission's design, before any test runs. A submission is { project, files }: its
// silinx.json and its files' texts by path (server/grade.js reads them from a folder or a zip, the interface from the
// project). Its HDL is the files silinx.json lists (the design's, not the test benches') and the HDL of its drawings,
// made again from each drawing (core/view-hdl.js: a drawing is the base of its HDL file). It is compiled and
// elaborated as Check Syntax does (core/compile.js, core/lint.js designChecks), and its top checked against the
// statement: { verdict: null | 'CE' | 'IE', messages, warnings, sources, lib, design }. Isomorphic.
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { designChecks } from './lint.js';
import { modulesFromLibrary } from './schdoc-from-hdl.js';
import { VIEW_RE, viewHdl } from './view-hdl.js';
import { DRAWINGS, LANGUAGES } from './grade-format.js';

const langOf = p => (/\.(vhd|vhdl)$/i.test(p) ? 'vhdl' : /\.(v|sv)$/i.test(p) ? 'verilog' : null);
const kindOf = p => { const k = VIEW_RE.exec(p)?.[1].toLowerCase(); return k === 'bool' ? 'tt' : k; };
const get = (files, p) => (files instanceof Map ? files.get(p) : files[p]);
const paths = files => (files instanceof Map ? [...files.keys()] : Object.keys(files));
const where = d => `${d.file ? `"${d.file}" Line ${d.line}: ` : ''}${d.message}`;

/** The HDL sources of a submission: { sources: [{ path, lang, text }], errors, used: { languages, drawings } }. */
export function submissionSources({ project, files }) {
  const pj = project || {};
  const listed = (pj.files || []).filter(f => (f.role || 'design') !== 'sim');
  const errors = [], used = { languages: new Set(), drawings: new Set() };
  const hdl = [];
  for (const f of listed) {
    const lang = f.lang || langOf(f.path);
    if (!LANGUAGES.includes(lang)) continue;
    const text = get(files, f.path);
    if (typeof text !== 'string') { errors.push(`${f.path}: the file is not in the submission`); continue; }
    hdl.push({ path: f.path, lang, text });
  }
  // the drawings (not excluded, not build/'s): each one's HDL made again from it, in place of its HDL file
  const drawings = paths(files).filter(p => VIEW_RE.test(p) && !/^build\//.test(p) && !(pj.excluded || []).includes(p)).sort();
  const parsed = drawings.map(p => { try { return { p, m: JSON.parse(get(files, p)) }; } catch (e) { errors.push(`${p}: ${e.message}`); return null; } }).filter(Boolean);
  const own = parsed.filter(({ m }) => m && typeof m === 'object' && m.base !== 'hdl');
  const generated = new Set(own.map(({ m }) => m.generatedFile).filter(Boolean));
  const base = hdl.filter(s => !generated.has(s.path));
  let modules = {};
  try { modules = modulesFromLibrary(compile(base), { sources: Object.fromEntries(base.map(s => [s.path, s.text])) }); } catch { /* none */ }
  const drawn = [];
  for (const { p, m } of own) {
    const lang = m.lang || (m.generatedFile ? langOf(m.generatedFile) : null) || (pj.preferredLanguage === 'verilog' ? 'verilog' : 'vhdl');
    let r;
    try { r = viewHdl(p, JSON.stringify(m), { modules, linked: () => false, lang }); } catch (e) { errors.push(`${p}: ${e.message}`); continue; }
    if (!r) continue;
    if (r.errors.length) { errors.push(...r.errors.map(e => (e.startsWith(`${p}:`) ? e : `${p}: ${e}`))); continue; }
    used.drawings.add(kindOf(p));
    drawn.push({ path: m.generatedFile || r.path, lang: r.lang, text: r.text, drawing: p });
  }
  for (const s of base) used.languages.add(s.lang);
  return { sources: [...base, ...drawn], errors, used };
}

// the design units a set of sources defines (lower case), for the clashes with the exercise's
function unitNames(lib) {
  const out = new Set();
  for (const r of lib.parsed || []) for (const u of r.units || []) if (u.name) out.add(String(u.name).toLowerCase());
  return out;
}

/** The interface's problems of an elaborated top against the statement's ports ([] when they are the same). */
export function portProblems(top, ports, name) {
  const out = [], have = top.ports || [];
  for (const want of ports) {
    const p = have.find(q => q.name.toLowerCase() === want.name.toLowerCase());
    if (!p) { out.push(`${name} has no port ${want.name}`); continue; }
    if (p.dir !== want.dir) out.push(`port ${want.name} of ${name} is ${p.dir === 'in' ? 'an input' : p.dir === 'out' ? 'an output' : `an ${p.dir}`}, not ${want.dir === 'in' ? 'an input' : want.dir === 'out' ? 'an output' : 'an inout'}`);
    const w = p.sig?.t?.w ?? p.t?.w;
    if (w !== want.width) out.push(`port ${want.name} of ${name} is ${w} bit${w === 1 ? '' : 's'} wide, not ${want.width}`);
  }
  for (const p of have) if (!ports.some(w => w.name.toLowerCase() === p.name.toLowerCase())) out.push(`${name} has a port ${p.name} the statement does not have`);
  return out;
}

/** A submission's design graded before its tests: compiled, elaborated, its interface checked against the exercise.
 *  `exerciseUnits`: the design units of the exercise's test benches, which a submission may not define (it would
 *  replace them). */
export function prepareDesign(ex, submission, { exerciseUnits = new Set() } = {}) {
  const res = { verdict: null, messages: [], warnings: [], sources: [], lib: null, design: null };
  const fail = (verdict, messages) => Object.assign(res, { verdict, messages: [...res.messages, ...messages] });
  const { sources, errors, used } = submissionSources(submission);
  res.sources = sources;
  if (errors.length) return fail('CE', errors);
  const allow = ex.allow || {};
  const langs = allow.languages || LANGUAGES, kinds = allow.drawings || DRAWINGS;
  const notAllowed = [...[...used.languages].filter(l => !langs.includes(l)).map(l => `${l === 'vhdl' ? 'VHDL' : 'Verilog'} is not allowed in this exercise`),
    ...[...used.drawings].filter(k => !kinds.includes(k)).map(k => `a drawing of kind '${k}' is not allowed in this exercise`)];
  if (notAllowed.length) return fail('IE', notAllowed);
  if (!sources.length) return fail('CE', ['the submission has no HDL source and no drawing']);
  const prims = primitiveSources(sources);
  if (prims.length && allow.primitives === false) return fail('IE', ['the FPGA\'s primitives (UNISIM) are not allowed in this exercise']);
  const lib = compile([...prims, ...sources]);
  res.lib = lib;
  const clash = [...unitNames(lib)].filter(n => exerciseUnits.has(n) && n !== ex.top.toLowerCase());
  if (clash.length) return fail('IE', clash.map(n => `the submission defines ${n}, a name of the exercise's own`));
  let design = null, extra = [];
  try { design = elaborate(lib, ex.top); } catch (e) { extra = [{ severity: 'error', file: sources[0].path, line: 1, message: e.message }]; }
  if (design?.top) { try { extra = designChecks(lib, design, { lint: true }); } catch { /* no checks */ } }
  const seen = new Set();
  const diags = [...lib.errors, ...(design?.diags || []), ...extra].filter(d => { const k = `${d.file}:${d.line}:${d.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
  res.warnings = diags.filter(d => d.severity === 'warning').map(where);
  const missing = diags.find(d => d.severity === 'error' && /^top module '.*' not found$/.test(d.message));
  const errs = diags.filter(d => d.severity === 'error' && d !== missing);
  if (errs.length) return fail('CE', errs.map(where));
  if (missing || !design?.top) return fail('IE', [`the submission has no module ${ex.top}`]);
  res.design = design;
  const ports = portProblems(design.top, ex.ports, ex.top);
  if (ports.length) return fail('IE', ports);
  return res;
}

/** The design units the exercise's test benches define, lower case (the reference is simulated apart: none of its). */
export function exerciseUnitNames(ex) {
  const srcs = ex.tests.flatMap(t => (t.kind === 'testbench' ? t.files : []))
    .filter(f => typeof f.text === 'string').map(f => ({ path: f.path, lang: langOf(f.path), text: f.text }));
  return srcs.length ? unitNames(compile(srcs)) : new Set();
}
