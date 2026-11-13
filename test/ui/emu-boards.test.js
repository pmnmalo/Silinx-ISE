// UI: the Board Emulator's boards drawn as the real ones (web/js/emulator-layouts.js and its boards' modules, #2478):
// the layouts out of emulator.js (which still exports BOARD_LAYOUTS), each board's PCB with its parts.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard, BOARDS } from '../../server/devices.js';
import { TEXTS, untranslated } from './i18n-check.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

// a counter on the 8 LEDs every board has
const BLINK = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity blink is
  port (clk : in std_logic; led : out std_logic_vector(7 downto 0));
end blink;
architecture rtl of blink is
  signal q : unsigned(31 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(31 downto 24));
end rtl;
`;

// the iCEBreaker's (#2511): BTN_N lights LED1 and the red LED (active low) while pressed, Button 1 the green LED and LED2
const ICE = `library ieee; use ieee.std_logic_1164.all;
entity ice is
  port (clk, btn_n : in std_logic; btn : in std_logic_vector(2 downto 0);
        led : out std_logic_vector(4 downto 0); ledr_n, ledg_n : out std_logic);
end ice;
architecture rtl of ice is
begin
  led <= "000" & btn(0) & not btn_n;
  ledr_n <= btn_n;
  ledg_n <= not btn(0);
end rtl;
`;

// the Cmod S6's (#3745): 4 LEDs, 2 buttons; the buttons light LD0 and LD1, LD2 and LD3 the counter's
const CMOD = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity cmod is
  port (clk : in std_logic; btn : in std_logic_vector(1 downto 0); led : out std_logic_vector(3 downto 0));
end cmod;
architecture rtl of cmod is
  signal q : unsigned(23 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  led <= std_logic_vector(q(23 downto 22)) & btn;
end rtl;
`;
// the boards with fewer than the counter's 8 LEDs: their own design
// the Papilio One's (#3745): no LEDs, switches or buttons, a counter on its wing A
const PAPILIO = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity pap is
  port (clk : in std_logic; wing_a : out std_logic_vector(15 downto 0));
end pap;
architecture rtl of pap is
  signal q : unsigned(31 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then q <= q + 1; end if;
  end process;
  wing_a <= std_logic_vector(q(31 downto 16));
end rtl;
`;
const DESIGNS = { 'papilio-one': { files: { 'src/pap.vhd': PAPILIO }, top: 'pap' }, 'cmod-s6': { files: { 'src/cmod.vhd': CMOD }, top: 'cmod' }, 'icebreaker-vga': { files: { 'src/ice.vhd': ICE }, top: 'ice' } };

/** The emulator open on `board` with the counter, or the board's own design (or `files`, `top`). */
async function emulatorOn(page, board, name, { files = DESIGNS[board]?.files ?? { 'src/blink.vhd': BLINK }, top = DESIGNS[board]?.top ?? 'blink' } = {}) {
  // (the Spartan-6 and iCE40 boards' device: the default device list has the Spartan-3E boards only)
  await makeProject(env, { name, board, device: resolveBoard(board).device, files, top });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval((f) => window.SilinxApp.openFile(f), Object.keys(files)[0]);
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
}

uiTest('#2478 the board layouts in a module of their own: emulator.js exports the same BOARD_LAYOUTS', E, async (page) => {
  assert.deepEqual(await page.eval(async () => {
    const [a, b] = await Promise.all([import('/js/emulator.js'), import('/js/emulator-layouts.js')]);
    return [a.BOARD_LAYOUTS === b.BOARD_LAYOUTS, Object.keys(b.BOARD_LAYOUTS), Object.entries(b.BOARD_LAYOUTS).filter(([, f]) => f.lcd).map(([id]) => id)];
  }), [true, ['basys2', 'nexys2', 's3e-starter', 'nexys3', 'atlys', 'icebreaker', 'basys3', 'nexys-a7', 's3a-starter', 'mimas-v2', 's3-starter', 'cmod-s6', 'icebreaker-vga', 'ulx3s', 'ulx3s-vga', 'tangnano9k', 'tangnano9k-vga', 'papilio-one'], ['s3e-starter', 's3a-starter']]);
});

for (const [board, size, parts] of [['basys2', [840, 556], [8, 8, 4, 4]], ['nexys2', [860, 720], [8, 8, 4, 4]], ['s3e-starter', [860, 736], [8, 4, 5, 0]],
  ['nexys3', [900, 930], [8, 8, 5, 4]], ['atlys', [1100, 780], [8, 8, 6, 4]], ['basys3', [900, 600], [16, 16, 5, 4]], ['nexys-a7', [900, 820], [16, 16, 6, 8]],
  ['s3a-starter', [820, 890], [8, 4, 5, 0]], ['mimas-v2', [900, 600], [8, 8, 6, 3]], ['s3-starter', [900, 565], [8, 8, 4, 4]],
  ['cmod-s6', [936, 252], [4, 0, 2, 0]], ['icebreaker-vga', [1010, 683], [7, 0, 4, 0]],
  ['ulx3s', [1240, 508], [8, 4, 7, 4]], ['ulx3s-vga', [1240, 508], [8, 4, 7, 0]],
  ['tangnano9k', [1100, 830], [14, 8, 6, 4]], ['tangnano9k-vga', [1100, 830], [14, 8, 6, 0]],
  ['papilio-one', [800, 782], [0, 0, 0, 0]]]) {
  uiTest(`#2478 the ${board} drawn: its PCB, LEDs, switches, buttons and digits`, E, async (page) => {
    await emulatorOn(page, board, `Emu-${board}`);
    assert.deepEqual(await page.eval(() => {
      const pcb = document.querySelector('.emu-pcb');   // (its own size: the view may scale it to fit)
      return [[pcb.offsetWidth, pcb.offsetHeight], ['.emu-led', '.emu-sw', '.emu-btn', '.emu-pcb svg[viewBox="0 0 44 64"]'].map((s) => document.querySelectorAll(s).length)];
    }), [size, parts]);
    assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  });
}

/** The board's parts ([data-part]) in the board's own units (the view may scale it): { W, H, name: { x, y, w, h } } (x, y: the centre). */
const geometry = (page, root = '') => page.eval((at) => {
  const pcb = document.querySelector(`${at} .emu-pcb`), r0 = pcb.getBoundingClientRect(), k = pcb.offsetWidth / r0.width;
  const g = { W: pcb.offsetWidth, H: pcb.offsetHeight };
  for (const el of pcb.querySelectorAll('[data-part]')) {
    const r = el.firstElementChild.getBoundingClientRect();
    g[el.dataset.part] = { x: (r.x + r.width / 2 - r0.x) * k, y: (r.y + r.height / 2 - r0.y) * k, w: r.width * k, h: r.height * k };
  }
  return g;
}, root);
// the makers' names, which the drawings do not show (nor their logos): the boards' and parts' names only
const MAKERS = /xilinx|digilent|beyond theory|micron|intel|smsc|atmel|^st$|linear|texas/i;
const leftToRight = (g, names) => names.every((n, i) => !i || g[names[i - 1]].x < g[n].x);

