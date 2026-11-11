In detail:

- **The Spartan-6's PIPs held out until nextpnr's chip database has them (#3349):** `bitdb/s6/s6-pips-held.json` keeps
  the PIPs that ISE has measured but that the open flow must not use yet. If Silinx knew such a PIP, its placer could give
  a pad a path that nextpnr cannot route (#3152). Silinx's flow does not read the file: `bitDbS6` and `loadBitDbS6` read
  it only with `held: true`, and the browser never fetches it. The chip database's export
  (`research/nextpnr-s6/export-unknown-pips.mjs`) does read it, so the fork's generator puts those PIPs in its next
  Spartan-6 chip database. Once that release is pinned, the PIPs move to the files the flow reads. The file has:
  - the slave OLOGIC2's `D1_OLOGIC_SITE_S -> OQ_OLOGIC_SITE_S` of the TIOI_INNER tiles (#3269, which `s6-pips-bscan.json`'s
    note had kept aside) and of the TIOI_OUTER tiles (#3350, measured with ISE: `26,35 27,48 28,14`, the same bits). These
    are the outputs of the 30 top-bank pads of the XC6SLX16 and the 23 of the XC6SLX45;
  - #3169's four pad wire -> IBUF PIPs of the TIOB_SINGLE and BIOB_SINGLE tiles, with no bits: the inputs of G9, F9,
    U11, V11 (XC6SLX16) and G9, F9, R7, T7 (XC6SLX45).
  - With them, every pad of both parts takes an input and an output.
