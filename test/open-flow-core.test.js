// The Silinx toolchain's flow (core/open-flow-core.js) as the browser edition runs it
// (web/js/open-flow-worker.js: the device description and the bit database given as JSON, the
// build in memory) makes the same bitstream as the application's runner (server/open-flow-run.js:
// the files on disk): blinky on the Basys2 (XC3S250E-CP132).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runOpenFlow } from '../core/open-flow-core.js';
import { loadDevice } from '../core/fpga/device.js';
import { dbFileNames, dbFilesFrom, makeBitDb } from '../core/fpga/bitdb.js';
import { yosysNode } from '../core/synth-open-node.js';
import { shippedDevicePath } from '../core/fpga/device-node.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_DIR = path.join(ROOT, 'research/s3e-bitstream/db');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-open-flow-core-'));
test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const PJ = path.join(ROOT, 'examples/blinky');
const project = JSON.parse(fs.readFileSync(path.join(PJ, 'silinx.json'), 'utf8'));
const sources = project.files.filter(f => (f.role || 'design') === 'design' && /^(vhdl|verilog)$/.test(f.lang));
const spec = {
  top: 'top', part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', graph: shippedDevicePath('xc3s250ecp132-4'),
  steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'], seed: 1, effort: 1, startupClk: 'JtagClk',
};

test('the browser edition\'s flow (in memory, the database as JSON) writes the bitstream of the application\'s runner', { timeout: 300000 }, async () => {
  // the application: server/open-flow-run.js on files
  const buildDir = path.join(tmp, 'build'), outDir = path.join(buildDir, 'open');
  fs.mkdirSync(outDir, { recursive: true });
  const flow = { ...spec, bitDbDir: DB_DIR, buildDir, outDir, ucf: path.join(PJ, project.constraints),
    sources: sources.map(s => ({ path: s.path, lang: s.lang, file: path.join(PJ, s.path) })) };
  fs.writeFileSync(path.join(outDir, 'flow.json'), JSON.stringify(flow));
  const r = spawnSync(process.execPath, [path.join(ROOT, 'server/open-flow-run.js'), path.join(outDir, 'flow.json')], { cwd: buildDir, encoding: 'utf8' });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /=== SILINX DONE ===/);
  const serverBit = fs.readFileSync(path.join(buildDir, 'top.bit'));

  // the browser edition: what its worker does with the fetched assets
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) {
    const p = path.join(DB_DIR, f);
    json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
  const store = {}, lines = [], reports = [];
  const io = {
    log: l => lines.push(l),
    sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
    ucf: fs.readFileSync(path.join(PJ, project.constraints), 'utf8'), ucfName: path.basename(project.constraints),
    device: () => device, bitDb: () => db, yosys: yosysNode,
    write: (name, data) => { store[name] = data; return `build/${name}`; },
    read: name => (typeof store[name] === 'string' ? store[name] : null),
    save: rep => reports.push(rep),
  };
  const res = await runOpenFlow(spec, io);
  assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
  assert.deepEqual(lines.filter(l => /^=== SILINX/.test(l)), [...spec.steps.map(s => `=== SILINX STEP ${s} ===`), '=== SILINX DONE ===']);
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), [], 'no warnings on blinky');
  assert.ok(lines.some(l => /^Bitstream: build\/top\.bit/.test(l)), lines.join('\n'));
  assert.ok(Buffer.from(store['top.bit']).equals(serverBit), 'the same bitstream');
  assert.equal(store['open/routed.xdl'], fs.readFileSync(path.join(outDir, 'routed.xdl'), 'utf8'));
  assert.ok(reports.at(-1).bit && reports.at(-1).timing?.met !== undefined, 'the report has the bitstream and the timing');
  // the clock named by its net, ABC9's netlist kept (effort High, the flow's default: blinky keeps it), as the
  // usual mapping names it, not ABC9's alias '$abc$…$aiger$o…' (#496)
  const clockLines = lines.filter(l => /^clock /.test(l));
  assert.equal(clockLines.length, 1, clockLines.join('\n'));
  assert.match(clockLines[0], /^clock \$iopadmap\$clk: minimum period \d+\.\d{3} ns \(\d+\.\d MHz\)$/);
  assert.match(store['open/timing.txt'], /^clock \$iopadmap\$clk: minimum period /m);
  assert.deepEqual(reports.at(-1).timing.clocks.map(c => [c.clock, c.port]), [['$iopadmap$clk', 'clk']]);
});

