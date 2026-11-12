// Automatic grading (#3191, #3192), as Mooshak does for programming: a submission's design is checked (it compiles, its
// top is the statement's: core/grade-design.js), then each test of the exercise (core/grade-format.js) gives its
// verdict and its points (core/grade-sim.js; the synthesis's through `synthesize`, the open synthesis where there is
// one; the equivalence's through `yosys`, Yosys's run, core/verify.js). A Compile Error or an Interface Error is every
// test's. gradeTests runs in one place, synchronously but for the synthesis and the equivalence: server/grade-worker.js
// runs it in a worker with its limits, the interface on the student's own design. Isomorphic.
import { VERDICTS, parseVectors, valueBits, limitsOf, testsOf, pointsOf, localize, GRADE_CHECKS, NOT_GRADED } from './grade-format.js';
import { prepareDesign } from './grade-design.js';
import { runVectors, runTestbench, randomRows, referenceRows } from './grade-sim.js';
import { CHECKS } from './labs-check.js';
import { verifyEquivalence, VERIFY_DEPTH } from './verify.js';

export { VERDICTS };
const LATCH_RE = /^"[^"]*" Line \d+: Found \d+-bit latch for signal/;

/** The vectors a test compares: a vectors test's own (`text`: its file's when it has one), a reference test's from the
 *  reference design (`expected`, computed apart: the reference never runs with a submission). */
