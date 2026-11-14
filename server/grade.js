// Automatic grading (#3191, #3192) on this machine: `silinx grade <exercise> <submission…>` and the MCP server's `grade`
// tool. The exercise is a *.exercise.json (core/grade-format.js; its files beside it read here, kept inside its
// folder). A submission is a project folder or a zip, untrusted: only its files are read, inside its folder, no
// symbolic link, at most MAX_FILE bytes a file and MAX_TOTAL in all; a folder of submissions is one per sub-folder or
// zip. Each submission is graded in a process of its own (server/grade-run.js, core/grade.js): Node's permission
// model where there is one (it reads Silinx's files only and writes none), its heap limited (limits.memoryMb), killed
// past a test's time (limits.seconds): that test is Time Limit Exceeded (Memory Limit Exceeded when it ran out of
// heap), and a new process goes on from the next one. The reference design's expected rows are computed in such a
// process too, apart: a submission's process never has the reference, and a hidden test's file never reaches it but
// as the test's data.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseExercise, limitsOf, testsOf, localize, pointsOf } from '../core/grade-format.js';
import { summarize } from '../core/grade.js';
import { gateEntries, gateZip } from '../core/import-gate.js';
import { within } from './paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
export const MAX_FILE = 2 << 20;
const MAX_TOTAL = 20 << 20;
const MAX_FILES = 2000;
const CODEC = { inflate: (d, limit) => zlib.inflateRawSync(d, { maxOutputLength: Math.max(1, limit) }) };
const isText = p => !/\.(bit|bin|ncd|ngc|ngd|zip|png|jpe?g|gif|pdf|o|exe|dll)$/i.test(p);

/** An exercise of a file: { exercise, problems, dir }; its files given as { path, file } read beside it (inside its
 *  folder). */
export function loadExercise(file) {
  const where = path.basename(file);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) { return { exercise: null, problems: [`${where}: ${e.code === 'ENOENT' ? 'no such file' : e.message}`] }; }
  const dir = path.dirname(path.resolve(file));
  let raw;
  try { raw = JSON.parse(text); } catch (e) { return { exercise: null, problems: [`${where}: not JSON (${e.message})`] }; }
  const problems = [];
  const read = rel => {
    const full = path.resolve(dir, String(rel));
    let real;
    try { real = fs.realpathSync(full); } catch { problems.push(`${where}: no file ${rel} beside it`); return ''; }
    if (!within(fs.realpathSync(dir), real) || real === fs.realpathSync(dir)) { problems.push(`${where}: ${rel} is not inside the exercise's folder`); return ''; }
    return fs.readFileSync(real, 'utf8');
  };
  const withText = files => (Array.isArray(files) ? files.map(f => (f && typeof f.text !== 'string' && typeof f.file === 'string' ? { path: f.path, text: read(f.file) } : f)) : files);
  if (raw && typeof raw === 'object') {
    if (raw.reference?.files) raw.reference = { ...raw.reference, files: withText(raw.reference.files) };
    if (Array.isArray(raw.tests)) raw.tests = raw.tests.map(t => (!t || typeof t !== 'object' ? t
      : t.kind === 'vectors' && typeof t.vectors !== 'string' && typeof t.file === 'string' ? (({ file, ...rest }) => ({ ...rest, vectors: read(file) }))(t)
      : t.kind === 'testbench' ? { ...t, files: withText(t.files) } : t));
  }
  if (problems.length) return { exercise: null, problems };
  const r = parseExercise(JSON.stringify(raw), where);
  return { ...r, dir };
}

// ---------------------------------------------------------------- submissions
const err = (name, message) => ({ name, error: message });

// the import gate's limits for a submission (core/import-gate.js, #2830: its names, sizes and kinds checked as every
// import's), and its texts by path (a file it refuses, or one not text, left out: a listed source missing is a
// Compile Error then)
const LIMITS = { maxArchive: MAX_TOTAL, maxTotal: MAX_TOTAL, maxFiles: MAX_FILES, maxFile: MAX_FILE, maxText: MAX_FILE };
const textsOf = gated => new Map(gated.files.filter(f => typeof f.text === 'string').map(f => [f.path, f.text]));

