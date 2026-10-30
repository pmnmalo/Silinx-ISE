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
// Silinx is built at its two Optimization Efforts (#377): Normal, the app's default (`silinx` in the
// results), and High (impl.optLevel 2, `silinxHigh`); ISE at its default (Normal).
//
//   node test/designs-corpus/run.mjs --stages frontend,synth,flow --sizes <dir>     (the projects)
//   node test/designs-corpus/compare-ise.mjs <dir> [--filter a,b] [--jobs n] [--ise-jobs n] [--period ns] [--serial] [--guard]
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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { qualityPage } from './quality-page.mjs';
import { DOCKER_ISOLATION } from '../../server/ise.js';
import { lastError, newFailures, parseClocks, constrainedPeriod, criticalPath, remoteWork } from './compare-lib.mjs';

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

// ---------------------------------------------------------------------------------------- the runs
const dir = args.find((a, k) => !a.startsWith('--') && !['--filter', '--jobs', '--ise-jobs', '--period'].includes(args[k - 1]));
const SERIAL = args.includes('--serial'), GUARD = args.includes('--guard');
const PERIOD = +opt('--period', 5);
if (!dir || !fs.existsSync(dir)) { console.error('usage: compare-ise.mjs <dir of projects from run.mjs --sizes> [--filter a,b] [--jobs n] [--ise-jobs n] | --report'); process.exit(2); }
const filter = opt('--filter', null)?.split(',');
const names = fs.readdirSync(dir).filter(n => fs.existsSync(path.join(dir, n, 'silinx.json')) && (!filter || filter.includes(n))).sort();

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
const { createJob } = await import('../../server/jobs.js');
const { runImplementation } = await import('../../server/ise.js');
const { runOpenImplementation } = await import('../../server/open-flow.js');
const { iseWorkBase } = await import('../../server/toolchain.js');

const copyProject = (name, side) => {
  const to = path.join(work, side, name);
  fs.cpSync(path.join(dir, name), to, { recursive: true, filter: f => !/[\\/](build|size\.json)$/.test(f) });
  return to;
};
const runJob = (fn) => new Promise(resolve => {
  const t = Date.now();
  const job = createJob('compare', fn);
  const iv = setInterval(() => {
    if (job.status === 'running') return;
    clearInterval(iv);
    resolve({ job, ms: Date.now() - t });
  }, 500);
});
const used = x => (x && typeof x === 'object' ? x.used : x) ?? null;
const item = (items, re) => used((items || []).find(i => re.test(i.name)));

// Silinx at its two Optimization Efforts (#377): Normal (the app's default, one mapping) and High (the
// mappings for speed too, impl.optLevel 2); ISE at its default (Normal) in both comparisons
const EFFORTS = { normal: 1, high: 2 };
async function silinxRun(name, effort = 'normal') {
  const projectDir = copyProject(name, effort === 'normal' ? 'silinx' : `silinx-${effort}`);
  const project = JSON.parse(fs.readFileSync(path.join(projectDir, 'silinx.json'), 'utf8'));
  project.impl = { ...(project.impl || {}), optLevel: EFFORTS[effort] };
  const { job, ms } = await runJob(j => runOpenImplementation(j, { project, projectDir, steps: STEPS }));
  let rep = {};
  try { rep = JSON.parse(fs.readFileSync(path.join(projectDir, 'build', 'open', 'report.json'), 'utf8')); } catch { /* nothing written */ }
  const syn = rep.synthesis?.utilization;
  return {
    slices: used(rep.map?.summary?.slices), luts: item(syn, /4 input LUTs/), ffs: used(rep.map?.summary?.ffs),
    srl16: item(syn, /shift registers/i) ?? (syn ? 0 : null), bram: item(syn, /RAMB16/) ?? (syn ? 0 : null), mult: item(syn, /MULT18X18/) ?? (syn ? 0 : null),
    estimateNs: rep.timing?.minPeriodNs ?? null, seconds: +(ms / 1000).toFixed(1),
    routed: path.join(projectDir, 'build', 'open', 'routed.xdl'),
    error: job.status === 'ok' ? undefined : lastError(job),
  };
}

