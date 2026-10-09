-- DCM_SP frequency synthesis feeding counters: CLK0 (feedback through a BUFG), CLKFX = 3/2 x CLKIN,
-- CLKDV = CLKIN / 2.5, CLK2X; each output clocks its own 8-bit counter.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk    : in  std_logic;
        en     : in  std_logic;
        locked : out std_logic;
        c0     : out std_logic_vector(7 downto 0);
        cfx    : out std_logic_vector(7 downto 0);
        cdv    : out std_logic_vector(7 downto 0);
        c2x    : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal clk0_u, clk0_b, clkfx_u, clkfx_b, clkdv_u, clkdv_b, clk2x_u, clk2x_b, clkin_b : std_logic;
  signal n0, nfx, ndv, n2x : unsigned(7 downto 0) := (others => '0');
  signal en_r : std_logic := '0';
begin
  u_ibufg : IBUFG port map (I => clk, O => clkin_b);

  u_dcm : DCM_SP
    generic map (
      CLKDV_DIVIDE => 2.5, CLKFX_MULTIPLY => 3, CLKFX_DIVIDE => 2, CLKIN_PERIOD => 20.0,
      CLK_FEEDBACK => "1X", CLKIN_DIVIDE_BY_2 => FALSE, CLKOUT_PHASE_SHIFT => "NONE",
      DFS_FREQUENCY_MODE => "LOW", DLL_FREQUENCY_MODE => "LOW", STARTUP_WAIT => FALSE)
    port map (
      CLKIN => clkin_b, CLKFB => clk0_b, RST => '0', DSSEN => '0', PSCLK => '0', PSEN => '0', PSINCDEC => '0',
      CLK0 => clk0_u, CLK90 => open, CLK180 => open, CLK270 => open, CLK2X => clk2x_u, CLK2X180 => open,
      CLKDV => clkdv_u, CLKFX => clkfx_u, CLKFX180 => open, LOCKED => locked, PSDONE => open, STATUS => open);

  u_b0  : BUFG port map (I => clk0_u, O => clk0_b);
  u_bfx : BUFG port map (I => clkfx_u, O => clkfx_b);
  u_bdv : BUFG port map (I => clkdv_u, O => clkdv_b);
  u_b2x : BUFG port map (I => clk2x_u, O => clk2x_b);

  process (clk0_b) begin if rising_edge(clk0_b) then en_r <= en; if en_r = '1' then n0 <= n0 + 1; end if; end if; end process;
  process (clkfx_b) begin if rising_edge(clkfx_b) then nfx <= nfx + 1; end if; end process;
  process (clkdv_b) begin if rising_edge(clkdv_b) then ndv <= ndv + 1; end if; end process;
  process (clk2x_b) begin if rising_edge(clk2x_b) then n2x <= n2x + 3; end if; end process;

  c0 <= std_logic_vector(n0);
  cfx <= std_logic_vector(nfx);
  cdv <= std_logic_vector(ndv);
  c2x <= std_logic_vector(n2x);
end rtl;
