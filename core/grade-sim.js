// Automatic grading (#3192): the tests that simulate. The grader drives the submission's top itself, with no test
// bench, so a test is the same whatever made the design (VHDL, Verilog, a drawing):
//   with a clock (period T): row k's inputs at k·T (the clock low), the clock rises at k·T + T/2, the outputs compared
//   at k·T + 3T/4;  without one: the inputs at k·T, the outputs at k·T + T/2.
// A test's result: { verdict, messages, detail } (detail: the first difference, for a visible test's report). The
// simulator is Silinx's (core/simulator.js), which interprets the HDL: a submission's $readmem and textio read its own
// files only (`files`), never the exercise's. A process that never waits is stopped by the worker's clock
// (server/grade.js), not here. Isomorphic.
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { Simulator } from './simulator.js';
import { fromBits, toBin } from './values.js';
import { pattern } from './labs-check.js';
import { portProblems } from './grade-design.js';

const DELTA_RE = /^delta cycle limit \(\d+\) exceeded/;
const ITER_RE = /^loop iteration limit exceeded/;   // (a loop of 10 million iterations in one process run, core/interp.js)
const FINISH_RE = /^simulation (finished|stopped) \(\$\w+\)/;
const portOf = (design, name) => design.top.ports.find(p => p.name.toLowerCase() === name.toLowerCase());

// the verdict of a simulation's end: the step limit, a combinational loop, an error of the simulation
function endVerdict(sim, st, until, { steps }) {
  const loop = sim.log.find(e => e.kind === 'error' && DELTA_RE.test(e.text));
  if (loop) return { verdict: 'TLE', messages: [`${loop.text} (the delta cycle limit)`] };
  const iter = sim.log.find(e => e.kind === 'error' && ITER_RE.test(e.text));
  if (iter) return { verdict: 'TLE', messages: [`${iter.text} ${at(iter)}`] };
  if (!st.finished && st.now < until) return { verdict: 'TLE', messages: [`the simulation took more than ${steps} steps (at ${st.now / 1000} ns)`] };
  return null;
}
const errorsOf = (sim, keep = () => true) => sim.log.filter(e => (e.kind === 'error' || e.kind === 'failure') && keep(e));
const at = e => `at ${e.time / 1000} ns${e.file ? ` (${e.file}${e.line ? ` line ${e.line}` : ''})` : ''}`;

/** Each output's value per row of the vectors ({ inputs, outputs, rows }) on a design: { obtained: [[bits]], sim, st,
 *  stopped } (stopped: the time a $finish or an error of the design stopped it before the last row). */
function simulateRows(design, vec, { clock = null, periodNs = 20, files = new Map(), limits }) {
  const T = Math.round(periodNs * 1000);
  const sim = new Simulator(design, { files, maxWaveEvents: 0 });
  const ins = vec.inputs.map(p => portOf(design, p.name)?.sig), outs = vec.outputs.map(p => portOf(design, p.name)?.sig);
  if (clock) sim.addClock(portOf(design, clock).sig, { period: T, startHigh: false });
  const sample = clock ? Math.round((3 * T) / 4) : Math.round(T / 2);
  const obtained = [];
  vec.rows.forEach((r, k) => {
    sim.at(k * T, s => r.in.forEach((b, j) => { if (!b.includes('-')) s.forceOrSet(ins[j], fromBits(b)); }));
    sim.at(k * T + sample, () => { obtained[k] = outs.map(sig => toBin(sig.val).toUpperCase()); });
  });
  const until = vec.rows.length * T;
  const st = sim.run(until, { maxSteps: limits.steps });
  return { obtained, sim, st, until, stopped: obtained.length < vec.rows.length ? st.now : null };
}

const bitsMatch = (want, have) => [...want].every((c, i) => c === '-' || c === have?.[i]);

// the rows around the first difference (a visible test's waveform, as a table): its inputs, expected and obtained
function windowOf(vec, obtained, k) {
  const from = Math.max(0, k - 3), to = Math.min(vec.rows.length, k + 2);
  return { inputs: vec.inputs.map(p => p.name), outputs: vec.outputs.map(p => p.name),
    rows: vec.rows.slice(from, to).map((r, j) => ({ cycle: from + j, line: r.line, in: r.in, expected: r.out, obtained: obtained[from + j] || null })) };
}

/** A vectors test on the submission's design: Accepted, Wrong Answer at the first difference, Time Limit Exceeded,
 *  Runtime Error. */
export function runVectors(design, vec, opts) {
  const { obtained, sim, st, until, stopped } = simulateRows(design, vec, opts);
  const end = endVerdict(sim, st, until, opts.limits);
  if (end) return end;
  const errs = errorsOf(sim);
  if (errs.length) return { verdict: 'RE', messages: errs.slice(0, 3).map(e => `${e.text} ${at(e)}`) };
  for (const [k, r] of vec.rows.entries()) {
    if (!obtained[k]) return { verdict: 'WA', messages: [`the design stopped the simulation at ${stopped / 1000} ns, before cycle ${k}`] };
    const j = r.out.findIndex((want, i) => !bitsMatch(want, obtained[k][i]));
    if (j < 0) continue;
    const signal = vec.outputs[j].name;
    return { verdict: 'WA', messages: [`cycle ${k} (vectors line ${r.line}): ${signal} is ${obtained[k][j]}, expected ${r.out[j]}`],
      detail: { cycle: k, line: r.line, signal, expected: r.out[j], obtained: obtained[k][j], window: windowOf(vec, obtained, k) } };
  }
  return { verdict: 'AC', messages: [] };
}

