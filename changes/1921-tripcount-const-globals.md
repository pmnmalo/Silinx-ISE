In short:
- Silinx HLS: `#pragma HLS LOOP_TRIPCOUNT max=c_dim*c_dim`, with `c_dim` a `const` integer, gives the loop its bound in the report, as `max=16` does (Vitis HLS's array-partition examples write it so).

In detail:
- **Silinx HLS: LOOP_TRIPCOUNT of constant expressions (#1921):** a LOOP_TRIPCOUNT's `min=`, `max=` and `avg=` are constant expressions of the integer constants known (the global `const` integers, the function's, macros), evaluated as a stream's depth is (`constValue`), and read up to the next key, spaces included (`min = c_dim* c_dim max = c_dim * c_dim`), where only a number with no spaces was read: the loop's max was null and "the number of iterations of this loop is not known" was said. A value that is not a constant is said, naming what is not (`#pragma HLS LOOP_TRIPCOUNT max=n*c_dim: 'n' is not a constant: ignored …`), the bound unknown as before.
