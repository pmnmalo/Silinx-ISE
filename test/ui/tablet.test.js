// UI on a tablet (#1130): the app as a tablet runs it, at its size in landscape and in portrait, with touch (a coarse
// pointer, no hover) and acted on by taps, in the interface of the run (modern, or classic with SILINX_UI_INTERFACE)
// and in the Tasks interface: the page fits the screen, the menus and a dialog by taps, a file opened, Simulate, the
// Board Emulator's switch and its LEDs, Implement with the Silinx toolchain, the programming panel. The harness makes
// the page a tablet's (uiTest's `tablet`: harness.js TABLET), in Chrome an Android tablet's, in WebKit an iPad's.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject, TABLET } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;
const DEV = { commit: 'abc1234', date: '2026-10-23 12:00' };   // (the Tasks interface: a development build's, #838)

// the page and its header and toolbar fit the screen: no sideways scroll, nothing cut off
const fits = (page) => page.eval(() => ({
  page: document.documentElement.scrollWidth <= innerWidth,
  over: [...document.querySelectorAll('#topbar, #menubar, #toolbar, #task-tabs')].filter((e) => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map((e) => e.id),
}));
// a menu's item by taps: its title, then the item (no hover: a finger)
async function tapMenu(page, menu, item) {
  await page.tap('#menubar .item', { text: menu });
  await page.waitFor(() => document.querySelector('body > .menu-popup:not(.sub) .mi'), [], { what: `menu ${menu} open` });
  await page.tap('body > .menu-popup:not(.sub) > .mi', { text: item });
}
// a task by a tap (the modern interface, its layout by tasks: the header's switcher, the bottom tab bar on a narrow
// screen), then its action: the empty page's button, or the task's bar's (#1149)
async function tapTask(page, task) {
  const bar = await page.eval(() => (document.getElementById('task-tabs')?.getClientRects().length ? '#task-tabs' : '#task-switch'));
  await page.tap(`${bar} .task-btn[data-task="${task}"]`);
  await page.waitFor((t) => document.documentElement.dataset.task === t, [task], { what: `task ${task}` });
}
async function tapAction(page) {
  await page.tap(await page.eval(() => (document.getElementById('task-empty')?.getClientRects().length ? '#task-empty .m-step' : '#task-bar .task-main')));
}
// a box on the screen, wholly (a button a finger reaches)
const onScreen = (page, sel) => page.eval((s) => {
  const e = [...document.querySelectorAll(s)].find((x) => x.getClientRects().length);
  if (!e) return null;
  const r = e.getBoundingClientRect();
  return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
}, sel);

for (const orientation of ['landscape', 'portrait']) {
  const { width, height } = TABLET[orientation];

  uiTest(`#1130 tablet in ${orientation} (${width} x ${height}): the page fits the screen; a menu and a dialog by taps; a file opened`, E, async (page) => {
    assert.deepEqual(await page.eval(() => [matchMedia('(pointer: coarse)').matches, matchMedia('(hover: none)').matches, innerWidth, innerHeight]), [true, true, width, height]);
    assert.deepEqual(await fits(page), { page: true, over: [] }, 'the Start page');
    // File ▸ New Project… by taps: its dialog, on the screen; Cancel by a tap
    await tapMenu(page, 'File', 'New Project…');
    await page.waitDialog('New Project');
    assert.equal(await onScreen(page, '.dlg-overlay .dlg'), true, 'the dialog on the screen');
    await page.tap('.dlg-overlay .dlg-buttons .btn', { text: 'Cancel' });
    await page.waitNoDialog();
    // a project and one of its files
    await makeProject(env, { name: `Tab${orientation}`, template: 'blinky' });
    await page.openProject(`Tab${orientation}`);
    assert.deepEqual(await fits(page), { page: true, over: [] }, 'a project open');
    await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
    await page.waitFor(() => window.Silinx.active?.id === 'file:src/top.vhd' && window.Silinx.active.editor, [], { what: 'the editor' });
    assert.deepEqual(await fits(page), { page: true, over: [] }, 'a file open');
  }, { tablet: orientation });

  uiTest(`#1130 tablet in ${orientation}: Simulate, Emulate (the switch and the LEDs), Implement and the board's programming by taps on the tasks`, E, async (page) => {
    await env.server.api('PUT', '/api/toolchain', { mode: 'silinx' });
    try {
      await makeProject(env, { name: `TabFlow${orientation}`, template: 'blinky' });
      await page.openProject(`TabFlow${orientation}`);
      // Simulate (the test bench): its waves
      await tapTask(page, 'sim');
      await tapAction(page);
      await page.waitFor(() => document.querySelector('.doc:not([hidden]) .isim'), [], { what: 'the simulator', timeout: 60000 });
      assert.deepEqual(await fits(page), { page: true, over: [] }, 'the simulator');
      // the Board Emulator: sw(3) inverts the LEDs; tapped, they change
      await tapTask(page, 'emu');
      await tapAction(page);
      await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'the emulator', timeout: 60000 });
      assert.deepEqual(await fits(page), { page: true, over: [] }, 'the emulator');
      const before = await page.eval(() => window.Silinx.active.view.outputs.leds.map((v) => (v > 0.5 ? 1 : 0)).join(''));
      // (SW3, by the start of its tooltip "SW3 = sw<3> (pin …)")
      const sw3 = await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) [title]')].findIndex((e) => e.title.startsWith('SW3 = ')));
      assert.ok(sw3 >= 0, 'SW3 on the board');
      assert.equal(await page.eval((i) => { const r = document.querySelectorAll('.doc:not([hidden]) [title]')[i].getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }, sw3), true, 'SW3 on the screen');
      await page.tap('.doc:not([hidden]) [title]', { index: sw3 });
      await page.waitFor((b) => window.Silinx.active.view.outputs.leds.map((v) => (v > 0.5 ? 1 : 0)).join('') !== b, [before], { what: 'the LEDs inverted', timeout: 10000 });
      // Implement (the Silinx toolchain): the bitstream
      await tapTask(page, 'impl');
      await tapAction(page);
      await page.waitFor(() => ['ok', 'warn'].includes(window.Silinx.status.bitgen), [], { what: 'Generate Programming File done', timeout: 180000 });
      await page.waitConsole(/=== SILINX DONE ===/);
      // iMPACT, from the Design Summary's Program the board… (Implement's, no Program task: #1172)
      await page.waitFor(() => document.querySelector('.doc:not([hidden]) .task-program button')?.getClientRects().length, [], { what: 'the summary\'s Program the board…' });
      await page.tap('.doc:not([hidden]) .task-program button');
      await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .btn.primary')].some((b) => b.textContent === 'Program FPGA'), [], { what: 'iMPACT' });
      // the programming panel: Program FPGA on the screen, for a finger
      assert.equal(await onScreen(page, '.doc:not([hidden]) .btn.primary'), true, 'Program FPGA on the screen');
      assert.deepEqual(await fits(page), { page: true, over: [] }, 'iMPACT');
    } finally {
      await env.server.api('PUT', '/api/toolchain', { mode: 'local' });
    }
  }, { tablet: orientation, timeout: 300000, ui: 'modern' });   // (the tasks: the modern interface's, #1149)

  uiTest(`#1130 tablet in ${orientation}: the Tasks interface fits, its tasks by taps`, E, async (page) => {
    await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
    await page.reload();
    await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
    await makeProject(env, { name: `TabTasks${orientation}`, template: 'blinky' });
    await page.openProject(`TabTasks${orientation}`);
    assert.deepEqual(await fits(page), { page: true, over: [] });
    const bar = orientation === 'portrait' ? '#task-tabs' : '#task-switch';
    for (const task of ['sim', 'emu', 'impl', 'edit']) {
      await page.tap(`${bar} .task-btn[data-task="${task}"]`);
      await page.waitFor((t) => document.documentElement.dataset.task === t, [task], { what: `task ${task}` });
      assert.deepEqual(await fits(page), { page: true, over: [] }, task);
    }
  }, { tablet: orientation, build: DEV });
}

