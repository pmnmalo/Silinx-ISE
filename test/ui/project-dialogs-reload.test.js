// UI (#2281): Design Properties and Process Properties keep their choices when a project reload ends while they are
// open, or after their OK; a reload reads the project after the saves asked before it.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// api.project / api.saveProject answering `ms` late (a reload, a save still on its way)
const slow = (page, fn, ms) => page.eval(async (f, d) => {
  const { api } = await import('/js/api.js');
  window.__orig ||= {};
  window.__orig[f] ||= api[f];
  api[f] = async (...a) => { const r = await window.__orig[f](...a); await new Promise((z) => setTimeout(z, d)); return r; };
}, fn, ms);
const restore = (page) => page.eval(async () => { const { api } = await import('/js/api.js'); Object.assign(api, window.__orig || {}); window.__orig = {}; });
const reload = (page) => page.eval(() => { import('/js/project.js').then((p) => p.reloadProject(false)); });
const settled = (page) => page.eval(async () => { let c; do { c = window.Silinx.reloadChain; await c; } while (c !== window.Silinx.reloadChain); });
const pick = (page, label, value) => page.eval((l, v) => {
  const s = [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === l).nextElementSibling;
  s.value = v; s.dispatchEvent(new Event('change'));
}, label, value);
const saved = async (name) => JSON.parse(await readWs(env, name, 'silinx.json'));

uiTest('#2281 Design Properties: the Preferred Language kept when a reload ends while it is open, or after its OK', E, async (page) => {
  await makeProject(env, { name: 'DlgReload', template: 'empty' });
  await page.openProject('DlgReload');
  // the reload ends while the dialog is open
  await slow(page, 'project', 1000);
  await reload(page);
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await settled(page);
  await pick(page, 'Preferred Language:', 'verilog');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitConsole(/Preferred Language: Verilog\./);
  await settled(page);
  assert.equal(await page.eval(() => window.Silinx.project.preferredLanguage), 'verilog');
  assert.equal((await saved('DlgReload')).preferredLanguage, 'verilog');
  // the reload ends after the OK
  await reload(page);
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await pick(page, 'Preferred Language:', 'vhdl');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitConsole(/Preferred Language: VHDL\./);
  await settled(page);
  await restore(page);
  assert.equal(await page.eval(() => window.Silinx.project.preferredLanguage), 'vhdl');
  assert.equal((await saved('DlgReload')).preferredLanguage, 'vhdl');
  assert.doesNotMatch(await page.consoleText(), /WARNING|ERROR/);
});

uiTest('#2281 Process Properties: the Optimization Goal kept when a reload ends while it is open', E, async (page) => {
  await makeProject(env, { name: 'DlgReloadImpl', template: 'empty' });
  await page.openProject('DlgReloadImpl');
  await slow(page, 'project', 1000);
  await reload(page);
  await page.eval(() => { import('/js/wizards.js').then((w) => w.implProperties()); });
  await page.waitDialog('Process Properties - Synthesis / Implementation / Bitstream');
  await settled(page);
  await pick(page, 'Optimization Goal:', 'Area');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await settled(page);
  await restore(page);
  await page.waitFor(() => window.Silinx.project.impl?.optMode === 'Area', [], { what: 'in the project' });
  assert.equal((await saved('DlgReloadImpl')).impl.optMode, 'Area');
});

uiTest('#2281 a reload asked after a save reads the project the save wrote', E, async (page) => {
  await makeProject(env, { name: 'SaveReload', template: 'empty' });
  await page.openProject('SaveReload');
  await slow(page, 'saveProject', 800);
  await page.eval(async () => {
    const { saveProjectJson } = await import('/js/design.js');
    const { reloadProject } = await import('/js/project.js');
    window.Silinx.project.preferredLanguage = 'verilog';
    await Promise.all([saveProjectJson(), reloadProject(false)]);
  });
  await restore(page);
  assert.equal(await page.eval(() => window.Silinx.project.preferredLanguage), 'verilog');
  assert.equal((await saved('SaveReload')).preferredLanguage, 'verilog');
});
