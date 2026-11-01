In short:

- **Silinx HLS makes `#pragma HLS BIND_OP`, `ALLOCATION` and `LATENCY`:** a multiplication in LUTs, a limit on the
  multiplier blocks and a minimum number of cycles for the top function.

In detail:

- **`BIND_OP`, `ALLOCATION`, `LATENCY` (#1961):** `BIND_OP op=mul impl=fabric` makes the variable's multiplications from
  shifts and additions. `ALLOCATION instances=mul limit=N` keeps a cycle to N multiplier blocks, and a value carried to a
  later cycle is now as narrow as the value, so those multiplications share one. `LATENCY min=` adds wait states at the
  top function's start and `max=` warns when a path takes more. What Silinx cannot make keeps a warning saying why.
