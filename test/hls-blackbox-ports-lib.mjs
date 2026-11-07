// The designs of an RTL blackbox's memory and stream ports (#2339): a Verilog and a VHDL module that read and write a
// memory (msum), and that read a stream and write another (inc), their C models, their descriptions (syn.blackbox), and
// C functions that call them: the top's memory (EXT), a memory of its own (LOCAL), the top's streams (STREAM). Used by
// test/c-blackbox-ports.test.js and test/mcp-hls.test.js.
export const H = '#include "ap_int.h"\n#include "hls_stream.h"\ntypedef ap_int<10> data_t;\n';
// (a memory's words summed, each written back one more: a read, then a write, a word at a time, ap_memory's timing)
export const MSUM_V = `module msum(input ap_clk, ap_rst, ap_start, output reg ap_done, output ap_idle, ap_ready,
  output reg [2:0] m_address0, output reg m_ce0, m_we0, output reg [9:0] m_d0, input [9:0] m_q0,
  output reg [9:0] z, output reg z_ap_vld);
  reg [1:0] st; reg [2:0] i;
  assign ap_idle = st == 0; assign ap_ready = ap_done;
  always @(posedge ap_clk) begin
    ap_done <= 0; z_ap_vld <= 0; m_ce0 <= 0; m_we0 <= 0;
    if (ap_rst) begin st <= 0; i <= 0; z <= 0; m_address0 <= 0; m_d0 <= 0; end
    else case (st)
      0: if (ap_start) begin i <= 0; z <= 0; m_address0 <= 0; m_ce0 <= 1; st <= 1; end
      1: st <= 2;
      2: begin z <= z + m_q0; m_address0 <= i; m_we0 <= 1; m_ce0 <= 1; m_d0 <= m_q0 + 1; st <= 3; end
      3: if (i == 7) begin ap_done <= 1; z_ap_vld <= 1; st <= 0; end
         else begin i <= i + 1; m_address0 <= i + 1; m_ce0 <= 1; st <= 1; end
    endcase
  end
endmodule
`;
export const MSUM_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity msum is
  port (ap_clk, ap_rst, ap_start : in std_logic;
    ap_done, ap_idle, ap_ready : out std_logic;
    m_address0 : out std_logic_vector(2 downto 0);
    m_ce0, m_we0 : out std_logic;
    m_d0 : out std_logic_vector(9 downto 0);
    m_q0 : in std_logic_vector(9 downto 0);
    z : out std_logic_vector(9 downto 0);
    z_ap_vld : out std_logic);
end msum;
architecture rtl of msum is
  signal st : integer range 0 to 3;
  signal i : unsigned(2 downto 0);
  signal acc : unsigned(9 downto 0);
  signal done : std_logic;
begin
  ap_idle <= '1' when st = 0 else '0';
  ap_done <= done; ap_ready <= done; z_ap_vld <= done; z <= std_logic_vector(acc);
  process (ap_clk) begin
    if rising_edge(ap_clk) then
      done <= '0'; m_ce0 <= '0'; m_we0 <= '0';
      if ap_rst = '1' then
        st <= 0; i <= (others => '0'); acc <= (others => '0'); m_address0 <= (others => '0'); m_d0 <= (others => '0');
      else
        case st is
          when 0 =>
            if ap_start = '1' then i <= (others => '0'); acc <= (others => '0'); m_address0 <= (others => '0'); m_ce0 <= '1'; st <= 1; end if;
          when 1 => st <= 2;
          when 2 =>
            acc <= acc + unsigned(m_q0); m_address0 <= std_logic_vector(i); m_we0 <= '1'; m_ce0 <= '1';
            m_d0 <= std_logic_vector(unsigned(m_q0) + 1); st <= 3;
          when others =>
            if i = 7 then done <= '1'; st <= 0;
            else i <= i + 1; m_address0 <= std_logic_vector(i + 1); m_ce0 <= '1'; st <= 1; end if;
        end case;
      end if;
    end if;
  end process;
end rtl;
`;
// (a word read from a stream, one more written to another: each when its FIFO is ready)
export const INC_V = `module inc(input ap_clk, ap_rst, ap_start, output reg ap_done, output ap_idle, ap_ready,
  input i_empty_n, output i_read, input [9:0] i_dout, input o_full_n, output o_write, output [9:0] o_din);
  reg [1:0] st; reg [9:0] v;
  assign i_read = st == 1 && i_empty_n; assign o_write = st == 2 && o_full_n; assign o_din = v + 1;
  assign ap_idle = st == 0; assign ap_ready = ap_done;
  always @(posedge ap_clk) begin
    ap_done <= 0;
    if (ap_rst) begin st <= 0; v <= 0; end
    else case (st)
      0: if (ap_start) st <= 1;
      1: if (i_empty_n) begin v <= i_dout; st <= 2; end
      2: if (o_full_n) begin ap_done <= 1; st <= 0; end
    endcase
  end