// #1179: a symbol dragged from the palette onto the sheet by a finger goes on being placed (a tap on the sheet places
// another, until Select or Esc); dropped with the mouse, it is selected and Select is the tool again, as before
const dropSymbol = (page, type, at) => page.eval((t, x, y) => {
  const dt = new DataTransfer();
  dt.setData('text/x-silinx-symbol', JSON.stringify({ type: t, params: {} }));
  document.querySelector('.doc:not([hidden]) .sch-editor .se-canvas').dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: dt }));
}, type, at.x, at.y);
const placing = (page) => page.eval(() => ({ tool: document.querySelector('.doc:not([hidden]) .sch-editor .se-canvas').dataset.tool ?? 'select', n: window.Silinx.active.schEditor.getDoc().symbols.length }));
async function openGates(page, name) {
  await makeProject(env, { name, template: 'gates' });
  await page.openProject(name);
  await page.eval(() => window.SilinxApp.openSch('src/gates.sch.json'));
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .sch-editor .se-symrow'), [], { what: 'the schematic editor' });
  return page.eval(() => { const r = document.querySelector('.doc:not([hidden]) .sch-editor .se-canvas').getBoundingClientRect(); return { x: r.left + r.width * 0.75, y: r.top + r.height * 0.75 }; });
}
uiTest('#1179 tablet: a symbol dragged from the palette goes on being placed by taps on the sheet', E, async (page) => {
  const at = await openGates(page, 'TabDrop');
  const n0 = (await placing(page)).n;
  await dropSymbol(page, 'and2', at);
  assert.deepEqual(await placing(page), { tool: 'place', n: n0 + 1 });
  await page.tap({ x: at.x - 90, y: at.y - 70 });
  await page.waitFor((n) => window.Silinx.active.schEditor.getDoc().symbols.length === n, [n0 + 2], { what: 'a second one placed' });
  assert.deepEqual(await placing(page), { tool: 'place', n: n0 + 2 });
  assert.deepEqual(await page.eval(() => window.Silinx.active.schEditor.getDoc().symbols.slice(-2).map((s) => s.type)), ['and2', 'and2']);
}, { tablet: 'landscape' });
uiTest('#1179 the mouse: a symbol dropped from the palette is selected, Select the tool again', E, async (page) => {
  const at = await openGates(page, 'MouseDrop');
  const n0 = (await placing(page)).n;
  await dropSymbol(page, 'and2', at);
  assert.deepEqual(await placing(page), { tool: 'select', n: n0 + 1 });
});
