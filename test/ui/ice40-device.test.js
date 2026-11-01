// UI: an iCE40 device in the interface (#2463): the picker with no speed grade and the synthesis locked, the processes of
// its toolchain only, its constraints PCF, and Implement to its .bin with no warnings, in the server's real flow.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const UP5K = { family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' };
const PINS = 'set_io clk 35\nset_io led[0] 11\nset_io led[1] 37\nset_frequency clk 12\n';

uiTest('#2463 Design Properties: an iCE40 part has no speed grade, its synthesis locked; a Spartan-3E part gets them back', E, async (page) => {
  await makeProject(env, { name: 'Ice40Pick', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: { 'src/blinky.v': BLINKY }, top: 'blinky' });
  await page.openProject('Ice40Pick');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const state = (family) => page.eval((f) => {
    const sel = (l) => [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === l).nextElementSibling;
    const fam = sel('Family:'); fam.value = f; fam.dispatchEvent(new Event('change'));
    return { part: sel('Device:').value, speeds: sel('Speed:').options.length, speedOff: sel('Speed:').disabled, synth: sel('Synthesis Tool:').value, synthOff: sel('Synthesis Tool:').disabled };
  }, family);
  assert.deepEqual(await state('ice40'), { part: 'ice40lp384', speeds: 0, speedOff: true, synth: 'silinx', synthOff: true });
  const back = await state('spartan3e');
  assert.equal(back.speedOff, false); assert.equal(back.synthOff, false); assert.ok(back.speeds > 0);
  await page.dialogButton('Cancel');
});

uiTest('#2463 an iCE40 project: its processes, a .ucf becomes its .pcf, Check Constraints reads PCF, Implement gives the .bin with no warnings', E, async (page) => {
  await makeProject(env, { name: 'Ice40Run', device: UP5K, files: { 'src/blinky.v': BLINKY, 'constraints/top.pcf': PINS }, top: 'blinky', constraints: 'constraints/top.pcf', synthTool: 'silinx' });
  await page.openProject('Ice40Run');
  const r = await page.eval(async () => {
    const { pcfDiagnostics, readPins, writePins, constraintsExt, constraintsForDevice } = await import('/js/constraints-format.js');
    const device = { part: 'ice40up5k' }, ports = [{ name: 'clk', width: 1 }, { name: 'led', width: 2, msb: 1, lsb: 0 }];
    const read = readPins(device, 'set_io clk 35\nset_io led[1] 37\nset_frequency clk 12\n');
    const pj = { device, constraints: 'constraints/top.ucf' }, logged = [];
    constraintsForDevice(pj, ['constraints/top.ucf'], (l) => logged.push(l));
    return {
      ext: [constraintsExt(device), constraintsExt({ part: 'xc3s250e' })],
      assigned: Object.keys(read.assignments), period: read.clocks[0].period,
      written: writePins(device, { assignments: read.assignments, clocks: read.clocks, header: 'H' }),
      good: pcfDiagnostics(PINS_TEXT(), ports),
      bad: pcfDiagnostics('set_io clk 35\nset_bogus a\n', ports),
      unknown: pcfDiagnostics('set_io nope 35\n', ports),
      moved: pj.constraints, logged,
    };
    function PINS_TEXT() { return 'set_io clk 35\nset_io led[0] 11\nset_io led[1] 37\n'; }
  });
  assert.deepEqual(r.ext, ['.pcf', '.ucf']);
  assert.deepEqual(r.assigned, ['clk', 'led<1>']);
  assert.equal(r.written, '# H\nset_io clk 35\nset_io led[1] 37\nset_frequency clk 12\n');
  assert.deepEqual(r.good, []);
  assert.deepEqual(r.bad, [{ severity: 'error', line: 2, message: 'set_bogus: not a PCF command (set_io, set_frequency)' }]);
  assert.deepEqual(r.unknown, [{ severity: 'warning', message: 'set_io nope: the top has no such port', line: 1 }]);
  assert.equal(r.moved, 'constraints/top.pcf');
  assert.deepEqual(r.logged, ["WARNING: this device's constraints are PCF: constraints/top.pcf is the project's now, constraints/top.ucf was not converted."]);

  // the processes: none of what the family's flow does not have
  await page.setView('impl');
  await page.treeRow('#hier', 'blinky');
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row')].map((x) => x.textContent.trim()));
  assert.ok(labels.includes('Generate Programming File'), String(labels));
  for (const absent of ['Map', 'Generate Text Power Report', 'Back-annotate Pin Locations']) assert.ok(!labels.includes(absent), `${absent}: ${labels}`);

  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/Process "Generate Programming File" (completed successfully|failed)/, { timeout: 60000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-2500)}`); });
  const text = await page.consoleText();
  assert.deepEqual(text.split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
  assert.match(text, /=== SILINX STEP bitgen ===|Generate Programming File/);
});
