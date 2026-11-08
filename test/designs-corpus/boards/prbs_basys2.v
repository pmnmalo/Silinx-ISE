// Silinx design corpus, Basys2 board top: alexforencich's PRBS31 generator (verilog-lfsr,
// lfsr_prbs_gen, fetched, never committed) stepped about 3 times a second, its 8 output bits on
// the LEDs. Part of Silinx (AGPL-3.0-only).
//   LD7..LD0: a new pseudo-random pattern about 3 times a second (all on after a reset)
//   BTN0: reset (the sequence starts again: the same patterns in the same order)
//   SW0: freeze (while on, the pattern stays)
module prbs_basys2 (input wire mclk, input wire reset, input wire freeze, output wire [7:0] led);   // reset: BTN0, freeze: SW0
  reg [23:0] div = 0;
  reg tick = 0;
  always @(posedge mclk) begin
    div <= div + 1;
    tick <= &div & ~freeze;   // 50 MHz / 2^24: about 3 Hz
  end
  lfsr_prbs_gen #(.DATA_WIDTH(8)) prbs (.clk(mclk), .rst(reset), .enable(tick), .data_out(led));
endmodule
