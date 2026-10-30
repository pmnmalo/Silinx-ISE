// silinx-fpga's public API (#1678, step 7 of the toolchain's separation, #1651): the package's entries (exports),
// the same in Node and in the browser (./parts: the light part of it; ./node adds the disk's loaders), and a design from Verilog and a UCF to its
// .bit through them alone, Silinx's place and route or one given through io.placeRoute.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from '../src/index.js';
import * as node from '../src/node.js';
import * as parts from '../src/parts.js';
import { readBit } from '../src/fpga/bitstream.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIR = path.join(ROOT, 'packages', 'silinx-fpga');
const pkg = JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8'));

test('#1678 silinx-fpga: its entries, the API, its light part and the API in Node', () => {
  assert.deepEqual(pkg.exports, { '.': './src/index.js', './parts': './src/parts.js', './node': './src/node.js' });
  for (const f of Object.values(pkg.exports)) assert.ok(fs.existsSync(path.join(DIR, f)), f);
});

// the API's names: a change to them is a change of the API (its version, #1681), made on purpose
const API = ['FAMILY_INFO', 'ISE_HINT', 'MODEL_VERSION', 'OPEN_CHAIN', 'OPEN_STEPS', 'PackError', 'S3E_DEVICES', 'SPEED_4', 'StepError',
  'analyzeTiming', 'asText', 'backAnnotateUcf', 'bitName', 'bitgen', 'boardAutoAssign', 'cellCounts', 'checkRouting', 'checkUcf',
  'dbFileNames', 'dbFilesFrom', 'deviceChangeIssues', 'deviceFamily', 'deviceGrid', 'engineOf', 'estimatePower', 'familyFromXise', 'familyName',
  'familyOfPart', 'fpgaModel', 'gateAssignments', 'generateUcf', 'instArcs', 'knownRouting', 'loadDevice', 'locsNotOnBoard', 'lutTable', 'makeBitDb',
  'nextpnrIo', 'orderOpenSteps', 'pack', 'paramBits', 'paramInt', 'parseUcf', 'parseXdl', 'parseXdlrc', 'periodNs', 'placeRouteBest', 'powerReport',
  'primitiveInstances', 'readBit', 'readYosysJson', 'readableBlobs', 'resourceCount', 'resourceOfPrimitive', 'resourcesOf',
  'rewriteCarryChains', 'runFlow', 'runYosysOnce', 's6OpenStatus', 'splitBitPart', 'splitPart', 'synthEffort',
  'synthesizeVerilog', 'timingReport', 'ucfPlacesPins', 'usedOfReport', 'writeBit', 'writeXdl', 'yosysWorkerSource'];
const NODE = ['DB_DIR', 'S6_DB_DIR', 'SHIPPED_DEVICES_DIR', 'buildDeviceCache', 'dbPackages', 'devicesDir', 'findDeviceGraph', 'hasBitDb', 'loadBitDbS6', 'loadDb',
  'loadDeviceCache', 'nextpnrNode', 'shippedDevicePath', 'yosysNode', 'yosysWorkers'];   // (nextpnrNode: the nextpnr engine's io.nextpnr, #2136)

const PARTS = ['FAMILY_INFO', 'MODEL_VERSION', 'OPEN_CHAIN', 'OPEN_STEPS', 'backAnnotateUcf', 'bitName', 'boardAutoAssign', 'checkUcf',
  'deviceChangeIssues', 'deviceFamily', 'deviceGrid', 'engineOf', 'familyFromXise', 'familyName', 'familyOfPart', 'fpgaModel', 'generateUcf',
  'locsNotOnBoard', 'lutTable', 'orderOpenSteps', 'parseUcf', 'parseXdl', 'parseXdlrc', 'periodNs', 'primitiveInstances', 'resourceCount',
  'resourceOfPrimitive', 'resourcesOf', 'splitBitPart', 'ucfPlacesPins', 'usedOfReport', 'writeXdl'];

test('#1678 the API\'s names, each defined; ./parts: some of them; ./node: all and the loaders', () => {
  assert.deepEqual(Object.keys(parts).sort(), [...PARTS].sort());
  for (const k of PARTS) assert.equal(parts[k], api[k], k);
  assert.deepEqual(Object.keys(api).sort(), [...API].sort());
  assert.deepEqual(Object.keys(node).sort(), [...API, ...NODE].sort());
  for (const k of Object.keys(node)) assert.notEqual(node[k], undefined, k);
  for (const k of API) assert.equal(node[k], api[k], k);
});

