// Silinx example: a digital clock on the Basys2 / Nexys2 (and other boards: CLK_HZ, BTN_LOW, SW_LOW), set with the buttons.
//   display : hours and minutes, HH.MM (the decimal point blinks every second, as a clock's colon)
//   BTN3    : hours + 1
//   BTN2    : minutes + 1
//   BTN1    : seconds to 0 (press it when the minute changes on another clock: synchronised)
//   BTN0    : minutes and seconds (MM.SS) instead of hours and minutes, and back
//   SW0     : reset (00.00)
//   SW1     : 12-hour display (1.00 to 12.59; LD6 lit after noon); 24-hour when off
//   LD5-LD0 : the seconds, in binary; LD7 blinks with the seconds
// The design: the time counters (seconds, minutes, hours), the digits of each (a value below 60 is
// tens and units by comparisons, no divider), the button debouncers (debounce.v) and the display
// (sevenseg.v).
module digital_clock #(
    parameter CLK_HZ  = 50000000,             // the board's clock, in Hz (50 MHz on the Basys2 / Nexys2)
    parameter TICK    = CLK_HZ,               // clock cycles per second
    parameter STABLE  = CLK_HZ / 50,          // button debounce (20 ms)
    parameter REFRESH = CLK_HZ / 1000,        // display: cycles per digit (1 ms)
    parameter BTN_LOW = 0,                    // 1: the board's buttons read 0 when pressed
    parameter SW_LOW  = 0                     // 1: the board's switches read 0 when on
) (
    input  wire       clk,
    input  wire [1:0] sw,
    input  wire [3:0] btn,
    output wire [7:0] led,
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

    // the buttons and switches as 1 when pressed or on, whatever the board's level
    wire [3:0] btnOn = BTN_LOW ? ~btn : btn;
    wire [1:0] swOn  = SW_LOW ? ~sw : sw;

    wire incHour, incMin, zeroSec, toggleView;
    debounce #(.STABLE(STABLE)) db3 (.clk(clk), .btn(btnOn[3]), .press(incHour));
    debounce #(.STABLE(STABLE)) db2 (.clk(clk), .btn(btnOn[2]), .press(incMin));
    debounce #(.STABLE(STABLE)) db1 (.clk(clk), .btn(btnOn[1]), .press(zeroSec));
    debounce #(.STABLE(STABLE)) db0 (.clk(clk), .btn(btnOn[0]), .press(toggleView));

    reg [clog2(TICK)-1:0] tick = 0;
    reg [5:0]  sec = 6'd0, min = 6'd0;
    reg [4:0]  hour = 5'd0;
    reg        secView = 1'b0;                // MM.SS shown
    wire       second = (tick == TICK - 1);
    wire       half = (tick < TICK / 2);      // the first half of each second

    always @(posedge clk) begin
        if (swOn[0]) begin
            tick <= 0; sec <= 6'd0; min <= 6'd0; hour <= 5'd0; secView <= 1'b0;
        end else begin
            tick <= (second || zeroSec) ? 1'b0 : tick + 1'b1;
            if (toggleView) secView <= ~secView;
            // the seconds, and the minutes and hours they carry into
            if (zeroSec)
                sec <= 6'd0;
            else if (second) begin
                if (sec == 6'd59) begin
                    sec <= 6'd0;
                    if (min == 6'd59) begin
                        min <= 6'd0;
                        hour <= (hour == 5'd23) ? 5'd0 : hour + 5'd1;
                    end else
                        min <= min + 6'd1;
                end else
                    sec <= sec + 6'd1;
            end
            // the buttons that set the time (no carry: minutes 59 -> 0 leave the hour)
            if (incMin && !(second && sec == 6'd59)) min <= (min == 6'd59) ? 6'd0 : min + 6'd1;
            if (incHour && !(second && sec == 6'd59 && min == 6'd59)) hour <= (hour == 5'd23) ? 5'd0 : hour + 5'd1;
        end
    end

    // tens and units of a value below 60, by comparisons
    function [7:0] decimal(input [5:0] v);
        reg [5:0] units;
        begin
            if      (v >= 6'd50) begin decimal[7:4] = 4'd5; units = v - 6'd50; end
            else if (v >= 6'd40) begin decimal[7:4] = 4'd4; units = v - 6'd40; end
            else if (v >= 6'd30) begin decimal[7:4] = 4'd3; units = v - 6'd30; end
            else if (v >= 6'd20) begin decimal[7:4] = 4'd2; units = v - 6'd20; end
            else if (v >= 6'd10) begin decimal[7:4] = 4'd1; units = v - 6'd10; end
            else                 begin decimal[7:4] = 4'd0; units = v; end
            decimal[3:0] = units[3:0];
        end
    endfunction

    // the hour shown: 0-23, or 1-12 in 12-hour mode
    wire       pm = (hour >= 5'd12);
    wire [4:0] hour12 = (hour == 5'd0) ? 5'd12 : (hour > 5'd12) ? hour - 5'd12 : hour;
    wire [7:0] h = decimal({1'b0, swOn[1] ? hour12 : hour});
    wire [7:0] m = decimal(min);
    wire [7:0] s = decimal(sec);
    // no leading zero for the hours in 12-hour mode (" 9.05")
    wire [3:0] h10 = (swOn[1] && h[7:4] == 4'd0) ? 4'd15 : h[7:4];

    sevenseg #(.REFRESH(REFRESH)) display (.clk(clk),
        .digits(secView ? {m, s} : {h10, h[3:0], m}), .points({1'b0, half, 2'b00}), .seg(seg), .dp(dp), .an(an));

    assign led = {half, swOn[1] & pm, sec};
endmodule
