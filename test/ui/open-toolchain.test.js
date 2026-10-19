// UI: the toolchain mode "Silinx toolchain (experimental, no ISE)": chosen in Toolchain Settings (with
// the status of the project's device; no ISE setting nor Build Device Description, #8), Generate
// Programming File of blinky for real (the device description and the bit database of the XC3S250E
// ship with Silinx: no ISE), the Processes icons and the Design Summary, the FPGA view of the routed
// design, the processes that need ISE disabled with a tooltip, the clear failure for a device the
// Silinx toolchain does not support, and the Portuguese texts.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { DB_DIR } from '../../core/fpga/bitdb-node.js';

let env;
// the server's bit database: the shipped one, plus the (empty) pads of the XC3S250E in the TQ144
// package, whose device description does not ship (the case where Silinx offers to build it)
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ui-bitdb-'));
before(async () => {
  for (const f of fs.readdirSync(DB_DIR)) fs.copyFileSync(path.join(DB_DIR, f), path.join(dbDir, f));
  fs.writeFileSync(path.join(dbDir, 'xc3s250e-tq144-pads.json'), '{"padFeatures":{}}');
  process.env.SILINX_BIT_DB_DIR = dbDir;
  env = await setupUi();
});
after(async () => { await env?.teardown?.(); delete process.env.SILINX_BIT_DB_DIR; fs.rmSync(dbDir, { recursive: true, force: true }); });
const E = () => env;

const procLabels = (page) => page.eval(() => [...document.querySelectorAll('#procs .row')].map((r) => ({ label: r.querySelector('.lbl').textContent, disabled: r.classList.contains('disabled'), title: r.title })));
// the page's toolchain after a change through the API
const reloadToolchain = (page) => page.eval(async () => { window.SilinxApp.S.toolchain = await (await import('/js/api.js')).api.toolchain(); window.SilinxApp.renderProcesses(); });
const DONE = (name) => new RegExp(`Process "${name.replace(/[()]/g, '\\$&')}" (completed successfully|failed)`);

