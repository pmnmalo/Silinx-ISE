In short:
- The examples run on the iCEBreaker: their seven-segment display (4 digits, on a breadboard) and 4 switches (a PmodSWT) on its Pmods 1A and 1B, and the vga example on the new board "1BitSquared iCEBreaker + PmodVGA".
- On the iCE40, a port that is a vector of one bit (a board's btn[0]) gets its pin.

In detail:
- The iCEBreaker's Pmods 1A and 1B hold the examples' seven-segment display (seg, dp, an) and switches sw[3:0]. A board of its own, icebreaker-vga, holds a Digilent PmodVGA (the colours' most significant bits). Every example builds on them with the Silinx toolchain to its .bin, timing met; the warnings are those of the ports the board has no pin for (led<5..7>, btn<3>, isqrt's sw<7:4>, vga's sw) (#2517).
- The iCE40's back end: a one-bit port's constraint is read as nextpnr-ice40 names it (btn, not btn[0]); before, it was an unmatched constraint and the port was placed anywhere (#2518).
