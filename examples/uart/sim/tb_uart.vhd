----------------------------------------------------------------------------------
-- Test bench for uart: fast generics (1 Mbaud at 50 MHz: 50 clock cycles a bit, a 2-cycle
-- debounce, 2 cycles per display digit). It is the terminal: it sends bytes on rx as frames and
-- reads what comes back on tx, frame by frame, as a terminal would; it checks the echo of each
-- byte (two sent back to back too), the LEDs and the display (the bytes received, the last one),
-- a terminal a little slow, then BTN0's message.
----------------------------------------------------------------------------------
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity tb_uart is
end tb_uart;

architecture behavior of tb_uart is
    constant clk_period : time := 20 ns;
    constant bit_time   : time := 50 * clk_period;   -- 1 Mbaud
    signal clk : STD_LOGIC := '0';
    signal rx  : STD_LOGIC := '1';
    signal tx  : STD_LOGIC;
    signal btn : STD_LOGIC_VECTOR (0 downto 0) := "0";
    signal led : STD_LOGIC_VECTOR (7 downto 0);
    signal seg : STD_LOGIC_VECTOR (6 downto 0);
    signal dp  : STD_LOGIC;
    signal an  : STD_LOGIC_VECTOR (3 downto 0);

    -- the bytes received on tx, in order
    type bytes_t is array (0 to 63) of STD_LOGIC_VECTOR (7 downto 0);
    signal got   : bytes_t;
    signal n_got : integer := 0;
    signal done  : boolean := false;
    -- BTN0's message: "Hello from Silinx!" CR LF
    type msg_t is array (0 to 19) of STD_LOGIC_VECTOR (7 downto 0);
    constant MSG : msg_t := (x"48", x"65", x"6C", x"6C", x"6F", x"20", x"66", x"72", x"6F", x"6D", x"20", x"53", x"69", x"6C", x"69", x"6E", x"78", x"21", x"0D", x"0A");

    -- the hexadecimal digit a segment pattern shows (-1: not one)
    function hex_of (s : STD_LOGIC_VECTOR (6 downto 0)) return integer is
    begin
        case s is
            when "1000000" => return 0;  when "1111001" => return 1;  when "0100100" => return 2;
            when "0110000" => return 3;  when "0011001" => return 4;  when "0010010" => return 5;
            when "0000010" => return 6;  when "1111000" => return 7;  when "0000000" => return 8;
            when "0010000" => return 9;  when "0001000" => return 10; when "0000011" => return 11;
            when "1000110" => return 12; when "0100001" => return 13; when "0000110" => return 14;
            when "0001110" => return 15;
            when others => return -1;
        end case;
    end function;
begin
    clk <= not clk after clk_period / 2 when not done;

    uut : entity work.uart
        generic map ( CLK_HZ => 50_000_000, BAUD => 1_000_000, STABLE => 2, REFRESH => 2 )
        port map ( clk => clk, rx => rx, tx => tx, btn => btn, led => led, seg => seg, dp => dp, an => an );

    -- the terminal's receiver: each frame on tx, sampled in the middle of its bits
    receive : process
        variable b : STD_LOGIC_VECTOR (7 downto 0);
    begin
        wait until tx = '0';
        wait for bit_time / 2;
        assert tx = '0' report "ERROR: a glitch on tx, not a start bit" severity error;
        for i in 0 to 7 loop
            wait for bit_time;
            b(i) := tx;
        end loop;
        wait for bit_time;
        assert tx = '1' report "ERROR: a frame on tx with no stop bit" severity error;
        got(n_got) <= b;
        n_got <= n_got + 1;
    end process;

    stimulus : process
        procedure send (v : STD_LOGIC_VECTOR (7 downto 0); t : time := bit_time) is
        begin
            rx <= '0';
            wait for t;
            for i in 0 to 7 loop
                rx <= v(i);
                wait for t;
            end loop;
            rx <= '1';
            wait for t;
        end procedure;
        -- the display's four digits (left to right), each read while its anode is on
        variable shown : integer;
        procedure read_display (value : out integer) is
            variable v : integer := 0;
        begin
            for d in 3 downto 0 loop
                wait until an(d) = '0';
                wait for clk_period / 4;
                assert hex_of(seg) >= 0 report "ERROR: digit " & integer'image(d) & " shows no hexadecimal digit" severity error;
                v := v * 16 + hex_of(seg);
            end loop;
            value := v;
        end procedure;
    begin
        wait for 10 * clk_period;
        -- one character: its echo, the LEDs, the display (1 byte received, 41)
        send(x"41");
        wait for 12 * bit_time;
        assert n_got = 1 report "ERROR: no echo of 'A'" severity error;
        assert got(0) = x"41" report "ERROR: the echo is not 'A'" severity error;
        assert led = x"41" report "ERROR: the LEDs do not show 'A' (41)" severity error;
        read_display(shown);
        assert shown = 16#0141# report "ERROR: the display shows " & integer'image(shown) & ", not 01 41" severity error;
        -- two back to back: both echoed, in order (the second waits for the first's frame)
        send(x"68");
        send(x"69");
        wait for 25 * bit_time;
        assert n_got = 3 report "ERROR: " & integer'image(n_got) & " bytes back, not 3" severity error;
        assert got(1) = x"68" and got(2) = x"69" report "ERROR: the echo is not 'hi'" severity error;
        read_display(shown);
        assert shown = 16#0369# report "ERROR: the display shows " & integer'image(shown) & ", not 03 69" severity error;
        -- a terminal 4% slow (52 clock cycles a bit): the middle of each bit is still in that bit
        send(x"5A", 52 * clk_period);
        wait for 12 * bit_time;
        assert n_got = 4 and got(3) = x"5A" report "ERROR: a frame 4% slow is not received" severity error;
        -- BTN0: the message, a line's end CR LF
        btn <= "1";
        wait for 10 * clk_period;
        btn <= "0";
        wait for 21 * 10 * bit_time;
        assert n_got = 24 report "ERROR: " & integer'image(n_got) & " bytes back, not 24" severity error;
        for i in MSG'range loop
            assert got(4 + i) = MSG(i) report "ERROR: the message's byte " & integer'image(i) & " is wrong" severity error;
        end loop;
        report "Simulation finished OK";
        done <= true;
        wait;
    end process;
end behavior;
