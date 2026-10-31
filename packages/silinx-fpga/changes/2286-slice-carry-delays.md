In short:

- **The minimum period of a design with counters or adders as trce's:** the delays of a slice's carry chain (its XORs,
  its carry out on XB) are trce's; such designs' periods rise to within about 1 % of trce's (blinky 6.607 -> 7.037 ns,
  trce 7.075).

In detail:

- **Static timing: a slice's ways through the carry's XORs and onto XB as trce's (#2286):** `SPEED_4.slice`
  (src/fpga/timing.js) had estimates under trce's for Topx (0.85 / 0.9 -> 1.060 / 1.118), Togy (0.9 / 0.95 -> 1.231 /
  1.288), Topy, Topcyf, Topcyg, Tdick and Tbxy, and XB (#591) was half of CIN -> COUT short of COUT (CIN -> XB 0.065 ns
  against trce's 0.495). They are now trce's, read from its setup paths of nine routings of blinky and stopwatch, and XB
  has its own arcs (`Tcinxb`, `Topxb`, `TopxbDI`, `Tbxxb`, src/fpga/timing-arcs.js). The placer and the router see the
  same delays, so placements of designs with carry chains change; the post-place & route model (core/sim-model.js)
  gives XB its own element with these delays. Tests: test/fpga-slice-delays.test.js (fixture: blinky routed by Silinx,
  trce's period).
