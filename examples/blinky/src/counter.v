`timescale 1ns / 1ps
// Free-running prescaler: pulses `tick` once every DIV clock cycles.
module prescaler #(parameter DIV = 25_000_000) (
    input  wire clk,
    input  wire rst,
    output reg  tick
);
    // counter width = ceil(log2(DIV)), as a constant function (XST does not support $clog2)
    function integer clog2(input integer value);
        integer v;
        begin
            v = value - 1;
            for (clog2 = 0; v > 0; clog2 = clog2 + 1) v = v >> 1;
        end
    endfunction
    localparam W = clog2(DIV);
    reg [W-1:0] cnt;

    always @(posedge clk) begin
        if (rst) begin
            cnt  <= 0;
            tick <= 1'b0;
        end else if (cnt == DIV - 1) begin
            cnt  <= 0;
            tick <= 1'b1;
        end else begin
            cnt  <= cnt + 1'b1;
            tick <= 1'b0;
        end
    end
endmodule
