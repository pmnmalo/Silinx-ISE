In detail:

- **Spartan-6: the CMT sites' settings (#1951):** a DCM's or PLL's settings bits at every CMT site of the XC6SLX16,
  measured with ISE: in its tile's row of the CMT column, the same at every site of a kind, the two DCMs of a CMT tile
  apart (research/s6/gen-cmtsites6.mjs, ana-cmtsites6.mjs: research/s6/db/xc6slx16-cmt-settings.json; the even DCM's
  settings, gen-dcm6.mjs --dcm; research/s6/residual6.mjs predicts them with cmt6.mjs); the designs' PIP drop adds 420
  PIPs to research/s6/db/s6-pips-other.json. Tests: test/s6-cmtsites.test.js.
