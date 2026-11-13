In short:

- **Numato Elbert V2: the examples' seven-segment display works.** A project for the Elbert V2 now gets its digit
  enables and decimal point on the board's pins, and its segments a..g on the right pins. Before, the display showed
  wrong segments and its digit enables were on header pins.

In detail:

- **The Elbert V2's pin table as the other boards' (#3741, as the Mimas V2's, #3709).** Numato's `SevenSegment[0]`
  is the decimal point and `[7..1]` are the segments a..g (its demo's "abcdefgh"). The table had them in Numato's order
  as `seg`, and the digit enables as `seg_en`, so an example's `seg<0>` (a) took the decimal point's pin and its `an`
  and `dp` went to header pins. The table now has `seg` (a..g), `dp` and `an` (the 3 digits, `Enable[0..2]`; an
  example's `an<3>` goes on a header pin), all active low (common anode, active-low enables, Numato's demo).
