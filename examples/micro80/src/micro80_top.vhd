----------------------------------------------------------------------------------
-- Silinx example: a microprocessor running a program, for the Basys2 / Nexys2.
--   SW7..SW4, SW3..SW0 : two numbers, 0 to 15
--   display            : their product, in decimal: 12 * 15 shows 180
--   LD7..LD0           : a count, 8 steps a second
-- The processor is light8080 (Jose A. Ruiz, LGPL-2.1, light8080.vhdl and light8080_ucode_pkg.vhdl, as they
-- are), compatible with the Intel 8080. This design gives it what a computer has around its processor:
-- a memory of 1 KB, block RAM, which starts with the program (program.vhd), and these ports:
--   IN  0 : the switches               OUT 0 : the display's left two digits
--   IN  1 : bit 0, the tick's flag     OUT 1 : the display's right two digits
--                                      OUT 2 : the LEDs
--                                      OUT 3 : clears the tick's flag
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
use work.program_pkg.ALL;

entity micro80_top is
    Generic ( CLK_HZ  : integer := 50_000_000;     -- the board's clock, in Hz (50 MHz on the Basys2 / Nexys2)
              TICK    : integer := 0;              -- cycles per tick (1/8 s): 0 for CLK_HZ / 8
              REFRESH : integer := 0;              -- display: cycles per digit (1 ms): 0 for CLK_HZ / 1000
              SW_LOW  : boolean := false );        -- true: the board's switches read '0' when on
    Port ( clk : in  STD_LOGIC;                   -- the board's clock (CLK_HZ)
           sw  : in  STD_LOGIC_VECTOR (7 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);
           dp  : out STD_LOGIC;
           an  : out STD_LOGIC_VECTOR (3 downto 0) );
end micro80_top;

architecture Behavioral of micro80_top is
    -- the timing in clock cycles: a generic given (the test bench's), else (0) from the board's clock
    function or_else (given, derived : integer) return integer is
    begin
        if given /= 0 then return given; else return derived; end if;
    end function;
    constant TICK_N    : integer := or_else(TICK, CLK_HZ / 8);
    constant REFRESH_N : integer := or_else(REFRESH, CLK_HZ / 1000);
    signal boot     : UNSIGNED (3 downto 0) := "0000";           -- the reset, for 15 cycles at power-up
    signal rst      : STD_LOGIC;

    signal addr     : STD_LOGIC_VECTOR (15 downto 0);
    signal data_in  : STD_LOGIC_VECTOR (7 downto 0);
    signal data_out : STD_LOGIC_VECTOR (7 downto 0);
    signal io       : STD_LOGIC;
    signal wr       : STD_LOGIC;
    signal io_last  : STD_LOGIC := '0';                          -- the read now finishing is of a port

    signal memory   : memory_t := PROGRAM_BYTES;
    signal mem_data : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal io_data  : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');

    signal sw_meta  : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal sw_sync  : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal digits   : STD_LOGIC_VECTOR (15 downto 0) := (others => '1');   -- blank until the program writes
    signal leds     : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal count    : integer range 0 to TICK_N - 1 := 0;
    signal flag     : STD_LOGIC := '0';
    -- the switches as '1' when on, whatever the board's level
    signal swOn  : STD_LOGIC_VECTOR (7 downto 0);
begin
    swOn  <= not sw when SW_LOW else sw;

    rst <= '1' when boot /= "1111" else '0';

    process (clk)
    begin
        if rising_edge(clk) then
            if boot /= "1111" then boot <= boot + 1; end if;
        end if;
    end process;

    cpu: entity work.light8080
        port map ( addr_out => addr, inta => open, inte => open, halt => open, intr => '0',
                   vma => open, io => io, rd => open, wr => wr, fetch => open,
                   data_in => data_in, data_out => data_out, clk => clk, reset => rst );

    -- the memory: a read takes a clock cycle, as the processor expects; addresses from 0400h up are not written
    process (clk)
    begin
        if rising_edge(clk) then
            if wr = '1' and io = '0' and addr(15 downto 10) = "000000" then
                memory(to_integer(unsigned(addr(9 downto 0)))) <= data_out;
            end if;
            mem_data <= memory(to_integer(unsigned(addr(9 downto 0))));
        end if;
    end process;

    -- the ports: an I/O address is 8 bits, the low byte of the address bus; a read takes a clock cycle too
    process (clk)
    begin
        if rising_edge(clk) then
            sw_meta <= swOn;                            -- the switches synchronised to the clock
            sw_sync <= sw_meta;
            io_last <= io;
            if addr(0) = '0' then io_data <= sw_sync; else io_data <= "0000000" & flag; end if;
            if wr = '1' and io = '1' then
                case addr(1 downto 0) is
                    when "00"   => digits(15 downto 8) <= data_out;
                    when "01"   => digits(7 downto 0) <= data_out;
                    when "10"   => leds <= data_out;
                    when others => flag <= '0';
                end case;
            end if;
            if count = TICK_N - 1 then                  -- after the clearing: a tick is never lost
                count <= 0;
                flag  <= '1';
            else
                count <= count + 1;
            end if;
        end if;
    end process;

    data_in <= io_data when io_last = '1' else mem_data;
    led     <= leds;

    display: entity work.sevenseg
        generic map ( REFRESH => REFRESH_N )
        port map ( clk => clk, digits => digits, points => "0000", seg => seg, dp => dp, an => an );
end Behavioral;
