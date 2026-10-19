// The Silinx toolchain (toolchain mode 'silinx', experimental): Implement Design and Generate
// Programming File without Xilinx ISE, for the devices with a device description (the routing
// graph: core/fpga/devices/ or ~/.silinx/devices) and a bit database (research/s3e-bitstream/db).
//
// runOpenImplementation() is the job of POST /projects/:p/implement in that mode. The flow runs in
// a child process (server/open-flow-run.js: synthesis with Yosys compiled to WebAssembly, pack,
// place, route, static timing, bitgen), which prints the same "=== SILINX STEP x ===" markers as
// ISE's run.sh, so the Processes icons, the console, Stop and the Design Summary work as with ISE:
//   synth      Silinx's front end + Yosys            -> build/open/<top>.json
//   translate  the netlist and the constraints read
//   map        pack (cells into slices and I/O sites)
//   par        place + route on the PIPs whose bits are known -> build/open/placed.xdl, routed.xdl
//   trce       static timing analysis, PERIOD constraints of the UCF -> build/open/timing.txt
//   pin2ucf    the pads the placer chose for the ports, as Xilinx pin2ucf -> build/<top>_pins.ucf
//   bitgen     build/<top>.bit (prombit: build/<top>_prom.bit, StartUpClk Cclk, for the PROM)
// The results go to build/reports.json (source 'open') for the Design Summary.
//
// buildDeviceJob() builds the description of a device from the user's own ISE (xdl -report -pips
// -all_conns <part>, gzipped where ISE runs, copied back) into ~/.silinx/devices, with the ISE mode
// of the configuration (local / docker / ssh, as the ISE flow runs).

import fs from 'node:fs/promises';
import fss from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deviceFamily } from '../core/family.js';
import { OPEN_STEPS, orderOpenSteps } from '../core/open-steps.js';
import { synthEffort } from '../core/synth-open.js';
import { findDeviceGraph, shippedDevicePath, buildDeviceCache, devicesDir, SHIPPED_DEVICES_DIR } from '../core/fpga/device-node.js';
import { S3E_DEVICES } from '../core/fpga/bitstream.js';
import { DB_DIR, hasBitDb, dbPackages } from '../core/fpga/bitdb-node.js';
import { runCommand } from './jobs.js';
import { safeJoin } from './projects.js';
import { loadConfig, detectIse, iseStatus, iseModeOf, which } from './toolchain.js';
import { generateBuild, partStrings, collectReports, runLocal, runDocker, runSsh, normalizeSteps, STEPS, SIM_MODELS } from './ise.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** The bit database (research/s3e-bitstream/db: <device>-*.json, s3e-tiles.json; SILINX_BIT_DB_DIR:
 *  another folder, for tests). */
export const BIT_DB_DIR = process.env.SILINX_BIT_DB_DIR || DB_DIR;
// the devices whose bitstream format Silinx writes (core/fpga/bitstream.js)
const BITSTREAM_DEVICES = Object.keys(S3E_DEVICES);
/** The devices with a bit database, for the messages: 'XC3S100E (CP132), XC3S250E (CP132)…'. */
const supported = (dir = BIT_DB_DIR) => BITSTREAM_DEVICES.map(d => [d, hasBitDatabase(d, null, dir) ? dbPackages(d, dir) : []]).filter(([, p]) => p.length)
  .map(([d, p]) => `${d.toUpperCase()} (${p.join(', ').toUpperCase()})`).join(', ');

/** The steps of the open flow (the ISE flow's names; pin2ucf: the pins the placer chose, as
 *  build/<top>_pins.ucf; postsynth, posttrans, postmap: the Post-Synthesis, Post-Translate and Post-Map
 *  Simulation Models, #120, #121; xpwr: the estimated power, build/<top>.pwr, #123). The others (the
 *  Post-Place & Route model) need ISE. */
export { OPEN_STEPS };

/** Does a bit database exist for this device (e.g. 'xc3s250e'), and with pkg for the pads of that
 *  package (e.g. 'cp132')? */
export function hasBitDatabase(dev, pkg = null, dir = BIT_DB_DIR) {
  return BITSTREAM_DEVICES.includes(dev) && hasBitDb(dev, { pkg, dir });
}

