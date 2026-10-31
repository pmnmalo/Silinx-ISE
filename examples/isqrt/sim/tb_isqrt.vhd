----------------------------------------------------------------------------------
-- Test bench for isqrt_top: fast display (2 clock cycles per digit). Sets the switches and reads
-- the results off the 7-segment display, as a person would: every number from 0 to 255 must show
-- its root and remainder, with the decimal point between them.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity tb_isqrt is
end tb_isqrt;

architecture behavior of tb_isqrt is
    constant clk_period : time := 20 ns;
    signal clk : STD_LOGIC := '0';
    signal sw  : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal led : STD_LOGIC_VECTOR (1 downto 0);
    signal seg : STD_LOGIC_VECTOR (6 downto 0);
    signal dp  : STD_LOGIC;
    signal an  : STD_LOGIC_VECTOR (3 downto 0);
    signal running : boolean := true;

    -- the digit a segment pattern shows (-1: not a digit)
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
    uut: entity work.isqrt_top
        generic map ( REFRESH => 2 )
        port map ( clk => clk, sw => sw, led => led, seg => seg, dp => dp, an => an );

    clk <= not clk after clk_period / 2 when running else '0';

    stim: process
        variable errors : integer := 0;
        variable root, remainder, shown : integer;
    begin
        for n in 0 to 255 loop
            sw <= STD_LOGIC_VECTOR(to_unsigned(n, 8));
            -- two whole calls (the longest 15 steps), so that the results are this number's
            wait for clk_period * 60;
            root := 0;
            while (root + 1) * (root + 1) <= n loop root := root + 1; end loop;
            remainder := n - root * root;
            -- the four digits, left to right
            shown := 0;
            for k in 3 downto 0 loop
                wait until falling_edge(clk) and an(k) = '0';
                shown := shown * 10 + digit_of(seg);
                if (dp = '0') /= (k = 2) then
                    report "ERROR: decimal point on digit " & integer'image(k) & " at n = " & integer'image(n) severity error;
                    errors := errors + 1;
                end if;
            end loop;
            if shown /= root * 100 + remainder then
                report "ERROR: n = " & integer'image(n) & ": the display shows " & integer'image(shown) severity error;
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
