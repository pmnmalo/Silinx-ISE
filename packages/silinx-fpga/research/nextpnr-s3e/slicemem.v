// The SLICEM's memories (#2191): two RAM16X1S on one address, a RAM16X1D, a RAM32X1S, an SRL16E with an enable, an SRL16 always
// shifting into a flip-flop, two SRL16E in a cascade (the first read at its last stage), four SRLC16E through Q15, an SRL16E_1 on the falling edge.
module slicemem (input clk, input [7:0] sw, output reg [7:0] led);
  wire ck;
  BUFG u_b (.I(clk), .O(ck));
  reg [4:0] a = 0;
  reg [4:0] r = 0;
  always @(posedge ck) begin a <= a + 1; r <= {sw[7:4], sw[0]}; end
  wire s0, s1, spo, dpo, r32, q1, q2, q3, q3b, c0, c1, c2, c3, k0, k1, k2;
  reg q2f = 0;
  RAM16X1S #(.INIT(16'h1234)) u_s0 (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .D(sw[0]), .WE(sw[1]), .WCLK(ck), .O(s0));
  RAM16X1S #(.INIT(16'hA5A5)) u_s1 (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .D(sw[2]), .WE(sw[1]), .WCLK(ck), .O(s1));
  RAM16X1D #(.INIT(16'h0FF0)) u_d (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .DPRA0(r[0]), .DPRA1(r[1]), .DPRA2(r[2]), .DPRA3(r[3]), .D(sw[3]), .WE(sw[1]), .WCLK(ck), .SPO(spo), .DPO(dpo));
  RAM32X1S #(.INIT(32'hDEADBEEF)) u_32 (.A0(a[0]), .A1(a[1]), .A2(a[2]), .A3(a[3]), .A4(a[4]), .D(sw[4]), .WE(sw[1]), .WCLK(ck), .O(r32));
  SRL16E #(.INIT(16'h8001)) u_e (.A0(r[0]), .A1(r[1]), .A2(r[2]), .A3(r[3]), .CE(sw[5]), .CLK(ck), .D(sw[6]), .Q(q1));
  SRL16 #(.INIT(16'h00FF)) u_a (.A0(r[1]), .A1(r[2]), .A2(r[3]), .A3(r[4]), .CLK(ck), .D(sw[7]), .Q(q2));
  always @(posedge ck) q2f <= q2;
  SRL16E #(.INIT(16'h0003)) u_c0 (.A0(1'b1), .A1(1'b1), .A2(1'b1), .A3(1'b1), .CE(sw[2]), .CLK(ck), .D(sw[3]), .Q(q3));
  SRL16E #(.INIT(16'h0300)) u_c1 (.A0(r[0]), .A1(r[2]), .A2(r[1]), .A3(r[3]), .CE(sw[2]), .CLK(ck), .D(q3), .Q(q3b));
  SRLC16E #(.INIT(16'h1111)) u_k0 (.A0(r[0]), .A1(r[1]), .A2(r[2]), .A3(r[3]), .CE(sw[4]), .CLK(ck), .D(sw[5]), .Q(c0), .Q15(k0));
  SRLC16E #(.INIT(16'h2222)) u_k1 (.A0(r[1]), .A1(r[2]), .A2(r[3]), .A3(r[0]), .CE(sw[4]), .CLK(ck), .D(k0), .Q(c1), .Q15(k1));
  SRLC16E #(.INIT(16'h4444)) u_k2 (.A0(r[2]), .A1(r[3]), .A2(r[0]), .A3(r[1]), .CE(sw[4]), .CLK(ck), .D(k1), .Q(c2), .Q15(k2));
  SRLC16E #(.INIT(16'h8888)) u_k3 (.A0(r[3]), .A1(r[0]), .A2(r[1]), .A3(r[2]), .CE(sw[4]), .CLK(ck), .D(k2), .Q(c3));
  wire qn;
  SRL16E_1 #(.INIT(16'h0F0F)) u_n (.A0(a[1]), .A1(a[2]), .A2(a[3]), .A3(a[4]), .CE(sw[6]), .CLK(ck), .D(sw[0]), .Q(qn));
  always @(posedge ck) led <= {s0 ^ s1, spo, dpo, r32, q1 ^ q2f, q3b ^ qn, c0 ^ c1, c2 ^ c3};
endmodule