uiTest('a new installation starts in the Silinx toolchain: Implement Design and Generate Programming File need no ISE (#27)', E, async (page) => {
  await fs.promises.rm(path.join(env.server.configDir, 'config.json'));
  const tc = await env.server.api('GET', '/api/toolchain');
  assert.equal(tc.config.mode, 'silinx');
  assert.equal(tc.ise.available, true);
  await makeProject(env, { name: 'OpenDefault', template: 'blinky' });
  await page.openProject('OpenDefault');
  await reloadToolchain(page);
  const procs = await procLabels(page);
  assert.ok(procs.some((p) => p.label === 'Synthesize - Yosys' && !p.disabled));
  for (const l of ['Implement Design', 'Generate Programming File']) assert.ok(!procs.find((x) => x.label === l).disabled, l);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

uiTest('Toolchain Settings: the open mode, the status of the project\'s device, no ISE setting; Portuguese', E, async (page) => {
  // an ISE for device descriptions set before (#8 removed it from the interface): kept on Save
  await env.server.api('PUT', '/api/toolchain', { open: { iseMode: 'ssh' } });
  await makeProject(env, { name: 'OpenSet', template: 'blinky' });
  await page.openProject('OpenSet');
  await page.menu('Tools', 'Toolchain Settings (ISE / Programmers)…');
  await page.waitDialog('Toolchain Settings');
  const modeSel = '.dlg-overlay .form-grid select';
  assert.equal(await page.eval((s) => [...document.querySelector(s).options].pop().textContent, modeSel), 'Silinx toolchain (experimental, no ISE)');
  // not in open mode: no open status
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .open-status').style.display), 'none');
  await page.eval((s) => { const m = document.querySelector(s); m.value = 'silinx'; m.dispatchEvent(new Event('change')); }, modeSel);
  const labels = await page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent));
  // the supported devices' descriptions ship with Silinx: no ISE in open mode (#8)
  assert.deepEqual(labels, ['Execution mode:', 'Programmer tool:', 'Cable:']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .dlg-buttons .btn')].map((b) => b.textContent)), ['Save', 'Cancel']);
  const status = await page.eval(() => document.querySelector('.dlg-overlay .open-status').innerText);
  assert.match(status, /Silinx toolchain for xc3s250ecp132-4: available/);
  assert.match(status, /xc3s250ecp132-4: device description \(shipped with Silinx\) and bit database/);
  assert.doesNotMatch(status, /Build Device Description|xdl -report/);
  // Portuguese: the dialog in open mode has no untranslated text (server data apart)
  await page.eval(TEXTS);
  const tc = await env.server.api('GET', '/api/toolchain?project=OpenSet');
  const data = new Set([tc.ise.help, tc.ise.reason, 'impact', 'djtgcfg', 'adepttool', 'xc3sprog', 'openFPGALoader']);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  assert.deepEqual(untranslated(en, pt, [/^\(.*\)$/, { test: (s) => data.has(s) || /^Settings file:|^Ficheiro de definições:|^\/|not found$/.test(s) }]), []);
  assert.ok(pt.includes('Toolchain Silinx para xc3s250ecp132-4: disponível'), pt.join(' | '));
  await setLang('en');
  await page.dialogButton('Save');
  await page.waitNoDialog();
  await page.waitConsole(/Toolchain settings saved \(silinx: Silinx toolchain \(experimental, no ISE\)/);
  const cfg = (await env.server.api('GET', '/api/toolchain')).config;
  assert.equal(cfg.mode, 'silinx');
  assert.equal(cfg.open.iseMode, 'ssh');
  // the Processes follow at once: Synthesize is the open synthesis, the ISE-only ones are disabled
  const procs = await procLabels(page);
  assert.ok(procs.some((p) => p.label === 'Synthesize - Yosys' && !p.disabled));
  assert.ok(!procs.some((p) => p.label === 'Synthesize - Yosys (open)' || p.label === 'Synthesize - XST'));
  for (const l of ['Generate Post-Place & Route Simulation Model']) {
    const p = procs.find((x) => x.label === l);
    assert.ok(p?.disabled, l);
    assert.equal(p.title, 'Needs Xilinx ISE: not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings)');
  }
  // (the Post-Synthesis Simulation Model: the Silinx toolchain's own since #120; Post-Translate and Post-Map since #121)
  for (const l of ['Implement Design', 'Generate Programming File', 'View Implemented Design (FPGA)', 'Back-annotate Pin Locations', 'View Technology Schematic', 'Configure Target Device', 'Generate Post-Synthesis Simulation Model',
    'Generate Post-Translate Simulation Model', 'Generate Post-Map Simulation Model', 'Generate Text Power Report']) assert.ok(!procs.find((x) => x.label === l).disabled, l);
  await setLang('pt');
  const ptProcs = await procLabels(page);
  assert.ok(ptProcs.some((p) => p.label === 'Sintetizar - Yosys'));
  assert.ok(ptProcs.some((p) => p.title === 'Requer o Xilinx ISE: não disponível com a toolchain Silinx (escolha um modo ISE nas Definições da Toolchain)'));
  await setLang('en');
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

uiTest('open mode: Generate Programming File of blinky without ISE; the Processes icons, the Design Summary, the FPGA view', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenImpl', template: 'blinky' });
  await page.openProject('OpenImpl');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Generate Programming File', { dbl: true, exact: true });
  await page.waitConsole(DONE('Generate Programming File'), { timeout: 120000 });
  const text = await page.consoleText();
  assert.match(text, /Process "Generate Programming File" completed successfully/, text.slice(-3000));
  assert.match(text, /Silinx implementation with the Silinx toolchain \(experimental, no ISE\)/);
  assert.match(text, /All signals are completely routed\./);
  assert.match(text, /Bitstream: build\/top\.bit \(\d+ bytes, every feature in the bit database\)/);
  const st = await page.eval(() => window.SilinxApp.S.status);
  for (const id of ['synth', 'translate', 'map', 'par', 'impl', 'bitgen']) assert.ok(['ok', 'warn'].includes(st[id]), `${id}: ${st[id]}`);
  // the Design Summary
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => [...document.querySelectorAll('.page')].some((p) => /Silinx toolchain, no ISE/.test(p.innerText)), [], { what: 'summary of the open run' });
  const sum = await page.eval(() => [...document.querySelectorAll('.page')].find((p) => /Silinx toolchain, no ISE/.test(p.innerText)).innerText);
  assert.match(sum, /Implementation State:\s*Programming File Generated/);
  assert.match(sum, /Device Utilization Summary \(Silinx toolchain\)/);
  assert.match(sum, /Number of occupied Slices\s+\d+\s+2448\s+\d+%/);
  assert.match(sum, /Number of bonded IOBs\s+15\s+92\s+16%/);
  assert.match(sum, /Timing \(post Place & Route, Silinx toolchain estimate\)/);
  assert.match(sum, /All constraints met/);
  assert.match(sum, /PERIOD 20 ns on clk/);
  assert.match(sum, /Bitstream\s+build\/top\.bit/);
  assert.match(sum, /Routed Design \(XDL\)\s+Current/);
  // what Program (iMPACT) uses
  const bi = await env.server.api('GET', '/api/projects/OpenImpl/bitinfo');
  assert.equal(bi.available, true);
  // View Implemented Design (FPGA): the routed design, no ISE
  await page.treeRow('#procs', 'View Implemented Design (FPGA)', { dbl: true, exact: true });
  await page.waitFor(() => window.SilinxApp.findDoc('fpgaview'), [], { what: 'FPGA view', timeout: 60000 });
  assert.equal(await page.eval(() => window.SilinxApp.S.active.title), 'FPGA (top)');
});

uiTest('open mode: a device without a bit database or without a shipped description fails clearly (no offer to build it, #8)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  const V = { 'src/top.v': 'module top(input a, output y);\n  assign y = ~a;\nendmodule\n' };
  await makeProject(env, { name: 'Open1600', template: 'empty', device: { family: 'spartan3e', part: 'xc3s1600e', package: 'fg320', speed: '-4' }, files: V, top: 'top' });
  await page.openProject('Open1600');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Implement Design', { dbl: true, exact: true });
  await page.waitConsole(DONE('Implement Design'), { timeout: 30000 });
  const text = await page.consoleText();
  // (the TQ144 is listed: this test's copy of the bit database has its (empty) pads, see above)
  assert.match(text, /ERROR: the Silinx toolchain cannot implement this design: no bit database for xc3s1600e yet \(only the XC3S100E \(CP132\), XC3S250E \(CP132, TQ144\), XC3S500E \(FG320\), XC3S1200E \(FG320\)\): use an ISE mode for this device\./);
  assert.equal(await page.eval(() => window.SilinxApp.S.status.impl), 'err');
  // the same chip in another package (its pads in this test's bit database): no description ships; no dialog
  await makeProject(env, { name: 'OpenTq', template: 'empty', device: { family: 'spartan3e', part: 'xc3s250e', package: 'tq144', speed: '-4' },
    files: V, top: 'top' });
  await page.openProject('OpenTq');
  await page.treeRow('#procs', 'Implement Design', { dbl: true, exact: true });
  await page.waitConsole(/no device description of xc3s250etq144-4 ships with Silinx/, { timeout: 30000 });
  await page.waitConsole(DONE('Implement Design'));
  assert.match(await page.consoleText(), /ERROR: the Silinx toolchain cannot implement this design: no device description of xc3s250etq144-4 ships with Silinx \(the Silinx toolchain supports the XC3S100E \(CP132\), XC3S250E \(CP132, TQ144\), XC3S500E \(FG320\), XC3S1200E \(FG320\)\): use an ISE mode for this device\./);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

// Generate Text Power Report in the Silinx toolchain (#123): its estimate, as XPower's text report
uiTest('open mode: Generate Text Power Report of blinky without ISE: the estimate in build/top.pwr, opened; its line in the console; Portuguese label', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenPower', template: 'blinky' });
  await page.openProject('OpenPower');
  await reloadToolchain(page);
  await page.click('input[name=view][value=impl]');
  assert.deepEqual((await procLabels(page)).find((p) => p.label === 'Generate Text Power Report'), { label: 'Generate Text Power Report', disabled: false, title: '' });
  await page.treeRow('#procs', 'Generate Text Power Report', { dbl: true, exact: true });
  await page.waitConsole(DONE('Generate Text Power Report'), { timeout: 120000 });
  const text = await page.consoleText();
  const run = text.slice(text.lastIndexOf('Started : "Generate Text Power Report"'));
  assert.match(run, /Process "Generate Text Power Report" completed successfully$/, run.slice(-2000));
  assert.match(run, /=== SILINX STEP xpwr ===\nEstimated power: [\d.]+ mW \(dynamic [\d.]+ mW, static [\d.]+ mW\), junction [\d.]+ C: build\/top\.pwr \(an estimate, not Xilinx XPower\)\n/);
  // no warning of the estimate (the UCF gives the clock's PERIOD)
  assert.deepEqual(run.split('\n').filter((l) => /^WARNING:Power/.test(l)), []);
  // the report opened, as ISE's XPower report is
  await page.waitFor(() => window.SilinxApp.findDoc('text:top.pwr'), [], { what: 'the power report', timeout: 30000 });
  const pwr = await page.eval(() => document.querySelector('.doc:not([hidden]) .report-text').textContent);
  assert.match(pwr, /^Silinx toolchain - estimated power \(not Xilinx XPower\)\n/);
  assert.match(pwr, /\| Supply Power \(mW\) \|/);
  assert.equal(await readWs(env, 'OpenPower', 'build/top.pwr'), pwr);
  // its process in Portuguese
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('pt'); });
  assert.ok((await procLabels(page)).some((p) => p.label === 'Gerar Relatório de Consumo (Texto)' && !p.disabled));
  await page.eval(async () => { (await import('/js/i18n.js')).setLanguage('en'); });
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
});

// Back-annotate Pin Locations in the Silinx toolchain (#118): blinky without a board, its UCF without the
// LOCs of four LEDs and a switch; the pads the placer chose are added to the UCF (after the preview);
// built again, nothing more to add
const BA_UCF = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), '../../examples/blinky/constraints/top.ucf'), 'utf8')
  .split('\n').map((l) => (/"(led<[4-7]>|sw<3>)"/.test(l) ? l.replace(/LOC = "\w+" \| /, '') : l)).join('\n');
