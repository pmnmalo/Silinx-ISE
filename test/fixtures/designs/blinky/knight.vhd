----------------------------------------------------------------------------------
-- Knight-rider LED pattern, advancing one step on each `step` pulse.
-- `dir_sw` = '1' freezes the direction, `mode` selects bounce or binary counter.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity knight is
    Port ( clk  : in  STD_LOGIC;
           rst  : in  STD_LOGIC;
           step : in  STD_LOGIC;
           mode : in  STD_LOGIC;
           leds : out STD_LOGIC_VECTOR (7 downto 0));
end knight;

architecture Behavioral of knight is
    type dir_t is (LEFT, RIGHT);
    signal dir     : dir_t := LEFT;
    signal pattern : std_logic_vector(7 downto 0) := "00000001";
    signal count   : unsigned(7 downto 0) := (others => '0');
begin
    process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                pattern <= "00000001";
                dir     <= LEFT;
                count   <= (others => '0');
            elsif step = '1' then
                count <= count + 1;
                case dir is
                    when LEFT =>
                        pattern <= pattern(6 downto 0) & '0';
                        if pattern(6) = '1' then dir <= RIGHT; end if;
                    when RIGHT =>
                        pattern <= '0' & pattern(7 downto 1);
                        if pattern(1) = '1' then dir <= LEFT; end if;
                end case;
            end if;
        end if;
    end process;

    leds <= pattern when mode = '0' else std_logic_vector(count);
end Behavioral;
