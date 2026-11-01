// A RAM64X1S (#2218): nextpnr's netlist lowers it to two RAM32X1S and a LUT, as Silinx's packer does. Read directly and through a flip-flop.
module ram64 (input clk, input [7:0] sw, output [1:0] led);
  wire ck, ckb, we, d, o, q;
  wire [5:0] a;
  IBUFG u_clk (.I(clk), .O(ckb));
  BUFG u_b (.I(ckb), .O(ck));
  IBUF u_a0 (.I(sw[0]), .O(a[0]));
  IBUF u_a1 (.I(sw[1]), .O(a[1]));
  IBUF u_a2 (.I(sw[2]), .O(a[2]));
  IBUF u_a3 (.I(sw[3]), .O(a[3]));
  IBUF u_a4 (.I(sw[4]), .O(a[4]));
  IBUF u_a5 (.I(sw[5]), .O(a[5]));
  IBUF u_d (.I(sw[6]), .O(d));
  IBUF u_we (.I(sw[7]), .O(we));
  RAM64X1S #(.INIT(64'h0123456789ABCDEF)) u_ram (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .A4(a[4]), .A5(a[5]), .D(d), .WE(we), .WCLK(ck), .O(o));
  FD u_q (.C(ck), .D(o), .Q(q));
  OBUF u_l0 (.I(o), .O(led[0]));
  OBUF u_l1 (.I(q), .O(led[1]));
endmodule
