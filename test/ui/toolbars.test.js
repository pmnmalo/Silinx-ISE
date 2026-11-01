// UI (#1409): the documents' toolbars alike in the Silinx interface (the Tasks layout): the HDL editor's, the schematic's,
// the truth table's, the ASM and FSM editors', SSim's, the board emulator's, the pin planner's, one height, the same
// padding, every button, icon button and field in them as high (--m-tool-h), light and dark; a page's fields as high as
// its buttons (Find in Project); on a touch screen every button 40 px, a tree's rows 32 px, the tools 36 px; the ISE style
// interface's toolbars as before; a toolbar with a menu at the right of its first line keeps the menu's place free (#2331).
// No warnings.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

async function boot(page, { ui = 'tasks', theme = 'light' } = {}) {
  await page.eval((u, t) => { localStorage.setItem('silinx.ui', u); localStorage.setItem('silinx.theme', t); }, ui, theme);
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
}
async function noWarnings(page) {
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn').map((c) => c.text), []);
}
const go = async (page, t) => {
  await page.click(`#task-switch .task-btn[data-task="${t}"]`);
  await page.waitFor((x) => document.documentElement.dataset.task === x, [t], { what: `task ${t}` });
};
const BARS = '.editor-bar, .doc-toolbar, .isim-toolbar, .tt-toolbar, .se-toolbar, .asm-toolbar, .emu-bar, .pp-bar';
const CONTROLS = '.btn, .tb-btn, .se-btn, .asm-btn, select, input:not([type]), input[type=text], input[type=number]';
// the toolbar of the document in front: its height (one row: the first row's), padding, and its controls' heights
const toolbar = (page) => page.eval((bars, controls) => {
  const vis = (e) => e.getClientRects().length > 0 && e.getBoundingClientRect().width > 0;
  const doc = [...document.querySelectorAll('#workspace > .doc')].find(vis);
  const bar = [...doc.querySelectorAll(bars)].find(vis);
  const c = getComputedStyle(bar);
  const ctl = [...bar.querySelectorAll(controls)].filter(vis);
  const more = bar.querySelector('.se-more, .tb-more');
  // (its menu's button right of every other control: the place kept free, #2331)
  const clear = more && ctl.filter((e) => !more.contains(e)).every((e) => e.getBoundingClientRect().right <= more.getBoundingClientRect().left);
  return { min: c.minHeight, pad: c.padding, bg: c.backgroundColor, menu: !!more, clear,
    controls: [...new Set(ctl.map((e) => Math.round(e.getBoundingClientRect().height)))], n: ctl.length };
}, BARS, CONTROLS);

for (const theme of ['light', 'dark']) {
  uiTest(`#1409 the documents' toolbars alike (${theme}): one height, one padding, every control as high`, E, async (page) => {
    for (const [n, t] of [['Blinky', 'blinky'], ['Gates', 'gates'], ['Traffic', 'traffic']]) await makeProject(env, { name: `${n}-${theme}`, template: t });
    await page.setViewport(1440, 900);
    await boot(page, { theme });
    const bars = {};
    const open = async (pj, file, name) => {
      if (await page.eval(() => window.SilinxApp.S.project?.name) !== pj) await page.openProject(pj);
      await go(page, 'edit');
      await page.eval((f) => window.SilinxApp.openFile(f), file);
      await page.waitFor((f) => window.SilinxApp.S.active?.path === f || window.SilinxApp.S.active?.id?.includes(f), [file], { what: file }).catch(() => {});
      await page.waitFor((b) => [...document.querySelectorAll('#workspace > .doc')].some((d) => d.getClientRects().length && d.querySelector(b)), [BARS], { what: `${name}'s toolbar` });
      bars[name] = await toolbar(page);
    };
    await open(`Blinky-${theme}`, 'src/knight.vhd', 'hdl');
    await open(`Blinky-${theme}`, 'src/speed_ctrl.asm.json', 'asm');
    await open(`Gates-${theme}`, 'src/gates.sch.json', 'schematic');
    await open(`Traffic-${theme}`, 'src/lamps.bool.json', 'truth table');
    await open(`Traffic-${theme}`, 'src/traffic.fsm.json', 'fsm');
    await page.openProject(`Blinky-${theme}`);
    await go(page, 'sim');
    await page.click('#task-sim-panel .task-sim-bench .row');
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-toolbar')?.getClientRects().length > 0, [], { what: 'the simulation', timeout: 60000 });
    bars.ssim = await toolbar(page);
    await go(page, 'emu');
    await page.click('#task-emu-bar .btn', { index: 1 });
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-bar')?.getClientRects().length > 0, [], { what: 'the emulator', timeout: 60000 });
    bars.emulator = await toolbar(page);
    await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-bar .btn')?.click());   // (paused)
    await go(page, 'impl');
    await page.click('#task-impl-bar .btn', { index: 0 });
    await page.waitFor(() => document.querySelector('.doc:not([hidden]) .pp-bar')?.getClientRects().length > 0, [], { what: 'the pin planner' });
    bars['pin planner'] = await toolbar(page);
    for (const [name, b] of Object.entries(bars)) {
      assert.ok(b.n > 0, `${name}: its controls`);
      // (SSim's toolbar is its wave window's line in the Tasks interface: the line's height and padding)
      // (a toolbar with a menu, #2208: the menu's place kept free at the right, the same padding otherwise, #2331)
      const want = name === 'ssim' ? { min: '0px', pad: '6px 0px', controls: [28] } : { min: '40px', pad: b.menu ? '6px 40px 6px 8px' : '6px 8px', controls: [28] };
      assert.deepEqual({ min: b.min, pad: b.pad, controls: b.controls }, want, `${name}: ${JSON.stringify(b)}`);
      if (b.menu) assert.ok(b.clear, `${name}: its menu clear of the other controls`);
    }
    assert.ok(bars.schematic.menu, 'the schematic toolbar\'s menu (#2208)');
    // a page's fields as high as its buttons: Find in Project
    await go(page, 'edit');
    await page.eval(() => window.SilinxApp.S.menus.find((m) => m.label === 'Edit').items().find((i) => i?.label === 'Find in Project…').action());
    await page.waitFor(() => [...document.querySelectorAll('#workspace > .doc .page input[type=text]')].some((e) => e.getClientRects().length), [], { what: 'Find in Project' });
    assert.deepEqual(await page.eval(() => {
      const d = [...document.querySelectorAll('#workspace > .doc')].find((x) => x.getClientRects().length);
      const hs = (s) => [...new Set([...d.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().height)))];
      return { fields: hs('input[type=text]'), buttons: hs('.btn') };
    }), { fields: [32], buttons: [32] });
    await noWarnings(page);
  }, { timeout: 180000 });
}

