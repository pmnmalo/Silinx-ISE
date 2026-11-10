// Automatic grading (#3191, #3192), as Mooshak does for programming: a submission's design is checked (it compiles, its
// top is the statement's: core/grade-design.js), then each test of the exercise (core/grade-format.js) gives its
// verdict and its points (core/grade-sim.js; the synthesis's through `synthesize`, the open synthesis where there is
// one). A Compile Error or an Interface Error is every test's. gradeTests runs in one place, synchronously but for the
// synthesis: server/grade-worker.js runs it in a worker with its limits, the interface on the student's own design.
// Isomorphic.
import { VERDICTS, parseVectors, valueBits, limitsOf, testsOf, pointsOf, localize } from './grade-format.js';
import { prepareDesign } from './grade-design.js';
import { runVectors, runTestbench, randomRows, referenceRows } from './grade-sim.js';
import { CHECKS } from './labs-check.js';

export { VERDICTS };
const LATCH_RE = /^"[^"]*" Line \d+: Found \d+-bit latch for signal/;

/** The vectors a test compares: a vectors test's own (`text`: its file's when it has one), a reference test's from the
 *  reference design (`expected`, computed apart: the reference never runs with a submission). */
export function testVectors(ex, test, { text = null, expected = null } = {}) {
  if (test.kind === 'vectors') return parseVectors(text ?? test.vectors, ex.ports, { clock: test.clock });
  if (test.kind === 'reference') return expected ? { ...expected, problems: [] } : { problems: ['the reference\'s outputs are not computed'] };
  return null;
}

/** A reference test's expected rows from the exercise's reference design: { inputs, outputs, rows, problems }. */
export function referenceVectors(ex, test) {
  const ins = randomRows(ex.ports, test, valueBits);
  const limits = limitsOf(ex, test);
  const r = referenceRows(ex.reference.files, ex.top, ex.ports, ins, { clock: test.clock, periodNs: test.periodNs ?? 20, limits });
  return r.problems.length ? { problems: r.problems } : { inputs: ins.inputs, outputs: r.outputs, rows: r.rows, problems: [] };
}

// a synthesis test from the open synthesis's results ({ errors, warnings, latches, luts, ffs, slices })
async function runSynthesis(ex, test, design, synthesize) {
  if (!synthesize) return { verdict: null, messages: ['the synthesis tests run where the open synthesis is (silinx grade, the server)'] };
  const r = await synthesize(design.sources, ex.top, test);
  if (r.errors?.length) return { verdict: 'NS', messages: r.errors.slice(0, 5) };
  const latches = Math.max(r.latches || 0, design.warnings.filter(w => LATCH_RE.test(w)).length ? 1 : 0);
  if (test.latches === false && latches) return { verdict: 'LI', messages: [...design.warnings.filter(w => LATCH_RE.test(w)), ...(r.latches ? [`the synthesis inferred ${r.latches} latch${r.latches > 1 ? 'es' : ''}`] : [])] };
  if (test.warnings === false && (r.warnings?.length || design.warnings.length)) return { verdict: 'NS', messages: ['this exercise allows no warning', ...design.warnings, ...(r.warnings || [])].slice(0, 6) };
  const over = [['luts', 'LUTs'], ['ffs', 'flip-flops'], ['slices', 'slices']].filter(([k]) => test[k] !== undefined && (r[k] ?? 0) > test[k])
    .map(([k, n]) => `${r[k]} ${n}, at most ${test[k]}`);
  if (over.length) return { verdict: 'RL', messages: over };
  return { verdict: 'AC', messages: [], used: { luts: r.luts, ffs: r.ffs, slices: r.slices, latches } };
}

// the submission as the guided labs' checks read a project (core/labs-check.js `io`): its silinx.json, its files, the
// HDL of its design (its drawings' made again) and, for the simulation view, its own test benches too
function submissionIo(project, files, design) {
  const sims = (project.files || []).filter(f => f.role === 'sim' && typeof files.get(f.path) === 'string')
    .map(f => ({ path: f.path, lang: f.lang || (/\.(vhd|vhdl)$/i.test(f.path) ? 'vhdl' : 'verilog'), text: files.get(f.path), role: 'sim' }));
  return { project: async () => project, files: async () => [...files.keys()], read: async p => { if (!files.has(p)) throw new Error(`no file ${p}`); return files.get(p); },
    sources: async sim => [...design.sources.map(s => ({ ...s, role: 'design' })), ...(sim ? sims : [])] };
}

