In short:

- **nextpnr-himbaechel-spartan3e 1.1.1:** past router 1's effort, router 2 routes shorter critical paths in the same
  time.

In detail:

- **nextpnr-himbaechel-spartan3e 1.1.1 (#3002).** nextpnr-spartan's PR 19 (60ec2bcb): router 2, where router 1 stops
  past its effort, routes with its alternate weights (`--router2-alt-weights`: an estimate weight of 1.0, not 1.25).
  Natively, on Silinx's design corpus: secworks-sha256 41.5 MHz (36.2 on 1.1.0, 43.8 by router 1 alone), secworks-aes
  34.7 (30.0), epfl-multiplier 14.3 (13.8), vtr-diffeq1 25.6 (26.6). The designs router 1 routes within its effort
  route as on 1.1.0.