// a project folder's files: every regular file under it (no symbolic link, no hidden folder, not build/), through the gate
function readFolder(dir, name) {
  const files = [];
  let total = 0;
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.name.startsWith('.') || p === 'build' || e.name === 'node_modules') continue;
      if (e.isSymbolicLink()) throw new Error(`${p} is a symbolic link`);
      if (e.isDirectory()) { walk(p); continue; }
      if (!e.isFile() || !isText(p)) continue;
      const size = fs.statSync(path.join(dir, p)).size;
      if (size > MAX_FILE) throw new Error(`${p} is larger than ${MAX_FILE >> 20} MB`);
      if ((total += size) > MAX_TOTAL) throw new Error(`the submission is larger than ${MAX_TOTAL >> 20} MB`);
      if (files.length >= MAX_FILES) throw new Error(`the submission has more than ${MAX_FILES} files`);
      files.push({ path: p, data: new Uint8Array(fs.readFileSync(path.join(dir, p))) });
    }
  };
  try { walk(''); return { name, files: textsOf(gateEntries(files, { limits: LIMITS })) }; } catch (e) { return err(name, `the submission cannot be read: ${e.message}`); }
}

// a zip's files through the gate, with the same limits (its silinx.json at its root or in its one folder)
async function readZipFile(file, name) {
  let all;
  try {
    if (fs.statSync(file).size > MAX_TOTAL) throw new Error(`larger than ${MAX_TOTAL >> 20} MB`);
    all = textsOf(await gateZip(fs.readFileSync(file), CODEC, { limits: LIMITS }));
  } catch (e) { return err(name, `the submission cannot be read: ${e.message.replace(/^cannot read zip: /, '')}`); }
  const paths = [...all.keys()].filter(isText);
  const root = paths.includes('silinx.json') ? '' : (paths.find(p => /^[^/]+\/silinx\.json$/.test(p))?.replace(/silinx\.json$/, '') ?? '');
  return { name, files: new Map(paths.filter(p => p.startsWith(root)).map(p => [p.slice(root.length), all.get(p)])) };
}

/** A submission of a path (a project folder or a zip): { name, project, files } or { name, error }. */
export async function readSubmission(p) {
  const name = path.basename(p).replace(/\.zip$/i, '');
  let st;
  try { st = fs.lstatSync(p); } catch { return err(name, 'no such file or folder'); }
  if (st.isSymbolicLink()) return err(name, 'the submission is a symbolic link');
  const sub = st.isDirectory() ? readFolder(p, name) : /\.zip$/i.test(p) ? await readZipFile(p, name) : err(name, 'not a project folder or a zip');
  if (sub.error) return sub;
  const pj = sub.files.get('silinx.json');
  if (pj === undefined) return err(name, 'no Silinx project (silinx.json not found)');
  try { sub.project = JSON.parse(pj); } catch (e) { return err(name, `silinx.json is not JSON: ${e.message}`); }
  if (!sub.project || typeof sub.project !== 'object') return err(name, 'silinx.json is not a project');
  return sub;
}

/** The submissions of the paths given: a project folder or a zip each, or a folder of them (its sub-folders and
 *  zips, by name). */