function testVectors(ex, test, { text = null, expected = null } = {}) {
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

// a synthesis test from the open synthesis's results ({ errors, warnings, latches, luts, ffs, slices, notes: what it
// could not check, as the slices without nextpnr's chip database, #3215 }, { timedOut: its limit's seconds }, or the
// test's { result } graded elsewhere)
async function runSynthesis(ex, test, design, synthesize) {
  if (!synthesize) return { verdict: null, messages: ['the synthesis tests run where the open synthesis is (silinx grade, the server)'] };
  const r = await synthesize(design.sources, ex.top, test);
  // (the test graded elsewhere: the local server's page asks its server, #3216)
  if (r.result) return r.result;
  // (the page's: its worker stopped at the test's time limit, #3216; the server's process is stopped instead)
  if (r.timedOut) return { verdict: 'TLE', messages: [`the test took more than ${r.timedOut} s`] };
  if (r.errors?.length) return { verdict: 'NS', messages: r.errors.slice(0, 5) };
  const latches = Math.max(r.latches || 0, design.warnings.filter(w => LATCH_RE.test(w)).length ? 1 : 0);
  if (test.latches === false && latches) return { verdict: 'LI', messages: [...design.warnings.filter(w => LATCH_RE.test(w)), ...(r.latches ? [`the synthesis inferred ${r.latches} latch${r.latches > 1 ? 'es' : ''}`] : [])] };
  if (test.warnings === false && (r.warnings?.length || design.warnings.length)) return { verdict: 'NS', messages: ['this exercise allows no warning', ...design.warnings, ...(r.warnings || [])].slice(0, 6) };
  const over = [['luts', 'LUTs'], ['ffs', 'flip-flops'], ['slices', 'slices']].filter(([k]) => test[k] !== undefined && (r[k] ?? 0) > test[k])
    .map(([k, n]) => `${r[k]} ${n}, at most ${test[k]}`);
  const notes = r.notes || [];
  if (over.length) return { verdict: 'RL', messages: [...over, ...notes] };
  return { verdict: 'AC', messages: notes, used: { luts: r.luts, ffs: r.ffs, slices: r.slices, latches } };
}

// an equivalence test (#3217): the submission's top proved equivalent to the exercise's reference by Verify Equivalence
// (core/verify.js, Yosys's SAT, `yosys` its run), the two compiled apart. The reference meets the submission only in
// Yosys's miter, as netlists: nothing of the submission runs there, nothing reads a file. A difference: the first cycle
// that differs, its outputs as a vectors test's, and the inputs that lead to it.
async function runEquivalence(ex, test, design, yosys) {
  if (!yosys) return { verdict: null, messages: ['the equivalence tests run where Yosys is (silinx grade, the server, the page)'] };
  const referenceSources = (ex.reference?.files || []).map(f => ({ path: f.path, lang: /\.(vhd|vhdl)$/i.test(f.path) ? 'vhdl' : 'verilog', text: f.text }));
  if (!referenceSources.length) return { verdict: null, messages: ['the exercise: an equivalence test needs the reference design'] };
  // (Yosys failing, or giving no result, is the grader's: a Grading Error)
  let failed = null;
  const run = async (...a) => { try { return await yosys(...a); } catch (e) { failed = e; throw e; } };
  const r = await verifyEquivalence(design.sources, { top: ex.top, reference: ex.top, referenceSources, depth: test.depth ?? VERIFY_DEPTH, run });
  if (failed || (r.status === 'error' && r.log)) return { verdict: 'GE', messages: [`the equivalence check could not run: ${failed?.message || r.errors[0]}`] };
  if (r.status === 'proved') return { verdict: 'AC', messages: [`equivalent to the reference for every input sequence (proved by induction over ${r.induction} clock cycle(s))`] };
  if (r.status === 'bounded') return { verdict: 'AC', messages: [`no difference from the reference in the first ${r.depth} clock cycle(s) (not proved beyond them)`] };
  if (r.status === 'failed') {
    const last = r.cycles[r.cycle - 1], clocks = new Set(r.clocks.map(c => c.toLowerCase()));
    // (the inputs in the statement's order, the clock's left out: one edge per cycle)
    const names = ex.ports.filter(p => p.dir === 'in' && !clocks.has(p.name.toLowerCase())).map(p => p.name);
    const inputs = c => names.map(n => [n, c.in[n] ?? c.in[Object.keys(c.in).find(k => k.toLowerCase() === n.toLowerCase())]]).filter(([, v]) => v !== undefined).map(([n, v]) => `${n}=${v}`).join(' ');
    return { verdict: 'WA', messages: [`cycle ${r.cycle}: ${r.differs.map(n => `${n} is ${last.uut[n]}, expected ${last.ref[n]}`).join(', ')}`,
      `the inputs, cycle by cycle: ${r.cycles.map((c, k) => `${k + 1}: ${inputs(c) || '-'}`).join('; ')}`] };
  }
  return { verdict: 'NS', messages: r.errors.slice(0, 5) };
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
// (a check grading cannot run, in an exercise graded all the same: a Grading Error, its reason said, #3329)
async function runChecks(test, io) {
  const bad = test.checks.map((c, j) => !GRADE_CHECKS.includes(c?.check) && `check ${j + 1} (${c?.check}): ${Object.hasOwn(NOT_GRADED, c?.check) ? NOT_GRADED[c.check] : `"check": one of ${GRADE_CHECKS.join(', ')}`}`).filter(Boolean);
  if (bad.length) return { verdict: 'GE', messages: bad };
  const reasons = [];
  for (const c of test.checks) reasons.push(...await CHECKS[c.check].run(c, io));
  return reasons.length ? { verdict: 'WA', messages: [...new Set(reasons)] } : { verdict: 'AC', messages: [] };
}

/** One test of a prepared design (prepareDesign): its { verdict, messages, detail? }. `project`: the submission's
 *  silinx.json (the check tests'). */
async function runTest(ex, test, design, { files = new Map(), vectors = null, synthesize = null, yosys = null, project = {} } = {}) {
  const limits = limitsOf(ex, test);
  if (test.kind === 'testbench') return runTestbench(design.sources, test, { files, limits });
  if (test.kind === 'check') return runChecks(test, submissionIo(project, files, design));
  if (test.kind === 'synthesis') return runSynthesis(ex, test, design, synthesize);
  if (test.kind === 'equivalence') return runEquivalence(ex, test, design, yosys);
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
export async function gradeTests(ex, submission, { visible = false, from = 0, vectors = {}, synthesize = null, yosys = null, exerciseUnits, prepared = null, onTest = () => {}, onStart = () => {} } = {}) {
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
      try { r = await runTest(ex, t, prep, { files, synthesize, yosys, project: submission.project || {}, vectors: v && (v.rows ? { ...v, problems: v.problems || [] } : testVectors(ex, t, { text: v.text })) }); }
      catch (e) {
        // (the grader's own failure, not the submission's: a Grading Error, with what failed: a refused read names its path)
        const why = `${e.message}${e.resource ? ` (${e.permission || 'access'} ${e.resource})` : ''}`;
        r = t.kind === 'synthesis' || t.kind === 'equivalence' ? { verdict: 'GE', messages: [`the ${t.kind === 'synthesis' ? 'synthesis' : 'equivalence check'} could not run: ${why}`] } : { verdict: 'RE', messages: [`the simulation failed: ${why}`] };
      }
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
