In detail:

- **Silinx HLS, a wide multiplication over cycles (#2080):** in a state the clock splits, a multiplication wider than one
  multiplier block becomes 18 x 18 ones and their sum (`core/c-mul-split.js`), which the scheduling chains as any other
  operation, so each state fits the period.
