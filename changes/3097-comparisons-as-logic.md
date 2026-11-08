In short:

- **Smaller designs that compare a signal with several constants:** such comparisons are made of LUTs instead of carry
  chains (the vga example 143 → 122 slices, 10.2 → 9.2 ns).

In detail:

- **A signal compared with several constants as LUTs (#3097):** the Silinx toolchain's synthesis maps the comparisons with
  a constant of a signal compared with two constants or more, and those that test the signal's high bits (`count > 0`),
  as logic before Yosys's coarse step, not as carry chains whose LUTs Place & Route had to copy for each chain (itc99-b05
  252 → 194 slices, verilog-uart 117 → 111 slices and 8.7 → 6.9 ns); silinx-fpga's changelog has the details.
