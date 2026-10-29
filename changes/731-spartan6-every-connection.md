In detail:

- **Spartan-6: the wire delays fitted on every connection (#731):** reportgen -delay's report of each of night 1's
  28 routed designs read beside trce's (research/s6/timing-fit6.mjs's dlySamples, 5581 connections, not only trce's
  10 worst paths a constraint), and the load pin's kind in the model (pinKind: a LUT's A1 to A6, the bypass, the
  carry, an I/O): rms 0.089 ns per connection, 0.146 ns without it. timing6.mjs fits on them when the .dly is there.
  Tests: test/s6-timing.test.js.
