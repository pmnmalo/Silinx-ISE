In short:

- **The nextpnr engine packs as tightly as Silinx's own:** the examples through nextpnr now take about as many slices
  as through the Silinx engine, and run faster than before, with their clocks on the global lines.

In detail:

- **The nextpnr engine's packing (#2196):** nextpnr-spartan v0.7.1: slices' free places filled with unrelated LUTs and
  flip-flops, the critical connections first; carry stages and F5s on copies of shared LUTs; the carry out on XB / YB; a
  global buffer's clock pins on its global lines (on general routing trce measured up to 1.5 ns of skew, ISE's DRC silent).
