In short:

- On the Spartan-3E, Place & Route no longer warns of nextpnr's own clock estimate ("Max frequency … FAIL"): the
  timing step alone says whether a PERIOD is met, on the clock's port.

In detail:

- **nextpnr's "Max frequency" is no warning on the Spartan-3E (#2820).** The nextpnr step logged every `Warning:` line
  of the kept placement, nextpnr's estimate of each clock among them (`WARNING:nextpnr - Max frequency for clock
  '$iopadmap$clk': … (FAIL at 50.00 MHz)`), which can disagree with the timing step (fitted to ISE's trce). It leaves
  it out now, as the Spartan-6's step does; the estimate stays in the step's summary line ("its estimate: … MHz").
  The design corpus's expectations lose the eight such warnings, each beside the timing step's own.
  - **Tests:** `test/nextpnr-fmax-warning.test.js`: blinky on the Basys2-250 with a PERIOD of 4 ns, one warning (the
    timing step's, on `clk`); with no PERIOD, no warning.
