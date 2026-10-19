// Test helper (not a test file) of the post-place & route model with its timing (#122): the Silinx toolchain's
// flow with the shipped XC3S250E description and bit database (device, bitDb, flow), a model simulated with a test
// bench (simulate), the minimum period by an SDF (sdfPeriod) and an example's whole check (exampleTimesim): its
// test bench passes on the model with its SDF, in VHDL and Verilog, with no warning, the SDF's period the timing's.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { yosysNode } from '../core/synth-open-node.js';
import { runOpenFlow } from '../core/open-flow-core.js';
import { orderOpenSteps } from '../core/open-steps.js';
import { parseSdf, annotateSdf } from '../core/sdf.js';
import { loadDevice } from '../core/fpga/device.js';
import { shippedDevicePath } from '../core/fpga/device-node.js';
import { dbFileNames, dbFilesFrom, makeBitDb } from '../core/fpga/bitdb.js';
import { scalarizeNetlist, parseNetgenVhdl, primitiveInterface } from '../core/netlist-hier.js';
import { Simulator } from '../core/simulator.js';
import { example } from './examples-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PART = 'xc3s250ecp132-4';
let DEVICE = null, DB = null;
export const device = () => (DEVICE ||= loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(shippedDevicePath(PART))).toString('utf8'))));
export const bitDb = () => {
  if (DB) return DB;
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames('xc3s250e', 'cp132'))) { const p = path.join(ROOT, 'research/s3e-bitstream/db', f); json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; }
  return (DB = makeBitDb(dbFilesFrom(json, 'cp132'), device(), PART));
};
export const flow = (spec, sources, sims, ucf = null) => {
  const store = {}, lines = [];
  return runOpenFlow({ part: PART, device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', seed: 1, effort: 1, ...spec },
    { log: l => lines.push(l), sources: () => sources, simSources: () => sims, ucf, device, bitDb, yosys: yosysNode,
      write: (n, d) => { store[n] = d; return `build/${n}`; }, read: n => store[n] ?? null, save: () => {} }).then(r => ({ ...r, store, lines }));
};
// a netlist (with its SDF built in) compiled with the test bench, elaborated and simulated: the log, its errors
// and warnings marked
export function simulate(sources, file, text, top, until, stop = /Simulation finished OK|ERROR/) {
  const lang = file.endsWith('.v') ? 'verilog' : 'vhdl';
  const all = [...sources, { path: file, lang, text: lang === 'vhdl' ? scalarizeNetlist(text) : text }];
  const lib = compile([...primitiveSources(all), ...all]);
  lib.errors = lib.errors.filter(e => !/redefined/.test(e.message));
  const d = elaborate(lib, top);
  const diags = [...lib.errors, ...d.diags].filter(x => x.file === file || x.severity === 'error');
  if (diags.length) return { diags: diags.map(x => `${x.severity} ${x.file}:${x.line} ${x.message}`), log: [] };
  const s = new Simulator(d);
  for (const sig of d.signals) sig.wave = null;
  const step = until / 100;
  for (let t = step; t <= until; t += step) { const st = s.run(t); if (st.finished || s.log.some(e => stop.test(e.text))) break; }
  return { diags: [], log: s.log.map(e => `${e.kind === 'warning' ? 'WARNING: ' : e.kind === 'error' || e.kind === 'failure' ? 'ERROR: ' : ''}${e.text}`), events: s.log };
}

// The minimum period of a model by its SDF, computed apart from the static timing (core/fpga/timing.js works on the
// sites, this on the model's elements): the longest path from an output driven at the clock's edge (its clock to
// out) through the elements' paths and their inputs' connection delays to an input with a setup check (ps)
export function sdfPeriod(vhdl, sdf) {
  const { instances } = parseNetgenVhdl(vhdl);
  const edges = new Map(), starts = [], ends = [];
  const add = (a, b, d) => { if (!edges.has(a)) edges.set(a, []); edges.get(a).push([b, d]); };
  for (const it of instances) {
    const cell = sdf.cells.get(it.name) || { port: new Map(), iopath: [], setup: [] };
    const dirs = new Map((primitiveInterface(it.type)?.ports || []).map(p => [p.name.toUpperCase(), p.dir]));
    const base = pin => pin.replace(/\(\d+\)$/, '');
    const key = pin => pin.replace(/\((\d+)\)$/, '[$1]');
    const port = pin => cell.port.get(key(pin)) ?? cell.port.get(base(pin)) ?? 0;
    const ins = it.pins.filter(p => dirs.get(base(p.pin).toUpperCase()) !== 'out' && !/^'|^"/.test(p.net));
    const outs = it.pins.filter(p => dirs.get(base(p.pin).toUpperCase()) === 'out');
    for (const a of cell.iopath) {
      for (const o of outs.filter(o => base(o.pin) === a.to || key(o.pin) === a.to)) {
        if (a.edge || /^CLK/.test(a.from)) starts.push([o.net, a.ps]);
        else for (const i of ins.filter(i => base(i.pin) === a.from || key(i.pin) === a.from)) add(i.net, o.net, port(i.pin) + a.ps);
      }
    }
    for (const c of cell.setup) for (const i of ins.filter(i => base(i.pin) === c.pin || key(i.pin) === c.pin)) ends.push([i.net, port(i.pin) + c.setup]);
  }
  // longest arrivals (the model's paths have no loops once the LUTs' unread inputs are tied to 0)
  const arr = new Map();
  const order = [], seen = new Set();
  const visit = n => { if (seen.has(n)) return; seen.add(n); for (const [m] of edges.get(n) || []) visit(m); order.push(n); };
  for (const n of edges.keys()) visit(n);
  for (const [n, d] of starts) arr.set(n, Math.max(arr.get(n) ?? -Infinity, d));
  for (const n of order.reverse()) { const a = arr.get(n); if (a === undefined) continue; for (const [m, d] of edges.get(n) || []) arr.set(m, Math.max(arr.get(m) ?? -Infinity, a + d)); }
  return Math.max(0, ...ends.map(([n, su]) => (arr.has(n) ? arr.get(n) + su : 0)));
}

// An example's test bench on its post-place & route model with its timing (above), in VHDL and Verilog or in one
// of them (vga's, in two files that run alongside each other, #566)
export async function exampleTimesim(name, langs = ['vhdl', 'verilog']) {
  const ex = example(name);
  const design = ex.design.map(f => ({ path: f.path, lang: f.lang, text: f.text })), sim = ex.sim.map(f => ({ path: f.path, lang: f.lang, text: f.text }));
  const r = await flow({ top: ex.project.top, steps: orderOpenSteps(['postpar']), simTop: ex.project.simTop }, design, sim, fs.readFileSync(path.join(ex.dir, ex.project.constraints), 'utf8'));
  assert.equal(r.ok, true, r.lines.join('\n'));
  assert.deepEqual(r.lines.filter(l => /^(WARNING|ERROR)/.test(l)), [], name);
  const top = ex.project.top;
  const sdf = parseSdf(r.store[`netgen/par/${top}_timesim.sdf`]);
  // the SDF's longest path, the minimum period of the static timing (gates: no clock)
  const period = /minimum period ([\d.]+) ns$/m.exec(r.lines.join('\n'));
  assert.ok(Math.abs(sdfPeriod(r.store[`netgen/par/${top}_timesim.vhd`], sdf) - (period ? Math.round(+period[1] * 1000) : 0)) <= 10, `${name}: ${sdfPeriod(r.store[`netgen/par/${top}_timesim.vhd`], sdf)} ps by the SDF, ${period?.[1]} ns by the static timing`);
  for (const lang of langs) {
    const file = `netgen/par/${top}_timesim.${lang === 'vhdl' ? 'vhd' : 'v'}`;
    const a = annotateSdf(r.store[file], lang, sdf);
    assert.deepEqual(a.missing, [], `${name} ${lang}`);
    const s = simulate([...design, ...sim], file, a.text, ex.project.simTop, name === 'vga' ? 3e10 : 1e11);
    assert.deepEqual(s.diags, [], `${name} ${file}`);
    assert.ok(s.log.some(l => /Simulation finished OK/.test(l)), `${name} ${file}: ${s.log.slice(-4).join(' | ')}`);
    assert.deepEqual(s.log.filter(l => /ERROR|WARNING/.test(l)), [], `${name} ${file}`);
  }
}
