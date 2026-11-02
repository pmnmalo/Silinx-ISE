-- A UART echo (test/uart.test.js, #2536): each byte received on rx (8N1 at BAUD) sent back on tx, and shown on
-- the LEDs; the line synchronised to the clock, each bit sampled in its middle; a byte received while the last one
-- is still being sent waits (pend): the frames come a little faster than the transmitter's whole bits.
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity uart_echo is
  generic (CLK_HZ : integer := 50000000; BAUD : integer := 9600);
  port (clk : in std_logic;
        rx  : in std_logic;
        tx  : out std_logic;
        led : out std_logic_vector(7 downto 0));
end uart_echo;
architecture rtl of uart_echo is
  constant BIT_T : integer := CLK_HZ / BAUD;
  signal rx_s, rx_m : std_logic := '1';
  signal rcnt : integer range 0 to BIT_T := 0;
  signal rbit : integer range 0 to 9 := 0;
  signal rbusy : std_logic := '0';
  signal rsh : std_logic_vector(7 downto 0) := (others => '0');
  signal got, pend : std_logic := '0';
  signal data : std_logic_vector(7 downto 0) := (others => '0');
  signal tcnt : integer range 0 to BIT_T := 0;
  signal tbit : integer range 0 to 9 := 0;
  signal tbusy : std_logic := '0';
  signal tsh : std_logic_vector(9 downto 0) := (others => '1');
begin
  process (clk) begin
    if rising_edge(clk) then
      rx_m <= rx; rx_s <= rx_m;
      got <= '0';
      -- the receiver: the start bit's falling edge, then each bit in its middle
      if rbusy = '0' then
        if rx_s = '0' then rbusy <= '1'; rcnt <= BIT_T / 2; rbit <= 0; end if;
      elsif rcnt /= 0 then rcnt <= rcnt - 1;
      else
        rcnt <= BIT_T - 1;
        if rbit = 0 then
          if rx_s = '1' then rbusy <= '0'; end if;   -- (a glitch, not a start bit)
          rbit <= 1;
        elsif rbit <= 8 then rsh <= rx_s & rsh(7 downto 1); rbit <= rbit + 1;
        else rbusy <= '0'; if rx_s = '1' then data <= rsh; got <= '1'; end if;
        end if;
      end if;
      -- the transmitter: the byte received, a start bit, 8 bits, a stop bit
      if got = '1' then pend <= '1'; end if;
      if tbusy = '0' then
        if pend = '1' then tsh <= '1' & data & '0'; tbusy <= '1'; tcnt <= BIT_T - 1; tbit <= 0; pend <= '0'; end if;
      elsif tcnt /= 0 then tcnt <= tcnt - 1;
      else
        tcnt <= BIT_T - 1; tsh <= '1' & tsh(9 downto 1);
        if tbit = 9 then tbusy <= '0'; else tbit <= tbit + 1; end if;
      end if;
    end if;
  end process;
  tx <= tsh(0) when tbusy = '1' else '1';
  led <= data;
end rtl;
