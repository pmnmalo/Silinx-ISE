// UI (#1220): Unset as Top Module. The top module's right-click menu (a module of HDL, a drawing) has Unset as Top
// Module in place of Set as Top Module: the project has no top then (saved), Implement lists only the Design Summary,
// and Set as Top Module makes one again; the ISE style interface's Project menu too; in Portuguese. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const A = 'library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; y : out std_logic); end a;\narchitecture r of a is begin y <= x; end r;\n';
const B = 'module b(input x, output y); assign y = ~x; endmodule\n';
const warnings = (page) => page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text);
async function rowMenu(page, label) {
  await page.treeRow('#hier', label, { right: true, exact: true });
  await page.waitForSelector('body > .menu-popup');
  const items = await page.eval(() => [...document.querySelectorAll('body > .menu-popup .mi .lbl')].map((m) => m.textContent.trim()));
  return items.filter((i) => /Top Module|Módulo de Topo/.test(i));
}
const pick = (page, text) => page.click('body > .menu-popup .mi', { text });
const savedTop = async (name) => (await env.server.api('GET', `/api/projects/${name}`)).top;
// the top as saved, once the save asked for has reached the server (the app changes its project first, #1308)
async function waitSaved(name, top) {
  for (let t0 = Date.now(); Date.now() - t0 < 10000; await new Promise((r) => setTimeout(r, 100))) if (await savedTop(name) === top) return;
  assert.equal(await savedTop(name), top, 'saved');
}

uiTest('#1220 Unset as Top Module: on the top\'s menu, the project without a top, Set as Top Module again; a drawing too; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'UnsetPj', top: 'a', files: { 'src/a.vhd': A, 'src/b.v': B } });
  await page.openProject('UnsetPj');
  await page.leftTab('design');
  assert.deepEqual(await rowMenu(page, 'a'), ['Unset as Top Module']);
  await page.closeMenus();
  assert.deepEqual(await rowMenu(page, 'b'), ['Set as Top Module']);
  await page.closeMenus();
  // unset: no top, saved, said
  await rowMenu(page, 'a');
  await pick(page, 'Unset as Top Module');
  await page.waitFor(() => window.Silinx.project.top === '', [], { what: 'no top' });
  await page.waitConsole(/Top-level module 'a' unset: the project has no top module \(Set as Top Module makes one\)\./);
  await waitSaved('UnsetPj', '');
  assert.deepEqual(await rowMenu(page, 'a'), ['Set as Top Module']);
  await page.closeMenus();
  // the Silinx interface's Implement: no processes, its note (no Design Summary either, #1287, #1305)
  if (await page.eval(() => document.documentElement.dataset.layout === 'tasks')) {
    await page.click('#task-switch .task-btn[data-task="impl"]');
    await page.waitFor(() => !document.querySelector('#procs .lbl') && !!document.querySelector('#procs .task-no-top'), [], { what: 'no processes' });
    await page.click('#task-switch .task-btn[data-task="edit"]');
  } else {
    // the ISE style interface's Project menu: Set as Top Module of the selected module; on the top, Unset
    await page.treeRow('#hier', 'b', { exact: true });
    assert.ok((await page.openMenu('Project')).some((i) => i.label === 'Set as Top Module'));
    await page.closeMenus();
  }
  // set again: the top back
  await rowMenu(page, 'b');
  await pick(page, 'Set as Top Module');
  await page.waitFor(() => window.Silinx.project.top === 'b', [], { what: 'b the top' });
  await waitSaved('UnsetPj', 'b');
  if (!await page.eval(() => document.documentElement.dataset.layout === 'tasks')) {
    await page.treeRow('#hier', 'b', { exact: true });
    const items = (await page.openMenu('Project')).map((i) => i.label);
    assert.ok(items.includes('Unset as Top Module') && !items.includes('Set as Top Module'), items.join(', '));
    await page.closeMenus();
  }
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  assert.deepEqual(await rowMenu(page, 'b'), ['Retirar como Módulo de Topo']);
  await page.closeMenus();
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  assert.deepEqual(warnings(page), []);
});

uiTest('#1220 Unset as Top Module of a drawing (a schematic with its HDL)', E, async (page) => {
  await makeProject(env, { name: 'UnsetSch', template: 'gates' });
  await page.openProject('UnsetSch');
  await page.leftTab('design');
  assert.equal(await page.eval(() => window.Silinx.project.top), 'gates');
  assert.deepEqual(await rowMenu(page, 'gates'), ['Unset as Top Module']);
  await pick(page, 'Unset as Top Module');
  await page.waitFor(() => window.Silinx.project.top === '', [], { what: 'no top' });
  assert.deepEqual(await rowMenu(page, 'gates'), ['Set as Top Module']);
  await pick(page, 'Set as Top Module');
  await page.waitFor(() => window.Silinx.project.top === 'gates', [], { what: 'gates the top' });
  assert.deepEqual(warnings(page), []);
});
