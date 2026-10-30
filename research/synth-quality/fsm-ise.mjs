// XST's side of the FSM measurement (#438, fsm.mjs): on the ISE host (the user's ISE settings in SSH mode,
// ~/.silinx/config.json; its host is never written in a file), for each design of fsm-results.json
//   - ISE's flow (XST + map + par + trce, as test/designs-corpus/compare-ise.mjs runs it: map -c 1, the board
//     clock's PERIOD tightened to --period ns so that par works for speed): LUTs, flip-flops, slices, period,
//     and the state machines XST found in its report (.syr): each one's states and the encoding XST chose;
//   - ISE's trce on Silinx's routed designs of each way (fsm.mjs --routed <dir>): packages/silinx-fpga/research/s3e-route/ise-open-check.sh.
//
//   node research/synth-quality/fsm-ise.mjs [--projects dir] [--routed dir] [--filter a,b] [--trce a,b] [--period 5] [--no-flow] [--synth-only]
// --synth-only: XST alone (its state machines; the corpus's sizes and periods are those of test/designs-corpus/ise-comparison.json,
// which do not depend on Silinx); --trce: the designs whose routings are timed (default: all of --filter's)
// --projects: the corpus's projects (node test/designs-corpus/run.mjs --stages frontend --sizes <dir> --filter …);
// the examples are built from examples/. One ISE job at a time; results (numbers only, never ISE's own files) in
// fsm-ise.json, merged with an earlier run's.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..');
const OUT = path.join(HERE, 'fsm-ise.json');

/** XST's state machines in its report: [{ signal, states, encoding }] (encoding: the one XST chose, from
 *  "Optimizing FSM <…> on signal <…> with <e> encoding."). */
export function parseSyrFsms(syr) {
  const found = [], chose = [];
  let cur = null;
  for (const l of syr.split('\n')) {
    let m;
    if ((m = /Found finite state machine <(\S+)> for signal <([^>]+)>/.exec(l))) found.push(cur = { fsm: m[1], signal: m[2], states: null });
    else if (cur && (m = /^\s*\|\s*States\s*\|\s*(\d+)/.exec(l))) { cur.states = +m[1]; cur = null; }
    else if ((m = /Optimizing FSM <([^>]+)> on signal <([^>]+)> with (\S+) encoding/.exec(l))) chose.push({ fsm: m[1], signal: m[2], encoding: m[3] });
  }
  return { found, chose };
}

