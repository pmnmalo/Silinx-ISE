In detail:

- **Spartan-6: the static timing of a routed design (#731):** research/s6/sta6.mjs is trce's PERIOD analysis on a
  routed XDL. It reads the slices' arcs from their settings (the LUTs' equations, the carry chain stage by stage, the
  flip-flops and the second ones, a flip-flop set as a gate) and the block RAMs' and DSP48A1s' arcs, with delays by
  site class, and takes the clock's arrival at each flip-flop from its routed tree. The wire model counts each wire
  type (timing-fit6.mjs's fitWires) and matches reportgen's loads by their logical pin (loadDelay): 19008 connections,
  rms 0.045 ns. On night 1's 24 PERIOD constraints the worst slack is within 5% of trce's in 20, and every error is
  under 2.5% of the period. Tests: test/s6-sta.test.js, test/s6-timing.test.js.
