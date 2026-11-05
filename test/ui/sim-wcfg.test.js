// UI: the simulator's wave configuration as a file of the project (#1019, web/js/sim-wcfg.js, web/js/isim-wcfg.js):
// Save Wave Configuration and Load Wave Configuration in the ⋮ menu at the right end of the simulator's toolbar (#2839,
// web/js/toolbar-menu.js), not on the toolbar, no Save VCD; the menu from the keyboard (Enter / Space, the arrows, Esc);
// saved next to the test bench's source (a .wcfg, ISim's), the window changed, loaded back the same; the status line
// (#2785) unchanged; in the Silinx, ISE style and Tasks interfaces, and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, readWs } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
// (the Tasks interface is a development build's only, for now: #838)
const DEV = { commit: 'abc1234', date: '2026-10-21 12:00' };

const MORE = '.doc:not([hidden]) .isim-toolbar .tb-more-btn', MENU = '.doc:not([hidden]) .isim-toolbar .tb-more-menu';
// the menu's entries: their labels and tooltips; open or not; the focused element's label (or title)
const menuItems = (page) => page.eval((m) => [...document.querySelector(m).querySelectorAll('button')].map((b) => [b.textContent, b.title]), MENU);
const menuOpen = (page) => page.eval((m) => !document.querySelector(m).hidden && !!document.querySelector(m).getClientRects().length, MENU);
const focused = (page) => page.eval(() => document.activeElement?.classList.contains('tb-more-btn') ? 'more' : document.activeElement?.textContent);
// the menu's entry n clicked (0: Save, 1: Load), the menu opened first
async function choose(page, n) {
  await page.click(MORE);
  await page.click(`${MENU} button:nth-of-type(${n + 1})`);
}
// the status line (#2785): its fields' texts
const statusLine = (page) => page.eval(() => {
  const s = document.querySelector('.doc:not([hidden]) .isim-status');
  return { shared: s.classList.contains('doc-status'), fields: ['.isim-st-time', '.isim-st-delta'].map((q) => s.querySelector(q)?.textContent) };
});
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

