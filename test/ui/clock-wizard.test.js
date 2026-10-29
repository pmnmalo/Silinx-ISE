// UI: New Source ▸ Clock Manager (DCM / PLL) ▸ Wizard, the Clocking Wizard (#793, #958). On a Basys2 project (Spartan-3E): the board's oscillator as the input,
// the outputs with the frequency each gets and the reachable ones near it (a click asks for one), the errors; the
// module written (the generator's own output, compiling and elaborating with no warning), shown in the Design pane
// with the wizard as its base, reopened by its badge, by a double-click and by its process with its settings, and
// written again; a module changed by hand said so. On a Nexys3 project (Spartan-6): a PLL module in Verilog. Another
// family refused. Every page in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';
import { TEXTS, untranslated } from './i18n-check.js';
import { compile, elaborate } from '../../core/compile.js';
import { primitiveSources } from '../../core/unisim.js';
import { clockModule, readWizardSpec } from '../../core/clocking.js';
import { newSourceWizardOf } from './new-source-helpers.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// New Source ▸ Clock Manager (DCM / PLL), the file name, Wizard (#958)
const openClockWizard = (page, name = 'clkgen') => newSourceWizardOf(page, 'Clock Manager (DCM / PLL)', name, 'Clocking Wizard');
const pageTitle = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent);
const next = async (page, title) => {
  await page.dialogButton(title === null ? 'Finish' : 'Next >');
  if (title) await page.waitFor((t) => document.querySelector('.dlg-overlay .wiz-main h3')?.textContent === t, [title], { what: `wizard page ${title}` });
};
const errText = (page) => page.eval(() => document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent);
const cell = (page, cls, pin) => page.eval((c, p) => document.querySelector(`.dlg-overlay .${c}[data-pin=${p}]`)?.textContent ?? null, cls, pin);
const hierRows = (page) => page.eval(() => [...document.querySelectorAll('#hier .row')].filter((r) => r.querySelector('.badge'))
  .map((r) => `${r.querySelector('.lbl').textContent} ${[...r.querySelectorAll('.badge')].map((b) => `[${b.textContent}${b.classList.contains('base') ? '*' : ''}]`).join(' ')}`));
// a module compiled and elaborated with the UNISIM models: its errors and warnings
const diagnostics = (path, text, top) => {
  const src = [{ path, lang: path.endsWith('.v') ? 'verilog' : 'vhdl', text }];
  const lib = compile([...primitiveSources(src), ...src]);
  const d = elaborate(lib, top);
  return [...lib.errors, ...d.diags].filter((x) => x.file === path).map((x) => `${x.severity}: ${x.message}`);
};

