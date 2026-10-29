In detail:

- **A UI test reading a field's note with its label (#2086):** test/ui/sch-inv-bits.test.js reads the Pins per bit
  field's label element, not its whole text, which since #2076 has a note at Width 1.
