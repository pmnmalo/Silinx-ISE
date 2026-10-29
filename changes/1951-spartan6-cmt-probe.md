In detail:

- **Spartan-6: the CMT paths' PIPs probed (#1951):** the PIPs the PIP drop could not take apart (the CMT tiles' input
  and output chains, the I/O tiles' clock paths) measured one by one with ISE, each on a TIEOFF net of its own
  (research/s6/gen-cmtprobe6.mjs, ana-cmtprobe6.mjs: research/s6/db/s6-pips-probe.json, read by residual6.mjs); each
  DCM and PLL output alone at every CMT site (gen-cmtsites6.mjs --outputs) for the settings. Tests:
  test/s6-cmtsites.test.js.
