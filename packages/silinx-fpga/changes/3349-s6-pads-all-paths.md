In detail:

- **`@silinx/nextpnr-himbaechel-spartan6` 0.4.1 from npm (#3357):** the dependency is an exact npm version (with the
  registry's integrity and provenance), no longer a GitHub release asset's URL, which `npm i silinx-fpga` /
  `npx silinx-fpga` installed unpinned.
- **The Spartan-6 pads' PIPs in the bit database (#3349, #3269, #3350, #3169):** the six PIPs held out until nextpnr's
  chip database had them are in the files the flow reads: TIOI_INNER's slave OLOGIC2 `D1_OLOGIC_SITE_S ->
  OQ_OLOGIC_SITE_S` (`26,35 27,48 28,14`, #3269) in `bitdb/s6/s6-pips-bscan.json`; TIOI_OUTER's (the same bits, #3350)
  and the TIOB_SINGLE / BIOB_SINGLE pad wire -> IBUF PIPs (no bits, #3169) in `s6-pips-io.json`. `s6-pips-held.json`
  and the `held` option of `bitDbS6` / `loadBitDbS6` are removed; `research/nextpnr-s6/export-unknown-pips.mjs` gives
  the same list from the flow's databases. `fpga/s6/pad-paths.js` now gives every pad of the XC6SLX16 and the XC6SLX45
  an input and an output path. `research/s6/check-held6.mjs` checks the measurements' designs with the flow's
  databases.
