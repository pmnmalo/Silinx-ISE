----------------------------------------------------------------------------------
-- Test bench for top: uses a small DIV so the LEDs move every 4 clock cycles.
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;

ENTITY tb_top IS
END tb_top;

ARCHITECTURE behavior OF tb_top IS
   signal clk : std_logic := '0';
   signal sw  : std_logic_vector(3 downto 0) := "0001";
   signal led : std_logic_vector(7 downto 0);
   constant clk_period : time := 20 ns;
BEGIN
   uut: entity work.top
      generic map ( DIV => 4 )
      port map ( clk => clk, sw => sw, led => led );

   clk_process : process
   begin
      clk <= '0'; wait for clk_period/2;
      clk <= '1'; wait for clk_period/2;
   end process;

   stim_proc: process
      variable snap : std_logic_vector(7 downto 0);
   begin
      wait for 100 ns;
      sw(0) <= '0';                       -- release reset
      wait for clk_period * 4 * 8 + 1 ns; -- 7 steps to the left (1st step after 5 clocks)
      assert led = "10000000" report "knight rider did not reach the MSB" severity error;
      wait for clk_period * 4 * 7;
      assert led = "00000001" report "knight rider did not come back" severity error;
      sw(1) <= '1';                       -- binary counter mode
      wait for clk_period * 40;
      sw(2) <= '1';                       -- pause: the counter must hold
      wait for clk_period * 2;
      snap := led;
      wait for clk_period * 20;
      assert led = snap report "pause did not hold the LEDs" severity error;
      sw(3) <= '1';                       -- invert
      wait for 1 ns;
      assert led = not snap report "invert did not invert the LEDs" severity error;
      report "Simulation finished OK" severity note;
      wait;
   end process;
END;
