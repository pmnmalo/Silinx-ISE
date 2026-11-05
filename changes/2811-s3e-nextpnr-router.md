In detail:

- **The Spartan-3E with the nextpnr engine: the router's fix of #2800 (#2811).** nextpnr-himbaechel-spartan3e 0.20.0
  has the Spartan-6's fix of #2800: a net whose route leaves one of nextpnr's router partitions is routed by its
  whole-device pass instead of being given up. No example hit it on the Spartan-3E, but any design could on some seed.
  The examples route on every seed on the Basys2 and the Nexys2, with no warnings.
