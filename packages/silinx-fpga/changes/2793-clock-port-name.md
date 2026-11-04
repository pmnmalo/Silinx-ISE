In short:

- The Silinx toolchain's timing report names a clock from a pin as the design does (clock clk), no longer by Yosys's
  pad net ($iopadmap$clk).

In detail:

- **A pad's clock named by its port in the timing report (#2793):** the report (fpga/timing-checks.js `timingReport`)
  named a clock by its net, which Yosys's I/O pad mapping calls `$iopadmap$<port>`, where its constraint's line and
  ISE's trce name the port; every line that names a clock (its period, its detours, the paths between clocks, its
  hold check) now says the port's name (`shownClock`), a clock made by logic its net's. The report's data keep the
  nets' names. Tests: test/fpga-timing.test.js, test/open-flow-core.test.js, test/fpga-clock-skew.test.js,
  test/fpga-ff-hold.test.js.