/** The device part as the device report names it: xc3s250ecp132-4. */
export function reportPart(device) {
  const ps = partStrings(device);
  return `xc${ps.bitPart}${ps.speed}`;
}

// a crash of the flow's process for lack of memory (V8's own messages)
// (and a Yosys worker thread's, #86: "Worker terminated due to reaching memory limit: JS heap out of memory")
const OUT_OF_MEMORY = /JavaScript heap out of memory|Reached heap limit|Ineffective mark-compacts near heap limit|Worker terminated due to reaching memory limit/;

/**
 * The JavaScript heap of the flow's process, in MB (#156): Node's default is a fraction of the RAM
 * (about 2 GB on an 8 GB computer), too little for the large designs (AES, SHA-256, a Z80); three
 * quarters of the RAM here, from 2 GB to 16 GB. null when NODE_OPTIONS already sets the limit.
 */
export function flowHeapMb(totalBytes = os.totalmem(), nodeOptions = process.env.NODE_OPTIONS || '') {
  if (/--max-old-space-size/.test(nodeOptions)) return null;
  return Math.max(2048, Math.min(16384, Math.floor(totalBytes / 2 ** 20 * 0.75)));
}

/**
 * Can the Silinx toolchain implement a design for this device?
 * { available, reason, part, device, graph (file or null), shipped, bitDb, canBuild (a device
 * description built from an ISE would make it available: developers only, POST
 * /toolchain/build-device; the interface does not offer it, #8) }.
 */
export function openStatus(device, { dbDir = BIT_DB_DIR } = {}) {
  const out = { available: false, reason: '', part: null, device: null, graph: null, shipped: false, bitDb: false, canBuild: false };
  let part;
  try { part = reportPart(device || {}); } catch (e) { out.reason = e.message; return out; }
  const dev = String(device.part).toLowerCase();
  Object.assign(out, { part, device: dev });
  const fam = deviceFamily(device) || '';
  if (fam !== 'spartan3e') {
    out.reason = `the Silinx toolchain does not support the ${fam || dev} family yet (only the Spartan-3E ${supported(dbDir)}): use an ISE mode`;
    return out;
  }
  const pkg = String(device.package || '').toLowerCase();
  out.bitDb = hasBitDatabase(dev, pkg, dbDir);
  out.graph = findDeviceGraph(part);
  out.shipped = !!out.graph && path.dirname(out.graph) === SHIPPED_DEVICES_DIR;
  if (!out.bitDb) {
    const pkgs = dbPackages(dev, dbDir);
    out.reason = hasBitDatabase(dev, null, dbDir)
      ? `no bit database for the pads of the ${dev} in the ${pkg} package yet (${pkgs.length ? `only ${pkgs.join(', ')}` : 'no package yet'}): use an ISE mode for this device`
      : `no bit database for ${dev} yet (only the ${supported(dbDir)}): use an ISE mode for this device`;
    return out;
  }
  if (!out.graph) {
    out.canBuild = true;
    out.reason = `no device description of ${part} ships with Silinx (the Silinx toolchain supports the ${supported(dbDir)}): use an ISE mode for this device`;
    return out;
  }
  out.available = true;
  out.reason = `${part}: device description (${out.shipped ? 'shipped with Silinx' : 'built from your ISE'}) and bit database`;
  return out;
}

/** Normalise the steps of an open run: the chain from synthesis to the last requested step. */
export function openSteps(steps, { synthUpToDate = false } = {}) {
  const st = normalizeSteps(steps);
  const bad = st.filter(s => !OPEN_STEPS.includes(s));
  if (bad.length) throw Object.assign(new Error(`not available in the Silinx toolchain (they need Xilinx ISE): ${bad.join(', ')}. Choose an ISE mode in Toolchain Settings.`), { status: 400 });
  return orderOpenSteps(st, { synthUpToDate });
}

/**
 * Job body for POST /projects/:p/implement in the open mode.
 * @param {object} job
 * @param {object} o { project, projectDir, steps?, seed?, effort? }
 */
