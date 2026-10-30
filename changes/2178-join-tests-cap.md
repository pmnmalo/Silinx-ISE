In detail:

- **Device measurements, the join tests' designs at most 1000 tests (#2178):** `joinTestDesigns` takes `maxTests`
  (`MAXTESTS` for `prototype.mjs tests`, default 1000); the rest wait for the next design. In the XC3S1200E's designs of
  up to 17 344 test nets ISE's DRC gave a few wrong verdicts (2721 per million over 10 000 tests, none up to 500), and a
  wrong join became a known join the next rounds' paths crossed.
