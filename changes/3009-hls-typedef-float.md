In detail:

- **Silinx HLS: a typedef of float a float (#3009):** a `typedef float r32;` (or C++'s `using r32 = float;`) was made in
  hardware as a double, its ports 64 bits wide and the co-simulation failing; it is a float again, 32 bits, and
  `ALLOCATION` of `fmul` shares its multiplications.
