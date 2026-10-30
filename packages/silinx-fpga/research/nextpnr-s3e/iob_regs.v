// IOB registers and DDR on one design (#2135): an input register (enable, reset), an output register, an output
// with an enable register, an IDDR2 and an ODDR2 on the global clock and its inverse.
module iob_regs (input clk, input [3:0] sw, input [1:0] btn, output [3:0] led);
  wire ck, ckn = ~ck;
  BUFG u_b (.I(clk), .O(ck));
  reg ra = 1'b0;
  reg rq = 1'b0;
  reg rz = 1'b0;
  reg rt = 1'b1;
  always @(posedge ck)
    if (btn[0]) begin ra <= 1'b0; rq <= 1'b0; rt <= 1'b1; rz <= 1'b0; end
    else if (sw[3]) begin ra <= sw[0]; rq <= ra ^ sw[1]; rt <= sw[2]; rz <= ra; end
  assign led[0] = rq;
  assign led[1] = rt ? 1'bz : rz;
  wire q0, q1;
  IDDR2 #(.DDR_ALIGNMENT("NONE"), .INIT_Q0(1'b0), .INIT_Q1(1'b1), .SRTYPE("SYNC"))
    u_i (.D(sw[1]), .C0(ck), .C1(ckn), .CE(btn[1]), .R(btn[0]), .S(1'b0), .Q0(q0), .Q1(q1));
  ODDR2 #(.DDR_ALIGNMENT("NONE"), .INIT(1'b0), .SRTYPE("SYNC"))
    u_o (.D0(q0), .D1(q1 ^ sw[2]), .C0(ck), .C1(ckn), .CE(btn[1]), .R(btn[0]), .S(1'b0), .Q(led[2]));
  assign led[3] = q0 ^ q1;
endmodule
