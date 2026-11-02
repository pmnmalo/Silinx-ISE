In detail:

- **The nextpnr engine keeps every pad a bus port reads (#2567):** an input read only by a bus port's later bits (a
  multiplier's A1, a block RAM's ADDR3, not their bit 0) lost its pad, and the block's pin was left unconnected (ISE's DRC:
  PhysDesignRules:1078 and 1133). A multiplier's `B_INPUT` in the XDL is now the one nextpnr sets (`CASCADE` for a cascaded
  multiplier, #2566), `DIRECT` otherwise. When nextpnr stops on an error, the step now shows nextpnr's own ERROR lines,
  not "nextpnr failed: undefined".
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js, packages/silinx-fpga/test/nextpnr-hard.test.js.
