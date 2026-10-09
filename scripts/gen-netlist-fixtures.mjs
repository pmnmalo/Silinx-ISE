#!/usr/bin/env node
// Regenerate the netgen netlist fixtures (test/fixtures/netgen/<design>/{synthesis,translate,map,par}.vhd)
// by running the real Xilinx ISE 14.7 flow on each design of test/fixtures/designs/<design>/.
//
//   node scripts/gen-netlist-fixtures.mjs [design ...] [--jobs N] [--image xilinx/ise:14.7] [--keep]
//
// The flow runs exactly as the app runs it (server/ise.js: generateBuild + runImplementation, docker
// mode): xst -> netgen (post-synthesis) -> ngdbuild -> netgen (post-translate) -> map -> netgen
// (post-map) -> par -> trce -> netgen (post-place & route). Only the VHDL simulation models are kept,
// with the netgen timestamp line removed so that regenerating gives clean diffs. ISE itself is never
// copied anywhere: it stays in the local docker image (default xilinx/ise:14.7; Silinx never pulls it).
//
// Each design directory has a design.json: { device, top, files: [...], ucf?, xstOptions? , sim: {...} }
// (`sim` is read by test/netgen-fixtures.test.js only).

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DESIGNS = path.join(ROOT, 'test', 'fixtures', 'designs');
const OUT = path.join(ROOT, 'test', 'fixtures', 'netgen');
const MODELS = { postsynth: 'synthesis', posttrans: 'translate', postmap: 'map', postpar: 'par' };
const STEPS = ['synth', 'postsynth', 'translate', 'posttrans', 'map', 'postmap', 'par', 'trce', 'postpar'];

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); if (i < 0) return dflt; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const jobsN = Number(opt('--jobs', '3')) || 1;
const image = opt('--image', process.env.SILINX_ISE_IMAGE || 'xilinx/ise:14.7');
const keep = flag('--keep');
const names = args.length ? args : (await fs.readdir(DESIGNS, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();

// isolated toolchain configuration: docker mode with the ISE image
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'silinx-netgen-'));
process.env.SILINX_CONFIG_DIR = path.join(work, 'cfg');
const { saveConfig } = await import('../server/toolchain.js');
await saveConfig({ mode: 'docker', docker: { image, platform: 'linux/amd64', settings: '/opt/Xilinx/14.7/ISE_DS/settings64.sh' } });
const { runImplementation, SIM_MODELS, unconstrainedPorts } = await import('../server/ise.js');
const { runCommand } = await import('../server/jobs.js');

const langOf = (f) => (/\.(vhd|vhdl)$/i.test(f) ? 'vhdl' : 'verilog');

/** netgen output, normalised for committing: no timestamp, no trailing spaces. */
function normaliseNetlist(text) {
  return text
    .replace(/^(--.*Timestamp\s*:).*$/gm, '$1 (removed)')
    .replace(/[ \t]+$/gm, '')
    .replace(/\r\n/g, '\n');
}

