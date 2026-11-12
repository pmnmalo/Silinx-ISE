// UI: an ECP5 device in the interface (#2302): the picker with its speed grades and the synthesis locked, the processes of its
// toolchain only (no Map, no Configure Target Device: Silinx does not program its boards yet; Emulate on Board, #3704), its constraints LPF
// (read, written, checked), Implement to its .bit with no warnings in the server's real flow and the Design Summary's
// reports, in English and Portuguese; the ULX3S's pins written as an LPF by Update Constraints.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const DEVICE = { family: 'ecp5', part: 'lfe5u-85f', package: 'cabga381', speed: '-6' };
const PINS = 'LOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led[0]" SITE "B2";\nLOCATE COMP "led[1]" SITE "C2";\nFREQUENCY PORT "clk" 25 MHZ;\n';

uiTest('#2302 Design Properties: an ECP5 part has its speed grades, its synthesis locked; a Spartan-3E part unlocks it', E, async (page) => {
  await makeProject(env, { name: 'Ecp5Pick', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: { 'src/blinky.v': BLINKY }, top: 'blinky' });
  await page.openProject('Ecp5Pick');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  const state = (family) => page.eval((f) => {
    const sel = (l) => [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === l).nextElementSibling;
    const fam = sel('Family:'); fam.value = f; fam.dispatchEvent(new Event('change'));
    return { part: sel('Device:').value, speeds: [...sel('Speed:').options].map((o) => o.value), synth: sel('Synthesis Tool:').value, synthOff: sel('Synthesis Tool:').disabled,
      ecp5: [...fam.options].some((o) => o.value === 'ecp5' && o.textContent === 'ECP5') };
  }, family);
  const ecp5 = await state('ecp5');
  assert.deepEqual(ecp5, { part: 'lfe5u-12f', speeds: ['-6', '-7', '-8'], synth: 'silinx', synthOff: true, ecp5: true });
  const back = await state('spartan3e');
  assert.equal(back.synthOff, false);
  await page.dialogButton('Cancel');
});