export async function runOpenImplementation(job, { project, projectDir, steps, seed = 1, effort = 1, synthUpToDate = false }) {
  const st = openSteps(steps, { synthUpToDate });
  const status = openStatus(project.device || {});
  job.log(`Silinx implementation with the Silinx toolchain (experimental, no ISE): ${project.name} top=${project.top} device=${status.part || '?'}`);
  const result = { buildDir: path.join(projectDir, 'build'), steps: st, warnings: [], mode: 'silinx', reports: null, completedSteps: [], failedStep: null };
  if (!status.available) {
    job.log(`ERROR: the Silinx toolchain cannot implement this design: ${status.reason}.`);
    throw Object.assign(new Error(`Silinx toolchain not available for ${status.part || 'this device'}: ${status.reason}`), { result, openStatus: status });
  }
  job.log(`Device: ${status.reason}.`);
  // the sources and the UCF, as the ISE flow takes them (build/src, build/<top>.ucf; the checks of
  // the ports without a pin location)
  const gen = await generateBuild(project, projectDir, { steps: STEPS });
  for (const w of gen.warnings) job.log(`WARNING: ${w}`);
  result.warnings = gen.warnings;
  const outDir = path.join(gen.buildDir, 'open');
  await fs.mkdir(outDir, { recursive: true });
  // the outputs of the previous run: they no longer match the design (and a failure must not leave
  // a bitstream behind)
  for (const f of [`${gen.top}.bit`, `${gen.top}_prom.bit`, `${gen.top}_pins.ucf`]) await fs.rm(path.join(gen.buildDir, f), { force: true });
  // (the synthesis up to date, #280: what the report of the run that made it said about it, kept)
  let earlier = null;
  if (!st.includes('synth')) {
    try { const r = JSON.parse(await fs.readFile(path.join(outDir, 'report.json'), 'utf8')); earlier = { synthesis: r.synthesis || null, files: { netlist: r.files?.netlist, synthesis: r.files?.synthesis } }; } catch { /* none */ }
  }
  for (const f of ['placed.xdl', 'routed.xdl', 'timing.txt', 'report.json', 'fpga-view.json']) await fs.rm(path.join(outDir, f), { force: true });
  const spec = {
    top: gen.top, part: status.part, device: status.device, family: deviceFamily(project.device) || 'spartan3e',
    pkg: String(project.device.package).toLowerCase(), graph: status.graph, bitDbDir: BIT_DB_DIR,
    sources: gen.sources.map(s => ({ path: s.path, lang: s.lang, file: path.join(gen.buildDir, s.buildPath) })),
    ucf: gen.hasUcf ? path.join(gen.buildDir, `${gen.top}.ucf`) : null,
    buildDir: gen.buildDir, outDir, steps: st, seed, effort, startupClk: project.impl?.startupClk || 'JtagClk', synthEffort: synthEffort(project.impl),
    ...(!st.includes('synth') && { synthUpToDate: { report: earlier } }),
    // the test bench, for the simulation models' generics (#120, #121)
    simTop: project.simTop || null,
    simSources: (project.files || []).filter(f => f.role === 'sim' && (f.lang === 'vhdl' || f.lang === 'verilog')).map(f => ({ path: f.path, lang: f.lang, file: safeJoin(projectDir, f.path) })),
  };
  await fs.writeFile(path.join(outDir, 'flow.json'), JSON.stringify(spec, null, 2) + '\n');
  const onLine = line => {
    let m = /^=== SILINX STEP (\w+) ===/.exec(line);
    if (m) { if (result.currentStep) result.completedSteps.push(result.currentStep); result.currentStep = m[1]; job.result = result; }
    m = /^=== SILINX FAILED (\w+)/.exec(line);
    if (m) { result.failedStep = m[1]; result.currentStep = null; }
    if (/^=== SILINX DONE ===/.test(line)) { if (result.currentStep) result.completedSteps.push(result.currentStep); result.currentStep = null; }
  };
  let code, outOfMemory = false;
  const heap = flowHeapMb();
  const watch = line => { if (OUT_OF_MEMORY.test(line)) outOfMemory = true; onLine(line); };
  try {
    code = await runCommand(job, process.execPath, [...(heap ? [`--max-old-space-size=${heap}`] : []), path.join(HERE, 'open-flow-run.js'), path.join(outDir, 'flow.json')], { cwd: gen.buildDir, onLine: watch, echo: false });
  } finally {
    try {
      result.reports = await openReports(gen.buildDir, gen.top, project.device);
      await fs.writeFile(path.join(gen.buildDir, 'reports.json'), JSON.stringify(result.reports, null, 2) + '\n');
    } catch (e) { job.log(`WARNING: report writing failed: ${e.message}`); }
  }
  if (code !== 0 && outOfMemory) {
    const step = result.failedStep || result.currentStep;
    job.log(`ERROR:Silinx - out of memory${step ? ` in step '${step}'` : ''}: the design needs more than the ${heap ? `${heap} MB` : 'memory'} the Silinx toolchain may use on this computer (${Math.round(os.totalmem() / 2 ** 30)} GB of RAM). Close other programs, or use a computer with more memory; NODE_OPTIONS=--max-old-space-size=<MB> sets the limit.`);
  }
  if (code !== 0) {
    throw Object.assign(new Error(`Silinx toolchain failed${result.failedStep ? ` in step '${result.failedStep}'` : ''}: see the messages above. Designs the Silinx toolchain does not support yet can be implemented in an ISE mode (Toolchain Settings).`), { result });
  }
  job.log(result.reports?.bit ? `Bitstream: ${result.reports.bit.path}` : 'Flow finished.');
  return result;
}

