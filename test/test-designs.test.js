// The test designs (test-designs/<name>, core/test-designs.js, #1746): the designs Silinx is tested with, offered as
// projects apart from the examples. Each is made into a project of the workspace as New Project makes it (server/
// projects.js), then: Check Syntax with its exact warnings (the MCP server's check_syntax: the application's, the design
// checks included); a schematic or a state diagram: its self-checking test bench passes in Silinx's simulator with no
// warning; a C / C++ program: C simulation (main() returns 0, PASS), C synthesis to VHDL and Verilog with no message,
// C/RTL co-simulation passing in both. A design made wrong fails its test. The examples' list is not changed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TEST_DESIGNS, TEST_DESIGN_ORDER, orderTestDesigns } from '../core/test-designs.js';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { ROOT } from './examples-lib.mjs';

const DIR = path.join(ROOT, 'test-designs');
let tmp, P, TOOLS;
before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-test-designs-'));
  process.env.SILINX_WORKSPACE = path.join(tmp, 'ws');
  process.env.SILINX_CONFIG_DIR = path.join(tmp, 'cfg');
  P = await import('../server/projects.js');
  ({ TOOLS } = await import('../server/mcp.js'));
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const tool = (name, args) => TOOLS.find((t) => t.name === name).run(args);
const project = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name, 'silinx.json'), 'utf8'));
const sources = (name) => fs.readdirSync(path.join(DIR, name, 'src')).sort();
const cFile = (name) => sources(name).find((f) => /\.(c|cpp)$/.test(f));

test('#1746 the test designs: the folders those of core/test-designs.js, in its order; none an example\'s name; the examples unchanged', () => {
  assert.deepEqual(orderTestDesigns(P.templateNames(DIR)), TEST_DESIGN_ORDER);
  assert.equal(TEST_DESIGNS.length, 15);
  assert.deepEqual(TEST_DESIGN_ORDER.filter((n) => EXAMPLE_ORDER.includes(n)), []);
  assert.deepEqual(P.templateNames(P.EXAMPLES_DIR).length, EXAMPLE_ORDER.length);
  assert.deepEqual(orderTestDesigns(['zeta', 'sort', 'alpha', 'bus_taps']), ['bus_taps', 'sort', 'alpha', 'zeta']);
  assert.deepEqual(TEST_DESIGNS.map((d) => d.kind), [...Array(7).fill('schematic'), ...Array(3).fill('fsm'), ...Array(5).fill('c')]);
  // every name a project name the New Project wizard takes (its default name)
  for (const n of TEST_DESIGN_ORDER) assert.match(n, /^[A-Za-z][A-Za-z0-9_]*$/);
});

