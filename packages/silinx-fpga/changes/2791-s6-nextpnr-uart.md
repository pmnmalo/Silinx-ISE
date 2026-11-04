In detail:

- **The Spartan-6's nextpnr engine: nextpnr-himbaechel-spartan6 0.1.2, its chip database from the current bit database
  (#2791).** The 0.1.1 chip database was built before #2539 measured the Atlys's USB-UART pins' switches. It left those
  PIPs out, so nothing drove `TIOB_O2_PINW` of the uart's `tx` (B16), and no seed routed ("Failed to route arc 0.0 …
  to X83Y0/TIOB_O2_PINW"). With 0.1.2, uart routes on the Nexys3 and the Atlys, on every seed, with no warnings.
  - **Tests:** test/examples-nextpnr-s6.test.js.
