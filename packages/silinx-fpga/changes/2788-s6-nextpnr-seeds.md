In detail:

- **The Spartan-6's nextpnr engine: a seed it cannot route is skipped (#2788).** Of its three placements, a seed that
  nextpnr cannot route is logged on its `nextpnr, seed N:` line with nextpnr's reason, and the next ones are tried. Place
  & Route fails only when none routes, with "it stopped on an error" and nextpnr's ERROR lines, no longer "undefined"
  (nextpnr's WebAssembly exception has no message). Only the kept seed's warnings are logged. blinky on the Nexys3 and
  clock on the Atlys now build with the nextpnr engine.
  - **Tests:** packages/silinx-fpga/test/nextpnr-s6.test.js.
