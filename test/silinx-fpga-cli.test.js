// silinx-fpga's command line (#1679, step 8 of the toolchain's separation, #1651): its options and errors, and the
// README's blinky for the Basys2 built from Verilog and from its netlist: the .bit byte for byte the IDE's flow's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { main, parseArgs, partOf, topOf, USAGE } from '../packages/silinx-fpga/src/cli.js';
import { runOpenFlow } from '../core/flow-ide.js';
import { findDeviceGraph, loadDeviceCache, loadDb, yosysNode, nextpnrNode } from '../packages/silinx-fpga/src/node.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const BIN = path.join(ROOT, 'packages/silinx-fpga/bin/silinx-fpga.js');
const README = fs.readFileSync(path.join(ROOT, 'packages/silinx-fpga/README.md'), 'utf8');
// the README's blinky and its constraints (its ```verilog and ```ucf blocks)
const block = (lang) => README.match(new RegExp('```' + lang + '\\n([\\s\\S]*?)```'))[1];
const BLINKY = block('verilog'), UCF = block('ucf');

async function run(argv) {
  const out = [], err = [];
  const code = await main(argv, { out: l => out.push(l), err: l => err.push(l) });
  return { code, out, err };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-fpga-cli-'));

test('#1679 parseArgs: the defaults, each option', () => {
  assert.deepEqual(parseArgs(['build', 'a.v', '--part', 'xc3s250e-cp132-4']),
    { command: 'build', files: ['a.v'], part: 'xc3s250e-cp132-4', replicate: true, quiet: false, outDir: 'build', effort: 'normal', seed: 1, engine: 'auto' });
  const o = parseArgs(['build', 'a.v', 'b.v', '--part', 'p', '--top', 't', '--ucf', 'u.ucf', '-o', 'x.bit', '--out-dir', 'o', '--effort', 'high', '--seed', '3', '--no-replicate', '--engine', 'nextpnr', '--quiet']);
  assert.deepEqual(o, { command: 'build', files: ['a.v', 'b.v'], part: 'p', top: 't', ucf: 'u.ucf', out: 'x.bit', outDir: 'o', effort: 'high', seed: 3, replicate: false, engine: 'nextpnr', quiet: true });
});

test('#1679 parseArgs: what is wrong in a command line', () => {
  const error = (argv) => parseArgs(argv).error;
  assert.equal(error(['build', '--part', 'p']), 'no design: give its Verilog files or its Yosys JSON netlist');
  assert.equal(error(['build', 'a.v']), '--part is needed (xc3s250e-cp132-4: the Basys2\'s)');
  assert.equal(error(['build', 'a.v', '--part']), '--part needs a value');
  assert.equal(error(['build', 'a.v', '--top', '--part', 'p']), '--top needs a value');
  assert.equal(error(['build', 'a.v', '--part', 'p', '--fast']), 'unknown option --fast');
  assert.equal(error(['build', 'a.v', '--part', 'p', '--effort', 'max']), '--effort max: normal or high');
  assert.equal(error(['build', 'a.v', '--part', 'p', '--seed', '0']), '--seed: a whole number from 1');
  assert.equal(error(['build', 'a.v', '--part', 'p', '--seed', '1.5']), '--seed: a whole number from 1');
  assert.equal(error(['build', 'a.v', '--part', 'p', '--engine', 'vpr']), '--engine vpr: silinx, nextpnr or auto');   // (#2136)
});

test('#1679 partOf: a part as ISE and the boards write it', () => {
  const basys2 = { part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', speed: '4', family: 'spartan3e' };
  for (const s of ['xc3s250e-cp132-4', 'xc3s250ecp132-4', 'xc3s250e-4-cp132', 'XC3S250E-CP132-4']) assert.deepEqual(partOf(s), basys2, s);
  assert.deepEqual(partOf('xc3s500e-fg320-5'), { part: 'xc3s500efg320-5', device: 'xc3s500e', pkg: 'fg320', speed: '5', family: 'spartan3e' });
  assert.equal(partOf('xc3s250ecp132').speed, '4');
  assert.equal(partOf('xc6slx16-csg324-3').family, 'spartan6');
  for (const s of ['', 'foo', 'xc3s250e']) assert.equal(partOf(s), null, s);
});

test('#1679 topOf: the module no other instantiates; none when it is not one', () => {
  const v = (text) => [{ path: 'a.v', lang: 'verilog', text }];
  assert.equal(topOf(v(BLINKY)), 'blinky');
  assert.equal(topOf(v('module leaf(input a, output b); assign b = a; endmodule\nmodule top(input x, output y);\n  leaf u (.a(x), .b(y));\nendmodule\n')), 'top');
  assert.equal(topOf(v('module leaf #(parameter W = 1) (input a); endmodule\nmodule top(input x);\n  leaf #(.W(2)) u (.a(x));\nendmodule\n')), 'top');
  // a module named in a comment is not an instance
  assert.equal(topOf(v('module leaf(input a); endmodule\nmodule top(input x);\n  // leaf u (x);\nendmodule\n')), null);
  assert.equal(topOf(v('module a(); endmodule\nmodule b(); endmodule\n')), null);
});

test('#1679 the command line: its version, its help, a wrong command (exit 2)', async () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/silinx-fpga/package.json'), 'utf8'));
  assert.deepEqual(pkg.bin, { 'silinx-fpga': 'bin/silinx-fpga.js' });
  assert.deepEqual(await run(['--version']), { code: 0, out: [`silinx-fpga ${pkg.version}`], err: [] });
  assert.deepEqual(await run(['help']), { code: 0, out: [USAGE], err: [] });
  assert.deepEqual(await run([]), { code: 2, out: [USAGE], err: [] });
  assert.deepEqual(await run(['make', 'a.v']), { code: 2, out: [], err: ['silinx-fpga: unknown command make', USAGE] });
  assert.deepEqual(await run(['build', 'a.v']), { code: 2, out: [], err: ['silinx-fpga: --part is needed (xc3s250e-cp132-4: the Basys2\'s)', USAGE] });
  // the bin runs it
  assert.equal(execFileSync(process.execPath, [BIN, '--version'], { encoding: 'utf8' }), `silinx-fpga ${pkg.version}\n`);
});

test('#1679 the command line: the parts it builds, the files it reads', async () => {
  const dir = tmp();
  const v = path.join(dir, 'blinky.v'), vhd = path.join(dir, 'top.vhd'), net = path.join(dir, 'n.json'), txt = path.join(dir, 'notes.txt');
  fs.writeFileSync(v, BLINKY);
  fs.writeFileSync(vhd, 'entity top is end;\n');
  fs.writeFileSync(net, '{"modules":{}}');
  fs.writeFileSync(txt, '');
  const first = async (argv) => { const r = await run(argv); return [r.code, r.err[0]]; };
  assert.deepEqual(await first(['build', v, '--part', 'xc3s250e-xx132-4']), [2, 'silinx-fpga: --part xc3s250e-xx132-4: not a part (xc3s250e-cp132-4)']);
  assert.deepEqual(await first(['build', v, '--part', 'xc6slx16-csg324-3']), [2, 'silinx-fpga: --part xc6slx16-csg324-3: the Silinx toolchain builds Spartan-3E parts']);
  assert.deepEqual(await first(['build', v, '--part', 'xc3s1600e-fg320-4']), [2, 'silinx-fpga: --part xc3s1600e-fg320-4: no device description or bit database of xc3s1600efg320 (the Basys2\'s and the Nexys2\'s parts have them)']);
  assert.deepEqual(await first(['build', path.join(dir, 'none.v'), '--part', 'xc3s250e-cp132-4']), [1, `silinx-fpga: ${path.join(dir, 'none.v')}: no such file`]);
  assert.deepEqual(await first(['build', v, '--part', 'xc3s250e-cp132-4', '--ucf', path.join(dir, 'none.ucf')]), [1, `silinx-fpga: ${path.join(dir, 'none.ucf')}: no such file`]);
  assert.deepEqual(await first(['build', vhd, '--part', 'xc3s250e-cp132-4']), [1, `silinx-fpga: ${vhd}: VHDL needs Silinx ISE's front end; give Verilog or a Yosys JSON netlist`]);
  assert.deepEqual(await first(['build', txt, '--part', 'xc3s250e-cp132-4']), [2, `silinx-fpga: ${txt}: not Verilog (.v) or a Yosys JSON netlist (.json)`]);
  assert.deepEqual(await first(['build', net, v, '--part', 'xc3s250e-cp132-4']), [2, 'silinx-fpga: a Yosys JSON netlist alone, or Verilog files']);
  assert.deepEqual(await first(['build', net, '--part', 'xc3s250e-cp132-4']), [2, 'silinx-fpga: the top module is not clear: give it with --top']);
  fs.writeFileSync(net, 'module');
  assert.match((await first(['build', net, '--part', 'xc3s250e-cp132-4']))[1], /^silinx-fpga: .*n\.json: not a Yosys JSON netlist \(/);
});

test('#1679 the command line: a design with an error stops the flow (exit 1), nothing built', { timeout: 300000 }, async () => {
  const dir = tmp();
  const v = path.join(dir, 'bad.v');
  fs.writeFileSync(v, 'module bad(input a, output b);\n  assign b = a &;\nendmodule\n');
  const r = await run(['build', v, '--part', 'xc3s250e-cp132-4', '--out-dir', path.join(dir, 'build')]);
  assert.equal(r.code, 1);
  assert.deepEqual(r.err, ["ERROR: bad.v:2: syntax error, unexpected ';'", 'silinx-fpga: the design has errors']);
  assert.ok(!fs.existsSync(path.join(dir, 'build', 'bad.bit')));
  // a module missing under the top; a file of its own, its lines its own
  const top = path.join(dir, 'top.v'), leaf = path.join(dir, 'leaf.v');
  fs.writeFileSync(top, 'module top(input x, output y);\n  leaf u (.a(x), .b(y));\n  gone g (.a(x));\nendmodule\n');
  fs.writeFileSync(leaf, '\n\nmodule leaf(input a, output b);\n  assign b = ~a\nendmodule\n');
  const m = await run(['build', top, leaf, '--part', 'xc3s250e-cp132-4', '--out-dir', path.join(dir, 'build')]);
  assert.deepEqual([m.code, m.err], [1, ['ERROR: leaf.v:5: syntax error, unexpected TOK_ENDMODULE', 'silinx-fpga: the design has errors']]);
  fs.writeFileSync(leaf, 'module leaf(input a, output b);\n  assign b = ~a;\nendmodule\n');
  const g = await run(['build', top, leaf, '--part', 'xc3s250e-cp132-4', '--out-dir', path.join(dir, 'build'), '--top', 'top']);
  assert.deepEqual([g.code, g.err], [1, ["ERROR: Module `\\gone' referenced in module `\\top' in cell `\\g' is not part of the design.", 'silinx-fpga: the design has errors']]);
  assert.ok(!fs.existsSync(path.join(dir, 'build', 'bad.bit')));
});

// the IDE's flow (core/flow-ide.js runOpenFlow: Silinx's front end, then the same toolchain) on the same design
async function ideBit() {
  const store = {};
  let device, db;
  const io = { log: () => {}, sources: () => [{ path: 'blinky.v', lang: 'verilog', text: BLINKY }], ucf: UCF, ucfName: 'basys2.ucf',
    device: () => (device ||= loadDeviceCache(findDeviceGraph('xc3s250ecp132-4'))), bitDb: () => (db ||= loadDb('xc3s250ecp132', { graph: io.device() })),
    yosys: yosysNode, nextpnr: { spartan3e: nextpnrNode() }, write: (name, data) => { store[name] = data; return name; }, read: name => store[name] ?? null, save: () => {} };
  const r = await runOpenFlow({ top: 'blinky', part: 'xc3s250ecp132-4', device: 'xc3s250e', pkg: 'cp132', family: 'spartan3e', seed: 1, effort: 1,
    synthEffort: 'normal', startupClk: 'JtagClk', engine: 'auto', steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] }, io);   // (the IDE's default engine, #2136)
  assert.ok(r.ok, r.error);
  return Buffer.from(store['blinky.bit']);
}

test('#1679 the README\'s blinky built from the command line: no warnings, its files, the IDE\'s .bit byte for byte; from its netlist too', { timeout: 600000 }, async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, 'blinky.v'), BLINKY);
  fs.writeFileSync(path.join(dir, 'basys2.ucf'), UCF);
  const build = path.join(dir, 'build'), bit = path.join(dir, 'blinky.bit');
  const r = await run(['build', path.join(dir, 'blinky.v'), '--part', 'xc3s250e-cp132-4', '--ucf', path.join(dir, 'basys2.ucf'), '-o', bit, '--out-dir', build]);
  assert.equal(r.code, 0, r.err.join('\n'));
  assert.deepEqual(r.err, [], 'no warnings');
  // (nextpnr, the default engine, #2136: the fastest of its 4 placements)
  assert.ok(r.out.some(l => l.startsWith('Placed and routed by nextpnr in ')) && r.out.includes('Kept the fastest of 4 placements: seed 1, 5.069 ns.'), r.out.join('\n'));
  assert.ok(r.out.includes('constraint PERIOD 20 ns on clk: met (period 5.069 ns, slack 14.931 ns)'), r.out.join('\n'));
  assert.ok(r.out.includes('All constraints were met.'));
  assert.equal(r.out.at(-1), `${bit}: the bitstream of blinky on xc3s250ecp132-4`);
  for (const f of ['blinky.json', 'routed.xdl', 'timing.txt', 'blinky.bit']) assert.ok(fs.existsSync(path.join(build, f)), f);
  const cli = fs.readFileSync(bit);
  assert.deepEqual(cli, fs.readFileSync(path.join(build, 'blinky.bit')));
  assert.ok(cli.equals(await ideBit()), 'the IDE\'s .bit');

  // its netlist: placed, routed and the same .bit; --quiet prints the result only
  const again = path.join(dir, 'again');
  const n = await run(['build', path.join(build, 'blinky.json'), '--part', 'xc3s250ecp132-4', '--ucf', path.join(dir, 'basys2.ucf'), '--out-dir', again, '--quiet']);
  assert.equal(n.code, 0, n.err.join('\n'));
  assert.deepEqual(n, { code: 0, out: [`${path.join(again, 'blinky.bit')}: the bitstream of blinky on xc3s250ecp132-4`], err: [] });
  assert.ok(fs.readFileSync(path.join(again, 'blinky.bit')).equals(cli));
  assert.ok(!fs.existsSync(path.join(again, 'blinky_syn.v')), 'not synthesized again');
});
