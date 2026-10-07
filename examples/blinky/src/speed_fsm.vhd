--==============================================================================
-- Entity      : speed_fsm
-- Description : finite state machine generated from the ASM chart speed_fsm.asm.json
--               Blink speed: one level per button press (0 = fastest, 7 = slowest)
-- Generator   : XAIlinx ASM editor, kept in sync with the chart (edit either one).
-- Style       : state register + next-state logic + output logic (latch-free)
-- Clock       : clk (rising edge)
-- Reset       : rst, active-high, synchronous
-- Encoding    : binary (1 state bit)
--
-- States:
--   IDLE         = 0  (reset)
--   WAIT_RELEASE = 1
--
-- Transitions (condition -> next state [Mealy outputs]):
--   IDLE         : faster && (level != 0) -> WAIT_RELEASE  [level = level - 1]
--   IDLE         : faster && !(level != 0) -> WAIT_RELEASE
--   IDLE         : !faster && slower && (level != 7) -> WAIT_RELEASE  [level = level + 1]
--   IDLE         : !faster && slower && !(level != 7) -> WAIT_RELEASE
--   IDLE         : !faster && !slower -> IDLE
--   WAIT_RELEASE : (faster || slower) -> WAIT_RELEASE
--   WAIT_RELEASE : !(faster || slower) -> IDLE
--
-- Registered outputs (level) load the value assigned in the
-- current state/path at the clock edge and hold it otherwise.
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity speed_fsm is
    port (
        clk    : in  std_logic;
        rst    : in  std_logic;
        faster : in  std_logic;
        slower : in  std_logic;
        level  : out std_logic_vector(2 downto 0)
    );
end entity speed_fsm;

architecture rtl of speed_fsm is

    -- state encoding
    subtype state_t is std_logic_vector(0 downto 0);
    constant S_IDLE         : state_t := "0";
    constant S_WAIT_RELEASE : state_t := "1";

    signal state_reg  : state_t;
    signal state_next : state_t;

    attribute fsm_encoding : string;
    attribute fsm_encoding of state_reg : signal is "user";

    -- output registers
    signal level_reg, level_next : std_logic_vector(2 downto 0);

begin

    -- ------------------------------------------------------------------ state register
    state_register : process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                state_reg <= S_IDLE;
                level_reg <= "011";
            else
                state_reg <= state_next;
                level_reg <= level_next;
            end if;
        end if;
    end process state_register;

    -- ------------------------------------------------------------------ next-state logic
    next_state_logic : process (state_reg, faster, slower)
    begin
        state_next <= state_reg;
        case state_reg is
            when S_IDLE =>
                if faster = '1' then
                    state_next <= S_WAIT_RELEASE;
                elsif slower = '1' then
                    state_next <= S_WAIT_RELEASE;
                else
                    state_next <= S_IDLE;
                end if;
            when S_WAIT_RELEASE =>
                if (faster = '1') or (slower = '1') then
                    state_next <= S_WAIT_RELEASE;
                else
                    state_next <= S_IDLE;
                end if;
            when others =>
                state_next <= S_IDLE;
        end case;
    end process next_state_logic;

    -- ------------------------------------------------------------------ output logic
    output_logic : process (state_reg, faster, slower, level_reg)
    begin
        -- default values (every output is assigned on every path: no latches)
        level_next <= level_reg;
        case state_reg is
            when S_IDLE =>
                if faster = '1' then
                    if unsigned(level_reg) /= 0 then
                        level_next <= std_logic_vector(unsigned(level_reg) - 1);
                    end if;
                elsif slower = '1' then
                    if unsigned(level_reg) /= 7 then
                        level_next <= std_logic_vector(unsigned(level_reg) + 1);
                    end if;
                end if;
            when others =>
                null;
        end case;
    end process output_logic;

    level <= level_reg;

end architecture rtl;
