----------------------------------------------------------------------------------
-- Test bench for top: uses a small DIV so the LEDs move every 4 clock cycles (speed level 0),
-- a 2-cycle button debounce, and checks that the buttons change the speed.
----------------------------------------------------------------------------------
LIBRARY ieee;
USE ieee.std_logic_1164.ALL;
USE ieee.numeric_std.ALL;

ENTITY tb_top IS
END tb_top;

ARCHITECTURE behavior OF tb_top IS
   signal clk : std_logic := '0';
   signal sw  : std_logic_vector(3 downto 0) := "0001";
   signal btn : std_logic_vector(1 downto 0) := "00";
   signal led : std_logic_vector(7 downto 0);
   constant clk_period : time := 20 ns;
BEGIN
   uut: entity work.top
      generic map ( DIV => 4, DEBOUNCE => 2, LEVEL0 => 0 )
      port map ( clk => clk, sw => sw, btn => btn, led => led );

   clk_process : process
   begin
      clk <= '0'; wait for clk_period/2;
      clk <= '1'; wait for clk_period/2;
   end process;

   stim_proc: process
      variable snap : std_logic_vector(7 downto 0);
      procedure press(signal b : out std_logic) is
      begin
         b <= '1'; wait for clk_period * 8;
         b <= '0'; wait for clk_period * 8;
      end procedure;
      variable a, z : integer;
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
      -- speed buttons (binary counter mode, not paused, not inverted)
      sw(3) <= '0'; sw(2) <= '0';
      wait for clk_period * 4;
      a := to_integer(unsigned(led)); wait for clk_period * 80; z := to_integer(unsigned(led));
      assert (z - a) mod 256 = 20 report "level 0: expected 20 steps in 80 clocks, got " & integer'image((z - a) mod 256) severity error;
      press(btn(0));                      -- slower: level 1, a step every 8 clocks
      a := to_integer(unsigned(led)); wait for clk_period * 80; z := to_integer(unsigned(led));
      assert (z - a) mod 256 = 10 report "slower: expected 10 steps in 80 clocks, got " & integer'image((z - a) mod 256) severity error;
      press(btn(0));                      -- slower: level 2, a step every 16 clocks
      a := to_integer(unsigned(led)); wait for clk_period * 160; z := to_integer(unsigned(led));
      assert (z - a) mod 256 = 10 report "slower x2: expected 10 steps in 160 clocks, got " & integer'image((z - a) mod 256) severity error;
      press(btn(1)); press(btn(1)); press(btn(1));   -- faster x3: back to level 0 (it stops there)
      a := to_integer(unsigned(led)); wait for clk_period * 80; z := to_integer(unsigned(led));
      assert (z - a) mod 256 = 20 report "faster: expected 20 steps in 80 clocks, got " & integer'image((z - a) mod 256) severity error;
      report "Simulation finished OK" severity note;
      wait;
   end process;
END;
