In detail:

- **A combinational top's reset (#1924, first part):** a C function made combinational with the `ap_ctrl_hs` protocol
  has an `ap_rst` input (it does not use it) and no `ap_clk`, as Vitis HLS 2025.2 makes a top of latency 0 (checked on
  four designs: a plain function, a sub-function inlined or not, two instances); before, it had neither. The
  co-simulation's test bench holds it low. A function too slow for the clock scheduled over cycles, as Vitis HLS does,
  is the second part.