const BA_PINS = ['NET "led<4>" LOC = "N7";', 'NET "led<5>" LOC = "H2";', 'NET "led<6>" LOC = "N5";', 'NET "led<7>" LOC = "H1";', 'NET "sw<3>" LOC = "N4";'];
uiTest('open mode: Back-annotate Pin Locations writes the pins the placer chose into the UCF; Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenPins', template: 'blinky', board: null, files: { 'constraints/top.ucf': BA_UCF } });
  await page.openProject('OpenPins');
  await reloadToolchain(page);
  await page.click('input[name=view][value=impl]');
  const proc = (await procLabels(page)).find((p) => p.label === 'Back-annotate Pin Locations');
  assert.deepEqual(proc, { label: 'Back-annotate Pin Locations', disabled: false, title: '' });
  await page.treeRow('#procs', 'Back-annotate Pin Locations', { dbl: true, exact: true });
  await page.waitDialog('Back-annotate Pin Locations', { timeout: 120000 });
  const msg = () => page.eval(() => document.querySelector('.dlg-overlay .msg-text').textContent);
  assert.equal(await msg(), `Add the 5 pin location(s) chosen by the tools to constraints/top.ucf?\n\n${BA_PINS.join('\n')}`);
  const text = await page.consoleText();
  assert.match(text, /=== SILINX STEP pin2ucf ===/);
  assert.match(text, /Pin locations of 15 port bit\(s\), 5 of them chosen by the placer \(no LOC in the constraints\): build\/top_pins\.ucf/);
  assert.deepEqual(text.split('\n').filter((l) => /warning/i.test(l)),
    ['WARNING:ConstraintSystem - "constraints/top.ucf" Line 22: 5 port bit(s) of \'top\' have no LOC: sw<3>, led<4>, led<5>, led<6>, led<7>',
      'WARNING: 5 port bit(s) have no LOC constraint (sw<3>, led<4>, led<5>, led<6>, led<7>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream',
      'Process "Back-annotate Pin Locations" completed successfully with 2 warning(s)']);
  // the constraints' warning: the process's own (after its Started line), counted with the others,
  // in the Warnings tab once; the process's icon a warning (#129)
  const run = text.slice(text.lastIndexOf('Started : "Back-annotate Pin Locations"'));
  assert.match(run, /^Started : "Back-annotate Pin Locations"\.\n+WARNING:ConstraintSystem - "constraints\/top\.ucf" Line 22: 5 port bit\(s\) of 'top' have no LOC/);
  assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 2);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(2)');
  assert.equal(await page.eval(() => window.SilinxApp.S.status.pin2ucf), 'warn');
  // Portuguese
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await page.eval(TEXTS);
  await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.dlg-overlay')));
  assert.deepEqual(untranslated(en, pt), []);
  assert.equal(await msg(), `Adicionar a constraints/top.ucf as 5 localizações de pinos escolhidas pelas ferramentas?\n\n${BA_PINS.join('\n')}`);
  await setLang('en');
  await page.dialogButton('Yes');
  await page.waitConsole(/Back-annotated 5 pin location\(s\) into constraints\/top\.ucf\./);
  const ucf = await env.server.api('GET', '/api/projects/OpenPins/file?path=constraints%2Ftop.ucf');
  assert.equal(ucf, `${BA_UCF.replace(/\s*$/, '\n')}\n# Back-annotated pin locations (Silinx toolchain, ${new Date().toISOString().slice(0, 10)})\n${BA_PINS.join('\n')}\n`);
  // again: built from the back-annotated UCF (no warning about pins), nothing more to add
  await page.treeRow('#procs', 'Back-annotate Pin Locations', { dbl: true, exact: true });
  await page.waitConsole(/every port already has a LOC in the UCF \(nothing to add\)\./, { timeout: 120000 });
  const again = (await page.consoleText()).split('Back-annotated 5 pin location(s)').pop();
  assert.match(again, /Process "Back-annotate Pin Locations" completed successfully\n/);
  assert.deepEqual(again.split('\n').filter((l) => /warning/i.test(l)), []);
  assert.equal(await page.eval(() => !!document.querySelector('.dlg-overlay')), false);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 240000 });

// the constraints' warnings found before a run (Check Constraints): the process's own, counted in its
// "completed successfully with N warning(s)", its icon a warning; a run without Translate: on
// Synthesize's icon (#129)
uiTest('open mode: Synthesize counts the constraints\' warnings printed before it runs (#129)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenUcfWarn', template: 'blinky', board: null, files: { 'constraints/top.ucf': BA_UCF } });
  await page.openProject('OpenUcfWarn');
  await reloadToolchain(page);
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Synthesize - Yosys', { dbl: true, exact: true });
  await page.waitConsole(DONE('Synthesize - Yosys'), { timeout: 120000 });
  const text = await page.consoleText();
  const run = text.slice(text.lastIndexOf('Started : "Synthesize - Yosys"'));
  assert.deepEqual(run.split('\n').filter((l) => /warning/i.test(l)),
    ['WARNING:ConstraintSystem - "constraints/top.ucf" Line 22: 5 port bit(s) of \'top\' have no LOC: sw<3>, led<4>, led<5>, led<6>, led<7>',
      'WARNING: 5 port bit(s) have no LOC constraint (sw<3>, led<4>, led<5>, led<6>, led<7>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream',
      'Process "Synthesize - Yosys" completed successfully with 2 warning(s)']);
  assert.equal(text.split('\n').filter((l) => /warning/i.test(l)).length, 3, 'printed once');
  assert.equal(await page.eval(() => window.SilinxApp.S.status.synth), 'warn');
  assert.equal(await page.eval(() => document.querySelectorAll('#console-warnings .diag').length), 2);
  assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '(2)');
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 180000 });

