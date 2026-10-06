-- Moore FSM: detects the sequence "101" on input x (two-process style)
library ieee;
use ieee.std_logic_1164.all;

entity seq_detect is
  port (
    clk   : in  std_logic;
    reset : in  std_logic;
    x     : in  std_logic;
    found : out std_logic
  );
end entity;

architecture two_proc of seq_detect is
  type state_t is (IDLE, GOT1, GOT10, DETECTED);
  signal state, next_state : state_t;
begin
  -- state register
  sync_proc : process (clk)
  begin
    if rising_edge(clk) then
      if reset = '1' then
        state <= IDLE;
      else
        state <= next_state;
      end if;
    end if;
  end process sync_proc;

  -- next-state and output logic
  comb_proc : process (state, x)
  begin
    next_state <= state;
    found <= '0';
    case state is
      when IDLE =>
        if x = '1' then next_state <= GOT1; end if;
      when GOT1 =>
        if x = '0' then next_state <= GOT10; end if;
      when GOT10 =>
        if x = '1' then
          next_state <= DETECTED;
        else
          next_state <= IDLE;
        end if;
      when DETECTED =>
        found <= '1';
        if x = '1' then next_state <= GOT1; else next_state <= GOT10; end if;
    end case;
  end process comb_proc;
end architecture two_proc;
