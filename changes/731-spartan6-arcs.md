In detail:

- **Spartan-6: the logic arcs and trce's paths re-evaluated (#731, second part):** a table of the logic arcs' delays
  read from trce's reports, and each path of them re-evaluated with the arcs and the fitted wire model on ISE's
  routing (research/s6/timing6.mjs): the data path's rms error 0.219 ns on night 1's examples, every constraint's
  slack within 6% of the period. Tests: test/s6-timing.test.js.