test('Back-annotate Pin Locations (pin2ucf): the placer\'s pads as UCF; built again from the back-annotated UCF, the pads stay where they were (#118)', { timeout: 300000 }, async () => {
  const { parseXdl, placedPins } = await import('../core/xdl.js');
  const { backAnnotateUcf } = await import('../core/ucf.js');
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) {
    const p = path.join(DB_DIR, f);
    json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
  const run = async (ucf, steps) => {
    const store = {}, lines = [], reports = [];
    const io = {
      log: l => lines.push(l),
      sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
      ucf, ucfName: 'top.ucf', device: () => device, bitDb: () => db, yosys: yosysNode,
      write: (name, data) => { store[name] = data; return `build/${name}`; },
      read: name => (typeof store[name] === 'string' ? store[name] : null),
      save: rep => reports.push(rep),
    };
    const res = await runOpenFlow({ ...spec, steps }, io);
    assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
    assert.deepEqual(lines.filter(l => /^=== SILINX/.test(l)), [...steps.map(s => `=== SILINX STEP ${s} ===`), '=== SILINX DONE ===']);
    assert.deepEqual(lines.filter(l => /warning/i.test(l)), []);
    return { store, lines, report: reports.at(-1) };
  };
  // blinky's UCF without the LOCs of four LEDs and a switch (their I/O standard kept)
  const full = fs.readFileSync(path.join(PJ, project.constraints), 'utf8');
  const ucf = full.split('\n').map(l => (/"(led<[4-7]>|sw<3>)"/.test(l) ? l.replace(/LOC = "\w+" \| /, '') : l)).join('\n');
  assert.equal(ucf.split('\n').filter(l => /LOC =/.test(l)).length, 22);
  const steps = ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf'];
  const one = await run(ucf, steps);
  assert.ok(one.lines.includes('Pin locations of 27 port bit(s), 5 of them chosen by the placer (no LOC in the constraints): build/top_pins.ucf'), one.lines.join('\n'));
  assert.deepEqual(one.report.pinsUcf, { path: 'build/top_pins.ucf' });
  const pinsText = one.store['top_pins.ucf'];
  const placed = placedPins(parseXdl(one.store['open/routed.xdl']));
  assert.equal(placed.length, 27);
  assert.ok(pinsText.startsWith('# Pin locations of \'top\' on xc3s250ecp132-4: the pads of the placed design (Silinx toolchain), as Xilinx pin2ucf writes them\n\nNET "an<0>"  LOC = "F12" ;\n'), pinsText);
  // the user's LOCs are where they asked
  for (const [net, loc] of [['clk', 'B8'], ['led<0>', 'M5'], ['sw<2>', 'K3']]) assert.equal(placed.find(p => p.net === net).loc, loc, net);
  // the UCF back-annotated: the five pins the placer chose added, the rest as written
  const ports = [{ name: 'clk' }, { name: 'sw', width: 4, msb: 3, lsb: 0 }, { name: 'btn', width: 2, msb: 1, lsb: 0 }, { name: 'led', width: 8, msb: 7, lsb: 0 },
    { name: 'seg', width: 7, msb: 6, lsb: 0 }, { name: 'dp' }, { name: 'an', width: 4, msb: 3, lsb: 0 }];
  const ba = backAnnotateUcf(ucf, pinsText, { ports, tool: 'Silinx toolchain', date: '2026-10-12' });
  assert.deepEqual(ba.added.map(a => a.net), ['led<4>', 'led<5>', 'led<6>', 'led<7>', 'sw<3>']);
  assert.deepEqual(ba.added.map(a => a.loc), ['led<4>', 'led<5>', 'led<6>', 'led<7>', 'sw<3>'].map(n => placed.find(p => p.net === n).loc));
  assert.ok(ba.text.startsWith(ucf.replace(/\s*$/, '\n')));
  // built again from it: every port on the pad it had, and the same pin file
  const two = await run(ba.text, steps);
  assert.ok(two.lines.includes('Pin locations of 27 port bit(s), 0 of them chosen by the placer (no LOC in the constraints): build/top_pins.ucf'), two.lines.join('\n'));
  const byNet = (a, b) => a.net.localeCompare(b.net);
  assert.deepEqual(placedPins(parseXdl(two.store['open/routed.xdl'])).sort(byNet), [...placed].sort(byNet));
  assert.equal(two.store['top_pins.ucf'], pinsText);
});

test('Implement Design: ports without a LOC nor an I/O standard (LVCMOS25) where every bank holds LVCMOS33 pins: the banks\' VCCO said, with the standard to give them, not "not enough pads" (#128)', { timeout: 300000 }, async () => {
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) {
    const p = path.join(DB_DIR, f);
    json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
  // blinky's UCF without the lines of four LEDs: no LOC, no IOSTANDARD
  const ucf = fs.readFileSync(path.join(PJ, project.constraints), 'utf8').split('\n').filter(l => !/"led<[4-7]>"/.test(l)).join('\n');
  const lines = [];
  const io = {
    log: l => lines.push(l),
    sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
    ucf, ucfName: 'top.ucf', device: () => device, bitDb: () => db, yosys: yosysNode,
    write: name => `build/${name}`, read: () => null, save: () => {},
  };
  const res = await runOpenFlow({ ...spec, steps: ['synth', 'translate', 'map', 'par'] }, io);
  assert.equal(res.ok, false);
  const at = lines.findIndex(l => l.startsWith('ERROR:'));
  assert.deepEqual(lines.slice(at), [
    'ERROR:Silinx - placement failed: place: no pad for 4 I/O(s) of LVCMOS25 (VCCO 2.5 V): led<4>, led<5>, led<6>, led<7>: the banks with free pads need another VCCO: '
      + 'bank 0 VCCO 3.3 V (LVCMOS33: btn<1>, clk, sw<3>), bank 1 VCCO 3.3 V (LVCMOS33: an<0>, an<1>, an<2> and 8 more), bank 2 VCCO 3.3 V (LVCMOS33: led<0>, led<1>, led<2> and 4 more), bank 3 VCCO 3.3 V (LVCMOS33: sw<1>, sw<2>)',
    'Give them the I/O standard of a bank in the constraints (UCF), e.g. NET "led<4>" IOSTANDARD = LVCMOS33; (or LOC them on pads of a bank of their own).',
    '=== SILINX FAILED par (exit 1) ===',
  ]);
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), []);
});

