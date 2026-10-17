// Silinx test design (compiled simulator, #384): memories: a RAM with a synchronous (read-first) and an
// asynchronous read port, a RAM read through a registered address (write-first), a ROM with initial
// contents, a RAM of 40-bit words, a RAM read into a register with a synchronous reset and an enable.
module mems (
    input  wire       clk, we, we2, rst, en,
    input  wire [3:0] wa, ra,
    input  wire [7:0] wd,
    output reg  [7:0] rd_sync,
    output wire [7:0] rd_async, rd_wf,
    output reg  [7:0] rom_q,
    output reg  [39:0] wide_q,
    output reg  [7:0] rst_q
);
    reg [7:0] ram [0:15];
    always @(posedge clk) begin
        if (we) ram[wa] <= wd;
        rd_sync <= ram[ra];
    end
    assign rd_async = ram[ra ^ 4'h5];
    reg [7:0] ram2 [0:15];
    reg [3:0] ra2;
    always @(posedge clk) begin
        if (we2) ram2[wa] <= wd ^ 8'hFF;
        ra2 <= ra;
    end
    assign rd_wf = ram2[ra2];
    reg [7:0] rom [0:15];
    integer k;
    initial for (k = 0; k < 16; k = k + 1) rom[k] = k * 37 + 11;
    always @(posedge clk) rom_q <= rom[ra];
    reg [39:0] wide [0:7];
    always @(posedge clk) begin
        if (we) wide[wa[2:0]] <= {wd, wd ^ 8'h55, wd, 8'h0F, wd};
        wide_q <= wide[ra[2:0]];
    end
    reg [7:0] ram3 [0:15];
    always @(posedge clk) begin
        if (we2) ram3[ra] <= wd + 8'd3;
        if (rst) rst_q <= 8'h96; else if (en) rst_q <= ram3[wa];
    end
endmodule
