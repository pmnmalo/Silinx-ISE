----------------------------------------------------------------------------------
-- Silinx example: serial communication (a UART) with a terminal: each character received is sent
-- back (an echo), and shown.
--   rx / tx : the board's serial port (RS-232, USB-UART; on the Basys2, a PmodUSBUART on JA),
--             BAUD baud, 8 data bits, no parity, 1 stop bit (8N1): 9600 baud (CLK_HZ, the board's
--             clock, sets the bit time: a project made for a board has its clock there)
--   display : the bytes received (left, hexadecimal, 00 to FF and again) and the last one (right)
--   LD7..LD0: the last byte received, in binary
--   BTN0    : sends the message "Hello from Silinx!" and a line's end (CR LF)
-- The design: the receiver (uart_rx.vhd), the transmitter (uart_tx.vhd), the button's debouncer
-- (debounce.vhd) and the 7-segment display (sevenseg.vhd). A byte received while the transmitter
-- is busy waits in `pending` (its echo then follows the frame being sent); one received while
-- one is waiting replaces it.
-- In the Board Emulator: the Serial terminal (compiled engine) sends what you type and shows the echo.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity uart is
    Generic ( CLK_HZ  : integer := 50_000_000;     -- the board's clock, in Hz (50 MHz on the Basys2 / Nexys2)
              BAUD    : integer := 9600;
              STABLE  : integer := 0;              -- button debounce (20 ms): 0 for CLK_HZ / 50
              REFRESH : integer := 0;              -- display: cycles per digit (1 ms): 0 for CLK_HZ / 1000
              BTN_LOW : boolean := false );        -- true: the board's buttons read '0' when pressed
    Port ( clk : in  STD_LOGIC;                  -- the board's clock (CLK_HZ)
           rx  : in  STD_LOGIC;
           tx  : out STD_LOGIC;
           btn : in  STD_LOGIC_VECTOR (0 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);
           dp  : out STD_LOGIC;
           an  : out STD_LOGIC_VECTOR (3 downto 0) );
end uart;

architecture Behavioral of uart is
    -- the timing in clock cycles: a generic given (the test bench's), else (0) from the board's clock
    function or_else (given, derived : integer) return integer is
    begin
        if given /= 0 then return given; else return derived; end if;
    end function;
    constant STABLE_N  : integer := or_else(STABLE, CLK_HZ / 50);
    constant REFRESH_N : integer := or_else(REFRESH, CLK_HZ / 1000);
    constant BIT_T : integer := CLK_HZ / BAUD;    -- clock cycles a bit
    type rom_t is array (0 to 19) of STD_LOGIC_VECTOR (7 downto 0);
    constant MSG : rom_t := (                    -- "Hello from Silinx!" CR LF
        x"48", x"65", x"6C", x"6C", x"6F", x"20", x"66", x"72", x"6F", x"6D",
        x"20", x"53", x"69", x"6C", x"69", x"6E", x"78", x"21", x"0D", x"0A");

    signal rx_data  : STD_LOGIC_VECTOR (7 downto 0);
    signal rx_valid : STD_LOGIC;
    signal last     : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal count    : UNSIGNED (7 downto 0) := (others => '0');
    signal pending  : STD_LOGIC := '0';          -- a byte to echo
    signal sending  : STD_LOGIC := '0';          -- the message
    signal msg_i    : integer range 0 to 19 := 0;
    signal press    : STD_LOGIC;
    signal start    : STD_LOGIC := '0';
    signal tx_data  : STD_LOGIC_VECTOR (7 downto 0) := (others => '0');
    signal tx_busy  : STD_LOGIC;
    signal digits   : STD_LOGIC_VECTOR (15 downto 0);
    -- the button as '1' when pressed, whatever the board's level
    signal btnOn : STD_LOGIC_VECTOR (0 downto 0);
begin
    btnOn <= not btn when BTN_LOW else btn;

    receiver : entity work.uart_rx
        generic map ( BIT_T => BIT_T )
        port map ( clk => clk, rx => rx, data => rx_data, valid => rx_valid );

    transmitter : entity work.uart_tx
        generic map ( BIT_T => BIT_T )
        port map ( clk => clk, start => start, data => tx_data, busy => tx_busy, tx => tx );

    button : entity work.debounce
        generic map ( STABLE => STABLE_N )
        port map ( clk => clk, btn => btnOn(0), press => press );

    -- what is sent: the echo first, then the message's characters one after the other
    process (clk)
    begin
        if rising_edge(clk) then
            start <= '0';
            if rx_valid = '1' then
                last <= rx_data;
                count <= count + 1;
                pending <= '1';
            end if;
            if press = '1' and sending = '0' then
                sending <= '1';
                msg_i <= 0;
            end if;
            if tx_busy = '0' and start = '0' then
                if pending = '1' and rx_valid = '0' then
                    tx_data <= last;
                    start <= '1';
                    pending <= '0';
                elsif sending = '1' then
                    tx_data <= MSG(msg_i);
                    start <= '1';
                    if msg_i = 19 then
                        sending <= '0';
                    else
                        msg_i <= msg_i + 1;
                    end if;
                end if;
            end if;
        end if;
    end process;

    led <= last;
    digits <= std_logic_vector(count) & last;

    display : entity work.sevenseg
        generic map ( REFRESH => REFRESH_N )
        port map ( clk => clk, digits => digits, points => "0100",
                   seg => seg, dp => dp, an => an );
end Behavioral;
