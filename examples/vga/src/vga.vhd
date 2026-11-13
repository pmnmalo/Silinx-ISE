----------------------------------------------------------------------------------
-- Silinx example: a picture on a VGA monitor (640x480 at 60 Hz) from the Basys2 / Nexys2.
--   the picture : eight colour bars (white, yellow, cyan, green, magenta, red, blue, black) inside a
--                 white frame (the monitor's edges), and a 32x32 square in the bars' opposite colours
--   BTN3 / BTN0 : move the square left / right       BTN2 / BTN1 : up / down (held: it keeps moving)
--   SW0         : speed: 1 pixel a frame (60 a second), or 4 when on
-- The design: the VGA timing (vga_sync.vhd: the pixel counters and the sync pulses) and, here, what
-- each pixel shows. The board's VGA connector takes 8 bits of colour: red and green 3 bits, blue 2.
-- On Silinx's Board Emulator the VGA monitor draws the picture and measures its timing.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity vga is
    Generic ( CLK_HZ  : integer := 50_000_000;     -- the board's clock, in Hz (50 MHz on the Basys2 / Nexys2)
              BTN_LOW : boolean := false;          -- true: the board's buttons read '0' when pressed
              SW_LOW  : boolean := false );        -- true: the board's switches read '0' when on
    Port ( clk       : in  STD_LOGIC;
           sw        : in  STD_LOGIC_VECTOR (0 downto 0);
           btn       : in  STD_LOGIC_VECTOR (3 downto 0);
           vga_red   : out STD_LOGIC_VECTOR (2 downto 0);
           vga_green : out STD_LOGIC_VECTOR (2 downto 0);
           vga_blue  : out STD_LOGIC_VECTOR (1 downto 0);
           vga_hsync : out STD_LOGIC;
           vga_vsync : out STD_LOGIC );
end vga;

architecture Behavioral of vga is
    -- clock cycles per pixel, for 25 MHz: 2 at 50 MHz, 4 at 100 MHz (at least 1)
    function pace_of (hz : integer) return integer is
    begin
        if hz < 37_500_000 then return 1; else return (hz + 12_500_000) / 25_000_000; end if;
    end function;
    constant SIZE : integer := 32;
    signal pixel, active, frame, hsync, vsync : STD_LOGIC;
    signal x : integer range 0 to 799;
    signal y : integer range 0 to 524;
    -- the buttons, synchronised to the clock (two flip-flops)
    signal sync1, buttons : STD_LOGIC_VECTOR (3 downto 0) := "0000";
    -- the square's top left corner (in the middle at the start)
    signal sx : integer range 0 to 640 - SIZE := 320 - SIZE / 2;
    signal sy : integer range 0 to 480 - SIZE := 240 - SIZE / 2;
    -- the colour of the pixel: red (3 bits), green (3), blue (2)
    signal rgb : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal hs, vs : STD_LOGIC := '1';
    -- the buttons and switches as '1' when pressed or on, whatever the board's level
    signal btnOn : STD_LOGIC_VECTOR (3 downto 0);
    signal swOn  : STD_LOGIC_VECTOR (0 downto 0);
begin
    btnOn <= not btn when BTN_LOW else btn;
    swOn  <= not sw when SW_LOW else sw;

    timing: entity work.vga_sync
        generic map (DIV => pace_of(CLK_HZ))
        port map (clk => clk, pixel => pixel, x => x, y => y, active => active, frame => frame, hsync => hsync, vsync => vsync);

    -- the square: moved once a frame, after the picture, while a button is held
    process (clk)
        variable step : integer range 1 to 4;
    begin
        if rising_edge(clk) then
            sync1 <= btnOn;
            buttons <= sync1;
            if swOn(0) = '1' then step := 4; else step := 1; end if;
            if pixel = '1' and frame = '1' then
                if buttons(3) = '1' then
                    if sx >= step then sx <= sx - step; else sx <= 0; end if;
                elsif buttons(0) = '1' then
                    if sx <= 640 - SIZE - step then sx <= sx + step; else sx <= 640 - SIZE; end if;
                end if;
                if buttons(2) = '1' then
                    if sy >= step then sy <= sy - step; else sy <= 0; end if;
                elsif buttons(1) = '1' then
                    if sy <= 480 - SIZE - step then sy <= sy + step; else sy <= 480 - SIZE; end if;
                end if;
            end if;
        end if;
    end process;

    -- the pixel (x, y): its colour and the sync pulses, registered together (one pixel later)
    process (clk)
        variable bar : integer range 0 to 7;
        variable colour : STD_LOGIC_VECTOR (7 downto 0);
    begin
        if rising_edge(clk) then
            if pixel = '1' then
                hs <= hsync;
                vs <= vsync;
                -- the bar under x: 80 pixels each
                bar := 0;
                for i in 1 to 7 loop
                    if x >= 80 * i then bar := i; end if;
                end loop;
                case bar is
                    when 0 => colour := "11111111";        -- white
                    when 1 => colour := "11111100";        -- yellow
                    when 2 => colour := "00011111";        -- cyan
                    when 3 => colour := "00011100";        -- green
                    when 4 => colour := "11100011";        -- magenta
                    when 5 => colour := "11100000";        -- red
                    when 6 => colour := "00000011";        -- blue
                    when others => colour := "00000000";   -- black
                end case;
                if x >= sx and x < sx + SIZE and y >= sy and y < sy + SIZE then
                    colour := not colour;                  -- the square: the opposite colour
                end if;
                if active = '0' then
                    rgb <= "00000000";                     -- black outside the picture (blanking)
                elsif x = 0 or x = 639 or y = 0 or y = 479 then
                    rgb <= "11111111";                     -- the white frame
                else
                    rgb <= colour;
                end if;
            end if;
        end if;
    end process;

    vga_red   <= rgb(7 downto 5);
    vga_green <= rgb(4 downto 2);
    vga_blue  <= rgb(1 downto 0);
    vga_hsync <= hs;
    vga_vsync <= vs;
end Behavioral;
