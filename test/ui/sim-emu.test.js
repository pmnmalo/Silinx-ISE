// UI: behavioural simulation in the ISim view (waveforms with values), the board emulator on the
// Basys2, Nexys2 and Spartan-3E Starter Kit (LEDs, 7-segment display, LCD, rotary knob react to
// switches / buttons), its two engines (compiled, event-driven: #418), its VGA monitor (#420), the "Run
// anyway?" question for a netlist with a cell that has no model.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { setupUi, uiTest, makeProject, writeWs } from './harness.js';
import { ROOT } from '../examples-lib.mjs';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

uiTest('ISim: Simulate Behavioral Model runs the test bench; waveforms and objects have values; run more from the command line', E, async (page) => {
  await makeProject(env, { name: 'SimPj', template: 'blinky' });
  await page.openProject('SimPj');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view);
  // the initial run: 1 us
  await page.waitFor(() => /Sim Time: 1,000,000 ps/.test(document.querySelector('.isim-st-time')?.textContent || '') && !window.Silinx.active.view.state.running, [], { what: 'initial 1 us run', timeout: 20000 });
  const st = await page.eval(() => {
    const s = window.Silinx.active.view.state;
    return {
      rows: s.rows.map((r) => r.name),
      waves: Object.fromEntries(s.rows.map((r) => [r.name, r.sig?.wave?.t?.length ?? 0])),
      title: document.querySelector('.isim-title-text').textContent,
      objects: [...document.querySelectorAll('.isim-objs tbody tr')].map((tr) => [...tr.cells].slice(1, 3).map((c) => c.textContent)),
    };
  });
  assert.equal(st.title, 'tb_top');
  for (const n of ['clk', 'sw', 'btn', 'led']) assert.ok(st.rows.includes(n), `waveform row ${n}: ${st.rows}`);
  assert.ok(st.waves.clk >= 100, `clk toggles (${st.waves.clk} events in 1 us)`);
  const objs = Object.fromEntries(st.objects);
  assert.match(objs.led || '', /^[01]{8}$/, `led value in the Objects panel: ${JSON.stringify(st.objects)}`);
  assert.ok(objs.clk === '0' || objs.clk === '1');
  // the wave canvas has been drawn (not blank)
  // (drawn on the next animation frame: wait for it)
  await page.waitFor(() => {
    const c = document.querySelector('.isim-waves');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const colors = new Set();
    for (let i = 0; i < d.length; i += 16) colors.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
    return colors.size > 3;
  }, [], { what: 'the waveform canvas shows traces' });
  // SSim> run 500 ns
  await page.click('#mc-cmd input');   // (ISim's command line: the bottom console's, #925)
  await page.type('run 500 ns');
  await page.key('Enter');
  await page.waitFor(() => /Sim Time: 1,500,000 ps/.test(document.querySelector('.isim-st-time').textContent), [], { what: 'run 500 ns' });
  assert.match(await page.eval(() => Array.from(document.querySelector('.isim-console')?.children || [], (e) => e.textContent).join('\n')), /run 500 ns/);
  // the LEDs move every 64 clock cycles (1.28 us) in this test bench
  assert.ok(await page.eval(() => window.Silinx.active.view.state.rows.find((r) => r.name === 'led').sig.wave.t.length) >= 2, 'led changes');
  // the simulation process is marked OK
  await page.click('#left-tabs .tab[data-page=design]');
  assert.ok(await page.eval(() => [...document.querySelectorAll('#procs .row')].find((r) => r.querySelector('.lbl').textContent === 'Simulate Behavioral Model')?.querySelector('.status svg')));
});

// ---------------------------------------------------------------------------- board emulator
const EMU_7SEG = `library ieee; use ieee.std_logic_1164.all;
entity emu is
  port (clk : in std_logic;
        sw  : in std_logic_vector(7 downto 0);
        btn : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0);
        seg : out std_logic_vector(6 downto 0);
        dp  : out std_logic;
        an  : out std_logic_vector(3 downto 0));
end emu;
architecture rtl of emu is
begin
  led <= sw(7 downto 1) & btn(0);                       -- LD0 = BTN0, LDk = SWk
  an  <= "1110";                                        -- digit 0 only
  seg <= "1111001" when sw(0) = '1' else "1000000";     -- shows 1 / 0 (active low, g..a)
  dp  <= not btn(1);                                    -- lit while BTN1 is pressed
end rtl;
`;

async function emulatorProject(page, name, board, files, top) {
  await makeProject(env, { name, board, files, top });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view && document.querySelector('.doc:not([hidden]) .emu-pcb'), [], { what: 'emulator open' });
  await page.waitFor(() => window.Silinx.active.view.outputs, [], { what: 'emulator running' });
}
// a widget of the board by the start of its tooltip ("SW3 = sw<3> (pin …)")
async function widget(page, title, opts = {}) {
  const idx = await page.waitFor((t) => { const i = [...document.querySelectorAll('.doc:not([hidden]) [title]')].findIndex((e) => e.title.startsWith(t)); return i >= 0 ? i + 1 : 0; }, [title], { what: `widget ${title}` });
  return page.click('.doc:not([hidden]) [title]', { index: idx - 1, ...opts });
}
const led = (page, k) => page.eval((i) => window.Silinx.active.view.outputs?.leds[i] ?? 0, k);
const waitLed = (page, k, on) => page.waitFor((i, o) => { const v = window.Silinx.active.view.outputs?.leds[i] ?? 0; return o ? v > 0.5 : v < 0.5; }, [k, on], { what: `LED ${k} ${on ? 'on' : 'off'}` });
const digit = (page, k) => page.eval((i) => window.Silinx.active.view.outputs?.digits[i] || null, k);