// what the browser loads: the entry and every module it imports, none of Node's
function modulesOf(entry) {
  const seen = new Set(), nodeOnly = [];
  (function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^;'"]*?from\s*'([^']+)'/gm)) {
      if (m[1].startsWith('.')) walk(path.join(path.dirname(file), m[1]));
      else if (m[1].startsWith('node:')) nodeOnly.push(`${path.relative(DIR, file)}: ${m[1]}`);
    }
  })(path.join(DIR, 'src', entry));
  return { seen, nodeOnly };
}

test('#1678 the API (its entry) imports nothing of Node: it runs in the browser too', () => {
  const { seen, nodeOnly } = modulesOf('index.js');
  assert.deepEqual(nodeOnly, []);
  assert.ok(seen.size > 40, `${seen.size} modules`);
  for (const f of seen) assert.ok(f.startsWith(path.join(DIR, 'src') + path.sep), f);
});

// what Silinx ISE's pages load before the toolchain runs (#1678: these 7 modules, not the toolchain's 58)
test('#1678 ./parts: light, nothing of Node and none of the synthesis, pack, place, route, timing or bitgen', () => {
  const { seen, nodeOnly } = modulesOf('parts.js');
  assert.deepEqual(nodeOnly, []);
  const rel = [...seen].map(f => path.relative(path.join(DIR, 'src'), f).split(path.sep).join('/')).sort();
  assert.deepEqual(rel, ['family.js', 'open-steps.js', 'parts.js', 'resource-check.js', 'resources.js', 'ucf.js', 'xdl.js']);
});

const COUNTER = 'module cnt(input clk, input rst, output reg [3:0] q);\n  always @(posedge clk) if (rst) q <= 0; else q <= q + 1;\nendmodule\n';
const UCF = 'NET "clk" LOC = "B8";\nNET "rst" LOC = "G12";\nNET "q<0>" LOC = "M5";\nNET "q<1>" LOC = "M11";\nNET "q<2>" LOC = "P7";\nNET "q<3>" LOC = "P6";\nNET "clk" PERIOD = 20 ns;\n';
const spec = { top: 'cnt', part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', synthEffort: 'normal',
  steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] };
function apiIo(extra = {}) {
  const store = {}, lines = [];
  let dev, db;
  const io = { log: l => lines.push(l), sources: () => [{ path: 'cnt.v', lang: 'verilog', text: COUNTER }], ucf: UCF, ucfName: 'cnt.ucf',
    device: () => (dev ||= node.loadDeviceCache(node.findDeviceGraph(spec.part))),
    bitDb: () => (db ||= node.loadDb('xc3s250ecp132', { graph: io.device() })),
    yosys: node.yosysNode,
    write: (name, data) => { store[name] = data; return `build/${name}`; }, read: name => store[name] ?? null, save: () => {}, ...extra };
  return { io, store, lines };
}

test('#1678 through the API alone: Verilog and a UCF in, the routed XDL, the timing and the .bit out', { timeout: 300000 }, async () => {
  const { io, store, lines } = apiIo();
  const res = await api.runFlow(spec, io);
  assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), []);
  assert.equal(api.parseXdl(store['open/routed.xdl']).name, 'cnt');
  assert.ok(store['open/timing.txt']);
  const bit = readBit(store['cnt.bit']);
  assert.equal(bit.header.b, '3s250ecp132');
  assert.ok(bit.frames.length > 0);
  assert.equal(res.report.par.routed, true);
});

test('#1678 io.placeRoute: the flow places and routes through it (an engine of one\'s own); its failure is the step\'s', { timeout: 300000 }, async () => {
  const calls = [];
  const a = apiIo({ placeRoute: (...args) => { calls.push(args.length); return api.placeRouteBest(...args); } });
  const res = await api.runFlow({ ...spec, steps: ['synth', 'translate', 'map', 'par'] }, a.io);
  assert.ok(res.ok, `${res.error}\n${a.lines.join('\n')}`);
  assert.deepEqual(calls, [5]);
  assert.ok(a.store['open/routed.xdl']);

  const b = apiIo({ placeRoute: () => { throw Object.assign(new Error('no such engine'), { hint: 'install it' }); } });
  const r = await api.runFlow({ ...spec, steps: ['synth', 'translate', 'map', 'par'] }, b.io);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'placement failed: no such engine');
  assert.ok(b.lines.includes('=== SILINX FAILED par (exit 1) ==='), b.lines.join('\n'));
  assert.equal(b.store['open/routed.xdl'], undefined);
});