// ISE's 4-input LUTs used as logic: map's breakdown when it prints one, else the total less the LUTs
// used as route-throughs, shift registers or RAM
const logicLuts = (map, mu) => item(mu, /used as logic/i)
  ?? ((used(map?.summary?.luts) ?? 0) - (item(mu, /route-thru/i) ?? 0) - (item(mu, /Shift registers/i) ?? 0) - (item(mu, /RAMs?$/i) ?? 0));

async function iseRun(name) {
  const projectDir = copyProject(name, 'ise');
  const project = JSON.parse(fs.readFileSync(path.join(projectDir, 'silinx.json'), 'utf8'));
  project.impl = { ...(project.impl || {}), mapPackFactor: 1 };
  const ucf = project.constraints && path.join(projectDir, project.constraints);
  if (ucf && fs.existsSync(ucf)) fs.writeFileSync(ucf, fs.readFileSync(ucf, 'utf8').replace(/PERIOD "(\w+)" [\d.]+ ns/g, `PERIOD "$1" ${PERIOD} ns`));
  const { job, ms } = await runJob(j => runImplementation(j, { project, projectDir, steps: STEPS }));
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

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) { const k = next++; out[k] = await fn(items[k], k); }
  }));
  return out;
}

console.log(`${names.length} designs; work folder ${work}`);
const silinxAll = (effort) => pool(names, +opt('--jobs', 3), async n => { const r = await silinxRun(n, effort); console.log(`silinx ${effort.padEnd(6)} ${n}: ${r.error ? `FAILED ${r.error}` : `${r.slices} slices, ${r.estimateNs} ns (estimate), ${r.seconds} s`}`); return r; });
const silinxBoth = async () => ({ normal: await silinxAll('normal'), high: await silinxAll('high') });
const iseAll = () => pool(names, +opt('--ise-jobs', 2), async n => { const r = await iseRun(n); console.log(`ise    ${n}: ${r.error ? `FAILED ${r.error}` : `${r.slices} slices, ${r.periodNs} ns, ${r.seconds} s`}`); return r; });
const [both, ise] = SERIAL ? [await silinxBoth(), await iseAll()] : await Promise.all([silinxBoth(), iseAll()]);
const sil = both.normal, silHigh = both.high;

