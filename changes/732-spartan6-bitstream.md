In short:

- Under the Spartan-6 developer flag (SILINX_SPARTAN6_OPEN=1), the Silinx toolchain now writes the bitstream for the
  Nexys3 and the Atlys: on the examples it is byte for byte the one ISE's bitgen writes for the same routed design.

In detail:

- **Spartan-6: the bitstream (#732):** packages/silinx-fpga/src/fpga/s6/bitgen.js's bitstreamS6 writes a placed and
  routed design's .bit from the bit databases. It also writes the block RAM's frame that bitgen writes again after
  the frame data. A feature the databases do not have, or a DCM or PLL (#2025), is named, and the open flow's
  bitgen step stops with the list. The open flow routes on the switches whose bits are known (knownPipS6), and
  takes the PIPs of a hard block's pins as having no bits (NO_BITS: every one measured had none). The steps bitgen and prombit are on under the flag. Night 1's 14 examples on both
  boards are byte-identical with ISE's bitgen, CRC on and off (research/s6/check-bitgen6.mjs). Tests:
  packages/silinx-fpga/test/s6-bitgen.test.js and test/s6-devices.test.js (blinky and stopwatch on the Nexys3
  through the bitstream). Six of the seven examples reach their bitstream on the Nexys3; clock needs #2061.
