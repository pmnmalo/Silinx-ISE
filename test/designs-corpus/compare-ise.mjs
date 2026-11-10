#!/usr/bin/env node
// The quality of what the Silinx toolchain generates against Xilinx ISE (XST + map + par), on the
// design corpus: the size (LUTs, flip-flops, slices, shift registers, block RAMs, multipliers) and the
// speed (the critical path of the routed design) of each design, both flows on the same project (the
// same top, I/O wrapper included) and the same chip, the XC3S1200E-FG320 (the largest the Silinx
// toolchain supports, so that the larger designs fit). Both run as the application runs them: the
// Silinx toolchain's job (server/open-flow.js) here, and the ISE flow's job (server/ise.js) through
// Silinx's SSH mode, with the ISE settings of ~/.silinx/config.json (its ssh host is never written in
// a file). ISE gets its best chance: map packs slices as tightly as it can (-c 1, as Silinx's packer
// always does) and the board clock's PERIOD is tightened to --period ns (default 5) so that par works
// for speed (ISE stops improving once a constraint is met; Silinx always optimises for speed). The
// speed of Silinx's routing is measured by ISE's own trce (ise-open-check.sh on the same
// host), so that both critical paths come from the same timing analyser; Silinx's estimate is kept too.
// Of each critical path, trce's breakdown (#646): its levels of logic, its LUT, carry, flip-flop and other
// logic delays and its routing delay (`path`), to tell a synthesis's loss from a place and route's.
// Each design is built at three of Silinx's Optimizations (#2470, #2941), the results' `goals`: Area (a new project's
// default), Speed and Fast; and ISE at the same goal (#3070), by the same Process Properties (GOAL_IMPL: XST's opt_mode
// and opt_level; Fast's, Speed at level 1, is XST's default): a design's `goals.<goal>.silinx` and `.ise`.
//
//   node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>     (the projects)
//   node test/designs-corpus/compare-ise.mjs <dir> [--filter a,b] [--jobs n] [--ise-jobs n] [--period ns] [--goals area,speed,fast] [--serial] [--guard]
//       [--cache dir] [--deadline s] [--build-timeout min]
//   --cache: each build's result kept in dir as soon as it is measured, and taken from there by a later run
//   (quality-cache.mjs, #3292); --deadline (seconds since the epoch): no build starts after it, the ones left are the
//   results' `missing`, which the page lists and the next run makes; --build-timeout: a build still running after so
//   many minutes is stopped, reported as timed out (and made again by the next run). The builds run design after design,
//   each at every goal, so a run stopped part-way has whole designs.
//   --serial: the ISE builds after the Silinx ones, not at the same time (a machine with little memory:
//   a large design needs some GB on each side); --guard: the results are not written when a design
//   that was built before (test/designs-corpus/ise-comparison.json) fails now, on either side (exit 1)
//   node test/designs-corpus/compare-ise.mjs --report        (docs/QUALITY.md from the results only)
//   SILINX_ISE_HOST=local …: ISE from the Docker image on this machine, no ssh (the self-hosted runner
//   of .github/workflows/quality.yml, weekly)
//
// Results (numbers only, never ISE's own files): test/designs-corpus/ise-comparison.json, and the
// page for users, docs/QUALITY.md.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qualityPage } from './quality-page.mjs';
import { DOCKER_ISOLATION } from '../../server/ise.js';
import { lastError, newFailures, parseClocks, constrainedPeriod, criticalPath, remoteWork, mergeable, GOALS } from './compare-lib.mjs';
import { GOAL_IMPL } from '../../packages/silinx-fpga/src/synth-open.js';
import { hashTree, hashFiles, cachePrune, buildOrder, runBuilds, markPending, runSummary } from './quality-cache.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const RESULTS = path.join(HERE, 'ise-comparison.json');
const PAGE = path.join(ROOT, 'docs', 'QUALITY.md');
const STEPS = ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'];

// the EPFL benchmarks against the best-known LUT-6 results (#367): research/epfl-records, when measured
function epflResults() {
  const dir = path.join(ROOT, 'research', 'epfl-records');
  try { return { records: JSON.parse(fs.readFileSync(path.join(dir, 'records.json'), 'utf8')), results: JSON.parse(fs.readFileSync(path.join(dir, 'results.json'), 'utf8')) }; } catch { return null; }
}
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const VALUED = ['--filter', '--jobs', '--ise-jobs', '--period', '--goals', '--cache', '--deadline', '--build-timeout'];
// (a --build-one process's result, its output's last line)
const RESULT = '@@compare-result ';

