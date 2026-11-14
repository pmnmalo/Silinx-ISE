// UI: a 7-series project's Place & Route in Process Properties (#3825): one seed by default, or the best of 3 seeds (router2:
// seeds 1, 2 and 3, the best Fmax kept); the choice saved in the project (impl.xc7Seeds) and shown again; translated in
// Portuguese; a Spartan-3E project has no such field. Both interfaces.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const TOP = 'module top(input clk, output reg led);\n  always @(posedge clk) led <= ~led;\nendmodule\n';

// Implement Design's Process Properties: its fields (a label, or a select's options and value)
async function props(page, proc = 'Implement Design', item = 'Process Properties…') {
  await page.treeRow('#procs', proc, { right: true, exact: true });
  await page.click('body > .menu-popup .mi', { text: item });
  await page.waitForSelector('.dlg-overlay select');
  return page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid > *')].map((e) => e.tagName === 'SELECT' ? `${[...e.options].map((o) => o.text).join('|')} = ${e.value}` : e.textContent.trim()).filter(Boolean));
}
// the implementation's processes shown (the Silinx interface's task, or ISE's view)
async function implView(page) {
  if (await page.eval(() => !!document.querySelector('#task-switch .task-btn[data-task="impl"]'))) await page.click('#task-switch .task-btn[data-task="impl"]');
  else await page.setView('impl');
}
const seedsField = (fields, label) => fields.slice(fields.indexOf(label), fields.indexOf(label) + 2);

uiTest('#3825 Process Properties: a 7-series project\'s Place & Route, one seed or the best of 3, saved; Portuguese; none on a Spartan-3E', E, async (page) => {
  await makeProject(env, { name: 'Xc7Seeds', board: 'basys3', files: { 'src/top.v': TOP }, top: 'top' });
  const pj = await env.server.api('GET', '/api/projects/Xc7Seeds');
  delete pj.fileTree;
  await env.server.api('PUT', '/api/projects/Xc7Seeds', { ...pj, synthTool: 'silinx' });
  await page.openProject('Xc7Seeds');
  await implView(page);
  const fields = await props(page);
  assert.deepEqual(seedsField(fields, 'Place & Route (7-series):'), ['Place & Route (7-series):', 'One seed|Best of 3 seeds (router2) = 1'], fields.join('\n'));
  assert.ok(!fields.includes('Map (Spartan-6):'), fields.join('\n'));
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('pt');
  try {
    const pt = await props(page, 'Implementar Projeto', 'Propriedades do Processo…');
    assert.deepEqual(seedsField(pt, 'Posicionar e Encaminhar (série 7):'), ['Posicionar e Encaminhar (série 7):', 'Uma semente|A melhor de 3 sementes (router2) = 1'], pt.join('\n'));
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await setLang('en'); }
  // the best of 3 chosen and saved, shown again; then one seed again: the property dropped
  const choose = (v) => page.eval((x) => {
    const s = [...document.querySelectorAll('.dlg-overlay .form-grid > *')].find((e) => e.textContent.trim() === 'Place & Route (7-series):').nextElementSibling;
    s.value = x; s.dispatchEvent(new Event('change', { bubbles: true }));
  }, v);
  await props(page);
  await choose('3');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(async () => (await (await fetch('/api/projects/Xc7Seeds')).json()).impl?.xc7Seeds === 3, [], { what: 'the seeds saved' });
  assert.deepEqual(seedsField(await props(page), 'Place & Route (7-series):')[1], 'One seed|Best of 3 seeds (router2) = 3');
  await choose('1');
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await page.waitFor(async () => !('xc7Seeds' in ((await (await fetch('/api/projects/Xc7Seeds')).json()).impl || {})), [], { what: 'the seeds dropped' });

  // a Spartan-3E project: no such field
  await makeProject(env, { name: 'S3Seeds', template: 'blinky', board: 'basys2' });
  await page.openProject('S3Seeds');
  await implView(page);
  const s3 = await props(page);
  assert.ok(!s3.includes('Place & Route (7-series):'), s3.join('\n'));
  await page.dialogButton('Cancel');
  await page.waitNoDialog();
});
