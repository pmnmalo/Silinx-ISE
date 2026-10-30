// 16:1 multiplexer (MUXF5 / MUXF6) beside an 8-stage shift register: flip-flops fed by flip-flops
// (D through BX / BY), which the packer puts into the free slots of the multiplexer's slices
module srmux(input clk, input din, input [15:0] d, input [3:0] s, output y, output q);
  reg [7:0] sr = 8'h00;
  always @(posedge clk) sr <= {sr[6:0], din};
  assign y = d[s];
  assign q = sr[7];
endmodule
