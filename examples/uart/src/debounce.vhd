----------------------------------------------------------------------------------
-- Silinx example (uart): a push button made clean. The button is synchronised to the clock
-- (two flip-flops), must then stay at its new level for STABLE clock cycles to be taken (a
-- mechanical button bounces for a few milliseconds), and `press` is high for one clock cycle when
-- it goes down.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity debounce is
    Generic ( STABLE : integer := 1_000_000 );     -- 20 ms at 50 MHz
    Port ( clk   : in  STD_LOGIC;
           btn   : in  STD_LOGIC;                  -- the raw button (high while pressed)
           press : out STD_LOGIC );                -- one clock cycle per press
end debounce;

architecture Behavioral of debounce is
    signal sync  : STD_LOGIC_VECTOR (1 downto 0) := "00";
    signal level : STD_LOGIC := '0';
    signal count : integer range 0 to STABLE := 0;
begin
    process (clk)
    begin
        if rising_edge(clk) then
            sync  <= sync(0) & btn;
            press <= '0';
            if sync(1) = level then
                count <= 0;
            elsif count = STABLE - 1 then
                count <= 0;
                level <= sync(1);
                press <= sync(1);                  -- pressed, not released
            else
                count <= count + 1;
            end if;
        end if;
    end process;
end Behavioral;
