In detail:

- **The Spartan-6's chip database for nextpnr gets each routing node's delay from Silinx's timing model (#3149, part of
  #3137).** `timingExportS6` (`src/fpga/s6/nextpnr-export.js`, run by `research/nextpnr-s6/export-timing.mjs`) gave each
  PIP only the class of the wire it drives; it now also gives each node its delay as Silinx's timing analysis counts
  it (`wireDelay`: the node's class and wire type, and on a load's node the model's base and its pin kind's), for the
  fork's generator to add a path's delays as Silinx does (the keys `nodeClass`, `node`, `tileWire`; the old ones stay).
  No change for the toolchain's users until the nextpnr package built from it is pinned.
  - **Tests:** test/nextpnr-s6.test.js (the classes of every node; the node delays of a routed counter add up to
    Silinx's on its connections).
- **An option to leave the Spartan-6's block RAMs and DSP48A1s to nextpnr (#3149, part of #3137).** Silinx places them
  (`placeS6`) and fixes their sites for nextpnr; the spec option `hardByNextpnr` leaves them to nextpnr's placer, the
  pads and global buffers still Silinx's. Its default, `S6_HARD_BY_NEXTPNR` (`src/open-flow-nextpnr-s6.js`), stays false
  until the nextpnr package with the new chip database and placer tuning is pinned.
  - **Tests:** test/nextpnr-s6.test.js (a block RAM and three DSP48A1s fixed by default, left to nextpnr with the
    option, routed, no warnings).
