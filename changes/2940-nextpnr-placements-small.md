In short:

- **Optimization Speed:** a small design (up to 100 slices) is placed 32 times instead of eight and the fastest kept: its
  critical path 1 to 4 % shorter, its Place & Route a few seconds longer.

In detail:

- **32 placements at Optimization Speed for a small design (#2940):** nextpnr places a Spartan-3E design of up to 100
  slices 32 times at Speed, eight a larger one, the fastest kept (silinx-fpga's `nextpnrTries`); iwls05-sasc 4.763 →
  4.563 ns, itc99-b10 4.751 → 4.659 ns, iwls05-usb-phy 4.889 → 4.819 ns on the XC3S1200E. README's Optimization says so.
