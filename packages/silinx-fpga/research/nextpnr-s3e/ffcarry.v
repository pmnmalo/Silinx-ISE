// Flip-flops alone in the slices of carry chains (#2223): an 8-bit counter (its sums into its own flip-flops), two
// comparators and a difference on shift registers read whole (flip-flops alone, D from another flip-flop: into the chains'
// free places, through BX / BY), one of them loaded with an enable (another control set: not beside the others). The
// difference's carry in is a 1, through BX from the CLB's VCC site.
module ffcarry (input clk, input [7:0] sw, output [3:0] led);
  reg [7:0] cnt = 0, a = 0, b = 0, r = 0, dif = 0;
  reg ge = 0, gr = 0;
  always @(posedge clk) begin
    cnt <= cnt + 1;
    a <= {a[6:0], sw[0]};
    b <= {b[6:0], sw[1]};
    if (sw[3]) r <= a;
    ge <= a >= b;
    gr <= r >= cnt;
    dif <= a - b;
  end
  assign led = {ge, gr, cnt[7], dif[7]};
endmodule