// #249: a routing that does not converge on any placement tried (the router's passes at most: 1 here,
// so that blinky's routing still has nodes shared) is said so, not through the routing check
test('Implement Design: the routing does not converge on the placements tried: said so plainly, no routing check (#249)', { timeout: 300000 }, async () => {
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) {
    const p = path.join(DB_DIR, f);
    json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
  const lines = [];
  const io = {
    log: l => lines.push(l),
    sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
    ucf: fs.readFileSync(path.join(PJ, project.constraints), 'utf8'), ucfName: 'top.ucf', device: () => device, bitDb: () => db, yosys: yosysNode,
    write: name => `build/${name}`, read: () => null, save: () => {},
  };
  const res = await runOpenFlow({ ...spec, steps: ['synth', 'translate', 'map', 'par'], routeIterations: 1 }, io);
  assert.equal(res.ok, false);
  const at = lines.findIndex(l => l.startsWith('ERROR:'));
  assert.match(lines[at], /^ERROR:Silinx - the routing did not converge: \d+ routing node\(s\) still used by more than one net after 1 passes, on 4 placement\(s\) \(seeds 1 to 4\)$/, lines.slice(-6).join('\n'));
  assert.deepEqual(lines.slice(at + 1), ['The design is too dense for the router on this device: a larger device, or an ISE mode (Toolchain Settings), may implement it.', '=== SILINX FAILED par (exit 1) ===']);
  assert.deepEqual(lines.filter(l => /warning/i.test(l)), []);
});

// #651: at Optimization Effort High, Place & Route makes two placements (seeds 1 and 2) and keeps the faster, said;
// at Normal too for a design of 500 slices at most (blinky; a larger one: one, test/fpga-place-route.test.js). At High a
// third placement (seed 3), routed only when the placer's estimate is shorter than one of the first two's; said either way
test('Implement Design at Optimization Effort High: three placements, the third routed when its estimate says so, the faster kept and said; Normal, a small design: two (#651)', { timeout: 300000 }, async () => {
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) {
    const p = path.join(DB_DIR, f);
    json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
  const run = async synthEffort => {
    const lines = [];
    const io = {
      log: l => lines.push(l),
      sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
      ucf: fs.readFileSync(path.join(PJ, project.constraints), 'utf8'), ucfName: 'top.ucf', device: () => device, bitDb: () => db, yosys: yosysNode,
      write: name => `build/${name}`, read: () => null, save: () => {},
    };
    const res = await runOpenFlow({ ...spec, steps: ['synth', 'translate', 'map', 'par', 'trce'], synthEffort }, io);
    assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
    assert.deepEqual(lines.filter(l => /warning/i.test(l)), [], synthEffort);
    return { lines, period: res.report.timing.minPeriodNs };
  };
  const placements = async (effort, name, n) => {
    const r = await run(effort);
    const said = r.lines.filter(l => /placements/.test(l));
    assert.equal(said.length, 1, r.lines.join('\n'));
    const seeds = Array.from({ length: n }, (_, k) => k + 1);
    const m = new RegExp(`^Optimization Effort ${name}: ${n} placements \\(seeds ${seeds.join(', ')}\\): (.*); seed (\\d) kept\\.$`).exec(said[0]);
    assert.ok(m, said[0]);
    const each = m[1].split(', ');
    assert.equal(each.length, n, said[0]);
    // the first two routed; the third routed (its period) or not (estimated slower)
    each.forEach((x, k) => assert.match(x, k < 2 ? /^\d+\.\d{3} ns$/ : /^(\d+\.\d{3} ns|not routed \(estimated slower\))$/, said[0]));
    const ns = each.map(x => (/ ns$/.test(x) ? parseFloat(x) : Infinity));
    // the faster kept: its period the report's (replication gives none faster on blinky)
    assert.equal(+m[2], ns.indexOf(Math.min(...ns)) + 1);
    assert.ok(Math.abs(r.period - Math.min(...ns)) < 0.0015, `${r.period} against ${ns}`);
    return r;
  };
  await placements('high', 'High', 3);
  // Normal: blinky is small (500 slices at most), so two placements, said, and no third
  await placements('normal', 'Normal', 2);
});

