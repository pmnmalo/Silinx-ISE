// A small memory's constant inputs (#2940): a 4-word FIFO's memory, as iwls05-sasc's (the synthesis maps it to eight
// RAM16X1D with A2, A3, DPRA2 and DPRA3 at 0), and a shift register of a fixed length (an SRL16E with its A constant).
module memconsts (input clk, input we, input [1:0] wa, input [1:0] ra, input [7:0] d, input s, output reg [7:0] q, output t);
  reg [7:0] mem [0:3];
  reg [5:0] sh = 0;
  always @(posedge clk) begin
    if (we) mem[wa] <= d;
    q <= mem[ra];
    sh <= {sh[4:0], s};
  end
  assign t = sh[5];
endmodule
