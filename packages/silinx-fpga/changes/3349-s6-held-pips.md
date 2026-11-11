In detail:

- **The Spartan-6's PIPs held out until nextpnr's chip database has them (#3349):** `bitdb/s6/s6-pips-held.json` keeps
  the PIPs that ISE has measured but that the open flow must not use yet. If Silinx knew such a PIP, its placer could give
  a pad a path that nextpnr cannot route (#3152). Silinx's flow does not read the file: `bitDbS6` and `loadBitDbS6` read
  it only with `held: true`, and the browser never fetches it. The chip database's export
  (`research/nextpnr-s6/export-unknown-pips.mjs`) does read it, so the fork's generator puts those PIPs in its next
  Spartan-6 chip database. Once that release is pinned, the PIPs move to the files the flow reads. The file starts with
  #3269's `TIOI_INNER D1_OLOGIC_SITE_S -> OQ_OLOGIC_SITE_S`, which `s6-pips-bscan.json`'s note had kept aside. That PIP
  gives outputs to 14 of the 30 top-bank pads on the XC6SLX16 and 11 of 23 on the XC6SLX45. The other pads need the
  TIOI_OUTER slave's PIP, still unmeasured (#3350).