// a check test: each of the guided labs' checks on the submission; its reasons, a Wrong Answer
async function runChecks(test, io) {
  const reasons = [];
  for (const c of test.checks) reasons.push(...await CHECKS[c.check].run(c, io));
  return reasons.length ? { verdict: 'WA', messages: [...new Set(reasons)] } : { verdict: 'AC', messages: [] };
}

/** One test of a prepared design (prepareDesign): its { verdict, messages, detail? }. `project`: the submission's
 *  silinx.json (the check tests'). */
export async function runTest(ex, test, design, { files = new Map(), vectors = null, synthesize = null, project = {} } = {}) {
  const limits = limitsOf(ex, test);
  if (test.kind === 'testbench') return runTestbench(design.sources, test, { files, limits });
  if (test.kind === 'check') return runChecks(test, submissionIo(project, files, design));
  if (test.kind === 'synthesis') return runSynthesis(ex, test, design, synthesize);
  const vec = vectors || testVectors(ex, test);
  if (vec.problems.length) return { verdict: null, messages: vec.problems.map(m => `the exercise: ${m}`) };
  return runVectors(design.design, vec, { clock: test.clock, periodNs: test.periodNs ?? 20, files, limits });
}

const resultOf = (test, r) => ({ id: test.id, title: localize(test.title) || test.id, kind: test.kind, visible: !!test.visible, max: pointsOf(test),
  points: r.verdict === 'AC' ? pointsOf(test) : 0, verdict: r.verdict, messages: r.messages || [], ...(r.detail && { detail: r.detail }), ...(r.used && { used: r.used }) });

/**
 * A submission's tests from the `from`-th on (of those `visible` selects): onTest(k, result) after each (the worker
 * reports them one by one, so that a test past its time limit is that test's). `vectors`: a test's by its id (the
 * reference tests' expected rows, a vectors test's file); `prepared`: the design's prepareDesign, made already. Returns { design: { verdict, messages, warnings }, tests }.
 */
export async function gradeTests(ex, submission, { visible = false, from = 0, vectors = {}, synthesize = null, exerciseUnits, prepared = null, onTest = () => {}, onStart = () => {} } = {}) {
  const tests = testsOf(ex, { visible });
  const prep = prepared || prepareDesign(ex, submission, { exerciseUnits });
  const design = { verdict: prep.verdict, messages: prep.messages, warnings: prep.warnings };
  const files = submission.files instanceof Map ? submission.files : new Map(Object.entries(submission.files || {}));
  const out = [];
  for (let k = from; k < tests.length; k++) {
    const t = tests[k];
    onStart(k);
    let r;
    if (prep.verdict) r = { verdict: prep.verdict, messages: [] };
    else {
      const v = vectors[t.id];
      try { r = await runTest(ex, t, prep, { files, synthesize, project: submission.project || {}, vectors: v && (v.rows ? { ...v, problems: v.problems || [] } : testVectors(ex, t, { text: v.text })) }); }
      catch (e) { r = t.kind === 'synthesis' ? { verdict: null, messages: [`the synthesis could not run: ${e.message}`] } : { verdict: 'RE', messages: [`the simulation failed: ${e.message}`] }; }
    }
    const res = resultOf(t, r);
    out[k] = res;
    onTest(k, res);
  }
  return { design, tests: out };
}

/** A submission's result from its design's and tests' results: the total, the overall verdict (the first that is not
 *  Accepted), the maximum (of the tests run). */
export function summarize(ex, name, { design, tests }, { visible = false } = {}) {
  const run = testsOf(ex, { visible });
  const list = run.map((t, k) => tests[k] || resultOf(t, design.verdict ? { verdict: design.verdict } : { verdict: 'TLE', messages: ['not run'] }));
  const points = list.reduce((s, t) => s + t.points, 0), max = list.reduce((s, t) => s + t.max, 0);
  const verdict = design.verdict || list.find(t => t.verdict && t.verdict !== 'AC')?.verdict || 'AC';
  return { submission: name, exercise: ex.id, visible, verdict, verdictName: VERDICTS[verdict], points, max, design, tests: list };
}
