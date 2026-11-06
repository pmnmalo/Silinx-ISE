In detail:

- **The technology schematic's test of blinky and pong, cheaper (#2392):** `test/techview.test.js` tests each example in
  a test of its own (they neared the 300 s limit together in CI), one helper synthesizing it once and drawing it; pong's
  top level drawn once, as View Technology Schematic draws it (its names as written), not also with the names in lower
  case (blinky's still is): its drawing is most of the test's time, its net names' places rebuilding the wire grid each
  (#2970).