// SSim's toolbar in the Tasks interface: its wave window's line as high as the other documents' toolbars
uiTest('#1409 SSim\'s toolbar line as high as the other toolbars', E, async (page) => {
  await makeProject(env, { name: 'SimLine', template: 'blinky' });
  await page.setViewport(1440, 900);
  await boot(page);
  await page.openProject('SimLine');
  await page.eval(() => window.SilinxApp.openFile('src/knight.vhd'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .editor-bar')?.getClientRects().length > 0, [], { what: 'the HDL' });
  const hdl = await page.eval(() => Math.round(document.querySelector('.doc:not([hidden]) .editor-bar').getBoundingClientRect().height));
  await go(page, 'sim');
  await page.click('#task-sim-panel .task-sim-bench .row');
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim-wavewin > .caption .isim-toolbar')?.getClientRects().length > 0, [], { what: 'the simulation', timeout: 60000 });
  const line = await page.eval(() => Math.round(document.querySelector('.doc:not([hidden]) .isim-wavewin > .caption').getBoundingClientRect().height));
  assert.deepEqual([hdl, line], [41, 41], 'the toolbars 40 px and their line');
  await noWarnings(page);
}, { timeout: 120000 });

// a touch screen: every button 40 px (the header's, the side panel's bars', a dialog's), a tree's rows 32 px, a document's tools 36 px
uiTest('#1409 a touch screen: every button 40 px, the rows 32 px, a document\'s tools 36 px', E, async (page) => {
  await makeProject(env, { name: 'Touch', template: 'blinky' });
  await boot(page);
  await page.openProject('Touch');
  await page.eval(() => window.SilinxApp.openFile('src/knight.vhd'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .editor-bar')?.getClientRects().length > 0, [], { what: 'the HDL' });
  assert.deepEqual(await page.eval(() => {
    const hs = (s) => [...new Set([...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().height)))];
    return { header: hs('#topbar .tb-btn'), tasks: hs('#task-switch .task-btn'), bar: hs('#task-src-bar .btn'), rows: hs('#hier .row'),
      tools: hs('.doc:not([hidden]) .editor-bar :is(.btn, .tb-btn)') };
  }), { header: [40], tasks: [40], bar: [40], rows: [32], tools: [36] });
  await noWarnings(page);
}, { tablet: 'landscape' });

// the ISE style interface: its toolbars as before (ISE's sizes)
uiTest('#1409 ISE style: the toolbars as before', E, async (page) => {
  await makeProject(env, { name: 'IseStyle', template: 'gates' });
  await boot(page, { ui: 'ise' });
  await page.openProject('IseStyle');
  await page.eval(() => window.SilinxApp.openFile('src/gates.sch.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .se-toolbar')?.getClientRects().length > 0, [], { what: 'the schematic' });
  await page.eval(() => window.SilinxApp.openFile('src/gates.vhd'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .editor-bar')?.getClientRects().length > 0, [], { what: 'the HDL' });
  assert.deepEqual(await page.eval(() => {
    const hs = (s) => [...new Set([...document.querySelectorAll(s)].filter((e) => e.getClientRects().length).map((e) => Math.round(e.getBoundingClientRect().height)))];
    return { header: hs('#toolbar .tb-btn'), hdl: hs('.doc:not([hidden]) .editor-bar .tb-btn'), pad: getComputedStyle(document.querySelector('.doc:not([hidden]) .editor-bar')).padding };
  }), { header: [22], hdl: [22], pad: '2px 4px' });
  await noWarnings(page);
});
