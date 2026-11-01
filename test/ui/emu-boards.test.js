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

for (const [board, size, parts] of [['basys2', [780, 500], [8, 8, 4, 4]], ['nexys2', [800, 560], [8, 8, 4, 4]], ['s3e-starter', [840, 560], [8, 4, 5, 0]]]) {
  uiTest(`#2478 the ${board} drawn: its PCB, LEDs, switches, buttons and digits`, E, async (page) => {
    await emulatorOn(page, board, `Emu-${board}`);
    assert.deepEqual(await page.eval(() => {
      const pcb = document.querySelector('.emu-pcb');   // (its own size: the view may scale it to fit)
      return [[pcb.offsetWidth, pcb.offsetHeight], ['.emu-led', '.emu-sw', '.emu-btn', '.emu-pcb svg[viewBox="0 0 44 64"]'].map((s) => document.querySelectorAll(s).length)];
    }), [size, parts]);
    assert.deepEqual(page.console.filter((c) => c.type === 'warning' || c.type === 'warn' || c.type === 'error').map((c) => c.text), []);
  });
}
