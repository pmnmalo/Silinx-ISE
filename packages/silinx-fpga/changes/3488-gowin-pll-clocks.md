In detail:

- **The Gowin's clocks at their own frequencies (#3488).** gowin-clocks.js computes each rPLL output's frequency from its
  parameters (UG286: CLKOUT = CLKOUTP = FCLKIN·(FBDIV_SEL+1)/(IDIV_SEL+1), CLKOUTD by DYN_SDIV_SEL and CLKOUTD3 by 3 from
  their CLKOUTD_SRC / CLKOUTD3_SRC, a bypassed output FCLKIN, FCLKIN out of range 100 MHz as gowin_pack takes it, none with
  dynamic dividers) and the OSC's (250 MHz / FREQ_DIV, 210 MHz on the GW1N-4s), and writes them with the CST's clocks as
  the SDC nextpnr-himbaechel-gowin reads (`--sdc`: `get_ports` for the CST's, `get_pins {cell/pin}` for the others).
  `--freq` stays the fastest CST clock, so the routed designs (and their .fs, Apicula's) are unchanged. open-flow-gowin.js's
  `gowinFmax` reads the clocks back with the constraint nextpnr logged for their net, or `null`: `Clock o: 216.97 MHz
  (no constraint)`. A PLL clock faster than the design fails Place & Route with nextpnr's error, as on the ECP5 and the
  iCE40. Tests: gowin-clocks (the formulas, the SDC, the report read back; a 378 MHz CLKOUT failing; a CST with no clock),
  gowin-pll-osc (each design's clocks at their own frequencies: 54, 90, 15, 108, 6.75, 9, 100, 25, 1.95 MHz, the dynamic
  one with none), mcp-gowin (get_report with no clock in the CST).
