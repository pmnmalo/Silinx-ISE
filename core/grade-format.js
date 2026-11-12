// Automatic grading (#3191, #3192): the exercise, a JSON file (`*.exercise.json`) that Silinx reads and writes. It has
// a statement in English and Portuguese, the top module and its ports, what a submission may use (languages, drawings,
// primitives), the limits and the tests, each visible or hidden and worth its points:
//   vectors     cycle-by-cycle inputs and expected outputs (Mooshak's input and output files: parseVectors below)
//   reference   the exercise's reference design run on seeded random inputs: its outputs are the expected ones
//   testbench   the teacher's test bench simulated with the submission: its assertions are the test
//   synthesis   the open synthesis's requirements (synthesizable, no latches, LUTs, flip-flops, slices, warnings)
//   equivalence the submission's top proved equivalent to the reference design by Verify Equivalence (core/verify.js,
//               Yosys's SAT: every input sequence, up to `depth` clock cycles or by induction, #3217)
//   check       the guided labs' step checks (core/labs-check.js CHECKS: project, file, module, syntax, simulate; not process) on the
//               submission, a lab's step as a test (#3179: a lab is an exercise without the grade)
// A file's text can be in the exercise ({ path, text }) or in a file beside it ({ path, file }: read relative to the
// exercise's folder and kept inside it, server/grade.js). The verdicts are VERDICTS. Isomorphic.
import { CHECKS, pattern } from './labs-check.js';
import { MAX_DEPTH } from './verify.js';
import { NAME_RE } from './ident.js';

const EXERCISE_VERSION = 1;
export const isExerciseFile = p => /\.exercise\.json$/i.test(String(p || ''));
const ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** The verdicts, each with its short code (the CSV's, the text report's) and its name. */
export const VERDICTS = Object.freeze({
  AC: 'Accepted',
  WA: 'Wrong Answer',
  CE: 'Compile Error',
  IE: 'Interface Error',
  NS: 'Not Synthesizable',
  LI: 'Latch Inferred',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  RE: 'Runtime Error',
  RL: 'Resource / Timing Limit',
  GE: 'Grading Error',   // (the grader could not run the test: its setup's, not the submission's; the teacher's to fix)
});
export const TEST_KINDS = ['vectors', 'reference', 'testbench', 'synthesis', 'equivalence', 'check'];
/** The guided labs' checks a check test can have: not `process` (it reads the last run's reports, which a submission's
 *  grading does not run: its synthesis test does, #3329); NOT_GRADED, why a check is not one of them. */
export const GRADE_CHECKS = Object.keys(CHECKS).filter(k => k !== 'process');
export const NOT_GRADED = { process: 'a process check is a guided lab\'s: grading runs its own synthesis test ("kind": "synthesis")' };
export const DRAWINGS = ['sch', 'asm', 'fsm', 'tt', 'pn'];
export const LANGUAGES = ['vhdl', 'verilog'];
/** The limits when the exercise does not give them: simulated time (ns, a test bench's), simulation steps, the
 *  wall-clock seconds of a test, the heap of a submission's worker (MB). */
export const DEFAULT_LIMITS = Object.freeze({ simNs: 1e6, steps: 5e6, seconds: 10, memoryMb: 256 });
const MAX_LIMITS = Object.freeze({ simNs: 1e9, steps: 1e9, seconds: 600, memoryMb: 4096 });
const MAX_ROWS = 100000;   // (a vectors test's rows, a reference test's cycles)

/** A text of the exercise in the language `lang` (else English, else the first one given). */
export function localize(text, lang = 'en') {
  if (text == null) return '';
  if (typeof text === 'string') return text;
  return text[lang] ?? text.en ?? Object.values(text).find(v => typeof v === 'string') ?? '';
}
const isText = v => typeof v === 'string' || (v && typeof v === 'object' && !Array.isArray(v) && Object.values(v).length > 0 && Object.values(v).every(s => typeof s === 'string'));
const isFiles = v => Array.isArray(v) && v.length > 0 && v.every(f => f && typeof f.path === 'string' && f.path && (typeof f.text === 'string' || typeof f.file === 'string'));
const posInt = v => Number.isInteger(v) && v > 0;
const posNum = v => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A synthesis or equivalence test's own limits when it gives none: Yosys takes seconds, the simulations a fraction of one. */
export const SYNTH_LIMITS = Object.freeze({ seconds: 120, memoryMb: 1024 });

