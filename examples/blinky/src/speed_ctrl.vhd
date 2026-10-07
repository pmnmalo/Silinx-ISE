----------------------------------------------------------------------------------
-- XAIlinx example: blink speed control with two push buttons.
--   faster / slower : push buttons (active high, bouncing), synchronised and debounced here
--   speed_fsm       : state machine drawn as an ASM chart (speed_fsm.asm.json, kept in sync
--                     with speed_fsm.vhd): one speed level per press, 0 = fastest, 7 = slowest
--   tick            : base tick from the prescaler
--   step            : one pulse every 2**level base ticks
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity speed_ctrl is
    Generic ( DEBOUNCE : integer := 1_000_000 );   -- stable cycles for a press (20 ms at 50 MHz)
    Port ( clk    : in  STD_LOGIC;
           rst    : in  STD_LOGIC;
           faster : in  STD_LOGIC;
           slower : in  STD_LOGIC;
           tick   : in  STD_LOGIC;
           step   : out STD_LOGIC);
end speed_ctrl;

architecture Behavioral of speed_ctrl is
    signal sync_f, sync_s : std_logic_vector(1 downto 0) := "00";   -- 2-FF synchronisers
    signal deb_f, deb_s   : std_logic := '0';                       -- debounced buttons
    signal cnt_f, cnt_s   : integer range 0 to DEBOUNCE := 0;
    signal level          : std_logic_vector(2 downto 0);
    signal ticks          : unsigned(7 downto 0) := (others => '0');
begin
    -- synchronise and debounce both buttons
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

    -- speed level: the ASM state machine
    u_fsm : entity work.speed_fsm
        port map ( clk => clk, rst => rst, faster => deb_f, slower => deb_s, level => level );

    -- one step every 2**level base ticks
    process (clk)
    begin
        if rising_edge(clk) then
            step <= '0';
            if rst = '1' then
                ticks <= (others => '0');
            elsif tick = '1' then
                if ticks >= shift_left(to_unsigned(1, 8), to_integer(unsigned(level))) - 1 then
                    ticks <= (others => '0');
                    step  <= '1';
                else
                    ticks <= ticks + 1;
                end if;
            end if;
        end if;
    end process;
end Behavioral;
