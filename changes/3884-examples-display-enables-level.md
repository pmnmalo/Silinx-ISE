In short:

- **The examples' display on a board whose digit enables are active high.** A project made from an example for such
  a board (the EDGE Spartan 6) lights one digit at a time, as on the Basys2, instead of three.

In detail:

- **The display's digit enables' level as a generic (#3884).** The examples with a 7-segment display (traffic,
  blinky, pong, stopwatch, clock, isqrt, uart, micro80) have an `AN_LOW` generic (true: the Basys2's, a digit lit at
  '0'). The top passes it to its display (`sevenseg`'s `AN_LOW`) when both are of the same language; blinky's and
  traffic's VHDL tops, whose display is Verilog, invert `an` themselves. A board's value comes from its `an`'s
  `activeHigh` (core/board-generics.js), written as the top's default as CLK_HZ, BTN_LOW and SW_LOW are (#3710), and
  the console says "the board's clock, inputs and display". At its default, every example's bitstream is the one
  before. Every board's segments and decimal point are active low: no such generic for them.
