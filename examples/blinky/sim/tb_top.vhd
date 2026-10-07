----------------------------------------------------------------------------------
-- Test bench for top: a small DIV (base tick every 2 clock cycles) and a 2-cycle button
-- debounce. After reset the speed is level 3: the LEDs move every 2 * 2**3 = 16 cycles.
-- Checks the knight rider, the binary counter, pause, invert and the speed buttons
-- (the speed_ctrl ASM chart: one level per press, limited to levels 0..7).
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
      generic map ( DIV => 2, DEBOUNCE => 2 )
      port map ( clk => clk, sw => sw, btn => btn, led => led );

   clk_process : process
   begin
      clk <= '0'; wait for clk_period/2;
      clk <= '1'; wait for clk_period/2;
   end process;

   stim_proc: process
      variable snap : std_logic_vector(7 downto 0);
      variable a, n : integer;
      -- press and release a button (held long enough for the debounce)
      procedure press(signal b : out std_logic) is
      begin
         b <= '1'; wait for clk_period * 8;
         b <= '0'; wait for clk_period * 8;
      end procedure;
      -- binary counter steps in `cycles` clock cycles must be `expect` (+-1: phase of the window)
      procedure check_rate(cycles, expect : integer; what : string) is
         variable s0, d : integer;
      begin
         s0 := to_integer(unsigned(led));
         wait for clk_period * cycles;
         d := (to_integer(unsigned(led)) - s0) mod 256;
         assert abs (d - expect) <= 1
            report what & ": expected " & integer'image(expect) & " steps, got " & integer'image(d) severity error;
      end procedure;
   begin
      wait for 100 ns;
      sw(0) <= '0';                                   -- release reset
      -- knight rider: the light runs to the MSB and comes back (a step every 16 cycles)
      wait until led = "10000000" for clk_period * 16 * 9;
      assert led = "10000000" report "knight rider did not reach the MSB" severity error;
      wait until led = "00000001" for clk_period * 16 * 9;
      assert led = "00000001" report "knight rider did not come back" severity error;
      sw(1) <= '1';                                   -- binary counter mode
      wait for clk_period * 40;
      sw(2) <= '1';                                   -- pause: the counter must hold
      wait for clk_period * 2;
      snap := led;
      wait for clk_period * 40;
      assert led = snap report "pause did not hold the LEDs" severity error;
      sw(3) <= '1';                                   -- invert
      wait for 1 ns;
      assert led = not snap report "invert did not invert the LEDs" severity error;
      sw(3) <= '0'; sw(2) <= '0';
      wait for clk_period * 2;
      -- speed buttons
      check_rate(320, 20, "level 3 (reset)");         -- 16 cycles per step
      press(btn(0));                                  -- slower: level 4, 32 cycles per step
      check_rate(320, 10, "slower");
      press(btn(1)); press(btn(1));                   -- faster x2: level 2, 8 cycles per step
      check_rate(320, 40, "faster x2");
      for i in 1 to 4 loop press(btn(1)); end loop;   -- faster x4: stops at level 0, 2 cycles
      check_rate(320, 160, "fastest (level 0)");
      for i in 1 to 9 loop press(btn(0)); end loop;   -- slower x9: stops at level 7, 256 cycles
      check_rate(1024, 4, "slowest (level 7)");
      report "Simulation finished OK" severity note;
      wait;
   end process;
END;