/** A test's limits: the exercise's, its own over them, the defaults under both (a synthesis test's: SYNTH_LIMITS at
 *  least, but its own; an equivalence test's too, #3217). */
export function limitsOf(ex, test = {}) {
  const l = { ...DEFAULT_LIMITS, ...(ex?.limits || {}) };
  if (test.kind === 'synthesis' || test.kind === 'equivalence') for (const [k, v] of Object.entries(SYNTH_LIMITS)) l[k] = Math.max(l[k], v);
  return { ...l, ...(test.limits || {}) };
}

function limitProblems(l, at) {
  if (l === undefined) return [];
  if (!l || typeof l !== 'object' || Array.isArray(l)) return [`${at}"limits": an object`];
  return Object.entries(l).flatMap(([k, v]) => (!(k in DEFAULT_LIMITS) ? [`${at}"limits": no limit '${k}' (${Object.keys(DEFAULT_LIMITS).join(', ')})`]
    : !posNum(v) || v > MAX_LIMITS[k] ? [`${at}"limits.${k}": a number from 0 to ${MAX_LIMITS[k]}`] : []));
}

function testProblems(t, ex, at) {
  const out = [];
  const bad = m => out.push(`${at}: ${m}`);
  if (!t || typeof t !== 'object' || Array.isArray(t)) return [`${at}: not a test`];
  if (!TEST_KINDS.includes(t.kind)) { bad(`"kind": one of ${TEST_KINDS.join(', ')}`); return out; }
  if (t.title !== undefined && !isText(t.title)) bad('"title": a text');
  if (t.visible !== undefined && typeof t.visible !== 'boolean') bad('"visible": true or false');
  if (t.points !== undefined && !(typeof t.points === 'number' && t.points >= 0 && Number.isFinite(t.points))) bad('"points": a number from 0');
  out.push(...limitProblems(t.limits, `${at}: `));
  const inputs = (ex.ports || []).filter(p => p.dir === 'in').map(p => p.name.toLowerCase());
  if (t.clock !== undefined && !inputs.includes(String(t.clock).toLowerCase())) bad(`"clock": '${t.clock}' is not an input of ${ex.top}`);
  if ((t.kind === 'vectors' || t.kind === 'reference') && t.periodNs !== undefined && !posNum(t.periodNs)) bad('"periodNs": a number of ns from 0');
  if (t.kind === 'vectors') {
    if (typeof t.vectors !== 'string' && typeof t.file !== 'string') bad('"vectors": the vectors\' text (or "file": a file beside the exercise)');
    else if (typeof t.vectors === 'string') for (const m of parseVectors(t.vectors, ex.ports || [], { clock: t.clock }).problems) bad(m);
  }
  if (t.kind === 'reference') {
    if (!ex.reference) bad('the exercise has no "reference"');
    if (!posInt(t.cycles) || t.cycles > MAX_ROWS) bad(`"cycles": a whole number from 1 to ${MAX_ROWS}`);
    if (t.seed !== undefined && !Number.isInteger(t.seed)) bad('"seed": a whole number');
    for (const k of ['hold', 'fixed']) {
      if (t[k] === undefined) continue;
      if (!t[k] || typeof t[k] !== 'object' || Array.isArray(t[k])) { bad(`"${k}": an object of inputs`); continue; }
      for (const name of Object.keys(t[k])) if (!inputs.includes(name.toLowerCase())) bad(`"${k}": '${name}' is not an input of ${ex.top}`);
    }
  }
  if (t.kind === 'equivalence') {
    if (!ex.reference) bad('the exercise has no "reference"');
    if (t.depth !== undefined && !(posInt(t.depth) && t.depth <= MAX_DEPTH)) bad(`"depth": a whole number of clock cycles from 1 to ${MAX_DEPTH}`);
  }
  if (t.kind === 'testbench') {
    if (!NAME_RE.test(String(t.top ?? ''))) bad('"top": the test bench\'s module');
    if (!isFiles(t.files)) bad('"files": a list of { "path", "text" } (or { "path", "file" })');
    if (t.done !== undefined && (typeof t.done !== 'string' || !pattern(t.done))) bad('"done": a message the test bench prints at its end (a text, or "/regex/flags")');
  }
  if (t.kind === 'check') {
    if (!Array.isArray(t.checks) || !t.checks.length) bad(`"checks": a list of the guided labs' checks (${GRADE_CHECKS.join(', ')})`);
    else t.checks.forEach((c, j) => {
      const kind = GRADE_CHECKS.includes(c?.check) && CHECKS[c.check];
      if (Object.hasOwn(NOT_GRADED, c?.check)) bad(`check ${j + 1} (${c.check}): ${NOT_GRADED[c.check]}`);
      else if (!kind) bad(`check ${j + 1}: "check": one of ${GRADE_CHECKS.join(', ')}`);
      else for (const m of kind.problems(c)) bad(`check ${j + 1} (${c.check}): ${m}`);
    });
  }
  if (t.kind === 'synthesis') {
    for (const k of ['luts', 'ffs', 'slices']) if (t[k] !== undefined && !(Number.isInteger(t[k]) && t[k] >= 0)) bad(`"${k}": a whole number from 0`);
    for (const k of ['latches', 'warnings']) if (t[k] !== undefined && typeof t[k] !== 'boolean') bad(`"${k}": true or false`);
  }
  return out;
}

