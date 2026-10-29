// The parts of the open flow (#405: out of runOpenFlow in core/open-flow-core.js): the simulation models
// (flow-models.js, the IDE's, #1675) and the timing, bitstream, pins and power (open-flow-reports.js), through runOpenFlow on the
// gates example (XC3S250E): every step, from the synthesis to the PROM bitstream; the files each step writes, no
// warning or error in the log.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { runOpenFlow } from '../core/open-flow-core.js';
import { mountSimModels } from '../core/flow-models.js';
import { mountFlowReports } from '../core/open-flow-reports.js';
import { loadDevice } from '../core/fpga/device.js';
import { dbFileNames, dbFilesFrom, makeBitDb } from '../core/fpga/bitdb.js';
import { yosysNode } from '../core/synth-open-node.js';
import { shippedDevicePath } from '../core/fpga/device-node.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_DIR = path.join(ROOT, 'packages/silinx-fpga/bitdb');
const PJ = path.join(ROOT, 'examples/gates');

test('#405 open flow parts: the mounts are the modules\'', () => {
  for (const f of [mountSimModels, mountFlowReports]) assert.equal(typeof f, 'function');
});

test('#405 open flow parts: the gates example through every step: each step\'s files, no warning', { timeout: 300000 }, async () => {
  const project = JSON.parse(fs.readFileSync(path.join(PJ, 'silinx.json'), 'utf8'));
  const sources = project.files.filter(f => (f.role || 'design') === 'design' && /^(vhdl|verilog)$/.test(f.lang));
  const spec = { top: project.top, part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', graph: shippedDevicePath('xc3s250ecp132-4'),
    seed: 1, effort: 1, startupClk: 'JtagClk', steps: ['synth', 'postsynth', 'translate', 'posttrans', 'map', 'postmap', 'par', 'trce', 'postpar', 'pin2ucf', 'xpwr', 'bitgen', 'prombit'] };
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) { const p = path.join(DB_DIR, f); json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
  const store = {}, lines = [];
  const io = {
    log: l => lines.push(l), sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
    ucf: fs.readFileSync(path.join(PJ, project.constraints), 'utf8'), ucfName: path.basename(project.constraints),
    device: () => device, bitDb: () => makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part), yosys: yosysNode,
    write: (name, data) => { store[name] = data; return `build/${name}`; }, read: name => (typeof store[name] === 'string' ? store[name] : null), save: () => {},
  };
  const res = await runOpenFlow(spec, io);
  assert.equal(res.ok, true, lines.slice(-5).join('\n'));
  assert.deepEqual(lines.filter(l => /^(WARNING|ERROR)/.test(l)), []);
  const top = project.top;
  for (const f of [`netgen/synthesis/${top}_synthesis.vhd`, `netgen/synthesis/${top}_synthesis.v`, `netgen/translate/${top}_translate.vhd`, `netgen/map/${top}_map.vhd`,
    `netgen/par/${top}_timesim.vhd`, `netgen/par/${top}_timesim.sdf`, `${top}_pins.ucf`, `${top}.pwr`, `${top}.bit`, `${top}_prom.bit`]) assert.ok(store[f] != null, f);
  assert.ok(res.report.bit.size > 0 && res.report.prom.size === res.report.bit.size);
});
