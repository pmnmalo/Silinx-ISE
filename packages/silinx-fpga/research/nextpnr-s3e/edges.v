// #2457: the cells Silinx's engine took and the nextpnr engine refused - falling-edge flip-flops, latches, clock switches
module edges(input clk, input clk2, input [7:0] sw, input [3:0] btn, output [7:0] led);
  wire mclk, c2, q7;
  FDRE_1 u0(.C(clk), .CE(sw[0]), .R(btn[0]), .D(sw[1]), .Q(led[0]));
  FDPE_1 u1(.C(clk), .CE(1'b1), .PRE(btn[1]), .D(led[0] ^ sw[2]), .Q(led[1]));
  LDCE   u2(.G(sw[3]), .GE(sw[4]), .CLR(btn[2]), .D(sw[1]), .Q(led[2]));
  LDPE_1 u3(.G(sw[5]), .GE(1'b1), .PRE(btn[3]), .D(sw[2]), .Q(led[3]));
  FDCE_1 u4(.C(clk), .CE(1'b1), .CLR(1'b0), .D(sw[6] ^ sw[5]), .Q(led[4]));   // in led[4]'s IOB (the UCF): an output register on the falling edge
  BUFGMUX_1 m1(.I0(clk), .I1(clk2), .S(sw[7]), .O(mclk));
  FDRE   u5(.C(mclk), .CE(1'b1), .R(1'b0), .D(sw[1]), .Q(led[5]));
  BUFGMUX m2(.I0(clk2), .I1(clk), .S(1'b0), .O(c2));                     // its select a constant: a BUFG of clk2
  FDRE_1 u6(.C(c2), .CE(1'b1), .R(1'b0), .D(sw[2]), .Q(led[6]));
  FDSE_1 u7(.C(clk), .CE(1'b1), .S(btn[0]), .D(sw[0]), .Q(q7));          // in sw[0]'s IOB: an input register on the falling edge
  assign led[7] = q7 ^ sw[4];
endmodule
(* blackbox *) module FDRE_1(input C, CE, R, D, output Q); endmodule
(* blackbox *) module FDPE_1(input C, CE, PRE, D, output Q); endmodule
(* blackbox *) module FDCE_1(input C, CE, CLR, D, output Q); endmodule
(* blackbox *) module FDSE_1(input C, CE, S, D, output Q); endmodule
(* blackbox *) module FDRE(input C, CE, R, D, output Q); endmodule
(* blackbox *) module LDCE(input G, GE, CLR, D, output Q); endmodule
(* blackbox *) module LDPE_1(input G, GE, PRE, D, output Q); endmodule
(* blackbox *) module BUFGMUX(input I0, I1, S, output O); endmodule
(* blackbox *) module BUFGMUX_1(input I0, I1, S, output O); endmodule
