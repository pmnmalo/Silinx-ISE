// The constants Silinx's engine routes and the nextpnr engine took a LUT each (#2797): a sum's carry in at 0 (through BX),
// two pads at 0 and 1, two flip-flops' D at 0 and 1; and a register with an active-low reset and enable (the synthesis's
// inverters on R and CE: the slice's SRINV / CEINV, as Silinx's packer takes them).
module consts (input clk, input rst_n, input en_n, input [3:0] sw, output [7:0] led);
  reg [7:0] acc = 0;
  reg [3:0] r = 0;
  wire q0, q1;
  always @(posedge clk) acc <= acc + {sw, sw};
  always @(posedge clk)
    if (!rst_n) r <= 0;
    else if (!en_n) r <= {r[2:0], sw[0] ^ acc[0]};
  FDSE u0 (.C(clk), .CE(sw[0]), .S(sw[1]), .D(1'b0), .Q(q0));
  FDRE u1 (.C(clk), .CE(sw[2]), .R(sw[3]), .D(1'b1), .Q(q1));
  assign led = {acc[7:6], r[3], r[2], q0 & q1, 1'b1, 1'b0, acc[4]};
endmodule
(* blackbox *) module FDSE(input C, CE, S, D, output Q); endmodule
(* blackbox *) module FDRE(input C, CE, R, D, output Q); endmodule
