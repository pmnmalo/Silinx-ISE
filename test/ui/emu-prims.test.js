// UI: the Board Emulator's compiled engine with Xilinx primitives (#429): a design on a DCM's 25 MHz clock
// (CLKFX = CLKIN / 2) reading a block RAM ROM (RAMB16_S9, INIT_00) runs on the compiled engine, at the
// board's speed; its LEDs show the ROM's bytes in turn.
import { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupUi, uiTest, makeProject } from './harness.js';

let env;
before(async () => { env = await setupUi(); });
after(async () => { await env?.teardown?.(); });
const E = () => env;

const EMU_PRIMS = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
library unisim; use unisim.vcomponents.all;
entity prm is
  port (clk : in std_logic; sw : in std_logic_vector(7 downto 0); led : out std_logic_vector(7 downto 0));
end prm;
architecture rtl of prm is
  signal fx, c25 : std_logic;
  signal n : integer range 0 to 2499999 := 0;   -- 10 steps per second at 25 MHz
  signal a : unsigned(2 downto 0) := (others => '0');
  signal q : std_logic_vector(7 downto 0);
  signal addr : std_logic_vector(10 downto 0);   -- (a port's actual is a signal's name, as XST requires, #2602)
begin
  u_dcm : DCM_SP generic map (CLKFX_MULTIPLY => 2, CLKFX_DIVIDE => 4, CLKIN_PERIOD => 20.0)
    port map (CLKIN => clk, RST => '0', CLKFX => fx);
  u_buf : BUFG port map (I => fx, O => c25);
  process (c25) begin
    if rising_edge(c25) then
      if n = 2499999 then n <= 0; a <= a + 1; else n <= n + 1; end if;
    end if;
  end process;
  addr <= "00000000" & std_logic_vector(a);
  u_rom : RAMB16_S9 generic map (INIT_00 => X"00000000000000000000000000000000000000000000000080402010080402FF")
    port map (DO => q, DOP => open, ADDR => addr, CLK => c25, DI => X"00", DIP => "0", EN => '1', SSR => '0', WE => '0');
  led <= q xor sw;
end rtl;
`;

uiTest('board emulator: a design with a DCM and a block RAM runs on the compiled engine; its LEDs show the ROM', E, async (page) => {
  await makeProject(env, { name: 'EmuPrims', board: 'basys2', files: { 'src/prm.vhd': EMU_PRIMS }, top: 'prm' });
  await page.openProject('EmuPrims');
  assert.equal(await page.eval(() => window.SilinxApp.regenerateUcf()), true, 'every port is on a board resource');
  await page.menu('Tools', 'Board Emulator');
  await page.waitFor(() => window.Silinx.active?.id === 'emulator' && window.Silinx.active.view?.outputs, [], { what: 'emulator running' });
  assert.equal(await page.eval(() => window.Silinx.active.view.engine), 'compiled', 'the DCM and the RAMB16 have models: the compiled engine runs it');
  // the ROM's first byte (FF: every LED on), then the next ones (02: LD1 only, then 04…) at 10 a second
  const leds = () => page.eval(() => window.Silinx.active.view.outputs.leds.map((v) => (v > 0.5 ? 1 : 0)).join(''));
  await page.waitFor(() => window.Silinx.active.view.outputs.leds.every((v) => v > 0.5), [], { what: 'the ROM byte FF on the LEDs' });
  await page.waitFor(() => { const l = window.Silinx.active.view.outputs.leds; return l[1] > 0.5 && l.filter((v) => v > 0.5).length === 1; }, [], { what: 'the ROM byte 02 on the LEDs', timeout: 30000 });
  assert.match(await leds(), /^[01]{8}$/);
  assert.deepEqual(page.dialogs, []);
});