test('#1746 the test designs\' projects: no board, the top named after the design, its sources by kind (the drawings with no HDL file yet: the application writes it)', () => {
  for (const d of TEST_DESIGNS) {
    const pj = project(d.name);
    assert.equal(pj.name, d.name);
    assert.equal(pj.top, d.name);
    assert.equal(pj.board, null, d.name);
    assert.deepEqual(pj.device, { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });
    assert.equal(pj.preferredLanguage, 'vhdl');
    if (d.kind === 'c') {
      assert.deepEqual([pj.simTop, pj.files], ['', []], d.name);
      assert.deepEqual(sources(d.name), [`${d.name}.${d.name === 'stream_sum' ? 'cpp' : 'c'}`]);
      assert.match(fs.readFileSync(path.join(DIR, d.name, 'src', cFile(d.name)), 'utf8'), /Silinx test design \(#1746\)\. Copyright 2026 Pedro Maló\. AGPL-3\.0-only\./);
      continue;
    }
    assert.equal(pj.simTop, `tb_${d.name}`);
    assert.deepEqual(pj.files, [{ path: `sim/tb_${d.name}.vhd`, lang: 'vhdl', role: 'sim' }]);
    const ext = d.kind === 'schematic' ? 'sch.json' : 'fsm.json';
    assert.deepEqual(sources(d.name), d.name === 'full_adder' ? ['full_adder.sch.json', 'half_adder.sch.json'] : [`${d.name}.${ext}`]);
    for (const f of sources(d.name)) assert.equal(JSON.parse(fs.readFileSync(path.join(DIR, d.name, 'src', f), 'utf8')).generatedFile, undefined, f);
  }
});

for (const d of TEST_DESIGNS) {
  test(`#1746 test design ${d.name} (${d.kind}): a new project from it; Check Syntax with its exact warnings; its test passes`, { timeout: 120000 }, async () => {
    await P.createProject({ name: d.name, template: d.name });
    const cs = await tool('check_syntax', { project: d.name });
    assert.ok(cs.data.ok, cs.text);
    // its exact warnings: none, the C designs' too (no design checks of a C source's HDL under its name, #1759)
    assert.deepEqual(cs.text.split('\n').slice(0, -1), []);
    assert.equal(cs.text.split('\n').at(-1).includes('warning'), false);
    if (d.kind === 'c') {
      const src = fs.readFileSync(path.join(P.projectDir(d.name), 'src', cFile(d.name)), 'utf8');
      const file = `src/${cFile(d.name)}`;
      const sim = simulateC(src, { file });
      assert.deepEqual([sim.ok, sim.exitCode, sim.diagnostics], [true, 0, []]);
      assert.match(sim.output, /\nPASS\n$/);
      for (const lang of ['vhdl', 'verilog']) {
        const g = cToHdl(src, { file, lang });
        assert.deepEqual([g.ok, g.top, g.diagnostics], [true, d.name, []], lang);
        const co = cosimulate(src, { file, lang });
        assert.deepEqual([co.ok, co.pass, co.errors, co.mismatches], [true, true, [], []], lang);
        assert.ok(co.calls > 0);
      }
      return;
    }
    const cs2 = await tool('check_syntax', { project: d.name, simulation: true });
    assert.deepEqual(cs2.data.warnings, []);
    assert.ok(cs2.data.ok, cs2.text);
    const run = await tool('simulate', { project: d.name, time_ns: 100000, signals: [] });
    const log = run.data.log.map((l) => l.text);
    assert.equal(run.data.failed, false, log.join('\n'));
    assert.deepEqual(run.data.warnings, []);
    assert.deepEqual(log.filter((l) => /ERROR/.test(l)), []);
    assert.equal(log.filter((l) => /^Simulation finished OK/.test(l)).length, 1, log.join('\n'));
  });
}

test('#1746 a test design made wrong fails its test: a state diagram\'s output, a C function', async () => {
  // det1011: its detection's output (S101, x -> y = 1) made 0
  await P.createProject({ name: 'Det', template: 'det1011' });
  const f = path.join(P.projectDir('Det'), 'src', 'det1011.fsm.json');
  const m = JSON.parse(fs.readFileSync(f, 'utf8'));
  const t = m.transitions.find((x) => x.outputs.y === "1'b1");
  t.outputs.y = "1'b0";
  fs.writeFileSync(f, JSON.stringify(m, null, 2));
  const run = await tool('simulate', { project: 'Det', time_ns: 100000, signals: [] });
  assert.ok(run.data.log.some((l) => /^ERROR: cycle \d+: y is '0', expected '1'$/.test(l.text)), run.text);
  assert.ok(!run.data.log.some((l) => /Simulation finished OK/.test(l.text)));
  // popcount: an OR in place of the sum
  const src = fs.readFileSync(path.join(DIR, 'popcount', 'src', 'popcount.c'), 'utf8').replace('n += x[i];', 'n |= x[i];');
  const sim = simulateC(src, { file: 'src/popcount.c' });
  assert.ok(sim.ok && sim.exitCode > 0, `exit ${sim.exitCode}`);
  assert.match(sim.output, /\nFAIL: \d+ wrong result\(s\)\n$/);
});

test('#1746 a test design for a board: its UCF written (its constraints folder made), as for an example', async () => {
  const db = (await import('../server/devices.js')).getDeviceDb();
  const b = db.boards.find((x) => x.id === 'basys2');
  await P.createProject({ name: 'Adder', template: 'full_adder', board: 'basys2', device: b.device });
  const pj = await P.readProject('Adder');
  assert.deepEqual([pj.top, pj.board, pj.constraints], ['full_adder', 'basys2', 'constraints/top.ucf']);
  assert.match(fs.readFileSync(path.join(P.projectDir('Adder'), 'constraints', 'top.ucf'), 'utf8'), /^# UCF for top 'full_adder' on Digilent Basys2/m);
});

test('#1746 the MCP server: list_examples lists the test designs apart; new_project_from_example makes one', async () => {
  const ex = await tool('list_examples', {});
  assert.deepEqual(ex.data.examples.map((e) => e.name), EXAMPLE_ORDER);
  assert.deepEqual(ex.data.testDesigns.map((e) => e.name), TEST_DESIGN_ORDER);
  assert.deepEqual(ex.data.testDesigns.find((e) => e.name === 'gcd'), { name: 'gcd', top: 'gcd', simTop: null, board: null, device: 'xc3s250ecp132-4', kind: 'c', about: TEST_DESIGNS.find((x) => x.name === 'gcd').about });
  assert.match(ex.text, /\n\nTest designs \(the designs Silinx is tested with; its own, with their test\):\nbus_taps \(schematic\): bus taps of one bit and of several, [^\n]*; top bus_taps, test bench tb_bus_taps\n/);
  assert.match(ex.text, /\ngcd \(c\): C: the greatest common divisor, [^\n]*; top gcd, its test the C's main\(\)\n/);
  const made = await tool('new_project_from_example', { name: 'Vend', example: 'vending' });
  assert.equal(made.text, 'Project \'Vend\' made from the test design vending: top vending, no board (xc3s250ecp132-4). It is untrusted, as every project an assistant makes: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.');
  assert.ok(fs.existsSync(path.join(P.projectDir('Vend'), 'sim', 'tb_vending.vhd')));
  await assert.rejects(tool('new_project_from_example', { name: 'X', example: '../test-designs/gcd' }), /unknown example '\.\.\/test-designs\/gcd' \(list_examples\)/);
});
