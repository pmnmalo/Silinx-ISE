// Silinx test design (compiled simulator, #384): the word-level operators at the widths where the
// compiled code changes (1, 8, 16, 32: numbers; 33, 64: BigInts), unsigned and signed.
module ops (
    input  wire        clk,
    input  wire [31:0] a, b,
    input  wire [32:0] c,
    input  wire [63:0] d, e,
    input  wire [7:0]  s8,
    input  wire [5:0]  sh,
    output wire [31:0] add32, sub32, mul32, and32, or32, xnor32, not32,
    output wire [32:0] add33, mul33,
    output wire [63:0] add64, sub64, mul64, neg64,
    output wire signed [15:0] sdiv, smod,
    output wire [15:0] udiv, umod,
    output wire        lt_s, lt_u, ge_s, le_u, gt_s, eq64, ne33, lt64s,
    output wire        rand_, ror_, rxor, rxnor, lnot, land, lor,
    output wire [31:0] shl, shr, sshr, shl_big,
    output wire [63:0] shl64, sshr64, shr64,
    output wire [3:0]  part,
    output wire        bitsel,
    output wire [7:0]  sel, arr,
    output reg  [31:0] acc32,
    output reg  [63:0] acc64,
    output reg  [7:0]  st
);
    assign add32 = a + b;
    assign sub32 = a - b;
    assign mul32 = a * b;
    assign and32 = a & b;
    assign or32  = a | ~b;
    assign xnor32 = a ~^ b;
    assign not32 = ~a;
    assign add33 = c + {1'b0, a};
    assign mul33 = c * b[15:0];
    assign add64 = d + e;
    assign sub64 = d - e;
    assign mul64 = d * e;
    assign neg64 = -d;
    assign sdiv = $signed(a[15:0]) / $signed(b[7:0]);
    assign smod = $signed(a[15:0]) % $signed(b[7:0]);
    assign udiv = a[15:0] / b[7:0];
    assign umod = a[15:0] % b[7:0];
    assign lt_s = $signed(a) < $signed(b);
    assign lt_u = a < b;
    assign ge_s = $signed(a[7:0]) >= $signed(b[15:0]);
    assign le_u = a[7:0] <= b[15:0];
    assign gt_s = $signed(c) > $signed({1'b0, b});
    assign eq64 = d == e || d[7:0] == e[7:0];
    assign ne33 = c != {a[0], b};
    assign lt64s = $signed(d) < $signed(e);
    assign rand_ = &a[3:0];
    assign ror_ = |d;
    assign rxor = ^a;
    assign rxnor = ~^d;
    assign lnot = !a[2:0];
    assign land = a[1:0] && b[1:0];
    assign lor = a[1:0] || d[63:62];
    assign shl = a << sh;
    assign shr = a >> sh;
    assign sshr = $signed(a) >>> sh;
    assign shl_big = a << b[7:0];
    assign shl64 = d << sh;
    assign sshr64 = $signed(d) >>> sh;
    assign shr64 = d >> e[6:0];
    assign part = a[sh[4:0] +: 4];
    assign bitsel = d[sh];
    // a case (a $pmux) and an array of words indexed by a signal
    reg [7:0] t;
    always @* begin
        case (s8[2:0])
            3'd0: t = a[7:0];
            3'd1: t = b[7:0];
            3'd2, 3'd5: t = a[15:8] ^ b[15:8];
            3'd3: t = 8'hA5;
            default: t = s8;
        endcase
    end
    assign sel = t;
    wire [7:0] words [0:3];
    assign words[0] = a[7:0];
    assign words[1] = a[15:8];
    assign words[2] = b[7:0];
    assign words[3] = 8'h3C;
    assign arr = words[s8[1:0]];
    // registers: accumulators at 32 and 64 bits, a small state machine
    initial acc64 = 64'hFFFF_FFFF_FFFF_FFF0;
    always @(posedge clk) begin
        acc32 <= acc32 + a;
        acc64 <= acc64 + {32'h1, a} ^ e;
        case (st)
            8'd0: st <= s8[0] ? 8'd1 : 8'd0;
            8'd1: st <= s8[1] ? 8'd7 : 8'd2;
            8'd2: st <= 8'd0;
            default: st <= st - 1;
        endcase
    end
endmodule