/** The problems of an exercise (a parsed *.exercise.json): [] when it can be graded. `where`: its file. */
export function exerciseProblems(ex, where = 'the exercise') {
  const out = [];
  const bad = m => out.push(`${where}: ${m}`);
  if (!ex || typeof ex !== 'object' || Array.isArray(ex)) return [`${where}: not an exercise (a JSON object)`];
  if (ex.silinxExercise !== EXERCISE_VERSION) bad(`"silinxExercise": ${EXERCISE_VERSION} expected`);
  if (!ID_RE.test(String(ex.id ?? ''))) bad('"id": letters, digits, - and _ (at most 64)');
  if (!isText(ex.title)) bad('"title": a text, or { "en": …, "pt": … }');
  if (ex.statement !== undefined && !isText(ex.statement)) bad('"statement": a text');
  if (!NAME_RE.test(String(ex.top ?? ''))) bad('"top": the name of the module the submission makes');
  const before = out.length;
  if (!Array.isArray(ex.ports) || !ex.ports.length) bad('"ports": a list of { "name", "dir": "in" | "out" | "inout", "width" }');
  else {
    const seen = new Set();
    ex.ports.forEach((p, k) => {
      if (!p || !NAME_RE.test(String(p.name ?? ''))) { bad(`port ${k + 1}: "name": an identifier`); return; }
      if (seen.has(p.name.toLowerCase())) bad(`port ${p.name}: given twice`);
      seen.add(p.name.toLowerCase());
      if (!['in', 'out', 'inout'].includes(p.dir)) bad(`port ${p.name}: "dir": in, out or inout`);
      if (!posInt(p.width) || p.width > 1024) bad(`port ${p.name}: "width": a whole number from 1 to 1024`);
    });
  }
  const portsOk = out.length === before;
  const a = ex.allow;
  if (a !== undefined) {
    if (!a || typeof a !== 'object' || Array.isArray(a)) bad('"allow": an object');
    else {
      if (a.languages !== undefined && !(Array.isArray(a.languages) && a.languages.every(l => LANGUAGES.includes(l)))) bad(`"allow.languages": a list of ${LANGUAGES.join(', ')}`);
      if (a.drawings !== undefined && !(Array.isArray(a.drawings) && a.drawings.every(d => DRAWINGS.includes(d)))) bad(`"allow.drawings": a list of ${DRAWINGS.join(', ')}`);
      if (a.primitives !== undefined && typeof a.primitives !== 'boolean') bad('"allow.primitives": true or false');
    }
  }
  out.push(...limitProblems(ex.limits, `${where}: `));
  if (ex.reference !== undefined && !(ex.reference && isFiles(ex.reference.files))) bad('"reference": { "files": [{ "path", "text" }] }');
  if (ex.device !== undefined && !(ex.device && typeof ex.device.part === 'string')) bad('"device": { "part", "package", "speed" } (the synthesis tests\')');
  if (!Array.isArray(ex.tests) || !ex.tests.length) { bad('"tests": a list of tests'); return out; }
  const ids = new Set();
  ex.tests.forEach((t, k) => {
    const at = `test ${k + 1}`;
    if (!ID_RE.test(String(t?.id ?? ''))) bad(`${at}: "id": letters, digits, - and _`);
    else if (ids.has(t.id.toLowerCase())) bad(`${at}: the id '${t.id}' is another test's`);
    else ids.add(t.id.toLowerCase());
    if (portsOk) for (const m of testProblems(t, ex, at)) bad(m);   // (the tests' ports: once the ports are right)
  });
  return out;
}

