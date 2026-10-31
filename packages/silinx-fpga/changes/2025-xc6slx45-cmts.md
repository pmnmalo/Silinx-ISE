In detail:

- **Spartan-6: the XC6SLX45's DCMs and PLLs (#2025):** the CMT paths' PIPs are now a database per device
  (`bitdb/s6/<device>-pips-cmt.json`; the XC6SLX16's renamed from `s6-pips-cmt.json`), since their bits far from
  their tile depend on the device's layout; the XC6SLX45's measured one at a time against ISE's bitgen (1147 drops),
  with its CMTs' settings and input table, and **src/fpga/s6/bitgen-cmt.js**'s REGC bits for it. On the XC6SLX45's 184
  CMT designs the rules predict every bit; the XC6SLX16's results are unchanged.
  - **Tests:** test/s6-cmtpaths.test.js and test/s6-cmtsites.test.js.
