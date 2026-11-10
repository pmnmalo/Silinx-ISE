// The grading tests' exercise and hand-written submissions (#3192): a 4-bit counter with a synchronous reset and an
// enable, right and wrong in Verilog and VHDL; the traffic example's state machine as a drawing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const COUNTER_V = `module counter4(input clk, input rst, input en, output reg [3:0] q);
  always @(posedge clk)
    if (rst) q <= 4'd0;
    else if (en) q <= q + 4'd1;
endmodule
`;
export const COUNTER_VHD = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter4 is
  port (clk, rst, en : in std_logic; q : out std_logic_vector(3 downto 0));
end entity;

architecture rtl of counter4 is
  signal c : unsigned(3 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then c <= (others => '0');
      elsif en = '1' then c <= c + 1;
      end if;
    end if;
  end process;
  q <= std_logic_vector(c);
end architecture;
`;
// the teacher's test bench: ten counts after the reset
export const TB_V = `module tb_counter4;
  reg clk = 0, rst = 1, en = 0;
  wire [3:0] q;
  counter4 uut(.clk(clk), .rst(rst), .en(en), .q(q));
  always #5 clk = ~clk;
  initial begin
    #12 rst = 0; en = 1;
    #100;
    if (q !== 4'd10) $error("after ten counts q is %0d", q);
    $display("TB DONE");
    $finish;
  end
endmodule
`;
export const VECTORS = `# the reset, then counting with the enable on and off
rst en | q
1 0 | 0
0 1 | 1
0 1 | 2
0 0 | 2
0 1 | 0x3
1 1 | 0
0 1 | 0001
`;

export const PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rst', dir: 'in', width: 1 }, { name: 'en', dir: 'in', width: 1 }, { name: 'q', dir: 'out', width: 4 }];

export function counterExercise(extra = {}) {
  return {
    silinxExercise: 1, id: 'counter4', title: { en: '4-bit counter', pt: 'Contador de 4 bits' },
    statement: { en: 'A 4-bit counter with a synchronous reset and an enable.', pt: 'Um contador de 4 bits com reset síncrono e enable.' },
    top: 'counter4', ports: PORTS,
    reference: { files: [{ path: 'ref/counter4.vhd', text: COUNTER_VHD }] },
    tests: [
      { id: 'count', title: { en: 'Counting', pt: 'Contagem' }, visible: true, points: 30, kind: 'vectors', clock: 'clk', vectors: VECTORS },
      { id: 'random', points: 40, kind: 'reference', clock: 'clk', cycles: 60, seed: 7, hold: { rst: ['1', '1'] } },
      { id: 'bench', points: 30, kind: 'testbench', top: 'tb_counter4', done: 'TB DONE', files: [{ path: 'tb/tb_counter4.v', text: TB_V }] },
    ],
    ...extra,
  };
}

/** A submission of one HDL file (and its silinx.json). */
export function hdl(text, file = 'src/counter4.v', extra = {}) {
  return { project: { name: 'student', top: 'counter4', files: [{ path: file, lang: /\.vhd$/.test(file) ? 'vhdl' : 'verilog', role: 'design' }], ...extra.project }, files: { [file]: text, ...extra.files } };
}

// ---------------------------------------------------------------- the traffic example's state machine
const TRAFFIC = path.join(ROOT, 'examples/traffic');
export const TRAFFIC_FSM = fs.readFileSync(path.join(TRAFFIC, 'src/traffic.fsm.json'), 'utf8');
export const TRAFFIC_VHD = fs.readFileSync(path.join(TRAFFIC, 'src/traffic.vhd'), 'utf8');
export const TRAFFIC_PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'rst', dir: 'in', width: 1 }, { name: 'req', dir: 'in', width: 1 },
  { name: 'done', dir: 'in', width: 1 }, { name: 'night', dir: 'in', width: 1 }, { name: 'phase', dir: 'out', width: 3 }];

export function trafficExercise(extra = {}) {
  return {
    silinxExercise: 1, id: 'traffic', title: { en: 'Traffic lights', pt: 'Semáforos' }, top: 'traffic', ports: TRAFFIC_PORTS,
    reference: { files: [{ path: 'ref/traffic.vhd', text: TRAFFIC_VHD }] },
    tests: [{ id: 'random', visible: true, points: 10, kind: 'reference', clock: 'clk', cycles: 200, seed: 3, hold: { rst: ['1'] }, fixed: { rst: '0' } }],
    ...extra,
  };
}

/** The traffic state machine drawn (its HDL file made from it again), edited by `edit` (the parsed drawing). */
export function drawing(edit = m => m) {
  const m = edit(JSON.parse(TRAFFIC_FSM));
  return { project: { name: 'student', top: 'traffic', files: [{ path: 'src/traffic.vhd', lang: 'vhdl', role: 'design' }] },
    files: { 'src/traffic.fsm.json': JSON.stringify(m), 'src/traffic.vhd': '-- stale: made again from the drawing\n' } };
}
