// silinx-fpga's public API (#1678, step 7 of the toolchain's separation, #1651): the package's entries (exports),
// the same in Node and in the browser (./parts: the light part of it; ./node adds the disk's loaders), and a design from Verilog and a UCF to its
// .bit through them alone, placed and routed by nextpnr (io.nextpnr, the one engine since #2137).
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
const API = ['CST', 'ECP5_PARTS', 'ECP5_STEPS', 'FAMILY_INFO', 'FAST_SYNTH', 'GOAL_IMPL', 'GOWIN_DEVICES', 'GOWIN_PARTS', 'GOWIN_STEPS', 'ICE40_PARTS', 'ICE40_STEPS', 'ISE_HINT', 'LPF', 'PCF', 'MODEL_VERSION', 'OPEN_CHAIN', 'OPEN_STEPS', 'PackError', 'S3E_DEVICES', 'SPEED_4', 'StepError', 'XC7_STEPS', 'XC7_TIMING_MODEL', 'XDC', 'XILINX_STEPS',
  'analyzeTiming', 'asText', 'backAnnotateUcf', 'backendOf', 'betweenPaths', 'bitDbS6', 'bitDbXc7', 'bitIndexXc7', 'bitName', 'bitgen', 'bitstreamExtOf', 'boardAutoAssign', 'boardConstraintsText', 'cellCounts', 'checkRouting', 'checkUcf', 'constraintsExtOf', 'constraintsFormatOf',
  'dbFileNames', 'dbFilesFrom', 'deviceChangeIssues', 'ecp5Io', 'deviceFamily', 'deviceGrid', 'engineOf', 'estimatePower', 'experimentalDevice', 'familyFromXise', 'familyName',
  'familyOfPart', 'fetchBitDbS6', 'fpgaModel', 'framesToFeatures', 'gateAssignments', 'generateUcf', 'gowinIo', 'gowinPack', 'ice40Io', 'instArcs', 'isIseFamily', 'knownRouting', 'loadDevice', 'loadGowinChipdb', 'locsNotOnBoard', 'lutTable', 'makeBitDb',
  'nextpnrIo', 'noFlowMessage', 'openOnlyDevice', 'orderOpenSteps', 'orderSteps', 'pack', 'paramBits', 'paramInt', 'parseUcf', 'parseXdl', 'parseXdlrc', 'pathHighlight', 'pathsText', 'periodNs', 'powerReport',
  'primitiveInstances', 'readBit', 'readBitFramesXc7', 'readXdc', 'readYosysJson', 'readableBlobs', 'registerBackend', 'resourceCount', 'resourceOfPrimitive', 'resourcesOf',
  'rewriteCarryChains', 'runFlow', 'runYosysOnce', 's6DbNames', 's6MapOf', 's6OpenStatus', 'scriptTopError', 'splitBitPart', 'splitPart', 'synthEffort', 'synthGoal', 'synthesizeArea', 'synthesizeFast',
  'synthesizeVerilog', 'timingPaths', 'timingReport', 'ucfPlacesPins', 'usedOfReport', 'vivadoDevice', 'writeBit', 'writeXdc', 'writeXdl', 'yosysWorkerSource'];
const NODE = ['DB_DIR', 'S6_DB_DIR', 'SHIPPED_DEVICES_DIR', 'XC7_DB_DIR', 'loadBitDbXc7', 'nextpnrXc7Node', 'xc7Parts', 'buildDeviceCache', 'chipdbCacheDir', 'dbPackages', 'devicesDir', 'findDeviceGraph', 'hasBitDb', 'leaveOutChipdbs', 'loadBitDbS6', 'loadDb',
  'loadDeviceCache', 'nextpnrEcp5Node', 'nextpnrGowinNode', 'nextpnrIce40Node', 'nextpnrNode', 'nextpnrS6Node', 'shippedDevicePath', 'yosysNode', 'yosysWorkers'];   // (nextpnrNode: the nextpnr engine's io.nextpnr, #2136; nextpnrS6Node: its io.nextpnrS6, #2138; leaveOutChipdbs: the release zip's, #2356; chipdbCacheDir: its downloads' folder, #3215)