// View Technology Schematic in the Silinx toolchain (#119): the netlist of its synthesis (Synthesize runs
// first), drawn by Silinx's schematic engine: blocks by instance, primitives inside, a LUT's function;
// the names as the netlist writes them, like ISE's (IBUF, LUT4, dbL; #131)
const TECH = '.doc:not([hidden])';
const techView = (page) => page.eval(() => {
  const ed = window.Silinx.active?.viewer;
  return ed ? { id: window.Silinx.active.id, title: window.Silinx.active.title, crumbs: document.querySelector('.doc:not([hidden]) .rtl-crumbs').innerText.replace(/\s+/g, ' '),
    syms: ed.getDoc().symbols.map((x) => ({ id: x.id, type: x.type, name: x.name, module: x.params?.module || null, generics: x.params?.generics || null })) } : null;
});
// the Technology Schematic of `top` open (Synthesize runs first: seconds, minutes on a slow machine);
// a timeout says what the app was doing (#238): its dialogs, the process running, the console's end
async function waitTech(page, top) {
  try {
    await page.waitFor((t) => window.Silinx.active?.id === `tech:${t}` && window.Silinx.active.viewer?.getDoc().symbols.length > 10, [top], { what: 'technology schematic', timeout: 180000 });
  } catch (e) {
    const st = await page.eval(() => {
      const S = window.SilinxApp.S;
      return { active: S.active?.id || null, busy: !!S.busy, job: S.currentJob || null, status: S.status, top: S.project?.top, selected: S.sel || null,
        dialogs: [...document.querySelectorAll('.dlg-overlay')].map((d) => d.innerText.replace(/\s+/g, ' ').slice(0, 300)), statusBar: document.getElementById('status-text')?.textContent || null };
    }).catch((x) => `(${x.message})`);
    throw new Error(`${e.message}\n--- the app: ${JSON.stringify(st)}\n--- console:\n${(await page.consoleText().catch(() => '')).split('\n').slice(-25).join('\n')}`);
  }
}
// push into the instance `inside` (its block, symbol `id`, double-clicked): the crumbs say it once its drawing
// is shown, not before (#346: a click meanwhile went to the drawing left, its properties then replaced)
async function pushInto(page, id, inside) {
  await page.eval(() => {
    const bar = document.querySelector('.doc:not([hidden]) .rtl-crumbs'), ed = window.Silinx.active.viewer;
    window.__crumbs = [];
    window.__crumbsObs?.disconnect();
    window.__crumbsObs = new MutationObserver(() => window.__crumbs.push({ crumb: bar.querySelector('b')?.textContent ?? null, modules: ed.getDoc().symbols.map((x) => x.params?.module) }));
    window.__crumbsObs.observe(bar, { childList: true, subtree: true, characterData: true });
  });
  await page.dblclick(`.doc:not([hidden]) .se-svg [data-kind=sym][data-id="${id}"]`);
  await page.waitFor((b) => document.querySelector('.doc:not([hidden]) .rtl-crumbs b')?.textContent === `${b} : ${b}`, [inside], { what: `inside ${inside}`, timeout: 60000 });
  const seen = await page.eval(() => { window.__crumbsObs.disconnect(); return window.__crumbs; });
  // every change of the crumbs: the drawing then shown is the instance's (no block of that name in it, its primitives)
  assert.ok(seen.length > 0);
  for (const c of seen) assert.ok(c.crumb !== `${inside} : ${inside}` || (!c.modules.includes(inside) && c.modules.length > 5), `the crumbs say ${c.crumb} over the drawing of ${c.modules.join(' ')}`);
}
async function checkTechSchematic(page, { top, blocks, message, inside }) {
  await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
  await waitTech(page, top);
  const log = await page.consoleText();
  assert.match(log, /Process "Synthesize - Yosys" completed successfully/);
  assert.ok(log.includes(message), log.slice(-1500));
  let v = await techView(page);
  assert.equal(v.title, `${top} (Technology)`);
  assert.ok(v.crumbs.includes(`Technology Schematic (read-only): the post-synthesis netlist — ${top} : ${top}`), v.crumbs);
  assert.equal(await page.eval(() => window.Silinx.status.tech), 'ok');
  const onTop = v;
  const mods = new Set(v.syms.map((x) => x.module));
  for (const m of ['IBUF', 'OBUF', 'BUFG', ...blocks]) assert.ok(mods.has(m), `${m} on the top level: ${[...mods].join(' ')}`);
  // the instances by their names (block of an instance: the instance's name and module)
  for (const b of blocks) assert.ok(v.syms.some((x) => x.name === b && x.module === b), `instance ${b}: ${v.syms.map((x) => x.name).join(' ')}`);
  // push into an instance: its LUTs, flip-flops, carry chain
  const blk = v.syms.find((x) => x.module === inside);
  await pushInto(page, blk.id, inside);
  v = await techView(page);
  const types = new Set(v.syms.map((x) => x.module));
  for (const t of ['FDRE', 'MUXCY', 'XORCY']) assert.ok(types.has(t), `${t} in ${inside}: ${[...types].join(' ')}`);
  // a LUT: its function from its INIT, on demand (a collapsed section of its properties)
  const lut = v.syms.find((x) => x.module === 'LUT4');
  assert.match(lut.name, /^LUT4_\d+$/);
  await page.click(`${TECH} .se-svg [data-kind=sym][data-id="${lut.id}"]`);
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-lutfn'), [], { what: 'LUT function' });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-lutfn').open), false);
  await page.click(`${TECH} .se-lutfn > summary`);
  const fn = await page.eval(async (init) => (await import('/core/fpga/techview.js')).lutFunction(init, 4), lut.generics.INIT);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .se-lut-eq').textContent), fn.equation);
  assert.match(fn.equation, /^O = /);
  assert.equal(await page.eval(() => document.querySelectorAll('.doc:not([hidden]) .se-lut-tt tr').length), 17);
  return { top: onTop, inside: v };
}

uiTest('open mode: View Technology Schematic of blinky and pong without ISE: the Silinx toolchain\'s netlist by instance, a LUT\'s function; Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenTech', template: 'blinky' });
  await page.openProject('OpenTech');
  await reloadToolchain(page);
  await page.click('input[name=view][value=impl]');
  assert.deepEqual((await procLabels(page)).find((p) => p.label === 'View Technology Schematic'), { label: 'View Technology Schematic', disabled: false, title: '' });
  await checkTechSchematic(page, { top: 'top', blocks: ['u_pre', 'u_speed', 'u_knight'], inside: 'u_pre',
    message: "Technology Schematic of 'top': the netlist of the Silinx toolchain's synthesis (build/open/top.json), 353 cells in 3 block(s): u_knight (50), u_speed (203), u_pre (68)." });
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /warning|error/i.test(l)), []);
  // Portuguese: the view's bar, its tab and the LUT's function have no untranslated text (the netlist's names apart)
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const texts = () => page.eval(() => ['.doc:not([hidden]) .rtl-crumbs', '.doc:not([hidden]) .se-lutfn', '#doc-tabs .tab.active'].flatMap((q) => (document.querySelector(q) ? window.__uiTexts(document.querySelector(q)) : [])));
  await setLang('en'); const en = await texts();
  await setLang('pt'); const pt = await texts();
  assert.deepEqual(untranslated(en, pt, [/^\w+ : \w+$/, /^\w+$/]), []);
  assert.ok(pt.includes('Esquemático Tecnológico (só de leitura): a netlist pós-síntese'), pt.join(' | '));
  assert.ok(pt.includes('Função do LUT (INIT)'), pt.join(' | '));
  await setLang('en');
  // pong: the instances of the design, and the logic of its top module by signal (blocks *_logic)
  await makeProject(env, { name: 'OpenTechPong', template: 'pong' });
  await page.openProject('OpenTechPong');
  await page.click('input[name=view][value=impl]');
  const pong = await checkTechSchematic(page, { top: 'pong', blocks: ['display', 'dbL', 'dbR', 'db1', 'db2', 'timer_logic'], inside: 'dbL',
    message: "Technology Schematic of 'pong': the netlist of the Silinx toolchain's synthesis (build/open/pong.json), 1012 cells in 21 block(s): " });
  // the cells and nets as the netlist writes them (#131): pong's lockL and pressL (Verilog names), not lockl, pressl
  assert.ok(pong.top.syms.some((x) => x.name === 'lockL_logic' && x.module === 'lockL_logic'), pong.top.syms.map((x) => x.name).join(' '));
  // (with Yosys 0.70 pressL's flip-flop is in its block pressL_logic, not a cell pressL_FDRE of the top module)
  assert.ok(pong.top.syms.some((x) => x.name === 'pressL_logic' && x.module === 'pressL_logic'), pong.top.syms.map((x) => x.name).join(' '));
  assert.deepEqual(pong.top.syms.filter((x) => /^(ibuf|obuf|bufg|fdre|lut\d)$/.test(x.module || '')), [], 'the primitives in upper case');
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 400000 });

