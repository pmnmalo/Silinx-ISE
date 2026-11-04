In detail:

- **nextpnr-spartan v0.19.0 (#2770, #2768, #2766): the clocks on their dedicated paths.** nextpnr chooses the DCMs'
  sites together (the most clock outputs on buffers of their own, then the most CLKIN / CLKFB on dedicated paths from
  a pad or a buffer's line), a pad's buffer whose line reaches the DCM inputs it drives, a clock switch's buffer before
  a plain BUFG's, and routes the DCMs' and buffers' clock inputs from a pad or a DCM on their dedicated paths first. A
  DCM's CLKIN from a pad off its dedicated path is a warning naming the pads that reach it (Silinx's placer gave it).
  A LOC'd differential pair's two registers of one kind on different clocks: the DIFFM's on its second flip-flop;
  `fpga/nextpnr-iob.js` writes a register alone on IFF2 / OFF2 as ISE's map does (OMUX::OFF2, ICLK2, OTCLK2).
  HeAP's spreader sorts its cut stably, so the native and WebAssembly builds place alike; the README's blinky: seed 1,
  5.069 ns.
  - **Tests:** packages/silinx-fpga/test/nextpnr-iob.test.js (new), test/open-flow.test.js, test/clocking-flow.test.js,
    test/ise/open-flow.test.js, test/silinx-fpga-cli.test.js.
