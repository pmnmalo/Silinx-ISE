In detail:

- **Spartan-6 post-synthesis model: a RAM32M's or a RAM64M's unused data inputs tied to 0 (#2639):** Yosys maps a
  memory onto the A, B and C RAMs of a RAM32M or RAM64M and leaves D's write data (DID) unconnected when nothing reads
  D; the model's VHDL and Verilog now tie it to 0, as the FPGA ties an unused input, and the Board Emulator's compiled
  engine no longer warns "used but has no driver". Test: test/unisim-s6.test.js (each primitive's model compiled with no
  warnings).
