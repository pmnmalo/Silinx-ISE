In detail:

- **The Spartan-6 with the nextpnr engine: every seed routes (#2800).** nextpnr gave up on some seeds: blinky on the
  Nexys3, seed 1, and clock on the Atlys, seeds 2 and 3, each on a net from an input pad. Place & Route worked only
  because it moved on to the next seed. nextpnr's router now routes those nets on every seed, with no warnings.