uiTest('#2302 an ECP5 project: its processes, its constraints LPF, Implement gives the .bit with no warnings, the Design Summary\'s reports; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'Ecp5Run', board: 'ulx3s', device: DEVICE, files: { 'src/blinky.v': BLINKY, 'constraints/top.lpf': PINS }, top: 'blinky', constraints: 'constraints/top.lpf', synthTool: 'silinx' });
  await page.openProject('Ecp5Run');
  const r = await page.eval(async () => {
    const { lpfDiagnostics, readPins, writePins, constraintsExt, constraintsForDevice } = await import('/js/constraints-format.js');
    const device = { part: 'lfe5u-85f' }, ports = [{ name: 'clk', width: 1 }, { name: 'led', width: 2, msb: 1, lsb: 0 }];
    const read = readPins(device, 'BLOCK RESETPATHS;\nLOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led[1]" SITE "C2";\nIOBUF PORT "led[1]" DRIVE=4;\nFREQUENCY PORT "clk" 25 MHZ;\n');
    const pj = { device, constraints: 'constraints/top.ucf' }, logged = [];
    constraintsForDevice(pj, ['constraints/top.ucf'], (l) => logged.push(l));
    return {
      ext: constraintsExt(device), assigned: read.assignments, period: read.clocks[0].period, other: read.other,
      written: writePins(device, { assignments: read.assignments, clocks: read.clocks, other: read.other, header: 'H' }),
      good: lpfDiagnostics('LOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led[0]" SITE "B2";\n', ports),
      bad: lpfDiagnostics('LOCATE COMP "clk" SITE "G2";\nUGROUP "g" BLKNAME x;\n', ports),
      unknown: lpfDiagnostics('LOCATE COMP "nope" SITE "G2";\n', ports),
      moved: pj.constraints, logged,
    };
  });
  assert.equal(r.ext, '.lpf');
  assert.deepEqual(r.assigned, { clk: { loc: 'G2' }, 'led<1>': { loc: 'C2', drive: '4' } });
  assert.equal(r.period, 40);
  assert.deepEqual(r.other, ['BLOCK RESETPATHS;']);
  assert.equal(r.written, '# H\nBLOCK RESETPATHS;\nLOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led[1]" SITE "C2";\nIOBUF PORT "led[1]" DRIVE=4;\nFREQUENCY PORT "clk" 25 MHZ;\n');
  assert.deepEqual(r.good, []);
  assert.deepEqual(r.bad, [{ severity: 'error', line: 2, message: 'UGROUP: not an LPF statement nextpnr-ecp5 applies (LOCATE, IOBUF, FREQUENCY, BLOCK, SYSCONFIG)' }]);
  assert.deepEqual(r.unknown, [{ severity: 'warning', message: 'LOCATE COMP nope: the top has no such port', line: 1 }]);
  assert.equal(r.moved, 'constraints/top.lpf');
  assert.deepEqual(r.logged, ["WARNING: this device's constraints are LPF: constraints/top.lpf is the project's now, constraints/top.ucf was not converted."]);

  // the processes: none of what the family's flow does not have
  await page.setView('impl');
  await page.treeRow('#hier', 'blinky');
  const labels = await page.eval(() => [...document.querySelectorAll('#procs .row')].map((x) => x.textContent.trim().replace(/^▾/, '')));
  assert.ok(labels.includes('Generate Programming File'), String(labels));
  for (const absent of ['Map', 'Generate Text Power Report', 'Back-annotate Pin Locations', 'Configure Target Device']) assert.ok(!labels.includes(absent), `${absent}: ${labels}`);
  // Emulate on Board (#3704): the HDL on the board's pins; its RTL model only (the flow makes no simulation model)
  for (const present of ['Emulate on Board', 'Emulate Behavioral Model (RTL)']) assert.ok(labels.includes(present), `${present}: ${labels}`);
  assert.ok(!labels.some((l) => /^Emulate Post-/.test(l)), String(labels));

  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(/Process "Generate Programming File" (completed successfully|failed)/, { timeout: 120000 }).catch(async (e) => { throw new Error(`${e.message}\n${(await page.consoleText()).slice(-2500)}`); });
  const text = await page.consoleText();
  assert.deepEqual(text.split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
  assert.match(text, /Bitstream: build\/blinky\.bit \(1927725 bytes, ecppack\)/);

  // the Design Summary: its programming file and its own reports
  await page.eval(() => window.SilinxApp.openSummary());
  const summary = async (prog, reports) => page.waitFor((p, d) => {
    const rows = (c) => { const t = [...document.querySelectorAll('.summary-table')].find((x) => x.querySelector('caption')?.textContent === c); return t ? [...t.querySelectorAll('tr')].map((tr) => [...tr.children].map((x) => x.textContent)) : null; };
    const a = rows(p), b = rows(d);
    return a && b ? { prog: a, reports: b } : null;
  }, [prog, reports], { what: 'the Design Summary' });
  const en = await summary('Programming File', 'Detailed Reports');
  assert.deepEqual(en.prog, [['Bitstream', 'build/blinky.bit (1883 KB)']]);
  assert.deepEqual(en.reports, [['Report Name', 'Status'], ['Synthesis Report (Yosys)', 'Current'], ['Routed Design (Trellis configuration)', 'Current'], ['Static Timing Report', 'Current']]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    const pt = await summary('Ficheiro de Programação', 'Relatórios Detalhados');
    assert.deepEqual(pt.reports.slice(1).map((x) => x[0]), ['Relatório de Síntese (Yosys)', 'Projeto Encaminhado (configuração Trellis)', 'Relatório de Temporização Estática']);
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});

uiTest('#2302 the ULX3S: its pins written as the project\'s constraints/top.lpf from the board', E, async (page) => {
  await makeProject(env, { name: 'Ulx3s', board: 'ulx3s', device: DEVICE, top: 'top', constraints: 'constraints/top.lpf',
    files: { 'src/top.v': 'module top(input clk, input [1:0] btn, output [2:0] led);\n  assign led = {btn, clk};\nendmodule\n' } });
  await page.openProject('Ulx3s');
  const r = await page.eval(async () => {
    const ok = await window.SilinxApp.regenerateUcf();
    const { api } = await import('/js/api.js');
    return { ok, text: await api.readFile('Ulx3s', 'constraints/top.lpf'), constraints: window.Silinx.project.constraints };
  });
  assert.equal(r.ok, true);
  assert.equal(r.constraints, 'constraints/top.lpf');
  assert.equal(r.text, "# LPF for top 'top' on Radiona ULX3S (lfe5u-85f-6-cabga381), generated by Silinx\n\nLOCATE COMP \"clk\" SITE \"G2\";\n"
    + 'LOCATE COMP "btn[0]" SITE "R1";\nIOBUF PORT "btn[0]" PULLMODE=DOWN;\nLOCATE COMP "btn[1]" SITE "T1";\nIOBUF PORT "btn[1]" PULLMODE=DOWN;\n'
    + 'LOCATE COMP "led[0]" SITE "B2";\nLOCATE COMP "led[1]" SITE "C2";\nLOCATE COMP "led[2]" SITE "C1";\nFREQUENCY PORT "clk" 25 MHZ;\n');
});
