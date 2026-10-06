`timescale 1ns/1ps
`define W 8
module counter #(parameter N = `W) (input wire clk, input rst, input en, output reg [N-1:0] q, output tc);
  assign tc = &q;
  always @(posedge clk or posedge rst)
    if (rst) q <= 0; else if (en) q <= q + 1'b1;
endmodule

module top(clk, led, x);
  input clk; output [7:0] led; output [3:0] x;
  wire t;
  counter #(.N(8)) u0 (.clk(clk), .rst(1'b0), .en(1'b1), .q(led), .tc(t));
  genvar i;
  generate for (i=0;i<4;i=i+1) begin : g
    and a1(x[i], led[i], t);
  end endgenerate
endmodule
