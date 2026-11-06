// The fully open flow for a Silinx project, no Xilinx tool in it: Silinx's front end + Yosys compiled
// to WebAssembly (packages/silinx-fpga/src/synth-open.js) -> the flow's Translate, Map and Place & Route on the nextpnr engine
// (packages/silinx-fpga/src/open-flow-core.js runFlow, as the application runs them: nextpnr packs, places and routes on the
// PIPs whose bits are known, #2137) -> Silinx's bitgen. Needs the device cache (~/.silinx/devices, built from the user's own
// device report: research/s3e-route/build-device.mjs).
//   node research/s3e-route/open-flow.mjs <project folder> <out folder> [--json netlist.json] [--seed N] [--no-crc] [--quality file] [--chipdb dir]
// (--seed: nextpnr's first seed, the flow trying several, packages/silinx-fpga/src/open-flow-nextpnr.js nextpnrTries; the
// options of Silinx's own placer and router, --effort, --timing, --timing-route, --tries, --no-replicate and
// --replicate-opts, went with it, #2137). After routing, the static timing
// analysis of packages/silinx-fpga/src/fpga/timing.js prints the critical path of each clock (also in timing.txt). Writes into the out folder: <top>.json (Yosys), routed.xdl, <top>.bit;
// --quality file: the circuit's size and speed as JSON ({ part, slices, luts, ffs, period }: the design
// corpus's qualityOf, test/designs-corpus/lib.mjs), for the comparison of a Yosys update (#352,
// scripts/yosys-update-report.mjs). Fails (exit 1)
// listing what keeps the flow from the design, or the features of the design the bit
// database does not know: the .bit is written only when it is complete.
// --chipdb dir: nextpnr's chip database from dir/chipdb-<die>.bin, not the package's (a database built from other device
// descriptions, as #2502's check of the measured ones with SILINX_CONFIG_DIR/devices holding those descriptions).
import fs from 'node:fs';
import path from 'node:path';
import { compile, elaborate } from '../../../../core/compile.js';
import { primitiveSources } from '../../../../core/unisim.js';
import { isCSource, viewHdl } from '../../../../core/view-hdl.js';
import { synthesizeOpen } from '../../../../core/synth-front.js';
import { yosysWorkers } from '../../src/synth-open-node.js';
import { runFlow } from '../../src/open-flow-core.js';
import { synthEffort } from '../../src/synth-open.js';
import { nextpnrNode } from '../../src/nextpnr-node.js';
import { parseXdl } from '../../src/xdl.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { bitgen } from '../../src/fpga/bitgen.js';
import { analyzeTiming, timingReport, checkPeriods, checkCross, checkOffsets, parseOffsets } from '../../src/fpga/timing.js';
import { parseUcf } from '../../src/ucf.js';
import { loadDb } from '../../src/fpga/bitdb-node.js';
import { qualityOf } from '../../../../test/designs-corpus/lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; };
const flag = name => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
const GONE = ['--effort', '--timing', '--timing-route', '--tries', '--no-replicate', '--replicate-opts'];
const gone = args.filter(a => GONE.includes(a));
if (gone.length) { console.error(`open-flow.mjs: ${gone.join(', ')}: an option of Silinx's own placer and router, which nextpnr replaced (#2137)`); process.exit(2); }
const json = opt('--json', null), seed = +opt('--seed', '1'), noCrc = flag('--no-crc'), qualityFile = opt('--quality', null), chipdbDir = opt('--chipdb', null);
const [projDir, outDir] = args;
if (!projDir || !outDir) { console.error('usage: open-flow.mjs <project folder> <out folder> [--json netlist.json] [--seed N] [--no-crc] [--quality file] [--chipdb dir]'); process.exit(2); }
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
  // (a C source's module, Silinx HLS: its HDL made from the C, as the application makes it; it has no file, #1966)
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? (e.name === 'build' ? [] : walk(path.join(d, e.name))) : [path.join(d, e.name)]);
  for (const f of walk(projDir).filter(isCSource)) {
    const rel = path.relative(projDir, f).split(path.sep).join('/');
    const v = viewHdl(rel, fs.readFileSync(f, 'utf8'), { lang: proj.preferredLanguage });
    if (v.errors.length) fail('a C source has errors', v.errors);
    srcs.push({ path: `${rel}.${v.lang === 'vhdl' ? 'vhd' : 'v'}`, lang: v.lang, text: v.text });
  }
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

