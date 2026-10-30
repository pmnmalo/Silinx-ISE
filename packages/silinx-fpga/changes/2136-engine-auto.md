In short:

- **`--engine auto`:** nextpnr when it can implement the design, else Silinx's own place and route.

In detail:

- **The engine `auto` (#2136):** the flow's spec.engine `auto` takes nextpnr when its Map has no problem with the design, and
  the Silinx engine otherwise, which Map says in one line; the Spartan-6 keeps the Silinx engine. `engineOf(impl)` reads a
  project's engine. **src/nextpnr-io.js** (new): the runner of nextpnr's WebAssembly package, for Node and for a browser worker.
  - **Tests:** test/nextpnr-engine.test.js and test/silinx-fpga-cli.test.js.