uiTest('#2478 the Spartan-3E Starter Kit drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 's3e-starter', 'Emu-s3e-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [860, 736]);   // (the board's proportions: 1 px = 0.16 mm)
  // the power switch: upright, in the top-left corner beside the 5 V jack, its LED in the corner
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledLeftAbove: l.right < s.left && l.bottom < s.top }; });
  assert.deepEqual(sw, { upright: true, ledLeftAbove: true });
  assert.ok(g.power.x < g.W * 0.2 && g.power.y < g.H * 0.2, JSON.stringify(g.power));
  // the knob among the four buttons, in the bottom-left corner
  assert.ok(g.rot_center.x < g.W * 0.3 && g.rot_center.y > g.H * 0.8, JSON.stringify(g.rot_center));
  assert.ok(g.btn_north.y < g.rot_center.y && g.btn_south.y > g.rot_center.y && g.btn_west.x < g.rot_center.x && g.btn_east.x > g.rot_center.x);
  for (const b of ['btn_north', 'btn_south']) assert.ok(Math.abs(g[b].x - g.rot_center.x) < 5, b);
  for (const b of ['btn_west', 'btn_east']) assert.ok(Math.abs(g[b].y - g.rot_center.y) < 5, b);
  // the pointer aims at each control: what is at its centre is that control (the knob too, between ⟲ and ⟳)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.emu-pcb .emu-btn, .emu-pcb .emu-sw, .emu-pcb .emu-rot-btn, .emu-pcb .emu-power')].filter((c) => {
    c.scrollIntoView({ block: 'center', inline: 'center' });   // (in view: off the window, nothing is at a point)
    const r = c.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(at === c || c.contains(at));
  }).map((c) => c.title)), []);
  // the LCD at the bottom, between the buttons and the LEDs
  assert.ok(g.lcd.x > g.btn_east.x && g.lcd.x < g.led7.x && g.lcd.y > g.H * 0.8, JSON.stringify(g.lcd));
  // LED7..LED0 in a row, left to right, over SW3..SW0, upright switches, in the bottom-right corner
  const leds = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `led${k}`), sws = ['sw3', 'sw2', 'sw1', 'sw0'];
  assert.ok(leftToRight(g, leds) && leftToRight(g, sws));
  assert.ok(leds.every((n) => Math.abs(g[n].y - g.led0.y) < 1 && g[n].y < g.sw0.y - g.sw0.h / 2 && g[n].x > g.W * 0.75));
  assert.ok(sws.every((n) => g[n].h > 1.5 * g[n].w && g[n].x > g.W * 0.75 && g[n].y > g.H * 0.85));
  assert.ok(g.led7.x <= g.sw3.x && g.led0.x > g.sw1.x);   // (the LEDs over the switches, LED0 by SW0)
  // the silkscreen: the boards' names of the parts
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.emu-pcb .s3e-silk')].map((e) => e.textContent)),
    ['BTN_NORTH', 'BTN_SOUTH', 'BTN_WEST', 'BTN_EAST', 'SW3', 'SW2', 'SW1', 'SW0']);
  const art = await page.eval(() => [...document.querySelectorAll('.emu-pcb-art text')].map((t) => t.textContent));
  for (const t of ['VGA', 'PS/2', 'RS-232 DCE', 'RS-232 DTE', 'ETHERNET', 'USB', 'FX2', 'J1', 'J2', 'J4', '50 MHz', 'SMA', 'PROG', 'LD7', 'LD0']) assert.ok(art.includes(t), t);
  // the board's name, none of its makers' names or logos
  assert.ok(art.includes('SPARTAN-3E'));
  assert.deepEqual(art.filter((t) => MAKERS.test(t)), []);
  // the top edge, left to right: VGA, PS/2, DCE, DTE
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, +t.getAttribute('x')])));
  assert.ok(xs.VGA < xs['PS/2'] && xs['PS/2'] < xs['RS-232 DCE'] && xs['RS-232 DCE'] < xs['RS-232 DTE']);
  // it still works: the power switch turns the board off
  await page.eval(() => document.querySelector('.emu-power').click());
  await page.waitFor(() => document.querySelector('.emu .stat').textContent === 'Power off', [], { what: 'Power off' });
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#2479 the Basys2 drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 'basys2', 'Emu-basys2-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [840, 556]);   // (the board's proportions)
  // the power switch SW8: upright, in the bottom-left corner, left of SW7, its STATUS LED over it and to its right
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRightAbove: l.left > s.right && l.bottom < s.top }; });
  assert.deepEqual(sw, { upright: true, ledRightAbove: true });
  assert.ok(g.power.x < g.W * 0.06 && g.power.y > g.H * 0.7 && g.power.x < g.sw7.x, JSON.stringify(g.power));
  // SW7..SW0 left to right along the bottom edge (left part), upright, each under its LED
  const sws = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `sw${k}`);
  assert.ok(leftToRight(g, sws) && sws.every((n) => g[n].h > 1.5 * g[n].w && g[n].y > g.H * 0.75 && g[n].x < g.W * 0.6));
  for (let k = 0; k < 8; k++) assert.ok(Math.abs(g[`led${k}`].x - g[`sw${k}`].x) < 1 && g[`led${k}`].y < g[`sw${k}`].y, `LD${k} over SW${k}`);
  // BTN3..BTN0 left to right on the bottom edge, right of the switches, under AN3..AN0
  const btns = [3, 2, 1, 0].map((k) => `btn${k}`), digits = [3, 2, 1, 0].map((k) => `an${k}`);
  assert.ok(leftToRight(g, btns) && leftToRight(g, digits) && g.btn3.x > g.sw0.x && btns.every((n) => g[n].y > g.H * 0.8));
  // (the display over the row of buttons, the buttons a little to the left of the digits, as on the board)
  assert.ok(digits.every((d) => btns.every((b) => g[d].y < g[b].y)) && g.btn3.x < g.an3.x && g.an3.x < g.btn2.x && g.btn0.x < g.an0.x);
  // the silkscreen: the parts' names with their FPGA pins, as on the board
  const silk = await page.eval(() => [...document.querySelectorAll('.emu-pcb .b2-silk')].map((e) => e.textContent));
  const art = await page.eval(() => [...document.querySelectorAll('.emu-pcb-art text')].map((t) => t.textContent));
  for (const t of ['SW7-N3', 'SW0-P11', 'LD7', 'LD0', 'BTN3-A7', 'BTN0-G12', 'AN3(K14)', 'AN0(F12)']) assert.ok(silk.includes(t), t);
  // the board's name, none of its makers' names or logos
  assert.ok(art.includes('BASYS 2'));
  assert.deepEqual(art.filter((t) => MAKERS.test(t)), []);
  for (const t of ['(B2)', '(A3)', '(J3)', '(B5)', 'POWER', 'SW8', 'STATUS', 'BATTERY', 'JP3', 'JP4', 'IC6', 'DISP1', 'CA(L14)', 'DP(N13)']) assert.ok(silk.includes(t) || art.includes(t), t);
  // the connectors on their edges: JA..JD along the top, the PS/2 (J1) over the mini-USB (J3) on the left, the VGA (J2) on the right
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
  assert.ok(xs.JA[0] < xs.JB[0] && xs.JB[0] < xs.JC[0] && xs.JC[0] < xs.JD[0] && xs.JD[1] < g.H * 0.15);
  assert.ok(xs.J1[0] < g.W * 0.05 && xs.J3[0] < g.W * 0.05 && xs.J1[1] < xs.J3[1] && xs.J3[1] < g.power.y, JSON.stringify([xs.J1, xs.J3]));
  assert.ok(xs.VGA[0] > g.W * 0.8 && xs.VGA[1] > g.H * 0.2 && xs.VGA[1] < g.H * 0.6, JSON.stringify(xs.VGA));
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#2480 the Nexys2 drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 'nexys2', 'Emu-nexys2-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [860, 720]);   // (the board's proportions)
  // the power switch: upright, on the top edge beside the 5 V jack (top left), its LED beside it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right && l.top > s.top && l.bottom < s.bottom + 10 }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < g.W * 0.3 && g.power.y < g.H * 0.1, JSON.stringify(g.power));
  // SW7..SW0 left to right along the bottom edge (left part), upright, each under its LED
  const sws = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `sw${k}`);
  assert.ok(leftToRight(g, sws) && sws.every((n) => g[n].h > 1.5 * g[n].w && g[n].y > g.H * 0.8 && g[n].x < g.W * 0.5));
  for (let k = 0; k < 8; k++) assert.ok(Math.abs(g[`led${k}`].x - g[`sw${k}`].x) < 1 && g[`led${k}`].y < g[`sw${k}`].y, `LD${k} over SW${k}`);
  // the display over BTN3..BTN0, right of the switches, left of the FX2 connector
  const btns = [3, 2, 1, 0].map((k) => `btn${k}`), digits = [3, 2, 1, 0].map((k) => `an${k}`);
  assert.ok(leftToRight(g, btns) && leftToRight(g, digits) && g.btn3.x > g.sw0.x && g.btn0.x < g.W * 0.85 && btns.every((n) => g[n].y > g.H * 0.85));
  for (let k = 0; k < 4; k++) assert.ok(g[`an${k}`].y < g[`btn${k}`].y && Math.abs(g[`an${k}`].x - g[`btn${k}`].x) < 1, `AN${k} over BTN${k}`);
  // the silkscreen: the parts' names, their FPGA pins in brackets
  const silk = await page.eval(() => [...document.querySelectorAll('.emu-pcb .nx2-silk')].map((e) => e.textContent));
  for (const t of ['LD7', '(R4)', 'SW7 (R17)', 'SW0 (G18)', 'BTN3', '(H13)', 'BTN0', '(B18)']) assert.ok(silk.includes(t), t);
  const art = await page.eval(() => [...document.querySelectorAll('.emu-pcb-art text')].map((t) => t.textContent));
  assert.ok(art.includes('NEXYS 2'));
  assert.deepEqual(art.filter((t) => MAKERS.test(t)), []);
  // the connectors on their edges: JA..JD along the top, RESET top right, VGA over RS-232 over USB over PS2 on the left, FX2 on the right
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
  assert.ok(xs.JA[0] < xs.JB[0] && xs.JB[0] < xs.JC[0] && xs.JC[0] < xs.JD[0] && xs.JD[1] < g.H * 0.15 && xs.JA[0] > g.power.x);
  assert.ok(xs.RESET[0] > g.W * 0.9 && xs.RESET[1] < g.H * 0.2);
  assert.ok(['VGA', 'RS-232', 'USB', 'PS2'].every((t, i, a) => xs[t][0] < g.W * 0.12 && (!i || xs[a[i - 1]][1] < xs[t][1])), JSON.stringify(xs));
  assert.ok(xs.FX2[0] > g.W * 0.85 && xs.J1[0] > g.W * 0.85);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#2481 the Nexys3 drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 'nexys3', 'Emu-nexys3-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [900, 930]);   // (the board nearly square, as it is)
  // the power switch: upright, on the left edge at the top, by the 5 V jack; its LED (POWER good) right of it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < g.W * 0.06 && g.power.y < g.H * 0.15, JSON.stringify(g.power));
  // SW7..SW0 left to right along the bottom edge, upright, each under its LED
  const sws = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `sw${k}`);
  assert.ok(leftToRight(g, sws) && sws.every((n) => g[n].h > 1.5 * g[n].w && g[n].y > g.H * 0.85));
  for (let k = 0; k < 8; k++) assert.ok(Math.abs(g[`led${k}`].x - g[`sw${k}`].x) < 1 && g[`led${k}`].y < g[`sw${k}`].y, `LD${k} over SW${k}`);
  // the display AN3..AN0 over the cross of buttons (btn[0] = BTNS in the middle, BTNU over it, BTNL / BTNR beside it, BTND under it), right of the switches
  assert.ok(leftToRight(g, ['an3', 'an2', 'an1', 'an0']) && g.an3.y < g.btn1.y && g.an3.x > g.sw0.x);
  assert.ok(g.btn1.y < g.btn0.y && g.btn3.y > g.btn0.y && g.btn2.x < g.btn0.x && g.btn4.x > g.btn0.x);
  for (const b of ['btn1', 'btn3']) assert.ok(Math.abs(g[b].x - g.btn0.x) < 1, b);
  for (const b of ['btn2', 'btn4']) assert.ok(Math.abs(g[b].y - g.btn0.y) < 1, b);
  const silk = await page.eval(() => [...document.querySelectorAll('.emu-pcb .nx3-silk')].map((e) => e.textContent));
  for (const t of ['LD7(T11)', 'LD0(U16)', 'SW7(T5)', 'SW0(T10)', 'BTNS(B8)', 'BTNU(A8)', 'BTNL(C4)', 'BTND(C9)', 'BTNR(D9)']) assert.ok(silk.includes(t), t);
  const art = await page.eval(() => [...document.querySelectorAll('.emu-pcb-art text')].map((t) => t.textContent));
  assert.ok(art.includes('NEXYS 3'));
  assert.deepEqual(art.filter((t) => MAKERS.test(t)), []);
  // the connectors on their edges: JA..JD along the top, USB PROG / ETHERNET / VGA / USB HOST down the left edge, VHDC and UART on the right
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
  assert.ok(xs.JA[0] < xs.JB[0] && xs.JB[0] < xs.JC[0] && xs.JC[0] < xs.JD[0] && xs.JD[1] < g.H * 0.15);
  assert.ok(['USB PROG', 'ETHERNET', 'VGA', 'USB HOST'].every((t, i, a) => xs[t][0] < g.W * 0.2 && (!i || xs[a[i - 1]][1] < xs[t][1])), JSON.stringify(xs));
  assert.ok(xs.VHDC[0] > g.W * 0.85 && xs.UART[0] > g.W * 0.85 && xs.VHDC[1] < xs.UART[1]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

uiTest('#2481 the Atlys drawn as the real board: its parts where they are, as they are turned, the display on the VHDCI', E, async (page) => {
  await emulatorOn(page, 'atlys', 'Emu-atlys-real');
  const g = await geometry(page), BW = 860;   // (the board 860 x 780, the 7-segment module on its right)
  assert.deepEqual([g.W, g.H], [1100, 780]);
  // the power switch: upright, on the top edge beside the 5 V jack (top left), its LED beside it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < BW * 0.2 && g.power.y < g.H * 0.1, JSON.stringify(g.power));
  // SW7..SW0 left to right along the bottom edge (right part), upright, each under its LED
  const sws = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `sw${k}`);
  assert.ok(leftToRight(g, sws) && sws.every((n) => g[n].h > 1.5 * g[n].w && g[n].y > g.H * 0.85 && g[n].x > BW * 0.5 && g[n].x < BW));
  for (let k = 0; k < 8; k++) assert.ok(Math.abs(g[`led${k}`].x - g[`sw${k}`].x) < 1 && g[`led${k}`].y < g[`sw${k}`].y, `LD${k} over SW${k}`);
  // the buttons in a cross (btn[4] = BTNC in the middle, BTNU over it, BTNL / BTNR beside it, BTND under it), RESET over BTNR, on the board's right
  assert.ok(g.btn0.y < g.btn4.y && g.btn2.y > g.btn4.y && g.btn1.x < g.btn4.x && g.btn3.x > g.btn4.x && g.btn4.x > BW * 0.8 && g.btn4.x < BW);
  assert.ok(g.btn_reset.y < g.btn3.y && Math.abs(g.btn_reset.x - g.btn3.x) < 10 && g.btn_reset.y > g.btn0.y - 20);
  // the display on the module plugged into the VHDCI connector, right of the board
  assert.ok(leftToRight(g, ['an3', 'an2', 'an1', 'an0']) && ['an3', 'an0'].every((n) => g[n].x > BW));
  const art = await page.eval(() => [...document.querySelectorAll('.emu-pcb-art text')].map((t) => t.textContent));
  for (const t of ['ATLYS', 'HDMI OUT', 'HDMI IN', 'HP OUT', 'LINE OUT', 'LINE IN', 'MIC', 'ETHERNET', 'VHDCI', 'JB', 'PROG', 'HOST', 'UART', 'CA(U16)', 'DP(M10)']) assert.ok(art.includes(t), t);
  assert.deepEqual(art.filter((t) => MAKERS.test(t)), []);
  // the top edge, left to right: HDMI OUT, the audio jacks, HDMI IN, Ethernet; the left edge, top to bottom: PROG, HOST, UART
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
  const top = await page.eval((h) => [...document.querySelectorAll('.emu-pcb-art text')].filter((t) => +t.getAttribute('y') < h && +t.getAttribute('y') > 40).sort((p, q) => p.getAttribute('x') - q.getAttribute('x')).map((t) => t.textContent), g.H * 0.15);
  assert.deepEqual(top.filter((t) => /HDMI|OUT|IN$|MIC|ETHERNET/.test(t)), ['HDMI OUT', 'HP OUT', 'LINE OUT', 'LINE IN', 'MIC', 'HDMI IN', 'ETHERNET']);
  // (the other HDMI IN on the left edge, at the bottom)
  assert.ok(['PROG', 'HOST', 'UART', 'HDMI IN'].every((t, i, a) => xs[t][0] < BW * 0.15 && (!i || xs[a[i - 1]][1] < xs[t][1])), JSON.stringify(xs));
  const silk = await page.eval(() => [...document.querySelectorAll('.emu-pcb .at-silk')].map((e) => e.textContent));
  for (const t of ['RESET', 'BTNU', 'BTNC', 'LD7', '(N12)', 'SW0', 'AN3']) assert.ok(silk.includes(t), t);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

// the 7-series boards' (#3706): the texts of the PCB's drawing and where they are; the silkscreen's spans
const artTexts = (page) => page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
const silkOf = (page, cls) => page.eval((c) => [...document.querySelectorAll(`.emu-pcb .${c}`)].map((e) => e.textContent), cls);
const noWarnings = (page) => assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
// LD15..LD0 over SW15..SW0 along the bottom edge, left to right, upright, each LED over its switch
function ledsOverSwitches(g, n = 16) {
  const sws = Array.from({ length: n }, (_, i) => `sw${n - 1 - i}`);
  assert.ok(leftToRight(g, sws) && sws.every((s) => g[s].h > 1.5 * g[s].w && g[s].y > g.H * 0.85), JSON.stringify(sws.map((s) => g[s])));
  for (let k = 0; k < n; k++) assert.ok(Math.abs(g[`led${k}`].x - g[`sw${k}`].x) < 1 && g[`led${k}`].y < g[`sw${k}`].y - g[`sw${k}`].h / 2, `LD${k} over SW${k}`);
  assert.ok(g.sw15.x < g.W * 0.1 && g.sw0.x > g.W * 0.9);
}
// the buttons in a cross: btn[0] = BTNC in the middle, BTNU (1) over it, BTNL (2) / BTNR (4) beside it, BTND (3) under it
function buttonCross(g) {
  assert.ok(g.btn1.y < g.btn0.y && g.btn3.y > g.btn0.y && g.btn2.x < g.btn0.x && g.btn4.x > g.btn0.x);
  for (const b of ['btn1', 'btn3']) assert.ok(Math.abs(g[b].x - g.btn0.x) < 1, b);
  for (const b of ['btn2', 'btn4']) assert.ok(Math.abs(g[b].y - g.btn0.y) < 1, b);
}

uiTest('#3706 the Basys 3 drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 'basys3', 'Emu-basys3-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [900, 600]);   // (the board's proportions)
  // the power switch: upright, on the top edge near the left corner, its LED (the power good LED) in the corner left of it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledLeft: l.right < s.left }; });
  assert.deepEqual(sw, { upright: true, ledLeft: true });
  assert.ok(g.power.x < g.W * 0.2 && g.power.y < g.H * 0.12, JSON.stringify(g.power));
  ledsOverSwitches(g);
  // the 4-digit display AN3..AN0 left of the cross of buttons, both over the LEDs, the buttons right of the middle
  assert.ok(leftToRight(g, ['an3', 'an2', 'an1', 'an0']) && g.an0.x < g.btn2.x && g.an3.y < g.led0.y && g.btn3.y < g.led0.y);
  assert.ok(g.btn0.x > g.W * 0.6 && g.btn0.x < g.W * 0.85 && g.an3.x < g.W * 0.3);
  buttonCross(g);
  const silk = await silkOf(page, 'b3-silk');
  for (const t of ['LD15', 'LD0', '(U16)', '(L1)', 'SW0(V17)', 'SW15(R2)', 'BTNC(U18)', 'BTNU(T18)', 'BTNL(W19)', 'BTND(U17)', 'BTNR(T17)', 'AN0(U2)', 'AN3(W4)']) assert.ok(silk.includes(t), t);
  // the connectors on their edges: PROG UART, VGA, USB HOST along the top, left to right; JA over JXADC on the left
  // edge, JB over JC on the right; PROG and DONE in the top-right corner
  const xs = await artTexts(page);
  for (const t of ['BASYS 3', 'ARTIX-7', 'XC7A35T', 'POWER', 'JP2', 'MODE', 'CA(W7)', 'DP(V7)', '100MHz']) assert.ok(t in xs, t);
  assert.ok(['PROG UART', 'VGA', 'USB HOST'].every((t, i, a) => xs[t][1] < g.H * 0.15 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.ok(xs.JA[0] < g.W * 0.15 && xs.JXADC[0] < g.W * 0.15 && xs.JA[1] < xs.JXADC[1]);
  assert.ok(xs.JB[0] > g.W * 0.85 && xs.JC[0] > g.W * 0.85 && xs.JB[1] < xs.JC[1]);
  assert.ok(xs.PROG[0] > g.W * 0.8 && xs.DONE[0] > g.W * 0.8 && xs.DONE[1] < g.H * 0.15);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

uiTest('#3706 the Nexys A7 drawn as the real board: its parts where they are, as they are turned, the 8 digits, CPU RESET', E, async (page) => {
  await emulatorOn(page, 'nexys-a7', 'Emu-nexysa7-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [900, 820]);   // (the board nearly square, as it is)
  // the power switch: upright, on the top edge beside the 5 V jack (top left), its LED under it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledBelow: l.top > s.bottom }; });
  assert.deepEqual(sw, { upright: true, ledBelow: true });
  assert.ok(g.power.x < g.W * 0.25 && g.power.y < g.H * 0.1, JSON.stringify(g.power));
  ledsOverSwitches(g);
  // the 8 digits AN7..AN0 left to right, in two displays, over the LEDs; the cross of buttons right of them, CPU RESET
  // over it, left of BTNU
  const digits = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `an${k}`);
  assert.ok(leftToRight(g, digits) && digits.every((d) => Math.abs(g[d].y - g.an0.y) < 1 && g[d].y < g.led0.y));
  assert.ok(g.an4.x - g.an5.x < g.an3.x - g.an4.x, 'a gap between the two displays');
  assert.ok(g.an0.x < g.btn2.x && g.btn0.x > g.W * 0.7 && g.btn0.x < g.W * 0.85 && g.btn3.y < g.an0.y + g.an0.h / 2);
  buttonCross(g);
  assert.ok(g.cpu_resetn.y < g.btn1.y && g.cpu_resetn.x < g.btn1.x && g.cpu_resetn.x > g.W * 0.6, JSON.stringify(g.cpu_resetn));
  const silk = await silkOf(page, 'nxa7-silk');
  for (const t of ['CPU RESET', 'LD15', 'LD0', '(H17)', '(V11)', 'SW0(J15)', 'SW15(V10)', 'BTNC(N17)', 'BTNU(M18)', 'BTNL(P17)', 'BTND(P18)', 'BTNR(M17)']) assert.ok(silk.includes(t), t);
  // the connectors on their edges: USB HOST, ETHERNET, VGA, AUDIO OUT along the top, left to right; PROG UART, JD over JC
  // on the left edge; JXADC, JA, JB down the right edge
  const xs = await artTexts(page);
  for (const t of ['NEXYS A7', 'ARTIX-7', 'XC7A100T', 'POWER', 'DDR2', 'DONE', 'PROG', 'CA(T10)', 'DP(H15)', '100MHz']) assert.ok(t in xs, t);
  assert.ok(['USB HOST', 'ETHERNET', 'VGA', 'AUDIO OUT'].every((t, i, a) => xs[t][1] < g.H * 0.15 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.ok(['PROG UART', 'JD', 'JC'].every((t, i, a) => xs[t][0] < g.W * 0.15 && (!i || xs[a[i - 1]][1] < xs[t][1])), JSON.stringify(xs));
  assert.ok(['JXADC', 'JA', 'JB'].every((t, i, a) => xs[t][0] > g.W * 0.85 && (!i || xs[a[i - 1]][1] < xs[t][1])), JSON.stringify(xs));
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the Spartan-3A Starter Kit drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 's3a-starter', 'Emu-s3a-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [820, 890]);   // (the board's proportions, after UG334's photos)
  // the power switch: upright, in the top-left corner under the 5 V jack, its LED right of it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < g.W * 0.1 && g.power.y < g.H * 0.2, JSON.stringify(g.power));
  // the knob among the four buttons, in the bottom-right corner (left of the accessory headers)
  assert.ok(g.rot_center.x > g.W * 0.75 && g.rot_center.x < g.W * 0.9 && g.rot_center.y > g.H * 0.8, JSON.stringify(g.rot_center));
  assert.ok(g.btn_north.y < g.rot_center.y && g.btn_south.y > g.rot_center.y && g.btn_west.x < g.rot_center.x && g.btn_east.x > g.rot_center.x);
  for (const b of ['btn_north', 'btn_south']) assert.ok(Math.abs(g[b].x - g.rot_center.x) < 5, b);
  for (const b of ['btn_west', 'btn_east']) assert.ok(Math.abs(g[b].y - g.rot_center.y) < 5, b);
  // the LCD in the bottom-left corner, LED7..LED0 over SW3..SW0 between it and the knob
  assert.ok(g.lcd.x < g.W * 0.35 && g.lcd.y > g.H * 0.8, JSON.stringify(g.lcd));
  const leds = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `led${k}`), sws = ['sw3', 'sw2', 'sw1', 'sw0'];
  assert.ok(leftToRight(g, leds) && leftToRight(g, sws));
  assert.ok(leds.every((n) => Math.abs(g[n].y - g.led0.y) < 1 && g[n].y < g.sw0.y - g.sw0.h / 2 && g[n].x > g.lcd.x + g.lcd.w / 2 && g[n].x < g.btn_west.x));
  assert.ok(sws.every((n) => g[n].h > 1.5 * g[n].w && g[n].y > g.H * 0.85 && g[n].x < g.btn_west.x));
  assert.ok(g.led7.x <= g.sw3.x && g.led0.x >= g.sw0.x - g.sw0.w);   // (the LEDs over the switches)
  // the silkscreen: the parts' names with their FPGA pins
  assert.deepEqual(await silkOf(page, 's3a-silk'), ['NORTH(T14)', 'SOUTH(T15)', 'WEST(U15)', 'EAST(T16)', 'SW3(T9)', 'SW2(U8)', 'SW1(U10)', 'SW0(V8)']);
  // the connectors on their edges: VGA, PS/2, RS-232 DCE, RS-232 DTE, AUDIO along the top, left to right; ETHERNET over
  // USB on the left edge; the FX2 connector, J20 over J18 on the right edge
  const xs = await artTexts(page);
  for (const t of ['SPARTAN-3A', 'XC3S700A', 'POWER', '5V DC', 'SUSPEND', 'DDR2', 'PROG', 'DONE', '50 MHz', 'AUX CLK', 'SMA', 'J2', 'J15', 'J19', 'J26', 'LED7', 'LED0', 'LOGIC 1']) assert.ok(t in xs, t);
  assert.ok(['VGA', 'PS/2', 'RS-232 DCE', 'RS-232 DTE', 'AUDIO'].every((t, i, a) => xs[t][1] < g.H * 0.1 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.ok(xs.ETHERNET[0] < g.W * 0.1 && xs.USB[0] < g.W * 0.15 && xs.ETHERNET[1] < xs.USB[1]);
  assert.ok(xs.FX2[0] > g.W * 0.85 && xs.J20[0] > g.W * 0.85 && xs.J18[0] > g.W * 0.85 && xs.J20[1] < xs.J18[1] && xs.FX2[1] < xs.J20[1]);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the Mimas V2 drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 'mimas-v2', 'Emu-mimas-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [900, 600]);   // (the board's proportions, after Numato's connection diagram)
  // no power switch on the board: the emulator's on the left edge, under the USB, upright, its LED under it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledBelow: l.top > s.bottom }; });
  assert.deepEqual(sw, { upright: true, ledBelow: true });
  assert.ok(g.power.x < g.W * 0.08 && g.power.y > g.H * 0.6, JSON.stringify(g.power));
  // the 3 digits S1..S3 (AN2..AN0) on the left, D1..D8 (LED0..LED7) left to right in the middle, both over the headers
  assert.ok(leftToRight(g, ['an2', 'an1', 'an0']) && g.an2.x < g.W * 0.2 && g.an0.x < g.led0.x);
  const leds = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => `led${k}`);
  assert.ok(leftToRight(g, leds) && leds.every((n) => Math.abs(g[n].y - g.led0.y) < 1 && g[n].y > g.H * 0.6 && g[n].y < g.H * 0.8));
  // the push buttons on the right: SW1 / SW2 and SW5 / SW6 in pairs, SW4 between the pairs, SW3 under them
  assert.ok([0, 1, 2, 3, 4, 5].every((k) => g[`btn${k}`].x > g.W * 0.75));
  assert.ok(g.btn0.x < g.btn1.x && Math.abs(g.btn0.y - g.btn1.y) < 1 && g.btn4.x < g.btn5.x && Math.abs(g.btn4.y - g.btn5.y) < 1);
  assert.ok(g.btn4.y < g.btn3.y && g.btn3.y < g.btn0.y && g.btn0.y < g.btn2.y && g.btn3.x > g.btn0.x && g.btn3.x < g.btn1.x);
  // the DIP switch in the bottom-right corner: positions 1..8 = DPSwitch7..0, left to right, upright toggles
  const dip = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `sw${k}`);
  assert.ok(leftToRight(g, dip) && dip.every((n) => g[n].x > g.W * 0.75 && g[n].y > g.btn2.y && g[n].h > 1.5 * g[n].w));
  assert.deepEqual(await silkOf(page, 'mv2-silk'), ['S1(B3)', 'S2(A2)', 'S3(B2)', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1',
    'SW6(K18)', 'SW5(K17)', 'SW4(L17)', 'SW3(M16)', 'SW2(L18)', 'SW1(M18)']);
  // the connectors on their edges: JTAG, VGA, AUDIO, MICRO SD along the top, left to right; the DC jack over the mini USB
  // on the left edge; the headers P6..P9 along the bottom, left to right
  const xs = await artTexts(page);
  for (const t of ['MIMAS V2', 'SPARTAN-6', 'XC6SLX9', 'LPDDR', 'P4', 'K1', 'SW7', 'ICSP', '100MHz', 'DIP SWITCH', 'a(A3)', 'h(A5)']) assert.ok(t in xs, t);
  assert.ok(['JTAG', 'VGA', 'AUDIO', 'MICRO SD'].every((t, i, a) => xs[t][1] < g.H * 0.35 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.ok(xs['DC JACK'][0] < g.W * 0.1 && xs['USB MINI'][0] < g.W * 0.1 && xs['DC JACK'][1] < xs['USB MINI'][1]);
  assert.ok(['P6', 'P7', 'P8', 'P9'].every((t, i, a) => xs[t][1] > g.H * 0.8 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t) || /numato/i.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the Spartan-3 Starter Board drawn as the real board: its parts where they are, as they are turned', E, async (page) => {
  await emulatorOn(page, 's3-starter', 'Emu-s3sb-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [900, 565]);   // (the board's proportions, after UG130's figure 1-2)
  // no power switch on the board: the emulator's by the power jack on the left edge, its LED (the POWER LED) right of it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < g.W * 0.2 && g.power.y > g.H * 0.4 && g.power.y < g.H * 0.65, JSON.stringify(g.power));
  // LED7..LED0 over BTN3..BTN0 (bottom left), the 4 digits AN3..AN0 over SW7..SW0 (bottom right)
  const leds = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `led${k}`), btns = ['btn3', 'btn2', 'btn1', 'btn0'], sws = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `sw${k}`);
  assert.ok(leftToRight(g, leds) && leftToRight(g, btns) && leftToRight(g, sws) && leftToRight(g, ['an3', 'an2', 'an1', 'an0']));
  assert.ok(leds.every((n) => g[n].y < g.btn0.y && g[n].x < g.sw7.x) && btns.every((n) => g[n].y > g.H * 0.85 && g[n].x < g.sw7.x));
  assert.ok(sws.every((n) => g[n].h > 1.5 * g[n].w && g[n].y > g.H * 0.8 && g[n].x > g.W * 0.45) && g.sw0.x < g.W * 0.9);
  assert.ok(['an3', 'an2', 'an1', 'an0'].every((n) => g[n].y < g.sw0.y - g.sw0.h / 2 && g[n].x > g.W * 0.55));
  assert.deepEqual(await silkOf(page, 's3sb-silk'), ['AN3(E13)', 'AN2(F14)', 'AN1(G14)', 'AN0(D14)', 'LED7', 'LED6', 'LED5', 'LED4', 'LED3', 'LED2', 'LED1', 'LED0',
    'BTN3(L14)', 'BTN2(L13)', 'BTN1(M14)', 'BTN0(M13)', 'SW7', 'SW6', 'SW5', 'SW4', 'SW3', 'SW2', 'SW1', 'SW0']);
  // the connectors on their edges: A1, A2 along the top; VGA, POWER, RS-232 down the left edge; B1 and PS/2 on the right
  const xs = await artTexts(page);
  for (const t of ['SPARTAN-3', 'XC3S200', 'PROG', 'DONE', '3.3V', 'J7', 'J5', 'JP1', 'JP2', 'J1', 'PlatformFlash', 'A(E14)', 'DP(P16)']) assert.ok(t in xs, t);
  assert.ok(xs.A1[1] < g.H * 0.05 && xs.A2[1] < g.H * 0.05 && xs.A1[0] < xs.A2[0]);
  assert.ok(['VGA', 'POWER', 'RS-232'].every((t, i, a) => xs[t][0] < g.W * 0.1 && (!i || xs[a[i - 1]][1] < xs[t][1])), JSON.stringify(xs));
  assert.ok(xs.B1[0] > g.W * 0.9 && xs['PS/2'][0] > g.W * 0.9 && xs.B1[1] < xs['PS/2'][1]);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the Cmod S6 drawn as the real board: a DIP module, its parts where they are', E, async (page) => {
  await emulatorOn(page, 'cmod-s6', 'Emu-cmods6-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [936, 252]);   // (2.6" x 0.7", 360 px to the inch)
  // no power switch on the board: the emulator's by the micro USB on the left end, its LED (the POWER LED) right of it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < g.W * 0.15, JSON.stringify(g.power));
  // LD3..LD0 in a column, top to bottom, right of the FPGA; BTN0 and BTN1 right of them, side by side
  assert.ok([3, 2, 1, 0].every((k, i, a) => Math.abs(g[`led${k}`].x - g.led0.x) < 1 && (!i || g[`led${a[i - 1]}`].y < g[`led${k}`].y)));
  assert.ok(g.led0.x > g.W * 0.65 && g.btn0.x > g.led0.x && g.btn1.x > g.btn0.x && Math.abs(g.btn0.y - g.btn1.y) < 1 && g.btn1.x < g.W * 0.95);
  assert.deepEqual(await silkOf(page, 'cs6-silk'), ['LD3(P4)', 'LD2(N4)', 'LD1(P3)', 'LD0(N3)', 'BTN1(P9)', 'BTN0(P8)']);
  // the DIP pins along both long edges (48), the board's name, the FPGA; no maker's name
  const xs = await artTexts(page);
  for (const t of ['Cmod S6', 'SPARTAN-6', 'XC6SLX4', 'POWER', 'J4', '8MHz', 'QSPI', '1', '24', '25', '48']) assert.ok(t in xs, t);
  assert.ok(xs['24'][0] < xs['1'][0] && xs['1'][1] < xs['48'][1] && xs['25'][0] < xs['48'][0]);
  assert.equal(await page.eval(() => document.querySelectorAll('.emu-pcb-art circle[r="9"]').length), 48);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the iCEBreaker + PmodVGA drawn as the real board: the iCEBreaker\'s drawing, the PmodVGA over PMOD1A and PMOD1B', E, async (page) => {
  await emulatorOn(page, 'icebreaker-vga', 'Emu-icevga-real');
  const g = await geometry(page), TOP = 190;
  assert.deepEqual([g.W, g.H], [1010, 493 + TOP]);   // (the iCEBreaker drawn TOP lower, the module over it)
  // the board's parts where they are on the iCEBreaker, under the module
  assert.ok(g.power.y > TOP && g.btn_n.y > TOP + 300 && g.led0.x > 712 && g.btn0.x > 712, JSON.stringify(g));
  // the PmodVGA: its VGA connector on its far edge, over the board, its pins (R1..R3, G1..G3, B2..B3, HS, VS)
  const xs = await artTexts(page);
  for (const t of ['VGA (PMOD)', 'R(2 47 45)', 'G(38 34 31)', 'B(46 44)', 'HS(42) VS(36)', 'PMOD1A', 'PMOD1B', 'iCEBreaker']) assert.ok(t in xs, t);
  assert.ok(xs['VGA (PMOD)'][1] < TOP && xs.PMOD1A[0] < xs['VGA (PMOD)'][0] && xs['VGA (PMOD)'][0] < xs.PMOD1B[0]);
  assert.equal(await page.eval(() => document.querySelectorAll('.emu-pcb-art [data-module="vga"]').length), 1);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the ULX3S drawn as the real board: its parts where they are, the breadboard on J1', E, async (page) => {
  await emulatorOn(page, 'ulx3s', 'Emu-ulx3s-real');
  const g = await geometry(page), X0 = 300;
  assert.deepEqual([g.W, g.H], [X0 + 940, 508]);   // (the board after its top view, the breadboard on its left)
  // no power switch on the board: the emulator's by US2 (top right), upright, its LED under it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledBelow: l.top > s.bottom }; });
  assert.deepEqual(sw, { upright: true, ledBelow: true });
  assert.ok(g.power.x > X0 + 940 * 0.85 && g.power.y < 508 * 0.25, JSON.stringify(g.power));
  // D7..D0 left to right top left, F1 and F2 under them; the DIP switch SW1 (positions 1..4) and PWR top right; UP over
  // DOWN, LEFT and RIGHT beside DOWN, bottom right
  const leds = [7, 6, 5, 4, 3, 2, 1, 0].map((k) => `led${k}`);
  assert.ok(leftToRight(g, leds) && leds.every((n) => g[n].x < X0 + 300 && g[n].y < g.btn0.y));
  assert.ok(g.btn0.x < g.btn1.x && Math.abs(g.btn0.y - g.btn1.y) < 1 && g.btn1.x < X0 + 300);
  assert.ok(leftToRight(g, ['sw0', 'sw1', 'sw2', 'sw3', 'btn_pwr_n']) && ['sw0', 'sw3', 'btn_pwr_n'].every((n) => g[n].y < 508 * 0.3 && g[n].x > X0 + 600));
  assert.ok(g.btn2.y < g.btn3.y && Math.abs(g.btn2.x - g.btn3.x) < 1 && g.btn4.x < g.btn3.x && g.btn5.x > g.btn3.x && Math.abs(g.btn4.y - g.btn3.y) < 1 && Math.abs(g.btn5.y - g.btn3.y) < 1);
  assert.ok(g.btn3.y > 508 * 0.85 && g.btn5.x > X0 + 700);
  // the breadboard's 4 digits AN3..AN0 left of the board
  assert.ok(leftToRight(g, ['an3', 'an2', 'an1', 'an0']) && g.an0.x < X0);
  assert.deepEqual(await silkOf(page, 'ulx-silk'), ['D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0',
    'RIGHT(H16)', 'LEFT(U1)', 'DOWN(V1)', 'UP(R18)', 'F2(T1)', 'F1(R1)', 'AN3', 'AN2', 'AN1', 'AN0']);
  // the connectors on the top edge: US1, GPDI1, US2 left to right; J1 and J2 down the long edges
  const xs = await artTexts(page);
  for (const t of ['ULX3S', 'ECP5', 'LFE5U-85F', 'SDRAM', 'ADC', 'Y1', 'SW1', 'B0', 'PWR', 'LCD1', 'J4', 'J5', 'SD', 'BREADBOARD', 'CA(B11)', 'DP(A6)']) assert.ok(t in xs, t);
  assert.ok(['US1', 'GPDI1', 'US2'].every((t, i, a) => xs[t][1] < 120 && (!i || xs[a[i - 1]][0] < xs[t][0])), JSON.stringify(xs));
  assert.ok(xs.J1[0] < 120 && xs.J2[0] > 800);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t) || /radiona|fer|mard/i.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the ULX3S + VGA drawn: the VGA connector on the breadboard, wired to J1', E, async (page) => {
  await emulatorOn(page, 'ulx3s-vga', 'Emu-ulx3svga-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [1240, 508]);
  const xs = await artTexts(page);
  for (const t of ['VGA', 'R(B11 A10 A9)', 'G(B9 A7 C8)', 'B(C6 A6)', 'HS(C11) VS(A11)', 'BREADBOARD']) assert.ok(t in xs, t);
  assert.ok(xs.VGA[0] < 300);
  assert.equal(await page.eval(() => document.querySelectorAll('.emu-pcb-art [data-module="vga"]').length), 1);
  noWarnings(page);
});

uiTest('#3745 the Tang Nano 9K drawn as the real board: its parts where they are, the breadboards on J7 and J6', E, async (page) => {
  await emulatorOn(page, 'tangnano9k', 'Emu-tn9k-real');
  const g = await geometry(page), T = 200, BH = 380;
  assert.deepEqual([g.W, g.H], [1100, T + BH + 250]);   // (the board turned a quarter, J7's breadboard over it, J6's under it)
  // no power switch on the board: the emulator's by the USB-C (left end), upright, its LED right of it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < 150 && g.power.y > T && g.power.y < T + BH, JSON.stringify(g.power));
  // S1 over S2 by the USB-C; LED1..LED6 in a column, top to bottom, left of the middle
  assert.ok(g.btn_n0.x < 100 && Math.abs(g.btn_n0.x - g.btn_n1.x) < 1 && g.btn_n0.y < g.power.y && g.btn_n1.y > g.power.y);
  assert.ok([0, 1, 2, 3, 4, 5].every((k) => Math.abs(g[`led_n${k}`].x - g.led_n0.x) < 1 && (!k || g[`led_n${k - 1}`].y < g[`led_n${k}`].y) && g[`led_n${k}`].y > T));
  // J6's breadboard under the board: LD0..LD7, SW0..SW7, BTN0..BTN3 left to right, each under its pin; J7's display over it
  const io = [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `led${k}`)], ins = [...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => `sw${k}`), 'btn0', 'btn1', 'btn2', 'btn3'];
  assert.ok(leftToRight(g, io) && leftToRight(g, ins) && [...io, ...ins].every((n) => g[n].y > T + BH) && g.led7.x < g.sw0.x);
  assert.ok(leftToRight(g, ['an3', 'an2', 'an1', 'an0']) && g.an0.y < T);
  assert.deepEqual(await silkOf(page, 'tn9-silk'), ['LED6', 'LED5', 'LED4', 'LED3', 'LED2', 'LED1', 'LD7', 'LD6', 'LD5', 'LD4', 'LD3', 'LD2', 'LD1', 'LD0',
    'SW7', 'SW6', 'SW5', 'SW4', 'SW3', 'SW2', 'SW1', 'SW0', 'BTN3', 'BTN2', 'BTN1', 'BTN0', 'AN3', 'AN2', 'AN1', 'AN0']);
  const xs = await artTexts(page);
  for (const t of ['TANG NANO 9K', 'GW1NR-9', 'USB-C', 'HDMI', 'S1', 'S2', 'J6', 'J7', '27MHz', 'LCD', 'BREADBOARD', 'CA(63)', 'DP(80)']) assert.ok(t in xs, t);
  assert.ok(xs['USB-C'][0] < xs.HDMI[0] && xs.HDMI[0] > 800);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t) || /sipeed/i.test(t)), []);
  noWarnings(page);
});

uiTest('#3745 the Papilio One drawn as the real board: its wings with the design\'s ports on their pins', E, async (page) => {
  await emulatorOn(page, 'papilio-one', 'Emu-papilio-real');
  const g = await geometry(page);
  assert.deepEqual([g.W, g.H], [800, 782]);   // (the board after its datasheet's photo)
  // no power switch on the board: the emulator's by the DC jack (top left), upright, its LED (the PWR LED) right of it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledRight: l.left > s.right }; });
  assert.deepEqual(sw, { upright: true, ledRight: true });
  assert.ok(g.power.x < 250 && g.power.y < 120, JSON.stringify(g.power));
  // the wings' pins 0..15 numbered, the design's ports on them: wing_a<15..0> on A's (the counter), B's and C's free
  const ports = await page.eval(() => [...document.querySelectorAll('.emu-pcb .pap-port')].map((e) => [e.textContent, e.classList.contains('nc')]));
  assert.equal(ports.length, 48);
  assert.deepEqual(ports.filter(([, nc]) => !nc).map(([t]) => t).sort(), Array.from({ length: 16 }, (_, k) => `wing_a<${k}>`).sort());
  assert.equal((await silkOf(page, 'pap-silk')).length, 32);
  const xs = await artTexts(page);
  for (const t of ['Papilio One', 'SPARTAN-3E', 'XC3S500E', 'PWR', 'USB', 'X1', 'RX', 'TX', 'TMS', 'REF', 'VCCO', '32MHz', 'OSC', 'U7', 'WING1', 'WING2', 'A', 'B', 'C']) assert.ok(t in xs, t);
  assert.ok(xs.C[0] < 100 && xs.B[0] > 650 && xs.A[0] > xs.B[0] && xs.USB[1] < 80);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t) || /gadget/i.test(t)), []);
  noWarnings(page);
});

uiTest('#3706 #3745 the Basys 3, the Nexys A7, the Spartan-3A Starter Kit, the Mimas V2, the Spartan-3 Starter Board, the Cmod S6, the ULX3S and the Tang Nano 9K in Portuguese: the controls\' tips translated, the silkscreen as on the board', E, async (page) => {
  const setLang = (l) => page.eval(async (x) => { (await import('/js/i18n.js')).setLanguage(x); }, l);
  await page.eval(TEXTS);
  for (const [board, cls] of [['basys3', 'b3-silk'], ['nexys-a7', 'nxa7-silk'], ['s3a-starter', 's3a-silk'], ['mimas-v2', 'mv2-silk'], ['s3-starter', 's3sb-silk'], ['cmod-s6', 'cs6-silk'], ['ulx3s', 'ulx-silk'], ['tangnano9k', 'tn9-silk']]) {
    await emulatorOn(page, board, `Emu-pt-${board}`);
    await setLang('en');
    const en = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-pcb')));
    const silk = await silkOf(page, cls);
    await setLang('pt');
    const pt = await page.eval(() => window.__uiTexts(document.querySelector('.doc:not([hidden]) .emu-pcb')));
    assert.deepEqual(untranslated(en, pt, [/^\w+<\d+>$/]), [], board);   // (the design's ports on the parts: its names)
    assert.ok(pt.some((t) => /^@.* — (clique para comutar$|carregue e mantenha)/.test(t)), `${board}: ${pt.filter((t) => t.startsWith('@')).slice(0, 3)}`);
    assert.deepEqual(await silkOf(page, cls), silk, `${board}: the silkscreen`);
    await setLang('en');
    await page.eval(() => window.SilinxApp.closeDoc(window.SilinxApp.findDoc('emulator')));
  }
  noWarnings(page);
});

// on every board drawn: the pointer aims at each control, what is at its centre is that control (no label, no other
// part over it)
for (const board of ['basys2', 'nexys2', 's3e-starter', 'nexys3', 'atlys', 'basys3', 'nexys-a7', 's3a-starter', 'mimas-v2', 's3-starter', 'cmod-s6', 'icebreaker-vga', 'ulx3s', 'ulx3s-vga', 'tangnano9k', 'tangnano9k-vga', 'papilio-one']) {
  uiTest(`#2481 the ${board}'s controls: each one is what is at its centre`, E, async (page) => {
    await emulatorOn(page, board, `Emu-aim-${board}`);
    assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.emu-pcb .emu-btn, .emu-pcb .emu-sw, .emu-pcb .emu-rot-btn, .emu-pcb .emu-power')].filter((c) => {
      c.scrollIntoView({ block: 'center', inline: 'center' });
      const r = c.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !(at === c || c.contains(at));
    }).map((c) => c.title)), []);
  });
}


