// Carry-chain arithmetic (Verilog): registered 16-bit adder / subtractor with carry in and carry out,
// combinational comparators (unsigned and signed less-than, equality) and a 12-bit accumulator.
module top (
    input  wire        clk,
    input  wire        sub,
    input  wire        cin,
    input  wire        acc_en,
    input  wire [15:0] a,
    input  wire [15:0] b,
    output reg  [16:0] s,
    output wire        ltu,
    output wire        lts,
    output wire        eq,
    output reg  [11:0] acc
);
    initial begin
        s = 17'd0;
        acc = 12'd0;
    end

    always @(posedge clk) begin
        if (sub) s <= {1'b0, a} - {1'b0, b};
        else     s <= {1'b0, a} + {1'b0, b} + cin;
        if (acc_en) acc <= acc + a[11:0];
    end

    assign ltu = a < b;
    assign lts = $signed(a) < $signed(b);
    assign eq  = a == b;
endmodule
