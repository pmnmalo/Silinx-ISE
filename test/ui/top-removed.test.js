// UI: the top-level module removed from the project (#253). Remove from Project of the top module's
// source made the project keep a top it no longer has, and I/O Pin Planning then showed an empty table
// (a project imported from ISE, its top schematic removed: "the buses are not in the planner"). The top
// becomes the one module left at the root (one Undo brings the old one back), or none when several are
// (a warning: the user sets it); a project saved with such a top is mended when opened; I/O Pin Planning
// of a top the project does not have says so, in English and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const project = (name) => env.server.api('GET', `/api/projects/${encodeURIComponent(name)}`);
// the top as the project's file has it, once saved (the page has it before the save is done: #253's CI)
const savedTop = (page, name, top) => page.waitFor(async (n, t) => (await (await fetch(`/api/projects/${encodeURIComponent(n)}`)).json()).top === t, [name, top], { what: `${name}'s top saved as '${top}'` });
const consoleLines = async (page, re) => (await page.consoleText()).split('\n').filter((l) => re.test(l));
const ppRows = (page) => page.eval(() => [...document.querySelectorAll('.pin-planner .pp-table tr')].slice(1).map((r) => r.cells[0].textContent));
const answer = async (page, button = 'Yes', title = 'Remove Source') => {
  await page.waitDialog(title);
  await page.dialogButton(button);
  await page.waitNoDialog();
};

const vhdl = (name, ports) => `library ieee; use ieee.std_logic_1164.all;
entity ${name} is port (${ports}); end ${name};
architecture rtl of ${name} is begin end rtl;
`;
const TOP = vhdl('top', 'a : in std_logic; y : out std_logic');
// the module left: a converter with buses (as the project of the report)
const CONV = vhdl('conv', 'bcd : in std_logic_vector(3 downto 0); y : out std_logic_vector(4 downto 0)');
const OTHER = vhdl('other', 'b : in std_logic');
const NOW = (old, top) => `The top-level module '${old}' is no longer in the project: the top is now '${top}' (another one: Set as Top Module).`;
const SET = (old) => `The top-level module '${old}' is no longer in the project: set the top module (a module's right-click menu: Set as Top Module).`;

uiTest('#253 Remove from Project of the top module: the module left becomes the top (I/O Pin Planning shows its buses); one Undo brings the old top back', E, async (page) => {
  await makeProject(env, { name: 'TopGone', top: 'top', board: 'basys2', files: { 'src/top.vhd': TOP, 'src/conv.vhd': CONV } });
  await page.openProject('TopGone');
  await page.treeRow('#hier', 'top', { right: true, exact: true });
  await page.click('body > .menu-popup .mi', { text: 'Remove from Project' });
  await answer(page);
  await page.waitFor(() => window.Silinx.project?.top === 'conv', [], { what: 'conv the top' });
  await savedTop(page, 'TopGone', 'conv');
  assert.deepEqual(await consoleLines(page, /^The top-level module/), [NOW('top', 'conv')]);
  // the top's row in the Design pane
  await page.waitFor(() => document.querySelector('#hier .row.top-mod .lbl')?.textContent === 'conv', [], { what: 'conv the top in the Design pane' });
  // I/O Pin Planning: the top's buses, bit by bit
  await page.menu('Tools', 'I/O Pin Planning');
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelectorAll('.pin-planner .pp-table tr').length > 1, [], { what: 'the planner' });
  assert.deepEqual(await ppRows(page), ['bcd<0>', 'bcd<1>', 'bcd<2>', 'bcd<3>', 'y<0>', 'y<1>', 'y<2>', 'y<3>', 'y<4>']);
  assert.equal(await page.eval(() => document.querySelector('.pin-planner .doc-status .pp-info').textContent), 'Top: conv');   // (its status line's, #2763)
  // one Undo: top.vhd back, and the top with it
  await page.menu('Edit', 'Undo Remove from Project');
  await page.waitFor(() => window.Silinx.project?.top === 'top', [], { what: 'top the top again' });
  await savedTop(page, 'TopGone', 'top');
  assert.deepEqual((await project('TopGone')).files.map((f) => f.path).sort(), ['src/conv.vhd', 'src/top.vhd']);
});

uiTest('#253 a project saved with a top it no longer has: mended when opened (the one module left), or none and a warning when several are left', E, async (page) => {
  // its top's source removed by an older Silinx: the one module left is the top
  await makeProject(env, { name: 'TopStale', top: 'esq', files: { 'src/conv.vhd': CONV } });
  await page.openProject('TopStale');
  await page.waitFor(() => window.Silinx.project?.top === 'conv', [], { what: 'conv the top' });
  await savedTop(page, 'TopStale', 'conv');
  assert.deepEqual(await consoleLines(page, /^The top-level module/), [NOW('esq', 'conv')]);
  // two modules at the root: none is the top, the user sets it
  await makeProject(env, { name: 'TopTwo', top: 'esq', files: { 'src/conv.vhd': CONV, 'src/other.vhd': OTHER } });
  await page.openProject('TopTwo');
  await page.waitConsole(/^The top-level module 'esq' is no longer in the project: set the top module/m);
  await savedTop(page, 'TopTwo', '');
  assert.deepEqual(await consoleLines(page, /^The top-level module/), [NOW('esq', 'conv'), SET('esq')]);
  // a top still declared by a source of the project is left alone (not missing: being edited)
  await makeProject(env, { name: 'TopKept', top: 'top', files: { 'src/top.vhd': TOP.replace('end rtl;', 'end rtl') } });
  await page.openProject('TopKept');
  await page.waitFor(() => window.Silinx.project?.name === 'TopKept', [], { what: 'the project open' });
  assert.equal((await project('TopKept')).top, 'top');
  assert.deepEqual(await consoleLines(page, /^The top-level module 'top'/), []);
});

uiTest('#253 I/O Pin Planning of a top the project does not have: says so, how to set one; in Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TopNone', top: 'conv', board: 'basys2', files: { 'src/conv.vhd': CONV } });
  await page.openProject('TopNone');
  await page.eval(() => window.SilinxApp.openPinPlanner('esq'));
  await page.waitFor(() => window.Silinx.active?.id === 'pins' && document.querySelector('.pin-planner .pp-missing'), [], { what: 'the message' });
  const text = () => page.eval(() => [...document.querySelectorAll('.pin-planner .pp-missing p')].map((p) => p.textContent));
  assert.deepEqual(await text(), ["The top-level module 'esq' is not in the project.",
    "Set the top module (a module's right-click menu: Set as Top Module), then open I/O Pin Planning again."]);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => /não está no projeto/.test(document.querySelector('.pin-planner .pp-missing')?.textContent || ''), [], { what: 'Portuguese' });
  assert.deepEqual(await text(), ["O módulo de topo 'esq' não está no projeto.",
    'Defina o módulo de topo (no menu do botão direito de um módulo: Definir como Módulo de Topo) e abra de novo o Planeamento de Pinos de E/S.']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
});