async function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const filter = opt('--filter', null)?.split(',');
  const PERIOD = +opt('--period', 5);
  const projects = opt('--projects', null), routed = opt('--routed', null);
  const results = JSON.parse(fs.readFileSync(path.join(HERE, 'fsm-results.json'), 'utf8'));
  const names = Object.keys(results).filter(n => !filter || filter.some(f => n === f || n === `examples/${f}`));
  const out = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
  const userCfg = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.silinx', 'config.json'), 'utf8'));
  if (!userCfg.ssh?.host) throw new Error('~/.silinx/config.json: no ssh host (the ISE machine)');
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-fsm-ise-'));
  process.env.SILINX_CONFIG_DIR = path.join(work, 'config');
  fs.mkdirSync(process.env.SILINX_CONFIG_DIR, { recursive: true });
  fs.writeFileSync(path.join(process.env.SILINX_CONFIG_DIR, 'config.json'), JSON.stringify({ ...userCfg, mode: 'ssh' }));
  const { createJob } = await import('../../server/jobs.js');
  const { runImplementation } = await import('../../server/ise.js');
  const runJob = fn => new Promise(resolve => {
    const job = createJob('fsm-ise', fn);
    const iv = setInterval(() => { if (job.status !== 'running') { clearInterval(iv); resolve(job); } }, 500);
  });
  const used = x => (x && typeof x === 'object' ? x.used : x) ?? null;
  const item = (items, re) => used((items || []).find(i => re.test(i.name)));

  if (!argv.includes('--no-flow')) {
    for (const name of names) {
      const src = name.startsWith('examples/') ? path.join(ROOT, name) : projects && path.join(projects, name);
      if (!src || !fs.existsSync(path.join(src, 'silinx.json'))) { console.log(`${name}: no project (--projects)`); continue; }
      const projectDir = path.join(work, 'ise', name.replace(/\//g, '_'));
      fs.cpSync(src, projectDir, { recursive: true, filter: f => !/[\\/](build|size\.json)$/.test(f) });
      const project = JSON.parse(fs.readFileSync(path.join(projectDir, 'silinx.json'), 'utf8'));
      project.impl = { ...(project.impl || {}), mapPackFactor: 1 };
      const ucf = project.constraints && path.join(projectDir, project.constraints);
      if (ucf && fs.existsSync(ucf)) fs.writeFileSync(ucf, fs.readFileSync(ucf, 'utf8').replace(/PERIOD "(\w+)" [\d.]+ ns/g, `PERIOD "$1" ${PERIOD} ns`));
      const synthOnly = argv.includes('--synth-only');
      const job = await runJob(j => runImplementation(j, { project, projectDir, steps: synthOnly ? ['synth'] : ['synth', 'translate', 'map', 'par', 'trce'] }));
      const r = job.result?.reports || {};
      const mu = r.map?.utilization;
      const syrFile = path.join(projectDir, 'build', `${project.top}.syr`);
      const fsms = fs.existsSync(syrFile) ? parseSyrFsms(fs.readFileSync(syrFile, 'utf8')) : null;
      out[name] = {
        ...out[name],
        part: `${project.device.part}${project.device.package}${project.device.speed}`,
        ...(!synthOnly && { luts: mu ? item(mu, /used as logic/i) ?? used(r.map?.summary?.luts) : null, ffs: used(r.map?.summary?.ffs), slices: used(r.map?.summary?.slices), periodNs: r.timing?.minPeriodNs ?? null, isePeriodNs: PERIOD }),
        xstFsms: fsms ? fsms.found.map(f => ({ signal: f.signal, states: f.states, encoding: fsms.chose.find(c => c.signal.startsWith(f.signal.split('<')[0]) || c.fsm.includes(f.signal))?.encoding ?? null })) : null,
        xstEncodings: fsms ? fsms.chose.map(c => `${c.signal}: ${c.encoding}`) : null,
        error: job.status === 'ok' ? undefined : String(job.error?.message || job.error || job.status).replace(/\s+/g, ' ').slice(0, 160),
      };
      console.log(`${name}: ${JSON.stringify(out[name])}`);
      fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    }
  }

  // ISE's trce on Silinx's routed designs (ise-open-check.sh: xdl -xdl2ncd, drc, bitgen, trce)
  if (routed) {
    const timed = opt('--trce', null)?.split(',').map(t => names.find(n => n === t || n === `examples/${t}`)).filter(Boolean) || names;
    const dirs = fs.readdirSync(routed).filter(d => fs.existsSync(path.join(routed, d, 'routed.xdl'))
      && timed.some(n => d.startsWith(`${n.replace(/[^\w.-]/g, '_')}__`)));
    const tdir = path.join(work, 'trce');
    for (const d of dirs) { fs.mkdirSync(path.join(tdir, d), { recursive: true }); fs.copyFileSync(path.join(routed, d, 'routed.xdl'), path.join(tdir, d, 'routed.xdl')); }
    fs.copyFileSync(path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/ise-open-check.sh'), path.join(tdir, 'ise-open-check.sh'));
    const host = `${userCfg.ssh.user ? `${userCfg.ssh.user}@` : ''}${userCfg.ssh.host}`;
    const sshArgs = ['-o', 'BatchMode=yes', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=4', '-o', 'ConnectTimeout=30', ...(userCfg.ssh.port && userCfg.ssh.port !== 22 ? ['-p', String(userCfg.ssh.port)] : [])];
    const ssh = cmd => execFileSync('ssh', [...sshArgs, '--', host, `export PATH="$PATH:/usr/local/bin"; ${cmd}`], { encoding: 'utf8', maxBuffer: 64 << 20 });
    const remote = `silinx-compare/${path.basename(work)}`;
    ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
    execFileSync('rsync', ['-a', '-e', `ssh ${sshArgs.join(' ')}`, `${tdir}/`, `${host}:${remote}/`]);
    const res = ssh(`docker run --rm --platform linux/amd64 -v "$HOME/${remote}":/w ${userCfg.ssh.image || 'xilinx/ise:14.7'} bash /w/ise-open-check.sh /w ${dirs.join(' ')}`);
    ssh(`rm -rf ${remote}`);
    for (const l of res.split('\n')) {
      const m = /^(\S+)__([\w-]+)__s(\d+): timing: .*?(?:Minimum period:|Maximum path delay from\/to any node:)\s+([\d.]+)ns/.exec(l);
      if (!m) { if (/FAILED|drc:.*[1-9]\d* errors/.test(l)) console.log(l); continue; }
      const name = names.find(n => n.replace(/[^\w.-]/g, '_') === m[1]);
      if (!name) continue;
      out[name] = out[name] || {};
      out[name].trce = out[name].trce || {};
      (out[name].trce[m[2]] = out[name].trce[m[2]] || {})[m[3]] = +m[4];
    }
    fs.writeFileSync(OUT, `${JSON.stringify(out, null, 1)}\n`);
    console.log(res);
  }
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(0);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main(process.argv.slice(2));
