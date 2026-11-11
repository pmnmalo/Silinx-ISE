In detail:

- **The 7-series' back end, the Silinx toolchain's (#3146):** `open-flow-xc7.js` registers the Artix-7's back end of
  `runFlow` (open-flow-backends.js, #2360): Yosys's `synth_xilinx`, then nextpnr-himbaechel's xilinx micro-architecture
  (`@silinx/nextpnr-himbaechel-xc7` 0.1.1, #3143, a new dependency: `io.nextpnr.xc7`, in Node `nextpnrXc7Node()` with
  router2, else router1) placing and routing into FASM (`open/routed.fasm`), and the `.bit` written from the FASM by the
  JavaScript writer on Project X-Ray's database (`fpga/xc7/`, #3144; `io.bitDb()`, in Node `loadBitDbXc7`). Its steps
  `synth`, `translate`, `par` (nextpnr packs), `trce` and `bitgen` (`XC7_STEPS`); its constraints XDC, written for nextpnr
  as the ports' `PACKAGE_PIN` and `IOSTANDARD` and the clocks' `create_clock` (a one-bit vector named as nextpnr names it,
  the ports with no pin warned). The resources nextpnr used are held to the part's own (the xc7a35t's chip database is
  the xc7a50t's: a design over the part's slices, registers or pins is an error); the timing is nextpnr's estimate,
  `XC7_TIMING_MODEL`, said so in the report and its text (`open/timing.txt`), optimistic against Vivado. The `.bit`'s
  header names the part as Vivado does (`7a35tcpg236`). The xc7a35t (Basys 3) only so far: its bit database.
- **nextpnr's chip databases downloaded on first use (#2329) for the 7-series too:** `chipdbReleaseUrl` knows the
  fork's `xc7-v<version>` releases. `nextpnr-ports.js`: the ports as nextpnr names them, the iCE40's and the 7-series'.
- **The API (#3146):** `XC7_STEPS`, `XC7_TIMING_MODEL` and `XILINX_STEPS` (`./parts` too); `./node` adds `nextpnrXc7Node`,
  `loadBitDbXc7`, `xc7Parts` and `XC7_DB_DIR`.
