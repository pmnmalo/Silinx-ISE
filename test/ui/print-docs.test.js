// UI: every document in front prints (#1509): File ▸ Print…, Ctrl+P and the toolbar's Print are enabled with any
// document. An HDL source (editable or generated) prints its text, numbered; a read-only schematic (View RTL
// Schematic, a truth table's schematic) and a Petri net open the print dialog of diagrams; any other document (the
// Design Summary) prints a copy of what it shows. Every print view has its title and the project and file names, in
// light colours, also in the dark theme.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setupUi, uiTest, makeProject, ROOT } from './harness.js';
import { capturePrints, confirmPrint, fileMenuPrint, printOn, printed } from './print-helpers.js';
import { newTable, generateTableHdl } from '../../core/logic.js';
import { newPetri } from '../../core/petri.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('#1509 an HDL source prints its text (Print enabled; the toolbar, File ▸ Print… and Ctrl+P), the generated HDL too', E, async (page) => {
  await makeProject(env, { name: 'PrHdl', template: 'gates' });
  await page.openProject('PrHdl');
  await capturePrints(page);
  await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
  await page.eval(() => window.SilinxApp.openFile('sim/tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd' && window.Silinx.active.editor, [], { what: 'the editor' });
  await page.waitFor(() => !document.querySelector('#toolbar .tb-btn[data-cmd=print]').disabled, [], { what: 'Print enabled' });
  assert.equal(!!(await fileMenuPrint(page)).disabled, false, 'File ▸ Print… enabled');
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  const html = await printed(page, 1);
  assert.match(html, /<header class="pv-head"><b>Source tb_gates\.vhd<\/b><span>Project: PrHdl {2}· {2}File: sim\/tb_gates\.vhd<\/span><\/header>/);
  assert.match(html, /<td class="n">1<\/td>/);
  assert.match(html, /<td class="n">2<\/td><td><span class="tk-com">-- Test bench for gates: /);
  assert.match(html, /ENTITY tb_gates IS/);
  assert.match(html, /data-theme="light"/);
  assert.doesNotMatch(html, /<script/i);
  const lines = (await page.eval(() => window.Silinx.active.editor.getValue())).replace(/\n$/, '').split('\n').length;
  assert.equal((html.match(/<td class="n">/g) || []).length, lines, 'every line');
  // the HDL generated from the schematic (read-only): Ctrl+P
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:src/gates.vhd' && window.Silinx.active.editor?.readOnly(), [], { what: 'the generated HDL' });
  assert.ok(await printOn(page));
  await page.key('p', { modifiers: 2 });
  await confirmPrint(page);
  assert.match(await printed(page, 2), /<b>Source \(read-only\) gates\.vhd<\/b><span>Project: PrHdl {2}· {2}File: src\/gates\.vhd<\/span>/);
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page, { title: 'Imprimir — ', print: 'Imprimir…' });
  assert.match(await printed(page, 3), /<b>Fonte \(só de leitura\) gates\.vhd<\/b><span>Projeto: PrHdl {2}· {2}Ficheiro: src\/gates\.vhd<\/span>/);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('#1509 read-only schematics (View RTL Schematic, a truth table\'s schematic) and a Petri net print from the print dialog of diagrams', E, async (page) => {
  const t = { ...newTable('maj', ['a', 'b', 'c'], ['f']), lang: 'vhdl', generatedFile: 'src/maj.vhd' };
  t.table = { ...(t.table || {}), f: '00010111' };
  await makeProject(env, { name: 'PrSch', template: 'gates', files: { 'src/maj.tt.json': JSON.stringify(t), 'src/maj.vhd': generateTableHdl(t, 'vhdl').code, 'src/net.pn.json': JSON.stringify(newPetri('net')) } });
  await page.openProject('PrSch');
  await capturePrints(page);
  const viaDialog = async (open, ready, dialog, n) => {
    await page.eval(open);
    await page.waitFor(ready, [], { what: dialog, timeout: 30000 });
    await page.waitFor(() => !document.querySelector('#toolbar .tb-btn[data-cmd=print]').disabled, [], { what: 'Print enabled' });
    await page.menu('File', 'Print…');
    await page.waitDialog(dialog);
    await page.dialogButton('Print…');
    await page.waitNoDialog();
    const html = await printed(page, n);
    // the drawing (an image of it) under its title and the project
    assert.match(html, /<img src="blob:/, dialog);
    return html;
  };
  let html = await viaDialog(async () => (await import('/js/viewers.js')).openSchematic('gates'),
    () => window.Silinx.active?.id === 'rtl:gates' && document.querySelectorAll('.doc:not([hidden]) .se-svg [data-kind=sym]').length >= 2, 'Print — gates (RTL)', 1);
  assert.match(html, /<header><b>gates \(RTL\)<\/b><span>Project: PrSch<\/span><\/header>/);
  html = await viaDialog(() => window.SilinxApp.openTtSchematic('src/maj.tt.json'),
    () => window.Silinx.active?.id === 'ttsch:src/maj.tt.json' && window.Silinx.active.viewer, 'Print — maj (Schematic)', 2);
  assert.match(html, /<b>maj \(Schematic\)<\/b><span>Project: PrSch<\/span>/);
  html = await viaDialog(() => window.SilinxApp.openPetri('src/net.pn.json'),
    () => window.Silinx.active?.petriEditor && document.querySelector('.doc:not([hidden]) .pn-place'), 'Print — Petri net net', 3);
  assert.match(html, /<b>Petri net net<\/b><span>Project: PrSch {2}· {2}File: src\/net\.pn\.json<\/span>/);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('#1509 any other document prints a copy of what it shows (the Design Summary); a dark theme prints light', E, async (page) => {
  await makeProject(env, { name: 'PrSum', template: 'gates' });
  await page.openProject('PrSum');
  await capturePrints(page);
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => window.Silinx.active?.id === 'summary' && document.querySelector('.doc:not([hidden]) table'), [], { what: 'the Design Summary' });
  assert.ok(await printOn(page));
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  let html = await printed(page, 1);
  assert.match(html, /<header class="pv-head"><b>Design Summary<\/b><span>Project: PrSum<\/span><\/header>/);
  assert.match(html, /<div class="pv-copy" style="width: ?\d+px;[^"]*">/);
  assert.match(html, /PrSum Project Status/);
  assert.match(html, /Device Utilization Summary/);
  assert.doesNotMatch(html, /<button/, 'no buttons');
  // the dark theme (the modern interface): the page is light, the drawings' styles read in the light theme
  if (await page.eval(() => document.documentElement.dataset.ui === 'modern')) {
    const snapshot = () => page.eval(async () => {
      const { svgSnapshot } = await import('/js/print.js');
      const svg = document.querySelector('.doc:not([hidden]) .se-svg');
      return svgSnapshot(svg, svg.querySelector('g'), { l: 0, t: 0, r: 400, b: 300 }, ['.se-sheet']).svg;
    });
    await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
    await page.waitFor(() => window.Silinx.active?.schEditor && document.querySelector('.doc:not([hidden]) .se-svg [data-kind=sym]'), [], { what: 'the schematic' });
    await page.eval(async () => (await import('/js/modern.js')).setTheme('light'));
    const light = await snapshot();
    await page.eval(async () => (await import('/js/modern.js')).setTheme('dark'));
    assert.equal(await page.eval(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await snapshot(), light, 'the same drawing in the dark theme');
    assert.equal(await page.eval(() => document.documentElement.dataset.theme), 'dark', 'the theme put back');
    await page.eval(() => window.SilinxApp.openSummary());
    await page.waitFor(() => window.Silinx.active?.id === 'summary');
    await page.click('#toolbar .tb-btn[data-cmd=print]');
    await confirmPrint(page);
    html = await printed(page, 2);
    assert.match(html, /^<html data-ui="modern" data-theme="light"/);
    await page.eval(async () => (await import('/js/modern.js')).setTheme('system'));
  }
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

// (the routed design: the XDL fixture in the project's build folder, as in fpgaview.test.js)
uiTest('#1509 View Implemented Design (the FPGA view) prints the chip as shown and its side panel, the die light', E, async (page) => {
  const TOP = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (clk, a : in std_logic; y : out std_logic); end top;\narchitecture rtl of top is\n  signal q : std_logic;\nbegin\n  u1: entity work.sub port map (clk => clk, a => a, q => q);\n  y <= a or q;\nend rtl;\n';
  const SUB = 'library ieee; use ieee.std_logic_1164.all;\nentity sub is port (clk, a : in std_logic; q : out std_logic); end sub;\narchitecture rtl of sub is\n  signal r : std_logic := \'1\';\nbegin\n  process (clk) begin if rising_edge(clk) then r <= a and not r; end if; end process;\n  q <= r;\nend rtl;\n';
  await makeProject(env, { name: 'PrFpga', files: { 'src/top.vhd': TOP, 'src/sub.vhd': SUB }, top: 'top' });
  const build = path.join(env.server.workspace, 'PrFpga', 'build');
  await fs.mkdir(build, { recursive: true });
  await fs.writeFile(path.join(build, 'top.ncd'), 'NCD');
  const old = new Date(Date.now() - 60000);
  await fs.utimes(path.join(build, 'top.ncd'), old, old);
  for (const f of ['top.xdl', 'device.xdlrc']) await fs.copyFile(path.join(ROOT, 'test', 'fixtures', 'fpga', f), path.join(build, f));
  await page.openProject('PrFpga');
  await capturePrints(page);
  await page.menu('Tools', 'Implemented Design (FPGA View)');
  await page.waitFor(() => window.Silinx.active?.id === 'fpgaview' && document.querySelector('.doc:not([hidden]) .fv-site'), [], { what: 'FPGA view open' });
  assert.ok(await printOn(page));
  await page.key('p', { modifiers: 2 });
  await confirmPrint(page);
  const html = await printed(page, 1);
  assert.match(html, /<header class="pv-head"><b>FPGA \(top\)<\/b><span>Project: PrFpga<\/span><\/header>/);
  // the chip at the size shown, its sites; the side panel; not the toolbar, the search field or the tip
  assert.match(html, /<svg class="fv-svg"[^>]* width="\d+(\.\d+)?" height="\d+(\.\d+)?"/);
  assert.ok((html.match(/class="fv-site( |")/g) || []).length >= 7, 'the placed sites');
  assert.match(html, /class="fv-side"/);
  assert.doesNotMatch(html, /class="doc-toolbar fv-bar"|class="fv-search"|class="fv-tip"/);
  // the die printed light (the print view's style of the FPGA view)
  assert.match(html, /\.pv-copy \.fv-die \{ fill: rgb\(246, 248, 250\); \}/);
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

// the page rule the print view ends with (the fit's, after the page's default A4 portrait)
const pageRule = (html) => [...html.matchAll(/@page \{ size: ([^;]+); margin: 10mm; \}/g)].pop()?.[1];

uiTest('#1923 a document\'s print dialog: paper and orientation (portrait, landscape, automatic), kept for the next print; Cancel prints nothing; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'PrOrient', template: 'gates' });
  await page.openProject('PrOrient');
  await capturePrints(page);
  await page.eval(() => window.SilinxApp.openFile('sim/tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd' && window.Silinx.active.editor, [], { what: 'the editor' });
  assert.ok(await printOn(page));
  // the dialog: Paper and Orientation, A4 and Automatic at first
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  assert.equal(await page.waitDialog('Print — '), 'Print — Source tb_gates.vhd');
  const fields = () => page.eval(() => [...[...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('select')]
    .map((s) => ({ value: s.value, options: [...s.options].map((o) => o.textContent) })));
  assert.deepEqual(await fields(), [{ value: 'A4', options: ['A4', 'A3', 'Letter'] }, { value: 'auto', options: ['Automatic', 'Portrait', 'Landscape'] }]);
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => window.__prints.length), 0, 'Cancel: nothing printed');
  // a source: automatic is portrait; landscape on A3 chosen
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await confirmPrint(page);
  assert.equal(pageRule(await printed(page, 1)), 'A4 portrait');
  await page.key('p', { modifiers: 2 });
  await confirmPrint(page, { paper: 'A3', orient: 'landscape' });
  const html = await printed(page, 2);
  assert.equal(pageRule(html), 'A3 landscape');
  assert.match(html, /<td class="n">1<\/td>/, 'the text');
  // the choice kept: the next print opens with it
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await page.waitDialog('Print — ');
  assert.deepEqual((await fields()).map((f) => f.value), ['A3', 'landscape']);
  await page.dialogButton('Print…');
  await page.waitNoDialog();
  assert.equal(pageRule(await printed(page, 3)), 'A3 landscape');
  // a copy of a document (the Design Summary): portrait and landscape as chosen, zoomed to the page's width
  await page.eval(() => window.SilinxApp.openSummary());
  await page.waitFor(() => window.Silinx.active?.id === 'summary' && document.querySelector('.doc:not([hidden]) table'), [], { what: 'the Design Summary' });
  for (const [orient, n] of [['portrait', 4], ['landscape', 5]]) {
    await page.click('#toolbar .tb-btn[data-cmd=print]');
    await confirmPrint(page, { paper: 'Letter', orient });
    const p = await printed(page, n);
    assert.equal(pageRule(p), `letter ${orient}`);
    assert.match(p, /<div class="pv-copy" style="width: ?\d+px;[^"]*zoom: [\d.]+;?[^"]*">/, `${orient}: fitted`);
  }
  // a drawing keeps its own dialog (paper, orientation, pages across)
  await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
  await page.waitFor(() => window.Silinx.active?.schEditor && document.querySelector('.doc:not([hidden]) .se-svg [data-kind=sym]'), [], { what: 'the schematic' });
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  await page.waitDialog('Print — ');
  assert.equal(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelectorAll('select').length), 3, 'paper, orientation, PNG resolution');
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  // in Portuguese
  await page.eval(() => window.SilinxApp.openFile('sim/tb_gates.vhd'));
  await page.waitFor(() => window.Silinx.active?.id === 'file:sim/tb_gates.vhd');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.click('#toolbar .tb-btn[data-cmd=print]');
  assert.equal(await page.waitDialog('Imprimir — '), 'Imprimir — Fonte tb_gates.vhd');
  const text = await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().textContent);
  for (const s of ['Papel', 'Orientação', 'Automática', 'Vertical', 'Horizontal', 'Automática: horizontal quando o que é mostrado é mais largo do que a página.', 'Imprimir…', 'Cancelar']) assert.ok(text.includes(s), s);
  await confirmPrint(page, { title: 'Imprimir — ', print: 'Imprimir…', orient: 'portrait' });
  assert.equal(pageRule(await printed(page, 6)), 'letter portrait', 'the paper kept (Letter)');
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});