// ---------------------------------------------------------------- reference
/** xorshift32 from a seed: the same inputs on every machine, every run. */
export function seededRandom(seed = 1) {
  let x = (seed >>> 0) || 0x9e3779b9;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x; };
}

/** A reference test's inputs: { inputs, rows: [{ in }] }, every input but the clock random each cycle, but those
 *  `hold` gives for the first cycles (each a list of values) and those `fixed` gives after them. */
export function randomRows(ports, { clock = null, cycles, seed = 1, hold = {}, fixed = {} }, valueBits) {
  const inputs = ports.filter(p => p.dir === 'in' && (!clock || p.name.toLowerCase() !== String(clock).toLowerCase()));
  const find = (obj, p) => Object.entries(obj || {}).find(([k]) => k.toLowerCase() === p.name.toLowerCase())?.[1];
  const rnd = seededRandom(seed);
  const bits = w => { let s = ''; while (s.length < w) s += rnd().toString(2).padStart(32, '0'); return s.slice(0, w); };
  const rows = [];
  for (let k = 0; k < cycles; k++) {
    rows.push({ line: k + 1, in: inputs.map(p => {
      const r = bits(p.width);   // (drawn every cycle, held or not: an input held does not change the others')
      const h = find(hold, p), f = find(fixed, p);
      if (Array.isArray(h) && k < h.length) return valueBits(h[k], p.width);
      if (f !== undefined && (!Array.isArray(h) || k >= h.length)) return valueBits(f, p.width);
      return r;
    }) });
  }
  return { inputs, rows };
}

/** The reference design's outputs on the rows: the expected ones (an X or Z of the reference: not compared), or the
 *  reasons it cannot give them (the exercise's errors). */
export function referenceRows(refSources, top, ports, vec, opts) {
  const srcs = refSources.map(f => ({ path: f.path, lang: /\.(vhd|vhdl)$/i.test(f.path) ? 'vhdl' : 'verilog', text: f.text }));
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const design = elaborate(lib, top);
  const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errs.length || !design.top) return { problems: errs.length ? errs.map(d => `the reference: "${d.file}" Line ${d.line}: ${d.message}`) : [`the reference has no module ${top}`] };
  const itf = portProblems(design.top, ports, top);
  if (itf.length) return { problems: itf.map(m => `the reference: ${m}`) };
  const outputs = ports.filter(p => p.dir === 'out');
  const r = simulateRows(design, { ...vec, outputs }, { ...opts, files: new Map(srcs.map(s => [s.path, s.text])) });
  const end = endVerdict(r.sim, r.st, r.until, opts.limits);
  if (end || r.stopped !== null || errorsOf(r.sim).length) return { problems: [`the reference does not run the test: ${end?.messages[0] || errorsOf(r.sim)[0]?.text || 'it stopped'}`] };
  return { problems: [], outputs, rows: vec.rows.map((row, k) => ({ ...row, out: r.obtained[k].map(b => b.replace(/[XZ]/g, '-')) })) };
}

// ---------------------------------------------------------------- the teacher's test bench
/** A test bench test: the submission's sources and the test bench's compiled together, its top simulated. Accepted
 *  when the test bench reports no error or failure, its `done` message (if any) comes from its own files, and the
 *  submission does not stop the simulation; a submission's own error is a Runtime Error. */
export function runTestbench(subSources, test, { files = new Map(), limits }) {
  const tb = test.files.map(f => ({ path: f.path, lang: /\.(vhd|vhdl)$/i.test(f.path) ? 'vhdl' : 'verilog', text: f.text, role: 'sim' }));
  const own = new Set(tb.map(f => f.path));
  const all = [...subSources, ...tb];
  const lib = compile([...primitiveSources(all), ...all]);
  const design = elaborate(lib, test.top);
  const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errs.length || !design.top) return { verdict: 'CE', messages: (errs.length ? errs : [{ message: `no module ${test.top}` }]).slice(0, 3).map(d => `with the test bench: ${d.file ? `"${d.file}" Line ${d.line}: ` : ''}${d.message}`) };
  const sim = new Simulator(design, { files, maxWaveEvents: 0 });
  const until = Math.round(limits.simNs * 1000);
  const st = sim.run(until, { maxSteps: limits.steps });
  const end = endVerdict(sim, st, until, limits);
  if (end) return end;
  const mine = e => !e.file || own.has(e.file);
  const theirs = errorsOf(sim, e => !mine(e));
  if (theirs.length) return { verdict: 'RE', messages: theirs.slice(0, 3).map(e => `${e.text} ${at(e)}`) };
  const stop = sim.log.find(e => e.kind === 'note' && FINISH_RE.test(e.text) && !mine(e));
  if (stop) return { verdict: 'WA', messages: [`the design stopped the simulation ${at(stop)}`] };
  const fails = errorsOf(sim, mine);
  if (fails.length) return { verdict: 'WA', messages: fails.slice(0, 3).map(e => `${e.text} ${at(e)}`) };
  if (test.done) {
    const p = pattern(test.done);
    if (!sim.log.some(e => (e.kind === 'print' || e.kind === 'note') && e.file && own.has(e.file) && p.test(e.text))) return { verdict: 'WA', messages: [`the test bench did not reach its end ('${test.done}') in ${limits.simNs} ns`] };
  }
  return { verdict: 'AC', messages: [] };
}
