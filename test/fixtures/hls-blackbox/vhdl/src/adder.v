// the RTL blackbox of mac.cpp (adder.json): a + b, a clock cycle after ap_start
module adder_rtl(input ap_clk, input ap_rst, input ap_start, input [7:0] a, input [7:0] b,
                 output reg ap_done, output reg z_ap_vld, output reg [7:0] z);
  always @(posedge ap_clk)
    if (ap_rst) begin ap_done <= 1'b0; z_ap_vld <= 1'b0; z <= 8'd0; end
    else begin ap_done <= ap_start; z_ap_vld <= ap_start; z <= a + b; end
endmodule
