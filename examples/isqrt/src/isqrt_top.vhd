----------------------------------------------------------------------------------
-- Silinx example: the integer square root of the switches, on the display, for the Basys2 / Nexys2.
--   SW7..SW0 : a number n, 0 to 255
--   display  : root.remainder (n = root * root + remainder): 200 shows 14.04
--   LD0, LD1 : the block protocol's ap_idle and ap_ready: each high for a cycle of each call, so dim
-- The square root is a C function made into hardware by Silinx HLS (isqrt.c): this design instances
-- it as any other module, and calls it again and again (ap_start always 1) on the switches; each
-- call takes as many clock cycles as the root's value. The display shows the last call's results,
-- kept when ap_done says they are valid.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity isqrt_top is
    Generic ( REFRESH : integer := 50_000 );      -- display: cycles per digit (1 ms)
    Port ( clk : in  STD_LOGIC;                   -- 50 MHz
           sw  : in  STD_LOGIC_VECTOR (7 downto 0);
           led : out STD_LOGIC_VECTOR (1 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);
           dp  : out STD_LOGIC;
           an  : out STD_LOGIC_VECTOR (3 downto 0) );
end isqrt_top;

architecture Behavioral of isqrt_top is
    signal rst       : STD_LOGIC_VECTOR (1 downto 0) := "11";    -- the reset, at power-up only
    signal sw_meta   : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal n         : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal done      : STD_LOGIC;
    signal rem_vld   : STD_LOGIC;
    signal root_now  : STD_LOGIC_VECTOR (3 downto 0);
    signal rem_now   : STD_LOGIC_VECTOR (4 downto 0);
    signal root      : UNSIGNED (3 downto 0) := (others => '0');
    signal remainder : UNSIGNED (4 downto 0) := (others => '0');
    signal digits    : STD_LOGIC_VECTOR (15 downto 0);

    -- two decimal digits of a number under 100 (tens, units)
    function decimal (v : UNSIGNED) return STD_LOGIC_VECTOR is
        variable tens : integer;
    begin
        tens := to_integer(v) / 10;
        return STD_LOGIC_VECTOR(to_unsigned(tens, 4)) & STD_LOGIC_VECTOR(to_unsigned(to_integer(v) - 10 * tens, 4));
    end function;
begin
    process (clk)
    begin
        if rising_edge(clk) then
            rst     <= rst(0) & '0';
            sw_meta <= sw;                            -- the switches synchronised to the clock
            n       <= sw_meta;
            if rem_vld = '1' then remainder <= unsigned(rem_now); end if;
            if done = '1' then root <= unsigned(root_now); end if;
        end if;
    end process;

    sqrt: entity work.isqrt
        port map ( ap_clk => clk, ap_rst => rst(1), ap_start => '1', ap_done => done, ap_idle => led(0), ap_ready => led(1),
                   n => n, remainder => rem_now, remainder_ap_vld => rem_vld, ap_return => root_now );

    digits <= decimal(root) & decimal(remainder);

    display: entity work.sevenseg
        generic map ( REFRESH => REFRESH )
        port map ( clk => clk, digits => digits, points => "0100", seg => seg, dp => dp, an => an );
end Behavioral;
