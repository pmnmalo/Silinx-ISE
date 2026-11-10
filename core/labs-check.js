// The checks of a guided lab's step (#3179, core/labs.js): each is { problems(c), run(c, io) }, problems the errors of
// its description in a lab file, run the reasons it fails on the project (none: it passes). The project is read
// through `io`, the same in the interface (web/js/lab-view.js, either backend) and the MCP server (server/mcp-labs.js):
//   project()    its silinx.json        files()    its files' paths        read(path)    a file's text
//   sources(sim) the HDL of the implementation view (false) or the simulation view (true): [{ path, lang, text, role }]
//   reports(process) the last run's build/reports.json (null: none) and whether it is still the sources' (each backend
//                knows it its own way: the page by its processes' marks, the server by the files' times): { reports, current }
// The HDL is compiled, elaborated and checked as Check Syntax does (core/compile.js, core/lint.js designChecks), and a
// test bench run as Simulate does (core/simulator.js). A pattern is a text (found in the message, case ignored) or
// "/regex/flags". Isomorphic.
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { designChecks } from './lint.js';
import { Simulator } from './simulator.js';
import { toBin } from './values.js';
import { parseUcf } from '../packages/silinx-fpga/src/parts.js';

const MAX_NS = 1e6;   // (a lab's simulation: at most 1 ms of simulated time)
const str = v => typeof v === 'string' && v.length > 0;
const list = v => v === undefined || (Array.isArray(v) && v.every(str));

/** A pattern of a lab: a text (a case-blind substring) or "/regex/flags"; null when it is not one. */
export function pattern(p) {
  const m = /^\/(.+)\/([a-z]*)$/s.exec(String(p));
  if (!m) { const t = String(p).toLowerCase(); return { test: s => String(s).toLowerCase().includes(t), source: p }; }
  try { return new RegExp(m[1], m[2]); } catch { return null; }
}
const patternProblems = (name, v) => (!list(v) ? [`"${name}": a list of patterns`] : (v || []).filter(p => !pattern(p)).map(p => `"${name}": '${p}' is not a regular expression`));

/** Matches each of `found` (texts) to one pattern of `want`: the reasons they differ ([] when they are the same). */
export function exactly(found, want, what) {
  const pats = want.map(pattern), left = [...found], out = [];
  for (const [k, p] of pats.entries()) {
    const i = left.findIndex(t => p.test(t));
    if (i < 0) out.push(`no ${what} like '${want[k]}'`);
    else left.splice(i, 1);
  }
  for (const t of left) out.push(`${want.length ? 'another' : 'a'} ${what}: ${t}`);
  return out;
}

