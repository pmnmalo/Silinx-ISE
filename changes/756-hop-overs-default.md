In short:

- **Schematic: hop-overs on by default:** where two wires cross without connecting, the horizontal one hops over
  the other with a small arc, in every schematic, printed too; untick Hop-overs to turn them off (remembered).

In detail:

- **Hop-overs on by default (#756):** the Hop-overs checkbox of the schematic editor (#692) is now ticked unless
  the user turned it off (the choice remembered, as before); crossing wires that connect keep their junction dot.
  The printed schematic (and its saved SVG) shows the hops as drawn. Tests: test/ui/sch-hops.test.js (on with
  nothing remembered, the T's dot, the printed SVG, off remembered after the schematic is opened again, Portuguese;
  both interfaces).