uiTest('Clocking Wizard on the Basys2: a DCM_SP module, the nearest frequencies, the module in the Design pane, reopened and written again', E, async (page) => {
  await makeProject(env, { name: 'CwPj', board: 'basys2' });
  await page.openProject('CwPj');
  await openClockWizard(page);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-name').value), 'clkgen');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-file').textContent), 'src/clkgen.vhd');
  // the XC3S250E's DCMs (packages/silinx-fpga/src/resources.js)
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-count').textContent), 'DCMs on this device: 4');
  await next(page, 'Input Clock');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-fin').value), '50');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .cw-in-note').textContent), /^The Digilent Basys2.*'s oscillator: 50 MHz\.$/);
  await page.fill('.dlg-overlay .cw-fin', '0');
  await page.dialogButton('Next >');
  await page.waitFor(() => /Enter the input/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await errText(page), 'Enter the input clock frequency.');
  await page.fill('.dlg-overlay .cw-fin', '300');
  await page.dialogButton('Next >');
  await page.waitFor(() => /DLL/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await errText(page), 'The DCM\'s input (300.000 MHz) is out of the DLL\'s range, 5 to 240 MHz: divide the input by 2.');
  await page.fill('.dlg-overlay .cw-fin', '50');
  await page.fill('.dlg-overlay .cw-input', 'clk');
  await next(page, 'Output Clocks');
  // the DCM's nine outputs, CLK0 on
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-on')].map((c) => `${c.dataset.pin}${c.checked ? '*' : ''}`)),
    ['CLK0*', 'CLK90', 'CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLKDV', 'CLKFX', 'CLKFX180']);
  assert.equal(await cell(page, 'cw-actual', 'CLK0'), '50 MHz (20 ns)');
  // CLKFX at 65 MHz: x 13 / 10, the nearest ones shown; a click on one asks for it
  await page.fill('.dlg-overlay .cw-on[data-pin=CLKFX]', true);
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKFX]', '65');
  await page.waitFor(() => document.querySelector('.dlg-overlay .cw-note[data-pin=CLKFX]').textContent === 'CLKIN x 13 / 10');
  assert.equal(await cell(page, 'cw-actual', 'CLKFX'), '65 MHz (15.385 ns)');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-near[data-pin=CLKFX] button')].map((b) => b.textContent)),
    ['65 MHz', '65.217 MHz', '64.706 MHz', '65.385 MHz', '64.583 MHz']);
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKFX]', '66');
  await page.waitFor(() => document.querySelector('.dlg-overlay .cw-note[data-pin=CLKFX]').textContent !== 'CLKIN x 13 / 10');
  // (66 is 50 x 33 / 25, out of CLKFX_MULTIPLY's range: 50 x 29 / 22 the nearest)
  assert.equal(await cell(page, 'cw-actual', 'CLKFX'), '65.909 MHz (15.172 ns)');
  await page.click('.dlg-overlay .cw-near[data-pin=CLKFX] button', { index: 4 });
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-mhz[data-pin=CLKFX]').value), '66.666667');
  await page.waitFor(() => document.querySelector('.dlg-overlay .cw-note[data-pin=CLKFX]').textContent === 'CLKIN x 4 / 3');
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKFX]', '65');
  // CLKDV: 12 MHz asked, 12.5 (/ 4) made
  await page.fill('.dlg-overlay .cw-on[data-pin=CLKDV]', true);
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKDV]', '12');
  await page.waitFor(() => document.querySelector('.dlg-overlay .cw-note[data-pin=CLKDV]').textContent === 'CLKIN / 4');
  assert.equal(await cell(page, 'cw-actual', 'CLKDV'), '12.5 MHz (80 ns)');
  // an empty frequency: refused, said under the table
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKDV]', '');
  await page.dialogButton('Next >');
  await page.waitFor(() => /CLKDV/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await errText(page), 'Enter the frequency of CLKDV.');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-errors').textContent), 'Enter the frequency of CLKDV.');
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKDV]', '12.5');
  // two ports of one name
  await page.fill('.dlg-overlay .cw-port[data-pin=CLKDV]', 'clk0');
  await page.dialogButton('Next >');
  await page.waitFor(() => /same name/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  await page.fill('.dlg-overlay .cw-port[data-pin=CLKDV]', 'clkdv');
  await next(page, 'Summary');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-summary').textContent), [
    'The wizard will create src/clkgen.vhd (VHDL): the module clkgen, a DCM_SP and 3 global buffer(s).', '',
    'Input: clk, 50 MHz, from a pin (IBUFG)', 'Output clk0: 50 MHz (CLK0: CLKIN)', 'Output clkdv: 12.5 MHz (CLKDV: CLKIN / 4)', 'Output clkfx: 65 MHz (CLKFX: CLKIN x 13 / 10)',
    'Reset: rst', 'LOCKED: locked'].join('\n'));
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'clkgen'), [], { what: 'clkgen in the project' });
  const text = await readWs(env, 'CwPj', 'src/clkgen.vhd');
  const spec = readWizardSpec(text);
  assert.deepEqual(spec, { wizard: 'clock', version: 1, name: 'clkgen', lang: 'vhdl', family: 'spartan3e', speed: '-4', inMHz: 50, input: 'clk', ibufg: true, reset: 'rst', locked: 'locked',
    div2: false, phaseShift: 0, outputs: [{ pin: 'CLK0', port: 'clk0' }, { pin: 'CLKDV', port: 'clkdv', mhz: 12.5 }, { pin: 'CLKFX', port: 'clkfx', mhz: 65 }] });
  assert.equal(text, clockModule(spec).code);
  assert.deepEqual(diagnostics('src/clkgen.vhd', text, 'clkgen'), []);
  await page.waitConsole(/Clocking Wizard: created src\/clkgen\.vhd, the module clkgen: clk0 50 MHz, clkdv 12\.5 MHz, clkfx 65 MHz\./);
  // the Design pane: the wizard first (the base), the HDL generated from it; its process
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'Clocking Wizard'), [], { what: 'the wizard badge' });
  assert.deepEqual(await hierRows(page), ['clkgen [Clocking Wizard*] [VHDL]']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row .badge')].map((b) => b.title)), ['Base: its HDL is generated by the wizard', 'Generated by the Clocking Wizard']);
  await page.treeRow('#hier', 'clkgen');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((l) => l.textContent === 'View/Edit Clocking Wizard'), [], { what: 'the process' });
  // reopened by a double-click: its settings, the name and the file fixed
  await page.treeRow('#hier', 'clkgen', { dbl: true });
  await page.waitDialog('Clocking Wizard');
  assert.deepEqual(await page.eval(() => ['.cw-name', '.cw-loc'].map((s) => document.querySelector(`.dlg-overlay ${s}`).disabled)), [true, true]);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-edited')), null);
  await next(page, 'Input Clock');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-input').value), 'clk');
  await page.fill('.dlg-overlay .cw-rst-on', false);
  await next(page, 'Output Clocks');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-on')].filter((c) => c.checked).map((c) => c.dataset.pin)), ['CLK0', 'CLKDV', 'CLKFX']);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-mhz[data-pin=CLKFX]').value), '65');
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKFX]', '25');
  await next(page, 'Summary');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .cw-summary').textContent), /^The wizard will write again src\/clkgen\.vhd \(VHDL\)/);
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(async () => /CLKFX_MULTIPLY +=> 2,/.test(window.Silinx.sources.find((s) => s.path === 'src/clkgen.vhd')?.text || ''), [], { what: 'clkgen written again' });
  const again = await readWs(env, 'CwPj', 'src/clkgen.vhd');
  assert.match(again, /CLKFX_DIVIDE +=> 4,/);
  assert.match(again, /RST +=> '0',/);
  assert.doesNotMatch(again, /rst +: in/);
  assert.deepEqual(diagnostics('src/clkgen.vhd', again, 'clkgen'), []);
  // changed by hand: reopened (from its process) it says so
  await env.server.api('PUT', `/api/projects/CwPj/file?path=${encodeURIComponent('src/clkgen.vhd')}`, again.replace('end xilinx;', '  -- mine\nend xilinx;'));
  await page.eval(() => window.SilinxApp.reloadProject());
  await page.waitFor(() => /-- mine/.test(window.Silinx.sources.find((s) => s.path === 'src/clkgen.vhd')?.text || ''));
  await page.treeRow('#hier', 'clkgen');
  await page.treeRow('#procs', 'View/Edit Clocking Wizard', { dbl: true });
  await page.waitDialog('Clocking Wizard');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay .cw-edited')?.textContent || ''), /^This module was changed by hand since the wizard wrote it/);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
});