for (const ui of ['silinx', 'ise', 'tasks']) {
  uiTest(`#1019 ${ui}: Save and Load Wave Configuration in the toolbar's ⋮ menu (#2839; no Save VCD), the keyboard, a file of the project, the status line, in Portuguese`, E, async (page) => {
    const name = `Wcfg${ui}`;
    await makeProject(env, { name, template: 'blinky' });
    await page.setViewport(1366, 768);
    await page.eval((u) => localStorage.setItem('silinx.ui', u), ui);
    await page.reload();
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await page.openProject(name);
    await page.eval(() => window.SilinxApp.runSimulation('tb_top'));
    await page.waitFor(() => /^isim:/.test(window.Silinx.active?.id || '') && window.Silinx.active.view && !window.Silinx.active.view.state.running
      && /Sim Time: 1,000,000 ps/.test(document.querySelector('.doc:not([hidden]) .isim-st-time')?.textContent || ''), [], { what: 'ISim ran', timeout: 30000 });
    // the toolbar: no Save nor Load, no VCD export; its ⋮ last, at its right end, on its first line (Tasks: in the wave
    // window's line, #1026), clear of the other tools
    const bar = await page.eval(() => {
      const tb = document.querySelector('.doc:not([hidden]) .isim-toolbar'), more = tb.querySelector('.tb-more-btn'), r = tb.getBoundingClientRect(), b = more.getBoundingClientRect();
      const first = tb.querySelector('.tb-btn').getBoundingClientRect();
      const others = [...tb.children].filter((e) => !e.classList.contains('tb-more') && e.getClientRects().length).map((e) => e.getBoundingClientRect());
      return { titles: [...tb.querySelectorAll(':scope > .tb-btn')].map((x) => x.title), last: tb.lastElementChild.classList.contains('tb-more'),
        more: [more.title, more.getAttribute('aria-haspopup'), more.getAttribute('aria-expanded')],
        firstLine: Math.abs(b.top - first.top) <= 3, atRight: r.right - b.right <= 10, clear: others.every((o) => o.right <= b.left + 1 || o.top >= b.bottom) };
    });
    assert.ok(!bar.titles.some((t) => /Wave Configuration|VCD/.test(t)), bar.titles.join(', '));
    assert.equal(bar.titles.at(ui === 'tasks' ? -1 : -2), ui === 'tasks' ? 'Edit Stimuli: click the waveforms of the inputs (as the HDL Bencher)' : 'Radix of selected signals');
    assert.deepEqual({ ...bar, titles: null }, { titles: null, last: true, more: ['Wave configuration (save, load)', 'menu', 'false'], firstLine: true, atRight: true, clear: true });
    if (ui === 'tasks') assert.ok(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .isim-wavewin > .caption .tb-more-btn')));
    const status = await statusLine(page);
    assert.deepEqual(status, { shared: true, fields: ['Sim Time: 1,000,000 ps', ''] });
    // the menu: closed at first; ⋮ opens it, with its two entries and their tooltips; Esc closes it
    assert.equal(await menuOpen(page), false);
    await page.click(MORE);
    assert.equal(await menuOpen(page), true);
    assert.deepEqual(await menuItems(page), [
      ['Save Wave Configuration…', "Save the wave window's signals, dividers, groups and markers to a .wcfg file of the project"],
      ['Load Wave Configuration…', 'Load a .wcfg file of the project into the wave window']]);
    assert.equal(await page.eval((m) => document.querySelector(m).getAttribute('aria-expanded'), MORE), 'true');
    await page.key('Escape');
    assert.equal(await menuOpen(page), false);
    // the keyboard: Enter opens it on its first entry, ↓ / ↑ move (round), Esc closes it back on ⋮; Space opens it too
    await page.eval((m) => document.querySelector(m).focus(), MORE);
    await page.key('Enter');
    assert.equal(await menuOpen(page), true);
    assert.equal(await focused(page), 'Save Wave Configuration…');
    await page.key('ArrowDown');
    assert.equal(await focused(page), 'Load Wave Configuration…');
    await page.key('ArrowDown');
    assert.equal(await focused(page), 'Save Wave Configuration…');
    await page.key('ArrowUp');
    assert.equal(await focused(page), 'Load Wave Configuration…');
    await page.key('Home');
    assert.equal(await focused(page), 'Save Wave Configuration…');
    await page.key('Escape');
    assert.deepEqual([await menuOpen(page), await focused(page)], [false, 'more']);
    await page.key(' ');
    assert.deepEqual([await menuOpen(page), await focused(page)], [true, 'Save Wave Configuration…']);
    // Load chosen with the keyboard, none saved yet: said; the menu closed
    await page.key('End');
    await page.key('Enter');
    await page.waitDialog('Load Wave Configuration');
    assert.match(await page.eval(() => [...document.querySelectorAll('.dlg-overlay')].pop().querySelector('.msg-text').textContent), /^The project has no wave configuration \(\.wcfg\) yet: save one first\.$/);
    await page.dialogButton('OK');
    await page.waitNoDialog();
    assert.equal(await menuOpen(page), false);
    // a divider, a radix and two markers; saved next to the test bench (its name offered)
    await page.eval(() => {
      const v = window.Silinx.active.view, s = v.getState();
      v.setState({ rows: [{ kind: 'div', name: 'Board' }, ...s.rows.map((r, i) => (i === 0 ? { ...r, radix: 'hex' } : r))], markers: [100000, 400000] });
    });
    const saved = await rows(page);
    await choose(page, 0);
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
    await choose(page, 1);
    await page.waitDialog('Load Wave Configuration');
    assert.deepEqual(await dialogText(page), { label: 'Wave configuration:', value: 'sim/tb_top.wcfg', options: ['sim/tb_top.wcfg'], buttons: ['Load', 'Cancel'] });
    await page.dialogButton('Load');
    await page.waitNoDialog();
    await page.waitFor(() => window.Silinx.active.view.state.rows.length > 0, [], { what: 'loaded' });
    assert.deepEqual(await rows(page), saved);
    assert.match(await lastIsimLine(page), /^Wave configuration sim\/tb_top\.wcfg loaded: \d+ signals, 2 markers$/);
    // the status line: as before, the markers' delta now shown
    assert.deepEqual((await statusLine(page)).fields[0], status.fields[0]);
    // in Portuguese: the ⋮, its entries, the dialogs; saved again over it: asked first
    await page.eval(async () => (await import('/js/i18n.js')).setLanguage('pt'));
    await page.waitFor((m) => document.querySelector(m)?.title === 'Configuração de formas de onda (guardar, carregar)', [MORE], { what: 'Portuguese' });
    await page.click(MORE);
    assert.deepEqual(await menuItems(page), [
      ['Guardar Configuração de Formas de Onda…', 'Guardar os sinais, divisores, grupos e marcadores da janela de formas de onda num ficheiro .wcfg do projeto'],
      ['Carregar Configuração de Formas de Onda…', 'Carregar um ficheiro .wcfg do projeto na janela de formas de onda']]);
    await page.key('Escape');
    await choose(page, 0);
    await page.waitDialog('Guardar Configuração de Formas de Onda');
    assert.equal((await dialogText(page)).label, 'Nome do ficheiro no projeto:');
    await page.dialogButton('OK');
    await page.waitFor(() => [...document.querySelectorAll('.dlg-overlay')].pop()?.querySelector('.msg-text')?.textContent === 'sim/tb_top.wcfg já existe. Substituí-lo?', [], { what: 'overwrite asked' });
    await page.dialogButton('Sim');
    await page.waitNoDialog();
    await choose(page, 1);
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
