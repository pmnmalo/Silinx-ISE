In detail:

- **Spartan-6: the bit databases and their prediction moved into the Silinx toolchain (#732):** the databases measured
  in research/s6 against ISE's bitgen are now in packages/silinx-fpga/bitdb/s6 (moved with their history; the
  research scripts read and write them there). The prediction of a design's configuration bits from them is now in
  packages/silinx-fpga/src/fpga/s6/: bitgen.js (predictDesign), bitgen-slice.js, bitgen-pips.js, bitgen-regions.js,
  bitgen-hard.js, bitgen-cmt.js, and bitdb-node.js (the loader). It was moved as it was, and the research modules
  re-export every name they had. The block RAMs' and DSP48A1's base settings are a small table of their own
  (bitdb/s6/s6-hard-base.json), so the package does not read ISE's primitive definitions. No change in behaviour:
  the residual of the 14 examples routed by ISE is exact as before, and the 86 CMT designs give the same output as
  main's. Tests: packages/silinx-fpga/test/s6-bitgen.test.js.
