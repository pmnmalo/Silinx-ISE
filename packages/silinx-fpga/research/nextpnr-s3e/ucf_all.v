// The UCF beyond LOC (#2195): two clocks with a PERIOD each, an input nothing reads, the pads' IOSTANDARD, DRIVE, SLEW and
// pulls (test/fixtures/nextpnr-engine/ucf_all.ucf), a tristate output with a pull-down.
module ucf_all (input clk, input clk2, input [2:0] sw, input unused, output reg [3:0] led, output led2);
  wire ck, ck2;
  reg r2 = 1'b0;
  BUFG u1 (.I(clk), .O(ck));
  BUFG u2 (.I(clk2), .O(ck2));
  always @(posedge ck) led <= {led[2:0], sw[0] ^ sw[1]};
  always @(posedge ck2) r2 <= sw[2] ^ r2;
  assign led2 = sw[1] ? r2 : 1'bz;
endmodule
