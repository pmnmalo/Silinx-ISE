In detail:

- **The nextpnr engine: carry chains and constants (#2135):** nextpnr-spartan's micro-architecture places and routes
  MUXCY / XORCY chains up a column of slices, and takes the constants. The converter writes the carry settings ISE's
  map writes: CYINIT, CY0F / CY0G and their GNDF / C1VDD, CYMUXF, XORF, FXOR / GXOR, COUTUSED. Map accepts MUXCY,
  XORCY, GND and VCC. The simulation check simulates the carry too.
  - **On the counter as Silinx's synthesis maps it (24 bits, one chain):** 13 slices as Silinx's; ISE's DRC clean;
    trce 4.608 ns against Silinx's 4.526 ns; the .bit byte-identical to ISE's bitgen.
  - **A fix:** nextpnr writes a string parameter with a trailing space (`"1 "`); the converter now trims it. The space
    had reached the XDL (`CY0F::1\ `), and the flip-flops' set / reset modes were misread.
  - **Tests:** packages/silinx-fpga/test/nextpnr-s3e.test.js (the chain's settings, a complete bitstream, the
    simulation check catching a wrong DI or carry in) and nextpnr-engine.test.js.
