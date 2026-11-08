In detail:

- **C to HDL: a top's sums balanced before it is made sequential or not (#3028):** whether a top fits the clock and stays
  combinational is decided on its balanced sums, as they are scheduled (EXPRESSION_BALANCE, #2613), and its combinational
  module adds them as that tree; under `#pragma HLS EXPRESSION_BALANCE off`, as the C writes them. `a + b + c + d + e`
  at 20 ns on the Spartan-3E is now combinational, as `a + b + c + d` is, not 3 states.
