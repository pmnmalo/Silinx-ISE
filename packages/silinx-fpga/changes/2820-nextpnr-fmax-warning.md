In detail:

- **nextpnr's "Max frequency" is no warning on the Spartan-3E (#2820):** the nextpnr step (`open-flow-nextpnr.js`)
  leaves nextpnr's estimate of each clock out of its warnings, as the Spartan-6's step does; the timing step alone
  says whether a PERIOD is met. Test: test/nextpnr-fmax-warning.test.js.