// #347: a manual clock (test/fixtures/open-flow/feat_manual_clock: a D flip-flop clocked by BTN0, CLOCK_DEDICATED_ROUTE
// = FALSE): the emulator does not drive the clk port at 50 MHz, LD0 takes SW0 only at a press of BTN0
// #925: the message centre in this interface too (modern, or classic with SILINX_UI_INTERFACE): ISim's console and the
// emulator's Messages box in the bottom console, its lines tagged by source, filtered; one command line, ISim's while an
// ISim window is in front (its history on ↑), the command palette otherwise
uiTest('#925 message centre: ISim\'s console and command line, the emulator\'s Messages, in the bottom console', E, async (page) => {
  await makeProject(env, { name: 'MsgCentre', template: 'blinky' });
  await page.openProject('MsgCentre');
  // the filters: every source by default (no task to follow)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#mc-filters .filt')].map((b) => [b.textContent, b.getAttribute('aria-pressed')])),
    [['All', 'true'], ['Design', 'false'], ['Simulation', 'false'], ['Emulator', 'false'], ['Synthesis', 'false'], ['Implementation', 'false'], ['Board', 'false']]);
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running
    && /Sim Time: 1,000,000 ps/.test(document.querySelector('.isim-st-time')?.textContent || ''), [], { what: 'ISim', timeout: 20000 });
  // ISim's console not in its window; its lines in the bottom console, under Simulation
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .isim-bottom').getBoundingClientRect().height), 0);
  await page.waitFor(() => [...document.querySelectorAll('#console-log .ln[data-src="sim"]')].some((l) => /circuit initialization/.test(l.textContent)), [], { what: 'ISim\'s lines' });
  // the command line: ISim's while its window is in front
  assert.equal(await page.eval(() => document.querySelector('#mc-cmd .mc-prompt').textContent), 'SSim>');
  await page.click('#mc-cmd input');
  await page.type('run 2 us');
  await page.key('Enter');
  await page.waitFor(() => /Sim Time: 3,000,000 ps/.test(document.querySelector('.isim-st-time')?.textContent || ''), [], { what: 'ISim ran', timeout: 20000 });
  assert.ok(await page.eval(() => [...document.querySelectorAll('#console-log .ln')].some((l) => l.textContent === 'SSim> run 2 us' && l.dataset.src === 'sim')));
  // its history: ↑ brings the command back
  await page.key('ArrowUp');
  assert.equal(await page.eval(() => document.querySelector('#mc-cmd input').value), 'run 2 us');
  // the Simulation filter: ISim's lines only
  await page.click('#mc-filters .filt[data-src="sim"]');
  const shownSrc = await page.eval(() => [...new Set([...document.querySelectorAll('#console-log .ln')].filter((l) => l.getClientRects().length).map((l) => l.dataset.src))]);
  assert.deepEqual(shownSrc, ['sim']);
  await page.click('#mc-filters .filt[data-src="all"]');
  // another document in front: the command palette's line
  await page.eval(() => window.SilinxApp.openFile('src/top.vhd'));
  await page.waitFor(() => document.querySelector('#mc-cmd .mc-prompt').textContent === '›', [], { what: 'the palette\'s line' });
  // the emulator: its line under Emulator, its Messages box not in its window
  await page.click('input[name=view][value=impl]');
  await page.treeRow('#procs', 'Emulate Behavioral Model (RTL)', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'the emulator', timeout: 60000 });
  assert.ok(!(await page.eval(() => !!document.querySelector('.doc:not([hidden]) .emu-log')?.getClientRects().length)), 'the Messages box not shown');
  assert.ok(await page.eval(() => [...document.querySelectorAll('#console-log .ln[data-src="emu"]')].some((l) => /^Board Emulator: 'top'/.test(l.textContent))));
}, { timeout: 120000 });

uiTest('board emulator: a manual clock on a button (BTN0) — the flip-flop takes the switch only at a press', E, async (page) => {
  const fx = (f) => fs.readFileSync(path.join(ROOT, 'test/fixtures/open-flow/feat_manual_clock', f), 'utf8');
  await makeProject(env, { name: 'EmuManual', board: 'basys2', top: 'top', constraints: 'constraints/manual.ucf', files: { 'src/top.vhd': fx('top.vhd'), 'constraints/manual.ucf': fx('manual.ucf') } });
  await page.openProject('EmuManual');
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view && document.querySelector('.doc:not([hidden]) .emu-pcb'), [], { what: 'emulator open' });
  await page.waitFor(() => window.Silinx.active.view.outputs, [], { what: 'emulator running' });
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-note').textContent), /Manual clock clk \(BTN\): one edge per press/);
  // SW0 on: LD0 stays off (no clock edge) while the emulator runs
  await widget(page, 'SW0 = d');
  const t0 = await page.eval(() => window.Silinx.active.view.sim.now);
  await page.waitFor((t) => window.Silinx.active.view.sim.now > t + 2e6, [t0], { what: 'the emulator running on' });
  assert.ok(await led(page, 0) < 0.5, 'LD0 still off: no edge without a press');
  // a press of BTN0: LD0 on; SW0 off: LD0 stays on until the next press
  await widget(page, 'BTN0 = clk', { modifiers: 8 });
  await waitLed(page, 0, true);
  await widget(page, 'BTN0 = clk', { modifiers: 8 });
  await widget(page, 'SW0 = d');
  const t1 = await page.eval(() => window.Silinx.active.view.sim.now);
  await page.waitFor((t) => window.Silinx.active.view.sim.now > t + 2e6, [t1], { what: 'the emulator running on' });
  assert.ok(await led(page, 0) > 0.5, 'LD0 still on');
  await widget(page, 'BTN0 = clk', { modifiers: 8 });
  await waitLed(page, 0, false);
  assert.deepEqual(page.dialogs, []);
});

