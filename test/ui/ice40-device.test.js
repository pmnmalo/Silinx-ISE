// UI: an iCE40 device in the interface (#2463): the picker with no speed grade and the synthesis locked, the processes of
// its toolchain only, its constraints PCF, and Implement to its .bin with no warnings, in the server's real flow; the
// iCEBreaker's pins written as a PCF by Update Constraints (#2468); Configure Target Device writing its .bin into the
// board's flash (#2298).
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
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

uiTest('#2468 the iCEBreaker: its pins written as the project\'s constraints/top.pcf from the board', E, async (page) => {
  const device = { family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' };
  await makeProject(env, { name: 'IceBreaker', board: 'icebreaker', device, top: 'top', constraints: 'constraints/top.pcf',
    files: { 'src/top.v': 'module top(input clk, input [2:0] btn, output [4:0] led);\n  assign led = {btn, clk, 1\'b0};\nendmodule\n' } });
  await page.openProject('IceBreaker');
  const r = await page.eval(async () => {
    const ok = await window.SilinxApp.regenerateUcf();
    const { api } = await import('/js/api.js');
    return { ok, text: await api.readFile('IceBreaker', 'constraints/top.pcf'), constraints: window.Silinx.project.constraints };
  });
  assert.equal(r.ok, true);
  assert.equal(r.constraints, 'constraints/top.pcf');
  assert.equal(r.text, "# PCF for top 'top' on 1BitSquared iCEBreaker (ice40up5k-sg48), generated by Silinx\n\nset_io clk 35\nset_io btn[0] 20\nset_io btn[1] 19\nset_io btn[2] 18\n"
    + 'set_io led[0] 27\nset_io led[1] 25\nset_io led[2] 21\nset_io led[3] 23\nset_io led[4] 26\nset_frequency clk 12.000048\n');
});

// #2298: Configure Target Device of an iCE40: no JTAG chain, its .bin into the board's SPI flash; with no .bin, the
// design implemented first; the server runs openFPGALoader -b ice40_generic (a fake one, never a real board's)
uiTest('#2298 Configure Target Device of an iCE40: Program Flash writes its .bin with openFPGALoader, implemented first; Portuguese', E, async (page) => {
  const conf = path.join(env.tmp, 'config', 'config.json'), saved = await fs.readFile(conf, 'utf8');
  const fake = path.join(env.tmp, 'fake-openFPGALoader'), called = path.join(env.tmp, 'openFPGALoader.args');
  await fs.writeFile(fake, `#!/bin/sh\necho "$@" > '${called}'\necho "Done"\n`, { mode: 0o755 });
  await fs.writeFile(conf, JSON.stringify({ ...JSON.parse(saved), paths: { openFPGALoader: fake } }));
  try {
    await makeProject(env, { name: 'Ice40Prog', board: 'icebreaker', device: UP5K, files: { 'src/blinky.v': BLINKY, 'constraints/top.pcf': PINS }, top: 'blinky', constraints: 'constraints/top.pcf', synthTool: 'silinx' });
    await page.openProject('Ice40Prog');
    await page.setView('impl');
    await page.treeRow('#hier', 'blinky');
    await page.treeRow('#procs', 'Configure Target Device', { dbl: true, exact: true });
    await page.waitFor(() => /No \.bin yet/.test(document.querySelector('.doc:not([hidden]) .imp-file')?.textContent || ''), [], { what: 'the flash page' });
    // (the page by its button: after the implementation, the Silinx interface shows another document over it)
    const shown = () => page.eval(() => [...document.querySelector('.ice40-program').closest('.page').querySelectorAll('h2, .imp-settings > *, .imp-file, .ice40-program, .note-box')].map((e) => e.textContent));
    assert.deepEqual(await shown(), ['Program the iCE40 — SPI flash', 'Board:', '1BitSquared iCEBreaker', 'Programmer:', 'openFPGALoader, through the board\'s USB (FT2232H)',
      'Configuration file (.bin):', 'build/blinky.bin', 'No .bin yet — run "Generate Programming File" first.', 'Program Flash',
      'The on-board FT2232H: the .bin written into the SPI flash, which the FPGA then loads (and at every power-up).\nNot yet tested on a real board.']);
    // its tab: Program Flash, not iMPACT
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.tab.active, .doc-tab.active')].map((t) => t.textContent.replace('✕', '').trim()).filter((t) => /Program Flash|iMPACT/.test(t))), ['Program Flash']);
    // no .bin: implement it first (No: nothing runs)
    await page.click('.doc:not([hidden]) .ice40-program');
    await page.waitDialog('Program Flash');
    assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().textContent), /There is no build\/blinky\.bin yet\. Implement the design and generate it now\?/);
    await page.dialogButton('No');
    await fs.access(called).then(() => assert.fail('openFPGALoader ran'), () => {});
    // Yes: implemented, then written into the flash
    await page.click('.doc:not([hidden]) .ice40-program');
    await page.dialogButton('Yes');
    await page.waitDialog('Program Flash', { timeout: 120000 });
    assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().textContent), /Write build\/blinky\.bin into the board's SPI flash\? The FPGA then loads it, and again at every power-up\./);
    await page.dialogButton('Yes');
    await page.waitConsole(/Flash programmed: the FPGA loads the design\./, { timeout: 60000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-2500)}`); });
    const log = await page.consoleText();
    assert.match(log, /Configuration file \S+blinky\.bin \(104090 bytes, an iCE40's \.bin\)/);
    assert.match(log, /Programming \(SPI flash, non-volatile\) with openFPGALoader board=ice40_generic/);
    assert.match(await fs.readFile(called, 'utf8'), /^-b ice40_generic \S+build\/blinky\.bin\n$/);
    assert.match(await page.eval(() => document.querySelector('.ice40-program').closest('.page').querySelector('.imp-file').textContent), /^Configuration file: build\/blinky\.bin \(104090 bytes\)$/);
    // in Portuguese: the page translated
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    try {
      assert.deepEqual(await shown(), ['Programar o iCE40 — flash SPI', 'Placa:', '1BitSquared iCEBreaker', 'Programador:', 'openFPGALoader, pela USB da placa (FT2232H)',
        'Ficheiro de configuração (.bin):', 'build/blinky.bin', 'Ficheiro de configuração: build/blinky.bin (104090 bytes)', 'Programar Flash',
        'O FT2232H da placa: o .bin escrito na flash SPI, que a FPGA depois carrega (e sempre que é ligada).\nAinda não testado numa placa real.']);
    } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
  } finally { await fs.writeFile(conf, saved); }
});
