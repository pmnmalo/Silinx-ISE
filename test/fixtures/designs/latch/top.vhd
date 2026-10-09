-- Transparent latches inferred by XST:
--   q1 : 4 bits, gate g and gate enable ge, asynchronous clear      (LDCE)
--   q2 : 2 bits, gate active low, asynchronous preset, starts at 1  (LDP_1)
--   q3 : 1 bit plain latch                                          (LD)
--   qr : q1 registered on the clock
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
  port (clk : in  std_logic;
        g   : in  std_logic;
        ge  : in  std_logic;
        clr : in  std_logic;
        pre : in  std_logic;
        g3  : in  std_logic;
        d   : in  std_logic_vector(3 downto 0);
        q1  : out std_logic_vector(3 downto 0);
        q2  : out std_logic_vector(1 downto 0);
        q3  : out std_logic;
        qr  : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  signal l1 : std_logic_vector(3 downto 0) := "0000";
  signal l2 : std_logic_vector(1 downto 0) := "11";
  signal l3 : std_logic := '0';
  signal r  : std_logic_vector(3 downto 0) := "0000";
begin
  process (g, ge, clr, d)
  begin
    if clr = '1' then
      l1 <= "0000";
    elsif g = '1' and ge = '1' then
      l1 <= d;
    end if;
  end process;

  process (g, pre, d)
  begin
    if pre = '1' then
      l2 <= "11";
    elsif g = '0' then
      l2 <= d(3 downto 2);
    end if;
  end process;

  process (g3, d)
  begin
    if g3 = '1' then
      l3 <= d(0) xor d(1);
    end if;
  end process;

  process (clk)
  begin
    if rising_edge(clk) then
      r <= l1;
    end if;
  end process;

  q1 <= l1;
  q2 <= l2;
  q3 <= l3;
  qr <= r;
end rtl;