uiTest('#2481 the iCEBreaker drawn as the real board: its parts where they are, the snap-off part on PMOD2', E, async (page) => {
  await emulatorOn(page, 'icebreaker', 'Emu-icebreaker-real', { files: { 'src/ice.vhd': ICE }, top: 'ice' });
  // (the main board 712 x MH, the snap-off part on its right; TOP lower, under the Pmods' display and switches, #2517)
  const g = await geometry(page), MW = 712, MH = 493, TOP = 190;
  assert.deepEqual([g.W, g.H], [1010, MH + TOP]);
  assert.deepEqual(await page.eval(() => ['.emu-led', '.emu-btn', '.emu-power', '.emu-sw'].map((s) => document.querySelectorAll(`.emu-pcb ${s}`).length)), [7, 4, 1, 4]);   // (LED1..LED5, G, R; SW0..SW3)
  // no power switch on the board (the USB powers it): the emulator's by the USB, upright, its LED the PWR LED under it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledBelow: l.top > s.bottom }; });
  assert.deepEqual(sw, { upright: true, ledBelow: true });
  assert.ok(g.power.x < MW * 0.06 && g.power.y > TOP && g.power.y < TOP + MH * 0.3, JSON.stringify(g.power));
  // the user button BTN_N on the left edge, under the USB
  assert.ok(g.btn_n.x < MW * 0.1 && g.btn_n.y > TOP + MH * 0.65, JSON.stringify(g.btn_n));
  // the snap-off part, right of the main board: LED1 in the middle of LED2..LED5 in a cross, Button 1..3 in a column right of them
  const led = [0, 1, 2, 3, 4].map((k) => g[`led${k}`]);
  assert.ok(led.every((l) => l.x > MW) && led[1].x < led[0].x && led[2].x > led[0].x && led[3].y < led[0].y && led[4].y > led[0].y);
  for (const k of [1, 2]) assert.ok(Math.abs(led[k].y - led[0].y) < 1, `LED${k + 1} beside LED1`);
  for (const k of [3, 4]) assert.ok(Math.abs(led[k].x - led[0].x) < 1, `LED${k + 1} over or under LED1`);
  assert.ok(g.btn0.y < g.btn1.y && g.btn1.y < g.btn2.y && [0, 1, 2].every((k) => g[`btn${k}`].x > led[2].x && Math.abs(g[`btn${k}`].x - g.btn0.x) < 1));
  // the silkscreen and the connectors: PMOD1A, +5V, PMOD1B along the top, PMOD2 on the right edge, USB on the left
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
  assert.ok(xs.PMOD1A[0] < xs['+5V'][0] && xs['+5V'][0] < xs.PMOD1B[0] && xs.PMOD1B[1] < TOP + MH * 0.2, JSON.stringify(xs));
  assert.ok(xs.PMOD2[0] > MW * 0.8 && xs.PMOD2[0] < MW && xs.USB[0] < MW * 0.15);
  for (const t of ['iCEBreaker', 'PWR', 'UBUTTON', 'RGBLED', 'CDONE', 'CRESET', 'FLASH', '12MHz']) assert.ok(t in xs, t);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  const silk = await page.eval(() => [...document.querySelectorAll('.icb-silk')].map((e) => e.textContent));
  assert.deepEqual(silk, ['LED1 (27)', 'Button 3', 'Button 2', 'Button 1', 'AN3', 'AN2', 'AN1', 'AN0', 'SW3', 'SW2', 'SW1', 'SW0']);
  // each control is what is at its centre (scrolled into view: the board under the Pmods' modules is taller than the ISE
  // style interface's emulator window)
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.emu-btn, .emu-power, .emu-sw')].filter((c) => {
    c.scrollIntoView({ block: 'center', inline: 'center' });
    const r = c.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(at === c || c.contains(at));
  }).map((c) => c.title)), []);
});