if (args.includes('--report')) {
  const res = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
  const names = new Set(res.designs.map(d => d.name));
  const inCorpus = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8')).designs.map(d => d.name);
  res.notBuilt ??= inCorpus.filter(n => !names.has(n));
  // (designs added to the corpus since the comparison ran: compared by the next one, #366)
  res.pending = inCorpus.filter(n => !names.has(n) && !res.notBuilt.includes(n));
  if (!res.pending.length) delete res.pending;
  fs.writeFileSync(RESULTS, `${JSON.stringify(res, null, 2)}\n`);
  fs.writeFileSync(PAGE, qualityPage(res, { epfl: epflResults() }));
  console.log(`wrote ${path.relative(ROOT, PAGE)}`);
  process.exit(0);
}

// ----------------------------------------------------- one Silinx build, in a process of its own (--build-timeout, #3292)
const createJobOf = async () => (await import('../../server/jobs.js')).createJob;
const runJob = async (fn) => {
  const createJob = await createJobOf();
  return new Promise(resolve => {
    const t = Date.now();
    const job = createJob('compare', fn);
    const iv = setInterval(() => {
      if (job.status === 'running') return;
      clearInterval(iv);
      resolve({ job, ms: Date.now() - t });
    }, 500);
  });
};
const used = x => (x && typeof x === 'object' ? x.used : x) ?? null;
const item = (items, re) => used((items || []).find(i => re.test(i.name)));

// Silinx at one of its Optimizations (#2941), the Process Properties' ISE properties of each (GOAL_IMPL, #2470): Area (a new
// project's default: the smaller of the usual mapping's netlist and Speed's, one placement), Speed (the mappings for speed,
// several placements) or Fast (the usual mapping, one placement). The toolchain runs in this process (WebAssembly), which a
// job's cancel does not stop: the parent kills the process at its time limit.
if (args[0] === '--build-one') {
  const [, projectDir, goal] = args;
  const { runOpenImplementation } = await import('../../server/open-flow.js');
  const project = JSON.parse(fs.readFileSync(path.join(projectDir, 'silinx.json'), 'utf8'));
  project.impl = { ...(project.impl || {}), ...GOAL_IMPL[goal] };
  const { job, ms } = await runJob(j => runOpenImplementation(j, { project, projectDir, steps: STEPS }));
  let rep = {};
  try { rep = JSON.parse(fs.readFileSync(path.join(projectDir, 'build', 'open', 'report.json'), 'utf8')); } catch { /* nothing written */ }
  const syn = rep.synthesis?.utilization;
  const r = {
    slices: used(rep.map?.summary?.slices), luts: item(syn, /4 input LUTs/), ffs: used(rep.map?.summary?.ffs),
    srl16: item(syn, /shift registers/i) ?? (syn ? 0 : null), bram: item(syn, /RAMB16/) ?? (syn ? 0 : null), mult: item(syn, /MULT18X18/) ?? (syn ? 0 : null),
    estimateNs: rep.timing?.minPeriodNs ?? null, seconds: +(ms / 1000).toFixed(1),
    error: job.status === 'ok' ? undefined : lastError(job),
  };
  process.stdout.write(`\n${RESULT}${JSON.stringify(r)}\n`);
  process.exit(0);
}

// ---------------------------------------------------------------------------------------- the runs
const dir = args.find((a, k) => !a.startsWith('--') && !VALUED.includes(args[k - 1]));
const SERIAL = args.includes('--serial'), GUARD = args.includes('--guard');
const PERIOD = +opt('--period', 5);
if (!dir || !fs.existsSync(dir)) { console.error('usage: compare-ise.mjs <dir of projects from run.mjs --sizes> [--filter a,b] [--jobs n] [--ise-jobs n] [--cache dir] [--deadline s] [--build-timeout min] | --report'); process.exit(2); }
const filter = opt('--filter', null)?.split(',');
const goals = opt('--goals', GOALS.join(',')).split(',');
if (goals.some(g => !GOAL_IMPL[g])) { console.error(`--goals: of ${Object.keys(GOAL_IMPL).join(', ')}`); process.exit(2); }
const CACHE = opt('--cache', null) && path.resolve(opt('--cache'));
const DEADLINE = +opt('--deadline', 0) || 0, BUILD_MIN = +opt('--build-timeout', 0) || 0;
const names = fs.readdirSync(dir).filter(n => fs.existsSync(path.join(dir, n, 'silinx.json')) && (!filter || filter.includes(n))).sort();
// (a --filter run merges into the earlier results: not those of other Optimizations, the results before #2941, in one table)
if (filter && fs.existsSync(RESULTS)) {
  const old = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
  if (!mergeable(old, { goals })) { console.error(`--filter: ${path.relative(ROOT, RESULTS)} is of other Optimizations (${(old.goals || old.optimizations)?.join(', ') || 'Normal, High'}); compare every design (no --filter)`); process.exit(2); }
}

