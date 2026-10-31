In short:

- **nextpnr by default:** `silinx-fpga build` places and routes with nextpnr when it can implement the design, else with
  Silinx's own engine (`--engine auto`, now the default); `--engine silinx` keeps Silinx's engine.

In detail:

- **The engine `auto` by default (#2136):** the command line's `--engine` defaults to `auto`, and `engineOf(impl)` reads a
  project with no engine as `auto` (it was `silinx`). The flow's `spec.engine` itself is unchanged: not set, the Silinx engine.
  `auto` loads nextpnr's chip database at Map; when it cannot (offline, a database not downloaded yet, #2329), the Silinx
  engine places and routes, with `WARNING:Map - the nextpnr engine could not start (…)`; `nextpnr` still fails there.
  - **Tests:** test/nextpnr-engine.test.js (`engineOf`, nextpnr not starting) and test/silinx-fpga-cli.test.js.