uiTest('Clocking Wizard on the Nexys3 (Spartan-6): a PLL_BASE module in Verilog, its outputs from one VCO', E, async (page) => {
  await makeProject(env, { name: 'CwS6', board: 'nexys3', preferredLanguage: 'verilog' });
  await page.openProject('CwS6');
  await openClockWizard(page);
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-file').textContent), 'src/clkgen.v');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-count').textContent), 'PLLs on this device: 2');
  await next(page, 'Input Clock');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-fin').value), '100');
  // (no divide by 2 nor PHASE_SHIFT: the DCM's)
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-div2')?.isConnected ?? false), false);
  await next(page, 'Output Clocks');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay .cw-on')].map((c) => `${c.dataset.pin}${c.checked ? '*' : ''}`)),
    ['CLKOUT0*', 'CLKOUT1', 'CLKOUT2', 'CLKOUT3', 'CLKOUT4', 'CLKOUT5']);
  await page.fill('.dlg-overlay .cw-on[data-pin=CLKOUT1]', true);
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKOUT1]', '25');
  await page.fill('.dlg-overlay .cw-ph[data-pin=CLKOUT1]', '90');
  await page.waitFor(() => document.querySelector('.dlg-overlay .cw-note[data-pin=CLKOUT1]').textContent === 'VCO / 40, 90.0°');
  assert.equal(await cell(page, 'cw-actual', 'CLKOUT1'), '25 MHz (40 ns)');
  assert.equal(await page.eval(() => document.querySelector('.dlg-overlay .cw-vco').textContent), 'VCO: 100.000 MHz x 10 / 1 = 1000.000 MHz (its range 400 to 1080 MHz).');
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKOUT1]', '500');
  await page.dialogButton('Next >');
  await page.waitFor(() => /output range/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  assert.equal(await errText(page), 'clk_out1 (500.000 MHz) is out of the PLL\'s output range, 3.125 to 400 MHz.');
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKOUT1]', '25');
  await next(page, 'Summary');
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => window.Silinx.modules.some((m) => m.name === 'clkgen'), [], { what: 'clkgen in the project' });
  const text = await readWs(env, 'CwS6', 'src/clkgen.v');
  assert.equal(text, clockModule(readWizardSpec(text)).code);
  assert.match(text, /PLL_BASE #\(/);
  assert.match(text, /\.CLKOUT1_DIVIDE +\(40\),/);
  assert.match(text, /\.CLKOUT1_PHASE +\(90\.000\),/);
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'Clocking Wizard'), [], { what: 'the wizard badge' });
  assert.deepEqual(await hierRows(page), ['clkgen [Clocking Wizard*] [Verilog]']);
});

