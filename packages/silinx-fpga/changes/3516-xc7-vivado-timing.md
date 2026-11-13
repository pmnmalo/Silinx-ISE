In detail:

- **The 7-series timing against Vivado's, measured (#3516):** `research/xc7/vivado-timing.json` and `timing-fit.json`
  from Vivado 2025.2 placing and routing Silinx's netlists of the ten examples on the Basys 3 (xc7a35t): each cell's
  and wire's delays, and the Fmax of both. nextpnr's estimate is 1.13× (micro80) to 1.96× (stopwatch) Vivado's,
  1.2–1.4× for most; the fit's scales are 1.237 (logic) and 1.26 (routing).
