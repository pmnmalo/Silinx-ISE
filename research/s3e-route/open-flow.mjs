// The fully open flow for a Silinx project, no Xilinx tool in it: Silinx's front end + Yosys compiled
// to WebAssembly (core/synth-open.js) -> pack -> place -> route on the PIPs whose bits are known ->
// Silinx's bitgen. Needs the device cache (~/.silinx/devices, built from the user's own
// device report: research/s3e-route/build-device.mjs).
//   node research/s3e-route/open-flow.mjs <project folder> <out folder> [--json netlist.json] [--seed N] [--effort E] [--timing T] [--timing-route 0|1] [--tries N] [--no-replicate] [--replicate-opts JSON] [--no-crc] [--quality file]
// (seed, effort, timing: the placer's options, core/fpga/place.js; --timing-route 0: route for
// wirelength only, without the timing-driven router (default 1); --tries N: N placements from
// seed on, each routed, the fastest kept (default 1); --no-replicate: no register replication
// (core/fpga/replicate.js: by default the flip-flops of many loads on the critical path are copied,
// the design placed and routed again, the faster kept; --replicate-opts '{"perCopy":8}' overrides
// its REPLICATION settings)). After routing, the static timing
// analysis of core/fpga/timing.js prints the critical path of each clock (also in timing.txt). Writes into the out folder: <top>.json (Yosys), placed.xdl, routed.xdl, <top>.bit;
// --quality file: the circuit's size and speed as JSON ({ part, slices, luts, ffs, period }: the design
// corpus's qualityOf, test/designs-corpus/lib.mjs), for the comparison of a Yosys update (#352,
// scripts/yosys-update-report.mjs). Fails (exit 1)
// listing the nets that cannot be routed on known PIPs, or the features of the design the bit
// database does not know: the .bit is written only when it is complete.
import fs from 'node:fs';
import path from 'node:path';
import { compile, elaborate } from '../../core/compile.js';
import { primitiveSources } from '../../core/unisim.js';
import { synthesizeOpen } from '../../core/synth-open.js';
import { yosysWorkers } from '../../core/synth-open-node.js';
import { parseXdl, writeXdl } from '../../core/xdl.js';
import { readYosysJson } from '../../core/fpga/netlist.js';
import { pack } from '../../core/fpga/pack.js';
import { placeRouteBest } from '../../core/fpga/place-route.js';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { checkRouting } from '../../core/fpga/route.js';
import { bitgen, knownRouting } from '../../core/fpga/bitgen.js';
import { analyzeTiming, timingReport, checkPeriods, delayTable } from '../../core/fpga/timing.js';
import { parseUcf } from '../../core/ucf.js';
import { loadDb } from '../../core/fpga/bitdb-node.js';
import { qualityOf } from '../../test/designs-corpus/lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
const json = opt('--json', null), seed = +opt('--seed', '1'), effort = +opt('--effort', '1'), timing = opt('--timing', null), timingRoute = opt('--timing-route', '1') !== '0', noCrc = flag('--no-crc'), tries = Math.max(1, +opt('--tries', '1')), replicate = !flag('--no-replicate'), replicateOpts = JSON.parse(opt('--replicate-opts', '{}')), qualityFile = opt('--quality', null);
const [projDir, outDir] = args;
if (!projDir || !outDir) { console.error('usage: open-flow.mjs <project folder> <out folder> [--json netlist.json] [--seed N] [--effort E] [--timing T] [--timing-route 0|1] [--tries N] [--no-replicate] [--replicate-opts JSON] [--no-crc] [--quality file]'); process.exit(2); }
const proj = JSON.parse(fs.readFileSync(path.join(projDir, 'silinx.json'), 'utf8'));
const top = proj.top;
const part = `${proj.device.part}${proj.device.package}${proj.device.speed}`;
fs.mkdirSync(outDir, { recursive: true });
const step = (what, t) => console.log(`${what}: ${Date.now() - t} ms`);
const fail = (msg, list = []) => { console.error(`open-flow: ${msg}`); for (const x of list) console.error(`  ${x}`); process.exit(1); };

