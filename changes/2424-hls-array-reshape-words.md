In short:

- **Silinx HLS, ARRAY_RESHAPE:** `#pragma HLS ARRAY_RESHAPE` of type block or cyclic makes one memory of wide words, as
  Vitis HLS does: an array argument's port carries N elements a word, and the elements of one word are read in one
  access.

In detail:

- **ARRAY_RESHAPE packed into wide words (#2424):** type=cyclic factor=N puts element k in word k / N at slice k % N,
  type=block factor=N in word k % S at slice k / S (S = ceil(L / N) words), as UG1399 says (core/c-reshape.js). An
  array argument's `ap_memory` port is of those words (`a_address0` of the words, `a_q0` / `a_d0` N elements wide),
  the co-simulation packing the C's elements into them; a local memory (more than 64 elements, or with a
  BIND_STORAGE) is one memory of those words inside the module, its initial values packed. The accesses are a memory
  of structs' (#1668): an element's word read once and held while its index does not change, its other elements taken
  from it (`a[2 * i]` and `a[2 * i + 1]` one read); an element written into the held word, the word written whole.
  The report lists the memory of the words. Its warnings: none when it is made; type=complete, dim=2, factor=1, an
  array of more than one dimension, said as before; a small local stays registers, as a partition's.
