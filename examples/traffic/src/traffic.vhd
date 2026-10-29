--==============================================================================
-- Entity      : traffic
-- Description : Moore finite state machine generated from the state diagram traffic.fsm.json
--               Pedestrian crossing: the controller. One state per phase of the lights; the output phase
--               is its code (the truth table lamps.bool.json lights the lamps of each phase).
--               req: a pedestrian is waiting (BTN0, remembered); done: the phase has lasted its time
--               (timer.vhd); night: night mode (SW1).
-- Generator   : Silinx FSM editor (edit the diagram, not this file).
-- Style       : 3 processes: state register, next-state logic, output logic
-- Clock       : clk (rising edge)
-- Reset       : rst, active-high, synchronous (goes to CARS)
-- Encoding    : binary (3 state bits)
--
-- States and codes (Moore outputs):
--   CARS        = 000  (reset)  phase = 0
--   CARS_YELLOW = 001           phase = 1
--   ALL_RED     = 010           phase = 2
--   WALK        = 011           phase = 3
--   WALK_END    = 100           phase = 4
--   ALL_RED_2   = 101           phase = 5
--   NIGHT       = 110           phase = 6
--
-- Transitions (state : condition -> next state); the first true condition is taken:
--   CARS        : night -> NIGHT
--   CARS        : !night && req && done -> CARS_YELLOW
--   CARS        : otherwise -> CARS (stays)
--   CARS_YELLOW : done -> ALL_RED
--   CARS_YELLOW : otherwise -> CARS_YELLOW (stays)
--   ALL_RED     : done -> WALK
--   ALL_RED     : otherwise -> ALL_RED (stays)
--   WALK        : done -> WALK_END
--   WALK        : otherwise -> WALK (stays)
--   WALK_END    : done -> ALL_RED_2
--   WALK_END    : otherwise -> WALK_END (stays)
--   ALL_RED_2   : done -> CARS
--   ALL_RED_2   : otherwise -> ALL_RED_2 (stays)
--   NIGHT       : !night -> CARS
--   NIGHT       : otherwise -> NIGHT (stays)
--==============================================================================

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity traffic is
    port (
        clk   : in  std_logic;
        rst   : in  std_logic;
        req   : in  std_logic;
        done  : in  std_logic;
        night : in  std_logic;
        phase : out std_logic_vector(2 downto 0)
    );
end entity traffic;

architecture rtl of traffic is

    -- state encoding
    subtype state_t is std_logic_vector(2 downto 0);
    constant S_CARS        : state_t := "000";
    constant S_CARS_YELLOW : state_t := "001";
    constant S_ALL_RED     : state_t := "010";
    constant S_WALK        : state_t := "011";
    constant S_WALK_END    : state_t := "100";
    constant S_ALL_RED_2   : state_t := "101";
    constant S_NIGHT       : state_t := "110";

    signal state_reg  : state_t := S_CARS;   -- present state
    signal state_next : state_t;                -- next state

    attribute fsm_encoding : string;
    attribute fsm_encoding of state_reg : signal is "user";

begin

    -- ------------------------------------------------------------------ state register
    state_register : process (clk)
    begin
        if rising_edge(clk) then
            if rst = '1' then
                state_reg <= S_CARS;
            else
                state_reg <= state_next;
            end if;
        end if;
    end process state_register;

    -- ------------------------------------------------------------------ next-state logic
    next_state_logic : process (state_reg, req, done, night)
    begin
        state_next <= state_reg;   -- no transition taken: stay in the present state
        case state_reg is
            when S_CARS =>
                if night = '1' then
                    state_next <= S_NIGHT;
                elsif ((night = '0') and (req = '1')) and (done = '1') then
                    state_next <= S_CARS_YELLOW;
                end if;
            when S_CARS_YELLOW =>
                if done = '1' then
                    state_next <= S_ALL_RED;
                end if;
            when S_ALL_RED =>
                if done = '1' then
                    state_next <= S_WALK;
                end if;
            when S_WALK =>
                if done = '1' then
                    state_next <= S_WALK_END;
                end if;
            when S_WALK_END =>
                if done = '1' then
                    state_next <= S_ALL_RED_2;
                end if;
            when S_ALL_RED_2 =>
                if done = '1' then
                    state_next <= S_CARS;
                end if;
            when S_NIGHT =>
                if night = '0' then
                    state_next <= S_CARS;
                end if;
            when others =>
                state_next <= S_CARS;
        end case;
    end process next_state_logic;

    -- ------------------------------------------------------------------ output logic
    output_logic : process (state_reg)
    begin
        -- default output values (every output is assigned on every path: no latches)
        phase <= "000";
        case state_reg is
            when S_CARS =>
                phase <= "000";
            when S_CARS_YELLOW =>
                phase <= "001";
            when S_ALL_RED =>
                phase <= "010";
            when S_WALK =>
                phase <= "011";
            when S_WALK_END =>
                phase <= "100";
            when S_ALL_RED_2 =>
                phase <= "101";
            when S_NIGHT =>
                phase <= "110";
            when others =>
                null;
        end case;
    end process output_logic;

end architecture rtl;
