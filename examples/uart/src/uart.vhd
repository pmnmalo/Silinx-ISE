----------------------------------------------------------------------------------
-- Silinx example: serial communication (a UART) with a terminal: each character received is sent
-- back (an echo), and shown.
--   rx / tx : the board's serial port (RS-232, USB-UART; on the Basys2, a PmodUSBUART on JA),
--             BAUD baud, 8 data bits, no parity, 1 stop bit (8N1): 9600 baud at 50 MHz (CLK_HZ: on
--             a 100 MHz board, 19200 baud; set CLK_HZ to the board's clock for 9600)
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
    Generic ( CLK_HZ  : integer := 50_000_000;   -- the board's clock
              BAUD    : integer := 9600;
              STABLE  : integer := 1_000_000;    -- button debounce (20 ms)
              REFRESH : integer := 50_000 );     -- display: cycles per digit (1 ms)
    Port ( clk : in  STD_LOGIC;                  -- 50 MHz
           rx  : in  STD_LOGIC;
           tx  : out STD_LOGIC;
           btn : in  STD_LOGIC_VECTOR (0 downto 0);
           led : out STD_LOGIC_VECTOR (7 downto 0);
           seg : out STD_LOGIC_VECTOR (6 downto 0);
           dp  : out STD_LOGIC;
           an  : out STD_LOGIC_VECTOR (3 downto 0) );
end uart;

architecture Behavioral of uart is
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
begin
    receiver : entity work.uart_rx
        generic map ( BIT_T => BIT_T )
        port map ( clk => clk, rx => rx, data => rx_data, valid => rx_valid );

    transmitter : entity work.uart_tx
        generic map ( BIT_T => BIT_T )
        port map ( clk => clk, start => start, data => tx_data, busy => tx_busy, tx => tx );

    button : entity work.debounce
        generic map ( STABLE => STABLE )
        port map ( clk => clk, btn => btn(0), press => press );

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
        generic map ( REFRESH => REFRESH )
        port map ( clk => clk, digits => digits, points => "0100",
                   seg => seg, dp => dp, an => an );
end Behavioral;
