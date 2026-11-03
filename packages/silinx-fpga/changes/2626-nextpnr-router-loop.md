In detail:

- **nextpnr-spartan v0.17.0 (#2626, #2628, #2656): the router's loop and two nets on a slice's SR.** A carry
  multiplexer's DI read from its own select's net, which the slice cannot route from its own LUT, is now a 0 (the same
  function: DI is read only while the select is 0; feat_bram); a block RAM with a 36-bit port no longer shares its tile
  with a multiplier, whose inputs take the RAM's upper data bits, as Silinx's placer keeps them apart (hard_prim): on
  both router 1 had looped. A slice's two memories with no write or shift enable share one constant on the SR they
  share, where each had had its own VCC net and routing stopped (feat_constmult). A DCM's clock input from a global
  buffer of the other edge, which no dedicated path joins and which ISE's DRC passes, is routed with no warning, as
  with Silinx's engine (feat_dcm2); the warning that stays names the pins out of reach. On 44 of the open flow's 45
  designs: ISE's DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on and off); the 45th, feat_bramwiz_inf,
  has a DRC warning of its own (#2642).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (feat_bram, hard_prim, feat_constmult and feat_dcm2
    built through nextpnr with no warnings, their new fixtures), test/silinx-fpga-package.test.js,
    test/toolchain-boundary.test.js and the third-party notices' check.
