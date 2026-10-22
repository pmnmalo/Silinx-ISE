// UI: the Tasks interface's Edit, its Test page (#1016, web/js/tasks-test.js): a tab right after Design listing the
// project's test benches, so that the Design page shows the design alone; a test bench added with the wizard (the
// page's button, its context menu), opened, checked and removed from it; in Portuguese; the modern and classic
// interfaces without it.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };   // (the Tasks interface: a development build's only, #838)

const AND2 = 'library ieee;\nuse ieee.std_logic_1164.all;\nentity and2 is\n  port (a, b : in std_logic; y : out std_logic);\nend and2;\n'
  + 'architecture rtl of and2 is\nbegin\n  y <= a and b;\nend rtl;\n';
const vis = (page, sel) => page.eval((s) => { const e = document.querySelector(s); return !!e && e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0; }, sel);
const rows = (page, host) => page.eval((s) => [...document.querySelectorAll(`${s} .row`)].map((r) => r.querySelector('.lbl').textContent), host);
// the Test page: its tab, its caption, its rows, what it says with none, its button
const testPage = (page) => page.eval(() => {
  const p = document.querySelector('.left-page[data-page="test"]');
  return {
    tabs: [...document.querySelectorAll('#left-tabs .tab')].map((t) => t.dataset.page),
    active: document.querySelector('#left-tabs .tab.active')?.dataset.page,
    shown: !!p && !p.hidden && p.getClientRects().length > 0,
    caption: p?.querySelector('.caption').textContent,
    rows: [...(p?.querySelectorAll('#test-tree .row') || [])].map((r) => r.querySelector('.lbl').textContent),
    none: p && !p.querySelector('.test-none').hidden ? p.querySelector('.test-none').textContent : null,
    button: p?.querySelector('.test-new').textContent,
  };
});
const menuLabels = (page) => page.waitFor(() => { const m = [...document.querySelectorAll('body > .menu-popup .mi')].map((i) => i.querySelector('.lbl').textContent); return m.length ? m : null; }, [], { what: 'the context menu' });
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}

