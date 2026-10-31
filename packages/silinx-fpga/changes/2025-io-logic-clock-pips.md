In detail:

- **Spartan-6: the I/O logic's clock and the CMTs' HCLK outputs (#2025):** 63 PIPs of the XC6SLX16's CMT designs that
  no database had (a global clock to an OLOGIC2's or ILOGIC2's CLK0, a DCM's or PLL's outputs onto the HCLK lines,
  some BUFIO2 inputs) measured one at a time against ISE's bitgen: those with bits near their tile in
  `bitdb/s6/s6-pips-flow.json`, the others in `bitdb/s6/xc6slx16-pips-cmt.json`. On the XC6SLX16's 203 CMT and example
  designs the rules predict 122 bit for bit (103 before), with no bit ISE does not set.
  - **Tests:** test/s6-cmtpaths.test.js.
