In detail:

- **Spartan-6: the wire delays fitted to ISE's trce (#731, first part):** trce's reports read (research/s6/twr6.mjs)
  and the delay of each net of their paths fitted on the routing ISE wrote, by the classes of the wires it takes
  (research/s6/timing-fit6.mjs): rms 0.110 ns on night 1's examples, both boards. Tests: test/s6-timing.test.js.
