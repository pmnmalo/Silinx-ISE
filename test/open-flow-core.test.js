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
  assert.equal(ucf.split('\n').filter(l => /LOC =/.test(l)).length, 10);
  const steps = ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf'];
  const one = await run(ucf, steps);
  assert.ok(one.lines.includes('Pin locations of 15 port bit(s), 5 of them chosen by the placer (no LOC in the constraints): build/top_pins.ucf'), one.lines.join('\n'));
  assert.deepEqual(one.report.pinsUcf, { path: 'build/top_pins.ucf' });
  const pinsText = one.store['top_pins.ucf'];
  const placed = placedPins(parseXdl(one.store['open/routed.xdl']));
  assert.equal(placed.length, 15);
  assert.ok(pinsText.startsWith('# Pin locations of \'top\' on xc3s250ecp132-4: the pads of the placed design (Silinx toolchain), as Xilinx pin2ucf writes them\n\nNET "btn<0>" LOC = "G12" ;\n'), pinsText);
  // the user's LOCs are where they asked
  for (const [net, loc] of [['clk', 'B8'], ['led<0>', 'M5'], ['sw<2>', 'K3']]) assert.equal(placed.find(p => p.net === net).loc, loc, net);
  // the UCF back-annotated: the five pins the placer chose added, the rest as written
  const ports = [{ name: 'clk' }, { name: 'sw', width: 4, msb: 3, lsb: 0 }, { name: 'btn', width: 2, msb: 1, lsb: 0 }, { name: 'led', width: 8, msb: 7, lsb: 0 }];
  const ba = backAnnotateUcf(ucf, pinsText, { ports, tool: 'Silinx toolchain', date: '2026-10-12' });
  assert.deepEqual(ba.added.map(a => a.net), ['led<4>', 'led<5>', 'led<6>', 'led<7>', 'sw<3>']);
  assert.deepEqual(ba.added.map(a => a.loc), ['led<4>', 'led<5>', 'led<6>', 'led<7>', 'sw<3>'].map(n => placed.find(p => p.net === n).loc));
  assert.ok(ba.text.startsWith(ucf.replace(/\s*$/, '\n')));
  // built again from it: every port on the pad it had, and the same pin file
  const two = await run(ba.text, steps);
  assert.ok(two.lines.includes('Pin locations of 15 port bit(s), 0 of them chosen by the placer (no LOC in the constraints): build/top_pins.ucf'), two.lines.join('\n'));
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
      + 'bank 0 VCCO 3.3 V (LVCMOS33: btn<1>, clk, sw<3>), bank 1 VCCO 3.3 V (LVCMOS33: btn<0>), bank 2 VCCO 3.3 V (LVCMOS33: led<0>, led<1>, led<2> and 2 more), bank 3 VCCO 3.3 V (LVCMOS33: sw<1>, sw<2>)',
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

// #282: the synthesis's Optimization Effort in the flow: Normal one Yosys run, and the console says which
test('#282 the flow\'s synthesis with Optimization Effort Normal: one Yosys run, said; High: the mappings tried; Normal on a deep design (#468): the mappings tried, said', { timeout: 300000 }, async () => {
  const run = async (synthEffort, deep = null) => {
    const lines = [];
    let runs = 0;
    const io = {
      log: l => lines.push(l),
      sources: () => (deep ? [deep] : sources.map(s => ({ path: s.path, lang: s.lang, text: fs.readFileSync(path.join(PJ, s.path), 'utf8') }))),
      ucf: null, device: () => null, bitDb: () => null,
      yosys: (...a) => { runs++; return yosysNode(...a); },
      write: (name) => `build/${name}`, read: () => null, save: () => {},
    };
    const res = await runOpenFlow({ ...spec, ...(deep && { top: 'chain' }), steps: ['synth'], synthEffort }, io);
    assert.ok(res.ok, `${res.error}\n${lines.join('\n')}`);
    return { runs, lines: lines.filter(l => /^Optimization Effort/.test(l)), report: res.report };
  };
  const n = await run('normal'), h = await run('high');
  assert.equal(n.runs, 1);
  assert.deepEqual(n.lines, ['Optimization Effort Normal: one mapping, and the mappings for speed for a design limited by its logic depth (High tries them for every design, a slower synthesis).']);
  assert.ok(h.runs > 1, String(h.runs));
  assert.deepEqual(h.lines, ['Optimization Effort High: the mappings for speed tried too, the fastest kept.']);
  assert.ok(n.report.synthesis.summary.luts.used > 0);
  // a comparator chain of 48 bits: 17 levels of logic at Normal's first mapping, the mappings for speed too
  const d = await run('normal', { path: 'chain.v', lang: 'verilog', text: `module chain(input clk, input [47:0] a, input [47:0] b, output reg gt);
  reg [47:0] ra, rb; integer i; reg g;
  always @* begin g = 1'b0; for (i = 0; i < 48; i = i + 1) g = (ra[i] & ~rb[i]) | (~(ra[i] ^ rb[i]) & g); end
  always @(posedge clk) begin ra <= a; rb <= b; gt <= g; end
endmodule` });
  assert.ok(d.runs > 1, String(d.runs));
  assert.deepEqual(d.lines, ['Optimization Effort Normal: one mapping, and the mappings for speed for a design limited by its logic depth (High tries them for every design, a slower synthesis).',
    'Optimization Effort Normal: 17 levels of logic: the mappings for speed tried too, the fastest kept.']);
});

// OFFSET constraints in the flow's timing (#26): an input's pad to setup and an output's clock to pad against the UCF's
// OFFSET IN / OUT, in the timing report, the warnings and the report's constraints; a TIMEGRP's not analyzed, an
// OFFSET on no clock of the design said
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