for (const [board, name] of [['basys2', 'Basys2'], ['nexys2', 'Nexys2']]) {
  uiTest(`board emulator (RTL) on the ${name}: switches and buttons drive the LEDs and the 7-segment display`, E, async (page) => {
    await emulatorProject(page, `Emu_${board}`, board, { 'src/emu.vhd': EMU_7SEG }, 'emu');
    assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled', 'the design compiles: the compiled engine runs it');
    assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-note').textContent), new RegExp(`${name}.* — emu · Clock clk: 50 MHz on the board`));
    for (let k = 0; k < 8; k++) assert.ok(await led(page, k) < 0.5, `LD${k} off at start`);
    // the digit shows 0 (segments a..f on, g off)
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.seg[0] > 0.5);
    let d = await digit(page, 0);
    assert.deepEqual(d.seg.map((x) => (x > 0.5 ? 1 : 0)), [1, 1, 1, 1, 1, 1, 0]);
    // SW3 on: LD3 on; SW0 on: the digit shows 1
    await widget(page, 'SW3 = sw<3>');
    await waitLed(page, 3, true);
    assert.ok(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-sw.on')].length === 1));
    await widget(page, 'SW0 = sw<0>');
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.seg[0] < 0.5);
    d = await digit(page, 0);
    assert.deepEqual(d.seg.map((x) => (x > 0.5 ? 1 : 0)), [0, 1, 1, 0, 0, 0, 0]);
    assert.equal(await digit(page, 1), null, 'AN1 is off: digit 1 dark');
    // BTN0 held (Shift+click latches it): LD0 on; again: off
    await widget(page, 'BTN0 = btn<0>', { modifiers: 8 });
    await waitLed(page, 0, true);
    await widget(page, 'BTN0 = btn<0>', { modifiers: 8 });
    await waitLed(page, 0, false);
    // a plain press: on while the mouse button is down
    const p = await page.point('.doc:not([hidden]) [title^="BTN1 = btn<1>"]');
    await page.mouse('mouseMoved', p.x, p.y);
    await page.mouse('mousePressed', p.x, p.y);
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.dp > 0.5, [], { what: 'DP lit while BTN1 is held (active low)' });
    await page.mouse('mouseReleased', p.x, p.y);
    await page.waitFor(() => window.Silinx.active.view.outputs.digits[0]?.dp < 0.5, [], { what: 'DP dark again' });
    // SW3 off again; Pause / Step / Power cycle
    await widget(page, 'SW3 = sw<3>');
    await waitLed(page, 3, false);
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
    // (the compiled engine runs in its worker, #427: the run in flight when paused comes in first; Step's after it)
    await page.waitFor(() => !window.Silinx.active.view.sim.busy, [], { what: 'the last run in' });
    const t1 = await page.eval(() => window.Silinx.active.view.sim.now);
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏭ Step' });
    await page.waitFor(() => !window.Silinx.active.view.sim.busy, [], { what: 'the step run' });
    assert.equal(await page.eval(() => window.Silinx.active.view.sim.now) - t1, 20000, 'one 50 MHz clock cycle');
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⟲ Power cycle' });
    await page.waitFor(() => window.Silinx.active.view.sim.now === 0);
    await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '▶ Run' });
    await page.waitFor(() => window.Silinx.active.view.sim.now > 0);
    // a signal in the Watch box
    await page.eval(() => { const s = document.querySelector('.doc:not([hidden]) .emu-box select'); s.value = [...s.options].find((o) => o.textContent.endsWith('led')).value; s.dispatchEvent(new Event('change')); });
    await page.waitFor(() => /^[01X]{8}/.test(document.querySelector('.doc:not([hidden]) .emu-box tbody td:nth-child(2)')?.textContent || ''));
    // the board's power switch: off = nothing runs, LEDs and display dark, Run / Step / Power cycle disabled
    await widget(page, 'SW3 = sw<3>');
    await waitLed(page, 3, true);
    await page.click('.doc:not([hidden]) .emu-power');
    await page.waitFor(() => !window.Silinx.active.view.powered && window.Silinx.active.view.outputs === null, [], { what: 'power off' });
    const off = await page.eval(() => ({
      sw: document.querySelector('.doc:not([hidden]) .emu-power').getAttribute('aria-checked'),
      stat: document.querySelector('.doc:not([hidden]) .emu-bar .stat').textContent,
      disabled: [...document.querySelectorAll('.doc:not([hidden]) .emu-bar .btn')].map((b) => [b.textContent, b.disabled]),
      t: window.Silinx.active.view.sim.now,
    }));
    assert.equal(off.sw, 'false');
    assert.equal(off.stat, 'Power off');
    assert.deepEqual(off.disabled, [['▶ Run', true], ['⏭ Step', true], ['⟲ Power cycle', true]]);
    assert.ok(await led(page, 3) < 0.5, 'LD3 dark without power');
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(await page.eval(() => window.Silinx.active.view.sim.now), off.t, 'time stands still');
    // a switch moved while off (SW0 back to 0) is read at power-up; on again (keyboard): the design restarts from time 0
    await widget(page, 'SW0 = sw<0>');
    // (the time read at once after the switch's own key handler, on the page's keydown after it: once the board
    // runs, the time reached by the first look may pass the time it was switched off at, on a slow machine, #293)
    await page.eval(() => {
      document.querySelector('.doc:not([hidden]) .emu-power').focus();
      document.addEventListener('keydown', () => { const v = window.Silinx.active.view; window.__powerOn = { powered: v.powered, now: v.sim.now }; }, { once: true });
    });
    await page.key('Enter');
    assert.deepEqual(await page.eval(() => window.__powerOn), { powered: true, now: 0 }, 'restarted from time 0');
    await page.waitFor(() => window.Silinx.active.view.powered && window.Silinx.active.view.sim.now > 0, [], { what: 'power on, running' });
    await waitLed(page, 3, true);
    await page.waitFor(() => window.Silinx.active.view.outputs?.digits[0]?.seg[0] > 0.5, [], { what: 'digit 0 (SW0 turned off while off)' });
    assert.deepEqual((await digit(page, 0)).seg.map((x) => (x > 0.5 ? 1 : 0)), [1, 1, 1, 1, 1, 1, 0]);
    assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-bar .btn').textContent), '⏸ Pause');
  });
}

