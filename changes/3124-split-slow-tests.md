In detail:
- **The two longest unit test files split (#3124):** test/open-flow.test.js (34 to 50 minutes in CI, its tests one after
  another) into open-flow.test.js (the shipped device descriptions, blinky), open-flow-features.test.js (block RAMs,
  multipliers, shift registers), open-flow-io.test.js (DCMs, global buffers, IOBs) and open-flow-clocks.test.js, their
  helpers and fixtures' table in test/open-flow-lib.mjs; test/sim-model-par.test.js (21 to 38 minutes) into
  sim-model-par.test.js, sim-model-par-examples.test.js and sim-model-par-micro80.test.js. The same tests, moved as they
  were; test/timings.json gives the new files their share of the old ones' times.
