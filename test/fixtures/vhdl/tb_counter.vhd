-- Testbench for the counter
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use std.env.all;

entity tb_counter is
end tb_counter;

architecture sim of tb_counter is
  constant CLK_PERIOD : time := 20 ns;
  signal clk : std_logic := '0';
  signal rst : std_logic := '1';
  signal en  : std_logic := '0';
  signal q   : std_logic_vector(7 downto 0);
begin
  clk <= not clk after 10 ns;

  dut : entity work.counter
    generic map (WIDTH => 8)
    port map (clk => clk, rst => rst, en => en, q => q);

  stim : process
  begin
    wait for 2 * CLK_PERIOD;
    rst <= '0';
    en  <= '1';
    for i in 1 to 10 loop
      wait until rising_edge(clk);
    end loop;
    wait for 1 ns;
    assert unsigned(q) = 10
      report "counter value is " & integer'image(to_integer(unsigned(q))) & ", expected 10"
      severity error;
    en <= '0';
    wait for 5 * CLK_PERIOD;
    assert q = x"0A" report "counter should hold when disabled" severity failure;
    report "Simulation finished OK" severity note;
    std.env.finish;
  end process stim;
end architecture sim;