export function expandSubmissions(paths) {
  const out = [];
  for (const p of paths) {
    let st;
    try { st = fs.lstatSync(p); } catch { out.push(p); continue; }
    if (st.isDirectory() && !fs.existsSync(path.join(p, 'silinx.json'))) {
      for (const e of fs.readdirSync(p, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (e.name.startsWith('.')) continue;
        if (e.isDirectory() || (e.isFile() && /\.zip$/i.test(e.name))) out.push(path.join(p, e.name));
      }
    } else out.push(p);
  }
  return out;
}

// ---------------------------------------------------------------- the grading process
/** The flags of a grading process: its heap, and Node's permission model where this Node has it: reading Silinx's own
 *  files only (its folder, its packages' and `read`'s: the routing graph of the synthesis tests' device when it is
 *  the user's, built from their ISE, and nextpnr's chip database downloaded for it), writing none. Nothing else of the user's folders: the process never looks for
 *  what it needs (a lookup of a folder it may not read is refused, as an error), it is given (synthesisStatus). */
export function processFlags(memoryMb, { read = [] } = {}) {
  const flags = [`--max-old-space-size=${Math.max(32, Math.round(memoryMb))}`];
  if (process.allowedNodeEnvironmentFlags.has('--permission')) {
    // (the packages' folder: node_modules, Silinx's own or the one above it that npm installed them in)
    const dirs = new Set([ROOT, ...read]);
    for (const pkg of ['@yowasp/yosys', '@silinx/nextpnr-himbaechel-spartan3e']) {
      try { const f = fileURLToPath(import.meta.resolve(pkg)); dirs.add(f.slice(0, f.lastIndexOf(`${path.sep}node_modules${path.sep}`) + 13)); } catch { /* not installed */ }
    }
    flags.push('--permission', ...[...dirs].map(d => `--allow-fs-read=${d}`));
  }
  return flags;
}

/** The synthesis tests' device status, as the grading process uses it ({ part, device, graph, reason }: server/
 *  open-flow.js openStatus, its routing graph found here, Silinx's or the user's), or null when no test synthesizes;
 *  when a test limits the slices, nextpnr's chip database got here too (grade-synth.js slicesChipdb: chipdbDir, the
 *  folder the process may read, or slicesReason, #3215). nextpnr: the chip databases' io (a test's stand-in). */
export async function synthesisStatus(ex, { nextpnr } = {}) {
  if (!ex.tests.some(t => t.kind === 'synthesis')) return null;
  const [{ openStatus }, { GRADE_DEVICE, slicesChipdb }] = await Promise.all([import('./open-flow.js'), import('./grade-synth.js')]);
  const device = ex.device || GRADE_DEVICE, st = openStatus(device);
  const out = { part: st.part, device: st.device, graph: st.graph || null, reason: st.reason };
  if (out.part && out.graph && ex.tests.some(t => t.kind === 'synthesis' && t.slices !== undefined)) Object.assign(out, await slicesChipdb(device, { nextpnr }));
  return out;
}

// one run of server/grade-run.js on a job: its messages one by one (onMessage, which returns the seconds the process
// has from then on, null for no limit, undefined to keep the clock as it is), then { code, timedOut, outOfMemory }
function runProcess(job, { memoryMb, seconds, onMessage }) {
  return new Promise(resolve => {
    const read = [job.synthesis?.graph && path.dirname(job.synthesis.graph), job.synthesis?.chipdbDir].filter(Boolean);
    const child = spawn(process.execPath, [...processFlags(memoryMb, { read }), path.join(HERE, 'grade-run.js')], { stdio: ['pipe', 'pipe', 'pipe'], cwd: ROOT, env: { PATH: process.env.PATH || '', ...(process.env.SILINX_CONFIG_DIR && { SILINX_CONFIG_DIR: process.env.SILINX_CONFIG_DIR }) } });
    let buf = '', errText = '', timer = null, timedOut = false;
    const arm = s => { clearTimeout(timer); timer = s ? setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, s * 1000) : null; };
    arm(seconds);
    child.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        let m;
        try { m = JSON.parse(line); } catch { continue; }
        const next = onMessage(m);
        if (next !== undefined) arm(next);
      }
    });
    child.stderr.on('data', d => { if (errText.length < 20000) errText += d; });
    child.on('close', code => {
      clearTimeout(timer);
      resolve({ code, timedOut, outOfMemory: /heap out of memory|Allocation failed|ERR_WORKER_OUT_OF_MEMORY/i.test(errText), stderr: errText });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(JSON.stringify(job));
  });
}

/** A reference test's expected rows (or its problems), computed apart from the submissions. */
export async function referenceVectorsOf(ex) {
  const out = {};
  for (const t of ex.tests.filter(x => x.kind === 'reference')) {
    const limits = limitsOf(ex, t);
    let got = null;
    const r = await runProcess({ type: 'reference', exercise: ex, test: t.id }, { memoryMb: limits.memoryMb, seconds: limits.seconds * 2, onMessage: m => { if (m.type === 'vectors') got = m.vectors; } });
    out[t.id] = got || { problems: [r.timedOut ? `the reference took more than ${limits.seconds * 2} s` : `the reference could not run: ${r.stderr.split('\n').find(Boolean) || `exit ${r.code}`}`] };
  }
  return out;
}

/** A vectors test (`test`, its text read) filled from the exercise's reference (core/grade-author.js
 *  expectedFromReference: { text, rows, problems }), computed in a grading process as the reference tests' rows are. */
export async function expectedOf(ex, test) {
  const limits = limitsOf(ex, test);
  let got = null;
  const r = await runProcess({ type: 'expected', exercise: ex, test }, { memoryMb: limits.memoryMb, seconds: limits.seconds * 2, onMessage: m => { if (m.type === 'expected') got = m.expected; } });
  return got || { text: null, rows: 0, problems: [r.timedOut ? `the reference took more than ${limits.seconds * 2} s` : `the reference could not run: ${r.stderr.split('\n').find(Boolean) || `exit ${r.code}`}`] };
}