/**
 * build/reports.json of an open run: the results of build/open/report.json (written by
 * open-flow-run.js) in the shape of collectReports(), with source 'open'. Reports of an earlier ISE
 * run left in build/ are not mixed in.
 */
export async function openReports(buildDir, top, device) {
  const base = await collectReports(buildDir, top, device);   // the .bit and its header
  let r = {};
  try { r = JSON.parse(await fs.readFile(path.join(buildDir, 'open', 'report.json'), 'utf8')); } catch { /* the flow wrote nothing */ }
  const out = { generatedAt: base.generatedAt, top, device: device || null, source: 'open',
    synthesis: r.synthesis || undefined, map: r.map || undefined, par: r.par || undefined, timing: r.timing || undefined,
    bit: r.bit && base.bit ? base.bit : undefined, prom: r.prom || undefined,
    pinsUcf: r.pinsUcf && base.pinsUcf ? base.pinsUcf : undefined, simModels: {}, files: r.files || {} };
  // the simulation models (#120, #121): this run's, or an earlier run's still in build/ (as the ISE flow's)
  for (const step of ['postsynth', 'posttrans', 'postmap']) {
    const rel = SIM_MODELS[step](top), f = path.join(buildDir, rel);
    if (r.simModels?.[step] || fss.existsSync(f)) out.simModels[step] = { ...(r.simModels?.[step] || {}), path: `build/${rel}`, mtime: fss.existsSync(f) ? (await fs.stat(f)).mtime.toISOString() : null };
  }
  out.summary = {
    synthesized: !!out.synthesis,
    mapped: !!out.map,
    routed: out.par ? out.par.routed : null,
    timingMet: out.timing ? out.timing.met : null,
    maxFreqMHz: out.timing?.maxFreqMHz ?? null,
    utilization: out.map?.summary || null,
    bitstream: !!out.bit,
  };
  return out;
}

// ---------------------------------------------------------------------------------------------
// Building a device description from the user's own ISE
// ---------------------------------------------------------------------------------------------