// the number a digit of the display shows (its segments a..g lit), null when dark or not a decimal digit
const SEGS = ['1111110', '0110000', '1101101', '1111001', '0110011', '1011011', '1011111', '1110000', '1111111', '1111011'];
const shown = (page) => page.eval(() => window.Silinx.active.view.outputs?.digits.map((d) => (d ? d.seg.map((x) => (x > 0.5 ? 1 : 0)).join('') : null)) || [])
  .then((ds) => { const n = [3, 2, 1, 0].map((k) => SEGS.indexOf(ds[k] ?? '')); return n.some((x) => x < 0) ? null : Number(n.join('')); });

// #983: blinky counts the steps of its LED pattern on the 4-digit display, multiplexed (one digit per ms)
for (const [board, name] of [['basys2', 'Basys2'], ['nexys2', 'Nexys2']]) {
  uiTest(`board emulator (RTL) on the ${name}: blinky's display counts the LED pattern's steps, four digits; SW0 resets it`, E, async (page) => {
    await makeProject(env, { name: `EmuBlinky_${board}`, template: 'blinky', board });
    await page.openProject(`EmuBlinky_${board}`);
    assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
    await page.menu('Tools', 'Board Emulator');
    await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
    assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled');
    // the four digits lit (the scan reached them all), counting from 0000
    await page.waitFor(() => window.Silinx.active.view.outputs.digits.filter(Boolean).length === 4, [], { what: 'the four digits lit' });
    const first = await shown(page);
    assert.ok(first !== null && first < 10, `a count from 0000: ${first}`);
    // BTN1 (faster) five times: 80 steps a second; the count goes on, past 0010
    // (each press held, then released, for 40 ms of the board's time: longer than its 20 ms debounce)
    const boardWait = async () => { const t = await page.eval(() => window.Silinx.active.view.sim.now); await page.waitFor((t0) => window.Silinx.active.view.sim.now > t0 + 40e9, [t], { what: '40 ms on the board' }); };
    for (let i = 0; i < 5; i++) { await widget(page, 'BTN1 = btn<1>', { modifiers: 8 }); await boardWait(); await widget(page, 'BTN1 = btn<1>', { modifiers: 8 }); await boardWait(); }
    let n = first;
    for (const t0 = Date.now(); Date.now() - t0 < 30000 && !(n > 10); await new Promise((r) => setTimeout(r, 100))) n = (await shown(page)) ?? n;
    assert.ok(n > 10, `the display counts on: ${first} -> ${n}`);
    // SW0 (reset) on: 0000
    await widget(page, 'SW0 = sw<0>');
    for (const t0 = Date.now(); Date.now() - t0 < 30000 && n !== 0; await new Promise((r) => setTimeout(r, 100))) n = await shown(page);
    assert.equal(n, 0, 'reset: 0000');
    assert.deepEqual(page.dialogs, []);
  });
}

const EMU_S3E = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity s3e is
  port (clk : in std_logic;
        sw : in std_logic_vector(3 downto 0);
        rot_a, rot_b, rot_center, btn_north : in std_logic;
        led : out std_logic_vector(7 downto 0);
        lcd_e, lcd_rs, lcd_rw : out std_logic;
        lcd_d : out std_logic_vector(3 downto 0));
end s3e;
architecture rtl of s3e is
  -- the knob: count on the rising edges of ROT_A (up when ROT_B = 0)
  signal cnt : unsigned(5 downto 0) := (others => '0');
  signal a_prev : std_logic := '1';
  -- the LCD, once SW0 is on: 4-bit mode, display on, "HI" (RS & nibble per transfer)
  type rom_t is array (0 to 6) of std_logic_vector(4 downto 0);
  constant ROM : rom_t := ("00010", "00000", "01100", "10100", "11000", "10100", "11001");
  signal step : integer range 0 to 7 := 0;
  signal ph : integer range 0 to 2 := 0;
begin
  process (clk) begin
    if rising_edge(clk) then
      a_prev <= rot_a;
      if rot_a = '1' and a_prev = '0' then
        if rot_b = '0' then cnt <= cnt + 1; else cnt <= cnt - 1; end if;
      end if;
      if sw(0) = '1' and step < 7 then
        if ph = 2 then ph <= 0; step <= step + 1; else ph <= ph + 1; end if;
      end if;
    end if;
  end process;
  led <= rot_center & btn_north & std_logic_vector(cnt);
  lcd_rw <= '0';
  lcd_e  <= '1' when ph = 1 and step < 7 else '0';
  lcd_rs <= ROM(step)(4) when step < 7 else '0';
  lcd_d  <= ROM(step)(3 downto 0) when step < 7 else "0000";
