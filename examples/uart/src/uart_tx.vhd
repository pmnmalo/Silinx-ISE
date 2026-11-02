----------------------------------------------------------------------------------
-- Silinx example (uart): a UART transmitter, 8N1, BIT_T clock cycles a bit. `start` (one clock
-- cycle, while not busy) sends `data`: a start bit at 0, its 8 bits, the least significant first,
-- and a stop bit at 1; the line is at 1 between frames.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity uart_tx is
    Generic ( BIT_T : integer := 5208 );          -- 9600 baud at 50 MHz
    Port ( clk   : in  STD_LOGIC;
           start : in  STD_LOGIC;
           data  : in  STD_LOGIC_VECTOR (7 downto 0);
           busy  : out STD_LOGIC;
           tx    : out STD_LOGIC );
end uart_tx;

architecture Behavioral of uart_tx is
    signal sending : STD_LOGIC := '0';
    signal count   : integer range 0 to BIT_T - 1 := 0;
    signal bitn    : integer range 0 to 9 := 0;
    signal frame   : STD_LOGIC_VECTOR (8 downto 0) := (others => '1');   -- data, start: sent from bit 0, 1s after them (the stop bit)
begin
    process (clk)
    begin
        if rising_edge(clk) then
            if sending = '0' then
                if start = '1' then
                    frame <= data & '0';
                    sending <= '1';
                    count <= BIT_T - 1;
                    bitn <= 0;
                end if;
            elsif count /= 0 then
                count <= count - 1;
            else
                count <= BIT_T - 1;
                frame <= '1' & frame(8 downto 1);
                if bitn = 9 then
                    sending <= '0';
                else
                    bitn <= bitn + 1;
                end if;
            end if;
        end if;
    end process;

    busy <= sending;
    tx <= frame(0) when sending = '1' else '1';
end Behavioral;
