// Silinx design corpus, Basys2 board top: the EPFL benchmark int2float (an 11-bit integer to a
// 7-bit float: 3-bit exponent, 4-bit mantissa), fetched, never committed. Part of Silinx
// (AGPL-3.0-only).
//   integer = {BTN2, BTN1, BTN0, SW7..SW0}
//   LD3..LD0 = mantissa, LD6..LD4 = exponent, LD7 = 1 (the board is configured)
module int2float_basys2 (input wire [7:0] sw, input wire [2:0] btn, output wire [7:0] led);
  wire [10:0] b = {btn, sw};
  top conv (
    .\B[0] (b[0]), .\B[1] (b[1]), .\B[2] (b[2]), .\B[3] (b[3]), .\B[4] (b[4]), .\B[5] (b[5]),
    .\B[6] (b[6]), .\B[7] (b[7]), .\B[8] (b[8]), .\B[9] (b[9]), .\B[10] (b[10]),
    .\M[0] (led[0]), .\M[1] (led[1]), .\M[2] (led[2]), .\M[3] (led[3]),
    .\E[0] (led[4]), .\E[1] (led[5]), .\E[2] (led[6]));
  assign led[7] = 1'b1;
endmodule
