// Silinx design corpus: testbench of serv_basys2 (SERV running the LED counter) with a short delay
// loop (addi x3, x0, 3 instead of lui x3, 0x80): the LEDs must count 1, 2, 3, 4. Part of Silinx
// (AGPL-3.0-only).
`timescale 1ns / 1ps
module serv_basys2_tb;
  reg clk = 0;
  reg reset = 1'b1;
  wire [7:0] led;
  integer n = 0;
  serv_basys2 #(.DELAY_INSN(32'h00300193)) dut (.mclk(clk), .reset(reset), .led(led));
  always #10 clk = ~clk;
  initial begin
    #200 reset = 1'b0;
    #2000000 $display("FAIL: the LEDs counted to %0d only", led);
    $finish;
  end
  always @(led) if (led !== 8'h00) begin
    n = n + 1;
    if (led !== n[7:0]) begin $display("FAIL: LEDs %0d, expected %0d", led, n); $finish; end
    if (n == 4) begin $display("PASS: the LEDs counted 1, 2, 3, 4"); $finish; end
  end
endmodule
