In short:

- **The nextpnr engine on the Spartan-6:** `spec.engine: 'nextpnr'` now places and routes the Nexys3's and the Atlys's
  parts. Silinx still packs the design into sites and writes their settings.

In detail:

- **nextpnr's Place & Route on the Spartan-6 (#2138):** the new dependency `@silinx/nextpnr-himbaechel-spartan6`, the fork's
  `spartan6` micro-architecture with one BEL per site.
  - **src/open-flow-nextpnr-s6.js:** three seeds placed and routed, the fastest by Silinx's timing model kept. The pads,
    global buffers, block RAMs and DSP48A1s are fixed by Silinx's placer.
  - **src/fpga/s6/nextpnr.js:** the sites as nextpnr's netlist, each cell with its timing arcs; the results read back.
  - **src/fpga/s6/nextpnr-export.js, research/nextpnr-s6:** the unknown PIPs and the delay model for the chip database.
