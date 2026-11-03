In short:

- Silinx HLS: a pragma's number may be a constant's name, as in Vitis HLS (`const int N = 4;` … `#pragma HLS UNROLL
  factor=N`).

In detail:

- **Silinx HLS: a pragma's numeric argument given by a constant (#2750):** UNROLL `factor=`, PIPELINE `II=`,
  ARRAY_PARTITION and ARRAY_RESHAPE `factor=` and `dim=`, STREAM `depth=`, INTERFACE `depth=`, and the other pragmas'
  numbers take a global or local `const`, a `static const`, C++'s `constexpr`, an enum's constant, a constant of another
  or of `sizeof`, as Vitis HLS does (UG1399): the same module as with the number. A name that is not a constant keeps
  its error or warning, which now says "'N' is not a constant".
