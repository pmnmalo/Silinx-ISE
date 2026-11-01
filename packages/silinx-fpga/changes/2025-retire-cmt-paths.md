In detail:

- **Spartan-6: #727's whole CMT paths retired (#2025):** a DCM at DCM_X0Y1 or a PLL at PLL_ADV_X0Y0 with #727's base
  settings was predicted from its base design's bits whole (`bitdb/s6/xc6slx16-cmt-paths.json`), which set its base's
  other BUFGMUX's REGC bit and outputs' bits in a design to other BUFGMUXes (44 bits ISE does not set). It is now
  predicted by the rules every other site has: its settings, its BUFGMUXes' REGC bits, the input table and its paths'
  PIPs. The database, `research/s6/ana-cmt6.mjs`, `cmtPath` and `predictCmt` (`src/fpga/s6/bitgen-cmt.js`) and
  `loadBitDbS6`'s `cmt` are gone. On the XC6SLX16's 203 CMT and example designs, all are bit for bit (199 before).
  - **Tests:** test/s6-cmtpaths.test.js, test/s6-clock.test.js, packages/silinx-fpga/test/s6-bitgen.test.js.
