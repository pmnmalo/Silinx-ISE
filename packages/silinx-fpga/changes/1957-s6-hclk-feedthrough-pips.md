In detail:

- **The HCLK feedthrough PIPs of the block RAM and DSP columns, both halves of a clock row (#1957):** 126 PIPs of
  BRAM_HCLK_FEEDTHRU, DSP_INT_HCLK_FEEDTHRU, their _FOLD types and the XC6SLX45's folded HCLK_CLB tiles, probed with
  ISE (`research/s6/gen-cmtprobe6.mjs --types`, `ana-cmtprobe6.mjs --add`) into `bitdb/s6/s6-pips-probe.json`: GCLK n
  sets minor n, bit 14 (lower half) or 15 (upper) of the tile's region. #728's block RAM and DSP designs leave no bit
  over (13 on the XC6SLX45 before), and 9 of 14 of their bitstreams are byte-identical with ISE's (5 before). Test:
  test/s6-cmtsites.test.js.
