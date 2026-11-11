In detail:

- **The 7-series' bitstream in JavaScript (#3144):** `src/fpga/xc7/` writes the configuration frames and the `.bit` of
  nextpnr's FASM for the xc7a35t, as Project X-Ray's `fasm2frames` and `xc7frames2bit` make them: `parseFasm` (the fasm
  library's grammar), `fasmToFrames` (a feature's bits from the database, a feature it does not have and a bit set and
  cleared named as errors, the part's required features, a bank's `STEPDOWN` on its unused IOB33s, PUDC_B's pull-up when
  asked), `framesText` (the `.frm`), `bitstreamXc7` (the frames' ECC, the part's frames in order, xc7frames2bit's
  packets) and `readBitXc7`. The bit database `bitdb/xc7/xc7a35tcpg236-1.json.gz` (339 KB; 2.5 MB unpacked) is the
  subset of Project X-Ray's database (prjxray-db, CC0 1.0) the part needs, made by `research/xc7/build-db.mjs`. The
  `.bit` of blinky, vga and micro80 is byte-identical to Project X-Ray's. Not in the flow yet (#3146).