const PARTS = ['CST', 'FAMILY_INFO', 'LPF', 'MODEL_VERSION', 'OPEN_CHAIN', 'OPEN_STEPS', 'PCF', 'XDC', 'XILINX_STEPS', 'backAnnotateUcf', 'bitName', 'bitstreamExtOf', 'boardAutoAssign', 'boardConstraintsText', 'checkUcf',
  'constraintsExtOf', 'constraintsFormatOf', 'deviceChangeIssues', 'deviceFamily', 'deviceGrid', 'engineOf', 'experimentalDevice', 'familyFromXise', 'familyName', 'familyOfPart', 'fpgaModel', 'generateUcf',
  'isIseFamily', 'locsNotOnBoard', 'lutTable', 'noFlowMessage', 'openOnlyDevice', 'orderOpenSteps', 'orderSteps', 'parseUcf', 'parseXdl', 'parseXdlrc', 'periodNs', 'primitiveInstances',
  'readXdc', 'resourceCount', 'resourceOfPrimitive', 'resourcesOf', 's6MapOf', 'splitBitPart', 'ucfPlacesPins', 'usedOfReport', 'vivadoDevice', 'writeXdc', 'writeXdl'];

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

// what Silinx's pages load before the toolchain runs (#1678: these 7 modules, not the toolchain's 58)
test('#1678 ./parts: light, nothing of Node and none of the synthesis, pack, place, route, timing or bitgen', () => {
  const { seen, nodeOnly } = modulesOf('parts.js');
  assert.deepEqual(nodeOnly, []);
  const rel = [...seen].map(f => path.relative(path.join(DIR, 'src'), f).split(path.sep).join('/')).sort();
  assert.deepEqual(rel, ['board-constraints.js', 'cst.js', 'family.js', 'lpf.js', 'open-steps.js', 'parts.js', 'pcf.js', 'resource-check.js', 'resources.js', 'ucf.js', 'xdc.js', 'xdl.js']);   // (xdc.js: the 7-series' constraints, #3142; lpf.js the ECP5's, #2302; cst.js the Gowin's, #2303)
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
    yosys: node.yosysNode, nextpnr: { spartan3e: node.nextpnrNode() },
    write: (name, data) => { store[name] = data; return `build/${name}`; }, read: name => store[name] ?? null, save: () => {}, ...extra };
  return { io, store, lines };
}

test('#1678 through the API alone: Verilog and a UCF in, the routed XDL, the timing and the .bit out', { timeout: 300000 }, async () => {
  const { io, store, lines } = apiIo();
  const res = await api.runFlow(spec, io);
  assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), []);
  // (the routed design by nextpnr, its instances at their sites: the counter's four outputs on their pads)
  assert.deepEqual(api.parseXdl(store['open/routed.xdl']).insts.filter(i => /^q</.test(i.name)).map(i => i.site).sort(), ['M11', 'M5', 'P6', 'P7']);
  assert.ok(store['open/timing.txt']);
  const bit = readBit(store['cnt.bit']);
  assert.equal(bit.header.b, '3s250ecp132');
  assert.ok(bit.frames.length > 0);
  assert.equal(res.report.par.routed, true);
});

test('#2137 io.nextpnr: the flow places and routes through it, the one engine; without it Map says so (io.placeRoute, Silinx\'s engine, gone)', { timeout: 300000 }, async () => {
  assert.equal(api.placeRouteBest, undefined);
  const b = apiIo({ nextpnr: undefined });
  const r = await api.runFlow({ ...spec, steps: ['synth', 'translate', 'map', 'par'] }, b.io);
  assert.equal(r.ok, false);
  assert.equal(r.error, 'the nextpnr engine is not available here (io.nextpnr)');
  assert.ok(b.lines.includes('=== SILINX FAILED map (exit 1) ==='), b.lines.join('\n'));
  assert.equal(b.store['open/routed.xdl'], undefined);
});