// Translate, Map and Place & Route: the flow's, on the nextpnr engine, the netlist given as the synthesis's
t = Date.now();
const ucf = proj.constraints ? fs.readFileSync(path.resolve(projDir, proj.constraints), 'utf8') : null;
const netText = fs.readFileSync(netFile, 'utf8');
let device = null, db = null;
const files = {};
// --chipdb: the given database of the part's die (chipdb-xc3s250e.bin)
const givenChipdb = () => {
  const f = path.join(chipdbDir, `chipdb-${/^xc3s\d+e/.exec(part)[0]}.bin`);
  if (!fs.existsSync(f)) throw new Error(`--chipdb: no ${f}`);
  return new Uint8Array(fs.readFileSync(f));
};
const io = {
  log: line => { if (/^(WARNING|ERROR)/.test(line)) console.log(`  ${line}`); else if (/^(Map|Placed|Routed|Design summary|  |constraint)/.test(line)) console.log(line); },
  sources: () => [],
  ucf, ucfName: proj.constraints ? path.basename(proj.constraints) : null,
  device: () => (device ||= loadDeviceCache(part)),
  bitDb: () => (db ||= loadDb(part, { graph: io.device() })),
  yosys: yosysWorkers(),
  nextpnr: { spartan3e: chipdbDir ? { ...nextpnrNode(), chipdb: async () => givenChipdb() } : nextpnrNode() },
  write: (name, data) => { files[name] = data; const f = path.join(outDir, name.replace(/^open\//, '')); fs.writeFileSync(f, data); return f; },
  read: name => (name === `open/${top}.json` ? netText : files[name] ?? null),
  save: () => {},
};
const spec = { top, part, device: proj.device.part, pkg: String(proj.device.package).toLowerCase(), family: proj.device.family || 'spartan3e',
  steps: ['translate', 'map', 'par'], seed, effort: 1, synthEffort: synthEffort(proj.impl), startupClk: proj.impl?.startupClk || 'JtagClk', engine: 'nextpnr' };
const r = await runFlow(spec, io);
if (!r.ok) fail(r.error, r.report?.errors || []);
const routedText = files['open/routed.xdl'];
if (routedText == null) fail('no routed design');
const summary = r.report.map.summary;
step(`place and route (nextpnr: ${summary.slices.used} slices, ${r.report.par.pips} PIPs)`, t);
// static timing analysis of the routed design (the delay model of packages/silinx-fpga/src/fpga/timing.js)
// against the PERIOD constraints of the project's UCF
const routedDesign = parseXdl(routedText);
const pu = ucf ? parseUcf(ucf) : { clocks: [], other: [] };
const sta0 = analyzeTiming(routedDesign, io.device(), { clocks: pu.clocks });
// (the PERIOD constraints, the paths between two clocks: #601, then the OFFSET ones: #26)
const checks = [...checkPeriods(sta0, routedDesign, pu.clocks), ...checkCross(sta0, routedDesign, pu.clocks), ...checkOffsets(sta0, routedDesign, parseOffsets(pu.other), pu.clocks)];
const sta = timingReport(sta0, checks);
fs.writeFileSync(path.join(outDir, 'timing.txt'), `${sta.join('\n')}\n`);
for (const l of sta) if (/^(clock|constraint|paths from)/.test(l)) console.log(`timing: ${l}`);
if (qualityFile) fs.writeFileSync(qualityFile, `${JSON.stringify(qualityOf(part, { slices: summary.slices.used, luts: summary.luts.used, ffs: summary.ffs.used }, sta0.clocks))}\n`);
// the bitstream
t = Date.now();
const { bytes, unknown } = bitgen(routedText, io.bitDb(), { name: `${top}.ncd`, crc: !noCrc, startupClk: proj.impl?.startupClk || 'JtagClk' });
if (unknown.length) fail(`${unknown.length} features not in the bit database: no bitstream`, unknown.map(u => `${u.tile} ${u.feature}`));
fs.writeFileSync(path.join(outDir, `${top}.bit`), bytes);
step(`bitgen (${bytes.length} bytes)`, t);
console.log(`${path.join(outDir, `${top}.bit`)}: complete (every feature in the bit database)`);
