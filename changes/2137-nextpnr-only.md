In short:

- **One place & route engine, nextpnr:** the Silinx toolchain places and routes with nextpnr on the Spartan-3E and the
  Spartan-6, in the browser and with the local server. Process Properties no longer has a Place & Route Engine. A project
  saved with the Silinx engine builds with nextpnr, so its placement and routing, and its timing, may change.

In detail:

- **nextpnr, the application's one engine (#2137).** `engineOf` gives `nextpnr` for every project. A project's
  `impl.engine` (`silinx`, `auto`, `nextpnr`: #2136's choice) is no longer read, and Process Properties' OK drops it. The
  `auto` fallback to the Silinx engine is gone: when nextpnr cannot start, Place & Route fails with "nextpnr's chip
  database of <part> could not be downloaded (…)" and a hint to implement again online. The nextpnr steps' hints no longer
  say "Choose the Silinx engine". The Spartan-6 places and routes with nextpnr too (its speed gap, #2798, accepted), and
  the browser fetches its nextpnr ahead when a project opens. MCP: `set_process_properties` loses `pr_engine`. The command
  line's `--engine` default is `nextpnr` and `auto` is refused; `--engine silinx` stays until Silinx's placer and router are
  removed. Register replication (#4), the Silinx engine's only, leaves the application with it.
  - **Tests:** test/ui/open-toolchain.test.js (no engine in Process Properties, in Portuguese neither; a project saved
    with the Silinx engine implements with nextpnr), test/ui/standalone.test.js, test/mcp-settings.test.js,
    test/open-toolchain.test.js, test/silinx-fpga-cli.test.js, test/web-open-flow-browser.test.js,
    test/family-profile.test.js, packages/silinx-fpga/test/nextpnr-engine.test.js.
