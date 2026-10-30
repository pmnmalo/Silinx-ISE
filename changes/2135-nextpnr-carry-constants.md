In detail:

- **The nextpnr engine: carry chains and constants (#2135):** nextpnr-spartan v0.2.1 (the pinned WebAssembly package)
  places and routes MUXCY / XORCY chains up a column of slices, and takes the constants. As Silinx's packer, it adds a
  carry-in stage when a chain's first DI needs BX, and keeps a chain's slices to its own cells. The converter writes the
  carry settings ISE's map writes: CYINIT, CY0F / CY0G and their GNDF / C1VDD, CYMUXF, XORF, FXOR / GXOR, COUTUSED.
  Map accepts MUXCY, XORCY, GND and VCC. The simulation check simulates the carry too.
  - **Five of the seven examples** go through nextpnr (gates, blinky, pong, clock, vga): the routing checked, their
    flip-flops simulated equal to the netlist, a complete bitstream. Their size and speed against Silinx's own engine:
    blinky 132 / 117 slices, 7.5 / 6.6 ns; pong 266 / 245, 11.8 / 11.9 ns; clock 225 / 207, 6.6 / 6.2 ns; vga 183 /
    144, 10.5 / 8.6 ns. traffic needs MUXF5 / MUXF6, stopwatch MULT18X18 and RAMB16.
  - **The counter as Silinx's synthesis maps it (24 bits, one chain):** 13 slices as Silinx's; ISE's DRC clean; trce
    4.608 ns against Silinx's 4.526 ns; the .bit byte-identical to ISE's bitgen.
  - **A fix:** nextpnr writes a string parameter with a trailing space (`"1 "`); the converter now trims it. The space
    had reached the XDL (`CY0F::1\ `), and the flip-flops' set / reset modes were misread.
  - **Tests:** packages/silinx-fpga/test/nextpnr-s3e.test.js (the chain's settings, a complete bitstream, the
    simulation check catching a wrong DI or carry in) and nextpnr-engine.test.js (the counter built with the engine).
