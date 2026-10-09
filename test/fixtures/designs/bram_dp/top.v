// Dual-port block RAMs inferred by XST (Verilog):
//   tdp : 1024 x 16 true dual port, both ports write; port A READ_FIRST, port B WRITE_FIRST
//   sdp :  512 x 32 simple dual port (write through A's address, synchronous read through B's)
module top (
    input  wire        clk,
    input  wire        en_a,
    input  wire        en_b,
    input  wire        we_a,
    input  wire        we_b,
    input  wire        we_s,
    input  wire [9:0]  addr_a,
    input  wire [9:0]  addr_b,
    input  wire [15:0] di_a,
    input  wire [15:0] di_b,
    output reg  [15:0] do_a,
    output reg  [15:0] do_b,
    output reg  [31:0] do_s
);
    (* ram_style = "block" *) reg [15:0] tdp [0:1023];
    (* ram_style = "block" *) reg [31:0] sdp [0:511];

    integer i;
    initial begin
        for (i = 0; i < 1024; i = i + 1) tdp[i] = i * 3;
        for (i = 0; i < 512; i = i + 1) sdp[i] = 32'h0;
        do_a = 16'h0;
        do_b = 16'h0;
        do_s = 32'h0;
    end

    // port A: read first
    always @(posedge clk) begin
        if (en_a) begin
            if (we_a) tdp[addr_a] <= di_a;
            do_a <= tdp[addr_a];
        end
    end

    // port B: write first
    always @(posedge clk) begin
        if (en_b) begin
            if (we_b) begin
                tdp[addr_b] <= di_b;
                do_b <= di_b;
            end else
                do_b <= tdp[addr_b];
        end
    end

    // simple dual port, 32 bits
    always @(posedge clk) begin
        if (we_s) sdp[addr_a[8:0]] <= {di_b, di_a};
        do_s <= sdp[addr_b[8:0]];
    end
endmodule
