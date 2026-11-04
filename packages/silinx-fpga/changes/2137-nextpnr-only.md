In detail:

- **nextpnr, the flow's engine (#2137).** `engineOf` gives `nextpnr` whatever the project saved. `runFlow` with
  `engine: 'auto'` no longer falls back to Silinx's engine (`auto` is gone): `engine: 'nextpnr'` runs nextpnr, on the
  Spartan-3E and the Spartan-6, and Silinx's own engine is left only without it, until its removal. A chip database that
  cannot be loaded fails Place & Route with "nextpnr's chip database of <part> could not be downloaded (…)" (`loadChipdb`,
  `CHIPDB_HINT` in `nextpnr-io.js`). The nextpnr steps' hints no longer name the Silinx engine. The command line's
  `--engine` is `nextpnr` (the default) or `silinx`.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js, test/silinx-fpga-cli.test.js.