// The read-only schematic views in Portuguese (#130): the RTL and Technology Schematics' bar, symbol
// palette (hidden in these views: its category options and symbol tooltips), the properties of one
// object of each kind (nothing selected, every symbol type, an I/O marker, a wire, a net name), all
// objects selected, the status bar and the Check panel: no English text left (names apart)
async function viewerTexts(page) {
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const both = async () => {
    await setLang('en'); const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
    await setLang('pt'); const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
    await setLang('en');
    return { en, pt };
  };
  // where to click one object of each kind (a wire: the middle of its line)
  const targets = await page.eval(() => {
    const d = window.Silinx.active.viewer.getDoc();
    const out = [], seen = new Set();
    for (const g of document.querySelectorAll('.doc:not([hidden]) .se-svg [data-kind]')) {
      const kind = g.dataset.kind === 'sym' ? `sym:${d.symbols.find((s) => s.id === g.dataset.id)?.type}` : g.dataset.kind;
      if (seen.has(kind)) continue;
      const pl = g.querySelector('polyline');
      let x, y;
      if (pl) { const q = pl.getPointAtLength(pl.getTotalLength() / 2), m = pl.getScreenCTM(); x = q.x * m.a + q.y * m.c + m.e; y = q.x * m.b + q.y * m.d + m.f; } else { const b = g.getBoundingClientRect(); x = b.left + b.width / 2; y = b.top + b.height / 2; }
      if (document.elementFromPoint(x, y)?.closest('[data-kind]') !== g) continue;
      seen.add(kind); out.push({ kind, x, y });
    }
    return out;
  });
  const runs = [await both()];
  const kinds = [];
  for (const t of targets) {
    await page.click({ x: t.x, y: t.y });
    kinds.push(t.kind);
    runs.push(await both());
  }
  // all objects selected (Ctrl+A)
  await page.click('.doc:not([hidden]) .se-toolbar [data-act=fit]');
  await page.key('a', { modifiers: 2 });
  await page.waitFor(() => / objects selected$/.test(document.querySelector('.doc:not([hidden]) .se-ptitle')?.textContent || ''), [], { what: 'all selected' });
  runs.push(await both());
  // the Check panel
  await page.click('.doc:not([hidden]) .se-toolbar [data-act=check]');
  await page.waitFor(() => !document.querySelector('.doc:not([hidden]) .se-diags').hidden, [], { what: 'Check panel' });
  runs.push(await both());
  return { kinds, untranslated: [...new Set(runs.flatMap((r) => untranslated(r.en, r.pt, [/^\w+ : \w+$/, /^Flip-Flops$/, /^@Buffer$/])))], pt: new Set(runs.flatMap((r) => r.pt)), en: new Set(runs.flatMap((r) => r.en)) };
}

uiTest('RTL and Technology Schematic in Portuguese: the palette, its tooltips, the properties, the status bar are translated (#130)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'ViewPt', template: 'blinky' });
  await page.openProject('ViewPt');
  await reloadToolchain(page);
  await page.eval(TEXTS);
  // RTL Schematic of blinky's top
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'View RTL Schematic', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'rtl:top' && document.querySelectorAll('.doc:not([hidden]) .se-svg [data-kind=sym]').length >= 5, [], { what: 'RTL schematic' });
  const rtl = await viewerTexts(page);
  assert.deepEqual(rtl.kinds, ['wire', 'sym:module', 'sym:slice', 'sym:and2b1', 'sym:hdlblock', 'port', 'label']);
  assert.deepEqual(rtl.untranslated, []);
  for (const s of ['Propriedades', '<--Todos os Símbolos-->', '@Inversor', '@Porta AND de 2, 3 ou 4 entradas, as entradas e as entradas invertidas nas suas propriedades (bit a bit quando Largura > 1)', 'Abrir top.vhd', 'Fio · rede clk', "Rede 'clk', 1 bit",
    'Módulo prescaler', 'Parâmetros', 'vazio = valor por omissão do módulo', 'Pinos (3)', 'Índice do MSB', 'Marcador de E/S', 'Bidirecional', 'Nome de Rede',
    'um por linha: nome[largura] (acrescente "clock" para um pino de relógio)', 'nome[largura]', 'Verificar Esquemático: 0 erro(s), 0 aviso(s)', 'Nenhum erro ou aviso encontrado.'])
    assert.ok(rtl.pt.has(s), `${s}: ${[...rtl.pt].join(' | ')}`);
  // texts starting with a number (which the language check takes for numbers) are translated too
  assert.ok([...rtl.pt].some((s) => /^\d+ objetos selecionados$/.test(s)), [...rtl.pt].join(' | '));
  assert.ok([...rtl.pt].some((s) => /^\d+ símbolos, \d+ redes · 0 erro\(s\), 0 aviso\(s\)$/.test(s)), [...rtl.pt].join(' | '));
  // Technology Schematic of the same design (the Silinx toolchain's synthesis)
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'View Technology Schematic', { dbl: true, exact: true });
  await waitTech(page, 'top');
  const tech = await viewerTexts(page);
  assert.deepEqual(tech.kinds, ['wire', 'sym:module', 'sym:constant', 'sym:slice', 'sym:busjoin', 'port', 'label']);
  assert.deepEqual(tech.untranslated, []);
  for (const s of ['Propriedades', 'Esquemático Tecnológico (só de leitura): a netlist pós-síntese', 'Módulo LUT2', 'Pinos (3)', 'Larguras das entradas (MSB primeiro)', 'Função do LUT (INIT)'])
    assert.ok(tech.pt.has(s), `${s}: ${[...tech.pt].join(' | ')}`);
  assert.deepEqual((await page.consoleText()).split('\n').filter((l) => /warning|error/i.test(l)), []);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 300000 });

uiTest('open mode: Generate Post-Synthesis Simulation Model of blinky, then Simulate Post-Synthesis Model: the test bench passes on the netlist (#120)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenPostSyn', template: 'blinky' });
  await page.openProject('OpenPostSyn');
  await reloadToolchain(page);
  await page.treeRow('#procs', 'Generate Post-Synthesis Simulation Model', { dbl: true, exact: true });
  await page.waitConsole(DONE('Generate Post-Synthesis Simulation Model'), { timeout: 180000 });
  // (the model's line comes after the process's end: once the reports are read)
  await page.waitConsole(/Post-Synthesis simulation model: /, { timeout: 30000 });
  const text = await page.consoleText();
  assert.match(text, /Process "Generate Post-Synthesis Simulation Model" completed successfully/, text.slice(-3000));
  assert.match(text, /Synthesizing 'top' with the generics the test bench 'tb_top' gives: div = 2, debounce = 2/);
  assert.match(text, /Post-Synthesis simulation model: build\/netgen\/synthesis\/top_synthesis\.vhd \(simulate it in the Simulation view, or emulate it on the board\)\./);
  // the Simulation view: Simulate Post-Synthesis Model of the test bench
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Post-Synthesis Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 60000, what: 'ISim ready' });
  // (longer than ISim's first run: run all; typed again if no run started, as in Open Example (traffic))
  for (let k = 0; ; k++) {
    await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
    await page.key('Enter');
    try { await page.waitFor(() => window.Silinx.active.view.state.running || /Simulation finished OK/.test(document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''), [], { what: 'run all started', timeout: 5000 }); break; } catch (e) { if (k >= 3) throw e; }
  }
  const out = await page.waitFor(() => { const t = document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''; return window.Silinx.active?.id === 'isim' && /Simulation finished OK|ERROR/.test(t) ? t : null; }, [], { timeout: 120000, what: 'the simulation of the model' })
    .catch(async (e) => { throw new Error(`${e.message}\n--- ISim: ${JSON.stringify(await page.eval(() => ({ running: window.Silinx.active?.view?.state?.running, time: document.querySelector('.isim-st-time')?.textContent, console: (document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || '').split('\n').slice(-12) })))}`); });
  assert.match(out, /Simulation finished OK/);
  assert.doesNotMatch(out, /ERROR/);
  assert.match(await page.consoleText(), /with the post-synthesis netlist of 'top'/);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 300000 });

