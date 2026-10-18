----------------------------------------------------------------------------------
-- Silinx example (vga): the timing of a 640x480 picture at 60 Hz. A pixel every two clock cycles
-- (25 MHz from the 50 MHz clock: `pixel` is high one cycle in two); a line is 800 pixels, a frame
-- 525 lines:
--   x :   0 .. 639 the picture,  640 .. 655 front porch,  656 .. 751 HSYNC (low),  752 .. 799 back porch
--   y :   0 .. 479 the picture,  480 .. 489 front porch,  490 .. 491 VSYNC (low),  492 .. 524 back porch
-- `active`: (x, y) is in the picture (two flags kept with the counters: x < 640, y < 480); `frame`: one
-- pixel at the start of the vertical blanking (the picture just ended: the moment to move what it shows).
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity vga_sync is
    Port ( clk    : in  STD_LOGIC;                 -- 50 MHz
           pixel  : out STD_LOGIC;                 -- the pixel enable: 25 MHz
           x      : out integer range 0 to 799;
           y      : out integer range 0 to 524;
           active : out STD_LOGIC;
           frame  : out STD_LOGIC;
           hsync  : out STD_LOGIC;
           vsync  : out STD_LOGIC );
end vga_sync;

architecture Behavioral of vga_sync is
    constant H_VISIBLE : integer := 640;
    constant H_FRONT   : integer := 16;
    constant H_SYNC    : integer := 96;
    constant H_TOTAL   : integer := 800;
    constant V_VISIBLE : integer := 480;
    constant V_FRONT   : integer := 10;
    constant V_SYNC    : integer := 2;
    constant V_TOTAL   : integer := 525;
    signal half : STD_LOGIC := '0';
    signal hc   : integer range 0 to H_TOTAL - 1 := 0;
    signal vc   : integer range 0 to V_TOTAL - 1 := 0;
    -- in the picture's columns (hc < 640) and lines (vc < 480): set when a counter starts again, cleared
    -- after its last visible value (flip-flops, not comparisons of the counters)
    signal hvis : STD_LOGIC := '1';
    signal vvis : STD_LOGIC := '1';
begin
    process (clk)
    begin
        if rising_edge(clk) then
            half <= not half;
            if half = '1' then
                if hc = H_TOTAL - 1 then
                    hc <= 0;
                    if vc = V_TOTAL - 1 then vc <= 0; else vc <= vc + 1; end if;
                else
                    hc <= hc + 1;
                end if;
                -- the visible area: from a counter's 0 to its last visible value
                if hc = H_TOTAL - 1 then hvis <= '1'; elsif hc = H_VISIBLE - 1 then hvis <= '0'; end if;
                if hc = H_TOTAL - 1 then
                    if vc = V_TOTAL - 1 then vvis <= '1'; elsif vc = V_VISIBLE - 1 then vvis <= '0'; end if;
                end if;
            end if;
        end if;
    end process;

    pixel  <= half;
    x      <= hc;
    y      <= vc;
    active <= hvis and vvis;
    frame  <= '1' when hc = 0 and vc = V_VISIBLE else '0';
    hsync  <= '0' when hc >= H_VISIBLE + H_FRONT and hc < H_VISIBLE + H_FRONT + H_SYNC else '1';
    vsync  <= '0' when vc >= V_VISIBLE + V_FRONT and vc < V_VISIBLE + V_FRONT + V_SYNC else '1';
end Behavioral;