// ISE: the image on this machine (SILINX_ISE_HOST=local), else the user's ISE settings in SSH mode, in
// a configuration of this run's own
const LOCAL = process.env.SILINX_ISE_HOST === 'local';
const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
const SETTINGS = '/opt/Xilinx/14.7/ISE_DS/settings64.sh';
const userCfg = LOCAL ? { mode: 'docker', docker: { image: IMAGE, platform: 'linux/amd64', settings: SETTINGS } }
  : JSON.parse(fs.readFileSync(path.join(os.homedir(), '.silinx', 'config.json'), 'utf8'));
if (!LOCAL && !userCfg.ssh?.host) { console.error('~/.silinx/config.json: no ssh host (the ISE machine); or SILINX_ISE_HOST=local'); process.exit(2); }
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-compare-'));
process.env.SILINX_CONFIG_DIR = path.join(work, 'config');
fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ ...userCfg, mode: LOCAL ? 'docker' : 'ssh' }));
const { runImplementation } = await import('../../server/ise.js');
const { iseWorkBase } = await import('../../server/toolchain.js');

const copyProject = (name, side) => {
  const to = path.join(work, side, name);
  fs.cpSync(path.join(dir, name), to, { recursive: true, filter: f => !/[\\/](build|size\.json)$/.test(f) });
  return to;
};

// a Silinx build in a child process (--build-one), killed at --build-timeout minutes
function silinxBuild(projectDir, goal) {
  const t = Date.now();
  return new Promise(resolve => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--build-one', projectDir, goal], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let out = '', err = '', timedOut = false;
    child.stdout.on('data', d => { out = (out + d).slice(-1e6); });
    child.stderr.on('data', d => { err = (err + d).slice(-4000); });
    const timer = BUILD_MIN && setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, BUILD_MIN * 60e3);
    child.on('close', code => {
      clearTimeout(timer);
      const seconds = +((Date.now() - t) / 1000).toFixed(1);
      const line = out.split('\n').reverse().find(l => l.startsWith(RESULT));
      if (timedOut) resolve({ error: `timed out after ${BUILD_MIN} min (--build-timeout)`, timedOut: true, seconds });
      else if (line) resolve(JSON.parse(line.slice(RESULT.length)));
      else resolve({ error: `the build's process ended (code ${code}): ${err.trim().split('\n').pop() || 'no result'}`, seconds });
    });
  });
}

// ISE's 4-input LUTs used as logic: map's breakdown when it prints one, else the total less the LUTs
// used as route-throughs, shift registers or RAM
const logicLuts = (map, mu) => item(mu, /used as logic/i)
  ?? ((used(map?.summary?.luts) ?? 0) - (item(mu, /route-thru/i) ?? 0) - (item(mu, /Shift registers/i) ?? 0) - (item(mu, /RAMs?$/i) ?? 0));

