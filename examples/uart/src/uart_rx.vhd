----------------------------------------------------------------------------------
-- Silinx example (uart): a UART receiver, 8N1 (a start bit at 0, 8 data bits, the least
-- significant first, a stop bit at 1), BIT_T clock cycles a bit. The line is synchronised to the
-- clock (two flip-flops); from the start bit's falling edge each bit is sampled in its middle. A
-- start bit back at 1 in its middle was a glitch: no frame. `valid` is high for one clock cycle
-- with each byte whose stop bit is 1.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity uart_rx is
    Generic ( BIT_T : integer := 5208 );          -- 9600 baud at 50 MHz
    Port ( clk   : in  STD_LOGIC;
           rx    : in  STD_LOGIC;                 -- the line (1 when idle)
           data  : out STD_LOGIC_VECTOR (7 downto 0);
           valid : out STD_LOGIC );
end uart_rx;

architecture Behavioral of uart_rx is
    signal sync  : STD_LOGIC_VECTOR (1 downto 0) := "11";
    signal busy  : STD_LOGIC := '0';
    signal count : integer range 0 to BIT_T - 1 := 0;
    signal bitn  : integer range 0 to 9 := 0;     -- 0: the start bit, 1..8: the data, 9: the stop bit
    signal shift : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
begin
    process (clk)
    begin
        if rising_edge(clk) then
            sync <= sync(0) & rx;
            valid <= '0';
            if busy = '0' then
                if sync(1) = '0' then             -- the start bit: its middle half a bit later
                    busy <= '1';
                    count <= BIT_T / 2;
                    bitn <= 0;
                end if;
            elsif count /= 0 then
                count <= count - 1;
            else
                count <= BIT_T - 1;
                if bitn = 0 then
                    if sync(1) = '1' then busy <= '0'; end if;
                    bitn <= 1;
                elsif bitn <= 8 then
                    shift <= sync(1) & shift(7 downto 1);
                    bitn <= bitn + 1;
                else
                    busy <= '0';
                    if sync(1) = '1' then
                        data <= shift;
                        valid <= '1';
                    end if;
                end if;
            end if;
        end if;
    end process;
end Behavioral;
