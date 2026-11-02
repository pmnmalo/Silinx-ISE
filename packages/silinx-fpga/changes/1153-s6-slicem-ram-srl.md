In short:

- The Spartan-6 placer takes the SLICEM's distributed RAMs (RAM32X1S / D, RAM64X1S / D, RAM128X1S / D, RAM256X1S,
  RAM32M, RAM64M) and writes them and the shift registers (SRL16, SRL16E, SRLC16E, SRLC32E) as XDL as ISE writes them.

In detail:

- **The SLICEM's distributed RAMs and shift registers placed and written as XDL (#1153):** `s6/phys-mem.js` gives each
  RAM's and shift register's pins the SLICEM's site pins as ISE's map does (the read address on each position's
  inputs, the write address the D LUT's, a 32-bit RAM in the 64-bit mode with A1 low, the 7th and 8th address bits on
  CX / AX and BX, the data on DX, AX … or AI …, the write enable on CE, a shift register's cascade out on DMUX from
  position A), and `s6/xdl-mem.js` writes their settings (`#RAM:O6=0x…` from the INIT, the RAMMODEs, the DI1
  multiplexers, WA7USED / WA8USED, WEMUX::CE). The packer puts a two-LUT cell in a pair of positions (D and C, B and A),
  a shift register's cascade out in position A, and no storage element beside RAMs. Measured on 21 designs of one
  primitive each implemented by ISE (`research/s6/gen-mem6.mjs`, `ana-mem6.mjs`, `measured/mem.json`): the Silinx
  toolchain writes the same settings and pins (test/s6-xdl-mem.test.js); ISE reads its placement and its routing of
  them, routes the placement completely (`par -k`) and its DRC finds no error. The contents other than zeros in the
  bitstream: #2556.
