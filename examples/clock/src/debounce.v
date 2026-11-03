// Silinx example (clock): a push button made clean. The button is synchronised to the clock (two
// flip-flops), must then stay at its new level for STABLE clock cycles to be taken (a mechanical
// button bounces for a few milliseconds), and `press` is high for one clock cycle when it goes down.
module debounce #(
    parameter STABLE = 1000000                // 20 ms at 50 MHz (at most 2**20)
) (
    input  wire clk,
    input  wire btn,                          // the raw button (high while pressed)
    output reg  press                         // one clock cycle per press
);
    reg [1:0]  sync = 2'b00;
    reg        level = 1'b0;
    reg [19:0] count = 20'd0;

    always @(posedge clk) begin
        sync  <= {sync[0], btn};
        press <= 1'b0;
        if (sync[1] == level)
            count <= 20'd0;
        else if (count == STABLE - 1) begin
            count <= 20'd0;
            level <= sync[1];
            press <= sync[1];                 // pressed, not released
        end else
            count <= count + 20'd1;
    end
endmodule
