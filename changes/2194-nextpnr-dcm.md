In short:

- **The nextpnr engine takes DCMs:** `--engine nextpnr` now places and routes a DCM_SP or DCM, its clocks on global
  buffers by their dedicated paths, each with its own derived period as a target.

In detail:

- **The nextpnr engine: the DCM (#2194):** the dependency `@silinx/nextpnr-himbaechel-spartan3e` has this since nextpnr-spartan
  v0.9.0 (on main through v0.9.1). Its packer puts a DCM where the most of its clock outputs reach global buffers of their own by dedicated
  paths, then where a pad's dedicated path reaches its CLKIN, and keeps the UCF's `INST LOC`.
  - **src/fpga/nextpnr-dcm.js** (new) writes its settings as Silinx's packer does; **src/open-flow-nextpnr.js** (Map)
    accepts DCM and DCM_SP, gives `INST LOC` to the micro-architecture and each DCM clock its period in the SDC
    (CLK2X half, CLKDV and CLKFX by their factors); **research/nextpnr-s3e/lib.mjs**'s simCheck takes LOCKED, PSDONE and
    STATUS as inputs of both simulations.
  - **A global buffer's select:** the buffers of one tile now share one VCC net, from the tile's VCC site. Two nets on
    one wire failed the routing check.
  - **Proof:** feat_dcm, feat_dcm_bufgin, feat_dcm2, feat_dcm_div2, feat_dcm_phase and feat_dcm_wait (Basys2-250): ISE's DRC
    with no errors or warnings, the .bit byte-identical to ISE's bitgen, the flip-flops simulate equal to the netlist.
  - **Tests:** test/nextpnr-s3e.test.js and test/nextpnr-engine.test.js.