endmodule
`;
export const INC_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity inc is
  port (ap_clk, ap_rst, ap_start : in std_logic;
    ap_done, ap_idle, ap_ready : out std_logic;
    i_empty_n : in std_logic; i_read : out std_logic; i_dout : in std_logic_vector(9 downto 0);
    o_full_n : in std_logic; o_write : out std_logic; o_din : out std_logic_vector(9 downto 0));
end inc;
architecture rtl of inc is
  signal st : integer range 0 to 2;
  signal v : unsigned(9 downto 0);
  signal done : std_logic;
begin
  i_read <= '1' when st = 1 and i_empty_n = '1' else '0';
  o_write <= '1' when st = 2 and o_full_n = '1' else '0';
  o_din <= std_logic_vector(v + 1);
  ap_idle <= '1' when st = 0 else '0';
  ap_done <= done; ap_ready <= done;
  process (ap_clk) begin
    if rising_edge(ap_clk) then
      done <= '0';
      if ap_rst = '1' then st <= 0; v <= (others => '0');
      else
        case st is
          when 0 => if ap_start = '1' then st <= 1; end if;
          when 1 => if i_empty_n = '1' then v <= unsigned(i_dout); st <= 2; end if;
          when others => if o_full_n = '1' then done <= '1'; st <= 0; end if;
        end case;
      end if;
    end if;
  end process;
end rtl;
`;
export const MSUM_C = `${H}void msum(data_t m[8], data_t &z) { data_t s = 0; for (int i = 0; i < 8; i++) { s += m[i]; m[i] = m[i] + 1; } z = s; }\n`;
export const RSUM_C = `${H}void msum(data_t m[8], data_t &z) { data_t s = 0; for (int i = 0; i < 8; i++) s += m[i]; z = s; }\n`;
export const INC_C = `${H}void inc(hls::stream<data_t> &i, hls::stream<data_t> &o) { o.write(i.read() + 1); }\n`;
export const CTRL = { module_clock: 'ap_clk', module_reset: 'ap_rst', ap_ctrl_chain_protocol_start: 'ap_start', ap_ctrl_chain_protocol_done: 'ap_done', ap_ctrl_chain_protocol_idle: 'ap_idle', ap_ctrl_chain_protocol_ready: 'ap_ready' };
export const RAM = { RAM_address: 'm_address0', RAM_clock_enable: 'm_ce0', RAM_write_enable: 'm_we0', RAM_data_write_out: 'm_d0', RAM_data_read_in: 'm_q0' };
export const MDESC = (over = {}, m = {}) => ({
  c_function_name: 'msum', rtl_top_module_name: 'msum', c_files: ['msum.cpp'], rtl_files: ['msum.v'],
  c_parameters: [{ c_name: 'm', c_port_direction: 'inout', RAM_type: 'RAM_1P', rtl_ports: RAM, ...m },
    { c_name: 'z', c_port_direction: 'out', rtl_ports: { data_write_out: 'z', data_write_valid: 'z_ap_vld' } }],
  rtl_common_signal: CTRL, ...over,
});
export const FIN = { FIFO_empty_flag: 'i_empty_n', FIFO_read_enable: 'i_read', FIFO_data_read_in: 'i_dout' };
export const FOUT = { FIFO_full_flag: 'o_full_n', FIFO_write_enable: 'o_write', FIFO_data_write_out: 'o_din' };
export const IDESC = (over = {}, i = {}, o = {}) => ({
  c_function_name: 'inc', rtl_top_module_name: 'inc', c_files: ['inc.cpp'], rtl_files: ['inc.v'],
  c_parameters: [{ c_name: 'i', c_port_direction: 'in', rtl_ports: FIN, ...i }, { c_name: 'o', c_port_direction: 'out', rtl_ports: FOUT, ...o }],
  rtl_common_signal: CTRL, ...over,
});
// the top's memory (ap_memory), inout: its words read and written by the module
export const EXT = `${H}void msum(data_t m[8], data_t &z);
void top(data_t a[8], data_t &s) { data_t t; msum(a, t); s = t; }
int main() {
  data_t a[8], s;
  for (int i = 0; i < 8; i++) a[i] = i * 3 - 5;
  top(a, s); if (s != 44) return 1;
  for (int i = 0; i < 8; i++) if (a[i] != i * 3 - 4) return 2;
  top(a, s); if (s != 52) return 3;
  return 0;
}
`;
// a memory of the top's own (8 words: registers, but a memory as the module's port needs), written before and read after
export const LOCAL = `${H}void msum(data_t m[8], data_t &z);
void top(data_t base, data_t &s) {
  data_t m[8];
  for (int i = 0; i < 8; i++) m[i] = base + i;
  data_t t; msum(m, t);
  data_t u = 0;
  for (int i = 0; i < 8; i++) u += m[i];
  s = t + u;
}
int main() { for (int b = -3; b < 3; b++) { data_t s; top(b, s); if (s != 16 * b + 64) return 1; } return 0; }
`;
export const STREAM = `${H}void inc(hls::stream<data_t> &i, hls::stream<data_t> &o);
void top(hls::stream<data_t> &a, hls::stream<data_t> &b) { for (int k = 0; k < 4; k++) inc(a, b); }
int main() {
  hls::stream<data_t> a, b;
  for (int k = 0; k < 4; k++) a.write(k * 7 - 9);
  top(a, b);
  for (int k = 0; k < 4; k++) if (b.read() != k * 7 - 8) return 1;
  return 0;
}
`;
export const FILES = { 'msum.cpp': MSUM_C, 'rsum.cpp': RSUM_C, 'msum.v': MSUM_V, 'msum.vhd': MSUM_VHD, 'inc.cpp': INC_C, 'inc.v': INC_V, 'inc.vhd': INC_VHD };
