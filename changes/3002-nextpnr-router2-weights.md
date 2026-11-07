In short:

- **Faster designs past router 1's effort:** on a congested design the Spartan-3E's nextpnr engine routes a shorter
  critical path again: secworks-sha256 24.98 ns, 31.04 on 1.1.0.

In detail:

- **The Spartan-3E's nextpnr engine at 1.1.1: router 2 with its alternate weights (#3002).** Past router 1's effort
  (1.1.0, #2912) nextpnr-himbaechel-spartan3e 1.1.1 routes with router 2's alternate weights (an estimate weight of
  1.0, not 1.25), which keep the critical paths router 1 had made short, in the same time. The Nightly's design corpus
  (Silinx's timing analysis): secworks-sha256 24.979 ns (31.041 on 1.1.0, 24.389 by router 1 alone, in about four
  times the time), secworks-aes 31.005 (32.359), epfl-multiplier 74.869 (77.774), vtr-diffeq1 39.449 (38.074); the
  designs router 1 routes within its effort, every example among them, route as on 1.1.0.
  - **Tests:** test/nextpnr-s3e-effort.test.js: router 2's run on vga, its maximum frequency the alternate weights'
    (above 1.1.0's), no warning.
