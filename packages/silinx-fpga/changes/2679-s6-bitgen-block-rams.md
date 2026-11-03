In detail:

- **Spartan-6 bitgen with two or more block RAMs (#2679):** `bramRewrites` named every design with more than one
  RAMB8BWER / RAMB16BWER as not measured, so the open flow wrote no bitstream (micro80's two RAMB16BWERs). Measured
  with ISE (`research/s6/gen-brams6.mjs`: two and three block RAMs of each type and mixed, in one tile, one column and
  row, two columns, two rows, on both parts; and the designs with every site of a type, up to 232 RAMB8BWERs): bitgen
  writes one frame again per column and row with a RAMB8BWER, in the frames' order, every RAMB8BWER tile's two bits
  cleared in it and the RAMB16BWERs' of that column and row too; none for RAMB16BWERs. `writeBit6` writes WCFG before
  the first frame written again only, as bitgen does. Byte-identical with ISE's bitgen: the XC6SLX16's designs, micro80
  on the Nexys3 and the Atlys. Tests: test/s6-bitgen.test.js, test/s6-bitstream.test.js.
