// UI (#1224): Tasks ▸ Implement with no top module says so in its empty list (no Design Summary/Reports either, #1287) and offers
// Set Top Module…: the top chosen among the design's modules (the hierarchy's roots first, no test bench), then its
// processes; in Portuguese; none in the ISE style interface. No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, chromeOnly } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-24 12:00' };

const INV = 'library ieee; use ieee.std_logic_1164.all;\nentity inv is port (a : in std_logic; y : out std_logic); end inv;\narchitecture r of inv is begin y <= not a; end r;\n';
const TOP = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (x : in std_logic; z : out std_logic); end top;\narchitecture r of top is begin u : entity work.inv port map (a => x, y => z); end r;\n';
const OTHER = 'module other(input p, output q); assign q = p; endmodule\n';
async function tasksInterface(page) {
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
const note = (page) => page.eval(() => {
  const n = document.querySelector('#procs .task-no-top');
  return n && n.getClientRects().length ? { text: n.querySelector('p').textContent, button: n.querySelector('button').textContent } : null;
});
const rows = (page) => page.eval(() => [...document.querySelectorAll('#procs .row .lbl')].filter((e) => e.getClientRects().length).map((e) => e.textContent));

uiTest('#1224 Tasks ▸ Implement with no top module: said so, Set Top Module… chooses one; Portuguese; ISE style none', E, async (page) => {
  await makeProject(env, { name: 'NoTop', top: '', files: { 'src/inv.vhd': INV, 'src/top.vhd': TOP, 'src/other.v': OTHER } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('NoTop');
  await page.eval(async () => { window.SilinxApp.S.project.top = ''; await window.SilinxApp.saveProjectJson(); window.SilinxApp.renderProcesses(); });
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => !!document.querySelector('#procs .task-no-top'), [], { what: 'the note' });
  assert.deepEqual(await rows(page), [], 'no processes, no Design Summary/Reports (#1287)');
  // nor the Design Summary itself, opened behind with the project (#1295)
  await page.waitFor(() => !window.SilinxApp.findDoc('summary'), [], { what: 'no Design Summary' });
  assert.ok(!(await page.eval(() => [...document.querySelectorAll('#doc-tabs > .tab')].some((t) => t.getClientRects().length && /Design Summary/.test(t.textContent)))), 'no Design Summary tab');
  assert.deepEqual(await note(page), { text: 'No top module is set: the design is implemented from its top module, so set one to see its processes.', button: 'Set Top Module…' });
  // Set Top Module…: the roots first (top, other), then the others (inv)
  await page.click('#procs .task-no-top button');
  await page.waitDialog('Set Top Module');
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.dlg-overlay select option')].map((o) => o.value)), ['other', 'top', 'inv']);
  await page.eval(() => { const s = document.querySelector('.dlg-overlay select'); s.value = 'top'; });
  await page.dialogButton('OK');
  await page.waitFor(() => window.Silinx.project.top === 'top' && [...document.querySelectorAll('#procs .lbl')].some((e) => e.textContent.startsWith('Synthesize')), [], { what: 'the top set, its processes' });
  assert.equal(await note(page), null, 'no note with a top');
  assert.equal((await rows(page))[0], 'Design Summary/Reports', 'the Design Summary with a top (#1287)');
  assert.equal((await env.server.api('GET', '/api/projects/NoTop')).top, 'top');
  // the Design Summary opened at once, in front, as when Implement is chosen with a top (#1372)
  await page.waitFor(() => window.Silinx.active?.id === 'summary' && document.documentElement.dataset.task === 'impl', [], { what: 'the Design Summary in front' });
  assert.ok(await page.eval(() => document.querySelector('#doc-tabs > .tab.active')?.textContent.includes('Design Summary')), 'its tab');
  // in Portuguese
  await page.eval(async () => { window.SilinxApp.S.project.top = ''; await window.SilinxApp.saveProjectJson(); window.SilinxApp.renderProcesses(); });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  await page.waitFor(() => document.querySelector('#procs .task-no-top button')?.textContent === 'Definir Módulo de Topo…', [], { what: 'Portuguese' });
  assert.match((await note(page)).text, /^Não está definido nenhum módulo de topo/);
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
  // the ISE style interface: none
  await page.eval(async () => (await import('/js/modern.js')).setInterface('ise'));
  await page.waitFor(() => !document.documentElement.dataset.layout);
  await page.eval(() => window.SilinxApp.renderProcesses());
  assert.equal(await note(page), null, 'ise');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV });

// #1422: Emulate with no top module: its side panel says so and offers Set Top Module…, as Implement's; the top set, its
// processes
uiTest('#1422 Tasks ▸ Emulate with no top module: said so in its side panel, Set Top Module… chooses one', E, async (page) => {
  await makeProject(env, { name: 'NoTopEmu', top: '', files: { 'src/inv.vhd': INV, 'src/top.vhd': TOP } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('NoTopEmu');
  await page.eval(async () => { window.SilinxApp.S.project.top = ''; await window.SilinxApp.saveProjectJson(); window.SilinxApp.renderProcesses(); });
  await page.click('#task-switch .task-btn[data-task="emu"]');
  const emuNote = () => page.eval(() => { const n = document.querySelector('#task-emu-panel .task-no-top'); return n && n.getClientRects().length ? { text: n.querySelector('p').textContent, button: n.querySelector('button').textContent } : null; });
  await page.waitFor(() => !!document.querySelector('#task-emu-panel .task-no-top')?.getClientRects().length, [], { what: 'the note' });
  assert.deepEqual(await emuNote(), { text: 'No top module is set: the design is implemented from its top module, so set one to see its processes.', button: 'Set Top Module…' });
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#task-emu-bar .btn')].map((b) => `${b.textContent}${b.disabled ? ' (off)' : ''}`)), ['I/O Pin Planning (off)', 'Emulate on Board (off)'], 'its bar off (#1424)');
  await page.click('#task-emu-panel .task-no-top button');
  await page.waitDialog('Set Top Module');
  await page.eval(() => { document.querySelector('.dlg-overlay select').value = 'top'; });
  await page.dialogButton('OK');
  await page.waitFor(() => window.Silinx.project.top === 'top' && [...document.querySelectorAll('#task-emu-panel .lbl')].some((e) => e.textContent === 'Emulate on Board'), [], { what: 'its processes' });
  assert.equal(await emuNote(), null, 'no note with a top');
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}, { build: DEV });

// #1423: a reload in Implement with no top module: I/O Pin Planning off from the moment the app is shown (not on until
// the once-a-second check)
uiTest('#1423 Tasks ▸ Implement: a reload with no top module shows I/O Pin Planning off at once', E, async (page) => {
  await makeProject(env, { name: 'NoTopReload', top: '', files: { 'src/inv.vhd': INV, 'src/top.vhd': TOP } });
  await page.setViewport(1366, 768);
  await tasksInterface(page);
  await page.openProject('NoTopReload');
  await page.eval(async () => { window.SilinxApp.S.project.top = ''; await window.SilinxApp.saveProjectJson(); window.SilinxApp.renderProcesses(); });
  await page.click('#task-switch .task-btn[data-task="impl"]');
  await page.waitFor(() => document.querySelector('#task-impl-bar [data-act=pins]')?.disabled, [], { what: 'off' });
  // (its state noted at every change while the app is shown)
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__pins = []; new MutationObserver(() => {
    const app = document.getElementById('app'), b = document.querySelector('#task-impl-bar [data-act=pins]');
    if (!app || !b || getComputedStyle(app).visibility === 'hidden' || !b.getClientRects().length) return;
    if (window.__pins.at(-1) !== b.disabled) window.__pins.push(b.disabled);
  }).observe(document, { subtree: true, childList: true, attributes: true });` });
  await page.reload();
  await page.waitFor(() => window.Silinx?.project?.name === 'NoTopReload' && !document.documentElement.hasAttribute('data-starting') && document.documentElement.dataset.task === 'impl', [], { what: 'reopened', timeout: 30000 });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  assert.deepEqual(await page.eval(() => window.__pins), [true], 'off whenever shown');
}, { build: DEV, skip: chromeOnly });