// #280: the synthesis up to date: the steps from Translate on use the netlist of the earlier run, and the
// report says what that synthesis made; without that netlist the synthesis runs
test('#280 the synthesis up to date: its netlist used, its report kept; no netlist there: it runs', { timeout: 300000 }, async () => {
  const device = loadDevice(JSON.parse(zlib.gunzipSync(fs.readFileSync(spec.graph)).toString('utf8')));
  const json = {};
  for (const [k, f] of Object.entries(dbFileNames(spec.device, spec.pkg))) {
    const p = path.join(DB_DIR, f);
    json[k] = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null;
  }
  const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
  let yosysRuns = 0;
  const run = async (store, steps, synthUpToDate) => {
    const lines = [], reports = [];
    const io = {
      log: l => lines.push(l),
      sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') })),
      ucf: fs.readFileSync(path.join(PJ, project.constraints), 'utf8'), ucfName: 'top.ucf', device: () => device, bitDb: () => db,
      yosys: (...a) => { yosysRuns++; return yosysNode(...a); },
      write: (name, data) => { store[name] = data; return `build/${name}`; },
      read: name => (typeof store[name] === 'string' ? store[name] : null),
      save: rep => reports.push(rep),
    };
    const res = await runOpenFlow({ ...spec, steps, ...(synthUpToDate && { synthUpToDate }) }, io);
    assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
    return { lines, report: reports.at(-1) };
  };
  const store = {};
  const first = await run(store, ['synth', 'translate', 'map']);
  const runs = yosysRuns;
  assert.ok(runs > 0);
  const earlier = { synthesis: first.report.synthesis, files: { netlist: first.report.files.netlist, synthesis: first.report.files.synthesis } };
  const again = await run(store, ['translate', 'map', 'par'], { report: earlier });
  assert.equal(yosysRuns, runs, 'Yosys not run again');
  assert.deepEqual(again.lines.filter(l => /^=== SILINX|up to date/.test(l)), ['Process "Synthesize - Yosys" is up to date: its netlist build/open/top.json is used.',
    '=== SILINX STEP translate ===', '=== SILINX STEP map ===', '=== SILINX STEP par ===', '=== SILINX DONE ===']);
  assert.deepEqual(again.report.synthesis, first.report.synthesis);
  assert.equal(again.report.files.netlist, 'build/open/top.json');
  // no netlist (another browser, the build folder emptied): the synthesis runs, then the rest
  const none = await run({}, ['translate', 'map'], { report: earlier });
  assert.ok(yosysRuns > runs);
  assert.deepEqual(none.lines.filter(l => /^=== SILINX|up to date|not in the build folder/.test(l)), ['The netlist of the synthesis is not in the build folder: the synthesis runs again.',
    '=== SILINX STEP synth ===', '=== SILINX STEP translate ===', '=== SILINX STEP map ===', '=== SILINX DONE ===']);
});

