// UI: the parts of the Board Emulator (#405: out of mountEmulator in web/js/emulator.js), on a counter on a Basys2: the
// toolbar (emulator-toolbar.js: Pause / Run, Step, the engine, the clock rate, When hidden), the board
// (emulator-board.js: its LEDs, switches, buttons and power switch; a switch flips its LED), the side panel
// (emulator-side.js: a signal watched, its value), and the painting (emulator-paint.js: the status line, the LEDs
// drawn, Power off). The emulator's whole use: test/ui/sim-emu.test.js, emu-hidden.test.js, emu-engine.test.js.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

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

// a property of the emulator's view ('sim.now', 'held', 'paints' …)
const emu = (page, prop) => page.eval((p) => p.split('.').reduce((o, k) => o?.[k], window.SilinxApp.findDoc('emulator').view), prop);
const stat = (page) => page.eval(() => document.querySelector('.emu .stat').textContent);
async function openEmulator(page) {
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
}
// the board's time, once the run in flight (the compiled engine's worker) is in
async function settledNow(page) {
  await page.waitFor(() => !window.SilinxApp.findDoc('emulator').view.sim.busy, [], { what: 'the last run in' });
  return emu(page, 'sim.now');
}

uiTest('#405 Board Emulator parts: the toolbar, the board, a watched signal, the status line', E, async (page) => {
  await makeProject(env, { name: 'EmuParts', board: 'basys2', files: { 'src/cnt.vhd': COUNTER }, top: 'cnt' });
  await page.openProject('EmuParts');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/cnt.vhd'));
  await openEmulator(page);
  const q = (s) => page.eval((x) => [...document.querySelectorAll(x)].map((e) => e.textContent), s);
  // ---- the toolbar: running; its selectors
  assert.deepEqual(await q('.emu-bar button'), ['⏸ Pause', '⏭ Step', '⟲ Power cycle']);
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.emu-bar select')].map((s) => [s.value, s.options.length])), [['', 5], ['compiled', 2], ['real', 8], ['pause', 2]]);
  // ---- the board: 8 LEDs, 8 switches, 4 buttons, the power switch
  assert.deepEqual(await page.eval(() => ['.emu-led', '.emu-sw', '.emu-btn', '.emu-power'].map((s) => document.querySelectorAll(s).length)), [8, 8, 4, 1]);
  // ---- Pause: Run shown; Step: one clock cycle (20 ns) further
  await page.click('.emu-bar button', { text: '⏸ Pause' });
  assert.deepEqual(await q('.emu-bar button'), ['▶ Run', '⏭ Step', '⟲ Power cycle']);
  const t0 = await settledNow(page);
  await page.click('.emu-bar button', { text: '⏭ Step' });
  await page.waitFor((t) => window.SilinxApp.findDoc('emulator').view.sim.now === t + 20000 && !window.SilinxApp.findDoc('emulator').view.sim.busy, [t0], { what: 'one cycle on' });
  assert.match(await stat(page), /^t = [\d.]+ [mun]?s · [\d,]+ cycles$/);
  // ---- a switch: SW0 on flips LED0 (led = q xor sw) at the next step
  const led0 = () => page.eval(() => document.querySelectorAll('.emu-led')[0].style.background);
  const before0 = await led0();
  await page.eval(() => document.querySelectorAll('.emu-sw')[0].click());
  await page.click('.emu-bar button', { text: '⏭ Step' });
  await page.waitFor((b) => document.querySelectorAll('.emu-led')[0].style.background !== b, [before0], { what: 'LED0 flipped by SW0' });
  // ---- the side panel: q watched, its value shown
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.emu-side select option')].map((o) => o.textContent)), ['Add a signal to watch…', 'cnt.clk', 'cnt.sw', 'cnt.led', 'cnt.q']);
  await page.eval(() => { const s = document.querySelector('.emu-side select'); s.value = [...s.options].find((o) => o.textContent === 'cnt.q').value; s.dispatchEvent(new Event('change')); });
  await page.click('.emu-bar button', { text: '⏭ Step' });
  await page.waitFor(() => /^[01]{28} \([0-9A-F]+h\)$/.test(document.querySelector('.emu-side tbody tr:last-child td:nth-child(2)')?.textContent || ''), [], { what: 'q watched' });
  // ---- the power switch: off, the status line says so
  await page.eval(() => document.querySelector('.emu-power').click());
  await page.waitFor(() => document.querySelector('.emu .stat').textContent === 'Power off', [], { what: 'Power off' });
});

uiTest('#1985 a tablet\'s long press on a push button: no context menu over the board, the button stays pressed until released', E, async (page) => {
  await makeProject(env, { name: 'EmuTouch', board: 'basys2', files: { 'src/cnt.vhd': COUNTER }, top: 'cnt' });
  await page.openProject('EmuTouch');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/cnt.vhd'));
  await openEmulator(page);
  const at = await page.eval(() => { const b = document.querySelector('.emu-btn').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
  // a finger down on the button (a real touch), then the browser's long press: its contextmenu event
  await page.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: at.x, y: at.y }] });
  await page.waitFor(() => document.querySelector('.emu-btn').classList.contains('on'), [], { what: 'the button pressed' });
  const r = await page.eval(() => {
    const btn = document.querySelector('.emu-btn');
    const onBtn = !btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    const onBoard = !document.querySelector('.emu-board-wrap, .emu-board').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    return { onBtn, onBoard, stillHeld: btn.classList.contains('on'), touchAction: getComputedStyle(btn).touchAction };
  });
  await page.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitFor(() => !document.querySelector('.emu-btn').classList.contains('on'), [], { what: 'the button released' });
  assert.deepEqual(r, { onBtn: true, onBoard: true, stillHeld: true, touchAction: 'none' });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});
