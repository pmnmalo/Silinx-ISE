In detail:

- **nextpnr-spartan v0.16.0 (#2627, #2629): the global lines' reach.** A side buffer drives its line in its half of the
  chip only, and in each half a line comes from the top / bottom buffer or from the side buffer, never both (#95);
  nextpnr's placer now keeps every clock pin in reach of its buffer, and the buffers are placed at pack (the free top /
  bottom buffers in Silinx's order first). It had put a side buffer's flip-flops in the other half: router 1 stopped on
  its assert `valid_wires_for_net` (feat_clocks12, feat_side_clock) or did not route (feat_iob_lines). On 41 of the open
  flow's designs: ISE's DRC clean and Silinx's `.bit` byte-identical to ISE's (CRC on and off); the 42nd,
  feat_bramwiz_inf, has a DRC warning of its own (#2642).
  - **Tests:** packages/silinx-fpga/test/nextpnr-engine.test.js (feat_side_clock built through nextpnr, its new
    fixture `side_clock`), test/silinx-fpga-package.test.js, test/toolchain-boundary.test.js and the third-party
    notices' check.