uiTest('Clocking Wizard: another family than the Spartan-3E or the Spartan-6 refused', E, async (page) => {
  await makeProject(env, { name: 'CwS3', device: { family: 'spartan3', part: 'xc3s200', package: 'ft256', speed: '-4' } });
  await page.openProject('CwS3');
  await openClockWizard(page);
  // (the wizard's own dialog is the alert)
  await page.waitFor(() => /makes a DCM for the Spartan-3E/.test(document.querySelector('.dlg-overlay .dlg-body')?.textContent || ''), [], { what: 'the refusal' });
  await page.dialogButton('OK');
  await page.waitNoDialog();
});

uiTest('Portuguese: the Clocking Wizard\'s pages, its messages, the Design pane\'s badge and the process are translated', E, async (page) => {
  await makeProject(env, { name: 'CwPt', board: 'basys2' });
  await page.openProject('CwPt');
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  const missing = [];
  const both = async (what, root = '.dlg-overlay') => {
    await setLang('en');
    const en = await page.eval((r) => window.__uiTexts(document.querySelector(r)), root);
    await setLang('pt');
    const pt = await page.eval((r) => window.__uiTexts(document.querySelector(r)), root);
    for (const s of untranslated(en, pt, [/^(CLK|clk|rst|locked)/])) missing.push(`${what}: ${s}`);
    await setLang('en');
  };
  await openClockWizard(page);
  await both(await pageTitle(page));
  await next(page, 'Input Clock');
  await page.fill('.dlg-overlay .cw-phase', '32');
  await both('Input Clock');
  await page.fill('.dlg-overlay .cw-fin', '300');
  await page.dialogButton('Next >');
  await page.waitFor(() => /DLL/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  await both('Input Clock (error)');
  await page.fill('.dlg-overlay .cw-fin', '50');
  await page.fill('.dlg-overlay .cw-input', 'signal');
  await page.dialogButton('Next >');
  await page.waitFor(() => /reserved/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  await both('Input Clock (a reserved word)');
  await page.fill('.dlg-overlay .cw-input', 'clk');
  await next(page, 'Output Clocks');
  await page.fill('.dlg-overlay .cw-on[data-pin=CLKFX]', true);
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKFX]', '');
  await page.dialogButton('Next >');
  await page.waitFor(() => /CLKFX/.test(document.querySelector('.dlg-overlay .wiz-main').nextElementSibling.textContent));
  await both('Output Clocks');
  await page.fill('.dlg-overlay .cw-mhz[data-pin=CLKFX]', '65');
  await next(page, 'Summary');
  await both('Summary');
  await next(page, null);
  await page.waitNoDialog();
  await page.waitFor(() => [...document.querySelectorAll('#hier .row .badge')].some((b) => b.textContent === 'Clocking Wizard'), [], { what: 'the wizard badge' });
  await page.treeRow('#hier', 'clkgen');
  await page.waitFor(() => [...document.querySelectorAll('#procs .lbl')].some((l) => l.textContent === 'View/Edit Clocking Wizard'));
  await both('Processes', '#procs');
  await setLang('pt');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#hier .row .badge')].map((b) => `${b.textContent} (${b.title})`)),
    ['Assistente de Relógio (Base: o HDL é gerado pelo assistente)', 'VHDL (Gerado pelo Assistente de Relógio)']);
  await setLang('en');
  assert.deepEqual(missing, []);
});
