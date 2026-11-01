// UI: the Board Emulator's boards drawn as the real ones (web/js/emulator-layouts.js and its boards' modules, #2478):
// the layouts out of emulator.js (which still exports BOARD_LAYOUTS), each board's PCB with its parts.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';
import { resolveBoard } from '../../server/devices.js';

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

/** The emulator open on `board` with the counter (or `files`, `top`). */
async function emulatorOn(page, board, name, { files = { 'src/blink.vhd': BLINK }, top = 'blink' } = {}) {
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
  }), [true, ['basys2', 'nexys2', 's3e-starter', 'nexys3', 'atlys', 'icebreaker'], ['s3e-starter']]);
});

for (const [board, size, parts] of [['basys2', [840, 556], [8, 8, 4, 4]], ['nexys2', [860, 720], [8, 8, 4, 4]], ['s3e-starter', [860, 736], [8, 4, 5, 0]],
  ['nexys3', [900, 930], [8, 8, 5, 4]], ['atlys', [1100, 780], [8, 8, 6, 4]]]) {
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

// on every board drawn: the pointer aims at each control, what is at its centre is that control (no label, no other
// part over it)
for (const board of ['basys2', 'nexys2', 's3e-starter', 'nexys3', 'atlys']) {
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
  const g = await geometry(page), MW = 712;   // (the main board 712 x 493, the snap-off part on its right)
  assert.deepEqual([g.W, g.H], [1010, 493]);
  assert.deepEqual(await page.eval(() => ['.emu-led', '.emu-btn', '.emu-power', '.emu-sw'].map((s) => document.querySelectorAll(`.emu-pcb ${s}`).length)), [7, 4, 1, 0]);   // (LED1..LED5, G, R)
  // no power switch on the board (the USB powers it): the emulator's by the USB, upright, its LED the PWR LED under it
  const sw = await page.eval(() => { const s = document.querySelector('.emu-power-sw').getBoundingClientRect(), l = document.querySelector('.emu-power-led').getBoundingClientRect();
    return { upright: s.height > 2 * s.width, ledBelow: l.top > s.bottom }; });
  assert.deepEqual(sw, { upright: true, ledBelow: true });
  assert.ok(g.power.x < MW * 0.06 && g.power.y < g.H * 0.3, JSON.stringify(g.power));
  // the user button BTN_N on the left edge, under the USB
  assert.ok(g.btn_n.x < MW * 0.1 && g.btn_n.y > g.H * 0.65, JSON.stringify(g.btn_n));
  // the snap-off part, right of the main board: LED1 in the middle of LED2..LED5 in a cross, Button 1..3 in a column right of them
  const led = [0, 1, 2, 3, 4].map((k) => g[`led${k}`]);
  assert.ok(led.every((l) => l.x > MW) && led[1].x < led[0].x && led[2].x > led[0].x && led[3].y < led[0].y && led[4].y > led[0].y);
  for (const k of [1, 2]) assert.ok(Math.abs(led[k].y - led[0].y) < 1, `LED${k + 1} beside LED1`);
  for (const k of [3, 4]) assert.ok(Math.abs(led[k].x - led[0].x) < 1, `LED${k + 1} over or under LED1`);
  assert.ok(g.btn0.y < g.btn1.y && g.btn1.y < g.btn2.y && [0, 1, 2].every((k) => g[`btn${k}`].x > led[2].x && Math.abs(g[`btn${k}`].x - g.btn0.x) < 1));
  // the silkscreen and the connectors: PMOD1A, +5V, PMOD1B along the top, PMOD2 on the right edge, USB on the left
  const xs = await page.eval(() => Object.fromEntries([...document.querySelectorAll('.emu-pcb-art text')].map((t) => [t.textContent, [+t.getAttribute('x'), +t.getAttribute('y')]])));
  assert.ok(xs.PMOD1A[0] < xs['+5V'][0] && xs['+5V'][0] < xs.PMOD1B[0] && xs.PMOD1B[1] < g.H * 0.2, JSON.stringify(xs));
  assert.ok(xs.PMOD2[0] > MW * 0.8 && xs.PMOD2[0] < MW && xs.USB[0] < MW * 0.15);
  for (const t of ['iCEBreaker', 'PWR', 'UBUTTON', 'RGBLED', 'CDONE', 'CRESET', 'FLASH', '12MHz']) assert.ok(t in xs, t);
  assert.deepEqual(Object.keys(xs).filter((t) => MAKERS.test(t)), []);
  const silk = await page.eval(() => [...document.querySelectorAll('.icb-silk')].map((e) => e.textContent));
  assert.deepEqual(silk, ['LED1 (27)', 'Button 3', 'Button 2', 'Button 1']);
  // each control is what is at its centre
  assert.deepEqual(await page.eval(() => [...document.querySelectorAll('.emu-btn, .emu-power')].filter((c) => {
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
