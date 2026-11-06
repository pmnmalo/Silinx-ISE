In short:

- **Convert to Schematic of a ripple-carry adder:** instances that each drive a bit of a vector (`s => s(0)`,
  `co => c(1)`) are drawn as module symbols, wired bit by bit, no longer one HDL block holding them all.

In detail:

- **Convert to Schematic: an instance's output on a bit or a slice of a vector (#2901):** drawn on a net named as
  the bus's bits (`c(1)`, `c[3:2]`, as ISE names them), the next instance reading that net; a port's bits joined into
  it by a bus join, in the port's order (`downto` or `to`). Done when every item writing the vector is such an instance
  and their parts cover it once, and an internal vector is read by drawn instances only, by its parts; otherwise the
  instances stay one HDL block as before (#1715). The schematic's HDL no longer declares twice a bus made of its bits
  that the declarations kept from the source declare already.
