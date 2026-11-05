// An HLS module with an RTL blackbox on a board (#2341): mac (mac.cpp, its HDL generated in Verilog) calls adder_rtl, a
// VHDL module; the switches added to the last result (the larger of the sum, modulo 256, and the switches), on the LEDs.
module bb_top(input clk, input [7:0] sw, output [7:0] led);
  reg [1:0] boot = 2'b00;
  reg [7:0] a = 8'd0, result = 8'd0;
  wire rst = boot != 2'b11;
  wire [7:0] s;
  wire s_vld, done, idle, ready;
  reg start = 1'b0;
  always @(posedge clk) begin
    if (boot != 2'b11) boot <= boot + 2'd1;
    a <= sw;
    start <= idle;                        // a call started each time the module is idle
    if (s_vld && done && ready) result <= s;
  end

  mac hls(.ap_clk(clk), .ap_rst(rst), .ap_start(start), .ap_done(done), .ap_idle(idle), .ap_ready(ready),
          .a(a), .b(result), .s(s), .s_ap_vld(s_vld));

  assign led = result;
endmodule