uiTest('#1016 Tasks ▸ Edit: the Test tab after Design, its test benches; added, opened, checked and removed from it; Portuguese', E, async (page) => {
  await makeProject(env, { name: 'TasksTestTab', top: 'and2', files: { 'src/and2.vhd': AND2 } });
  await page.setViewport(1366, 768);
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  try {
    await page.reload();
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await page.openProject('TasksTestTab');
    await page.click('#task-switch .task-btn[data-task="edit"]');
    // the tab after Design's, its name the tooltip; Design in front
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#left-tabs .tab')].map((t) => [t.dataset.page, t.title])),
      [['start', 'Start'], ['design', 'Design'], ['test', 'Test'], ['files', 'Files'], ['libraries', 'Libraries']]);
    assert.deepEqual(await rows(page, '#hier'), ['TasksTestTab', 'xc3s250e-4-cp132', 'and2']);
    // no test bench: said, the wizard offered
    await page.click('#left-tabs .tab[data-page="test"]');
    assert.deepEqual(await testPage(page), { tabs: ['start', 'design', 'test', 'files', 'libraries'], active: 'test', shown: true, caption: 'Test Benches',
      rows: [], none: 'The project has no test bench yet.', button: 'New Test Bench (Wizard)…' });
    assert.ok(!(await vis(page, '#hier')), 'the Design page hidden');
    // its context menu: a test bench added
    await page.click('#test-page', { button: 'right' });
    assert.deepEqual(await menuLabels(page), ['New Test Bench (Wizard)…', 'Add Copy of Source…']);
    await page.closeMenus();
    // added with the wizard: listed here, not in Design; Simulate's
    await page.click('#test-page .test-new');
    await page.waitDialog('Test Bench Wizard');
    for (let k = 0; k < 4; k++) await page.dialogButton('Next >');
    await page.dialogButton('Finish');
    await page.waitNoDialog();
    await page.waitFor(() => window.Silinx.project.simTop === 'tb_and2' && document.querySelector('#test-tree .row'), [], { what: 'the new test bench' });
    assert.deepEqual(await testPage(page), { tabs: ['start', 'design', 'test', 'files', 'libraries'], active: 'test', shown: true, caption: 'Test Benches',
      rows: ['tb_and2', 'uut - and2'], none: null, button: 'New Test Bench (Wizard)…' });
    assert.ok(!(await page.eval(() => [...document.querySelectorAll('#hier .lbl')].some((l) => /tb_and2|Test Benches/.test(l.textContent)))), 'not in Design');
    // opened from it (the wizard opened it: closed first)
    await page.eval(async () => { for (const d of [...window.SilinxApp.S.docs]) await window.SilinxApp.closeDoc(d); });
    await page.treeRow('#test-tree', 'tb_and2', { dbl: true, exact: true });
    await page.waitFor(() => /tb_and2/.test(window.Silinx.active?.id || '') && document.documentElement.dataset.task === 'edit', [], { what: 'its source in Edit' });
    // checked from it: Edit's Check, the simulation's sources
    await page.treeRow('#test-tree', 'tb_and2', { exact: true });
    await page.click('#task-bar [data-act="main"]');
    await page.waitConsole(/Elaborating top module <tb_and2>/);
    await page.waitConsole(/Process "Check Syntax" completed successfully/);
    assert.equal(await page.eval(() => document.getElementById('err-count').textContent), '');
    // the selection kept when the tree is drawn again
    await page.eval(() => window.SilinxApp.renderHierarchy());
    assert.equal(await page.eval(() => document.querySelector('#test-tree .row.sel .lbl')?.textContent), 'tb_and2');
    // in Portuguese
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.waitFor(() => document.querySelector('.left-page[data-page="test"] .caption').textContent === 'Bancadas de Teste', [], { what: 'Portuguese' });
    assert.deepEqual(await page.eval(() => ({ tab: document.querySelector('#left-tabs .tab[data-page="test"]').title, lbl: document.querySelector('#left-tabs .tab[data-page="test"] .tab-lbl').textContent,
      button: document.querySelector('#test-page .test-new').textContent, tree: document.querySelector('#test-tree .tree').getAttribute('aria-label'), row: document.querySelector('#test-tree .row .lbl').textContent })),
    { tab: 'Teste', lbl: 'Teste', button: 'Nova Bancada de Teste (Assistente)…', tree: 'Bancadas de teste', row: 'tb_and2' });
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // removed from it: the page says there is none again
    await page.treeRow('#test-tree', 'tb_and2', { right: true, exact: true });
    const menu = await menuLabels(page);
    await page.click('body > .menu-popup .mi', { index: menu.indexOf('Remove from Project') });
    await page.waitDialog('Remove Source');
    await page.dialogButton('Yes');
    await page.waitNoDialog();
    await page.waitFor(() => !document.querySelector('#test-tree .row') && !document.querySelector('#test-page .test-none').hidden, [], { what: 'the test bench removed' });
    assert.equal((await testPage(page)).none, 'The project has no test bench yet.');
    assert.deepEqual(await rows(page, '#hier'), ['TasksTestTab', 'xc3s250e-4-cp132', 'and2']);
    // the modern and classic interfaces: no Test tab nor page, Design in front again
    for (const ui of ['modern', 'classic']) {
      await page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
      await page.waitFor(() => !document.documentElement.dataset.layout);
      assert.deepEqual(await page.eval(() => ({ tabs: [...document.querySelectorAll('#left-tabs .tab')].map((t) => t.dataset.page), page: !!document.querySelector('.left-page[data-page="test"]'),
        active: document.querySelector('#left-tabs .tab.active')?.dataset.page })), { tabs: ['start', 'design', 'files', 'libraries'], page: false, active: 'design' }, ui);
      assert.ok(await vis(page, '#hier'), ui);
      await page.eval(async () => (await import('/js/modern.js')).setInterface('tasks'));
      await page.waitFor(() => document.querySelector('#left-tabs .tab[data-page="test"]'), [], { what: 'the Tasks interface' });
      await page.click('#task-switch .task-btn[data-task="edit"]');
      await page.click('#left-tabs .tab[data-page="test"]');
    }
    await noWarnings(page);
  } finally {
    await page.eval(() => localStorage.removeItem('silinx.ui'));
  }
}, { build: DEV });