// ISE at the same goal (#3070): XST's opt_mode and opt_level of the goal's Process Properties (GOAL_IMPL); map and par the same
// for every goal (map -c 1, the PERIOD tightened)
async function iseRun(name, goal) {
  const projectDir = copyProject(name, `ise-${goal}`);
  const project = JSON.parse(fs.readFileSync(path.join(projectDir, 'silinx.json'), 'utf8'));
  project.impl = { ...(project.impl || {}), ...GOAL_IMPL[goal], mapPackFactor: 1 };
  // (a name of the goal's own: the ISE host's folder is the project's name, and two goals of a design may run at once)
  project.name = `${project.name || name}-${goal}`;
  const ucf = project.constraints && path.join(projectDir, project.constraints);
  if (ucf && fs.existsSync(ucf)) fs.writeFileSync(ucf, fs.readFileSync(ucf, 'utf8').replace(/PERIOD "(\w+)" [\d.]+ ns/g, `PERIOD "$1" ${PERIOD} ns`));
  const { job, ms } = await runJobTimed(j => runImplementation(j, { project, projectDir, steps: STEPS }));
  if (job.timedOut) return { error: `timed out after ${BUILD_MIN} min (--build-timeout)`, timedOut: true, seconds: +(ms / 1000).toFixed(1) };
  const r = job.result?.reports || {};
  const mu = r.map?.utilization;
  const periodNs = r.timing?.minPeriodNs ?? r.trce?.minPeriodNs ?? null;
  const twr = path.join(projectDir, 'build', `${project.top}.twr`);
  return {
    slices: used(r.map?.summary?.slices), luts: mu ? logicLuts(r.map, mu) : null, ffs: used(r.map?.summary?.ffs) ?? (mu ? item(mu, /Flip Flops/i) : null),
    srl16: mu ? item(mu, /used as Shift registers/i) ?? 0 : null, bram: mu ? used(r.map?.summary?.bram) ?? 0 : null, mult: mu ? used(r.map?.summary?.mult) ?? 0 : null,
    periodNs, path: fs.existsSync(twr) ? criticalPath(fs.readFileSync(twr, 'latin1'), periodNs) : null, seconds: +(ms / 1000).toFixed(1),
    error: job.status === 'ok' ? undefined : lastError(job),
  };
}
// (ISE's job runs Docker or ssh, child processes its cancel kills)
const runJobTimed = async fn => {
  const { cancelJob } = await import('../../server/jobs.js');
  let job = null, timedOut = false;
  const timer = BUILD_MIN && setTimeout(() => { if (job) { timedOut = true; cancelJob(job.id); } }, BUILD_MIN * 60e3);
  const r = await runJob(j => { job = j; return fn(j); });
  clearTimeout(timer);
  r.job.timedOut = timedOut;
  return r;
};

