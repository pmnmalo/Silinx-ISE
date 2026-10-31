In detail:

- **Spartan-6: the clock pads' BUFIO2s (#2025):** the routes from the clock pads U10, T9 and R8 into their BUFIO2s
  and on to a DCM or PLL, measured one PIP at a time with their far bits (30 PIPs, 6 with bits: the I/O words and
  the CMT column; `bitdb/s6/xc6slx16-pips-cmt.json`, `s6-pips-flow.json`). Each BUFIO2 also sets one I/O word bit of
  its own, whatever the CMT it drives. The CMTs' input table had it only in its (CMT site, BUFIO2) entries;
  `research/s6/ana-cmtinput6.mjs` now takes it apart (`bufio2` of `bitdb/s6/<device>-cmt-input.json`), and
  `cmtInputBits` (`src/fpga/s6/bitgen-cmt.js`) adds it. On the XC6SLX16's 203 CMT and example designs, all are bit for
  bit (196 before); the XC6SLX45's 184 stay exact.
  - **Tests:** test/s6-cmtpaths.test.js.