uiTest('#2511 the iCEBreaker emulated: its PCF\'s pins, BTN_N active low, the red and green LEDs lit when low', E, async (page) => {
  await emulatorOn(page, 'icebreaker', 'Emu-icebreaker-run', { files: { 'src/ice.vhd': ICE }, top: 'ice' });
  const leds = () => page.eval(() => window.Silinx.active.view.outputs.leds.map((v) => Math.round(v)));
  const settled = (want) => page.waitFor((w) => JSON.stringify(window.Silinx.active.view.outputs.leds.map((v) => Math.round(v))) === w, [JSON.stringify(want)], { what: `LEDs ${want}` });
  // at rest: BTN_N released (high), so LED1 and the red LED dark; Button 1 released, so the green LED dark
  await settled([0, 0, 0, 0, 0, 0, 0]);
  // BTN_N held (Shift+click keeps it): LED1 and the red LED (LEDR_N = BTN_N, low) lit
  await page.click('[data-part="btn_n"] .emu-btn', { modifiers: 8 });
  await settled([1, 0, 0, 0, 0, 1, 0]);
  // Button 1 too: LED2 and the green LED
  await page.click('[data-part="btn0"] .emu-btn', { modifiers: 8 });
  await settled([1, 1, 0, 0, 0, 1, 1]);
  // the LEDs drawn: LED1 and R red, the others green
  const colours = await page.eval(() => Object.fromEntries(['led0', 'led1', 'ledr_n', 'ledg_n'].map((n) => {
    const [r, g] = getComputedStyle(document.querySelector(`[data-part="${n}"] .emu-led`)).backgroundColor.match(/\d+/g).map(Number);
    return [n, r > g ? 'red' : 'green'];
  })));
  assert.deepEqual(colours, { led0: 'red', led1: 'green', ledr_n: 'red', ledg_n: 'green' });
  // nothing of the board is left 'not emulated' (the red and green LEDs are)
  assert.doesNotMatch(await page.eval(() => document.querySelector('.emu-board-note').textContent), /not emulated/);
  assert.deepEqual(await leds(), [1, 1, 0, 0, 0, 1, 1]);
  assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
});

