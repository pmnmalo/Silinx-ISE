In short:

- **nextpnr in the IDE:** Process Properties ▸ Place & Route Engine chooses the Silinx toolchain's place and route:
  Silinx's own, nextpnr, or nextpnr when it can implement the design (Silinx's otherwise). nextpnr now runs in the browser
  edition too, in WebAssembly; its chip database (about 5 MB per device) is downloaded once, then kept by the browser.

In detail:

- **The nextpnr engine in the IDE and the browser (#2136):**
  - **The project's engine:** `impl.engine` (`silinx`, `nextpnr` or `auto`), set in Process Properties (the Silinx toolchain
    only), read by the local server's flow and the browser's; not set, `auto` (#2136: nextpnr by default).
  - **`auto`:** nextpnr when it can implement the design; otherwise (a cell it does not have yet, a port without its pin) the
    Silinx engine, which Map says in one line (not a warning). The Spartan-6 stays on the Silinx engine.
  - **The browser edition:** the flow's worker runs nextpnr's bundle from the site's assets
    (`vendor/nextpnr-spartan/<version>/`, its chip databases beside it); the local server serves it from node_modules.
  - **Tests:** test/nextpnr-engine.test.js (`--engine auto` both ways, `engineOf`), test/silinx-fpga-cli.test.js, and the UI tests
    test/ui/open-toolchain.test.js (Process Properties, English and Portuguese, Implement Design through nextpnr) and
    test/ui/standalone.test.js (nextpnr in the browser edition), in both interfaces.
