// UI: Source Properties (#2254, #2255): a drawn source's language chosen there, its HDL file made again in it, kept
// when the project's Preferred Language changes; HDL written by hand keeps its own; no View Association; the Petri net
// editor without a language selector; in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const open = (page, file) => page.eval((f) => { import('/js/wizards.js').then((w) => w.sourceProperties(f)); }, file);
const labels = (page) => page.eval(() => [...document.querySelectorAll('.dlg-overlay .form-grid label')].map((l) => l.textContent));
const langField = (page) => page.eval(() => {
  const e = [...document.querySelectorAll('.dlg-overlay .form-grid label')].find((l) => /^(Language|Linguagem):$/.test(l.textContent)).nextElementSibling;
  return e.tagName === 'SELECT' ? { value: e.value, options: [...e.options].map((o) => o.textContent) } : { text: e.textContent };
});
async function choose(page, file, lang) {
  await open(page, file);
  await page.waitDialog(`Source Properties - ${file}`);
  await page.eval((l) => { const s = document.querySelector('.dlg-overlay .form-grid select'); s.value = l; s.dispatchEvent(new Event('change')); }, lang);
  await page.dialogButton('OK');
  await page.waitNoDialog();
}
// (linked, and the project read again to the end: a dialog opened while it is read works on the project before it)
const linked = async (page, hdl) => {
  await page.waitFor((h) => window.Silinx.hdlToSch?.[h], [hdl], { what: `${hdl} linked`, timeout: 15000 });
  await page.eval(async () => { let c; do { c = window.Silinx.reloadChain; await c; } while (c !== window.Silinx.reloadChain); });
};
const errors = (page) => page.eval(() => (window.Silinx.lib?.errors || []).filter((e) => e.severity === 'error' || e.severity === 'warning').map((e) => e.message));

uiTest('#2254 #2255 Source Properties: a drawn source\'s language: its own kept when the project\'s changes, back to the project\'s; the HDL by hand as it is; no View Association; kept on reopening', E, async (page) => {
  await makeProject(env, { name: 'SrcLang', template: 'traffic' });
  await page.openProject('SrcLang');
  const exists = (rel) => fs.existsSync(path.join(env.server.workspace, 'SrcLang', rel));
  await linked(page, 'src/traffic.vhd');
  const OPTIONS = ['Project Preferred Language', 'VHDL', 'Verilog'];
  // a drawing's HDL file: the choice, following the project
  await open(page, 'src/traffic.vhd');
  await page.waitDialog('Source Properties - src/traffic.vhd');
  assert.deepEqual(await labels(page), ['File:', 'Language:']);
  assert.deepEqual(await langField(page), { value: '', options: OPTIONS });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  // HDL written by hand: its file's language, no choice, no View Association
  await open(page, 'src/top.vhd');
  await page.waitDialog('Source Properties - src/top.vhd');
  assert.deepEqual(await labels(page), ['File:', 'Language:']);
  assert.deepEqual(await langField(page), { text: 'vhdl' });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  // Verilog: its HDL made again, the other drawing as it is
  await choose(page, 'src/traffic.vhd', 'verilog');
  await linked(page, 'src/traffic.v');
  assert.deepEqual([exists('src/traffic.v'), exists('src/traffic.vhd'), exists('src/lamps.vhd')], [true, false, true]);
  assert.deepEqual(await page.eval(() => window.Silinx.project.sourceLanguage), { 'src/traffic.fsm.json': 'verilog' });
  assert.deepEqual(await errors(page), []);
  // its own language kept on reopening, and when the project's changes
  await page.openProject('SrcLang');
  await linked(page, 'src/traffic.v');
  await open(page, 'src/traffic.fsm.json');
  await page.waitDialog('Source Properties - src/traffic.fsm.json');
  assert.deepEqual(await langField(page), { value: 'verilog', options: OPTIONS });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  await choose(page, 'src/traffic.v', 'vhdl');
  await linked(page, 'src/traffic.vhd');
  await page.menu('Project', 'Design Properties…');
  await page.waitDialog('Design Properties');
  await page.eval(() => {
    const p = [...document.querySelectorAll('.dlg-overlay label')].find((x) => x.textContent === 'Preferred Language:').nextElementSibling;
    p.value = 'verilog'; p.dispatchEvent(new Event('change'));
  });
  await page.dialogButton('OK');
  await page.waitNoDialog();
  // (the project read again: its last message)
  await page.waitConsole(/Preferred Language: Verilog \(1 drawing\(s\) now in it, their HDL made again in it\)\.\n.*Device set to/);
  await linked(page, 'src/lamps.v');
  assert.deepEqual([exists('src/traffic.vhd'), exists('src/lamps.v')], [true, true]);
  // back to the project's: its language, and no own one left
  await choose(page, 'src/traffic.vhd', '');
  await linked(page, 'src/traffic.v');
  assert.equal(await page.eval(() => window.Silinx.project.sourceLanguage ?? null), null);
  assert.deepEqual(await errors(page), []);
});

uiTest('#2254 the Petri net editor has no language selector; its language set in Source Properties, the editor following; in Portuguese', E, async (page) => {
  const net = { kind: 'petri', name: 'ctl', lang: 'vhdl', inputs: [], outputs: [], places: [], transitions: [], arcs: [] };
  await makeProject(env, { name: 'SrcLangPn', files: { 'src/ctl.pn.json': JSON.stringify(net) } });
  await page.openProject('SrcLangPn');
  await page.eval(async () => (await import('/js/drawings.js')).openPetri('src/ctl.pn.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .petri-editor'), [], { what: 'the Petri net editor' });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .petri-editor select[title="HDL language"]')), null);
  await page.waitFor(() => window.Silinx.hdlToSch?.['src/ctl.vhd'], [], { what: 'its HDL file' });
  await choose(page, 'src/ctl.pn.json', 'verilog');
  await linked(page, 'src/ctl.v');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .petri-editor .pn-link')?.dataset.hdl === 'ctl.v', [], { what: 'the link follows' });
  await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
  try {
    await open(page, 'src/ctl.pn.json');
    await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay option')].some((o) => o.textContent === 'Linguagem Preferida do Projeto'), [], { what: 'in Portuguese' });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
  } finally { await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en')); }
});
