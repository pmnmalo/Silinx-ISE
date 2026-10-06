----------------------------------------------------------------------------------
-- XAIlinx example: blinky for the Digilent Basys2 (Spartan-3E XC3S250E-CP132).
-- Mixed-language design: VHDL top + VHDL pattern generator + Verilog prescaler.
--   clk  : 50 MHz MCLK oscillator (B8, default JP4 setting)
--   sw   : sw(0) = reset, sw(1) = mode (0 = knight rider, 1 = binary counter),
--          sw(2) = pause, sw(3) = invert the LEDs
--   led  : LD0..LD7
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
    Generic ( DIV : integer := 5_000_000 );   -- 10 steps per second at 50 MHz
    Port ( clk : in  STD_LOGIC;
           sw  : in  STD_LOGIC_VECTOR (3 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0));
end top;

architecture Structural of top is
    component prescaler
        generic ( DIV : integer );
        port ( clk : in std_logic; rst : in std_logic; tick : out std_logic );
    end component;
    signal tick, step : std_logic;
    signal leds       : std_logic_vector(7 downto 0);
begin
    u_pre : prescaler
        generic map ( DIV => DIV )
        port map ( clk => clk, rst => sw(0), tick => tick );

    u_knight : entity work.knight
        port map ( clk => clk, rst => sw(0), step => step, mode => sw(1), leds => leds );

    step <= tick and not sw(2);                      -- sw(2): pause
    led  <= leds xor (7 downto 0 => sw(3));          -- sw(3): invert
end Structural;
