----------------------------------------------------------------------------------
-- Silinx example (isqrt): the 4-digit 7-segment display of the Basys2 / Nexys2, multiplexed:
-- one digit at a time, each for REFRESH clock cycles (1 ms at 50 MHz: the four digits seem lit at
-- once). Segments, decimal point and anodes are active low; seg(0) is segment a ... seg(6) is g.
-- Each digit: 0-9 a number, 15 blank. points(i): the decimal point of digit i.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity sevenseg is
    Generic ( REFRESH : integer := 50_000 );
    Port ( clk    : in  STD_LOGIC;
           digits : in  STD_LOGIC_VECTOR (15 downto 0);   -- digit 3 (left) .. digit 0 (right)
           points : in  STD_LOGIC_VECTOR (3 downto 0);
           seg    : out STD_LOGIC_VECTOR (6 downto 0);
           dp     : out STD_LOGIC;
           an     : out STD_LOGIC_VECTOR (3 downto 0) );
end sevenseg;

architecture Behavioral of sevenseg is
    signal count : integer range 0 to REFRESH - 1 := 0;
    signal sel   : UNSIGNED (1 downto 0) := "00";
    signal d     : STD_LOGIC_VECTOR (3 downto 0);
begin
    process (clk)
    begin
        if rising_edge(clk) then
            if count = REFRESH - 1 then
                count <= 0;
                sel <= sel + 1;
            else
                count <= count + 1;
            end if;
        end if;
    end process;

    with sel select d <=
        digits(3 downto 0)   when "00",
        digits(7 downto 4)   when "01",
        digits(11 downto 8)  when "10",
        digits(15 downto 12) when others;

    with sel select an <=
        "1110" when "00",
        "1101" when "01",
        "1011" when "10",
        "0111" when others;

    dp <= not points(to_integer(sel));

    with d select seg <=                   -- gfedcba
        "1000000" when "0000",
        "1111001" when "0001",
        "0100100" when "0010",
        "0110000" when "0011",
        "0011001" when "0100",
        "0010010" when "0101",
        "0000010" when "0110",
        "1111000" when "0111",
        "0000000" when "1000",
        "0010000" when "1001",
        "1111111" when others;             -- blank
end Behavioral;
