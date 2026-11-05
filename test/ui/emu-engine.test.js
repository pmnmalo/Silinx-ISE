// UI: the Board Emulator's engine by default (#952): on a slow device (a phone or tablet, few cores) it starts on
// the event-driven engine, at once, and says why; the Engine selector still offers the compiled one; the user's
// choice is remembered and wins over the default; a desktop starts compiled. Also in the Tasks interface's
// Emulate task, and in Portuguese.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { emuNotes } from './emu-notes.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const COUNTER = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is
  port (clk : in std_logic;
        sw  : in std_logic_vector(7 downto 0);
        led : out std_logic_vector(7 downto 0));
end cnt;
architecture rtl of cnt is
  signal q : unsigned(27 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(27 downto 20)) xor sw;
end rtl;
`;

// the Engine choice: its items in the toolbar's menu (#2846)
const engineItems = '.doc:not([hidden]) .emu-bar .tb-more-menu [role=menuitemradio]:is([data-value=compiled], [data-value=event])';
// the device a tablet: what the browser says of it (User-Agent Client Hints' mobile, 2 cores), until the page reloads
const slowDevice = (page) => page.eval(() => {
  Object.defineProperty(Navigator.prototype, 'userAgentData', { configurable: true, get: () => ({ mobile: true, brands: [], platform: 'Android' }) });
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { configurable: true, get: () => 2 });
});
// the emulator open and running on `engine`
const running = (page, engine) => page.waitFor((e) => window.SilinxApp.findDoc('emulator')?.view?.outputs && window.SilinxApp.findDoc('emulator').view.engine === e,
  [engine], { what: `the emulator on the ${engine} engine`, timeout: 30000 });
async function openEmulator(page, engine) {
  await page.menu('Tools', 'Board Emulator');
  await running(page, engine);
}
const closeEmulator = (page) => page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator')));
// the Engine selector (its value, the options enabled) and the note that says why the event-driven engine runs (in the
// console, #2718)
const engineUi = async (page) => ({ ...await page.eval((s) => {
  const e = [...document.querySelectorAll(s)];
  return { value: e.find((b) => b.getAttribute('aria-checked') === 'true').dataset.value, enabled: e.filter((b) => !b.disabled).map((b) => b.dataset.value), saved: localStorage.getItem('silinx.emulator.engine') };
}, engineItems), hint: ((await emuNotes(page)) || []).find((t) => /^the event-driven engine by default/.test(t)) ?? null });
const choose = (page, v) => page.eval((s, x) => document.querySelector(`${s}[data-value="${x}"]`).click(), engineItems, v);
const TABLET_HINT = 'the event-driven engine by default on this device (a phone or tablet, 2 processor cores): choose Engine ▸ Compiled to run the design at the board\'s real speed.';

uiTest('board emulator: a desktop starts compiled; a tablet event-driven, and says why; the choice of engine remembered, winning over the default (#952)', E, async (page) => {
  await makeProject(env, { name: 'EmuEngine', board: 'basys2', files: { 'src/cnt.vhd': COUNTER }, top: 'cnt' });
  await page.openProject('EmuEngine');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
  await page.eval(() => window.SilinxApp.openFile('src/cnt.vhd'));

  // a desktop: compiled, as before; nothing said of the device
  await openEmulator(page, 'compiled');
  assert.deepEqual(await engineUi(page), { value: 'compiled', enabled: ['compiled', 'event'], hint: null, saved: null });
  await closeEmulator(page);

  // a tablet: event-driven, at once (no compilation), the reason in the side panel; compiled still offered
  await slowDevice(page);
  await openEmulator(page, 'event');
  assert.deepEqual(await engineUi(page), { value: 'event', enabled: ['compiled', 'event'], hint: TABLET_HINT, saved: null });
  await page.waitConsole(/Board Emulator: 'cnt' \(RTL, event-driven\) on Digilent Basys2/);

  assert.ok(!(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-engine-auto'))), 'not in the window (#2718)');

  // the user chooses compiled: it runs compiled, remembered, and the next emulator starts compiled on the tablet too
  await choose(page, 'compiled');
  await running(page, 'compiled');
  assert.deepEqual(await engineUi(page), { value: 'compiled', enabled: ['compiled', 'event'], hint: null, saved: 'compiled' });
  await closeEmulator(page);
  await openEmulator(page, 'compiled');
  // and event-driven again: remembered, on a desktop too (the page reloaded: no stub)
  await choose(page, 'event');
  await running(page, 'event');
  assert.deepEqual(await engineUi(page), { value: 'event', enabled: ['compiled', 'event'], hint: null, saved: 'event' });
  await closeEmulator(page);
  await page.reload();
  await page.waitFor(() => window.SilinxApp && window.Silinx?.startupChecked, [], { what: 'app boot' });
  assert.equal(await page.eval(() => navigator.hardwareConcurrency >= 4 && !navigator.userAgentData?.mobile), true, 'a desktop again');
  await page.openProject('EmuEngine');
  await openEmulator(page, 'event');
  assert.deepEqual(await engineUi(page), { value: 'event', enabled: ['compiled', 'event'], hint: null, saved: 'event' });
  assert.deepEqual(page.dialogs, []);
});

uiTest('Tasks ▸ Emulate on a tablet: the event-driven engine, switched to compiled from its Engine selector (#952)', E, async (page) => {
  await makeProject(env, { name: 'EmuEngineTasks', template: 'blinky' });
  await page.eval(() => localStorage.setItem('silinx.ui', 'tasks'));
  await page.reload();
  await page.waitFor(() => window.SilinxApp && document.querySelector('#menubar .item') && window.Silinx?.startupChecked, [], { what: 'app boot' });
  await slowDevice(page);
  await page.openProject('EmuEngineTasks');
  await page.click('#task-switch .task-btn[data-task="emu"]');
  await page.dblclick('#task-emu-panel .row .lbl', { text: 'Emulate Behavioral Model (RTL)' });
  await running(page, 'event');
  await page.waitConsole(/Board Emulator: 'top' \(RTL, event-driven\)/);
  const ui = await engineUi(page);
  assert.deepEqual({ ...ui, hint: !!ui.hint }, { value: 'event', enabled: ['compiled', 'event'], hint: true, saved: null });
  // (in the toolbar's menu, #2666)
  assert.ok(await page.eval((s) => !document.querySelector(s).getClientRects().length, engineItems), 'the Engine items in the closed menu');
  await page.click('.doc:not([hidden]) .emu-bar .tb-more-btn');
  assert.ok(await page.eval((s) => document.querySelector(s).getClientRects().length > 0, engineItems), 'the Engine items shown');
  await choose(page, 'compiled');
  await running(page, 'compiled');
  assert.deepEqual(await engineUi(page), { value: 'compiled', enabled: ['compiled', 'event'], hint: null, saved: 'compiled' }, { build: { commit: 'abc1234', date: '2026-10-21 12:00' } });   // (the Tasks interface: a development build's only, #838)
  assert.deepEqual(page.dialogs, []);
}, { build: { commit: 'abc1234', date: '2026-10-21 12:00' } });   // (the Tasks interface: a development build's only, #838)
