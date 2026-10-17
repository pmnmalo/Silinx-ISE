-- Silinx test design (compiled simulator, #384): numeric_std arithmetic (unsigned and signed, 8 to 40
-- bits), shifts, comparisons, a ROM, a RAM with a synchronous read, a register with an asynchronous
-- reset, a state machine of an enumeration type and an integer counter.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity ops_vhd is
    Port ( clk, rst, we : in  STD_LOGIC;
           a, b         : in  STD_LOGIC_VECTOR (15 downto 0);
           c            : in  STD_LOGIC_VECTOR (39 downto 0);
           n            : in  STD_LOGIC_VECTOR (3 downto 0);
           sum, dif     : out STD_LOGIC_VECTOR (15 downto 0);
           prod         : out STD_LOGIC_VECTOR (31 downto 0);
           sprod        : out STD_LOGIC_VECTOR (31 downto 0);
           wide         : out STD_LOGIC_VECTOR (39 downto 0);
           shl, shr, asr : out STD_LOGIC_VECTOR (15 downto 0);
           flags        : out STD_LOGIC_VECTOR (5 downto 0);
           rom_q, ram_q : out STD_LOGIC_VECTOR (7 downto 0);
           acc          : out STD_LOGIC_VECTOR (39 downto 0);
           state_o      : out STD_LOGIC_VECTOR (1 downto 0);
           count        : out STD_LOGIC_VECTOR (4 downto 0));
end ops_vhd;

architecture Behavioral of ops_vhd is
    type rom_t is array (0 to 15) of STD_LOGIC_VECTOR (7 downto 0);
    constant ROM : rom_t := (x"00", x"11", x"2F", x"3A", x"47", x"5C", x"66", x"78",
                             x"81", x"9E", x"A0", x"B3", x"C4", x"D9", x"E7", x"FF");
    type ram_t is array (0 to 15) of STD_LOGIC_VECTOR (7 downto 0);
    signal ram : ram_t := (others => (others => '0'));
    type state_t is (IDLE, RUN, HOLD, DONE);
    signal state : state_t := IDLE;
    signal acc_r : unsigned (39 downto 0);
    signal cnt   : integer range 0 to 19 := 0;
begin
    sum   <= std_logic_vector(unsigned(a) + unsigned(b));
    dif   <= std_logic_vector(signed(a) - signed(b));
    prod  <= std_logic_vector(unsigned(a) * unsigned(b));
    sprod <= std_logic_vector(signed(a) * signed(b));
    wide  <= std_logic_vector(unsigned(c) + resize(unsigned(a), 40) - unsigned(c(39 downto 20)));
    shl   <= std_logic_vector(shift_left(unsigned(a), to_integer(unsigned(n))));
    shr   <= std_logic_vector(shift_right(unsigned(a), to_integer(unsigned(n))));
    asr   <= std_logic_vector(shift_right(signed(a), to_integer(unsigned(n))));
    flags(5) <= '1' when signed(a) < signed(b) else '0';
    flags(4) <= '1' when unsigned(a) < unsigned(b) else '0';
    flags(3) <= '1' when a = b else '0';
    flags(2) <= '1' when unsigned(c) > x"8000000000" else '0';
    flags(1) <= '1' when signed(c) >= resize(signed(b), 40) else '0';
    flags(0) <= a(to_integer(unsigned(n)));
    rom_q <= ROM(to_integer(unsigned(n)));

    process (clk)
    begin
        if rising_edge(clk) then
            if we = '1' then
                ram(to_integer(unsigned(n))) <= a(7 downto 0) xor b(15 downto 8);
            end if;
            ram_q <= ram(to_integer(unsigned(b(3 downto 0))));
        end if;
    end process;

    process (clk, rst)
    begin
        if rst = '1' then
            acc_r <= (others => '0');
            state <= IDLE;
        elsif rising_edge(clk) then
            acc_r <= acc_r + unsigned(c) + unsigned(a);
            case state is
                when IDLE => if a(0) = '1' then state <= RUN; end if;
                when RUN  => if b(0) = '1' then state <= HOLD; elsif a(1) = '1' then state <= DONE; end if;
                when HOLD => state <= RUN;
                when DONE => state <= IDLE;
            end case;
        end if;
    end process;
    acc <= std_logic_vector(acc_r);
    state_o <= std_logic_vector(to_unsigned(state_t'pos(state), 2));

    process (clk)
    begin
        if rising_edge(clk) then
            if cnt = 19 then cnt <= 0; else cnt <= cnt + 1; end if;
        end if;
    end process;
    count <= std_logic_vector(to_unsigned(cnt, 5));
end Behavioral;