// #121: the Post-Translate and Post-Map Simulation Models in the Silinx toolchain: the processes enabled (in
// Portuguese too), each generates its model (the console's lines, no warning), and the test bench passes on the
// post-map netlist (Simulate Post-Map Model); Simulate Post-Translate Model offers to generate its model
uiTest('#121 open mode: Generate Post-Translate / Post-Map Simulation Model of blinky, then Simulate Post-Map Model: the test bench passes on the packed design', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenPostMap', template: 'blinky' });
  await page.openProject('OpenPostMap');
  await reloadToolchain(page);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  // the processes, enabled, in both languages
  const enabled = async (labels) => { const procs = await procLabels(page); for (const l of labels) { const p = procs.find((x) => x.label === l); assert.ok(p && !p.disabled && !p.title, `${l}: ${JSON.stringify(p)}`); } };
  await enabled(['Generate Post-Translate Simulation Model', 'Generate Post-Map Simulation Model']);
  await setLang('pt');
  await enabled(['Gerar Modelo de Simulação Pós-Translate', 'Gerar Modelo de Simulação Pós-Map']);
  await setLang('en');
  const before = (await page.consoleText()).length;
  await page.treeRow('#procs', 'Generate Post-Translate Simulation Model', { dbl: true, exact: true });
  await page.waitConsole(DONE('Generate Post-Translate Simulation Model'), { timeout: 180000 });
  await page.waitConsole(/Post-Translate simulation model: /, { timeout: 30000 });
  await page.treeRow('#procs', 'Generate Post-Map Simulation Model', { dbl: true, exact: true });
  await page.waitConsole(/Process "Generate Post-Map Simulation Model" (completed successfully|failed)/, { timeout: 180000 });
  await page.waitConsole(/Post-Map simulation model: /, { timeout: 30000 });
  const text = (await page.consoleText()).slice(before);
  assert.match(text, /Process "Generate Post-Translate Simulation Model" completed successfully/, text.slice(-3000));
  assert.match(text, /Process "Generate Post-Map Simulation Model" completed successfully/, text.slice(-3000));
  assert.match(text, /^Post-Translate Simulation Model: build\/netgen\/translate\/top_translate\.vhd \(VHDL, SIMPRIM primitives\) and build\/netgen\/translate\/top_translate\.v \(Verilog\), \d+ primitives$/m);
  assert.match(text, /^Post-Map Simulation Model: build\/netgen\/map\/top_map\.vhd \(VHDL, SIMPRIM primitives\) and build\/netgen\/map\/top_map\.v \(Verilog\), \d+ primitives$/m);
  assert.match(text, /Post-Map simulation model: build\/netgen\/map\/top_map\.vhd \(simulate it in the Simulation view, or emulate it on the board\)\./);
  assert.deepEqual(text.split('\n').filter((l) => /WARNING|ERROR/.test(l)), []);
  // the Simulation view: Simulate Post-Map Model of the test bench
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Post-Map Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 60000, what: 'ISim ready' });
  for (let k = 0; ; k++) {
    await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
    await page.key('Enter');
    try { await page.waitFor(() => window.Silinx.active.view.state.running || /Simulation finished OK/.test(document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''), [], { what: 'run all started', timeout: 5000 }); break; } catch (e) { if (k >= 3) throw e; }
  }
  const out = await page.waitFor(() => { const t = document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''; return window.Silinx.active?.id === 'isim' && /Simulation finished OK|ERROR/.test(t) ? t : null; }, [], { timeout: 120000, what: 'the simulation of the model' });
  assert.match(out, /Simulation finished OK/);
  assert.doesNotMatch(out, /ERROR/);
  assert.equal(await page.eval(() => window.Silinx.active.title), 'ISim (tb_top, Post-Map)');
  assert.match(await page.consoleText(), /with the post-map netlist of 'top'/);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 420000 });

// #490: Simulate Post-Synthesis Model with no model yet: a dialog offers to generate it ("Generate and
// Simulate"); Cancel (or Escape) runs nothing; in Portuguese; Enter generates it and the simulation starts
const modelDialog = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return { title: d.querySelector('.dlg-title span').textContent, text: [...d.querySelectorAll('.msg-text > div')].map((x) => x.textContent), buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent) };
});
uiTest('#490 open mode: Simulate Post-Synthesis Model with no model offers "Generate and Simulate": Cancel runs nothing, the button generates it and the simulation starts', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'GenAndSim', template: 'blinky' });
  await page.openProject('GenAndSim');
  await reloadToolchain(page);
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  const ask = async () => {
    await page.treeRow('#procs', 'Simulate Post-Synthesis Model', { dbl: true, exact: true });
    await page.waitDialog('Simulate Post-Synthesis Model');
    return modelDialog(page);
  };
  const before = await page.consoleText();
  assert.deepEqual(await ask(), { title: 'Simulate Post-Synthesis Model', buttons: ['Generate and Simulate', 'Cancel'], text: [
    "There is no post-synthesis simulation model of 'top' yet.",
    'Generate it now with "Generate Post-Synthesis Simulation Model"? When it ends without errors, the simulation starts.'] });
  // Cancel, then Escape: nothing runs (no process, no ISim)
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  await ask();
  await page.key('Escape');
  await page.waitNoDialog();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('isim') || !!window.SilinxApp.S.busy), false);
  const after = (await page.consoleText()).slice(before.length);
  assert.doesNotMatch(after, /Started : "(?!(Behavioral )?Check Syntax")|Generate Post-Synthesis|WARNING|ERROR/, after);
  // in Portuguese
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('pt');
  await page.treeRow('#procs', 'Simular Modelo Pós-Síntese', { dbl: true, exact: true });
  await page.waitDialog('Simular Modelo Pós-Síntese');
  assert.deepEqual(await modelDialog(page), { title: 'Simular Modelo Pós-Síntese', buttons: ['Gerar e Simular', 'Cancelar'], text: [
    "Ainda não há modelo de simulação pós-síntese de 'top'.",
    'Gerá-lo agora com "Gerar Modelo de Simulação Pós-Síntese"? Quando terminar sem erros, a simulação começa.'] });
  await page.dialogButton('Cancelar');
  await page.waitNoDialog();
  await setLang('en');
  // Enter: the primary button, Generate and Simulate: the model is generated, then the simulation starts
  const start = (await page.consoleText()).length;
  await ask();
  await page.key('Enter');
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 180000, what: 'ISim ready' });
  const log = (await page.consoleText()).slice(start);
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  // the process ran once, ended without errors, then the simulation of the model started
  const at = (re) => { const i = lines.findIndex((l) => re.test(l)); assert.ok(i >= 0, `${re}\n${log.slice(-3000)}`); return i; };
  const order = [/^Started : "Generate Post-Synthesis Simulation Model"\.$/, /^Process "Generate Post-Synthesis Simulation Model" completed successfully$/,
    /^Post-Synthesis simulation model: build\/netgen\/synthesis\/top_synthesis\.vhd \(simulate it in the Simulation view, or emulate it on the board\)\.$/,
    /^Started : "Simulate Post-Synthesis Model"\.$/, /^Building simulation model for top 'tb_top' with the post-synthesis netlist of 'top'\.\.\.$/].map(at);
  assert.deepEqual([...order].sort((a, b) => a - b), order, log);
  assert.equal(lines.filter((l) => /^Started : "Generate Post-Synthesis Simulation Model"/.test(l)).length, 1);
  // no warning (the netlist's library cells are not the model's: #493)
  assert.deepEqual(lines.filter((l) => /^(WARNING|ERROR)/i.test(l)), []);
  assert.equal(await page.eval(() => window.Silinx.active.title), 'ISim (tb_top, Post-Synthesis)');
  // the test bench passes on the generated netlist
  for (let k = 0; ; k++) {
    await page.fill('.doc:not([hidden]) .isim-cmdline input', 'run all');
    await page.key('Enter');
    try { await page.waitFor(() => window.Silinx.active.view.state.running || /Simulation finished OK/.test(document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''), [], { what: 'run all started', timeout: 5000 }); break; } catch (e) { if (k >= 3) throw e; }
  }
  const out = await page.waitFor(() => { const t = document.querySelector('.doc:not([hidden]) .isim-console')?.innerText || ''; return /Simulation finished OK|ERROR/.test(t) ? t : null; }, [], { timeout: 120000, what: 'the simulation of the model' });
  assert.match(out, /Simulation finished OK/);
  assert.doesNotMatch(out, /ERROR/);
  // the model now exists: no dialog the next time
  await page.treeRow('#procs', 'Simulate Post-Synthesis Model', { dbl: true, exact: true });
  await page.waitConsole(/Started : "Simulate Post-Synthesis Model"\.[\s\S]*Started : "Simulate Post-Synthesis Model"\./, { timeout: 30000 });
  assert.equal(await page.dialogCount(), 0);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 300000 });

