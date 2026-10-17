// The Silinx toolchain's flow, in its own process (started by server/open-flow.js, so that the long
// synchronous parts, placing and routing, never hold the server; Stop kills it):
//   node server/open-flow-run.js build/open/flow.json
// flow.json: { top, part, device, family, pkg, graph, bitDbDir, sources: [{ path, lang, file }], ucf,
//   buildDir, outDir, steps, seed, effort, startupClk, simTop, simSources: [{ path, lang, file }] }.
// The flow itself is core/open-flow-core.js (the browser edition runs the same, web/js/open-flow-worker.js);
// this file gives it the files on disk: the log on stdout ("=== SILINX STEP <step> ===", "=== SILINX
// FAILED <step> (exit 1) ===", "=== SILINX DONE ===": the protocol of ISE's run.sh) and
// build/open/report.json after every step (what the Design Summary shows).
import fs from 'node:fs';
import path from 'node:path';
import { yosysWorkers } from '../core/synth-open-node.js';
import { loadDeviceCache } from '../core/fpga/device-node.js';
import { loadDb } from '../core/fpga/bitdb-node.js';
import { runOpenFlow } from '../core/open-flow-core.js';

const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { outDir, buildDir } = spec;
const rel = f => path.relative(path.dirname(buildDir), f).split(path.sep).join('/');   // build/open/…
// a build file: build/open/<name> (open/…) or build/<name> (the bitstreams)
const fileOf = name => (name.startsWith('open/') ? path.join(outDir, name.slice(5)) : path.join(buildDir, name));

let dev = null, db = null;
const io = {
  log: line => console.log(line),
  sources: () => spec.sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(s.file, 'utf8') })),
  simSources: () => (spec.simSources || []).filter(s => fs.existsSync(s.file)).map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(s.file, 'utf8') })),
  ucf: spec.ucf ? fs.readFileSync(spec.ucf, 'utf8') : null,
  ucfName: spec.ucf ? path.basename(spec.ucf) : null,
  device: () => (dev ||= loadDeviceCache(spec.graph)),
  bitDb: () => (db ||= loadDb(`${spec.device}${spec.pkg}`, { graph: io.device(), dir: spec.bitDbDir })),
  yosys: yosysWorkers(),   // (the synthesis's mappings from the same netlist in parallel, #86)
  write: (name, data) => {
    const f = fileOf(name);
    fs.mkdirSync(path.dirname(f), { recursive: true });   // (netgen/synthesis/…)
    fs.writeFileSync(f, data);
    return name.startsWith('open/') || name.startsWith('netgen/') ? rel(f) : f;   // (the bitstreams: their path, for the programmer)
  },
  read: name => {
    const f = fileOf(name);
    if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
    // a netlist of an earlier run: its name may differ from the project's top in case (VHDL, #31)
    const dir = path.dirname(f), base = path.basename(f).toLowerCase();
    const other = fs.existsSync(dir) ? fs.readdirSync(dir).find(x => x.toLowerCase() === base) : null;
    return other ? fs.readFileSync(path.join(dir, other), 'utf8') : null;
  },
  save: report => fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2) + '\n'),
};

const { ok } = await runOpenFlow(spec, io);
if (!ok) process.exitCode = 1;
