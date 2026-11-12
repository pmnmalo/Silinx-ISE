In short:

- The Basys 3's and the Nexys A7's Silinx toolchain runs in the browser edition too: Implement Design and Generate Programming
  File of an Artix-7 project there, the Basys 3's `.bit` the local server's byte for byte (about 6.5 MB downloaded on the first
  run, then kept).

In detail:

- **The 7-series in the browser edition (#3143):** the Basys 3's open flow (Yosys's `synth_xilinx`, nextpnr-himbaechel-xc7
  in WebAssembly, the `.bit` from nextpnr's FASM on Project X-Ray's database) runs in the browser edition's flow worker, as
  the Spartan-3E's and the Spartan-6's: the site publishes `@silinx/nextpnr-himbaechel-xc7` (its bundle, 2.8 MB, and its chip
  databases, the xc7a50t's 3.3 MB that the xc7a35t takes) in `assets/vendor/nextpnr-xc7/<its version>/` and the gzipped bit
  databases in `assets/<version>/bitdb/xc7/` (scripts/build-standalone.mjs: their SHA-256 in the page; the parts with a bit
  database, the layout's `xc7Parts`, those the browser implements: the Basys 3's and the Nexys A7's, #3145), all
  kept in Cache Storage and fetched when a project opens (web/js/asset-cache.js, open-flow-worker.js: no device
  description, the chip database's URL the package's own `chipdbUrl`; the cache keeps this version's every nextpnr). The
  family's profile (core/family-profile.js `artix7`: its parts, its bit database, nextpnr's micro-architecture, runner and
  bundle, its steps) says it; the browser's tool for an Artix-7 project is the Silinx toolchain's 7-series back end, with no
  "no implementation flow" warning (web/js/tool-descriptors.js, device-picker.js, api-local.js); the UCF pin check is for
  UCF constraints only (the back end warns of a port with no pin in an XDC). nextpnr routes with router2, as the local
  server does (about 1.3 GB of the browser's memory for the xc7a35t, 2 s for blinky and vga; router1 0.4 GB but 12 times
  slower), and where router2 stops without an error of nextpnr's own (out of memory) the run is made again with router1, a
  warning saying so (web/js/nextpnr-router-fallback.js). The local server serves the package at /vendor/nextpnr-xc7 too. The
  browser edition's start-up line names the Artix-7 of the Basys 3 and the Nexys A7. Tests: standalone-xc7 (the site built: blinky and vga on
  the Basys 3 from a new project to the `.bit`, no warnings, the assets prefetched and the run fetching none, the `.bit` the
  local server's flow's byte for byte but its header's date and time; in both interfaces, and in Firefox and WebKit; in
  test:browsers' list), nextpnr-router-fallback, web-open-flow-browser, family-profile, asset-cache, tool-descriptors,
  standalone (the layout and the published assets).