// Pins of each package (partgen's .pkg file, run once per package in the docker image): the flow's
// own automatic pin assignment (run.sh) only uses plain I/O pins, too few for some test designs, so
// the ports without a LOC in the design's UCF get one here: input-only (IP) pins for inputs first,
// then the user I/O pins, dual-purpose configuration pins included (they are user I/O after
// configuration), except the mode / JTAG / dedicated ones.
const pkgCache = new Map();
function packagePins(device) {
  const part = `${device.part}${device.package}`.toLowerCase();
  if (!pkgCache.has(part)) pkgCache.set(part, (async () => {
    const dir = path.join(work, `_partgen_${part}`);
    await fs.mkdir(dir, { recursive: true });
    const lines = [];
    const job = { log: (l) => lines.push(l), procs: new Set(), cancelled: false };
    const code = await runCommand(job, 'docker', ['run', '--rm', '--platform', 'linux/amd64', '-v', `${dir}:/work`, '-w', '/work', image,
      'bash', '-c', `set --; . /opt/Xilinx/14.7/ISE_DS/settings64.sh >/dev/null 2>&1; partgen -v ${part} >/dev/null`]);
    if (code !== 0) throw new Error(`partgen ${part} failed:\n${lines.join('\n')}`);
    const pkg = await fs.readFile(path.join(dir, `${part}.pkg`), 'utf8');
    return pkg.split('\n').map((l) => l.trim().split(/\s+/)).filter((f) => f[0] === 'pin' && /^I[OP]/.test(f[5] || ''))
      .filter((f) => !/\b(M[012]|HSWAP|INIT_B|CCLK|DONE|PROG_B|TDI|TDO|TMS|TCK|DIN|CSO_B|RDWR_B|MOSI)\b/.test(f[5].replace(/\//g, ' ')))
      .map((f) => ({ pin: f[2], inputOnly: f[5].startsWith('IP') }));
  })());
  return pkgCache.get(part);
}

/** The design's UCF plus a LOC for every port bit it leaves unconstrained. */
async function pinConstraints(spec, dir) {
  const srcs = await Promise.all(spec.files.map(async (f) => ({ path: f, lang: langOf(f), text: await fs.readFile(path.join(dir, f), 'utf8') })));
  const ucf = spec.ucf ? await fs.readFile(path.join(dir, spec.ucf), 'utf8') : '';
  const free = await unconstrainedPorts(srcs, spec.top, ucf);
  if (!free.length) return ucf;
  const used = new Set([...ucf.matchAll(/LOC\s*=\s*"?(\w+)/gi)].map((m) => m[1].toUpperCase()));
  const pins = (await packagePins(spec.device)).filter((p) => !used.has(p.pin.toUpperCase()));
  const ip = pins.filter((p) => p.inputOnly), io = pins.filter((p) => !p.inputOnly);
  const out = [ucf.trimEnd(), '', '# pins assigned by scripts/gen-netlist-fixtures.mjs'];
  for (const u of [...free].sort((a, b) => (a.dir === 'in') - (b.dir === 'in'))) {
    const p = (u.dir === 'in' && ip.length ? ip : io).shift();
    if (!p) throw new Error(`not enough pins in ${spec.device.package} for ${u.net}`);
    out.push(`NET "${u.net}" LOC = "${p.pin}" ;${u.clock ? ` NET "${u.net}" CLOCK_DEDICATED_ROUTE = FALSE ;` : ''}`);
  }
  return out.join('\n') + '\n';
}

async function genOne(name) {
  const dir = path.join(DESIGNS, name);
  const spec = JSON.parse(await fs.readFile(path.join(dir, 'design.json'), 'utf8'));
  const projectDir = path.join(work, name);
  await fs.mkdir(path.join(projectDir, 'src'), { recursive: true });
  for (const f of spec.files) await fs.copyFile(path.join(dir, f), path.join(projectDir, 'src', f));
  await fs.writeFile(path.join(projectDir, 'src', 'pins.ucf'), await pinConstraints(spec, dir));
  const project = {
    name, top: spec.top, device: spec.device,
    files: spec.files.map((f) => ({ path: `src/${f}`, lang: langOf(f), role: 'design' })),
    constraints: 'src/pins.ucf',
    impl: { optMode: 'Speed', optLevel: 1, xstOptions: spec.xstOptions || {} },
  };
  const lines = [];
  const job = { log: (l) => lines.push(...String(l).split('\n')), procs: new Set(), cancelled: false, result: null, checkCancelled() {} };
  const t0 = Date.now();
  let result, error = null;
  try { result = await runImplementation(job, { project, projectDir, steps: STEPS }); }
  catch (e) { error = e; result = e.result; }
  await fs.writeFile(path.join(projectDir, 'flow.log'), lines.join('\n') + '\n');
  if (error) throw new Error(`${name}: ${error.message} (log: ${path.join(projectDir, 'flow.log')})\n${lines.filter((l) => /ERROR/.test(l)).slice(0, 10).join('\n')}`);
  const out = path.join(OUT, name);
  await fs.mkdir(out, { recursive: true });
  const sizes = {};
  for (const [step, model] of Object.entries(MODELS)) {
    const src = path.join(projectDir, 'build', SIM_MODELS[step](spec.top));
    const text = normaliseNetlist(await fs.readFile(src, 'utf8'));
    await fs.writeFile(path.join(out, `${model}.vhd`), text);
    sizes[model] = text.length;
  }
  const rep = result?.reports;
  const summary = { util: rep?.map?.summary, timingMet: rep?.summary?.timingMet, maxFreqMHz: rep?.summary?.maxFreqMHz };
  console.log(`${name}: ok in ${((Date.now() - t0) / 1000).toFixed(0)} s  ${Object.entries(sizes).map(([k, v]) => `${k} ${(v / 1024).toFixed(1)} KB`).join(', ')}  ${JSON.stringify(summary)}`);
}

console.log(`ISE flow in docker image ${image}, ${names.length} design(s), ${jobsN} at a time; work dir ${work}`);
const queue = [...names];
const failures = [];
await Promise.all(Array.from({ length: Math.min(jobsN, queue.length) }, async () => {
  for (let n; (n = queue.shift());) {
    try { await genOne(n); } catch (e) { failures.push(n); console.error(`FAILED ${e.message}`); }
  }
}));
if (!keep && !failures.length) await fs.rm(work, { recursive: true, force: true });
else console.log(`work directory kept: ${work}`);
if (failures.length) { console.error(`failed: ${failures.join(', ')}`); process.exit(1); }
