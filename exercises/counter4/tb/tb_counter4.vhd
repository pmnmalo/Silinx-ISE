-- The hidden test bench of the counter4 exercise: counting, the wrap from 15 to 0, the reset while counting.
library ieee;
use ieee.std_logic_1164.all;

entity tb_counter4 is
end entity tb_counter4;

architecture sim of tb_counter4 is
  signal clk, rst, en : std_logic := '0';
  signal q : std_logic_vector(3 downto 0);
begin
  uut : entity work.counter4 port map (clk => clk, rst => rst, en => en, q => q);
  clk <= not clk after 10 ns;
  process
  begin
    rst <= '1';
    wait until rising_edge(clk);
    wait for 1 ns;
    rst <= '0';
    en <= '1';
    for i in 1 to 5 loop
      wait until rising_edge(clk);
    end loop;
    wait for 1 ns;
    assert q = "0101" report "after 5 counts q is not 0101" severity error;
    for i in 6 to 16 loop
      wait until rising_edge(clk);
    end loop;
    wait for 1 ns;
    assert q = "0000" report "after 16 counts q is not 0000 (the wrap from 15 to 0)" severity error;
    wait until rising_edge(clk);
    wait until rising_edge(clk);
    wait for 1 ns;
    rst <= '1';
    wait until rising_edge(clk);
    wait for 1 ns;
    assert q = "0000" report "the reset does not clear q while counting" severity error;
    report "TB DONE";
    wait;
  end process;
end architecture sim;
