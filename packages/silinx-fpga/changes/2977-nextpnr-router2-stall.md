In short:

- **nextpnr-himbaechel-spartan3e 1.4.0:** router 2 converges on ITC'99 b20 and the EPFL multiplier.

In detail:

- **nextpnr-himbaechel-spartan3e 1.4.0 (#2977).** nextpnr-spartan's PR 25 (2e505ef6): router 2's congestion weight
  grows once the overuse has not gone down in 20 iterations (`router2-stall-iter`) and from iteration 200 on
  (`router2-grow-iter`); `router2-max-iter` (500) sets its limit; its error names each overused wire's nets.
