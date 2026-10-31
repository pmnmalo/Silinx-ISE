In short:

- **Silinx HLS makes `#pragma HLS DEPENDENCE`:** a pipelined loop's II is no longer bound by a memory's dependence the
  pragma says false.

In detail:

- **`DEPENDENCE` (#1961):** `inter … false` frees a memory's read from coming after another iteration's write, `intra …
  false` lets a read and a write of one iteration share a stage, in the loop the pragma is in and those inside it, and in
  a pipelined function. `true` has no effect, and a pragma on a variable or a name that is no memory keeps its dependence, with a
  warning.
