In short:

- **A family's back end:** `registerBackend` adds a family to `runFlow` with its own steps. `io.nextpnr` is now keyed by
  micro-architecture (`io.nextpnr.spartan3e`, `io.nextpnr.spartan6`), and `io.nextpnrS6` is gone: a flow of one's own that
  gives these hooks changes them.

In detail:

- **The flow's back ends, first step (#2360):** `runFlow` names no family and no engine: the Spartan-3E's and the Spartan-6's
  Map, Place & Route, engines, timing model and bitstream are back ends (`open-flow-backends.js`; the Spartan-3E's steps moved
  as they are to `open-flow-s3e.js`), with the same output; a test keeps the orchestrator free of those names.