// ISE's trce on Silinx's routed design (ise-open-check.sh: xdl -xdl2ncd, drc, bitgen, trce), as soon as it is routed:
// { periodNs, path } of the design's routing at a goal (<name>__<goal>); throws when the check could not run
const host = LOCAL ? null : `${userCfg.ssh.user ? `${userCfg.ssh.user}@` : ''}${userCfg.ssh.host}`;
const image = LOCAL ? IMAGE : userCfg.ssh.image || 'xilinx/ise:14.7';
const sshArgs = LOCAL ? [] : ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=4', '-o', 'ConnectTimeout=30', ...(userCfg.ssh.port && userCfg.ssh.port !== 22 ? ['-p', String(userCfg.ssh.port)] : [])];
const ssh = cmd => execFileSync('ssh', [...sshArgs, '--', host, `export PATH="$PATH:/usr/local/bin"; ${cmd}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
function trceOf(name, goal, routed) {
  const t = `${name}__${goal}`, tdir = path.join(work, 'trce', t);
  fs.mkdirSync(path.join(tdir, t), { recursive: true });
  fs.copyFileSync(routed, path.join(tdir, t, 'routed.xdl'));
  fs.copyFileSync(path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/ise-open-check.sh'), path.join(tdir, 'ise-open-check.sh'));
  let out;
  if (LOCAL) out = execFileSync('docker', ['run', '--rm', ...DOCKER_ISOLATION, '--platform', 'linux/amd64', '-v', `${tdir}:/w`, image, 'bash', '/w/ise-open-check.sh', '/w', t], { encoding: 'utf8', maxBuffer: 64 << 20 });
  else {
    // (the host's folder for ISE work, #1774: the ssh config's remoteDir, which Docker Desktop shares, else ~/silinx-compare)
    const { remote, mount } = remoteWork(iseWorkBase('silinx-compare'), `${path.basename(work)}-${t}`);
    ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
    execFileSync('rsync', ['-a', '-e', `ssh ${sshArgs.join(' ')}`, `${tdir}/`, `${host}:${remote}/`]);
    out = ssh(`docker run --rm ${DOCKER_ISOLATION.join(' ')} --platform linux/amd64 -v "${mount}":/w ${image} bash /w/ise-open-check.sh /w ${t}`);
    // (trce's report back, for the critical path's breakdown)
    execFileSync('rsync', ['-a', '-e', `ssh ${sshArgs.join(' ')}`, '--include=*/', '--include=routed.twr', '--exclude=*', `${host}:${remote}/`, `${tdir}/`]);
    ssh(`rm -rf ${remote}`);
  }
  process.stdout.write(out.split('\n').map(l => (l ? `  ISE ${l}\n` : '')).join(''));
  let periodNs = null, clocks = null;
  for (const l of out.split('\n')) {
    const c = /^(\S+): clocks: (.*)$/.exec(l);
    if (c && c[1] === t) clocks = parseClocks(c[2]);
    const m = /^(\S+): timing: .*?Minimum period:\s+([\d.]+)ns/.exec(l);
    if (m && m[1] === t) periodNs = +m[2];
    const p = /^(\S+): timing: .*?Maximum path delay from\/to any node:\s+([\d.]+)ns/.exec(l);
    if (p && p[1] === t && !periodNs) periodNs = +p[2];
  }
  // the clocks ISE's flow times, the UCF's (#53): a design's other clocks are not in ISE's period
  if (clocks && periodNs !== null) {
    const pj = JSON.parse(fs.readFileSync(path.join(dir, name, 'silinx.json'), 'utf8'));
    const ucf = pj.constraints && fs.existsSync(path.join(dir, name, pj.constraints)) ? fs.readFileSync(path.join(dir, name, pj.constraints), 'utf8') : '';
    periodNs = constrainedPeriod(clocks, ucf, periodNs);
  }
  const twr = path.join(tdir, t, 'routed.twr');
  return { periodNs, path: periodNs !== null && fs.existsSync(twr) ? criticalPath(fs.readFileSync(twr, 'latin1'), periodNs) : null };
}

// a Silinx build and trce's timing of its routing: { ...result, periodNs, path }; `unchecked` when trce could not run (not kept)
async function silinxRun(name, goal) {
  const projectDir = copyProject(name, `silinx-${goal}`);
  const r = await silinxBuild(projectDir, goal);
  const routed = path.join(projectDir, 'build', 'open', 'routed.xdl');
  let timing = { periodNs: null, path: null }, unchecked = false;
  if (!r.error && fs.existsSync(routed)) {
    try { timing = trceOf(name, goal, routed); } catch (e) { unchecked = true; console.error(`trce of Silinx's routing of ${name} at ${goal} failed: ${e.message.split('\n')[0]}`); }
  }
  fs.rmSync(projectDir, { recursive: true, force: true });
  return { ...r, ...timing, ...(unchecked ? { unchecked } : {}) };
}

// ------------------------------------------------------------------------------- the builds, kept as they finish (#3292)
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
let commit = process.env.GITHUB_SHA || null;
try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { /* not a checkout */ }
// (an ISE build's key: the build scripts Silinx writes for it and this comparison's code)
const iseCode = hashFiles(['server/ise.js', 'test/designs-corpus/compare-ise.mjs', 'test/designs-corpus/compare-lib.mjs'].map(f => path.join(ROOT, f)));
const projectHash = Object.fromEntries(names.map(n => [n, hashTree(path.join(dir, n))]));
const keyParts = ({ name, goal, side }) => (side === 'silinx'
  ? { side, design: name, project: projectHash[name], goal, impl: GOAL_IMPL[goal], device: 'xc3s1200efg320-4', steps: STEPS, commit, trceImage: image }
  : { side, design: name, project: projectHash[name], goal, impl: GOAL_IMPL[goal], device: 'xc3s1200efg320-4', steps: STEPS, period: PERIOD, image, code: iseCode });
if (CACHE) {
  const pruned = cachePrune(CACHE, 30);
  if (pruned) console.log(`cache: ${pruned} entries unused for 30 days removed`);
  // (marked before the builds: a run killed by its job's timeout leaves it, and the next run resumes this commit)
  if (commit && !filter) markPending(CACHE, commit, true);
}

