// UI: the simulator's wave configuration as a file of the project (#1019, web/js/sim-wcfg.js, web/js/isim-wcfg.js):
// Save Wave Configuration and Load Wave Configuration in the simulator's toolbar, no Save VCD; saved next to the test
// bench's source (a .wcfg, ISim's), the window changed, loaded back the same; in the modern, classic and Tasks
// interfaces, and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// (the Tasks interface is a development build's only, for now: #838)
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };

const SAVE = '.doc:not([hidden]) .isim .tb-btn[title="Save Wave Configuration"]', LOAD = '.doc:not([hidden]) .isim .tb-btn[title="Load Wave Configuration"]';
// the wave window's rows and markers
const rows = (page) => page.eval(() => {
  const st = window.Silinx.active.view.state;
  return { rows: st.rows.map((r) => [r.kind, r.name, r.radix ?? null]), markers: st.markers.map((m) => m.t) };
});
const lastIsimLine = (page) => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-console .isim-ln')].pop()?.textContent);
// the dialog's label and the select's options
const dialogText = (page) => page.eval(() => {
  const d = [...document.querySelectorAll('.dlg-overlay')].pop();
  return { label: d.querySelector('label')?.textContent, value: d.querySelector('input')?.value ?? d.querySelector('select')?.value,
    options: [...d.querySelectorAll('option')].map((o) => o.textContent), buttons: [...d.querySelectorAll('.dlg-buttons .btn')].map((b) => b.textContent) };
});

for (const ui of ['modern', 'classic', 'tasks']) {
  uiTest(`#1019 ${ui}: Save and Load Wave Configuration in the simulator's toolbar (no Save VCD), a file of the project, in Portuguese`, E, async (page) => {
    const name = `Wcfg${ui}`;
    await makeProject(env, { name, template: 'blinky' });
    await page.setViewport(1366, 768);
    await page.eval((u) => localStorage.setItem('silinx.ui', u), ui);
    await page.reload();
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await page.openProject(name);
    await page.eval(() => window.SilinxApp.runSimulation('tb_top'));
    await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running
      && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || ''), [], { what: 'ISim ran', timeout: 30000 });
    // the toolbar: Save and Load, no VCD export (Tasks: in the wave window's line, #1026)
    const titles = await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .isim-toolbar .tb-btn')].map((b) => b.title));
    const at = titles.indexOf('Save Wave Configuration');
    assert.deepEqual(titles.slice(at - 1, at + 2), ['Radix of selected signals', 'Save Wave Configuration', 'Load Wave Configuration']);
    assert.ok(!titles.some((t) => /VCD/.test(t)), titles.join(', '));
    if (ui === 'tasks') assert.ok(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .isim-wavewin > .caption .tb-btn[title="Load Wave Configuration"]')));
    // Load with none saved yet: said
    await page.click(LOAD);
    await page.waitDialog('Load Wave Configuration');
    assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent), /^The project has no wave configuration \(\.wcfg\) yet: save one first\.$/);
    await page.dialogButton('OK');
    await page.waitNoDialog();
    // a divider, a radix and two markers; saved next to the test bench (its name offered)
    await page.eval(() => {
      const v = window.Silinx.active.view, s = v.getState();
      v.setState({ rows: [{ kind: 'div', name: 'Board' }, ...s.rows.map((r, i) => (i === 0 ? { ...r, radix: 'hex' } : r))], markers: [100000, 400000] });
    });
    const saved = await rows(page);
    await page.click(SAVE);
    await page.waitDialog('Save Wave Configuration');
    assert.deepEqual(await dialogText(page), { label: 'File name in the project:', value: 'sim/tb_top.wcfg', options: [], buttons: ['OK', 'Cancel'] });
    await page.dialogButton('OK');
    await page.waitNoDialog();
    await page.waitFor(() => /^Wave configuration saved to sim\/tb_top\.wcfg$/.test([...document.querySelectorAll('.doc:not([hidden]) .isim-console .isim-ln')].pop()?.textContent || ''), [], { what: 'saved' });
    const text = await readWs(env, name, 'sim/tb_top.wcfg');
    assert.match(text, /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<wave_config>/);
    assert.match(text, /<obj_property name="label">Board<\/obj_property>/);
    assert.match(text, /<obj_property name="Radix">HEXRADIX<\/obj_property>/);
    assert.match(text, /<marker time="100000" label="" \/>\n {6}<marker time="400000" label="" \/>/);
    // the window changed, then loaded back: as it was
    await page.eval(() => window.Silinx.active.view.setState({ rows: [], markers: [] }));
    assert.deepEqual((await rows(page)).rows, []);
    await page.click(LOAD);
    await page.waitDialog('Load Wave Configuration');
    assert.deepEqual(await dialogText(page), { label: 'Wave configuration:', value: 'sim/tb_top.wcfg', options: ['sim/tb_top.wcfg'], buttons: ['Load', 'Cancel'] });
    await page.dialogButton('Load');
    await page.waitNoDialog();
    await page.waitFor(() => window.Silinx.active.view.state.rows.length > 0, [], { what: 'loaded' });
    assert.deepEqual(await rows(page), saved);
    assert.match(await lastIsimLine(page), /^Wave configuration sim\/tb_top\.wcfg loaded: \d+ signals, 2 markers$/);
    // in Portuguese: the buttons, the dialogs; saved again over it: asked first
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.waitFor(() => !!document.querySelector('.doc:not([hidden]) .isim .tb-btn[title="Guardar Configuração de Formas de Onda"]'), [], { what: 'Portuguese' });
    assert.ok(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .isim .tb-btn[title="Carregar Configuração de Formas de Onda"]')));
    await page.click('.doc:not([hidden]) .isim .tb-btn[title="Guardar Configuração de Formas de Onda"]');
    await page.waitDialog('Guardar Configuração de Formas de Onda');
    assert.equal((await dialogText(page)).label, 'Nome do ficheiro no projeto:');
    await page.dialogButton('OK');
    await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('.msg-text')?.textContent === 'sim/tb_top.wcfg já existe. Substituí-lo?', [], { what: 'overwrite asked' });
    await page.dialogButton('Sim');
    await page.waitNoDialog();
    await page.click('.doc:not([hidden]) .isim .tb-btn[title="Carregar Configuração de Formas de Onda"]');
    await page.waitDialog('Carregar Configuração de Formas de Onda');
    assert.deepEqual(await dialogText(page), { label: 'Configuração de formas de onda:', value: 'sim/tb_top.wcfg', options: ['sim/tb_top.wcfg'], buttons: ['Carregar', 'Cancelar'] });
    await page.dialogButton('Cancelar');
    await page.waitNoDialog();
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('en'));
    // no warnings
    assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
    assert.equal(await page.eval(() => document.getElementById('warn-count').textContent), '');
  }, ui === 'tasks' ? { build: DEV } : {});
}
