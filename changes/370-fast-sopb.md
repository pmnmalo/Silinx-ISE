In short:

- **Optimization Fast: large deep designs balanced again.** A design with long chains of logic that is too large for
  Speed's mappings at Fast gets the logic balanced as sums of products, as the old Normal effort did: the EPFL arbiter is
  37 % smaller and 3 times as fast.

In detail:

- **Optimization Fast: the SOP balancing for a deep design above DEEP_RULE's 1500 LUTs (#370).** Fast's usual mapping
  left the EPFL arbiter at 4033 LUTs and 30 levels. It is now balanced as sums of products too (DEPTH_SOPB), kept when
  10 % faster: 2579 LUTs, 7 levels, 38.5 -> 12.7 ns after Place & Route. Every other design keeps its netlist. The details
  are in the toolchain's changelog (packages/silinx-fpga).