// ISE's trce on Silinx's routed designs (ise-open-check.sh: xdl -xdl2ncd, drc, bitgen, trce)
const host = LOCAL ? null : `${userCfg.ssh.user ? `${userCfg.ssh.user}@` : ''}${userCfg.ssh.host}`;
const image = LOCAL ? IMAGE : userCfg.ssh.image || 'xilinx/ise:14.7';
const tdir = path.join(work, 'trce');
// (each design's routing at both efforts: <name> and <name>__high)
const HIGH = '__high';
const timedNames = [
  ...names.filter((n, k) => !sil[k].error && fs.existsSync(sil[k].routed)),
  ...names.filter((n, k) => !silHigh[k].error && fs.existsSync(silHigh[k].routed)).map(n => `${n}${HIGH}`),
];
for (const t of timedNames) {
  const n = t.replace(HIGH, ''), r = (t.endsWith(HIGH) ? silHigh : sil)[names.indexOf(n)];
  fs.mkdirSync(path.join(tdir, t), { recursive: true }); fs.copyFileSync(r.routed, path.join(tdir, t, 'routed.xdl'));
}
fs.copyFileSync(path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/ise-open-check.sh'), path.join(tdir, 'ise-open-check.sh'));
const sshArgs = LOCAL ? [] : ['-o', 'BatchMode=yes', ...(userCfg.ssh.port && userCfg.ssh.port !== 22 ? ['-p', String(userCfg.ssh.port)] : [])];
const ssh = cmd => execFileSync('ssh', [...sshArgs, '--', host, `export PATH="$PATH:/usr/local/bin"; ${cmd}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
// (the host's folder for ISE work, #1774: the ssh config's remoteDir, which Docker Desktop shares, else ~/silinx-compare)
const { remote, mount } = remoteWork(iseWorkBase('silinx-compare'), path.basename(work));
const trce = {}, paths = {};
if (timedNames.length) {
  try {
    let out;
    if (LOCAL) out = execFileSync('docker', ['run', '--rm', ...DOCKER_ISOLATION, '--platform', 'linux/amd64', '-v', `${tdir}:/w`, image, 'bash', '/w/ise-open-check.sh', '/w', ...timedNames], { encoding: 'utf8', maxBuffer: 64 << 20 });
    else {
      ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
      execFileSync('rsync', ['-a', '-e', `ssh ${sshArgs.join(' ')}`, `${tdir}/`, `${host}:${remote}/`]);
      out = ssh(`docker run --rm ${DOCKER_ISOLATION.join(' ')} --platform linux/amd64 -v "${mount}":/w ${image} bash /w/ise-open-check.sh /w ${timedNames.join(' ')}`);
      // (trce's reports back, for the critical paths' breakdown)
      execFileSync('rsync', ['-a', '-e', `ssh ${sshArgs.join(' ')}`, '--include=*/', '--include=routed.twr', '--exclude=*', `${host}:${remote}/`, `${tdir}/`]);
    }
    process.stdout.write(out.split('\n').map(l => (l ? `  ISE ${l}\n` : '')).join(''));
    const clocks = {};
    for (const l of out.split('\n')) {
      const c = /^(\S+): clocks: (.*)$/.exec(l);
      if (c) clocks[c[1]] = parseClocks(c[2]);
      const m = /^(\S+): timing: .*?Minimum period:\s+([\d.]+)ns/.exec(l);
      if (m) trce[m[1]] = +m[2];
      const p = /^(\S+): timing: .*?Maximum path delay from\/to any node:\s+([\d.]+)ns/.exec(l);
      if (p && !trce[p[1]]) trce[p[1]] = +p[2];
    }
    // the clocks ISE's flow times, the UCF's (#53): a design's other clocks are not in ISE's period
    for (const n of Object.keys(clocks)) {
      if (trce[n] === undefined) continue;
      const d = n.replace(HIGH, '');
      const pj = JSON.parse(fs.readFileSync(path.join(dir, d, 'silinx.json'), 'utf8'));
      const ucf = pj.constraints && fs.existsSync(path.join(dir, d, pj.constraints)) ? fs.readFileSync(path.join(dir, d, pj.constraints), 'utf8') : '';
      trce[n] = constrainedPeriod(clocks[n], ucf, trce[n]);
    }
    for (const n of Object.keys(trce)) {
      const twr = path.join(tdir, n, 'routed.twr');
      if (fs.existsSync(twr)) paths[n] = criticalPath(fs.readFileSync(twr, 'latin1'), trce[n]);
    }
    if (!LOCAL) ssh(`rm -rf ${remote}`);
  } catch (e) { console.error(`trce of Silinx's routing on the ISE host failed: ${e.message.split('\n')[0]}`); }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
// the corpus's designs that have no project: Silinx cannot read or synthesize them yet
const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
const notBuilt = filter ? undefined : manifest.designs.map(d => d.name).filter(n => !fs.existsSync(path.join(dir, n, 'silinx.json')));
const res = {
  generatedAt: new Date().toISOString(), silinxVersion: pkg.version, device: 'xc3s1200efg320-4', steps: STEPS, isePeriodNs: PERIOD, notBuilt,   // (no `pending`: every design built)
  designs: names.map((name, k) => {
    const { routed, ...s } = sil[k];
    const { routed: routedHigh, ...h } = silHigh[k];
    const size = JSON.parse(fs.readFileSync(path.join(dir, name, 'size.json'), 'utf8'));
    return { name, wrapper: size.wrapper || undefined, silinx: { ...s, periodNs: trce[name] ?? null, path: paths[name] ?? null }, silinxHigh: { ...h, periodNs: trce[`${name}${HIGH}`] ?? null, path: paths[`${name}${HIGH}`] ?? null }, ise: ise[k] };
  }),
};
// merge into the earlier results (a --filter run updates only its designs)
let all = res;
if (filter && fs.existsSync(RESULTS)) {
  const old = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
  all = { ...res, notBuilt: old.notBuilt, designs: [...old.designs.filter(d => !names.includes(d.name)), ...res.designs].sort((a, b) => a.name.localeCompare(b.name)) };
}
// the guard: a design built before that fails now (on either side) is a problem of this run or a
// regression, not a result to publish
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
