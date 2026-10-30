In short:

- **The timing analysis sees a clock on general routing:** a global clock that reaches some flip-flops through general
  routing instead of the global lines now has its clock skew in the periods, the pads' paths and the hold check, as
  ISE's trce counts it; the timing report says how many clock pins are reached that way.

In detail:

- **Static timing: the clock skew of a global clock's loads off the global lines (#2224):** `clockArrivals`
  (src/fpga/timing.js) gave every load of a global buffer the same arrival, so a routing with clock pins on general
  routing was timed as if it had no skew (nextpnr-spartan v0.6.0's blinky: 28 of 77 clock pins, 7.647 ns against
  trce's 8.015). Such a load now arrives later by its detour (`clockDetour`, `model.clock.detour`: a + b x the model's
  delay of the general wires from where it leaves the global lines, fitted on ISE's delays of 129 such loads, rms
  error 0.100 ns, research/s3e-route/clock-detour.mjs), and `analyzeTiming` counts that skew in the periods and the
  hold check (`r.detours`, and a line in `timingReport`): the same blinky 7.918 ns, its critical path's skew -1.744 ns
  against trce's -1.774. A clock wholly on the global lines (Silinx's routings, nextpnr-spartan v0.9.1's) keeps its
  periods exactly. Tests: test/fpga-clock-skew.test.js (fixture: that routing, trce's and reportgen's numbers).
