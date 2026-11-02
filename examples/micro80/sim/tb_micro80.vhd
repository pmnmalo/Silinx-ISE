----------------------------------------------------------------------------------
-- Test bench for micro80_top: fast display (2 clock cycles per digit) and fast ticks. Sets the switches
-- and reads the product off the 7-segment display, as a person would, then watches the LEDs count.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity tb_micro80 is
end tb_micro80;

architecture behavior of tb_micro80 is
    constant clk_period : time := 20 ns;
    constant TICK : integer := 4000;
    signal clk : STD_LOGIC := '0';
    signal sw  : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal led : STD_LOGIC_VECTOR (7 downto 0);
    signal seg : STD_LOGIC_VECTOR (6 downto 0);
    signal dp  : STD_LOGIC;
    signal an  : STD_LOGIC_VECTOR (3 downto 0);
    signal running : boolean := true;

    type cases_t is array (natural range <>) of STD_LOGIC_VECTOR (7 downto 0);
    constant CASES : cases_t (0 to 11) := (X"00", X"01", X"10", X"11", X"23", X"3F", X"A5", X"C8", X"7E", X"CF", X"F1", X"FF");

    -- the digit a segment pattern shows (-1: blank or not a digit)
    function digit_of (s : STD_LOGIC_VECTOR (6 downto 0)) return integer is
    begin
        case s is
            when "1000000" => return 0;
            when "1111001" => return 1;
            when "0100100" => return 2;
            when "0110000" => return 3;
            when "0011001" => return 4;
            when "0010010" => return 5;
            when "0000010" => return 6;
            when "1111000" => return 7;
            when "0000000" => return 8;
            when "0010000" => return 9;
            when others => return -1;
        end case;
    end function;
begin
    uut: entity work.micro80_top
        generic map ( TICK => TICK, REFRESH => 2 )
        port map ( clk => clk, sw => sw, led => led, seg => seg, dp => dp, an => an );

    clk <= not clk after clk_period / 2 when running else '0';

    stim: process
        variable errors : integer := 0;
        variable product, shown, d : integer;
        variable step : UNSIGNED (7 downto 0);
    begin
        for i in CASES'range loop
            sw <= CASES(i);
            -- two whole passes of the program's loop, so that the display is this number's
            wait for clk_period * 4000;
            product := to_integer(unsigned(CASES(i)(7 downto 4))) * to_integer(unsigned(CASES(i)(3 downto 0)));
            -- the four digits, left to right: each read a clock cycle after its anode is on (the segments settled, on
            -- the post-place & route model with its delays too); the left one always blank
            shown := 0;
            for k in 3 downto 0 loop
                wait until rising_edge(clk) and an = not STD_LOGIC_VECTOR(to_unsigned(2 ** k, 4));
                wait for 1 ns;
                d := digit_of(seg);
                if k = 3 then
                    if d /= -1 then
                        report "ERROR: the left digit shows " & integer'image(d) severity error;
                        errors := errors + 1;
                    end if;
                else
                    shown := shown * 10 + d;
                end if;
                if dp /= '1' then
                    report "ERROR: a decimal point on digit " & integer'image(k) severity error;
                    errors := errors + 1;
                end if;
            end loop;
            if shown /= product then
                report "ERROR: case " & integer'image(i) & ": the display shows " & integer'image(shown)
                    & ", not " & integer'image(product) severity error;
                errors := errors + 1;
            end if;
        end loop;

        -- the LEDs: one step at each tick, whatever the time the program takes on a pass of its loop
        for i in 1 to 4 loop
            step := unsigned(led) + 1;
            wait until led'event for clk_period * TICK * 2;
            wait for clk_period * 10;              -- every bit settled (the post-place & route model, its delays)
            if unsigned(led) /= step then
                report "ERROR: the LEDs show " & integer'image(to_integer(unsigned(led))) & ", not "
                    & integer'image(to_integer(step)) severity error;
                errors := errors + 1;
            end if;
        end loop;

        running <= false;
        if errors = 0 then
            report "Simulation finished OK" severity note;
        else
            report "ERROR: " & integer'image(errors) & " check(s) failed" severity error;
        end if;
        wait;
    end process;
end behavior;
