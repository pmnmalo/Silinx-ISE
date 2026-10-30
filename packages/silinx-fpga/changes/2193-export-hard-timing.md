In detail:

- **export-timing: the block RAMs' and multipliers' delays (#2193):** research/nextpnr-s3e/lib.mjs's `timingExport` also
  gives nextpnr's chip database `bram` and `mult` (SPEED_4's, trce's values), for the spartan3e micro-architecture's
  RAMB16 and MULT18X18SIO. Test: test/nextpnr-s3e.test.js.
