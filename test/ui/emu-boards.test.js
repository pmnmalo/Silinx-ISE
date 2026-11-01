// UI: the Board Emulator's boards drawn as the real ones (web/js/emulator-layouts.js and its boards' modules, #2478):
// the layouts out of emulator.js (which still exports BOARD_LAYOUTS), each board's PCB with its parts.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

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

/** The emulator open on `board` with the counter. */
async function emulatorOn(page, board, name) {
  await makeProject(env, { name, board, files: { 'src/blink.vhd': BLINK }, top: 'blink' });
  await page.openProject(name);
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true);
  await page.eval(() => window.SilinxApp.openFile('src/blink.vhd'));
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
}

uiTest('#2478 the board layouts in a module of their own: emulator.js exports the same BOARD_LAYOUTS', E, async (page) => {
  assert.deepEqual(await page.eval(async () => {
    const [a, b] = await Promise.all([import('/js/emulator.js'), import('/js/emulator-layouts.js')]);
    return [a.BOARD_LAYOUTS === b.BOARD_LAYOUTS, Object.keys(b.BOARD_LAYOUTS), Object.entries(b.BOARD_LAYOUTS).filter(([, f]) => f.lcd).map(([id]) => id)];
  }), [true, ['basys2', 'nexys2', 's3e-starter'], ['s3e-starter']]);
});

for (const [board, size, parts] of [['basys2', [780, 500], [8, 8, 4, 4]], ['nexys2', [800, 560], [8, 8, 4, 4]], ['s3e-starter', [860, 736], [8, 4, 5, 0]]]) {
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
const geometry = (page) => page.eval(() => {
  const pcb = document.querySelector('.emu-pcb'), r0 = pcb.getBoundingClientRect(), k = pcb.offsetWidth / r0.width;
  const g = { W: pcb.offsetWidth, H: pcb.offsetHeight };
  for (const el of pcb.querySelectorAll('[data-part]')) {
    const r = el.firstElementChild.getBoundingClientRect();
    g[el.dataset.part] = { x: (r.x + r.width / 2 - r0.x) * k, y: (r.y + r.height / 2 - r0.y) * k, w: r.width * k, h: r.height * k };
  }
  return g;
});
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
