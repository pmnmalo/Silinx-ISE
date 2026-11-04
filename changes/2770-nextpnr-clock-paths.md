In short:

- The nextpnr engine keeps the clocks on their dedicated paths into the DCMs and the global buffers, as Silinx's own
  placer did, and says when a DCM's clock comes from a pin that has none.

In detail:

- **The nextpnr engine's clocks on their dedicated paths (#2770, #2768, #2766), nextpnr-spartan v0.19.0.** A DCM's
  CLKIN from its clock pad or from another DCM's buffer, a clock switch's input from its pad and a DCM's outputs into
  their buffers take their dedicated paths (they took general routing, which ISE's DRC passes, with more delay and
  skew); a DCM with five outputs on buffers takes one CLKDUB, not two. A DCM's CLKIN from a pad that does not reach it
  on a dedicated path is said, with the pads that do: `DCM u_dcm: its CLKIN comes from the pad B8 through general
  routing: only B9, A9, A10, C9 reach its CLKIN on a dedicated path.` Two IOB registers of one kind on different clocks
  in a LOC'd differential pair are routed: the DIFFM's on its second flip-flop (IFF2, OFF2), as ISE's map puts it.
  - **Tests:** test/open-flow.test.js (the todos of #2770 and #2766 removed; the clock switch's pad, the five-output
    DCM's one CLKDUB and its warning), test/clocking-flow.test.js (the warning on the XC3S100E again),
    test/ise/open-flow.test.js (the LOC'd pairs, their todo removed), packages/silinx-fpga/test/nextpnr-iob.test.js.
