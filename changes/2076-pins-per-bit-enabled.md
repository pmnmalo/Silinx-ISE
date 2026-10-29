In short:

- In the schematic editor's properties, "Pins per bit" can be ticked only when the symbol is wider than a bit.

In detail:

- **Pins per bit enabled for a Width of 2 or more (#2076):** web/js/sch-props.js shows the check box of INV, BUF,
  BUFE / BUFT, ADD, SUB, COMP and CNT unticked and greyed at Width 1, with the note "for a Width of 2 or more"; a wider
  symbol enables it, its saved tick shown again. Tests: test/ui/sch-bits-enabled.test.js (every such symbol, both
  interfaces, Portuguese).
