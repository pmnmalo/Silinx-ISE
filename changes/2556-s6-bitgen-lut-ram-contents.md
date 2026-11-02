In short:

- The Nexys3's and Atlys's bitstream holds the contents of a design's distributed RAMs and shift registers (a small
  memory or shift register the synthesis puts in LUTs), as Xilinx ISE writes them.

In detail:

- **Spartan-6 bitstream: a distributed RAM's and a shift register's contents (#2556):** the Silinx toolchain's
  bitstream for a Nexys3 or Atlys design with a distributed RAM or shift register whose initial contents are not all
  zeros no longer says the contents are not measured: it writes them as ISE does. Test: test/s6-check-slice.test.js.
