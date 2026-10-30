// The fully open flow checked against Xilinx ISE (the oracle), on another machine with the ISE
// Docker image (e.g. an Intel Mac, where ISE runs natively): for each project, the open flow
// (packages/silinx-fpga/research/s3e-route/open-flow.mjs: no Xilinx tool) writes routed.xdl and its .bit; ISE converts
// the same routed.xdl, runs its design rule check and writes its own .bit (ise-open-check.sh); the
// two .bit files must be byte-identical (CRC on and off), and ISE's xdl -xdl2ncd and DRC must give
// no error and no warning. The open flow's own warnings are listed. A Spartan-6 project (its silinx.json's device, the
// Nexys3's or the Atlys's part, #732) runs the application's own open flow (server/open-flow.js) on a copy of it, and
// its .bit is compared with packages/silinx-fpga/research/s6/check-bitgen6.mjs.
//
//   SILINX_ISE_HOST=user@host node scripts/check-open-flow.mjs [project folder [open-flow options] …]   (default: examples/blinky)
//   SILINX_ISE_HOST=local …: the ISE Docker image on this machine (the self-hosted runner of
//   .github/workflows/ise.yml), no ssh
//   (also: SILINX_ISE_IMAGE, default xilinx/ise:14.7; SILINX_ISE_REMOTE_DIR, the host's folder for the work, default
//   ~/.silinx/config.json's ssh.remoteDir, else ~/silinx-open-check: one Docker Desktop shares, #482).
//   Needs the device cache (~/.silinx/devices).
// Options after a project folder go to its open flow (e.g. `examples/pong --seed 2 --timing-route 0`); the
// same project may be given several times with different options. With SILINX_KEEP=1 the work
// folder is kept, with ISE's timing report (routed.twr, trce -a) and every connection's delay
// (routed.dly, reportgen -delay) next to each routed.xdl: packages/silinx-fpga/research/s3e-route/timing-fit.mjs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { iseWorkBase } from '../server/toolchain.js';
import { DOCKER_ISOLATION } from '../server/ise.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOST = process.env.SILINX_ISE_HOST;   // only from the environment, never written in a file
const LOCAL = HOST === 'local';   // the image on this machine
const IMAGE = process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7';
if (!HOST) { console.error('set SILINX_ISE_HOST=user@host (a machine with the ISE Docker image, reached by ssh with a key), or SILINX_ISE_HOST=local (the image on this machine)'); process.exit(2); }
// projects, each with the open-flow options that follow it
const projects = [];
for (const a of process.argv.slice(2)) {
  if (fs.existsSync(path.join(a, 'silinx.json'))) projects.push({ dir: a, opts: [] });
  else if (projects.length) projects.at(-1).opts.push(a);
  else { console.error(`${a}: not a Silinx project folder`); process.exit(2); }
}
if (!projects.length) projects.push({ dir: path.join(ROOT, 'examples', 'blinky'), opts: [] });

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-open-check-'));
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts });
const ssh = cmd => run('ssh', ['-o', 'BatchMode=yes', '--', HOST, `export PATH="$PATH:/usr/local/bin"; ${cmd}`]);
const names = [];
let failed = 0;

// the Spartan-6's open flow as the application runs it (#732), on a copy of the project: { ok, lines } and
// <out>/routed.xdl
async function openFlowS6(dir, out) {
  const src = path.join(out, 'project');
  fs.cpSync(dir, src, { recursive: true, filter: f => !/[\\/]build$/.test(f) });
  const project = JSON.parse(fs.readFileSync(path.join(src, 'silinx.json'), 'utf8'));
  const { createJob } = await import('../server/jobs.js');
  const { runOpenImplementation } = await import('../server/open-flow.js');
  const job = createJob('check', j => runOpenImplementation(j, { project, projectDir: src, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] }));
  while (job.status === 'running') await new Promise(r => setTimeout(r, 200));
  const routed = path.join(src, 'build', 'open', 'routed.xdl');
  if (job.status === 'ok') fs.copyFileSync(routed, path.join(out, 'routed.xdl'));
  return { ok: job.status === 'ok', lines: job.lines };
}
const family = dir => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8')).device?.family; } catch { return null; } };
const s6 = new Set();

// 1. the open flow, here
for (const { dir, opts } of projects) {
  let name = [path.basename(path.resolve(dir)), ...opts.map(o => o.replace(/^--/, ''))].join('-').replace(/[^\w.-]/g, '_');
  while (names.includes(name)) name += '_';
  names.push(name);
  let ok, lines;
  if (family(dir) === 'spartan6') {
    if (opts.length) { console.log(`${name}: open-flow options are for the Spartan-3E's open-flow.mjs only`); failed++; names.pop(); continue; }
    fs.mkdirSync(path.join(work, name));
    ({ ok, lines } = await openFlowS6(dir, path.join(work, name)));
    s6.add(name);
  } else {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/open-flow.mjs'), dir, path.join(work, name), ...opts], { encoding: 'utf8' });
    ok = r.status === 0;
    lines = `${r.stdout}\n${r.stderr}`.split('\n');
  }
  const warns = lines.filter(l => /warning/i.test(l)).map(l => l.trim());
  console.log(`${name}: open flow ${ok ? 'ok' : 'FAILED'}; ${warns.length} warning(s)${warns.length ? `: ${warns.join(' | ')}` : ''}`);
  if (!ok) { console.log(lines.filter(l => l.trim()).slice(-10).join('\n')); failed++; names.pop(); }
}
if (!names.length) process.exit(1);