// #2297: the iCEBreaker with its modules on PMOD1A / PMOD1B (the examples' 4-digit display on a breadboard, 4 switches),
// as the board data will have them; drawn alone (web/js/emulator-board.js mountBoardParts, no design), the emulator's
// style in place (a Basys2's emulator opened first)
async function partsAlone(page, board) {
  await emulatorOn(page, 'basys2', `Emu-style-${board.id}`);
  await page.eval(async (b) => {
    const [{ mountBoardParts }, { h }] = await Promise.all([import('/js/emulator-board.js'), import('/js/dom.js')]);
    const main = h('div', { id: 'alone', style: { position: 'fixed', left: '0', top: '0', zIndex: '1000', background: '#fff' } });
    document.body.append(main);
    mountBoardParts({
      board: b, title: '', after() {}, bitFor: () => undefined, compiled: () => false, hasLcd: false, inVal: new Map(), knobEnd: () => 0,
      lcdView: () => null, main, manual: [], period: 83333, powered: () => true, refresh() {}, resLabel: {},
      resOf: (n) => b.resources.find((r) => r.name === n), runCycles() {}, running: () => false, setInputBit() {}, setPower() {},
      sim: {}, tip: (res, k = 0) => `${res}${k}`, wiring: { bits: [], clocks: [] }, setKnobEnd() {}, setLcdView() {},
    });
  }, board);
}
// (#2517) the iCEBreaker's display and switches on its Pmods, as the board data has them
const ICE_PMODS = BOARDS.find((x) => x.id === 'icebreaker');

