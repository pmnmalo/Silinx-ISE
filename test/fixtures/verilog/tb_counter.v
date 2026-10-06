`timescale 1ns/1ps
module tb;
  reg clk = 0, rst = 1, en = 0;
  wire [7:0] q; wire tc;
  counter #(.N(8)) dut(.clk(clk), .rst(rst), .en(en), .q(q), .tc(tc));
  always #5 clk = ~clk;
  integer i;
  initial begin
    #12 rst = 0; en = 1;
    repeat (10) @(posedge clk);
    #1 $display("q=%0d at %t", q, $time);
    if (q !== 8'd10) $display("FAIL"); else $display("PASS");
    $finish;
  end
endmodule
