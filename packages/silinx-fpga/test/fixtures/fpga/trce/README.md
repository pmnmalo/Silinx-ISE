# Routed designs timed by ISE's trce

Designs placed and routed by the Silinx toolchain (research/s3e-route/open-flow.mjs, XC3S250E-CP132,
seed 1), gzipped, and the minimum period ISE 14.7's `trce -a` gives for the same routed design. Silinx's
static timing analysis (packages/silinx-fpga/src/fpga/timing.js) is checked against those numbers in
test/fpga-timing.test.js (#457). They are Silinx's own XDL files, not ISE's outputs.

| File | Design | Block RAMs, multipliers | trce (ns) |
|---|---|---|---|
| `hard_prim.xdl.gz` | test/fixtures/open-flow/hard_prim | 3 RAMB16 (both ports, three widths), MULT18X18SIO (AREG, PREG), MULT18X18S | 7.147 |
| `mult_reg.xdl.gz` | `mult_reg/top.vhd`: MULT18X18SIOs with input registers and no product register | 2 MULT18X18SIO | 8.722 |
| `stopwatch.xdl.gz` | examples/stopwatch | 1 RAMB16, 3 multipliers | 12.719 |

`feat_dcm*.xdl.gz` (#601): Silinx's routing (seed 1) of the DCM designs of test/fixtures/open-flow with PERIOD 20 ns and
`OFFSET = IN 10 ns BEFORE` / `OUT 20 ns AFTER` on the pad's clock (feat_dcm_fx on the XC3S500E-FG320), and
`dcm-trce.json`: trce's numbers for each with the same constraints (research/s3e-route/dcm-timing.mjs): the worst setup
path of each pair of clocks (from, launch edge, to, capture edge, requirement, data path, slack), the data sheet's
setup / hold of each input and clock to pad of each output, by clock.

`vtr-ch-intrinsics.xdl.gz` (#1359): Silinx's routing of the design corpus's vtr-ch-intrinsics in its I/O wrapper
(XC3S1200E-FG320, seed 1), and `vtr-ch-intrinsics-delay.json`: ISE 14.7's delay of each of its 531 connections to a LUT
input, as `reportgen -delay` gives it for that routing ([net, load pin, ns]); the timing model's delay by LUT input is
checked against it.

`blinky-clock-detour.xdl.gz` (#2224): examples/blinky placed and routed by nextpnr-spartan v0.6.0 (the flow's nextpnr
engine, XC3S250E-CP132, seed 1), before its router kept a global buffer's loads on the global lines: 28 of its 77 clock
pins are reached through general routing. `blinky-clock-detour-trce.json`: trce's minimum period for it (8.015 ns) and
its critical path's clock skew (-1.774 ns), and ISE's delay of each connection of the clock net as `reportgen -delay`
gives it (the clock delay trce counts at each flip-flop); the analysis's clock skew is checked against them in
test/fpga-clock-skew.test.js.

`blinky-hold-violation.xdl.gz` (#2226): Silinx's routing of examples/blinky (seed 1) with 12 of its 82 clock pins moved
onto general routing (research/s3e-route/clock-detour.mjs --reroute, seed 1), and `blinky-hold-violation-trce.json`:
trce's minimum period for it and its worst hold path (the two flip-flops, slack -0.659 ns: a hold violation);
`blinky-clock-detour-trce.json` has its worst hold path too (0.032 ns). test/fpga-ff-hold.test.js checks the hold check
of two flip-flops against them.

`blinky-carry.xdl.gz` (#2286): Silinx's routing of examples/blinky (seed 1, before #2286's delays), and
`blinky-carry-trce.json`: trce's minimum period for it (7.075 ns), its critical path through a carry chain's CIN -> XB;
test/fpga-slice-delays.test.js checks the period and the slice's delays through the carry against trce's.