uiTest('#490 open mode: Emulate Post-Synthesis Model with no model: "Generate and Emulate" (pressed twice) generates it once and the emulator opens on it', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'GenAndEmu', template: 'blinky' });
  await page.openProject('GenAndEmu');
  await reloadToolchain(page);
  const start = (await page.consoleText()).length;
  await page.treeRow('#procs', 'Emulate Post-Synthesis Model', { dbl: true, exact: true });
  await page.waitDialog('Emulate Post-Synthesis Model');
  assert.deepEqual(await modelDialog(page), { title: 'Emulate Post-Synthesis Model', buttons: ['Generate and Emulate', 'Cancel'], text: [
    "There is no post-synthesis simulation model of 'top' yet.",
    'Generate it now with "Generate Post-Synthesis Simulation Model"? When it ends without errors, the emulator opens.'] });
  // a double press: one run
  await page.eval(() => { const b = document.querySelector('.dlg-overlay .dlg-buttons .btn.primary'); b.click(); b.click(); });
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { timeout: 180000, what: 'the emulator' });
  assert.equal(await page.eval(() => window.Silinx.active.title), 'Board Emulator (top, Post-Synthesis)');
  const lines = (await page.consoleText()).slice(start).split('\n').map((l) => l.trim()).filter(Boolean);
  assert.equal(lines.filter((l) => /^Started : "Generate Post-Synthesis Simulation Model"/.test(l)).length, 1, lines.join('\n'));
  assert.ok(lines.includes('Process "Generate Post-Synthesis Simulation Model" completed successfully'), lines.join('\n'));
  assert.ok(lines.some((l) => /^Board Emulator: 'top' \(Post-Synthesis netlist, /.test(l)), lines.join('\n'));
  assert.deepEqual(lines.filter((l) => /^(WARNING|ERROR)/i.test(l)), []);
  // the emulator's model menu knows the model just generated (not "(not generated)")
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-bar select option')].filter((o) => o.value === 'postsynth').map((o) => o.textContent)), ['Post-Synthesis netlist']);
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
}, { timeout: 300000 });

uiTest('#490 a model that needs ISE: the dialog says why, without the button (Silinx toolchain: Post-Place & Route; ISE not available: Post-Synthesis)', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'NeedsIse', template: 'blinky' });
  await page.openProject('NeedsIse');
  await reloadToolchain(page);
  const before = (await page.consoleText()).length;
  const check = async (proc, title, text, button = 'OK') => {
    await page.treeRow('#procs', proc, { dbl: true, exact: true });
    await page.waitDialog(title);
    assert.deepEqual(await modelDialog(page), { title, buttons: [button], text });
    await page.key('Enter');
    await page.waitNoDialog();
  };
  await check('Emulate Post-Place & Route Model', 'Emulate Post-Place & Route Model', ["There is no post-place & route simulation model of 'top' yet.",
    '"Generate Post-Place & Route Simulation Model" needs the Xilinx ISE toolchain: it is not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings).']);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('pt');
  await check('Emular Modelo Pós-Place & Route', 'Emular Modelo Pós-Place & Route', ["Ainda não há modelo de simulação pós-place & route de 'top'.",
    '"Gerar Modelo de Simulação Pós-Place & Route" requer a toolchain Xilinx ISE: não está disponível com a toolchain Silinx (escolha um modo ISE nas Definições da Toolchain).']);
  await setLang('en');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await check('Simulate Post-Place & Route Model', 'Simulate Post-Place & Route Model', ["There is no post-place & route simulation model of 'top' yet.",
    '"Generate Post-Place & Route Simulation Model" needs the Xilinx ISE toolchain: it is not available with the Silinx toolchain (choose an ISE mode in Toolchain Settings).']);
  // an ISE mode with no ISE: even the Post-Synthesis model cannot be generated
  await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
  await reloadToolchain(page);
  assert.equal((await env.server.api('GET', '/api/toolchain')).ise.available, false);
  await check('Simulate Post-Synthesis Model', 'Simulate Post-Synthesis Model', ["There is no post-synthesis simulation model of 'top' yet.",
    '"Generate Post-Synthesis Simulation Model" needs the Xilinx ISE toolchain, which is not available (configure it in Tools ▸ Toolchain Settings).']);
  await setLang('pt');
  await check('Simular Modelo Pós-Síntese', 'Simular Modelo Pós-Síntese', ["Ainda não há modelo de simulação pós-síntese de 'top'.",
    '"Gerar Modelo de Simulação Pós-Síntese" requer a toolchain Xilinx ISE, que não está disponível (configure-a em Ferramentas ▸ Definições da Toolchain).']);
  await setLang('en');
  // nothing ran
  const log = (await page.consoleText()).slice(before);
  assert.doesNotMatch(log, /Started : "(?!(Behavioral )?Check Syntax")|WARNING|ERROR/, log);
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('isim') || !!window.SilinxApp.findDoc('emulator')), false);
}, { timeout: 120000 });