end rtl;
`;

uiTest('board emulator (RTL) on the Spartan-3E Starter Kit: LCD text after a switch, rotary knob, knob push and direction buttons', E, async (page) => {
  await emulatorProject(page, 'Emu_s3e', 's3e-starter', { 'src/s3e.vhd': EMU_S3E }, 's3e');
  const lcd = () => page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-lcd-cell')].map((c) => c.textContent).join('').trim());
  assert.equal(await lcd(), '', 'the LCD is off before the design writes to it');
  await widget(page, 'SW0 = sw<0>');
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-lcd-cell')].map((c) => c.textContent).join('').trim() === 'HI', [], { what: 'LCD shows HI' });
  // power off: the LCD goes blank; on: the design starts again and writes HI (SW0 still on)
  await page.click('.doc:not([hidden]) .emu-power');
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-lcd-cell')].every((c) => c.textContent === ''), [], { what: 'LCD blank without power' });
  await page.click('.doc:not([hidden]) .emu-power');
  await page.waitFor(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-lcd-cell')].map((c) => c.textContent).join('').trim() === 'HI', [], { what: 'LCD shows HI after power-up' });
  // the knob: ⟳ counts up, ⟲ counts down (LEDs 0..5 show the count)
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn right (clockwise)"]');
  await waitLed(page, 0, true);
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn right (clockwise)"]');
  await page.waitFor(() => { const l = window.Silinx.active.view.outputs.leds; return l[0] < 0.5 && l[1] > 0.5; }, [], { what: 'count 2' });
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn left (counter-clockwise)"]');
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn left (counter-clockwise)"]');
  await page.click('.doc:not([hidden]) .emu-rot-btn[title="Turn left (counter-clockwise)"]');
  await page.waitFor(() => window.Silinx.active.view.outputs.leds.slice(0, 6).every((v) => v > 0.5), [], { what: 'count -1 = 63' });
  // the knob push (ROT_CENTER) and BTN_NORTH, latched with Shift+click
  await widget(page, 'ROT_CENTER = rot_center', { modifiers: 8 });
  await waitLed(page, 7, true);
  await widget(page, 'BTN_NORTH = btn_north', { modifiers: 8 });
  await waitLed(page, 6, true);
  // the emulator in Portuguese: no untranslated text
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  await setLang('pt');
  const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  await setLang('en');
  const db = await env.server.api('GET', '/api/devices');
  const same = [{ test: (s) => db.boards.some((b) => b.name === s) }, /^(s3e|led|sw|rot_\w+|btn_\w+|lcd_\w+|clk|cnt|a_prev|step|ph|real \(÷1\))\b/, /^@?[A-Z_0-9]+:? /, /^@?[A-Z_0-9]+ = /];
  assert.deepEqual(untranslated(en, pt, same), []);
});

// #418: the engines. A counter at its real timing generic: on the compiled engine (Real time) it counts at the
// board's speed; the Engine selector reopens it on the event-driven engine (the generic divided, Max speed);
// a design that cannot be compiled (a combinational loop) runs on the event-driven one, with the reason
const EMU_COUNT = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cnt is
  generic (DIV : integer := 5000000);   -- 10 steps per second at 50 MHz
  port (clk : in std_logic; sw : in std_logic_vector(7 downto 0); led : out std_logic_vector(7 downto 0));
end cnt;
architecture rtl of cnt is
  signal n : integer range 0 to DIV - 1 := 0;
  signal q : unsigned(7 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if n = DIV - 1 then n <= 0; q <= q + 1; else n <= n + 1; end if;
    end if;
  end process;
  led <= std_logic_vector(q) xor sw;
end rtl;
`;
const bar = (page) => page.eval(() => {
  const sels = [...document.querySelectorAll('.doc:not([hidden]) .emu-bar select')];
  const engine = sels.find((x) => [...x.options].some((o) => o.value === 'compiled'));
  return { engine: engine?.value, compiledDisabled: engine ? [...engine.options].find((o) => o.value === 'compiled').disabled : null,
    speed: sels.find((x) => [...x.options].some((o) => o.value === 'max'))?.value, view: window.Silinx.active.view.engine,
    hints: [...document.querySelectorAll('.doc:not([hidden]) .emu-side > .emu-hint')].map((e) => e.textContent) };
});
uiTest('board emulator: the compiled engine at the board\'s speed (a real timing generic); the Engine selector to the event-driven engine and back', E, async (page) => {
  await emulatorProject(page, 'EmuEngine', 'basys2', { 'src/cnt.vhd': EMU_COUNT }, 'cnt');
  let b = await bar(page);
  assert.deepEqual([b.view, b.engine, b.compiledDisabled, b.speed], ['compiled', 'compiled', false, 'real']);
  assert.match(b.hints[0], /^The design is compiled \(its netlist, by Yosys\) and runs at up to the board's clock rate/);
  assert.equal(b.hints.length, 1);
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-box .emu-hint')?.textContent), 'Real values: the compiled engine runs the design at up to the board\'s clock rate.');
  // the real generic (5 000 000 cycles a step): LD0 changes within a few seconds of the board's time
  await page.waitFor(() => window.Silinx.active.view.sim.now > 2.2e11, [], { what: '0.22 s of the board\'s time', timeout: 60000 });
  await page.waitFor(() => window.Silinx.active.view.outputs.leds.slice(0, 2).some((v) => v > 0), [], { what: 'the counter counts (LD0, LD1)' });
  // the switches still drive the LEDs (led = q xor sw)
  await widget(page, 'SW7 = sw<7>');
  await waitLed(page, 7, true);
  // the event-driven engine: the emulator opens again on it, the generic divided, at Max speed
  await page.eval(() => { const s = [...document.querySelectorAll('.doc:not([hidden]) .emu-bar select')].find((x) => [...x.options].some((o) => o.value === 'compiled')); s.value = 'event'; s.dispatchEvent(new Event('change')); });
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.engine === 'event' && window.Silinx.active.view.outputs, [], { what: 'the emulator on the event-driven engine' });
  b = await bar(page);
  assert.deepEqual([b.view, b.engine, b.compiledDisabled, b.speed], ['event', 'event', false, 'max']);
  assert.match(b.hints[0], /^The design is simulated from its HDL \(behavioural RTL\) at a reduced clock rate/);
  assert.match(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-box h4')?.textContent || ''), /^Watch$/);
  assert.match(await page.eval(() => [...document.querySelectorAll('.doc:not([hidden]) .emu-box h4')].map((e) => e.textContent).join('|')), /Timing ÷[\d,]+ \(emulation only\)/);
  // and back
  await page.eval(() => { const s = [...document.querySelectorAll('.doc:not([hidden]) .emu-bar select')].find((x) => [...x.options].some((o) => o.value === 'compiled')); s.value = 'compiled'; s.dispatchEvent(new Event('change')); });
  await page.waitFor(() => window.Silinx.active.view?.engine === 'compiled' && window.Silinx.active.view.outputs, [], { what: 'the emulator on the compiled engine again' });
  assert.deepEqual(page.dialogs, []);
});