/** The script that writes the gzipped device report where ISE runs (run as run.sh <part>, like the ISE flow). */
export function deviceReportScript() {
  return `#!/usr/bin/env bash
# Generated by Silinx: the device report (xdl -report -pips -all_conns), gzipped, for the open
# toolchain's description of the device. Usage: ./run.sh <part>   (e.g. xc3s500efg320-4)
cd "$(dirname "$0")" || exit 1
PART="$1"
if ! command -v xdl >/dev/null 2>&1; then
  ISE_SETTINGS="\${ISE_SETTINGS:-/opt/Xilinx/14.7/ISE_DS/settings64.sh}"
  if [ -f "$ISE_SETTINGS" ]; then set --; . "$ISE_SETTINGS" >/dev/null 2>&1; fi
fi
if ! command -v xdl >/dev/null 2>&1; then
  echo "ERROR: Xilinx ISE tools (xdl) not found. Put ISE 14.7 on PATH or set ISE_SETTINGS to settings64.sh." >&2
  exit 127
fi
rm -f device.xdlrc device.xdlrc.gz
echo "=== SILINX STEP xdlreport ==="
xdl -report -pips -all_conns "$PART" device.xdlrc || { echo "=== SILINX FAILED xdlreport (exit 1) ==="; exit 1; }
[ -s device.xdlrc ] || { echo "ERROR: xdl wrote no device report"; echo "=== SILINX FAILED xdlreport (exit 1) ==="; exit 1; }
echo "device report: $(wc -c < device.xdlrc) bytes"
echo "=== SILINX STEP gzip ==="
gzip -f device.xdlrc || { echo "=== SILINX FAILED gzip (exit 1) ==="; exit 1; }
echo "compressed: $(wc -c < device.xdlrc.gz) bytes"
echo "=== SILINX DONE ==="
`;
}

/**
 * Job body for POST /toolchain/build-device: { part } (e.g. 'xc3s500efg320-4'). Runs the device
 * report through the configured ISE (the ISE mode, or open.iseMode in the open mode), then packs it
 * into ~/.silinx/devices/<part>.json.gz (core/fpga/device-node.js). The report itself is deleted.
 */
export async function buildDeviceJob(job, { part }) {
  if (!/^xc[a-z0-9]+-\d+$/.test(String(part || ''))) throw Object.assign(new Error(`invalid part '${part}' (e.g. xc3s250ecp132-4)`), { status: 400 });
  const cfg0 = await loadConfig();
  const mode = iseModeOf(cfg0);
  const cfg = { ...cfg0, mode };
  const det = { ise: detectIse(cfg), helpers: { bash: which('bash'), docker: which(cfg.docker.command || 'docker'), ssh: which('ssh'), tar: which('tar') } };
  const status = iseStatus(cfg, det);
  job.log(`Building the device description of ${part} from Xilinx ISE (${mode} mode): xdl -report -pips -all_conns ${part}`);
  if (!status.available) throw new Error(`Xilinx ISE not available (${mode} mode): ${status.reason.replace(/\.$/, '')}. Configure it in Toolchain Settings.`);
  job.log(`ISE: ${status.reason}`);
  job.log('The report is large (200 MB to 1 GB): it is compressed where ISE runs before it is copied here. This takes a few minutes.');
  const work = path.join(devicesDir(), `.build-${part}`);
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });
  await fs.writeFile(path.join(work, 'run.sh'), deviceReportScript(), { mode: 0o755 });
  const gen = { buildDir: work };
  try {
    let code;
    if (mode === 'local') code = await runLocal(job, cfg, det, gen, [part]);
    else if (mode === 'docker') code = await runDocker(job, cfg, gen, [part]);
    else code = await runSsh(job, cfg, det, { name: `device-${part}` }, gen, [part], undefined, { cleanup: true });
    const report = path.join(work, 'device.xdlrc.gz');
    if (code !== 0 || !fss.existsSync(report)) throw new Error(`the device report of ${part} could not be made (exit code ${code})`);
    job.log(`=== SILINX STEP pack ===`);
    job.log(`Packing the device report into the device description (${(fss.statSync(report).size / 1e6).toFixed(1)} MB compressed)…`);
    job.checkCancelled();
    const tmpOut = path.join(work, 'device.json.gz');
    const r = await buildDeviceCache(report, tmpOut);
    const got = String(r.packed.part || '').toLowerCase();
    if (got.replace(/-\d+$/, '') !== part.replace(/-\d+$/, '')) throw new Error(`the report is of ${got}, not of ${part}`);
    const out = path.join(devicesDir(), `${part}.json.gz`);
    await fs.rename(tmpOut, out);
    job.log(`Device description of ${part}: ${out} (${(r.bytes / 1e6).toFixed(1)} MB, ${r.packed.tiles.length} tiles)`);
    if (fss.existsSync(shippedDevicePath(part))) job.log('It takes precedence over the description shipped with Silinx.');
    job.log('=== SILINX DONE ===');
    return { part, path: out, bytes: r.bytes, tiles: r.packed.tiles.length };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
