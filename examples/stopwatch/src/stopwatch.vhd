----------------------------------------------------------------------------------
-- Silinx example: a stopwatch with lap memory for the Basys2 / Nexys2.
--   display : seconds and hundredths, 0.00 to 99.99 (then it starts again from 0.00)
--   BTN0    : start / stop (while recalling laps: back to the running time)
--   BTN1    : lap: stores the time (up to 1023 laps, in a block RAM); LD7..LD0 count the laps
--   BTN2    : clear (when stopped): the time and the laps
--   BTN3    : recall: the stored laps one after the other (LD7..LD0: the lap's number), then back
--   SW0     : reset
-- The design: the time counter, a lap memory (an inferred block RAM), the binary to decimal
-- conversion with the FPGA's multipliers (to_decimal.vhd), the button debouncers (debounce.vhd)
-- and the 7-segment display (sevenseg.vhd).
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity stopwatch is
    Generic ( CS      : integer := 500_000;      -- clock cycles per hundredth of a second
              STABLE  : integer := 1_000_000;    -- button debounce (20 ms)
              REFRESH : integer := 50_000 );     -- display: cycles per digit (1 ms)
    Port ( clk : in  STD_LOGIC;                  -- 50 MHz
           sw  : in  STD_LOGIC_VECTOR (0 downto 0);
           btn : in  STD_LOGIC_VECTOR (3 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);
           dp  : out STD_LOGIC;
           an  : out STD_LOGIC_VECTOR (3 downto 0) );
end stopwatch;

architecture Behavioral of stopwatch is
    signal startStop, lap, clear, recall : STD_LOGIC;
    signal running   : boolean := false;
    signal recalling : boolean := false;
    signal tick      : integer range 0 to CS - 1 := 0;
    signal elapsed   : UNSIGNED (13 downto 0) := (others => '0');   -- hundredths: 0 .. 9999
    -- the lap memory: 1023 times, written at `laps`, read at `index` (1024 words, a whole block RAM:
    -- the Spartan-6 would put 512 in a 9K half, whose initial data ISE says may be wrong)
    type lap_ram is array (0 to 1023) of UNSIGNED (13 downto 0);
    signal laps_ram  : lap_ram;
    signal laps      : UNSIGNED (9 downto 0) := (others => '0');   -- 0 .. 1023 stored
    signal index     : UNSIGNED (9 downto 0) := (others => '0');
    signal lapTime   : UNSIGNED (13 downto 0);
    signal shown     : UNSIGNED (13 downto 0);
    signal digits    : STD_LOGIC_VECTOR (15 downto 0);
    signal shownDigits : STD_LOGIC_VECTOR (15 downto 0);
begin
    db0: entity work.debounce generic map (STABLE => STABLE) port map (clk => clk, btn => btn(0), press => startStop);
    db1: entity work.debounce generic map (STABLE => STABLE) port map (clk => clk, btn => btn(1), press => lap);
    db2: entity work.debounce generic map (STABLE => STABLE) port map (clk => clk, btn => btn(2), press => clear);
    db3: entity work.debounce generic map (STABLE => STABLE) port map (clk => clk, btn => btn(3), press => recall);

    process (clk)
    begin
        if rising_edge(clk) then
            if sw(0) = '1' then
                running <= false; recalling <= false; tick <= 0; elapsed <= (others => '0'); laps <= (others => '0');
            else
                -- the time
                if running then
                    if tick = CS - 1 then
                        tick <= 0;
                        if elapsed = 9999 then elapsed <= (others => '0'); else elapsed <= elapsed + 1; end if;
                    else
                        tick <= tick + 1;
                    end if;
                end if;
                -- the buttons
                if startStop = '1' then
                    if recalling then recalling <= false; else running <= not running; end if;
                elsif lap = '1' and running and laps < 1023 then
                    laps <= laps + 1;
                elsif clear = '1' and not running then
                    elapsed <= (others => '0'); tick <= 0; laps <= (others => '0'); recalling <= false;
                elsif recall = '1' and laps /= 0 then
                    if not recalling then
                        recalling <= true; index <= (others => '0');
                    elsif index + 1 = laps then
                        recalling <= false;
                    else
                        index <= index + 1;
                    end if;
                end if;
            end if;
        end if;
    end process;

    -- the lap memory (a block RAM: written and read on the clock edge)
    process (clk)
    begin
        if rising_edge(clk) then
            if lap = '1' and running and laps < 1023 and sw(0) = '0' then
                laps_ram(to_integer(laps)) <= elapsed;
            end if;
            lapTime <= laps_ram(to_integer(index));
        end if;
    end process;

    shown <= lapTime when recalling else elapsed;
    dec: entity work.to_decimal port map (clk => clk, value => shown, digits => digits);
    -- no leading zero on the left digit
    shownDigits <= "1111" & digits(11 downto 0) when digits(15 downto 12) = "0000" else digits;
    display: entity work.sevenseg generic map (REFRESH => REFRESH)
        port map (clk => clk, digits => shownDigits, points => "0100", seg => seg, dp => dp, an => an);

    led <= std_logic_vector(resize(index, 8) + 1) when recalling else
           "11111111" when laps > 255 else std_logic_vector(laps(7 downto 0));
end Behavioral;
