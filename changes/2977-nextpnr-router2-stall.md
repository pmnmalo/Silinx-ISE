In short:

- **ITC'99 b20 and the EPFL multiplier placed and routed by the nextpnr engine:** router 2 no longer stops at its
  500-iteration limit on them.

In detail:

- **The Spartan-3E's nextpnr engine at 1.4.0 (#2977).** nextpnr-himbaechel-spartan3e 1.4.0 (nextpnr-spartan PR 25,
  2e505ef6): router 2's congestion weight, which #19's weights kept from growing, grows once the overuse has not gone
  down in 20 iterations (`router2-stall-iter`) and from iteration 200 on (`router2-grow-iter`); router 2's error names
  each overused wire's nets. The design corpus, recorded in test/designs-corpus/expected.json: itc99-b20 complete
  (1335 slices, 37.391 ns, with the PERIOD 20 ns warning); epfl-multiplier 72.51 -> 75.70 ns; itc99-b15's critical
  path 19.976 -> 20.024 ns, its PERIOD 20 ns warning; iwls05-sasc 80 -> 52 slices and iwls05-simple-spi 111 -> 79
  slices, 1.2.0's memory address pins from GND (#2982), not recorded until now.
