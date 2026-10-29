In detail:

- **Spartan-6: the bottom CMTs' clock paths by rules (#1951):** on the XC6SLX16, a DCM's or PLL's path from the clock
  pad to the BUFGMUXes predicted from its parts. Each BUFGMUX design (research/s6/gen-cmtsites6.mjs --muxes) has its
  paths' PIPs dropped one at a time in context (gen-cmtdrop6.mjs, ana-cmtdrop6.mjs: research/s6/db/s6-pips-cmt.json).
  A BUFGMUX a CMT drives sets its REGC bit (cmt6.mjs's CMT_REGC). A CMT's outputs used, its input BUFIO2 and the clock
  spine set their own bits (ana-cmtinput6.mjs: research/s6/db/xc6slx16-cmt-input.json). residual6.mjs reads them all,
  and `--no-cmt-paths` drops #727's whole paths. The bottom DCMs' BUFGMUX designs come out exact. Nothing is predicted
  that ISE does not set on #727's CMT designs, which the rules were not derived from, and the examples stay exact.
  The top half and the XC6SLX45 go on in #2025. Tests: test/s6-cmtpaths.test.js.
