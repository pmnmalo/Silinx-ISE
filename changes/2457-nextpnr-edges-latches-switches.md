In short:

- **The nextpnr engine implements falling-edge flip-flops, latches and clock switches:** a design with
  `always @(negedge clk)`, a latch or a BUFGMUX is placed and routed by nextpnr too, instead of falling back to the
  Silinx engine.

In detail:

- **The nextpnr engine: falling-edge flip-flops, latches, clock switches (#2457):** silinx-fpga's Map gives nextpnr
  every cell Silinx's own packer takes (packages/silinx-fpga/changes/2457-nextpnr-edges-latches-switches.md).