const EMU_LOOP = `library ieee; use ieee.std_logic_1164.all;
entity lp is port (sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0)); end lp;
architecture rtl of lp is
  signal a, b : std_logic;
begin
  a <= b xor sw(0);
  b <= a and sw(1);
  led <= a & b;
end rtl;
`;
// #918: the status line (t = … ns · … cycles · … kHz (…% of real time)) at the bar's end was flex-basis 0 with no minimum
// width: at some window widths the controls left it a few pixels or none, and it disappeared; now it takes a row of its
// own then, the whole line shown (no ellipsis), in every interface
uiTest('#918 board emulator: its status line whole at every window width (a row of its own when the controls leave no room), in every interface', E, async (page) => {
  await emulatorProject(page, 'EmuStat', 'basys2', { 'src/cnt.vhd': EMU_COUNT }, 'cnt');
  await page.waitFor(() => /^t = .* cycles .* kHz \(.*% of real time\)$/.test(document.querySelector('.doc:not([hidden]) .emu-bar .stat')?.textContent || ''), [], { what: 'the status line' });
  const cut = [];
  for (const ui of ['modern', 'classic', 'tasks']) {
    await page.eval(async (u) => (await import('/js/modern.js')).setInterface(u), ui);
    if (ui === 'tasks') { await page.waitFor(() => document.documentElement.dataset.layout === 'tasks'); await page.click('#task-switch .task-btn[data-task="emu"]'); }
    for (let w = 600; w <= 1920; w += 20) {
      await page.setViewport(w, 900);
      // (a narrow screen's drawer, over the document, closed)
      await page.eval(async () => { (await import('/js/narrow.js')).setDrawer(false, { remember: false }); });
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const st = await page.eval(() => {
        // (in the Tasks interface right below the board, #1022, which keeps its size, #1021: scrolled to on a short area)
        const e = document.querySelector('.doc:not([hidden]) .emu .stat');
        if (e.parentNode.classList.contains('emu-board-wrap')) e.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = e.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { whole: r.width > 0 && e.scrollWidth <= e.clientWidth + 1, inside: r.left >= 0 && r.right <= innerWidth, seen: !!hit && e.contains(hit) };
      });
      if (!st.whole || !st.inside || !st.seen) cut.push(`${ui} ${w} px: ${JSON.stringify(st)}`);
    }
  }
  assert.deepEqual(cut, [], 'the whole status line, inside the window, not covered');
  await page.eval(async () => (await import('/js/modern.js')).setInterface('modern'));
  await page.setViewport(1366, 768);
}, { timeout: 300000, build: { commit: 'abc1234', date: '2026-10-21 12:00' } });

uiTest('board emulator: a design with a combinational loop runs on the event-driven engine, the reason shown (and in Portuguese)', E, async (page) => {
  await emulatorProject(page, 'EmuLoop', 'basys2', { 'src/lp.vhd': EMU_LOOP }, 'lp');
  const b = await bar(page);
  assert.deepEqual([b.view, b.engine, b.compiledDisabled, b.speed], ['event', 'event', true, 'max']);
  assert.deepEqual(b.hints.slice(1), ["Not compiled (combinational loop through 'b': not compiled): the event-driven simulator runs the design."]);
  // SW0 on, SW1 off: a = 1, b = 0
  await widget(page, 'SW0 = sw<0>');
  await waitLed(page, 1, true);
  // in Portuguese: no untranslated text
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  await setLang('pt');
  const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  assert.ok(pt.includes("Não compilado (combinational loop through 'b': not compiled): o projeto corre no simulador por eventos."), 'the reason in Portuguese');
  assert.ok(pt.includes('Motor:') && pt.includes('Compilado (velocidade real)') && pt.includes('Por eventos (depuração)'));
  await setLang('en');
  const db = await env.server.api('GET', '/api/devices');
  const same = [{ test: (s) => db.boards.some((b2) => b2.name === s) }, /^(lp|led|sw|real \(÷1\))\b/, /^@?[A-Z_0-9]+:? /, /^@?[A-Z_0-9]+ = /];
  assert.deepEqual(untranslated(en, pt, same), []);
});