/** An exercise of a file's text: { exercise, problems } (exercise null when it cannot be graded). */
export function parseExercise(text, where = 'the exercise') {
  let ex;
  try { ex = JSON.parse(text); } catch (e) { return { exercise: null, problems: [`${where}: not JSON (${e.message})`] }; }
  const problems = exerciseProblems(ex, where);
  return { exercise: problems.length ? null : ex, problems };
}

/** An exercise with the texts of its files beside it read (`read(path)`: a path from the exercise's folder, `dir`,
 *  joined; a path that leaves it, or one not read, is a problem): { exercise, problems }. server/grade.js reads them
 *  from the disk (and follows no link out of the folder), the interface from the project. */
export async function withFileTexts(ex, read, dir = '') {
  const problems = [];
  const join = rel => {
    const parts = [...(dir ? dir.split('/') : []), ...String(rel).split('/')], out = [];
    for (const s of parts) { if (s === '..') { if (!out.length) return null; out.pop(); } else if (s && s !== '.') out.push(s); }
    return String(rel).startsWith('/') || !out.length ? null : out.join('/');
  };
  const text = async rel => {
    const p = join(rel);
    if (p === null || (dir && !p.startsWith(`${dir}/`))) { problems.push(`${rel} is not inside the exercise's folder`); return ''; }
    try { return await read(p); } catch { problems.push(`no file ${rel} beside the exercise`); return ''; }
  };
  const files = async list => (Array.isArray(list) ? Promise.all(list.map(async f => (f && typeof f.text !== 'string' && typeof f.file === 'string' ? { path: f.path, text: await text(f.file) } : f))) : list);
  const out = { ...ex };
  if (ex.reference?.files) out.reference = { ...ex.reference, files: await files(ex.reference.files) };
  if (Array.isArray(ex.tests)) out.tests = await Promise.all(ex.tests.map(async t => (!t || typeof t !== 'object' ? t
    : t.kind === 'vectors' && typeof t.vectors !== 'string' && typeof t.file === 'string' ? (({ file, ...rest }) => text(file).then(v => ({ ...rest, vectors: v })))(t)
    : t.kind === 'testbench' ? { ...t, files: await files(t.files) } : t)));
  return { exercise: out, problems };
}

/** A new exercise of a project's top (Project ▸ Exercise…'s New Exercise, the MCP server's grade new): its ports, one visible vectors test of its inputs and outputs to fill in. */
export function newExercise({ top, ports }) {
  const id = top.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  const ins = ports.filter(p => p.dir === 'in').map(p => p.name), outs = ports.filter(p => p.dir !== 'in').map(p => p.name);
  const clock = ins.find(n => /^(clk|clock)$/i.test(n));
  return {
    silinxExercise: 1, id, title: { en: top, pt: top }, statement: { en: '', pt: '' }, top, ports,
    tests: [{ id: 'vectors', title: { en: 'Vectors', pt: 'Vetores' }, visible: true, points: 10, kind: 'vectors', ...(clock && { clock }),
      vectors: `${ins.filter(n => n !== clock).join(' ')} | ${outs.join(' ')}\n` }],
  };
}

/** The file of a new exercise of `top`: <top>.exercise.json, else the first <top>-N.exercise.json not in `tree`. */
export function exerciseFileOf(top, tree) {
  let file = `${top}.exercise.json`;
  for (let k = 2; tree.includes(file); k++) file = `${top}-${k}.exercise.json`;
  return file;
}

/** The student's copy of an exercise: its hidden tests and its reference design left out (nothing of them stays in
 *  it, nor the tests that read it). A test of the copy keeps its own files (a visible test bench). */
export function visibleCopy(ex) {
  const { reference, ...rest } = ex;
  const tests = ex.tests.filter(t => t.visible && t.kind !== 'reference' && t.kind !== 'equivalence');
  return { ...rest, tests };
}

/** The tests a run grades: all, or the visible ones (`visible`). */
export const testsOf = (ex, { visible = false } = {}) => ex.tests.filter(t => !visible || t.visible);
export const pointsOf = t => t.points ?? 1;

