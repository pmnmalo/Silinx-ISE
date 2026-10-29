// silinx-fpga's public API (#1678, step 7 of the toolchain's separation, #1651): the package's entries (exports),
// the same in Node and in the browser (./node adds the disk's loaders), and a design from Verilog and a UCF to its
// .bit through them alone, Silinx's place and route or one given through io.placeRoute.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as api from '../packages/silinx-fpga/src/index.js';
import * as node from '../packages/silinx-fpga/src/node.js';
import { readBit } from '../packages/silinx-fpga/src/fpga/bitstream.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'packages', 'silinx-fpga');
const pkg = JSON.parse(fs.readFileSync(path.join(DIR, 'package.json'), 'utf8'));

test('#1678 silinx-fpga: its entries, the API and the API in Node', () => {
  assert.deepEqual(pkg.exports, { '.': './src/index.js', './node': './src/node.js' });
  for (const f of Object.values(pkg.exports)) assert.ok(fs.existsSync(path.join(DIR, f)), f);
});

// the API's names: a change to them is a change of the API (its version, #1681), made on purpose
const API = ['FAMILY_INFO', 'ISE_HINT', 'MODEL_VERSION', 'OPEN_CHAIN', 'OPEN_STEPS', 'PackError', 'S3E_DEVICES', 'SPEED_4', 'StepError',
  'analyzeTiming', 'asText', 'backAnnotateUcf', 'bitName', 'bitgen', 'boardAutoAssign', 'cellCounts', 'checkRouting', 'checkUcf',
  'dbFileNames', 'dbFilesFrom', 'deviceChangeIssues', 'deviceFamily', 'deviceGrid', 'estimatePower', 'familyFromXise', 'familyName',
  'familyOfPart', 'fpgaModel', 'gateAssignments', 'generateUcf', 'instArcs', 'knownRouting', 'loadDevice', 'lutTable', 'makeBitDb',
  'orderOpenSteps', 'pack', 'paramBits', 'paramInt', 'parseUcf', 'parseXdl', 'periodNs', 'placeRouteBest', 'powerReport',
  'primitiveInstances', 'readBit', 'readYosysJson', 'readableBlobs', 'resourceCount', 'resourceOfPrimitive', 'resourcesOf',
  'rewriteCarryChains', 'runFlow', 'runYosysOnce', 's6OpenStatus', 'spartan6Open', 'splitBitPart', 'splitPart', 'synthEffort',
  'synthesizeVerilog', 'timingReport', 'ucfPlacesPins', 'usedOfReport', 'writeBit', 'writeXdl', 'yosysWorkerSource'];
const NODE = ['DB_DIR', 'SHIPPED_DEVICES_DIR', 'buildDeviceCache', 'dbPackages', 'devicesDir', 'findDeviceGraph', 'hasBitDb', 'loadDb',
  'loadDeviceCache', 'shippedDevicePath', 'yosysNode', 'yosysWorkers'];

test('#1678 the API\'s names, each defined; ./node: the same and the loaders', () => {
  assert.deepEqual(Object.keys(api).sort(), [...API].sort());
  assert.deepEqual(Object.keys(node).sort(), [...API, ...NODE].sort());
  for (const k of Object.keys(node)) assert.notEqual(node[k], undefined, k);
  for (const k of API) assert.equal(node[k], api[k], k);
});

// what the browser loads: the entry and every module it imports, none of Node's
test('#1678 the API (its entry) imports nothing of Node: it runs in the browser too', () => {
  const seen = new Set(), nodeOnly = [];
  (function walk(file) {
    if (seen.has(file)) return;
    seen.add(file);
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(/^\s*(?:import|export)\b[^;'"]*?from\s*'([^']+)'/gm)) {
      if (m[1].startsWith('.')) walk(path.join(path.dirname(file), m[1]));
      else if (m[1].startsWith('node:')) nodeOnly.push(`${path.relative(DIR, file)}: ${m[1]}`);
    }
  })(path.join(DIR, 'src', 'index.js'));
  assert.deepEqual(nodeOnly, []);
  assert.ok(seen.size > 40, `${seen.size} modules`);
  for (const f of seen) assert.ok(f.startsWith(path.join(DIR, 'src') + path.sep), f);
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
