// Silinx test design (compiled simulator, #384): the cells Yosys makes from Verilog read directly
// (with opt_dff), not from Silinx's synthesis Verilog: indexed part selects ($shiftx), an array of
// wires ($bmux), a decoder ($demux), <<< ($sshl), === ($eqx), enables and synchronous resets
// ($dffe, $sdff, $sdffe, $sdffce, $adffe), an asynchronous load ($aldff), a memory read port with a
// synchronous reset and an enable, reset over enable and enable over reset.
module cells (
    input  wire        clk, rst, en, load,
    input  wire [31:0] a,
    input  wire [7:0]  b,
    input  wire [3:0]  i,
    input  wire [39:0] w,
    output wire [3:0]  part, part_w,
    output wire [7:0]  pick, pick_w,
    output reg  [15:0] dec,
    output wire [31:0] sshl,
    output wire        same,
    output reg  [7:0]  q_e, q_s, q_se, q_sce, q_ae, q_al, m_q, m_qce
);
    assign part = a[i*2 +: 4];
    assign part_w = w[i*3 +: 4];
    wire [7:0] words [0:7];
    genvar k;
    generate for (k = 0; k < 8; k = k + 1) begin : g
        assign words[k] = a[k*4 +: 8] ^ k;
    end endgenerate
    assign pick = words[i[2:0]];
    wire [7:0] wwords [0:3];
    assign wwords[0] = w[7:0]; assign wwords[1] = w[17:10]; assign wwords[2] = w[39:32]; assign wwords[3] = b;
    assign pick_w = wwords[i[1:0]];
    always @* begin dec = 16'h0; dec[i] = en; end
    assign sshl = $signed(a) <<< i;
    assign same = (a[7:0] === b);
    always @(posedge clk) if (en) q_e <= b;
    always @(posedge clk) if (rst) q_s <= 8'hC3; else q_s <= q_s + b;
    always @(posedge clk) if (rst) q_se <= 8'h11; else if (en) q_se <= q_se ^ b;
    always @(posedge clk) if (en) begin if (rst) q_sce <= 8'h22; else q_sce <= q_sce - b; end
    always @(posedge clk or posedge rst) if (rst) q_ae <= 8'h33; else if (en) q_ae <= b;
    always @(posedge clk or posedge load) if (load) q_al <= a[7:0]; else q_al <= q_al + 1;
    reg [7:0] mem [0:15];
    always @(posedge clk) begin
        if (load) mem[i] <= b ^ a[7:0];
        if (rst) m_q <= 8'h5C; else if (en) m_q <= mem[a[3:0]];
        if (en) begin if (rst) m_qce <= 8'hE1; else m_qce <= mem[b[3:0]]; end
    end
endmodule
