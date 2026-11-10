In detail:

- **The JTAG user access primitives in the bit databases (#3176, for the logic analyzer).** These are the switches that
  connect BSCAN_SPARTAN3 and BSCAN_SPARTAN6 to the fabric, measured with ISE by PIP drop on designs implemented from
  HDL. Silinx's writer is byte-identical with ISE's bitgen on them (but for one output path held back, below). The open flow does not place a BSCAN
  yet: that needs nextpnr's chip database.
  - **Spartan-3E:** the top-right corner tile's (UR) switches for every output (CAPTURE, DRCK1, DRCK2, RESET, SEL1, SEL2,
    SHIFT, TDI, UPDATE) onto the fabric and for TDO1 / TDO2 from it, the site's own `BSCAN:USED` (two bits), and the
    other switches the designs' routes took: 580 features in `bitdb/s3e-tiles.json`, none of the database's changed.
    The designs: five with every BSCAN pin used, their logic in five regions of the XC3S250E, and the logic analyzer's
    capture core on the XC3S100E, XC3S250E and XC3S500E (`research/s3e-bitstream/gen-bscan.mjs`, `measure-3176.sh`,
    `measured/learn-20bscan-pips.json`; 168 xdl + bitgen runs). All eight are byte-identical, with and without the CRC.
    The four dies' measured descriptions (`research/s3e-device/data/<die>/measured.json.gz`) rebuilt with them: each
    gains the corner tile's 50 switches (and one or two CLKT ones), each accepted by ISE's arc probe (`bscanprobe`).
  - **Spartan-6:** the corner tiles' (UR_UPPER, UR_LOWER) PIPs of the four BSCAN sites, 85 not known before, in
    `bitdb/s6/s6-pips-bscan.json` (the slave OLOGIC2's `D1 -> OQ` the designs' outputs took also measured, but left out
    until nextpnr's Spartan-6 chip database has it: #3152's pads). Also the instance's JTAG_CHAIN, one bit per chain whichever site holds it
    (`bitdb/s6/s6-bscan.json`), which `fpga/s6/bitgen.js` now writes. The designs: one per chain and one with its logic
    far from the corner, on the XC6SLX16, and two on the XC6SLX45 (`research/s6/gen-bscan6.mjs`, `measure-3176-s6.sh`;
    50 xdl + bitgen runs; byte-identical but for that output path on two of them). `ana-pipdrop6.mjs --out` writes its result to another file than `s6-pips-other.json`.
