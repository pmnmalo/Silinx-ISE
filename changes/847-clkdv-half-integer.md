In detail:

- **Timing: a DCM's CLKDV with a half-integer divider (#847):** CLKDV_DIVIDE 1.5, 2.5 … 7.5, written `2_5` in the
  XDL, was read as the integer below (2.5 as 2): the PERIOD derived for CLKDV, its switching limit and the paths
  between it and the other clocks used a period too short (40 ns instead of 50 ns from a 20 ns input).
