In detail:

- **BSCANE2 in the 7-series' open flow (#3767):** the netlist hands nextpnr each BSCANE2 as a BSCAN on its JTAG chain's
  site (open-flow-xc7.js xc7BscanCells: BEL X46Y124/BSCAN_X0Y<chain - 1>, as Vivado's DRC asks, PDRC-2; nextpnr-xc7 0.1.2 with
  pmnmalo/nextpnr-spartan#44), and the FASM gets the chain's CFG_CENTER_MID.BSCAN.JTAG_CHAIN_<n> (xc7BscanFeatures), which
  nextpnr does not write. The BSCAN sites' 44 PIPs to and from the fabric in the bit database as pseudo-PIPs
  (research/xc7/measured-ppips.mjs, merged by build-db.mjs; bitdb/xc7's two parts): measured with Vivado 2025.2
  (scripts/xc7-bscan-vivado.mjs, a BSCANE2 on each chain, the bitstreams read back), they set no bit. The utilization's
  BSCANE2 row.
- **The API: a 7-series .bit read back (#3767):** `bitIndexXc7`, `readBitFramesXc7` and `framesToFeatures`
  (fpga/xc7/readback.js) from src/index.js, for the BSCAN's measurement against Vivado's bitstreams
  (scripts/xc7-bscan-vivado.mjs).