// the view's HDL compiled and its top elaborated, its Check Syntax's messages: { lib, design, top, diags }
async function elaborateView(io, { top, sim }) {
  const pj = await io.project();
  const mod = top || (sim ? pj.simTop : pj.top);
  if (!mod) return { top: null, diags: [], missing: sim ? 'the project has no test bench (its simulation top)' : 'the project has no top module' };
  const srcs = await io.sources(sim);
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  let design = null, extra = [];
  try { design = elaborate(lib, mod); } catch (e) { extra = [{ severity: 'error', file: srcs[0]?.path || '', line: 1, message: e.message }]; }
  if (design?.top) { try { extra = designChecks(lib, design, { lint: true }); } catch { /* no checks */ } }
  const seen = new Set();
  const diags = [...lib.errors, ...(design?.diags || []), ...extra].filter(d => { const k = `${d.file}:${d.line}:${d.message}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { lib, design: design?.top ? design : null, top: mod, diags, srcs };
}
// (the elaboration's "top module 'x' not found": said as there is no module x)
const errorsOf = diags => diags.filter(d => d.severity === 'error' && !/^top module '.*' not found$/.test(d.message));
const where = d => `${d.file ? `"${d.file}" Line ${d.line}: ` : ''}${d.message}`;

// the signals of an elaborated design by name: the top's, then through its instances (uut/count), as simulate's
function signalsByPath(design) {
  const byPath = new Map();
  const walk = (inst, prefix) => {
    for (const p of inst.ports || []) if (!byPath.has(prefix + p.name)) byPath.set(prefix + p.name, p.sig);
    for (const s of inst.signals || []) if (!byPath.has(prefix + s.name)) byPath.set(prefix + s.name, s);
    for (const c of inst.children || []) walk(c, `${prefix}${c.name}/`);
  };
  walk(design.top, '');
  return name => byPath.get(name) ?? byPath.get(String(name).toLowerCase()) ?? byPath.get(String(name).replace(/^\/[^/]+\//, ''));
}

/** A lab's expected value as the bits of a signal of `width`: '1', '0010', 'X', 0x2a, 5 (a number). */
export function expectedBits(value, width) {
  const s = String(value).trim();
  let n = null;
  if (typeof value === 'number' && Number.isInteger(value)) n = BigInt(value);
  else if (/^0x[0-9a-f]+$/i.test(s)) n = BigInt(s);
  if (n === null) return s.replace(/^"|"$/g, '').replace(/^'|'$/g, '').replace(/_/g, '').toUpperCase();
  return (n & ((1n << BigInt(width)) - 1n)).toString(2).padStart(width, '0');
}
// a signal's value at a time (ps) from its wave: its last change at or before it
function valueAt(sig, ps) {
  const w = sig.wave;
  if (!w || !w.t.length) return null;
  let k = -1;
  for (let i = 0; i < w.t.length && w.t[i] <= ps; i++) k = i;
  return k < 0 ? null : toBin(w.v[k]).toUpperCase();
}

// a process of a lab: its name in the Processes pane, the steps it runs (their marks, web/js/processes.js), what of the
// Design Summary says it ran (build/reports.json's summary) and the steps whose warnings it counts
export const PROCESSES = {
  synthesize: { label: 'Synthesize', marks: ['synth'], ran: s => s.synthesized, warns: ['synthesis'] },
  implement: { label: 'Implement Design', marks: ['synth', 'translate', 'map', 'par'], ran: s => s.routed !== null && s.routed !== undefined, warns: ['synthesis', 'map', 'par'] },
  bitstream: { label: 'Generate Programming File', marks: ['synth', 'translate', 'map', 'par', 'bitgen'], ran: s => s.bitstream, warns: ['synthesis', 'map', 'par'] },
};
// a drawing's check, as its editor's (the MCP server's check_drawing, server/mcp-check.js; a truth table's as its
// editor's too): the messages of an ASM chart, a state diagram, a truth table, a Petri net ({ severity, message })
const DRAWINGS = [
  { re: /\.asm\.json$/i, check: async m => (await import('./asm.js')).validate(m) },
  { re: /\.fsm\.json$/i, check: async m => (await import('./fsm.js')).validateFsm(m) },
  { re: /\.bool\.json$/i, check: async m => (await import('./logic.js')).validateTable(m) },
  { re: /\.pn\.json$/i, check: async m => (await import('./petri-analysis.js')).checkPetri(m) },
];
// a port's bit as the constraints name it: led<3> (led(3), led[3] written as VHDL or Verilog do)
const netName = p => String(p).trim().replace(/[([](\d+)[)\]]$/, '<$1>');

// a step's warnings in build/reports.json: its count, or the map report's "Number of warnings" line (ISE's)
const warningsOf = (r, k) => r?.[k]?.warnings ?? Number((r?.[k]?.utilization || []).find(u => /warnings/i.test(u.name))?.used) ?? 0;

export const CHECKS = {
  // the project's settings: its top, its test bench, its board, its part
  project: {
    problems: c => (['top', 'simTop', 'board', 'part'].some(k => c[k] !== undefined) ? [] : ['one of "top", "simTop", "board", "part"']),
    async run(c, io) {
      const pj = await io.project();
      const have = { top: pj.top, simTop: pj.simTop, board: pj.board, part: pj.device?.part };
      const name = { top: 'top module', simTop: 'test bench', board: 'board', part: 'device' };
      return Object.keys(name).filter(k => c[k] !== undefined && String(have[k] ?? '').toLowerCase() !== String(c[k]).toLowerCase())
        .map(k => `the project's ${name[k]} is ${have[k] ? `'${have[k]}'` : 'not set'}, not '${c[k]}'`);
    },
  },
  // a file of the project; with contains, its text matches every pattern
  file: {
    problems: c => [...(str(c.path) ? [] : ['"path": the file']), ...patternProblems('contains', c.contains)],
    async run(c, io) {
      if (!(await io.files()).includes(c.path)) return [`the project has no file ${c.path}`];
      const text = c.contains?.length ? await io.read(c.path) : '';
      return (c.contains || []).filter(p => !pattern(p).test(text)).map(p => `${c.path} has nothing like '${p}'`);
    },
  },
  // a module of the design with these ports (each { name, dir: in | out | inout, width }); only: and no other
  module: {
    problems: c => [...(str(c.name) ? [] : ['"name": the module']),
      ...(c.ports === undefined || (Array.isArray(c.ports) && c.ports.every(p => str(p?.name))) ? [] : ['"ports": a list of { "name", "dir", "width" }'])],
    async run(c, io) {
      const v = await elaborateView(io, { top: c.name, sim: !!c.simulation });
      const errs = errorsOf(v.diags);
      if (errs.length) return [`module ${c.name} does not compile: ${where(errs[0])}`];
      if (!v.design) return [`there is no module ${c.name}`];
      const ports = v.design.top.ports || [];
      const out = [];
      for (const want of c.ports || []) {
        const p = ports.find(q => q.name.toLowerCase() === want.name.toLowerCase());
        if (!p) { out.push(`module ${c.name} has no port ${want.name}`); continue; }
        if (want.dir && p.dir !== want.dir) out.push(`port ${want.name} of ${c.name} is ${p.dir ? `an ${p.dir}` : 'not'} port, not ${want.dir}`);
        const w = p.sig?.t?.w ?? p.t?.w;
        if (want.width !== undefined && w !== want.width) out.push(`port ${want.name} of ${c.name} is ${w} bit(s) wide, not ${want.width}`);
      }
      if (c.only) for (const p of ports.filter(q => !(c.ports || []).some(w => w.name.toLowerCase() === q.name.toLowerCase()))) out.push(`module ${c.name} has a port ${p.name} more`);
      return out;
    },
  },
  // Check Syntax (simulation: of the simulation view) passes, with exactly these warnings (none when not given)
  syntax: {
    problems: c => patternProblems('warnings', c.warnings),
    async run(c, io) {
      const v = await elaborateView(io, { top: c.top, sim: !!c.simulation });
      if (v.missing) return [v.missing];
      const errs = errorsOf(v.diags);
      if (errs.length || !v.design) return [`Check Syntax of ${v.top} fails: ${errs.length ? errs.slice(0, 3).map(where).join('; ') : `no module ${v.top}`}`];
      return exactly(v.diags.filter(d => d.severity === 'warning').map(where), c.warnings || [], 'warning of Check Syntax');
    },
  },
  // the test bench (or top) simulated for time_ns: each { signal, at_ns, value } has that value then; messages: lines
  // it printed; no error or failure reported unless errors is true
  simulate: {
    problems: c => [
      ...(c.time_ns === undefined || (c.time_ns > 0 && c.time_ns <= MAX_NS) ? [] : [`"time_ns": from 0 to ${MAX_NS} ns`]),
      ...(c.values === undefined || (Array.isArray(c.values) && c.values.every(x => str(x?.signal) && x.at_ns >= 0 && x.value !== undefined)) ? [] : ['"values": a list of { "signal", "at_ns", "value" }']),
      ...patternProblems('messages', c.messages),
    ],
    async run(c, io) {
      const v = await elaborateView(io, { top: c.top, sim: true });
      if (v.missing) return [v.missing];
      const errs = errorsOf(v.diags);
      if (errs.length || !v.design) return [`the simulation of ${v.top} does not start: ${errs.length ? errs.slice(0, 3).map(where).join('; ') : `no module ${v.top}`}`];
      const log = [];
      const files = new Map(v.srcs.map(s => [s.path, s.text]));
      const sim = new Simulator(v.design, { files, onLog: e => { if (log.length < 500) log.push(e); } });
      const timeNs = c.time_ns ?? Math.max(1000, ...(c.values || []).map(x => x.at_ns + 1));
      sim.run(timeNs * 1000);
      const sig = signalsByPath(v.design), out = [];
      for (const x of c.values || []) {
        const s = sig(x.signal);
        if (!s) { out.push(`there is no signal ${x.signal} in ${v.top}`); continue; }
        const have = valueAt(s, Math.round(x.at_ns * 1000)), want = expectedBits(x.value, s.t?.w ?? 1);
        if (have !== want) out.push(`${x.signal} is ${have ?? 'not set'} at ${x.at_ns} ns, not ${want}`);
      }
      const lines = log.map(e => e.text);
      for (const p of c.messages || []) if (!lines.some(t => pattern(p).test(t))) out.push(`the simulation printed nothing like '${p}'`);
      if (!c.errors) for (const e of log.filter(e => e.kind === 'error' || e.kind === 'failure').slice(0, 3)) out.push(`the simulation reported an error at ${e.time / 1000} ns: ${e.text}`);
      return out;
    },
  },
  // a drawing (an ASM chart, a state diagram, a truth table, a Petri net) its editor's check passes, with exactly these
  // warnings (none when not given)
  drawing: {
    problems: c => [...(str(c.path) && DRAWINGS.some(k => k.re.test(c.path)) ? [] : ['"path": an ASM chart, a state diagram, a truth table or a Petri net (.asm.json, .fsm.json, .bool.json, .pn.json)']),
      ...patternProblems('warnings', c.warnings)],
    async run(c, io) {
      if (!(await io.files()).includes(c.path)) return [`the project has no file ${c.path}`];
      let m;
      try { m = JSON.parse(await io.read(c.path)); } catch { return [`${c.path} is not a drawing Silinx reads`]; }
      const diags = await DRAWINGS.find(k => k.re.test(c.path)).check(m);
      const errs = diags.filter(d => d.severity === 'error');
      if (errs.length) return errs.slice(0, 3).map(d => `${c.path}: ${d.message}`);
      return exactly(diags.filter(d => d.severity === 'warning').map(d => d.message), c.warnings || [], `warning of ${c.path}`);
    },
  },
  // the project's constraints put each { port, loc } on that pin (port: a scalar, or a bus's bit, led<3>)
  pins: {
    problems: c => (Array.isArray(c.pins) && c.pins.length && c.pins.every(x => str(x?.port) && str(x?.loc)) ? [] : ['"pins": a list of { "port", "loc" }']),
    async run(c, io) {
      const pj = await io.project();
      if (!pj.constraints || !(await io.files()).includes(pj.constraints)) return ['the project has no constraints file'];
      let asg;
      try { asg = parseUcf(await io.read(pj.constraints)).assignments || {}; } catch (e) { return [`${pj.constraints} cannot be read: ${e.message}`]; }
      const byName = new Map(Object.entries(asg).map(([n, a]) => [n.toLowerCase(), a]));
      return c.pins.flatMap(({ port, loc }) => {
        const have = byName.get(netName(port).toLowerCase())?.loc;
        if (!have) return [`${netName(port)} has no pin in ${pj.constraints}`];
        return have.toUpperCase() === loc.toUpperCase() ? [] : [`${netName(port)} is on the pin ${have.toUpperCase()}, not ${loc.toUpperCase()}`];
      });
    },
  },
  // a process (synthesize, implement, bitstream) ran on the project's top and its sources as they are now, with
  // `warnings` warnings (0 when not given); timing_met: its timing constraints met (Implement Design's static timing)
  process: {
    problems: c => [...(PROCESSES[c.process] ? [] : [`"process": one of ${Object.keys(PROCESSES).join(', ')}`]),
      ...(c.warnings === undefined || (Number.isInteger(c.warnings) && c.warnings >= 0) ? [] : ['"warnings": a number of warnings'])],
    async run(c, io) {
      const P = PROCESSES[c.process], pj = await io.project();
      const { reports: r, current } = await io.reports(c.process);
      const sum = r?.summary;
      if (!sum || !P.ran(sum)) return [`${P.label} has not run: run it (the Processes pane)`];
      if (pj.top && r.top && String(r.top).toLowerCase() !== String(pj.top).toLowerCase()) return [`${P.label} ran on the top module '${r.top}', not on the project's, '${pj.top}': run it again`];
      if (!current) return [`the sources changed since ${P.label} ran: run it again`];
      const out = [];
      if (c.process !== 'synthesize' && sum.routed === false) out.push(`${P.label}: ${r.par?.unroutedSignals ?? 'some'} signal(s) not routed`);
      const n = P.warns.reduce((a, k) => a + (warningsOf(r, k) || 0), 0), want = c.warnings ?? 0;
      if (n !== want) out.push(`${P.label} gave ${n} warning(s), ${want ? `not ${want}` : 'none expected'}: see its reports (the Design Summary)`);
      if (c.timing_met && sum.timingMet !== true) out.push(sum.timingMet === false ? `the timing constraints are not met${sum.maxFreqMHz ? ` (at most ${sum.maxFreqMHz} MHz)` : ''}` : 'no static timing analysis: the design has no timing constraint');
      return out;
    },
  },
};
