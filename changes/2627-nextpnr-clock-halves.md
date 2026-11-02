In short:

- **More clocks through nextpnr:** a design with a clock on a side global buffer (a side GCLK pin), or with more than
  eight clocks, now builds with the nextpnr engine.

In detail:

- **nextpnr-spartan v0.16.0 (#2627, #2629):** nextpnr keeps every clock pin in reach of its global buffer's line (a side
  buffer's in its half of the chip), as Silinx's placer does.
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js.
