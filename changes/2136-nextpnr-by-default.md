In short:

- **nextpnr by default:** the Silinx toolchain now places and routes a Spartan-3E design with nextpnr, and with Silinx's
  own engine when nextpnr cannot implement it yet. Process Properties ▸ Place & Route Engine ▸ Silinx keeps Silinx's
  engine for a project. The browser edition fetches nextpnr and the device's chip database when a project opens, with
  Yosys, and keeps them: the installed app builds with nextpnr offline too.

In detail:

- **nextpnr, the default engine (#2136):** a project that never chose an engine (no `impl.engine`) now takes `auto`
  (nextpnr when it can implement the design, else the Silinx engine, which Map says in one line), in the local server's
  flow, the browser's and Process Properties; one that chose `silinx` keeps it. The Spartan-6 stays on the Silinx engine.
  When nextpnr cannot start (offline, its chip database not downloaded yet, #2329), `auto` takes the Silinx engine, with
  one warning, instead of failing.
  nextpnr's size and speed are still being brought to the Silinx engine's (#2196).
- **The browser edition keeps nextpnr (#2136):** nextpnr's bundle and chip databases are versioned assets
  (web/js/asset-cache.js `isVersionedAsset`): the service worker and the flow's worker read them from Cache Storage, and
  `prepareBrowserFlow(device, impl)` fetches the bundle and the device's chip database when a project opens, unless its
  engine is Silinx's; pruning keeps this version's.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (`engineOf`, nextpnr not starting), test/silinx-fpga-cli.test.js,
    test/examples.test.js (the examples on every device, no warning, through the default), test/asset-cache.test.js,
    test/web-open-flow-browser.test.js, and the UI tests test/ui/open-toolchain.test.js (nextpnr by default, the Silinx
    engine once chosen) and test/ui/standalone.test.js (nextpnr prefetched, then offline from the cache), in both interfaces.
