--==============================================================================
-- Entity      : speed_ctrl
-- Description : controller (state machine + data path) generated from the ASM chart speed_ctrl.asm.json
--               Blink speed: two debounced buttons, one level per press (0 = fastest, 7 = slowest), one step every 2**level ticks
-- Generator   : XAIlinx ASM editor, kept in sync with the chart (edit either one).
-- Style       : state register + next-state logic + output logic (latch-free)
-- Clock       : clk (rising edge)
-- Reset       : rst, active-high, synchronous
-- Encoding    : binary (1 state bit)
-- Generics    : DEBOUNCE = 1000000
-- Synchronised: faster, slower (2 flip-flops each, <input>_meta and <input>_sync)
--
-- States:
--   IDLE            = 0  (reset)
--   WAIT_RELEASE    = 1
--
-- Transitions (condition -> next state [Mealy outputs]):
--   IDLE            : deb_f && (level != 0) -> WAIT_RELEASE  [level = level - 1]
--   IDLE            : deb_f && !(level != 0) -> WAIT_RELEASE
--   IDLE            : !deb_f && deb_s && (level != 7) -> WAIT_RELEASE  [level = level + 1]
--   IDLE            : !deb_f && deb_s && !(level != 7) -> WAIT_RELEASE
--   IDLE            : !deb_f && !deb_s -> IDLE
--   WAIT_RELEASE    : (deb_f || deb_s) -> WAIT_RELEASE
--   WAIT_RELEASE    : !(deb_f || deb_s) -> IDLE
--
-- Every cycle (in parallel with the states; the state's assignments take priority):
--   debounce_faster : (faster != deb_f) && (cnt_f == DEBOUNCE - 1)  [cnt_f = 0, deb_f = faster]
--   debounce_faster : (faster != deb_f) && !(cnt_f == DEBOUNCE - 1)  [cnt_f = cnt_f + 1]
--   debounce_faster : !(faster != deb_f)  [cnt_f = 0]
--   debounce_slower : (slower != deb_s) && (cnt_s == DEBOUNCE - 1)  [cnt_s = 0, deb_s = slower]
--   debounce_slower : (slower != deb_s) && !(cnt_s == DEBOUNCE - 1)  [cnt_s = cnt_s + 1]
--   debounce_slower : !(slower != deb_s)  [cnt_s = 0]
--   divider          Actions: step = 0
--   divider         : tick && (ticks >= (1 << level) - 1)  [ticks = 0, step = 1]
--   divider         : tick && !(ticks >= (1 << level) - 1)  [ticks = ticks + 1]
--   divider         : !tick
--
-- Registered outputs (step) load the value assigned in the
-- current state/path at the clock edge and hold it otherwise.
--
-- Registers (internal; load the value assigned in this cycle at the clock edge, hold otherwise):
--   cnt_f : 20 bits, reset 0
--   deb_f : 1 bit, reset 0
--   cnt_s : 20 bits, reset 0
--   deb_s : 1 bit, reset 0
--   level : 3 bits, reset 5
--   ticks : 8 bits, reset 0
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity speed_ctrl is
    generic (
        DEBOUNCE : integer := 1000000
    );
    port (
        clk    : in  std_logic;
        rst    : in  std_logic;
        faster : in  std_logic;
        slower : in  std_logic;
        tick   : in  std_logic;
        step   : out std_logic
    );
end entity speed_ctrl;

architecture rtl of speed_ctrl is

    -- state encoding
    subtype state_t is std_logic_vector(0 downto 0);
    constant S_IDLE         : state_t := "0";
    constant S_WAIT_RELEASE : state_t := "1";

    signal state_reg  : state_t;
    signal state_next : state_t;

    attribute fsm_encoding : string;
    attribute fsm_encoding of state_reg : signal is "user";

    -- output registers
    signal step_reg, step_next : std_logic;

    -- internal registers
    signal cnt_f, cnt_f_next : std_logic_vector(19 downto 0);
    signal deb_f, deb_f_next : std_logic;
    signal cnt_s, cnt_s_next : std_logic_vector(19 downto 0);
    signal deb_s, deb_s_next : std_logic;
    signal level, level_next : std_logic_vector(2 downto 0);
    signal ticks, ticks_next : std_logic_vector(7 downto 0);

    -- input synchronisers (2 flip-flops)
    signal faster_meta, faster_sync : std_logic;
    signal slower_meta, slower_sync : std_logic;

begin

    -- ------------------------------------------------------------------ registers
    state_register : process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                state_reg <= S_IDLE;
                step_reg <= '0';
                cnt_f <= "00000000000000000000";
                deb_f <= '0';
                cnt_s <= "00000000000000000000";
                deb_s <= '0';
                level <= "101";
                ticks <= "00000000";
                faster_meta <= '0';
                faster_sync <= '0';
                slower_meta <= '0';
                slower_sync <= '0';
            else
                state_reg <= state_next;
                step_reg <= step_next;
                cnt_f <= cnt_f_next;
                deb_f <= deb_f_next;
                cnt_s <= cnt_s_next;
                deb_s <= deb_s_next;
                level <= level_next;
                ticks <= ticks_next;
                faster_meta <= faster;
                faster_sync <= faster_meta;
                slower_meta <= slower;
                slower_sync <= slower_meta;
            end if;
        end if;
    end process state_register;

    -- ------------------------------------------------------------------ next-state logic
    next_state_logic : process (state_reg, deb_f, deb_s)
    begin
        state_next <= state_reg;
        case state_reg is
            when S_IDLE =>
                if deb_f = '1' then
                    state_next <= S_WAIT_RELEASE;
                elsif deb_s = '1' then
                    state_next <= S_WAIT_RELEASE;
                else
                    state_next <= S_IDLE;
                end if;
            when S_WAIT_RELEASE =>
                if (deb_f = '1') or (deb_s = '1') then
                    state_next <= S_WAIT_RELEASE;
                else
                    state_next <= S_IDLE;
                end if;
            when others =>
                state_next <= S_IDLE;
        end case;
    end process next_state_logic;

    -- ------------------------------------------------------------------ output and register logic
    output_logic : process (state_reg, faster_sync, slower_sync, tick, step_reg, cnt_f, deb_f, cnt_s, deb_s, level, ticks)
    begin
        -- default values (every output is assigned on every path: no latches)
        step_next <= step_reg;
        cnt_f_next <= cnt_f;
        deb_f_next <= deb_f;
        cnt_s_next <= cnt_s;
        deb_s_next <= deb_s;
        level_next <= level;
        ticks_next <= ticks;
        -- every cycle: debounce_faster
        if faster_sync /= deb_f then
            if unsigned(cnt_f) = (DEBOUNCE - 1) then
                cnt_f_next <= "00000000000000000000";
                deb_f_next <= faster_sync;
            else
                cnt_f_next <= std_logic_vector(unsigned(cnt_f) + 1);
            end if;
        else
            cnt_f_next <= "00000000000000000000";
        end if;
        -- every cycle: debounce_slower
        if slower_sync /= deb_s then
            if unsigned(cnt_s) = (DEBOUNCE - 1) then
                cnt_s_next <= "00000000000000000000";
                deb_s_next <= slower_sync;
            else
                cnt_s_next <= std_logic_vector(unsigned(cnt_s) + 1);
            end if;
        else
            cnt_s_next <= "00000000000000000000";
        end if;
        -- every cycle: divider
        step_next <= '0';
        if tick = '1' then
            if unsigned(ticks) >= (shift_left(to_unsigned(1, 32), to_integer(unsigned(level))) - 1) then
                ticks_next <= "00000000";
                step_next <= '1';
            else
                ticks_next <= std_logic_vector(unsigned(ticks) + 1);
            end if;
        end if;
        -- state logic (takes priority over the every-cycle blocks)
        case state_reg is
            when S_IDLE =>
                if deb_f = '1' then
                    if unsigned(level) /= 0 then
                        level_next <= std_logic_vector(unsigned(level) - 1);
                    end if;
                elsif deb_s = '1' then
                    if unsigned(level) /= 7 then
                        level_next <= std_logic_vector(unsigned(level) + 1);
                    end if;
                end if;
            when others =>
                null;
        end case;
    end process output_logic;

    step <= step_reg;

end architecture rtl;
