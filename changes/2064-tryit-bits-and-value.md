In short:

- In a schematic's Try it, the bus formats "Binary (Unsigned)", "Binary (Two's Complement)" and "Binary (One's
  Complement)" show a bus's bits and their value together, for instance 1110 = -2.

In detail:

- **Try it: a bus's bits and their value (#2064):** web/js/sch-live.js shows a bus's value, in the three readings of
  #2015, as its bits and their decimal value (1110 = 14, 1110 = -2, 1110 = -1), on the markers, the wires and the
  registers; the bar's formats named so, with their Portuguese labels. The value editor still takes a decimal. Tests:
  test/ui/sch-live-parts.test.js (both interfaces, Portuguese).