/** One submission graded: core/grade.js summarize's result. `vectors`: the reference tests' (referenceVectorsOf). */
export async function gradeSubmission(ex, sub, { visible = false, vectors = {}, exerciseUnits = [], synthesis } = {}) {
  const tests = testsOf(ex, { visible });
  if (sub.error) return summarize(ex, sub.name, { design: { verdict: 'CE', messages: [sub.error], warnings: [] }, tests: [] }, { visible });
  const results = [];
  let design = null, from = 0;
  // (only what the tests run need: a hidden test's data never reaches a visible run's process; the reference design only
  // for an equivalence test, #3217, whose check joins it with the submission's in Yosys)
  const exercise = { ...ex, reference: tests.some(t => t.kind === 'equivalence') ? ex.reference : undefined, tests };
  const need = Object.fromEntries(Object.entries(vectors).filter(([id]) => tests.some(t => t.id === id)));
  const submission = { project: sub.project, files: [...sub.files] };
  if (synthesis === undefined) synthesis = await synthesisStatus(exercise);
  while (from < tests.length) {
    let current = null;
    const limitOf = k => limitsOf(ex, tests[k]);
    const r = await runProcess({ type: 'grade', exercise, submission, from, vectors: need, exerciseUnits, synthesis }, {
      memoryMb: limitOf(from).memoryMb, seconds: limitOf(from).seconds,
      onMessage: m => {
        if (m.type === 'design') { design = m.design; return undefined; }
        if (m.type === 'start') { current = m.k; return limitOf(m.k).seconds; }
        if (m.type === 'test') { results[m.k] = m.result; current = null; return m.k + 1 < tests.length ? limitOf(m.k + 1).seconds : null; }
        return undefined;
      },
    });
    if (r.code === 0 && !r.timedOut) break;
    // a test past its limits: its verdict, then the next ones in a new process
    const k = current ?? from;
    const l = limitOf(k);
    const t = tests[k];
    const verdict = r.outOfMemory ? 'MLE' : r.timedOut ? 'TLE' : 'RE';
    const why = r.outOfMemory ? `the simulation needed more than ${l.memoryMb} MB` : r.timedOut ? `the test took more than ${l.seconds} s` : `the grading stopped: ${r.stderr.split('\n').find(Boolean) || `exit ${r.code}`}`;
    if (current === null && !design) {
      // (before the first test: the design itself, compiling or elaborating)
      design = { verdict, messages: [r.outOfMemory ? `compiling the design needed more than ${l.memoryMb} MB` : r.timedOut ? `compiling the design took more than ${l.seconds} s` : why], warnings: [] };
      break;
    }
    results[k] = { id: t.id, title: localize(t.title) || t.id, kind: t.kind, visible: !!t.visible, max: pointsOf(t), points: 0, verdict, messages: [why] };
    from = k + 1;
  }
  return summarize(ex, sub.name, { design: design || { verdict: null, messages: [], warnings: [] }, tests: results }, { visible });
}

/** An exercise's grading of many submissions (paths: expandSubmissions'): { results, problems } (problems: the
 *  exercise's, nothing graded). onResult(result) after each; expand false: each path a submission, none a folder of
 *  them (a folder with no project is one with no submission). */
export async function gradeAll(exerciseFile, paths, { visible = false, expand = true, onResult = () => {} } = {}) {
  const { exercise: ex, problems } = loadExercise(exerciseFile);
  if (!ex) return { results: [], problems, exercise: null };
  const run = testsOf(ex, { visible });
  const vectors = run.some(t => t.kind === 'reference') ? await referenceVectorsOf({ ...ex, tests: run }) : {};
  const bad = Object.entries(vectors).filter(([, v]) => v.problems?.length).flatMap(([id, v]) => v.problems.map(m => `test ${id}: ${m}`));
  if (bad.length) return { results: [], problems: bad, exercise: ex };
  const { exerciseUnitNames } = await import('../core/grade-design.js');
  const exerciseUnits = [...exerciseUnitNames(ex)];
  const results = [];
  const synthesis = await synthesisStatus({ ...ex, tests: run });
  for (const p of expand ? expandSubmissions(paths) : paths) {
    const r = await gradeSubmission(ex, await readSubmission(p), { visible, vectors, exerciseUnits, synthesis });
    results.push(r);
    onResult(r);
  }
  return { results, problems: [], exercise: ex };
}
