In short:

- **Numato Elbert V2: the examples' seven-segment display on the right pins.** A project for the Elbert V2 now gets
  its digit enables and decimal point on the display, and its segments a..g on the right pins. Before, the digit
  enables and the decimal point went to header pins, and the display showed wrong segments.

In detail:

- **The Elbert V2's pin table as the Mimas V2's (#3741).** Numato's `SevenSegment[0]` is the decimal point and
  `[7..1]` are the segments a..g (its demo's "abcdefgh"). The table had them in Numato's order as `seg`, and the digit
  enables as `seg_en`, so an example's `seg<0>` (a) took the decimal point's pin and its `an` and `dp` went to free
  header pins. The table now has `seg` (a..g), `dp` and `an` (the 3 digits, `Enable[0..2]`), all active low (Numato's
  demo scans the digits with one low enable); an example's `an<3>` alone goes to a header pin, warned in ISE's build.