// 2. ISE, on the remote host (or here, SILINX_ISE_HOST=local): xdl -xdl2ncd, drc, bitgen (CRC on and off)
// a folder of its own on the host (other checks may run there at the same time)
// (SILINX_ISE_REMOTE_DIR, else the ssh config's remoteDir: e.g. /Users/Shared/silinx-ise/build, where Docker Desktop shares
// folders, #482; else ~/silinx-open-check)
const remoteBase = iseWorkBase('silinx-open-check');
const remote = `${remoteBase}/${path.basename(work)}`;
const mount = remote.startsWith('/') ? remote : `$HOME/${remote}`;
fs.copyFileSync(path.join(ROOT, 'packages/silinx-fpga/research/s3e-route/ise-open-check.sh'), path.join(work, 'ise-open-check.sh'));
let out;
if (LOCAL) out = run('docker', ['run', '--rm', ...DOCKER_ISOLATION, '--platform', 'linux/amd64', '-v', `${work}:/w`, IMAGE, 'bash', '/w/ise-open-check.sh', '/w', ...names]);
else {
  ssh(`rm -rf ${remote} && mkdir -p ${remote}`);
  run('rsync', ['-a', '-e', 'ssh -o BatchMode=yes', `${work}/`, `${HOST}:${remote}/`]);
  out = ssh(`docker run --rm ${DOCKER_ISOLATION.join(' ')} -v "${mount}":/w ${IMAGE} bash /w/ise-open-check.sh /w ${names.join(' ')}`);
  run('rsync', ['-a', '-e', 'ssh -o BatchMode=yes', '--include=*/', '--include=ise*.bit', '--include=drc.log', '--include=xdl2ncd.log', '--include=routed.twr', '--include=routed.dly', '--exclude=*', `${HOST}:${remote}/`, `${work}/`]);
  ssh(`rm -rf ${remote}`);
}
process.stdout.write(out.split('\n').map(l => (l ? `  ISE ${l}` : l)).join('\n'));

// the Spartan-6's (#732): bitstreamS6 of the routed.xdl with ISE's header and options, against each of ISE's .bit, as
// check-writer.mjs reports it ({ stdout }: BYTE-IDENTICAL, or how they differ)
async function checkS6(d) {
  const { compareBit } = await import('../packages/silinx-fpga/research/s6/check-bitgen6.mjs');
  const { loadDeviceCache, loadBitDbS6 } = await import('../packages/silinx-fpga/src/node.js');
  const text = fs.readFileSync(path.join(d, 'routed.xdl'), 'utf8');
  const part = text.match(/^design "[^"]*" (\S+)/m)[1].replace(/^(xc6slx\d+)-?(csg\d+)(-\d)?$/, '$1$2-3');
  const device = loadDeviceCache(part), db = loadBitDbS6(part);
  const out = [];
  for (const b of ['ise.bit', 'ise-nocrc.bit']) {
    if (!fs.existsSync(path.join(d, b))) { out.push(`${b}: not written by ISE`); continue; }
    const r = compareBit(text, fs.readFileSync(path.join(d, b)), device, db);
    out.push(r.same ? `${b}: BYTE-IDENTICAL` : `${b}: ${r.diff} bytes differ from ${r.first} (sizes ${r.sizes.join(' / ')})${r.unknown.size ? `; not in the bit databases: ${[...r.unknown.keys()].slice(0, 10).join(', ')}` : ''}`);
  }
  return { stdout: out.join('\n') };
}

// 3. Silinx's .bit against ISE's, from the same routed.xdl (the header's name, date and time are ISE's)
for (const name of names) {
  const d = path.join(work, name);
  const drc = fs.existsSync(path.join(d, 'drc.log')) ? fs.readFileSync(path.join(d, 'drc.log'), 'utf8') : '';
  const drcOk = /PhysDesignRules results include: <0> errors/.test(drc);
  const drcWarn = +(/<(\d+)> warnings/.exec(drc)?.[1] ?? NaN);
  const x2n = fs.existsSync(path.join(d, 'xdl2ncd.log')) ? fs.readFileSync(path.join(d, 'xdl2ncd.log'), 'utf8') : '';
  const x2nWarn = (x2n.match(/^WARNING/gm) || []).length;
  const check = s6.has(name) ? await checkS6(d) : spawnSync(process.execPath, [path.join(ROOT, 'packages/silinx-fpga/research/s3e-bitstream/check-writer.mjs'),
    path.join(d, 'routed.xdl'), path.join(d, 'ise.bit'), path.join(d, 'routed.xdl'), path.join(d, 'ise-nocrc.bit')], { encoding: 'utf8' });
  const same = (check.stdout.match(/BYTE-IDENTICAL/g) || []).length === 2;
  console.log(`${name}: DRC ${drcOk ? '0 errors' : 'ERRORS'}, ${Number.isNaN(drcWarn) ? '?' : drcWarn} warnings; xdl2ncd ${x2nWarn} warnings; .bit vs ISE's bitgen: ${same ? 'byte-identical (CRC on and off)' : 'DIFFERENT'}`);
  if (!same) console.log(check.stdout.trim());
  if (x2nWarn) console.log(x2n.split('\n').filter(l => /^WARNING/.test(l)).join('\n'));
  if (!drcOk || drcWarn !== 0 || x2nWarn || !same) failed++;
}
if (!process.env.SILINX_KEEP) fs.rmSync(work, { recursive: true, force: true }); else console.log(`kept: ${work}`);
console.log(failed ? `${failed} design(s) failed` : 'the open flow matches ISE');
process.exit(failed ? 1 : 0);
