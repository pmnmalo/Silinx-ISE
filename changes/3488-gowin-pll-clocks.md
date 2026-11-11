In short:

- **Gowin: a PLL's clocks checked at their own frequency.** On the Tang Nano 9K, an rPLL's outputs and the oscillator's
  clock are now timed against the frequency they run at (a 54 MHz CLKOUT at 54 MHz, not at the board clock's 27 MHz), so
  a PLL clock faster than the design can run fails Place & Route; a clock with no constraint is reported as such, not at
  nextpnr's 12 MHz.

In detail:

- **Gowin: each clock at its own frequency (#3488).** nextpnr-himbaechel-gowin derives no clock through an rPLL and its
  `--freq` applied the CST's clock to every clock, so a PLL's outputs were checked against its input's frequency and the
  oscillator's at 12 MHz. The flow now computes each rPLL output's frequency (CLKOUT, CLKOUTP, CLKOUTD, CLKOUTD3, with
  their sources and bypasses; none when the dividers are dynamic) and the oscillator's (250 MHz / FREQ_DIV) and gives them
  to nextpnr as an SDC beside the CST's clocks. The report's clock with no constraint of its own shows "no constraint"
  (and `constraint: null` in get_report's summary). The details are in the toolchain's changelog.
