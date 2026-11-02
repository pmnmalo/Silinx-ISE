In short:

- The Spartan-6 bitstream writer writes a SLICEM's distributed RAM and shift register contents, byte-identical with
  ISE's bitgen.

In detail:

- **A LUT RAM's and shift register's contents in the Spartan-6 bitstream (#2556):** `s6/bitgen-slice.js` `memEntries`
  turns a SLICEM LUT's `#RAM:O6=0x…` / `#RAM:O5=0x…` into its 64 entries by its RAMMODE: a RAM's (SPRAM64, DPRAM64,
  DPRAM32) as a LUT's, by the LUT map, a shift register's bit i at entries 2i and 2i + 1, a 16-bit one's in the upper
  half. Measured on the 21 designs of `research/s6/gen-mem6.mjs` that ISE implemented (`ana-mem6.mjs` now keeps the
  LUT entries ISE's `.bit` sets, `measured/mem.json`): their `.bit`, CRC on and off, are byte-identical with ISE's
  (`check-bitgen6.mjs`). A ROM's contents other than zeros, SPRAM32 and a 16-bit shift register's INIT past bit 15
  stay reported as not measured. Test: test/s6-check-slice.test.js.
