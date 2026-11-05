In detail:

- **The power estimate's test on the examples within its time on CI (#2828):** since nextpnr is the one engine, the
  test of the estimate on four examples took about 330 s on GitHub's runners against its 300 s. It now places each
  example once (`placements`, a test's field of the flow's spec, in place of Normal's four), and
  `scripts/measure-power.mjs`'s flow synthesises at Normal, the IDE's default, rather than High: about 70 s
  locally, against 300 s, with the same expected values and no warnings.
  - **Tests:** test/power.test.js (one placement logged, the estimates within their bounds, no warnings).