const builds = buildOrder(names, goals);
console.log(`${names.length} designs at ${goals.join(', ')}; work folder ${work}${DEADLINE ? `; no build starts after ${new Date(DEADLINE * 1000).toISOString()}` : ''}${BUILD_MIN ? `; a build stops after ${BUILD_MIN} min` : ''}`);
// design after design (--serial: one build at a time, Silinx's then ISE's); else Silinx's and ISE's at the same time
const { results, account } = await runBuilds({
  builds, cache: CACHE, keyParts, deadline: DEADLINE, serial: SERIAL,
  concurrency: side => (side === 'ise' ? +opt('--ise-jobs', 2) : +opt('--jobs', 3)),
  build: ({ name: n, goal: g, side }) => (side === 'silinx' ? silinxRun(n, g) : iseRun(n, g)),
  log: (b, r, cached) => {
    const label = `${b.side === 'silinx' ? 'silinx' : 'ise   '} ${b.goal.padEnd(6)} ${b.name}`;
    const sz = b.side === 'silinx' ? `${r.slices} slices, ${r.estimateNs} ns (estimate)` : `${r.slices} slices, ${r.periodNs} ns`;
    console.log(`${label}: ${cached ? 'from the cache' : r.error ? `FAILED ${r.error}` : `${sz}, ${r.seconds} s`}`);
  },
});
const at = (n, g, side) => results[builds.findIndex(b => b.name === n && b.goal === g && b.side === side)];

// the corpus's designs that have no project: Silinx cannot read or synthesize them yet
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const notBuilt = filter ? undefined : manifest.designs.map(d => d.name).filter(n => !fs.existsSync(path.join(dir, n, 'silinx.json')));
const missing = account.missing.map(({ name, goal, side }) => ({ design: name, goal, side }));
const res = {
  generatedAt: new Date().toISOString(), silinxVersion: pkg.version, commit: commit || undefined, device: 'xc3s1200efg320-4', steps: STEPS, isePeriodNs: PERIOD, goals, notBuilt,   // (no `pending`: every design built)
  // (the builds this comparison has not made yet: past the run's deadline, made by the next run, #3292)
  missing: missing.length ? missing : undefined,
  designs: names.map(name => {
    const size = JSON.parse(fs.readFileSync(path.join(dir, name, 'size.json'), 'utf8'));
    // (a build not made: its side left out)
    const byGoal = Object.fromEntries(goals.map(g => {
      const s = at(name, g, 'silinx'), i = at(name, g, 'ise');
      return [g, { silinx: s && (({ unchecked, ...x }) => x)(s), ise: i }];
    }));
    return { name, wrapper: size.wrapper || undefined, goals: byGoal };
  }),
};
const summary = runSummary(account);
console.log(summary.join('\n'));
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Quality: Silinx toolchain vs ISE\n\n${summary.map(l => `- ${l}`).join('\n')}\n`);
if (missing.length && process.env.GITHUB_ACTIONS) console.log(`::notice::Partial comparison: ${missing.length} of ${builds.length} builds left for the next run (Actions ▸ Quality ▸ Run workflow resumes it)`);
if (CACHE && commit && !filter) markPending(CACHE, commit, missing.length > 0);
// merge into the earlier results (a --filter run updates only its designs)
let all = res;
if (filter && fs.existsSync(RESULTS)) {
  const old = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
  all = { ...res, notBuilt: old.notBuilt, designs: [...old.designs.filter(d => !names.includes(d.name)), ...res.designs].sort((a, b) => a.name.localeCompare(b.name)) };
}
// the guard: a design built before that fails now (on either side) is a problem of this run or a
// regression, not a result to publish (a build not made or timed out is not a failure: the page says so)
if (GUARD && fs.existsSync(RESULTS)) {
  const regressions = newFailures(JSON.parse(fs.readFileSync(RESULTS, 'utf8')), all);
  if (regressions.length) {
    console.error(`not written: ${regressions.length} design(s) built before fail now:\n  ${regressions.join('\n  ')}`);
    fs.writeFileSync(path.join(work, '..', `silinx-compare-${path.basename(work)}.json`), `${JSON.stringify(all, null, 2)}\n`);
    process.exit(1);
  }
}
fs.writeFileSync(RESULTS, `${JSON.stringify(all, null, 2)}\n`);
fs.writeFileSync(PAGE, qualityPage(all, { epfl: epflResults() }));
console.log(`wrote ${path.relative(ROOT, RESULTS)} and ${path.relative(ROOT, PAGE)}`);
if (!process.env.SILINX_KEEP) fs.rmSync(work, { recursive: true, force: true }); else console.log(`kept: ${work}`);
process.exit(0);
