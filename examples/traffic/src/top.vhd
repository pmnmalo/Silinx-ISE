----------------------------------------------------------------------------------
-- Silinx example: traffic, a pedestrian crossing for the Basys2 / Nexys2.
-- The cars have green until a pedestrian presses the button; then (after at least 5 s of green)
-- yellow, all red, the pedestrians' green with the seconds left to cross on the display, their
-- green blinking at the end, all red again, and the cars' green.
--   clk : the board's oscillator (CLK_HZ: 50 MHz on the Basys2 / Nexys2)
--   BTN0 (btn(0)) : "press to cross": remembered until the pedestrians get their green
--   SW0  (sw(0))  : reset
--   SW1  (sw(1))  : night mode: the cars' yellow flashes, the pedestrian lamps are off
--   LD7 / LD6 / LD5 : the cars' red / yellow / green
--   LD1 / LD0       : the pedestrians' red / green
--   display         : the seconds left to cross (8 to 1), blank otherwise
-- The design, each part in the style that suits it best:
--   traffic.fsm.json : the controller, a state diagram (a Moore machine: one state per phase of
--                      the lights, its output the phase code); traffic.vhd is generated from it
--   lamps.bool.json  : which lamps are lit in each phase, a Boolean algebra (unused codes are don't
--                      cares, so the circuit is smaller); lamps.vhd is generated from it
--   timer.vhd        : the length of each phase, the 2 Hz blink and the seconds left (VHDL: a
--                      counter is clearer written than drawn)
--   sevenseg.v       : the 7-segment display (Verilog, the clock example's)
--   top.vhd          : this file: the button and switch synchronisers, the request latch and the
--                      parts connected together
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
    Generic ( CLK_HZ  : integer := 50_000_000;     -- the board's clock, in Hz (50 MHz on the Basys2 / Nexys2)
              TICK    : integer := 0;              -- clock cycles per second: 0 for CLK_HZ
              REFRESH : integer := 0;              -- display: cycles per digit (1 ms): 0 for CLK_HZ / 1000
              BTN_LOW : boolean := false;          -- true: the board's buttons read '0' when pressed
              SW_LOW  : boolean := false;          -- true: the board's switches read '0' when on
              AN_LOW  : boolean := true );         -- true: the board's digit enables light a digit at '0'
    Port ( clk : in  STD_LOGIC;
           sw  : in  STD_LOGIC_VECTOR (1 downto 0);
           btn : in  STD_LOGIC_VECTOR (0 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);
           dp  : out STD_LOGIC;
           an  : out STD_LOGIC_VECTOR (3 downto 0) );
end top;

architecture Structural of top is
    -- the timing in clock cycles: a generic given (the test bench's), else (0) from the board's clock
    function or_else (given, derived : integer) return integer is
    begin
        if given /= 0 then return given; else return derived; end if;
    end function;
    constant TICK_N    : integer := or_else(TICK, CLK_HZ);
    constant REFRESH_N : integer := or_else(REFRESH, CLK_HZ / 1000);
    -- AN_LOW as sevenseg.v's parameter (1: true; a Verilog module takes an integer)
    function to_int (b : boolean) return integer is
    begin
        if b then return 1; else return 0; end if;
    end function;
    component sevenseg
        generic ( REFRESH : integer; AN_LOW : integer );
        port ( clk    : in  std_logic;
               digits : in  std_logic_vector(15 downto 0);
               points : in  std_logic_vector(3 downto 0);
               seg    : out std_logic_vector(6 downto 0);
               dp     : out std_logic;
               an     : out std_logic_vector(3 downto 0) );
    end component;
    constant WALK : STD_LOGIC_VECTOR (2 downto 0) := "011";  -- the phase that answers a request
    signal rst                 : STD_LOGIC;
    signal btn_meta, btn_sync  : STD_LOGIC := '0';           -- (the button and the switch change
    signal sw_meta, night      : STD_LOGIC := '0';           -- at any time: two flip-flops each)
    signal req                 : STD_LOGIC := '0';           -- a pedestrian is waiting
    signal phase               : STD_LOGIC_VECTOR (2 downto 0);
    signal done, blink         : STD_LOGIC;
    signal left                : STD_LOGIC_VECTOR (3 downto 0);
    signal digits              : STD_LOGIC_VECTOR (15 downto 0);
    signal car_r, car_y, car_g, walk_r, walk_g : STD_LOGIC;
    -- the buttons and switches as '1' when pressed or on, whatever the board's level
    signal btnOn : STD_LOGIC_VECTOR (0 downto 0);
    signal swOn  : STD_LOGIC_VECTOR (1 downto 0);
begin
    btnOn <= not btn when BTN_LOW else btn;
    swOn  <= not sw when SW_LOW else sw;

    rst <= swOn(0);

    process (clk)
    begin
        if rising_edge(clk) then
            btn_meta <= btnOn(0);  btn_sync <= btn_meta;
            sw_meta  <= swOn(1);   night    <= sw_meta;
            -- the request: set by the button, kept until the pedestrians' green
            if rst = '1' or phase = WALK then
                req <= '0';
            elsif btn_sync = '1' then
                req <= '1';
            end if;
        end if;
    end process;

    u_fsm : entity work.traffic
        port map ( clk => clk, rst => rst, req => req, done => done, night => night, phase => phase );

    u_timer : entity work.timer
        generic map ( TICK => TICK_N )
        port map ( clk => clk, rst => rst, phase => phase, done => done, blink => blink, left => left );

    u_lamps : entity work.lamps
        port map ( phase2 => phase(2), phase1 => phase(1), phase0 => phase(0), blink => blink,
                   car_r => car_r, car_y => car_y, car_g => car_g, walk_r => walk_r, walk_g => walk_g );

    led <= car_r & car_y & car_g & "000" & walk_r & walk_g;

    -- the seconds left on the right digit (F: blank); the other digits blank
    digits <= x"FFFF" when left = "0000" else x"FFF" & left;
    u_display : sevenseg
        generic map ( REFRESH => REFRESH_N, AN_LOW => to_int(AN_LOW) )
        port map ( clk => clk, digits => digits, points => "0000",
                   seg => seg, dp => dp, an => an );
end Structural;
