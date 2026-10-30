// a 27-bit counter on the Basys2's 50 MHz clock, its top 8 bits on the LEDs; sw[0] resets it
module blink27 (
    (* LOC = "B8" *)  input  wire clk,
    (* LOC = "P11" *) input  wire rst,
    (* LOC = "G1" *)  output wire led7, (* LOC = "P4" *) output wire led6,
    (* LOC = "N4" *)  output wire led5, (* LOC = "N5" *) output wire led4,
    (* LOC = "P6" *)  output wire led3, (* LOC = "P7" *) output wire led2,
    (* LOC = "M11" *) output wire led1, (* LOC = "M5" *) output wire led0
);
    reg [26:0] q = 0;
    always @(posedge clk) q <= rst ? 27'd0 : q + 1'b1;
    assign {led7, led6, led5, led4, led3, led2, led1, led0} = q[26:19];
endmodule
