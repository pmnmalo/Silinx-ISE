In detail:

- **Device measurements, the clock network observed (#3):** the ambiguous joins of the clock lines narrowed by the
  intersection of each wire's candidates over the nets that leave it undriven (`intersectAmbiguous`, the nets' source
  tiles left out), and observation designs of 8 global clocks each on a random part of the chip (`gen-obsclk.mjs`):
  10 053 more joins from ISE's routes, all right in the shipped graph but 2 rule-decided ones; the clock lines' joins
  that remain need tests from a BUFGMUX (next).
