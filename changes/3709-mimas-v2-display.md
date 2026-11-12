In short:

- **Numato Mimas V2: the examples' seven-segment display works.** A project for the Mimas V2 now gets its digit
  enables and decimal point, and its segments a..g on the right pins. Before, the display stayed dark or showed wrong
  segments.

In detail:

- **The Mimas V2's pin table as the other boards' (#3709).** Numato's `SevenSegment[0]` is the decimal point and
  `[7..1]` are the segments a..g. The table had them in Numato's order as `seg`, and the digit enables as `seg_en`, so
  an example's `seg<0>` (a) took the decimal point's pin and its `an` and `dp` had no pin. The table now has `seg`
  (a..g), `dp` and `an` (the 3 digits; an example's `an<3>` has no pin). It also records the active levels: the
  display, the push buttons and the DIP switches are active low, and the DIP switches are named `sw`, as the Board
  Emulator's switches.