// #420: the VGA monitor on the Basys2 (test/fixtures/compiled-sim/vga_bars.vhd: colour bars, a blue square the
// switches move)
const VGA_UCF = `NET "clk" LOC = "B8"; NET "hsync" LOC = "J14"; NET "vsync" LOC = "K13";
NET "red<0>" LOC = "C14"; NET "red<1>" LOC = "D13"; NET "red<2>" LOC = "F13";
NET "green<0>" LOC = "F14"; NET "green<1>" LOC = "G13"; NET "green<2>" LOC = "G14";
NET "blue<0>" LOC = "H13"; NET "blue<1>" LOC = "J13";
NET "sw<0>" LOC = "P11"; NET "sw<1>" LOC = "L3"; NET "sw<2>" LOC = "K3"; NET "sw<3>" LOC = "B4";
NET "sw<4>" LOC = "G3"; NET "sw<5>" LOC = "F3"; NET "sw<6>" LOC = "E2"; NET "sw<7>" LOC = "N3";
`;
// is "No signal" shown over the picture (as laid out, not only its hidden attribute: #453)
const NOSIG_SHOWN = () => { const e = document.querySelector('.doc:not([hidden]) .emu-vga-nosig'); return getComputedStyle(e).display !== 'none' && e.offsetHeight > 0; };
// a pixel of the monitor's picture (the canvas): [r, g, b]
const pixel = (page, x, y) => page.eval((px, py) => [...document.querySelector('.doc:not([hidden]) .emu-vga canvas').getContext('2d').getImageData(px, py, 1, 1).data.slice(0, 3)], x, y);
uiTest('board emulator: the VGA monitor draws the picture the design scans out, its timing measured; the event-driven engine cannot (and in Portuguese)', E, async (page) => {
  const bars = fs.readFileSync(path.join(ROOT, 'test/fixtures/compiled-sim/vga_bars.vhd'), 'utf8');
  await makeProject(env, { name: 'EmuVga', board: 'basys2', top: 'vga_bars', constraints: 'constraints/vga.ucf', files: { 'src/vga_bars.vhd': bars, 'constraints/vga.ucf': VGA_UCF } });
  await page.openProject('EmuVga');
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
  assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled');
  const stat = () => page.eval(() => document.querySelector('.doc:not([hidden]) .emu-vga-stat').textContent);
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-vga-stat')?.textContent === '640×480 · 59.52 Hz · line 32.00 µs · 525 lines', [], { what: 'the monitor\'s timing', timeout: 30000 });
  assert.equal(await page.eval(NOSIG_SHOWN), false, 'no "No signal" over the picture');
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-vga-warn').textContent), '');
  assert.doesNotMatch(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-board-note').textContent), /not emulated/, 'the VGA connector is emulated');
  // the bars (red across, green down: 3 bits each) and the square (blue, at column 8 * sw)
  await page.waitFor(() => window.Silinx.active.view.sim.vga().status.frames >= 2, [], { what: 'two frames', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 100));   // (the next picture drawn: 30 a second)
  assert.deepEqual(await pixel(page, 40, 30), [0, 0, 0]);
  assert.deepEqual(await pixel(page, 600, 450), [255, 255, 0]);
  assert.deepEqual(await pixel(page, 330, 100), [146, 36, 0]);
  assert.deepEqual(await pixel(page, 10, 210), [0, 109, 255], 'the square at column 0');
  await widget(page, 'SW3 = sw<3>');   // sw = 8: column 64
  await page.waitFor((x) => { const d = document.querySelector('.doc:not([hidden]) .emu-vga canvas').getContext('2d').getImageData(x, 210, 1, 1).data; return d[2] === 255; }, [70], { what: 'the square at column 64' });
  assert.deepEqual(await pixel(page, 10, 210), [0, 109, 0]);
  // power off: no signal
  await page.click('.doc:not([hidden]) .emu-power');
  await page.waitFor(NOSIG_SHOWN, [], { what: 'no signal without power' });
  assert.equal(await stat(), '');
  await page.click('.doc:not([hidden]) .emu-power');
  await page.waitFor(() => { const e = document.querySelector('.doc:not([hidden]) .emu-vga-nosig'); return getComputedStyle(e).display === 'none'; }, [], { what: 'the picture again, no "No signal" over it' });
  // (a frame measured again before the pause: the first VSYNC comes up to a frame after power-up)
  await page.waitFor(() => document.querySelector('.doc:not([hidden]) .emu-vga-stat')?.textContent === '640×480 · 59.52 Hz · line 32.00 µs · 525 lines', [], { what: 'the timing again', timeout: 30000 });
  // in Portuguese: no untranslated text
  await page.click('.doc:not([hidden]) .emu-bar .btn', { text: '⏸ Pause' });
  await page.eval(TEXTS);
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await setLang('en');
  const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  await setLang('pt');
  const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden])')));
  assert.ok(pt.includes('Monitor VGA (640×480)') && pt.includes('640×480 · 59.52 Hz · linha de 32.00 µs · 525 linhas'), pt.filter((t) => /VGA|640/.test(t)).join(' | '));
  await setLang('en');
  const db = await env.server.api('GET', '/api/devices');
  const same = [{ test: (x) => db.boards.some((b) => b.name === x) }, /^(vga_bars|hsync|vsync|red|green|blue|sw|clk|tick|hc|vc|pol|real \(÷1\))\b/, /^@?[A-Z_0-9]+:? /, /^@?[A-Z_0-9]+ = /];
  assert.deepEqual(untranslated(en, pt, same), []);
  // the event-driven engine: the monitor says it needs the compiled one
  await page.eval(() => { const s = [...document.querySelectorAll('.doc:not([hidden]) .emu-bar select')].find((x) => [...x.options].some((o) => o.value === 'compiled')); s.value = 'event'; s.dispatchEvent(new Event('change')); });
  await page.waitFor(() => window.Silinx.active.view?.engine === 'event' && window.Silinx.active.view.outputs, [], { what: 'the event-driven engine' });
  assert.equal(await page.eval(() => document.querySelector('.doc:not([hidden]) .emu-vga-nosig').textContent), 'The VGA monitor needs the compiled engine (the event-driven one is too slow for a frame)');
  assert.deepEqual(page.dialogs, []);
});

uiTest('emulating a netlist with a cell that has no model asks "Run anyway?" (No: nothing opens; Yes: it runs)', E, async (page) => {
  const RTL = 'library ieee; use ieee.std_logic_1164.all;\nentity top is port (sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0)); end top;\narchitecture r of top is begin led <= sw; end r;\n';
  await makeProject(env, { name: 'NetPj', board: 'basys2', top: 'top', files: { 'src/top.vhd': RTL } });
  // what netgen writes (build/netgen/synthesis/<top>_synthesis.vhd), with one cell Silinx has no model for
  await writeWs(env, 'NetPj', 'build/netgen/synthesis/top_synthesis.vhd', `library IEEE; use IEEE.STD_LOGIC_1164.ALL;
library UNISIM; use UNISIM.VCOMPONENTS.ALL;
entity top is port ( sw : in STD_LOGIC_VECTOR ( 1 downto 0 ); led : out STD_LOGIC_VECTOR ( 1 downto 0 ) ); end top;
architecture Structure of top is
begin
  led_0_OBUF : OBUF port map ( I => sw(0), O => led(0) );
  mystery : SILINX_NO_SUCH_CELL port map ( I => sw(1), O => led(1) );
end Structure;
`);
  await page.openProject('NetPj');
  await page.eval(() => window.SilinxApp.regenerateUcf());
  await page.treeRow('#hier', 'top');
  const emulate = async (answer) => {
    await page.treeRow('#procs', 'Emulate Post-Synthesis Model', { dbl: true, exact: true });
    await page.waitDialog('Board Emulator');
    const text = await page.eval(() => document.querySelector('.dlg-overlay').innerText);
    assert.match(text, /1 elaboration error\(s\), 1 of them instances of cells or entities that have no model/);
    assert.match(text, /silinx_no_such_cell' not found/i);
    assert.match(text, /Run anyway\?/);
    await page.dialogButton(answer);
    await page.waitNoDialog();
  };
  await emulate('No');
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('emulator')), false);
  assert.match(await page.eval(() => document.getElementById('console-errors').innerText), /silinx_no_such_cell' not found/i);
  await emulate('Yes');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs);
  assert.match(await page.eval(() => window.Silinx.active.title), /Board Emulator \(top, Post-Synthesis\)/);
  // the modelled cell works: SW0 drives LD0 through the OBUF
  await widget(page, 'SW0 = sw<0>');
  await waitLed(page, 0, true);
  // the simulation of the same netlist asks too
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'Simulate Post-Synthesis Model', { dbl: true, exact: true });
  await page.waitDialog('Simulate Post-Synthesis Model');
  assert.match(await page.eval(() => document.querySelector('.dlg-overlay').innerText), /Run anyway\?/);
  await page.dialogButton('No');
  await page.waitNoDialog();
  assert.equal(await page.eval(() => !!window.SilinxApp.findDoc('isim')), false);
});