// ---------------------------------------------------------------- vectors
// One line of names, the inputs then a `|` then the outputs; then one line per cycle, its inputs' values, a `|`, the
// outputs' expected values. A value: binary (as many digits as the port's width; X and Z too), 0x… (hex), 0b…, a
// decimal number, or `-` (don't care: an output not compared, an input left as it was). `#` starts a comment.

/** The bits of a vector's value for a port of `width`: a string of 0 1 X Z and - (don't care), or null when it is not
 *  a value of that width. */
export function valueBits(tok, width) {
  const s = String(tok).replace(/_/g, '');
  if (s === '-') return '-'.repeat(width);
  if (/^[01xz-]+$/i.test(s) && s.length === width) return s.toUpperCase();
  let n = null;
  if (/^0x[0-9a-f]+$/i.test(s)) n = BigInt(s);
  else if (/^0b[01]+$/i.test(s)) n = BigInt(s);
  else if (/^\d+$/.test(s)) n = BigInt(s);
  else if (/^-\d+$/.test(s)) n = (1n << BigInt(width)) + BigInt(s);
  if (n === null || n < 0n || n >= (1n << BigInt(width))) return null;
  return n.toString(2).padStart(width, '0');
}

/** The vectors of a test's text: { inputs: [port], outputs: [port], rows: [{ line, in: [bits], out: [bits] }],
 *  problems }. The ports are the exercise's ({ name, dir, width }); the clock, an input not in the vectors. */
export function parseVectors(text, ports, { clock = null } = {}) {
  const problems = [], rows = [];
  const lines = String(text).split(/\r?\n/).map((l, k) => ({ n: k + 1, t: l.replace(/#.*$/, '').trim() })).filter(l => l.t);
  const byName = new Map(ports.map(p => [p.name.toLowerCase(), p]));
  if (!lines.length) return { inputs: [], outputs: [], rows, problems: ['the vectors are empty'] };
  const head = lines[0];
  const [ins, outs] = head.t.split('|').map(h => h.trim().split(/\s+/).filter(Boolean));
  if (outs === undefined || head.t.split('|').length !== 2) return { inputs: [], outputs: [], rows, problems: [`vectors line ${head.n}: the inputs' names, a '|', the outputs' names`] };
  const side = (names, dir) => names.map(n => {
    const p = byName.get(n.toLowerCase());
    if (!p) problems.push(`vectors line ${head.n}: '${n}' is not a port`);
    else if (dir === 'in' ? p.dir === 'out' : p.dir === 'in') problems.push(`vectors line ${head.n}: '${n}' is ${dir === 'in' ? 'an output' : 'an input'}`);
    else if (clock && p.name.toLowerCase() === String(clock).toLowerCase()) problems.push(`vectors line ${head.n}: '${n}' is the clock (the grader drives it)`);
    else return p;
    return null;
  }).filter(Boolean);
  const inputs = side(ins, 'in'), outputs = side(outs, 'out');
  if (!outputs.length) problems.push(`vectors line ${head.n}: no output to compare`);
  for (const l of lines.slice(1)) {
    const parts = l.t.split('|');
    const vi = (parts[0] || '').trim().split(/\s+/).filter(Boolean), vo = (parts[1] || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 2 || vi.length !== inputs.length || vo.length !== outputs.length) {
      problems.push(`vectors line ${l.n}: ${inputs.length} input value(s), a '|', ${outputs.length} output value(s)`);
      continue;
    }
    const conv = (v, p) => { const b = valueBits(v, p.width); if (b === null) problems.push(`vectors line ${l.n}: '${v}' is not a value of ${p.name} (${p.width} bit${p.width > 1 ? 's' : ''})`); return b; };
    rows.push({ line: l.n, in: vi.map((v, k) => conv(v, inputs[k])), out: vo.map((v, k) => conv(v, outputs[k])) });
    if (rows.length > MAX_ROWS) { problems.push(`the vectors have more than ${MAX_ROWS} rows`); break; }
  }
  if (!rows.length && !problems.length) problems.push('the vectors have no row');
  return { inputs, outputs, rows, problems };
}

/** The vectors' text of rows ({ in, out } bits), for a reference test written out or a teacher's export. */
export function vectorsText(inputs, outputs, rows) {
  return [`${inputs.map(p => p.name).join(' ')} | ${outputs.map(p => p.name).join(' ')}`, ...rows.map(r => `${r.in.join(' ')} | ${r.out.join(' ')}`)].join('\n') + '\n';
}