uiTest('#2297 the iCEBreaker with the display on a breadboard and the 4 switches on its Pmods: over PMOD1A and PMOD1B, the board under them', E, async (page) => {
  await partsAlone(page, ICE_PMODS);
  const g = await geometry(page, '#alone'), TOP = 190;
  assert.deepEqual([g.W, g.H], [1010, 493 + TOP]);   // (the board drawn TOP lower, the modules over it)
  assert.deepEqual(await page.eval(() => ['.emu-led', '.emu-btn', '.emu-sw', '.emu-power', 'svg[viewBox="0 0 44 64"]'].map((s) => document.querySelectorAll(`#alone ${s}`).length)), [7, 4, 4, 1, 4]);
  // the digits AN3..AN0 left to right over PMOD1A, the switches SW3..SW0 left to right over PMOD1B, upright, all over the board
  const digits = ['an3', 'an2', 'an1', 'an0'], sws = ['sw3', 'sw2', 'sw1', 'sw0'];
  assert.ok(leftToRight(g, digits) && leftToRight(g, sws));
  assert.ok([...digits, ...sws].every((n) => g[n].y < TOP), JSON.stringify(g));
  assert.ok(g.an0.x < g.sw3.x && sws.every((n) => g[n].h > 1.5 * g[n].w));
  // the board's parts under them, as without the modules (TOP lower)
  assert.ok(g.power.y > TOP && g.btn_n.y > TOP + 300 && g.led0.y > TOP);
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('#alone .emu-pcb-art text')].map((t) => [t.textContent, +t.getAttribute('y')])));
  for (const t of ['BREADBOARD', 'SWITCHES (PMOD)', 'CA(4)', 'CG(46)', 'DP(44)']) assert.ok(t in xs, t);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  // each control is what is at its centre
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('#alone .emu-btn, #alone .emu-sw, #alone .emu-power')].filter((c) => {
    const r = c.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(at === c || c.contains(at));
  }).map((c) => c.title)), []);
});
