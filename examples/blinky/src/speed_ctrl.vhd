----------------------------------------------------------------------------------
-- XAIlinx example: blink speed control with two push buttons.
--   faster / slower : push buttons (active high, bouncing): each press changes the
--                     speed one level; the presses are synchronised and debounced
--   tick            : base tick from the prescaler
--   step            : one pulse every 2**level base ticks (level 0 = fastest, 7 = slowest)
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity speed_ctrl is
    Generic ( DEBOUNCE : integer := 1_000_000;    -- stable cycles for a press (20 ms at 50 MHz)
              LEVEL0   : integer := 3 );          -- speed level after reset
    Port ( clk    : in  STD_LOGIC;
           rst    : in  STD_LOGIC;
           faster : in  STD_LOGIC;
           slower : in  STD_LOGIC;
           tick   : in  STD_LOGIC;
           step   : out STD_LOGIC);
end speed_ctrl;

architecture Behavioral of speed_ctrl is
    signal sync_f, sync_s : std_logic_vector(1 downto 0) := "00";   -- 2-FF synchronisers
    signal deb_f, deb_s   : std_logic := '0';                       -- debounced levels
    signal cnt_f, cnt_s   : integer range 0 to DEBOUNCE := 0;
    signal lvl            : unsigned(2 downto 0) := to_unsigned(LEVEL0, 3);
    signal ticks          : unsigned(7 downto 0) := (others => '0');
begin
    -- synchronise and debounce both buttons; a press is the rising edge of the debounced level
    process (clk)
    begin
        if rising_edge(clk) then
            sync_f <= sync_f(0) & faster;
            sync_s <= sync_s(0) & slower;
            if sync_f(1) = deb_f then cnt_f <= 0;
            elsif cnt_f = DEBOUNCE - 1 then cnt_f <= 0; deb_f <= sync_f(1);
            else cnt_f <= cnt_f + 1; end if;
            if sync_s(1) = deb_s then cnt_s <= 0;
            elsif cnt_s = DEBOUNCE - 1 then cnt_s <= 0; deb_s <= sync_s(1);
            else cnt_s <= cnt_s + 1; end if;
        end if;
    end process;

    -- speed level and step generation
    process (clk)
    begin
        if rising_edge(clk) then
            step <= '0';
            if rst = '1' then
                lvl   <= to_unsigned(LEVEL0, 3);
                ticks <= (others => '0');
            else
                if sync_f(1) = '1' and deb_f = '0' and cnt_f = DEBOUNCE - 1 and lvl /= 0 then
                    lvl <= lvl - 1;                               -- faster: half the period
                elsif sync_s(1) = '1' and deb_s = '0' and cnt_s = DEBOUNCE - 1 and lvl /= 7 then
                    lvl <= lvl + 1;                               -- slower: double the period
                end if;
                if tick = '1' then
                    if ticks >= shift_left(to_unsigned(1, 8), to_integer(lvl)) - 1 then
                        ticks <= (others => '0');
                        step  <= '1';
                    else
                        ticks <= ticks + 1;
                    end if;
                end if;
            end if;
        end if;
    end process;
end Behavioral;
