// Small state machines (Verilog), extracted and re-encoded by XST:
//   det : Mealy detector of the sequence 1101 on x (overlapping), synchronous reset
//   tl  : Moore traffic-light style controller with a timer, outputs decoded from the state
module top (
    input  wire       clk,
    input  wire       rst,
    input  wire       x,
    input  wire       go,
    output reg        found,
    output reg  [2:0] light,
    output wire [1:0] phase
);
    localparam S0 = 3'd0, S1 = 3'd1, S11 = 3'd2, S110 = 3'd3;
    reg [2:0] st = S0;

    always @(posedge clk) begin
        if (rst) begin
            st <= S0;
            found <= 1'b0;
        end else begin
            found <= 1'b0;
            case (st)
                S0:   st <= x ? S1 : S0;
                S1:   st <= x ? S11 : S0;
                S11:  st <= x ? S11 : S110;
                S110: begin
                    if (x) begin found <= 1'b1; st <= S1; end
                    else st <= S0;
                end
                default: st <= S0;
            endcase
        end
    end

    localparam RED = 2'd0, GREEN = 2'd1, YELLOW = 2'd2, WAIT = 2'd3;
    reg [1:0] tl = RED;
    reg [2:0] timer = 3'd0;
    initial found = 1'b0;

    always @(posedge clk) begin
        if (rst) begin
            tl <= RED;
            timer <= 3'd0;
        end else begin
            timer <= timer + 1'b1;
            case (tl)
                RED:    if (go) begin tl <= GREEN; timer <= 3'd0; end
                GREEN:  if (timer == 3'd5) begin tl <= YELLOW; timer <= 3'd0; end
                YELLOW: if (timer == 3'd2) begin tl <= WAIT; timer <= 3'd0; end
                WAIT:   if (timer == 3'd3) begin tl <= RED; timer <= 3'd0; end
            endcase
        end
    end

    always @(*) begin
        case (tl)
            RED:     light = 3'b100;
            GREEN:   light = 3'b001;
            YELLOW:  light = 3'b010;
            default: light = 3'b110;
        endcase
    end
    assign phase = tl;
endmodule
