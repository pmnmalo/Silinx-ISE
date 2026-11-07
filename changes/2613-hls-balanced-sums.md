In short:

- **Silinx HLS, sums of many terms:** a sum such as `sum += a[k] * c[k]` unrolled is added as a tree, as Vitis HLS
  does by default: fewer cycles, a pipelined loop fewer stages and registers (the Vitis HLS examples' 2-D stencil: 109
  stages → 68, 362k register bits → 203k).

In detail:

- **A sum of many terms balanced into a tree (#2613):** a chain of four terms or more added one after the other, all
  of one width, is added two by two, the shallowest terms first (core/c-balance.js), before a function's states are
  scheduled against the clock and before a pipelined loop's stages: the same value, bit for bit (an addition of one
  width wraps the same in any order), in the logarithm of that many additions. An addition inside the chain that
  something else reads is a term of its own. Vitis HLS's EXPRESSION_BALANCE, on by default for integers. A function's
  sum of 32 products: 13 cycles → 4; a pipelined loop's sum of 48 terms: 18 stages → 4. `#pragma HLS
  EXPRESSION_BALANCE off` in the top function's body keeps its sums as the C writes them (in a loop or another
  function, or with another argument: a warning, ignored); it was accepted and ignored. The HLS corpus: the 2-D stencil
  385359-385383 → 385329-385351 cycles (its latency is still the m_axi accesses', #2276), cpp-templates-for-multiple-
  instances 23-28 → 22-25.
