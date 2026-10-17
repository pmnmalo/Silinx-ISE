// Silinx test design (compiled simulator, #384): flip-flops with synchronous and asynchronous resets,
// enables, asynchronous set / clear, a falling-edge register and a latch.
module regs (
    input  wire       clk, rst, arst, en, set, clr,
    input  wire [7:0] d,
    output reg  [7:0] q_sync, q_async, q_en, q_aen,
    output reg  [3:0] q_sr,
    output reg        q_neg,
    output reg  [7:0] lat,
    output reg  [39:0] q_wide
);
    always @(posedge clk)
        if (rst) q_sync <= 8'h5A; else if (en) q_sync <= d;
    always @(posedge clk or posedge arst)
        if (arst) q_async <= 8'h3C; else q_async <= q_async + d;
    always @(posedge clk)
        if (en) begin if (rst) q_en <= 8'h00; else q_en <= q_en ^ d; end
    always @(posedge clk or negedge arst)
        if (!arst) q_aen <= 8'h81; else if (en) q_aen <= {q_aen[6:0], d[0]};
    always @(posedge clk or posedge set or posedge clr)
        if (clr) q_sr <= 4'h0; else if (set) q_sr <= 4'hF; else q_sr <= d[3:0];
    always @(negedge clk)
        q_neg <= d[0] ^ q_neg;
    always @*
        if (en) lat = d ^ q_sync;
    always @(posedge clk or posedge arst)
        if (arst) q_wide <= 40'h12_3456_789A; else q_wide <= {q_wide[38:0], q_wide[39] ^ d[1]};
endmodule
