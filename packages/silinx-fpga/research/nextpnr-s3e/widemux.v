// MUXF7 and MUXF8 (#2190): the trees instantiated (the synthesis keeps its own only when they beat its other mappings).
// A 16:1 multiplexer (F5s, F6s, F7s, an F8) into a flip-flop, an 8:1 (an F7 on top) to a flip-flop and a pad through a LUT, and
// a MUXF7 whose inputs are no F6s, which becomes a LUT.
module widemux (input clk, input [7:0] sw, output reg [3:0] led);
  reg [15:0] d = 16'h1234;
  reg [7:0] e = 8'h5a;
  reg [3:0] s = 0;
  wire ck;
  BUFG u_b (.I(clk), .O(ck));
  wire [7:0] f5; wire [3:0] f6; wire [1:0] f7; wire f8, g7, h7;
  wire [3:0] g5; wire [1:0] g6;
  genvar i;
  generate
    for (i = 0; i < 8; i = i + 1) begin : m5
      MUXF5 u (.I0(d[2 * i]), .I1(d[2 * i + 1]), .S(s[0]), .O(f5[i]));
    end
    for (i = 0; i < 4; i = i + 1) begin : m6
      MUXF6 u (.I0(f5[2 * i]), .I1(f5[2 * i + 1]), .S(s[1]), .O(f6[i]));
    end
    for (i = 0; i < 2; i = i + 1) begin : m7
      MUXF7 u (.I0(f6[2 * i]), .I1(f6[2 * i + 1]), .S(s[2]), .O(f7[i]));
    end
    for (i = 0; i < 4; i = i + 1) begin : n5
      MUXF5 u (.I0(e[2 * i]), .I1(e[2 * i + 1]), .S(s[0]), .O(g5[i]));
    end
    for (i = 0; i < 2; i = i + 1) begin : n6
      MUXF6 u (.I0(g5[2 * i]), .I1(g5[2 * i + 1]), .S(s[1]), .O(g6[i]));
    end
  endgenerate
  MUXF8 u_f8 (.I0(f7[0]), .I1(f7[1]), .S(s[3]), .O(f8));
  MUXF7 u_g7 (.I0(g6[0]), .I1(g6[1]), .S(s[2]), .O(g7));
  MUXF7 u_h7 (.I0(sw[2]), .I1(sw[3]), .S(s[3]), .O(h7));
  always @(posedge ck) begin
    d <= {d[14:0], sw[0] ^ d[15]};
    e <= {e[6:0], sw[1] ^ e[7]};
    s <= sw[7:4];
    led <= {h7, g7 ^ sw[2], g7, f8};
  end
endmodule