// #280: Implement Design does not synthesize again while the synthesis is up to date (the design sources,
// the top, the device the same): a change of the pins only starts at Translate, from the saved netlist, the
// Design Summary still says what the synthesis made; reopened, the same; a change of an HDL file, the
// synthesis runs; Synthesize itself always runs
uiTest('#280 open mode: Generate Programming File after a change of the pins only does not synthesize again; after a change of the HDL it does', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenAgain', template: 'blinky' });
  await page.openProject('OpenAgain');
  await reloadToolchain(page);
  // a process run: its part of the console (from where the console was before); a timeout says what the app was doing
  const run = async (proc) => {
    const before = (await page.consoleText()).length;
    await page.treeRow('#procs', proc, { dbl: true, exact: true });
    await page.waitFor((b, re) => new RegExp(re).test(document.getElementById('console-log').innerText.slice(b)), [before, DONE(proc).source], { what: proc, timeout: 120000 }).catch(async (e) => {
      const st = await page.eval(() => { const S = window.SilinxApp.S; return { busy: !!S.busy, job: S.currentJob || null, status: S.status, sel: S.sel, dialogs: [...document.querySelectorAll('.dlg-overlay')].map((d) => d.innerText.slice(0, 300)) }; });
      throw new Error(`${e.message}\n--- the app: ${JSON.stringify(st)}\n--- console:\n${(await page.consoleText()).split('\n').slice(-30).join('\n')}`);
    });
    return (await page.consoleText()).slice(before);
  };
  const file = (p) => env.server.api('GET', `/api/projects/OpenAgain/file?path=${encodeURIComponent(p)}`);
  const synthRuns = (log) => /=== SILINX STEP synth ===|Writing <top> as one flat module for Yosys/.test(log);
  const UPTODATE = 'Process "Synthesize - Yosys" is up to date: its netlist build/open/top.json is used.';
  let log = await run('Generate Programming File');
  assert.match(log, /Process "Generate Programming File" completed successfully/, log.slice(-3000));
  assert.ok(synthRuns(log), 'the first run synthesizes');
  const synth1 = (await env.server.api('GET', '/api/projects/OpenAgain/reports')).synthesis;
  assert.ok(synth1?.utilization?.length, JSON.stringify(synth1));
  // the pins of two LEDs swapped: from Translate on
  const ucf = await file('constraints/top.ucf');
  assert.match(ucf, /NET "led<7>" LOC = "G1"/);
  await env.server.api('PUT', `/api/projects/OpenAgain/file?path=${encodeURIComponent('constraints/top.ucf')}`, ucf.replace('"P4"', '"XX"').replace('"G1"', '"P4"').replace('"XX"', '"G1"'));
  log = await run('Generate Programming File');
  assert.match(log, /Process "Generate Programming File" completed successfully/, log.slice(-3000));
  assert.ok(!synthRuns(log), log.slice(0, 3000));
  assert.ok(log.includes(UPTODATE), log.slice(0, 3000));
  const st = await page.eval(() => window.SilinxApp.S.status);
  for (const id of ['synth', 'translate', 'map', 'par', 'impl', 'bitgen']) assert.ok(['ok', 'warn'].includes(st[id]), `${id}: ${st[id]}`);
  assert.deepEqual((await env.server.api('GET', '/api/projects/OpenAgain/reports')).synthesis, synth1);
  // reopened: still up to date, the processes' status restored once the project is open (#346: restored
  // after it, the Processes panel was drawn again under the double-click on Implement Design, which never started)
  const reopened = await page.eval(async () => { await window.SilinxApp.openProject('OpenAgain'); const S = window.SilinxApp.S; return { synthDone: S.synthDone, status: { ...S.status } }; });
  assert.ok(reopened.synthDone?.fingerprint, JSON.stringify(reopened));
  for (const id of ['synth', 'translate', 'map', 'par', 'impl', 'bitgen']) assert.ok(['ok', 'warn'].includes(reopened.status[id]), `${id}: ${JSON.stringify(reopened.status)}`);
  log = await run('Implement Design');
  assert.ok(!synthRuns(log) && log.includes(UPTODATE), log.slice(0, 3000));
  // Synthesize itself runs it
  log = await run('Synthesize - Yosys');
  assert.ok(synthRuns(log), log.slice(0, 3000));
  // an HDL file changed (a comment): the synthesis runs
  const v = await file('src/counter.v');
  await env.server.api('PUT', `/api/projects/OpenAgain/file?path=${encodeURIComponent('src/counter.v')}`, `${v}// changed\n`);
  log = await run('Implement Design');
  assert.ok(synthRuns(log) && !log.includes(UPTODATE), log.slice(0, 3000));
  assert.match(log, /Process "Implement Design" completed successfully/);
}, { timeout: 300000 });

// #282: the synthesis's Optimization Effort with the Silinx toolchain: Normal (the default) synthesizes once,
// High also tries the mappings for speed; Process Properties says so, in English and in Portuguese
uiTest('#282 open mode: Optimization Effort Normal (the default) synthesizes once, High tries the mappings for speed; Process Properties says so; Portuguese', E, async (page) => {
  await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
  await makeProject(env, { name: 'OpenEffort', template: 'blinky' });
  await page.openProject('OpenEffort');
  await reloadToolchain(page);
  const run = async (proc) => {
    const before = (await page.consoleText()).length;
    await page.treeRow('#procs', proc, { dbl: true, exact: true });
    await page.waitFor((b, re) => new RegExp(re).test(document.getElementById('console-log').innerText.slice(b)), [before, DONE(proc).source], { what: proc, timeout: 120000 });
    return (await page.consoleText()).slice(before);
  };
  const NORMAL = 'Optimization Effort Normal: one mapping, and the mappings for speed for a design limited by its logic depth (High tries them for every design, a slower synthesis).';
  const HIGH = 'Optimization Effort High: the mappings for speed tried too, the fastest kept.';
  let log = await run('Synthesize - Yosys');
  assert.match(log, /Process "Synthesize - Yosys" completed successfully/, log.slice(-2000));
  assert.ok(log.includes(NORMAL) && !log.includes(HIGH), log.slice(0, 2000));
  // Process Properties: what the effort does
  const props = async (proc = 'Synthesize - Yosys', item = 'Process Properties…') => {
    await page.treeRow('#procs', proc, { right: true, exact: true });
    await page.click('body > .menu-popup .mi', { text: item });
    await page.waitForSelector('.dlg-overlay .effort-hint');
    return page.eval(() => document.querySelector('.dlg-overlay .effort-hint').textContent);
  };
  assert.equal(await props(), 'Silinx toolchain: Optimization Effort Normal synthesizes once, fast, and tries the mappings for speed only on a design limited by its logic depth or with wide multiplexers; High tries them on every design (a slower synthesis, a circuit about 5-10 % faster).');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('pt');
  try {
    assert.equal(await props('Sintetizar - Yosys', 'Propriedades do Processo…'), 'Toolchain Silinx: o Esforço de Otimização Normal sintetiza uma vez, depressa, e só experimenta os mapeamentos para velocidade num desenho limitado pela sua profundidade lógica ou com multiplexadores largos; Alto experimenta-os em todos os desenhos (uma síntese mais lenta, um circuito cerca de 5-10 % mais rápido).');
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await setLang('en'); }
  // High: the mappings for speed
  await props();
  await page.eval(() => { const s = document.querySelectorAll('.dlg-overlay select')[1]; s.value = '2'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(async () => (await (await fetch('/api/projects/OpenEffort')).json()).impl.optLevel === 2, [], { what: 'High saved' });
  log = await run('Synthesize - Yosys');
  assert.ok(log.includes(HIGH) && !log.includes(NORMAL), log.slice(0, 2000));
  // the effort is an input of the synthesis (#280): Implement Design with it the same, up to date; back to
  // Normal, it synthesizes again
  log = await run('Implement Design');
  assert.ok(/Process "Synthesize - Yosys" is up to date/.test(log), log.slice(0, 2000));
  await props();
  await page.eval(() => { const s = document.querySelectorAll('.dlg-overlay select')[1]; s.value = '1'; s.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(async () => (await (await fetch('/api/projects/OpenEffort')).json()).impl.optLevel === 1, [], { what: 'Normal saved' });
  log = await run('Implement Design');
  assert.ok(!/is up to date/.test(log) && log.includes(NORMAL), log.slice(0, 2000));
}, { timeout: 300000 });
