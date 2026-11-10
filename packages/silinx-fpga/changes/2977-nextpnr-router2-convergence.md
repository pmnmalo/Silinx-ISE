In short:

- **nextpnr-himbaechel-spartan3e 1.3.0:** ITC'99 b14, b21 and b22 placed and routed; router 2 stops after 500
  iterations with an error, not running with no end.

In detail:

- **nextpnr-himbaechel-spartan3e 1.3.0 (#2818, #2977, #2982).** nextpnr-spartan's PRs 20 and 24 (50328fbb):
  - 1.1.2 (#2818): a LUT shared by two stages of one carry chain taken once, not bound on two BELs; an exception
    nextpnr does not handle (an assertion) said as an `ERROR:` line, exit code 125.
  - 1.2.0 (#2982): a SLICEM memory's address pins at 0 routed from a free slice's GND source, not a LUT each.
  - 1.3.0 (#2977): `block_di_on_full_luts`, a carry stage's DI through BX / BY, not pin 1 of a LUT whose four inputs
    are other nets; router 2's `router2/maxIter`, 500.
