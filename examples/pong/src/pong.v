// Silinx example: LED Pong, a game for two players on the Basys2 / Nexys2 (and other boards: CLK_HZ, BTN_LOW, SW_LOW,
// AN_LOW).
// The ball is the lit LED. The right player has BTN0 (at LD0), the left player BTN3 (at LD7).
//   - the server's LED blinks: the server presses their button to serve;
//   - the ball runs along the LEDs; when it reaches your end LED, press your button to send it back
//     (each return makes it faster). Press too early and you are locked out: you lose the point;
//   - the score is on the display (left player on the left digit, right player on the right one);
//     the player who lost the point serves; the first to WIN points wins (their half of the LEDs
//     blinks); any button starts a new game.
//   BTN1 or BTN2: pause / go on (the middle digits show dashes). SW0: reset. SW1: fast start.
// The design: a state machine (serve, play, point, game over), the button debouncers
// (debounce.v) and the 7-segment display (sevenseg.v).
module pong #(
    parameter CLK_HZ   = 50000000,            // the board's clock, in Hz (50 MHz on the Basys2 / Nexys2)
    parameter TICK     = CLK_HZ / 8,          // clock cycles per ball step at the start (8 per second)
    parameter STABLE   = CLK_HZ / 50,         // button debounce (20 ms)
    parameter REFRESH  = CLK_HZ / 1000,       // display: cycles per digit (1 ms)
    parameter WIN      = 5,                   // points to win a game
    parameter BTN_LOW  = 0,                   // 1: the board's buttons read 0 when pressed
    parameter SW_LOW   = 0,                   // 1: the board's switches read 0 when on
    parameter AN_LOW   = 1                    // 1: the board's digit enables light a digit at 0
) (
    input  wire       clk,
    input  wire [1:0] sw,
    input  wire [3:0] btn,
    output reg  [7:0] led,
    output wire [6:0] seg,
    output wire [3:0] an,
    output wire       dp
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
    localparam W = clog2(TICK + 1);           // the bits of the step's counters (period: up to TICK)

    // the buttons and switches as 1 when pressed or on, whatever the board's level
    wire [3:0] btnOn = BTN_LOW ? ~btn : btn;
    wire [1:0] swOn  = SW_LOW ? ~sw : sw;

    localparam SERVE = 2'd0, PLAY = 2'd1, POINT = 2'd2, OVER = 2'd3;
    localparam RIGHT = 1'b0, LEFT = 1'b1;

    wire pressR, pressL, press1, press2;
    debounce #(.STABLE(STABLE)) dbR (.clk(clk), .btn(btnOn[0]), .press(pressR));
    debounce #(.STABLE(STABLE)) dbL (.clk(clk), .btn(btnOn[3]), .press(pressL));
    debounce #(.STABLE(STABLE)) db1 (.clk(clk), .btn(btnOn[1]), .press(press1));
    debounce #(.STABLE(STABLE)) db2 (.clk(clk), .btn(btnOn[2]), .press(press2));

    reg [1:0]  state = SERVE;
    reg [2:0]  pos = 3'd0;                    // the ball: LED 0 (right) .. 7 (left)
    reg        dir = LEFT;                    // where the ball goes
    reg [W-1:0] period = TICK;                // cycles per step now
    reg [W-1:0] timer = 0;
    reg [3:0]  scoreL = 4'd0, scoreR = 4'd0;
    reg        server = RIGHT, pointTo = RIGHT;
    reg        lockL = 1'b0, lockR = 1'b0;    // pressed too early in this rally
    reg [3:0]  hold = 4'd0;                   // steps left showing a point
    reg        paused = 1'b0;
    // a slow beat for blinking: one half-period every TICK cycles
    reg [W-1:0] beatCount = 0;
    reg        beat = 1'b0;

    wire [W-1:0] start  = swOn[1] ? TICK / 2 : TICK;
    wire [W-1:0] faster = period - (period >> 3);
    wire        step   = !paused && (timer == period - 1);

    always @(posedge clk) begin
        if (beatCount == TICK - 1) begin beatCount <= 0; beat <= ~beat; end
        else beatCount <= beatCount + 1'b1;
    end

    always @(posedge clk) begin
        if (swOn[0]) begin
            state <= SERVE; server <= RIGHT; pos <= 3'd0;
            scoreL <= 4'd0; scoreR <= 4'd0; timer <= 0; paused <= 1'b0;
        end else begin
            if (!paused) timer <= step ? 1'b0 : timer + 1'b1;
            if (state != PLAY) paused <= 1'b0;
            else if (press1 || press2) paused <= ~paused;
            case (state)
                SERVE: begin
                    pos <= (server == LEFT) ? 3'd7 : 3'd0;
                    if ((server == LEFT && pressL) || (server == RIGHT && pressR)) begin
                        state <= PLAY;
                        dir <= ~server;               // away from the server
                        period <= start;
                        timer <= 0;
                        lockL <= 1'b0; lockR <= 1'b0;
                    end
                end
                PLAY: if (!paused) begin
                    if (dir == LEFT && pressL && pos == 3'd7 && !lockL) begin
                        dir <= RIGHT; timer <= 0; lockL <= 1'b0; lockR <= 1'b0;
                        if (faster > TICK / 4) period <= faster;
                    end else if (dir == RIGHT && pressR && pos == 3'd0 && !lockR) begin
                        dir <= LEFT; timer <= 0; lockL <= 1'b0; lockR <= 1'b0;
                        if (faster > TICK / 4) period <= faster;
                    end else begin
                        if (dir == LEFT && pressL) lockL <= 1'b1;     // too early
                        if (dir == RIGHT && pressR) lockR <= 1'b1;
                        if (step) begin
                            if (dir == LEFT && pos == 3'd7) begin
                                state <= POINT; pointTo <= RIGHT; scoreR <= scoreR + 4'd1; hold <= 4'd8;
                            end else if (dir == RIGHT && pos == 3'd0) begin
                                state <= POINT; pointTo <= LEFT; scoreL <= scoreL + 4'd1; hold <= 4'd8;
                            end else
                                pos <= (dir == LEFT) ? pos + 3'd1 : pos - 3'd1;
                        end
                    end
                end
                POINT: begin
                    if (step) begin
                        if (hold == 4'd1) begin
                            if (scoreL == WIN || scoreR == WIN) state <= OVER;
                            else begin state <= SERVE; server <= ~pointTo; end
                        end
                        hold <= hold - 4'd1;
                    end
                end
                default: begin                // OVER
                    if (pressL || pressR) begin
                        state <= SERVE; server <= RIGHT; scoreL <= 4'd0; scoreR <= 4'd0;
                    end
                end
            endcase
        end
    end

    always @(*) begin
        case (state)
            SERVE:   led = beat ? (8'd1 << pos) : 8'd0;
            PLAY:    led = 8'd1 << pos;
            POINT:   led = (pointTo == LEFT) ? 8'hF0 : 8'h0F;
            default: led = beat ? ((scoreL == WIN) ? 8'hF0 : 8'h0F) : 8'd0;
        endcase
    end

    sevenseg #(.REFRESH(REFRESH), .AN_LOW(AN_LOW)) display (.clk(clk),
        .digits({scoreL, paused ? 8'hAA : 8'hFF, scoreR}), .seg(seg), .an(an));
    assign dp = 1'b1;                         // decimal point off
endmodule