// synthesis: Silinx's front end + Yosys (WebAssembly), as the Synthesize - Yosys (open) process
let t = Date.now();
let netFile = json;
if (!netFile) {
  const srcs = proj.files.filter(f => (f.role || 'design') === 'design' && (f.lang === 'vhdl' || f.lang === 'verilog'))
    .map(f => ({ path: f.path, lang: f.lang, text: fs.readFileSync(path.resolve(projDir, f.path), 'utf8') }));
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const design = elaborate(lib, top);
  const errs = [...lib.errors, ...design.diags].filter(d => d.severity === 'error');
  if (errs.length) fail('the design has errors', errs.map(e => `${e.file}:${e.line} ${e.message}`));
  for (const w of [...lib.errors, ...design.diags].filter(d => d.severity === 'warning')) console.log(`  Warning: ${w.file}:${w.line} ${w.message}`);
  const r = await synthesizeOpen(design, { family: proj.device.family || 'spartan3e', run: yosysWorkers(), onLine: l => { if (/^ERROR/.test(l)) console.log(`  ${l}`); } });
  for (const w of r.warnings) console.log(`  ${/^Warning:/.test(w) ? w : `Warning: ${w}`}`);
  for (const [name, text] of Object.entries(r.files)) fs.writeFileSync(path.join(outDir, name), text);
  netFile = path.join(outDir, `${top}.json`);
  step(`synthesis (${r.util.cells} cells)`, t);
}
// pack: a carry out read by logic leaves through an XOR stage, not XB / YB (not in the database)
t = Date.now();
const ucf = proj.constraints ? fs.readFileSync(path.resolve(projDir, proj.constraints), 'utf8') : null;
const netlist = readYosysJson(fs.readFileSync(netFile, 'utf8'));
const packed = pack(netlist, { ucf, part, carryOut: 'xor' });
for (const w of packed.warnings) console.log(`  Warning: pack: ${w}`);
step(`pack (${packed.stats.slices} slices)`, t);
// place, on the sites of the device cache
t = Date.now();
const device = loadDeviceCache(part);
const db = loadDb(part, { graph: device });
const known = knownRouting(db);
// the delays of the fastest routes on known switches, for the placer's timing estimate
const delays = delayTable(device, { allowPip: known.allowPip });
step('delay table', t);
// place and route (core/fpga/place-route.js, the flows' one place and route): each clock's
// flip-flops on the slices its global line reaches through switches of known bits (a DCM's outputs
// on the global buffers their dedicated paths of known bits reach); --tries N: N placements (seeds
// seed .. seed + N - 1), each routed, the one with the shortest critical path (by the static timing
// analysis) kept; register replication (#4): the flip-flops of many loads on the critical path
// copied, each copy near a group of the loads; the design placed and routed again, the faster kept
const label = r => (r ? ` (${r.flipFlops} flip-flops replicated, ${r.copies} copies)` : '');
t = Date.now();
const best = placeRouteBest(netlist, packed, device, known, {
  seed, tries, effort, ...(timing !== null && { timing: +timing }), timingRoute, delays, replicate, replicateOpts, pack: { ucf, part, carryOut: 'xor' },
  onPlaced: (r, info) => {
    if (!info.replication && info.try === 0) for (const w of r.warnings || []) console.log(`  Warning: place: ${w}`);
    console.log(`place${label(info.replication)}${tries > 1 ? ` (seed ${info.seed})` : ''}: estimated critical path ${r.delay.toFixed(1)} ns`);
    step('place', t);
    t = Date.now();
  },
  onRouted: (pr, info) => {
    step(`route (${pr.routed.routed} nets, ${pr.routed.pips} PIPs, ${pr.routed.iterations} passes)`, t);
    if (tries > 1 && !info.replication) console.log(`  seed ${info.seed}: ${pr.period.toFixed(3)} ns`);
    t = Date.now();
  },
  onReplication: x => console.log(`replication: ${x.flipFlops} flip-flop(s), ${x.copies} copies: ${x.result ? `${x.result.period.toFixed(3)} ns` : `failed (${x.error.message})`} against ${x.before.toFixed(3)} ns: ${x.kept ? 'kept' : 'not kept'}`),
});
const { routed } = best;
fs.writeFileSync(path.join(outDir, 'placed.xdl'), best.placedText);
const routedText = writeXdl(routed.design);
fs.writeFileSync(path.join(outDir, 'routed.xdl'), routedText);
if (routed.errors.length) fail('routing errors', routed.errors);
if (routed.failed.length) fail(`${routed.failed.length} nets cannot be routed on PIPs of known bits`, routed.unreached.map(u => `${u.net} -> ${u.inst}.${u.pin}`));
// (#249: the router left nodes shared on every placement tried)
if (routed.overused) fail(`the routing did not converge: ${routed.overused} nodes shared after ${routed.iterations} passes, on ${1 + best.retried} placement(s)`, []);
if (best.retried) console.log(`placed again (seed ${best.seed}): the routing of ${best.retried} placement(s) before did not converge`);
const check = checkRouting(parseXdl(routedText), device);
if (!check.ok) fail('routing check', check.problems.slice(0, 50));
// static timing analysis of the routed design (the delay model of core/fpga/timing.js)
// against the PERIOD constraints of the project's UCF
const routedDesign = parseXdl(routedText);
const sta0 = analyzeTiming(routedDesign, device);
const checks = checkPeriods(sta0, routedDesign, ucf ? parseUcf(ucf).clocks : []);
const sta = timingReport(sta0, checks);
fs.writeFileSync(path.join(outDir, 'timing.txt'), `${sta.join('\n')}\n`);
for (const l of sta) if (/^(clock|constraint)/.test(l)) console.log(`timing: ${l}`);
if (qualityFile) fs.writeFileSync(qualityFile, `${JSON.stringify(qualityOf(part, packed.stats, sta0.clocks))}\n`);
// the bitstream
t = Date.now();
const { bytes, unknown } = bitgen(routedText, db, { name: `${top}.ncd`, crc: !noCrc, startupClk: proj.impl?.startupClk || 'JtagClk' });
if (unknown.length) fail(`${unknown.length} features not in the bit database: no bitstream`, unknown.map(u => `${u.tile} ${u.feature}`));
fs.writeFileSync(path.join(outDir, `${top}.bit`), bytes);
step(`bitgen (${bytes.length} bytes)`, t);
console.log(`${path.join(outDir, `${top}.bit`)}: complete (every feature in the bit database)`);
