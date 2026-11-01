In short:

- **Silinx HLS makes `#pragma HLS LOOP_FLATTEN` and `LOOP_MERGE`:** nested and consecutive loops become one loop, with
  fewer cycles.

In detail:

- **`LOOP_FLATTEN`, `LOOP_MERGE` (#1961):** `LOOP_FLATTEN` makes a perfect nest of constant counts one loop, and `off`
  leaves it alone. `LOOP_MERGE` makes a body's consecutive `for` loops one, of the largest count or their common bound,
  and `force` merges them even when a value crosses them. What cannot be made keeps its loops, with a warning saying why.
