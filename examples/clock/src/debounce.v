// Silinx example (clock): a push button made clean. The button is synchronised to the clock (two
// flip-flops), must then stay at its new level for STABLE clock cycles to be taken (a mechanical
// button bounces for a few milliseconds), and `press` is high for one clock cycle when it goes down.
module debounce #(
    parameter STABLE = 1000000                // 20 ms at 50 MHz
) (
    input  wire clk,
    input  wire btn,                          // the raw button (high while pressed)
    output reg  press                         // one clock cycle per press
);
    // the bits a count from 0 to n - 1 takes (at least one)
    function integer clog2(input integer n);
        integer x;
        begin
            x = n - 1;
            for (clog2 = 0; x > 0; clog2 = clog2 + 1) x = x >> 1;
            if (clog2 < 1) clog2 = 1;
        end
    endfunction

    reg [1:0]  sync = 2'b00;
    reg        level = 1'b0;
    reg [clog2(STABLE)-1:0] count = 0;

    always @(posedge clk) begin
        sync  <= {sync[0], btn};
        press <= 1'b0;
        if (sync[1] == level)
            count <= 0;
        else if (count == STABLE - 1) begin
            count <= 0;
            level <= sync[1];
            press <= sync[1];                 // pressed, not released
        end else
            count <= count + 1'b1;
    end
endmodule