uiTest('Verilog design with Xilinx primitives (BUFG, FDCE): Check Syntax and Simulate Behavioral Model find them, no library clause (#17)', E, async (page) => {
  const TOP = `module top (input clk, input clr, input d, output q);
  wire gclk;
  BUFG ub (.I(clk), .O(gclk));
  FDCE #(.INIT(1'b0)) uf (.C(gclk), .CE(1'b1), .CLR(clr), .D(d), .Q(q));
endmodule
`;
  const TB = `module tb_top;
  reg clk = 0, clr = 1, d = 0; wire q;
  top uut (.clk(clk), .clr(clr), .d(d), .q(q));
  always #5 clk = ~clk;
  initial begin
    #12 clr = 0; d = 1;
    #20 if (q === 1'b1) $display("TEST PASSED"); else $display("TEST FAILED q=%b", q);
    $finish;
  end
endmodule
`;
  await makeProject(env, { name: 'PrimV', board: 'basys2', top: 'top', files: { 'src/top.v': TOP, 'sim/tb_top.v': TB }, roles: { 'sim/tb_top.v': 'sim' } });
  await page.openProject('PrimV');
  // the project's modules are its own: the primitives are not listed as modules
  await page.waitFor(() => (window.Silinx.modules || []).length > 0, [], { what: 'modules compiled' });
  assert.deepEqual(await page.eval(() => window.Silinx.modules.map((m) => m.name).sort()), ['tb_top', 'top']);
  await page.treeRow('#hier', 'top');
  await page.treeRow('#procs', 'Check Syntax', { dbl: true, exact: true });
  await page.waitFor(() => /Process "Check Syntax" (completed successfully|failed)/.test(document.getElementById('console-log').innerText), [], { what: 'Check Syntax done' });
  const log = await page.eval(() => document.getElementById('console-log').innerText.split('Started : "Check Syntax"').pop());
  // no 'module/entity BUFG not found', and no warning (d, read only at the FDCE's clock edge, is used)
  assert.match(log, /Process "Check Syntax" completed successfully\s*$/);
  assert.doesNotMatch(log, /not found|WARNING/);
  assert.equal(await page.eval(() => document.getElementById('console-errors').innerText.trim()), 'No messages.');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_top');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 20000, what: 'ISim ready' });
  const out = await page.waitFor(() => { const t = Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n'); return /TEST (PASSED|FAILED)/.test(t) ? t : null; }, [], { timeout: 20000, what: 'TEST PASSED / FAILED' });
  assert.match(out, /TEST PASSED/);
});

uiTest('ISim: VHDL textio, writeline(output) and a vectors file read with readline / read / endfile, shown in the console', E, async (page) => {
  const TOP = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity add is port (a, b : in unsigned(3 downto 0); s : out unsigned(4 downto 0)); end add;
architecture rtl of add is begin s <= ('0' & a) + b; end rtl;
`;
  const TB = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all; use std.textio.all;
entity tb_add is end tb_add;
architecture sim of tb_add is
  file vectors : text open read_mode is "vectors.txt";
  signal a, b : unsigned(3 downto 0); signal s : unsigned(4 downto 0);
begin
  uut : entity work.add port map (a => a, b => b, s => s);
  process
    variable l, lo : line; variable x, y : integer;
  begin
    while not endfile(vectors) loop
      readline(vectors, l); read(l, x); read(l, y);
      a <= to_unsigned(x, 4); b <= to_unsigned(y, 4);
      wait for 10 ns;
      write(lo, x); write(lo, string'(" + ")); write(lo, y); write(lo, string'(" = ")); write(lo, to_integer(s), right, 3);
      writeline(output, lo);
    end loop;
    write(lo, string'("TEST DONE")); writeline(output, lo);
    wait;
  end process;
end sim;
`;
  await makeProject(env, { name: 'TextIo', board: 'basys2', top: 'add', files: { 'src/add.vhd': TOP, 'sim/tb_add.vhd': TB, 'vectors.txt': '3 4\n15 15\n9 1\n' }, roles: { 'sim/tb_add.vhd': 'sim' } });
  await page.openProject('TextIo');
  await page.click('input[name=view][value=sim]');
  await page.treeRow('#hier', 'tb_add');
  await page.treeRow('#procs', 'Simulate Behavioral Model', { dbl: true, exact: true });
  await page.waitFor(() => window.Silinx.active?.id === 'isim' && window.Silinx.active.view && !window.Silinx.active.view.state.running, [], { timeout: 20000, what: 'ISim ready' });
  const out = await page.waitFor(() => { const t = Array.from(document.querySelector('.doc:not([hidden]) .isim-console')?.children || [], (e) => e.textContent).join('\n'); return /TEST DONE/.test(t) ? t : null; }, [], { timeout: 20000, what: 'TEST DONE in the console' });
  assert.match(out, /3 \+ 4 =   7\n15 \+ 15 =  30\n9 \+ 1 =  10\nTEST DONE/);
  assert.doesNotMatch(out, /not supported/);
});
