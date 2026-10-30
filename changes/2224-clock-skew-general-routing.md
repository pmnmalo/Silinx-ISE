In detail:

- **The Silinx toolchain's timing analysis: a clock on general routing (#2224):** a global clock that reaches some
  flip-flops through general routing instead of the global lines (as nextpnr's router did before nextpnr-spartan
  v0.7.1) has their clock skew counted in the minimum period, the pads' paths and the hold check, as ISE's trce counts
  it; the timing report says how many clock pins are reached that way and the skew. A clock wholly on the global lines,
  as both engines route it today, is timed exactly as before.