// #282: the synthesis's Optimization Effort in the flow: Normal one Yosys run, and the console says which; a small design
// (#652, SMALL_RULE: blinky) synthesized at Normal as at High, said
test('#282 the flow\'s synthesis with Optimization Effort Normal: one Yosys run, said; High: the mappings tried; Normal on a small design (#652) or a deep one (#468): the mappings tried, said', { timeout: 300000 }, async () => {
  const run = async (synthEffort, deep = null) => {
    const lines = [];
    let runs = 0;
    const io = {
      log: l => lines.push(l),
      sources: () => (deep ? [deep] : sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') }))),
      ucf: null, device: () => null, bitDb: () => null,
      // (the critical path's remaps, #652 / #653, the wider mapping, #54, and the search for state machines, #652, apart)
      yosys: (...a) => { if (!/speedup|silinx_fold_ce|abc -luts 1,1,1,1,2,4;|silinx_fsm_(pre|forced)\.il/.test(a[0].join(' '))) runs++; return yosysNode(...a); },
      write: (name) => `build/${name}`, read: () => null, save: () => {},
    };
    const res = await runOpenFlow({ ...spec, ...(deep && { top: 'chain' }), steps: ['synth'], synthEffort }, io);
    assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
    return { runs, lines: lines.filter(l => /^Optimization Effort/.test(l)), report: res.report };
  };
  const { SMALL_RULE } = await import('../core/synth-open.js');
  assert.deepEqual(SMALL_RULE, { maxLuts: 250, gain: 0 });
  // (blinky not small: a rule of no LUTs, Normal's one mapping)
  spec.smallRule = { maxLuts: 0 };
  let n;
  try { n = await run('normal'); } finally { delete spec.smallRule; }
  const h = await run('high');
  assert.equal(n.runs, 1);
  assert.deepEqual(n.lines, ['Optimization Effort Normal: one mapping, and the mappings for speed for a small design or one limited by its logic depth (High tries them for every design, a slower synthesis).']);
  assert.ok(h.runs > 1, String(h.runs));
  assert.deepEqual(h.lines, ['Optimization Effort High: the mappings for speed tried too, the fastest kept.']);
  assert.ok(n.report.synthesis.summary.luts.used > 0);
  // blinky, small (its usual mapping's LUTs, at most 250): High's mappings at Normal, said; High's netlist (as fast)
  const sm = await run('normal');
  assert.ok(sm.runs > h.runs, `${sm.runs} against High's ${h.runs}: the usual mapping more`);
  const luts = n.report.synthesis.summary.luts.used;
  assert.ok(luts <= SMALL_RULE.maxLuts);
  assert.equal(sm.lines.length, 2);
  assert.equal(sm.lines[0], 'Optimization Effort Normal: one mapping, and the mappings for speed for a small design or one limited by its logic depth (High tries them for every design, a slower synthesis).');
  assert.match(sm.lines[1], /^Optimization Effort Normal: a small design \(\d+ LUTs\): the mappings for speed tried too, the fastest kept\.$/);
  assert.deepEqual(sm.report.synthesis.summary, h.report.synthesis.summary);
  assert.equal(sm.report.synthesis.warnings, 0);
  // High's netlist not faster by the rule (a rule asking for 99 % less): Normal's own kept, said
  spec.smallRule = { ...SMALL_RULE, gain: 0.99 };
  let ns;
  try { ns = await run('normal'); } finally { delete spec.smallRule; }
  assert.equal(ns.lines.length, 2);
  assert.match(ns.lines[1], /^Optimization Effort Normal: a small design \(\d+ LUTs\): the mappings for speed tried too, not faster \(\d+\.\d ns estimated against \d+\.\d\): the one mapping kept\.$/);
  assert.deepEqual(ns.report.synthesis.summary, n.report.synthesis.summary, 'Normal\'s own netlist');
  assert.equal(ns.report.synthesis.warnings, 0);
  // a comparator chain of 48 bits: 17 levels of logic at Normal's first mapping, the mappings for speed too
  const d = await run('normal', { path: 'chain.v', lang: 'verilog', text: `module chain(input clk, input [47:0] a, input [47:0] b, output reg gt);
  reg [47:0] ra, rb; integer i; reg g;
  always @* begin g = 1'b0; for (i = 0; i < 48; i = i + 1) g = (ra[i] & ~rb[i]) | (~(ra[i] ^ rb[i]) & g); end
  always @(posedge clk) begin ra <= a; rb <= b; gt <= g; end
endmodule` });
  assert.ok(d.runs > 1, String(d.runs));
  assert.deepEqual(d.lines, ['Optimization Effort Normal: one mapping, and the mappings for speed for a small design or one limited by its logic depth (High tries them for every design, a slower synthesis).',
    'Optimization Effort Normal: 17 levels of logic: the mappings for speed tried too, the fastest kept.']);
  // (#611: not a quarter faster than Normal's own netlist, that one kept and said; a rule asking for 99 % less)
  const chainText = `module chain(input clk, input [47:0] a, input [47:0] b, output reg gt);
  reg [47:0] ra, rb; integer i; reg g;
  always @* begin g = 1'b0; for (i = 0; i < 48; i = i + 1) g = (ra[i] & ~rb[i]) | (~(ra[i] ^ rb[i]) & g); end
  always @(posedge clk) begin ra <= a; rb <= b; gt <= g; end
endmodule`;
  const { DEEP_RULE } = await import('../core/synth-open.js');
  spec.deepRule = { ...DEEP_RULE, gain: 0.99 };
  try {
    const f = await run('normal', { path: 'chain.v', lang: 'verilog', text: chainText });
    assert.equal(f.lines.length, 2);
    assert.match(f.lines[1], /^Optimization Effort Normal: 17 levels of logic: the mappings for speed tried too, not a quarter faster \(\d+\.\d ns estimated against \d+\.\d\): the one mapping kept\.$/);
    assert.equal(f.report.synthesis.warnings, 0);
  } finally { delete spec.deepRule; }
});

// OFFSET constraints in the flow's timing (#26): an input's pad to setup and an output's clock to pad against the UCF's
// OFFSET IN / OUT, in the timing report, the warnings and the report's constraints; a TIMEGRP's not analyzed, an
// OFFSET on no clock of the design said
// #601: a DCM's clocks get the PERIOD constraints trce derives from its input's (they had none: "no clock of the design
// comes from this port"), and a register from CLK0's flip-flops into CLKFX's is timed against the two clocks' edges
test('Implement Design: a DCM\'s clocks with their derived PERIOD constraints, the paths from one into the other timed (#601)', { timeout: 300000 }, async () => {
  const { flow } = await import('./timesim-lib.mjs');
  const { orderOpenSteps } = await import('../core/open-steps.js');
  const src = (m, d) => [{ path: 'top.vhd', lang: 'vhdl', text: `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
library unisim; use unisim.vcomponents.all;
entity top is port (clk : in std_logic; led : out std_logic_vector(1 downto 0)); end;
architecture rtl of top is
  signal ci, c0u, c0, cfu, cf : std_logic; signal n : unsigned(7 downto 0) := (others => '0'); signal x : std_logic := '0';
begin
  u_ibufg : IBUFG port map (I => clk, O => ci);
  u_dcm : DCM_SP generic map (CLKFX_MULTIPLY => ${m}, CLKFX_DIVIDE => ${d}, CLKIN_PERIOD => 20.0, CLK_FEEDBACK => "1X")
    port map (CLKIN => ci, CLKFB => c0, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0', CLK0 => c0u, CLKFX => cfu);
  u_b0 : BUFG port map (I => c0u, O => c0);
  u_bf : BUFG port map (I => cfu, O => cf);
  process (c0) begin if rising_edge(c0) then n <= n + 1; end if; end process;
  process (cf) begin if rising_edge(cf) then x <= n(7) xor n(6); end if; end process;
  led <= x & n(0);
end;` }];
  const ucf = 'NET "clk" LOC = "B8" ;\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n';
  // CLKFX x 3 / 2: 13.333 ns, CLK0's edges at 0 and 20 ns, CLKFX's at 13.333 and 26.667: 6.667 ns from CLK0 to CLKFX
  const r = await flow({ top: 'top', steps: orderOpenSteps(['trce']) }, src(3, 2), [], ucf);
  assert.equal(r.ok, true, r.lines.join('\n'));
  const timing = r.store['open/timing.txt'];
  assert.match(timing, /^constraint PERIOD 20 ns on clk, CLK0 of u_dcm: 20 ns, met \(period \d+\.\d{3} ns, slack \d+\.\d{3} ns\)$/m);
  // (CLKFX's flip-flop has no path of its own: its clock no line, its one path from CLK0's below)
  assert.doesNotMatch(timing, /CLKFX of u_dcm/);
  assert.match(timing, /^paths from clock \S+ \(rising\) to clock \S+ \(rising\): met, requirement 6\.667 ns between the clocks' edges \(delay \d+\.\d{3} ns, slack \d+\.\d{3} ns\)$/m);
  assert.deepEqual(r.lines.filter(l => /^WARNING/.test(l)), []);
  assert.equal(r.lines.filter(l => /constraint\(s\) not met|All constraints were met/.test(l)).join(), 'All constraints were met.');
  assert.deepEqual(r.report.timing.constraints.map(c => [c.name, c.required, c.timingErrors]), [['PERIOD clk CLK0 of u_dcm', 20, 0]]);
  // CLKFX x 17 / 16: 18.824 ns, its edges 1.176 ns after CLK0's at the closest: the path cannot make it
  const t = await flow({ top: 'top', steps: orderOpenSteps(['trce']) }, src(17, 16), [], ucf);
  assert.equal(t.ok, true, t.lines.join('\n'));
  const m = /^paths from clock (\S+) \(rising\) to clock (\S+) \(rising\): NOT MET, requirement 1\.176 ns between the clocks' edges \(delay (\d+\.\d{3}) ns, slack -\d+\.\d{3} ns\)$/m.exec(t.store['open/timing.txt']);
  assert.ok(m, t.store['open/timing.txt']);
  assert.deepEqual(t.lines.filter(l => /^WARNING/.test(l)), [`WARNING:Timing - the paths from clock ${m[1]} to clock ${m[2]} not met: they need ${m[3]} ns, 1.176 ns between the clocks' edges`]);
  assert.equal(t.lines.filter(l => /constraint\(s\) not met|All constraints were met/.test(l)).join(), '1 constraint(s) not met.');
  assert.equal(t.report.timing.met, false);
});

// #601: the OFFSET constraints of a DCM's clocks (left out before: "no pad of the design is bounded by it"): its clocks
// deskewed, a falling-edge flip-flop's clock to pad from its edge, half CLK0's period later, as trce times it
test('Implement Design: the OFFSET constraints of a DCM\'s clocks, a pad on two of them, a falling edge half a period later (#601)', { timeout: 300000 }, async () => {
  const { flow } = await import('./timesim-lib.mjs');
  const { orderOpenSteps } = await import('../core/open-steps.js');
  const src = [{ path: 'top.vhd', lang: 'vhdl', text: `library ieee; use ieee.std_logic_1164.all;
library unisim; use unisim.vcomponents.all;
entity top is port (clk, a : in std_logic; q, f : out std_logic); end;
architecture rtl of top is
  signal ci, c0u, c0, cfu, cf, r0, rf, rn : std_logic := '0';
begin
  u_ibufg : IBUFG port map (I => clk, O => ci);
  u_dcm : DCM_SP generic map (CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 2, CLKIN_PERIOD => 20.0, CLK_FEEDBACK => "1X")
    port map (CLKIN => ci, CLKFB => c0, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0', CLK0 => c0u, CLKFX => cfu);
  u_b0 : BUFG port map (I => c0u, O => c0);
  u_bf : BUFG port map (I => cfu, O => cf);
  process (c0) begin if rising_edge(c0) then r0 <= a; end if; end process;
  process (cf) begin if rising_edge(cf) then rf <= a; end if; end process;
  process (c0) begin if falling_edge(c0) then rn <= r0 xor rf; end if; end process;
  q <= r0; f <= rn;
end;` }];
  const ucf = 'NET "clk" LOC = "B8" ;\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\nOFFSET = IN 8 ns BEFORE "clk" ;\nOFFSET = OUT 12 ns AFTER "clk" ;\n';
  const r = await flow({ top: 'top', steps: orderOpenSteps(['trce']) }, src, [], ucf);
  assert.equal(r.ok, true, r.lines.join('\n'));
  const timing = r.store['open/timing.txt'];
  assert.doesNotMatch(timing, /no pad of the design is bounded by it/);
  // a on CLK0's flip-flop and on CLKFX's: a line each, with its clock
  const ins = [...timing.matchAll(/^constraint OFFSET = IN 8 ns BEFORE "clk": met on a, clock (\S+) \(pad to setup (-?\d+\.\d{3}) ns, slack \d+\.\d{3} ns\)$/mg)];
  assert.equal(ins.length, 2, timing);
  // (deskewed: well within the 8 ns, as trce's 3.5-5 ns of the DCM designs)
  for (const m of ins) assert.ok(+m[2] > 1 && +m[2] < 7, m[0]);
  // q from CLK0's rising edge: met; f from its falling edge, 10 ns after the pad's rising one: not
  assert.match(timing, /^constraint OFFSET = OUT 12 ns AFTER "clk": met on q \(clock to pad \d\.\d{3} ns, slack \d+\.\d{3} ns\)$/m);
  const f = /^constraint OFFSET = OUT 12 ns AFTER "clk": NOT MET on f \(clock to pad (1\d\.\d{3}) ns, slack -\d+\.\d{3} ns\)$/m.exec(timing);
  assert.ok(f, timing);
  assert.deepEqual(r.lines.filter(l => /^WARNING/.test(l)), [`WARNING:Timing - constraint OFFSET = OUT 12 ns AFTER "clk" not met on f: clock to pad ${f[1]} ns`]);
  assert.equal(r.lines.filter(l => /constraint\(s\) not met|All constraints were met/.test(l)).join(), '1 constraint(s) not met.');
  assert.deepEqual(ins.map(m => m[1]).sort(), ['c0', 'cf']);
  assert.deepEqual(r.report.timing.constraints.filter(c => /^OFFSET/.test(c.name)).map(c => [c.name, c.timingErrors]).sort(),
    [['OFFSET IN a c0', 0], ['OFFSET IN a cf', 0], ['OFFSET OUT f', 1], ['OFFSET OUT q', 0]]);
});

test('Implement Design: the UCF\'s OFFSET constraints checked, in the timing report and the warnings (#26)', { timeout: 300000 }, async () => {
  const { flow } = await import('./timesim-lib.mjs');
  const { orderOpenSteps } = await import('../core/open-steps.js');
  const src = [{ path: 'top.vhd', lang: 'vhdl', text: `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, a, b : in std_logic; q, y : out std_logic); end;
architecture rtl of top is signal r : std_logic; begin
  process (clk) begin if rising_edge(clk) then r <= a xor r; end if; end process;
  q <= r; y <= a and b;
end;` }];
  const ucf = `NET "clk" LOC = "B8" ;\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;
OFFSET = IN 20 ns BEFORE "clk" ;\nNET "q" OFFSET = OUT 1 ns AFTER "clk" ;\nTIMEGRP "outs" OFFSET = OUT 8 ns AFTER "clk" ;\nOFFSET = IN 5 ns BEFORE "other" ;\n`;
  const r = await flow({ top: 'top', steps: orderOpenSteps(['trce']) }, src, [], ucf);
  assert.equal(r.ok, true, r.lines.join('\n'));
  const timing = r.store['open/timing.txt'];
  const q = /^constraint NET "q" OFFSET = OUT 1 ns AFTER "clk": NOT MET on q \(clock to pad (\d+\.\d{3}) ns, slack -\d+\.\d{3} ns\)$/m.exec(timing);
  assert.ok(q, timing);
  assert.match(timing, /^constraint OFFSET = IN 20 ns BEFORE "clk": met on a \(pad to setup -?\d+\.\d{3} ns, slack \d+\.\d{3} ns\)$/m);
  assert.match(timing, /^OFFSET IN \(pad to setup; hold\), clock \S+:\n {2}a +-?\d+\.\d{3} ns; hold +-?\d+\.\d{3} ns$/m);
  assert.match(timing, /^pad to pad:\n {2}a +-> y +\d+\.\d{3} ns\n {2}b +-> y +\d+\.\d{3} ns$/m);
  assert.deepEqual(r.lines.filter(l => /^WARNING/.test(l)), [
    `WARNING:Timing - constraint NET "q" OFFSET = OUT 1 ns AFTER "clk" not met on q: clock to pad ${q[1]} ns`,
    'WARNING:Timing - constraint OFFSET = IN 5 ns BEFORE "other": no pad of the design is bounded by it',
    'WARNING:Timing - constraint TIMEGRP "outs" OFFSET = OUT 8 ns AFTER "clk": not analyzed (the Silinx toolchain reads OFFSET on a NET or on all pads)',
  ]);
  assert.equal(r.lines.filter(l => /constraint\(s\) not met|All constraints were met/.test(l)).join(), '1 constraint(s) not met.');
  assert.deepEqual(r.report.timing.constraints.map(c => [c.name, c.timingErrors]), [['PERIOD clk', 0], ['OFFSET IN a', 0], ['OFFSET OUT q', 1]]);
  assert.equal(r.report.timing.met, false);
});

test('#1103 Implement Design: a PERIOD on the clock of a single register stage (no path between two of its flip-flops) is met with no path to time, no warning; VHDL and Verilog', { timeout: 300000 }, async () => {
  const { flow } = await import('./timesim-lib.mjs');
  const { orderOpenSteps } = await import('../core/open-steps.js');
  const ucf = 'NET "clk" LOC = "B8" ;\nNET "clk" PERIOD = 20 ns ;\nNET "other" PERIOD = 10 ns ;\n';
  for (const src of [
    { path: 'top.vhd', lang: 'vhdl', text: `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, a, b : in std_logic; y : out std_logic); end;
architecture rtl of top is begin
  process (clk) begin if rising_edge(clk) then y <= a and b; end if; end process;
end;` },
    { path: 'top.v', lang: 'verilog', text: 'module top(input clk, input a, input b, output reg y);\n  always @(posedge clk) y <= a & b;\nendmodule\n' },
  ]) {
    const r = await flow({ top: 'top', steps: orderOpenSteps(['trce']) }, [src], [], ucf);
    assert.equal(r.ok, true, r.lines.join('\n'));
    const timing = r.store['open/timing.txt'];
    assert.match(timing, /^constraint PERIOD 20 ns on clk: met \(no path between two flip-flops of its clock to time\)$/m, src.lang);
    // (a port that clocks nothing: the warning stays, for it only)
    assert.deepEqual(r.lines.filter(l => /^WARNING/.test(l)), ['WARNING:Timing - constraint PERIOD 10 ns on other: no clock of the design comes from this port'], src.lang);
    assert.deepEqual(r.report.timing.constraints.map(c => [c.name, c.timingErrors, c.minPeriodNs, c.maxFreqMHz]), [['PERIOD clk', 0, null, null]], src.lang);
    assert.equal(r.report.timing.met, true, src.lang);
  }
});

// #661: trce's Component Switching Limit checks in the flow's timing: feat_dcm_div2 as it was (CLKIN_DIVIDE_BY_2, CLKFX
// x 3 / 15: 200 ns, over the 100 ns trce allows once the input is halved: ISE's "Slack: -100.000ns", Tdcmpfx) is a
// timing error, in the report, the warnings and the report's constraints; x 2 / 5 (100 ns, its fixture now) is met
test('Implement Design: a DCM\'s pins against their switching limits, as trce (#661)', { timeout: 300000 }, async () => {
  const { flow } = await import('./timesim-lib.mjs');
  const { orderOpenSteps } = await import('../core/open-steps.js');
  const src = (m, d) => [{ path: 'top.vhd', lang: 'vhdl', text: `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
library unisim; use unisim.vcomponents.all;
entity top is port (clk : in std_logic; led : out std_logic_vector(1 downto 0)); end;
architecture rtl of top is
  signal ci, c0u, c0, cfu, cf : std_logic; signal n0, nf : unsigned(7 downto 0) := (others => '0');
begin
  u_ibufg : IBUFG port map (I => clk, O => ci);
  u_dcm : DCM_SP generic map (CLKFX_MULTIPLY => ${m}, CLKFX_DIVIDE => ${d}, CLKIN_PERIOD => 20.0, CLK_FEEDBACK => "1X",
      CLKIN_DIVIDE_BY_2 => TRUE, DESKEW_ADJUST => "SOURCE_SYNCHRONOUS")
    port map (CLKIN => ci, CLKFB => c0, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0', CLK0 => c0u, CLKFX => cfu);
  u_b0 : BUFG port map (I => c0u, O => c0);
  u_bf : BUFG port map (I => cfu, O => cf);
  process (c0) begin if rising_edge(c0) then n0 <= n0 + 1; end if; end process;
  process (cf) begin if rising_edge(cf) then nf <= nf + 1; end if; end process;
  led <= nf(7) & n0(7);
end;` }];
  const ucf = 'NET "clk" LOC = "B8" ;\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n';
  const r = await flow({ top: 'top', steps: orderOpenSteps(['trce']) }, src(3, 15), [], ucf);
  assert.equal(r.ok, true, r.lines.join('\n'));
  const timing = r.store['open/timing.txt'];
  const dcm = /^switching limit of (\S+)\/CLKIN /m.exec(timing)?.[1];
  assert.ok(dcm, timing);
  assert.match(timing, new RegExp(`^switching limit of ${dcm}/CLKIN \\(Tdcmpc\\): met, period 20\\.000 ns, min period limit 2\\.082 ns \\(480\\.307 MHz\\), slack 17\\.918 ns$`, 'm'));
  assert.match(timing, new RegExp(`^switching limit of ${dcm}/CLK0 \\(Tdcmpco\\): met, period 40\\.000 ns, min period limit 2\\.083 ns \\(480\\.077 MHz\\), slack 37\\.917 ns$`, 'm'));
  assert.match(timing, new RegExp(`^switching limit of ${dcm}/CLKFX \\(Tdcmpfx\\): NOT MET, period 200\\.000 ns, max period limit 100\\.000 ns \\(10\\.000 MHz\\), slack -100\\.000 ns$`, 'm'));
  assert.deepEqual(r.lines.filter(l => /^WARNING/.test(l)), [
    `WARNING:Timing - component switching limit not met: ${dcm}/CLKFX (Tdcmpfx): period 200.000 ns, max period limit 100.000 ns (10.000 MHz), slack -100.000 ns`]);
  assert.equal(r.lines.filter(l => /constraint\(s\) not met|All constraints were met/.test(l)).join(), '1 constraint(s) not met.');
  assert.equal(r.report.timing.met, false);
  assert.equal(r.report.timing.timingErrors, 1);
  assert.deepEqual(r.report.timing.constraints.filter(c => /Switching/.test(c.name)).map(c => [c.name, c.constraint, c.required, c.minPeriodNs, c.slackNs]),
    [[`Component Switching Limit ${dcm}/CLKFX`, 'Tdcmpfx: max period limit 100 ns', 100, 200, -100]]);
  // x 2 / 5: 100 ns, at the limit (trce: slack 0.000, met)
  const t = await flow({ top: 'top', steps: orderOpenSteps(['trce']) }, src(2, 5), [], ucf);
  assert.equal(t.ok, true, t.lines.join('\n'));
  assert.match(t.store['open/timing.txt'], new RegExp(`^switching limit of ${dcm}/CLKFX \\(Tdcmpfx\\): met, period 100\\.000 ns, max period limit 100\\.000 ns \\(10\\.000 MHz\\), slack 0\\.000 ns$`, 'm'));
  assert.deepEqual(t.lines.filter(l => /^WARNING/.test(l)), []);
  assert.equal(t.lines.filter(l => /constraint\(s\) not met|All constraints were met/.test(l)).join(), 'All constraints were met.');
  assert.equal(t.report.timing.met, true);
});
