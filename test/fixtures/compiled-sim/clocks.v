// Silinx test design (compiled simulator, #384): clocks other than the main one: a counter bit used
// as a clock, a ripple counter, a clock on an input (a button), a gated and an inverted clock.
module clocks (
    input  wire       clk, bclk, en,
    input  wire [3:0] d,
    output reg  [3:0] div, slow, man, gated, inv,
    output wire [3:0] ripple
);
    always @(posedge clk) div <= div + 1;
    always @(posedge div[1]) slow <= slow + d;
    always @(posedge bclk) man <= man + 1;
    wire gclk = clk & en;
    always @(posedge gclk) gated <= gated + d;
    wire nclk = ~clk;
    always @(posedge nclk) inv <= inv ^ d;
    reg [3:0] r = 4'b0000;
    always @(negedge clk) r[0] <= ~r[0];
    genvar i;
    generate for (i = 1; i < 4; i = i + 1) begin : g
        always @(negedge r[i-1]) r[i] <= ~r[i];
    end endgenerate
    assign ripple = r;
endmodule
