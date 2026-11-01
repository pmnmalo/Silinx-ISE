// UI (#1210): Tasks ▸ Design has New Source… and Import Source… (#1501) above the Design tree, half of the panel each:
// they open the New Source dialog and the Import Source dialog; disabled with no project; in Portuguese; not in
// Implement; none in the ISE style interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };

async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
  assert.deepEqual(await page.eval(() => [document.getElementById('warn-count').textContent, ...[...document.querySelectorAll('#console-warnings .diag')].map((d) => d.textContent)]), ['']);
}
// the row as shown: its buttons' labels, enabled, each half of the panel, above the tree
const bar = (page) => page.eval(() => {
  const b = document.getElementById('task-src-bar');
  if (!b || !b.getClientRects().length) return null;
  const btns = [...b.querySelectorAll('button')], p = document.getElementById('design-panel').getBoundingClientRect();
  const w = btns.map((x) => x.getBoundingClientRect().width);
  return {
    labels: btns.map((x) => x.textContent), enabled: btns.map((x) => !x.disabled),
    whole: btns.every((x) => x.scrollWidth <= x.clientWidth),
    halves: w.every((x) => Math.abs(x - w[0]) < 1 && x > p.width * 0.4 && x < p.width / 2),
    above: btns.every((x) => x.getBoundingClientRect().bottom <= document.getElementById('hier').getBoundingClientRect().top + 1),
  };
});
const dlgTitle = (page) => page.waitFor(() => document.querySelector('.dlg-overlay .dlg-title span')?.textContent, [], { what: 'a dialog' });

uiTest('#1210 #1501 Tasks ▸ Design: New Source and Import Source above the tree, each opening its dialog; Portuguese; not in Implement; ISE style none', E, async (page) => {
  await makeProject(env, { name: 'SrcBar', template: 'gates' });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.waitFor(() => !!document.getElementById('task-src-bar'), [], { what: 'the row' });
  // no project yet: disabled
  assert.equal(await page.eval(() => window.SilinxApp.S.project), null);
  await page.waitFor(() => [...document.querySelectorAll('#task-src-bar button')].every((b) => b.disabled), [], { what: 'disabled with no project' });
  await page.openProject('SrcBar');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  await page.click('#left-tabs .tab[data-page=design]');
  await page.waitFor(() => [...document.querySelectorAll('#task-src-bar button')].every((b) => !b.disabled), [], { what: 'enabled' });
  assert.deepEqual(await bar(page), { labels: ['New Source…', 'Import Source…'], enabled: [true, true], whole: true, halves: true, above: true });
  // New Source…: the wizard
  await page.click('#task-src-bar button:nth-child(1)');
  assert.equal(await dlgTitle(page), 'New Source');
  await page.click('.dlg-overlay .dlg-x');
  await page.waitFor(() => !document.querySelector('.dlg-overlay'), [], { what: 'closed' });
  // Import Source…: its dialog
  await page.click('#task-src-bar button:nth-child(2)');
  assert.equal(await dlgTitle(page), 'Import Source');
  await page.click('.dlg-overlay .dlg-x');
  await page.waitFor(() => !document.querySelector('.dlg-overlay'), [], { what: 'closed' });
  // in Portuguese
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#task-src-bar button')?.textContent === 'Nova Fonte…', [], { what: 'Portuguese' });
  assert.deepEqual((await bar(page)).labels, ['Nova Fonte…', 'Importar Fonte…']);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // not in Implement
  await page.click('#task-switch .task-btn[data-task="impl"]');
  assert.equal(await bar(page), null, 'Implement');
  await page.click('#task-switch .task-btn[data-task="edit"]');
  assert.ok(await bar(page));
  // the ISE style interface: none
  await page.eval(async () => (await import('/js/silinx.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  assert.equal(await page.eval(() => document.getElementById('task-src-bar')), null);
  await noWarnings(page);
}, { build: DEV });
